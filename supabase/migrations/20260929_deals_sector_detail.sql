-- supabase/migrations/20260929_deals_sector_detail.sql
-- Deals: sector detail beyond the one primary sector: a secondary sector, a free-text description for
-- "Other", and an optional standard industry code (NACE Rev. 2.1 or NAICS 2022).
--
-- Run in production on 2026-09-29 (verified).
--
-- ⚠️ RUN THIS BEFORE ANY CODE THAT READS OR WRITES THESE COLUMNS IS DEPLOYED. On 29 Sep 2026 every deal
-- save failed because the wizard wrote a column the table did not have
-- (20260929_deals_listed_ca_exchange.sql). No code referring to the columns below exists yet.
--
-- NULLABLE, NO DEFAULTS, AND NULL MEANS "NOT GIVEN". Every existing deal has only `sector`, and the
-- report must be able to tell "no secondary sector" from "never asked". A default would erase that.
--
--   sector_secondary      text  A second sector from the same list as `sector`. NULL = none given.
--   sector_other          text  The user's own description when the sector is "Other (describe)".
--                               NULL = not given. Free text, shown back to the user, never matched on.
--   industry_code_system  text  'NACE' (Rev. 2.1) or 'NAICS' (2022). NULL = no code given. CHECKed.
--   industry_code         text  The code itself, in the system named. NULL = no code given.
--
-- The code is NOT validated against its code list in the database: the lists are long, are versioned
-- by their publishers, and a stale CHECK would refuse a save rather than degrade. The wizard validates
-- against the list it loads. A code and its system are given together or not at all:
-- deals_industry_code_pairing below.
--
-- WHAT THIS DOES NOT TOUCH, checked against db/dumps/schema_public_20260927_1928.sql:
--   RLS. deals_select / deals_insert / deals_update / deals_delete are row predicates on user_id and
--     name no column list, so they cover new columns unchanged.
--   GRANTS. authenticated holds SELECT, INSERT, UPDATE at TABLE level on public.deals, with no
--     column-level grant anywhere, so the new columns are covered without a GRANT here.
--   enforce_deals_free_tier_cap(). BEFORE INSERT; reads NEW.user_id and counts rows. It never reads
--     another column of NEW, so new columns cannot change what it allows or refuses.
--   deal_assessment_get(text). The share RPC builds its result from an explicit whitelist and is not
--     widened here.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and each CHECK is dropped before it is added. Safe to run twice.

alter table public.deals
  add column if not exists sector_secondary     text,
  add column if not exists sector_other         text,
  add column if not exists industry_code_system text,
  add column if not exists industry_code        text;

alter table public.deals
  drop constraint if exists deals_industry_code_system_values;
alter table public.deals
  add  constraint deals_industry_code_system_values
  check (industry_code_system is null or industry_code_system in ('NACE', 'NAICS'));

-- A code never without its system, and a system never without a code.
alter table public.deals
  drop constraint if exists deals_industry_code_pairing;
alter table public.deals
  add  constraint deals_industry_code_pairing
  check ((industry_code is null) = (industry_code_system is null));

comment on column public.deals.sector_secondary is
  'A second sector for the target, from the same list as sector. NULL = none given.';
comment on column public.deals.sector_other is
  'The user''s own description of the sector when sector is "Other (describe)". NULL = not given. Free text: displayed, never matched on.';
comment on column public.deals.industry_code_system is
  'NACE (Rev. 2.1) or NAICS (2022): the system industry_code is written in. NULL = no code given.';
comment on column public.deals.industry_code is
  'A standard industry code in the system named by industry_code_system. NULL = no code given. Validated in code against the loaded list, not constrained here.';

-- Ask PostgREST to reload its schema cache now, so the API accepts the columns at once.
notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'deals'
--     and column_name in ('sector_secondary', 'sector_other', 'industry_code_system', 'industry_code')
--   order by column_name;
--   -- expect four rows, all text, is_nullable YES, column_default null.
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.deals'::regclass and conname = 'deals_industry_code_system_values';
--   -- expect one row: CHECK (industry_code_system IS NULL OR industry_code_system = ANY (ARRAY['NACE'::text, 'NAICS'::text]))
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.deals'::regclass and conname = 'deals_industry_code_pairing';
--   -- expect one row: CHECK (((industry_code IS NULL) = (industry_code_system IS NULL)))
