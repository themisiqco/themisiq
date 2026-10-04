-- docs/review/patches/L1-M2-rollback.sql
--
-- ⚠️ NOT RUN. Rollback for L1-M2-ghg-entitlement-gate-free-tier.sql: restores public.enforce_ghg_location_allowance()
-- to the FI0 body, copied verbatim from docs/review/patches/FI0-entitlement-gate-only.sql (RUN 2 Oct 2026).
--
-- EFFECT. Every write without an active GHG plan is refused again, free_tier or not, with FI0's two messages (and no
-- SQLSTATE). Free calculations already saved are NOT touched: they stay in the table, readable by their owners, and
-- simply cannot be edited until the account buys a plan. The pre-flight reports how many there are.
--
-- ORDER. Roll back M2 FIRST, before M3 (L1-M3-rollback.sql) and M1 (L1-M1-rollback.sql): both refuse while M2's body is
-- live.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

do $pre$
declare
  v_n int;
begin
  if position('free_tier' in (select prosrc from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure)) = 0 then
    raise exception 'Pre-flight: the live body does not read free_tier, so M2 is not live. Nothing to roll back.';
  end if;
  select count(*) into v_n from public.ghg_inventories where free_tier;
  raise notice 'Free calculations saved (kept, read-only without a plan after this rollback): %', v_n;
end
$pre$;

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

do $post$
begin
  if position('free_tier' in (select prosrc from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure)) > 0 then
    raise exception 'Post-flight: the body still reads free_tier. Nothing committed.';
  end if;
  raise notice 'M2 rolled back: the FI0 entitlement gate is live again.';
end
$post$;

commit;
