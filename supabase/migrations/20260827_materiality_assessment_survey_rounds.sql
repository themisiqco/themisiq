-- 20260827_materiality_assessment_survey_rounds.sql
--
-- THE ROUND -> ASSESSMENT LINK. The blocker named in three separate migration headers:
-- survey_reopen (20260821), the divergence register (20260826) and the impact_overrides write-back
-- (20260819).
--
--   materiality_assessments             + unique (id, user_id)   -- FK target only, index-only change
--   materiality_survey_rounds           + unique (id, user_id)   -- same
--   materiality_assessment_survey_rounds  the join table
--   materiality_survey_round_guard()      extended: a LINKED round cannot reopen
--
-- ⚠️ RUN AFTER 20260825_survey_thresholds.sql. This file re-emits materiality_survey_round_guard()
-- whole and therefore CONTAINS 20260825's threshold-immutability arm; running them out of order
-- would silently drop it. Verify step 8 exercises all four arms for exactly that reason.
--
--
-- =====================================================================
-- MANY-TO-ONE, AND THE TABLE IS THE RECORD OF IT
-- =====================================================================
-- Several survey rounds may inform one assessment. The real case is sequential engagement: employees
-- in March, suppliers in June, affected communities in September, assessed in October. That is what
-- LSEG's published methodology describes, and a `survey_round_id` column on materiality_assessments
-- could not express it.
--
-- The table is many-to-many by construction and nothing forbids one round informing two assessments
-- — the same survey legitimately informing an FY2026 and an FY2027 determination. Note the
-- interaction with the reopen rule below: such a round cannot reopen until BOTH links are removed.
--
--
-- =====================================================================
-- ⚠️ CLOSED ROUNDS ONLY — BUT VIEWING IS NOT CONSUMING
-- =====================================================================
-- An assessment may consume a round only when the round's status is 'closed'. Everything in this
-- module freezes its inputs at write — disclosure requirements resolved at write, topic labels
-- snapshotted into the question set, GHG factor editions frozen into workings — and an assessment
-- reading a moving survey is the one place that discipline would break. A report saying "9 of 12" on
-- Tuesday and "9 of 19" on Thursday cannot say which it was, and both were true when printed.
--
-- ⚠️ WHAT IS REFUSED IS THE LINK, NOT THE READ. survey_aggregate keeps working on an open round,
-- unchanged, and nothing in this file touches it. A customer watching responses arrive on a live
-- round is doing something legitimate and useful, and the aggregate is how they do it. DO NOT ADD A
-- STATUS CHECK TO survey_aggregate — the freeze belongs at the moment of consumption, which is this
-- table, and putting it on the read would remove a feature to enforce a rule the read does not break.
--
--
-- =====================================================================
-- ⚠️ THREE RULES, AND ONLY ONE OF THEM CAN BE A FOREIGN KEY
-- =====================================================================
-- OWNERSHIP — COMPOSITE FK, structural. A denormalised user_id with `with check (user_id =
-- auth.uid())` does NOT make this owner-scoped on both sides: it would permit a row carrying my
-- user_id and pointing at your round, because RLS never looks at the parents. So both parents gain
-- `unique (id, user_id)` and the join foreign-keys on the PAIR. Cross-owner linkage becomes
-- impossible rather than checked. Same device as cbam_verifier_access against
-- cbam_installations' UNIQUE(id, company_id), and as materiality_survey_questions against
-- materiality_survey_rounds' UNIQUE(id, standard_version).
--
--   The alternative was to check ownership in the trigger, and its own cost is the argument against
--   it: ALTER TABLE ... DISABLE TRIGGER is already documented in 20260821 as a procedure someone
--   will reach for, and trigger-only enforcement means all three rules below switch off in one
--   statement. Cross-owner linkage should be impossible, not checked.
--
-- ROUND STATUS = 'closed' — TRIGGER, necessarily. A CHECK constraint cannot see another table.
--
-- ⚠️ SAME standard_version — TRIGGER, AND IT CANNOT BE AN FK. THE REASON IS THE NULL.
-- A composite FK on (assessment_id, standard_version) would be MATCH SIMPLE, the default, so a NULL
-- standard_version on the assessment SATISFIES THE CONSTRAINT WITHOUT A LOOKUP. The not-stated
-- assessment would silently match every round — the exact opposite of what is wanted, arrived at by
-- the constraint working as designed. (This is the same MATCH SIMPLE behaviour that 20260819 relies
-- on deliberately, one table over, so that an entity-specific question with a NULL subtopic_code
-- satisfies its FK. Correct there, catastrophic here.)
--
-- So the trigger tests for NULL explicitly and refuses NAMING THE REASON. 20260816 is emphatic that
-- materiality_assessments.standard_version NULL means NOT STATED — a real, honest, permitted state,
-- never an assumed version, because an assumed one is a false statement about which law was applied.
-- A not-stated assessment therefore matches no round, and that must be a refusal that says so rather
-- than an empty result: the customer needs to know they have to state the version, not that their
-- survey "did not appear".
--
--
-- =====================================================================
-- ⚠️ REOPENING A LINKED ROUND IS REFUSED — AND UNLINKING IS THE DELIBERATE ACT THAT PERMITS IT
-- =====================================================================
-- Nothing currently refuses a backwards status transition on a ROUND. 20260821 locked the RESPONDENT
-- out of 'completed'; the round's own draft/open/closed lifecycle was unguarded. So without this:
-- link at closed, flip to open, more responses arrive, and the assessment's evidence base moves
-- under it with nothing going red. The same defect as the unaudited survey reopen, one level up.
--
-- materiality_survey_round_guard() is therefore extended a third time. An UNLINKED round keeps its
-- normal lifecycle — draft, open, closed, and back again if the customer wants. A LINKED round
-- cannot leave 'closed'.
--
-- Unlinking (deleting the join row) is what permits reopening, and that is the right shape: it is
-- explicit, and it correctly leaves the assessment no longer citing the round.
--
-- ⚠️ RECORDED, NOT BUILT: once report GENERATION exists, unlinking a round that an issued report
-- cites is the same problem as reopening a submitted survey — the document in the customer's hands
-- names evidence the database no longer connects to it, and nothing anywhere says so. DELETE on the
-- join is granted for now because a linkage is not evidence and a mistaken link must be correctable.
-- The day a report can be issued, this needs revisiting alongside survey_reopen's audit record
-- (20260821 requirement 2), and probably by the same mechanism.
--
--
-- =====================================================================
-- ⚠️ CROSS-ROUND AGGREGATION IS DEFERRED, AND THIS IS WHY — NOT AN OVERSIGHT
-- =====================================================================
-- This file makes many-to-one possible. It does NOT make survey_aggregate read more than one round,
-- and that is a decision with a reason a future reader needs, because "sum the counters" looks like
-- an afternoon's work.
--
-- The tractable costs are real: merge on subtopic_code rather than question_id, because each round
-- froze its own question set with its own ids; take the STRICTEST anonymity_floor where rounds
-- disagree, and state it; account for a sub-topic included in June and deselected in March, so the
-- report can say "asked in 2 of 3 rounds". And the S1/S2 contrast may draw its S1 side from March
-- and its S2 side from June — legitimate, since that is the sequential-engagement case this table
-- exists for, but each side must then carry its round and its field dates or the contrast asserts a
-- simultaneity that never happened.
--
-- ⚠️ THE DECISIVE ONE IS DIFFERENT: PER-ROUND AND MERGED VIEWS ARE JOINTLY DISCLOSIVE.
-- A customer can call survey_aggregate on each round AND on the merged view. Then, cell by cell:
--
--         merged − roundA − roundB = roundC
--
-- A cell suppressed in round C's own view is recoverable by differencing the other three, and a cell
-- suppressed in the merged view is recoverable from the three per-round views. Complementary
-- suppression as built (20260826) operates WITHIN a dimension of one round; this needs it to operate
-- across the round dimension as well, which is a new suppression design and not an extension of the
-- existing one. Getting that wrong is invisible — it produces a payload that looks correctly
-- suppressed and is not.
--
-- So the merge is its own task, with its own decisions. It is deferred, not forgotten.
--
--
-- =====================================================================
-- ⚠️ TWO THINGS ABOUT materiality_assessments THAT ARE NOT MINE TO FIX, RECORDED HERE
-- =====================================================================
-- Found while confirming that table's live shape. Neither is changed by this file; both belong in
-- the record, and the second one is why the link trigger below is SECURITY DEFINER.
--
-- (1) organization_id IS A LIVE FK THAT NOTHING WRITES AND NO POLICY READS.
--     materiality_assessments.organization_id is uuid, nullable, indexed (idx_matassess_org), with a
--     real foreign key to organizations(id) ON DELETE CASCADE. No application code sets it — grep
--     over app/ and lib/ returns nothing — and none of the four RLS policies mentions it; all four
--     are user_id = auth.uid(). It is dormant, in the same way mr_jurisdictions.active is dormant
--     (CLAUDE.md), and for the same reason it is dangerous: it looks load-bearing.
--
--     THE SURVEY TABLES HAVE NO EQUIVALENT. materiality_survey_rounds is user_id only. So THIS JOIN
--     TABLE IS ONE OF THE PLACES TO REVISIT IF ORG-SCOPING IS EVER SWITCHED ON — it is where two
--     ownership models would meet, and it currently commits to user_id because that is the axis both
--     parents actually enforce. Turning organizations on means deciding whether a round belongs to a
--     user or an org before this table can be made consistent, and the composite FKs below would
--     have to move with it.
--
-- (2) TWO GRANT ANOMALIES ON materiality_assessments, both pre-existing.
--     * authenticated holds SELECT, INSERT, REFERENCES, TRIGGER, MAINTAIN, UPDATE — and NOT DELETE,
--       while the policy matassess_delete exists and is FOR DELETE TO authenticated. A policy
--       guarding a privilege nobody holds; it can never fire.
--     * service_role holds REFERENCES, TRIGGER, TRUNCATE, MAINTAIN — and NOT SELECT, INSERT, UPDATE
--       or DELETE. It can truncate the table but cannot read it. Exactly the residue
--       20260815_mr_esrs_subtopics.sql's deviation (4) documents for the mr_* parents.
--
--     ⚠️ THE SECOND ONE HAS A CONSEQUENCE FOR ANYTHING BUILT NEXT: a server-side path using the
--     service key CANNOT READ materiality_assessments today. A divergence computation written as an
--     API route would fail at its first step with a permission error, which is precisely how
--     20260724_cbam_verifier_rpc_service_role_grants.sql came to exist. It is also why the link
--     trigger below is SECURITY DEFINER rather than INVOKER: it must read both parents to validate
--     them, and under INVOKER a service-role insert would fail on the grant rather than on the rule.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260825. Re-runnable — guarded
-- ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS, guarded CREATE POLICY, drop-then-create trigger,
-- CREATE OR REPLACE on both functions. No client change ships with it and none is needed; nothing in
-- app/ or lib/ reads this table yet.

