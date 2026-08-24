-- 20260841_abstention_and_rationale.sql
--
-- Two fixes, one migration. Both surfaced only once the contributor form existed.
--
-- ⚠️ RUN AFTER 20260840.
--
-- ⚠️ TWO OF THIS FILE'S FUNCTIONS ARE SUPERSEDED BY 20260854:
--     materiality_impact_determination_lock()   (§2 below)
--     impact_save_determination(), 12 arguments (§4 below) — THE LIVE CONTRIBUTOR PATH
-- What is installed is 20260854's copy of each. Both differ from the bodies below by ONE LINE: the
-- ON CONFLICT target names four columns, because 20260854 added `axis` and moved the primary keys
-- of materiality_impact_determinations AND materiality_impact_assignee_determinations to
-- (assessment_id, subtopic_code, axis, direction). The lock trigger's snapshot insert targets the
-- second of those tables, which is why it moved too.
-- EDITING THE BODIES BELOW CHANGES NOTHING, and a CREATE OR REPLACE from this file would REGRESS
-- the database: PL/pgSQL does not plan a function body at CREATE time, so the stale three-column
-- target installs silently and raises SQLSTATE 42P10 at the first save — the contributor path, in
-- the 12-argument case. Edit 20260854, or supersede it in turn and record that here.
--
--
-- =====================================================================
-- 1. THE NULL THAT MEANS TWO THINGS — FOR THE THIRD TIME
-- =====================================================================
-- A dimension recorded as "not enough visibility to assess" is stored as NULL (§6.1). So is a
-- dimension nobody has reached yet. 20260838 resolved that with `status`: null on a DRAFT means
-- untouched, null on a SUBMITTED row means abstained.
--
-- That is true, and it is not enough. While a determination is a draft — which is the entire time a
-- contributor is filling it in — the two states are genuinely identical in the data. A contributor
-- who chooses "not enough visibility", closes the tab and returns sees the choice unselected. It
-- was saved; the record simply cannot tell it from a question they had not reached.
--
-- ⚠️ AND THE CLIENT CANNOT FIX IT. Rendering a null on a started block as "abstained" would put an
-- answer nobody gave into the form for every dimension they had not yet reached. Pre-selecting an
-- answer is worse than losing a selection, so the page currently states the limitation in plain
-- copy — an honest workaround, and not a fix.
--
-- ⚠️ THIS IS THE SAME DEFECT THIS MODULE HAS NOW FIXED THREE TIMES, AND THE RECURRENCE IS THE
-- ARGUMENT. 20260837 found `n_asked = 0` reported as 'no_eligible_respondents' when the round was
-- merely new — timing collapsed into engagement. 20260838 added `status` specifically to stop a
-- null dimension meaning two things. Here it is again, one level down, per dimension. A defect that
-- returns three times in a fortnight is not being caused by carelessness; it is being caused by a
-- representation that keeps letting absence stand in for a decision. So it is fixed IN THE DATA, and
-- the wrong state is made unstorable rather than merely undisplayed — the model being the constraint
-- that stops a likelihood on an actual impact.
--
--
-- =====================================================================
-- ⚠️ ONE ARRAY COLUMN, NOT FOUR BOOLEANS. THE REASONING, BECAUSE THE OBVIOUS ANSWER IS FOUR.
-- =====================================================================
-- Both shapes make abstention a RECORDED ANSWER — which is what §6.1 says it is, and the point:
-- "never a zero and never a low" is a claim about a stored value, and until now there was no stored
-- value to make the claim about. Membership of the array is that record exactly as a boolean would
-- be. So the choice turns on cost and on what the shape says.
--
--   abstained_dimensions text[] not null default '{}'
--
-- FOR THE ARRAY:
--   * ONE column rather than four, and — the part that matters more — ONE parameter on
--     impact_save_determination rather than four. That function already takes ten.
--   * ⚠️ THE FOUR DIMENSIONS ARE NOT SYMMETRIC. irremediability exists only on a negative impact
--     (¶41); likelihood only on a potential one. Four always-present boolean columns assert four
--     always-present facts, three-quarters of which are meaningless on any given row. An array
--     naturally holds only what applies, and the ¶41 constraints below then read as what they are:
--     "this dimension may not even be abstained on, because it is not asked."
--   * It reuses the idiom already on this exact row — value_chain_position text[] with a `<@`
--     element check (20260838). Same table, same shape, same guard.
--
-- AGAINST, HONESTLY: a boolean column is self-documenting in \d, where an array needs its check
-- constraint read to know what may go in it. Mitigated by the column comment. And a typo would be a
-- silent non-abstention rather than a SQL error — which is why the domain check below is not
-- optional garnish. Without it, 'scal' would store cleanly and record nothing.
--
-- REJECTED OUTRIGHT: a sentinel value in the dimension itself, 0 meaning abstained. §6.1 says
-- "never a zero" in those words. It is the cheapest shape and it is the one the standard forbids;
-- naming it here so nobody proposes it as an optimisation later.
--
-- THE THREE-STATE ENCODING, COMPLETE AND UNAMBIGUOUS AT EVERY STATUS:
--   scale = 3, not in array    answered
--   scale = null, IN array     "not enough visibility to assess" — a recorded §6.1 answer
--   scale = null, not in array not reached yet
--   scale = 3, IN array        ⚠️ UNSTORABLE. An abstention cannot also carry a score.
--
--
-- =====================================================================
-- 2. impact_save_determination COULD NOT WRITE A RATIONALE
-- =====================================================================
-- A straight omission in 20260840, mine. The column has existed since 20260838, impact_get returns
-- it, 20260839's companion table snapshots it, and the report will quote it — the contributor's own
-- words are the most valuable thing on the row. The save function simply had no parameter for it, so
-- screen B omitted the field rather than showing a box that discarded what was typed into it.
--
--
-- =====================================================================
-- ⚠️ THREE PLACES THE NEW COLUMN HAD TO BE THREADED, AND ALL THREE ARE DEFECTS IF MISSED
-- =====================================================================
--   THE SNAPSHOT (20260839's lock). materiality_impact_assignee_determinations freezes what the
--   contributor determined. Without the column there, an overridden determination would lose the
--   record that the expert ABSTAINED — and the report would then show the lead's score beside a
--   blank, implying the contributor had no view when they had explicitly recorded that they could
--   not judge it. That is the worst available misreading of this table.
--
--   THE CHANGE DETECTION (same trigger). If abstained_dimensions is not compared, a lead could turn
--   an expert's recorded abstention into a lead-supplied score with NO reason required, because
--   nothing the trigger watches would have changed.
--
--   THE REASSIGNMENT CLEAR (20260839's function). It nulls every dimension when a draft moves to a
--   new contributor. Leaving abstained_dimensions populated would carry "the previous person could
--   not judge this" forward under the new person's name — the exact false attribution that function's
--   header explains the clearing exists to prevent.
--
--
-- DEPLOY: Lisa hand-runs this after 20260840. Re-runnable. Screen B needs a small client change to
-- send the new parameters; the column defaults to empty, so the migration is safe to run before it.

begin;

-- =====================================================================
-- 1. The column and its four guards
-- =====================================================================
alter table public.materiality_impact_determinations
  add column if not exists abstained_dimensions text[] not null default '{}'::text[];

alter table public.materiality_impact_assignee_determinations
  add column if not exists abstained_dimensions text[];

do $$
begin
  -- ⚠️ NOT OPTIONAL GARNISH. Without the domain check a typo — 'scal' for 'scale' — stores cleanly
  -- and records nothing, which is precisely the silent loss this migration exists to end.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_abstention_domain') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_abstention_domain
      check (abstained_dimensions
             <@ array['scale', 'scope', 'irremediability', 'likelihood']::text[]);
  end if;

  -- ⚠️ THE WRONG STATE MADE UNSTORABLE, not merely undisplayed. An abstention that also carries a
  -- score is the one combination that would let "I could not judge this" become a number.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_abstention_excludes_value') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_abstention_excludes_value
      check (('scale'           <> all(abstained_dimensions) or scale           is null)
         and ('scope'           <> all(abstained_dimensions) or scope           is null)
         and ('irremediability' <> all(abstained_dimensions) or irremediability is null)
         and ('likelihood'      <> all(abstained_dimensions) or likelihood      is null));
  end if;

  -- ESRS 1 ¶41 again, and it has to be said again: a dimension that is never ASKED cannot be
  -- abstained on either. Abstention is an answer to a question, and there is no question here.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_determinations'::regclass
                    and conname  = 'materiality_impact_determinations_abstention_respects_p41') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_abstention_respects_p41
      check ((direction = 'negative' or 'irremediability' <> all(abstained_dimensions))
         and (coalesce(nature, '') = 'potential' or 'likelihood' <> all(abstained_dimensions)));
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.materiality_impact_assignee_determinations'::regclass
                    and conname  = 'materiality_impact_assignee_determinations_abst_domain') then
    alter table public.materiality_impact_assignee_determinations
      add constraint materiality_impact_assignee_determinations_abst_domain
      check (abstained_dimensions is null or abstained_dimensions
             <@ array['scale', 'scope', 'irremediability', 'likelihood']::text[]);
  end if;
