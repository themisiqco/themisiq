-- 20260819_materiality_survey_schema.sql
--
-- SCREENING SURVEY — FILE 2 of 2. RUN 20260818_mr_subtopic_display_and_stakeholder_categories.sql
-- FIRST; every table here depends on one or both of the reference tables it creates, and the
-- question generator below RAISEs rather than proceeding if the 37 short names are not seeded.
--
-- Four tables, in dependency order:
--   materiality_survey_rounds        a survey round: one standard version, one questionnaire version
--   materiality_survey_questions     the frozen question set — a row for ALL 37 sub-topics
--   materiality_survey_respondents   who was invited, their track and stakeholder category
--   materiality_survey_responses     one answer per person per question
--
-- SCHEMA ONLY. No RPCs, no aggregation, no write-back to materiality_assessments — each is its own
-- task. Nothing in the application reads or writes these tables yet, so this file can be applied to
-- live independently of any deploy. Design authority: docs/materiality-questionnaire-spec-v8.md.
--
--
-- =====================================================================
-- ⚠️ THE NAMING, BECAUSE IT WILL LOOK INCONSISTENT WITH THE FILE BEFORE IT
-- =====================================================================
-- These four carry the `materiality_` prefix, not `mr_`. That is deliberate and load-bearing.
-- `mr_*` means REFERENCE DATA in this repo — thirteen tables, all public-readable, all seeded by
-- migration, all carrying a <table>_read policy granting SELECT to anon. These four hold
-- PER-CUSTOMER data under owner-scoped RLS. Naming them mr_* would put customer rows behind a
-- prefix whose entire established meaning is "safe for anon to read", which is the kind of
-- inconsistency that survives review because it looks tidy. They follow materiality_assessments.
--
--
-- =====================================================================
-- ⚠️ THE GATE — WHY standard_version IS CHECK-CONSTRAINED TO A SINGLE VALUE
-- =====================================================================
-- Spec v8 §3.3, decided: the stakeholder survey ships esrs_2026-only.
--
-- mr_esrs_subtopics is seeded for esrs_2026 alone — zero rows for esrs_2023 and
-- esrs_2023_reliefs, deliberately, because the 2023 taxonomy is a different instrument three
-- levels deep (ESRS 1 AR 16) and must be transcribed, not inferred. A survey round built against a
-- version with no sub-topics would generate ZERO questions and present to a respondent as an EMPTY
-- FORM rather than as a refusal — an absence rendered as a result, which is the failure this
-- codebase has now paid for four times over.
--
-- So the constraint lives at the database, one layer below anything that could forget it. The UI's
-- job is to say WHY an ESRS (2023) customer has no survey; this table's job is to make sure that
-- if the UI ever fails to, the insert fails loudly instead of producing a blank questionnaire.
--
-- TO WIDEN IT, IN THIS ORDER, IN ONE PASS:
--   1. transcribe the 2023 sub-topic taxonomy into mr_esrs_subtopics (AR 16, three levels — a
--      second transcription against a different instrument, NOT a copy of the 2026 rows);
--   2. seed mr_esrs_subtopic_display for that version — all of it, short names and framings;
--   3. only then add the value to the CHECK below.
-- Widening the CHECK alone yields a round whose question generator RAISEs on step 2's absence.
-- That is the intended failure mode and it is the loud one. Do not "fix" it by relaxing the
-- generator.
--
--
-- =====================================================================
-- ⚠️ WHAT THIS SCHEMA MUST NOT FORECLOSE — THE FIVE COUNTERS (v8 §3.0.1)
-- =====================================================================
-- The aggregation is a later task, but it constrains this one. Per sub-topic it must produce:
--
--     n_asked      shown to this respondent            DERIVED, never counted
--     n_answered   a value on the 1-3 scale            counted from response rows
--     n_abstained  "not enough visibility"             counted from response rows
--     n_skipped    shown it, engaged with neither      n_asked - n_answered - n_abstained
--     n_not_asked  routing excluded them               DERIVED
--
-- n_asked CANNOT BE COUNTED FROM RESPONSE ROWS. A row's absence cannot distinguish "never shown"
-- from "shown and skipped", and partial submission is permitted, so both occur. It is computed:
-- respondent R was asked question Q iff Q.status = 'included' and, for the twelve labour rows only,
-- R's category routes to something other than 'not_asked'.
--
-- THIS SCHEMA'S OBLIGATION IS THAT BOTH INPUTS TO THAT DERIVATION STAY RECONSTRUCTABLE FOREVER:
--   * the QUESTION SET per (round, questionnaire_version) — guaranteed by copy-on-write versioning
--     and by never deleting a question row (the FK from responses is RESTRICT);
--   * the ROUTING — guaranteed by mr_stakeholder_categories being append-only, and by every
--     response storing the category that resolved it rather than pointing at a mutable row.
-- Break either and n_asked becomes unrecoverable for every historical round at once, silently.
--
-- And n_skipped must never be folded into n_abstained. "I saw this and didn't engage" says the
-- survey was too long; "I saw this and cannot say" says the company has a blind spot. §6.1 makes
-- the second a finding in its own right, and merging them corrupts it in the same direction as
-- counting not-asked would: both make the company look blinder than the evidence says.
--
--
-- =====================================================================
-- ⚠️ ANONYMITY IS A GRANT HERE, NOT A UI POLICY — AND ITS LIMIT IS STATED
-- =====================================================================
-- §4: the internal response record captures no name or email. materiality_survey_responses
-- therefore gets NO grant to authenticated and NO grant to anon — not SELECT, not anything. RLS is
-- enabled with no policy for either role, so a missing grant and a missing policy both deny. The
-- customer reaches responses only through the aggregation RPC (a later task), which will apply the
-- round's anonymity_floor.
--
-- The honest limit, said out loud rather than implied: this is anonymity FROM THE CUSTOMER'S
-- ACCOUNT. service_role retains full access and the SQL editor is a service-role session, so it is
-- not anonymity from ThemisIQ. No schema can make that untrue, and the product copy must not claim
-- otherwise. What it does guarantee is that no path the customer can reach returns an individual's
-- answer joined to their invite.
--
-- The respondent FK is retained (autosave and one-answer-per-person both need it) and the
-- respondent's attributes are DENORMALISED onto the response, so the aggregation never needs the
-- join at all.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE TABLE IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION, drop-then-create triggers, guarded CREATE POLICY, idempotent grants.

