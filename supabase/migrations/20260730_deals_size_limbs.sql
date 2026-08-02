-- supabase/migrations/20260730_deals_size_limbs.sql
-- Deals: size limbs for multi-limb statutory threshold tests.
--
-- WHY: CSRD / CS3D / SECR / Canada S-211 are not single-turnover tests. They are N-of-M tests over
-- turnover, balance-sheet total and headcount. Modelling them on revenue alone OVER-calls: SECR is
-- a 2-of-3 test currently evaluated on the turnover limb only, so every UK target above the
-- turnover figure is told SECR applies when it may satisfy no other limb.
--
-- NULLABLE IS LOAD-BEARING. Absence of data is not a value: an undeclared headcount must stay
-- distinct from a declared zero, exactly as undeclared revenue is distinct from zero revenue.
-- A holding company with 0 employees is a real, declarable answer that must not read as "unknown",
-- and an unknown headcount must never be scored as "fails the employee limb" — under the N-of-M
-- rule an undeclared limb makes the OUTCOME indeterminate, it does not make the limb fail.
-- The CHECKs below permit 0 and forbid negatives precisely to keep 0 a usable declared value.
--
-- CURRENCY: total_assets is denominated in the deal's existing `currency` column, the same basis
-- as `revenue`. A target reporting different measures in different currencies is NOT modelled.
--
-- ⚠️ UNMODELLED LOOKBACK — Canada S-211. The statute measures over EITHER of the two most recent
-- financial years. These two scalar columns hold ONE year, so the engine evaluates the most recent
-- year only (ThresholdTest.lookbackModelled = false, stated verbatim in the limb basis and in the
-- report). FAILURE MODE: a target that crossed a limb last year and dipped this year is
-- UNDER-called — the engine will say the limb is not met when the statute would still catch it.
-- MITIGATION: the below-side near-threshold flag. A dipped target sits just under the limb, so it
-- surfaces as near-threshold-below and is put in front of the reader rather than silently dropped.
-- That is a mitigation, not a fix. The fix is a `deal_financials` child table keyed
-- (deal_id, fiscal_year, measure) — design toward that; do NOT add `_prior` columns, which look
-- cheap and lock the shape at exactly two years.
--
-- DEPENDS ON 20260701_deals_table.sql. Run that first.
-- Idempotent: ADD COLUMN IF NOT EXISTS, drop-then-add constraints. No RLS/GRANT change — the
-- table's existing policies and authenticated grant automatically cover new columns (same as
-- 20260701_deals_location_count.sql).

alter table public.deals
  add column if not exists employee_count integer,
  add column if not exists total_assets   numeric;

-- Permit 0 (a real declared value), forbid negatives (always data-entry error).
-- Existing rows are all NULL, so these validate instantly.
alter table public.deals
  drop constraint if exists deals_employee_count_nonneg;
alter table public.deals
  add  constraint deals_employee_count_nonneg
  check (employee_count is null or employee_count >= 0);

alter table public.deals
  drop constraint if exists deals_total_assets_nonneg;
alter table public.deals
  add  constraint deals_total_assets_nonneg
  check (total_assets is null or total_assets >= 0);

comment on column public.deals.employee_count is
  'Headcount for the employee limb of multi-limb thresholds (SECR, Canada S-211, and CSRD/CS3D once Omnibus constants are verified). NULL = undeclared (limb not assessed, outcome may be indeterminate); 0 = declared zero (limb definitively not met). Measure basis is per-instrument — see THRESHOLD_TESTS limb.basis in lib/deals/assessment.ts.';
comment on column public.deals.total_assets is
  'Balance-sheet total for the assets limb. Denominated in deals.currency. NULL = undeclared (limb not assessed); 0 = declared zero. Measure basis is per-instrument — see THRESHOLD_TESTS limb.basis in lib/deals/assessment.ts.';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'deals' and column_name in ('employee_count','total_assets');  -- expect 2, YES
--   select conname from pg_constraint where conrelid = 'public.deals'::regclass
--     and conname like 'deals_%_nonneg';                                              -- expect 2
