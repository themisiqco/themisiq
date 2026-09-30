-- supabase/migrations/20260929_deals_sales_markets_env_claims.sql
-- Deals: where the target sells or operates, and whether it makes public environmental claims.
--
-- Run in production on 2026-09-29 (verified).
--
-- ⚠️ RUN THIS BEFORE ANY CODE THAT READS OR WRITES THESE COLUMNS IS DEPLOYED. On 29 Sep 2026 every
-- deal save failed because the wizard wrote `listed_ca_exchange` to a table that did not have it
-- (20260929_deals_listed_ca_exchange.sql). No code referring to the columns below exists yet; it is
-- written only once this file has run in production.
--
-- WHAT THE COLUMNS ARE FOR. They drive the environmental-claims rules (lib/deals/claimsRules.ts,
-- to come): which jurisdictions' greenwashing laws can reach the target, whether it makes the kind
-- of claim those laws govern, and when the Canada S-211 jurisdiction caveat is worth showing.
--
-- NULLABLE, NO DEFAULTS, AND NULL MEANS "NEVER ASKED". Every existing deal predates the questions,
-- and the report must be able to say so ("Sales markets not recorded") rather than read a default
-- as an answer. A default of '{}' or 'no' would turn "never asked" into "sells nowhere" or "makes no
-- claims" for every existing row, which is the reading these columns exist to prevent.
--
--   sales_markets           text[]   ISO 3166-1 alpha-2 codes, plus 'US-CA' for California.
--                                    NULL = never asked. Validated in code, not here (see below).
--   sales_markets_not_sure  boolean  true = the user ticked "Not sure". NULL = never asked.
--   env_claims              text     'yes' | 'no' | 'not_sure'. NULL = never asked. CHECKed below.
--
-- The market codes are NOT constrained in the database: the list of countries is long, changes
-- rarely but does change, and a CHECK that went stale would refuse a save rather than degrade. The
-- code validates against its own ISO list, and an unknown code falls to the claims rules' fallback
-- line rather than to an error.
--
-- WHAT THIS DOES NOT TOUCH, checked against db/dumps/schema_public_20260927_1928.sql:
--   RLS. deals_select / deals_insert / deals_update / deals_delete are row predicates on user_id and
--     name no column list, so they cover new columns unchanged.
--   GRANTS. authenticated holds SELECT, INSERT, UPDATE at TABLE level on public.deals, with no
--     column-level grant anywhere, so the new columns are covered without a GRANT here.
--   enforce_deals_free_tier_cap(). BEFORE INSERT; reads NEW.user_id and counts rows. It never reads
--     another column of NEW, so new columns cannot change what it allows or refuses.
--   deal_assessment_get(text). The share RPC builds its result from an explicit whitelist and is not
--     widened here: whether it should expose markets or claims to the target is a separate decision.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the CHECK is dropped before it is added. Safe to run twice.

alter table public.deals
  add column if not exists sales_markets          text[],
  add column if not exists sales_markets_not_sure boolean,
  add column if not exists env_claims             text;

alter table public.deals
  drop constraint if exists deals_env_claims_values;
alter table public.deals
  add  constraint deals_env_claims_values
  check (env_claims is null or env_claims in ('yes', 'no', 'not_sure'));

comment on column public.deals.sales_markets is
  'Where the target sells or operates: ISO 3166-1 alpha-2 codes, plus US-CA for California. NULL = never asked (deals saved before 29 Sep 2026). Validated in code against its ISO list, not constrained here. Read by the environmental-claims rules in lib/deals/claimsRules.ts.';
comment on column public.deals.sales_markets_not_sure is
  'true = the user answered "Not sure" to where the target sells or operates. NULL = never asked. Kept separate from sales_markets so a partial list and "not sure" can both be recorded.';
comment on column public.deals.env_claims is
  'Does the target make public environmental claims? yes | no | not_sure. NULL = never asked. no is the target''s own report, to be confirmed in the data room.';

-- Ask PostgREST to reload its schema cache now, so the API accepts the columns at once.
notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type, udt_name, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'deals'
--     and column_name in ('sales_markets', 'sales_markets_not_sure', 'env_claims')
--   order by column_name;
--   -- expect three rows, all is_nullable YES and column_default null:
--   --   env_claims             | text    | text  | YES |
--   --   sales_markets          | ARRAY   | _text | YES |
--   --   sales_markets_not_sure | boolean | bool  | YES |
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.deals'::regclass and conname = 'deals_env_claims_values';
--   -- expect one row: CHECK (env_claims IS NULL OR env_claims = ANY (ARRAY['yes'::text, 'no'::text, 'not_sure'::text]))
