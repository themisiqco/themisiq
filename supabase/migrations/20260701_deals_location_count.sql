-- supabase/migrations/20260701_deals_location_count.sql
-- Deals module (Build B): add location_count, used to pick the GHG pricing tier
-- (GHG_TIERS: <=3 Essentials, 4-15 Professional, 16+ Advisory) in the module-aware
-- cost card. Nullable — an existing deal with no location count is treated as "not
-- yet entered" by the app (prompts for it) rather than defaulting a tier.
--
-- DEPENDS ON 20260701_deals_table.sql (creates public.deals). Run that first.
-- Idempotent: ADD COLUMN IF NOT EXISTS. No RLS/GRANT change — the table's existing
-- policies and authenticated grant automatically cover the new column.

alter table public.deals
  add column if not exists location_count integer;

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type from information_schema.columns
--   where table_name = 'deals' and column_name = 'location_count';   -- expect 1 row
