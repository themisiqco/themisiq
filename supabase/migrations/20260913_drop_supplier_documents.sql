-- 20260913_drop_supplier_documents.sql
--
-- NOT RUN. Propose only.
--
-- Drops public.supplier_documents. The case for removing it is that it was never designed:
--
--   · NO CREATION MIGRATION. It has no CREATE TABLE anywhere in this repo. The supplier-portal
--     schema file (20260618_supplier_portal_schema.sql) names three tables and only three —
--     supplier_campaigns, campaign_suppliers, supplier_responses — and is itself a reconstruction
--     from application code of tables already live. This one is not in that set.
--
--   · NO BUCKET FOR file_path TO REFERENCE. Two Storage buckets exist, source-documents and
--     cbam-source-documents, both created by migration and both scoped to a user-id path prefix.
--     Neither is for suppliers, and no supplier bucket is defined anywhere. The file_path column
--     has never had a namespace to point into.
--
--   · NO APPLICATION CODE. Repo-wide grep across app/ and lib/ returns nothing. No route, no
--     component, no RPC, no script.
--
--   · NO UI AFFORDANCE, NOT EVEN A DISABLED ONE. The supplier portal has no file input, live or
--     commented, and the questionnaire templates support radio, number, text, textarea and
--     checkbox — there is no upload question type. A supplier has never had a way to produce a row.
--
--   · FOUND IN PRODUCTION WITH A PUBLIC POLICY, AND PATCHED RATHER THAN DESIGNED. On 2026-07-07 it
--     was discovered with RLS disabled, a permissive policy (roles = public, qual = true), and full
--     DML held by anon and authenticated — anyone with the anon key could read or write every row.
--     20260707_supplier_documents_rls_fix.sql closed that and recorded the reasoning, including
--     that the table was already orphaned. That remediation is the only intent ever written down
--     for this table, and it is a security fix, not a design.
--
-- Since then it has carried maintenance cost for nothing: it was swept again in
-- 20260908_supply_chain_rls_initplan.sql, and scripts/erase-account.mjs classifies it as a
-- cascade-closure table that an account erasure has to walk.
--
-- It was confirmed empty in production on 13 September 2026 — select count(*) returned 0. The
-- pre-flight below re-checks anyway, because this file may be run later than that, or against a
-- rebuilt database, and a table with rows in it is a different decision from this one.
--
-- Dropping this table cannot be undone by replaying the repo. There is no CREATE TABLE in git to
-- restore it from, which is part of why it is going, and it also means that once this runs the
-- only surviving record of its shape is db/dumps/schema_public_20260819_0800.sql. Take a fresh
-- schema dump first if there is any chance the shape is wanted later.

begin;

-- Pre-flight: refuse if it is not empty. Finding that out after the DROP is not an option.
do $$
declare v_n bigint;
begin
  if to_regclass('public.supplier_documents') is null then
    raise exception 'Pre-flight: public.supplier_documents does not exist. Nothing to drop.';
  end if;
  execute 'select count(*) from public.supplier_documents' into v_n;
  if v_n <> 0 then
    raise exception 'Pre-flight: public.supplier_documents holds % row(s). This migration is written for an empty table; decide what those rows are before dropping.', v_n;
  end if;
end $$;

-- No inbound foreign keys, no view, no function, no trigger depends on it (verified against
-- db/dumps/schema_public_20260819_0800.sql), so RESTRICT is deliberate: if anything has been added
-- since that dump, this fails loudly rather than cascading into it.
drop table public.supplier_documents restrict;

-- Post-flight.
do $$
begin
  if to_regclass('public.supplier_documents') is not null then
    raise exception 'Post-flight: public.supplier_documents still exists.';
  end if;
  raise notice 'public.supplier_documents dropped. scripts/erase-account.mjs derives its table classification from pg_catalog at run time and never names this table, so it needs no edit — its total simply drops from 74 to 73.';
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor; do not trust the DROP) ──
-- 1) Gone?
--    select to_regclass('public.supplier_documents');          -- expect null
-- 2) Its policy went with it?
--    select * from pg_policies where tablename = 'supplier_documents';   -- expect no rows
-- 3) The three portal tables are untouched?
--    select count(*) from public.supplier_campaigns;
--    select count(*) from public.campaign_suppliers;
--    select count(*) from public.supplier_responses;
