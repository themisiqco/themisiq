-- 20260839_materiality_impact_override_and_lock.sql
--
-- Closes the gap 20260838's header named: "the assignee's determination stands" was a decision with
-- no enforcement, and the lead held UPDATE on a submitted delegated row. This adds the lock, the
-- audited override path that makes the lock survivable, and the reassignment operation.
--
-- ⚠️ RUN AFTER 20260838.
--
--
-- =====================================================================
-- 1. THE LEAD MAY OVERRIDE, AND BOTH VALUES SURVIVE
-- =====================================================================
-- The rejected design was "the lead cannot change it". It sounds principled and it fails in the
-- room: a lead who finds an error the afternoon before a board meeting and cannot correct it will
-- ask the contributor for their token and edit it as them. That produces an unaudited change wearing
-- the expert's name, which is strictly worse than an audited override wearing the lead's.
--
-- So a submitted delegated determination CAN be superseded, and the assignee's values are kept.
--
-- ⚠️ A REASON IS REQUIRED ON OVERRIDE, AND ONLY ON OVERRIDE. Accepting the expert's judgement costs
-- nothing; departing from it costs a written defence that appears in the report. That asymmetry is
-- the anti-manipulation mechanism, one layer below the divergence register, and it is deliberately
-- the same shape as materiality_survey_questions_exclusion_reason_required (20260819): including a
-- topic is free, excluding one is not.
--
--
-- =====================================================================
-- ⚠️ WHERE THE SUPERSEDED VALUE LIVES: A COMPANION TABLE, NOT COLUMNS, AND NOT A HISTORY LOG
-- =====================================================================
-- materiality_impact_assignee_determinations shares the parent's primary key exactly. At most one
-- row per determination. Three reasons, and the first is the one that decided it:
--
--   1. WHAT IS BEING PRESERVED IS AN AUTHORITY, NOT A PREVIOUS VALUE. The report's claim is "the
--      assignee determined X, the lead changed it to Y, because Z" — a contrast between two people,
--      the same shape as the divergence register's stakeholder-versus-preparer.
--
--      Columns named superseded_scale / superseded_scope would mean "the value before the last
--      edit", and a lead who overrides TWICE would overwrite the assignee's figures with their own
--      first attempt. The expert's determination — the only one that matters evidentially — would
--      be gone after two clicks, and the column name would still say it was there. Sharing the
--      parent's PK makes written-once STRUCTURAL: the second override finds the row already present
--      and leaves it alone. No trigger discipline required, no naming convention to remember.
--
--      A history table has the mirror-image defect: it keeps everything, so finding the assignee's
--      determination means filtering a log by who wrote each entry — a derivation, in exactly the
--      place a derivation must not drift.
--
--   2. THE ROW'S EXISTENCE IS THE DISCRIMINATOR. With columns, `superseded_scale is null` would mean
--      either "not overridden" or "the assignee abstained on scale (§6.1)" — a null meaning two
--      things, which is the defect 20260837 fixed in survey_aggregate and 20260838's draft/submitted
--      column was added to prevent. Here there is no ambiguity: if the row exists it was overridden,
--      and every null inside it is an abstention.
--
--   3. The 74 determination rows per assessment (37 sub-topics x 2 directions) stay narrow. Only
--      overridden ones acquire a companion.
--
-- override_reason and overridden_at stay on the PARENT, not on the companion, for a practical
-- reason worth recording: the reason has to arrive on the UPDATE statement for the lock to be able
-- to demand it. A reason that lived only on the companion could not be supplied by the write it is
-- meant to gate.
--
-- ⚠️ THE COMPANION REPEATS NO CHECK CONSTRAINTS, DELIBERATELY. It is a copy of a row the parent
-- already validated against ¶41. Restating no-irremediability-on-positive here would be a second
-- copy of the rule, free to drift from the first. Instead authenticated holds SELECT and nothing
-- else, and the lock trigger — SECURITY DEFINER — is the only writer.
--
--
-- =====================================================================
-- 2. REVOKING AN ASSIGNMENT DOES NOT DELETE ITS DETERMINATIONS
-- =====================================================================
-- The judgement was made. Withdrawing access does not unmake it, and an evidence record that
-- vanishes because someone tidied up a token is the failure materiality_survey_responses -> questions
-- ON DELETE RESTRICT already exists to prevent, one level up.
--
-- NO SCHEMA CHANGE IS NEEDED FOR THIS — 20260838 already made it true. determinations -> assignments
-- is ON DELETE RESTRICT, and revoking sets status and revoked_at rather than deleting. What was
-- missing is that the resulting state had no stated meaning, so it would have been discovered rather
-- than designed. It is stated here because the UI is not built yet and this is the contract it must
-- meet:
--
--   ⚠️ HOW A REVOKED ASSIGNMENT WITH DETERMINATIONS RENDERS.
--   The assignment appears in the contributor list with its revoked state and date, NOT hidden and
--   NOT greyed to the point of looking deleted. Its determinations render normally — they are as
--   valid as any other — and the attribution line gains one clause:
--
--       "determined by the holder of the assignment sent to [name, email],
--        whose access was withdrawn on [date]"
--
--   ACCESS WAS WITHDRAWN. NOT the determination. The distinction is the whole point: a reader who
--   sees "revoked" beside a figure will otherwise assume the figure was retracted. Nothing in this
--   product may let a withdrawn invitation read as a withdrawn judgement, for the same reason
--   20260826 refuses to let an unopened invitation read as a finding about the company.
--
--   The determination count is shown ON the revoked assignment, so revoking is never a way to
--   quietly detach evidence from its author.
--
--
-- =====================================================================
-- 3. REASSIGNMENT — AND WHAT HAPPENS TO A DRAFT
-- =====================================================================
-- unique (assessment_id, subtopic_code) makes reassignment a real operation rather than the addition
-- of a second assignee: the row is UPDATED to point at the new assignment. A submitted determination
-- stays attributed to the original contributor; unstarted sub-topics move.
--
-- ⚠️ THE OPEN CASE WAS: A SUB-TOPIC THE ORIGINAL CONTRIBUTOR STARTED BUT DID NOT SUBMIT.
-- It moves, AND THE DRAFT IS CLEARED. Not carried across. The reasoning, because this destroys
-- entered data and that is never a free choice:
--
--   Carrying the draft forward means the new contributor opens a form already holding scores they
--   did not make, with nothing on screen saying whose they are. The likely outcome is that they
--   submit them — and at that moment the audit trail records "determined by the holder of assignment
--   B" about figures typed by the holder of assignment A. THAT IS A FALSE ATTRIBUTION, AND IT IS
--   INVISIBLE: no column, no count and no report line could detect it afterwards, because the row
--   looks exactly like an honest one.
--
--   This product's recurring failure mode is a record that names the wrong author — an invitation
--   reported as a person, an unopened invite reported as a finding, a delegated determination
--   implying evidence was in view. Carrying a draft across an assignment boundary is the same
--   failure, and it would be the hardest of them to find.
--
--   Losing an unfinished draft is the recoverable side of the trade: the lead OWNS these rows and
--   can read the draft before reassigning, so the work is available to the organisation even after
--   it leaves the form. A wrongly attributed submitted determination is not recoverable, because
--   nobody knows to look for it.
--
--   And a draft is, by this schema's own definition, not a determination: 20260838's `status` column
--   exists precisely to say that a null on a draft row is an empty box rather than a §6.1
--   abstention. There is no evidential object here to preserve.
--
--   ⚠️ THE UI MUST ANNOUNCE IT BEFORE IT HAPPENS, naming how many sub-topics carry draft values.
--   materiality_impact_reassign_subtopic returns the count it cleared so the confirmation can state
--   a number rather than a warning.
--
-- ⚠️ AND A SUB-TOPIC WITH ONE DIRECTION SUBMITTED AND THE OTHER DRAFT DOES NOT MOVE AT ALL.
-- The sub-topic is the unit of assignment — the unique is on subtopic_code, not on
-- (subtopic_code, direction) — so splitting the two directions between two contributors would create
-- two assignees for one sub-topic in everything but name. Any submitted determination anchors the
-- whole sub-topic to its original contributor.
--
--
-- =====================================================================
-- ⚠️ THE LOCK'S THREE BYPASSES, ALL CLOSED
-- =====================================================================
-- A lock that only guards the dimension columns is one UPDATE away from useless. All three routes
-- around it are refused explicitly:
--
--   UN-SUBMITTING     set status = 'draft', then edit freely. Refused: a submitted delegated
--                     determination cannot return to draft.
--   RE-ATTRIBUTING    set assignment_id = null, so the row looks like the lead's own work and the
--                     lock stops applying. Refused: assignment_id is frozen once submitted.
--   BACKDATING        set overridden_at by hand. The trigger assigns it from now() and restores
--                     OLD's value on any other path, so it is never client-writable.
--
-- ⚠️ THE TRIGGER DOES NOT ASK WHO IS UPDATING, AND MUST NOT. Both the lead (authenticated) and a
-- contributor (anon, through the SECURITY DEFINER RPC that is still to be built) reach this table as
-- the row's owner, so auth.role() inside a definer function is a subtle and fragile thing to hang a
-- compliance rule on. Instead the rule keys on WHAT CHANGED: any change to a submitted delegated
-- determination requires an override reason. A contributor RPC has no override_reason parameter and
-- never will, so a post-submit contributor write fails on the reason requirement. Fail-closed, with
-- no role introspection.
--
--
-- DEPLOY: Lisa hand-runs this after 20260838. Re-runnable — guarded ADD COLUMN / ADD CONSTRAINT,
-- CREATE TABLE IF NOT EXISTS, guarded CREATE POLICY, drop-then-create trigger, CREATE OR REPLACE on
-- both functions. No client change ships with it; the worksheet UI is the next task and this file is
-- the contract it is built against.

