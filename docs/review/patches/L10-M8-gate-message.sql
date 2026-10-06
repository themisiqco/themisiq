-- docs/review/patches/L10-M8-gate-message.sql
--
-- ⚠️ RUN 6 Oct 2026 in the Supabase SQL editor (recorded by Lisa); L10-M8-verify.sql then passed all 11 checks.
-- DO NOT RUN AGAIN: the pre-flight would refuse (the new message is already in place).
-- Drafted 6 Oct 2026 (LEAD1 task L10, migration M8). To become
-- supabase/migrations/2026MMDD_ghg_gate_message.sql.
--
-- WHAT IT DOES: changes ONE string in public.enforce_ghg_location_allowance(), the refusal shown when an account that
-- never had a GHG plan writes a row the gate refuses (PT402):
--   was  'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'
--   now  'This needs a GHG plan. Your work is still on screen; choose a plan to keep it.'
-- The old sentence said saving a GHG inventory requires the module, which stopped being true when the free account
-- (LEAD1) began saving one calculation without a plan.
--
-- ⚠️ THE LOGIC IS UNTOUCHED, BY CONSTRUCTION. The file does not carry a new body to retype. It reads the LIVE body,
-- checks it is EXACTLY the body L1-M2 installed (the text below, copied from
-- docs/review/patches/L1-M2-ghg-entitlement-gate-free-tier.sql, which was RUN 4 Oct 2026), and recreates the function
-- from that same text with replace(old sentence, new sentence). The post-flight then proves the new body equals the
-- old one with only that sentence swapped, in both directions, and that the language, SECURITY DEFINER and
-- search_path are as before. CREATE OR REPLACE keeps the owner, the grants and the trigger
-- (trg_enforce_ghg_location_allowance) as they are.
--
-- The PT410 sentence (an expired plan) and the documents sentence are not changed.
--
-- RUN ORDER: independent of the code. The app shows the gate's message as the database sends it
-- (lib/planGateError.ts), so the new sentence appears on the next refused save after this runs, whichever goes first.
-- Then L10-M8-verify.sql.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 6 Oct 2026 (see the L10 report). Re-parse after any edit.
-- ROLLBACK: none needed as a file. To undo, run this file again with the two sentences swapped in v_old and v_new: the
-- pre-flight then checks the live body against the M8 text instead.

begin;

do $m8$
declare
  v_expected text := $body$
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
$body$;
  v_old      text := 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.';
  v_new      text := 'This needs a GHG plan. Your work is still on screen; choose a plan to keep it.';
  v_src      text;
  v_cfg      text[];
  v_secdef   boolean;
  v_lang     text;
  v_after    text;
begin
  select p.prosrc, p.proconfig, p.prosecdef, l.lanname into v_src, v_cfg, v_secdef, v_lang
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.enforce_ghg_location_allowance()'::regprocedure;

  -- ── Pre-flight ──
  if v_src = replace(v_expected, v_old, v_new) then
    raise exception 'Pre-flight: the new message is already in place (M8 already run). Nothing was changed.';
  end if;
  if v_src is distinct from v_expected then
    raise exception 'Pre-flight: the live body of enforce_ghg_location_allowance() is not the L1-M2 body. Inspect it before running this file. Nothing was changed.';
  end if;
  if (length(v_src) - length(replace(v_src, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'Pre-flight: the old message does not appear exactly once. Nothing was changed.';
  end if;
  if v_lang <> 'plpgsql' or not v_secdef or v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'Pre-flight: language, SECURITY DEFINER or search_path is not as L1-M2 set it. Nothing was changed.';
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'public.ghg_inventories'::regclass
                  and t.tgname = 'trg_enforce_ghg_location_allowance' and not t.tgisinternal) then
    raise exception 'Pre-flight: trg_enforce_ghg_location_allowance is missing. Nothing was changed.';
  end if;

  -- ── The change: the same body, one sentence swapped ──
  execute format(
    'create or replace function public.enforce_ghg_location_allowance() returns trigger language plpgsql security definer set search_path = public, pg_catalog as %L',
    replace(v_src, v_old, v_new));

  -- ── Post-flight ──
  select p.prosrc, p.proconfig, p.prosecdef, l.lanname into v_after, v_cfg, v_secdef, v_lang
    from pg_proc p join pg_language l on l.oid = p.prolang
   where p.oid = 'public.enforce_ghg_location_allowance()'::regprocedure;
  if v_after <> replace(v_expected, v_old, v_new) or replace(v_after, v_new, v_old) <> v_expected then
    raise exception 'Post-flight: the new body is not the old body with only the message swapped. Nothing committed.';
  end if;
  if position(v_old in v_after) > 0 then
    raise exception 'Post-flight: the old message is still present. Nothing committed.';
  end if;
  if v_lang <> 'plpgsql' or not v_secdef or v_cfg is distinct from array['search_path=public, pg_catalog'] then
    raise exception 'Post-flight: language, SECURITY DEFINER or search_path changed. Nothing committed.';
  end if;
  raise notice 'M8 applied: the PT402 message is now "%". Next: L10-M8-verify.sql.', v_new;
end
$m8$;

commit;
