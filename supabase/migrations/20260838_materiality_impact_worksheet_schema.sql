-- 20260838_materiality_impact_worksheet_schema.sql
--
-- THE PREPARER WORKSHEET — schema only. Three tables, one constraint on an existing reference table,
-- RLS, grants. No RPC, no severity calculation, no UI. Those are separate tasks and are named at the
-- foot of this header so nothing here is mistaken for complete.
--
-- This is the piece that lets the module be called a double materiality ASSESSMENT rather than a
-- screening. The survey collects stakeholder PRIORITY; this collects the preparer's own SEVERITY
-- determination against ESRS 1 ¶40-41 — scale, scope, irremediability, actual/potential, likelihood,
-- value chain position and time horizon, per sub-topic, in both directions.
--
--
-- =====================================================================
-- ⚠️ WHY THIS IS NOT materiality_assessments.impact_overrides
-- =====================================================================
-- That column exists, it is jsonb, and it is the obvious place to put this. It is the wrong place,
-- for four reasons of increasing severity:
--
--   1. THE TYPE IS WRONG. lib/materiality.ts:493 declares it `Record<string, number>` — topic_code
--      to a 0..10 scalar — and reads it at line 761 in a scalar position. Structured per-sub-topic
--      data does not fit and every consumer would have to branch.
--   2. THE KEY IS WRONG. It is topic-keyed, ten rows. This is sub-topic-keyed, 37 rows including the
--      S1/S2 duplication, and further keyed by direction.
--   3. IT IS A BLOB ON A ROW, so there is no per-row foreign key, no per-row RLS predicate, no CHECK
--      constraint, no trigger and no unique constraint. Every rule below would have to be a comment
--      in application code, which is precisely the failure mode this codebase keeps paying for.
--   4. DISQUALIFYING: IT CANNOT CARRY MULTI-CONTRIBUTOR. Giving a named colleague write access to
--      THEIR sub-topics and nothing else is impossible when the target is a column on a row — it
--      would mean granting UPDATE on the whole assessment. And two contributors saving concurrently
--      through a jsonb read-modify-write clobber each other with nothing going red. Multi-contributor
--      is this design's entire advantage over one person guessing at everything.
--
-- impact_overrides is NOT touched by this migration and nothing here writes to it. Whether the
-- derived impact axis is eventually fed from these rows or replaced by them is a later decision.
--
--
-- =====================================================================
-- ⚠️ TWO ROWS PER SUB-TOPIC, NOT TWIN COLUMN SETS — ESRS 1 ¶44
-- =====================================================================
-- A sub-topic gets one negative determination and one positive determination. They could have been
-- one row with scale_neg/scale_pos/... and they are not, for three reasons:
--
--   * ¶44 says positive impacts are NEVER NETTED against negative ones. Two rows that are never
--     summed make that structurally true. Two column groups on one row make it an assertion someone
--     can break with an addition.
--   * The dimensions genuinely differ — a positive impact has no irremediability (¶41) — so the twin
--     layout would carry a column that must always be null for half its purpose.
--   * The CHECK constraints differ per direction, and a constraint that has to name which half of a
--     row it applies to is a constraint waiting to be misread.
--
--
-- =====================================================================
-- ⚠️ ¶41's TWO RULES ARE CONSTRAINTS HERE, NOT COMMENTS
-- =====================================================================
--   determinations_positive_has_no_irremediability
--       A positive impact cannot carry irremediability. There is nothing to remediate.
--
--   determinations_actual_takes_no_likelihood
--       An ACTUAL impact cannot carry likelihood. It is already occurring; applying likelihood to it
--       understates severity, and spec v9 §6.2 names this as THE MOST COMMON TECHNICAL ERROR IN A
--       DMA. A rule that is the most common error in the field must be unstorable, not documented.
--
-- ⚠️ AND IT IS WRITTEN `coalesce(nature, '') = 'potential'`, NOT `nature = 'potential'`.
-- A CHECK constraint PASSES when its expression evaluates to NULL. With a bare comparison, a draft
-- row carrying nature = NULL and likelihood = 3 evaluates to `NULL or false` = NULL, and Postgres
-- lets it through — the exact case the constraint exists to catch. coalesce makes it false.
--
--
-- =====================================================================
-- ⚠️ ONE ASSIGNEE PER SUB-TOPIC, ENFORCED BY THE DATABASE
-- =====================================================================
--     unique (assessment_id, subtopic_code)   on materiality_impact_assignment_subtopics
--
-- The decision is that there is no expert-vs-expert disagreement and no ownership contest. That
-- decision is worth exactly as much as its weakest enforcement point, and an assign screen is a weak
-- one: it can be raced by two tabs, bypassed by a direct write, and regressed by any later edit. The
-- constraint cannot. A second assignment covering S1.3 fails on insert.
--
-- It needs assessment_id ON THE CHILD ROW to be expressible at all — hence the denormalised column
-- and the composite FK back to (id, assessment_id) rather than to the assignment's primary key
-- alone. That FK is what stops the denormalised value drifting from its parent.
--
--
-- =====================================================================
-- ⚠️ THE EVIDENCE FLAG IS A CONSTRAINT, BECAUSE THE DIVERGENCE REGISTER DEPENDS ON IT
-- =====================================================================
-- Contributors do not see the survey evidence; only the lead does. So:
--
--     determinations_delegated_saw_no_evidence
--         check (assignment_id is null or evidence_in_view = false)
--
-- A delegated determination CANNOT claim the survey evidence was in view, because it was not. The
-- lead's own determinations (assignment_id null) may be either — they might not have looked, or
-- there might be no linked round.
--
-- Left as a boolean the application sets, this would be true-by-default within a month, and the
-- report would then imply an evidence-informed judgement that for delegated sub-topics did not
-- happen. That is the divergence register quietly telling an auditor something false, which is a
-- worse failure than the register not existing.
--
--
-- =====================================================================
-- ⚠️ draft / submitted — A NULL THAT MEANT TWO THINGS, FIXED BEFORE IT SHIPPED
-- =====================================================================
-- Spec v9 §6.1: "not enough visibility" is NULL, never zero and never a low. But a null `scale` also
-- means "nobody has filled this in yet", and those are different facts about the world.
--
-- THIS IS THE SAME DEFECT AS 20260837, ONE LAYER UP. There, `n_asked = 0` on a round nobody had
-- opened was reported as 'no_eligible_respondents' — timing collapsed into engagement, telling a
-- customer their invite list was wrong when it was merely early. Here it would be a considered
-- abstention collapsed into an empty box.
--
--     status = 'draft'      null on a dimension means UNTOUCHED
--     status = 'submitted'  null on a dimension means ABSTAINED — a recorded §6.1 answer
--
-- Cheaper than three per-dimension booleans and their consistency constraints, and it puts the
-- distinction on a column a reader already has to look at. A submitted row must carry `nature` and
-- `determined_at`; both are constrained below.
--
--
-- =====================================================================
-- ⚠️ A CHECK ON mr_esrs_topics.category, BECAUSE THE SEVERITY RULE WILL DEPEND ON IT
-- =====================================================================
-- ESRS 1 ¶40 (2026) / ¶46 (2023): for SOCIAL topics severity takes precedence over likelihood — take
-- max rather than mean, and suppress the likelihood multiplier. A severe potential human rights
-- impact is material even at low likelihood and must never be scored down for being unlikely.
--
-- That rule keys on mr_esrs_topics.category = 'soc'. The column is text NOT NULL with a live domain
-- of exactly three values — env (5 topics), soc (4), gov (1), checked live 18 Aug 2026 — AND NO
-- CONSTRAINT, because the table predates supabase/migrations and carries only its primary key.
--
-- So nothing today stops a fourth value appearing, and the failure would be silent in the worst
-- direction: a social topic categorised 'social' rather than 'soc' would be treated as non-social,
-- the human-rights precedence would not apply, and a severe human rights impact would be scored down
-- for being unlikely — the exact outcome ¶40 exists to prevent. A rule that depends on a column's
-- value domain must constrain that domain.
--
-- ⚠️ NOT DERIVED FROM THE CODE PREFIX. `topic_code like 'S%'` would work today and is the move
-- 20260820's header rejects by name: "correct for a one-off check against a seed you can read, and a
-- latent defect the moment it becomes the routing rule for a live response."
--
-- ⚠️ AND CARRY THIS INTO severity.ts WHEN IT IS BUILT: under max, ANY dimension at 4 makes max 4,
-- which already clears the 2.5 threshold — so the top-band override NEVER FIRES for a social topic;
-- it is subsumed. The severity function must return WHICH RULE decided each row, or the report will
-- claim an override that did not happen.
--
--
-- =====================================================================
-- ⚠️ value_chain_position EXISTS TWICE NOW, WITH TWO CARDINALITIES. DELIBERATE.
-- =====================================================================
--   materiality_survey_respondents.value_chain_position   text     — single, check-constrained
--   materiality_impact_determinations.value_chain_position text[]  — multi-select, this file
--
-- They are not the same fact and must not be unified. The respondent's is WHERE THAT PERSON SITS: a
-- supplier contact is upstream, and cannot be two things at once. The determination's is WHERE THE
-- IMPACT OCCURS, and spec v9 §5.2 makes it multi-select because a single impact routinely spans own
-- operations and upstream — child labour in a supply chain that also runs a factory is the standard
-- case. Recorded here BEFORE both exist, so the next person to see them does not "fix" the
-- inconsistency by collapsing one into the other.
--
--
-- =====================================================================
-- SCOPE IS INHERITED, AND SNAPSHOTTED
-- =====================================================================
-- The sub-topic list comes from the round's included questions (materiality_survey_questions where
-- status = 'included') and is COPIED onto assignment_subtopics rows at creation. It is not joined
-- live. Same argument as 20260819 snapshotting the question display copy: a later re-scope must not
-- change what a contributor was asked to determine, and short_name is carried for the same reason —
-- a re-seed of the reference tables must not relabel a determination already made.
--
-- KEYED SO THE MULTI-ROUND UNION NEEDS NO MIGRATION. source_round_id is per ROW, not per assignment,
-- so scope drawn from two linked rounds is simply rows carrying two different round ids. The unique
-- above makes the union idempotent — the second round's duplicate sub-topic conflicts rather than
-- doubling — so an eventual union is `on conflict do nothing`, not a schema change. First pass is
-- single-round; nothing here assumes it.
--
-- source_round_id is NULLABLE: an assessment with no survey is a supported case, and the worksheet
-- must work for a customer who never sent one.
--
--
-- =====================================================================
-- THE AUDIT TRAIL NAMES AN INVITATION, NOT A VERIFIED PERSON
-- =====================================================================
-- Token-based access, no account creation — the same trade materiality_survey_respondents already
-- makes. contributor_name and contributor_email are what was INVITED. The report must therefore say
-- "S1 severity was determined by the holder of the assignment sent to [name, email]", never "by
-- [name]". Weaker than an authenticated account, and stated rather than glossed.
--
-- Lifecycle is cbam_verifier_access's, forked a second time via 20260819: expires_at with the 90-day
-- default, revoked_at, and a status gate. NOT the supplier portal's never-expiring, never-revocable
-- token.
--
--
-- =====================================================================
-- ⚠️ WHAT THIS MIGRATION DOES NOT DO — one of these is a live gap
-- =====================================================================
-- (1) THE ASSIGNEE'S DETERMINATION DOES NOT YET "STAND". The decision is that the subject-matter
--     expert's determination is final. Nothing here enforces it: RLS scopes these rows by
--     user_id = auth.uid(), and a delegated determination carries the LEAD's user_id because it is
--     the lead's assessment — so the lead holds UPDATE on a submitted delegated row today.
--
--     The fix is a BEFORE UPDATE lock, the direct analogue of 20260821's respondent completion lock,
--     and it is NOT built here for the same reason 20260821 was its own migration: it needs
--     decisions that have not been taken. Is there a reopen path, and who holds it? What happens to
--     a submitted determination when its assignment is revoked? What does a contributor who leaves
--     the company mid-assessment do to a sub-topic nobody can now edit? Building a lock with
--     undecided semantics produces a migration that has to be replaced.
--
--     THE PRACTICAL RISK TODAY IS LOW — nothing in app/ or lib/ writes these tables yet — AND IT
--     STOPS BEING LOW THE DAY THE WORKSHEET UI SHIPS. It must land before then.
--
-- (2) No token-resolution RPC. Contributors cannot reach these rows at all yet; there is no grant
--     to anon anywhere in this file and no SECURITY DEFINER function. That is deliberate — the
--     write path is its own migration, modelled on 20260820's resolve_token: named OUT parameters
--     rather than a row type, one refusal message for unknown/revoked/expired/submitted, and a
--     DISTINCT errcode for a finalised assessment the way 20260836 did for a closed round.
--
-- (3) No severity calculation. It belongs in lib/materiality/severity.ts as pure TypeScript, not in
--     SQL: §6.2 argues the rule across all 64 score combinations and publishes the 32/41/56 table,
--     which IS the test fixture. 64 assertions in vitest are checkable by anyone; a plpgsql
--     expression is not, and this is the number an auditor asks about. Precedent is lib/ghg/engine.ts
--     — pure calc, rendered rather than re-derived.
--
--     ⚠️ AND NO SEVERITY IS STORED. Deriving it on read is the applyResolutions() rule: the figure
--     and the method claimed for it cannot disagree if there is only one place the figure exists.
--
-- (4) No financial-effect axis (§5.2's outside-in question), no divergence register, no
--     reassignment, no write-back to impact_overrides.
--
-- ⚠️ CONTRIBUTOR-FACING COPY, WHEN IT IS WRITTEN, COMES FROM SPEC v9 §5.3 AND NOT §5.2. §5.2's
-- option lists give scope and irremediability THREE points; §5.3 mandates FOUR on all three
-- dimensions and states that the three-point version "cannot be averaged" and "would have corrupted
-- every severity figure the engine produced". §5.2 is the superseded draft. The smallint range
-- checks below are 1..4 for all three, per §5.3.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260837. Re-runnable — guarded
-- ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS, guarded CREATE POLICY. No client change ships with it
-- and none is needed; nothing in app/ or lib/ reads these tables yet.

begin;

-- =====================================================================
-- 0. The reference-table domain the human-rights rule will depend on
-- =====================================================================
-- Fails loudly and BY NAME if the live data does not match, rather than leaving a bare
-- check-violation for someone to decode. If this raises, the severity rule's premise is already
-- false and the constraint is not the problem.
do $$
declare v_bad text;
begin
  select string_agg(distinct category, ', ' order by category)
    into v_bad
    from public.mr_esrs_topics
   where category is null or category not in ('env', 'soc', 'gov');

  if v_bad is not null then
    raise exception
      'mr_esrs_topics.category holds unexpected value(s): %. Expected only env / soc / gov. The '
      'ESRS 1 para 40 human-rights rule keys on category = ''soc''. Resolve the data before '
      'constraining the domain.', v_bad;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mr_esrs_topics'::regclass
       and conname  = 'mr_esrs_topics_category_check'
  ) then
    alter table public.mr_esrs_topics
      add constraint mr_esrs_topics_category_check
      check (category in ('env', 'soc', 'gov'));
  end if;
