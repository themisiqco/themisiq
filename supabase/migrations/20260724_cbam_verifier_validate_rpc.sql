-- cbam_verifier_validate_token — token-scoped verifier read/validation RPC
-- ---------------------------------------------------------------------------
-- CBAM verifier portal — Step 3 of 5. Fork-2 read path: this RPC does NOT
-- assemble the report. It validates the grant + consent and returns the tuple
-- (installation_id, company_id, reporting_period) that the documents/report
-- route will use to run the single-source report assembly under service role.
--
-- WHY SECURITY DEFINER: the verifier is UNAUTHENTICATED (anon), which has ZERO
-- direct grant on cbam_verifier_access. This function runs as owner so anon can
-- validate a token without any direct table access — mirroring the consent RPC.
--
-- HARD WALL: reads only cbam_verifier_access + cbam_installations.name for
-- display context. Returns NO SEE figures, NO emissions data, NO GHG data.
-- The report itself is assembled downstream (step 4), scoped to the returned
-- tuple. This RPC never touches ghg_inventories or any GHG object.
--
-- CONSENT ENFORCED AT THE DATA LAYER (defense-in-depth): the sensitive tuple
-- (installation_id, company_id) is returned ONLY in the 'valid' state, which
-- requires accepted_at is not null. Before consent, status is 'consent_required'
-- and only non-sensitive display context (verifier_name, installation_name,
-- reporting_period) is returned — enough to render the consent screen, nothing
-- more. This mirrors the /api/verifier-documents hard-gate posture.
--
-- THREE-STATE RETURN:
--   • 'invalid'          — token not found / revoked / expired / inactive.
--                          No context leaked (doesn't say which condition failed).
--   • 'consent_required' — valid grant, accepted_at is null. Returns
--                          verifier_name, installation_name, reporting_period.
--   • 'valid'            — valid grant, accepted_at is not null. Returns the
--                          above PLUS installation_id, company_id (the scope tuple).
--
-- HARDENING: security definer + `set search_path = ''`; all objects
-- schema-qualified. Read-only (no DML). EXECUTE revoked from PUBLIC, granted
-- only to anon + authenticated.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

begin;

create or replace function public.cbam_verifier_validate_token(
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant   public.cbam_verifier_access%rowtype;
  v_inst_name text;
begin
  -- Load the grant only if it is currently valid (active, unexpired, not revoked).
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

  -- Display context — installation name. Non-sensitive; safe in both
  -- consent_required and valid states. Scoped to the grant's own installation.
  select i.name
    into v_inst_name
    from public.cbam_installations i
   where i.id = v_grant.installation_id
     and i.company_id = v_grant.company_id
   limit 1;

  -- Not yet consented → return display context only, withhold the scope tuple.
  if v_grant.accepted_at is null then
    return jsonb_build_object(
      'status',            'consent_required',
      'verifier_name',     v_grant.verifier_name,
      'installation_name', v_inst_name,
      'reporting_period',  v_grant.reporting_period
    );
  end if;

  -- Consented → return display context PLUS the scope tuple for the route.
  return jsonb_build_object(
    'status',            'valid',
    'verifier_name',     v_grant.verifier_name,
    'installation_name', v_inst_name,
    'reporting_period',  v_grant.reporting_period,
    'installation_id',   v_grant.installation_id,
    'company_id',        v_grant.company_id
  );
end;
$$;

-- Lock down EXECUTE: remove PUBLIC's default execute, grant only to the two
-- roles that legitimately call this. anon is required (verifier is
-- unauthenticated); authenticated allowed for parity.
revoke all on function public.cbam_verifier_validate_token(uuid) from public;
grant execute on function public.cbam_verifier_validate_token(uuid) to anon, authenticated;

commit;