begin;

-- =====================================================================
-- materiality_survey_rounds
-- =====================================================================
create table if not exists public.materiality_survey_rounds (
  id                    uuid        not null default gen_random_uuid(),
  -- Ownership follows materiality_assessments: user_id = auth.uid(), with the default present so
  -- a row cannot be created ownerless and the route setting it explicitly is belt-and-braces.
  user_id               uuid        not null default auth.uid()
                                      references auth.users (id) on delete cascade,
  name                  text        not null,
  company_name          text,

  -- ⚠️ THE GATE. Single-valued ON PURPOSE — see the header for why, and for the three steps that
  -- must all happen before another value is added here.
  standard_version      text        not null
    check (standard_version in ('esrs_2026')),

  -- §3.3's SECOND version, independent of the first and moving for a different reason: this one
  -- tracks the CUSTOMER's wording, not the regulator's taxonomy.
  questionnaire_version int         not null default 1 check (questionnaire_version >= 1),
  -- NULL = the question set is still editable. Set when the FIRST response arrives. After that an
  -- edit is a copy-on-write bump to N+1 — a complete new row set under a new version — never an
  -- UPDATE of a frozen version's questions. The Bay State file is the evidence: its first two
  -- responses answer a long-form maturity scale and every response after answers Low/Medium/High,
  -- and the two are not comparable.
  frozen_at             timestamptz,

  status                text        not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  deadline              date,

  -- §9 open decision 4 proposed 3, and it is still open. Stored PER ROUND rather than as a
  -- constant so the floor is data the report can state, and so raising it later cannot silently
  -- restate what a historical round's aggregate showed.
  anonymity_floor       smallint    not null default 3 check (anonymity_floor >= 1),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint materiality_survey_rounds_pkey primary key (id),

  -- FK target for materiality_survey_questions (round_id, standard_version). Same device
  -- cbam_verifier_access uses against cbam_installations' UNIQUE(id, company_id): it makes "a
  -- question cannot claim a standard version its round does not have" structural rather than a
  -- rule the insert path is trusted to honour.
  constraint materiality_survey_rounds_id_version_key unique (id, standard_version)
);

comment on table public.materiality_survey_rounds is
  'One stakeholder screening survey round. Carries TWO independent versions (spec v8 §3.3): standard_version, fixed at creation by trigger and CHECK-constrained to esrs_2026 only — the GATE, because mr_esrs_subtopics has no 2023 rows and a round built against one would render as an empty form; and questionnaire_version, the customer''s own wording, which freezes on first response.';

comment on column public.materiality_survey_rounds.standard_version is
  'Which ESRS taxonomy the questions hang off. FIXED AT CREATION — enforced by the materiality_survey_rounds_guard trigger, because "can never change" is a constraint and not a convention: changing it would re-point every question at a different sub-topic set. CHECK-constrained to esrs_2026 alone; see the migration header for the three ordered steps required to widen it.';

comment on column public.materiality_survey_rounds.frozen_at is
  'When the first response arrived and the question set stopped being editable. NULL = still editable. An edit after this is a copy-on-write bump to questionnaire_version N+1, never an UPDATE of a frozen version''s question rows.';

comment on column public.materiality_survey_rounds.anonymity_floor is
  'Minimum n below which an aggregate cell is suppressed. Per round, not global, so raising it later cannot silently restate a historical round''s published figures. Spec v8 §9 decision 4 proposes 3 and remains open; this column does not prejudge it.';

