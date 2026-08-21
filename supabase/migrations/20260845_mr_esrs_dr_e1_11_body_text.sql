-- 20260845_mr_esrs_dr_e1_11_body_text.sql
--
-- Reconcile E1-11 to the adopted act's BODY heading, and correct two comments that
-- "pattern-extracted" no longer describes.
--
-- FORWARD MIGRATION, NOT AN EDIT TO 20260817. That file is already applied and is the record of
-- what ran on 17 Aug 2026. Its insert IS idempotent (on conflict do update), so amending it would
-- reach the live table on replay - the reason for a new file is not mechanical. It is that an
-- amended file gives nobody a signal that a live row needs reconciling, and that rewriting the
-- 17 Aug seed would assert an insert that never happened.
--
-- ⚠️ RE-RUNNING 20260817 AFTER THIS REVERTS E1-11. Its seed carries the superseded wording and
-- its own header says a replay reconciles the table back to that file. Run this one last, or
-- regenerate 20260817's insert from the corrected TSV and re-run only that.
--
-- WHY THE ROW CHANGES
-- The adopted act contradicts itself at E1-11:
--   annex-i.txt:3465  contents listing:  "...and potential climate-related opportunities"
--   annex-i.txt:4420  body heading:      "...and material climate-related opportunities"
-- The body heading is the requirement as enacted; the contents listing is navigational apparatus.
-- The body governs. docs/reference/README.md carries both lines quoted in full.
--
-- VERIFICATION THIS RESTS ON - 21 Aug 2026
-- All 64 esrs_2026 rows compared character for character against the body headings in
-- docs/reference/source/annex-i.txt, extracted by scripts/extract-annex.sh from a PDF pinned to
-- sha256 2319a0bb65c0acf0f818f012f5ac8127ee3bd4e397037846373d8ce69f00c377.
-- 63 exact (3 after the recorded apostrophe normalisation), 1 corrected (this one), 0 missing,
-- per-topic counts agreeing on all ten topics.
--
-- DEPLOY: hand-run in the Supabase SQL editor. Re-runnable - one upsert, two comment replacements.

begin;

-- One row, by primary key. Not a regenerated 64-row seed: the TSV-to-INSERT generator that
-- produced 20260817's block is UNRECORDED (the same gap scripts/extract-annex.sh was written to
-- close for the text), so a "regenerated" block here would be hand-authored while claiming not to
-- be. One row, named and reasoned, is the honest form until that generator exists.
insert into public.mr_esrs_disclosure_requirements
  (dr_code, standard_version, topic_code, title, datapoints, sort_order) values
  ('E1-11', 'esrs_2026', 'E1', 'Anticipated financial effects from material physical and transition risks and material climate-related opportunities', null, 11)
on conflict (dr_code, standard_version) do update
  set title = excluded.title;

comment on table public.mr_esrs_disclosure_requirements is
  'Per-standard-version ESRS disclosure requirements. Exists because ESRS (2026) RENUMBERED the DRs - two were inserted into E1 at positions 2 and 3 and everything below shifted, so E1-5 means "Energy consumption and mix" under 2023 and "Actions and resources" under 2026. Codes still resolve either way, so a report printing the wrong vintage does not fail, it sends a preparer to collect the wrong data. esrs_2026 (64 rows) comes from C(2026) 5010 Annex I via docs/reference/drs2026.tsv, and every row was VERIFIED character for character against the annex body headings on 21 Aug 2026: 63 exact, 1 corrected (E1-11, where the act''s contents listing and body heading disagree and the body governs), 0 missing. esrs_2023 (61 rows) is MIGRATED FROM THE IN-REPO ESRS_DR_MAP CONSTANT - hand-authored, curated (S1 carries 8 of the standard''s 17), and of UNVERIFIED fidelity to Del. Reg. (EU) 2023/2772. The two editions are NOT of equal standing and must not be described together.';

comment on column public.mr_esrs_disclosure_requirements.title is
  'Requirement heading as printed by the named standard version. esrs_2026 titles were pattern-extracted from the adopted C(2026) 5010 Annex I (curly apostrophes normalised to straight, wrapped headings joined), then VERIFIED character for character against the annex BODY headings on 21 Aug 2026 - not the contents listing, which differs from the body at E1-11 and is navigational apparatus. Extraction pipeline: scripts/extract-annex.sh. esrs_2023 titles come from the ESRS_DR_MAP constant and are ThemisIQ''s wording, not the instrument''s.';

commit;
