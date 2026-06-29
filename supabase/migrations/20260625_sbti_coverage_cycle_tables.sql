-- supabase/migrations/20260625_sbti_coverage_cycle_tables.sql
-- Phase 1 (cont.): sbti_scope3_coverage + sbti_cycle. Company-scoped, RLS on, four owner policies each.
-- Re-runnable. Apply in Supabase AND keep this file (DB pieces don't auto-track).
--
-- Depends on 20260625_sbti_core_tables.sql: reuses the public.sbti_set_updated_at()
-- trigger function defined there (NOT redefined here). Apply that migration first.
--
-- sbti_cycle is SINGLE-CURRENT-CYCLE per company (PK = company_id): one row holds the
-- in-flight V2.0 accountability cycle. Cycle HISTORY (prior cycles, audit of renewals)
-- is deferred to Phase 4 — at which point a history table keyed on (company_id, cycle_start)
-- supersedes this, and this row becomes the "current" pointer.

-- ── sbti_scope3_coverage ───────────────────────────────────────────────
-- Derived snapshot, refreshed from the Scope 3 module. One row per (company, S3 category);
-- composite PK enables idempotent upsert on refresh. company_id is the identity key;
-- user_id is denormalized for the RLS ownership gate (mirrors sbti_targets).
create table if not exists public.sbti_scope3_coverage (
  company_id               uuid not null references public.companies(id) on delete cascade,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  s3_category              integer not null check (s3_category between 1 and 14),
  category_emissions_tco2e numeric,
  pct_of_total_s3          numeric,
  target_required          boolean not null default false,             -- ≥5% of total S3 (workplan §1)
  has_target               boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  primary key (company_id, s3_category)
);

-- ── sbti_cycle ─────────────────────────────────────────────────────────
-- Single current V2.0 accountability cycle per company (PK = company_id). History → Phase 4.
create table if not exists public.sbti_cycle (
  company_id                uuid primary key references public.companies(id) on delete cascade,
  user_id                   uuid not null references auth.users(id) on delete cascade,
  cycle_start               date,
  cycle_end                 date,
  last_assessment_date      date,
  renewal_due               date,
  performance_status        text check (performance_status is null
                              or performance_status in ('on_track','off_track','best_efforts')),
  transition_plan_due       date,
  transition_plan_published boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ── indexes ────────────────────────────────────────────────────────────
create index if not exists sbti_scope3_coverage_user_id_idx on public.sbti_scope3_coverage (user_id);
create index if not exists sbti_cycle_user_id_idx           on public.sbti_cycle (user_id);

-- ── updated_at maintenance (reuses sbti_set_updated_at() from migration 1) ──
drop trigger if exists sbti_scope3_coverage_set_updated_at on public.sbti_scope3_coverage;
create trigger sbti_scope3_coverage_set_updated_at
  before update on public.sbti_scope3_coverage
  for each row execute function public.sbti_set_updated_at();

drop trigger if exists sbti_cycle_set_updated_at on public.sbti_cycle;
create trigger sbti_cycle_set_updated_at
  before update on public.sbti_cycle
  for each row execute function public.sbti_set_updated_at();

-- ── RLS: authenticated-owner, four explicit policies per table (house pattern) ──
alter table public.sbti_scope3_coverage enable row level security;
alter table public.sbti_cycle           enable row level security;

drop policy if exists sbti_scope3_coverage_select on public.sbti_scope3_coverage;
drop policy if exists sbti_scope3_coverage_insert on public.sbti_scope3_coverage;
drop policy if exists sbti_scope3_coverage_update on public.sbti_scope3_coverage;
drop policy if exists sbti_scope3_coverage_delete on public.sbti_scope3_coverage;
create policy sbti_scope3_coverage_select on public.sbti_scope3_coverage
  for select to authenticated using (auth.uid() = user_id);
create policy sbti_scope3_coverage_insert on public.sbti_scope3_coverage
  for insert to authenticated with check (auth.uid() = user_id);
create policy sbti_scope3_coverage_update on public.sbti_scope3_coverage
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sbti_scope3_coverage_delete on public.sbti_scope3_coverage
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists sbti_cycle_select on public.sbti_cycle;
drop policy if exists sbti_cycle_insert on public.sbti_cycle;
drop policy if exists sbti_cycle_update on public.sbti_cycle;
drop policy if exists sbti_cycle_delete on public.sbti_cycle;
create policy sbti_cycle_select on public.sbti_cycle
  for select to authenticated using (auth.uid() = user_id);
create policy sbti_cycle_insert on public.sbti_cycle
  for insert to authenticated with check (auth.uid() = user_id);
create policy sbti_cycle_update on public.sbti_cycle
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sbti_cycle_delete on public.sbti_cycle
  for delete to authenticated using (auth.uid() = user_id);

-- ── GRANT (MANDATORY — hand-run CREATE TABLE does NOT auto-grant; the 42501 trap) ──
grant select, insert, update, delete on table public.sbti_scope3_coverage to authenticated;
grant select, insert, update, delete on table public.sbti_cycle           to authenticated;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the GRANT line) ──
-- 1) RLS on for both tables?
--    select relname, relrowsecurity from pg_class
--    where relname in ('sbti_scope3_coverage','sbti_cycle');             -- expect: t for both
-- 2) Policies present (expect 4 per table)?
--    select polrelid::regclass as tbl, polname from pg_policy
--    where polrelid in ('public.sbti_scope3_coverage'::regclass, 'public.sbti_cycle'::regclass);
-- 3) Grants to authenticated (expect SELECT/INSERT/UPDATE/DELETE per table)?
--    select table_name, privilege_type from information_schema.role_table_grants
--    where table_name in ('sbti_scope3_coverage','sbti_cycle') and grantee = 'authenticated';
