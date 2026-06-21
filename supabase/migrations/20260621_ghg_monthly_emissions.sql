-- ghg_monthly_emissions — per-bill / per-month emissions slices (concierge-first)
-- ---------------------------------------------------------------------------
-- ADDITIVE layer. The annual ghg_inventories row remains the source of truth and
-- is never modified by this feature. These rows are recompute-and-replaced on
-- every save (delete-by-inventory_id then bulk insert) so re-saving never
-- accumulates duplicates. Only confirmed concierge bills with valid dates +
-- units produce rows; manual annual entries produce none (monthly view is
-- inherently partial and must be surfaced as such in the UI).
--
-- Hand-run in the Supabase SQL editor, then cp into supabase/migrations/.
-- REMEMBER: hand-run CREATE TABLE skips the `authenticated` row grants — the
-- GRANT block at the bottom is mandatory (confirmed gap on scope3_inventories
-- AND companies).

create table if not exists public.ghg_monthly_emissions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  inventory_id    uuid not null references public.ghg_inventories(id) on delete cascade,
  company_id      uuid references public.companies(id) on delete set null,
  reporting_year  int  not null,
  period_month    date not null,                 -- first-of-month bucket, e.g. 2025-03-01
  scope           smallint not null check (scope in (1, 2)),
  location_name   text,
  fuel_type       text not null,                 -- e.g. natural_gas, electricity
  activity_value  numeric,                       -- prorated activity in canonical unit
  activity_unit   text,
  tco2e           numeric not null,              -- computed emissions for this month-slice
  gwp_version     text not null default 'AR6',
  ef_source       text,                          -- factor provenance (verifier-facing)
  source_doc_id   text,                          -- the bill this slice came from (traceability)
  period_start    date,                          -- raw bill dates (verifier transparency)
  period_end      date,
  pct_in_month    numeric,                       -- allocation fraction for straddle bills
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- indexes: the series/view groups by inventory and buckets by month
create index if not exists ghg_monthly_emissions_inventory_idx
  on public.ghg_monthly_emissions (inventory_id);
create index if not exists ghg_monthly_emissions_company_year_idx
  on public.ghg_monthly_emissions (company_id, reporting_year);
create index if not exists ghg_monthly_emissions_month_idx
  on public.ghg_monthly_emissions (inventory_id, period_month);

-- RLS: owner-only, explicit per-operation policies (supplier-portal precedent,
-- NOT the loose FOR ALL form)
alter table public.ghg_monthly_emissions enable row level security;

create policy ghg_monthly_emissions_select on public.ghg_monthly_emissions
  for select to authenticated using (auth.uid() = user_id);
create policy ghg_monthly_emissions_insert on public.ghg_monthly_emissions
  for insert to authenticated with check (auth.uid() = user_id);
create policy ghg_monthly_emissions_update on public.ghg_monthly_emissions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy ghg_monthly_emissions_delete on public.ghg_monthly_emissions
  for delete to authenticated using (auth.uid() = user_id);

-- MANDATORY grant block — hand-run CREATE TABLE skips these (confirmed gap)
grant select, insert, update, delete on table public.ghg_monthly_emissions to authenticated;
