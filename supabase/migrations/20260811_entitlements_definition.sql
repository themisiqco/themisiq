-- supabase/migrations/20260811_entitlements_definition.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- THE `entitlements` TABLE PREDATES THIS REPO'S MIGRATION HISTORY. It has existed on
-- production Supabase since before migrations were tracked here, and until this file there
-- was no CREATE TABLE for it anywhere in git.
--
-- THIS FILE IS DESCRIPTIVE, NOT AUTHORITATIVE. It was reconstructed from the live schema on
-- 11 August 2026. THE LIVE DATABASE IS THE SOURCE OF TRUTH. If the two ever disagree, the
-- database is right and this file is stale — re-read it from Supabase and correct this file,
-- never the other way round.
--
-- RUNNING THIS AGAINST THE LIVE DATABASE IS A NO-OP, and it is written that way on purpose so
-- it is safe to run when checking it still matches. Every statement is guarded:
--   • CREATE TABLE IF NOT EXISTS  — skipped entirely; the column list below therefore never
--     executes against the live table, which is why term_start / term_end can carry NOT NULL
--     here without an ALTER that would fail on existing rows.
--   • ENABLE / NO FORCE ROW LEVEL SECURITY — idempotent; setting them to what they already are.
--   • The policy is created inside a guard that checks pg_policies first. CREATE POLICY has no
--     IF NOT EXISTS in any PostgreSQL version, and DROP-then-CREATE would briefly leave the
--     table with NO read policy — a window in which every customer loses access to every
--     module. The guard does nothing at all when the policy is present.
-- There are deliberately NO `COMMENT ON` statements: a comment write is real DDL against the
-- live database, which would break the no-op property. The correctness notes are SQL comments.
--
-- ⚠️ REBUILD ORDER. On a rebuild from git alone, FILENAME ORDER IS WRONG AND WILL FAIL.
-- Two earlier-dated migrations already depend on this table existing:
--   20260618_ghg_location_allowance.sql  — ALTER TABLE entitlements ADD COLUMN …
--   20260811_deals_free_tier_cap.sql     — its function body SELECTs from entitlements
-- Both sort before or alongside this file. RUN THIS FILE FIRST, by hand, ahead of the whole
-- sequence. Dating it earlier would misrepresent when it was written, so the ordering is
-- recorded here instead of hidden in a filename.
--
-- ⚠️ GRANTS ARE NOT CAPTURED HERE. They were not part of the schema read this file was built
-- from, and they are NOT guessed — a wrong GRANT is worse than a missing one, and the
-- service-role write path fails silently without the right grant (BYPASSRLS does not bypass
-- GRANT). Before trusting a rebuild, read the live grants and add them in their own file.
--
-- gen_random_uuid() needs no extension: it is core PostgreSQL from 13 onward, and Supabase is
-- well past that.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ────────────────────────────────────────────────────────────────────
-- Column order matches the live table exactly, so a rebuilt database and the current one
-- describe identically under \d.
--
-- The two constraint names are NOT written out because PostgreSQL's own defaults already
-- produce them: PRIMARY KEY → entitlements_pkey, and UNIQUE (user_id, module_key) →
-- entitlements_user_id_module_key_key. Both match the live indexes. Naming them explicitly
-- would add a second way to get them wrong.
--
-- The unique pair is what makes the Stripe webhook's upsert safe:
--   .upsert(rows, { onConflict: 'user_id,module_key' })
-- Re-delivery of a paid event re-upserts the same row rather than granting a duplicate.
CREATE TABLE IF NOT EXISTS public.entitlements (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL,
  module_key          text        NOT NULL,
  source              text        NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  -- ⚠️ NULL MEANS UNCAPPED, NOT ZERO. This is the single most misread column in the schema.
  -- It is NULL for every non-GHG row, for pre-migration customers, and for sales-managed
  -- accounts bought above the self-serve bands. enforce_ghg_location_allowance() reads it as
  --   IF allowance IS NOT NULL AND loc_count > allowance THEN RAISE …
  -- so absence is PERMISSION: a missing value grants unlimited locations and raises nothing.
  -- That polarity has already caused one live defect — every manually-invoiced GHG customer
  -- ran uncapped because the invoice route omitted the metadata key that fills this in. See
  -- lib/entitlementMetadata.test.ts, which exists solely to keep that key present in both
  -- writers. Treat a NULL here as a claim that the customer may use as many locations as they
  -- like, because that is exactly what the trigger will do.
  location_allowance  integer     NULL,

  -- ⚠️ NO DEFAULT ON EITHER COLUMN, DELIBERATELY, AND BOTH ARE NOT NULL. A manual INSERT that
  -- omits them FAILS — it does not quietly take now(), and it does not take a guessed term.
  -- That is the intended behaviour: a licence term is a commercial fact about what was bought,
  -- not something a database should invent on a customer's behalf. Anything writing this table
  -- by hand must supply both values explicitly.
  --
  -- The application derives both from ONE place, lib/entitlementTerm.ts, which the Stripe
  -- webhook calls for the card path and the invoice path alike. Do not compute a term in SQL:
  -- a second +365 that agrees today and drifts later is precisely what that module prevents.
  term_start          timestamptz NOT NULL,
  term_end            timestamptz NOT NULL,

  PRIMARY KEY (id),
  UNIQUE (user_id, module_key)
);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Enabled, NOT forced. NO FORCE is what lets the service-role client (the Stripe webhook)
-- write without a policy of its own; forcing RLS would apply policies to the table owner too
-- and silently break every grant on the paid path.
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements NO FORCE ROW LEVEL SECURITY;

