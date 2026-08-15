-- 20260815_mr_esrs_topic_labels.sql
--
-- Versions the ESRS topic LABELS without versioning the topic ROWS. mr_esrs_topics keeps its
-- ten rows and its single-column PRIMARY KEY (code); this table carries the display name for
-- each (topic, standard_version) pair.
--
-- Schema + seed only. No route reads this table yet — that is Part 3.
--
--
-- WHY LABELS ARE VERSIONED BUT CODES ARE NOT
-- The ten topical-standard CODES are stable across both standards. ESRS (2026) merges S1 and S2
-- into a single row in the Appendix A topic LIST, but S1 and S2 remain SEPARATE TOPICAL STANDARDS
-- with separate disclosure requirements — docs/materiality-questionnaire-spec-v5.md §11.2 states
-- it directly: "Keep ten topic codes. The DR mapping needs S1 and S2 apart."
--
-- Only the names move:
--     E3   'Water and marine resources'        -> 'Water'
--     E5   'Resource use and circular economy' -> 'Circular Economy and Resource Use'
--     S1   ) both take Appendix A's JOINT title
--     S2   ) 'Own Workforce and Workers in the Value Chain'
--
-- Versioning the whole row to track a change confined to one column would force every consumer
-- to filter for a distinction that matters to exactly one field — and a consumer that FORGOT to
-- filter would not error, it would silently double the matrix (computeMatrix maps over every row
-- in ref.esrsTopics, and baselines.find() matches on topic_code alone, so both copies would
-- resolve the same baseline and emit identical scores under identical codes). This table has no
-- such failure mode: a missing lookup falls back to a label, never to a duplicated topic.
--
-- It also keeps mr_esrs_subtopics.topic_code -> mr_esrs_topics(code) a SINGLE-COLUMN foreign key.
-- That migration (20260815_mr_esrs_subtopics.sql) is already applied live; making mr_esrs_topics
-- composite-keyed now would mean dropping and re-adding that constraint.
--
--
-- ⚠️ esrs_2023 AND esrs_2023_reliefs ARE DELIBERATELY UNSEEDED, PENDING TRANSCRIPTION.
-- The CHECK admits all three values; only esrs_2026 has rows.
--
-- The 2023 labels must come from the instrument — Commission Delegated Regulation (EU) 2023/2772,
-- Annex I, ESRS 1, AR 16 — and that text was not reachable at the fidelity this table requires
-- (three retrieval attempts against EUR-Lex on 15 Aug 2026; see the report accompanying this file).
-- They were NOT derived from mr_esrs_topics.label, from ESRS_DR_MAP.name, or from the wizard's
-- ESRS_TOPICS constant. All three are hand-written copies of unknown provenance, and they
-- DISAGREE with each other on E3, E4, E5 and S4 ('&' versus 'and'), which proves at least one is
-- not the instrument's wording. A row seeded from a copy and labelled as transcribed is worse
-- than no row: it launders an unverified string into something a report cites as legal text.
--
-- ⚠️ ONE CONCRETE THING TO CHECK WHEN SOMEONE DOES TRANSCRIBE THE 2023 ROWS. A single retrieval
-- that did return an AR 16 table gave E5's topic-level name as 'Circular economy' — NOT
-- 'Resource use and circular economy', which is what all three in-repo copies say and what the
-- ESRS E5 standard is titled. One extraction disagreeing with three copies on exactly one topic
-- is more likely an extraction artefact than a discovery, and it is recorded here as a question,
-- not a finding. Resolve it against the 2023 PDF before seeding E5.
-- This warning is about esrs_2023 ONLY. E5's 2026 name is confirmed against the adopted annex as
-- 'Circular Economy and Resource Use' and is not in doubt.
--
-- UNTIL THEY ARE SEEDED, THOSE TWO VERSIONS ARE SERVED BY Part 3's FALLBACK TO
-- mr_esrs_topics.label. That fallback is the PRE-VERSIONING DEFAULT and must be described as
-- such wherever it appears — it is what the module has always displayed, not a transcription and
-- not a claim about what the 2023 instrument says. The same fallback covers assessments with no
-- standard_version recorded at all.
--
--
-- SOURCE OF THE esrs_2026 LABELS
--   Commission Delegated Regulation C(2026) 5010 final, Annexes 1 to 2,
--   Annex I, ESRS 1 Appendix A — List of topics.
--   Adopted 3 July 2026, amending Delegated Regulation (EU) 2023/2772. Applies to financial
--   years beginning on or after 1 January 2027, early adoption permitted for FY2026.
--   Transcribed 15 August 2026 from the adopted text via
--   docs/materiality-questionnaire-spec-v5.md §11 — which records that it was taken from the
--   adopted annex, not from EFRAG's advice and not from a summary. Same source as the 37
--   sub-topic rows in 20260815_mr_esrs_subtopics.sql, so the two layers cannot disagree.
--
--   Appendix A is NON-BINDING GUIDANCE and is not a substitute for the materiality process.
--   That does not weaken these labels: a name is a name whether the list is binding or not.
--   The caveat governs what a ROW MEANS (a candidate to assess, never a determination), which is
--   the sub-topic table's concern, not this one's.
--
-- CASING IS TITLE CASE, AND THAT IS VERIFIED — NOT INHERITED FROM THE SPEC'S FORMATTING.
-- The esrs_2026 names below are Title Case ('Climate Change', 'Business Conduct'); the 2023
-- labels currently in mr_esrs_topics are sentence case ('Climate change', 'Business conduct').
-- Checked directly against the adopted annex text on 15 Aug 2026: ESRS 1 Appendix A renders the
-- topic column in Title Case — 'Climate Change (ESRS E1)', 'Biodiversity and Ecosystems',
-- 'Circular Economy and Resource Use', 'Own Workforce and Workers in the Value Chain
-- (ESRS S1/S2)', 'Affected Communities', 'Consumers and End-users', 'Business Conduct', with
-- 'Water' and 'Pollution' standing alone. The parenthetical '(ESRS E1)' / '(ESRS S1/S2)' code
-- suffixes are the annex's column formatting, not part of the name, and are not stored — the
-- code travels in topic_code and is rendered separately by every consumer.
-- The practical consequence, so it is not a surprise: under esrs_2026 a report prints
-- 'Climate Change' where it prints 'Climate change' today. That is a visible change on ALL TEN
-- topics, not only the three renames.
--
--
-- S1 AND S2 BOTH GET THE JOINT TITLE — TWO ROWS, ONE STRING.
-- Appendix A gives them a single merged row. This table is keyed by topic_code and there are
-- still ten codes, so the joint title is stored twice. That is intentional: a report that prints
-- S1 and S2 as separate rows of the matrix will print the same name against both, which is what
-- the 2026 topic list says. It mirrors the same decision one level down, where the six shared
-- labour sub-topics are duplicated under S1 and S2 with distinct codes.
--
--
-- GRANTS AND RLS ARE COPIED FROM 20260815_mr_esrs_subtopics.sql, deliberately and exactly:
-- revoke all from the three roles first (this file replays after the 7 Aug cleanup, so the table
-- is born with Supabase's default anon grants and nothing later strips them), then grant SELECT
-- only, then RLS with a <table>_read policy that names `to anon, authenticated` explicitly —
-- never a bare `to public`, which is the root cause 20260807_supplier_portal_policy_cleanup.sql
-- was written to fix. service_role gets plain SELECT rather than the mr_* parents'
-- REFERENCES/TRIGGER/TRUNCATE-without-SELECT, for the reason given in that file's deviation (4).
--
-- NO TIMESTAMP BEYOND created_at, AND NO updated_at. Same reasoning as mr_esrs_subtopics: a
-- transcription of a legal instrument is not corrected in place, it gets a new standard_version
-- row. An updated_at would imply an edit history the design does not permit.
--
-- NO provenance/source_ref/source_date. 20260715_mr_provenance_columns.sql draws the line at
-- tables carrying "model VALUES (coefficients, multipliers, thresholds)" and excludes
-- "Dimension/label tables ... they hold no calibratable value". This table is nothing but labels.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT
-- EXISTS, guarded CREATE POLICY, idempotent grants, and the seed upserts (see the note above it).
-- No code change ships with it and nothing reads it yet, so it is safe to apply independently.

begin;

-- =====================================================================
-- mr_esrs_topic_labels
-- =====================================================================
create table if not exists public.mr_esrs_topic_labels (
  topic_code       text        not null,
  standard_version text        not null
    check (standard_version in ('esrs_2023', 'esrs_2023_reliefs', 'esrs_2026')),
  label            text        not null,
  created_at       timestamptz not null default now(),

  constraint mr_esrs_topic_labels_pkey primary key (topic_code, standard_version),

  -- RESTRICT, matching mr_esrs_subtopics: deleting an ESRS topic should require saying so, not
  -- silently take its names with it.
  constraint mr_esrs_topic_labels_topic_code_fkey
    foreign key (topic_code) references public.mr_esrs_topics (code) on delete restrict
);
-- No secondary index. Part 3 filters on standard_version, which is the PK's SECOND column and so
-- cannot use its prefix — but at 10 rows now and 30 fully seeded, a sequential scan is cheaper
-- than an index lookup. Revisit only if this table ever grows past a few hundred rows.

comment on table public.mr_esrs_topic_labels is
  'Per-standard-version display names for the ten ESRS topical standards. mr_esrs_topics keeps ten rows and a single-column PK; only the names are versioned, because the codes are stable across both standards (spec §11.2). Seeded for esrs_2026 only — esrs_2023 and esrs_2023_reliefs await transcription from Del. Reg. (EU) 2023/2772, ESRS 1 AR 16, and are served meanwhile by the pre-versioning fallback to mr_esrs_topics.label.';

comment on column public.mr_esrs_topic_labels.label is
  'Topic name as printed by the named standard version. esrs_2026 rows are transcribed from Commission Delegated Regulation C(2026) 5010 final, Annex I, ESRS 1 Appendix A. S1 and S2 both carry Appendix A''s joint title.';

comment on column public.mr_esrs_topic_labels.standard_version is
  'Which ESRS version this name belongs to. Three values coexist per Art. 2(1) of the 2026 delegated act; Art. 2(2) requires the undertaking to state which it applied for FY2026.';

-- =====================================================================
-- Grants — explicit, because this file replays after the 7 Aug cleanup
-- =====================================================================
revoke all on public.mr_esrs_topic_labels from anon;
revoke all on public.mr_esrs_topic_labels from authenticated;
revoke all on public.mr_esrs_topic_labels from service_role;

grant select on public.mr_esrs_topic_labels to anon, authenticated, service_role;

-- =====================================================================
-- RLS — matching the existing mr_* tables
-- =====================================================================
alter table public.mr_esrs_topic_labels enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_esrs_topic_labels'
      and policyname = 'mr_esrs_topic_labels_read'
  ) then
    create policy mr_esrs_topic_labels_read on public.mr_esrs_topic_labels
      for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- Seed — standard_version = 'esrs_2026' ONLY. 10 rows.