end $$;

comment on constraint mr_esrs_topics_category_check on public.mr_esrs_topics is
  'Constrains a domain the severity rule depends on. ESRS 1 para 40 (2026) / para 46 (2023) gives severity precedence over likelihood for SOCIAL topics, and lib/materiality/severity.ts will key that on category = ''soc''. The table predates supabase/migrations and carried only its primary key, so a fourth value could have appeared silently — and the failure direction is the dangerous one: a mis-cased or renamed social category would be treated as non-social, the human-rights precedence would not apply, and a severe potential human rights impact would be scored down for being unlikely. Added by 20260838.';


-- =====================================================================
-- 1. materiality_impact_assignments — who was asked to determine what
-- =====================================================================
create table if not exists public.materiality_impact_assignments (
  id                uuid        not null default gen_random_uuid(),
  assessment_id     uuid        not null,

  -- Denormalised so RLS is a plain column comparison rather than a subquery on every row — the
  -- choice 20260819 and 20260827 both made. On its own it would NOT scope the row to the owner of
  -- the assessment; the composite foreign key below is what does that.
  user_id           uuid        not null default auth.uid(),

  -- uuid, matching materiality_survey_respondents and cbam_verifier_access. Same unguessability as
  -- the supplier portal's 64 hex characters, less bespoke.
  token             uuid        not null default gen_random_uuid(),

  -- ⚠️ WHAT WAS INVITED, NOT WHO DETERMINED. See the audit-trail note in the header: the report says
  -- "the holder of the assignment sent to [name, email]", because token access cannot say more.
  contributor_name  text,
  contributor_email text,
  contributor_role  text,   -- free text, e.g. 'HR Director'. Shown in the report beside the name.

  status            text        not null default 'invited'
    check (status in ('invited', 'in_progress', 'submitted', 'revoked', 'expired')),

  -- ⚠️ cbam_verifier_access's LIFECYCLE, including the 90 days. NOT the supplier portal's
  -- forever-token, which spec v8 §9 decision 7 names as the weakest part of an otherwise reusable
  -- pattern.
  expires_at        timestamptz not null default (now() + interval '90 days'),
  revoked_at        timestamptz,

  invited_at        timestamptz not null default now(),
  reminder_sent_at  timestamptz,
  submitted_at      timestamptz,
  created_at        timestamptz not null default now(),

  constraint materiality_impact_assignments_pkey primary key (id),
  constraint materiality_impact_assignments_token_key unique (token),

  -- FK target for both child tables. Pairing id with assessment_id — rather than letting them
  -- reference the primary key alone — is what stops a child row's denormalised assessment_id
  -- drifting from its parent's.
  constraint materiality_impact_assignments_id_assessment_key unique (id, assessment_id),

  -- ⚠️ COMPOSITE ON (id, user_id), NOT ON id ALONE. A single-column FK would permit a row carrying
  -- my user_id and pointing at your assessment. The second column IS the ownership check. Target is
  -- materiality_assessments_id_user_key, added by 20260827.
  constraint materiality_impact_assignments_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade
);