-- ── The immutability guard ────────────────────────────────────────────────────
-- §3.3 says standard_version "is fixed at creation and can never change". A comment saying so is
-- not the same as a database that refuses. This is the refusal.
create or replace function public.materiality_survey_round_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.standard_version is distinct from old.standard_version then
    raise exception
      'materiality_survey_rounds.standard_version is fixed at creation (spec v8 §3.3): % -> %. '
      'Changing it would re-point every question in this round at a different sub-topic set. '
      'Create a new round instead.',
      old.standard_version, new.standard_version;
  end if;
  if new.questionnaire_version < old.questionnaire_version then
    raise exception
      'materiality_survey_rounds.questionnaire_version cannot go backwards: % -> %. '
      'Every response records the version it answered; moving the pointer back would make those '
      'records point at wording that is no longer the current wording for that number.',
      old.questionnaire_version, new.questionnaire_version;
  end if;
  return new;
end $$;

drop trigger if exists materiality_survey_rounds_guard on public.materiality_survey_rounds;
create trigger materiality_survey_rounds_guard
  before update on public.materiality_survey_rounds
  for each row execute function public.materiality_survey_round_guard();

drop trigger if exists materiality_survey_rounds_set_updated_at on public.materiality_survey_rounds;
create trigger materiality_survey_rounds_set_updated_at
  before update on public.materiality_survey_rounds
  for each row execute function public.sbti_set_updated_at();

