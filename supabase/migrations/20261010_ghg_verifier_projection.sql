-- NOT YET RUN. Written 9 Oct 2026 for T16; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 4. Then 20261010_ghg_inventory_versions.sql and 20261010_verifier_access_inventory_version.sql,
-- BEFORE the T16 app change is pushed; then, once that deploy is live, 20261010_get_verifier_inventory_pinned.sql, then
-- supabase/verify/20261010_t16_verify.sql.
--
-- public.ghg_verifier_projection: what a verifier is shown of a GHG inventory, defined ONCE (T16)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Creates one function, public.ghg_verifier_projection(i public.ghg_inventories) returns jsonb: the sixteen keys
-- get_verifier_inventory returned as of 20261009_get_verifier_inventory_factor_edition_comparison.sql, built from
-- one inventory row. No table, column, grant on a table, or RLS policy is created or changed.
--
-- WHY
-- T16 pins a verifier link to a saved version. The version is a snapshot of exactly what the verifier is shown, and
-- the verifier is later shown that snapshot instead of the live row. If the snapshot and the RPC each built the
-- object themselves, they could drift, and a pinned link would show something the RPC never returned. Both now call
-- this function: 20261010_ghg_inventory_versions.sql stores it, 20261010_get_verifier_inventory_pinned.sql compares
-- the live one with it.
--
-- THE THIRTEEN QUANTITY KEYS ARE LEFT OUT OF EACH locations_data ELEMENT (T7 consequence, T16 finding 1)
-- Since T7 locations_data is saved raw: a field whose figure comes from bills holds only what was typed (usually 0),
-- and the figure itself lives in workings. Sending the raw field to a verifier would show a 0 beside a priced figure.
-- The keys are the fields lib/ghg/engine.ts fieldFor maps documents to: electricity_kwh, renewable_electricity_kwh,
-- natural_gas_amount, propane_amount, diesel_stationary_amount, diesel_mobile_amount, gasoline_amount, and since FI9
-- the six fleet fields light_petrol_amount, light_diesel_amount, heavy_petrol_amount, heavy_diesel_amount,
-- nonroad_petrol_amount, nonroad_diesel_amount. Every other key of each element stays, source_docs included (the
-- verifier page reads names, file names, paths and quotes from it). The array keeps its order.
--
-- GRANTS: execute is revoked from public, anon and authenticated. The function is internal: it is called only from
-- SECURITY DEFINER functions (get_verifier_inventory, the snapshot functions), which run as its owner. A row passed in
-- by a caller is a row that caller could already read, but there is no reason to expose a second entry point.
--
-- NO RLS CHANGE.
--
-- PRE-CHECK, run first:
--   select count(*) as rpc_versions from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'get_verifier_inventory';
-- PROCEED if it returns 1 (the RPC this projection is taken from exists, once). STOP and report anything else.
--   And: select pg_get_functiondef('public.get_verifier_inventory(uuid)'::regprocedure);
-- PROCEED if the inventory object it builds names exactly the sixteen keys listed below, in that order, and nothing
-- else (the 20261009 file as written). STOP and report any difference: it means the live RPC was changed by hand.
--
-- VERIFY, after: supabase/verify/20261010_t16_verify.sql, checks t16_01 to t16_03.
--
-- Idempotent: CREATE OR REPLACE; the grants are re-issued (a no-op) on every run. ASCII only.

create or replace function public.ghg_verifier_projection(i public.ghg_inventories)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'company_name',              i.company_name,
    'reporting_year',            i.reporting_year,
    'fiscal_year_end_month',     i.fiscal_year_end_month,
    'boundary_approach',         i.boundary_approach,
    'selected_frameworks',       i.selected_frameworks,
    'scope1_total',              i.scope1_total,
    'scope2_location_total',     i.scope2_location_total,
    'scope2_market_total',       i.scope2_market_total,
    'locations_data',            case when pg_catalog.jsonb_typeof(i.locations_data) = 'array' then coalesce((
                                   select pg_catalog.jsonb_agg(e.value - array[
                                     'electricity_kwh', 'renewable_electricity_kwh', 'natural_gas_amount',
                                     'propane_amount', 'diesel_stationary_amount', 'diesel_mobile_amount',
                                     'gasoline_amount', 'light_petrol_amount', 'light_diesel_amount',
                                     'heavy_petrol_amount', 'heavy_diesel_amount', 'nonroad_petrol_amount',
                                     'nonroad_diesel_amount'
                                   ]::text[] order by e.ordinality)
                                   from pg_catalog.jsonb_array_elements(i.locations_data) with ordinality as e(value, ordinality)
                                 ), '[]'::jsonb) else i.locations_data end,
    'workings',                  i.workings,
    'coverage_resolutions',      i.coverage_resolutions,
    'gwp_version',               i.gwp_version,
    'pct_estimated',             i.pct_estimated,
    'comparability_disclosure',  i.comparability_disclosure,
    'factor_editions',           i.factor_editions,
    'factor_edition_comparison', i.factor_edition_comparison
  )
$$;

comment on function public.ghg_verifier_projection(public.ghg_inventories) is
  'T16: what a verifier is shown of one GHG inventory, defined once and called by get_verifier_inventory and the '
  'version snapshot, so the two cannot differ. Sixteen keys; each locations_data element without the thirteen '
  'bill-backed quantity keys (the figures are in workings). Internal: execute revoked from public, anon and '
  'authenticated. See supabase/migrations/20261010_ghg_verifier_projection.sql.';

revoke all on function public.ghg_verifier_projection(public.ghg_inventories) from public, anon, authenticated;
