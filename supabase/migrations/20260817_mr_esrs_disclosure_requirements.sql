-- 20260817_mr_esrs_disclosure_requirements.sql
--
-- Versions the ESRS DISCLOSURE REQUIREMENTS. One row per (dr_code, standard_version), so a report
-- can reprint the requirements as they stood when the assessment ran rather than as they stand
-- today. Sibling of 20260815_mr_esrs_topic_labels.sql, one level down.
--
-- Schema + seed only. No route reads this table yet — that is Part B.
--
--
-- ⚠️ WHY THIS TABLE EXISTS, AND WHY A CONSTANT COULD NOT KEEP DOING THE JOB
--
-- ESRS (2026) RENUMBERED THE DISCLOSURE REQUIREMENTS. Two were inserted into E1 at positions 2 and
-- 3 and everything below shifted by two. So:
--
--     E1-5   under Del. Reg. (EU) 2023/2772   =  'Energy consumption and mix'
--     E1-5   under C(2026) 5010               =  'Actions and resources in relation to climate
--                                                 change mitigation and adaptation'
--
-- Every code from E1-2 down STILL RESOLVES and now names a different requirement. That is the
-- dangerous shape: nothing throws, nothing renders blank, no test goes red. A report that states
-- 'ESRS (2026)' at the top and prints the 2023 codes beneath it does not fail — IT SENDS A PREPARER
-- TO COLLECT THE WRONG DATA. Energy consumption instead of actions and resources, and nobody finds
-- out until an auditor asks why the DR they were pointed at is not the DR they disclosed against.
--
-- This is the same argument as the topic labels, with more consequence. A wrong topic NAME is read
-- and discounted by anyone who knows the standard; a wrong DR CODE is worked from. The roadmap
-- section is the part of the report a preparer actually executes.
--
--
-- ⚠️ THE FK TARGET HAS NO MIGRATION IN THIS REPO. public.mr_esrs_topics is DB-only — grep the
-- migrations directory and you will find references to it but no CREATE TABLE. If the database is
-- ever rebuilt from git alone, that table does not exist and this file fails on the foreign key.
-- Same class of trap as the entitlements dependency in 20260811_deals_free_tier_cap.sql. Rebuild
-- order matters, and mr_esrs_topics has to be recreated by hand first.
--
--
-- =====================================================================
-- SOURCE OF THE esrs_2026 ROWS — 64, SEEDED FROM A FILE, NOT RETYPED
-- =====================================================================
-- docs/reference/drs2026.tsv, tab-separated: topic_code <TAB> dr_code <TAB> title.
--
-- Those titles were PATTERN-EXTRACTED from the adopted Annex I PDF text of Commission Delegated
-- Regulation C(2026) 5010 final, and then:
--   · three wrapped headings were repaired against the body text, and
--   · curly apostrophes were normalised to straight.
-- Nothing else was altered. The extraction is mechanical and the two repairs are recorded, which is
-- a weaker claim than the topic labels' 'transcribed from the adopted text' and is stated as such
-- deliberately — see the fidelity note on the 2023 rows below for why the register matters.
--
-- THE INSERT BELOW WAS GENERATED FROM THAT FILE, NOT HAND-COPIED. Re-deriving it is one command,
-- and the report accompanying this migration records a full 64-row string comparison plus per-topic
-- counts. Retyping 64 legal headings by hand is exactly how a renumbering defect gets reintroduced
-- while looking like diligence.
--
-- COUNTS PER TOPIC (2026):
--   E1 11 · E2 5 · E3 4 · E4 5 · E5 5 · S1 16 · S2 4 · S3 4 · S4 4 · G1 6  = 64
--
--
-- =====================================================================
-- datapoints IS NULL FOR EVERY 2026 ROW, AND THAT IS THE HONEST STATE
-- =====================================================================
-- The 2023 map's `data` strings are THEMISIQ-AUTHORED SUMMARY PROSE — 'Total energy consumption
-- (MWh); fossil / nuclear / renewable split; ...' — not annex text. They are a useful gloss on what
-- a preparer has to collect, and they were written here, not lifted from the instrument.
--
-- So the 2026 equivalents cannot be transcribed. They have to be WRITTEN, against 64 requirements
-- whose numbering and scope have both moved, and that is Lisa's judgement in a separate task.
-- Seeding them with the 2023 strings shifted onto 2026 codes would be the renumbering defect again,
-- one column across: plausible prose under a code it no longer describes.
--
-- ⚠️ A NULL datapoints MUST RENDER AS ABSENT, NEVER AS AN EMPTY CELL. An empty cell in a column
-- headed 'Data to collect' reads as 'nothing to collect' — a finding — when the truth is 'not yet
-- written'. That is the same absence-rendered-as-a-finding failure the GHG engine's declaration
-- states exist to prevent, and Part B's consumer is where it has to be enforced.
--
--
-- =====================================================================
-- SOURCE OF THE esrs_2023 ROWS — 61, MIGRATED FROM A CONSTANT, CURATED, UNVERIFIED
-- =====================================================================
-- ⚠️ READ THIS BEFORE CITING A 2023 ROW AS LEGAL TEXT. IT IS NOT ONE.
--
-- These 61 rows are MIGRATED FROM ESRS_DR_MAP in app/dashboard/materiality/report/page.tsx. That
-- constant is an IN-REPO, HAND-AUTHORED, CURATED set. It was NOT transcribed from Commission
-- Delegated Regulation (EU) 2023/2772, and ITS FIDELITY TO THAT INSTRUMENT IS UNVERIFIED.
--
-- THE CURATION IS VISIBLE IN THE COUNTS. ESRS S1 has SEVENTEEN disclosure requirements in the 2023
-- standard; the constant carries EIGHT of them (S1-1, S1-3, S1-4, S1-5, S1-6, S1-14, S1-16, S1-17
-- — note the gaps, which are the proof). Someone chose a subset. That choice may well have been a
-- good one for a materiality roadmap, but a subset is not the standard, and this table must not
-- launder it into one.
--
--   topic   2023 rows here   2026 rows here
--   E1            9               11
--   E2            6                5
--   E3            5                4
--   E4            6                5
--   E5            6                5
--   S1            8               16
--   S2            5                4
--   S3            5                4
--   S4            5                4
--   G1            6                6
--   TOTAL        61               64
--
-- Do not read that table as a diff. The left column is a curated selection of unverified fidelity;
-- the right is a mechanical extraction of the adopted annex. They are not the same kind of thing,
-- and the row counts are not comparable evidence of what changed between the standards.
--
-- The `data` strings carry across unchanged as `datapoints`, keeping their authorship: ThemisIQ
-- summary prose, which is what they always were.
--
-- WHEN SOMEONE TRANSCRIBES THE REAL 2023 REQUIREMENTS from Del. Reg. (EU) 2023/2772 Annex I, they
-- replace these rows and this header's fidelity warning goes with them. Until then every consumer
-- that prints a 2023 DR is printing ThemisIQ's curation, and Part B's disclosure has to say so.
--
--
-- =====================================================================
-- ⚠️ NO OLD-TO-NEW CODE MAPPING TABLE. DELIBERATELY.
-- =====================================================================
-- The obvious next table — 2023 code -> 2026 code — is NOT built here, and it must not be added as
-- a convenience later. Inferring which 2023 DR corresponds to which 2026 one is JUDGEMENT, NOT
-- EXTRACTION, and two topics prove it outright:
--   · E3 LOST 'marine resources' ENTIRELY. The 2026 topic is 'Water'. There is no honest target for
--     the marine half of a 2023 water-and-marine requirement.
--   · S1 WENT FROM 17 TO 16 BY RESTRUCTURING, not by deleting one. Requirements were merged and
--     split; a positional map would be fiction with a plausible shape.
-- A mapping table looks like data and would be consumed like data. It is an opinion, it needs its
-- own task, its own reviewer and its own provenance, and it does not belong in a seed migration.
--
--
-- =====================================================================
-- GRANTS, RLS AND THE REST — COPIED FROM 20260815_mr_esrs_topic_labels.sql, EXACTLY
-- =====================================================================
-- revoke all from the three roles first (this file replays after the 7 Aug cleanup, so the table is
-- born with Supabase's default anon grants and nothing later strips them), then grant SELECT only,
-- then RLS with a <table>_read policy naming `to anon, authenticated` explicitly — never a bare
-- `to public`, which is the root cause 20260807_supplier_portal_policy_cleanup.sql was written to
-- fix. service_role gets plain SELECT for the reason given in that file's deviation (4).
--
-- NO updated_at: a versioned reference row is not corrected in place, it gets a new
-- standard_version row. NO provenance/source_ref columns: 20260715_mr_provenance_columns.sql draws
-- the line at tables carrying calibratable model VALUES, and this one holds nothing but text.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT EXISTS,
-- guarded CREATE POLICY, idempotent grants, and the seeds upsert. Nothing reads the table yet, so
-- it is safe to apply independently of any code change.

begin;

-- =====================================================================
-- mr_esrs_disclosure_requirements
-- =====================================================================
create table if not exists public.mr_esrs_disclosure_requirements (
  dr_code          text        not null,
  standard_version text        not null
    check (standard_version in ('esrs_2023', 'esrs_2023_reliefs', 'esrs_2026')),
  topic_code       text        not null,
  title            text        not null,
  -- NULLABLE ON PURPOSE. Null = 'not yet written', which is NOT 'nothing to collect'. Every 2026
  -- row is null today; see the header. A consumer that renders null as an empty cell has turned an
  -- absence into a finding.
  datapoints       text,
  sort_order       smallint    not null,
  created_at       timestamptz not null default now(),

  constraint mr_esrs_disclosure_requirements_pkey primary key (dr_code, standard_version),

  -- RESTRICT, matching mr_esrs_subtopics and mr_esrs_topic_labels: deleting an ESRS topic should
  -- require saying so, not silently take its disclosure requirements with it.
  constraint mr_esrs_disclosure_requirements_topic_code_fkey
    foreign key (topic_code) references public.mr_esrs_topics (code) on delete restrict
);

-- The one index this table earns. Part B's read is
-- `where standard_version = $1 order by topic_code, sort_order` — standard_version is the PK's
-- SECOND column, so the PK's prefix cannot serve it. At 125 rows a sequential scan is genuinely
-- cheaper, and this exists for the ORDERING as much as the filter: it is the exact shape of the
-- roadmap query, so the rows come back grouped and ordered without a sort node.
create index if not exists mr_esrs_disclosure_requirements_version_idx
  on public.mr_esrs_disclosure_requirements (standard_version, topic_code, sort_order);

comment on table public.mr_esrs_disclosure_requirements is
  'Per-standard-version ESRS disclosure requirements. Exists because ESRS (2026) RENUMBERED the DRs — two were inserted into E1 at positions 2 and 3 and everything below shifted, so E1-5 means "Energy consumption and mix" under 2023 and "Actions and resources" under 2026. Codes still resolve either way, so a report printing the wrong vintage does not fail, it sends a preparer to collect the wrong data. esrs_2026 (64 rows) is pattern-extracted from C(2026) 5010 Annex I via docs/reference/drs2026.tsv. esrs_2023 (61 rows) is MIGRATED FROM THE IN-REPO ESRS_DR_MAP CONSTANT — hand-authored, curated (S1 carries 8 of the standard''s 17), and of UNVERIFIED fidelity to Del. Reg. (EU) 2023/2772.';

comment on column public.mr_esrs_disclosure_requirements.title is
  'Requirement heading as printed by the named standard version. esrs_2026 titles are pattern-extracted from the adopted C(2026) 5010 Annex I text, with three wrapped headings repaired against the body and curly apostrophes normalised to straight. esrs_2023 titles come from the ESRS_DR_MAP constant and are ThemisIQ''s wording, not the instrument''s.';

comment on column public.mr_esrs_disclosure_requirements.datapoints is
  'ThemisIQ-authored summary of what the requirement obliges a preparer to collect. NOT annex text. NULL for every esrs_2026 row: the 2026 equivalents must be written against renumbered and rescoped requirements, which is judgement, not transcription. NULL MUST RENDER AS ABSENT — an empty cell under a "data to collect" heading reads as "nothing to collect", which is a finding this column cannot support.';

comment on column public.mr_esrs_disclosure_requirements.standard_version is
  'Which ESRS version this requirement belongs to. Three values coexist per Art. 2(1) of the 2026 delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026.';

comment on column public.mr_esrs_disclosure_requirements.sort_order is
  'Display order WITHIN a (topic_code, standard_version) group, restarting at 1 for each — same convention as mr_esrs_subtopics. Not a global rank.';

-- =====================================================================
-- Grants — explicit, because this file replays after the 7 Aug cleanup
-- =====================================================================
revoke all on public.mr_esrs_disclosure_requirements from anon;
revoke all on public.mr_esrs_disclosure_requirements from authenticated;
revoke all on public.mr_esrs_disclosure_requirements from service_role;

grant select on public.mr_esrs_disclosure_requirements to anon, authenticated, service_role;

-- =====================================================================
-- RLS — matching the existing mr_* tables
-- =====================================================================
alter table public.mr_esrs_disclosure_requirements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_esrs_disclosure_requirements'
      and policyname = 'mr_esrs_disclosure_requirements_read'
  ) then
    create policy mr_esrs_disclosure_requirements_read on public.mr_esrs_disclosure_requirements
      for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- Seed — standard_version = 'esrs_2026'. 64 rows.
