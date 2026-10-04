-- docs/review/patches/L1-M2-ghg-entitlement-gate-free-tier.sql
--
-- ⚠️ NOT RUN. Drafted 4 Oct 2026 (LEAD1 task L1, migration M2; design in docs/review/design-lead1.md section 3).
-- To become supabase/migrations/2026MMDD_ghg_entitlement_gate_free_tier.sql.
--
-- RUN ORDER (L1): L1-M1-ghg-free-tier.sql (M1), then L1-M3-scope3-sbti-entitlement.sql (M3), then THIS FILE (M2), then
-- LEAD1-verify.sql. The pre-flight refuses unless M1's column and M3's triggers are in place, so it cannot open free
-- saves before Scope 3 and SBTi are gated.
--
-- BUILDS ON THE LIVE FI0 BODY. docs/review/patches/FI0-entitlement-gate-only.sql was RUN on 2 Oct 2026. Before
-- running this, compare the live body with that file:
--     select pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure);
-- The pre-flight also checks it: both FI0 messages present, no location_allowance in the body (prosrc, not the
-- definition, whose header carries the function's own name; that is why FI0-verify's text check fails), no
-- free_tier yet.
--
-- WHAT CHANGES. public.enforce_ghg_location_allowance() keeps its name, so trg_enforce_ghg_location_allowance
-- (BEFORE INSERT OR UPDATE ON ghg_inventories) keeps firing it with no gap. The body:
--   - WITH an active GHG plan: unchanged. Any row, any number, free_tier or not (a free row stays free_tier = true
--     until the webhook converts it, L8).
--   - WITHOUT one (expired or never bought):
--       an UPDATE of a row that is not the free calculation (OLD.free_tier false) is refused with FI0's message:
--         real inventories stay read-only, and a free save can never overwrite one;
--       a write whose NEW row is not free_tier is refused with FI0's message, which also refuses turning a free row
--         into a paid one (and, with the line above, any flip in either direction);
--       a free row carrying any source document (locations_data[*].source_docs[*]) is refused: uploads need a plan
--         (ENF1 refuses the upload itself; this refuses the reference);
--       otherwise the free calculation is written. ghg_inventories_one_free_per_user (M1) refuses a second one.
--   - The two FI0 messages are kept word for word. Each refusal now carries a SQLSTATE the app maps:
--       PT410  the account had a GHG plan and it has expired
--       PT402  the account never had one, or the write needs a plan (documents)
--
-- GRANTS: none. Same function, same owner, same grants.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 4 Oct 2026 (see the L1 report). Re-parse after any edit.
-- ROLLBACK: L1-M2-rollback.sql restores the FI0 body exactly.

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────────────────────
do $pre$
declare
  v_src text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'ghg_inventories' and column_name = 'free_tier') then
    raise exception 'Pre-flight: ghg_inventories.free_tier does not exist. Run L1-M1-ghg-free-tier.sql first. Nothing was changed.';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal
        and tgname in ('trg_enforce_scope3_entitlement', 'trg_enforce_sbti_entitlement')) <> 5 then
    raise exception 'Pre-flight: the Scope 3 and SBTi triggers are not all in place. Run L1-M3-scope3-sbti-entitlement.sql first. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.ghg_inventories'::regclass
                    and t.tgname = 'trg_enforce_ghg_location_allowance' and not t.tgisinternal) then
    raise exception 'Pre-flight: trigger trg_enforce_ghg_location_allowance is not on public.ghg_inventories. Nothing was changed.';
  end if;

  select prosrc into v_src from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure;
  if position('free_tier' in v_src) > 0 then
    raise exception 'Pre-flight: the live body already reads free_tier. Already run? Nothing was changed.';
  end if;
  if position('location_allowance' in v_src) > 0 then
    raise exception 'Pre-flight: the live body still reads location_allowance, so it is not the FI0 body. Nothing was changed.';
  end if;
  if position('Your GHG access has expired. Renew to save changes to your inventory.' in v_src) = 0
     or position('Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.' in v_src) = 0 then
    raise exception 'Pre-flight: the live body does not carry both FI0 messages, so it is not the FI0 body. Nothing was changed.';
  end if;
  raise notice 'Pre-flight passed: M1 and M3 are in place and the live body is FI0''s.';
end
$pre$;

-- ── The function ────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_ghg_location_allowance()
returns trigger as $$
DECLARE
  has_active   boolean;
  had_entitlement boolean;
  old_free     boolean := true;   -- an INSERT has no OLD row; only an UPDATE reads it, below
BEGIN
  -- An ACTIVE GHG pass allows any write, as in FI0.
  -- Absence is the RESTRICTIVE answer: a missing row never grants.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
      AND e.term_end > now()
  ) INTO has_active;

  IF has_active THEN
    RETURN NEW;
  END IF;

  -- No active plan. The free calculation (free_tier) is the only row that may be written (LEAD1).
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
  ) INTO had_entitlement;

  -- A real inventory is read-only without a plan, and nothing may turn a row into or out of the free calculation:
  -- refused if the row being updated is not the free one, or the row being written is not free.
  IF TG_OP = 'UPDATE' THEN
    old_free := OLD.free_tier;
  END IF;
  IF NOT old_free OR NOT NEW.free_tier THEN
    IF had_entitlement THEN
      RAISE EXCEPTION 'Your GHG access has expired. Renew to save changes to your inventory.'
        USING ERRCODE = 'PT410';
    ELSE
      RAISE EXCEPTION 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'
        USING ERRCODE = 'PT402';
    END IF;
  END IF;

  -- The free calculation carries no documents: uploading needs a plan (ENF1 refuses the upload itself).
  IF jsonb_path_exists(coalesce(NEW.locations_data, '[]'::jsonb), '$[*].source_docs[*]') THEN
    RAISE EXCEPTION 'Uploading documents needs an active GHG plan.'
      USING ERRCODE = 'PT402';
  END IF;

  -- One free calculation per account is enforced by ghg_inventories_one_free_per_user (M1).
  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public, pg_catalog;

-- ── Post-flight ─────────────────────────────────────────────────────────────────────────────────────────────────
do $post$
declare
  v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure;
  if position('free_tier' in v_src) = 0 or position('PT410' in v_src) = 0 or position('PT402' in v_src) = 0
     or position('source_docs' in v_src) = 0 then
    raise exception 'Post-flight: the new body is not in place. Nothing committed.';
  end if;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.ghg_inventories'::regclass
                    and t.tgname = 'trg_enforce_ghg_location_allowance' and not t.tgisinternal) then
    raise exception 'Post-flight: trg_enforce_ghg_location_allowance is gone. Nothing committed.';
  end if;
  raise notice 'M2 applied. Next: LEAD1-verify.sql.';
end
$post$;

commit;