begin;

-- =====================================================================
-- FK targets. Index-only additions: no column, no data, no behaviour change.
-- =====================================================================
-- ADD CONSTRAINT has no IF NOT EXISTS form, hence the guards. Both `id` columns are already primary
-- keys and both `user_id` columns are NOT NULL, so neither constraint can fail on existing data and
-- neither can be satisfied by a NULL.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.materiality_assessments'::regclass
       and conname  = 'materiality_assessments_id_user_key'
  ) then
    alter table public.materiality_assessments
      add constraint materiality_assessments_id_user_key unique (id, user_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.materiality_survey_rounds'::regclass
       and conname  = 'materiality_survey_rounds_id_user_key'
  ) then
    alter table public.materiality_survey_rounds
      add constraint materiality_survey_rounds_id_user_key unique (id, user_id);
  end if;
end $$;

comment on constraint materiality_assessments_id_user_key on public.materiality_assessments is
  'FK target for materiality_assessment_survey_rounds, and nothing else. It exists so that a link row cannot point at an assessment owned by a different user — ownership becomes a database fact rather than a rule a trigger is trusted to check, and a trigger can be disabled in one statement. id is already the primary key, so this adds an index and changes no behaviour.';

comment on constraint materiality_survey_rounds_id_user_key on public.materiality_survey_rounds is
  'FK target for materiality_assessment_survey_rounds. The round-side half of the same argument as materiality_assessments_id_user_key: both parents of a link must be owned by the linker, and a composite FK makes that structural. Distinct from materiality_survey_rounds_id_version_key, which is the FK target for the question set.';

