-- supabase/migrations/20260846_materiality_assessment_period.sql
-- materiality_assessments: record WHICH PERIOD an assessment covers, and make updated_at true.
--
-- WHY BOTH IN ONE FILE. ESRS 2 IRO-1 para 35(e) asks when the undertaking last updated its
-- materiality assessment. Answering it needs two facts this table cannot currently supply: the
-- period the assessment covers, and when it last changed. Neither exists today, and the second is
-- worse than absent - see the updated_at block below.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260846_materiality_assessment_period.sql
-- Without it psql continues past a failed statement and still exits 0, so a migration can land
-- half-applied while the transcript reads clean - columns present, constraints missing, trigger
-- absent. The Supabase SQL editor stops on error by default and needs no flag. Either way this file
-- is wrapped in begin/commit, so a failure rolls the whole thing back rather than leaving a partial
-- state behind.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable - ADD COLUMN IF NOT EXISTS,
-- drop-then-add constraints, DROP TRIGGER IF EXISTS before CREATE, and COMMENT ON is idempotent.
--
-- NO RLS OR GRANT CHANGE. materiality_assessments already carries four per-verb policies gating on
-- user_id = auth.uid(); new columns are covered by them automatically, as 20260730_deals_size_limbs
-- records for the same situation on deals.
--
--
-- =====================================================================
-- 1. THE REPORTING PERIOD - NULLABLE, AND THAT IS THE DESIGN
-- =====================================================================
-- ABSENCE OF DATA IS NOT A VALUE. An assessment with no period recorded must stay distinguishable
-- from every possible default, and nothing may infer one. There is no NOT NULL, no DEFAULT, and no
-- backfill: an existing row's period is genuinely unknown, and writing a guess would make it
-- indistinguishable from a period someone actually stated.
--
-- ⚠️ created_at IS NOT A FALLBACK FOR IT. The two answer different questions - when the record was
-- made, versus which period the assessment covers - and an assessment prepared in January for the
-- prior financial year makes them differ by a year. app/dashboard/stakeholder/[id]/report/page.tsx
-- already states the absence honestly rather than substituting anything:
--     reporting_period: null,   // "Not recorded on the assessment today. Stated as absent rather
--                               //  than invented - the cover prints 'Not stated' and that is the truth."
-- and lib/pdf/layout.ts renders ['Reporting period', fields.period ?? 'Not stated'].
-- That behaviour is correct and must survive this change: a surface reading these columns prints
-- "Not stated" when they are null, and never falls back to created_at, updated_at, or a round date.
--
-- TWO CONSTRAINTS, AND THEY COMPOSE. Both-or-neither makes a half-stated period unstorable; the
-- order check then only has to handle the both-present case.
--
--
-- =====================================================================
-- 2. updated_at - A NAME THAT DID NOT MATCH ITS MECHANISM
-- =====================================================================
-- The column has existed since the table was created, as
--     updated_at timestamp with time zone DEFAULT now() NOT NULL
-- with NO TRIGGER on this table and NO application write anywhere. Verified 21 Aug 2026: the schema
-- dump carries seven references to materiality_assessments - two indexes, four policies, one
-- constraint comment - and not one CREATE TRIGGER; and the only app-side writes of updated_at in the
-- codebase are in the GHG and Deals modules.
--
-- So it was set once by DEFAULT now() at insert and never advanced. NOT NULL made it always look
-- populated, and the name asserted a fact the mechanism never delivered - the failure mode being a
-- report that answers "when did you last update your assessment" with the date the row was created,
-- confidently and wrongly.
--
-- The fix is the trigger materiality_survey_rounds already uses, so both tables in this module
-- maintain the column the same way and neither is the odd one out.
--
-- ⚠️ EXISTING VALUES ARE CREATION TIMESTAMPS AND STAY THAT WAY. The trigger fires on UPDATE only; it
-- does not and cannot correct history. Every row not updated after this migration still holds its
-- insert time under a column named updated_at.
--     updated_at IS ONLY TRUSTWORTHY FOR ROWS UPDATED AFTER THIS MIGRATION RAN.
-- DELIBERATELY NOT BACKFILLED. There is no true value to backfill TO - the real last-update time was
-- never recorded and is not recoverable - and writing now() would be worse than the current state:
-- it would replace a wrong-but-explicable value with a fabricated one that looks correct.
--
--
-- =====================================================================
-- 3. WHAT IRO-1 35(e) SHOULD ACTUALLY BE ANSWERED FROM
-- =====================================================================
-- Recorded on the table itself, below, because the next person to build that disclosure will reach
-- for updated_at by name and it is the wrong column even once the trigger is attached. See the table
-- comment for the reasoning.