-- =====================================================================
-- materiality_survey_questions
-- =====================================================================
create table if not exists public.materiality_survey_questions (
  id                        uuid        not null default gen_random_uuid(),
  round_id                  uuid        not null,
  -- Denormalised from the round so RLS is a plain column comparison rather than a subquery on
  -- every row of a table an RPC will scan.
  user_id                   uuid        not null,
  questionnaire_version     int         not null,

  -- ⚠️ NULL = AN ENTITY-SPECIFIC MATTER (§3.2). ESRS 1 Appendix A explicitly contemplates
  -- disclosures outside its list; those carry no sub-topic and are excluded from the matrix
  -- roll-up. The composite FK below is MATCH SIMPLE (the default), so a NULL here satisfies it
  -- without a lookup — which is exactly the wanted behaviour, and subtle enough to say out loud.
  subtopic_code             text,
  standard_version          text        not null,
  -- Copied from mr_esrs_subtopic_display at generation, not derived. See that table's header.
  shared_with_subtopic_code text,

  -- ⚠️ DESELECTION IS A STATUS, NEVER AN ABSENT ROW. A row exists for ALL 37 sub-topics from the
  -- moment the round is created (see the generator below). §3.2: "a topic that silently vanishes
  -- is indistinguishable from one never considered", and ESRS 2 IRO-1 requires the process to be
  -- described, not just its result. Absence stays reserved for one meaning only: not in this
  -- taxonomy at all.
  status                    text        not null default 'included'
    check (status in ('included', 'excluded')),
  exclusion_reason          text,

  -- SNAPSHOTS, taken at generation and never re-read from the reference tables. The question a
  -- respondent saw must not change because mr_esrs_subtopic_display was later re-seeded — the same
  -- argument as freezing disclosureRequirements into workings at write rather than resolving at
  -- read. A re-seed changes future rounds; it must not restate a past one.
  short_name                text        not null,
  question_framing          text,
  wording                   text        not null,
  context                   text,

  sort_order                smallint    not null,
  created_at                timestamptz not null default now(),

  constraint materiality_survey_questions_pkey primary key (id),
  -- FK target for materiality_survey_responses (question_id, questionnaire_version): a response
  -- can then never claim a version its question did not have.
  constraint materiality_survey_questions_id_version_key unique (id, questionnaire_version),

  -- Composite, so the question's standard_version and the round's cannot diverge.
  constraint materiality_survey_questions_round_fkey
    foreign key (round_id, standard_version)
    references public.materiality_survey_rounds (id, standard_version) on delete cascade,

  constraint materiality_survey_questions_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,
  constraint materiality_survey_questions_shared_fkey
    foreign key (shared_with_subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- §3.2's recorded decision, enforced rather than remembered. A deselection with no reason is
  -- indistinguishable in the report from a topic nobody considered, which is the thing the
  -- row-for-all-37 rule exists to prevent — so the reason is not optional.
  constraint materiality_survey_questions_exclusion_reason_required
    check (status = 'included'
           or (exclusion_reason is not null and length(btrim(exclusion_reason)) > 0)),

  -- An entity-specific matter maps to no ESRS sub-topic, so it can have no S1/S2 pair either.
  constraint materiality_survey_questions_shared_needs_subtopic
    check (shared_with_subtopic_code is null or subtopic_code is not null),
  constraint materiality_survey_questions_shared_not_self
    check (shared_with_subtopic_code is null or shared_with_subtopic_code <> subtopic_code)
);

-- One row per sub-topic per version. PARTIAL, because entity-specific matters (subtopic_code null)
-- must be free to repeat. Postgres's default NULLS DISTINCT would permit that anyway; being
-- explicit costs nothing and does not depend on a default that has changed across major versions.
create unique index if not exists materiality_survey_questions_round_version_subtopic_key
  on public.materiality_survey_questions (round_id, questionnaire_version, subtopic_code)
  where subtopic_code is not null;

-- The read shape: one round's current question set, in order.
create index if not exists materiality_survey_questions_round_version_order_idx
  on public.materiality_survey_questions (round_id, questionnaire_version, sort_order);

comment on table public.materiality_survey_questions is
  'The frozen question set for one (round, questionnaire_version). A row exists for ALL 37 esrs_2026 sub-topics from round creation — deselection sets status=''excluded'' with a reason and is reported as "considered and excluded" (spec v8 §3.2, ESRS 2 IRO-1). Absence never means deselected. Wording/short_name/framing are SNAPSHOTS: a later re-seed of mr_esrs_subtopic_display changes future rounds and must not restate a past one.';

comment on column public.materiality_survey_questions.subtopic_code is
  'NULL = an entity-specific matter outside Appendix A''s list, excluded from the matrix roll-up (§3.2). The composite FK is MATCH SIMPLE, so NULL satisfies it without a lookup.';

comment on column public.materiality_survey_questions.status is
  'included | excluded. NEVER expressed as row absence. Also an input to the DERIVED n_asked counter (§3.0.1): a respondent was asked Q only if Q is included, so a question deleted rather than excluded would silently shrink the denominator of every historical aggregate.';

-- ── The generator: a round cannot exist without its question set ──────────────
-- §3.2's row-for-all-37 rule is a cardinality claim ACROSS rows, so no table constraint can carry
-- it. This can. Attaching it to the round's INSERT makes the rule structural rather than something
-- an insert path is trusted to remember — the same move as lib/ghg/conciergeDocTypes.ts, which
-- exists because a comment did not stop the concierge silently returning nothing for three
-- document types.
--
-- Runs as the INSERTING USER, not SECURITY DEFINER. It needs no privilege the caller lacks:
-- user_id is copied from the round the caller just created, so the RLS WITH CHECK on
-- materiality_survey_questions passes for exactly the rows it should and for no others. A definer
-- here would be an escalation bought for nothing.
create or replace function public.materiality_survey_generate_questions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing  int;
  v_inserted int;
begin
  -- ⚠️ FAIL LOUDLY AT CREATION, NOT SILENTLY AT SURVEY TIME. A sub-topic with no display row would
  -- otherwise produce a question with no name — an empty form, which is the failure the gate in the
  -- header exists to prevent, arriving by a different door.
  select count(*) into v_missing
    from public.mr_esrs_subtopics s
    left join public.mr_esrs_subtopic_display d
      on d.subtopic_code = s.code
     and d.standard_version = s.standard_version
   where s.standard_version = new.standard_version
     and d.subtopic_code is null;

  if v_missing > 0 then
    raise exception
      'Cannot generate a question set for %: % sub-topic(s) have no row in '
      'mr_esrs_subtopic_display. Seed the short names first '
      '(20260818_mr_subtopic_display_and_stakeholder_categories.sql).',
      new.standard_version, v_missing;
  end if;

  insert into public.materiality_survey_questions (
    round_id, user_id, questionnaire_version,
    subtopic_code, standard_version, shared_with_subtopic_code,
    status, short_name, question_framing, wording, sort_order
  )
  select
    new.id,
    new.user_id,
    new.questionnaire_version,
    s.code,
    s.standard_version,
    d.shared_with_subtopic_code,
    'included',
    d.short_name,
    d.question_framing,
    -- The default wording the customer then edits freely (§3.1's third layer of authorship). Built
    -- from the house short name and its framing — NEVER from s.label, which is the annex text this
    -- whole layer exists to keep out of a respondent's question.
    d.short_name || coalesce(' ' || d.question_framing, ''),
    -- Global question order. The outer key is the TOPIC's sort_order, because sub-topic sort_order
    -- restarts at 1 within each topic — ordering on it alone would interleave E1.1, E2.1, E3.1.
    row_number() over (order by t.sort_order, s.sort_order)
  from public.mr_esrs_subtopics s
  join public.mr_esrs_subtopic_display d
    on d.subtopic_code = s.code
   and d.standard_version = s.standard_version
  join public.mr_esrs_topics t
    on t.code = s.topic_code
  where s.standard_version = new.standard_version;

  get diagnostics v_inserted = row_count;

  -- A round with no questions is precisely the empty-form failure. It cannot be reached from here
  -- (the CHECK admits only esrs_2026 and the missing-display guard above has already passed), which
  -- is why this is worth keeping: it catches the case where those two assumptions stop holding.
  if v_inserted = 0 then
    raise exception
      'Generated ZERO questions for round % under %. A survey round with no questions renders to a '
      'respondent as an empty form rather than as a refusal; refusing the round instead.',
      new.id, new.standard_version;
  end if;

  return null;   -- AFTER trigger; the return value is ignored
end $$;

drop trigger if exists materiality_survey_rounds_generate_questions
  on public.materiality_survey_rounds;
create trigger materiality_survey_rounds_generate_questions
  after insert on public.materiality_survey_rounds
  for each row execute function public.materiality_survey_generate_questions();

-- =====================================================================
-- materiality_survey_respondents
-- =====================================================================
create table if not exists public.materiality_survey_respondents (
  id                   uuid        not null default gen_random_uuid(),
  round_id             uuid        not null
                                     references public.materiality_survey_rounds (id) on delete cascade,
  user_id              uuid        not null,

  -- uuid rather than the supplier portal's 64 hex characters, matching cbam_verifier_access — the
  -- module this sits beside. Same unguessability, less bespoke.
  token                uuid        not null default gen_random_uuid(),

  -- track is denormalised from the category so the composite FK below can enforce the pair. It is
  -- not independent data: mr_stakeholder_categories owns the mapping.
  track                text        not null,
  stakeholder_category text        not null,

  -- §4 internal attributes. Recorded on the INVITE, and copied onto the response at submit — the
  -- response never carries invite_email or invite_name.
  function_department  text,
  seniority_band       text,
  site_region          text,
  -- §4 external attribute (ESRS 1 ¶62: own operations / upstream / downstream).
  value_chain_position text
    check (value_chain_position is null
           or value_chain_position in ('own_operations', 'upstream', 'downstream')),

  -- Needed to SEND the invitation. Deliberately never denormalised onto a response row.
  invite_email         text,
  invite_name          text,

  status               text        not null default 'invited'
    check (status in ('invited', 'in_progress', 'completed', 'revoked', 'expired')),

  -- ⚠️ cbam_verifier_access's LIFECYCLE, NOT the supplier portal's forever-token.
  -- campaign_suppliers.token never expires and cannot be revoked; spec v8 §9 decision 7 names that
  -- as the weakest part of an otherwise reusable pattern, and verifier_access already has the
  -- better shape. Copied verbatim from 20260724_cbam_verifier_access.sql, including the 90 days.
  expires_at           timestamptz not null default (now() + interval '90 days'),
  revoked_at           timestamptz,

  invited_at           timestamptz not null default now(),
  reminder_sent_at     timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),

  constraint materiality_survey_respondents_pkey primary key (id),
  constraint materiality_survey_respondents_token_key unique (token),

  -- ⚠️ THE COMPOSITE FK THAT MAKES MISCATEGORISATION IMPOSSIBLE. Without it, an invite could carry
  -- track='internal' with stakeholder_category='customer' — and since the labour routing keys on
  -- the category, that respondent would be silently misrouted between S1 and S2 with nothing
  -- anywhere going red. mr_stakeholder_categories carries UNIQUE (code, track) solely as this
  -- constraint's target.
  constraint materiality_survey_respondents_category_track_fkey
    foreign key (stakeholder_category, track)
    references public.mr_stakeholder_categories (code, track)
);

create index if not exists materiality_survey_respondents_token_idx
  on public.materiality_survey_respondents (token);
create index if not exists materiality_survey_respondents_round_status_idx
  on public.materiality_survey_respondents (round_id, status);

comment on table public.materiality_survey_respondents is
  'Who was invited to a survey round, with the track and stakeholder category that drive S1/S2 routing (spec v8 §3.0.1) and the §4 engagement attributes ESRS 2 SBM-2 requires. Lifecycle is cbam_verifier_access''s (expires_at, revoked_at, status gate), NOT the supplier portal''s never-expiring never-revocable token. invite_email lives here and is never copied onto a response.';

comment on column public.materiality_survey_respondents.stakeholder_category is
  'FK to mr_stakeholder_categories. Drives the labour routing for S1.1-6 / S2.1-6 and nothing else; every other sub-topic is asked of every respondent. The composite FK on (stakeholder_category, track) is what stops an internal respondent carrying an external category and being misrouted with no error.';

comment on column public.materiality_survey_respondents.expires_at is
  'Copied from cbam_verifier_access, including the 90-day default. The supplier portal''s token never expires and cannot be revoked; that is the one part of its pattern this survey deliberately does not reuse.';

-- =====================================================================
-- materiality_survey_responses
-- =====================================================================
create table if not exists public.materiality_survey_responses (
  id                     uuid        not null default gen_random_uuid(),
  -- Denormalised so the aggregation never joins through the respondent to find its round — the
  -- table it must not need to join to.
  round_id               uuid        not null,
  respondent_id          uuid        not null
                                       references public.materiality_survey_respondents (id) on delete cascade,
  question_id            uuid        not null,
  questionnaire_version  int         not null,
  standard_version       text        not null,

  -- ⚠️ BOTH CODES, PLUS WHY — spec v8 §3.0.1.
  -- asked_subtopic_code is the EVIDENCE RECORD: what this person was actually shown. A verifier's
  -- question is "what did this person answer?", and storing only the resolved code would store an
  -- inference as though it were the answer.
  -- resolved_subtopic_code is what the matrix consumes, written AT SUBMIT. Storing only the asked
  -- code would force every later consumer to re-derive the routing against whatever the rule is
  -- THEN — silently restating historical answers when it changes. Same argument as resolving
  -- disclosure requirements at write, and as applyResolutions() being the single source of truth
  -- for what a figure IS.
  -- resolution_basis is the third column, and it is what makes the pair auditable rather than
  -- magic: which category produced this resolution.
  asked_subtopic_code    text,
  resolved_subtopic_code text,
  resolution_basis       text        references public.mr_stakeholder_categories (code),

  -- ⚠️ §6.1 MADE STRUCTURAL. "Not enough visibility" is NULL, never zero, never a low — and it is
  -- a RECORDED ANSWER, not a missing one. The XOR below is the invariant: exactly one of a value
  -- and an abstention, never both, never neither.
  value                  smallint    check (value between 1 and 3),
  abstained              boolean     not null default false,

  free_text              text,

  -- Copied from the respondent AT WRITE. These are what the aggregation reads; the respondent FK
  -- exists for autosave and one-answer-per-person, and the aggregation must never need it. Nothing
  -- identifying is copied — no email, no name.
  track                  text        not null,
  stakeholder_category   text        not null,
  function_department    text,

  answered_at            timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint materiality_survey_responses_pkey primary key (id),

  -- One answer per person per question. Backs the autosave upsert, the same role
  -- supplier_responses' (campaign_supplier_id, question_id) index plays.
  constraint materiality_survey_responses_respondent_question_key
    unique (respondent_id, question_id),

  -- RESTRICT, not CASCADE. A question a response points at must not be deletable: the question set
  -- is half of the DERIVED n_asked, so deleting one would shrink the denominator of every
  -- historical aggregate for that round with nothing going red. Deselect, never delete.
  constraint materiality_survey_responses_question_fkey
    foreign key (question_id, questionnaire_version)
    references public.materiality_survey_questions (id, questionnaire_version) on delete restrict,

  constraint materiality_survey_responses_asked_fkey
    foreign key (asked_subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,
  constraint materiality_survey_responses_resolved_fkey
    foreign key (resolved_subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- THE ABSTENTION INVARIANT. A value means they answered; abstained means they told us they
  -- could not. Both set, or neither, is a state with no meaning — and the one that would quietly
  -- appear is `abstained = false, value = null`, which is a row asserting an answer it does not
  -- have. It is refused here rather than defaulted to anything.
  constraint materiality_survey_responses_value_xor_abstained
    check ((abstained and value is null) or (not abstained and value is not null))
);

-- The aggregation's read shape: one round, grouped by question.
create index if not exists materiality_survey_responses_round_question_idx
  on public.materiality_survey_responses (round_id, question_id);
-- The roll-up reads by resolved sub-topic across a round.
create index if not exists materiality_survey_responses_round_resolved_idx
  on public.materiality_survey_responses (round_id, resolved_subtopic_code);

comment on table public.materiality_survey_responses is
  'One screening answer per respondent per question. A ROW''S ABSENCE MEANS NO ANSWER WAS RECORDED — it does NOT mean "not asked". n_asked is DERIVED from the frozen question set and the category routing (spec v8 §3.0.1), never counted here, because absence cannot distinguish "never shown" from "shown and skipped" and partial submission is permitted. No grant to anon or authenticated: the customer reaches these rows only through the aggregation RPC, which applies the round''s anonymity_floor.';

comment on column public.materiality_survey_responses.value is
  '1-3 on the §5.1 maturity scale, or NULL when abstained. NEVER 0 and never a defaulted low — the same invariant as the GHG engine''s declared_unquantified and the hazard layer''s band:''unknown''. The XOR constraint with `abstained` is what makes it impossible to store a row that asserts an answer it does not have.';

comment on column public.materiality_survey_responses.abstained is
  '"Not enough visibility to assess" — a RECORDED ANSWER, not a missing one, and reported as a count in its own right (§6.1). Distinct from a skipped question (no row) and from a not-asked question (routing; also no row, and derived rather than stored). Folding any of the three together corrupts the abstention finding in the same direction: it makes the company look blinder than the evidence says.';

comment on column public.materiality_survey_responses.asked_subtopic_code is
  'What this respondent was SHOWN — the evidence record. Kept alongside resolved_subtopic_code rather than instead of it: storing only the resolution would store an inference as though it were the answer.';

comment on column public.materiality_survey_responses.resolved_subtopic_code is
  'S1.x or S2.x, written AT SUBMIT from the respondent''s stakeholder category. Stored rather than re-derived so a later change to the routing rule cannot silently restate historical answers.';

comment on column public.materiality_survey_responses.resolution_basis is
  'The mr_stakeholder_categories.code that produced resolved_subtopic_code. The column that makes the S1/S2 resolution auditable instead of magic — and the reason a category''s labour_routing must never be edited in place: the code recorded here would then name a rule that was not the one applied.';

-- =====================================================================
-- Grants
-- =====================================================================
-- Strip Supabase's defaults first: all four tables are created after the 7 Aug cleanup and are
-- therefore born with anon INSERT/UPDATE/DELETE that nothing later removes.
revoke all on public.materiality_survey_rounds      from anon, authenticated, service_role;
revoke all on public.materiality_survey_questions   from anon, authenticated, service_role;
revoke all on public.materiality_survey_respondents from anon, authenticated, service_role;
revoke all on public.materiality_survey_responses   from anon, authenticated, service_role;

-- The customer owns their rounds, questions and invite list.
-- NO DELETE, matching cbam_verifier_access's posture ("revoke is a status UPDATE, never a DELETE"):
-- a finished round is closed and a withdrawn invite is revoked. A deleted question would take the
-- denominator of a historical aggregate with it.
grant select, insert, update on public.materiality_survey_rounds      to authenticated;
grant select, insert, update on public.materiality_survey_questions   to authenticated;
grant select, insert, update on public.materiality_survey_respondents to authenticated;

-- ⚠️ RESPONSES: NOTHING TO authenticated, NOTHING TO anon. This grant IS the anonymity guarantee
-- — not a UI convention, not an RLS policy that a later `for all` could widen. The respondent
-- writes through a token-scoped SECURITY DEFINER RPC and the customer reads through an aggregation
-- RPC that applies anonymity_floor; neither is in this file. Until they exist, nothing but
-- service_role can touch this table, which is the correct posture for a table with no readers.
grant all on public.materiality_survey_responses to service_role;

-- anon reaches every one of these four ONLY through SECURITY DEFINER RPCs (a later task), never
-- directly. Intentionally no grant, on all four.
grant all on public.materiality_survey_rounds      to service_role;
grant all on public.materiality_survey_questions   to service_role;
grant all on public.materiality_survey_respondents to service_role;

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.materiality_survey_rounds      enable row level security;
alter table public.materiality_survey_questions   enable row level security;
alter table public.materiality_survey_respondents enable row level security;
alter table public.materiality_survey_responses   enable row level security;

-- Owner-only, keyed on the creating user — mirrors cbam_verifier_access_owner and
-- materiality_assessments. `to authenticated` is named explicitly; a policy written without a
-- `to` clause defaults to `public`, which is the root cause 20260807_supplier_portal_policy_cleanup
-- was written to fix.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'materiality_survey_rounds' and policyname = 'materiality_survey_rounds_owner') then
    create policy materiality_survey_rounds_owner on public.materiality_survey_rounds
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'materiality_survey_questions' and policyname = 'materiality_survey_questions_owner') then
    create policy materiality_survey_questions_owner on public.materiality_survey_questions
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public'
                  and tablename = 'materiality_survey_respondents' and policyname = 'materiality_survey_respondents_owner') then
    create policy materiality_survey_respondents_owner on public.materiality_survey_respondents
      for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ⚠️ materiality_survey_responses DELIBERATELY HAS NO POLICY. RLS is enabled and no policy exists