create index if not exists materiality_impact_assignments_token_idx
  on public.materiality_impact_assignments (token);
create index if not exists materiality_impact_assignments_assessment_idx
  on public.materiality_impact_assignments (assessment_id);

comment on table public.materiality_impact_assignments is
  'One named colleague asked to make the ESRS 1 severity determination for a set of sub-topics — HR for S1, facilities for E2. Token-based, no account creation, so this row names an INVITATION and not a verified person; the report must say "the holder of the assignment sent to [name, email]". Lifecycle is cbam_verifier_access''s (expires_at, revoked_at, status gate), forked a second time via materiality_survey_respondents.';
comment on column public.materiality_impact_assignments.contributor_email is
  'Needed to send the invitation. Follows materiality_survey_respondents.invite_email: it lives here and is never denormalised onto a determination row.';
comment on column public.materiality_impact_assignments.expires_at is
  'Copied from cbam_verifier_access via materiality_survey_respondents, including the 90-day default.';


-- =====================================================================
-- 2. materiality_impact_assignment_subtopics — the snapshotted scope
-- =====================================================================
create table if not exists public.materiality_impact_assignment_subtopics (
  assignment_id    uuid        not null,

  -- Denormalised from the parent SOLELY so the one-assignee unique below can be expressed. Kept
  -- honest by the composite FK, which references (id, assessment_id) rather than the parent's PK.
  assessment_id    uuid        not null,
  user_id          uuid        not null default auth.uid(),

  subtopic_code    text        not null,
  standard_version text        not null,

  -- SNAPSHOT, not a join. Copied from materiality_survey_questions at assignment creation so a later
  -- re-scope or reference re-seed cannot change what this contributor was asked to determine — the
  -- same argument 20260819 makes for the question set's display copy.
  short_name       text,

  -- Per ROW, not per assignment: scope drawn from two linked rounds is rows carrying two round ids,
  -- so the eventual multi-round union is `on conflict do nothing` rather than a schema change.
  -- NULLABLE because an assessment with no survey round is a supported case.
  source_round_id  uuid,

  assigned_at      timestamptz not null default now(),

  constraint materiality_impact_assignment_subtopics_pkey
    primary key (assignment_id, subtopic_code),

  -- ⚠️ THE ONE-ASSIGNEE RULE, AND THE REASON THIS TABLE CARRIES assessment_id AT ALL.
  -- "One assignee per sub-topic, no expert-vs-expert disagreement" is a decision worth exactly what
  -- its weakest enforcement point is worth. An assign screen can be raced by two tabs and bypassed
  -- by a direct write; this cannot.
  constraint materiality_impact_assignment_subtopics_one_assignee
    unique (assessment_id, subtopic_code),

  constraint materiality_impact_assignment_subtopics_assignment_fkey
    foreign key (assignment_id, assessment_id)
    references public.materiality_impact_assignments (id, assessment_id) on delete cascade,

  constraint materiality_impact_assignment_subtopics_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- RESTRICT, matching materiality_assessment_survey_rounds (20260827): a round that defined an
  -- assessment's scope must not be deletable out from under it. Composite for ownership; MATCH
  -- SIMPLE means a NULL source_round_id satisfies it without a lookup, which is the intended
  -- no-survey case.
  constraint materiality_impact_assignment_subtopics_round_fkey
    foreign key (source_round_id, user_id)
    references public.materiality_survey_rounds (id, user_id) on delete restrict
);

