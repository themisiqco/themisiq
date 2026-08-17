-- 20260830_survey_free_text_rpcs.sql
--
-- FREE TEXT — FILE 2 of 3. THE RESPONDENT PATH. Run after 20260829.
--
--   survey_save_free_text(uuid, uuid, text)      a comment on one question
--   survey_save_closing_comment(uuid, text)      the closing question
--   survey_get(uuid)                             re-emitted, + closing_comment
--
-- ⚠️ THIS FILE RE-EMITS survey_get WHOLE and therefore CONTAINS 20260822's topic_label and
-- 20260823's intro_variant. Running any of those AFTER this one silently reverts this change.
-- Verify step 1 checks all three additions at once.
--
-- ⚠️ SHIPS WITH THE COPY CARVE-OUT, AND MUST NOT SHIP WITHOUT IT. All three intro variants promise
-- that answers are "combined with everyone else's" and "not shown individually". That is true of a
-- score and FALSE of a verbatim comment. app/survey/[token]/page.tsx and docs/survey-intro-copy.md
-- gain the carve-out paragraph in the same pass. A comment box under a paragraph saying the opposite
-- is not a copy defect, it is the product making a promise the feature breaks.
--
--
-- =====================================================================
-- ⚠️ WHY A SEPARATE FUNCTION AND NOT A FIFTH PARAMETER ON survey_save_response
-- =====================================================================
-- The obvious shape was survey_save_response(p_token, p_question_id, p_value, p_abstained,
-- p_free_text default null). It cannot be used, and the reason is worth stating because the trap is
-- invisible in the signature:
--
--   A DEFAULT IS REQUIRED, because the four-parameter form is already called by a shipped page and
--   adding a mandatory fifth breaks it. But a DEFAULT OF NULL MEANS EVERY AUTOSAVE THAT OMITS IT
--   SILENTLY NULLS A SAVED NOTE. A respondent types a comment, then clicks a different radio on the
--   same question, and their comment is gone — no error, nothing on screen, and the next page load
--   shows an empty box as though they had never written anything.
--
-- A sentinel would need TWO magic values, not one: "leave unchanged" and "clear", because deleting a
-- comment is a legitimate action. Any sentinel is also a string a respondent could type, and no
-- reviewer can verify by inspection that the collision was considered.
--
-- An overload is worse in this specific stack: PostgREST resolves rpc() by argument names, and two
-- same-named functions differing in arity is a documented source of "could not choose the best
-- candidate function".
--
-- So the trap is AVOIDED rather than solved: survey_save_response's signature is unchanged, there is
-- no omittable parameter, and the two writes cannot interfere. A score write cannot null a note and a
-- note write cannot null a score — which matches the fact that they are independent answers to
-- independent prompts. Passing null to survey_save_free_text has exactly one possible meaning:
-- clear it.
--
--
-- =====================================================================
-- ⚠️ A COMMENT REQUIRES AN ANSWER, AND THAT IS THE XOR SPEAKING
-- =====================================================================
-- materiality_survey_responses carries
--     check ((abstained and value is null) or (not abstained and value is not null))
-- so a row must hold a value or an abstention. There is no row shape for "no answer, but a comment",
-- and survey_save_free_text therefore UPDATES an existing answer and never inserts.
--
-- Relaxing the XOR to admit it was rejected: it would reintroduce exactly the row 20260819 refuses —
-- `abstained = false, value = null`, "a row asserting an answer it does not have" — distinguished
-- only by another column being non-null.
--
-- WHAT THAT COSTS, AND WHY IT IS SMALL. The apparently-lost case is "skip the question entirely but
-- comment on it". It is nearly covered already: "Not enough visibility to assess" PLUS a comment is a
-- valid, storable row, and it says precisely "I cannot score this, but here is what I know" — which
-- is the case that matters. What remains lost is a comment from someone who would not even abstain,
-- and that is close to self-contradictory.
--
-- THE PAGE MUST MATCH: the comment box is enabled only once an option is chosen. If it is ever
-- enabled first, a respondent will type into it and lose the text to a refusal — the refusal names
-- the reason, but it names it after the fact.
--
--
-- =====================================================================
-- CLEARING, TRIMMING, AND WHAT AN EMPTY BOX MEANS
-- =====================================================================
-- Both functions normalise with nullif(btrim(...), ''), so whitespace is not a comment and an
-- emptied box is a clear rather than a stored blank. For the closing comment, clearing DELETES the
-- row: a row whose only column of substance is empty is not evidence of anything, and leaving one
-- would put an empty string into the emerging-topic catch where a reader expects text.
--
-- Both cap at 4000 characters, matching the CHECK constraints in 20260829, and refuse with a message
-- naming the actual length. A constraint violation would reach the client as generic failure text
-- after the respondent has typed 4001 characters, which is the worst possible moment to be vague.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260829, and ships the page and the
-- copy in the same pass.

