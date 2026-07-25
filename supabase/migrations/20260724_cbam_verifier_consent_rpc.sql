-- cbam_verifier_accept_invite — token-scoped verifier-consent write RPC
-- ---------------------------------------------------------------------------
-- CBAM verifier portal — Step 2 of 5. Ported verbatim from
-- verifier_accept_invite (20260707_verifier_consent_rpc.sql); the ONLY change
-- is the target table: public.verifier_access -> public.cbam_verifier_access.
-- Behaviour, guards, hardening, and return contract are identical.
--
-- WHAT THIS IS: the SOLE write path for verifier ToS/Privacy consent onto
-- public.cbam_verifier_access (columns accepted_at, tos_accepted_at,
-- privacy_accepted_at, consent_version, verifier_email).
--
-- WHY SECURITY DEFINER: the verifier who accepts an invite is UNAUTHENTICATED
-- (the `anon` role), and anon has ZERO DML on cbam_verifier_access — it cannot
-- read or write the table directly, and there is deliberately no anon RLS
-- policy. This function runs as its owner so it can perform the one specific
-- update, while exposing nothing else: tightly scoped to a single row matched
-- by token, touches only the consent columns, and returns a STATUS ONLY —
-- never any table data (no installation, no customer_user_id, no verifier
-- identity read-back).
--
-- HARD WALL: this RPC only ever touches public.cbam_verifier_access. A CBAM
-- verifier's consent path is fully separate from the GHG verifier_access path.
--
-- GUARD / PRESERVE SEMANTICS (identical to GHG original):
--   • valid row = token match AND status='active' AND expires_at>now()
--                 AND revoked_at is null.
--   • First acceptance: on a valid, not-yet-accepted row, stamp accepted_at,
--     tos_accepted_at, privacy_accepted_at = now(), consent_version.
--     verifier_email is coalesced — an email the inviter already entered is
--     PRESERVED; p_email only fills it when the existing value is null.
--   • Re-acceptance preserves the original: guarded by `accepted_at is null`,
--     an already-accepted row is NEVER overwritten and returns 'already_accepted'.
--   • Invalid (not found / revoked / expired) returns 'invalid' without leaking
--     which condition failed.
--
-- HARDENING: security definer + `set search_path = ''`; all objects
-- schema-qualified. Single scoped UPDATE; status derived from row_count, then a
-- validity existence-check distinguishes already-accepted from invalid.
-- EXECUTE revoked from PUBLIC, granted only to anon + authenticated.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

begin;

create or replace function public.cbam_verifier_accept_invite(
  p_token           uuid,
  p_email           text,
  p_consent_version text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
  v_valid   boolean;
begin
  -- First acceptance: scoped single-row write, guarded so a previously-accepted
  -- row is never overwritten (accepted_at is null) and only valid rows are hit.
  update public.cbam_verifier_access
     set accepted_at         = now(),
         tos_accepted_at     = now(),
         privacy_accepted_at = now(),
         consent_version     = p_consent_version,
         verifier_email      = coalesce(public.cbam_verifier_access.verifier_email, p_email)
   where token       = p_token
     and status      = 'active'
     and expires_at  > now()
     and revoked_at is null
     and accepted_at is null;

  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    return jsonb_build_object('status', 'accepted');
  end if;

  -- No write happened. Distinguish an already-accepted (still-valid) row from a
  -- genuinely invalid one (not found / revoked / expired) without leaking which.
  select exists (
    select 1
      from public.cbam_verifier_access
     where token       = p_token
       and status      = 'active'
       and expires_at  > now()
       and revoked_at is null
       and accepted_at is not null
  ) into v_valid;

  if v_valid then
    return jsonb_build_object('status', 'already_accepted');
  end if;

  return jsonb_build_object('status', 'invalid');
end;
$$;

-- Lock down EXECUTE: PUBLIC gets execute by default on new functions — remove it,
-- then grant only to the two roles that legitimately call this. anon is required
-- (the verifier is unauthenticated); authenticated is allowed for parity.
revoke all on function public.cbam_verifier_accept_invite(uuid, text, text) from public;
grant execute on function public.cbam_verifier_accept_invite(uuid, text, text) to anon, authenticated;

commit;
