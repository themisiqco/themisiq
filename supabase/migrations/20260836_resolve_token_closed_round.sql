-- 20260836_resolve_token_closed_round.sql
--
-- Re-emits materiality_survey_resolve_token so a CLOSED round refuses its own tokens, with a
-- DISTINGUISHABLE refusal rather than the shared "invalid token".
--
-- ⚠️ THIS IS THE MIGRATION THAT MAKES 20260827'S PREMISE TRUE.
-- That file lets an assessment consume a round only when its status is 'closed', and says why:
-- "an assessment reading a moving survey is where this module's freeze-at-write discipline would
-- break. A report saying '9 of 12' on Tuesday and '9 of 19' on Thursday cannot say which it was."
--
-- The premise was false. Nothing checked the ROUND's status on the respondent path. resolve_token
-- filtered on the RESPONDENT's status — revoked, expired, completed — and joined the round only to
-- read questionnaire_version. So a closed round kept issuing forms, kept accepting answers, and kept
-- accepting submissions, and survey_aggregate (which has no status check either, deliberately —
-- viewing is not consuming) kept returning different figures as they arrived. The link guard was
-- enforcing a rule whose point had evaporated: it demanded a frozen round and nothing froze one.
--
-- 20260820's own header recorded the gap — "ROUND STATUS IS NOT A REFUSAL... a token admits a
-- respondent whatever the round's status says" — and deferred it because locking respondents out the
-- moment someone clicks Close needs a screen that warns first. That screen is being built now, so
-- the two arrive together.
--
--
-- =====================================================================
-- ⚠️ THE NEW REFUSAL IS DELIBERATELY DISTINGUISHABLE, AND THAT IS NOT A HOLE IN THE OTHER FOUR
-- =====================================================================
-- The four existing refusals — unknown token, revoked, expired, already submitted — share ONE
-- message and ONE errcode on purpose, so a caller cannot probe a token to learn which applies.
-- That property is unchanged: they are still checked first, still in one WHERE clause, still
-- 'invalid token' / no_data_found.
--
-- The closed-round refusal is different IN KIND, not a fifth probe surface:
--   * it is reachable only by someone who ALREADY HOLDS A VALID, LIVE TOKEN. A guessed uuid still
--     matches no respondent and still gets the opaque message, because the respondent lookup runs
--     first and returns before the round is ever considered.
--   * it tells the holder nothing they could not observe by other means: they were invited, they
--     had a working link, and it stopped working.
--   * and the thing it tells them is the thing they most need. Someone half-way through, locked out
--     mid-sentence, otherwise sees "invalid token" — which reads as "your link was never any good",
--     is false, and leaves them believing their twenty answers went nowhere.
--
-- ORDER IS LOAD-BEARING. Respondent conditions first, round status second. Reverse them and a
-- guessed token on a closed round would reveal that the round exists.
--
--
-- =====================================================================
-- ⚠️ TWO MESSAGES, BECAUSE ONE OF THEM WOULD BE FALSE FOR SOME PEOPLE
-- =====================================================================
-- The sentence worth saying is "Your answers up to now were received and counted" — true, and
-- counter-intuitive enough to be worth stating: responses exist independently of submission, and
-- materiality_survey_counter_rows counts every respondent whose status is in_progress or completed.
-- Someone who answered twenty questions and never pressed Submit is IN the figures.
--
-- But it is FALSE for a respondent who never opened the survey and clicks their link after closure.
-- They are status 'invited', they have no rows, and telling them their answers were counted is a
-- fabricated reassurance about evidence that does not exist — the same defect class as an error
-- message naming a cause it cannot verify.
--
-- So the function looks for their responses and says whichever is true. It costs one EXISTS, and it
-- is reachable only by a valid token holder, so it reveals nothing.
--
-- ERRCODE 'PT410'. PostgREST maps a SQLSTATE of the form PTnnn to HTTP status nnn, and 410 Gone is
-- exactly this case: the resource was valid and is deliberately no longer available. If that mapping
-- ever changes, the client still branches on error.code, which is 'PT410' either way.
-- NOT VERIFIED AGAINST A LIVE CALL. Confirm on the first closed round that the client receives
-- code 'PT410' and not a generic 500 — the respondent page's branch keys on it.
--
--
-- SCOPE — ONE CONCERN. Byte-identical to 20260820's definition apart from the round-status read and
-- the two raises. Every caller inherits the refusal, which is intended: survey_get stops serving the
-- form, survey_save_response and survey_save_free_text stop accepting answers, survey_submit stops
-- accepting submissions. survey_aggregate does NOT call this function and is unaffected — the buyer
-- can still read a closed round, which is the whole point of closing it.
--
-- SHIPS WITH THE RESPONDENT PAGE CHANGE. Until app/survey/[token]/page.tsx branches on 'PT410',
-- this message lands on the generic "could not be opened" screen — which shows the text, so nothing
-- is hidden, but it is framed as a fault rather than as a survey that ended.
--
-- GRANTS ARE NOT RE-EMITTED. CREATE OR REPLACE preserves them; resolve_token is revoked from PUBLIC
-- and granted to nobody, called only from inside the definer functions (20260820).
--
-- DEPLOY: Lisa hand-runs this. Re-runnable (CREATE OR REPLACE).

begin;

