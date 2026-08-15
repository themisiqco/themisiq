-- 20260815_mr_esrs_subtopics.sql
--
-- Adds the ESRS sub-topic layer beneath the ten topical standards in mr_esrs_topics:
-- a versioned dimension table of sub-topic names, and a value-bearing table of
-- per-industry baselines against them. Schema only — no engine change. lib/materiality.ts,
-- computeMatrix and materiality_assessments are deliberately untouched.
--
-- SOURCE OF THE TAXONOMY. All 37 seeded rows are transcribed from the ADOPTED text:
--   Commission Delegated Regulation C(2026) 5010 final, Annexes 1 to 2,
--   Annex I, ESRS 1 Appendix A — List of topics.
--   Adopted 3 July 2026, amending Delegated Regulation (EU) 2023/2772.
--   ec.europa.eu/finance/docs/level-2-measures/csrd-delegated-act-2026-5010-annex_en.pdf
--   Transcribed 15 August 2026 from the adopted text — not from EFRAG's advice and
--   not from a summary. Working transcription: docs/materiality-questionnaire-spec-v5.md §11.1.
--   Applies to financial years beginning on or after 1 January 2027, with early
--   adoption permitted for FY2026. At time of writing it is in the Parliament/Council
--   scrutiny period; entry into force approximately 10 November 2026.
--
-- ✎ CORRECTED 16 AUGUST 2026 — INITIAL CAPITALS. As first written, this seed carried all 37
--   labels in lower case ('climate change mitigation'). That was faithful to spec §11.1, which
--   presents the sub-topics as prose lists and lowercases their entries — but NOT faithful to the
--   annex, which capitalises the first letter of every sub-topic. The 37 strings below now carry
--   the annex's capitalisation. Only character 0 of each label changed; no code, sort_order,
--   parent_code or standard_version was touched, and the S1.6/S2.6 asymmetry is unaffected.
--   Reasoning, the row-count-guarded corrective UPDATE, and the verification queries are in
--   supabase/migrations/20260816_mr_esrs_subtopics_label_case_fix.sql. That file remains the
--   audit record of the defect; this one is now correct on its own, so running it first and
--   20260816 afterwards leaves the latter a passing no-op. This file is therefore independently
--   re-runnable again.
--
-- ⚠️ APPENDIX A IS NON-BINDING GUIDANCE AND IS NOT A SUBSTITUTE FOR THE MATERIALITY
-- PROCESS — the annex says so itself. This table is a checklist of candidate topics to
-- assess, NOT a list of topics that are material, and nothing downstream may treat a row's
-- presence here as a determination. Under ESRS (2023) the equivalent list (ESRS 1 AR 16)
-- was mandatory; under ESRS (2026) it is guidance. That change is the reason
-- standard_version exists rather than being a nice-to-have.
--
-- WHY standard_version HAS THREE VALUES, NOT TWO. Article 2(1) of the delegated act gives
-- FY2026 three options, all of which coexist — this is not a migration from one taxonomy to
-- another:
--     'esrs_2023'          ESRS (2023) as last amended by Del. Reg. (EU) 2025/1416 (the 'quick fix')
--     'esrs_2023_reliefs'  the above, plus the eight named reliefs from the new act
--                          (ESRS 1 ¶27, ¶32-33, ¶74-75, ¶90, ¶91, ¶92, ¶106, ¶110)
--     'esrs_2026'          the revised standards in full
-- Article 2(2) requires the undertaking to STATE which version it applied for financial
-- years beginning between 1 Jan and 31 Dec 2026. Recording it is therefore a legal
-- requirement, not a design preference. From FY2027 only 'esrs_2026' applies.
-- ONLY 'esrs_2026' IS SEEDED HERE. The 2023 rows are a separate transcription job against a
-- different instrument (ESRS 1 AR 16, three levels deep) and must not be inferred from these.
--
-- FIRST mr_* TABLE IN GIT. The existing mr_* tables are hand-created DB drift and are absent
-- from supabase/migrations/ entirely — only their 15 Jul provenance columns and 14 Jul
-- methodology additions are captured. This file is the first that CREATEs one. It follows the
-- live shape of mr_esrs_topics and mr_industry_topic_baselines as read from information_schema
-- on 15 Aug 2026 (text codes, smallint sort_order, provenance CHECK on three values, RLS enabled
-- with a <table>_read policy), except in the five places set out below. A rebuild from this
-- directory still will NOT reproduce the other eleven
-- mr_* tables; db/snapshot_20260714.json remains the only record of their values.
--
--
-- ── FIVE DELIBERATE DEVIATIONS FROM THE PARENT TABLES ────────────────────────
-- Each is a choice, not an inconsistency. Read these before "harmonising" anything.
--
-- (1) topic_code FK IS ON DELETE RESTRICT, NOT CASCADE.
--     mr_industry_topic_baselines cascades from mr_esrs_topics. This table does not.
--     Deleting one topic row would silently remove up to five sub-topic DEFINITIONS —
--     and, through the baseline table, every per-industry score assessed against them.
--     This taxonomy is transcribed from a legal instrument; removing an ESRS topic should
--     require saying so out loud, and a RESTRICT makes the DELETE fail until someone does.
--     The same reasoning is extended one link further down: the baseline table's FK to
--     mr_esrs_subtopics is ALSO RESTRICT, because that is the link the cascade would have
--     travelled to reach assessed data. (That FK is not named in the brief; it is RESTRICT
--     by the same argument, and this note exists so the choice is visible.)
--     By contrast the baseline table's industry_code FK STAYS CASCADE, matching its parent:
--     deleting an industry legitimately removes that industry's rows, and nothing else's.
--
-- (2) NO DEFAULT ON financial_base / impact_base. NOT NULL, explicit value required.
--     mr_industry_topic_baselines defaults both to 2. That is harmless there because all 130
--     rows were hand-seeded in one pass, so the default never actually applied. It would be
--     dangerous here: this table is filled incrementally over months, 13 industries x 37
--     sub-topics at a time, and on a 0-10 scale a defaulted 2 reads as a real, low, ASSESSED
--     score. A forgotten value would render as a confident finding of LOW MATERIALITY.
--     That is precisely the defect computeMatrix's own no-baseline branch exists to prevent
--     ("it must read 'unknown', NEVER a default 2/'low' that renders as a positive finding of
--     immateriality") — and a column default would reintroduce it below the level that guard
--     can see. An absent row must stay absent and readable as unknown; it must never become a 2.
--
-- (3) A RANGE CHECK THE PARENT LACKS.
--       check (financial_base >= 0 and financial_base <= 10)
--       check (impact_base    >= 0 and impact_base    <= 10)
--     Nothing stops a 47 in mr_industry_topic_baselines today. It has not bitten because those
--     rows were seeded once from a prepared table. Incremental hand-entry over months is exactly
--     when a transposed digit gets in, and a 47 would not error anywhere downstream — it would
--     just dominate the matrix. Bounds belong at the point of entry, not in a reviewer's eye.
--
-- (4) service_role GETS PLAIN SELECT.
--     The three parent tables grant service_role REFERENCES, TRIGGER and TRUNCATE — but NOT
--     SELECT. That set can truncate the table without being able to read it, which is almost
--     certainly residue from the 7 Aug schema-wide revoke rather than an intended posture.
--     It is not propagated. These tables grant SELECT and nothing else to every role, because
--     nothing writes reference data at runtime: it changes by migration, under review.
--
-- (5) TIMESTAMPS ON THE BASELINE TABLE ONLY — created_at AND updated_at, WITH A TRIGGER.
--     mr_industry_topic_baselines has neither. That was adequate for 130 rows seeded in one
--     sitting: they all share an age, so recording it would have told nobody anything.
--     This table is different. It is filled incrementally across 13 industries over weeks, and
--     A BASELINE'S AGE IS PART OF ITS EVIDENTIARY WEIGHT. A starter value set in August and a
--     value corrected in October against a primary source are different claims, and `provenance`
--     alone cannot tell them apart once both read 'primary_source'. updated_at answers the
--     question provenance cannot: was this set BEFORE or AFTER I found the better source.
--
--     THE DATABASE SETS updated_at, NEVER THE APPLICATION. Same principle as
--     campaign_suppliers.token, which is a column DEFAULT carrying "app never sets it" in its
--     COMMENT: an application-set timestamp can be wrong, or forgotten, and the one time it is
--     forgotten is the row whose age you most needed. A BEFORE UPDATE trigger cannot be skipped
--     by a caller. The COMMENT on the column says so, so the next reader does not add a
--     `.update({ updated_at: ... })` somewhere and quietly create two sources of truth.
--
--     NOTHING ANALOGOUS IS ADDED TO mr_esrs_subtopics, deliberately. That table is a verbatim
--     transcription of a legal instrument. It is not corrected over time — a changed taxonomy
--     gets a NEW standard_version row, not an edit to an existing one, which is the whole point
--     of the composite primary key. It therefore takes created_at alone, matching mr_esrs_topics.
--     An updated_at there would imply an edit history the design does not permit.
--
--     Worth knowing: grants give no role INSERT or UPDATE on this table (deviation 4), so in
--     practice the trigger fires only for the table owner running SQL by hand. That is the
--     intended and only writer. The trigger is not dead code; it is guarding the one path there is.
--
--
-- GRANTS MUST BE EXPLICIT — THIS FILE REPLAYS AFTER THE 7 AUG CLEANUP.
-- 20260807_supplier_portal_policy_cleanup.sql states the hazard directly:
--     "Supabase default privileges still grant new tables to anon on creation."
--     "ON REBUILD THIS MATTERS CONCRETELY. Migrations replay in filename order, so the
--      schema-wide revoke in step 3 covers only tables that exist at this point in the
--      sequence. Any table created by a later-dated migration inherits the default anon
--      grants and nothing here removes them."
-- Both tables below are created after it, so both would be born with anon INSERT/UPDATE/DELETE.
-- Each therefore issues its own `revoke all` FIRST — one statement that strips SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER together — and then re-grants only SELECT.
-- Revoke-then-grant, rather than revoking a named list, is what makes the resulting posture
-- provably equal to the post-cleanup state instead of merely looking equal.
-- This also satisfies the standing project rule that every new table needs its own GRANT:
-- BYPASSRLS bypasses RLS, not GRANT, and a missing grant fails silently on any path that
-- swallows DB errors (cf. supabase/migrations/20260722_rate_limits_grants.sql).
--
-- WHY THE DIMENSION TABLE HAS NO provenance/source_ref/source_date.
-- 20260715_mr_provenance_columns.sql draws the line and names this exact table on the far side
-- of it: the columns go to "the nine mr_* tables that carry model VALUES (coefficients,
-- multipliers, thresholds)", while "Dimension/label tables (mr_regions, mr_esrs_topics,
-- mr_region_aliases) are deliberately NOT touched — they hold no calibratable value."
-- mr_esrs_subtopics is the same kind of thing as mr_esrs_topics one level down, so it gets none;
-- mr_industry_subtopic_baselines is the same kind of thing as mr_industry_topic_baselines, so it
-- gets all three, defaulting to 'starter'.
-- It will look odd that the legally-transcribed table carries no source_ref while the
-- invented-starter-values table does. That is correct and not an oversight: `provenance` tracks
-- CALIBRATION STATE ("is this number firm yet"), and a transcribed label has no calibration state
-- to track. Its citation lives in this header and in standard_version, which is where Article 2(2)
-- requires it to be legible anyway.
--
-- SEEDING. mr_esrs_subtopics is seeded (37 rows, esrs_2026 only).
-- mr_industry_subtopic_baselines IS DELIBERATELY LEFT EMPTY. 13 industries x 37 sub-topics is
-- 481 double-materiality judgements. They are Lisa's to make; a fabricated baseline is the exact
-- defect this module exists to avoid, and 'starter' provenance would dress it as a considered
-- default. An empty table reads as "not yet assessed", which is true. A seeded one would not.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT
-- EXISTS, guarded CREATE POLICY, idempotent grants, and the seed upserts (see the note above it).
-- Ordering: this file and 20260815_portal_get_whitelist.sql share a date but touch disjoint
-- objects, so replay order between them does not matter.

