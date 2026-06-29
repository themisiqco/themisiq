-- supabase/migrations/20260625_sbti_core_tables.sql
-- Phase 1: sbti_company_profile + sbti_targets. Company-scoped, RLS on, four owner policies.
-- Re-runnable. Apply in Supabase AND keep this file (DB pieces don't auto-track).

-- ── sbti_company_profile ───────────────────────────────────────────────
-- One SBTi profile per COMPANY (not per user). company_id is the identity key;
-- user_id is denormalized for the RLS ownership gate (mirrors ghg_monthly_emissions).
create table if not exists public.sbti_company_profile (
  company_id             uuid primary key references public.companies(id) on delete cascade,
  user_id                uuid not null references auth.users(id) on delete cascade,
  annual_revenue         numeric,
  employee_count         integer,
  total_emissions_tco2e  numeric,
  elec_demand_growth_pct numeric,
  category               text,                                        -- 'A'|'B' today; NO check constraint (§12.1 UNVERIFIED, possible Cat C)
  category_basis         text,                                        -- which threshold triggered A
  oer_intent             text not null default 'undeclared'
                           check (oer_intent in ('participate','decline','undeclared')),
  net_zero_target_year   integer check (net_zero_target_year is null
                           or net_zero_target_year between 1990 and 2100),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ── sbti_targets ───────────────────────────────────────────────────────
create table if not exists public.sbti_targets (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  standard_version         text not null check (standard_version in ('v1_3_1','v2_0')),
  target_type              text not null check (target_type in ('near_term','net_zero','renewal')),
  scope                    text not null check (scope in ('s1','s2_location','s3','s1s2_combined')),
  s3_category              integer check (s3_category is null or s3_category between 1 and 14),
  method                   text not null check (method in ('absolute_aca','intensity')),
  base_year                integer check (base_year between 1990 and 2100),
  base_year_emissions_tco2e numeric,
  target_year              integer check (target_year between 1990 and 2100),
  reduction_pct            numeric check (reduction_pct is null
                             or (reduction_pct >= 0 and reduction_pct <= 100)),
  ambition                 text not null default '1.5C' check (ambition in ('1.5C')),
  status                   text not null default 'draft'
                             check (status in ('draft','committed','submitted','validated','expired','renewing')),
  coverage_pct             numeric,
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  -- combined S1+S2 is a V1.3.1-only construct (workplan §1); DB-level defense-in-depth
  constraint sbti_targets_combined_v1_only
    check (scope <> 's1s2_combined' or standard_version = 'v1_3_1'),
  -- s3_category populated only for Scope 3 targets; drafts may leave it null
  constraint sbti_targets_s3_category_scope
    check (scope = 's3' or s3_category is null)
);

create index if not exists sbti_targets_company_id_idx on public.sbti_targets (company_id);
create index if not exists sbti_targets_user_id_idx     on public.sbti_targets (user_id);

-- ── updated_at maintenance ─────────────────────────────────────────────
create or replace function public.sbti_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists sbti_company_profile_set_updated_at on public.sbti_company_profile;
create trigger sbti_company_profile_set_updated_at
  before update on public.sbti_company_profile
  for each row execute function public.sbti_set_updated_at();

drop trigger if exists sbti_targets_set_updated_at on public.sbti_targets;
create trigger sbti_targets_set_updated_at
  before update on public.sbti_targets
  for each row execute function public.sbti_set_updated_at();

-- ── RLS: authenticated-owner, four explicit policies (house pattern) ────
alter table public.sbti_company_profile enable row level security;
alter table public.sbti_targets         enable row level security;

drop policy if exists sbti_company_profile_select on public.sbti_company_profile;
drop policy if exists sbti_company_profile_insert on public.sbti_company_profile;
drop policy if exists sbti_company_profile_update on public.sbti_company_profile;
drop policy if exists sbti_company_profile_delete on public.sbti_company_profile;
create policy sbti_company_profile_select on public.sbti_company_profile
  for select to authenticated using (auth.uid() = user_id);
create policy sbti_company_profile_insert on public.sbti_company_profile
  for insert to authenticated with check (auth.uid() = user_id);
create policy sbti_company_profile_update on public.sbti_company_profile
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sbti_company_profile_delete on public.sbti_company_profile
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists sbti_targets_select on public.sbti_targets;
drop policy if exists sbti_targets_insert on public.sbti_targets;
drop policy if exists sbti_targets_update on public.sbti_targets;
drop policy if exists sbti_targets_delete on public.sbti_targets;
create policy sbti_targets_select on public.sbti_targets
  for select to authenticated using (auth.uid() = user_id);
create policy sbti_targets_insert on public.sbti_targets
  for insert to authenticated with check (auth.uid() = user_id);
create policy sbti_targets_update on public.sbti_targets
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sbti_targets_delete on public.sbti_targets
  for delete to authenticated using (auth.uid() = user_id);

-- ── GRANT (MANDATORY — hand-run CREATE TABLE does NOT auto-grant; the 42501 trap) ──
grant select, insert, update, delete on table public.sbti_company_profile to authenticated;
grant select, insert, update, delete on table public.sbti_targets         to authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the GRANT line) ──
-- 1) RLS on for both tables?
--    select relname, relrowsecurity from pg_class
--    where relname in ('sbti_company_profile','sbti_targets');            -- expect: t for both
-- 2) Policies present (expect 4 per table)?
--    select polrelid::regclass as tbl, polname from pg_policy
--    where polrelid in ('public.sbti_company_profile'::regclass, 'public.sbti_targets'::regclass);
-- 3) Grants to authenticated (expect SELECT/INSERT/UPDATE/DELETE per table)?
--    select table_name, privilege_type from information_schema.role_table_grants
--    where table_name in ('sbti_company_profile','sbti_targets') and grantee = 'authenticated';