-- =====================================================================
-- The join table
-- =====================================================================
create table if not exists public.materiality_assessment_survey_rounds (
  assessment_id uuid        not null,
  round_id      uuid        not null,

  -- Denormalised so RLS is a plain column comparison rather than two subqueries on every row — the
  -- choice 20260819 made for materiality_survey_questions. On its own it would NOT scope the link to
  -- the owner of either parent; the composite foreign keys below are what do that.
  user_id       uuid        not null default auth.uid(),

  linked_at     timestamptz not null default now(),

  constraint materiality_assessment_survey_rounds_pkey
    primary key (assessment_id, round_id),

  -- ⚠️ COMPOSITE ON (id, user_id), NOT ON id ALONE. A single-column FK would permit a row carrying
  -- my user_id and pointing at your assessment. Do not "simplify" either of these to reference the
  -- primary key — the second column IS the ownership check.
  constraint materiality_assessment_survey_rounds_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade,

  -- RESTRICT, not CASCADE. A round that informed an assessment must not be deletable out from under
  -- it — the same argument as materiality_survey_responses -> questions (20260819), one level up: an
  -- assessment whose cited evidence has silently vanished is worse than a delete that fails.
  -- authenticated holds no DELETE on materiality_survey_rounds anyway, so in practice this is a
  -- backstop against the SQL editor, which is exactly where it would otherwise happen.
  constraint materiality_assessment_survey_rounds_round_fkey
    foreign key (round_id, user_id)
    references public.materiality_survey_rounds (id, user_id) on delete restrict
);

