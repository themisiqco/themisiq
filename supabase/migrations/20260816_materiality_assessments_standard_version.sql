-- 20260816_materiality_assessments_standard_version.sql
--
-- Adds materiality_assessments.standard_version — which ESRS version an assessment was prepared
-- under. Column + CHECK + one-shot backfill. No other column touched, no RLS change, no grant
-- change (table-level privileges cover a new column; there are no column-level grants here).
--
--
-- WHY IT IS A REAL COLUMN AND NOT A jsonb KEY
-- Article 2(2) of Commission Delegated Regulation C(2026) 5010 requires the undertaking to STATE
-- which ESRS version it applied for a financial year beginning between 1 Jan and 31 Dec 2026. A
-- legally required statement needs to be CHECK-constrained, queryable ("which assessments were
-- prepared under esrs_2023_reliefs?"), and impossible to omit silently — none of which jsonb
-- gives you, where a missing key reads as undefined and renders blank.
--
-- It follows model_version exactly: that is already BOTH a top-level column and a key inside
-- workings. Same here — the column is the queryable disclosure, and workings.input.standardVersion
-- rides along in the audit blob so the engine input and the disclosure cannot disagree.
--
--
-- WHY NULLABLE — THIS IS THE LOAD-BEARING DECISION
-- NULL means NOT STATED. That is a real, honest, permitted state, not a missing value:
--
--   * The backfill below CANNOT distinguish 'esrs_2023' from 'esrs_2023_reliefs'. The reliefs are
--     a reporting choice the module never captured, so any historical row could be either. Where
--     the two are indistinguishable, one of them is asserted only by guessing.
--   * The wizard does not send standardVersion, and fixing that needs new UX (it must ASK before
--     it can state). Until then every assessment created through the UI writes NULL.
--
-- A NULL MUST RENDER AS "Not stated" AND NEVER AS AN ASSUMED VERSION. An assumed value is worse
-- than an absent one: absent is honest and visibly incomplete, whereas an assumed one is a false
-- statement about which law was applied, made in the undertaking's name, in a document a verifier
-- reads. app/dashboard/materiality/report/page.tsx renders it exactly that way, on the report's
-- face rather than in an appendix.
--
--
-- WHY THE BACKFILL IS SAFE, AND WHY IT IS INSIDE THE ADD-COLUMN GUARD
-- Backfilling existing rows to 'esrs_2023' is VERIFIABLE, not a guess: every assessment to date
-- scored against the only taxonomy that exists in the database, and each one has its labels frozen
-- into its own results jsonb to prove it. (The 2023-vs-reliefs ambiguity above is why the column
-- stays nullable regardless; it is not a reason to leave these rows blank, since 'esrs_2023' is
-- true of all of them at taxonomy level.)
--
-- ⚠️ BUT THE BACKFILL MUST NEVER RUN TWICE, AND THAT IS NOT A THEORETICAL CONCERN.
-- A plain `update ... where standard_version is null` would be correct today and CORRUPTING
-- tomorrow: once the route is live, NULL stops meaning "pre-versioning row" and starts meaning
-- "the undertaking did not state a version". A routine replay of this file would then silently
-- rewrite every honest "not stated" record into an assertion that ESRS (2023) was applied —
-- converting an absent disclosure into a false one, on exactly the field Article 2(2) governs,
-- with no error and no trace.
--
-- So the backfill lives INSIDE the add-column guard. It runs only in the same execution that
-- creates the column, when every existing row is by definition pre-versioning. On any later run
-- the column already exists, the branch is skipped, and not one row is touched. That is the only
-- arrangement where "idempotent" and "correct" are the same thing here.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — see the guard above.
-- SHIPS WITH the Part 3 code change (routes + report). Applying it early is harmless: the column
-- is nullable and nothing writes it until the new route is live.

begin;

-- ── Column + one-shot backfill, together and only together ──
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'materiality_assessments'
      and column_name  = 'standard_version'
  ) then
    alter table public.materiality_assessments add column standard_version text;

    -- First application only. Every row that exists at this instant predates versioning, so the
    -- unqualified UPDATE is exactly right here and would be wrong anywhere else in this file.
    update public.materiality_assessments set standard_version = 'esrs_2023';

    raise notice 'standard_version added and % pre-versioning row(s) backfilled to esrs_2023.',
      (select count(*) from public.materiality_assessments);
  else
    raise notice 'standard_version already present — column and backfill both skipped, no rows touched.';
  end if;
end $$;

-- ── CHECK, added separately so it is repaired on replay even if the column pre-existed ──
-- NULL passes a `check (x in (...))` — the predicate evaluates to NULL, which is not FALSE — so
-- this constrains the stated values without forcing one. That is the behaviour we want.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.materiality_assessments'::regclass
      and conname  = 'materiality_assessments_standard_version_check'
  ) then
    alter table public.materiality_assessments
      add constraint materiality_assessments_standard_version_check
      check (standard_version in ('esrs_2023', 'esrs_2023_reliefs', 'esrs_2026'));
  end if;
end $$;

comment on column public.materiality_assessments.standard_version is
  'Which ESRS version this assessment was prepared under. NULL means NOT STATED — a real state, never an assumed version (Art. 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state it, and an assumed value would be a false statement about which law was applied). Historical rows were backfilled to esrs_2023 when this column was created; that backfill is one-shot and must never be repeated. Mirrors model_version: also present as workings.input.standardVersion.';

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Column exists, nullable, text:
--    select column_name, data_type, is_nullable, column_default
--    from information_schema.columns
--    where table_schema = 'public' and table_name = 'materiality_assessments'
--      and column_name = 'standard_version';
--    -- expect standard_version | text | YES | (null)
--
-- 2) The CHECK is present and admits exactly the three values:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.materiality_assessments'::regclass
--      and conname = 'materiality_assessments_standard_version_check';
--
-- 3) Every pre-existing row was backfilled; none left null on first application:
--    select standard_version, count(*) from public.materiality_assessments
--    group by standard_version order by 1;
--    -- expect a single row: esrs_2023 | <all existing assessments>
--    -- (After the Part 3 route is live, NULLs will start appearing here. That is correct —
--    --  they are assessments where no version was stated, not a defect.)
--
-- 4) NULL is accepted (this is what the wizard will write until the wizard UX task lands),
--    and an invented version is refused:
--    begin;
--      update public.materiality_assessments set standard_version = null
--       where id = (select id from public.materiality_assessments limit 1);   -- expect success
--      update public.materiality_assessments set standard_version = 'esrs_2027'
--       where id = (select id from public.materiality_assessments limit 1);
--      -- expect ERROR: violates check constraint "materiality_assessments_standard_version_check"
--    rollback;
--
-- 5) THE REPLAY PROOF — the one that matters. Re-run this whole file, then confirm nothing moved:
--    select standard_version, count(*) from public.materiality_assessments
--    group by standard_version order by 1;
--    -- expect IDENTICAL counts to step 3, including any NULLs. If a NULL count dropped to zero,
--    -- the backfill escaped its guard and has overwritten honest "not stated" disclosures.
--
-- 6) Grants and RLS are unchanged by adding a column — confirm rather than assume:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'materiality_assessments'
--    group by grantee order by grantee;
--    select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'materiality_assessments';
--    -- expect both to match what they were before this migration
