-- 20260818_mr_subtopic_display_and_stakeholder_categories.sql
--
-- SCREENING SURVEY — FILE 1 of 2. REFERENCE TABLES ONLY. RUN THIS BEFORE
-- 20260819_materiality_survey_schema.sql, which depends on both tables here.
--
-- Two tables, both reference data, both seeded, both read-only to every role:
--   mr_esrs_subtopic_display     ThemisIQ house copy for presenting a sub-topic to a human
--   mr_stakeholder_categories    ESRS 1 AR 23 / glossary stakeholder categories + S1/S2 routing
--
-- Schema + seed only. No route reads either yet, and no RPC, aggregation or write-back ships with
-- them — those are later tasks. Design authority: docs/materiality-questionnaire-spec-v8.md.
--
--
-- ⚠️ WHY TWO FILES AND NOT SIX, AND WHY THE DATES DIFFER
-- Migrations replay in FILENAME order. Six separate files dated the same day would sort
-- alphabetically as questions -> respondents -> responses -> rounds, which is exactly backwards:
-- materiality_survey_questions carries a foreign key to materiality_survey_rounds. Two files on
-- two dates makes the order unambiguous and each file internally ordered, which is the same shape
-- as 20260815_mr_esrs_subtopics.sql creating two tables in one file for the same reason.
--
--
-- =====================================================================
-- TABLE 1 — mr_esrs_subtopic_display
-- =====================================================================
--
-- ⚠️ THIS IS HOUSE COPY. IT IS NOT TRANSCRIBED LAW, AND THE NAME SAYS SO ON PURPOSE.
-- It is deliberately NOT called mr_esrs_subtopic_labels: that would read as the sibling of
-- mr_esrs_topic_labels, which holds the ANNEX's own topic names transcribed from the adopted text.
-- Every string in this table was written here. Nothing in it may ever be cited as the instrument's
-- wording, and the verbatim label always travels to the report alongside it — never replaced by it.
--
-- WHY IT EXISTS. Spec v8 §3.2: the annex label is not usable as question wording for roughly a
-- third of the rows. S1.1 is 105 characters of parenthetical list; S1.5 is 213. Defaulting a
-- respondent's question to those produces something no Finance manager will read, which is the
-- exact failure §1 exists to prevent. And the labels CANNOT be shortened in place —
-- 20260815_mr_esrs_subtopics.sql is the transcription of record, forbids editing them, and would
-- silently revert any edit on its next replay. So the short name lives beside the label, never
-- instead of it.
--
-- THE LENGTH CHECK IS THE POINT OF THE TABLE, EXPRESSED AS A CONSTRAINT.
--   check (length(btrim(short_name)) between 1 and 60)
-- Without it, "short name" is an intention, and the first person to paste the annex text back in
-- undoes the whole reason for the file with no error. 60 is generous — the longest seeded row is
-- 49 characters — and it is a ceiling, not a target.
--
-- ⚠️ THE TWO COLUMNS BEYOND short_name ARE DELIBERATE, AND BOTH WERE ARGUED FOR BEFORE BEING ADDED.
--
-- question_framing — §3.0.1 settles S1/S2 as "ask once per respondent, AUTHOR TWICE". A respondent
--   asked about health and safety needs to know whose: their own workplace, or workers in their
--   suppliers' operations. Because the taxonomy already duplicates the six labour sub-topics as
--   S1.1-6 and S2.1-6, each row can carry its own framing and the per-target wording costs nothing
--   structurally. The alternative is a framing string in application code, where it drifts from the
--   row it describes — the failure lib/supply-chain/templates.ts has already paid for once, with
--   68 of 75 labels disagreeing across two copies of the same question set.
--
-- shared_with_subtopic_code — the S1.x <-> S2.x pairing, STATED AS DATA. Appendix A gives S1 and S2
--   one shared sub-topic set, but §11.2's recommended duplication means this database holds TWELVE
--   INDEPENDENT ROWS with no relation between them and no canonical "shared" code to author
--   against. The pairing therefore has to be authored somewhere, and the one place it must NOT be
--   is a runtime string manipulation. 20260815_mr_esrs_subtopics.sql's own verify block derives it
--   as `'S2' || substring(a.code from 3)` — correct for a one-off check against a seed you can
--   read, and a latent defect the moment it becomes the routing rule for a live response.
--
--
-- ⚠️ THE ONE DEVIATION FROM ITS PARENT, AND THE REASON THIS IS A SEPARATE TABLE AT ALL:
-- updated_at, WITH A TRIGGER.
-- mr_esrs_subtopics deliberately has NO updated_at, because a verbatim transcription of a legal
-- instrument is never corrected in place — a changed taxonomy gets a new standard_version row, and
-- an updated_at there would imply an edit history the design does not permit. This table is the
-- exact opposite: house copy, expected to improve as customers read it and find a name unclear. So
-- it takes updated_at, written by the shared BEFORE UPDATE trigger and never by a caller, for the
-- reason 20260815 gives about campaign_suppliers.token — an application-set timestamp can be
-- forgotten, and the row where it is forgotten is the row whose age you most needed.
--
-- NO provenance/source_ref/source_date. 20260715_mr_provenance_columns.sql draws the line at tables
-- carrying calibratable model VALUES and excludes dimension/label tables. This one holds nothing
-- but text, and its parent already carries the citation for the thing being named.
--
--
-- =====================================================================
-- TABLE 2 — mr_stakeholder_categories
-- =====================================================================
--
-- Spec v8 §3.0.1's routing table, as ROWS rather than a CASE expression inside an RPC. Three
-- reasons it is data:
--   * ESRS 2 IRO-1 requires the process to be DESCRIBED. A report can print a table; it cannot
--     print a CASE statement.
--   * A response records the category that resolved it (resolution_basis), which is only a
--     meaningful audit trail if the category is a row something can point at.
--   * The routing rule is the kind of thing that gets quietly edited in a function body during an
--     unrelated change. In a seeded table with a migration of record, it cannot.
--
-- ⚠️ TWO BOOLEANS, NOT ONE FLAG — is_affected AND is_user, BOTH SETTABLE.
-- Verified against the adopted Annex I glossary, 15 August 2026 (spec v8 §4). The glossary defines
-- both groups and then states outright: SOME, BUT NOT ALL, STAKEHOLDERS MAY BELONG TO THE TWO
-- GROUPS. A single `affected` boolean cannot express an overlap the instrument names.
--
--   AFFECTED — individuals or groups whose interests are affected or could be affected, positively
--              or negatively, by the undertaking's activities and its direct and indirect business
--              relationships across its value chain (glossary; ESRS 1 ¶42).
--   USERS    — investors, lenders and creditors, plus the undertaking's business partners, social
--              partners including trade unions and employer organisations, civil society and NGOs
--              (glossary).
--
-- A SUPPLIER IS BOTH, AND IS WHY THE SINGLE FLAG FAILED. "Business partners" is named in the users
-- definition. And their interests are affected by the undertaking's activities — ESRS discloses
-- precisely this: G1-6 'Metrics related to payment practices' covers late payment to SMEs, and
-- sub-topic G1.3 names it. That is an impact ON suppliers, disclosed as one.
--
-- ⚠️ AR 23 GIVES THE **TYPICAL** CATEGORIES — A LIST OF EXAMPLES, NOT A CLOSED SET.
-- Absence from it excludes nothing and proves nothing. Two seeded rows rely on this directly:
-- `supplier` is not among AR 23's affected examples yet is seeded is_affected = true on the G1-6
-- basis above, and `regulator` is not named in the glossary's users list yet is seeded
-- is_user = true per §4. Neither is an error; both are judgements, recorded here so they are
-- visible rather than inferred from the data.
--
-- ⚠️ A THIRD BOOLEAN — can_proxy_for_affected. TWO WERE NOT ENOUGH.
-- §4 identifies a third relationship that "affected" and "user" cannot express between them:
-- ESRS 1 ¶42 states that CIVIL SOCIETY, NON-GOVERNMENTAL ORGANISATIONS AND TRADE UNIONS AS USERS
-- CAN BE PROXIES FOR AFFECTED STAKEHOLDERS. "User" and "affected" give two facts about a category;
-- neither gives "a user standing in for an affected party who could not be reached directly".
--
-- That clause is the one an assurance provider is looking for — §4 says so outright — so the model
-- has to be able to produce it. A disclosure cannot state something the data cannot represent, and
-- the alternative was deriving it downstream from is_user AND is_affected, which is not the same
-- proposition and would have been wrong for every row it touched.
--
-- ⚠️ IT IS A CAPABILITY OF THE CATEGORY, NOT A CLAIM ABOUT ANY PARTICULAR RESPONSE. THIS IS THE
-- WHOLE CARE OF THE COLUMN. A trade union CAN speak for workers who were not reached; whether a
-- given respondent DID — whether their answer reported someone else's experience or only their
-- own — is not knowable from the category, is not asked anywhere in the screening survey, and is
-- not recorded on any response row.
--
-- So §7's engagement disclosure may say "categories engaged that can act as proxies for affected
-- stakeholders", and may NOT say "these responses were given on behalf of affected stakeholders".
-- The second reads as an evidentiary claim about who was heard, and nothing in this schema
-- supports it. The first is true and is what ¶42 contemplates. Same discipline as the abstention
-- rule one table over: report what was observed, never what it probably means.
--
-- ⚠️ IT ADDS A CAPABILITY, IT DOES NOT REPLACE A FACT. Both workers'-representative rows stay
-- is_affected = true. A representative is a worker; their own interests are affected whether or
-- not they also speak for colleagues, and the proxy flag must never be read as demoting them out
-- of the affected group. The two questions are independent and are stored independently.
--
-- The four seeded true: workers_rep_own, workers_rep_value_chain, supplier, civil_society.
-- ¶42 names civil society, NGOs and trade unions explicitly. `supplier` is the inference, and it
-- is a narrow one: answering the S2 labour questions, a supplier reports on ITS OWN WORKERS —
-- the affected parties AR 23 names as workers in the value chain, who this survey has no other
-- route to. Recorded here as an inference rather than presented as a citation.
--
-- NOT part of the at-least-one-group CHECK below, deliberately: proxying is not a third group
-- membership, and a category that could only ever proxy — belonging to neither group itself —
-- would not be a stakeholder in the standard's terms.
--
-- ⚠️ labour_routing GOVERNS THE SIX LABOUR SUB-TOPICS ONLY (S1.1-6 / S2.1-6). Every other
-- sub-topic is asked of every respondent. The column is named labour_routing rather than `routing`
-- so it cannot be mistaken for a general question filter — §4's per-department topic subsets are a
-- SECOND, customer-configured axis, and are not built here.
--
-- ⚠️ CHANGING A CATEGORY'S labour_routing LATER MUST BE A NEW CODE, NEVER AN UPDATE IN PLACE.
-- Responses store both their resolved sub-topic and the category that resolved it, so an in-place
-- edit would not corrupt any number — it would make the audit trail claim a rule that was not the
-- one applied. Same argument as standard_version: a changed rule is a new row, not an edit.
--
--
-- GRANTS AND RLS — COPIED FROM 20260817_mr_esrs_disclosure_requirements.sql, EXACTLY.
-- revoke all from the three roles FIRST (this file replays after the 7 Aug cleanup, so both tables
-- are born with Supabase's default anon grants and nothing later strips them), then grant SELECT
-- only, then RLS with a <table>_read policy naming `to anon, authenticated` explicitly — never a
-- bare `to public`, which is the root cause 20260807_supplier_portal_policy_cleanup.sql exists to
-- fix. service_role gets plain SELECT, per that file's deviation (4).
--
-- ⚠️ mr_esrs_subtopics MUST ALREADY EXIST. mr_esrs_subtopic_display's foreign keys target it, and
-- it in turn targets public.mr_esrs_topics — which has NO CREATE TABLE anywhere in this directory
-- and must be recreated by hand before a from-git rebuild reaches this file. Same trap as
-- 20260817's header records.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT EXISTS,
-- guarded CREATE POLICY, idempotent grants, and both seeds upsert.

begin;

-- =====================================================================
-- mr_esrs_subtopic_display
-- =====================================================================
create table if not exists public.mr_esrs_subtopic_display (
  subtopic_code             text        not null,
  standard_version          text        not null
    check (standard_version in ('esrs_2023', 'esrs_2023_reliefs', 'esrs_2026')),

  -- The house-copy name a respondent reads. The 60-character ceiling is the table's reason for
  -- existing, expressed as a constraint rather than as an intention. See the header.
  short_name                text        not null
    check (length(btrim(short_name)) between 1 and 60),

  -- Whose instance of this sub-topic the question is about. NULL on the 25 rows that need no
  -- framing; set on the twelve S1/S2 rows, where it is the only thing distinguishing two
  -- byte-identical short names.
  question_framing          text,

  -- The S1.x <-> S2.x pairing, symmetric. NULL on the other 25.
  shared_with_subtopic_code text,

  created_at                timestamptz not null default now(),
  -- The deviation from mr_esrs_subtopics. This table IS corrected in place; its parent is not.
  updated_at                timestamptz not null default now(),

  constraint mr_esrs_subtopic_display_pkey
    primary key (subtopic_code, standard_version),

  -- RESTRICT, matching every other child of mr_esrs_subtopics: retiring a sub-topic must be an
  -- explicit act, not a silent consequence of a cascade.
  constraint mr_esrs_subtopic_display_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- The pair must be a real sub-topic in the SAME standard version. MATCH SIMPLE (the default), so
  -- a NULL shared_with_subtopic_code satisfies the constraint without a lookup — which is the
  -- wanted behaviour for the 25 unpaired rows.
  constraint mr_esrs_subtopic_display_shared_fkey
    foreign key (shared_with_subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  constraint mr_esrs_subtopic_display_shared_not_self
    check (shared_with_subtopic_code is null or shared_with_subtopic_code <> subtopic_code)
);

comment on table public.mr_esrs_subtopic_display is
  'ThemisIQ HOUSE COPY for presenting an ESRS sub-topic to a human: a short name, the S1/S2 question framing, and the S1.x<->S2.x pairing. NOT transcribed law — nothing here may be cited as the instrument''s wording, and the verbatim label in mr_esrs_subtopics always travels to the report alongside it. Exists because the annex label is unusable as question wording (S1.5 is 213 characters) and cannot be shortened in place, since 20260815_mr_esrs_subtopics.sql is the transcription of record and a replay would revert any edit.';

comment on column public.mr_esrs_subtopic_display.short_name is
  'ThemisIQ-authored display name, <= 60 characters. The length CHECK is the point of the table, not house style: without it the first person to paste the annex text back in undoes the reason for the file with no error.';

comment on column public.mr_esrs_subtopic_display.question_framing is
  'Whose instance of this sub-topic the question asks about. NULL on the 25 rows needing no framing; set on the twelve S1/S2 rows, where two byte-identical short names are otherwise indistinguishable. Spec v8 §3.0.1: ask once per respondent, AUTHOR TWICE.';

comment on column public.mr_esrs_subtopic_display.shared_with_subtopic_code is
  'The S1.x<->S2.x pairing, stated as DATA. Appendix A shares one sub-topic set between S1 and S2, but this database holds twelve independent rows (spec §11.2) with no relation between them, so the pairing must be authored. It must NEVER be derived at runtime by string manipulation — 20260815_mr_esrs_subtopics.sql''s verify block does exactly that, which is correct for a one-off check and a defect as a routing rule.';

comment on column public.mr_esrs_subtopic_display.updated_at is
  'Written by the BEFORE UPDATE trigger; the app must NEVER set it. Present here and deliberately ABSENT from mr_esrs_subtopics: this table is house copy corrected in place, that one is a transcription that gets a new standard_version row instead of an edit.';

-- Reuses public.sbti_set_updated_at(), the generic helper created in 20260625_sbti_core_tables.sql
-- and already shared across modules (see 20260815_mr_esrs_subtopics.sql for the full argument
-- against copying it under a better name). Attached here, not redefined. If that function is ever
-- renamed, ALL triggers referencing it move in the SAME pass.
drop trigger if exists mr_esrs_subtopic_display_set_updated_at
  on public.mr_esrs_subtopic_display;
create trigger mr_esrs_subtopic_display_set_updated_at
  before update on public.mr_esrs_subtopic_display
  for each row execute function public.sbti_set_updated_at();

-- =====================================================================
-- mr_stakeholder_categories
-- =====================================================================
create table if not exists public.mr_stakeholder_categories (
  code            text        not null,
  label           text        not null,
  track           text        not null check (track in ('internal', 'external')),

  -- Spec v8 §3.0.1. Governs the SIX LABOUR sub-topics ONLY. See the header.
  labour_routing  text        not null check (labour_routing in ('s1', 's2', 'not_asked')),

  -- The adopted Annex I glossary defines two groups and says some stakeholders belong to both.
  -- Two independent booleans, because one flag cannot express an overlap the instrument names.
  is_affected     boolean     not null,
  is_user         boolean     not null,

  -- ESRS 1 ¶42: civil society, NGOs and trade unions AS USERS can be proxies for affected
  -- stakeholders. A CAPABILITY OF THE CATEGORY, never a claim about a particular response — see
  -- the header. Defaults false so a category added later has to opt in rather than inherit a
  -- capability nobody asserted for it.
  can_proxy_for_affected boolean not null default false,

  sort_order      smallint    not null,
  created_at      timestamptz not null default now(),

  constraint mr_stakeholder_categories_pkey primary key (code),

  -- The FK target that makes "an internal respondent cannot carry an external category" a
  -- DATABASE FACT rather than a rule the invite route is trusted to remember. `code` is already
  -- unique as the PK; this second constraint exists solely so materiality_survey_respondents can
  -- point a composite foreign key at (code, track). One line, and it removes a whole class of
  -- silently-miscategorised respondent — which would then be silently misrouted between S1 and S2.
  constraint mr_stakeholder_categories_code_track_key unique (code, track),

  -- A category that is neither affected nor a user is not a stakeholder in the standard's terms,
  -- and would sit in the engagement disclosure under no heading at all.
  constraint mr_stakeholder_categories_at_least_one_group
    check (is_affected or is_user)
);

-- Added after the table was first drafted. CREATE TABLE IF NOT EXISTS is a no-op on an existing
-- table, so a database that received an earlier copy of this file would silently keep the two-column
-- model and every consumer would read a capability that is not there. NOT NULL with a DEFAULT is
-- safe on an existing table (false is the correct value for a row nobody has assessed), and the
-- seed below then sets the four that are true.
alter table public.mr_stakeholder_categories
  add column if not exists can_proxy_for_affected boolean not null default false;

comment on table public.mr_stakeholder_categories is
  'ESRS stakeholder categories, with the S1/S2 labour routing (spec v8 §3.0.1) and THREE independent relationship flags. is_affected and is_user are the adopted Annex I glossary''s two overlapping groups — the glossary states that some, but not all, stakeholders belong to both, so one flag could not express it: a supplier is a business partner (user) AND affected in its own right, which G1-6 discloses as late payment to SMEs. can_proxy_for_affected is ESRS 1 ¶42''s third relationship, a user standing in for affected stakeholders who could not be reached, and is a CAPABILITY OF THE CATEGORY rather than a claim about any response. AR 23 gives TYPICAL categories, not a closed set, so absence from it excludes nothing.';

comment on column public.mr_stakeholder_categories.labour_routing is
  'Which determination this category''s answers feed FOR THE SIX LABOUR SUB-TOPICS ONLY (S1.1-6 / S2.1-6). Every other sub-topic is asked of every respondent. ''not_asked'' is a routing outcome, NOT an abstention — a respondent who was never shown the question is not evidence that nobody could answer it. Changing a value here must be a NEW code, never an UPDATE: responses record the category that resolved them, and an in-place edit would make the audit trail claim a rule that was not applied.';

comment on column public.mr_stakeholder_categories.is_affected is
  'Individuals or groups whose interests are affected or could be affected by the undertaking''s activities and its business relationships across the value chain (adopted Annex I glossary; ESRS 1 ¶42). Independent of is_user — both may be true.';

comment on column public.mr_stakeholder_categories.is_user is
  'Users of sustainability information: investors, lenders and creditors, business partners, social partners including trade unions and employer organisations, civil society and NGOs (adopted Annex I glossary). Independent of is_affected — both may be true, and independent of can_proxy_for_affected.';

comment on column public.mr_stakeholder_categories.can_proxy_for_affected is
  'Whether this category CAN act as a proxy for affected stakeholders who cannot be reached directly — ESRS 1 ¶42 names civil society, NGOs and trade unions as users who can. A CAPABILITY OF THE CATEGORY, NOT A CLAIM ABOUT ANY RESPONSE: whether a given respondent actually spoke for someone else is not knowable from their category, is not asked in the screening survey, and is recorded nowhere. §7 may therefore say "categories engaged that can act as proxies for affected stakeholders" and may NOT say "these responses were given on behalf of affected stakeholders" — the second is an evidentiary claim about who was heard, and nothing here supports it. Adds a capability, never replaces a fact: both workers''-representative rows remain is_affected = true, because a representative is a worker whose own interests are affected whether or not they also speak for colleagues.';

-- =====================================================================
-- Grants — explicit, because both tables are created after the 7 Aug cleanup
-- =====================================================================
revoke all on public.mr_esrs_subtopic_display  from anon;
revoke all on public.mr_esrs_subtopic_display  from authenticated;
revoke all on public.mr_esrs_subtopic_display  from service_role;
revoke all on public.mr_stakeholder_categories from anon;
revoke all on public.mr_stakeholder_categories from authenticated;
revoke all on public.mr_stakeholder_categories from service_role;

grant select on public.mr_esrs_subtopic_display  to anon, authenticated, service_role;
grant select on public.mr_stakeholder_categories to anon, authenticated, service_role;

-- =====================================================================
-- RLS — matching the existing mr_* tables
-- =====================================================================
alter table public.mr_esrs_subtopic_display  enable row level security;
alter table public.mr_stakeholder_categories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_esrs_subtopic_display'
      and policyname = 'mr_esrs_subtopic_display_read'
  ) then
    create policy mr_esrs_subtopic_display_read on public.mr_esrs_subtopic_display
      for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_stakeholder_categories'
      and policyname = 'mr_stakeholder_categories_read'
  ) then
    create policy mr_stakeholder_categories_read on public.mr_stakeholder_categories
      for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- Seed — mr_esrs_subtopic_display, standard_version = 'esrs_2026'. 37 rows.
