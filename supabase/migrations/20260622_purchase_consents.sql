-- purchase_consents — per-order B2B capacity + digital-content withdrawal-waiver record
-- ---------------------------------------------------------------------------
-- Captures, at the moment of a self-serve checkout, the buyer's affirmations:
--   (1) purchasing on behalf of a business (not as a consumer), with authority to bind it,
--   (2) requesting immediate access + acknowledging cancellation/withdrawal rights may
--       cease once performance begins, and
--   (3) authority over any uploaded data + lawful, policy-compliant use of the Service.
-- Also captures purchaser_name (modal) plus best-effort server values purchaser_email
-- (authed user) and ip_address (x-forwarded-for). Those two are NULLABLE on purpose: a
-- missing best-effort capture must NEVER block the legally-critical consent-row write.
-- The three consent booleans + business_name/business_reg_number/purchaser_name are NOT NULL.
-- This is the queryable, owner-scoped mirror of the same facts also stamped onto
-- the Stripe charge metadata (the primary durable record). The webhook writes ONE
-- row per checkout session from the metadata it already reads, AFTER the
-- entitlements upsert; idempotent on stripe_session_id (re-delivered webhooks
-- upsert the same row).
--
-- Self-serve checkout only (admin-invoice sales are out of scope here; they agree
-- via invoice terms out-of-band and carry no consent metadata).
--
-- DEPLOY: hand-run in the Supabase SQL editor, then cp/keep this file in
-- supabase/migrations/. The app reads/writes nothing here until sub-step (v) code
-- ships, so this DDL is safe to run ahead of the code.
--
-- ⚠️ GRANT-GAP LESSON: a hand-run CREATE TABLE does NOT auto-grant table
-- privileges to the `authenticated` role. The GRANT block at the bottom is
-- MANDATORY — and an included GRANT line is NOT proof it ran. After running,
-- VERIFY with the query in the footer comment.

create table if not exists public.purchase_consents (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  stripe_session_id           text,                 -- cs_… ; idempotency key (unique below)
  payment_intent_id           text,                 -- pi_… ; reference
  business_name               text not null,
  business_reg_number         text not null,        -- company registration / VAT / Tax ID
  purchaser_name              text not null,        -- collected in the modal
  purchaser_email             text,                 -- best-effort server capture (authed user); NULLABLE
  ip_address                  text,                 -- best-effort server capture (x-forwarded-for); NULLABLE
  consent_business_capacity   boolean not null,     -- (1) B2B capacity + authority to bind
  consent_digital_access      boolean not null,     -- (2) immediate access + withdrawal rights may cease
  consent_data_authority      boolean not null,     -- (3) authority over uploaded data + lawful use
  consent_version             text not null,        -- e.g. '2026-06-v2-final' (which wording was agreed)
  created_at                  timestamptz not null default now()
);

-- One consent row per checkout session — makes the webhook upsert idempotent on
-- re-delivery. (Postgres allows multiple NULLs, so non-session paths never collide.)
create unique index if not exists purchase_consents_session_uniq
  on public.purchase_consents (stripe_session_id);

-- owner queries (a user reading their own consent history)
create index if not exists purchase_consents_user_idx
  on public.purchase_consents (user_id);

-- RLS: owner-only, explicit per-operation policies (supplier-portal precedent,
-- NOT the loose FOR ALL form). The webhook writes via the service-role client,
-- which BYPASSES RLS — so inserts succeed regardless; these policies govern the
-- browser/authenticated client (read-your-own).
alter table public.purchase_consents enable row level security;

drop policy if exists purchase_consents_select on public.purchase_consents;
create policy purchase_consents_select on public.purchase_consents
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists purchase_consents_insert on public.purchase_consents;
create policy purchase_consents_insert on public.purchase_consents
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists purchase_consents_update on public.purchase_consents;
create policy purchase_consents_update on public.purchase_consents
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists purchase_consents_delete on public.purchase_consents;
create policy purchase_consents_delete on public.purchase_consents
  for delete to authenticated using (auth.uid() = user_id);

-- MANDATORY grant block — hand-run CREATE TABLE skips these (confirmed gap on
-- scope3_inventories, companies, ghg_monthly_emissions).
grant select, insert, update, delete on table public.purchase_consents to authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the GRANT line) ──
-- 1) RLS on?
--    select relrowsecurity from pg_class where relname = 'purchase_consents';   -- expect: t
-- 2) Policies present (expect 4)?
--    select polname from pg_policy where polrelid = 'public.purchase_consents'::regclass;
-- 3) Grants to authenticated (expect SELECT/INSERT/UPDATE/DELETE rows)?
--    select privilege_type from information_schema.role_table_grants
--    where table_name = 'purchase_consents' and grantee = 'authenticated';
