-- 20260716_cbam_customer_parents.sql
-- CBAM per-customer input: parent tables (installations, production_processes).
-- RLS from the start with WITH CHECK (the company_id ownership fix the older modules lack).
-- Idempotent: create if not exists.

create table if not exists public.cbam_installations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  country     text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.cbam_production_processes (
  id             uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.cbam_installations(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  category_code  text not null references public.cbam_goods_categories(code),
  route_code     text,
  activity_level numeric not null check (activity_level > 0),
  reporting_period int not null check (reporting_period >= 2026),
  calc_mode      text not null default 'actual' check (calc_mode in ('actual','default','combined')),
  created_at     timestamptz not null default now()
);

alter table public.cbam_installations enable row level security;
alter table public.cbam_production_processes enable row level security;

create policy cbam_installations_owner on public.cbam_installations
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

create policy cbam_production_processes_owner on public.cbam_production_processes
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));
