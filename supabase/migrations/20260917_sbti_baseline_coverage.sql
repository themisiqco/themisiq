-- 20260917_sbti_baseline_coverage.sql
--
-- RUN. APPLIED 17 SEP 2026, IN THE SUPABASE SQL EDITOR, on the day it was written.
--
-- VERIFIED AFTERWARDS:
--   · public.sbti_targets.baseline_scope3_coverage is present: jsonb, NULLABLE, no default.
--   · coverage_pct sits beside it UNTOUCHED — numeric, nullable, no default, and still written by
--     nothing. That is the point of the section below: it keeps its own meaning rather than acquiring a
--     second one.
--   · No row was backfilled. Every target committed before this ran reads NULL, which is "not recorded"
--     and cannot be recovered — see the null section below for the three states this column can hold.
--
-- WHAT IT DOES: adds one nullable jsonb column, public.sbti_targets.baseline_scope3_coverage, holding what
-- the target's Scope 3 base year COVERED at the moment the target was committed. One statement plus its
-- comment. No column is altered or dropped, no row is read, written or deleted, no policy, grant, index or
-- constraint is touched, and nothing is backfilled.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: A BASELINE IS A COMMITMENT MADE AT A MOMENT, AND SO IS WHAT IT COVERED
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- sbti_targets already freezes base_year_emissions_tco2e at commit, because an inventory edit must not
-- restate a target someone has already made. The same argument applies one level along: a Scope 3 target
-- set against a total covering 6 of 12 relevant categories is a different commitment from one covering 12
-- of 12, and the difference is invisible in the number.
--
-- ⚠️ IT MUST NOT TRACK THE LIVE INVENTORY. Scope 3 coverage grows as a customer answers more categories.
-- Reading coverage from today's inventory when describing a target set two years ago would silently
-- restate that target as broader than it was — the target would appear to cover 11 of 12 because the
-- inventory now does. Frozen beside the baseline figure it anchors, it stays a record of what was
-- committed.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ WHY NOT coverage_pct, WHICH ALREADY EXISTS ON THIS TABLE
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- sbti_targets.coverage_pct is a numeric column that EXISTS AND IS WRITTEN BY NOTHING — no route, no page,
-- no script sets it, and nothing reads it. It would have been the obvious place to put "6 of 12", and that
-- is the trap: in SBTi's own vocabulary coverage_pct is the share of EMISSIONS a target's boundary covers,
-- which is a different quantity from a count of categories. Six categories can be 95% of a footprint or
-- 5% of it. Writing a category ratio into a field that means an emissions share would put two meanings in
-- one column, and every later reader would have to know which one it held. The category counts get their
-- own column; coverage_pct stays empty and keeps its meaning for whenever it is filled.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ NULL MEANS NOT RECORDED. THERE IS NO BACKFILL
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- A target committed before this column existed has no record of what its baseline covered, and that fact
-- is not recoverable: the inventory has moved on, and the customer's relevance answers at that moment are
-- not stored anywhere else. NULL says exactly that. It does not mean the baseline covered nothing, and it
-- does not mean it covered everything.
--
-- A target committed AFTER this column exists, against a baseline whose own coverage was never recorded
-- (an inventory saved before 20260917_scope3_coverage.sql), stores a record with NULL COUNTS and an empty
-- category list. That is a third thing again: at commit we asked what the baseline covered and the answer
-- was unknown. Recorded-and-unknown is not the same as never-asked, and the write path keeps them apart.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RE-RUNNING
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- INERT, read from the statements: `add column if not exists` is a no-op when the column is present, and
-- `comment on column` overwrites the comment with the identical text. No data is read, written or removed,
-- and the column has no default, so no row is rewritten. The only cost is the ACCESS EXCLUSIVE lock ALTER
-- TABLE takes for the moment it runs, which does not rewrite the table for a nullable column with no
-- default.

begin;

alter table public.sbti_targets
  add column if not exists baseline_scope3_coverage jsonb;

comment on column public.sbti_targets.baseline_scope3_coverage is
  'What this target''s Scope 3 BASE YEAR covered, frozen at commit beside base_year_emissions_tco2e: '
  '{"relevant": <int|null>, "inTotal": <int|null>, "unpriced": <int|null>, "exclusionsUnjustified": '
  '<int|null>, "categories": [<category id>, ...]}. Mirrors BaselineScope3Coverage in lib/ghg/series.ts, '
  'which derives it from scope3_inventories.scope3_coverage for the baseline year. ⚠️ FROZEN, NOT LIVE: '
  'Scope 3 coverage grows as a customer answers more categories, and reading it live would restate a '
  'target set against 6 of 12 categories as one set against 12 of 12. ⚠️ NOT coverage_pct: that column '
  'means the share of EMISSIONS a target boundary covers, a different quantity from a count of '
  'categories, and it is currently written by nothing. NULL here = not recorded, for a target committed '
  'before this column existed; the baseline''s coverage at that moment cannot be recovered. A record whose '
  'counts are all null with an empty category list is different again: the question was asked at commit '
  'and the baseline year had no coverage recorded. Set only for scope = ''s3''.';

commit;

-- ── VERIFY (run on 17 Sep 2026; the outcome is recorded in the header above) ──────────────────
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'sbti_targets'
--      and column_name in ('baseline_scope3_coverage', 'coverage_pct')
--    order by column_name;
--   -- Observed 17 Sep 2026: baseline_scope3_coverage jsonb YES, coverage_pct numeric YES (untouched).
--
--   select count(*) as targets, count(baseline_scope3_coverage) as with_coverage
--     from public.sbti_targets;
--   -- Observed 17 Sep 2026: with_coverage = 0. Nothing is backfilled, and only a target saved from the
--   -- SBTi wizard writes it.
