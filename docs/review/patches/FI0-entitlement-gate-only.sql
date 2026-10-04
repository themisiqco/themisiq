-- docs/review/patches/FI0-entitlement-gate-only.sql
--
-- ⚠️ RUN 2 Oct 2026, in the Supabase SQL editor (recorded by Lisa on 4 Oct 2026). FI0-verify.sql was run afterwards:
-- the behavioural checks passed; only the function-name text check failed, as expected: "body does not read
-- location_allowance" searches pg_get_functiondef(), which prints the function's own name,
-- enforce_ghg_location_allowance, so it finds the string even though the body no longer reads the column.
-- DO NOT RUN IT AGAIN: the live body is now this file's, and LEAD1's M2 (docs/review/design-lead1.md section 4)
-- builds on it.
-- Drafted 2 Oct 2026 (task FI0, docs/review/design-derived-figures.md section 11). To become
-- supabase/migrations/2026MMDD_ghg_entitlement_gate_only.sql.
--
-- WHAT IT DOES. Replaces public.enforce_ghg_location_allowance() with its ENTITLEMENT GATE ONLY. The location cap
-- (part (b)) is retired: GHG is priced by employee band with unlimited locations on every plan (lib/pricing.ts
-- GHG_TIERS, every locationAllowance null since 28 Sep 2026).
--   - Part (a), the gate, is kept word for word from the live body (20260618_ghg_location_allowance.sql, identical to
--     db/dumps/schema_public_20261001_1057.sql:570-628), with ONE change: the message "Your work is still on screen —
--     purchase to save it." becomes "Your work is still on screen. Purchase to save it." (ruling: no em dash). The
--     client shows the message verbatim (app/dashboard/ghg/page.tsx:1685, 1691) and matches on nothing in it.
--   - Part (b) is removed: no read of entitlements.location_allowance, no jsonb_array_length, no fail-open block.
--
-- WHAT IT DOES NOT DO
--   - It does not rename the function or touch the trigger. CREATE OR REPLACE swaps the body atomically and the
--     trigger trg_enforce_ghg_location_allowance keeps pointing at it, so there is no moment without a gate. The
--     misleading name is retired later, together with the column.
--   - It does not drop entitlements.location_allowance. ⚠️ DO NOT DROP THAT COLUMN UNTIL FI0's CODE IS LIVE ON MAIN.
--     The live Stripe webhook upserts it on every purchase (app/api/webhooks/stripe/route.ts:245) and checkout and
--     the admin invoice route select it (app/api/checkout/route.ts:144, app/api/admin/create-invoice/route.ts:212).
--     Dropped first, the webhook's upsert fails and a paying customer receives no entitlement. The drop is a
--     separate, later migration.
--
-- IS MAIN'S LIVE CODE SAFE AROUND THIS? Yes, before and after, in either order with FI0's code, PROVIDED the
-- pre-flight count below is 0. Every self-serve writer already sends an empty allowance, which the webhook stores as
-- null, and null was already "uncapped" to the old body. The one way a customer is capped today is a non-null value
-- left on an older row; the pre-flight reports how many exist.
--
-- RUN ORDER: this file first, then merge FI0's code, then (later, separately) the column drop.
-- RUN WITH: the Supabase SQL editor, the whole file. One transaction. Then run FI0-verify.sql.
-- PARSED OFFLINE with pglast on 2 Oct 2026: 5 statements; the function and the pre-flight block compile. Re-parse
-- after any edit (pglast). Expect the ValueError on this trigger function's PL/pgSQL body, which is pglast's
-- serializer, not a parse failure; only ParseError is a failure (memory note on offline parsing).
-- GRANTS: none. Same function, same owner, same grants.

begin;

-- ── Pre-flight ──────────────────────────────────────────────────────────────────────────────────
do $pre$
declare
  v_capped integer;
begin
  if to_regprocedure('public.enforce_ghg_location_allowance()') is null then
    raise exception 'Pre-flight: public.enforce_ghg_location_allowance() does not exist. Nothing was changed.';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.ghg_inventories'::regclass
      and t.tgname = 'trg_enforce_ghg_location_allowance' and not t.tgisinternal
  ) then
    raise exception 'Pre-flight: trigger trg_enforce_ghg_location_allowance is not on public.ghg_inventories. Nothing was changed.';
  end if;
  -- Reported, not refused: retiring the cap is the point. The number says how many customers it lifts a cap from.
  select count(*) into v_capped
  from public.entitlements
  where module_key = 'ghg' and location_allowance is not null;
  raise notice 'GHG entitlement rows with a non-null location_allowance (capped today): %', v_capped;
end
$pre$;

-- ── The gate, and nothing else ──────────────────────────────────────────────────────────────────
-- Body: the live function's part (a), comments included, unchanged except the one message.
create or replace function public.enforce_ghg_location_allowance()
returns trigger as $$
DECLARE
  has_active   boolean;
  had_entitlement boolean;
BEGIN
  -- An ACTIVE GHG pass is required to write an inventory at all.
  -- Absence is the RESTRICTIVE answer here. This is deliberate and is
  -- the opposite of the pre-Aug-2026 behaviour, where a missing row
  -- read as uncapped and let unpaid users save unlimited locations.
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
      RAISE EXCEPTION 'Your GHG access has expired. Renew to save changes to your inventory.';
    ELSE
      RAISE EXCEPTION 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.';
    END IF;
  END IF;

  -- The location cap that followed here was retired (FI0): GHG is priced by
  -- employee band and every plan has unlimited locations.

  RETURN NEW;
END;
$$ language plpgsql security definer set search_path = public, pg_catalog;

comment on column public.entitlements.location_allowance is
  'RETIRED (FI0): no longer read by any trigger. GHG has unlimited locations on every plan. To be dropped once no code writes it.';

commit;
