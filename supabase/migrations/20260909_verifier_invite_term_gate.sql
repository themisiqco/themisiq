-- 20260909_verifier_invite_term_gate.sql
--
-- APPLIED 10 Sep 2026 via the Supabase SQL editor. Not applied by any
-- migration runner: this repo has no automated migration step, and the
-- 20260908_*_rls_initplan.sql files remain genuinely unrun.
--
-- Minting a verifier grant is a WRITE, and nothing withdrew it at term end.
-- Both verifier_access and cbam_verifier_access are governed by an owner-only RLS
-- policy that tests `customer_user_id = auth.uid()` and NOTHING ELSE — no term_end,
-- no entitlements read — and neither table carries a trigger. The client conditions
-- are advisory (see the ⚠️ ADVISORY, NOT ENFORCEMENT note in lib/useEntitlement.ts):
-- the GHG panel now tests `ghgAccess === 'active'`, but the CBAM panel is gated on
-- useEntitlementState's `isPaid`, which is TRUE for 'expired' by contract.
--
-- The consequence this closes: an expired customer opens an inventory they can no
-- longer edit, mints a fresh token, and that token then reads the inventory, its
-- workings and every evidence document for its own 90 days — get_verifier_inventory
-- and both document routes check the grant's own status/expiry/consent and never
-- look at entitlements.
--
-- ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
-- It does not touch any policy. It does not revoke or shorten grants already
-- minted: a token issued while the term was live keeps working until its own
-- expires_at. Withdrawing existing grants is a separate decision with a customer
-- consequence (a verifier mid-engagement loses access), and it is NOT taken here.
-- The expired message below is written on that basis and must stay true to it.

-- ── ONE FUNCTION, TWO TABLES ─────────────────────────────────────────────────
-- The logic is identical and only the module key differs, so the key is derived
-- from TG_TABLE_NAME rather than duplicated into two functions. Two copies of
-- three queries and two customer-facing sentences is two things to keep in step,
-- and the second copy is the one that drifts.
--
-- THE ELSE ARM RAISES RATHER THAN DEFAULTING. Attached to a third table by mistake,
-- a default key would either wave every insert through (if the key matched nothing
-- the customer holds, it would raise for everyone) or silently test the wrong
-- module. Failing loudly at attach time is the only outcome that cannot be missed.

begin;

-- ── PRE-FLIGHT: both tables must exist ───────────────────────────────────────
-- Aborts the whole transaction rather than attaching one trigger and skipping the
-- other, which would leave one path gated and one open with nothing saying so.
do $$
begin
  if to_regclass('public.verifier_access') is null then
    raise exception 'Pre-flight: public.verifier_access does not exist. Nothing attached.';
  end if;
  if to_regclass('public.cbam_verifier_access') is null then
    raise exception 'Pre-flight: public.cbam_verifier_access does not exist. Nothing attached.';
  end if;
end $$;

create or replace function public.enforce_verifier_invite_term()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
as $$
declare
  v_module     text;
  v_label      text;
  has_active   boolean;
  had_entitlement boolean;