-- The PK covers lookups by assessment. The reverse direction — "is this round linked to anything?" —
-- is what the reopen guard and survey_reopen's refuse-if-consumed check both ask, on every round
-- status change.
create index if not exists materiality_assessment_survey_rounds_round_idx
  on public.materiality_assessment_survey_rounds (round_id);

comment on table public.materiality_assessment_survey_rounds is
  'Which stakeholder survey rounds informed which materiality assessment. MANY-TO-ONE by design — employees in March, suppliers in June, communities in September, assessed in October — and many-to-many by construction, since one round may legitimately inform two assessments. A round may be linked only while its status is ''closed'' (the link is the moment of consumption, and an assessment reading a moving survey is where this module''s freeze-at-write discipline would break), and only when its standard_version matches the assessment''s. Ownership is enforced by composite foreign keys on (id, user_id) against BOTH parents, not by the trigger and not by RLS alone.';

comment on column public.materiality_assessment_survey_rounds.user_id is
  'The owner of BOTH parents, enforced by the two composite foreign keys rather than asserted. Also the RLS predicate. ⚠️ materiality_assessments additionally carries a dormant organization_id — a live FK that nothing writes and no policy reads — and the survey tables have no equivalent; if org-scoping is ever switched on, this column is one of the places two ownership models would meet. See the migration header.';

-- =====================================================================
-- Grants and RLS
-- =====================================================================
revoke all on public.materiality_assessment_survey_rounds from anon, authenticated, service_role;