create index if not exists materiality_impact_assignment_subtopics_assessment_idx
  on public.materiality_impact_assignment_subtopics (assessment_id);

comment on table public.materiality_impact_assignment_subtopics is
  'Which sub-topics an assignment covers, snapshotted from the round''s included questions at creation rather than joined live. unique (assessment_id, subtopic_code) is what makes ONE ASSIGNEE PER SUB-TOPIC structural instead of a rule in the assign screen. source_round_id is per row so scope drawn from several linked rounds needs no schema change.';
comment on constraint materiality_impact_assignment_subtopics_one_assignee
  on public.materiality_impact_assignment_subtopics is
  'ONE ASSIGNEE PER SUB-TOPIC. A second assignment covering the same sub-topic in the same assessment fails on insert. The design decision is that there is no expert-vs-expert disagreement and no ownership contest; this is where that decision is actually enforced.';


-- =====================================================================
-- 3. materiality_impact_determinations — the ESRS 1 para 40-41 judgement
-- =====================================================================
create table if not exists public.materiality_impact_determinations (
  assessment_id    uuid        not null,
  user_id          uuid        not null default auth.uid(),

  subtopic_code    text        not null,
  standard_version text        not null,

  -- Two rows per sub-topic, one each way. Never netted (para 44) — see the header.
  direction        text        not null
    check (direction in ('negative', 'positive')),

  -- para 41: actual and potential are assessed differently in BOTH directions. Nullable while draft;
  -- required on submit by determinations_submitted_is_complete below.
  nature           text
    check (nature in ('actual', 'potential')),

  -- ⚠️ 1..4 ON ALL THREE. Spec v9 §5.3: the dimensions MUST carry the same number of points. §5.2's
  -- surviving three-point lists for scope and irremediability are the superseded draft; averaging
  -- across mismatched ranges silently weights the shorter scales heavier and "would have corrupted
  -- every severity figure the engine produced".
  --
  -- NULL is §6.1's "not enough visibility" on a SUBMITTED row, and "untouched" on a draft. That is
  -- the whole reason `status` exists — see the header.
  scale            smallint check (scale           between 1 and 4),
  scope            smallint check (scope           between 1 and 4),
  irremediability  smallint check (irremediability between 1 and 4),
  likelihood       smallint check (likelihood      between 1 and 4),

  -- ⚠️ MULTI-SELECT, and deliberately a different cardinality from
  -- materiality_survey_respondents.value_chain_position. That one is where a PERSON sits; this is
  -- where an IMPACT occurs, and one impact routinely spans own operations and upstream. See the
  -- header before unifying them.
  value_chain_position text[]  not null default '{}'::text[]
    check (value_chain_position <@ array['own_operations', 'upstream', 'downstream']::text[]),

  -- ESRS 1 §6.4 / IFRS S1 entity-defined horizons.
  time_horizon     text
    check (time_horizon in ('short', 'medium', 'long')),

  -- ⚠️ WAS THE SURVEY EVIDENCE IN VIEW WHEN THIS WAS DETERMINED. Constrained below, not trusted.
  evidence_in_view boolean     not null,

  -- NULL means the lead determined this directly. Non-null means a contributor did.
  assignment_id    uuid,

  status           text        not null default 'draft'
    check (status in ('draft', 'submitted')),

  rationale        text,
  determined_at    timestamptz,
  created_at       timestamptz not null default now(),

  constraint materiality_impact_determinations_pkey
    primary key (assessment_id, subtopic_code, direction),

  -- ── ESRS 1 para 41, as constraints ──────────────────────────────────────────────────────────
  -- A positive impact has no irremediability: there is nothing to remediate.
  constraint materiality_impact_determinations_positive_no_irremediability
    check (direction = 'negative' or irremediability is null),

  -- ⚠️ AN ACTUAL IMPACT TAKES NO LIKELIHOOD. It is already occurring; applying likelihood to it
  -- understates severity, and §6.2 names this THE MOST COMMON TECHNICAL ERROR IN A DMA. coalesce,
  -- NOT a bare comparison: a CHECK passes when its expression is NULL, so `nature = 'potential' or
  -- likelihood is null` would let a draft row with nature NULL and likelihood 3 straight through.
  constraint materiality_impact_determinations_actual_takes_no_likelihood
    check (coalesce(nature, '') = 'potential' or likelihood is null),

  -- ── the evidence flag ───────────────────────────────────────────────────────────────────────
  -- A delegated determination cannot claim the survey evidence was in view, because contributors do
  -- not see it. The lead's own may be either.
  constraint materiality_impact_determinations_delegated_saw_no_evidence
    check (assignment_id is null or evidence_in_view = false),

  -- ── submitted means complete ────────────────────────────────────────────────────────────────
  -- On a submitted row a null dimension is a recorded §6.1 abstention, so the row must be far enough
  -- along for that reading to be true: direction is already NOT NULL, and nature and determined_at
  -- are required here.
  constraint materiality_impact_determinations_submitted_is_complete
    check (status = 'draft' or (nature is not null and determined_at is not null)),

  -- ── ownership and references ────────────────────────────────────────────────────────────────
  constraint materiality_impact_determinations_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade,

  constraint materiality_impact_determinations_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- ⚠️ RESTRICT, NOT SET NULL. `on delete set null` would silently promote a delegated determination
  -- to a lead one — and with it flip the meaning of evidence_in_view, whose constraint keys on this
  -- column being null. An assignment that produced determinations must not be deletable. Same
  -- argument as materiality_survey_responses -> questions (20260819).
  constraint materiality_impact_determinations_assignment_fkey
    foreign key (assignment_id, assessment_id)
    references public.materiality_impact_assignments (id, assessment_id) on delete restrict
);