create or replace function public.materiality_survey_resolve_token(
  p_token                  uuid,
  out o_respondent_id      uuid,
  out o_round_id           uuid,
  out o_track              text,
  out o_stakeholder_category text,
  out o_function_department  text,
  out o_invite_name        text,
  out o_questionnaire_version int,
  out o_labour_routing     text)
returns record
language plpgsql
set search_path = public
as $$
declare
  v_round_status text;
  v_has_answers  boolean;
begin
  -- The four opaque refusals, unchanged and FIRST. One message, one errcode, so a caller cannot
  -- tell unknown from revoked from expired from already-submitted.
  select r.id, r.round_id, r.track, r.stakeholder_category, r.function_department, r.invite_name,
         rd.questionnaire_version, c.labour_routing, rd.status
    into o_respondent_id, o_round_id, o_track, o_stakeholder_category, o_function_department,
         o_invite_name, o_questionnaire_version, o_labour_routing, v_round_status
    from public.materiality_survey_respondents r
    join public.materiality_survey_rounds rd
      on rd.id = r.round_id
    join public.mr_stakeholder_categories c
      on c.code = r.stakeholder_category
   where r.token = p_token
     and r.revoked_at is null
     and r.expires_at > now()
     and r.status not in ('completed', 'revoked', 'expired');

  if o_respondent_id is null then
    raise exception 'invalid token' using errcode = 'no_data_found';
  end if;

  -- The round-level refusal, SECOND, so it is reachable only with a live token.
  if v_round_status = 'closed' then
    select exists (
      select 1 from public.materiality_survey_responses rs
       where rs.respondent_id = o_respondent_id
    ) into v_has_answers;

    if v_has_answers then
      -- True: a response row is written on every save, and the counters read in_progress rows.
      raise exception
        'This survey has closed. Your answers up to now were received and counted.'
        using errcode = 'PT410';
    else
      -- Never opened it, or opened it and answered nothing. Saying their answers were counted would
      -- be a reassurance about evidence that does not exist.
      raise exception
        'This survey has closed and is no longer accepting responses.'
        using errcode = 'PT410';
    end if;
  end if;
end $$;

comment on function public.materiality_survey_resolve_token(uuid) is
  'The shared token gate for survey_get / survey_save_response / survey_save_free_text / survey_save_closing_comment / survey_submit. FIVE refusals in two groups. The four RESPONDENT-level ones — unknown, revoked, expired, already submitted — share one message and one errcode (no_data_found) so a caller cannot distinguish them, and are checked FIRST so a guessed token never learns whether a round exists. The ROUND-level one is distinguishable on purpose: a closed round raises PT410 with a message saying the survey ended, and saying whether the holder''s answers were counted — true for someone half-way through, and deliberately NOT said to someone who never opened it. Added 20260836, which is what makes 20260827''s premise true: an assessment may consume only a closed round BECAUSE its figures stop moving, and until this function read the round''s status nothing stopped them.';

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- 1) THE FOUR OPAQUE REFUSALS ARE UNCHANGED — check this first, because the point of the new one is
--    that it did not weaken them:
--    savepoint v1; select public.survey_get(gen_random_uuid());          -- ERROR: invalid token
--    rollback to savepoint v1;
--    -- revoked, expired and completed likewise, all 'invalid token'. See 20260820 verify step 4.
--
-- 2) An OPEN round is untouched:
--    select jsonb_array_length(public.survey_get(:'open_token') -> 'questions');   -- 31 or 25
--
-- 3) A CLOSED ROUND REFUSES, DISTINGUISHABLY, AND SAYS WHICH CASE:
--    update public.materiality_survey_rounds set status = 'closed' where id = :'round_id';
--    savepoint v3; select public.survey_get(:'answered_token');
--      -- ERROR: This survey has closed. Your answers up to now were received and counted.
--    rollback to savepoint v3;
--    savepoint v3; select public.survey_get(:'never_opened_token');
--      -- ERROR: This survey has closed and is no longer accepting responses.
--    rollback to savepoint v3;
--    -- Confirm the SQLSTATE reaches the client as PT410, from the browser:
--    --   const { error } = await supabase.rpc('survey_get', { p_token }); console.log(error.code)
--
-- 4) EVERY write path is closed too — this is the guarantee 20260827 needs:
--    savepoint v4; select public.survey_save_response(:'answered_token', :'q_id', 2::smallint, false);
--    rollback to savepoint v4;
--    savepoint v4; select public.survey_submit(:'answered_token');
--    rollback to savepoint v4;
--    savepoint v4; select public.survey_save_closing_comment(:'answered_token', 'late');
--    rollback to savepoint v4;
--    -- all three: ERROR: This survey has closed...
--
-- 5) THE BUYER CAN STILL READ IT. survey_aggregate does not call this function and must not —
--    closing is what makes a round readable as evidence, not what hides it:
--    select jsonb_array_length(public.survey_aggregate(:'round_id') -> 'subtopics');   -- 37
--
-- 6) Reopening restores everything, while the round is unlinked (20260827 refuses once linked):
--    update public.materiality_survey_rounds set status = 'open' where id = :'round_id';
--    select jsonb_array_length(public.survey_get(:'answered_token') -> 'questions');   -- works again
--
-- 7) Grants survived CREATE OR REPLACE — granted to NOBODY, and must stay that way:
--    select has_function_privilege('anon', 'public.materiality_survey_resolve_token(uuid)', 'execute');
--    select has_function_privilege('authenticated', 'public.materiality_survey_resolve_token(uuid)', 'execute');
--    -- expect f, f
