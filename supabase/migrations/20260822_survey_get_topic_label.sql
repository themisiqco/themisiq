-- 20260822_survey_get_topic_label.sql
--
-- Adds ONE field to survey_get's question whitelist: topic_label. Everything else in the function is
-- byte-identical to 20260820_materiality_survey_rpcs.sql.
--
-- WHY: app/survey/[token]/page.tsx renders the screening survey as a single page of up to 31
-- questions grouped under topic headings, rather than paginating. The payload had no topic field of
-- any kind, so the client could render the questions in the right order and nothing else — the array
-- arrives ordered by (topic.sort_order, subtopic.sort_order), but order without boundaries cannot
-- produce a heading. Grouping is what makes a single page navigable, and a single page is what keeps
-- the abstention option rendering identically 31 times (spec v8 §6.1 — see the page's own header).
--
--
-- =====================================================================
-- ⚠️ READ THIS BEFORE "IMPROVING" IT TO topic_code. THE LABEL IS NOT A LAZY SUBSTITUTE FOR THE CODE.
-- =====================================================================
-- It will look like one. A join through mr_esrs_topic_labels to fetch a display string, when
-- mr_esrs_subtopics.topic_code was right there in the same query and is shorter, cheaper and already
-- joined — that reads as an oversight, and the obvious tidy-up is to drop the second join and send
-- the code. DO NOT. The join is the point.
--
--   topic_code IS THE ROUTING KEY. 'S1' versus 'S2' is precisely what materiality_survey_routes_to()
--   switches on, and it is the one fact 20260820 withheld subtopic_code in order to withhold. Send
--   the code and any client can re-implement the S1/S2 routing — the single thing spec v8 §3.0.1
--   requires happen in exactly one place — and can read off which side of the labour pair the
--   customer classified this respondent onto.
--
--   mr_esrs_topic_labels.label IS SAFE FOR EXACTLY ONE REASON, AND IT IS A PROPERTY OF THE DATA, NOT
--   OF THE COLUMN NAME. S1 and S2 carry the BYTE-IDENTICAL string:
--
--       ('S1', 'esrs_2026', 'Own Workforce and Workers in the Value Chain'),
--       ('S2', 'esrs_2026', 'Own Workforce and Workers in the Value Chain'),
--
--   seeded that way on purpose in 20260815_mr_esrs_topic_labels.sql, because ESRS (2026) Appendix A
--   merges S1 and S2 into one topic row. So the label groups the questions and discloses NOTHING
--   about which of the two determinations they feed. An S1 respondent and an S2 respondent receive
--   the same heading, and neither payload distinguishes them.
--
-- ⚠️ THE SAFETY IS THEREFORE CONDITIONAL, AND THE CONDITION IS CHECKABLE. If the two labels are ever
-- made to differ — split back apart, disambiguated "(own workforce)" / "(value chain)", or a 2023
-- taxonomy seeded where the merge does not apply — THIS FIELD BECOMES THE ROUTING KEY IN DISGUISE
-- and this migration must be revisited in the same pass. Verify step 3 below is that check, and it
-- is written to be re-runnable rather than read once:
--
--     select count(distinct label) from public.mr_esrs_topic_labels
--      where topic_code in ('S1','S2') and standard_version = 'esrs_2026';   -- MUST be 1
--
-- The rest of the whitelist is unchanged, and every column 20260820's header lists as deliberately
-- withheld stays withheld — subtopic_code, standard_version, shared_with_subtopic_code, status,
-- sort_order, round_id, user_id, questionnaire_version, and the respondent's whole classification.
-- ADD ANYTHING ELSE ONLY AFTER A PRIVACY REVIEW, and never by reintroducing to_jsonb.
--
--
-- NULL ON ENTITY-SPECIFIC MATTERS, AND THAT IS THE WANTED BEHAVIOUR. A question with subtopic_code
-- NULL (§3.2 — a matter outside Appendix A's list) has no sub-topic, hence no topic, hence no label.
-- Both joins are LEFT, so it survives the projection with topic_label null rather than being dropped
-- from the form — the same reason 20260820's question join is LEFT. The page renders those in a
-- final named group and shows that group only when it is non-empty, so a null never becomes a blank
-- heading. Nothing generates such a row today; the path exists before the question editor does, on
-- purpose.
--
--
-- SCOPE — ONE CONCERN, stated the way 20260815_portal_get_whitelist.sql states it. Byte-identical to
-- the 20260820 definition apart from the added left join and the added 'topic_label' key: the token
-- gate, the short-form routing guard, the empty-form refusal, the invited -> in_progress side
-- effect, the responses array, SECURITY DEFINER, SET search_path = public, and the signature are all
-- unchanged.
--
-- GRANTS ARE NOT RE-EMITTED, DELIBERATELY. CREATE OR REPLACE FUNCTION preserves ownership and
-- privileges when the signature is unchanged, so the anon/authenticated EXECUTE grants from
-- 20260820 survive this file untouched. Re-emitting them would be a second concern and would risk
-- restating them wrongly. Verify step 4 confirms they are still in place.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable (CREATE OR REPLACE). It is a
-- pure ADDITION to the response, so the 20260820 version of the page keeps working; it must be run
-- BEFORE app/survey/[token]/page.tsx ships, because that page groups on this field.

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

  -- ── The short-form guard. 25 is a correct result for a not_asked respondent and a defect for
  -- anyone else, and the two are indistinguishable from the outside without this.
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
     -- Counted BEFORE the `included` filter: deselecting a labour question is a legitimate customer
     -- decision (§3.2) and must not read as a routing failure.
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
      -- Half, not 6: the S1.x <-> S2.x pairing is 1:1 by construction, so this catches a total
      -- mapping failure AND a partial one without hardcoding a count the taxonomy could change.
      raise exception
        'Survey routing failed: stakeholder category % routes to %, but % of the round''s % paired '
        'questions matched (expected exactly half). Refusing to serve a short form — it would be '
        'indistinguishable from the 25 questions a not_asked respondent correctly receives.',
        v_category, v_routing, v_labour_routed, v_labour_total;
    end if;
  end if;

  -- ── Respondent-safe WHITELISTS only. Do NOT to_jsonb() any of these three tables — that is the
  -- defect 20260815_portal_get_whitelist.sql exists to remove, and it re-leaks every column added to
  -- those tables from that day forward, silently. Add a field only after a privacy review.
  select jsonb_build_object(
           'round', jsonb_build_object(
                      'name',         rd.name,
                      'company_name', rd.company_name,
                      'deadline',     rd.deadline),
           -- The respondent's own display name and nothing else. No email, no token, no
           -- classification, and no sight of any other respondent.
           'respondent', jsonb_build_object(
                      'display_name', v_name),
           'questions', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'question_id',      q.id,
                      'short_name',       q.short_name,
                      'question_framing', q.question_framing,
                      'wording',          q.wording,
                      'context',          q.context,
                      -- ⚠️ THE LABEL, NEVER THE CODE. See this file's header: topic_code is the S1/S2
                      -- routing key and stays withheld; this label is safe only because S1 and S2
                      -- carry Appendix A's byte-identical joint title.
                      'topic_label',      tl.label)
                    order by q.sort_order)
               from public.materiality_survey_questions q
               -- LEFT: an entity-specific matter (subtopic_code null) has no row in
               -- mr_esrs_subtopics, and an inner join would drop it from the form with no error.
               left join public.mr_esrs_subtopics s
                 on s.code = q.subtopic_code
                and s.standard_version = q.standard_version
               -- LEFT for the same reason, one link further out: no sub-topic means no topic means
               -- no label, and the question must still reach the respondent.
               left join public.mr_esrs_topic_labels tl
                 on tl.topic_code = s.topic_code
                and tl.standard_version = s.standard_version
              where q.round_id = v_round_id
                and q.questionnaire_version = v_version
                and q.status = 'included'
                and public.materiality_survey_routes_to(
                      q.shared_with_subtopic_code, s.topic_code, v_routing)),
             '[]'::jsonb),
           -- Save-and-return. This respondent's own answers, four fields, nothing else.
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

  -- Unreachable: resolve_token already joined the round, so it exists. Kept because returning NULL
  -- from here would reach the client as a successful empty response — an absence rendered as a
  -- result, which is the failure class this codebase has paid for four times.
  if v is null then
    raise exception
      'Survey round % vanished between the token check and the projection.', v_round_id;
  end if;

  -- A form with no questions renders as an empty page, which reads to a respondent as "this is
  -- broken" and to the customer as "nobody answered". Both are wrong, and neither is recoverable
  -- after the fact. Refuse and name the reason instead.
  v_question_count := jsonb_array_length(v -> 'questions');
  if v_question_count = 0 then
    raise exception
      'This survey round has no questions to show you. Every question in the set is either '
      'deselected or excluded by routing, so there is nothing to answer — reporting that rather '
      'than presenting an empty form.';
  end if;

  -- Same side effect as portal_get, on first touch only.
  update public.materiality_survey_respondents
     set status = 'in_progress'
   where id = v_respondent_id
     and status = 'invited';

  return v;