-- =====================================================================
-- ⚠️ EVERY STRING BELOW IS THEMISIQ'S, NOT THE ANNEX'S. They are written to be answerable by a
-- non-specialist, which is the whole job; several deliberately depart from the annex wording
-- ('Energy' -> 'Energy use and sourcing', 'Resource outflows (waste)' -> 'Waste'). That is
-- permitted here and forbidden in mr_esrs_subtopics, and the two tables must never be conflated.
--
-- THE TWELVE S1/S2 ROWS CARRY IDENTICAL short_name VALUES ON PURPOSE. They are the same sub-topic
-- asked of two populations; question_framing is what distinguishes them, and shared_with_subtopic_code
-- is what pairs them. Do not "fix" the duplication.
--
-- ON CONFLICT DO UPDATE, so this file stays the record and a replay reconciles the table back to
-- it. The corollary, stated plainly: a row hand-edited in the SQL editor is silently reverted by
-- the next run. Fix copy by editing this file and re-running it, never by editing the row.
insert into public.mr_esrs_subtopic_display
  (subtopic_code, standard_version, short_name, question_framing, shared_with_subtopic_code) values
  ('E1.1', 'esrs_2026', 'Climate change mitigation',                        null, null),
  ('E1.2', 'esrs_2026', 'Climate change adaptation',                        null, null),
  ('E1.3', 'esrs_2026', 'Energy use and sourcing',                          null, null),
  ('E2.1', 'esrs_2026', 'Air pollution',                                    null, null),
  ('E2.2', 'esrs_2026', 'Water pollution',                                  null, null),
  ('E2.3', 'esrs_2026', 'Soil pollution',                                   null, null),
  ('E2.4', 'esrs_2026', 'Substances of concern',                            null, null),
  ('E2.5', 'esrs_2026', 'Microplastics',                                    null, null),
  ('E3.1', 'esrs_2026', 'Water use',                                        null, null),
  ('E4.1', 'esrs_2026', 'Drivers of biodiversity loss',                     null, null),
  ('E4.2', 'esrs_2026', 'State of species',                                 null, null),
  ('E4.3', 'esrs_2026', 'Extent and condition of ecosystems',               null, null),
  ('E4.4', 'esrs_2026', 'Ecosystem services',                               null, null),
  ('E5.1', 'esrs_2026', 'Resource inflows (materials used)',                null, null),
  ('E5.2', 'esrs_2026', 'Resource outflows (products and services)',        null, null),
  ('E5.3', 'esrs_2026', 'Waste',                                            null, null),

  -- S1 — own workforce. Same six short names as S2 below; the framing is the difference.
  ('S1.1', 'esrs_2026', 'Working conditions and social protection', 'in your own workforce', 'S2.1'),
  ('S1.2', 'esrs_2026', 'Social dialogue and collective bargaining', 'in your own workforce', 'S2.2'),
  ('S1.3', 'esrs_2026', 'Health and safety',                         'in your own workforce', 'S2.3'),
  ('S1.4', 'esrs_2026', 'Training and skills development',           'in your own workforce', 'S2.4'),
  ('S1.5', 'esrs_2026', 'Diversity and equal treatment',             'in your own workforce', 'S2.5'),
  ('S1.6', 'esrs_2026', 'Other labour rights',                       'in your own workforce', 'S2.6'),

  -- S2 — workers in the value chain. Pairing is symmetric with S1 above.
  ('S2.1', 'esrs_2026', 'Working conditions and social protection', 'for workers in your suppliers'' and value-chain operations', 'S1.1'),
  ('S2.2', 'esrs_2026', 'Social dialogue and collective bargaining', 'for workers in your suppliers'' and value-chain operations', 'S1.2'),
  ('S2.3', 'esrs_2026', 'Health and safety',                         'for workers in your suppliers'' and value-chain operations', 'S1.3'),
  ('S2.4', 'esrs_2026', 'Training and skills development',           'for workers in your suppliers'' and value-chain operations', 'S1.4'),
  ('S2.5', 'esrs_2026', 'Diversity and equal treatment',             'for workers in your suppliers'' and value-chain operations', 'S1.5'),
  ('S2.6', 'esrs_2026', 'Other labour rights',                       'for workers in your suppliers'' and value-chain operations', 'S1.6'),

  ('S3.1', 'esrs_2026', 'Communities'' economic, social and cultural rights', null, null),
  ('S3.2', 'esrs_2026', 'Communities'' civil and political rights',          null, null),
  ('S3.3', 'esrs_2026', 'Rights of indigenous peoples',                      null, null),
  ('S4.1', 'esrs_2026', 'Privacy and access to information',                 null, null),
  ('S4.2', 'esrs_2026', 'Consumer safety',                                   null, null),
  ('S4.3', 'esrs_2026', 'Consumer inclusion and responsible marketing',      null, null),
  ('G1.1', 'esrs_2026', 'Corporate culture and anti-corruption',             null, null),
  ('G1.2', 'esrs_2026', 'Political influence and lobbying',                  null, null),
  ('G1.3', 'esrs_2026', 'Supplier relationships and payment practices',      null, null)
