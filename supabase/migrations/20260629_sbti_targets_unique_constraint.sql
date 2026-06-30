-- supabase/migrations/20260629_sbti_targets_unique_constraint.sql
-- Add a UNIQUE (company_id, scope, target_type) constraint to sbti_targets.
--
-- Purpose: enforce one target per (company, scope, target_type) — e.g. a single
-- near-term Scope 1 target per company — so the Step 3 save can use a real
-- `upsert ... on conflict (company_id, scope, target_type)` instead of the
-- delete-then-insert workaround it uses today (there was no unique key to conflict on).
--
-- Forward ALTER migration, NOT an edit to the create-table file: 20260625_sbti_core_tables.sql
-- is already applied to Supabase, and `create table if not exists` SKIPS on re-run — so a
-- constraint added there would look right in the file but never reach the live table.
-- ALTER ... ADD CONSTRAINT is the only thing that reaches the live table.
--
-- DEPENDS ON 20260625_sbti_core_tables.sql — apply that first (it creates sbti_targets).
-- Re-runnable: wrapped in a duplicate_object guard (Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS), so re-running is a no-op rather than an error.
--
-- ⚠️ SCOPE-KEY BOUNDARY (read before changing): this 3-column key is correct for
-- TOTAL-scope targets where s3_category is null — the current near-term design and the
-- planned net-zero design (one row per company × scope × target_type). It INTENTIONALLY
-- does NOT include s3_category. If per-category Scope 3 targets are ever introduced
-- (multiple s3 / near_term rows distinguished by s3_category), THIS CONSTRAINT MUST BE
-- EXTENDED to (company_id, scope, target_type, s3_category) — otherwise it will reject
-- legitimate per-category rows as duplicates. We are NOT doing per-category targets now.

do $$
begin
  alter table public.sbti_targets
    add constraint sbti_targets_company_scope_type_uniq unique (company_id, scope, target_type);
exception
  when duplicate_object then null; -- constraint already exists → no-op (re-runnable)
end $$;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--   select conname, contype from pg_constraint
--   where conrelid = 'public.sbti_targets'::regclass
--     and conname = 'sbti_targets_company_scope_type_uniq';   -- expect 1 row, contype = 'u'