-- SELECT, INSERT and DELETE. ⚠️ NO UPDATE, deliberately: a link is either there or it is not, and
-- re-pointing assessment_id or round_id in place is a delete plus an insert wearing one statement.
-- The trigger below fires on UPDATE too, so this is belt and braces rather than the only guard.
grant select, insert, delete on public.materiality_assessment_survey_rounds to authenticated;
grant all on public.materiality_assessment_survey_rounds to service_role;

alter table public.materiality_assessment_survey_rounds enable row level security;

-- One FOR ALL policy, matching the survey tables rather than materiality_assessments' four
-- per-command ones. Both express the same predicate; this table sits on the survey side of the join
-- and follows its neighbours. `to authenticated` is named explicitly — a policy with no `to` clause
-- defaults to public, which is the root cause 20260807_supplier_portal_policy_cleanup.sql exists to
-- fix.
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename  = 'materiality_assessment_survey_rounds'
       and policyname = 'materiality_assessment_survey_rounds_owner'
  ) then
    create policy materiality_assessment_survey_rounds_owner
      on public.materiality_assessment_survey_rounds
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- =====================================================================
-- The link guard — the two rules a foreign key cannot carry
-- =====================================================================
-- SECURITY DEFINER, and not for convenience. It must read both parents to validate them, and
-- materiality_assessments grants service_role no SELECT (see the header): under SECURITY INVOKER a
-- link created from a server-side path would fail with a permission error instead of a validation
-- one, which is the least useful failure available — it names the wrong problem. The definer buys
-- the CALLER nothing, because ownership is settled by the composite foreign keys and not here.
create or replace function public.materiality_assessment_survey_round_link_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round_status   text;
  v_round_version  text;
  v_assess_version text;
  v_assess_exists  boolean;
begin
  select r.status, r.standard_version
    into v_round_status, v_round_version
    from public.materiality_survey_rounds r
   where r.id = new.round_id;

  if v_round_status is null then
    -- The composite FK will refuse this a moment later; raising here keeps the message useful.
    raise exception
      'Survey round % does not exist, or is not owned by the same user as the assessment.',
      new.round_id;
  end if;

  -- ── RULE 1: closed rounds only. ──────────────────────────────────────────────
  if v_round_status <> 'closed' then
    raise exception
      'Survey round % has status ''%'' and cannot inform an assessment until it is closed. An '
      'assessment must consume a frozen survey: a report saying "9 of 12" on Tuesday and "9 of 19" '
      'on Thursday cannot say which it was, and both were true when printed. Viewing is not '
      'consuming — survey_aggregate keeps working on an open round, and watching responses arrive '
      'is what it is for.',
      new.round_id, v_round_status;
  end if;

  select true, a.standard_version
    into v_assess_exists, v_assess_version
    from public.materiality_assessments a
   where a.id = new.assessment_id;

  if v_assess_exists is null then
    raise exception
      'Materiality assessment % does not exist, or is not owned by the same user as the round.',
      new.assessment_id;
  end if;

  -- ── RULE 2: same standard_version, and NULL is its own refusal. ──────────────
  -- ⚠️ NULL MEANS NOT STATED (20260816), which is a real and permitted state and never an assumed
  -- version. It matches no round, and the customer has to be TOLD that rather than shown an empty
  -- result — the fix is theirs to make and they cannot make it if the failure is silent.
  if v_assess_version is null then
    raise exception
      'Assessment % does not state which ESRS version it was prepared under, so no survey round can '
      'inform it. NULL here means NOT STATED — a real state, never an assumed version, because '
      'Article 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state it and an assumed '
      'value would be a false statement about which law was applied. State the version on the '
      'assessment first; this round is built against %.',
      new.assessment_id, v_round_version;
  end if;

  if v_assess_version <> v_round_version then
    raise exception
      'Standard version mismatch: assessment % is prepared under %, survey round % is built against '
      '%. The taxonomies differ in name, in count and in structure, so the round''s answers are '
      'keyed to sub-topic codes that do not exist in the assessment''s taxonomy. This is a data '
      'error, not a presentation one (spec v9 §3.3).',
      new.assessment_id, v_assess_version, new.round_id, v_round_version;
  end if;

  return new;