on conflict (subtopic_code, standard_version) do update
  set short_name                = excluded.short_name,
      question_framing          = excluded.question_framing,
      shared_with_subtopic_code = excluded.shared_with_subtopic_code;

-- =====================================================================
-- Seed — mr_stakeholder_categories. 11 rows.
-- =====================================================================
-- Spec v8 §3.0.1 (routing) and §4 (the two groups). Each is_affected / is_user pair below is a
-- judgement against the adopted glossary and AR 23, and the non-obvious ones are annotated
-- inline — an unexplained boolean in a compliance table is a boolean nobody can defend later.
insert into public.mr_stakeholder_categories
  (code, label, track, labour_routing, is_affected, is_user, can_proxy_for_affected, sort_order) values

  -- Internal. Own staff answer for S1 — they are the only people who can see your own workplace.
  ('own_workforce', 'Own workforce (employee or non-employee worker)', 'internal', 's1', true, false, false, 1),
  -- Workers' representatives: AFFECTED as workers in the own workforce (AR 23 names them), USERS as
  -- social partners / trade unions (glossary names them), and PROXY-CAPABLE per ¶42, which names
  -- trade unions among the users who can be proxies. All three are independent facts and the proxy
  -- flag does not demote them out of the affected group — a representative is a worker.
  -- AR 25 makes reaching them a legal obligation under the Accounting Directive, and §4 requires
  -- their responses shown separately from general staff — which the distinct code enables, not the
  -- booleans.
  ('workers_rep_own', 'Workers'' representatives — own workforce', 'internal', 's1', true, true, true, 2),

  -- External, S2-eligible. These three are the ONLY categories that can answer for workers in the
  -- value chain, and §6.3's unknown-S2 condition is keyed on their absence — NOT on "no external
  -- respondents". A survey with forty customers and none of these still yields unknown S2.
  ('value_chain_worker', 'Worker in the value chain', 'external', 's2', true, false, false, 3),
  ('workers_rep_value_chain', 'Workers'' representatives — value chain', 'external', 's2', true, true, true, 4),
  -- Supplier — all three, and the row that proved one flag was insufficient. USER: "business
  -- partners" is named in the glossary's users definition. AFFECTED: their interests are affected by
  -- your activities, and ESRS discloses exactly that — G1-6 'Metrics related to payment practices'
  -- covers late payment to SMEs, which sub-topic G1.3 names. PROXY-CAPABLE: answering the S2 labour
  -- questions a supplier reports on ITS OWN WORKERS, who are the affected parties AR 23 names as
  -- workers in the value chain and whom this survey has no other route to. That last one is an
  -- INFERENCE from ¶42's logic, not a citation — ¶42 names civil society, NGOs and trade unions.
  -- Not among AR 23's typical affected examples either, which excludes nothing: AR 23 is a list of
  -- examples, not a closed set.
  ('supplier', 'Supplier', 'external', 's2', true, true, true, 5),

  -- External, NOT asked the six labour sub-topics. None of these can observe health and safety in
  -- your suppliers' operations, and asking them would manufacture abstentions that read as your
  -- own blind spot (§3.0.1).
  ('affected_community', 'Affected community', 'external', 'not_asked', true,  false, false, 6),
  ('consumer_end_user',  'Consumer or end-user', 'external', 'not_asked', true,  false, false, 7),
  ('customer',           'Customer (business)',  'external', 'not_asked', false, true,  false, 8),
  ('investor_lender',    'Investor, lender or creditor', 'external', 'not_asked', false, true, false, 9),
  -- Regulator is NOT named in the glossary's users list. Seeded is_user = true per §4, which
  -- classes regulators among the users rather than the affected parties. A judgement, recorded.
  -- NOT proxy-capable: ¶42's list is civil society, NGOs and trade unions, and a public authority
  -- exercising oversight is not standing in for an affected party the undertaking failed to reach.
  ('regulator',          'Regulator or public authority', 'external', 'not_asked', false, true, false, 10),
  -- Civil society and NGOs are named in the users definition AND named explicitly in ¶42 as users
  -- who can be proxies for affected stakeholders. The clearest case for the third boolean, and the
  -- only one of the four that needs no inference at all.
  ('civil_society',      'Civil society or NGO', 'external', 'not_asked', false, true, true, 11)