-- for anon or authenticated, so both are denied by RLS as well as by the absent grant. Two
-- independent denials, because this repo has already learned that BYPASSRLS bypasses RLS and not
-- GRANT, and the converse trap is just as real: a policy added later "to make the dashboard work"
-- would open the table without anyone touching the grants. If a policy is ever added here, the
-- anonymity claim in the product copy has to change in the same commit.

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) THE GATE HOLDS — a 2023 round is refused at the database, not at the UI:
--    begin;
--      insert into public.materiality_survey_rounds (name, standard_version)
--      values ('should fail', 'esrs_2023');
--      -- expect ERROR: violates check constraint "materiality_survey_rounds_standard_version_check"
--    rollback;
--
-- 2) A round generates its 37 questions, all included, correctly ordered — E1.1 first, G1.3 last:
--    begin;
--      insert into public.materiality_survey_rounds (name, standard_version)
--      values ('verify round', 'esrs_2026') returning id \gset
--      select count(*), count(*) filter (where status = 'included')
--        from public.materiality_survey_questions where round_id = :'id';
--      -- expect 37 | 37
--      select sort_order, subtopic_code, short_name, question_framing
--        from public.materiality_survey_questions where round_id = :'id'
--       order by sort_order limit 5;
--      -- expect 1 E1.1 ... and NOT E1.1, E2.1, E3.1 interleaved (that would mean the generator
--      -- ordered on sub-topic sort_order alone, which restarts at 1 within each topic)
--      select count(*) from public.materiality_survey_questions
--       where round_id = :'id' and shared_with_subtopic_code is not null;   -- expect 12
--      -- the wording never contains annex text:
--      select count(*) from public.materiality_survey_questions q
--        join public.mr_esrs_subtopics s
--          on s.code = q.subtopic_code and s.standard_version = q.standard_version
--       where q.round_id = :'id' and q.wording like '%' || s.label || '%';  -- expect 0
--    rollback;
--
-- 3) standard_version is immutable, and the trigger says so rather than silently allowing it:
--    begin;
--      insert into public.materiality_survey_rounds (name, standard_version)
--      values ('immutability', 'esrs_2026') returning id \gset
--      update public.materiality_survey_rounds set standard_version = 'esrs_2026' where id = :'id';
--      -- expect SUCCESS (a no-op update must not raise)
--      update public.materiality_survey_rounds set questionnaire_version = 0 where id = :'id';
--      -- expect ERROR: questionnaire_version cannot go backwards
--    rollback;
--    -- The version-change arm cannot be exercised while the CHECK admits one value. It becomes
--    -- testable the day the CHECK is widened, and that is exactly when it matters.
--
-- 4) The generator refuses rather than producing an empty form. Prove it by hiding a display row:
--    begin;
--      delete from public.mr_esrs_subtopic_display
--       where subtopic_code = 'E3.1' and standard_version = 'esrs_2026';
--      insert into public.materiality_survey_rounds (name, standard_version)
--      values ('missing display', 'esrs_2026');
--      -- expect ERROR: Cannot generate a question set for esrs_2026: 1 sub-topic(s) have no row...
--    rollback;
--
-- 5) The abstention invariant. All four cases, and the third is the one that would otherwise creep in:
--    -- (value=2, abstained=false) -> ok      (value=null, abstained=true)  -> ok
--    -- (value=null, abstained=false) -> ERROR   (value=2, abstained=true) -> ERROR
--    begin;
--      -- against any real respondent/question ids:
--      insert into public.materiality_survey_responses
--        (round_id, respondent_id, question_id, questionnaire_version, standard_version,
--         value, abstained, track, stakeholder_category)
--      values (:'round', :'resp', :'q', 1, 'esrs_2026', null, false, 'internal', 'own_workforce');
--      -- expect ERROR: violates check constraint "materiality_survey_responses_value_xor_abstained"
--    rollback;
--
-- 6) A miscategorised respondent is refused — the composite FK, which is the whole reason
--    mr_stakeholder_categories carries UNIQUE (code, track):
--    begin;
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category)
--      values (:'round', auth.uid(), 'internal', 'customer');
--      -- expect ERROR: violates foreign key constraint
--      --               "materiality_survey_respondents_category_track_fkey"
--    rollback;
--
-- 7) A question cannot be deleted out from under a response (n_asked's denominator):
--    begin;
--      delete from public.materiality_survey_questions where id = :'q';
--      -- expect ERROR: violates foreign key constraint "materiality_survey_responses_question_fkey"
--    rollback;
--
-- 8) An excluded question must carry a reason:
--    begin;
--      update public.materiality_survey_questions set status = 'excluded' where id = :'q';
--      -- expect ERROR: violates check constraint
--      --               "materiality_survey_questions_exclusion_reason_required"
--      update public.materiality_survey_questions
--         set status = 'excluded', exclusion_reason = 'No marine operations.' where id = :'q';
--      -- expect SUCCESS
--    rollback;
--
-- 9) ⚠️ THE ANONYMITY POSTURE — read this one rather than trusting it:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--    from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'materiality_survey_responses'
--    group by grantee order by grantee;
--    -- expect service_role ONLY. If `authenticated` appears here, the anonymity claim is false.
--    select tablename, policyname, roles, cmd from pg_policies
--    where schemaname = 'public' and tablename like 'materiality\_survey\_%' order by tablename;
--    -- expect owner policies on rounds/questions/respondents, and NO ROW for responses
--    select relname, relrowsecurity from pg_class
--    where relname like 'materiality\_survey\_%';   -- expect t on all four
--
-- 10) n_asked is derivable — the shape the aggregation will use, run here to prove the inputs
--     survive. For one round, per question, how many invited respondents were ASKED it:
--    select q.subtopic_code, q.short_name,
--           count(*) filter (
--             where q.status = 'included'
--               and (q.shared_with_subtopic_code is null or c.labour_routing <> 'not_asked')
--           ) as n_asked,
--           count(*) filter (
--             where q.status = 'included'
--               and q.shared_with_subtopic_code is not null and c.labour_routing = 'not_asked'
--           ) as n_not_asked
--    from public.materiality_survey_questions q
--    cross join public.materiality_survey_respondents r
--    join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
--    where q.round_id = :'round' and r.round_id = :'round'
--      and q.questionnaire_version = 1
--    group by q.subtopic_code, q.short_name, q.sort_order
--    order by q.sort_order;
--    -- Note it reads NO response rows. That is the point: n_asked comes from the question set and
--    -- the routing, and n_skipped is then n_asked - n_answered - n_abstained.