-- ── Policy: read own entitlements ────────────────────────────────────────────
-- SELECT ONLY, AND THAT IS THE WHOLE POLICY SET. There is no INSERT, UPDATE or DELETE policy,
-- so no customer can grant themselves a module, extend their own term, or clear their own
-- location cap. Writes are service-role only and the Stripe webhook is the sole writer.
--
-- THIS POLICY IS LOAD-BEARING FOR CODE THAT LOOKS UNSCOPED. Four readers query this table with
-- NO user_id filter and rely entirely on this policy to scope the result to the caller:
--   lib/useEntitlement.ts:35, :82 · app/dashboard/page.tsx:212 · app/api/checkout/route.ts:135
-- Widen or drop this policy and every signed-in account reads every row — which is to say,
-- holds every module. Any change here must be made against those four call sites, not alone.
--
-- Note it does NOT filter on term_end: an expired row is still SELECTable, so expiry is not
-- enforced by this policy today. Both SECURITY DEFINER triggers bypass RLS entirely and would
-- not see such a filter anyway.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'entitlements'
      AND policyname = 'read own entitlements'
  ) THEN
    CREATE POLICY "read own entitlements"
      ON public.entitlements
      FOR SELECT
      TO public
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the CREATE) ──
-- 1) Columns?   select column_name, data_type, is_nullable, column_default
--               from information_schema.columns
--               where table_schema = 'public' and table_name = 'entitlements'
--               order by ordinal_position;
-- 2) Indexes?   select indexname, indexdef from pg_indexes
--               where schemaname = 'public' and tablename = 'entitlements';
--               -- expect entitlements_pkey and entitlements_user_id_module_key_key
-- 3) RLS?       select relrowsecurity, relforcerowsecurity from pg_class
--               where oid = 'public.entitlements'::regclass;   -- expect true, false
-- 4) Policies?  select policyname, cmd, roles, qual from pg_policies
--               where schemaname = 'public' and tablename = 'entitlements';
--               -- expect exactly ONE row: "read own entitlements" / SELECT
-- 5) Grants?    select grantee, privilege_type from information_schema.role_table_grants
--               where table_schema = 'public' and table_name = 'entitlements';
--               -- NOT reproduced by this file; capture separately (see header).