create index if not exists materiality_impact_determinations_assessment_idx
  on public.materiality_impact_determinations (assessment_id);
create index if not exists materiality_impact_determinations_assignment_idx
  on public.materiality_impact_determinations (assignment_id);

comment on table public.materiality_impact_determinations is
  'The preparer''s ESRS 1 para 40-41 severity determination, one row per (assessment, sub-topic, direction). TWO ROWS per sub-topic rather than twin column sets, because para 44 forbids netting positive against negative and two rows that are never summed make that structurally true. NO SEVERITY IS STORED: it is derived from scale/scope/irremediability by the disclosed rule in spec v9 §6.2, so the figure and the method claimed for it cannot disagree — the same argument as applyResolutions() in the GHG engine.';
comment on column public.materiality_impact_determinations.evidence_in_view is
  'Whether the survey evidence was in view when this determination was made. Contributors do not see it; only the lead does. Constrained, not trusted: a delegated row (assignment_id not null) cannot be true. Without this the report would imply an evidence-informed judgement that for delegated sub-topics did not happen, which is the divergence register quietly telling an auditor something false.';
comment on column public.materiality_impact_determinations.status is
  'draft: a null dimension means UNTOUCHED. submitted: a null dimension means ABSTAINED — spec v9 §6.1''s "not enough visibility", a recorded answer and never a zero. One null meaning two different things is the defect 20260837 fixed one layer up in survey_aggregate''s unknown_reason; this column is what stops it recurring here.';
