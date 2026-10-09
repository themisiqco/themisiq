-- RUN 8 Oct 2026 in the Supabase SQL editor; live body verified.
--
-- get_verifier_inventory - factor_edition_comparison added to the verifier projection (F-06, T3c diff 4)
-- ---------------------------------------------------------------------------
-- THIS IS THE CURRENT DEFINITION. It supersedes 20260814_get_verifier_inventory_factor_editions.sql.
--
-- VERIFIED, 8 Oct 2026 (Lisa). Before running, the live pg_get_functiondef was compared line by line with this file
-- and differed only by the two additions listed under WHAT CHANGED. After running, 'factor_edition_comparison'
-- occurs 3 times in the live definition: the projection key, the i. column, and the audit field list.
-- The first paste attempt failed on a truncated paste (42601, unterminated dollar-quoted string; nothing changed).
-- The file was then copied from disk with sed and pbcopy, and that paste ran.
--
-- RUN AFTER 20261008_ghg_factor_edition_comparison.sql, which adds the column this file projects. Run before it,
-- the CREATE OR REPLACE fails on an unknown column and changes nothing.
--
-- Re-running 20260814 (or any earlier definition) succeeds silently and reverts the projection: the
-- verifier would stop seeing which factor editions changed, from a page that looks normal.
--
-- ############################################################################
-- ## BEFORE RUNNING THIS FILE, CONFIRM IT MATCHES WHAT IS DEPLOYED.         ##
-- ############################################################################
--
-- The body below is 20260814's, which was VERIFIED LIVE on 16 Sep 2026 by pg_get_functiondef, with two additions.
-- It has NOT been re-checked against the live database since, because the session that wrote it could not run SQL.
-- CREATE OR REPLACE silently discards anything changed in the SQL editor since then. Run this and compare:
--
--     select pg_get_functiondef('public.get_verifier_inventory(uuid)'::regprocedure);
--
-- The live body must equal the CREATE OR REPLACE below except for the two additions listed under WHAT CHANGED.
-- If anything else differs, STOP: the live function has been edited outside migrations, and this file would revert
-- it. Reconcile first, then re-derive this migration from the live body.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED FROM THE 14 AUG VERSION
-- Two additions, both additive. Nothing removed, renamed or reordered.
--
--   1. 'factor_edition_comparison' in the jsonb_build_object projection. ISO 14064-3:2019 cl. 6.3.1.5 (ruling of
--      2 Oct 2026, finding F-06): the edition changes between the compared years, computed by the platform, reach
--      the verifier whether or not the company answered the comparability question (Lisa's ruling, 8 Oct 2026).
--
--   2. 'factor_edition_comparison' in the changed_fields array, so a recomputed comparison is named in the audit
--      trail. The audit trail is METADATA ONLY: field NAMES, never old_values or new_values.
--
-- THE THIRD COUPLED SITE IS IN THE APP: AUDIT_FIELD_LABELS in app/verify/[token]/page.tsx gains the label in the
-- same patch, and lib/ghg/verifierWhitelist.test.ts asserts the three sites against each other.
--
-- NO GRANT IS NEEDED. get_verifier_inventory is SECURITY DEFINER and runs as its owner.
-- ASCII only, so it pastes whole into the SQL editor (lib/ghg/verifierWhitelist.test.ts W-6).

CREATE OR REPLACE FUNCTION public.get_verifier_inventory(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_access verifier_access%rowtype;
  v_inventory jsonb;
  v_audit jsonb;
begin
  -- validate the token: must exist, be active, and not expired
  select * into v_access from verifier_access
    where token = p_token and status = 'active' and expires_at > now();
  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- the one inventory this token grants - EXPLICIT COLUMN WHITELIST.
  -- A column added to ghg_inventories is NOT disclosed until it is named here. Internal UUIDs
  -- (organization_id / user_id / company_id), status, timestamps, prior-year figures,
  -- employee_count, california_nexus, revenue_millions and both intensities are excluded.
  select jsonb_build_object(
    'company_name',              i.company_name,
    'reporting_year',            i.reporting_year,
    'fiscal_year_end_month',     i.fiscal_year_end_month,
    'boundary_approach',         i.boundary_approach,
    'selected_frameworks',       i.selected_frameworks,
    'scope1_total',              i.scope1_total,
    'scope2_location_total',     i.scope2_location_total,
    'scope2_market_total',       i.scope2_market_total,
    'locations_data',            i.locations_data,
    'workings',                  i.workings,
    'coverage_resolutions',      i.coverage_resolutions,
    'gwp_version',               i.gwp_version,
    'pct_estimated',             i.pct_estimated,
    'comparability_disclosure',  i.comparability_disclosure,
    'factor_editions',           i.factor_editions,
    'factor_edition_comparison', i.factor_edition_comparison
  ) into v_inventory
    from ghg_inventories i where i.id = v_access.inventory_id;

  if v_inventory is null then
    return jsonb_build_object('error', 'inventory_not_found');
  end if;

  -- its audit trail (append-only history) - METADATA ONLY, no old_values / new_values.
  -- changed_fields iterates the inventory whitelist and reports only those that actually differ,
  -- so a field the verifier cannot see is never named as having changed.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',         a.id,
             'action',     a.action,
             'created_at', a.created_at,
             'user_email', a.user_email,
             'changed_fields',
               case when a.action = 'UPDATE' then (
                 select coalesce(jsonb_agg(fld order by fld), '[]'::jsonb)
                 from unnest(array[
                   'company_name', 'reporting_year', 'fiscal_year_end_month',
                   'boundary_approach', 'selected_frameworks',
                   'scope1_total', 'scope2_location_total', 'scope2_market_total',
                   'locations_data', 'workings', 'coverage_resolutions',
                   'gwp_version', 'pct_estimated', 'comparability_disclosure',
                   'factor_editions', 'factor_edition_comparison'
                 ]) as fld
                 -- coalesce both sides to jsonb 'null' so "key absent" and "key present but null"
                 -- compare equal; without it, a column added between two revisions reads as changed.
                 where coalesce(a.old_values -> fld, 'null'::jsonb)
                       is distinct from coalesce(a.new_values -> fld, 'null'::jsonb)
               ) else '[]'::jsonb end
           ) order by a.created_at desc
         ), '[]'::jsonb)
    into v_audit
    from audit_log a
    where a.table_name = 'ghg_inventories' and a.record_id = v_access.inventory_id;

  return jsonb_build_object(
    'inventory', v_inventory,
    'audit', v_audit,
    'verifier', jsonb_build_object('name', v_access.verifier_name, 'email', v_access.verifier_email),
    'expires_at', v_access.expires_at,
    'accepted_at', v_access.accepted_at
  );
end; $function$;
