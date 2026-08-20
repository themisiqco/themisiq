-- =====================================================================
-- materiality_lead_submit — the lead's counterpart to impact_submit
-- =====================================================================
-- Same meaning of "submitted", same completeness rule, different scope. A contributor submits the
-- sub-topics assigned to them; the lead submits everything that was NOT delegated.
--
-- ⚠️ SCOPE IS ENUMERATED, NEVER INFERRED FROM THE ROWS THAT EXIST. Twelve determinations across six
-- sub-topics while 37 are in scope is an unfinished worksheet, and a check that read only the
-- determination table would call it complete. Scope comes from the earliest linked round's included
-- questions, or from the reference set for the assessment's standard version when no round is
-- linked — matching what the worksheet screen shows, so the function and the screen cannot disagree
-- about what is outstanding.
--
-- ⚠️ NO TOKEN. Ownership is materiality_assessments.user_id = auth.uid(). A missing assessment and
-- someone else's assessment are deliberately NOT told apart: saying which would confirm that
-- another account holds work under that id.
CREATE OR REPLACE FUNCTION public.materiality_lead_submit(p_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id     uuid;
  v_version     text;
  v_linked      boolean;
  v_scope_codes text[];
  v_held_codes  text[];
  v_missing     text;
  v_rows        int;
begin
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

  select exists (
    select 1 from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id)
    into v_linked;

  -- ⚠️ NOT STATED IS A REAL STATE (20260816), never an assumed version. With no round linked there
  -- is nothing else to draw scope from, so this is a refusal rather than a default.
  if not v_linked and v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, and no survey round '
      'is linked to it, so there is no list of sub-topics to check against. Article 2(2) of Del. '
      'Reg. C(2026) 5010 requires the undertaking to state the version, and assuming one would be a '
      'false statement about which law was applied. State the version on the assessment first.';
  end if;

  -- Scope once, and what the lead holds within it. ⚠️ ONE PASS, kept in arrays, because the same
  -- set decides the completeness check AND which rows the UPDATE may touch — computing it twice
  -- would let the two drift apart within a single call.
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  ),
  scope as (
    select q.subtopic_code
      from public.materiality_survey_questions q
      join linked l on l.round_id = q.round_id
     where q.status = 'included'
       and q.subtopic_code is not null
    union
    select s.code
      from public.mr_esrs_subtopics s
     where s.standard_version = v_version
       and not exists (select 1 from linked)
  ),
  held as (
    select sc.subtopic_code
      from scope sc
     where not exists (
       select 1
         from public.materiality_impact_assignment_subtopics a
        where a.assessment_id = p_assessment_id
          and a.subtopic_code = sc.subtopic_code)
  )
  select (select array_agg(sc.subtopic_code order by sc.subtopic_code) from scope sc),
         (select array_agg(h.subtopic_code  order by h.subtopic_code)  from held  h)
    into v_scope_codes, v_held_codes;

  if coalesce(array_length(v_scope_codes, 1), 0) = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to submit. Either the linked '
      'survey round has no included questions, or no sub-topics are recorded for its standard '
      'version.';
  end if;

  if coalesce(array_length(v_held_codes, 1), 0) = 0 then
    raise exception
      'Every one of the % sub-topics in scope is assigned to a contributor, so none of them is '
      'yours to submit. Each is submitted by the person holding it, from their own link.',
      array_length(v_scope_codes, 1);
  end if;

  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every sub-topic the lead holds must carry BOTH directions with a nature. The dimensions may
  -- all be null. Refusing here rather than at the constraint means the lead is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  select string_agg(m.subtopic_code || ' (' || m.direction || ')', ', '
                    order by m.subtopic_code, m.direction)
    into v_missing
    from (
      select c.subtopic_code, dir.direction
        from unnest(v_held_codes) as c(subtopic_code)
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_impact_determinations d
          on d.assessment_id = p_assessment_id
         and d.subtopic_code = c.subtopic_code
         and d.direction     = dir.direction
       where d.assessment_id is null or d.nature is null
    ) m;

  if v_missing is not null then
    raise exception
      'These are not finished yet: %. Each sub-topic is determined twice — once for harm and once '
      'for benefit — and each needs to say whether it is already happening or might happen. The '
      'severity questions themselves can be left as "not enough visibility to assess".', v_missing;
  end if;

  -- ⚠️ RESTRICTED TO WHAT THE LEAD HOLDS, not merely to assignment_id is null. THE TWO ARE NOT THE
  -- SAME SET, and the subtopic_code line below is NOT redundant tidying: a sub-topic the lead
  -- started and then DELEGATED leaves a row with assignment_id null on a sub-topic that is now
  -- somebody else's. Such a row sits outside the completeness check above, which walks held
  -- sub-topics only — so without the restriction a half-finished row with no nature would be
  -- flipped to submitted and hit materiality_impact_determinations_submitted_is_complete,
  -- producing exactly the check_violation naming a column that the named-missing list exists to
  -- prevent. Deleting the line puts that back.
  update public.materiality_impact_determinations d
     set status        = 'submitted',
         determined_at = now()
   where d.assessment_id = p_assessment_id
     and d.assignment_id is null
     and d.subtopic_code = any(v_held_codes)
     and d.status = 'draft';

  get diagnostics v_rows = row_count;

  -- Checked, not assumed: an UPDATE matching no row raises nothing and returns nothing. Here zero
  -- can mean only ONE thing — every held determination was already submitted — because the
  -- completeness check above has just proved a row exists for both directions of every held
  -- sub-topic. The ambiguity is designed out rather than documented, so a caller reading
  -- {"submitted": 0} knows it was a repeat call and not a silent failure.
  return jsonb_build_object('submitted', v_rows);
end $function$;

comment on function public.materiality_lead_submit(uuid) is
  'The lead''s counterpart to impact_submit: flips every determination the lead holds directly to submitted. Scope is ENUMERATED from the earliest linked round''s included questions, or from mr_esrs_subtopics for the assessment''s standard_version when no round is linked, minus everything in materiality_impact_assignment_subtopics — never inferred from the determination rows that happen to exist, which would call a six-of-37 worksheet complete. Refuses while any held sub-topic lacks a direction-and-nature in either direction, NAMING which: the dimensions may be null (a §6.1 abstention is a real answer) but a determination with no stated nature is not a determination. Creates no assignment row — the lead has none, and inventing one would make their own work look delegated. Returns {"submitted": n}; n = 0 can only mean the work was already submitted.';

revoke all on function public.materiality_lead_submit(uuid) from public;
grant execute on function public.materiality_lead_submit(uuid) to authenticated;
