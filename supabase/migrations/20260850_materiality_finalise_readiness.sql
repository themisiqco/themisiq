-- supabase/migrations/20260850_materiality_finalise_readiness.sql
-- ONE readiness rule, three callers. Extracts the scope and outstanding queries out of
-- materiality_finalise so the worksheet can show what is outstanding BEFORE anyone clicks, and so
-- the button's enabled state comes from the same query that would refuse the call.
--
-- WHY THIS MATTERS MORE HERE THAN IT DID FOR THE WIZARD. lib/climate/wizardSteps.ts extracted a
-- gate and its explanation because two pieces of TypeScript could drift and a test could bind them.
-- Here one copy would be SQL and the other TypeScript, and NO TEST CAN BIND THEM — vitest has no
-- database and this repo has no schema-derived types. The only way the screen and the refusal
-- cannot disagree is for there to be one query, called by both.
--
-- ⚠️ RUN AFTER 20260849. This file CREATE OR REPLACEs materiality_finalise.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260850_materiality_finalise_readiness.sql
-- Without it psql continues past a failed statement and still exits 0, so materiality_finalise
-- could be replaced while the helpers it now calls were not created. The Supabase SQL editor stops
-- on error by default. Either way this file is wrapped in begin/commit.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable throughout.

begin;

-- =====================================================================
-- 1. Scope — the one definition
-- =====================================================================
-- ⚠️ THIS FUNCTION DOES NOT CHECK OWNERSHIP, DELIBERATELY, AND NO CALLER MAY RELY ON IT DOING SO.
-- materiality_finalise and materiality_finalise_readiness both check it themselves, immediately,
-- with the same message. A helper that re-checked would either duplicate that refusal — two places
-- to change one sentence — or, worse, tempt a future caller to skip their own on the grounds that
-- "the helper handles it". Ownership is the caller's job. This function's job is scope.
--
-- ⚠️ SECURITY INVOKER, AND THAT IS THE COUNTERPART TO THE ABOVE. A function that neither checks
-- ownership NOR respects RLS would hand any authenticated caller the scope of any assessment id
-- they could guess, and execute IS granted to authenticated. As INVOKER: called from the two
-- SECURITY DEFINER functions it runs as their owner and sees everything, which those functions have
-- earned by checking ownership first; called directly by authenticated, RLS applies and the caller
-- sees only their own rows. A helper forbidden from checking ownership must not bypass RLS either —
-- the two rules are the same rule.
--
-- ⚠️ plpgsql, NOT sql, SOLELY SO IT CAN REFUSE A NULL VERSION. The second arm below returns nothing
-- for a null standard_version, so with no round linked the scope would come back EMPTY — and a
-- caller reading an empty scope concludes "nothing outstanding", therefore "ready to finalise".
-- That failure is silent and points the WRONG WAY: it says go where it should say stop. This
-- function is granted to authenticated and is directly callable, so it must refuse a question it
-- cannot answer rather than answer it wrongly. A `language sql` body cannot raise, which is the
-- only reason this is plpgsql.
--
-- ⚠️ THE VERSION IS AN ARGUMENT, NOT A LOOKUP. Reading it here would reintroduce the same hazard by
-- another route. Passing it makes the dependency explicit at every call site, and both entry points
-- have already refused a null version before they get here — so the raise below protects DIRECT
-- callers, which is exactly who it is for.
create or replace function public.materiality_finalise_scope(
  p_assessment_id uuid,
  p_standard_version text)
returns table (subtopic_code text)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_standard_version is null then
    raise exception
      'materiality_finalise_scope was called with no standard version. Scope for an assessment '
      'with no linked survey round is drawn from mr_esrs_subtopics for a STATED version; with '
      'none, this function would return an empty scope, and a caller reading that would conclude '
      'there is nothing outstanding and therefore that the assessment is ready to finalise. '
      'Refusing rather than answering wrongly. Establish the version first — materiality_finalise '
      'and materiality_finalise_readiness both do.'
      using errcode = 'null_value_not_allowed';
  end if;

  return query
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  )
  select q.subtopic_code
    from public.materiality_survey_questions q
    join linked l on l.round_id = q.round_id
   where q.status = 'included'
     and q.subtopic_code is not null
  union
  select s.code
    from public.mr_esrs_subtopics s
   where s.standard_version = p_standard_version
     and not exists (select 1 from linked);
