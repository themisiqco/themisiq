-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  RUN.  Executed against the live database on 24 Sep 2026, after
-- 20260924_scope3_category_snapshots.sql, which creates the table this file comments on.
--
-- VERIFIED: col_description on scope3_category_snapshots.lines returns the comment in full, including
-- the phrase ACCEPTED BEFORE THIS FIELD EXISTED. That is the paragraph the file was written for, and
-- reading the whole comment back is also what proves the replace-not-append restatement below did not
-- drop anything.
--
-- ⚠️ THE ORDER WAS NOT OPTIONAL, AND ATTEMPTING THIS FILE FIRST IS WHAT EXPOSED A FALSE STATUS LINE.
-- An earlier attempt to run this one found no such table, which revealed that
-- 20260924_scope3_category_snapshots.sql had NOT been applied although its header already said RUN.
-- See that file's header for the correction and for the one-query check that would have caught it.
-- The useful part for a future reader: a comment migration fails loudly against a missing table, so it
-- happens to be a test of whether the file before it really ran. Nothing else here is.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 20260924_scope3_snapshot_lines_assurance_comment.sql
--
-- COMMENT ONLY. NO DDL, NO DATA CHANGE, NO POLICY CHANGE, NO GRANT CHANGE.
--
-- The lines in scope3_category_snapshots now carry two more fields, supplier_assurance_raw and
-- assurance, recording whether the supplier states their own emissions reporting is third-party
-- assured. `lines` is jsonb, so no DDL was needed to add them and none is needed here.
--
-- ⚠️ WHAT THIS FILE IS ACTUALLY FOR: A LINE WITH NO `assurance` KEY IS A SNAPSHOT ACCEPTED BEFORE THE
-- FIELD EXISTED, AND MUST NOT BE READ AS "NOT ASSURED". That rule lives in TypeScript today, in
-- lib/scope3/supplierAssurance.ts and in the SnapshotLine comment, and is enforced by tests. Someone
-- reading this table in the SQL editor, or writing a query against it a year from now, sees none of
-- that. They see rows where some lines have the key and some do not, and the obvious wrong inference
-- is immediately available: absent means no. Putting the rule on the column is the only way it reaches
-- that reader. The table is immutable and these rows are NOT backfilled, so the ambiguity is permanent
-- and so is the need for the note.
--
-- ⚠️ `comment on` REPLACES, IT DOES NOT APPEND, so the whole existing comment is restated below. Every
-- sentence from 20260924_scope3_category_snapshots.sql is reproduced verbatim except the field list,
-- which gains the two new names. Do not shorten it here thinking the earlier file still contributes:
-- after this runs, this text is the entire column comment.
--
-- IDEMPOTENT. `comment on` is a straight overwrite; running it twice leaves the same comment.
-- REVERSIBLE by re-running the corresponding statement from 20260924_scope3_category_snapshots.sql.
--
-- VERIFY AFTER RUNNING:
--   select col_description('public.scope3_category_snapshots'::regclass,
--            (select attnum from pg_attribute
--              where attrelid = 'public.scope3_category_snapshots'::regclass and attname = 'lines'));
--   -- expect the text below, including 'ACCEPTED BEFORE THIS FIELD EXISTED'.

comment on column public.scope3_category_snapshots.lines is
  'The per-supplier lines as /api/campaigns/[id]/scope3-cat1 returned them: supplier_id, '
  'supplier_name, method, data_quality, value_mt, allocation_method, basis, supplier_assurance_raw '
  'and assurance. '
  'THE FIELDS ARE THE DATA AND `basis` IS A RENDERING: it is the sentence that was DISPLAYED at '
  'acceptance, kept verbatim so the record can reproduce what the buyer saw, and it is not the '
  'authority for anything. Rewording the route changes later sentences and must not change these. '
  '⚠️ supplier_name AND supplier_id ARE A FROZEN COPY, NOT A FOREIGN KEY, ON PURPOSE. '
  'campaign_suppliers cascades from supplier_campaigns and supplier_responses cascades from '
  'campaign_suppliers, so an FK here would inherit that and deleting a finished campaign would erase '
  'the evidence for a figure still sitting in a filed report. Do not "fix" this into a foreign key. '
  'The id is kept beside the name for tracing while the campaign exists; the name is what keeps the '
  'row readable after it does not. '
  '⚠️ A LINE WITH NO `assurance` KEY IS A SNAPSHOT ACCEPTED BEFORE THIS FIELD EXISTED. IT DOES NOT '
  'MEAN "NOT ASSURED". These rows are deliberately NOT backfilled: a snapshot records what was known '
  'at acceptance, and this was not known then. Report the absence as an absence, for example '
  '"supplier assurance status was not recorded when this figure was accepted". Every line written '
  'after the field was added carries the key with one of eight explicit values, two of which are '
  'themselves absences (not_asked, where the campaign questionnaire has no assurance question, and '
  'not_answered, where it does and the supplier left it blank), so the KEY BEING PRESENT is what '
  'distinguishes a recorded answer from a row that predates the field. '
  '⚠️ assurance DESCRIBES THE LINE''S FIGURE; supplier_assurance_raw DESCRIBES THE SUPPLIER. A '
  'spend-based line is always not_applicable however the supplier answered, because its figure is the '
  'buyer''s spend times an emission factor and the supplier''s assurance status does not bear on it. '
  'So do NOT aggregate assured suppliers across lines by reading supplier_assurance_raw: counting a '
  'spend-based line because its supplier holds assurance reports an estimate as assured. Filter on '
  'assurance in (''limited'', ''reasonable''), which is what carriesThirdPartyAssurance() does in '
  'lib/scope3/supplierAssurance.ts. '
  '⚠️ AND NEITHER FIELD SAYS A FIGURE IS ASSURED. The questionnaire asks whether the SUPPLIER''S '
  'emissions figures are independently assured. A supplier may hold limited assurance over their group '
  'Scope 1 and 2 while the portion they attributed to this buyer is an unassured internal allocation, '
  'so the answer supports "this supplier reports limited assurance over their emissions figures" and '
  'never "this figure is assured".';