begin;

-- =====================================================================
-- 1. The override's two columns on the parent
-- =====================================================================
alter table public.materiality_impact_determinations
  add column if not exists override_reason text,
  add column if not exists overridden_at   timestamptz;

do $$
begin
  -- ⚠️ THE ASYMMETRY, AS A CONSTRAINT. Same shape as
  -- materiality_survey_questions_exclusion_reason_required: the default action is free, the
  -- departure costs a written defence. btrim, so whitespace is not a reason.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_override_needs_reason') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_override_needs_reason
      check ((overridden_at is null and override_reason is null)
          or (overridden_at is not null
              and override_reason is not null
              and length(btrim(override_reason)) > 0));
  end if;

  -- There is nothing to override on the lead's own determination — that is just editing, and it
  -- needs no defence because no expert's judgement is being set aside.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_override_needs_assignment') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_override_needs_assignment
      check (overridden_at is null or assignment_id is not null);
  end if;

  -- A draft cannot have been overridden: there was no submitted judgement to set aside.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_override_only_when_submitted') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_override_only_when_submitted
      check (overridden_at is null or status = 'submitted');
  end if;
end $$;

comment on column public.materiality_impact_determinations.override_reason is
  'REQUIRED when the lead supersedes a contributor''s submitted determination, and forbidden otherwise. The asymmetry is the anti-manipulation mechanism: accepting the subject-matter expert''s judgement is frictionless, departing from it costs a written defence that appears in the report. Deliberately the same shape as materiality_survey_questions_exclusion_reason_required.';
