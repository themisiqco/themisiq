-- docs/review/patches/L1-M3-rollback.sql
--
-- ⚠️ NOT RUN. Rollback for L1-M3-scope3-sbti-entitlement.sql.
--
-- ⚠️ ROLL BACK M2 FIRST if it has run (L1-M2-rollback.sql). With M2 live and these triggers gone, an account without
-- a plan can save a free calculation and then write Scope 3 and SBTi against it through the API. The pre-flight
-- refuses while M2's body is live.
--
-- WHAT IT DOES. Drops the five triggers and the two functions M3 created. Nothing else changes; no rows are touched.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

do $pre$
begin
  if position('free_tier' in pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure)) > 0 then
    raise exception 'Pre-flight: M2 is live (enforce_ghg_location_allowance() reads free_tier). Run L1-M2-rollback.sql first. Nothing was changed.';
  end if;
end
$pre$;

drop trigger if exists trg_enforce_scope3_entitlement on public.scope3_inventories;
drop trigger if exists trg_enforce_sbti_entitlement on public.sbti_company_profile;
drop trigger if exists trg_enforce_sbti_entitlement on public.sbti_targets;
drop trigger if exists trg_enforce_sbti_entitlement on public.sbti_cycle;
drop trigger if exists trg_enforce_sbti_entitlement on public.sbti_scope3_coverage;
drop function if exists public.enforce_scope3_entitlement();
drop function if exists public.enforce_sbti_entitlement();

commit;
