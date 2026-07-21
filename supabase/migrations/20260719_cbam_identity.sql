-- 20260719_cbam_identity.sql
-- Implements Annex IV §1.2 item (1) "Identification of the operator and the installation" and
-- item (2) "The installation under verification", from docs/cbam-annex-iv-verbatim.md.
--
-- cbam_operator_profile is MODULE-SCOPED — it mirrors the sbti_company_profile pattern (a per-module
-- profile keyed 1:1 on companies) rather than adding CBAM columns to the shared `companies` table.
-- companies is depended on by every other module; widening it for one module's regulatory fields
-- would couple them all and risk a CBAM change rippling into unrelated surfaces. The profile hangs
-- off companies by FK instead, so CBAM identity data lives and dies with the CBAM module.
--
-- ALL FIELDS ARE NULLABLE BY DESIGN. Intake is progressive: a customer must be able to save an
-- installation before they have, say, looked up their UN/LOCODE. Completeness for a submittable
-- report is therefore enforced by the REPORT BUILDER at report time, NOT by NOT NULL constraints
-- here — the schema's job is to store partial progress, the builder's job is to refuse an
-- incomplete report. Do not add NOT NULL to these columns to "fix" completeness; that moves the
-- gate to the wrong layer and blocks saving.
--
-- Addresses must be captured IN ENGLISH — Article 10(4): "The operator's emissions report shall be
-- submitted in English." This applies to both the operator address (§1.2 (1)(c) "full address in
-- English") and the installation address (§1.2 (2)(d) "full address in English").
--
-- latitude/longitude are the coordinates of the installation's MAIN EMISSION SOURCE (§1.2 (2)(e)),
-- NOT the site centroid and NOT the postal address. A verifier can cross-check these against the
-- named source, so they must not be silently backfilled from the address.
--
-- un_locode carries NO format CHECK. UN/LOCODE has a canonical shape, but a too-strict regex would
-- reject valid or newly-issued codes and block saving — the opposite of the progressive-intake
-- goal. Under-constrain and let the report builder validate, rather than reject valid input here.
--
-- STRUCTURAL ASSUMPTION: this models operator = the customer's company, 1:1 with companies
-- (cbam_operator_profile.company_id is both PK and FK). A consultant filing on behalf of MULTIPLE
-- distinct operators cannot be represented — that would require a first-class operator entity with
-- installations hanging off it, not off the company. Revisit if multi-operator filing is needed.
--
-- No claim is made here about deployment state.

-- Operator identity — §1.2 item (1) "Identification of the operator".
create table if not exists public.cbam_operator_profile (
  company_id      uuid primary key references public.companies(id) on delete cascade,
  operator_name   text,              -- (1)(a) name of the operator
  registration_no text,              -- (1)(b) corporate or activity registration number of the operator
  address_line1   text,              -- (1)(c) full address in English (Article 10(4))
  address_line2   text,              -- (1)(c) full address in English (cont.)
  city            text,              -- (1)(c)
  postcode        text,              -- (1)(c)
  country         text,              -- (1)(c)
  updated_at      timestamptz not null default now()
);

alter table public.cbam_operator_profile enable row level security;

-- create policy has no IF NOT EXISTS ("policy already exists" on replay), so guard on pg_policies.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_operator_profile'
      and policyname = 'cbam_operator_profile_owner'
  ) then
    create policy cbam_operator_profile_owner on public.cbam_operator_profile
      using      (company_id in (select id from public.companies where user_id = auth.uid()))
      with check (company_id in (select id from public.companies where user_id = auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on public.cbam_operator_profile to authenticated;

-- Installation identity — §1.2 item (2) "The installation under verification".
-- (2)(a) name of the installation is the EXISTING cbam_installations.name column — not re-added here.
alter table public.cbam_installations
  add column if not exists cbam_registry_id text,   -- (2)(b) unique installation identifier in the CBAM Registry
  add column if not exists un_locode        text,   -- (2)(c) UN/LOCODE of the location (no format CHECK — see header)
  add column if not exists address_line1    text,   -- (2)(d) full address in English (Article 10(4))
  add column if not exists address_line2    text,   -- (2)(d) full address in English (cont.)
  add column if not exists city             text,   -- (2)(d)
  add column if not exists postcode         text,   -- (2)(d)
  add column if not exists latitude         numeric check (latitude  is null or (latitude  >= -90  and latitude  <= 90)),   -- (2)(e) main emission source
  add column if not exists longitude        numeric check (longitude is null or (longitude >= -180 and longitude <= 180));  -- (2)(e) main emission source
