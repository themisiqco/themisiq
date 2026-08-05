-- get_verifier_inventory — narrow the inventory whitelist, strip the audit value blobs
-- ---------------------------------------------------------------------------
-- ⚠️ NOT YET APPLIED. Unlike 20260707_ and 20260708_, this file is the SOURCE, not a record of
-- something already live. Lisa runs it in the Supabase SQL editor; nothing applies it automatically.
--
-- ⚠️ 20260708_get_verifier_inventory_add_accepted_at.sql IS WRONG AND THIS SUPERSEDES IT. That file
-- states it is "the authoritative current live definition, reproduced verbatim" and then shows the
-- inventory being built with `to_jsonb(i)` — the whole row. The live function has never done that:
-- pg_get_functiondef shows a 12-column jsonb_build_object whitelist, which an anon call against a
-- live token confirms (12 keys returned, not 29). Read 20260708_ for the accepted_at change only;
-- its inventory projection is fiction. This file is written from the real body.
--
-- WHAT CHANGES, AND WHY
--
-- 1. INVENTORY PROJECTION — three columns out, four in.
--      REMOVED  revenue_millions, scope1_intensity, scope2_intensity
--               Revenue is commercially sensitive and a verifier does not need it to form an
--               opinion on an emissions inventory. Both intensities are derived from it, so leaving
--               them would disclose the numerator by division.
--      ADDED    coverage_resolutions  — the audit trail behind any grossed-up or adjusted figure
--               gwp_version           — ISO 14064-3 7.1.4.9(b): the verifier must be able to
--                                       confirm which GWP set the figures use
--               pct_estimated         — what share of the inventory is estimated rather than metered
--               fiscal_year_end_month — reporting_year alone does not say whether the year is
--                                       calendar or fiscal. period_start/period_end are NOT added:
--                                       they are NULL on all 15 rows because the wizard never writes
--                                       them, so they would disclose nothing but two nulls.
--
-- 2. AUDIT PROJECTION — metadata only; the value blobs are gone.
--    The live function returns `to_jsonb(a)`, which carries old_values and new_values: FULL
--    before/after snapshots of the ghg_inventories row. Sampled live, those blobs contain every one
--    of the columns the whitelist above withholds — user_id, organization_id, company_id,
--    revenue_millions, employee_count, prior_year_s1/s2, california_nexus, status, and both
--    intensities. So the live comment claiming internal ids and figures are "deliberately excluded
--    to avoid over-exposure pre-consent" was true of the inventory object and undone, in the same
--    response, by the audit array. The page filtered them for DISPLAY, which does nothing about what
--    crosses the wire.
--
--    Replaced by: id, action, created_at, user_email, and changed_fields — the NAMES of the fields
--    that changed, and no values. table_name and record_id are dropped (constant for this query);
--    user_id is dropped (an internal uuid; user_email is the human-readable actor the page renders).
--
--    changed_fields is INTERSECTED WITH THE INVENTORY WHITELIST by iterating the whitelist itself.
--    Names leak less than values but they still leak: without the intersection, a verifier would
--    learn that revenue changed, and when, just not to what. Computed only for UPDATE — on INSERT
--    every field is "new" rather than changed, and on DELETE there is nothing to report.
--
-- WHAT IS DELIBERATELY UNCHANGED: the token validity check, both error strings
-- ('invalid_or_expired', 'inventory_not_found'), SECURITY DEFINER, search_path='public', the audit
-- ordering (created_at desc), and the outer jsonb_build_object including accepted_at.
--
-- GRANTS: no change required. The function keeps its owner and its existing EXECUTE grant to anon
-- (it is being called successfully today), and the new body reads fewer columns, not more.
--
-- ⚠️ SEPARATELY, AND NOT FIXED HERE: public.audit_log has no SELECT grant to service_role
-- ("permission denied for table audit_log"). This function is unaffected because SECURITY DEFINER
-- runs as the owner, but any service-role code path reading audit_log directly will fail.
--
-- ⚠️ ALSO NOT CLOSED BY THIS CHANGE: locations_data and workings are still returned, so
-- locations_data[].source_docs[].file_path and workings[].source_file_paths continue to reach the
-- verifier's browser. app/api/verifier-documents/route.ts documents that exposure; its comment
-- describes the RPC as to_jsonb(i), which was already inaccurate and stays inaccurate here.
--
-- ⚠️ COUPLED TO THE CLIENT: the whitelist inside changed_fields must mirror AUDIT_FIELD_LABELS in
-- app/verify/[token]/page.tsx, which turns these column names into plain language. A column added
-- here without a label there renders to the verifier as "Another field".

begin;

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
    'company_name',           i.company_name,
    'reporting_year',         i.reporting_year,
    'fiscal_year_end_month',  i.fiscal_year_end_month,
    'boundary_approach',      i.boundary_approach,
    'selected_frameworks',    i.selected_frameworks,
    'scope1_total',           i.scope1_total,
    'scope2_location_total',  i.scope2_location_total,
    'scope2_market_total',    i.scope2_market_total,
    'locations_data',         i.locations_data,
    'workings',               i.workings,
    'coverage_resolutions',   i.coverage_resolutions,
    'gwp_version',            i.gwp_version,
    'pct_estimated',          i.pct_estimated
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
                   'gwp_version', 'pct_estimated'
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

commit;
