-- Supplier Portal schema. Documents tables currently living only in production
-- Supabase — no prior migration captured them. Reconstructed from application
-- code (not a live DB dump), so column types/constraints are inferred from how
-- the app reads/writes them; sanity-check against the live schema before relying
-- on this as the source of truth. Re-run this whole file if the DB is rebuilt;
-- every statement is idempotent and safe to re-run on a partially-existing schema.
--
-- Tables (and where the app uses them):
--   supplier_campaigns  — a buyer's data-collection campaign   (app/api/campaigns/route.ts)
--   campaign_suppliers  — suppliers invited to a campaign       (app/dashboard/supply-chain/portal/[id]/page.tsx)
--   supplier_responses  — per-question answers from suppliers   (app/supplier/[token]/page.tsx)
--
-- NOT captured here (exists in Supabase but is not derivable from the code):
-- the Row-Level Security policies on these tables. The API relies on RLS to scope
-- campaigns to their buyer (see the scope3-cat1 route comments). Re-create those
-- policies separately — this migration only restores table structure.

-- gen_random_bytes() (and gen_random_uuid()) live in pgcrypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- supplier_campaigns
-- =====================================================================
CREATE TABLE IF NOT EXISTS supplier_campaigns (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id               uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name                   text        NOT NULL,
  description            text,
  reporting_year         integer,
  deadline               date,
  status                 text        NOT NULL DEFAULT 'active',
  questionnaire_template text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Backfill columns in case an older version of the table predates them.
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS reporting_year integer;
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS deadline date;
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS questionnaire_template text;
ALTER TABLE supplier_campaigns ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- =====================================================================
-- campaign_suppliers
-- =====================================================================
CREATE TABLE IF NOT EXISTS campaign_suppliers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      uuid        NOT NULL REFERENCES supplier_campaigns (id) ON DELETE CASCADE,
  supplier_name    text        NOT NULL,
  supplier_email   text        NOT NULL,
  contact_name     text,
  status           text        NOT NULL DEFAULT 'invited',
  annual_spend     numeric,
  spend_currency   text,
  token            text        NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  reminder_sent_at timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Backfill columns in case an older version of the table predates them.
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS status text DEFAULT 'invited';
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS annual_spend numeric;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS spend_currency text;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS token text;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE campaign_suppliers ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- The point of this migration: every supplier row must get a unique, unguessable
-- token so the public /supplier/<token> invite links resolve. The app never sets
-- token itself — it relies entirely on this column default. Set it explicitly in
-- case the column pre-existed without a default.
ALTER TABLE campaign_suppliers ALTER COLUMN token SET DEFAULT encode(gen_random_bytes(32), 'hex');

-- Backfill any rows that somehow have no token, then enforce NOT NULL.
UPDATE campaign_suppliers
  SET token = encode(gen_random_bytes(32), 'hex')
  WHERE token IS NULL;
ALTER TABLE campaign_suppliers ALTER COLUMN token SET NOT NULL;

COMMENT ON COLUMN campaign_suppliers.token IS
  'Unguessable per-supplier token for the public /supplier/<token> portal link. Default encode(gen_random_bytes(32),''hex''); app never sets it.';

-- One token maps to exactly one supplier row (the portal looks suppliers up by token).
CREATE UNIQUE INDEX IF NOT EXISTS campaign_suppliers_token_key
  ON campaign_suppliers (token);

-- =====================================================================
-- supplier_responses
-- =====================================================================
CREATE TABLE IF NOT EXISTS supplier_responses (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_supplier_id uuid        NOT NULL REFERENCES campaign_suppliers (id) ON DELETE CASCADE,
  section              text,
  question_id          text        NOT NULL,
  response             text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Backfill columns in case an older version of the table predates them.
ALTER TABLE supplier_responses ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE supplier_responses ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Upsert key: the supplier form writes answers with
-- onConflict (campaign_supplier_id, question_id) — this index backs that upsert.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_responses_supplier_question_key
  ON supplier_responses (campaign_supplier_id, question_id);