-- =====================================================================
-- GENERATED FROM docs/reference/drs2026.tsv. Do not hand-edit a row here: fix the TSV, regenerate,
-- and re-run. ON CONFLICT DO UPDATE, so a replay RECONCILES the table back to this file — the
-- corollary being that a row edited in the SQL editor is silently reverted by the next run.
--
-- datapoints is null on every row. That is the seed's actual state, not an oversight; see header.
insert into public.mr_esrs_disclosure_requirements
  (dr_code, standard_version, topic_code, title, datapoints, sort_order) values
  ('E1-1', 'esrs_2026', 'E1', 'Transition plan for climate change mitigation', null, 1),
  ('E1-2', 'esrs_2026', 'E1', 'Identification of climate-related risks and scenario analysis', null, 2),
  ('E1-3', 'esrs_2026', 'E1', 'Resilience in relation to climate change', null, 3),
  ('E1-4', 'esrs_2026', 'E1', 'Policies related to climate change mitigation and adaptation', null, 4),
  ('E1-5', 'esrs_2026', 'E1', 'Actions and resources in relation to climate change mitigation and adaptation', null, 5),
  ('E1-6', 'esrs_2026', 'E1', 'Targets related to climate change', null, 6),
  ('E1-7', 'esrs_2026', 'E1', 'Energy consumption and mix', null, 7),
  ('E1-8', 'esrs_2026', 'E1', 'Gross scope 1, 2, 3 GHG emissions', null, 8),
  ('E1-9', 'esrs_2026', 'E1', 'GHG removals and GHG mitigation projects financed through carbon credits', null, 9),
  ('E1-10', 'esrs_2026', 'E1', 'Internal carbon pricing', null, 10),
  ('E1-11', 'esrs_2026', 'E1', 'Anticipated financial effects from material physical and transition risks and potential climate-related opportunities', null, 11),
  ('E2-1', 'esrs_2026', 'E2', 'Policies related to pollution', null, 1),
  ('E2-2', 'esrs_2026', 'E2', 'Actions and resources related to pollution', null, 2),
  ('E2-3', 'esrs_2026', 'E2', 'Targets related to pollution', null, 3),
  ('E2-4', 'esrs_2026', 'E2', 'Pollution of air, water and soil', null, 4),
  ('E2-5', 'esrs_2026', 'E2', 'Substances of concern and substances of very high concern', null, 5),
  ('E3-1', 'esrs_2026', 'E3', 'Policies related to water', null, 1),
  ('E3-2', 'esrs_2026', 'E3', 'Actions and resources related to water', null, 2),
  ('E3-3', 'esrs_2026', 'E3', 'Targets related to water', null, 3),
  ('E3-4', 'esrs_2026', 'E3', 'Water metrics', null, 4),
  ('E4-1', 'esrs_2026', 'E4', 'Biodiversity and ecosystems transition plan', null, 1),
  ('E4-2', 'esrs_2026', 'E4', 'Policies related to biodiversity and ecosystems', null, 2),
  ('E4-3', 'esrs_2026', 'E4', 'Actions and resources related to biodiversity and ecosystems', null, 3),
  ('E4-4', 'esrs_2026', 'E4', 'Targets related to biodiversity and ecosystems', null, 4),
  ('E4-5', 'esrs_2026', 'E4', 'Metrics related to biodiversity and ecosystems change', null, 5),
  ('E5-1', 'esrs_2026', 'E5', 'Policies related to resource use and circular economy', null, 1),
  ('E5-2', 'esrs_2026', 'E5', 'Actions and resources related to resource use and circular economy', null, 2),
  ('E5-3', 'esrs_2026', 'E5', 'Targets related to resource use and circular economy', null, 3),
  ('E5-4', 'esrs_2026', 'E5', 'Resource inflows', null, 4),
  ('E5-5', 'esrs_2026', 'E5', 'Resource outflows', null, 5),
  ('S1-1', 'esrs_2026', 'S1', 'Policies related to own workforce', null, 1),
  ('S1-2', 'esrs_2026', 'S1', 'Engagement with own workforce and workers'' representatives, existence of channels for own workforce to raise concerns or needs and approaches to remedy', null, 2),
  ('S1-3', 'esrs_2026', 'S1', 'Actions and resources related to own workforce', null, 3),
  ('S1-4', 'esrs_2026', 'S1', 'Targets related to own workforce', null, 4),
  ('S1-5', 'esrs_2026', 'S1', 'Characteristics of the undertaking''s employees', null, 5),
  ('S1-6', 'esrs_2026', 'S1', 'Characteristics of non-employees in the undertaking''s own workforce', null, 6),
  ('S1-7', 'esrs_2026', 'S1', 'Collective bargaining coverage and social dialogue', null, 7),
  ('S1-8', 'esrs_2026', 'S1', 'Gender diversity in top management', null, 8),
  ('S1-9', 'esrs_2026', 'S1', 'Adequate wages', null, 9),
  ('S1-10', 'esrs_2026', 'S1', 'Social protection', null, 10),
  ('S1-11', 'esrs_2026', 'S1', 'Persons with disabilities', null, 11),
  ('S1-12', 'esrs_2026', 'S1', 'Training and skills development metrics', null, 12),
  ('S1-13', 'esrs_2026', 'S1', 'Health and safety metrics', null, 13),
  ('S1-14', 'esrs_2026', 'S1', 'Work-life balance metrics', null, 14),
  ('S1-15', 'esrs_2026', 'S1', 'Remuneration metrics', null, 15),
  ('S1-16', 'esrs_2026', 'S1', 'Incidents of discrimination and other human rights incidents', null, 16),
  ('S2-1', 'esrs_2026', 'S2', 'Policies related to workers in the value chain', null, 1),
  ('S2-2', 'esrs_2026', 'S2', 'Engagement with workers in the value chain, existence of channels for workers in the value chain to raise concerns or needs and approaches to remedy', null, 2),
  ('S2-3', 'esrs_2026', 'S2', 'Actions and resources related to workers in the value chain', null, 3),
  ('S2-4', 'esrs_2026', 'S2', 'Targets related to workers in the value chain', null, 4),
  ('S3-1', 'esrs_2026', 'S3', 'Policies related to affected communities', null, 1),
  ('S3-2', 'esrs_2026', 'S3', 'Engagement with affected communities, existence of channels for affected communities to raise concerns or needs and approaches to remedy', null, 2),
  ('S3-3', 'esrs_2026', 'S3', 'Actions and resources related to affected communities', null, 3),
  ('S3-4', 'esrs_2026', 'S3', 'Targets related to affected communities', null, 4),
  ('S4-1', 'esrs_2026', 'S4', 'Policies related to consumers and end-users', null, 1),
  ('S4-2', 'esrs_2026', 'S4', 'Engagement with consumers and end-users, existence of channels for consumers and end-users to raise concerns or needs and approaches to remedy', null, 2),
  ('S4-3', 'esrs_2026', 'S4', 'Actions and resources related to consumers and end-users', null, 3),
  ('S4-4', 'esrs_2026', 'S4', 'Targets related to consumers and end-users', null, 4),
  ('G1-1', 'esrs_2026', 'G1', 'Policies related to business conduct', null, 1),
  ('G1-2', 'esrs_2026', 'G1', 'Actions related to business conduct', null, 2),
  ('G1-3', 'esrs_2026', 'G1', 'Targets related to business conduct', null, 3),
  ('G1-4', 'esrs_2026', 'G1', 'Metrics related to corruption or bribery', null, 4),
  ('G1-5', 'esrs_2026', 'G1', 'Metrics related to political influence, including lobbying activities', null, 5),
  ('G1-6', 'esrs_2026', 'G1', 'Metrics related to payment practices', null, 6)
