-- 20260821_materiality_survey_respondent_completed_lock.sql
--
-- SCREENING SURVEY — THE INTERIM LOCK. One BEFORE UPDATE trigger on
-- materiality_survey_respondents. RUN 20260819_… AND 20260820_… FIRST.
--
-- It refuses two status transitions and nothing else:
--   OUT of 'completed'   — a submitted survey cannot be silently reopened
--   INTO 'completed'     — unless every one of that respondent's answers has actually been resolved
--
-- No new table, no new column, no new grant, no RPC. Nothing that exists today changes behaviour:
-- survey_submit's own UPDATE is 'in_progress' -> 'completed' with the resolution already written one
-- statement earlier, and survey_get's is 'invited' -> 'in_progress'. Both pass untouched.
--
--
-- =====================================================================
-- ⚠️ WHY THIS EXISTS — THE STATE IT REMOVES IS THE WORST OF THE THREE
-- =====================================================================
-- 20260820 made survey_submit one-way: its token gate refuses status = 'completed', so a second
-- submit, a further save and a re-read all receive the same indistinguishable 'invalid token'.
--
-- That was only ever half true, and the missing half was not in the RPC. 20260819 grants
-- SELECT/INSERT/UPDATE on materiality_survey_respondents to `authenticated` under an owner RLS
-- policy, so the CUSTOMER could already run, from any client holding their own JWT:
--
--     update materiality_survey_respondents set status = 'in_progress' where id = ...;
--
-- and the token starts working again. No button, no feature, no audit record — and nothing stopping
-- it. status is the ONLY re-entry: materiality_survey_resolve_token admits a respondent on
-- `revoked_at is null AND expires_at > now() AND status not in (completed, revoked, expired)`, and
-- of those three conditions only status can move in the permissive direction. There is no DELETE
-- grant, and token is unique, so a completed row cannot be replaced or re-pointed either. Closing
-- status closes the door.
--
-- SILENTLY POSSIBLE AND UNAUDITED IS THE WORST OF THE THREE AVAILABLE STATES. A survey whose
-- responses can be changed after submission with no trace is not evidence, and ESRS 2 SBM-2's
-- engagement disclosure — who was engaged, field dates, number invited, number responded, how the
-- results informed the determination — would be describing something the data cannot support.
-- Refused-until-designed is honest. Silently-open is not. Built here, designed later.
--
--
-- =====================================================================
-- ⚠️ THE SECOND HALF IS NOT SYMMETRY FOR ITS OWN SAKE — THE FIRST HALF CREATES THE NEED FOR IT
-- =====================================================================
-- Refusing only the way OUT would make a hand-set completion permanent.
--
-- Today a customer can also mark a respondent completed by hand, and that produces a respondent
-- whose status says 'completed' while their response rows still carry resolved_subtopic_code NULL —
-- because the resolution is written by survey_submit and by nothing else. Those answers exist and
-- the matrix never sees them: the roll-up reads resolved_subtopic_code, so they are silently absent
-- from every count they belong in, which makes the company look blinder than the evidence says. The
-- same direction of error as counting not-asked as abstained (spec v8 §3.0.1), by a different door.
--
-- Until now that mistake was recoverable — flip the status back and submit properly. The out-of-
-- completed lock above removes exactly that recovery. So the lock, alone, would convert a reversible
-- data-entry error into a permanent one, and the row would sit there resolved-never, forever.
--
-- The condition is exact rather than a proxy: survey_submit sets resolution_basis on EVERY one of
-- the respondent's response rows, unconditionally, so `resolution_basis is null` identifies a row
-- that has not been through it. It is not keyed on resolved_subtopic_code, which is legitimately
-- NULL on an entity-specific matter (§3.2 — asked_subtopic_code is NULL there too), and which would
-- therefore have made a correct submit look unresolved.
--
-- A respondent with ZERO responses passes: the condition is vacuously true, and it must be. §3.0.1
-- makes n_skipped ("I saw this and didn't engage") a finding distinct from n_abstained ("I saw this
-- and cannot say"), and it exists only because someone can submit having answered nothing.
--
--
-- =====================================================================
-- ⚠️ WHAT IS *NOT* LOCKED, SO THE LOCK IS NOT MISTAKEN FOR MORE THAN IT IS
-- =====================================================================
--   • Transitions out of 'revoked' or 'expired' are still permitted. Un-revoking a mistakenly
--     revoked invite is a legitimate correction, and neither state carries a submitted answer.
--   • Every other column of a completed row remains updatable: reminder_sent_at, revoked_at,
--     expires_at, the classification, the invite name and email. Only completed_at is held (below).
--     None of them can re-admit a token, so none of them is a reopen.
--   • completed_at IS held immutable once set, and this is the one line beyond a strict reading of
--     "transitions out of completed". It is here because §7 requires the engagement disclosure to
--     state FIELD DATES, and completed_at is that evidence: a completed_at that can be moved or
--     cleared with no trace is the same defect as a reopenable status, one column over, and the
--     trigger to prevent it already exists on this line. Nothing legitimate rewrites it — survey_
--     submit sets it in the same statement that sets status, when old.status is not yet 'completed'.
--   • A NEW invitation to the same person is untouched and is the intended path. survey_submit's own
--     refusal message already says so ("re-invite them under the new one"): insert a fresh
--     respondent row with a fresh token. That adds evidence rather than rewriting it, and the
--     engagement record shows both, which is the honest shape.
--
--
-- =====================================================================
-- ⚠️ THE DELIBERATE OVERRIDE, STATED — BECAUSE AN UNDOCUMENTED ESCAPE HATCH GETS FOUND ANYWAY
-- =====================================================================
-- A trigger binds every role, including the table owner and the service_role session behind the
-- Supabase SQL editor. That is the point: a guarantee with a role-shaped hole in it is not a
-- guarantee, and the customer's client is not the only thing that can write this table.
--
-- The consequence, said out loud: a genuinely mis-submitted respondent cannot be fixed from the SQL
-- editor either, without disabling this first. That is deliberate — it makes the override an act
-- someone has to decide to perform rather than a keystroke — and it is written here rather than left
-- to be rediscovered:
--
--     alter table public.materiality_survey_respondents disable trigger materiality_survey_respondents_guard;
--     -- ... the correction, IN A TRANSACTION, and note what you did and why ...
--     alter table public.materiality_survey_respondents enable  trigger materiality_survey_respondents_guard;
--
-- ⚠️ AN OVERRIDE PERFORMED THIS WAY LEAVES NO RECORD ANYWHERE. That is not a flaw in the procedure,
-- it is the whole reason survey_reopen needs to exist eventually, and the reason the note goes in
-- the correction itself. If it is being reached for more than once, that is the signal to build the
-- real thing — the brief for which is immediately below.
--
-- The error message deliberately does NOT teach this. It names the reason and points at this file.
--
--
-- =====================================================================
-- ⚠️ THE DESIGN BRIEF FOR survey_reopen — WHOEVER BUILDS IT WILL LOOK HERE FIRST
-- =====================================================================
-- DECIDED 16 AUGUST 2026: survey_reopen is NOT built, and this lock is the interim. The blocker is
-- (3) below — a reopen cannot know whether it is editing evidence a customer has already published,
-- because the round -> materiality_assessments write-back does not exist yet. Everything else here
-- is small; that one is not, and it decides the shape of the rest.
--
-- Four requirements, in rising cost. All four are load-bearing; none is optional.
--
-- (1) THE RESOLUTION RESET — small, and the reason a status flip cannot be the whole feature.
--     Reopening leaves resolved_subtopic_code and resolution_basis written on every row the first
--     submit resolved. Anything answered or changed afterwards is unresolved until the next submit,
--     so ONE RESPONDENT CAN HOLD A MIX of resolved and unresolved rows, and an aggregation reading
--     resolved_subtopic_code silently under-counts them — no error, no flag, and a number that
--     simply comes out low.
--     So survey_reopen must NULL resolved_subtopic_code AND resolution_basis for that respondent, so
--     that the next submit re-resolves the whole set coherently against one category. This is
--     precisely why it has to be an RPC — `survey_reopen(p_respondent_id uuid)`, SECURITY DEFINER,
--     authenticated, checking user_id = auth.uid() on the round — and never a dashboard UPDATE.
--     It is also what makes the second half of THIS trigger safe to keep: a proper reopen leaves the
--     rows unresolved, and re-entering 'completed' then requires a real submit, which is exactly
--     what the INTO-'completed' refusal below already enforces. The two compose rather than fight.
--
-- (2) THE AUDIT RECORD — small, and non-optional for the same reason exclusion_reason is not
--     optional on a deselected question (§3.2). ESRS 2 SBM-2 has the engagement disclosure state
--     field dates and response counts; a response that was submitted, reopened and changed is a
--     change to the evidence base, and a reopen with no actor, no timestamp and no REASON is
--     indistinguishable from an answer that was always that way.
--     Either a materiality_survey_respondent_events table (respondent_id, event, actor, at, reason)
--     or the existing capture_audit_log infrastructure from
--     20260726_capture_audit_log_infrastructure.sql — that decision is open, the requirement is not.
--     completed_at must become HISTORY rather than being overwritten with NULL: "submitted 4 Sep,
--     reopened 6 Sep, resubmitted 6 Sep" is the disclosable fact, and a nulled completed_at destroys
--     the first third of it.
--
-- (3) REFUSE-IF-CONSUMED — NOT small, and THE BLOCKER. A reopen must be refused once the round has
--     fed an assessment, or a figure changes underneath a report that has already printed it. That
--     is the defect this whole module exists to avoid, and the one an assurance provider would find.
--     It needs the round -> materiality_assessments link, and that write-back is not designed —
--     20260819's header names it as its own task, and nothing in 20260820 creates it. Until it
--     exists there is no query that answers "has this evidence been published", so a reopen would
--     have to either refuse always (useless) or permit always (unsafe).
--     ⚠️ WHOEVER BUILDS THE WRITE-BACK: this is a consumer of it. The link must be able to answer,
--     for one round, whether any assessment has consumed it and when — not merely which assessment
--     points at it now.
--
-- (4) THE ANONYMITY INTERACTION — cheap to state, easy to miss, and no RPC fixes it. Once an
--     aggregate has been shown to the customer at or above the round's anonymity_floor, reopening
--     lets someone who has SEEN that aggregate influence which individual answers change. That is
--     not a schema problem; it is a reason the audit record in (2) must capture whether the round's
--     aggregate had been read before the reopen, so the engagement disclosure can be honest about
--     the order of events. Note the floor is per-round and deliberately so (20260819): raising it
--     later must not silently restate what a historical round's aggregate showed, and the same
--     discipline applies to a reopen that changes what it shows.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260820. Re-runnable — CREATE OR
-- REPLACE FUNCTION, drop-then-create trigger. No client change ships with it and none is needed:
-- nothing in app/ or lib/ writes materiality_survey_respondents today.

begin;

create or replace function public.materiality_survey_respondent_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unresolved int;
begin
  -- ── 1. A submitted survey cannot be silently reopened. ──────────────────────
  -- The only re-entry: materiality_survey_resolve_token admits a respondent on revoked_at,
  -- expires_at and status, and of those only status can move the permissive way.
  if old.status = 'completed' and new.status is distinct from 'completed' then
    raise exception
      'materiality_survey_respondents.status cannot leave ''completed'' (% -> %). A survey whose '
      'answers can change after submission with no trace is not evidence, and the ESRS 2 SBM-2 '
      'engagement disclosure would be describing something the data cannot support. Reopening is a '
      'designed feature that does not exist yet (survey_reopen — the brief is in the header of '
      '20260821_materiality_survey_respondent_completed_lock.sql). To collect a further response, '
      'invite the person again with a new token: that adds evidence rather than rewriting it.',
      old.status, new.status;
  end if;

  -- ── 2. completed_at is the field-date evidence §7 discloses. ────────────────
  if old.completed_at is not null and new.completed_at is distinct from old.completed_at then
    raise exception
      'materiality_survey_respondents.completed_at is fixed once set (% -> %). It is the field-date '
      'evidence the engagement disclosure states; a timestamp that can be moved or cleared with no '
      'trace is the same defect as a reopenable status, one column over.',
      old.completed_at, new.completed_at;
  end if;

  -- ── 3. Entering 'completed' requires that the answers were actually resolved. ─
  -- Without this, the lock above would make a hand-set completion PERMANENT: status would say
  -- completed while every response row still carried a null resolution, and the roll-up reads
  -- resolved_subtopic_code — so those answers would be silently absent from every count they belong
  -- in, forever. survey_submit resolves the rows one statement before it sets status, so its own
  -- UPDATE passes here; a hand-set completion does not.
  --
  -- Keyed on resolution_basis, not resolved_subtopic_code: the latter is legitimately NULL on an
  -- entity-specific matter (§3.2), which would have made a correct submit look unresolved.
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select count(*)
      into v_unresolved
      from public.materiality_survey_responses r
     where r.respondent_id = old.id
       and r.resolution_basis is null;

    if v_unresolved > 0 then
      raise exception
        'Cannot mark this respondent completed: % of their answers have not been resolved to an '
        'ESRS sub-topic. Completion is what survey_submit(token) does, and resolving the answers is '
        'the half that matters — a completed respondent whose rows carry no resolution is silently '
        'absent from every count they belong in (spec v8 §6.3), and this lock would make that '
        'permanent. Call survey_submit rather than setting the status by hand.',
        v_unresolved;
    end if;
    -- A respondent with NO responses passes, and must: partial submission is permitted, and
    -- n_skipped exists only because someone can submit having answered nothing (§3.0.1).
  end if;

  return new;
end $$;

comment on function public.materiality_survey_respondent_guard() is
  'THE INTERIM LOCK on survey submission, pending survey_reopen. Refuses any status transition OUT of ''completed'' — 20260819 grants authenticated UPDATE on this table under an owner policy, so before this trigger the customer could silently reopen a submitted survey with a plain UPDATE and re-answer it, leaving the ESRS 2 SBM-2 engagement disclosure describing evidence the data could not support. Also holds completed_at immutable once set (the field-date evidence §7 discloses), and refuses entry INTO ''completed'' while any of the respondent''s answers is unresolved — because the first refusal would otherwise turn a hand-set completion into a permanent one, with every answer silently absent from the roll-up. The design brief for survey_reopen is in the header of 20260821_materiality_survey_respondent_completed_lock.sql.';

drop trigger if exists materiality_survey_respondents_guard
  on public.materiality_survey_respondents;
create trigger materiality_survey_respondents_guard
  before update on public.materiality_survey_respondents
  for each row execute function public.materiality_survey_respondent_guard();

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- ⚠️ As in 20260820: every check that expects an ERROR is wrapped in a savepoint, because an error
-- aborts the whole transaction and without them the first intentional failure makes every later
-- check report "current transaction is aborted" — which reads as a broken migration.
-- user_id is supplied explicitly because auth.uid() is NULL in the SQL editor.
--
-- 0) The trigger exists, and on the right table and event:
--    select tgname, tgenabled, pg_get_triggerdef(oid)
--      from pg_trigger
--     where tgrelid = 'public.materiality_survey_respondents'::regclass
--       and not tgisinternal;
--    -- expect materiality_survey_respondents_guard | O | ... BEFORE UPDATE ... FOR EACH ROW ...
--    -- tgenabled must be 'O' (enabled). 'D' means someone disabled it for a correction and did not
--    -- re-enable it — see the override procedure in the header.
--
-- Setup:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds
--        (user_id, name, company_name, standard_version, deadline)
--      values (:'u_id', 'verify lock', 'Verify Co', 'esrs_2026', current_date + 21)
--      returning id \gset round_
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'internal', 'own_workforce', 'Internal Person', 'i@x.test')
--      returning id, token \gset r_
--      select id from public.materiality_survey_questions
--       where round_id = :'round_id' and subtopic_code = 'E1.1' \gset q_
--
-- 1) ⚠️ THE NORMAL PATH IS UNAFFECTED — check this FIRST. If the lock broke survey_submit, every
--    other result below is meaningless:
--    select public.survey_get(:'r_token');            -- ok, 31 questions (own_workforce -> s1)
--    select public.survey_save_response(:'r_token', :'q_id', 2::smallint, false);  -- ok
--    select public.survey_submit(:'r_token');                                      -- ok
--    select status, completed_at is not null from public.materiality_survey_respondents
--     where id = :'r_id';                                              -- expect completed | t
--
-- 2) ⚠️ THE LOCK ITSELF — the UPDATE that worked before this migration and must not now:
--    savepoint v2;
--      update public.materiality_survey_respondents
--         set status = 'in_progress' where id = :'r_id';
--      -- ERROR: materiality_survey_respondents.status cannot leave 'completed'...
--    rollback to savepoint v2;
--    savepoint v2;
--      update public.materiality_survey_respondents
--         set status = 'invited', completed_at = null where id = :'r_id';
--      -- ERROR: ... cannot leave 'completed' ...   (the status arm fires first)
--    rollback to savepoint v2;
--    savepoint v2;
--      update public.materiality_survey_respondents
--         set status = 'expired' where id = :'r_id';
--      -- ERROR: ... cannot leave 'completed' ...   (out is out, whatever the destination)
--    rollback to savepoint v2;
--    -- and the token is still refused, which is what the lock is protecting:
--    savepoint v2; select public.survey_get(:'r_token');   -- ERROR: invalid token
--    rollback to savepoint v2;
--
-- 3) completed_at is held, even with status untouched:
--    savepoint v3;
--      update public.materiality_survey_respondents
--         set completed_at = now() - interval '3 days' where id = :'r_id';
--      -- ERROR: materiality_survey_respondents.completed_at is fixed once set...
--    rollback to savepoint v3;
--
-- 4) A NO-OP UPDATE MUST NOT RAISE, and neither must an unrelated edit to a completed row. This is
--    the check that catches a guard written with `=` where it needed `is distinct from`:
--    update public.materiality_survey_respondents
--       set status = 'completed' where id = :'r_id';                   -- expect SUCCESS
--    update public.materiality_survey_respondents
--       set reminder_sent_at = now(), revoked_at = now() where id = :'r_id';  -- expect SUCCESS
--
-- 5) ⚠️ A HAND-SET COMPLETION IS REFUSED — the half that keeps a mistake from becoming permanent.
--    A second respondent, answered but never submitted:
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'external', 'customer', 'Customer Person', 'c@x.test')
--      returning id, token \gset c_
--      select public.survey_save_response(:'c_token', :'q_id', 3::smallint, false);   -- ok
--    savepoint v5;
--      update public.materiality_survey_respondents
--         set status = 'completed', completed_at = now() where id = :'c_id';
--      -- ERROR: Cannot mark this respondent completed: 1 of their answers have not been resolved...
--    rollback to savepoint v5;
--    -- the supported path succeeds and resolves as it goes:
--    select public.survey_submit(:'c_token');                                        -- ok
--    select count(*) filter (where resolution_basis is null) as unresolved
--      from public.materiality_survey_responses where respondent_id = :'c_id';   -- expect 0
--
-- 6) A respondent with NO answers can still submit — partial submission is permitted and n_skipped
--    depends on it (§3.0.1). This must NOT be caught by check 5:
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name, invite_email)
--      values (:'round_id', :'u_id', 'external', 'regulator', 'Silent Person', 'q@x.test')
--      returning token \gset z_
--      select public.survey_get(:'z_token');      -- ok, 25 questions
--      select public.survey_submit(:'z_token');   -- expect SUCCESS, zero responses
--
-- 7) Transitions out of 'revoked' are still permitted — this lock is about submitted answers, not
--    about every status:
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, status, invite_name)
--      values (:'round_id', :'u_id', 'external', 'supplier', 'revoked', 'Mistake')
--      returning id \gset m_
--      update public.materiality_survey_respondents
--         set status = 'invited', revoked_at = null where id = :'m_id';   -- expect SUCCESS
--
--    rollback;   -- ends the setup transaction; nothing above survives
--
-- 8) LAST, AND ON PURPOSE — confirm the override procedure in the header actually works, so it is
--    not discovered to be wrong on the day it is needed. Run this on its own, outside the block
--    above, and re-enable in the SAME session:
--    alter table public.materiality_survey_respondents disable trigger materiality_survey_respondents_guard;
--    select tgenabled from pg_trigger
--     where tgrelid = 'public.materiality_survey_respondents'::regclass
--       and tgname = 'materiality_survey_respondents_guard';            -- expect 'D'
--    alter table public.materiality_survey_respondents enable  trigger materiality_survey_respondents_guard;
--    select tgenabled from pg_trigger
--     where tgrelid = 'public.materiality_survey_respondents'::regclass
--       and tgname = 'materiality_survey_respondents_guard';            -- expect 'O'
--    -- ⚠️ IF THIS IS LEFT AT 'D', THE LOCK IS OFF AND NOTHING ANYWHERE WILL SAY SO. Check 0 is the
--    -- one to re-run after any correction.