comment on column public.materiality_impact_determinations.overridden_at is
  'Set by materiality_impact_determination_lock(), never by a client — the trigger assigns now() on a real override and restores the prior value on every other path, so it cannot be backdated or set without a corresponding change.';


-- =====================================================================
-- 2. The companion table — what the assignee determined, frozen
-- =====================================================================
create table if not exists public.materiality_impact_assignee_determinations (
  -- ⚠️ THE PARENT'S PRIMARY KEY, EXACTLY. At most one row per determination, so "written once" is
  -- the key's job rather than a trigger's discipline. A second override finds it present.
  assessment_id        uuid        not null,
  subtopic_code        text        not null,
  direction            text        not null,

  user_id              uuid        not null default auth.uid(),

  -- WHO determined it. Not nullable: a row here exists only because a contributor submitted.
  assignment_id        uuid        not null,

  -- The frozen values. No CHECK constraints — see the header: this is a copy of a row the parent
  -- already validated against ¶41, and restating those rules here would be a second copy free to
  -- drift from the first.
  nature               text,
  scale                smallint,
  scope                smallint,
  irremediability      smallint,
  likelihood           smallint,
  value_chain_position text[],
  time_horizon         text,
  rationale            text,
  determined_at        timestamptz,

  -- When the override happened, i.e. when this snapshot was taken.
  recorded_at          timestamptz not null default now(),

  constraint materiality_impact_assignee_determinations_pkey
    primary key (assessment_id, subtopic_code, direction),

  constraint materiality_impact_assignee_determinations_parent_fkey
    foreign key (assessment_id, subtopic_code, direction)
    references public.materiality_impact_determinations
              (assessment_id, subtopic_code, direction) on delete cascade,

  constraint materiality_impact_assignee_determinations_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade
);

