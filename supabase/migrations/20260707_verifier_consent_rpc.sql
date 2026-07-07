-- verifier_accept_invite — token-scoped verifier-consent write RPC
-- ---------------------------------------------------------------------------
-- WHAT THIS IS: the SOLE write path for verifier ToS/Privacy consent onto
-- public.verifier_access (columns accepted_at, tos_accepted_at,
-- privacy_accepted_at, consent_version, verifier_email).
--
-- WHY SECURITY DEFINER: the verifier who accepts an invite is UNAUTHENTICATED
-- (the `anon` role), and anon has ZERO DML on verifier_access — it cannot read
-- or write the table directly, and there is deliberately no anon RLS policy.
-- This function runs as its owner so it can perform the one specific update,
-- while exposing nothing else: it is tightly scoped to a single row matched by
-- token, touches only the consent columns, and returns a STATUS ONLY — never any
-- table data (no inventory, no customer_user_id, no verifier identity read-back).
--
-- GUARD / PRESERVE SEMANTICS (confirmed defaults):
--   • valid row = token match AND status='active' AND expires_at>now()
--                 AND revoked_at is null.
--   • First acceptance: on a valid, not-yet-accepted row, stamp accepted_at,
--     tos_accepted_at, privacy_accepted_at = now(), consent_version = p_consent_version.
--     verifier_email is coalesced — an email the inviter already entered on the
--     grant is PRESERVED; p_email only fills it when the existing value is null.
--     Exactly one row, only those columns.
--   • Re-acceptance preserves the original: the write is guarded by
--     `accepted_at is null`, so a row that was already accepted is NEVER
--     overwritten — the original consent timestamps/version stay intact and the
--     call returns 'already_accepted'.
--   • Invalid (not found / revoked / expired) returns 'invalid' without leaking
--     which condition failed.
--
-- HARDENING: security definer + `set search_path = ''` (search-path hijack
-- defense; all objects schema-qualified as public.verifier_access). The write is
-- a single scoped UPDATE (never a broad update); return status is derived from
-- whether that UPDATE hit a row, then a validity existence-check to tell
-- already-accepted from invalid. EXECUTE is revoked from PUBLIC and granted only
-- to anon + authenticated.
--
-- This migration does NOT touch verifier_access RLS/grants (already set in the
-- baseline migration) and adds NO anon table policy.
--
-- DEPLOY: do NOT auto-run. Lisa hand-runs in the Supabase SQL editor after review.

begin;

create or replace function public.verifier_accept_invite(
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
  update public.verifier_access
     set accepted_at         = now(),
         tos_accepted_at     = now(),
         privacy_accepted_at = now(),
         consent_version     = p_consent_version,
         verifier_email      = coalesce(public.verifier_access.verifier_email, p_email)
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
      from public.verifier_access
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
revoke all on function public.verifier_accept_invite(uuid, text, text) from public;
grant execute on function public.verifier_accept_invite(uuid, text, text) to anon, authenticated;

commit;
