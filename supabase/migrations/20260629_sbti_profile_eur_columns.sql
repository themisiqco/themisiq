-- supabase/migrations/20260629_sbti_profile_eur_columns.sql
-- Add the EUR / income-class columns that lib/sbti.ts categorize() consumes
-- (CategorizeInput: netTurnoverEur, balanceSheetEur, highIncomeCountry). fte maps
-- to the EXISTING employee_count column — no new fte column is added.
--
-- Forward ALTER migration, NOT an edit to the create-table file: 20260625_sbti_core_tables.sql
-- is already applied to Supabase, and `create table if not exists` SKIPS on re-run —
-- so columns added there would look right in the file but never reach the live table.
-- ALTER ... ADD COLUMN IF NOT EXISTS is the only thing that reaches the live table.
--
-- DEPENDS ON 20260625_sbti_core_tables.sql — apply that first (it creates the table).
-- Re-runnable: ADD COLUMN IF NOT EXISTS + COMMENT ON are idempotent.
--
-- No GRANT block: the core migration's TABLE-LEVEL grant
--   (grant select, insert, update, delete on table public.sbti_company_profile to authenticated)
-- automatically covers columns added later. No RLS changes: policies gate on user_id,
-- which is unaffected by adding columns.

-- ── New columns (nullable; non-negative CHECKs on the EUR fields, mirroring the
--    table's existing range-check style) ─────────────────────────────────────
alter table public.sbti_company_profile
  add column if not exists net_turnover_eur   numeric
    check (net_turnover_eur is null or net_turnover_eur >= 0),
  add column if not exists balance_sheet_eur  numeric
    check (balance_sheet_eur is null or balance_sheet_eur >= 0),
  add column if not exists high_income_country boolean;
-- high_income_country is intentionally nullable with NO default: null = "not yet
-- declared". The wizard/save layer resolves it to a concrete boolean before calling
-- categorize(). A default of false would silently mis-categorise undeclared profiles
-- as not-high-income (suppressing Route 2 of the Category-A test).

-- fte → existing employee_count: employee_count (integer) IS the FTE count
-- categorize() reads; intentionally NO new fte column.

-- ── Retire annual_revenue (supersede, do NOT drop — reversible; drop later if wanted) ──
comment on column public.sbti_company_profile.annual_revenue is
  'RETIRED — superseded by net_turnover_eur for SBTi categorisation. Retained (not dropped) for reversibility; do NOT read for categorize().';
comment on column public.sbti_company_profile.net_turnover_eur is
  'EUR net turnover — categorize() Route 1 (>=450M) and Route 2 two-of-three (>=50M). THE revenue field for SBTi.';
comment on column public.sbti_company_profile.balance_sheet_eur is
  'EUR balance-sheet total — categorize() Route 2 two-of-three (>=25M).';
comment on column public.sbti_company_profile.high_income_country is
  'World Bank high-income class of the ultimate-parent jurisdiction — gates categorize() Route 2. Null = undeclared.';

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'sbti_company_profile'
--     and column_name in ('net_turnover_eur','balance_sheet_eur','high_income_country');   -- expect 3 rows