end $$;

comment on column public.materiality_impact_determinations.abstained_dimensions is
  'Which dimensions the determiner recorded as "not enough visibility to assess" — spec §6.1''s fourth answer, a RECORDED ANSWER and never a zero and never a low. Membership is the record. Permitted values are scale / scope / irremediability / likelihood, enforced by _abstention_domain because a typo would otherwise store cleanly and record nothing. A named dimension must be null (_abstention_excludes_value), so an abstention can never also carry a score. ⚠️ THIS COLUMN EXISTS BECAUSE `status` ALONE WAS NOT ENOUGH: on a draft, a null dimension was indistinguishable from one nobody had reached, so a contributor''s saved abstention came back unselected. Third instance of the null-means-two-things defect in this module — see 20260837 and 20260838.';
comment on column public.materiality_impact_assignee_determinations.abstained_dimensions is
  'The contributor''s abstentions, frozen with the rest of their determination at the first override. Nullable, unlike the parent: rows written before 20260841 have no record either way, and defaulting them to ''{}'' would assert that the expert answered every dimension when nothing knows whether they did.';


-- =====================================================================
-- 2. The lock — snapshot it, and notice when it changes
-- =====================================================================
create or replace function public.materiality_impact_determination_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if TG_OP = 'INSERT' then
    if NEW.overridden_at is not null then
      raise exception 'A determination cannot be created as already overridden.'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  if OLD.status <> 'submitted' or OLD.assignment_id is null then
    NEW.overridden_at   := OLD.overridden_at;
    NEW.override_reason := OLD.override_reason;
    return NEW;
  end if;

  if NEW.status <> 'submitted' then
    raise exception
      'This determination was submitted by a contributor and cannot be returned to draft. Change '
      'the values directly, giving a reason — the contributor''s determination is kept and both '
      'appear in the report.'
      using errcode = 'check_violation';
  end if;

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
    -- ⚠️ ADDED 20260841, AND ITS ABSENCE WAS A HOLE. Turning an expert's recorded "I could not
    -- judge this" into a lead-supplied null — or clearing the abstention so the blank reads as
    -- unanswered — changes what the report says the contributor concluded. Without this comparison
    -- it required no reason and left no trace.
    or NEW.abstained_dimensions is distinct from OLD.abstained_dimensions
    or NEW.value_chain_position is distinct from OLD.value_chain_position
    or NEW.time_horizon         is distinct from OLD.time_horizon
    or NEW.rationale            is distinct from OLD.rationale;

  if not v_changed then
    NEW.overridden_at := OLD.overridden_at;
    return NEW;
  end if;

  if NEW.override_reason is null or length(btrim(NEW.override_reason)) = 0 then
    raise exception
      'Changing a contributor''s submitted determination requires a reason. It is recorded with '
      'the change and shown in the report beside what the contributor determined.'
      using errcode = 'check_violation';
  end if;

  insert into public.materiality_impact_assignee_determinations (
    assessment_id, subtopic_code, direction, user_id, assignment_id,
    nature, scale, scope, irremediability, likelihood,
    -- ⚠️ WITHOUT THIS, AN OVERRIDDEN ABSTENTION BECOMES A BLANK. The report would then show the
    -- lead's score beside an empty cell, implying the expert had no view — when they had explicitly
    -- recorded that they could not judge it. That is the worst misreading this table can produce.
    abstained_dimensions,
    value_chain_position, time_horizon, rationale, determined_at)
  values (
    OLD.assessment_id, OLD.subtopic_code, OLD.direction, OLD.user_id, OLD.assignment_id,
    OLD.nature, OLD.scale, OLD.scope, OLD.irremediability, OLD.likelihood,
    OLD.abstained_dimensions,
    OLD.value_chain_position, OLD.time_horizon, OLD.rationale, OLD.determined_at)
  on conflict (assessment_id, subtopic_code, direction) do nothing;

  NEW.overridden_at := now();
  return NEW;