create index if not exists materiality_impact_assignee_determinations_assignment_idx
  on public.materiality_impact_assignee_determinations (assignment_id);

comment on table public.materiality_impact_assignee_determinations is
  'What the CONTRIBUTOR determined, frozen at the moment the lead first superseded it. Shares the parent''s primary key, so at most one row can exist and a second override cannot overwrite the expert''s figures with the lead''s first attempt — the defect a superseded_* column set would have had while still being named as though it did not. The row''s existence is the discriminator: if it is here the determination was overridden, and every null inside it is a §6.1 abstention rather than an absence of override. Written only by materiality_impact_determination_lock(); authenticated holds SELECT and nothing else.';


-- =====================================================================
-- 3. The lock
-- =====================================================================
create or replace function public.materiality_impact_determination_lock()
returns trigger
language plpgsql
-- SECURITY DEFINER so the trigger can write the companion table without authenticated holding
-- INSERT on it. That grant is what makes the snapshot tamper-evident: the only way a row gets in
-- there is a real override.
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if TG_OP = 'INSERT' then
    -- A row cannot arrive already overridden; there would be no snapshot behind it.
    if NEW.overridden_at is not null then
      raise exception 'A determination cannot be created as already overridden.'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  -- Not a submitted delegated determination: no expert judgement to protect. The lead editing their
  -- own work is ordinary editing. The columns are still pinned so they cannot be set on this path.
  if OLD.status <> 'submitted' or OLD.assignment_id is null then
    NEW.overridden_at   := OLD.overridden_at;
    NEW.override_reason := OLD.override_reason;
    return NEW;
  end if;

  -- ── BYPASS 1: un-submitting to escape the lock ──────────────────────────────────────────────
  if NEW.status <> 'submitted' then
    raise exception
      'This determination was submitted by a contributor and cannot be returned to draft. Change '
      'the values directly, giving a reason — the contributor''s determination is kept and both '
      'appear in the report.'
      using errcode = 'check_violation';
  end if;

  -- ── BYPASS 2: re-attributing, so the row looks like the lead's own work ─────────────────────
  if NEW.assignment_id is distinct from OLD.assignment_id then
    raise exception
      'A submitted determination stays attributed to the contributor who made it. Reassignment '
      'moves sub-topics that are not yet submitted; use materiality_impact_reassign_subtopic().'
      using errcode = 'check_violation';
  end if;

  v_changed :=
       NEW.nature               is distinct from OLD.nature
    or NEW.scale                is distinct from OLD.scale
    or NEW.scope                is distinct from OLD.scope
    or NEW.irremediability      is distinct from OLD.irremediability
    or NEW.likelihood           is distinct from OLD.likelihood
    or NEW.value_chain_position is distinct from OLD.value_chain_position
    or NEW.time_horizon         is distinct from OLD.time_horizon
    or NEW.rationale            is distinct from OLD.rationale;

  if not v_changed then
    -- ⚠️ BYPASS 3: overridden_at is never client-writable. On a no-op update it is restored, so it
    -- cannot be set or backdated without a corresponding change. override_reason IS editable here,
    -- and only here — a lead fixing the wording of a defence they have already given.
    NEW.overridden_at := OLD.overridden_at;
    return NEW;
  end if;

  -- ⚠️ THE REASON, REQUIRED. This is the whole asymmetry: accepting the expert costs nothing,
  -- departing from them costs a written defence that the report prints.
  if NEW.override_reason is null or length(btrim(NEW.override_reason)) = 0 then
    raise exception
      'Changing a contributor''s submitted determination requires a reason. It is recorded with '
      'the change and shown in the report beside what the contributor determined.'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ ON CONFLICT DO NOTHING, AND THAT IS THE POINT. The first override freezes the contributor's
  -- figures; every later one leaves them exactly as they were. Without this, a lead who overrode
  -- twice would replace the expert's determination with their own first attempt.
  insert into public.materiality_impact_assignee_determinations (
    assessment_id, subtopic_code, direction, user_id, assignment_id,
    nature, scale, scope, irremediability, likelihood,
    value_chain_position, time_horizon, rationale, determined_at)
  values (
    OLD.assessment_id, OLD.subtopic_code, OLD.direction, OLD.user_id, OLD.assignment_id,
    OLD.nature, OLD.scale, OLD.scope, OLD.irremediability, OLD.likelihood,
    OLD.value_chain_position, OLD.time_horizon, OLD.rationale, OLD.determined_at)
  on conflict (assessment_id, subtopic_code, direction) do nothing;

  NEW.overridden_at := now();
  return NEW;
