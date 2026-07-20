-- 20260718_cbam_sefa_params.sql
-- Year-keyed scalar parameters for the SEFA term of IR 2025/2620 Equation 2:
--   SFA_Proc = CBAM_y × CSCF_y × BM*_g
-- One row per production year. This table holds the two year-varying scalars (CBAM_y, CSCF_y);
-- BM*_g comes from cbam_benchmarks.
--
-- cbam_factor = CBAM_y, from ETS Directive 2003/87/EC Art 10a(1a): the share of free allocation
-- that REMAINS applicable to CBAM goods. It starts at 97.5 % in 2026 and falls to 0 % in 2034 as
-- free allocation is withdrawn. This is emphatically NOT the 2.5 % phase-in figure that some
-- secondary guides loosely call "the CBAM factor" — those are complementary (they sum to 1), and
-- confusing them here would understate SEFA by ~39x (0.975 / 0.025). We store the REMAINING-
-- allocation fraction. Stored as a fraction (0.975), never a percentage (97.5). The schedule is
-- subject to Art 36(2)(b), recorded per-row in `note`.
--
-- cscf = CSCF_y, the cross-sectoral correction factor (Del. Reg. 2019/331 Art 14(6)), published by
-- the Commission. It is NULLABLE and DELIBERATELY NOT DEFAULTED: it is confirmed unpublished for
-- 2026-2030 at time of writing, so every seeded row carries cscf = null / 'pending'. Never
-- substitute 1.0 for a missing CSCF — the absence of a published value is not itself a value, and
-- a silent 1.0 would fabricate a regulatory number. The SEFA calculation MUST fail loud when cscf
-- is null rather than proceed, so the missing multiplier can never be silently treated as identity.
--
-- cscf_status disambiguates the two things a value could mean, which null alone cannot express:
--   'pending'        — not yet published by the Commission (cscf is null).
--   'published'      — a real Commission value applies (cscf is the number). A year where the
--                      Commission publishes "no correction needed" is cscf = 1.0 / 'published',
--                      NOT null — that 1.0 is an affirmed value, distinct from an absent one.
--   'not_applicable' — CSCF plays no role for that year (reserved; unused by the current seed).
--
-- 2034's cbam_factor = 0.000 is a REAL VALUE, not missing data: from 2034 no CBAM factor applies
-- because free allocation for CBAM goods is set to zero. The CHECK admits 0, and the row's note
-- records the reason so a future reader does not mistake the zero for an unfilled cell.
--
-- No claim is made here about deployment state.

create table if not exists public.cbam_sefa_params (
  year        int primary key,
  cbam_factor numeric not null check (cbam_factor >= 0 and cbam_factor <= 1),
  cscf        numeric check (cscf is null or (cscf > 0 and cscf <= 1)),
  cscf_status text not null default 'pending'
              check (cscf_status in ('pending','published','not_applicable')),
  source_ref  text not null,
  note        text
);

insert into public.cbam_sefa_params (year, cbam_factor, cscf, cscf_status, source_ref, note) values
  (2026, 0.975, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2027, 0.950, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2028, 0.900, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2029, 0.775, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2030, 0.515, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2031, 0.390, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2032, 0.265, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2033, 0.140, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)', 'subject to Art 36(2)(b)'),
  (2034, 0.000, null, 'pending', 'ETS Directive 2003/87/EC Art 10a(1a)',
         'no CBAM factor applies from 2034; free allocation for CBAM goods set to zero')
on conflict (year) do nothing;

grant select on public.cbam_sefa_params to anon, authenticated;
alter table public.cbam_sefa_params enable row level security;

-- create policy has no IF NOT EXISTS, so guard on pg_policies for safe re-runs
-- (same pattern as 20260717_cbam_reference_grants_rls.sql).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'cbam_sefa_params'
      and policyname = 'cbam_sefa_params_read'
  ) then
    create policy cbam_sefa_params_read on public.cbam_sefa_params
      for select to anon, authenticated using (true);
  end if;
end $$;
