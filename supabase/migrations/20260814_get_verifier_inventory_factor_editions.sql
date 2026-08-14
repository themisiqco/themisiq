-- get_verifier_inventory - factor_editions added to the verifier projection
-- ---------------------------------------------------------------------------
-- ASCII ONLY, DELIBERATELY, AND FOR A RECORDED REASON. The 13 Aug factor_editions column migration
-- did not paste cleanly into the Supabase SQL editor: only its `alter table` ran, and the comment
-- and grants had to be run separately. Non-ASCII characters in the header block are the suspected
-- cause. A migration that cannot be pasted whole is a migration that lands in pieces, which is
-- exactly how a live function drifts from the file that claims to define it. There is a test on
-- this now - lib/ghg/verifierWhitelist.test.ts, W-6.
--
-- ############################################################################
-- ## BEFORE RUNNING THIS FILE, CONFIRM IT MATCHES WHAT IS DEPLOYED.         ##
-- ############################################################################
--
-- The body below was built from supabase/migrations/20260806_get_verifier_inventory_comparability.sql,
-- which was itself transcribed from pg_get_functiondef on 2026-08-06. It has NOT been re-checked
-- against the live database, because the session that wrote it could not run SQL.
--
-- CREATE OR REPLACE silently discards anything changed in the SQL editor since 6 Aug. Run this and
-- compare the output to the CREATE OR REPLACE below - the two must differ ONLY by the three
-- additions listed under WHAT CHANGED:
--
--     select pg_get_functiondef('public.get_verifier_inventory(uuid)'::regprocedure);
--
-- If anything else differs, STOP: the live function has been edited outside migrations, and this
-- file would revert it. Reconcile first, then re-derive this migration from the live body.
--
-- ---------------------------------------------------------------------------
-- WHAT CHANGED FROM THE 6 AUG VERSION
-- Two additions, both additive. Nothing removed, renamed or reordered.
--
--   1. 'factor_editions' in the jsonb_build_object projection. ISO 14064-3:2019 7.1.4.9(b) obliges
--      the verifier to confirm which factor set the figures use. gwp_version already answers that
--      for GWP; nothing answered it for the emission factor tables themselves. Column added
--      13 Aug (20260813_ghg_factor_editions_column.sql) and given its write path the same day.
--
--   2. 'factor_editions' in the changed_fields array, so a REVISED edition map is named in the
--      audit trail rather than passing silently.
--
-- THE 13 AUG COLUMN COMMENT SET THE CONDITION FOR THIS MIGRATION AND IT IS NOW MET. It said
-- whitelisting was withheld "since projecting it today would show every verifier an empty object
-- and teach them the field is always empty", and that it should follow the write path. The write
-- path exists, and the empty state now renders as a stated disclosure rather than a blank section -
-- see the Emission Factor Editions block in app/verify/[token]/page.tsx.
--
-- VALUES ARE NOT EXPOSED BY (2). The audit trail is METADATA ONLY: field NAMES, never old_values or
-- new_values. Adding the field there says THAT the editions were revised, never what they were.
--
-- THE THIRD COUPLED SITE IS IN THE APP, NOT IN SQL: AUDIT_FIELD_LABELS in
-- app/verify/[token]/page.tsx. A column named here with no label there renders to a verifier as
-- "Another field". That entry is added in the same commit as this file, and
-- lib/ghg/verifierWhitelist.test.ts now asserts all three sites against each other generically, so
-- the next column to be whitelisted fails the same test rather than relying on this comment.
--
-- WHAT A VERIFIER SEES. 23 of the 29 inventories in production hold '{}' and 6 are populated (all
-- fixtures on the founder account; no customer data at the time of writing). An inventory saved
-- before the write path projects '{}' and renders the "Not recorded for this inventory" disclosure;
-- a re-saved one renders the per-jurisdiction table. Both are intended states. Nothing here changes
-- any figure.
--
-- NO GRANT IS NEEDED. get_verifier_inventory is SECURITY DEFINER and runs as its owner; the
-- column-level grants on ghg_inventories are not consulted for this path. The 13 Aug migration
-- already granted select(factor_editions) for the authenticated dashboard read.

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
    'factor_editions',           i.factor_editions
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
                   'factor_editions'
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
