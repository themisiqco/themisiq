-- 20260835_survey_respondent_progress.sql
--
-- One RPC: survey_respondent_progress(p_round_id uuid) -> jsonb, keyed by respondent id.
-- Owner-scoped, SECURITY DEFINER, granted to authenticated only.
--
-- WHY IT HAS TO EXIST. The buyer's progress screen must answer "who do I chase", and that turns on a
-- distinction the respondent's STATUS cannot make: someone who opened the survey and answered
-- nothing, and someone who opened it and answered thirty of thirty-one, are both 'in_progress'.
-- Those are opposite facts for anyone deciding whether to send a reminder.
--
-- The count is not reachable any other way. materiality_survey_responses grants anon and
-- authenticated NOTHING and has no RLS policy for either (20260819) — deliberately, and that pair is
-- the anonymity guarantee. survey_aggregate returns totals per sub-topic, never per person. So the
-- browser cannot count a respondent's answers, and should not be able to.
--
--
-- =====================================================================
-- ⚠️ WHAT THIS RETURNS, AND WHY IT DOES NOT WEAKEN THE ANONYMITY DESIGN
-- =====================================================================
-- COUNTS ONLY. Per respondent: how many questions they were asked, how many they answered, how many
-- they marked "not enough visibility", and when they last touched the survey. It returns NO value,
-- NO abstention flag against any particular question, NO subtopic_code, NO free text, and nothing
-- that says WHICH questions were answered.
--
-- The anonymity guarantee in this module is about WHAT a person said, not WHETHER they said
-- anything. The customer already knows the second: they wrote the invite list, and
-- materiality_survey_respondents.status is theirs to read under an owner policy — invited,
-- in_progress, completed. This function refines a fact they already hold from three buckets into a
-- number. It hands over no answer.
--
-- ⚠️ THE LINE, SO A LATER READER KNOWS WHERE IT IS. Adding a per-respondent BREAKDOWN — which
-- sub-topics they answered, or any value — would cross it, and would do so without touching a grant
-- or a policy, because this function is already SECURITY DEFINER over a table the caller cannot
-- read. If that is ever wanted, it is a different function with a different argument about
-- disclosure, and the intro copy's promise to respondents ("Your answers are not shown
-- individually") has to change in the same commit.
--
-- ⚠️ AND THE ONE RESIDUAL, STATED. In a round with very few respondents, an answered-count plus the
-- published overall distribution narrows what one person could have said — n_answered = 1 against a
-- sub-topic with exactly one answer identifies the pairing. That is a small round leaking through
-- arithmetic rather than through this function, and it is the same residual survey_aggregate's own
-- floor cannot close for the overall figure (which is published at any n by design). It is not made
-- materially worse here, and it is not fixed here either.
--
--
-- n_asked IS DERIVED, NOT COUNTED — the same rule as §3.0.1 and the same predicate,
-- materiality_survey_routes_to. A respondent's denominator comes from the frozen question set and
-- their category's routing, never from the rows they happen to have written. Counting response rows
-- would make "answered 12 of 12" true of someone who answered twelve and was asked thirty-one.
--
-- ⚠️ IT COUNTS EVERY RESPONDENT IN THE ROUND, including those who have not opened it — unlike
-- survey_aggregate, which counts only respondents who REACHED the form. The two are answering
-- different questions: the aggregate is measuring the company, this is measuring the mailing list.
-- Someone at status 'invited' gets n_asked > 0 and n_answered = 0 here, which is exactly the row the
-- buyer needs in order to chase them, and exactly the row that must NOT reach a counter (§3.0.1).
--
-- DEPLOY: Lisa hand-runs this. Re-runnable (CREATE OR REPLACE). Ships with
-- app/dashboard/materiality/survey/[id]/page.tsx, which is its only caller.

begin;