comment on column public.materiality_impact_determinations.value_chain_position is
  'Where the IMPACT occurs (spec v9 §5.2, multi-select) — NOT where a person sits. Deliberately a different cardinality from materiality_survey_respondents.value_chain_position, which is a single value because a supplier contact cannot be upstream and downstream at once. One impact routinely spans own operations and upstream. Do not unify them.';


-- =====================================================================
-- 4. RLS — one FOR ALL policy each, matching the survey tables
-- =====================================================================
-- Row scope AND column scope: USING governs what is visible, WITH CHECK what may be written. A
-- FOR ALL policy without WITH CHECK would read correctly and permit an insert carrying someone
-- else's user_id.
alter table public.materiality_impact_assignments            enable row level security;
alter table public.materiality_impact_assignment_subtopics   enable row level security;
alter table public.materiality_impact_determinations         enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_impact_assignments'
                    and policyname = 'mia_owner_all') then
    create policy mia_owner_all on public.materiality_impact_assignments
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_impact_assignment_subtopics'
                    and policyname = 'mias_owner_all') then
    create policy mias_owner_all on public.materiality_impact_assignment_subtopics
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                  where schemaname = 'public' and tablename = 'materiality_impact_determinations'
                    and policyname = 'mid_owner_all') then
    create policy mid_owner_all on public.materiality_impact_determinations
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;