-- =====================================================================
-- Verbatim from ESRS 1 Appendix A via spec §11. Do not adjust the casing (see the ⚠️ above) and
-- do not "fix" S1 and S2 to differ — the joint title against both codes is the point.
--
-- ON CONFLICT DO UPDATE, not DO NOTHING: this file is the transcription of record, so a re-run
-- RECONCILES the table back to it. The corollary, stated plainly: a label hand-edited in the SQL
-- editor will be silently reverted by the next replay. Fix a transcription error by editing this
-- file and re-running it, never by editing the row.
insert into public.mr_esrs_topic_labels (topic_code, standard_version, label) values
  ('E1', 'esrs_2026', 'Climate Change'),
  ('E2', 'esrs_2026', 'Pollution'),
  ('E3', 'esrs_2026', 'Water'),
  ('E4', 'esrs_2026', 'Biodiversity and Ecosystems'),
  ('E5', 'esrs_2026', 'Circular Economy and Resource Use'),
  -- S1 and S2 share Appendix A's merged topic row. Same string, two codes, on purpose.
  ('S1', 'esrs_2026', 'Own Workforce and Workers in the Value Chain'),
  ('S2', 'esrs_2026', 'Own Workforce and Workers in the Value Chain'),
  ('S3', 'esrs_2026', 'Affected Communities'),
  ('S4', 'esrs_2026', 'Consumers and End-users'),
  ('G1', 'esrs_2026', 'Business Conduct')