begin;

-- =====================================================================
-- survey_save_free_text
-- =====================================================================
create or replace function public.survey_save_free_text(
  p_token       uuid,
  p_question_id uuid,
  p_free_text   text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id uuid;
  v_round_id      uuid;
  v_track         text;
  v_category      text;
  v_department    text;
  v_name          text;
  v_version       int;
  v_routing       text;
  v_q             record;
  v_text          text;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  -- Whitespace is not a comment; an emptied box is a clear.
  v_text := nullif(btrim(p_free_text), '');

  if v_text is not null and length(v_text) > 4000 then
    raise exception
      'This comment is % characters and the limit is 4000. Nothing was saved — shorten it and try '
      'again rather than reloading, or the text in the box will be lost.', length(v_text);
  end if;

  -- Same question lookup and same routing check as survey_save_response. A comment on a question the
  -- respondent was never shown is the same defect as an answer to one.
  select q.id, q.subtopic_code, q.shared_with_subtopic_code, s.topic_code
    into v_q
    from public.materiality_survey_questions q
    left join public.mr_esrs_subtopics s
      on s.code = q.subtopic_code
     and s.standard_version = q.standard_version
   where q.id = p_question_id
     and q.round_id = v_round_id
     and q.questionnaire_version = v_version
     and q.status = 'included';

  if not found then
    raise exception
      'Question % is not part of the current question set for this invitation. It belongs to '
      'another round, to an earlier questionnaire version, or it has been deselected. Reload the '
      'survey.', p_question_id;
  end if;

  if not public.materiality_survey_routes_to(
           v_q.shared_with_subtopic_code, v_q.topic_code, v_routing) then
    raise exception
      'Question % (%) was never shown to this respondent: stakeholder category % routes the labour '
      'sub-topics to %. Refusing to store a comment on a question that was not asked.',
      p_question_id, coalesce(v_q.subtopic_code, 'entity-specific'), v_category, v_routing;
  end if;

  -- ⚠️ UPDATE ONLY, NEVER INSERT. The XOR requires a value or an abstention on every response row,
  -- so there is no row shape for a comment with no answer. See the header.
  update public.materiality_survey_responses
     set free_text  = v_text,
         updated_at = now()
   where respondent_id = v_respondent_id
     and question_id   = p_question_id;

  if not found then
    raise exception
      'Choose an answer to this question before adding a comment. A comment is stored alongside an '
      'answer, and there is no answer recorded here yet — if you cannot score it, "Not enough '
      'visibility to assess" is an answer and a comment can go with it.';
  end if;
end $$;

comment on function public.survey_save_free_text(uuid, uuid, text) is
  'Saves or clears the respondent''s comment on one question. A SEPARATE FUNCTION rather than a fifth parameter on survey_save_response: a defaulted p_free_text would silently null a saved note on every autosave that omitted it, and the two writes are independent answers to independent prompts. Null or whitespace clears. UPDATES an existing answer row and never inserts — the XOR on materiality_survey_responses requires a value or an abstention, so a comment cannot exist without one, and the refusal says so. Applies the same token gate, version check and §3.0.1 routing check as survey_save_response.';

-- =====================================================================
-- survey_save_closing_comment
-- =====================================================================
-- ⚠️ THE MODULE'S ENTIRE EMERGING-TOPIC CATCH. Survey scope is fixed at round creation and there is
-- no second scoping moment, so this is the only route by which a matter outside the chosen scope
-- reaches the preparer. See 20260829's header.
create or replace function public.survey_save_closing_comment(
  p_token   uuid,
  p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id uuid;
  v_round_id      uuid;
  v_track         text;
  v_category      text;
  v_department    text;
  v_name          text;
  v_version       int;
  v_routing       text;
  v_text          text;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  v_text := nullif(btrim(p_comment), '');

  if v_text is not null and length(v_text) > 4000 then
    raise exception
      'This comment is % characters and the limit is 4000. Nothing was saved — shorten it and try '
      'again rather than reloading, or the text in the box will be lost.', length(v_text);
  end if;

  if v_text is null then
    -- Clearing deletes the row. An empty string in the emerging-topic catch is worse than no row:
    -- a reader expects text there, and a blank reads as a respondent who was asked and had nothing
    -- to say, which is a different finding from one who never filled the box in.
    delete from public.materiality_survey_closing_comments
     where respondent_id = v_respondent_id;
    return;
  end if;

  -- Attributes denormalised at write, as on materiality_survey_responses, so the aggregation never
  -- joins to materiality_survey_respondents — the row that holds the email.
  -- ⚠️ function_department is NOT copied. The table has no such column, on purpose (20260829).
  insert into public.materiality_survey_closing_comments (
    round_id, respondent_id, questionnaire_version, comment, track, stakeholder_category)
  values (
    v_round_id, v_respondent_id, v_version, v_text, v_track, v_category)
  on conflict (respondent_id) do update
    set comment              = excluded.comment,
        -- Refreshed so all of one respondent's records carry the same classification, the same
        -- reason survey_save_response refreshes them.
        track                = excluded.track,
        stakeholder_category = excluded.stakeholder_category,
        updated_at           = now();
end $$;

comment on function public.survey_save_closing_comment(uuid, text) is
  'Saves, replaces or clears the respondent''s answer to the closing question — "Is there anything affecting people, the environment or the business that we have not asked about?" ⚠️ THE MODULE''S ENTIRE EMERGING-TOPIC CATCH (ESRS 2 IRO-1): survey scope is fixed at round creation with no second scoping moment, so this is the only route by which an out-of-scope matter reaches the preparer. Writes to materiality_survey_closing_comments, which no counter reads — the closing question has no value, no abstention and no sub-topic, and is not part of n_asked. Null or whitespace DELETES the row rather than storing a blank.';

-- =====================================================================
-- survey_get — re-emitted whole, + closing_comment
-- =====================================================================
-- Contains 20260822's topic_label and 20260823's intro_variant. The only addition is the top-level
-- closing_comment key. Per-question free_text was ALREADY returned in the responses array from
-- 20260820 onward, so save-and-return for those needs nothing here.
create or replace function public.survey_get(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_respondent_id   uuid;
  v_round_id        uuid;
  v_name            text;
  v_version         int;
  v_routing         text;
  v_track           text;   -- unused in the projection, and that is the point (see 20260820)
  v_category        text;
  v_department      text;
  v_labour_total    int;
  v_labour_routed   int;
  v_question_count  int;
  v jsonb;
begin
  select * into v_respondent_id, v_round_id, v_track, v_category, v_department, v_name,
                v_version, v_routing
    from public.materiality_survey_resolve_token(p_token);

  select count(*),
         count(*) filter (
           where public.materiality_survey_routes_to(
                   q.shared_with_subtopic_code, s.topic_code, v_routing))
    into v_labour_total, v_labour_routed
    from public.materiality_survey_questions q
    join public.mr_esrs_subtopics s
      on s.code = q.subtopic_code
     and s.standard_version = q.standard_version
   where q.round_id = v_round_id
     and q.questionnaire_version = v_version
     and q.shared_with_subtopic_code is not null;

  if v_labour_total > 0 then
    if v_routing = 'not_asked' then
      if v_labour_routed <> 0 then
        raise exception
          'Survey routing failed: stakeholder category % routes the labour sub-topics to not_asked, '
          'but % of the round''s % paired questions matched. Refusing to serve a form that asks a '
          'respondent questions the routing excluded them from — those answers would be counted '
          'against the company as its own blind spot (spec v8 §3.0.1).',
          v_category, v_labour_routed, v_labour_total;
      end if;
    elsif v_labour_routed * 2 <> v_labour_total then
      raise exception
        'Survey routing failed: stakeholder category % routes to %, but % of the round''s % paired '
        'questions matched (expected exactly half). Refusing to serve a short form — it would be '
        'indistinguishable from the 25 questions a not_asked respondent correctly receives.',
        v_category, v_routing, v_labour_routed, v_labour_total;
    end if;
  end if;

  -- Respondent-safe WHITELISTS only. Do NOT to_jsonb() any of these tables.
  select jsonb_build_object(
           'intro_variant', public.materiality_survey_intro_variant(v_routing),
           'round', jsonb_build_object(
                      'name',         rd.name,
                      'company_name', rd.company_name,
                      'deadline',     rd.deadline),
           'respondent', jsonb_build_object(
                      'display_name', v_name),
           -- ADDED 20260830. The respondent's own closing comment, so save-and-return shows them
           -- what they wrote. Their own text and nobody else's — this is scoped to their
           -- respondent_id exactly as the responses array is.
           'closing_comment', (
             select c.comment
               from public.materiality_survey_closing_comments c
              where c.respondent_id = v_respondent_id),
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id',      q.id,
                      'short_name',       q.short_name,
                      'question_framing', q.question_framing,
                      'wording',          q.wording,
                      'context',          q.context,
                      'topic_label',      tl.label)
                    order by q.sort_order)
               from public.materiality_survey_questions q
               left join public.mr_esrs_subtopics s
                 on s.code = q.subtopic_code
                and s.standard_version = q.standard_version
               left join public.mr_esrs_topic_labels tl
                 on tl.topic_code = s.topic_code
                and tl.standard_version = s.standard_version
              where q.round_id = v_round_id
                and q.questionnaire_version = v_version
                and q.status = 'included'
                and public.materiality_survey_routes_to(
                      q.shared_with_subtopic_code, s.topic_code, v_routing)),
             '[]'::jsonb),
           -- free_text has been in this array since 20260820; it only became writable in this file.
           'responses', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id', rs.question_id,
                      'value',       rs.value,
                      'abstained',   rs.abstained,
                      'free_text',   rs.free_text))
               from public.materiality_survey_responses rs
              where rs.respondent_id = v_respondent_id),
             '[]'::jsonb))
    into v
    from public.materiality_survey_rounds rd
   where rd.id = v_round_id;

  if v is null then
    raise exception
      'Survey round % vanished between the token check and the projection.', v_round_id;
  end if;

  v_question_count := jsonb_array_length(v -> 'questions');
  if v_question_count = 0 then
    raise exception
      'This survey round has no questions to show you. Every question in the set is either '
      'deselected or excluded by routing, so there is nothing to answer — reporting that rather '
      'than presenting an empty form.';
  end if;

  update public.materiality_survey_respondents
     set status = 'in_progress'
   where id = v_respondent_id
     and status = 'invited';

  return v;