-- =====================================================================
-- 5. Grants — RLS is not a grant. A policy on a table nobody holds a
--    privilege for does nothing, and the reverse fails silently on the
--    service-role path.
-- =====================================================================
revoke all on public.materiality_impact_assignments          from anon, authenticated, service_role;
revoke all on public.materiality_impact_assignment_subtopics from anon, authenticated, service_role;
revoke all on public.materiality_impact_determinations       from anon, authenticated, service_role;

-- ⚠️ NOTHING IS GRANTED TO anon ANYWHERE IN THIS FILE. Contributors cannot reach these tables at
-- all yet: the token path is a SECURITY DEFINER RPC that does not exist. Adding a grant to anon here
-- "ready for it" would open the tables to unauthenticated reads before the gate is written.
grant select, insert, update on public.materiality_impact_assignments          to authenticated;

-- DELETE is granted on the sub-topic list alone, and only there: the lead builds and edits the
-- assignment's coverage before sending it, which means removing rows. Determinations and
-- assignments are not deletable by authenticated — an evidentiary record and the invitation that
-- produced it are revoked, not erased.
grant select, insert, update, delete
  on public.materiality_impact_assignment_subtopics to authenticated;

-- ⚠️ authenticated HOLDS WRITE HERE, UNLIKE materiality_survey_responses, AND THE DIFFERENCE IS
-- REAL. Survey responses are only ever authored by token holders, so authenticated needs nothing.
-- Determinations have TWO authors: the lead writes their own directly (assignment_id null), and
-- contributors will write theirs through the DEFINER RPC. The lead is authenticated.
--
-- The consequence is the gap named in the header: this grant plus RLS means the lead can currently
-- UPDATE a contributor's SUBMITTED determination, and "the assignee's determination stands" is not
-- yet enforced. The lock is the next migration.
grant select, insert, update on public.materiality_impact_determinations to authenticated;