begin;

-- =====================================================================
-- mr_esrs_subtopics — dimension table (no provenance columns)
-- =====================================================================
create table if not exists public.mr_esrs_subtopics (
  code             text        not null,
  topic_code       text        not null,
  label            text        not null,
  sort_order       smallint    not null default 0,
  standard_version text        not null
    check (standard_version in ('esrs_2023', 'esrs_2023_reliefs', 'esrs_2026')),
  -- Nullable self-reference so a third level can exist later WITHOUT a migration.
  -- ESRS (2026) is two levels, so every row seeded below has parent_code null; ESRS (2023)
  -- was three (topics -> sub-topics -> sub-sub-topics), and this lets both taxonomies live
  -- in one table at their own depths rather than forcing a schema branch.
  parent_code      text,
  created_at       timestamptz not null default now(),

  -- Composite PK: the SAME code may exist under two standard versions with different wording.
  constraint mr_esrs_subtopics_pkey primary key (code, standard_version),

  -- Deviation (1): RESTRICT, not CASCADE. See the header.
  constraint mr_esrs_subtopics_topic_code_fkey
    foreign key (topic_code) references public.mr_esrs_topics (code) on delete restrict,

  -- A parent must live in the SAME standard version as its child, so the self-FK is composite.
  -- A 2023 sub-topic can never be the parent of a 2026 one.
  constraint mr_esrs_subtopics_parent_fkey
    foreign key (parent_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- A row cannot be its own parent (the FK above would otherwise permit it, and any
  -- recursive walk over parent_code would not terminate).
  constraint mr_esrs_subtopics_parent_not_self
    check (parent_code is null or parent_code <> code)
);

comment on table public.mr_esrs_subtopics is
  'ESRS sub-topics beneath the ten topical standards, versioned by standard_version. Seeded for esrs_2026 from Commission Delegated Regulation C(2026) 5010 final, Annex I, ESRS 1 Appendix A (adopted 3 Jul 2026). Appendix A is NON-BINDING GUIDANCE and is not a substitute for the materiality process: a row here is a candidate to assess, never a determination.';

comment on column public.mr_esrs_subtopics.standard_version is
  'Which ESRS version this row belongs to. Three values coexist per Art. 2(1) of the delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026. Only esrs_2026 is seeded.';

comment on column public.mr_esrs_subtopics.parent_code is
  'Nullable self-reference for a third level. Null for every esrs_2026 row (that taxonomy is two levels). Composite FK: a parent must share the child''s standard_version.';

-- =====================================================================
-- mr_industry_subtopic_baselines — value-bearing (provenance columns)
-- =====================================================================
create table if not exists public.mr_industry_subtopic_baselines (
  industry_code    text not null,
  subtopic_code    text not null,
  -- Carried explicitly so the FK to mr_esrs_subtopics can be composite. A baseline scores a
  -- sub-topic AS DEFINED BY A PARTICULAR STANDARD VERSION; the same code under two versions
  -- may not mean the same thing, so a score against one is not a score against the other.
  standard_version text not null,

  -- Deviation (2): NO DEFAULT. An absent judgement must stay absent, never become a 2.
  financial_base   numeric not null,
  impact_base      numeric not null,

  provenance       text not null default 'starter'
    check (provenance in ('starter', 'primary_source', 'expert_judgment')),
  source_ref       text,
  source_date      date,

  -- Deviation (5). The parent has neither. updated_at is written by a BEFORE UPDATE
  -- trigger below, never by a caller — see the COMMENT on the column.
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint mr_industry_subtopic_baselines_pkey
    primary key (industry_code, subtopic_code, standard_version),

  -- CASCADE, matching mr_industry_topic_baselines: deleting an industry legitimately
  -- removes that industry's rows.
  constraint mr_industry_subtopic_baselines_industry_fkey
    foreign key (industry_code) references public.mr_industries (code) on delete cascade,

  -- RESTRICT, extending deviation (1): this is the link a topic-level cascade would have
  -- travelled to reach assessed data. Retiring a sub-topic must be an explicit act.
  constraint mr_industry_subtopic_baselines_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- Deviation (3): bounds the parent table lacks.
  constraint mr_industry_subtopic_baselines_financial_range
    check (financial_base >= 0 and financial_base <= 10),
  constraint mr_industry_subtopic_baselines_impact_range
    check (impact_base >= 0 and impact_base <= 10)
);
-- No standard_version CHECK here: the composite FK already confines it to values present in
-- mr_esrs_subtopics, which carries the CHECK. A second copy could only drift.

-- ── updated_at maintenance — REUSES public.sbti_set_updated_at() ───────────────
-- The helper already exists and is already shared across modules: created in
-- 20260625_sbti_core_tables.sql and reused verbatim by 20260625_sbti_coverage_cycle_tables.sql
-- ("reuses sbti_set_updated_at() from migration 1"). Its body is entirely generic —
-- `begin new.updated_at = now(); return new; end` — and names no sbti object, so it is a
-- general-purpose helper that happens to carry a module prefix from where it was first needed.
--
-- REUSED RATHER THAN COPIED, ON PURPOSE. A second function with the same body under a better
-- name would be a duplicate of a working definition, and duplicates drift — the failure this
-- repo has already paid for once in lib/supply-chain/templates.ts. If the name is ever corrected
-- to something module-neutral, ALL FIVE triggers must move in the SAME pass: the four sbti ones
-- and this one. It is not redefined here; this file only attaches it.
--
-- (For contrast, public.deals deliberately has NO such trigger — its updated_at is a column
-- DEFAULT only, noted in 20260803_deal_assessment_rpc_updated_at.sql. Both patterns exist in
-- this repo. The trigger is the right one here because these rows are edited after insert.)
drop trigger if exists mr_industry_subtopic_baselines_set_updated_at
  on public.mr_industry_subtopic_baselines;
create trigger mr_industry_subtopic_baselines_set_updated_at
  before update on public.mr_industry_subtopic_baselines
  for each row execute function public.sbti_set_updated_at();

comment on table public.mr_industry_subtopic_baselines is
  'Per-industry double-materiality baselines against ESRS sub-topics. DELIBERATELY UNSEEDED — 13 industries x 37 sub-topics is 481 judgements to be made by hand, not generated. An absent row means NOT ASSESSED and must render as unknown, never as a low score.';

comment on column public.mr_industry_subtopic_baselines.financial_base is
  'Financial-materiality baseline, 0-10. NOT NULL with NO DEFAULT on purpose: a defaulted 2 would read as an assessed finding of low materiality.';

comment on column public.mr_industry_subtopic_baselines.provenance is
  'Calibration state, not citation. ''starter'' until calibrated against worked examples; see 20260715_mr_provenance_columns.sql for why that is the honest default.';

comment on column public.mr_industry_subtopic_baselines.updated_at is
  'Written by the BEFORE UPDATE trigger mr_industry_subtopic_baselines_set_updated_at; the app must NEVER set it. A baseline''s age is part of its evidentiary weight — it dates a correction that provenance alone cannot distinguish from the original value. An application-set timestamp can be wrong or forgotten; a trigger cannot be skipped.';

comment on column public.mr_industry_subtopic_baselines.created_at is
  'When this baseline was first entered. Never changes — the trigger touches updated_at only. Together the pair separates "assessed once in August" from "revised in October against a better source".';

-- =====================================================================
-- Grants — explicit, because this file replays after the 7 Aug cleanup
-- =====================================================================
-- Strip Supabase's defaults first. `revoke all` covers SELECT/INSERT/UPDATE/DELETE and
-- TRUNCATE/REFERENCES/TRIGGER in one statement, so the posture below is exhaustive.
revoke all on public.mr_esrs_subtopics              from anon;
revoke all on public.mr_esrs_subtopics              from authenticated;
revoke all on public.mr_esrs_subtopics              from service_role;
revoke all on public.mr_industry_subtopic_baselines from anon;
revoke all on public.mr_industry_subtopic_baselines from authenticated;
revoke all on public.mr_industry_subtopic_baselines from service_role;

-- Re-grant read only. anon SELECT matches the three parent tables and keeps these readable
-- from /api/materiality/reference, which uses an anon client so the wizard's option lists come
-- from the DB rather than drifting in a component. Deviation (4): service_role gets SELECT.
grant select on public.mr_esrs_subtopics              to anon, authenticated, service_role;
grant select on public.mr_industry_subtopic_baselines to anon, authenticated, service_role;

-- =====================================================================
-- RLS — matching the 13 existing mr_* tables exactly
-- =====================================================================
alter table public.mr_esrs_subtopics              enable row level security;
alter table public.mr_industry_subtopic_baselines enable row level security;

-- CREATE POLICY is not idempotent, so guard each on pg_policies (same idiom as
-- 20260717_cbam_reference_grants_rls.sql). `to anon, authenticated` is named explicitly —
-- a policy written without a `to` clause defaults to `public`, which is the root cause the
-- 7 Aug cleanup was written to fix.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_esrs_subtopics'
      and policyname = 'mr_esrs_subtopics_read'
  ) then
    create policy mr_esrs_subtopics_read on public.mr_esrs_subtopics
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_industry_subtopic_baselines'
      and policyname = 'mr_industry_subtopic_baselines_read'
  ) then
    create policy mr_industry_subtopic_baselines_read on public.mr_industry_subtopic_baselines
      for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- Seed — mr_esrs_subtopics, standard_version = 'esrs_2026' ONLY. 37 rows.