on conflict (topic_code, standard_version) do update
  set label = excluded.label;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) Ten rows, esrs_2026 only — and NOTHING seeded for the two 2023 versions:
--    select standard_version, count(*) from public.mr_esrs_topic_labels
--    group by standard_version;                        -- expect exactly: esrs_2026 | 10
--
-- 2) All ten topic codes covered, none orphaned:
--    select t.code, l.label
--    from public.mr_esrs_topics t
--    left join public.mr_esrs_topic_labels l
--      on l.topic_code = t.code and l.standard_version = 'esrs_2026'
--    order by t.sort_order;                            -- expect 10 rows, no null label
--
-- 3) The three renames actually differ from what mr_esrs_topics holds — this is the whole point
--    of the table, so prove it rather than assume it:
--    select t.code, t.label as label_2023_current, l.label as label_2026
--    from public.mr_esrs_topics t
--    join public.mr_esrs_topic_labels l
--      on l.topic_code = t.code and l.standard_version = 'esrs_2026'
--    where t.label <> l.label
--    order by t.sort_order;
--    -- expect E3, E5, S1, S2 (and E1/E2/E4/S3/S4/G1 to differ only in casing, so they may or
--    -- may not appear depending on whether the 2026 Title Case survives review)
--
-- 4) S1 and S2 carry the identical joint title:
--    select count(distinct label) from public.mr_esrs_topic_labels
--    where topic_code in ('S1','S2') and standard_version = 'esrs_2026';   -- expect 1
--
-- 5) Grants are read-only for every role:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'mr_esrs_topic_labels'
--    group by grantee order by grantee;
--    -- expect SELECT and nothing else, for anon / authenticated / service_role
--
-- 6) RLS on, one read policy, roles named explicitly (never bare `public`):
--    select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname = 'mr_esrs_topic_labels';     -- expect t
--    select policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'mr_esrs_topic_labels';
--    -- expect mr_esrs_topic_labels_read | {anon,authenticated} | SELECT
--
-- 7) The FK restricts rather than cascades:
--    begin;
--      delete from public.mr_esrs_topics where code = 'E3';
--      -- expect ERROR: violates foreign key constraint (from mr_esrs_subtopics and/or
--      --               mr_esrs_topic_labels — either is a pass; both restrict)
--    rollback;
--
-- 8) The CHECK admits the two unseeded versions, so Part 3 can seed them later without DDL:
--    begin;
--      insert into public.mr_esrs_topic_labels (topic_code, standard_version, label)
--      values ('E1', 'esrs_2023', 'placeholder');       -- expect success
--      insert into public.mr_esrs_topic_labels (topic_code, standard_version, label)
--      values ('E1', 'esrs_2027', 'placeholder');       -- expect ERROR: violates check constraint
--    rollback;
