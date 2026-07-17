-- 20260717_cbam_customer_leaves.sql
-- CBAM per-customer leaf tables (source_streams, precursor_inputs, see_records)
-- mapping to engine types SourceStream / PrecursorInput / SEEResult.
-- RLS + WITH CHECK ownership, plus integrity constraints:
--   * composite FK (process_id, company_id) -> cbam_production_processes(id, company_id),
--     so a leaf cannot point at a process owned by a different company;
--   * cbam_precursor_verified_needs_report: an 'actual_verified' precursor must carry a report id.
-- Constraints are folded inline so a fresh build produces the hardened tables in one pass.
-- Idempotent: create if not exists; the parent-table constraint is guarded in a DO block.

-- The composite FK below targets (id, company_id) on the parent, which needs a UNIQUE constraint
-- on exactly those two columns (the PK on id alone does not satisfy a two-column FK reference).
-- The parent lives in a prior migration, so add the constraint here. Postgres has no
-- ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS, so guard on pg_constraint for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_pp_id_company_uniq'
  ) then
    alter table public.cbam_production_processes
      add constraint cbam_pp_id_company_uniq unique (id, company_id);
  end if;
end $$;

create table if not exists public.cbam_source_streams (
  id             uuid primary key default gen_random_uuid(),
  process_id     uuid not null,
  company_id     uuid not null references public.companies(id) on delete cascade,
  name           text not null,
  stream_kind    text not null check (stream_kind in ('fuel','process_material','output')),
  activity_data  numeric not null,
  cc_mode        text not null check (cc_mode in ('direct','ef_per_t','ef_per_tj')),
  carbon_content numeric,
  emission_factor numeric,
  ncv            numeric,
  biomass_fraction numeric not null default 0 check (biomass_fraction >= 0 and biomass_fraction <= 1),
  source_doc_id  uuid,
  created_at     timestamptz not null default now(),
  constraint cbam_source_streams_process_company_fk
    foreign key (process_id, company_id)
    references public.cbam_production_processes (id, company_id) on delete cascade
);

create table if not exists public.cbam_precursor_inputs (
  id             uuid primary key default gen_random_uuid(),
  process_id     uuid not null,
  company_id     uuid not null references public.companies(id) on delete cascade,
  precursor_cn_code text not null,
  precursor_category_code text not null references public.cbam_goods_categories(code),
  mass_consumed  numeric not null check (mass_consumed >= 0),
  boundary       text not null check (boundary in ('joint','separate_internal','external')),
  provenance     text not null check (provenance in ('computed_here','actual_verified','default')),
  origin_country text not null,
  see_value      numeric,
  verifier_report_id text,
  reporting_period int not null,
  created_at     timestamptz not null default now(),
  constraint cbam_precursor_verified_needs_report
    check (provenance <> 'actual_verified' or verifier_report_id is not null),
  constraint cbam_precursor_inputs_process_company_fk
    foreign key (process_id, company_id)
    references public.cbam_production_processes (id, company_id) on delete cascade
);

create table if not exists public.cbam_see_records (
  id             uuid primary key default gen_random_uuid(),
  process_id     uuid not null,
  company_id     uuid not null references public.companies(id) on delete cascade,
  cn_code        text not null,
  see_total      numeric not null,
  ae_g           numeric not null,
  precursor_contribution numeric not null,
  default_compared numeric,
  delta_vs_default numeric,
  workings       jsonb not null,
  unresolved     jsonb not null default '[]',
  computed_at    timestamptz not null default now(),
  constraint cbam_see_records_process_company_fk
    foreign key (process_id, company_id)
    references public.cbam_production_processes (id, company_id) on delete cascade
);

alter table public.cbam_source_streams   enable row level security;
alter table public.cbam_precursor_inputs  enable row level security;
alter table public.cbam_see_records        enable row level security;

create policy cbam_source_streams_owner on public.cbam_source_streams
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

create policy cbam_precursor_inputs_owner on public.cbam_precursor_inputs
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));

create policy cbam_see_records_owner on public.cbam_see_records
  using      (company_id in (select id from public.companies where user_id = auth.uid()))
  with check (company_id in (select id from public.companies where user_id = auth.uid()));
