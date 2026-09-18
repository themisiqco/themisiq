-- 20260917_scope3_coverage_comment.sql
--
-- RUN. APPLIED 17 SEP 2026, IN THE SUPABASE SQL EDITOR, immediately after it was written.
--
-- VERIFIED AFTERWARDS by reading the comment back with col_description (the query at the foot of this
-- file): the live comment on public.scope3_inventories.scope3_coverage carries all five entry keys —
-- status, mt, in_total, unpriced and reason. The three-key text applied by 20260917_scope3_coverage.sql is
-- no longer what the column holds; that file is left exactly as it ran, which is the point of this one.
--
-- WHAT IT DOES: replaces the COMMENT on public.scope3_inventories.scope3_coverage with one that describes
-- the entry shape as it now is. One statement. No column is added, altered or dropped; no row is read,
-- written or deleted; no policy, grant, index or constraint is touched.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY A SEPARATE FILE RATHER THAN AN EDIT TO 20260917_scope3_coverage.sql
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- That migration HAS RUN — applied 17 Sep 2026 in the SQL editor — and its header now records that, with
-- what was verified afterwards. It is therefore a RECORD OF WHAT WAS EXECUTED, and editing it after the
-- fact would make it a record of something else: the comment text in this repo would no longer be the
-- comment that was applied, and the file's own "re-running is inert" claim would quietly stop being true,
-- because a re-run would then overwrite the live comment with different text.
--
-- This repo keeps finding that exact drift in both directions — headers saying NOT RUN about objects that
-- were live, and prose asserting a sweep had happened that never ran. The rule that comes out of it is
-- that an executed file is not revised; a correction gets its own file, with its own status line, so the
-- history reads as what happened rather than as what someone later wished had happened.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT CHANGED, AND WHY
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- The comment applied by the first migration described each entry as:
--
--     {"status": <status key>, "mt": <number|null>, "in_total": <bool>}
--
-- and that was accurate when it ran. The entry then gained TWO FIELDS, `unpriced` and `reason`, when a
-- category the PLATFORM could not price was separated from one the CUSTOMER has not filled in yet. Both
-- had been reaching the record as a bare "no figure", and they are not the same thing: one is a gap in
-- what we can do — no active factor edition, or no factor held for the selected sector — and the other is
-- simply the customer's turn. A baseline missing a category for the first reason is a defect; missing it
-- for the second is an unfinished inventory, and a consumer reading a trend has to be able to tell them
-- apart.
--
-- ⚠️ THE CAUSE SITS ON THE ENTRY BECAUSE THE CDP STATUS IS IDENTICAL FOR BOTH. CDP's Scope 3 evaluation
-- status asks two questions — is the category relevant, was it calculated — and both of these answer the
-- second one "no". Both are "Relevant, not yet calculated". Adding a sixth status key for the unpriced
-- case would have meant mapping it back to that label at every export, which is the sign of a vocabulary
-- that does not fit; `unpriced` (a boolean a consumer can branch on) and `reason` (the wizard's own
-- sentence for that category, verbatim) carry the cause without touching the label.
--
-- The shape is defined in lib/scope3/categoryStatus.ts (Scope3CoverageEntry, coverageEntry), which
-- enforces the two invariants this comment states: a calculated entry is never unpriced, and only an
-- unpriced entry carries a reason.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- RE-RUNNING
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- INERT, read from the statement: COMMENT ON COLUMN replaces the column's comment with the given text. Run
-- twice, the second run writes the same string over itself. It takes a lock on the table's catalogue entry
-- for the moment it runs and touches no data, no column definition and no row. The only state it can leave
-- behind is the comment below.

comment on column public.scope3_inventories.scope3_coverage is
  'One entry per category id (cat1..cat15): {"status": <status key>, "mt": <number|null>, "in_total": '
  '<bool>, "unpriced": <bool>, "reason": <text|null>}. Status keys are lib/scope3/categoryStatus.ts: '
  'relevant_calculated, relevant_not_calculated, not_relevant_calculated, not_relevant_not_calculated, '
  'not_evaluated. mt is null wherever nothing was calculated — never 0, which would claim the category '
  'emits nothing. ⚠️ not_relevant_calculated carries a figure that is NOT in the total: a category the '
  'customer calculated, found immaterial, and excluded on that basis, where the figure is the evidence for '
  'the exclusion. ⚠️ unpriced means the customer supplied what the method needs and the platform still '
  'produced no figure (no active factor edition, or no factor for the selected sector); it is FALSE for a '
  'category simply not filled in yet, whose CDP status is identical — unpriced is a property of the entry, '
  'not a status. reason is the wizard''s own sentence for that category, verbatim, and is present only '
  'when unpriced. The counts in the sibling columns are all derivable from this map and are stored '
  'separately anyway: a consumer reading a trend should not have to parse jsonb to answer "how many", and '
  'the relevant-count is a customer judgement that cannot be reconstructed later. The map answers what the '
  'counts cannot — WHICH categories — so two years at 6 of 15 can be compared rather than assumed '
  'equivalent. NULL = not recorded.';

-- ── VERIFY (run on 17 Sep 2026; the outcome is recorded in the header above) ──────────────────
--
--   select col_description('public.scope3_inventories'::regclass, ordinal_position) as comment
--     from information_schema.columns
--    where table_schema = 'public' and table_name = 'scope3_inventories'
--      and column_name = 'scope3_coverage';
--   -- Observed 17 Sep 2026: the text above, including the "unpriced" and "reason" keys.
