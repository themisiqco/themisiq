-- get_verifier_inventory — comparability disclosure added to the verifier projection
-- ---------------------------------------------------------------------------
-- Captures a function definition already hand-run in the Supabase SQL editor (2026-08-06).
-- Transcribed from pg_get_functiondef against the live database, so the body below is what is
-- ACTUALLY RUNNING, not a reconstruction. It carries no trailing statement terminator, because
-- pg_get_functiondef emits none — anyone replaying this file must add one.
--
-- ⚠️ supabase/migrations/20260805_get_verifier_inventory_whitelist_and_audit_metadata.sql NO LONGER
-- DESCRIBES THIS FUNCTION. It is a record of what ran on 5 Aug. This file supersedes it. Reading
-- the older file as the current definition is how you conclude a live field is not exposed.
--
-- WHAT CHANGED FROM THE 5 AUG VERSION:
-- Two additions, both additive. Nothing was removed, renamed or reordered.
--
--   1. 'comparability_disclosure' in the jsonb_build_object projection — the year-over-year
--      comparability disclosure (ISO 14064-3:2019 cl. 6.3.1.5). The clause puts the obligation on
--      the VERIFIER to determine whether changes making the periods incomparable were disclosed,
--      so the disclosure has to reach them alongside the figures. Column added the same day; see
--      20260806_ghg_comparability_disclosure_column.sql. NULL means the question was never
--      answered, and the verifier page renders nothing at all for it.
--
--   2. 'comparability_disclosure' in the changed_fields array — so a REVISED comparability answer
--      is named in the audit trail rather than passing silently.
--
-- VALUES ARE NOT EXPOSED BY (2). The audit trail is METADATA ONLY: it reports field NAMES, never
-- old_values or new_values (the 5 Aug change removed those precisely so a whitelist withholding a
-- column could not be undone by the history beside it). Adding the field here says THAT the
-- disclosure was revised, never what it said before. Its content reaches a verifier only through
-- the projection in (1), and only in its current state.
--
-- The array is also what bounds AUDIT_FIELD_LABELS in app/verify/[token]/page.tsx — an entry here
-- with no label there renders to a verifier as "Another field".

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

  -- the one inventory this token grants — EXPLICIT COLUMN WHITELIST.
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
    'comparability_disclosure',  i.comparability_disclosure
  ) into v_inventory
    from ghg_inventories i where i.id = v_access.inventory_id;

  if v_inventory is null then
    return jsonb_build_object('error', 'inventory_not_found');
  end if;

  -- its audit trail (append-only history) — METADATA ONLY, no old_values / new_values.
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
                   'gwp_version', 'pct_estimated', 'comparability_disclosure'
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
end; $function$