end $$;

comment on function public.materiality_impact_determination_lock() is
  'Makes a submitted delegated determination immutable except through the audited override path. Refuses the three bypasses — un-submitting, re-attributing, and setting overridden_at by hand — and requires a written reason for any change to the values, snapshotting the contributor''s determination into materiality_impact_assignee_determinations on the FIRST override only. Deliberately keys on WHAT CHANGED rather than on who is updating: both the lead and a contributor RPC reach this table as the row''s owner, so auth.role() inside a definer function would be a fragile thing to hang a compliance rule on. A contributor RPC has no override_reason parameter, so a post-submit contributor write fails closed on the reason requirement.';

drop trigger if exists materiality_impact_determination_lock_trg
  on public.materiality_impact_determinations;
create trigger materiality_impact_determination_lock_trg
  before insert or update on public.materiality_impact_determinations
  for each row execute function public.materiality_impact_determination_lock();


-- =====================================================================
-- 4. Reassignment
-- =====================================================================
create or replace function public.materiality_impact_reassign_subtopic(
  p_assessment_id    uuid,
  p_subtopic_code    text,
  p_to_assignment_id uuid)
returns int
language plpgsql
-- SECURITY INVOKER: the lead is authenticated and holds every privilege this needs, so RLS applies
-- normally and the function adds a rule rather than a privilege.
set search_path = public
as $$
declare
  v_submitted int;
  v_cleared   int;
