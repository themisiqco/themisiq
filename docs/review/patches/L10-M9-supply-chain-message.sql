-- docs/review/patches/L10-M9-supply-chain-message.sql
--
-- ⚠️ RUN 6 Oct 2026 in the Supabase SQL editor (recorded by Lisa); L10-M9-verify.sql then passed all 8 checks.
-- DO NOT RUN AGAIN: the pre-flight would refuse (the new message is already in place).
-- Drafted 6 Oct 2026 (LEAD1 task L10, migration M9). To become
-- supabase/migrations/2026MMDD_supply_chain_gate_message.sql.
--
-- WHAT IT DOES: changes ONE string in public.enforce_supply_chain_entitlement(), the refusal when an account that never
-- had a Supply Chain plan saves a register, so the database says what the page says
-- (app/dashboard/supply-chain/page.tsx SAVE_REFUSAL.none):
--   was  'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.'
--   now  'Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.'
-- The page and the trigger had already drifted apart: the page said "…on screen. Purchase to save them." while the
-- trigger said "…on screen, purchase to save them" after a dash.
--
-- ⚠️ THE LIVE BODY IS NOT THE ONE IN THE MIGRATION FILE. supabase/migrations/20260913_supply_chain_registers.sql carries
-- comments inside the function and uses `raise exception '…' using errcode`; the newest dump
-- (db/dumps/schema_public_20261001_1057.sql) shows the live function with no comments and `raise exception using
-- errcode = …, message = …`. pg_dump prints a function body exactly as stored, so the DUMP is the live text, and that
-- is the body copied below (programmatically, not retyped).
--
-- ⚠️ THE LOGIC IS UNTOUCHED, BY CONSTRUCTION, as in M8: the file refuses unless the live body equals that text,
-- recreates the function from the live body with replace(old sentence, new sentence), and the post-flight proves the
-- new body is the old one with only that sentence swapped, in both directions, with the language, SECURITY DEFINER and
-- search_path as before. CREATE OR REPLACE keeps the owner, the grants and trg_enforce_supply_chain_entitlement.
-- The expired-plan sentence is not changed.
--
-- RUN ORDER: either order with the code. The page checks access first and shows its own sentence, which the L10 patch
-- already changes; this makes the trigger, which a direct API write reaches, say the same. Then L10-M9-verify.sql.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 6 Oct 2026 (see the L10 report). Re-parse after any edit.
-- ROLLBACK: run this file again with the two sentences swapped in v_old and v_new.

begin;

do $m9$
declare
  v_expected text := $body$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'supply-chain'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'supply-chain'
    ) into had_entitlement;

    if had_entitlement then
      raise exception using
        errcode = 'PT402',
        message = 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.';
    else
      raise exception using
        errcode = 'PT402',
        message = 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.';
    end if;
  end if;

  return new;
end;
$body$;
  v_old      text := 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.';
  v_new      text := 'Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.';
  v_src      text;
  v_cfg      text[];
  v_secdef   boolean;
  v_lang     text;
  v_after    text;
begin
  select p.prosrc, p.proconfig, p.prosecdef, l.lanname into v_src, v_cfg, v_secdef, v_lang
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.enforce_supply_chain_entitlement()'::regprocedure;

  -- ── Pre-flight ──
  if v_src = replace(v_expected, v_old, v_new) then
    raise exception 'Pre-flight: the new message is already in place (M9 already run). Nothing was changed.';
  end if;
  if v_src is distinct from v_expected then
    raise exception 'Pre-flight: the live body of enforce_supply_chain_entitlement() is not the body in the 1 Oct 2026 dump. Inspect it before running this file. Nothing was changed.';
  end if;
  if (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Pre-flight: the old message does not appear exactly once. Nothing was changed.';
  end if;
  if v_lang <> 'plpgsql' or not v_secdef or v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'Pre-flight: language, SECURITY DEFINER or search_path is not as expected. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.supply_chain_registers'::regclass
                  and t.tgname = 'trg_enforce_supply_chain_entitlement' and not t.tgisinternal) then
    raise exception 'Pre-flight: trg_enforce_supply_chain_entitlement is missing. Nothing was changed.';
  end if;

  -- ── The change: the same body, one sentence swapped ──
  execute format(
    'create or replace function public.enforce_supply_chain_entitlement() returns trigger language plpgsql security definer set search_path = public, pg_catalog as %L',
    replace(v_src, v_old, v_new));

  -- ── Post-flight ──
  select p.prosrc, p.proconfig, p.prosecdef, l.lanname into v_after, v_cfg, v_secdef, v_lang
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.enforce_supply_chain_entitlement()'::regprocedure;
  if v_after <> replace(v_expected, v_old, v_new) or replace(v_after, v_new, v_old) <> v_expected then
    raise exception 'Post-flight: the new body is not the old body with only the message swapped. Nothing committed.';
  end if;
  if position(v_old in v_after) > 0 then
    raise exception 'Post-flight: the old message is still present. Nothing committed.';
  end if;
  if v_lang <> 'plpgsql' or not v_secdef or v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'Post-flight: language, SECURITY DEFINER or search_path changed. Nothing committed.';
  end if;
  raise notice 'M9 applied: the never-bought message is now "%". Next: L10-M9-verify.sql.', v_new;
end
$m9$;

commit;