-- =====================================================================
-- Labels are VERBATIM from ESRS 1 Appendix A. Do not tidy the capitalisation, expand the
-- parentheticals, or split a label at a comma: the parenthetical lists ARE the standard's own
-- text, and under ESRS (2026) they absorb what were separate sub-sub-topics in ESRS (2023).
-- The LEADING CAPITAL on every label is the annex's, not house style — it was missing in the
-- first version of this seed and restored on 16 Aug 2026 (see ✎ in the header). Nothing after
-- character 0 is capitalised: it is 'Climate change mitigation', never 'Climate Change
-- Mitigation'. The Title Case used for the TEN TOPIC names in 20260815_mr_esrs_topic_labels.sql
-- is a different convention, and the annex applies it only at topic level.
--
-- ⚠️ S1 AND S2 SHARE ONE ROW IN APPENDIX A; THIS TABLE GIVES THEM TWELVE.
-- Appendix A merges them into a single topic row "Own Workforce and Workers in the Value Chain
-- (ESRS S1/S2)" with one shared sub-topic set, and footnotes that the depth and granularity of
-- assessment may differ between own workforce and value-chain workers depending on data
-- availability. But S1 and S2 remain SEPARATE TOPICAL STANDARDS with separate disclosure
-- requirements, and the matrix carries (topic, sub-topic) PAIRS: "S1 x health and safety" and
-- "S2 x health and safety" are two distinct determinations, and a company may well find one
-- material and the other not. So the six labour sub-topics are defined twice, under distinct
-- codes S1.1-S1.6 and S2.1-S2.6. Duplication is uglier than a many-relationship but keeps the
-- DR mapping straightforward, which is what the schema is for.
-- 31 distinct definitions in the annex -> 37 rows here. Both numbers are correct; they count
-- different things.
--
-- ⚠️ "water and sanitation" APPEARS ONLY UNDER S2 (row S2.6), NOT UNDER S1 (row S1.6).
-- A second footnote in the annex confines it to value-chain workers. The two labels are
-- therefore NOT identical and must not be "corrected" to match each other. S1.6 ends at
-- "adequate housing"; S2.6 continues ", water and sanitation".
--
-- sort_order restarts at 1 within each topic_code (the mr_industry_opportunities /
-- mr_industry_transition_drivers convention for a child table), not 1-37 across the table.
--
-- ON CONFLICT DO UPDATE, not DO NOTHING: this file is the transcription of record, so a re-run
-- RECONCILES the table back to it. The corollary — say it plainly — is that a label hand-edited
-- in the SQL editor will be silently reverted by the next replay. Fix a transcription error by
-- editing this file and re-running it, never by editing the row.
insert into public.mr_esrs_subtopics (code, topic_code, label, sort_order, standard_version, parent_code) values
  -- E1 Climate Change — 3
  ('E1.1', 'E1', 'Climate change mitigation', 1, 'esrs_2026', null),
  ('E1.2', 'E1', 'Climate change adaptation', 2, 'esrs_2026', null),
  ('E1.3', 'E1', 'Energy', 3, 'esrs_2026', null),

  -- E2 Pollution — 5
  ('E2.1', 'E2', 'Pollution of air', 1, 'esrs_2026', null),
  ('E2.2', 'E2', 'Pollution of water', 2, 'esrs_2026', null),
  ('E2.3', 'E2', 'Pollution of soil', 3, 'esrs_2026', null),
  ('E2.4', 'E2', 'Substances of concern, including substances of very high concern', 4, 'esrs_2026', null),
  ('E2.5', 'E2', 'Microplastics', 5, 'esrs_2026', null),

  -- E3 Water — 1
  ('E3.1', 'E3', 'Water use, including withdrawal, consumption, discharges and storage', 1, 'esrs_2026', null),

  -- E4 Biodiversity and Ecosystems — 4
  ('E4.1', 'E4', 'Drivers of biodiversity and ecosystem change (including terrestrial and marine habitat change, invasive species)', 1, 'esrs_2026', null),
  ('E4.2', 'E4', 'State of species', 2, 'esrs_2026', null),
  ('E4.3', 'E4', 'The extent and condition of terrestrial and marine ecosystems', 3, 'esrs_2026', null),
  ('E4.4', 'E4', 'Ecosystem services', 4, 'esrs_2026', null),

  -- E5 Circular Economy and Resource Use — 3
  ('E5.1', 'E5', 'Resource inflows', 1, 'esrs_2026', null),
  ('E5.2', 'E5', 'Resource outflows related to products and services', 2, 'esrs_2026', null),
  ('E5.3', 'E5', 'Resource outflows (waste)', 3, 'esrs_2026', null),

  -- S1 Own Workforce — the shared labour set, first of two copies.
  -- NOTE S1.6: no "water and sanitation" — the annex confines that to S2.
  ('S1.1', 'S1', 'Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection', 1, 'esrs_2026', null),
  ('S1.2', 'S1', 'Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils', 2, 'esrs_2026', null),
  ('S1.3', 'S1', 'Health and safety', 3, 'esrs_2026', null),
  ('S1.4', 'S1', 'Training and skills development', 4, 'esrs_2026', null),
  ('S1.5', 'S1', 'Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)', 5, 'esrs_2026', null),
  ('S1.6', 'S1', 'Other labour-related human rights (including child labour, forced labour, privacy and adequate housing)', 6, 'esrs_2026', null),

  -- S2 Workers in the Value Chain — the same six, second copy.
  -- NOTE S2.6: "water and sanitation" IS present here. This asymmetry with S1.6 is deliberate.
  ('S2.1', 'S2', 'Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection', 1, 'esrs_2026', null),
  ('S2.2', 'S2', 'Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils', 2, 'esrs_2026', null),
  ('S2.3', 'S2', 'Health and safety', 3, 'esrs_2026', null),
  ('S2.4', 'S2', 'Training and skills development', 4, 'esrs_2026', null),
  ('S2.5', 'S2', 'Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)', 5, 'esrs_2026', null),
  ('S2.6', 'S2', 'Other labour-related human rights (including child labour, forced labour, privacy and adequate housing, water and sanitation)', 6, 'esrs_2026', null),

  -- S3 Affected Communities — 3
  ('S3.1', 'S3', 'Communities'' economic, social and cultural rights (including land-related impacts, security-related impacts, adequate housing and food, water and sanitation)', 1, 'esrs_2026', null),
  ('S3.2', 'S3', 'Communities'' civil and political rights (including freedom of expression, freedom of assembly, impacts on human rights defenders)', 2, 'esrs_2026', null),
  ('S3.3', 'S3', 'Rights of indigenous peoples (including free, prior and informed consent (FPIC), self-determination, cultural rights)', 3, 'esrs_2026', null),

  -- S4 Consumers and End-users — 3
  ('S4.1', 'S4', 'Information-related impacts for consumers or users (including privacy, access to information, freedom of expression)', 1, 'esrs_2026', null),
  ('S4.2', 'S4', 'Personal safety of consumers or end-users (including health and safety, protection of children, security of a person)', 2, 'esrs_2026', null),
  ('S4.3', 'S4', 'Social inclusion of consumers or end-users (including access to products and services, responsible marketing practices, non-discrimination)', 3, 'esrs_2026', null),

  -- G1 Business Conduct — 3
  ('G1.1', 'G1', 'Corporate culture, including anti-corruption and bribery, the protection of whistle-blowers and animal welfare', 1, 'esrs_2026', null),
  ('G1.2', 'G1', 'Political influence, including lobbying activities', 2, 'esrs_2026', null),
  ('G1.3', 'G1', 'Management of relationships with suppliers, including payment practices, especially late payment to small- and medium-sized undertakings', 3, 'esrs_2026', null)