on conflict (code) do update
  set label                  = excluded.label,
      track                  = excluded.track,
      labour_routing         = excluded.labour_routing,
      is_affected            = excluded.is_affected,
      is_user                = excluded.is_user,
      can_proxy_for_affected = excluded.can_proxy_for_affected,
      sort_order             = excluded.sort_order;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) 37 display rows, esrs_2026 only, and every sub-topic covered — the question generator in
--    file 2 RAISEs if even one is missing, so this is the check that prevents that failure:
--    select count(*) from public.mr_esrs_subtopic_display where standard_version = 'esrs_2026';
--    -- expect 37
--    select s.code from public.mr_esrs_subtopics s
--    left join public.mr_esrs_subtopic_display d
--      on d.subtopic_code = s.code and d.standard_version = s.standard_version
--    where s.standard_version = 'esrs_2026' and d.subtopic_code is null;
--    -- expect ZERO rows
--
-- 2) The short names are actually short — the reason the table exists:
--    select max(length(short_name)) from public.mr_esrs_subtopic_display;   -- expect <= 60
--    -- and confirm the constraint bites:
--    begin;
--      update public.mr_esrs_subtopic_display
--         set short_name = (select label from public.mr_esrs_subtopics
--                            where code = 'S1.5' and standard_version = 'esrs_2026')
--       where subtopic_code = 'S1.5' and standard_version = 'esrs_2026';
--      -- expect ERROR: violates check constraint "mr_esrs_subtopic_display_short_name_check"
--    rollback;
--
-- 3) The S1/S2 pairing is symmetric — 12 rows, each pointing at the other:
--    select a.subtopic_code, a.shared_with_subtopic_code, b.shared_with_subtopic_code as back
--    from public.mr_esrs_subtopic_display a
--    join public.mr_esrs_subtopic_display b
--      on b.subtopic_code = a.shared_with_subtopic_code
--     and b.standard_version = a.standard_version
--    where a.standard_version = 'esrs_2026'
--    order by a.subtopic_code;
--    -- expect 12 rows, and `back` = a.subtopic_code on every one
--    select count(*) from public.mr_esrs_subtopic_display
--    where standard_version = 'esrs_2026' and shared_with_subtopic_code is not null;  -- expect 12
--
-- 4) The twelve labour rows share six short names and differ only in framing:
--    select short_name, count(*), count(distinct question_framing)
--    from public.mr_esrs_subtopic_display
--    where standard_version = 'esrs_2026' and shared_with_subtopic_code is not null
--    group by short_name;
--    -- expect 6 rows, each 2 | 2
--
-- 5) The two groups overlap — the whole reason there are two booleans. If this returns zero rows,
--    the seed has collapsed back into a single flag:
--    select code, label from public.mr_stakeholder_categories where is_affected and is_user;
--    -- expect supplier, workers_rep_own, workers_rep_value_chain
--    select count(*) from public.mr_stakeholder_categories;                     -- expect 11
--
-- 5a) The third flag exists and is populated. Run the first query on ANY database that may have
--     received an earlier two-column copy of this file — CREATE TABLE IF NOT EXISTS would have
--     been a no-op there, and the ALTER is what repairs it:
--    select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'mr_stakeholder_categories'
--      and column_name = 'can_proxy_for_affected';                              -- expect 1 row
--
--    select code, is_affected, is_user, can_proxy_for_affected
--    from public.mr_stakeholder_categories where can_proxy_for_affected order by code;
--    -- expect exactly: civil_society, supplier, workers_rep_own, workers_rep_value_chain
--
--    -- ⚠️ THE FLAG ADDS A CAPABILITY AND MUST NEVER HAVE REPLACED A FACT. Both representative
--    -- rows must still be is_affected — a representative is a worker, and their own interests are
--    -- affected whether or not they also speak for colleagues:
--    select count(*) from public.mr_stakeholder_categories
--    where code in ('workers_rep_own', 'workers_rep_value_chain')
--      and is_affected and is_user and can_proxy_for_affected;                  -- expect 2
--
--    -- ¶42 frames proxying as something a USER does. A proxy-capable row that is not a user would
--    -- be outside the paragraph this column cites:
--    select code from public.mr_stakeholder_categories
--    where can_proxy_for_affected and not is_user;                              -- expect ZERO rows
--
--    -- And it is genuinely a THIRD fact, not a restatement of the other two. If this returns zero,
--    -- the column is derivable from is_affected AND is_user and is carrying no information:
--    select code from public.mr_stakeholder_categories
--    where (is_affected and is_user) <> can_proxy_for_affected;
--    -- expect civil_society (a proxy-capable user that is NOT itself affected)
--
-- 6) Exactly three categories can answer for S2 — §6.3's unknown-S2 condition depends on this set:
--    select code from public.mr_stakeholder_categories where labour_routing = 's2' order by code;
--    -- expect supplier, value_chain_worker, workers_rep_value_chain
--    select track, labour_routing, count(*) from public.mr_stakeholder_categories
--    group by 1,2 order by 1,2;
--
-- 7) The (code, track) unique constraint exists — file 2's respondent FK needs it as a target:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.mr_stakeholder_categories'::regclass and contype = 'u';
--    -- expect mr_stakeholder_categories_code_track_key UNIQUE (code, track)
--
-- 8) updated_at is written by the database, not the caller. pg_sleep is what makes this meaningful:
--    inside one transaction now() is fixed, so without it both timestamps compare equal whether the
--    trigger fired or not, and the probe would pass on a table with no trigger at all.
--    begin;
--      select pg_sleep(1);
--      update public.mr_esrs_subtopic_display
--         set short_name = 'Water use ', updated_at = '1999-01-01'   -- deliberately wrong
--       where subtopic_code = 'E3.1' and standard_version = 'esrs_2026';
--      select created_at, updated_at, updated_at > created_at as moved,
--             updated_at > '2020-01-01'::timestamptz as caller_value_ignored
--        from public.mr_esrs_subtopic_display
--       where subtopic_code = 'E3.1' and standard_version = 'esrs_2026';
--      -- expect moved = t and caller_value_ignored = t (NOT 1999 — that is the proof)
--    rollback;
--
-- 9) Grants are read-only for every role, and RLS names its roles explicitly:
--    select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('mr_esrs_subtopic_display', 'mr_stakeholder_categories')
--    group by table_name, grantee order by table_name, grantee;
--    -- expect SELECT and nothing else, for anon / authenticated / service_role
--    select tablename, policyname, roles, cmd from pg_policies
--    where schemaname = 'public'
--      and tablename in ('mr_esrs_subtopic_display', 'mr_stakeholder_categories');
--    -- expect {anon,authenticated} / SELECT on each
--
-- 10) The FK restricts rather than cascades:
--    begin;
--      delete from public.mr_esrs_subtopics where code = 'E3.1' and standard_version = 'esrs_2026';
--      -- expect ERROR: violates foreign key constraint "mr_esrs_subtopic_display_subtopic_fkey"
--    rollback;
--
-- 11) A category must belong to at least one group:
--    begin;
--      insert into public.mr_stakeholder_categories
--        (code, label, track, labour_routing, is_affected, is_user, sort_order)
--      values ('nobody', 'Neither', 'external', 'not_asked', false, false, 99);
--      -- expect ERROR: violates check constraint "mr_stakeholder_categories_at_least_one_group"
--    rollback;