begin
  if not exists (select 1 from public.materiality_impact_assignments a
                  where a.id = p_to_assignment_id and a.assessment_id = p_assessment_id) then
    raise exception 'That assignment does not belong to this assessment.'
      using errcode = 'foreign_key_violation';
  end if;

  -- ⚠️ EITHER DIRECTION BEING SUBMITTED ANCHORS THE WHOLE SUB-TOPIC. The sub-topic is the unit of
  -- assignment — the unique is on (assessment_id, subtopic_code), not on direction — so moving half
  -- of it would create two assignees for one sub-topic in everything but name.
  select count(*) into v_submitted
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.status = 'submitted';

  if v_submitted > 0 then
    raise exception
      'This sub-topic has a submitted determination and stays with the contributor who made it. A '
      'submitted determination can be superseded by you, with a reason, but not reassigned.'
      using errcode = 'check_violation';
  end if;

  -- ⚠️ THE OWNERSHIP CHECK RUNS FIRST, AND IS CHECKED RATHER THAN ASSUMED. An UPDATE matching no
  -- row under RLS returns neither an error nor rows, so a sub-topic belonging to another account
  -- would otherwise report a successful reassignment that never happened. Doing this before the
  -- clearing update also means the destructive step is never reached on a bad call — a raise would
  -- roll it back, but relying on rollback to undo data loss is not the same as not doing it.
  update public.materiality_impact_assignment_subtopics s
     set assignment_id = p_to_assignment_id
   where s.assessment_id = p_assessment_id
     and s.subtopic_code = p_subtopic_code;

  if not found then
    raise exception 'That sub-topic is not assigned in this assessment, or it belongs to another account.'
      using errcode = 'no_data_found';
  end if;

  -- ⚠️ THE DRAFT IS CLEARED, NOT CARRIED. See the header: carrying it means the next contributor
  -- submits figures the previous one typed, and the audit trail then names the wrong author with
  -- nothing able to detect it afterwards.
  --
  -- ⚠️ evidence_in_view IS RESET TOO, AND IT IS NOT OPTIONAL. The lead may have started this
  -- sub-topic themselves with the survey evidence open, in which case the row carries
  -- assignment_id null and evidence_in_view true. Handing it to a contributor without resetting the
  -- flag violates determinations_delegated_saw_no_evidence and the whole update fails — and if the
  -- constraint did not exist, it would instead be a delegated determination claiming the evidence
  -- was in view when the contributor cannot see it. Both the constraint and this reset say the same
  -- thing; neither is redundant, because this is the write that would have broken it.
  update public.materiality_impact_determinations d
     set assignment_id        = p_to_assignment_id,
         evidence_in_view     = false,
         nature               = null,
         scale                = null,
         scope                = null,
         irremediability      = null,
         likelihood           = null,
         value_chain_position = '{}'::text[],
         time_horizon         = null,
         rationale            = null,
         determined_at        = null
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code;

  get diagnostics v_cleared = row_count;
  return v_cleared;
end $$;

comment on function public.materiality_impact_reassign_subtopic(uuid, text, uuid) is
  'Moves an unsubmitted sub-topic to a different contributor and CLEARS any draft values, returning how many determination rows were cleared so the confirmation can state a number rather than a warning. Refuses when either direction has been submitted: a submitted determination stays attributed to the contributor who made it, and the sub-topic — not the direction — is the unit of assignment. The draft is cleared rather than carried because a carried draft means the next contributor submits figures the previous one typed, which records the wrong author and is undetectable afterwards.';


-- =====================================================================
-- 5. RLS and grants
-- =====================================================================
alter table public.materiality_impact_assignee_determinations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname = 'public'
                    and tablename  = 'materiality_impact_assignee_determinations'
                    and policyname = 'miad_owner_all') then
    create policy miad_owner_all on public.materiality_impact_assignee_determinations
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

revoke all on public.materiality_impact_assignee_determinations
  from anon, authenticated, service_role;

-- ⚠️ SELECT ONLY, AND THAT IS WHAT MAKES THE SNAPSHOT TAMPER-EVIDENT. The lock trigger is SECURITY
-- DEFINER and is the only writer. A lead who could INSERT here could manufacture a contributor
-- determination that was never made, or edit one that was — which would turn the report's central
-- claim, "this is what your expert said", into something the lead controls.
grant select on public.materiality_impact_assignee_determinations to authenticated;
grant all    on public.materiality_impact_assignee_determinations to service_role;

revoke all on function public.materiality_impact_reassign_subtopic(uuid, text, uuid) from public;
grant execute on function public.materiality_impact_reassign_subtopic(uuid, text, uuid) to authenticated;

commit;


