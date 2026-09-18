-- 20260917_scope3_coverage.sql
--
-- RUN. APPLIED 17 SEP 2026, IN THE SUPABASE SQL EDITOR, on the day it was written.
--
-- VERIFIED AFTERWARDS:
--   · All five columns present on public.scope3_inventories, every one NULLABLE with no default:
--     scope3_categories_in_total, scope3_categories_relevant, scope3_categories_unpriced,
--     scope3_coverage (jsonb), scope3_exclusions_unjustified.
--   · The one existing row read NULL on all five until it was re-saved. ⚠️ THAT IS THE RULE WORKING, NOT A
--     MISSING BACKFILL: a row saved before this migration has a total and no record of what it covers, and
--     that is unknown rather than complete. See the null section below.
--   · After a save from the wizard: relevant 12, in_total 1, unpriced 0, unjustified 1, and a
--     fifteen-entry coverage map with mt null on every category except the one that was calculated.
--     A total covering ONE of TWELVE claimed categories is exactly the case a consumer could not see
--     before — and the one the SBTi dashboard would otherwise have taken as a Scope 3 baseline.
--
-- WHAT IT DOES: adds five nullable columns to public.scope3_inventories so a saved Scope 3 total says
-- what it is a total OF. Nothing else changes: no constraint on existing data, no backfill, no policy,
-- no grant, no index.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: A BARE NUMBER CANNOT SAY WHETHER IT COVERS TWO CATEGORIES OR FIFTEEN
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- total_scope3_tco2e is read well beyond the calculator: lib/ghg/loadSeries.ts embeds it per inventory,
-- lib/ghg/series.ts adds it to Scope 1 and 2 for allScopesTotal, the trends dashboard stacks it as the
-- Scope 3 bar, and the SBTi dashboard takes it as a Scope 3 BASELINE. A baseline is fixed for the life of
-- a target, so a figure covering two categories, consumed as though it covered fifteen, produces a target
-- that is wrong for every year after it — and nothing on any of those surfaces can currently tell.
--
-- series.ts already carries gwpConsistent and estimationConsistent for exactly this class of risk: facts
-- that do not invalidate a figure but decide whether two figures may be compared. Coverage is the third.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️ NULL MEANS UNKNOWN, NOT COMPLETE, AND THERE IS NO BACKFILL
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Every row saved before this migration has a total and no coverage. That is genuinely UNRECORDED: the
-- categories a customer claimed are a judgement they made in the wizard, and nothing in the stored row
-- preserves it, so it cannot be reconstructed after the fact. Writing 15 of 15 would assert a completeness
-- nobody stated; writing 0 of 0 would assert an empty inventory. Both are inventions, so the columns stay
-- NULL and every consumer must render "coverage not recorded for this year" rather than assume a side.
-- This is the same distinction pct_estimated already draws with its null for a wholly manual inventory.
--
-- A row saved AFTER this migration with nothing answered is a different thing: zeros and fifteen
-- 'not_evaluated' entries. Recorded and empty, not unknown.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY BOTH THE MAP AND THE COUNTS
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Every count below is derivable from scope3_coverage. They are stored anyway, for two reasons:
--   1. A CONSUMER READING A TREND SHOULD NOT HAVE TO PARSE JSONB TO ANSWER "HOW MANY". loadSeries.ts
--      selects a column list per inventory and maps it into a series; asking it to walk a jsonb map for
--      every year to compute a count puts the same derivation in every consumer, which is how two
--      consumers come to disagree.
--   2. THE DENOMINATOR IS A CUSTOMER JUDGEMENT THAT CANNOT BE RECONSTRUCTED LATER. "Relevant" is an
--      answer the customer gave on a particular day, against the categories as they then understood
--      them. Recomputing it later from whatever the row holds would quietly restate their judgement.
-- The map answers the question the counts cannot: WHICH categories. Two years both at 6 of 15 are not
-- comparable if they are different sixes, and that is precisely the comparison series.ts exists to guard.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RE-RUNNING
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- INERT, READ FROM THE STATEMENTS AND NOT FROM THE FACT THAT IT HAS ALREADY RUN. The file holds one
-- ALTER TABLE whose five clauses are each `add column if not exists`, and five `comment on column`
-- statements. `add column if not exists` is a no-op when the column is present; `comment on` overwrites a
-- comment with the identical text. No statement reads, writes, moves or deletes a row, and none has a
-- default, so nothing is backfilled on a re-run any more than it was on the first run. The one cost is the
-- ACCESS EXCLUSIVE lock ALTER TABLE takes for the moment it runs, even when it adds nothing — momentary
-- here, because adding a nullable column with no default does not rewrite the table.

