-- 20260719_cbam_disclosures.sql
-- Implements Annex IV §1.2 items (7)-(11) from docs/cbam-annex-iv-verbatim.md — the plant-
-- characteristic disclosures (heat, zero-rated fuels, waste gases, CO2 capture, on-site electricity).
--
-- PERIOD-SCOPED, not installation-scoped. These characteristics change year to year: a plant may
-- commission CO2 capture in 2027, or import measurable heat only in some reporting periods. So the
-- table is keyed one row per (installation, reporting_period), NOT one row per installation.
--
-- ALL DISCLOSURE BOOLEANS ARE NULLABLE ON PURPOSE. The three states are distinct and must stay so:
--   false = the operator DECLARED this does not occur (an affirmative negative);
--   null  = nobody has answered yet (no declaration).
-- A `not null default false` would collapse these two — it would silently record a negative the
-- operator never made, asserting absence as fact on a verifier-facing report. The REPORT BUILDER
-- fails loud on any null, forcing an explicit answer before a report can be produced; the schema's
-- job is to preserve "unanswered", the builder's job is to refuse it at report time. Do not add
-- NOT NULL DEFAULT false to "tidy" these columns — that fabricates declarations.
--
-- ITEM (11) IS CONDITIONAL — prefaced "where electricity is produced inside the installation".
-- When electricity_produced_onsite is false, the (a)-(d) sub-flags are NOT APPLICABLE and stay
-- null, not false: there is no co-generation/separate/source/export answer to give when no
-- electricity is produced on site. Null here means "N/A because the gate is closed", distinct from
-- an operator's declared negative on a gate that is open.
--
-- ITEM (11)(c) is TWO flags (elec_source_fossil, elec_source_renewable), NOT a single enum. The
-- source text is "fossil OR renewable", and a plant may legitimately generate from BOTH (e.g. a gas
-- turbine plus on-site solar). An enum would force a false either/or choice; two booleans let both
-- be true.
--
-- The composite ownership FK below targets (id, company_id) on cbam_installations, which needs a
-- UNIQUE constraint on exactly those two columns (the PK on id alone does not satisfy a two-column
-- FK reference). cbam_inst_id_company_uniq is that prerequisite — the direct mirror of
-- cbam_pp_id_company_uniq on cbam_production_processes (20260717_cbam_customer_leaves.sql). Guarded
-- on pg_constraint because ADD CONSTRAINT has no IF NOT EXISTS.
--
-- No claim is made here about deployment state.

-- Prerequisite for the composite FK: UNIQUE (id, company_id) on the parent installations table.
-- Mirrors cbam_pp_id_company_uniq; guarded for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_inst_id_company_uniq'
  ) then
    alter table public.cbam_installations
      add constraint cbam_inst_id_company_uniq unique (id, company_id);
  end if;
end $$;

create table if not exists public.cbam_installation_disclosures (
  installation_id  uuid not null,
  company_id       uuid not null references public.companies(id) on delete cascade,
  reporting_period int  not null,

  -- §1.2 (7) — whether measurable heat is imported from or exported to other installations
  heat_imported boolean,
  heat_exported boolean,

  -- §1.2 (8) — whether zero-rated fuels are used, and how the operator demonstrates applicability
  zero_rated_fuels_used          boolean,
  zero_rated_fuels_demonstration text,

  -- §1.2 (9) — whether waste gases are produced and used, or imported from / exported to others
  waste_gases_produced_used boolean,
  waste_gases_imported      boolean,
  waste_gases_exported      boolean,

  -- §1.2 (10) — whether CO2 capture is used, and the installation/infrastructure it is transferred to
  co2_capture_used           boolean,
  co2_capture_transferred_to text,

  -- §1.2 (11) — for indirect emissions, WHERE electricity is produced inside the installation, whether it is:
  electricity_produced_onsite boolean,   -- the (11) gate: sub-flags below stay null when this is false
  elec_cogeneration           boolean,   -- (11)(a) produced by co-generation
  elec_separate_generation    boolean,   -- (11)(b) produced by separate generation
  elec_source_fossil          boolean,   -- (11)(c) produced from fossil sources    (both (c) flags may be true)
  elec_source_renewable       boolean,   -- (11)(c) produced from renewable sources (both (c) flags may be true)
  elec_exported_from_process  boolean,   -- (11)(d) exported from the system boundaries of a production process

  updated_at timestamptz not null default now(),

  primary key (installation_id, reporting_period),
  constraint cbam_disclosures_inst_company_fk
    foreign key (installation_id, company_id)
    references public.cbam_installations (id, company_id) on delete cascade
);

-- The DB half of the item-(11) gate: block the contradictory state where the gate is declared
-- CLOSED (electricity_produced_onsite = false) yet a sub-flag is populated. Written `is not false`,
-- NOT `= true`, deliberately: a null gate (unanswered) must still permit populated-or-null sub-flags,
-- so only an explicit false triggers the requirement that every (11)(a)-(d) sub-flag be null.
-- Division of labour: the DB owns the CONSISTENCY rule (closed gate ⇒ no sub-flags); the report
-- builder still owns the COMPLETENESS rule (open gate ⇒ sub-flags must be answered). This constraint
-- does not require sub-flags when the gate is true — that is the builder's job, at report time.
-- Guarded on pg_constraint (ADD CONSTRAINT has no IF NOT EXISTS) for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cbam_disclosures_elec_gate'
  ) then
    alter table public.cbam_installation_disclosures
      add constraint cbam_disclosures_elec_gate check (
        electricity_produced_onsite is not false
        or (elec_cogeneration is null and elec_separate_generation is null
            and elec_source_fossil is null and elec_source_renewable is null
            and elec_exported_from_process is null)
      );
  end if;
end $$;

alter table public.cbam_installation_disclosures enable row level security;

-- create policy has no IF NOT EXISTS, so guard on pg_policies for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_installation_disclosures'
      and policyname = 'cbam_installation_disclosures_owner'
  ) then
    create policy cbam_installation_disclosures_owner on public.cbam_installation_disclosures
      using      (company_id in (select id from public.companies where user_id = auth.uid()))
      with check (company_id in (select id from public.companies where user_id = auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on public.cbam_installation_disclosures to authenticated;