-- =====================================================================
-- VERIFY — run after, separately. Substitute real ids.
-- =====================================================================
--
--  1) The lock exists and fires on both operations:
--     select tgname, pg_get_triggerdef(oid) from pg_trigger
--      where tgrelid = 'public.materiality_impact_determinations'::regclass and not tgisinternal;
--     -- expect materiality_impact_determination_lock_trg, BEFORE INSERT OR UPDATE
--
--  2) THE REASON IS REQUIRED. With a submitted delegated determination in place, expect REJECTED:
--     update public.materiality_impact_determinations set scale = 4
--      where assessment_id = '<id>' and subtopic_code = 'S1.3' and direction = 'negative';
--     -- expect: Changing a contributor's submitted determination requires a reason.
--
--  3) THE SAME UPDATE WITH A REASON SUCCEEDS, AND FREEZES THE CONTRIBUTOR'S FIGURES:
--     update public.materiality_impact_determinations
--        set scale = 4, override_reason = 'Site visit found the 2024 incident was not isolated.'
--      where assessment_id = '<id>' and subtopic_code = 'S1.3' and direction = 'negative';
--     select scale, overridden_at from public.materiality_impact_determinations where ...;
--     select scale, recorded_at   from public.materiality_impact_assignee_determinations where ...;
--     -- expect the parent at 4 with overridden_at set, and the companion holding the ORIGINAL scale
--
--  4) ⚠️ A SECOND OVERRIDE MUST NOT DISTURB THE COMPANION. This is the defect the companion table's
--     shared primary key exists to make impossible; run it.
--     update public.materiality_impact_determinations
--        set scale = 2, override_reason = 'Revised again after the board discussion.'
--      where assessment_id = '<id>' and subtopic_code = 'S1.3' and direction = 'negative';
--     select scale, recorded_at from public.materiality_impact_assignee_determinations where ...;
--     -- expect the SAME original scale and the SAME recorded_at as in step 3
--
--  5) The three bypasses, all expected REJECTED:
--     update ... set status = 'draft'        where <the submitted delegated row>;
--     update ... set assignment_id = null    where <the submitted delegated row>;
--     update ... set overridden_at = now()   where <a submitted delegated row, nothing else changed>;
--     -- the third is silently restored rather than raising: confirm with
--     select overridden_at from public.materiality_impact_determinations where ...;
--
--  6) A LEAD'S OWN DETERMINATION IS UNAFFECTED — no reason needed, no snapshot taken:
--     update public.materiality_impact_determinations set scale = 3
--      where assessment_id = '<id>' and assignment_id is null and subtopic_code = '<code>';
--     -- expect success, and no new row in materiality_impact_assignee_determinations
--
--  7) Reassignment refuses a submitted sub-topic and reports the count it cleared otherwise:
--     select public.materiality_impact_reassign_subtopic('<assessment>', 'S1.3', '<assignment-b>');
--     -- expect: This sub-topic has a submitted determination and stays with the contributor...
--     select public.materiality_impact_reassign_subtopic('<assessment>', 'E2.1', '<assignment-b>');
--     -- expect an integer: how many determination rows were cleared (0, 1 or 2)
--     select assignment_id from public.materiality_impact_assignment_subtopics
--      where assessment_id = '<assessment>' and subtopic_code = 'E2.1';
--     -- expect assignment-b
--
--  8) Revoking keeps the evidence. Expect the delete to FAIL and the revoke to succeed:
--     delete from public.materiality_impact_assignments where id = '<assignment-a>';
--     -- expect a foreign key violation from materiality_impact_determinations_assignment_fkey
--     update public.materiality_impact_assignments
--        set status = 'revoked', revoked_at = now() where id = '<assignment-a>';
--     select count(*) from public.materiality_impact_determinations
--      where assignment_id = '<assignment-a>';
--     -- expect the determinations still present and still attributed
--
--  9) anon still holds nothing on the new table:
--     select grantee, privilege_type from information_schema.role_table_grants
--      where table_name = 'materiality_impact_assignee_determinations';
--     -- expect no anon rows, and authenticated holding SELECT only
