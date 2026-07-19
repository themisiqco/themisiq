-- 20260718_cbam_charge_mix.sql
-- Charge mix: the metallic input mass balance for a single production process.
-- Its purpose is EVIDENTIARY, not calculational. IR 2025/2620 assigns a production
-- route by a >50 % mass rule over the metallic charge, so the declared route on
-- cbam_production_processes is a claim that needs a mass balance behind it. This table
-- holds that balance, so a verifier can recompute the ratio from the rows rather than
-- take the declared route on trust.
--
-- Scrap is captured even though scrap is NOT itself a CBAM good and carries no embedded
-- emissions into the calculation. Two reasons: (1) the >50 % ratio is a share of the TOTAL
-- metallic charge, so omitting scrap inflates every other material's share and can flip
-- the route; (2) pre-consumer scrap has been proposed as a future precursor, so the row
-- should already exist if that lands. Capturing it is not a claim that it is in scope today.
--
-- EXPLICITLY NOT AN EMISSIONS INPUT. Nothing here feeds the SEE calculation. Embedded
-- emissions come from cbam_source_streams and cbam_precursor_inputs; masses recorded here
-- must never be read as activity data, precursor mass, or any term of SEE. A material
-- that is both charged and emissions-relevant is recorded in BOTH places, for two
-- different purposes — this table's copy is evidence for the route, not a quantity to add.
--
-- mass is in tonnes, consistent with cbam_precursor_inputs.mass_consumed.
--
-- No claim is made here about deployment state.

create table if not exists public.cbam_charge_mix (
  id            uuid primary key default gen_random_uuid(),
  process_id    uuid not null,
  company_id    uuid not null references public.companies(id) on delete cascade,
  material_type text not null check (material_type in (
                  'scrap','dri','pig_iron_bf','pig_iron_smelting_reduction',
                  'hot_metal','ferroalloy','other_metallic')),
  mass          numeric not null check (mass >= 0),   -- tonnes
  note          text,
  source_doc_id uuid,
  created_at    timestamptz not null default now(),
  constraint cbam_charge_mix_process_company_fk
    foreign key (process_id, company_id)
    references public.cbam_production_processes (id, company_id) on delete cascade
);

alter table public.cbam_charge_mix enable row level security;

-- create policy has no IF NOT EXISTS, so guard on pg_policies for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'cbam_charge_mix'
      and policyname = 'cbam_charge_mix_owner'
  ) then
    create policy cbam_charge_mix_owner on public.cbam_charge_mix
      using      (company_id in (select id from public.companies where user_id = auth.uid()))
      with check (company_id in (select id from public.companies where user_id = auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on public.cbam_charge_mix to authenticated;
