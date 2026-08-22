-- supabase/migrations/20260849_materiality_finalise.sql
-- materiality_finalise — the writer for the tables 20260848 created.
--
-- ⚠️ RUN AFTER 20260848. This function is the ONLY thing that can write those tables: authenticated
-- holds SELECT on them and nothing else, deliberately, so that a finalisation cannot be fabricated
-- client-side with arbitrary requirement text.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260849_materiality_finalise.sql
-- Without it psql continues past a failed statement and still exits 0, so the function could land
-- while its grants did not — leaving an RPC nobody may execute. The Supabase SQL editor stops on
-- error by default. Either way this file is wrapped in begin/commit.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE OR REPLACE FUNCTION,
-- REVOKE/GRANT and COMMENT ON are all idempotent.

begin;

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

  -- ── 4 & 5. Readiness ────────────────────────────────────────────────────────────────────────
  -- ⚠️ SCOPE-WIDE, NOT materiality_lead_submit's `held`. That function narrows scope to what the
  -- lead holds directly and refuses outright when the lead holds nothing — 'Every one of the N
  -- sub-topics in scope is assigned to a contributor, so none of them is yours to submit.' A FULLY
  -- DELEGATED ASSESSMENT CAN THEREFORE NEVER SATISFY IT, which is precisely why this RPC exists.
  -- Here every sub-topic in scope must be submitted by WHOEVER determined it.
  --
  -- ⚠️ SUBMITTED, NOT COMPLETE, AND NOBODY SHOULD TIGHTEN THIS LATER. A submitted determination may
  -- carry every dimension null: "this is an actual negative impact and I cannot judge its scale" is
  -- a §6.1 abstention and a real answer, guaranteed coherent by
  -- materiality_impact_determinations_submitted_is_complete (direction, nature and determined_at
  -- are present). lib/materiality/boardReport.ts renders exactly that state — "not enough
  -- visibility to judge … — no severity". Requiring completeness here would refuse assessments the
  -- report handles correctly, and would quietly redefine an abstention as an omission.
  --
  -- ⚠️ ASSIGNMENT STATUS IS IGNORED, AND THAT IS NOT AN OVERSIGHT. impact_submit writes the
  -- determinations first and the assignment second — deliberately, because reversing it would make
  -- resolve_token refuse before the rows were flipped. So a determination can legitimately be
  -- submitted while its assignment is still in_progress, and 'expired' is a derived condition no
  -- writer sets at all. Gating on assignment status would let a token-lifecycle detail block a
  -- fully determined assessment. The assignment records WHO WAS INVITED; the determination records
  -- WHAT WAS DETERMINED, and only the second is what is being finalised.
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
  )
  select (select count(*) from scope),
         (select string_agg(m.subtopic_code || ' (' || m.direction || ')', ', '
                            order by m.subtopic_code, m.direction)
            from (
              select sc.subtopic_code, dir.direction
                from scope sc
                cross join (values ('negative'), ('positive')) as dir(direction)
                left join public.materiality_impact_determinations d
                  on d.assessment_id = p_assessment_id
                 and d.subtopic_code = sc.subtopic_code
                 and d.direction     = dir.direction
               where d.assessment_id is null
                  or d.status <> 'submitted'
            ) m)
    into v_scope_n, v_missing;

  -- Guarded separately: string_agg over an empty scope returns NULL, which would read as "nothing
  -- outstanding" and finalise an assessment with no sub-topics at all.
  if v_scope_n = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
      'linked survey round has no included questions, or no sub-topics are recorded for %.',
      v_version;
  end if;

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

comment on function public.materiality_finalise(uuid) is
  'Finalises an impact materiality assessment: writes one materiality_finalisations row (version allocated by trigger) and copies every mr_esrs_disclosure_requirements row for the assessment''s stated standard_version into materiality_finalisation_requirements. Refuses, in order and each naming what to do: not owned or absent (the two deliberately not told apart); no standard_version stated (Art. 2(2) — and NO fallback to esrs_2023, which would freeze one standard''s requirements under another''s name); no requirements held for that version (esrs_2023_reliefs has none, so this is checked BEFORE readiness — a preparer on that version can never finalise until it is seeded); no sub-topics in scope; and any sub-topic in scope not submitted in BOTH directions, NAMING which. Readiness is SCOPE-WIDE, not materiality_lead_submit''s `held` — that one refuses when the lead holds nothing, so a fully delegated assessment could never satisfy it. Submitted, NOT complete: a §6.1 abstention with every dimension null is a real answer the board report renders. Assignment status is ignored: impact_submit writes determinations before the assignment, so submitted work under an in_progress assignment is normal. A SECOND CALL IS A NEW VERSION, never a no-op — returns requirements_changed false when the copied set matches the previous version, and NULL on the first, because "nothing to compare" is not "nothing changed".';

revoke all on function public.materiality_finalise(uuid) from public;
grant execute on function public.materiality_finalise(uuid) to authenticated;

commit;