begin
  -- Module key from the table this fired on. Keys are the canonical ModuleKey
  -- values in lib/pricing.ts; the label is what the customer reads.
  case tg_table_name
    when 'verifier_access'      then v_module := 'ghg';  v_label := 'GHG';
    when 'cbam_verifier_access' then v_module := 'cbam'; v_label := 'CBAM';
    else
      raise exception 'enforce_verifier_invite_term() is attached to an unexpected table (%). Attach it only to verifier_access or cbam_verifier_access.', tg_table_name;
  end case;

  -- An ACTIVE pass is required to MINT a grant. Strictly greater, matching
  -- enforce_ghg_location_allowance() and enforce_deals_free_tier_cap(): a term
  -- ending exactly now is over.
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.customer_user_id
      and e.module_key = v_module
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    -- The SAME query WITHOUT the term clause. The difference between the two is
    -- the whole point: it separates "expired" from "never bought", which is a
    -- distinction only the customer can act on. Told the wrong one, a lapsed
    -- customer is invited to buy something they already own.
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.customer_user_id
        and e.module_key = v_module
    ) into had_entitlement;

    if had_entitlement then
      -- READ VERBATIM inside "Could not create invitation: " — createInvite() does
      -- alert('Could not create invitation: ' + error.message) in both dashboards.
      -- SENTENCE TWO IS THE LOAD-BEARING ONE. A customer meeting this has a verifier
      -- mid-engagement, and their first question is whether the links they already
      -- sent have just died. They have not: this trigger is BEFORE INSERT only and
      -- nothing here touches an existing row. Do not remove that sentence, and do
      -- not let it become untrue — if grants are ever revoked at term end, this
      -- message must change in the same commit.
      raise exception 'Your % access has expired, so new verifier invitations are paused. Verifier links you have already sent are unaffected and keep working until they expire. Renew to invite another verifier.', v_label;
    else
      raise exception 'Inviting a verifier requires the % module.', v_label;
    end if;
  end if;

  return new;
end;
$$;

-- ── BEFORE INSERT ONLY, ON BOTH ──────────────────────────────────────────────
-- ⚠️ NOT "OR UPDATE", AND THAT IS THE POINT. Revocation is an UPDATE to status
-- (see createInvite's sibling `revoke` in both dashboards, and the grant posture in
-- 20260707: "revoke is an UPDATE to status, never a row delete"). An expired
-- customer must ALWAYS be able to revoke a grant — that is the one verifier action
-- expiry must never take away, and firing on UPDATE would take it away.
-- Contrast enforce_ghg_location_allowance(), which IS "insert or update" because it
-- caps a row's CONTENTS. This one caps whether a row may be CREATED.
drop trigger if exists trg_enforce_verifier_invite_term on public.verifier_access;
create trigger trg_enforce_verifier_invite_term
  before insert on public.verifier_access
  for each row execute function public.enforce_verifier_invite_term();

drop trigger if exists trg_enforce_verifier_invite_term on public.cbam_verifier_access;
create trigger trg_enforce_verifier_invite_term
  before insert on public.cbam_verifier_access
  for each row execute function public.enforce_verifier_invite_term();

-- ── POST-FLIGHT: assert both triggers exist, and are INSERT-only ─────────────
-- Asserting is cheaper than assuming, and a half-applied gate is worse than none:
-- it reads as covered while one path stays open.
do $$
declare v_n int;
begin
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and t.tgname = 'trg_enforce_verifier_invite_term'
     and not t.tgisinternal
     and c.relname in ('verifier_access', 'cbam_verifier_access');
  if v_n <> 2 then
    raise exception 'Post-flight: expected 2 triggers named trg_enforce_verifier_invite_term, found %.', v_n;
  end if;

  -- tgtype bit 2 (value 4) = INSERT, bit 4 (value 16) = UPDATE. UPDATE must be OFF
  -- on both, or revocation breaks for exactly the customers this protects.
  select count(*) into v_n
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and t.tgname = 'trg_enforce_verifier_invite_term'
     and not t.tgisinternal
     and c.relname in ('verifier_access', 'cbam_verifier_access')
     and (t.tgtype & 4) = 4
     and (t.tgtype & 16) = 0;
  if v_n <> 2 then
    raise exception 'Post-flight: both triggers must be INSERT-only; % of 2 are.', v_n;
  end if;

  raise notice 'Verifier invite term gate attached to verifier_access and cbam_verifier_access (BEFORE INSERT).';
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Both triggers, INSERT-only?
--    select c.relname, t.tgname, t.tgtype from pg_trigger t
--      join pg_class c on c.oid = t.tgrelid
--     where t.tgname = 'trg_enforce_verifier_invite_term' and not t.tgisinternal;
-- 2) Revocation still works for an expired customer? Update a grant's status to
--    'revoked' as that customer and confirm it succeeds — this is the behaviour the
--    INSERT-only choice exists to preserve, and it is the one worth checking by hand.
