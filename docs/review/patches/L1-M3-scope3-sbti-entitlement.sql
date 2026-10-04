-- docs/review/patches/L1-M3-scope3-sbti-entitlement.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L1, migration M3; design in docs/review/design-lead1.md sections 0 and 3).
-- To become supabase/migrations/2026MMDD_scope3_sbti_entitlement.sql.
--
-- RUN ORDER (L1): L1-M1-ghg-free-tier.sql (M1), then THIS FILE (M3), then L1-M2-ghg-entitlement-gate-free-tier.sql
-- (M2), then LEAD1-verify.sql.
--
-- WHY. Scope 3 (scope3_inventories) and SBTi (sbti_company_profile, sbti_targets, sbti_cycle, sbti_scope3_coverage)
-- have owner-only RLS and NO entitlement check in the database: the only gates are the pages' paywalls. That held
-- because a Scope 3 record binds to a saved GHG inventory, and saving one needed a plan. M2 lets an account without
-- a plan save one free calculation, so from M2 on these tables would be writable with no plan through the API. This
-- file closes that first, which is why it runs before M2.
--
-- WHAT IT DOES
--   1. Pre-flight: lists every row in the five tables whose owner has no ACTIVE GHG plan, and STOPS unless there are
--      none. (A customer whose plan has ended keeps such rows; they are not deleted by anything here. If the
--      pre-flight finds some, Lisa decides before this runs: the triggers only govern writes, but the expectation
--      recorded on 4 Oct 2026 is that there are none.)
--   2. public.enforce_scope3_entitlement() and public.enforce_sbti_entitlement(): BEFORE INSERT OR UPDATE triggers
--      that refuse the write unless NEW.user_id holds an active ghg entitlement (term_end > now(), the same rule as
--      enforce_ghg_location_allowance()). Two messages each, like the GHG gate, and two SQLSTATEs the app maps:
--        PT410  the account had a GHG plan and it has expired
--        PT402  the account never had one
--      (Custom class 'PT', as assert_sector_codes_exist() uses PT422.)
--   3. Triggers: trg_enforce_scope3_entitlement on scope3_inventories; trg_enforce_sbti_entitlement on each of the
--      four sbti_* tables.
--
-- WHAT IT DOES NOT DO
--   - DELETE is not gated: deleting one's own Scope 3 or SBTi rows stays as it is, and account erasure
--     (scripts/erase-account.mjs, service role) is unaffected in any case.
--   - Reading is unchanged.
--   - The service role is not exempt: no server code writes these tables with it today (checked 4 Oct 2026; the only
--     writers are app/dashboard/scope3/page.tsx and app/dashboard/sbti/page.tsx, as the signed-in user).
--
-- FIRING ORDER on scope3_inventories: trg_enforce_scope3_entitlement sorts before trg_scope3_inventories_sectors, so
-- an account without a plan is told that, not about a sector code.
--
-- GRANTS. Trigger functions need no EXECUTE grant to fire; per the grants rule, all is revoked from public, anon and
-- authenticated on both.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L1 report). Re-parse after any edit.
-- ROLLBACK: L1-M3-rollback.sql (run L1-M2-rollback.sql first if M2 has run).

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────────────────────
do $pre$
declare
  v_n int := 0;
  v_part int;
  v_list text := '';
  v_part_list text;
  t text;
