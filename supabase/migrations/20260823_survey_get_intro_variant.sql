-- 20260823_survey_get_intro_variant.sql
--
-- Adds ONE top-level field to survey_get: intro_variant, one of 'internal' | 'value_chain' |
-- 'external'. Plus the small helper that resolves it. Everything else in the function is
-- byte-identical to 20260822_survey_get_topic_label.sql.
--
-- ⚠️ RUN AFTER 20260822. This file re-emits the WHOLE survey_get body and therefore CONTAINS
-- 20260822's topic_label change; running them out of order would silently revert it. Verify step 1
-- checks both fields at once for exactly that reason.
--
-- WHY: app/survey/[token]/page.tsx opens with copy that varies by respondent track
-- (docs/survey-intro-copy.md). A supplier's employee needs to be told, in the first paragraph, that
-- the company asking is their employer's CUSTOMER and that their answers go to that company rather
-- than to their employer — neither of which is true or useful for an internal respondent or for a
-- regulator. The page cannot work out which of the three to show: stakeholder_category is
-- deliberately withheld (20260820), and handing it back would give a client the routing key.
--
--
-- =====================================================================
-- ⚠️ WHY THIS IS A DISPLAY FACT AND NOT THE ROUTING KEY IN A NEW HAT
-- =====================================================================
-- The distinction is the same one 20260822 draws about topic_label, and it is worth stating in its
-- own terms because the two are not obviously the same case.
--
-- WHAT topic_code / stakeholder_category WOULD TELL A CLIENT: which sub-topics this respondent is
-- being shown and why — enough to re-implement §3.0.1's routing, which must happen in exactly one
-- place, and enough to read off which side of the S1/S2 labour pair the customer classified them
-- onto.
--
-- WHAT intro_variant TELLS A CLIENT: which of three paragraphs to print. It does not name a
-- sub-topic, does not name a category, and does not distinguish `supplier` from
-- `value_chain_worker` from `workers_rep_value_chain` — all three collapse to 'value_chain'.
-- The respondent already knows which of the three they are; the whole point of the copy is to say
-- it back to them plainly. It reveals nothing they did not know before opening the link.
--
-- Three values, eleven categories, and the collapse is lossy on purpose: a client cannot invert it.
--
--
-- =====================================================================
-- ⚠️ IT DERIVES FROM labour_routing, SO THERE IS NO SECOND SWITCH ON stakeholder_category
-- =====================================================================
-- The obvious way to write this would be a CASE over the eleven category codes — 's1 categories get
-- internal, s2 categories get value_chain, the rest get external'. That would be a SECOND
-- enumeration of the same eleven categories, in a function body, able to drift from the one in
-- mr_stakeholder_categories the moment a category is added. 20260818's header already forbids that
-- shape for the routing itself ("the routing rule is the kind of thing that gets quietly edited in a
-- function body during an unrelated change; in a seeded table with a migration of record, it
-- cannot"), and the argument does not weaken because the output is copy rather than a determination
-- — a supplier shown variant A is told their answers are anonymous within their own organisation,
-- which is not what the schema promises them.
--
-- So the eleven categories are NOT enumerated here, or anywhere in this file. The variant is a
-- function of mr_stakeholder_categories.labour_routing — the same column materiality_survey_routes_to
-- switches on, already resolved by materiality_survey_resolve_token and already in hand as v_routing.
-- Adding a category to the seed gives it an intro variant automatically, from its labour_routing,
-- with no code change and no possibility of the two disagreeing.
--
--   labour_routing 's1'         -> 'internal'      own_workforce, workers_rep_own
--   labour_routing 's2'         -> 'value_chain'   value_chain_worker, workers_rep_value_chain,
--                                                  supplier
--   labour_routing 'not_asked'  -> 'external'      affected_community, consumer_end_user, customer,
--                                                  investor_lender, regulator, civil_society
--
-- ⚠️ NOTE 'value_chain' IS NOT 'external'. A customer and a regulator are external respondents and
-- get 'external', because neither has a workplace inside the value chain to answer about — which is
-- the same reason they are not asked the S2 labour sub-topics at all. The intro copy and the labour
-- routing partition the respondents identically because they are answering the same question about
-- them, and that is precisely why one column should drive both.
--
--
-- =====================================================================
-- ⚠️ THE HELPER RAISES ON AN UNKNOWN ROUTING RATHER THAN RETURNING NULL
-- =====================================================================
-- Same discipline as materiality_survey_routes_to's ELSE, and for a sharper reason. A NULL variant
-- would reach the page, which cannot know which paragraph is right and so must print none — a
-- respondent silently missing the one paragraph written for their situation, with nothing anywhere
-- going red. A supplier is the case that matters: variant B is where they are told their answers go
-- to the customer and not to their employer, and dropping it silently is worse than not loading the
-- page at all.
--
-- So a labour_routing value neither function recognises fails BOTH of them, loudly, at the same
-- moment. That is the intended coupling: the day a fourth routing outcome is added, the survey
-- refuses to serve rather than serving something half-right, and the fix is one seed plus two
-- CASE arms in the same pass.
--
--
-- SCOPE — ONE CONCERN. Byte-identical to the 20260822 definition apart from the added
-- 'intro_variant' key and the new helper: the token gate, the short-form routing guard, the
-- empty-form refusal, the topic_label join, the invited -> in_progress side effect, the responses
-- array, SECURITY DEFINER, SET search_path = public, and the signature are all unchanged. Every
-- column 20260820's header lists as withheld stays withheld.
--
-- GRANTS ARE NOT RE-EMITTED for survey_get — CREATE OR REPLACE preserves them when the signature is
-- unchanged. The new helper IS revoked from PUBLIC, like the other two: it is called only from
-- inside a definer body, where the current user is already the owner, so it needs no grant of its
-- own and giving it one would be a second way in for no gain.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260822. Re-runnable (CREATE OR
-- REPLACE). It is a pure ADDITION to the response; the current page keeps working against it, and
-- the varied intro needs it before app/survey/[token]/page.tsx ships with the new copy.

begin;

-- =====================================================================
-- The variant map. One CASE, over labour_routing, never over stakeholder_category.
-- =====================================================================
create or replace function public.materiality_survey_intro_variant(p_labour_routing text)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  case p_labour_routing
    when 's1'        then return 'internal';
    when 's2'        then return 'value_chain';
    when 'not_asked' then return 'external';
    else
      raise exception
        'materiality_survey_intro_variant: unknown labour_routing %. Refusing rather than returning '
        'null, because a null variant reaches the page as a MISSING opening paragraph — and the one '
        'that goes missing for an s2 respondent is the paragraph telling them their answers go to '
        'the customer and not to their employer.',
        p_labour_routing;
  end case;
end $$;

comment on function public.materiality_survey_intro_variant(text) is
  'Maps mr_stakeholder_categories.labour_routing to the respondent-page intro variant: s1 -> internal, s2 -> value_chain, not_asked -> external (docs/survey-intro-copy.md). DERIVED FROM labour_routing ON PURPOSE, so the eleven stakeholder categories are enumerated once, in the seeded table, and never a second time in a function body that could drift from it — the same argument 20260818''s header makes for the routing itself. A DISPLAY FACT, not a routing key: three values over eleven categories, lossy and non-invertible, naming no sub-topic and no category. Raises on an unrecognised routing rather than returning null, because a null variant is a silently missing paragraph.';

-- =====================================================================
-- survey_get — re-emitted whole. Contains 20260822's topic_label change.
-- =====================================================================
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
           -- ⚠️ WHICH PARAGRAPH TO PRINT, NOT WHICH CATEGORY THIS PERSON IS. Three values over
           -- eleven categories; see this file's header for why that is a display fact and
           -- stakeholder_category is not. Derived from labour_routing, so it cannot disagree with
           -- the routing that selected the questions below.
           'intro_variant', public.materiality_survey_intro_variant(v_routing),
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
                      -- ⚠️ THE LABEL, NEVER THE CODE. See 20260822: topic_code is the S1/S2 routing
                      -- key and stays withheld; this label is safe only because S1 and S2 carry
                      -- Appendix A's byte-identical joint title.
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
  'What a survey respondent needs to fill the form in, and nothing else. FOUR EXPLICIT WHITELISTS plus intro_variant — no to_jsonb of any table; see 20260820 for every column deliberately withheld, 20260822 for why each question carries mr_esrs_topic_labels.label and NEVER topic_code, and 20260823 for why intro_variant is a display fact (three values over eleven categories, derived from labour_routing) while stakeholder_category stays withheld. Applies the §3.0.1 labour routing: an s1 or s2 respondent receives 31 questions (25 shared + their side of the six labour pairs) and a not_asked respondent correctly receives 25. NOBODY receives 37 — that is the matrix row count, not a form length. Guards that a SHORT form is never served in place of a correct one. Flips invited -> in_progress on first touch. Refuses an unknown, revoked, expired or completed token with one indistinguishable message.';

-- The helper is called only from inside a definer body, where the current user is already the owner.
-- It needs no grant, and giving it one would be a second way in for no gain. Same posture as
-- materiality_survey_routes_to and materiality_survey_resolve_token.
revoke all on function public.materiality_survey_intro_variant(text) from public;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- Reuse 20260820's verify setup — a round and three respondents, one per routing outcome (s1_token =
-- own_workforce, s2_token = supplier, na_token = customer). As there: savepoints around anything
-- expecting an ERROR, and user_id supplied explicitly because auth.uid() is NULL in the SQL editor.
--
-- 1) ⚠️ BOTH FIELDS AT ONCE. This is the run-order check: if topic_label is missing, 20260822 was
--    applied AFTER this file and its change has been reverted.
--    select jsonb_object_keys(public.survey_get(:'s1_token'));
--    -- expect exactly: intro_variant, round, respondent, questions, responses
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'questions' -> 0);
--    -- expect exactly: question_id, short_name, question_framing, wording, context, topic_label
--
-- 2) The three variants, from the three routings:
--    select public.survey_get(:'s1_token') ->> 'intro_variant';   -- expect internal
--    select public.survey_get(:'s2_token') ->> 'intro_variant';   -- expect value_chain
--    select public.survey_get(:'na_token') ->> 'intro_variant';   -- expect external
--
-- 3) ⚠️ THE PARTITION IS THE ROUTING'S, NOT A SECOND ONE. Every seeded category resolves, and the
--    three groups are exactly the A/B/C lists in docs/survey-intro-copy.md. Read this rather than
--    trusting it — it is the check that a category added later did not silently miss a variant:
--    select public.materiality_survey_intro_variant(c.labour_routing) as variant,
--           string_agg(c.code, ', ' order by c.sort_order) as categories,
--           count(*)
--      from public.mr_stakeholder_categories c
--     group by 1 order by 1;
--    -- expect exactly three rows:
--    --   external     | affected_community, consumer_end_user, customer, investor_lender,
--    --                  regulator, civil_society                                        | 6
--    --   internal     | own_workforce, workers_rep_own                                  | 2
--    --   value_chain  | value_chain_worker, workers_rep_value_chain, supplier           | 3
--    -- ⚠️ value_chain is NOT "external". A customer and a regulator are external respondents and
--    -- land in `external`, because neither has a workplace inside the value chain to answer about.
--    -- If that ever stops being true, the S2 labour routing has changed too, and both must move
--    -- together — which is the whole reason this derives from labour_routing.
--
-- 4) The helper refuses an unrecognised routing rather than returning null:
--    savepoint v4;
--      select public.materiality_survey_intro_variant('s3');
--      -- ERROR: materiality_survey_intro_variant: unknown labour_routing s3...
--    rollback to savepoint v4;
--    -- and it is not reachable directly by a browser caller:
--    select has_function_privilege('anon', 'public.materiality_survey_intro_variant(text)', 'execute');
--    -- expect f
--
-- 5) ⚠️ THE COUNT THE PAGE PRINTS COMES FROM THE PAYLOAD. docs/survey-intro-copy.md's shared block
--    reads "One question per topic, {n} in all", and {n} is 31 or 25 depending on routing. Confirm
--    the payload carries both numbers correctly, because a page saying 31 to someone shown 25 is a
--    lie the respondent can count:
--    select public.survey_get(:'s1_token') ->> 'intro_variant' as variant,
--           jsonb_array_length(public.survey_get(:'s1_token') -> 'questions') as n;  -- internal | 31
--    select public.survey_get(:'s2_token') ->> 'intro_variant' as variant,
--           jsonb_array_length(public.survey_get(:'s2_token') -> 'questions') as n;  -- value_chain | 31
--    select public.survey_get(:'na_token') ->> 'intro_variant' as variant,
--           jsonb_array_length(public.survey_get(:'na_token') -> 'questions') as n;  -- external | 25
--
-- 6) Nothing else moved. Grants survived CREATE OR REPLACE, it is still a definer, and the refusals
--    are unchanged:
--    select prosecdef from pg_proc where proname = 'survey_get';                     -- expect t
--    select has_function_privilege('anon', 'public.survey_get(uuid)', 'execute');           -- t
--    select has_function_privilege('authenticated', 'public.survey_get(uuid)', 'execute');  -- t
--    savepoint v6; select public.survey_get(gen_random_uuid());  -- ERROR: invalid token
--    rollback to savepoint v6;
--
-- 7) The variant does NOT distinguish the three s2 categories — it is lossy on purpose, so a client
--    cannot invert it back to a category. Invite a value_chain_worker alongside the supplier and
--    confirm both read the same:
--    begin;
--      insert into public.materiality_survey_respondents
--        (round_id, user_id, track, stakeholder_category, invite_name)
--      values (:'round_id', :'u_id', 'external', 'value_chain_worker', 'VC Worker')
--      returning token \gset vc_
--      select public.survey_get(:'vc_token') ->> 'intro_variant'
--           = public.survey_get(:'s2_token') ->> 'intro_variant' as indistinguishable;  -- expect t
--    rollback;