end $$;


-- =====================================================================
-- 3. Reassignment — clear the abstentions with everything else
-- =====================================================================
create or replace function public.materiality_impact_reassign_subtopic(
  p_assessment_id    uuid,
  p_subtopic_code    text,
  p_to_assignment_id uuid)
returns int
language plpgsql
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

  update public.materiality_impact_assignment_subtopics s
     set assignment_id = p_to_assignment_id
   where s.assessment_id = p_assessment_id
     and s.subtopic_code = p_subtopic_code;

  if not found then
    raise exception 'That sub-topic is not assigned in this assessment, or it belongs to another account.'
      using errcode = 'no_data_found';
  end if;

  update public.materiality_impact_determinations d
     set assignment_id        = p_to_assignment_id,
         evidence_in_view     = false,
         nature               = null,
         scale                = null,
         scope                = null,
         irremediability      = null,
         likelihood           = null,
         -- ⚠️ ADDED 20260841. Left populated, this would carry "the previous contributor could not
         -- judge this" forward under the NEW contributor's name — the false attribution the whole
         -- clearing exists to prevent, wearing the one shape the clearing did not cover.
         abstained_dimensions = '{}'::text[],
         value_chain_position = '{}'::text[],
         time_horizon         = null,
         rationale            = null,
         determined_at        = null
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code;

  get diagnostics v_cleared = row_count;
  return v_cleared;
