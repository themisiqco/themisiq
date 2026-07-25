-- CBAM verifier portal — Step 1 of 5: cbam_verifier_access
--
-- Grant grain: (installation_id, reporting_period) — CBAM has no single
-- "report row"; the report is assembled on the fly from five tables. This
-- mirrors the grain of cbam_installation_disclosures and the completeness
-- attestation.
--
-- Ownership: customer_user_id = auth.uid(), copied verbatim from GHG
-- verifier_access. The grant belongs to the user who created it; company_id
-- is carried ONLY to satisfy the composite FK to cbam_installations.
--
-- HARD WALL: this table is CBAM-scoped. A CBAM verifier grant must never
-- reach GHG evidence. Nothing here references ghg_inventories.

create table if not exists public.cbam_verifier_access (
  id                   uuid        not null default gen_random_uuid(),
  token                uuid        not null default gen_random_uuid(),
  installation_id      uuid        not null,
  company_id           uuid        not null,
  reporting_period     int         not null,
  customer_user_id     uuid        not null,
  verifier_email       text,
  verifier_name        text,
  status               text        not null default 'active',
  expires_at           timestamptz not null default (now() + interval '90 days'),
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz,
  -- consent columns (mirrors GHG 20260707 consent ALTER)
  accepted_at          timestamptz,
  tos_accepted_at      timestamptz,
  privacy_accepted_at  timestamptz,
  consent_version      text,
  constraint cbam_verifier_access_pkey primary key (id),
  constraint cbam_verifier_access_token_key unique (token),
  -- composite FK to the existing UNIQUE(id, company_id) on cbam_installations
  -- (the same constraint cbam_installation_disclosures already relies on)
  constraint cbam_verifier_access_installation_fk
    foreign key (installation_id, company_id)
    references public.cbam_installations (id, company_id) on delete cascade,
  constraint cbam_verifier_access_period_chk
    check (reporting_period >= 2026)
);

-- RLS: owner-only, keyed on the creating user (mirrors verifier_access_owner)
alter table public.cbam_verifier_access enable row level security;

drop policy if exists cbam_verifier_access_owner on public.cbam_verifier_access;
create policy cbam_verifier_access_owner
  on public.cbam_verifier_access
  for all
  to authenticated
  using (customer_user_id = auth.uid())
  with check (customer_user_id = auth.uid());

-- Grants — explicit, because a hand-run CREATE TABLE does not auto-grant.
-- Posture copied from verifier_access: authenticated may SELECT/INSERT/UPDATE
-- (revoke is a status UPDATE, never a DELETE); service_role = ALL; anon reaches
-- data ONLY through the SECURITY DEFINER RPCs in step 2/3, never directly.
grant select, insert, update on public.cbam_verifier_access to authenticated;
grant all on public.cbam_verifier_access to service_role;
-- anon: intentionally no grant.

-- Index for token lookups by the (future) RPCs
create index if not exists cbam_verifier_access_token_idx
  on public.cbam_verifier_access (token);