end $$;

comment on function public.survey_get(uuid) is
  'What a survey respondent needs to fill the form in, and nothing else. THREE EXPLICIT WHITELISTS — no to_jsonb of any table; see the header of 20260820_materiality_survey_rpcs.sql for every column deliberately withheld and why, and 20260822_survey_get_topic_label.sql for why each question carries mr_esrs_topic_labels.label and NEVER topic_code (the label is the S1/S2 routing key''s safe counterpart only because Appendix A gives S1 and S2 one byte-identical joint title). Applies the §3.0.1 labour routing: an s1 or s2 respondent receives 31 questions (25 shared + their side of the six labour pairs) and a not_asked respondent correctly receives 25. NOBODY receives 37 — that is the matrix row count, not a form length. Guards that a SHORT form is never served in place of a correct one. Flips invited -> in_progress on first touch. Refuses an unknown, revoked, expired or completed token with one indistinguishable message.';

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- Reuse 20260820's verify setup (a round and three respondents, one per routing outcome). As there:
-- checks expecting an ERROR need savepoints, and user_id must be supplied explicitly because
-- auth.uid() is NULL in the SQL editor.
--
-- 1) The field is present on every question, and the codes are still absent:
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'questions' -> 0);
--    -- expect exactly: question_id, short_name, question_framing, wording, context, topic_label
--    select count(*) filter (where q ? 'subtopic_code' or q ? 'topic_code')
--      from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q;   -- expect 0
--
-- 2) Grouping actually works — the labels partition the form, in order, with no nulls on a
--    generated round:
--    select q ->> 'topic_label' as topic, count(*)
--      from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q
--     group by 1 order by min(ordinality) ;   -- (add WITH ORDINALITY if you want the order column)
--    -- expect 9 groups for an s1 respondent: Climate Change 3, Pollution 5, Water 1, Biodiversity
--    -- and Ecosystems 4, Circular Economy and Resource Use 3, Own Workforce and Workers in the
--    -- Value Chain 6, Affected Communities 3, Consumers and End-users 3, Business Conduct 3 = 31
--    select count(*) filter (where q ->> 'topic_label' is null)
--      from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q;   -- expect 0
--    -- and 8 groups / 25 questions for the not_asked respondent, with the labour heading absent:
--    select count(distinct q ->> 'topic_label')
--      from jsonb_array_elements(public.survey_get(:'na_token') -> 'questions') q;   -- expect 8
--
-- 3) ⚠️ THE CONDITION THE SAFETY RESTS ON — RE-RUN THIS, DO NOT ASSUME IT. If it ever returns
--    anything but 1, topic_label has become the routing key in disguise and this migration must be
--    revisited before the page ships again:
--    select count(distinct label) from public.mr_esrs_topic_labels
--     where topic_code in ('S1', 'S2') and standard_version = 'esrs_2026';           -- MUST be 1
--    -- The same fact from the respondent's side: an s1 and an s2 respondent see the SAME heading,
--    -- so nothing in the payload tells them which determination their answers feed:
--    select (select distinct q ->> 'topic_label'
--              from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q
--             where q ->> 'question_framing' is not null)
--         = (select distinct q ->> 'topic_label'
--              from jsonb_array_elements(public.survey_get(:'s2_token') -> 'questions') q
--             where q ->> 'question_framing' is not null) as headings_identical;      -- expect t
--
-- 4) Grants survived CREATE OR REPLACE (nothing above re-emits them), and it is still a definer:
--    select prosecdef from pg_proc where proname = 'survey_get';                     -- expect t
--    select has_function_privilege('anon', 'public.survey_get(uuid)', 'execute');           -- t
--    select has_function_privilege('authenticated', 'public.survey_get(uuid)', 'execute');  -- t
--    select has_function_privilege('service_role', 'public.survey_get(uuid)', 'execute');   -- f
--
-- 5) Nothing else moved. The routing, the counts and the refusals are unchanged:
--    select jsonb_array_length(public.survey_get(:'s1_token') -> 'questions');   -- expect 31
--    select jsonb_array_length(public.survey_get(:'na_token') -> 'questions');   -- expect 25
--    savepoint v5; select public.survey_get(gen_random_uuid());  -- ERROR: invalid token
--    rollback to savepoint v5;
--
-- 6) An entity-specific matter carries a null label rather than being dropped. There is no generator
--    for these yet, so insert one by hand to prove the LEFT joins:
--    begin;
--      insert into public.materiality_survey_questions
--        (round_id, user_id, questionnaire_version, subtopic_code, standard_version,
--         status, short_name, wording, sort_order)
--      values (:'round_id', :'u_id', 1, null, 'esrs_2026', 'included',
--              'Grain supply chains', 'Grain supply chains', 99);
--      select jsonb_array_length(public.survey_get(:'s1_token') -> 'questions');   -- expect 32
--      select q ->> 'short_name', q ->> 'topic_label'
--        from jsonb_array_elements(public.survey_get(:'s1_token') -> 'questions') q
--       where q ->> 'topic_label' is null;
--      -- expect exactly one row: Grain supply chains | (null)   — present, not dropped
--    rollback;
