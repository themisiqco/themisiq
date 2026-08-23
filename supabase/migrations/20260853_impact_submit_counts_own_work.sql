-- supabase/migrations/20260853_impact_submit_counts_own_work.sql
-- impact_submit accepted a submission in which the contributor had recorded nothing, and then told
-- them so: "0 determinations recorded against your name" on a page headed "Thank you — that is
-- submitted". Reproduced in production 23 Aug 2026 — assignment ba169d39, 2 sub-topics, assignment
-- flipped to submitted, zero determination rows flipped.
--
-- ⚠️ WHY IT PASSED. The completeness gate (20260840:452-471) asked whether each assigned sub-topic
-- had both directions with a nature. It did not ask WHO MADE THEM. On that assessment E1.1 and E1.2
-- had already been determined by the LEAD on 20 Aug — assignment_id null, status submitted — and
-- the gate found those rows and passed. The UPDATE that follows filters on
-- `assignment_id = v_assignment_id and status = 'draft'`, matched nothing, so v_rows was 0 and the
-- contributor was thanked for work they had not done and could not do.
--
-- ⚠️ THREE CHANGES, ONE CREATE OR REPLACE, ONE DEPLOY. They are the same defect seen from three
-- distances, and shipping them separately would mean three replacements of one function and two
-- windows in which a contributor can still be thanked for nothing.
--
--   1. THE PREDICATE. The left join gains `and d.assignment_id = v_assignment_id`, so a row
--      belonging to anyone else no longer satisfies the gate. The existing exception message needs
--      no change: it already names exactly which sub-topics and directions are outstanding, and
--      after this change that list is correct where before it was empty.
--
--   2. THE EMPTY-ASSIGNMENT GUARD. (1) is not sufficient, because the gate PASSES VACUOUSLY on an
--      assignment holding no sub-topics: the subquery is empty, string_agg over no rows is NULL,
--      and v_missing is null for the same reason it is null when everything is finished. Two
--      opposite states, one value. That is reachable through the product, not only by hand —
--      materiality_impact_reassign_subtopic (20260839) moves a sub-topic to another assignment, so
--      a contributor invited with two can be left holding none, and resolve_token checks
--      revoked/expired/submitted but never scope. It gets its OWN message: "not finished yet" names
--      sub-topics, and here there are none to name.
--
--   3. THE RETURN SHAPE. {"submitted": n} alone forces the Thank-you page to infer a cause from a
--      bare zero, and it cannot: 0-because-nothing-was-assigned and 0-because-it-was-already-
--      submitted are different sentences owed to the contributor. Now {"submitted": n, "assigned":
--      k}, and the page branches on the pair instead of guessing. The count is one extra select
--      against a table already being read.
--
-- MIGRATION ONLY — the RPC is server-side and no client passes anything this reads. Re-runnable:
-- CREATE OR REPLACE, no DDL on tables, no grants (20260840:525 already grants execute to anon and
-- authenticated, and CREATE OR REPLACE preserves them).
--
--
-- =====================================================================
-- ⚠️ WHAT THIS DOES NOT FIX, STATED RATHER THAN PAPERED OVER
-- =====================================================================
-- After this change, a contributor assigned a sub-topic the LEAD HAS ALREADY DETERMINED is REFUSED,
-- and cannot get past the refusal on their own. The refusal is right — it is the truthful version
-- of what was previously a false confirmation — but it is a dead end, and calling it a fix would be
-- overstating it:
--
--   * impact_save_determination refuses to write over a submitted determination at all
--     (20260840:390, PT410 "This determination has already been submitted and cannot be changed
--     here"), so the contributor cannot supply the rows the gate now demands;
--   * and it could not be allowed to, because the upsert conflict target is
--     (assessment_id, subtopic_code, direction) (20260840:409). There is ONE row per sub-topic per
--     direction. The contributor's independent determination cannot COEXIST with the lead's — it
--     could only overwrite it, which is the audit-trail loss 20260839's lock exists to prevent.
--
-- ⚠️ THE REAL ANSWER IS A SECOND OPINION: let both determinations stand and surface the
-- disagreement, the way the divergence register already does for stakeholder-versus-preparer. That
-- is a SCHEMA CHANGE — widen the key to include the author, then every reader of it: the worksheet,
-- the determinations screen, severity, the board report, the assignee-determination companion whose
-- own PK mirrors the parent's (20260839 §2). It is on the backlog and it is not this file.
--
-- ⚠️ AND THE WORKFLOW THAT AVOIDS THE REFUSAL ENTIRELY IS TO ASSIGN BEFORE DETERMINING. The lead's
-- own screen already encourages it: worksheet/[id]/determine loads scope minus everything in
-- materiality_impact_assignment_subtopics (:180, :207) and its heading counts "sub-topics not
-- assigned to anyone else", so a sub-topic delegated first never appears there to be determined.
-- The production case arose the other way round — determined on 20 Aug, delegated afterwards — and
-- that ordering is what this refusal is telling the lead about.

begin;

create or replace function public.impact_submit(p_token uuid)
returns jsonb
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
  v_missing       text;
  v_assigned      int;
  v_rows          int;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  -- ⚠️ NOTHING ASSIGNED IS NOT THE SAME AS EVERYTHING FINISHED, AND THE GATE BELOW CANNOT TELL
  -- THEM APART. Its subquery walks materiality_impact_assignment_subtopics; with no rows there is
  -- nothing to be missing, string_agg over an empty set returns NULL, and v_missing is null exactly
  -- as it is when the work is complete. So the gate would pass, the UPDATE would match nothing, and
  -- the contributor would be thanked for nothing all over again — through a different door, with
  -- the predicate fix in place. This is checked HERE, before the gate, because it is a different
  -- fact needing a different sentence.
  --
  -- ⚠️ REACHABLE THROUGH THE PRODUCT, not only by hand. materiality_impact_reassign_subtopic
  -- (20260839) moves a sub-topic to another assignment, so a contributor invited holding two can be
  -- left holding none; and materiality_impact_resolve_token checks revoked, expired and submitted
  -- but never scope, so their link still opens.
  select count(*) into v_assigned
    from public.materiality_impact_assignment_subtopics s
   where s.assignment_id = v_assignment_id;

  if v_assigned = 0 then
    -- ⚠️ WHAT IS OBSERVED, NOT WHY. Two things produce this — sub-topics not yet assigned, and
    -- sub-topics moved away after the link was sent — and nothing here can tell which. Naming one
    -- would be a diagnosis this function cannot make, so it names both and points at the person who
    -- can tell them apart.
    raise exception
      'No sub-topics are assigned to you, so there is nothing to submit. They may not have been '
      'assigned yet, or they may have been moved to someone else since this link was sent. Whoever '
      'sent you the link can see which it is and put it right — nothing you have done is lost.';
  end if;

  -- ⚠️ COMPLETE BY WHOM. This gate asks whether every sub-topic assigned to THIS contributor
  -- carries both directions with a nature, DETERMINED BY THIS ASSIGNMENT. Until 20260853 it asked
  -- only whether such a determination existed at all, and a row made by the lead — assignment_id
  -- null, already submitted — satisfied it. The UPDATE below then filters on
  -- `assignment_id = v_assignment_id and status = 'draft'`, matched nothing, and the contributor
  -- was returned {"submitted": 0} and shown a Thank-you page reading "0 determinations recorded
  -- against your name". Reproduced in production 23 Aug 2026: assignment ba169d39, two sub-topics
  -- (E1.1, E1.2) both determined by the lead on 20 Aug, submitted, zero rows flipped.
  --
  -- The gate and the UPDATE have to describe the SAME set. They did not, and everything between
  -- them succeeded.
  --
  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every assigned sub-topic must carry BOTH directions with a nature. The dimensions may all be
  -- null. Refusing here rather than at the constraint means the contributor is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  select string_agg(m.subtopic_code || ' (' || m.direction || ')', ', ' order by m.subtopic_code, m.direction)
    into v_missing
    from (
      select s.subtopic_code, dir.direction
        from public.materiality_impact_assignment_subtopics s
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_impact_determinations d
          on d.assessment_id = v_assessment_id
         and d.subtopic_code = s.subtopic_code
         and d.direction     = dir.direction
         -- ⚠️ THE FIX (20260853). ON THE JOIN, NOT IN THE WHERE — a predicate on the null side of a
         -- LEFT JOIN belongs in the ON clause; moved to WHERE it would discard the very rows that
         -- signal "nobody has determined this", and the gate would pass on an empty worksheet.
         and d.assignment_id = v_assignment_id
       where s.assignment_id = v_assignment_id
         and (d.assessment_id is null or d.nature is null)
    ) m;

  if v_missing is not null then
    raise exception
      'These are not finished yet: %. Each sub-topic is determined twice — once for harm and once '
      'for benefit — and each needs to say whether it is already happening or might happen. The '
      'severity questions themselves can be left as "not enough visibility to assess".', v_missing;
  end if;

  -- ⚠️ THE DETERMINATIONS FIRST, THE ASSIGNMENT SECOND. Reversed, the assignment's own status would
  -- make resolve_token refuse before the rows were flipped, stranding submitted work under a
  -- submitted assignment with every determination still draft.
  update public.materiality_impact_determinations d
     set status        = 'submitted',
         determined_at = now()
   where d.assessment_id = v_assessment_id
     and d.assignment_id = v_assignment_id
     and d.status = 'draft';

  get diagnostics v_rows = row_count;

  update public.materiality_impact_assignments g
     set status = 'submitted', submitted_at = now()
   where g.id = v_assignment_id;

  -- Checked, not assumed: an UPDATE matching no row raises nothing and returns nothing.
  if not found then
    raise exception
      'Your determinations were saved but the submission could not be recorded. Nothing is lost — '
      'try again, and tell us if it keeps happening.';
  end if;

  -- ⚠️ v_rows CAN STILL BE 0, BY ONE PATH, AND IT IS NOT FIXED HERE — A DOUBLE SUBMIT.
  -- materiality_lead_submit's comment reasons that its own zero "can only mean the work was already
  -- submitted", because its completeness check has just proved a row exists for every held
  -- sub-topic. After the two changes above that reasoning NEARLY transfers to this function, and
  -- this race is the whole difference:
  --
  --   Under READ COMMITTED two concurrent calls on one token — a double-clicked button — can both
  --   pass resolve_token if neither has committed when the other reads. T2's determinations UPDATE
  --   then blocks on T1's row locks, RE-EVALUATES `status = 'draft'` after T1 commits, and matches
  --   zero. The assignment UPDATE that follows has NO status predicate (`where g.id =
  --   v_assignment_id`), so `found` is true and the guard immediately above does not fire. T2
  --   returns submitted 0 with assigned k > 0.
  --
  -- Left deliberately. It needs either a `for update` on the assignment row or a status predicate
  -- on that second UPDATE, both of which change the locking behaviour of the one function a
  -- contributor's work passes through, and neither is worth doing blind — the observable symptom is
  -- now an honest "already submitted" on the Thank-you page rather than a false confirmation,
  -- because assigned > 0 tells the page which zero this is. A second migration if it ever bites.
  return jsonb_build_object('submitted', v_rows, 'assigned', v_assigned);
end $$;


-- ⚠️ THE COMMENT CARRIES THE LIMITATION TOO, because \df+ is where the next person looks.
comment on function public.impact_submit(uuid) is
  'One-way. Flips every one of this contributor''s determinations to submitted, then the assignment itself — in that order, because reversing it would make resolve_token refuse before the rows were flipped and strand submitted work under a submitted assignment. Refuses an assignment holding NO sub-topics with its own sentence (the completeness gate cannot: string_agg over an empty set is NULL, indistinguishable from finished), and refuses while any assigned sub-topic lacks a direction-and-nature IN A DETERMINATION MADE BY THIS ASSIGNMENT, NAMING which: the dimensions may be null (a §6.1 abstention is a real answer) but a determination with no stated nature is not a determination. ⚠️ THE assignment_id PREDICATE IS LOAD-BEARING AND WAS ADDED BY 20260853 — without it a determination made by the LEAD satisfied the gate, the UPDATE that follows matched nothing, and the contributor was thanked for zero determinations. Returns {submitted, assigned}: the pair, not the scalar, because a bare zero cannot tell nothing-was-assigned from already-submitted and the page must not infer a cause it cannot verify. ⚠️ KNOWN LIMITATION: a contributor assigned a sub-topic the lead has already SUBMITTED is refused and cannot proceed, because impact_save_determination will not overwrite a submitted row and the conflict target (assessment_id, subtopic_code, direction) admits only one determination per direction — so their judgement could only replace the lead''s, never stand beside it. Letting both stand is a schema change (widen the key, then every reader) and is on the backlog; the workflow that avoids it is to assign before determining. ⚠️ KNOWN RACE: a double submit can still return submitted 0 with assigned > 0 — see the comment on the second UPDATE. After this the token no longer admits the holder — resolve_token returns PT410 with the sentence that their work was received.';

commit;


-- =====================================================================
-- HOW TO EXERCISE THE REFUSAL BY HAND — run separately, AFTER this migration
-- =====================================================================
-- (a) REPRODUCE THE OLD BEHAVIOUR FIRST, so the fix is seen to change something. Against a
--     database still on 20260840 this returns {"submitted": 0} and raises nothing:
--
--   select public.impact_submit('<token-of-an-assignment-whose-sub-topics-the-lead-determined>');
--   EXPECT (before this migration): {"submitted": 0}, no error.
--   EXPECT (after this migration):  ERROR, "These are not finished yet: E1.1 (negative), E1.1
--                                   (positive), E1.2 (negative), E1.2 (positive)."
--   ⚠️ RUN IT INSIDE begin; ... rollback; if you use a live assignment — the pre-migration call
--   SUCCEEDS and flips the assignment to submitted, after which resolve_token returns PT410 and the
--   token is spent.
--
-- (b) BUILD THE CASE FROM SCRATCH, rolled back, no fixtures left behind. Substitute an assessment
--     you own that has at least one sub-topic in scope and no determinations on it:
--
--   begin;
--     -- the lead determines E1.1 in both directions and submits it
--     -- determined_at is NOT optional here: materiality_impact_determinations_submitted_is_complete
--     -- (20260838:490) requires nature AND determined_at on any non-draft row, and omitting it
--     -- fails the fixture with a check_violation that has nothing to do with what is being tested.
--     insert into public.materiality_impact_determinations
--            (assessment_id, user_id, subtopic_code, standard_version, direction, nature,
--             determined_at, status)
--     select '<assessment-uuid>', a.user_id, 'E1.1', a.standard_version, dir.direction,
--            'actual', now(), 'submitted'
--       from public.materiality_assessments a
--       cross join (values ('negative'), ('positive')) as dir(direction)
--      where a.id = '<assessment-uuid>';
--
--     -- then E1.1 is delegated to a contributor, who records nothing
--     insert into public.materiality_impact_assignments (assessment_id, contributor_name)
--     values ('<assessment-uuid>', 'Test contributor') returning id, token \gset
--     insert into public.materiality_impact_assignment_subtopics
--            (assignment_id, assessment_id, subtopic_code, standard_version)
--     select :'id', '<assessment-uuid>', 'E1.1', a.standard_version
--       from public.materiality_assessments a where a.id = '<assessment-uuid>';
--
--     select public.impact_submit(:'token');
--   rollback;
--   EXPECT: ERROR, "These are not finished yet: E1.1 (negative), E1.1 (positive)."
--   ⚠️ IF IT RETURNS {"submitted": 0} INSTEAD, the join predicate is missing — this migration did
--   not take, or a later CREATE OR REPLACE dropped it.
--
-- (c) THE HONEST PATH STILL WORKS — the one that must NOT have been broken. Same fixture as (b) but
--     without the lead's two rows, and with the contributor determining through the RPC:
--
--   begin;
--     -- (create assignment + assignment_subtopics as above, then:)
--     select public.impact_save_determination(:'token', 'E1.1', 'negative', 'actual', null, null, null, null, '{}', null);
--     select public.impact_save_determination(:'token', 'E1.1', 'positive', 'actual', null, null, null, null, '{}', null);
--     select public.impact_submit(:'token');
--   rollback;
--   EXPECT: {"submitted": 2, "assigned": 1} — BOTH KEYS. A 0 for submitted here means the gate and
--   the UPDATE have gone out of step again in the other direction, which is the same defect wearing
--   the opposite sign. A result carrying only "submitted" means an older definition is installed;
--   impact/[token]/page.tsx then reads assigned as absent and falls back to printing the count,
--   which is the pre-20260853 behaviour rather than a crash, but both new sentences are dead.
--
-- (d) THE EMPTY ASSIGNMENT — the one the predicate fix does NOT catch, and the reason this
--     migration has a second guard. A contributor holding no sub-topics at all:
--
--   begin;
--     insert into public.materiality_impact_assignments (assessment_id, contributor_name)
--     values ('<assessment-uuid>', 'Test contributor') returning token \gset
--     -- deliberately NO assignment_subtopics rows
--     select public.impact_submit(:'token');
--   rollback;
--   EXPECT: ERROR, "No sub-topics are assigned to you, so there is nothing to submit."
--   ⚠️ IF IT RETURNS {"submitted": 0, "assigned": 0} INSTEAD, the guard is missing and the gate is
--   passing vacuously — which is the whole defect wearing its second face. A pre-migration database
--   returns {"submitted": 0} here and raises nothing.
--
--   And the same shape arrived at through the product, which is how it will actually happen:
--   assign one sub-topic, then move it away and submit as the original contributor —
--     select public.materiality_impact_reassign_subtopic('<assessment-uuid>', 'E1.1', '<other-assignment-uuid>');
--   EXPECT: the same refusal. Their link still opens; resolve_token never checks scope.
--
-- (e) THE PREDICATE AND THE GUARD ARE ACTUALLY IN THE INSTALLED FUNCTION — cheapest check of all:
--
--   select position('d.assignment_id = v_assignment_id' in pg_get_functiondef(
--            'public.impact_submit(uuid)'::regprocedure)) > 0 as gate_scoped,
--          position('v_assigned = 0' in pg_get_functiondef(
--            'public.impact_submit(uuid)'::regprocedure)) > 0 as empty_guarded;
--   EXPECT: t | t