begin
  if exists (select 1 from pg_trigger where tgname in ('trg_enforce_scope3_entitlement', 'trg_enforce_sbti_entitlement') and not tgisinternal) then
    raise exception 'Pre-flight: an M3 trigger already exists. Already run? Nothing was changed.';
  end if;

  foreach t in array array['scope3_inventories', 'sbti_company_profile', 'sbti_targets', 'sbti_cycle', 'sbti_scope3_coverage'] loop
    execute format(
      'select count(*), string_agg(distinct x.user_id::text, '', '')
         from public.%I x
        where not exists (select 1 from public.entitlements e
                           where e.user_id = x.user_id and e.module_key = ''ghg'' and e.term_end > now())', t)
      into v_part, v_part_list;
    if v_part > 0 then
      v_n := v_n + v_part;
      v_list := v_list || format('%s: %s row(s), owners %s; ', t, v_part, v_part_list);
    end if;
  end loop;

  if v_n <> 0 then
    raise exception 'Pre-flight: % Scope 3 / SBTi row(s) belong to accounts with no active GHG plan: %Nothing was changed.', v_n, v_list;
  end if;
  raise notice 'Pre-flight passed: every Scope 3 and SBTi row belongs to an account with an active GHG plan.';
end
$pre$;

-- ── 1. Scope 3 ──────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_scope3_entitlement()
returns trigger as $$
DECLARE
  has_active boolean;
  had_entitlement boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
      AND e.term_end > now()
  ) INTO has_active;

  IF NOT has_active THEN
    SELECT EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = NEW.user_id
        AND e.module_key = 'ghg'
    ) INTO had_entitlement;

    IF had_entitlement THEN
      RAISE EXCEPTION 'Your GHG access has expired. Nothing was saved, and your figures are still on screen. Renew to save them.'
        USING ERRCODE = 'PT410';
    ELSE
      RAISE EXCEPTION 'Scope 3 is part of the GHG plan. Nothing was saved, and your figures are still on screen. Choose a plan to save them.'
        USING ERRCODE = 'PT402';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public, pg_catalog;

comment on function public.enforce_scope3_entitlement() is
  'BEFORE INSERT OR UPDATE on scope3_inventories: an active GHG plan is required to write Scope 3 (LEAD1 M3). PT410 expired, PT402 never bought.';

revoke all on function public.enforce_scope3_entitlement() from public, anon, authenticated;

create trigger trg_enforce_scope3_entitlement
  before insert or update on public.scope3_inventories
  for each row execute function public.enforce_scope3_entitlement();

-- ── 2. SBTi ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_sbti_entitlement()
returns trigger as $$
DECLARE
  has_active boolean;
  had_entitlement boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
      AND e.term_end > now()
  ) INTO has_active;

  IF NOT has_active THEN
    SELECT EXISTS (
      SELECT 1 FROM public.entitlements e
      WHERE e.user_id = NEW.user_id
        AND e.module_key = 'ghg'
    ) INTO had_entitlement;

    IF had_entitlement THEN
      RAISE EXCEPTION 'Your GHG access has expired. Nothing was saved, and your figures are still on screen. Renew to save them.'
        USING ERRCODE = 'PT410';
    ELSE
      RAISE EXCEPTION 'Science-based targets are part of the GHG plan. Nothing was saved, and your figures are still on screen. Choose a plan to save them.'
        USING ERRCODE = 'PT402';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public, pg_catalog;

comment on function public.enforce_sbti_entitlement() is
  'BEFORE INSERT OR UPDATE on the four sbti_* tables: an active GHG plan is required to write SBTi (LEAD1 M3). PT410 expired, PT402 never bought.';

revoke all on function public.enforce_sbti_entitlement() from public, anon, authenticated;

create trigger trg_enforce_sbti_entitlement
  before insert or update on public.sbti_company_profile
  for each row execute function public.enforce_sbti_entitlement();
create trigger trg_enforce_sbti_entitlement
  before insert or update on public.sbti_targets
  for each row execute function public.enforce_sbti_entitlement();
create trigger trg_enforce_sbti_entitlement
  before insert or update on public.sbti_cycle
  for each row execute function public.enforce_sbti_entitlement();
create trigger trg_enforce_sbti_entitlement
  before insert or update on public.sbti_scope3_coverage
  for each row execute function public.enforce_sbti_entitlement();

-- ── Post-flight ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_n int;
begin
  select count(*) into v_n from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal
     and ((t.tgname = 'trg_enforce_scope3_entitlement' and c.relname = 'scope3_inventories')
       or (t.tgname = 'trg_enforce_sbti_entitlement'
           and c.relname in ('sbti_company_profile', 'sbti_targets', 'sbti_cycle', 'sbti_scope3_coverage')));
  if v_n <> 5 then
    raise exception 'Post-flight: % of the 5 M3 triggers are in place. Nothing committed.', v_n;
  end if;
  if has_function_privilege('authenticated', 'public.enforce_scope3_entitlement()', 'execute')
     or has_function_privilege('authenticated', 'public.enforce_sbti_entitlement()', 'execute') then
    raise exception 'Post-flight: authenticated can execute an M3 function directly. Nothing committed.';
  end if;
  raise notice 'M3 applied. Next: L1-M2-ghg-entitlement-gate-free-tier.sql.';
end
$post$;

commit;