on conflict (dr_code, standard_version) do update
  set topic_code  = excluded.topic_code,
      title       = excluded.title,
      datapoints  = excluded.datapoints,
      sort_order  = excluded.sort_order;

-- =====================================================================
-- Seed — standard_version = 'esrs_2023'. 61 rows. CURATED, NOT TRANSCRIBED.
-- =====================================================================
-- MIGRATED FROM ESRS_DR_MAP (app/dashboard/materiality/report/page.tsx), extracted programmatically
-- rather than retyped. These are ThemisIQ's own headings and summaries for a CURATED SUBSET of the
-- 2023 standard — S1 carries 8 of its 17 requirements. Fidelity to Del. Reg. (EU) 2023/2772 is
-- UNVERIFIED and must not be claimed. See the header.
--
-- Seeded anyway, rather than left empty like the 2023 topic labels, because the difference matters:
-- an unseeded label falls back to a name the module has always shown, which is harmless. An
-- unseeded requirement set would leave a 2023 roadmap with NO requirements at all — and the module
-- has been printing exactly these 61 for as long as it has existed. Storing them changes nothing a
-- customer sees; it moves them somewhere a version can be attached to them and a caveat can travel
-- with them.
insert into public.mr_esrs_disclosure_requirements
  (dr_code, standard_version, topic_code, title, datapoints, sort_order) values
  ('E1-1', 'esrs_2023', 'E1', 'Transition plan for climate change mitigation', 'Plan compatibility with limiting warming to 1.5°C; decarbonisation levers (disclosed only where a plan exists)', 1),
  ('E1-2', 'esrs_2023', 'E1', 'Policies', 'Climate change mitigation and adaptation policies', 2),
  ('E1-3', 'esrs_2023', 'E1', 'Actions and resources', 'Key actions, expected GHG reductions, CapEx/OpEx allocated', 3),
  ('E1-4', 'esrs_2023', 'E1', 'Targets', 'GHG reduction targets, base year, milestone/target years, absolute and intensity', 4),
  ('E1-5', 'esrs_2023', 'E1', 'Energy consumption and mix', 'Total energy consumption (MWh); fossil / nuclear / renewable split; energy intensity per net revenue', 5),
  ('E1-6', 'esrs_2023', 'E1', 'Gross Scopes 1, 2, 3 and total GHG emissions', 'Scope 1; Scope 2 (location- and market-based); Scope 3 by category; total GHG; intensity per net revenue', 6),
  ('E1-7', 'esrs_2023', 'E1', 'GHG removals and carbon credits', 'Removals (tCO₂e); carbon credits cancelled or planned', 7),
  ('E1-8', 'esrs_2023', 'E1', 'Internal carbon pricing', 'Schemes applied, prices used, scope of emissions covered', 8),
  ('E1-9', 'esrs_2023', 'E1', 'Anticipated financial effects', 'Monetary exposure from material physical and transition risks; climate-related opportunities', 9),
  ('E2-1', 'esrs_2023', 'E2', 'Policies', 'Policies to prevent and control pollution of air, water and soil', 1),
  ('E2-2', 'esrs_2023', 'E2', 'Actions and resources', 'Actions taken and resources allocated', 2),
  ('E2-3', 'esrs_2023', 'E2', 'Targets', 'Pollution-reduction targets', 3),
  ('E2-4', 'esrs_2023', 'E2', 'Pollution of air, water and soil', 'Emissions of pollutants to air, water, soil (tonnes), by pollutant', 4),
  ('E2-5', 'esrs_2023', 'E2', 'Substances of concern', 'Production/use of substances of concern and of very high concern (tonnes)', 5),
  ('E2-6', 'esrs_2023', 'E2', 'Anticipated financial effects', 'Monetary exposure from pollution-related risks and opportunities', 6),
  ('E3-1', 'esrs_2023', 'E3', 'Policies', 'Water and marine-resources policies', 1),
  ('E3-2', 'esrs_2023', 'E3', 'Actions and resources', 'Actions taken and resources allocated', 2),
  ('E3-3', 'esrs_2023', 'E3', 'Targets', 'Water-related targets', 3),
  ('E3-4', 'esrs_2023', 'E3', 'Water consumption', 'Total water consumption (m³); consumption in water-stressed areas; water intensity per net revenue', 4),
  ('E3-5', 'esrs_2023', 'E3', 'Anticipated financial effects', 'Monetary exposure from water-related risks and opportunities', 5),
  ('E4-1', 'esrs_2023', 'E4', 'Transition plan and resilience', 'Biodiversity transition plan; resilience of the strategy', 1),
  ('E4-2', 'esrs_2023', 'E4', 'Policies', 'Biodiversity and ecosystems policies', 2),
  ('E4-3', 'esrs_2023', 'E4', 'Actions and resources', 'Actions taken and resources allocated', 3),
  ('E4-4', 'esrs_2023', 'E4', 'Targets', 'Biodiversity and ecosystems targets', 4),
  ('E4-5', 'esrs_2023', 'E4', 'Impact metrics', 'Land-use change; state of species and ecosystems', 5),
  ('E4-6', 'esrs_2023', 'E4', 'Anticipated financial effects', 'Monetary exposure from biodiversity-related risks and opportunities', 6),
  ('E5-1', 'esrs_2023', 'E5', 'Policies', 'Resource-use and circular-economy policies', 1),
  ('E5-2', 'esrs_2023', 'E5', 'Actions and resources', 'Actions taken and resources allocated', 2),
  ('E5-3', 'esrs_2023', 'E5', 'Targets', 'Resource-use and circular-economy targets', 3),
  ('E5-4', 'esrs_2023', 'E5', 'Resource inflows', 'Materials used (tonnes); share of recycled / renewable inputs', 4),
  ('E5-5', 'esrs_2023', 'E5', 'Resource outflows', 'Products, materials and waste (tonnes); recyclable content; hazardous / non-hazardous waste', 5),
  ('E5-6', 'esrs_2023', 'E5', 'Anticipated financial effects', 'Monetary exposure from resource-related risks and opportunities', 6),
  ('S1-1', 'esrs_2023', 'S1', 'Policies', 'Own-workforce policies', 1),
  ('S1-3', 'esrs_2023', 'S1', 'Channels to raise concerns', 'Grievance channels and remediation for own workforce', 2),
  ('S1-4', 'esrs_2023', 'S1', 'Actions', 'Actions on material impacts and their effectiveness', 3),
  ('S1-5', 'esrs_2023', 'S1', 'Targets', 'Workforce-related targets', 4),
  ('S1-6', 'esrs_2023', 'S1', 'Characteristics of employees', 'Headcount by gender, country and contract type; turnover', 5),
  ('S1-14', 'esrs_2023', 'S1', 'Health and safety', 'Coverage; recordable work-related injuries, fatalities, and ill-health', 6),
  ('S1-16', 'esrs_2023', 'S1', 'Remuneration (pay gap)', 'Gender pay gap (%); total-remuneration ratio (highest-paid to median)', 7),
  ('S1-17', 'esrs_2023', 'S1', 'Incidents and complaints', 'Discrimination / harassment incidents; severe human-rights incidents', 8),
  ('S2-1', 'esrs_2023', 'S2', 'Policies', 'Value-chain-worker policies', 1),
  ('S2-2', 'esrs_2023', 'S2', 'Engagement', 'Processes to engage value-chain workers on impacts', 2),
  ('S2-3', 'esrs_2023', 'S2', 'Channels to raise concerns', 'Grievance channels and remediation', 3),
  ('S2-4', 'esrs_2023', 'S2', 'Actions', 'Actions on material impacts and their effectiveness', 4),
  ('S2-5', 'esrs_2023', 'S2', 'Targets', 'Value-chain-worker targets', 5),
  ('S3-1', 'esrs_2023', 'S3', 'Policies', 'Affected-communities policies', 1),
  ('S3-2', 'esrs_2023', 'S3', 'Engagement', 'Processes to engage affected communities on impacts', 2),
  ('S3-3', 'esrs_2023', 'S3', 'Channels to raise concerns', 'Grievance channels and remediation', 3),
  ('S3-4', 'esrs_2023', 'S3', 'Actions', 'Actions on material impacts and their effectiveness', 4),
  ('S3-5', 'esrs_2023', 'S3', 'Targets', 'Community-related targets', 5),
  ('S4-1', 'esrs_2023', 'S4', 'Policies', 'Consumer / end-user policies', 1),
  ('S4-2', 'esrs_2023', 'S4', 'Engagement', 'Processes to engage consumers and end-users on impacts', 2),
  ('S4-3', 'esrs_2023', 'S4', 'Channels to raise concerns', 'Grievance channels and remediation', 3),
  ('S4-4', 'esrs_2023', 'S4', 'Actions', 'Actions on material impacts and their effectiveness', 4),
  ('S4-5', 'esrs_2023', 'S4', 'Targets', 'Consumer / end-user targets', 5),
  ('G1-1', 'esrs_2023', 'G1', 'Business conduct policies and corporate culture', 'Conduct policies; description of corporate culture', 1),
  ('G1-2', 'esrs_2023', 'G1', 'Management of supplier relationships', 'Approach to supplier relationships; payment-practices policy', 2),
  ('G1-3', 'esrs_2023', 'G1', 'Prevention and detection of corruption and bribery', 'Procedures in place; training coverage', 3),
  ('G1-4', 'esrs_2023', 'G1', 'Confirmed incidents of corruption or bribery', 'Number of confirmed incidents; convictions; fines', 4),
  ('G1-5', 'esrs_2023', 'G1', 'Political influence and lobbying', 'Political contributions; lobbying spend', 5),
  ('G1-6', 'esrs_2023', 'G1', 'Payment practices', 'Average time to pay; standard terms; late-payment status', 6)