end $$;

-- =====================================================================
-- 2. Outstanding — scope, both directions, not submitted
-- =====================================================================
-- ⚠️ STAYS `language sql`. It has nothing of its own to refuse: it calls materiality_finalise_scope
-- in its FROM clause, so a null version raises there and the exception propagates through here to
-- the caller. One refusal, at the point that owns the hazard.
--
-- ⚠️ SUBMITTED, NOT COMPLETE, AND NOBODY SHOULD TIGHTEN THIS. A submitted determination may carry
-- every dimension null: "this is an actual negative impact and I cannot judge its scale" is a §6.1
-- abstention and a real answer, guaranteed coherent by
-- materiality_impact_determinations_submitted_is_complete. lib/materiality/boardReport.ts renders
-- exactly that state. Requiring completeness would refuse assessments the report handles correctly
-- and would quietly redefine an abstention as an omission.
--
-- ⚠️ ASSIGNMENT STATUS IS NOT CONSULTED, AND THAT IS NOT AN OVERSIGHT. impact_submit writes the
-- determinations first and the assignment second — deliberately, because reversing it would make
-- resolve_token refuse before the rows were flipped. So a determination can legitimately be
-- submitted while its assignment is still in_progress, and 'expired' is a derived condition no
-- writer sets. Gating on it would let a token-lifecycle detail block a fully determined assessment.
--
-- ⚠️ BOTH DIRECTIONS, ALWAYS. A sub-topic submitted for harm and not for benefit is not finished,
-- and a query joining only to rows that exist would call it so.
--
-- Ownership and INVOKER: as for materiality_finalise_scope above. Same reasoning, unchanged.
create or replace function public.materiality_finalise_outstanding(
  p_assessment_id uuid,
  p_standard_version text)
returns table (subtopic_code text, direction text)
language sql
stable
security invoker
set search_path = public
as $$
  select sc.subtopic_code, dir.direction
    from public.materiality_finalise_scope(p_assessment_id, p_standard_version) sc
    cross join (values ('negative'), ('positive')) as dir(direction)
    left join public.materiality_impact_determinations d
      on d.assessment_id = p_assessment_id
     and d.subtopic_code = sc.subtopic_code
     and d.direction     = dir.direction
   where d.assessment_id is null
      or d.status <> 'submitted'
   order by sc.subtopic_code, dir.direction;
$$;

