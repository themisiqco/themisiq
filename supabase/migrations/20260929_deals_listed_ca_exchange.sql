-- supabase/migrations/20260929_deals_listed_ca_exchange.sql
-- Deals: the Canadian stock-exchange listing answer behind the Canada S-211 listing route.
--
-- Run in production on 2026-09-29 (verified: column present, deal save confirmed).
--
-- WHY, AND WHY IT IS URGENT. The wizard (app/dashboard/deals/page.tsx, handleSave) has written
-- `listed_ca_exchange` on every insert and update since the S-211 listing route was added on
-- 26 Sep 2026, but no migration created the column, and the live table does not have it
-- (information_schema returned no row on 29 Sep 2026). PostgREST rejects a write naming an unknown
-- column, so every deal save has failed since the field shipped. Reads were unaffected: the wizard
-- and the report load with select('*'), and the Excel export and the share RPC name their columns
-- and do not include this one.
--
-- TYPE: boolean, NULLABLE, NO DEFAULT, AND ALL THREE ARE LOAD-BEARING. The wizard offers three
-- answers, Yes / No / Not sure, and stores them as true / false / null. lib/deals/assessment.ts
-- (getFrameworkApplicability) takes the listing route only on `=== true`; false and null both leave
-- it untaken, and the S-211 jurisdiction caveat shows for both. A DEFAULT false would turn
-- "never asked" into "answered No" for every existing row and every insert that omits the field,
-- which is exactly the reading the tri-state exists to prevent. Existing rows therefore become NULL,
-- which is the truth about them: none was ever asked.
--
-- WHAT THIS DOES NOT TOUCH, checked against db/dumps/schema_public_20260927_1928.sql:
--   RLS. deals_select / deals_insert / deals_update / deals_delete are row predicates on user_id and
--     name no column list, so they cover a new column unchanged.
--   GRANTS. authenticated holds SELECT, INSERT, UPDATE at TABLE level on public.deals, with no
--     column-level grant anywhere, so the new column is covered without a GRANT here.
--   enforce_deals_free_tier_cap(). BEFORE INSERT; reads NEW.user_id and counts rows. It never reads
--     another column of NEW, so adding one cannot change what it allows or refuses.
--   deal_assessment_get(text). The share RPC builds its result from an explicit whitelist and is
--     deliberately NOT widened: whether the target is listed is the buyer's view, read by no one on
--     the target-facing page.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Safe to run twice.

alter table public.deals
  add column if not exists listed_ca_exchange boolean;

comment on column public.deals.listed_ca_exchange is
  'Is the target listed on a Canadian stock exchange? true = yes (Canada S-211 applies by listing, s.2(a), at any size and wherever established); false = no; NULL = not answered or not sure. false and NULL both leave the listing route untaken; only true takes it. No default: NULL must stay distinct from false. Read by getFrameworkApplicability in lib/deals/assessment.ts.';

-- Ask PostgREST to reload its schema cache now, so the API accepts the column at once rather than
-- after its next automatic reload.
notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'deals' and column_name = 'listed_ca_exchange';
--   -- expect exactly one row: listed_ca_exchange | boolean | YES | (null)
