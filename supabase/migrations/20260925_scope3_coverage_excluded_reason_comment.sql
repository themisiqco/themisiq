-- 20260925_scope3_coverage_excluded_reason_comment.sql
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  NOT RUN.  THIS MIGRATION HAS NEVER BEEN EXECUTED AGAINST ANY DATABASE.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- COMMENT ONLY. One statement. No column is added, altered or dropped; no row is read, written or
-- deleted; no policy, grant, index or constraint is touched. The jsonb column already accepts the key.
--
-- ⚠️ IT SUPERSEDES 20260917_scope3_coverage_dq.sql, WHICH HAS RUN, and that file is left exactly as it
-- ran. Third in the chain: 20260917_scope3_coverage_comment.sql applied five keys,
-- 20260917_scope3_coverage_dq.sql replaced it with six for `dq`, this one makes seven for
-- `excluded_reason`. An executed file is a record of what was executed, so a correction gets its own
-- file rather than an edit.
--
-- ⚠️ `comment on` REPLACES, IT DOES NOT APPEND. The whole comment is restated below, verbatim from the
-- file this supersedes except for the new key's sentences. Do not shorten it thinking the earlier files
-- still contribute: after this runs, this text is the entire column comment.
--
-- NON-ASCII IS UNAVOIDABLE HERE, unlike in 20260924_get_verifier_scope3.sql. The warning glyphs and
-- em-dashes are inside the comment's own VALUE, carried forward from the text that is already live, so
-- making the file ASCII would change what the column says rather than how the file is written.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY: A LIST OF EXCLUSIONS WITHOUT THEIR JUSTIFICATIONS IS A MISSING REQUIRED DISCLOSURE
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- GHG Protocol Scope 3 Standard chapter 11.1 obliges a report to list the categories excluded WITH
-- justification of their exclusion. The justification was captured, and it was captured in the one place
-- no verifier could reach it: cat_data[id].excluded_reason. get_verifier_scope3 withholds cat_data
-- wholesale and deliberately, because cat_data is working state while the coverage map is the filed
-- record, so the RPC disclosed the exclusions, disclosed the COUNT of unjustified ones through
-- scope3_exclusions_unjustified, and disclosed not one justification, justified or not. A verifier could
-- read that two exclusions lacked a reason, could not read the reasons that existed, and could not tell
-- which two the count meant.
--
-- ⚠️ A SEPARATE KEY, NOT THE EXISTING `reason`, AND THE DISTINCTION IS WHOSE WORDS THEY ARE. `reason` is
-- the PLATFORM's sentence for why it produced no figure. `excluded_reason` is the CUSTOMER's sentence for
-- why they judged a category irrelevant. One field holding both would mean two or three different things
-- depending on `status` and `unpriced`, and would mix our prose with theirs in a string a verifier reads
-- as the company's own. This platform has done that once already: data_quality on a Category 1 snapshot
-- line substitutes 'Supplier-reported (basis unspecified)' into the field that otherwise holds the
-- supplier's own words, and because scope3_category_snapshots is immutable that ambiguity is frozen into
-- every row already written. The supplier-assurance work split it the other way, and this follows that.
--
-- ⚠️ NULLABLE AT WRITE, NAMED AT THE REPORT, AND NOTHING VALIDATES IT AT CAPTURE. A NOT NULL on customer
-- prose produces a full stop, and a justification written because a form refused without one looks like a
-- justification and is read as one. The wizard shows an amber notice the moment a category is excluded
-- with no reason, unjustifiedExclusions names them on the export step, the CSV prints 'No justification
-- recorded', and the count is stored in scope3_exclusions_unjustified. That posture is unchanged.
--
-- ⚠️ EVERY KEY IN THIS MAP IS DISCLOSED WHOLESALE TO AN EXTERNAL VERIFIER. get_verifier_scope3 projects
-- `'scope3_coverage', s.scope3_coverage` as a whole column. It rebuilds the snapshot's `lines`,
-- `uncovered` and `currency_flags` key by key, precisely so a field added to a snapshot is not disclosed
-- until it is named in the RPC; this column gets none of that. Wholesale projection is the right
-- behaviour, because all seven keys are designed for exactly that reader, but it means there is no review
-- step between writing a key here and a verifier reading it. lib/scope3/categoryStatus.test.ts pins the
-- key set for that reason, and its failure message says so.
--
-- VERIFY AFTER RUNNING:
--   select col_description('public.scope3_inventories'::regclass,
--            (select attnum from pg_attribute
--              where attrelid = 'public.scope3_inventories'::regclass and attname = 'scope3_coverage'));
--   -- expect the text below, including 'excluded_reason' and 'ABSENT unless the category is an answered
--   -- exclusion'.

comment on column public.scope3_inventories.scope3_coverage is
  'One entry per category id (cat1..cat15): {"status": <status key>, "mt": <number|null>, "in_total": '
  '<bool>, "unpriced": <bool>, "reason": <text|null>, "dq": <number, present only for a method that '
  'defines a data-quality scale>, "excluded_reason": <text|null, present only for an answered '
  'exclusion>}. Status keys are lib/scope3/categoryStatus.ts: relevant_calculated, '
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
  'wherever mt is null — a score cannot describe a figure that does not exist. '
  '⚠️ excluded_reason is the CUSTOMER''S OWN JUSTIFICATION for an answered exclusion, verbatim, and it is '
  'NOT the same field as reason: reason is the platform''s sentence for why it produced no figure, this is '
  'the company''s sentence for why they judged the category irrelevant. GHG Protocol chapter 11.1 requires '
  'the categories excluded to be listed WITH justification of their exclusion, and this is that '
  'justification. It is ABSENT unless the category is an answered exclusion (status not_relevant_*), and '
  'NULL within that when the company recorded no justification — absent and null are different facts, and '
  'null is never replaced by a fallback string, because "No justification recorded" is ThemisIQ''s wording '
  'and belongs at the render rather than in a field that otherwise holds the company''s own. Nothing '
  'validates it at capture, by design: the wizard warns, the export names the gap, and '
  'scope3_exclusions_unjustified counts it. '
  'The counts in the sibling '
  'columns are all derivable from this map and are stored separately anyway: a consumer reading a trend '
  'should not have to parse jsonb to answer "how many", and the relevant-count is a customer judgement '
  'that cannot be reconstructed later. The map answers what the counts cannot — WHICH categories — so two '
  'years at 6 of 15 can be compared rather than assumed equivalent. NULL = not recorded.';