-- =====================================================================
-- 3. materiality_finalise — same refusals, same order, same messages
-- =====================================================================
-- ⚠️ THE ONLY CHANGE FROM 20260849 IS THAT REFUSALS 4 AND 5 READ FROM THE HELPERS. This body was
-- rebuilt from that migration's verbatim, with the inline scope CTE and both-directions join
-- replaced by two function calls; every other executable statement AND its comments are unchanged.
-- What did move is the reasoning that explained the inline query — scope-wide not `held`, submitted
-- not complete, assignment status ignored — which now lives on the helpers, with the code it
-- explains. Read the two side by side before changing either.
create or replace function public.materiality_finalise(p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_missing     text;
  v_no          int;
  v_at          timestamptz;
  v_prev        int;
  v_changed     boolean;
  v_rows        int;
begin
  -- ── 1. Ownership ────────────────────────────────────────────────────────────────────────────
  -- Same shape as materiality_lead_submit: a missing assessment and someone else's are deliberately
  -- NOT told apart, because saying which would confirm whose work is stored under that id.
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  -- ── 2. The version must be stated ───────────────────────────────────────────────────────────
  -- ⚠️ NO FALLBACK TO esrs_2023, AND THAT IS THE POINT OF REFUSING RATHER THAN DEFAULTING. Article
  -- 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state which version it applied.
  -- Freezing one standard's requirements under another standard's name would be a false statement
  -- that survives in an archive — and ESRS (2026) renumbered the DRs, so 49 codes exist under both
  -- versions with different titles. That is not a stale-label problem, it is the wrong requirement
  -- under the right code. api/materiality/route.ts may fall back only because drResolutionNote
  -- discloses the fallback on the report's face; nothing here would.
  --
  -- 20260848 permits a null standard_version on the row because a table should not enforce a rule
  -- this function owns. This is where it is owned.
  if v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, so there is no set '
      'of disclosure requirements to freeze. Article 2(2) of Del. Reg. C(2026) 5010 requires the '
      'undertaking to state the version, and assuming one would be a false statement about which '
      'law was applied. State the version on the assessment, then finalise.';
  end if;

  -- ── 3. Requirements must exist for that version ─────────────────────────────────────────────
  -- ⚠️ CHECKED BEFORE READINESS, ON PURPOSE. esrs_2023_reliefs is a permitted value with NO rows in
  -- mr_esrs_disclosure_requirements (20260817's own verification block: "expect exactly:
  -- esrs_2023 | 61 and esrs_2026 | 64"). Without this, such an assessment would finalise, copy
  -- nothing, and leave a record asserting "these were the requirements in force" when none were —
  -- which a later reader cannot tell from a copy that failed. An empty result is a result and must
  -- be reported as one.
  --
  -- Before readiness because a preparer on an unseeded version can NEVER finalise until it is
  -- seeded, and finding that out after determining 37 sub-topics would be the wrong order.
  select count(*) into v_req_count
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  if v_req_count = 0 then
    raise exception
      'No disclosure requirements are held for %, so finalising would freeze an empty set and '
      'record it as though it were the requirements in force. This is a gap in the platform''s '
      'reference data, not in your assessment, and nothing you can do on this screen will change '
      'it. Tell us and we will seed them.', v_version;
  end if;

  -- ── Refusals 4 and 5 — SAME RULE, NOW FROM THE HELPERS ─────────────────────────────────────
  -- The scope CTE and the both-directions join that stood here are now
  -- materiality_finalise_scope and materiality_finalise_outstanding, so the worksheet's readiness
  -- card and this refusal read the SAME query. A TypeScript copy could not be bound to a SQL one by
  -- any test in this repo — vitest has no database — so one query called by both is the only way
  -- they cannot disagree. The reasoning that stood here (scope-wide not `held`; submitted not
  -- complete; assignment status ignored) moved with the code and lives on those two functions.
  select count(*) into v_scope_n
    from public.materiality_finalise_scope(p_assessment_id, v_version);

  -- Guarded separately, and still necessary: materiality_finalise_outstanding over an empty scope
  -- returns no rows, so string_agg below would be NULL — which would read as "nothing
  -- outstanding" and finalise an assessment with no sub-topics at all.
  if v_scope_n = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
      'linked survey round has no included questions, or no sub-topics are recorded for %.',
      v_version;
  end if;

  select string_agg(o.subtopic_code || ' (' || o.direction || ')', ', '
                    order by o.subtopic_code, o.direction)
    into v_missing
    from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

  -- ⚠️ NAMED, NOT COUNTED. materiality_lead_submit does the same at 20260844:117-136 and for the
  -- same reason: a caller told "3 outstanding" must go and find them, and a caller told which three
  -- can finish. Both directions of every sub-topic are listed, because a sub-topic submitted for
  -- harm and not for benefit is not finished.
  if v_missing is not null then
    raise exception
      'These are not submitted yet: %. Every sub-topic in scope must be submitted — once for harm '
      'and once for benefit — by whoever determined it, before the assessment can be finalised. '
      'Contributors submit theirs from their own link.', v_missing;
  end if;

  -- ── The write ───────────────────────────────────────────────────────────────────────────────
  -- version is omitted: materiality_finalisation_allocate_version assigns it under a per-assessment
  -- advisory lock, and refuses a caller-supplied one.
  --
  -- user_id is passed explicitly rather than left to its default. The default IS auth.uid() and
  -- would be correct — SECURITY DEFINER changes the executing role, not the JWT claim the helper
  -- reads — but this value was already selected under `a.user_id = auth.uid()` above, so passing it
  -- makes the composite FK check a real second assertion rather than a restatement of the default.
  insert into public.materiality_finalisations (assessment_id, user_id, standard_version)
  values (p_assessment_id, v_user_id, v_version)
  returning version, finalised_at into v_no, v_at;

  insert into public.materiality_finalisation_requirements
    (assessment_id, version, user_id, dr_code, topic_code, title, datapoints, sort_order)
  select p_assessment_id, v_no, v_user_id,
         r.dr_code, r.topic_code, r.title, r.datapoints, r.sort_order
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  get diagnostics v_rows = row_count;

  -- Checked, not assumed. v_req_count proved rows exist a moment ago, so a zero here would mean
  -- something changed underneath this transaction — worth failing on rather than returning a
  -- finalisation with an empty requirement set.
  if v_rows = 0 then
    raise exception
      'The requirements could not be copied, so nothing has been finalised. Nothing is lost — try '
      'again, and tell us if it keeps happening.';
  end if;

  -- ── Was anything different from last time? ──────────────────────────────────────────────────
  -- ⚠️ NULL ON THE FIRST VERSION, NEVER false. "There was nothing to compare against" and "nothing
  -- changed" are different facts, and collapsing them would let a UI print "no change since the
  -- previous version" on a first finalisation that has no previous version.
  select max(f.version) into v_prev
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
     and f.version < v_no;

  if v_prev is null then
    v_changed := null;
  else
    -- Symmetric difference over the copied columns. EXCEPT ALL treats NULL as equal to NULL, which
    -- is what is wanted: datapoints is null on every esrs_2026 row and two nulls are not a change.
    select count(*) > 0 into v_changed
      from (
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev)
        union all
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no)
      ) diff;
  end if;

  return jsonb_build_object(
    'version',              v_no,
    'previous_version',     v_prev,
    'standard_version',     v_version,
    'finalised_at',         v_at,
    'requirements',         v_rows,
    'requirements_changed', v_changed
  );