begin;

alter table public.scope3_inventories
  add column if not exists scope3_categories_relevant     integer,
  add column if not exists scope3_categories_in_total     integer,
  add column if not exists scope3_categories_unpriced     integer,
  add column if not exists scope3_exclusions_unjustified  integer,
  add column if not exists scope3_coverage                jsonb;

comment on column public.scope3_inventories.scope3_categories_relevant is
  'How many of the 15 Scope 3 categories the customer answered as RELEVANT — the claim this total is made '
  'against. NULL = not recorded (every row saved before 20260917_scope3_coverage.sql); it does NOT mean 15, '
  'and it does not mean 0. A row saved after that migration with nothing answered records 0.';

comment on column public.scope3_inventories.scope3_categories_in_total is
  'How many categories actually contributed to total_scope3_tco2e: relevant, calculated, priced and '
  'non-zero. Read beside scope3_categories_relevant as "N of M". NULL = not recorded.';

comment on column public.scope3_inventories.scope3_categories_unpriced is
  'How many CLAIMED categories produced no figure because the platform could not price them — no active '
  'factor edition, or no factor for the selected sector. Distinct from "relevant, not yet calculated", '
  'which is a category the customer has not filled in: this one is a platform failure, and a baseline '
  'missing a category for this reason is a different defect from one the customer chose to leave empty. '
  'NULL = not recorded.';

comment on column public.scope3_inventories.scope3_exclusions_unjustified is
  'How many categories answered NOT RELEVANT carry no justification text. The GHG Protocol requires a '
  'justification for every excluded category in the report, so this records reporting readiness with the '
  'figures rather than only in the exported file. NULL = not recorded.';

comment on column public.scope3_inventories.scope3_coverage is
  'One entry per category id (cat1..cat15): {"status": <status key>, "mt": <number|null>, "in_total": '
  '<bool>}. Status keys are lib/scope3/categoryStatus.ts: relevant_calculated, relevant_not_calculated, '
  'not_relevant_calculated, not_relevant_not_calculated, not_evaluated. ⚠️ not_relevant_calculated carries '
  'a figure that is NOT in the total: a category the customer calculated, found immaterial, and excluded '
  'on that basis — the figure is the evidence for the exclusion. The counts above are all derivable from '
  'this map and are stored separately anyway: a consumer reading a trend should not have to parse jsonb to '
  'answer "how many", and the relevant-count is a customer judgement that cannot be reconstructed later. '
  'The map answers what the counts cannot — WHICH categories — so two years at 6 of 15 can be compared '
  'rather than assumed equivalent. NULL = not recorded.';

commit;

-- ── VERIFY (run on 17 Sep 2026; the outcome is recorded in the header above) ──────────────────
--
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'scope3_inventories'
--      and column_name like 'scope3_%'
--    order by column_name;
--   -- expect: scope3_categories_in_total, scope3_categories_relevant, scope3_categories_unpriced,
--   --         scope3_coverage, scope3_exclusions_unjustified — all YES (nullable)
--
--   select count(*) as rows_total,
--          count(scope3_coverage) as rows_with_coverage
--     from public.scope3_inventories;
--   -- rows_with_coverage = 0 immediately after this migration: nothing is backfilled, and only a save from
--   -- the wizard writes these columns. Observed 17 Sep 2026, and it became 1 once the one existing row was
--   -- re-saved.