end $$;


-- =====================================================================
-- 4. The projection — return what was recorded
-- =====================================================================
create or replace function public.impact_determination_json(
  p_assessment_id uuid, p_subtopic_code text, p_direction text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nature',               d.nature,
           'scale',                d.scale,
           'scope',                d.scope,
           'irremediability',      d.irremediability,
           'likelihood',           d.likelihood,
           -- to_jsonb on named array COLUMNS, never on a table row. See 20260840's header.
           'abstained_dimensions', to_jsonb(d.abstained_dimensions),
           'value_chain_position', to_jsonb(d.value_chain_position),
           'time_horizon',         d.time_horizon,
           'rationale',            d.rationale,
           'status',               d.status)
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;
$$;


-- =====================================================================
-- 5. The save function — rationale, and the abstentions
-- =====================================================================
-- ⚠️ STILL NO override_reason PARAMETER, AND STILL NEVER. 20260840's header explains why at length:
-- its absence is what makes 20260839's lock fail closed on a post-submit contributor write, with no
-- role introspection anywhere. Adding p_rationale does not weaken that and must not be read as
-- precedent for adding the other.
create or replace function public.impact_save_determination(
  p_token                uuid,
  p_subtopic_code        text,
  p_direction            text,
  p_nature               text,
  p_scale                smallint,
  p_scope                smallint,
  p_irremediability      smallint,
  p_likelihood           smallint,
  p_abstained_dimensions text[],
  p_value_chain_position text[],
  p_time_horizon         text,
  p_rationale            text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v_existing      text;
  v_abst          text[];
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  if p_direction is null or p_direction not in ('negative', 'positive') then
    raise exception
      'direction must be negative or positive. Every sub-topic is determined both ways and the two '
      'are never netted against each other (ESRS 1 para 44).';
  end if;

  if p_nature is not null and p_nature not in ('actual', 'potential') then
    raise exception 'nature must be actual or potential, or null while the answer is unfinished.';
  end if;

  if p_scale           is not null and p_scale           not between 1 and 4
  or p_scope           is not null and p_scope           not between 1 and 4
  or p_irremediability is not null and p_irremediability not between 1 and 4
  or p_likelihood      is not null and p_likelihood      not between 1 and 4 then
    raise exception
      'Severity dimensions are scored 1-4 (spec §5.3), or recorded as "not enough visibility to '
      'assess" (§6.1). A value outside that range cannot be stored.';
  end if;

  v_abst := coalesce(p_abstained_dimensions, '{}'::text[]);

  if not (v_abst <@ array['scale', 'scope', 'irremediability', 'likelihood']::text[]) then
    raise exception
      'abstained_dimensions may name only scale, scope, irremediability or likelihood.';
  end if;

  -- ⚠️ REFUSED, NOT RECONCILED. If a dimension arrives with both a score and an abstention, the two
  -- contradict and there is no correct one to keep. Dropping either would be this module choosing
  -- what the determiner meant — see the ¶41 refusals below, same principle.
  if ('scale'           = any(v_abst) and p_scale           is not null)
  or ('scope'           = any(v_abst) and p_scope           is not null)
  or ('irremediability' = any(v_abst) and p_irremediability is not null)
  or ('likelihood'      = any(v_abst) and p_likelihood      is not null) then
    raise exception
      'A dimension cannot be both scored and recorded as "not enough visibility to assess". '
      'Nothing was saved — send one or the other.';
  end if;

  -- ⚠️ ¶41, REFUSED RATHER THAN SILENTLY DROPPED — for the abstention as well as for the value. A
  -- dimension that is never asked cannot be abstained on: there is no question to decline.
  if p_direction = 'positive' and (p_irremediability is not null or 'irremediability' = any(v_abst)) then
    raise exception
      'A positive impact carries no irremediability — there is nothing to remediate (ESRS 1 para '
      '41). Your answer was not saved rather than being quietly dropped; remove it and save again.';
  end if;

  if p_nature = 'actual' and (p_likelihood is not null or 'likelihood' = any(v_abst)) then
    raise exception
      'An impact that is already happening carries no likelihood (ESRS 1 para 41). Applying one to '
      'an actual impact understates its severity. Your answer was not saved rather than being '
      'quietly dropped; remove it and save again.';
  end if;

  if not exists (
    select 1 from public.materiality_impact_assignment_subtopics s
     where s.assignment_id = v_assignment_id
       and s.subtopic_code = p_subtopic_code) then
    raise exception
      'That sub-topic is not part of your assignment. Reload the page — it may have been reassigned.'
      using errcode = 'no_data_found';
  end if;

  select d.status into v_existing
    from public.materiality_impact_determinations d
   where d.assessment_id = v_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;

  if v_existing = 'submitted' then
    raise exception
      'This determination has already been submitted and cannot be changed here.'
      using errcode = 'PT410';
  end if;

  insert into public.materiality_impact_determinations (
    assessment_id, user_id, subtopic_code, standard_version, direction,
    nature, scale, scope, irremediability, likelihood,
    abstained_dimensions, value_chain_position, time_horizon, rationale,
    evidence_in_view, assignment_id, status)
  values (
    v_assessment_id, v_user_id, p_subtopic_code, v_version, p_direction,
    p_nature, p_scale, p_scope, p_irremediability, p_likelihood,
    v_abst, coalesce(p_value_chain_position, '{}'::text[]), p_time_horizon, p_rationale,
    false, v_assignment_id, 'draft')
  on conflict (assessment_id, subtopic_code, direction) do update
     set nature               = excluded.nature,
         scale                = excluded.scale,
         scope                = excluded.scope,
         irremediability      = excluded.irremediability,
         likelihood           = excluded.likelihood,
         abstained_dimensions = excluded.abstained_dimensions,
         value_chain_position = excluded.value_chain_position,
         time_horizon         = excluded.time_horizon,
         rationale            = excluded.rationale,
         assignment_id        = excluded.assignment_id,
         evidence_in_view     = false;
end $$;

comment on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text[], text, text) is
  'Saves ONE sub-topic in ONE direction as a draft. ⚠️ HAS NO override_reason PARAMETER AND MUST NEVER GAIN ONE — its absence is what makes 20260839''s lock fail closed on a post-submit contributor write. Records abstentions explicitly in abstained_dimensions rather than as a bare null, so "I could not judge this" survives a page reload and is distinguishable from a question nobody reached. Refuses rather than silently dropping: a dimension both scored and abstained, an irremediability on a positive impact, a likelihood on an actual one — including the abstention forms of the last two, because a dimension that is never asked cannot be declined either.';

