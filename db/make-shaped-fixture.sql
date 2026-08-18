-- Creates a round with 15 respondents and DELIBERATELY SHAPED answers, so the
-- aggregation's triggers have something to fire on. Four respondents proved the
-- plumbing; nothing in that round could produce a polarised sub-topic or a
-- between-group gap, so neither active trigger has ever fired.
--
-- COMMITS. Clean up with the DELETE printed at the end.
--
-- What is engineered, and what each is testing:
--
--   E1.1  POLARISED — internal staff split hard, 5 at "1" and 5 at "3", almost
--         nothing at "2". The mean would be ~2.0 and say nothing; this is a
--         company whose own people fundamentally disagree.
--
--   S1.3 / S2.3  S1_S2_CONTRAST — own workforce says health and safety is fine
--         (all 1s); workers at the suppliers say it needs significant focus
--         (all 3s). Nobody disagrees — two populations report different
--         realities. The sharpest line the module can produce.
--
--   E3.1  EVERYONE ABSTAINS — no visibility of water use anywhere. §6.1 says
--         this is itself a finding, and it must not read as "low priority".
--
--   E2.1  CLEAN CONSENSUS — everyone at "3". The control: high top_box, high
--         modal_share, not polarised, no gap.
--
--   G1.1  SPARSE — two answers only, below the anonymity floor on every
--         breakdown. Tests suppression and the two-valued track rule.

\set ON_ERROR_STOP on
\timing off

-- ⚠️ WHICH ACCOUNT THIS FIXTURE BELONGS TO.
--
-- This used to read `order by created_at limit 1`, which resolves to whichever account was created
-- first — not to whoever is running the fixture. Every round it made was therefore owned by someone
-- else, and RLS made them invisible in the browser: the scope screen correctly refused a round it
-- could not see, and the fixture looked like it had worked.
--
-- Named explicitly, overridable without editing this file:
--     psql "$DBURL" -v app_user=someone@example.com -f <this file>
\if :{?app_user}
\else
  \set app_user 'lisa.foster@themisiq.co'
\endif

-- ⚠️ FAIL HERE, NOT TWO STATEMENTS LATER. A missing account used to surface as a NOT NULL violation
-- on materiality_survey_rounds.user_id — an error naming the wrong problem, in a file that had
-- already started inserting. The sub-selects guarantee exactly one row, so \gset always sets both
-- variables and the check below is reached with a message that names the address it looked for.
select
  (select id from auth.users where email = :'app_user')            as u_id,
  ((select id from auth.users where email = :'app_user') is null)  as u_missing
\gset

\if :u_missing
\echo ''
\echo '  FIXTURE ABORTED — no auth.users row for :app_user'
\echo ''
\echo '  Nothing was inserted. Re-run naming the account you are signed in as:'
\echo '    psql "$DBURL" -v app_user=you@example.com -f <this file>'
\echo ''
\quit
\endif

\echo 'Fixture owner: :app_user'


insert into public.materiality_survey_rounds
  (user_id, name, company_name, standard_version, deadline, status)
values (:'u_id', 'Shaped fixture', 'Northwind Foods Ltd', 'esrs_2026',
        current_date + 21, 'open')
returning id as round_id \gset

-- ── 15 respondents: 8 internal, 4 value chain, 3 not-asked ───────────────────
insert into public.materiality_survey_respondents
  (round_id, user_id, track, stakeholder_category, invite_name, status)
select :'round_id', :'u_id', t, c, n, 'in_progress'
from (values
  ('internal','own_workforce','Internal 1'),
  ('internal','own_workforce','Internal 2'),
  ('internal','own_workforce','Internal 3'),
  ('internal','own_workforce','Internal 4'),
  ('internal','own_workforce','Internal 5'),
  ('internal','own_workforce','Internal 6'),
  ('internal','own_workforce','Internal 7'),
  ('internal','workers_rep_own','Union Rep'),
  ('external','value_chain_worker','VC Worker 1'),
  ('external','value_chain_worker','VC Worker 2'),
  ('external','value_chain_worker','VC Worker 3'),
  ('external','supplier','Supplier Co'),
  ('external','customer','Customer A'),
  ('external','affected_community','Community Rep'),
  ('external','consumer_end_user','Consumer B')
) as v(t,c,n);

-- helper: question id for a sub-topic code in this round
create temporary table fixture_q as
select subtopic_code, id as question_id
from public.materiality_survey_questions
where round_id = :'round_id';

create temporary table fixture_r as
select r.id, r.invite_name, r.track, r.stakeholder_category, c.labour_routing,
       row_number() over (order by r.invite_name) as rn
from public.materiality_survey_respondents r
join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
where r.round_id = :'round_id';

-- ── E1.1 — POLARISED. Internals split 4 at "1", 4 at "3". ────────────────────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'E1.1',
       case when r.rn % 2 = 0 then 1 else 3 end, false,
       r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'E1.1') q
where r.labour_routing = 's1';

-- ── E2.1 — CONSENSUS. Everyone who was asked says 3. ─────────────────────────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'E2.1',
       3, false, r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'E2.1') q;

-- ── E3.1 — EVERYONE ABSTAINS. No visibility of water use. ────────────────────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'E3.1',
       null, true, r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'E3.1') q;

-- ── S1.3 — own workforce: health and safety is FINE (all 1s) ─────────────────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'S1.3',
       1, false, r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'S1.3') q
where r.labour_routing = 's1';

-- ── S2.3 — their suppliers' workers: it needs SIGNIFICANT FOCUS (all 3s) ─────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'S2.3',
       3, false, r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'S2.3') q
where r.labour_routing = 's2';

-- ── G1.1 — SPARSE. Two answers only. ─────────────────────────────────────────
insert into public.materiality_survey_responses
  (round_id, respondent_id, question_id, questionnaire_version, standard_version,
   asked_subtopic_code, value, abstained, track, stakeholder_category)
select :'round_id', r.id, q.question_id, 1, 'esrs_2026', 'G1.1',
       2, false, r.track, r.stakeholder_category
from fixture_r r cross join (select question_id from fixture_q where subtopic_code = 'G1.1') q
where r.rn <= 2;

\echo ''
\echo '=== RESPONSES WRITTEN, BY SUB-TOPIC ==='
select q.subtopic_code,
       count(*) filter (where not resp.abstained) as scored,
       count(*) filter (where resp.abstained)     as abstained,
       count(*) filter (where resp.value = 1)     as at_1,
       count(*) filter (where resp.value = 2)     as at_2,
       count(*) filter (where resp.value = 3)     as at_3
from public.materiality_survey_responses resp
join public.materiality_survey_questions q on q.id = resp.question_id
where resp.round_id = :'round_id'
group by q.subtopic_code
order by q.subtopic_code;

\echo ''
\echo '=== ROUND ID — keep this ==='
\echo :'round_id'
\echo ''
\echo 'Aggregate it with the block in /tmp/agg.sql, swapping this id in.'
\echo 'Delete with BOTH statements, in this order:'
\echo '  delete from public.materiality_survey_responses where round_id = <id>;'
\echo '  delete from public.materiality_survey_rounds     where id = <id>;'
\echo 'Deleting the round alone FAILS: materiality_survey_responses -> questions is ON DELETE'
\echo 'RESTRICT (20260819), so an answered question cannot be deleted out from under its answers.'
\echo 'That is the guarantee working, not an obstacle — a survey answer must not vanish because'
\echo 'someone tidied up a question, and n_asked is derived from the question set, so a deleted'
\echo 'question would shrink the denominator of every historical aggregate with nothing going red.'
\echo ''
