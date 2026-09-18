-- 20260917_scope3_coverage_dq.sql
--
-- RUN. APPLIED 17 SEP 2026, IN THE SUPABASE SQL EDITOR, on the day it was written.
--
-- VERIFIED AFTERWARDS by reading the comment back with col_description (the query at the foot of this
-- file): the live comment on public.scope3_inventories.scope3_coverage carries the `dq` key, PCAF's 1-to-5
-- scale with what 1 and 5 mean, that the score is fractional because a portfolio's is weighted by each
-- holding's emissions, that it is ABSENT rather than null for the fourteen categories whose methods define
-- no such scale, and that it is absent wherever mt is null.
--
-- The five-key text applied by 20260917_scope3_coverage_comment.sql is no longer what the column holds;
-- that file is left exactly as it ran, which is the point of this one.
--
-- WHAT IT DOES: replaces the COMMENT on public.scope3_inventories.scope3_coverage with one that describes
-- the sixth entry key, `dq`. One statement. No column is added, altered or dropped; no row is read, written
-- or deleted; no policy, grant, index or constraint is touched. The jsonb column already accepts the key —
-- this migration changes only the documentation of what a reader will find in it.
--
-- ⚠️ IT SUPERSEDES 20260917_scope3_coverage_comment.sql, WHICH HAS RUN. That file is left exactly as it
-- ran, for the reason its own header gives: an executed file is a record of what was executed, and editing
-- it would make the repo's text differ from the text that was applied. A correction gets its own file.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: A METHOD'S OWN DATA-QUALITY SCORE IS NOT DERIVABLE FROM ANYTHING ELSE IN THE RECORD
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- Category 15 is now assessed holding by holding: each investee's own emissions multiplied by the
-- outstanding amount over the value its PCAF asset class attributes on. PCAF scores the INVESTEE DATA on a
-- 1-to-5 scale — 1 is a verified reported figure, 5 a spend proxy — and a portfolio's score is that scale
-- weighted by each holding's emissions, so it is fractional. A verifier reading a financed-emissions figure
-- asks for that score first, and nothing else in the stored row carries it: the figure, the status and the
-- category counts are all silent about it.
--
-- ⚠️ PRESENT ONLY WHERE A METHOD DEFINES SUCH A SCALE, WHICH TODAY IS CAT 15 ALONE. The other fourteen
-- entries omit the key rather than carrying null. The scale is PCAF's, and there is no sense in which an
-- EXIOBASE spend estimate or a DEFRA waste factor is "a 2" or "a 5" on it — a column of nulls beside PCAF
-- scores invites exactly that reading, and a consumer that averaged them would produce a number meaning
-- nothing. An absent key says the question does not apply; a null would say it applies and is unknown.
--
-- ⚠️ AND IT IS NOT THEMISIQ'S CONFIDENCE LABEL. The dashboard's own high/medium/low pill is derived by
-- ThemisIQ and describes the data loosely. `dq` is the number the METHOD's own standard defines, carried
-- verbatim so a CDP or assurance submission quotes PCAF rather than us. Do not merge the two.
--
-- The shape is enforced in lib/scope3/categoryStatus.ts (coverageEntry), which now holds three invariants:
-- a calculated entry is never unpriced, a reason belongs only to an unpriced entry, and A SCORE CANNOT
-- OUTLIVE THE FIGURE IT DESCRIBES — dq is dropped wherever mt is null.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RE-RUNNING
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- INERT, read from the statement: COMMENT ON COLUMN replaces the column's comment with the given text. Run
-- twice, the second run writes the same string over itself. It takes a lock on the table's catalogue entry
-- for the moment it runs and touches no data, no column definition and no row.

comment on column public.scope3_inventories.scope3_coverage is
  'One entry per category id (cat1..cat15): {"status": <status key>, "mt": <number|null>, "in_total": '
  '<bool>, "unpriced": <bool>, "reason": <text|null>, "dq": <number, present only for a method that '
  'defines a data-quality scale>}. Status keys are lib/scope3/categoryStatus.ts: relevant_calculated, '
  'relevant_not_calculated, not_relevant_calculated, not_relevant_not_calculated, not_evaluated. mt is '
  'null wherever nothing was calculated — never 0, which would claim the category emits nothing. '
  '⚠️ not_relevant_calculated carries a figure that is NOT in the total: a category the customer '
  'calculated, found immaterial, and excluded on that basis, where the figure is the evidence for the '
  'exclusion. ⚠️ unpriced means the customer supplied what the method needs and the platform still '
  'produced no figure; it is FALSE for a category simply not filled in yet, whose CDP status is identical '
  '— unpriced is a property of the entry, not a status. reason is the wizard''s own sentence for that '
  'category, verbatim, and is present only when unpriced. ⚠️ dq is the METHOD''s own data-quality score, '
  'not ThemisIQ''s confidence label: PCAF 1-to-5 for cat15 (1 = investee''s verified reported emissions, '
  '5 = spend proxy), fractional because a portfolio''s score is weighted by each holding''s emissions. It '
  'is ABSENT, not null, for the fourteen categories whose methods define no such scale, and absent '
  'wherever mt is null — a score cannot describe a figure that does not exist. The counts in the sibling '
  'columns are all derivable from this map and are stored separately anyway: a consumer reading a trend '
  'should not have to parse jsonb to answer "how many", and the relevant-count is a customer judgement '
  'that cannot be reconstructed later. The map answers what the counts cannot — WHICH categories — so two '
  'years at 6 of 15 can be compared rather than assumed equivalent. NULL = not recorded.';

-- ── VERIFY (run on 17 Sep 2026; the outcome is recorded in the header above) ──────────────────
--
--   select col_description('public.scope3_inventories'::regclass, ordinal_position) as comment
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'scope3_inventories'
--      and column_name = 'scope3_coverage';
--   -- Observed 17 Sep 2026: the text above, including the "dq" key, its PCAF scale, "ABSENT, not null"
--   -- for the fourteen categories without such a scale, and absent wherever mt is null.
--
--   -- ⚠️ NOT YET OBSERVED, because it needs a Cat 15 inventory with holdings saved from the wizard, and
--   -- the write path was still in the working tree when this ran. Run it after the first such save; it is
--   -- the check that dq rides with a figure and only with a figure:
--   select inventory_id,
--          scope3_coverage->'cat15'->>'mt' as cat15_mt,
--          scope3_coverage->'cat15'->>'dq' as cat15_dq,
--          (select count(*) from jsonb_each(scope3_coverage) e where e.value ? 'dq') as entries_with_dq
--     from public.scope3_inventories
--    where scope3_coverage is not null;
--   -- expect: entries_with_dq is 0 or 1, and 1 only where cat15_mt is not null.