begin;

-- ── 1. Period columns ────────────────────────────────────────────────────────
alter table public.materiality_assessments
  add column if not exists reporting_period_start date,
  add column if not exists reporting_period_end   date;

-- Both or neither. `(a is null) = (b is null)` is total: both null passes, both set passes, exactly
-- one set fails. A half-stated period is not a partial answer, it is an unusable one - a surface
-- cannot print "1 January to Not stated".
alter table public.materiality_assessments
  drop constraint if exists materiality_assessments_reporting_period_both_or_neither;
alter table public.materiality_assessments
  add  constraint materiality_assessments_reporting_period_both_or_neither
  check ((reporting_period_start is null) = (reporting_period_end is null));

-- End strictly after start. Guarded on start being null so it is vacuously true when no period is
-- stated; the constraint above is what guarantees end is null in that case too.
alter table public.materiality_assessments
  drop constraint if exists materiality_assessments_reporting_period_order;
alter table public.materiality_assessments
  add  constraint materiality_assessments_reporting_period_order
  check (reporting_period_start is null or reporting_period_end > reporting_period_start);

comment on column public.materiality_assessments.reporting_period_start is
  'First day of the period this assessment covers. NULL = NOT STATED, a real and common state - not a default, not an error, and never inferred. Report surfaces print "Not stated" when this is null (see lib/pdf/layout.ts and app/dashboard/stakeholder/[id]/report/page.tsx) and MUST NOT substitute created_at, updated_at, or a survey round date: those answer when the record was made or when people answered, not which period was assessed. Set together with reporting_period_end or not at all - materiality_assessments_reporting_period_both_or_neither.';

comment on column public.materiality_assessments.reporting_period_end is
  'Last day of the period this assessment covers, strictly after reporting_period_start. NULL = NOT STATED - see reporting_period_start, which carries the full note. Report surfaces print "Not stated" when null and must never substitute created_at.';

-- ── 2. updated_at trigger ────────────────────────────────────────────────────
-- Same function and same shape as materiality_survey_rounds_set_updated_at, so the two tables in
-- this module cannot drift in how they maintain the column.
drop trigger if exists materiality_assessments_set_updated_at on public.materiality_assessments;
create trigger materiality_assessments_set_updated_at
  before update on public.materiality_assessments
  for each row execute function public.sbti_set_updated_at();

-- ── 3. Table comment ─────────────────────────────────────────────────────────
-- No table comment existed before this (checked against the 19 Aug schema dump), so this destroys
-- nothing. The standard_version column comment is untouched.
comment on table public.materiality_assessments is
  'One double-materiality assessment. Tenancy is user_id = auth.uid() - organization_id exists and is indexed but NO policy reads it. Several assessments may exist for one company and one period: nothing constrains that, and until reporting_period_start/end are populated nothing could. ⚠️ ESRS 2 IRO-1 para 35(e) - "when the undertaking last updated its materiality assessment" - SHOULD BE ANSWERED FROM max(determined_at) ACROSS SUBMITTED DETERMINATIONS, NOT FROM updated_at. Two reasons. First, updated_at advances on ANY update to this row, including one that changes a company name or a scenario code and concludes nothing, so it overstates - it is a row-touched timestamp, not an assessment-updated one. Second, it is only trustworthy at all for rows updated after migration 20260846 attached its trigger; before that it was set once at insert by DEFAULT now() and never advanced, so historical values are creation timestamps wearing the wrong name, and were deliberately not backfilled because the true value was never recorded. determined_at is written when a determination is actually concluded, which is the event the paragraph is asking about.';

commit;

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'materiality_assessments'
--      and column_name in ('reporting_period_start','reporting_period_end');
--   -- expect 2 rows, date, YES, null default
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.materiality_assessments'::regclass
--      and conname like '%reporting_period%';
--   -- expect both_or_neither and order
--
--   select tgname from pg_trigger
--    where tgrelid = 'public.materiality_assessments'::regclass and not tgisinternal;
--   -- expect materiality_assessments_set_updated_at
--
--   -- and prove the trigger fires (rolls back, changes nothing):
--   begin;
--     select id, updated_at from public.materiality_assessments limit 1;
--     update public.materiality_assessments set company_name = company_name
--      where id = (select id from public.materiality_assessments limit 1);
--     select id, updated_at from public.materiality_assessments limit 1;  -- expect a later value
--   rollback;