create or replace function public.survey_respondent_progress(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
  v jsonb;
begin
  -- Owner-scoped. One message for "no such round" and "not yours", so a round id cannot be probed.
  select r.questionnaire_version
    into v_version
    from public.materiality_survey_rounds r
   where r.id = p_round_id
     and r.user_id = auth.uid();

  if not found then
    raise exception 'survey round not found' using errcode = 'no_data_found';
  end if;

  with q as (
    select q.id, q.shared_with_subtopic_code, s.topic_code
      from public.materiality_survey_questions q
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code
       and s.standard_version = q.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = v_version
       and q.status = 'included'
  ),
  r as (
    select r.id, c.labour_routing
      from public.materiality_survey_respondents r
      join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
     where r.round_id = p_round_id
  ),
  asked as (
    -- DERIVED, never counted. Same predicate the read path, the write path and the aggregation use.
    select r.id as respondent_id,
           count(*) filter (
             where public.materiality_survey_routes_to(
                     q.shared_with_subtopic_code, q.topic_code, r.labour_routing))::int as n_asked
      from r cross join q
     group by r.id
  ),
  ans as (
    select rs.respondent_id,
           count(*) filter (where rs.value is not null)::int as n_answered,
           count(*) filter (where rs.abstained)::int        as n_abstained,
           max(rs.updated_at)                                as last_activity
      from public.materiality_survey_responses rs
     where rs.round_id = p_round_id
       and rs.questionnaire_version = v_version
     group by rs.respondent_id
  )
  select coalesce(jsonb_object_agg(a.respondent_id::text, jsonb_build_object(
           'n_asked',      a.n_asked,
           'n_answered',   coalesce(x.n_answered, 0),
           'n_abstained',  coalesce(x.n_abstained, 0),
           -- n_skipped is the remainder, named rather than left to the caller's arithmetic — the
           -- same reason §3.0.1 names it: "saw it and did not engage" is a different fact from
           -- "saw it and could not say", and a caller subtracting on its own will merge them.
           'n_skipped',    a.n_asked - coalesce(x.n_answered, 0) - coalesce(x.n_abstained, 0),
           'last_activity', x.last_activity)), '{}'::jsonb)
    into v
    from asked a
    left join ans x on x.respondent_id = a.respondent_id;

  return coalesce(v, '{}'::jsonb);
end $$;

comment on function public.survey_respondent_progress(uuid) is
  'Per-respondent progress for one survey round, owner-scoped: n_asked (DERIVED from the frozen question set and the category routing, never counted from response rows), n_answered, n_abstained, n_skipped, last_activity. COUNTS ONLY — no value, no subtopic, no free text, nothing saying WHICH questions were answered. It refines a fact the customer already holds (respondent.status) from three buckets into a number; it hands over no answer. Exists because materiality_survey_responses is unreadable by authenticated by design, and the buyer''s progress screen cannot otherwise tell "opened and answered nothing" from "opened and answered thirty" — opposite facts for deciding whether to chase. Unlike survey_aggregate it counts EVERY respondent including those who never opened: the aggregate measures the company, this measures the mailing list.';

revoke all on function public.survey_respondent_progress(uuid) from public;
grant execute on function public.survey_respondent_progress(uuid) to authenticated;

commit;

-- ── VERIFY AFTER RUNNING ─────────────────────────────────────────────────────
-- Reads auth.uid(), so call it from the app rather than as postgres.
--
-- 1) Shape, against the shaped fixture (15 respondents):
--    select jsonb_pretty(public.survey_respondent_progress(:'round_id'));
--    -- expect one key per respondent, each with n_asked / n_answered / n_abstained / n_skipped /
--    -- last_activity. NOTHING else — no value, no subtopic_code, no free_text.
--
-- 2) ⚠️ n_asked IS THE ROUTING, NOT THE ANSWERS. In the shaped fixture the internal respondents are
--    asked 31 and the customer/community/consumer respondents 25:
--    select key, value -> 'n_asked' from jsonb_each(public.survey_respondent_progress(:'round_id'));
--    -- Delete every response row in the round and re-run: n_asked must be IDENTICAL, n_answered 0,
--    -- n_skipped = n_asked. If n_asked moves, it is being counted rather than derived.
--
-- 3) The counters reconcile per respondent, and n_skipped is never negative:
--    select count(*) from jsonb_each(public.survey_respondent_progress(:'round_id')) e
--     where (e.value ->> 'n_skipped')::int < 0
--        or (e.value ->> 'n_asked')::int <> (e.value ->> 'n_answered')::int
--                                          + (e.value ->> 'n_abstained')::int
--                                          + (e.value ->> 'n_skipped')::int;
--    -- expect 0
--
-- 4) ⚠️ IT COUNTS RESPONDENTS WHO NEVER OPENED, where survey_aggregate does not. Add a respondent
--    and do not open their link:
--    -- expect a key for them, n_asked > 0, n_answered 0
--    -- and survey_aggregate's participation.reached to be UNCHANGED by their existence.
--    -- The two disagreeing on the denominator is correct: one measures the company, one the list.
--
-- 5) Ownership, and that it is not reachable by a respondent:
--    select has_function_privilege('authenticated', 'public.survey_respondent_progress(uuid)', 'execute'); -- t
--    select has_function_privilege('anon',          'public.survey_respondent_progress(uuid)', 'execute'); -- f
--    -- someone else's round is refused with the same message as a missing one:
--    --   select public.survey_respondent_progress('<another account''s round>');  -- ERROR: survey round not found
--
-- 6) The response table is still unreachable directly — this file must not have widened anything:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'materiality_survey_responses'
--     group by grantee order by grantee;
--    -- expect service_role ONLY