end $$;

-- =====================================================================
-- 4. Readiness — READ ONLY
-- =====================================================================
-- ⚠️ WRITES NOTHING. It exists so a screen can render the finalise card without guessing and
-- without a second round trip.
--
-- ⚠️ `reason` IS A CLOSED DISCRIMINANT, NOT SOMETHING THE SCREEN INFERS. Given only the data fields
-- a screen would have to reproduce the precedence below — version, then requirements, then scope,
-- then outstanding — to know which card to draw. That is a second copy of the decision, in
-- TypeScript, which is the drift this whole file exists to remove. One field, decided here.
--     'version_not_stated' | 'no_requirements_for_version' | 'no_scope' | 'outstanding_determinations'
-- and NULL when ready is true.
--
-- ⚠️ `message` IS THE REFUSAL'S OWN SENTENCE, VERBATIM, so a preparer who clicks Finalise on a
-- stale card gets the identical words they were already reading. THE COST IS FOUR DUPLICATED STRING
-- LITERALS between this function and materiality_finalise above, and that is stated rather than
-- hidden: they must be changed together. The collapse — materiality_finalise calling this function
-- and raising its message — was not taken because the refusals belong where the write is, and
-- inverting that would make the writer depend on the reader.
--
-- ⚠️ `latest` IS NULL WHEN NEVER FINALISED, never a version-0 stub. "Not finalised" and "finalised
-- as version 0" are different facts and a screen must not have to tell them apart by magic number.
create or replace function public.materiality_finalise_readiness(p_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_outstanding jsonb;
  v_count       int;
  v_latest      jsonb;
  v_ready       boolean := false;
  v_reason      text    := null;
  v_message     text    := null;
begin
  -- Ownership, checked exactly as materiality_finalise checks it, with the same sentence and the
  -- same refusal to tell the two cases apart.
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  -- The latest finalisation, if any. Returned whatever the readiness verdict: an assessment that
  -- has been finalised and has since gained outstanding work is a real state, and the card needs
  -- both halves to describe it.
  select jsonb_build_object(
           'version', f.version,
           'finalised_at', f.finalised_at,
           'standard_version', f.standard_version)
    into v_latest
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
   order by f.version desc
   limit 1;

  if v_version is null then
    v_reason  := 'version_not_stated';
    v_message := 'This assessment does not state which ESRS version it was prepared under, so '
               'there is no set of disclosure requirements to freeze. Article 2(2) of Del. Reg. '
               'C(2026) 5010 requires the undertaking to state the version, and assuming one would '
               'be a false statement about which law was applied. State the version on the '
               'assessment, then finalise.';
  else
    select count(*) into v_req_count
      from public.mr_esrs_disclosure_requirements r
     where r.standard_version = v_version;

    select count(*) into v_scope_n
      from public.materiality_finalise_scope(p_assessment_id, v_version);

    select coalesce(jsonb_agg(jsonb_build_object(
             'subtopic_code', o.subtopic_code, 'direction', o.direction)
             order by o.subtopic_code, o.direction), '[]'::jsonb),
           count(*)
      into v_outstanding, v_count
      from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

    if v_req_count = 0 then
      v_reason  := 'no_requirements_for_version';
      v_message := format(
        'No disclosure requirements are held for %s, so finalising would freeze an empty set and '
        'record it as though it were the requirements in force. This is a gap in the platform''s '
        'reference data, not in your assessment, and nothing you can do on this screen will change '
        'it. Tell us and we will seed them.', v_version);
    elsif v_scope_n = 0 then
      v_reason  := 'no_scope';
      v_message := format(
        'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
        'linked survey round has no included questions, or no sub-topics are recorded for %s.',
        v_version);
    elsif v_count > 0 then
      v_reason  := 'outstanding_determinations';
      v_message := format(
        'These are not submitted yet: %s. Every sub-topic in scope must be submitted — once for '
        'harm and once for benefit — by whoever determined it, before the assessment can be '
        'finalised. Contributors submit theirs from their own link.',
        (select string_agg(e->>'subtopic_code' || ' (' || (e->>'direction') || ')', ', ')
           from jsonb_array_elements(v_outstanding) e));
    else
      v_ready := true;
    end if;
  end if;

  return jsonb_build_object(
    'ready',                  v_ready,
    'reason',                 v_reason,
    'message',                v_message,
    'outstanding',            coalesce(v_outstanding, '[]'::jsonb),
    'outstanding_count',      coalesce(v_count, 0),
    'scope_count',            coalesce(v_scope_n, 0),
    'standard_version',       v_version,
    'requirements_available', coalesce(v_req_count, 0),
    'latest',                 v_latest
  );
end $$;

-- =====================================================================
-- 5. Comments and grants
-- =====================================================================
comment on function public.materiality_finalise_scope(uuid, text) is
  'The sub-topics in scope for an assessment: the earliest linked round''s included questions, or mr_esrs_subtopics for the given standard version when no round is linked. ONE DEFINITION, three callers — materiality_finalise, materiality_finalise_outstanding and materiality_finalise_readiness — because the screen''s readiness and the RPC''s refusal must not be able to disagree, and no vitest can bind a TypeScript copy to a SQL one. RAISES on a null standard version rather than returning an empty scope, because an empty scope reads as "nothing outstanding" and therefore "ready to finalise" — a silent failure pointing the wrong way, on a function granted to authenticated and directly callable. DOES NOT CHECK OWNERSHIP: both entry points do, and a helper that re-checked would tempt a caller to skip theirs. SECURITY INVOKER for the same reason — a function that checks neither ownership nor RLS would expose any assessment id that could be guessed.';

comment on function public.materiality_finalise_outstanding(uuid, text) is
  'Every (sub-topic, direction) in scope that is not yet submitted. Submitted, NOT complete: a §6.1 abstention with every dimension null is a real answer the board report renders, and requiring completeness would refuse assessments the report handles correctly. Assignment status is not consulted — impact_submit writes determinations before the assignment, so submitted work under an in_progress assignment is normal. Both directions always: a sub-topic submitted for harm and not for benefit is not finished. Has nothing of its own to refuse: a null standard version raises inside materiality_finalise_scope and propagates through here.';

comment on function public.materiality_finalise_readiness(uuid) is
  'READ ONLY. Everything a screen needs to render the finalise card without a second query and without inferring anything: ready, a closed reason discriminant (version_not_stated | no_requirements_for_version | no_scope | outstanding_determinations, null when ready), the refusal''s own message verbatim so a stale click says the same words, the outstanding pairs NAMED, the scope and requirement counts, and the latest finalisation (version and finalised_at) or null when never finalised. Ownership is checked exactly as materiality_finalise checks it, with the two cases deliberately not told apart. Refusal precedence is decided HERE, not by the caller.';

revoke all on function public.materiality_finalise_scope(uuid, text)       from public;
revoke all on function public.materiality_finalise_outstanding(uuid, text) from public;
revoke all on function public.materiality_finalise_readiness(uuid)         from public;

grant execute on function public.materiality_finalise_scope(uuid, text)       to authenticated;
grant execute on function public.materiality_finalise_outstanding(uuid, text) to authenticated;
grant execute on function public.materiality_finalise_readiness(uuid)         to authenticated;

commit;