-- ⚠️ THE OLD TEN-ARGUMENT SIGNATURE IS DROPPED, NOT LEFT BESIDE THE NEW ONE. Postgres would keep
-- both as overloads, PostgREST would resolve by argument names, and a client still sending the old
-- shape would silently write determinations whose abstentions and rationale were dropped on every
-- save — a working call that quietly discards data, which is the exact failure this file fixes.
drop function if exists public.impact_save_determination(
  uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text);

revoke all on function public.impact_save_determination(
  uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text[], text, text) from public;
grant execute on function public.impact_save_determination(
  uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text[], text, text) to anon, authenticated;

commit;


-- =====================================================================
-- VERIFY — run after, separately.
-- =====================================================================
--
--  1) The old signature is GONE and exactly one remains:
--     select oid::regprocedure from pg_proc where proname = 'impact_save_determination';
--     -- expect exactly one row, the twelve-argument form
--
--  2) ⚠️ AN ABSTENTION CANNOT CARRY A SCORE. Expect REJECTED:
--     update public.materiality_impact_determinations
--        set scale = 3, abstained_dimensions = '{scale}'
--      where assessment_id = '<id>' and subtopic_code = 'E2.1' and direction = 'negative';
--     -- expect materiality_impact_determinations_abstention_excludes_value
--
--  3) A typo is refused rather than silently recording nothing. Expect REJECTED:
--     update public.materiality_impact_determinations set abstained_dimensions = '{scal}' where ...;
--     -- expect materiality_impact_determinations_abstention_domain
--
--  4) ¶41 covers the abstention too. Both expected REJECTED:
--     update ... set abstained_dimensions = '{irremediability}' where direction = 'positive';
--     update ... set abstained_dimensions = '{likelihood}'      where nature = 'actual';
--
--  5) THE THREE STATES ARE NOW DISTINGUISHABLE ON A DRAFT — the whole point:
--     select subtopic_code, direction, scale, abstained_dimensions,
--            case when scale is not null then 'answered'
--                 when 'scale' = any(abstained_dimensions) then 'could not judge'
--                 else 'not reached' end as state
--       from public.materiality_impact_determinations where assessment_id = '<id>';
--
--  6) ⚠️ THE SNAPSHOT CARRIES THE ABSTENTION. With a submitted delegated determination that
--     abstained on scale, override it and check the companion:
--     update public.materiality_impact_determinations
--        set scale = 3, override_reason = 'Site visit gave us the visibility they lacked.'
--      where assessment_id = '<id>' and subtopic_code = 'S1.3' and direction = 'negative';
--     select scale, abstained_dimensions from public.materiality_impact_assignee_determinations
--      where assessment_id = '<id>' and subtopic_code = 'S1.3' and direction = 'negative';
--     -- expect scale NULL and abstained_dimensions {scale} — NOT an empty array, which would
--     -- report the expert as having had no view rather than having recorded that they had none
--
--  7) ⚠️ CLEARING AN ABSTENTION IS AN OVERRIDE AND NEEDS A REASON. Expect REJECTED:
--     update public.materiality_impact_determinations set abstained_dimensions = '{}'
--      where <a submitted delegated row that abstained>;
--     -- expect: Changing a contributor's submitted determination requires a reason.
--
--  8) Reassignment clears them:
--     select public.materiality_impact_reassign_subtopic('<assessment>', 'E2.1', '<assignment-b>');
--     select abstained_dimensions from public.materiality_impact_determinations
--      where assessment_id = '<assessment>' and subtopic_code = 'E2.1';
--     -- expect {} on every row
