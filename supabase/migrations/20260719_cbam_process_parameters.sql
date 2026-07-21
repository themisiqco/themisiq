-- 20260719_cbam_process_parameters.sql
-- Implements Annex IV §2 sector-specific parameters (see docs/cbam-annex-iv-2-verbatim.md) at the
-- level of a single production process. For iron & steel the §2 reporting requirements are the main
-- reducing agent used and the alloy composition (Mass % of Mn, Cr, Ni, total of other alloy
-- elements), plus the scrap figures (handled in cbam_charge_mix, not here).
--
-- SEPARATE TABLE, not columns on cbam_production_processes. §2 is explicitly a distinct
-- "sector-specific" concern in the source, and other sectors (cement clinker ratio, fertiliser N
-- content, aluminium alloy content) carry their own §2 parameters. Keeping §2 in its own table
-- leaves room to extend per-sector without widening the core process table for a steel-only concern.
--
-- ALLOY PERCENTAGES: nullable, and deliberately carry NO status column — unlike the reducing agent.
-- The source attaches "if known" ONLY to the reducing agent, never to the composition. So "not
-- known" is a SANCTIONED state for the agent and is NOT a sanctioned state for alloy content: a
-- null alloy percentage means simply "unanswered", and the report builder fails loud on it. A
-- MEASURED 0 is a legitimate value (e.g. no nickel), distinct from null — do not conflate them, and
-- do not default a null to 0.
--
-- The alloy percentages are the EVIDENCE for cbam_production_processes.steel_grade. IR 2025/2620
-- §5.2.3 defines high alloy by an 8 % threshold, so the declared grade is a claim these numbers must
-- support — the same declare-then-evidence pattern as route_code declared against cbam_charge_mix.
-- steel_grade is the lossy classification; these are the underlying figures a verifier recomputes it
-- from.
--
-- REDUCING AGENT: free text, NOT an enum. §2 gives no value list for it, so under-constrain rather
-- than reject a valid answer ("natural gas", "hydrogen", "coal/coke", a mix). It is paired with
-- reducing_agent_status because "not known" is an AFFIRMATIVE operator declaration, not an absence:
--   'provided'  → an agent was named (reducing_agent is not null);
--   'not_known' → the operator affirmatively declares it unknown (reducing_agent is null);
--   null status → unanswered (reducing_agent is null).
-- The DB owns this value/status CONSISTENCY rule (constraint below); it does NOT own completeness.
--
-- REQUIREMENT VARIES BY §2 ROW, and the BUILDER owns that rule (it needs the process's category, so
-- it cannot be expressed as a CHECK here):
--   * DRI and Pig Iron rows say "The main reducing agent used" — no "if known". UNCONDITIONALLY
--     required; 'not_known' is NOT a legitimate answer for these.
--   * Crude steel and Iron/steel products say "The main reducing agent of the precursor, if known".
--     CONDITIONALLY required; 'not_known' IS legitimate.
-- This table cannot enforce that split because it does not carry the category; the builder must.
--
-- APPLICABILITY IS DERIVED, NOT STORED. A pure scrap-EAF producer with no DRI/pig-iron precursor has
-- no reducing agent to report at all. The builder determines applicability from the process's
-- precursor rows (cbam_precursor_inputs), so it cannot drift out of sync with the actual inputs —
-- the same principle as deriving the scrap ratio from the charge mix rather than storing it.
--
-- The four percentages' SUM IS DELIBERATELY UNCONSTRAINED. "total of other alloy elements" may
-- overlap definitionally with the named Mn/Cr/Ni in ways §2 does not clarify, so no
-- sum-to-<=100 or sum-vs-other CHECK is imposed. See docs/cbam-annex-iv-2-verbatim.md.
--
-- No claim is made here about deployment state.

create table if not exists public.cbam_process_parameters (
  process_id  uuid primary key,
  company_id  uuid not null references public.companies(id) on delete cascade,

  reducing_agent        text,
  reducing_agent_status text check (reducing_agent_status in ('provided','not_known')),

  alloy_mn_pct    numeric check (alloy_mn_pct    is null or (alloy_mn_pct    >= 0 and alloy_mn_pct    <= 100)),
  alloy_cr_pct    numeric check (alloy_cr_pct    is null or (alloy_cr_pct    >= 0 and alloy_cr_pct    <= 100)),
  alloy_ni_pct    numeric check (alloy_ni_pct    is null or (alloy_ni_pct    >= 0 and alloy_ni_pct    <= 100)),
  alloy_other_pct numeric check (alloy_other_pct is null or (alloy_other_pct >= 0 and alloy_other_pct <= 100)),

  updated_at timestamptz not null default now(),

  constraint cbam_params_agent_status_consistent check (
    (reducing_agent_status = 'provided'  and reducing_agent is not null)
    or (reducing_agent_status = 'not_known' and reducing_agent is null)
    or (reducing_agent_status is null      and reducing_agent is null)
  ),

  constraint cbam_params_process_company_fk
    foreign key (process_id, company_id)
    references public.cbam_production_processes (id, company_id) on delete cascade
);

alter table public.cbam_process_parameters enable row level security;

-- create policy has no IF NOT EXISTS, so guard on pg_policies for safe re-runs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_process_parameters'
      and policyname = 'cbam_process_parameters_owner'
  ) then
    create policy cbam_process_parameters_owner on public.cbam_process_parameters
      using      (company_id in (select id from public.companies where user_id = auth.uid()))
      with check (company_id in (select id from public.companies where user_id = auth.uid()));
  end if;
end $$;

grant select, insert, update, delete on public.cbam_process_parameters to authenticated;