end $$;

comment on function public.materiality_assessment_survey_round_link_guard() is
  'Enforces the two rules a foreign key cannot carry: a round may be linked only while its status is ''closed'', and only when its standard_version equals the assessment''s. The version check CANNOT be an FK — a composite FK would be MATCH SIMPLE, so a NULL standard_version on the assessment would satisfy it without a lookup and a not-stated assessment would silently match every round. Ownership is NOT checked here; it is settled by composite foreign keys on (id, user_id) against both parents. SECURITY DEFINER because materiality_assessments grants service_role no SELECT, so an invoker version would fail a server-side link on the grant rather than on the rule.';

drop trigger if exists materiality_assessment_survey_rounds_link_guard
  on public.materiality_assessment_survey_rounds;
create trigger materiality_assessment_survey_rounds_link_guard
  before insert or update on public.materiality_assessment_survey_rounds
  for each row execute function public.materiality_assessment_survey_round_link_guard();

-- =====================================================================
-- A LINKED round cannot reopen
-- =====================================================================
-- Re-emits materiality_survey_round_guard() with a FOURTH arm. The three existing arms —
-- standard_version fixed at creation (20260819), questionnaire_version cannot go backwards
-- (20260819), and the disclosed constants frozen from the first response (20260825) — are
-- byte-identical. ⚠️ If this file is ever run BEFORE 20260825, the threshold arm is lost.
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

  -- ── ADDED 20260825. The disclosed constants are a SNAPSHOT, and a snapshot that can be edited is
  -- just a copy. Frozen from the moment the first response arrives — the same moment the question
  -- set stops being editable, and for the same reason: once evidence exists, the basis on which it
  -- is read is fixed. Before that, adjusting them is legitimate and permitted.
  if old.frozen_at is not null then
    if new.anonymity_floor            is distinct from old.anonymity_floor
    or new.polarised_extreme_min_n    is distinct from old.polarised_extreme_min_n
    or new.polarised_middle_max_share is distinct from old.polarised_middle_max_share
    or new.top_box_gap_margin         is distinct from old.top_box_gap_margin then
      raise exception
        'The disclosed constants for this round are fixed from the first response (frozen_at = %). '
        'The aggregation is computed live and nothing is stored, so changing a threshold now would '
        'silently add or remove entries from a register that has already been read — and would '
        'leave the assumptions register citing a value that was not the one applied (spec v9 '
        '§6.2.6, §10). Create a new round to assess the same questions on a different basis.',
        old.frozen_at;
    end if;
  end if;

  -- ── ADDED 20260827. A round that has informed an assessment cannot reopen. An UNLINKED round
  -- keeps its normal draft/open/closed lifecycle, including going back — that is a customer running
  -- their own engagement. A LINKED one is being cited as evidence, and letting it collect further
  -- responses would move the evidence base under a determination already made from it.
  --
  -- Unlinking is the deliberate act that permits reopening, and it correctly leaves the assessment
  -- no longer citing the round. A round linked to TWO assessments needs both links removed.
  if old.status = 'closed' and new.status is distinct from 'closed' then
    if exists (select 1 from public.materiality_assessment_survey_rounds l
                where l.round_id = old.id) then
      raise exception
        'Survey round % has informed % materiality assessment(s) and cannot leave ''closed'' (% -> '
        '%). Reopening it would let further responses change the evidence base of a determination '
        'that has already been made from it, with nothing anywhere recording that the figures '
        'moved. Unlink it from the assessment(s) first — that is the deliberate act that permits '
        'this, and it correctly leaves them no longer citing this round.',
        old.id,
        (select count(*) from public.materiality_assessment_survey_rounds l where l.round_id = old.id),
        old.status, new.status;
    end if;
  end if;

  return new;
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- ⚠️ Savepoints around anything expecting an ERROR; an error aborts the transaction and without them
-- every later check reports "current transaction is aborted". user_id supplied explicitly because
-- auth.uid() is NULL in the SQL editor — and note that matters more here than usual: the composite
-- FKs mean the round and the assessment must carry the SAME user_id or the link is refused.
--
-- Setup:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds (user_id, name, standard_version, status)
--      values (:'u_id', 'link test — open', 'esrs_2026', 'open') returning id \gset open_
--      insert into public.materiality_survey_rounds (user_id, name, standard_version, status)
--      values (:'u_id', 'link test — closed', 'esrs_2026', 'closed') returning id \gset closed_
--      insert into public.materiality_assessments (user_id, standard_version, company_name)
--      values (:'u_id', 'esrs_2026', 'Link Co') returning id \gset a26_
--      insert into public.materiality_assessments (user_id, company_name)
--      values (:'u_id', 'Not Stated Co') returning id \gset anull_
--
-- 1) The happy path — a closed round, matching version, same owner:
--    insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--    values (:'a26_id', :'closed_id', :'u_id');                            -- expect SUCCESS
--    select assessment_id, round_id, linked_at is not null
--      from public.materiality_assessment_survey_rounds;                   -- expect 1 row
--
-- 2) ⚠️ CLOSED ONLY — the rule a CHECK could not carry:
--    savepoint v2;
--      insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--      values (:'a26_id', :'open_id', :'u_id');
--      -- expect ERROR: Survey round ... has status 'open' and cannot inform an assessment ...
--    rollback to savepoint v2;
--
-- 3) ⚠️ VIEWING IS NOT CONSUMING — the check that this file did not break the live view. Against the
--    OPEN round, from the app (survey_aggregate reads auth.uid(), so it returns nothing as postgres):
--    --   select public.survey_aggregate('<open round id>');
--    --   expect a full aggregate, exactly as before this migration. If it now refuses, a status
--    --   check has been added to the read path and must be removed: the freeze belongs at the
--    --   moment of consumption, not at the moment of looking.
--
-- 4) ⚠️ NOT STATED IS A REFUSAL THAT NAMES ITSELF, not an empty result:
--    savepoint v4;
--      insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--      values (:'anull_id', :'closed_id', :'u_id');
--      -- expect ERROR: Assessment ... does not state which ESRS version it was prepared under ...
--    rollback to savepoint v4;
--
--    -- And the mismatch case. It cannot be exercised while materiality_survey_rounds' CHECK admits
--    -- only esrs_2026, so it is provoked from the assessment side:
--    savepoint v4;
--      insert into public.materiality_assessments (user_id, standard_version, company_name)
--      values (:'u_id', 'esrs_2023', 'Old Standard Co') returning id \gset a23_
--      insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--      values (:'a23_id', :'closed_id', :'u_id');
--      -- expect ERROR: Standard version mismatch: assessment ... is prepared under esrs_2023 ...
--    rollback to savepoint v4;
--
-- 5) ⚠️ CROSS-OWNER LINKAGE IS IMPOSSIBLE, NOT CHECKED. This is the composite FK, and it is the one
--    to run if you change nothing else. Two different users' rows cannot meet in this table:
--    savepoint v5;
--      select id from auth.users order by created_at offset 1 limit 1 \gset u2_
--      -- someone else's assessment, my round, my user_id:
--      insert into public.materiality_assessments (user_id, standard_version, company_name)
--      values (:'u2_id', 'esrs_2026', 'Other Owner Co') returning id \gset other_
--      insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--      values (:'other_id', :'closed_id', :'u_id');
--      -- expect ERROR: violates foreign key constraint
--      --               "materiality_assessment_survey_rounds_assessment_fkey"
--      -- ⚠️ A FOREIGN KEY error, NOT a trigger message. If this raises the guard's "does not exist"
--      -- text instead, the composite FK is missing and ownership has quietly become
--      -- trigger-enforced — which is the thing this design rejected.
--    rollback to savepoint v5;
--
--    -- and the constraints really are composite:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.materiality_assessment_survey_rounds'::regclass and contype = 'f';
--    -- expect BOTH definitions to read FOREIGN KEY (…, user_id) REFERENCES …(id, user_id)
--
-- 6) ⚠️ A LINKED ROUND CANNOT REOPEN, AND AN UNLINKED ONE CAN. Both halves:
--    savepoint v6;
--      update public.materiality_survey_rounds set status = 'open' where id = :'closed_id';
--      -- expect ERROR: Survey round ... has informed 1 materiality assessment(s) ...
--    rollback to savepoint v6;
--    -- unlink, then it reopens freely:
--    delete from public.materiality_assessment_survey_rounds
--     where assessment_id = :'a26_id' and round_id = :'closed_id';
--    update public.materiality_survey_rounds set status = 'open' where id = :'closed_id';
--    -- expect SUCCESS
--    update public.materiality_survey_rounds set status = 'closed' where id = :'closed_id';
--
-- 7) A round that informed an assessment cannot be deleted out from under it:
--    insert into public.materiality_assessment_survey_rounds (assessment_id, round_id, user_id)
--    values (:'a26_id', :'closed_id', :'u_id');
--    savepoint v7;
--      delete from public.materiality_survey_rounds where id = :'closed_id';
--      -- expect ERROR: violates foreign key constraint
--      --               "materiality_assessment_survey_rounds_round_fkey"
--    rollback to savepoint v7;
--
-- 8) ⚠️ ALL FOUR ARMS OF THE ROUND GUARD — the run-order check. If the THIRD one does not fire,
--    this file was applied before 20260825 and the threshold freeze has been silently dropped:
--    savepoint v8;
--      update public.materiality_survey_rounds set standard_version = 'esrs_2026'
--       where id = :'open_id';                                    -- expect SUCCESS (no-op)
--      update public.materiality_survey_rounds set questionnaire_version = 0 where id = :'open_id';
--      -- arm 2: ERROR questionnaire_version cannot go backwards
--    rollback to savepoint v8;
--    savepoint v8;
--      update public.materiality_survey_rounds set frozen_at = now() where id = :'open_id';
--      update public.materiality_survey_rounds set anonymity_floor = 9 where id = :'open_id';
--      -- arm 3: ERROR The disclosed constants for this round are fixed from the first response
--    rollback to savepoint v8;
--    -- arm 4 is check 6 above.
--
--    rollback;   -- ends the setup transaction; nothing above survives
--
-- 9) Grants and RLS on the join table:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'materiality_assessment_survey_rounds'
--     group by grantee order by grantee;
--    -- expect authenticated: DELETE, INSERT, SELECT   (⚠️ no UPDATE)   and service_role: ALL
--    -- expect NO ROW for anon
--    select policyname, roles, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'materiality_assessment_survey_rounds';
--    -- expect materiality_assessment_survey_rounds_owner | {authenticated} | ALL
--    select relrowsecurity from pg_class
--     where oid = 'public.materiality_assessment_survey_rounds'::regclass;      -- expect t
--
-- 10) The two FK targets exist and nothing else on materiality_assessments moved:
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.materiality_assessments'::regclass and contype = 'u';
--    -- expect exactly materiality_assessments_id_user_key UNIQUE (id, user_id)
--    select count(*) from pg_trigger
--     where tgrelid = 'public.materiality_assessments'::regclass and not tgisinternal;
--    -- expect 0 — this file adds no trigger to that table
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'materiality_assessments'
--     group by grantee order by grantee;
--    -- expect UNCHANGED, including the two anomalies recorded in the header: authenticated with no
--    -- DELETE, and service_role with no SELECT. This file fixes neither.