on conflict (dr_code, standard_version) do update
  set topic_code  = excluded.topic_code,
      title       = excluded.title,
      datapoints  = excluded.datapoints,
      sort_order  = excluded.sort_order;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Row counts per version — 64 and 61, and nothing under esrs_2023_reliefs:
--    select standard_version, count(*) from public.mr_esrs_disclosure_requirements
--    group by standard_version order by standard_version;
--    -- expect exactly: esrs_2023 | 61   and   esrs_2026 | 64
--
-- 2) Counts per topic for 2026, against the adopted annex:
--    select topic_code, count(*) from public.mr_esrs_disclosure_requirements
--    where standard_version = 'esrs_2026' group by topic_code order by topic_code;
--    -- expect E1 11, E2 5, E3 4, E4 5, E5 5, G1 6, S1 16, S2 4, S3 4, S4 4
--
-- 3) THE RENUMBERING, PROVEN IN THE TABLE. This is the whole reason the table exists, so read it
--    rather than trust it:
--    select dr_code,
--           max(title) filter (where standard_version = 'esrs_2023') as title_2023,
--           max(title) filter (where standard_version = 'esrs_2026') as title_2026
--    from public.mr_esrs_disclosure_requirements
--    where dr_code like 'E1-%' group by dr_code order by length(dr_code), dr_code;
--    -- expect E1-5 to read 'Energy consumption and mix' on the left and
--    --        'Actions and resources in relation to climate change mitigation and adaptation'
--    --        on the right. If those two agree, the seed did not do its job.
--
-- 4) How many codes exist in BOTH versions and disagree on title — the size of the trap:
--    select count(*) from (
--      select dr_code from public.mr_esrs_disclosure_requirements
--      group by dr_code having count(distinct standard_version) > 1
--         and count(distinct title) > 1) x;
--
-- 5) datapoints is null for every 2026 row and non-null for every 2023 row:
--    select standard_version, count(*) filter (where datapoints is null) as nulls, count(*) as total
--    from public.mr_esrs_disclosure_requirements group by standard_version;
--    -- expect esrs_2026 | 64 | 64   and   esrs_2023 | 0 | 61
--
-- 6) sort_order restarts at 1 per (topic, version) and is contiguous:
--    select standard_version, topic_code, min(sort_order), max(sort_order), count(*)
--    from public.mr_esrs_disclosure_requirements
--    group by standard_version, topic_code
--    having min(sort_order) <> 1 or max(sort_order) <> count(*);
--    -- expect ZERO rows
--
-- 7) Every topic_code resolves to a real topic (the FK proves it, but read it once):
--    select distinct d.topic_code from public.mr_esrs_disclosure_requirements d
--    left join public.mr_esrs_topics t on t.code = d.topic_code where t.code is null;
--    -- expect zero rows
--
-- 8) Grants are read-only for every role:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'mr_esrs_disclosure_requirements'
--    group by grantee order by grantee;   -- expect SELECT only, three roles
--
-- 9) RLS on, one read policy, roles named explicitly (never bare `public`):
--    select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'mr_esrs_disclosure_requirements';   -- expect t
--    select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'mr_esrs_disclosure_requirements';
--    -- expect mr_esrs_disclosure_requirements_read | {anon,authenticated} | SELECT
--
-- 10) The CHECK admits the unseeded reliefs version, so it can be seeded later without DDL:
--    begin;
--      insert into public.mr_esrs_disclosure_requirements
--        (dr_code, standard_version, topic_code, title, sort_order)
--      values ('E1-1', 'esrs_2023_reliefs', 'E1', 'placeholder', 1);   -- expect success
--      insert into public.mr_esrs_disclosure_requirements
--        (dr_code, standard_version, topic_code, title, sort_order)
--      values ('E1-1', 'esrs_2027', 'E1', 'placeholder', 1);           -- expect ERROR: check
--    rollback;
--
-- 11) The FK restricts rather than cascades:
--    begin;
--      delete from public.mr_esrs_topics where code = 'E3';
--      -- expect ERROR: violates foreign key constraint (from any of the three mr_esrs_* children)
--    rollback;
