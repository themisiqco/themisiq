-- RUN 9 Oct 2026 (evening, Ontario; 10 Oct UTC) in the Supabase SQL editor, in the order in the header; verified.
-- RUN ORDER: 4 of 4, after 20261010_verifier_access_inventory_version.sql AND AFTER the T16 app change is deployed
-- and live. Then supabase/verify/20261010_t16_verify.sql.
--
-- NOTE: NOT BEFORE THE DEPLOY. The app before T16 treats any `error` in this RPC's answer as an invalid link, so a
-- verifier who has not yet consented would be shown "Link invalid or expired" instead of the consent step from the
-- moment this file runs until the new app is live. The T16 app handles both this function and the one it replaces.
--
-- get_verifier_inventory: a verifier link shows its pinned version, and only after consent (T16)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Replaces public.get_verifier_inventory(uuid) (last written in 20261009_get_verifier_inventory_factor_edition_
-- comparison.sql, which this supersedes). The function keeps its name, signature, SECURITY DEFINER and its existing
-- execute grants (CREATE OR REPLACE keeps them). What changes:
--   1. The grant must be active, unexpired AND not revoked (revoked_at is null), as get_verifier_scope3 and
--      lib/ghg/verifierGrant.ts already require (ruling E).
--   2. The inventory is the snapshot of the grant's pinned version (verifier_access.inventory_version_id), never the
--      live row. A grant with no version, or one naming another inventory's version, is refused (version_missing):
--      there is no live fallback (ruling A).
--   3. Before the verifier has consented (accepted_at is null), it returns consent_required with the company name and
--      the verifier's own name and email, for the consent step, and no figures (ruling E). Before T16 the figures were
--      returned to any valid token, and only the page held them back.
--   4. It adds `version`: the version number, when it was saved, when it was shared on this link, and whether the
--      customer shared it (false when the T16 migration pinned it); and `newer_version_exists`: whether the live
--      projection's SHA-256 differs from the pinned version's.
--   5. The audit trail returns only entries up to the pinned version's saved_at (ruling D). Later entries are not
--      returned at all.
-- The inventory keys come from public.ghg_verifier_projection, the function the snapshot stored, so the RPC and the
-- snapshot cannot differ. changed_fields keeps its sixteen names (lib/ghg/verifierWhitelist.test.ts).
--
-- WHY
-- Ruled 8 and 9 Oct 2026 (T16, decisions A to E).
--
-- GRANTS: none issued. CREATE OR REPLACE keeps the existing grants on get_verifier_inventory(uuid) (anon and
-- authenticated execute, as since 20260707). It runs as its owner, so it reads ghg_inventory_versions and calls the
-- internal projection, neither of which anon can reach directly.
--
-- NO RLS CHANGE.
--
-- PRE-CHECK, run first:
--   select count(*) as unpinned from public.verifier_access where inventory_version_id is null;
--   select to_regprocedure('public.ghg_verifier_projection(public.ghg_inventories)') as projection;
-- PROCEED if unpinned is 0 and projection is not null (files 1 to 3 ran). STOP and report otherwise: this file
-- refuses an unpinned grant, so a link left unpinned would stop working.
-- RESULT, 9 Oct 2026 (Lisa): run after the T16 deploy was live. This pre-check's own results were not recorded;
--   file 3's after-run check had recorded 0 unpinned.
-- VERIFIED, 9 Oct 2026 (Lisa): supabase/verify/20261010_t16_verify.sql, all 20 checks passed, twice (the second time
--   after location_log was added).
--
-- VERIFY, after: supabase/verify/20261010_t16_verify.sql, checks t16_16 to t16_19.
--
-- Idempotent: CREATE OR REPLACE. ASCII only.

create or replace function public.get_verifier_inventory(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_access    verifier_access%rowtype;
  v_version   ghg_inventory_versions%rowtype;
  v_inventory jsonb;
  v_audit     jsonb;
  v_newer     boolean;
begin
  select * into v_access from verifier_access
    where token = p_token
      and status = 'active'
      and expires_at > now()
      and revoked_at is null;
  if not found then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  -- The pinned version, and only one belonging to this grant's inventory.
  select * into v_version from ghg_inventory_versions
    where id = v_access.inventory_version_id
      and inventory_id = v_access.inventory_id;
  if not found then
    return jsonb_build_object('error', 'version_missing');
  end if;

  -- Consent first. Before it, the consent step's own details and no figures.
  if v_access.accepted_at is null then
    return jsonb_build_object(
      'error', 'consent_required',
      'company_name', v_version.snapshot ->> 'company_name',
      'verifier', jsonb_build_object('name', v_access.verifier_name, 'email', v_access.verifier_email),
      'expires_at', v_access.expires_at
    );
  end if;

  v_inventory := v_version.snapshot;

  -- A newer version exists when what a verifier would be shown of the live row is no longer what was pinned.
  select encode(sha256(convert_to(ghg_verifier_projection(i)::text, 'UTF8')), 'hex') is distinct from v_version.snapshot_sha256
    into v_newer
    from ghg_inventories i where i.id = v_access.inventory_id;

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
                 where coalesce(a.old_values -> fld, 'null'::jsonb)
                       is distinct from coalesce(a.new_values -> fld, 'null'::jsonb)
               ) else '[]'::jsonb end
           ) order by a.created_at desc
         ), '[]'::jsonb)
    into v_audit
    from audit_log a
    where a.table_name = 'ghg_inventories'
      and a.record_id = v_access.inventory_id
      and a.created_at <= v_version.saved_at;

  return jsonb_build_object(
    'inventory', v_inventory,
    'audit', v_audit,
    'verifier', jsonb_build_object('name', v_access.verifier_name, 'email', v_access.verifier_email),
    'expires_at', v_access.expires_at,
    'accepted_at', v_access.accepted_at,
    'version', jsonb_build_object(
      'version_no', v_version.version_no,
      'saved_at', v_version.saved_at,
      'shared_at', v_access.version_shared_at,
      'shared_by_customer', v_access.version_shared_by is not null
    ),
    'newer_version_exists', coalesce(v_newer, false)
  );
end; $function$;

comment on function public.get_verifier_inventory(uuid) is
  'A verifier token''s view of a GHG inventory: the snapshot of the grant''s pinned version (T16), never the live row; '
  'refused when revoked, expired, unpinned or not yet consented (consent_required carries only the company name and '
  'the verifier''s own details). Adds version and newer_version_exists; the audit trail stops at the version''s '
  'saved_at. The inventory keys are public.ghg_verifier_projection''s. '
  'See supabase/migrations/20261010_get_verifier_inventory_pinned.sql.';