on conflict (code, standard_version) do update
  set topic_code  = excluded.topic_code,
      label       = excluded.label,
      sort_order  = excluded.sort_order,
      parent_code = excluded.parent_code;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) 37 rows, all esrs_2026, none of them a 2023 row that slipped in:
--    select standard_version, count(*) from public.mr_esrs_subtopics
--    group by standard_version;                          -- expect exactly: esrs_2026 | 37
--
-- 2) Per-topic counts match Appendix A:
--    select topic_code, count(*) from public.mr_esrs_subtopics
--    where standard_version = 'esrs_2026' group by topic_code order by topic_code;
--    -- expect E1|3  E2|5  E3|1  E4|4  E5|3  G1|3  S1|6  S2|6  S3|3  S4|3
--
-- 3) The S1/S2 asymmetry survived — this is the one most likely to be "tidied" away:
--    select code, label like '%water and sanitation%' as has_water_sanitation
--    from public.mr_esrs_subtopics where code in ('S1.6','S2.6')
--      and standard_version = 'esrs_2026' order by code;   -- expect S1.6|f  S2.6|t
--    -- and the other five pairs SHOULD be identical:
--    select count(*) from public.mr_esrs_subtopics a
--    join public.mr_esrs_subtopics b
--      on b.code = 'S2' || substring(a.code from 3) and b.standard_version = a.standard_version
--    where a.topic_code = 'S1' and a.standard_version = 'esrs_2026'
--      and a.label = b.label;                              -- expect 5 (all but the .6 pair)
--
-- 4) The baseline table is EMPTY, and is meant to be:
--    select count(*) from public.mr_industry_subtopic_baselines;   -- expect 0
--
-- 5) Grants are read-only for every role (deviation 4 — no TRUNCATE-without-SELECT):
--    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('mr_esrs_subtopics','mr_industry_subtopic_baselines')
--    group by table_name, grantee order by table_name, grantee;
--    -- expect SELECT and nothing else, for anon / authenticated / service_role
--
-- 6) RLS on, one read policy each, roles named explicitly (never bare `public`):
--    select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname='public' and c.relname in ('mr_esrs_subtopics','mr_industry_subtopic_baselines');
--    -- expect both t
--    select tablename, policyname, roles, cmd from pg_policies
--    where schemaname='public' and tablename like 'mr\_%subtopic%';
--    -- expect {anon,authenticated} / SELECT on each
--
-- 7) Deviation (2) holds — a baseline row CANNOT be inserted without both scores:
--    begin;
--      insert into public.mr_industry_subtopic_baselines
--        (industry_code, subtopic_code, standard_version, financial_base)
--      values ('agri','E1.1','esrs_2026', 8);
--      -- expect ERROR: null value in column "impact_base" violates not-null constraint
--    rollback;
--
-- 8) Deviation (3) holds — an out-of-range score is refused:
--    begin;
--      insert into public.mr_industry_subtopic_baselines
--        (industry_code, subtopic_code, standard_version, financial_base, impact_base)
--      values ('agri','E1.1','esrs_2026', 47, 5);
--      -- expect ERROR: violates check constraint "mr_industry_subtopic_baselines_financial_range"
--    rollback;
--
-- 9) Deviation (1) holds — deleting an ESRS topic is BLOCKED, not silently cascaded:
--    begin;
--      delete from public.mr_esrs_topics where code = 'E3';
--      -- expect ERROR: update or delete on table "mr_esrs_topics" violates foreign key
--      --               constraint "mr_esrs_subtopics_topic_code_fkey"
--    rollback;
--
-- 10) A happy-path baseline round-trips, and provenance defaults to 'starter':
--    begin;
--      insert into public.mr_industry_subtopic_baselines
--        (industry_code, subtopic_code, standard_version, financial_base, impact_base)
--      values ('agri','E1.1','esrs_2026', 8, 5);
--      select provenance, source_ref, source_date from public.mr_industry_subtopic_baselines;
--      -- expect starter | null | null
--    rollback;
--
-- 11) Deviation (5) holds — the trigger moves updated_at and leaves created_at alone.
--     The trigger is attached and points at the shared helper:
--    select tgname, pg_get_triggerdef(oid) from pg_trigger
--    where tgrelid = 'public.mr_industry_subtopic_baselines'::regclass and not tgisinternal;
--    -- expect mr_industry_subtopic_baselines_set_updated_at, BEFORE UPDATE ... FOR EACH ROW
--    --        EXECUTE FUNCTION sbti_set_updated_at()
--
--     Then prove it fires. pg_sleep is what makes the assertion meaningful — inside one
--     transaction now() is fixed, so without it both timestamps would compare equal whether
--     the trigger ran or not, and the probe would pass on a table that has no trigger at all:
--    begin;
--      insert into public.mr_industry_subtopic_baselines
--        (industry_code, subtopic_code, standard_version, financial_base, impact_base)
--      values ('agri','E1.1','esrs_2026', 8, 5);
--      select pg_sleep(1);
--      update public.mr_industry_subtopic_baselines
--         set financial_base = 9, updated_at = '1999-01-01'   -- deliberately wrong; trigger must win
--       where industry_code = 'agri' and subtopic_code = 'E1.1' and standard_version = 'esrs_2026';
--      select created_at, updated_at,
--             updated_at > created_at            as updated_at_moved,      -- expect t
--             updated_at > '2020-01-01'::timestamptz as caller_value_ignored -- expect t
--        from public.mr_industry_subtopic_baselines
--       where industry_code = 'agri' and subtopic_code = 'E1.1';
--      -- created_at must be the INSERT time, unchanged; updated_at must be ~1s later, and must
--      -- NOT be 1999 — that is the proof the database wrote it and the caller's value was discarded.
--    rollback;
