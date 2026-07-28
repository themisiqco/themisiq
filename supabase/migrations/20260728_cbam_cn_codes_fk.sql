begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- CBAM CN-code enumeration table + referential integrity on the two intake
-- columns. Closes the gap left when cbam_pp_cn_code_8digit_spaced was dropped
-- (27 Jul 2026): validity became client-only, and intake is direct DML, so the
-- database had no CN rule at all.
--
-- Deliberately single-column. This is a constraint target, not a data table —
-- any metadata here would duplicate cbam_default_values and drift from it.
-- Verified before running: distinct cn_code = 224 across all rows and across
-- country='other' rows alike; zero orphan rows in either intake table.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cbam_cn_codes (
  cn_code text primary key
);

comment on table public.cbam_cn_codes is
  'Distinct CBAM CN codes, derived from cbam_default_values. FK target for '
  'cbam_production_processes.cn_code and cbam_precursor_inputs.precursor_cn_code. '
  'Populate from each sector seed migration before its commit. Never hand-edit.';

-- Populate from the seed. Superset-safe: uses all rows, not just country='other'.
insert into public.cbam_cn_codes (cn_code)
select distinct cn_code from public.cbam_default_values
on conflict (cn_code) do nothing;

-- Grants + RLS, matching the post-17-Jul reference-table pattern (§10.4).
grant select on public.cbam_cn_codes to anon, authenticated;
alter table public.cbam_cn_codes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_cn_codes'
      and policyname = 'cbam_cn_codes_read'
  ) then
    create policy cbam_cn_codes_read on public.cbam_cn_codes
      for select to anon, authenticated using (true);
  end if;
end $$;

-- FKs. No ON DELETE clause: NO ACTION is deliberate — a future re-seed must not
-- be able to remove a code a customer's process still references. Fail loud.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cbam_pp_cn_code_fk') then
    alter table public.cbam_production_processes
      add constraint cbam_pp_cn_code_fk
      foreign key (cn_code) references public.cbam_cn_codes(cn_code);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cbam_precursor_inputs_cn_code_fk') then
    alter table public.cbam_precursor_inputs
      add constraint cbam_precursor_inputs_cn_code_fk
      foreign key (precursor_cn_code) references public.cbam_cn_codes(cn_code);
  end if;
end $$;

commit;

-- Verification (run after commit):
-- select
--   (select count(*) from public.cbam_cn_codes) as codes_seeded,
--   (select count(*) from pg_constraint
--      where conname in ('cbam_pp_cn_code_fk','cbam_precursor_inputs_cn_code_fk')) as fks_created,
--   (select count(*) from pg_policies
--      where tablename = 'cbam_cn_codes') as policies;
-- Applied 28 Jul 2026 — returned 224 / 2 / 1.

-- FUTURE SEED MIGRATIONS: after inserting into cbam_default_values and BEFORE
-- commit, append:
--   insert into public.cbam_cn_codes (cn_code)
--   select distinct cn_code from public.cbam_default_values
--   on conflict (cn_code) do nothing;
-- Derived from the seed, never transcribed separately. A new sector's codes must
-- land in the same transaction as its values, or the FK will reject the first
-- customer process that uses one.