end $$;

comment on function public.survey_get(uuid) is
  'What a survey respondent needs to fill the form in, and nothing else. Explicit whitelists — no to_jsonb of any table; see 20260820 for every column withheld, 20260822 for topic_label (never topic_code), 20260823 for intro_variant. Returns the respondent''s OWN free text for save-and-return: per-question comments in the responses array, and their closing comment as a top-level key. Applies the §3.0.1 labour routing (31 questions for s1/s2, 25 for not_asked; nobody receives 37) and refuses rather than serving a short form. Flips invited -> in_progress on first touch. Refuses an unknown, revoked, expired or completed token with one indistinguishable message.';

-- =====================================================================
-- Grants
-- =====================================================================
revoke all on function public.survey_save_free_text(uuid, uuid, text)   from public;
revoke all on function public.survey_save_closing_comment(uuid, text)   from public;
grant execute on function public.survey_save_free_text(uuid, uuid, text) to anon, authenticated;
grant execute on function public.survey_save_closing_comment(uuid, text) to anon, authenticated;
-- survey_get's grants survive CREATE OR REPLACE and are not re-emitted; verify step 6 confirms.

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- Reuse 20260820's setup (a round, an s1 token, an s2 token, a not_asked token). Savepoints around
-- anything expecting an ERROR.
--
-- 1) ⚠️ RUN-ORDER CHECK — all three survey_get additions present at once. If topic_label or
--    intro_variant is missing, an older file was applied after this one:
--    select jsonb_object_keys(public.survey_get(:'s1_token'));
--    -- expect exactly: intro_variant, round, respondent, closing_comment, questions, responses
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'questions' -> 0);
--    -- expect exactly: question_id, short_name, question_framing, wording, context, topic_label
--
-- 2) ⚠️ A COMMENT REQUIRES AN ANSWER — the refusal, then the same call succeeding:
--    select id from public.materiality_survey_questions
--     where round_id = :'round_id' and subtopic_code = 'E1.1' \gset q_
--    savepoint v2;
--      select public.survey_save_free_text(:'s1_token', :'q_id', 'we had an incident last year');
--      -- expect ERROR: Choose an answer to this question before adding a comment...
--    rollback to savepoint v2;
--    select public.survey_save_response(:'s1_token', :'q_id', 2::smallint, false);   -- ok
--    select public.survey_save_free_text(:'s1_token', :'q_id', 'we had an incident last year'); -- ok
--    select value, free_text from public.materiality_survey_responses
--     where question_id = :'q_id';                             -- expect 2 | we had an incident...
--
-- 3) ⚠️ THE TRAP THIS DESIGN EXISTS TO AVOID. Save a comment, then change the score, and confirm the
--    comment SURVIVES. If it is null after this, a fifth parameter has crept in somewhere:
--    select public.survey_save_response(:'s1_token', :'q_id', 3::smallint, false);
--    select value, free_text from public.materiality_survey_responses
--     where question_id = :'q_id';                             -- expect 3 | we had an incident...
--    -- and abstaining keeps it too, which is the case that matters most (§6.1 + a comment):
--    select public.survey_save_response(:'s1_token', :'q_id', null, true);
--    select value, abstained, free_text from public.materiality_survey_responses
--     where question_id = :'q_id';                             -- expect null | t | we had an...
--
-- 4) Clearing, trimming and the cap:
--    select public.survey_save_free_text(:'s1_token', :'q_id', '    ');
--    select free_text from public.materiality_survey_responses where question_id = :'q_id'; -- null
--    savepoint v4;
--      select public.survey_save_free_text(:'s1_token', :'q_id', repeat('x', 4001));
--      -- expect ERROR: This comment is 4001 characters and the limit is 4000...
--    rollback to savepoint v4;
--
-- 5) The closing comment, and that it changes NO counter — the invariant that must hold:
--    -- take the counters BEFORE:
--    select sum(n_asked), sum(n_answered), sum(n_abstained), sum(n_skipped)
--      from public.materiality_survey_counter_rows(:'round_id', 1) where dimension = 'overall' \gset b_
--    select public.survey_save_closing_comment(:'s1_token', 'Nothing about water at our Leeds site.');
--    select sum(n_asked), sum(n_answered), sum(n_abstained), sum(n_skipped)
--      from public.materiality_survey_counter_rows(:'round_id', 1) where dimension = 'overall';
--    -- ⚠️ expect IDENTICAL to the before figures. If any counter moved, the closing comment has
--    -- reached materiality_survey_responses and the separate table has not done its job.
--    select comment, track, stakeholder_category
--      from public.materiality_survey_closing_comments;         -- expect 1 row, denormalised
--    -- one per respondent, replaced not duplicated:
--    select public.survey_save_closing_comment(:'s1_token', 'Actually, also our Hull depot.');
--    select count(*), max(comment) from public.materiality_survey_closing_comments; -- expect 1 | Actually...
--    -- clearing DELETES:
--    select public.survey_save_closing_comment(:'s1_token', '');
--    select count(*) from public.materiality_survey_closing_comments;               -- expect 0
--
-- 6) Save-and-return — the respondent sees their own text and only their own:
--    select public.survey_save_closing_comment(:'s1_token', 'mine');
--    select public.survey_get(:'s1_token') ->> 'closing_comment';   -- expect mine
--    select public.survey_get(:'s2_token') ->> 'closing_comment';   -- expect null (not 'mine')
--    -- and grants:
--    select has_function_privilege('anon', 'public.survey_save_free_text(uuid,uuid,text)', 'execute');
--    select has_function_privilege('anon', 'public.survey_save_closing_comment(uuid,text)', 'execute');
--    select has_function_privilege('anon', 'public.survey_get(uuid)', 'execute');   -- all t
--
-- 7) Both functions refuse a routing violation and a submitted token, like their siblings:
--    select id from public.materiality_survey_questions
--     where round_id = :'round_id' and subtopic_code = 'S2.3' \gset qs2_
--    savepoint v7;
--      select public.survey_save_free_text(:'s1_token', :'qs2_id', 'x');
--      -- expect ERROR: ... was never shown to this respondent ...
--    rollback to savepoint v7;
--    select public.survey_submit(:'s1_token');
--    savepoint v7;
--      select public.survey_save_closing_comment(:'s1_token', 'too late');
--      -- expect ERROR: invalid token
--    rollback to savepoint v7;
--
-- 8) ⚠️ AND THE COPY. Open a real link and read the paragraph above the first comment box. It must
--    NOT say comments are combined with everyone else's. If the carve-out has not shipped, take the
--    comment boxes off the page until it has — a false promise about who reads a comment is worse
--    than no comment box.
