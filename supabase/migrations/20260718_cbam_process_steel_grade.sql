-- 20260718_cbam_process_steel_grade.sql
-- Adds steel_grade to cbam_production_processes. Needed together with route_code to
-- derive the IR 2025/2620 §5.3 benchmark indicator: the indicators encode grade and
-- route JOINTLY, not separately — (C) Carbon+BF/BOF, (F) Low alloy+BF/BOF,
-- (J) High alloy+EAF — so route alone does not determine the indicator.
--
-- Nullable because only steel goods carry a grade; every other CBAM sector
-- (cement, fertilisers, hydrogen, aluminium) leaves it NULL.
--
-- 'stainless' is deliberately EXCLUDED from the CHECK. IR 2025/2620 §5.2.3 defines
-- 'Stainless steel' ("alloy steels containing, by weight, 1,2 % or less of carbon and
-- 10,5 % or more of chromium, with or without other elements"), but the §5.3 indicator
-- legend has NO stainless indicator — (C)-(H) and (J) cover only carbon, low alloy and
-- high alloy. Whether stainless is intended to fall inside high alloy is NOT stated in
-- the source; the two definitions are independent and could overlap. Do not assume
-- stainless is a subset of high alloy. Admitting a 'stainless' value here would force
-- that unstated assumption at write time. See docs/cbam-2620-annex-prose-verbatim.md,
-- Ambiguity 5. Revisit only if the Commission clarifies.
--
-- No claim is made here about deployment state.

alter table public.cbam_production_processes
  add column if not exists steel_grade text
    check (steel_grade is null or steel_grade in ('carbon','low_alloy','high_alloy'));