grant all on public.materiality_impact_assignments          to service_role;
grant all on public.materiality_impact_assignment_subtopics to service_role;
grant all on public.materiality_impact_determinations       to service_role;

commit;


-- =====================================================================
-- VERIFY — run after, separately. Not part of the transaction.
-- =====================================================================
--
--  1) The three tables exist with RLS on:
--     select relname, relrowsecurity from pg_class
--      where relname like 'materiality_impact_%' order by relname;
--     -- expect 3 rows, relrowsecurity = true on all three
--
--  2) One policy each, all with a WITH CHECK:
--     select tablename, policyname, cmd, qual is not null as has_using,
--            with_check is not null as has_with_check
--       from pg_policies where tablename like 'materiality_impact_%' order by tablename;
--     -- expect 3 rows, cmd = ALL, both booleans true
--
--  3) THE ONE-ASSIGNEE RULE EXISTS:
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.materiality_impact_assignment_subtopics'::regclass
--        and contype = 'u';
--     -- expect materiality_impact_assignment_subtopics_one_assignee UNIQUE (assessment_id, subtopic_code)
--
--  4) The para 41 constraints, verbatim:
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.materiality_impact_determinations'::regclass
--        and contype = 'c' and conname like '%irremediability%' or conname like '%likelihood%';
--
--  5) THE COALESCE ACTUALLY BITES. This is the case a bare comparison lets through, and it is the
--     one assertion in this file worth running against real rows. Substitute a real assessment id
--     and sub-topic; expect BOTH to be REJECTED:
--
--       -- draft row, nature not yet chosen, likelihood set: must fail
--       insert into public.materiality_impact_determinations
--         (assessment_id, subtopic_code, standard_version, direction, likelihood, evidence_in_view)
--       values ('<assessment-id>', 'E1.1', 'esrs_2026', 'negative', 3, false);
--
--       -- positive impact carrying irremediability: must fail
--       insert into public.materiality_impact_determinations
--         (assessment_id, subtopic_code, standard_version, direction, irremediability, evidence_in_view)
--       values ('<assessment-id>', 'E1.1', 'esrs_2026', 'positive', 2, false);
--
--  6) A delegated determination cannot claim the evidence was in view — expect REJECTED:
--       insert into public.materiality_impact_determinations
--         (assessment_id, subtopic_code, standard_version, direction, assignment_id, evidence_in_view)
--       values ('<assessment-id>', 'E1.2', 'esrs_2026', 'negative', '<assignment-id>', true);
--
--  7) The category domain is now constrained:
--     select conname, pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.mr_esrs_topics'::regclass and contype = 'c';
--     -- expect mr_esrs_topics_category_check CHECK (category = ANY (ARRAY['env','soc','gov']))
--     select category, count(*) from public.mr_esrs_topics group by category order by category;
--     -- expect env 5, gov 1, soc 4
--
--  8) Grants are as intended, and anon holds NOTHING:
--     select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--       from information_schema.role_table_grants
--      where table_name like 'materiality_impact_%'
--      group by table_name, grantee order by table_name, grantee;
--     -- expect NO anon rows at all
