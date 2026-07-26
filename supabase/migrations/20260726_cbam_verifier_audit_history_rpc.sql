-- cbam_verifier_audit_history — tuple-scoped verifier change-history RPC
-- ---------------------------------------------------------------------------
-- CBAM verifier portal — audit read. Returns the operator change-history a
-- consented verifier is entitled to see for their granted (installation,
-- period): edits to cbam_installation_disclosures (boundary declarations) and
-- cbam_production_processes (process/route definitions). Computed see_records
-- are NOT here (integrity is guaranteed by the stale-record tripwire).
--
-- WHY SECURITY DEFINER (Option A): audit_log has no service_role grant and the
-- verifier is anon. Running as owner reads audit_log directly, scoped tightly
-- to the validated tuple — no new grant, audit_log stays locked down, and this
-- matches the existing verifier RPC pattern (validate/accept).
--
-- CONSENT-GATED: mirrors cbam_verifier_validate_token — the history is returned
-- only when the grant is valid AND consented (accepted_at not null). Before
-- consent, returns 'consent_required' with no data. Invalid/expired/revoked ->
-- 'invalid'.
--
-- DELETE-SAFE FILTERING (both tables): audit rows are matched to the report
-- tuple by the tuple carried INSIDE the jsonb snapshot, using
-- coalesce(new_values, old_values). A DELETE writes new_values=null with the
-- tuple only in old_values; filtering on new_values alone would silently drop
-- deletions — the single most important thing a verifier should see. coalesce
-- catches INSERT (new), UPDATE (new), and DELETE (old) uniformly, and does not
-- depend on the row still existing in the base table.
--   • disclosures: record_id = installation_id (Option B), period matched via
--     coalesce(new,old ->> reporting_period).
--   • processes: record_id = process id, so BOTH installation_id and
--     reporting_period are matched from coalesce(new,old ->> ...).
--
-- RETURN: { status, history } where history is a jsonb array of audit rows
-- (table_name, action, old_values, new_values, user_email, created_at) ordered
-- newest first — shaped for the verify page's diff renderer. No user_id, no
-- record_id, no company_id leak to the verifier.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

create or replace function public.cbam_verifier_audit_history(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant   public.cbam_verifier_access%rowtype;
  v_history jsonb;
begin
  -- Load a currently-valid grant (active, unexpired, not revoked).
  select *
    into v_grant
    from public.cbam_verifier_access
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
   limit 1;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Consent gate: no history before the verifier has accepted.
  if v_grant.accepted_at is null then
    return jsonb_build_object('status', 'consent_required');
  end if;

  -- Union the two audited tables, each scoped to the grant's tuple via the
  -- tuple carried in the snapshot (coalesce(new,old) => DELETE-safe). Only the
  -- fields the verify page renders are returned.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'table_name', a.table_name,
               'action',     a.action,
               'old_values', a.old_values,
               'new_values', a.new_values,
               'user_email', a.user_email,
               'created_at', a.created_at
             )
             order by a.created_at desc
           ),
           '[]'::jsonb
         )
    into v_history
    from public.audit_log a
   where (
           a.table_name = 'cbam_installation_disclosures'
           and a.record_id = v_grant.installation_id
           and coalesce(a.new_values->>'reporting_period', a.old_values->>'reporting_period')
               = v_grant.reporting_period::text
         )
      or (
           a.table_name = 'cbam_production_processes'
           and coalesce(a.new_values->>'installation_id', a.old_values->>'installation_id')
               = v_grant.installation_id::text
           and coalesce(a.new_values->>'reporting_period', a.old_values->>'reporting_period')
               = v_grant.reporting_period::text
         );

  return jsonb_build_object('status', 'valid', 'history', v_history);
end;
$$;

-- Lock down EXECUTE: remove PUBLIC default, grant only to the roles that call
-- it. anon (the unauthenticated verifier) is required; authenticated + service_role
-- for parity with the other verifier RPCs / the route's service-role client.
revoke all on function public.cbam_verifier_audit_history(uuid) from public;
grant execute on function public.cbam_verifier_audit_history(uuid) to anon, authenticated, service_role;
