-- 20260837_survey_aggregate_unknown_reason.sql
--
-- Re-emits survey_aggregate with THREE reasons for an unknown topic instead of two, and the same
-- correction one level down in the breakdown omissions. No other change: the counter derivation,
-- suppression, roll-up, both registers, the S1/S2 contrast and the free-text block are byte-identical
-- to 20260831.
--
-- ⚠️ RUN AFTER 20260831. This file contains everything that one added; applying them out of order
-- reverts the free-text block.
--
--
-- =====================================================================
-- ⚠️ TIMING IS NOT ENGAGEMENT, AND THE PAYLOAD WAS REPORTING ONE AS THE OTHER
-- =====================================================================
-- A topic resolves to unknown when no included sub-topic under it has an answer. There were two
-- reasons for that and they are not the same kind of fact:
--
--   'no_eligible_respondents'   ENGAGEMENT. Respondents reached the form, and none of their
--                               stakeholder categories routes to this topic. This is INVARIANT 5
--                               (spec v9 §6.3): a round with forty customers and no value-chain
--                               workers yields unknown S2, and that is a real, serious finding about
--                               who the undertaking engaged. It must never be inherited from S1 and
--                               it belongs in the report.
--
--   'no_answers'                Respondents were asked and none produced a value.
--
-- Both were computed from n_asked, and on a round NOBODY HAS OPENED YET n_asked is zero everywhere —
-- because materiality_survey_counter_rows counts only respondents who reached the form. So a brand
-- new round with forty invitations out reported 'no_eligible_respondents' on all ten topics: it told
-- the customer their invite list had missed entire categories, when in fact nobody had clicked a link.
--
-- THAT IS THIS MODULE'S RECURRING ERROR, arriving in a new place. 20260826's header states it
-- directly about n_asked: "counting an unopened invitation as asked-and-skipped is a fact about email
-- delivery reported as a finding about the company." The denominator was fixed there and the REASON
-- STRING was left collapsing the same two things.
--
--   'awaiting_first_response'   TIMING. Invitations exist and participation.reached is zero. It will
--                               stop being true the moment one person opens the survey.
--
-- The two are distinguishable in data and the aggregate already holds both facts — participation
-- counts every respondent, the counters count only those who reached — so collapsing them was a loss
-- the payload did not need to take.
--
-- ⚠️ NAMED SO THE THREE CANNOT BE CONFUSED AT A GLANCE. 'awaiting_first_response' reads as temporal
-- on sight and shares no words with the other two. A reader hitting the case arms sees three
-- branches and, from the names alone, that one of them is about the clock and two are about who was
-- asked.
--
-- ⚠️ ORDER MATTERS. The timing arm is tested BEFORE the eligibility arm. Reversed, a round nobody has
-- opened still reports no_eligible_respondents, because n_asked = 0 satisfies both.
--
--
-- =====================================================================
-- ⚠️ THE SAME COLLAPSE, FOUND ONE LEVEL DOWN, FIXED IN THE SAME PASS
-- =====================================================================
-- The breakdown omission read `coalesce(cells_in_dim, 0) <= 1`, mapping ZERO participating groups and
-- ONE participating group to the same reason. So on a round nobody has opened, every dimension
-- reported:
--
--     { omitted: true, reason: 'single_group' }
--
-- meaning "its one cell equals the overall, so it adds nothing" — a claim about a group that does not
-- exist. Zero now returns 'no_respondents', which is a different fact and a temporary one.
--
-- AUDITED AND CLEAN ELSEWHERE. s1_s2_contrast's not_comparable_reason strings were checked and make
-- no eligibility claim: "no value-chain respondent ANSWERED this sub-topic" is true whether nobody
-- was invited or nobody has opened yet, and it is phrased about answering rather than about who was
-- asked. survey_respondent_progress (20260835) returns counts and no reason strings at all.
--
-- ⚠️ ONE AMBIGUITY LEFT DELIBERATELY, FOR THE SCREEN TO HANDLE. subtopics[].overall is null for an
-- EXCLUDED sub-topic and also null for an included one on a round with no responses, because the
-- ov_stat subquery matches no row. The two are distinguishable by `status`, and the results screen
-- must branch on that rather than on overall being null. It is not fixed here: emitting a zeroed
-- overall would be truthful but changes the shape for every consumer, and there is exactly one
-- consumer being written right now that can simply read `status`.
--
-- DEPLOY: Lisa hand-runs this, after 20260831. Re-runnable (CREATE OR REPLACE). No client change is
-- required by it; the results screen consumes the new reasons.

begin;

create or replace function public.survey_aggregate(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round    record;
  v_floor    int;
  v_ft_floor int;
  v jsonb;
begin
  select r.id, r.name, r.company_name, r.standard_version, r.questionnaire_version,
         r.anonymity_floor, r.polarised_extreme_min_n, r.polarised_middle_max_share,
         r.top_box_gap_margin, r.free_text_group_floor, r.deadline, r.frozen_at, r.status
    into v_round
    from public.materiality_survey_rounds r
   where r.id = p_round_id
     and r.user_id = auth.uid();

  if not found then
    raise exception 'survey round not found' using errcode = 'no_data_found';
  end if;

  v_floor    := v_round.anonymity_floor;
  v_ft_floor := v_round.free_text_group_floor;

  with
  cells as materialized (
    select * from public.materiality_survey_counter_rows(p_round_id, v_round.questionnaire_version)
  ),
  qmeta as (
    select q.id as question_id, q.subtopic_code, q.short_name, q.question_framing,
           q.status, q.exclusion_reason, q.sort_order, q.shared_with_subtopic_code,
           s.topic_code, tl.label as topic_label
      from public.materiality_survey_questions q
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code and s.standard_version = q.standard_version
      left join public.mr_esrs_topic_labels tl
        on tl.topic_code = s.topic_code and tl.standard_version = s.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = v_round.questionnaire_version
  ),
  ov as (
    select c.question_id, c.n_asked, c.n_not_asked, c.n_answered, c.n_abstained, c.n_skipped,
           c.d1, c.d2, c.d3, c.n_answered_off_route,
           (c.d1 + c.d2 + c.d3) as n_scored
      from cells c
     where c.dimension = 'overall'
  ),
  ov_stat as (
    select o.*,
           case when o.n_scored > 0 then round(o.d3::numeric / o.n_scored, 4) end as top_box,
           case when o.n_scored > 0
                then round(greatest(o.d1, o.d2, o.d3)::numeric / o.n_scored, 4) end as modal_share,
           (o.n_scored > 0
            and o.d1 >= v_round.polarised_extreme_min_n
            and o.d3 >= v_round.polarised_extreme_min_n
            and (o.d2::numeric / o.n_scored) < v_round.polarised_middle_max_share) as polarised,
           m.o_low  as median_low,
           m.o_high as median_high
      from ov o
      cross join lateral public.materiality_survey_median_bounds(o.d1, o.d2, o.d3) m
  ),
  bd as (
    select c.question_id, c.dimension, c.dimension_value,
           c.n_asked, c.n_not_asked, c.n_answered, c.n_abstained, c.n_skipped,
           c.d1, c.d2, c.d3, (c.d1 + c.d2 + c.d3) as n_scored
      from cells c
     where c.dimension <> 'overall'
       and c.dimension_value is not null
  ),
  bd_live as (select * from bd where n_asked > 0),
  dim_stats as (
    select question_id, dimension,
           count(*)::int as cells_in_dim,
           count(*) filter (where n_scored < v_floor)::int as k0
      from bd_live
     group by question_id, dimension
  ),
  ranked as (
    select b.question_id, b.dimension, b.dimension_value,
           row_number() over w as rn,
           sum(b.n_scored) over w as cum_scored
      from bd_live b
    window w as (partition by b.question_id, b.dimension
                 order by b.n_scored, b.dimension_value
                 rows between unbounded preceding and current row)
  ),
  sup_len as (
    select d.question_id, d.dimension, d.cells_in_dim,
           case when d.k0 = 0 then 0
                else coalesce(
                       (select min(r.rn) from ranked r
                         where r.question_id = d.question_id
                           and r.dimension   = d.dimension
                           and r.rn >= d.k0
                           and r.rn >= 2
                           and r.cum_scored >= v_floor),
                       d.cells_in_dim)
           end as l
      from dim_stats d
  ),
  bd_flagged as (
    select b.*, (r.rn <= s.l) as suppressed, s.cells_in_dim
      from bd_live b
      join ranked  r on r.question_id = b.question_id
                    and r.dimension   = b.dimension
                    and r.dimension_value = b.dimension_value
      join sup_len s on s.question_id = b.question_id
                    and s.dimension   = b.dimension
  ),
  bd_shown as (
    select f.*,
           case when f.n_scored > 0 then round(f.d3::numeric / f.n_scored, 4) end as top_box
      from bd_flagged f
     where not f.suppressed
  ),
  gaps as (
    select a.question_id, a.dimension,
           a.dimension_value as a_value, a.top_box as a_top_box, a.n_scored as a_n,
           b.dimension_value as b_value, b.top_box as b_top_box, b.n_scored as b_n,
           abs(a.top_box - b.top_box) as gap
      from bd_shown a
      join bd_shown b
        on b.question_id = a.question_id
       and b.dimension   = a.dimension
       and b.dimension_value > a.dimension_value
     where a.dimension in ('track', 'labour_group')
       and a.top_box is not null
       and b.top_box is not null
       and abs(a.top_box - b.top_box) > v_round.top_box_gap_margin
  ),
  pairs as (
    select a.subtopic_code as s1_code, b.subtopic_code as s2_code,
           a.short_name, a.question_id as s1_qid, b.question_id as s2_qid,
           (a.status = 'included' and b.status = 'included') as both_included
      from qmeta a
      join qmeta b on b.subtopic_code = a.shared_with_subtopic_code
     where a.shared_with_subtopic_code is not null
       and a.subtopic_code < a.shared_with_subtopic_code
  ),
  participation as (
    select count(*)::int as invited,
           count(*) filter (where status in ('in_progress', 'completed'))::int as reached,
           count(*) filter (where status = 'completed')::int as completed,
           count(*) filter (where status = 'invited')::int as never_opened,
           count(*) filter (where status = 'revoked')::int as revoked,
           count(*) filter (where status = 'expired')::int as expired
      from public.materiality_survey_respondents
     where round_id = p_round_id
  ),

  -- ── FREE TEXT (added 20260831). answers_as comes from mr_stakeholder_categories and decides
  -- whether the floor applies at all; see the header.
  cmt_closing as (
    select c.comment, c.track, c.stakeholder_category, sc.answers_as
      from public.materiality_survey_closing_comments c
      join public.mr_stakeholder_categories sc on sc.code = c.stakeholder_category
     where c.round_id = p_round_id
       and c.questionnaire_version = v_round.questionnaire_version
  ),
  cmt_question as (
    -- No score is selected beside the comment. See the header: the two together would be a
    -- per-respondent record.
    select rs.free_text as comment, rs.track, rs.stakeholder_category, sc.answers_as,
           q.subtopic_code, q.short_name, q.topic_label, q.sort_order
      from public.materiality_survey_responses rs
      join public.mr_stakeholder_categories sc on sc.code = rs.stakeholder_category
      join qmeta q on q.question_id = rs.question_id
     where rs.round_id = p_round_id
       and rs.questionnaire_version = v_round.questionnaire_version
       and rs.free_text is not null
  ),
  cmt_all as (
    select track, stakeholder_category, answers_as from cmt_closing
    union all
    select track, stakeholder_category, answers_as from cmt_question
  ),
  -- The total gate and the two label counts, all over INDIVIDUAL comments only.
  cmt_ind_total as (
    select count(*)::int as n from cmt_all where answers_as = 'individual'
  ),
  cmt_by_track as (
    select track, count(*)::int as n from cmt_all
     where answers_as = 'individual' group by track
  ),
  cmt_by_cat as (
    select stakeholder_category as cat, count(*)::int as n from cmt_all
     where answers_as = 'individual' group by stakeholder_category
  )

  select jsonb_build_object(

    'round', jsonb_build_object(
      'id',                    v_round.id,
      'name',                  v_round.name,
      'company_name',          v_round.company_name,
      'standard_version',      v_round.standard_version,
      'questionnaire_version', v_round.questionnaire_version,
      'status',                v_round.status,
      'deadline',              v_round.deadline,
      'frozen_at',             v_round.frozen_at),

    'method', jsonb_build_object(
      'statistic',        'distribution',
      'mean_computed',    false,
      'mean_note',        'No mean is computed, stored or returned anywhere. The screening scale is '
                       || 'ordinal and a mean assumes equal spacing between its points '
                       || '(spec v9 §6.2.5).',
      'median_convention','Both central order statistics, returned as median_low and median_high. '
                       || 'Never interpolated: the median of {1,3} is the interval [1,3], not 2.',
      'dispersion', jsonb_build_object(
        'method',       'modal_share_and_polarisation',
        'definition',   'Concentration is reported as modal_share, the share of scored answers in '
                     || 'the largest category. A split room is reported as the boolean `polarised`: '
                     || 'at least polarised_extreme_min_n answers at BOTH 1 and 3, and fewer than '
                     || 'polarised_middle_max_share of answers at 2.',
        'agreement_coefficient', null,
        'agreement_coefficient_note',
                        'NOT COMPUTED. Spec v9 §6.2.6 proposes van der Eijk''s coefficient of '
                     || 'agreement (A) and offers the raw split as an acceptable fallback. A is not '
                     || 'implemented here because it was not possible to implement it verifiably: a '
                     || 'coefficient printed in a compliance report under a named published method, '
                     || 'which no reader can recompute, is worse than a raw split that every reader '
                     || 'can. The §6.2.6 trigger "agreement falls below a disclosed threshold" is '
                     || 'therefore NOT active; the other two triggers are.'),
      'thresholds', jsonb_build_object(
        'anonymity_floor',            v_round.anonymity_floor,
        'polarised_extreme_min_n',    v_round.polarised_extreme_min_n,
        'polarised_middle_max_share', v_round.polarised_middle_max_share,
        'top_box_gap_margin',         v_round.top_box_gap_margin,
        'free_text_group_floor',      v_round.free_text_group_floor,
        'source', 'Snapshotted onto this round at creation from mr_survey_thresholds, which carries '
               || 'a printable definition and a stated source for each. Fixed from the first '
               || 'response, so a later change cannot restate this round''s registers.'),
      'suppression', jsonb_build_object(
        'rule', 'A breakdown cell is suppressed when fewer than anonymity_floor respondents scored '
             || 'it. Because cells sum to a published total, further cells are then suppressed — '
             || 'smallest first — until at least two are suppressed and their combined answers '
             || 'reach the floor; otherwise the whole dimension is suppressed.',
        'two_valued_note',
                'On a two-valued dimension (track), ANY suppression suppresses the whole dimension: '
             || 'one shown cell beside a published total publishes the other. This is the rule '
             || 'working, not a defect.',
        'overall_note', 'The overall figure for a sub-topic is never suppressed, at any n. '
             || 'Identification risk lies in the splits, not in the total.',
        'single_group_note',
                'A dimension with only one participating group is omitted with reason '
             || '"single_group": its one cell equals the overall, so it adds nothing, and '
             || 'suppressing it would imply a protection the published overall already defeats. A '
             || 'dimension with NO participating groups is omitted with reason "no_respondents" — a '
             || 'distinct fact, and a temporary one.'),
      'n_asked_basis',
              'Derived from the frozen question set and the stakeholder-category routing, over '
           || 'respondents who REACHED the form (status in_progress or completed). Never counted '
           || 'from response rows. This is a documented departure from spec v9 §3.0.1''s literal '
           || 'wording, which counts all invited: counting an unopened invitation as asked-and-'
           || 'skipped is a fact about email delivery reported as a finding about the company. The '
           || 'invitation funnel is reported separately under `participation`.',
      'not_produced',
              'No topic score, and no divergence register. The screening survey is the stakeholder '
           || 'dialogue layer and not the impact assessment (spec v9 §1.0); a single number per '
           || 'topic is the field most likely to be mistaken for a determination. The divergence '
           || 'register (§6.4) needs the preparer''s band, which lives in a jsonb blob owned by '
           || 'lib/materiality.ts; the round-to-assessment link now exists (20260827) but the '
           || 'comparison has no defensible home in SQL.'),

    'participation', (select jsonb_build_object(
        'invited',      p.invited,
        'reached',      p.reached,
        'completed',    p.completed,
        'never_opened', p.never_opened,
        'revoked',      p.revoked,
        'expired',      p.expired,
        'note', 'Counts of invitations, not of answers, and therefore not subject to the anonymity '
             || 'floor: the customer created this invite list and can already read it. `reached` is '
             || 'the denominator every counter in `subtopics` is built on.')
      from participation p),

    'integrity', jsonb_build_object(
      'responses_off_route',     (select coalesce(sum(o.n_answered_off_route), 0)::int from ov o),
      'responses_other_version', (select count(*)::int
                                    from public.materiality_survey_responses rs
                                   where rs.round_id = p_round_id
                                     and rs.questionnaire_version <> v_round.questionnaire_version),
      'note', 'Both should be zero. responses_off_route counts stored answers to questions the '
           || 'respondent was never routed to — refused by survey_save_response and by '
           || 'survey_submit, excluded from n_answered here rather than allowed to inflate it. '
           || 'responses_other_version counts answers against a superseded questionnaire version, '
           || 'which are outside this aggregation entirely and are never pooled with it (§3.3).'),

    'subtopics', coalesce((
      select jsonb_agg(jsonb_build_object(
               'subtopic_code',    q.subtopic_code,
               'topic_code',       q.topic_code,
               'topic_label',      q.topic_label,
               'short_name',       q.short_name,
               'question_framing', q.question_framing,
               'status',           q.status,
               'exclusion_reason', q.exclusion_reason,
               'overall', case when q.status <> 'included' then null else
                 (select jsonb_build_object(
                    'n_asked',      o.n_asked,
                    'n_answered',   o.n_answered,
                    'n_abstained',  o.n_abstained,
                    'n_skipped',    o.n_skipped,
                    'n_not_asked',  o.n_not_asked,
                    'distribution', jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                    'top_box',      jsonb_build_object(
                                      'share', o.top_box, 'numerator', o.d3,
                                      'denominator', o.n_scored),
                    'median_low',   o.median_low,
                    'median_high',  o.median_high,
                    'modal_share',  o.modal_share,
                    'polarised',    o.polarised)
                    from ov_stat o where o.question_id = q.question_id) end,
               'breakdowns', case when q.status <> 'included' then null else
                 (select coalesce(jsonb_object_agg(x.dimension, x.payload), '{}'::jsonb)
                    from (
                      select d.dimension,
                             -- ⚠️ THE SAME COLLAPSE, ONE LEVEL DOWN. `<= 1` mapped ZERO groups and
                             -- ONE group to the same reason, so on a round nobody has opened every
                             -- dimension claimed "only one participating group, so it adds nothing
                             -- beyond overall" — when there were none at all. Zero is a different
                             -- fact and it is temporary.
                             case when coalesce(s.cells_in_dim, 0) = 0
                                  then jsonb_build_object('omitted', true, 'reason', 'no_respondents')
                                  when s.cells_in_dim = 1
                                  then jsonb_build_object('omitted', true, 'reason', 'single_group')
                                  else jsonb_build_object('omitted', false, 'cells', coalesce((
                                    select jsonb_agg(jsonb_build_object(
                                             'value',       f.dimension_value,
                                             'suppressed',  f.suppressed,
                                             'n_asked',     case when f.suppressed then null else f.n_asked end,
                                             'n_answered',  case when f.suppressed then null else f.n_answered end,
                                             'n_abstained', case when f.suppressed then null else f.n_abstained end,
                                             'n_skipped',   case when f.suppressed then null else f.n_skipped end,
                                             'n_not_asked', case when f.suppressed then null else f.n_not_asked end,
                                             'distribution', case when f.suppressed then null else
                                               jsonb_build_object('1', f.d1, '2', f.d2, '3', f.d3) end,
                                             'top_box', case when f.suppressed or f.n_scored = 0 then null else
                                               round(f.d3::numeric / f.n_scored, 4) end)
                                             order by f.dimension_value)
                                      from bd_flagged f
                                     where f.question_id = q.question_id
                                       and f.dimension = d.dimension), '[]'::jsonb))
                             end as payload
                        from (values ('track'), ('labour_group'), ('category')) d(dimension)
                        left join sup_len s on s.question_id = q.question_id
                                           and s.dimension = d.dimension
                    ) x) end)
             order by q.sort_order)
        from qmeta q
       where q.subtopic_code is not null), '[]'::jsonb),

    'entity_specific', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id',  q.question_id,
               'short_name',   q.short_name,
               'status',       q.status,
               'exclusion_reason', q.exclusion_reason,
               'overall', case when q.status <> 'included' then null else
                 (select jsonb_build_object(
                    'n_asked', o.n_asked, 'n_answered', o.n_answered,
                    'n_abstained', o.n_abstained, 'n_skipped', o.n_skipped,
                    'distribution', jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                    'top_box', jsonb_build_object('share', o.top_box, 'numerator', o.d3,
                                                  'denominator', o.n_scored),
                    'median_low', o.median_low, 'median_high', o.median_high,
                    'modal_share', o.modal_share, 'polarised', o.polarised)
                    from ov_stat o where o.question_id = q.question_id) end)
             order by q.sort_order)
        from qmeta q
       where q.subtopic_code is null), '[]'::jsonb),

    'topics', coalesce((
      select jsonb_agg(t.payload order by t.topic_code)
        from (
          select q.topic_code,
                 jsonb_build_object(
                   'topic_code',  q.topic_code,
                   'topic_label', max(q.topic_label),
                   'subtopics_included', count(*) filter (where q.status = 'included')::int,
                   'subtopics_excluded', count(*) filter (where q.status = 'excluded')::int,
                   'subtopics_resolved', count(*) filter (
                       where q.status = 'included' and coalesce(o.n_answered, 0) > 0)::int,
                   'n_asked',     coalesce(sum(o.n_asked)     filter (where q.status = 'included'), 0)::int,
                   'n_answered',  coalesce(sum(o.n_answered)  filter (where q.status = 'included'), 0)::int,
                   'n_abstained', coalesce(sum(o.n_abstained) filter (where q.status = 'included'), 0)::int,
                   'n_skipped',   coalesce(sum(o.n_skipped)   filter (where q.status = 'included'), 0)::int,
                   'n_not_asked', coalesce(sum(o.n_not_asked) filter (where q.status = 'included'), 0)::int,
                   'unknown', (count(*) filter (
                       where q.status = 'included' and coalesce(o.n_answered, 0) > 0) = 0),
                   -- ⚠️ THREE REASONS, NOT TWO, AND THE FIRST TWO ARE ABOUT DIFFERENT THINGS.
                   -- 'awaiting_first_response' is TIMING: people were invited and none has opened
                   -- the survey yet, so every topic has n_asked = 0 for a reason that will stop
                   -- being true tomorrow. 'no_eligible_respondents' is ENGAGEMENT: respondents DID
                   -- reach the form and none of their categories routes to this topic — invariant 5,
                   -- the finding that a round of forty customers yields unknown S2. Collapsing the
                   -- first into the second told a customer their invite list was wrong when it was
                   -- merely early, which is this module's recurring error: an unopened invitation
                   -- reported as a finding about the company.
                   'unknown_reason', case
                     when count(*) filter (
                            where q.status = 'included' and coalesce(o.n_answered, 0) > 0) > 0
                       then null
                     when (select p.reached from participation p) = 0
                       then 'awaiting_first_response'
                     when coalesce(sum(o.n_asked) filter (where q.status = 'included'), 0) = 0
                       then 'no_eligible_respondents'
                     else 'no_answers' end,
                   'note', 'Counts only. No topic score is produced — the screening survey is not '
                        || 'the impact assessment (§1.0). subtopics_resolved against '
                        || 'subtopics_included is the coverage claim, and the two are never '
                        || 'collapsed into one percentage: that would merge "we asked and nobody '
                        || 'could say" with "we never asked".'
                 ) as payload
            from qmeta q
            left join ov o on o.question_id = q.question_id
           where q.topic_code is not null
           group by q.topic_code
        ) t), '[]'::jsonb),

    'disagreement_register', jsonb_build_object(
      'what_this_is', 'Sub-topics where the respondents disagree with EACH OTHER (§6.2.6). Separate '
                   || 'from the divergence register, which compares stakeholders with the '
                   || 'preparer''s determination and is not built. A sub-topic can appear on both.',
      'triggers_active', jsonb_build_array('polarised', 'between_group_top_box_gap'),
      'triggers_inactive', jsonb_build_array('agreement_below_threshold'),
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'subtopic_code', q.subtopic_code,
                 'short_name',    q.short_name,
                 'topic_label',   q.topic_label,
                 'n_answered',    o.n_answered,
                 'distribution',  jsonb_build_object('1', o.d1, '2', o.d2, '3', o.d3),
                 'top_box',       o.top_box,
                 'triggers', (case when o.polarised then jsonb_build_array('polarised')
                                   else '[]'::jsonb end)
                          || (case when exists (select 1 from gaps g where g.question_id = q.question_id)
                                   then jsonb_build_array('between_group_top_box_gap')
                                   else '[]'::jsonb end),
                 'between_group', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'dimension', g.dimension,
                            'a', jsonb_build_object('group', g.a_value, 'top_box', g.a_top_box,
                                                    'n_answered', g.a_n),
                            'b', jsonb_build_object('group', g.b_value, 'top_box', g.b_top_box,
                                                    'n_answered', g.b_n),
                            'gap', g.gap)
                          order by g.dimension, g.a_value, g.b_value)
                     from gaps g where g.question_id = q.question_id), '[]'::jsonb))
               order by q.sort_order)
          from qmeta q
          join ov_stat o on o.question_id = q.question_id
         where q.status = 'included'
           and q.subtopic_code is not null
           and o.n_scored >= v_floor
           and (o.polarised or exists (select 1 from gaps g where g.question_id = q.question_id))
        ), '[]'::jsonb)),

    's1_s2_contrast', jsonb_build_object(
      'what_this_is', 'The paired labour sub-topics: what your own workforce says about their '
                   || 'workplace, beside what value-chain workers say about theirs. This is the '
                   || 'sharpest output the S1/S2 routing produces.',
      'what_this_is_not',
                      'NOT disagreement, and never to be merged into the disagreement register. '
                   || 'S1.x and S2.x are different questions put to different populations about '
                   || 'different workplaces, so a difference between them is not respondents '
                   || 'disagreeing — it is two populations reporting different conditions, which is '
                   || 'a finding about the company.',
      'entries', coalesce((
        select jsonb_agg(jsonb_build_object(
                 's1_subtopic_code', p.s1_code,
                 's2_subtopic_code', p.s2_code,
                 'short_name',       p.short_name,
                 's1', jsonb_build_object('n_answered', o1.n_scored, 'top_box', o1.top_box,
                                          'distribution', case when o1.question_id is null then null
                                            else jsonb_build_object('1', o1.d1, '2', o1.d2,
                                                                    '3', o1.d3) end),
                 's2', jsonb_build_object('n_answered', o2.n_scored, 'top_box', o2.top_box,
                                          'distribution', case when o2.question_id is null then null
                                            else jsonb_build_object('1', o2.d1, '2', o2.d2,
                                                                    '3', o2.d3) end),
                 'comparable', (p.both_included
                                and coalesce(o1.n_scored, 0) >= v_floor
                                and coalesce(o2.n_scored, 0) >= v_floor),
                 'not_comparable_reason', case
                   when not p.both_included then 'one or both sub-topics were deselected for this '
                                              || 'round, so there is no pair to draw'
                   when coalesce(o1.n_scored, 0) >= v_floor
                    and coalesce(o2.n_scored, 0) >= v_floor then null
                   when coalesce(o1.n_scored, 0) = 0 and coalesce(o2.n_scored, 0) = 0
                     then 'neither side was answered'
                   when coalesce(o2.n_scored, 0) = 0
                     then 'no value-chain respondent answered this sub-topic'
                   when coalesce(o1.n_scored, 0) = 0
                     then 'no own-workforce respondent answered this sub-topic'
                   else 'one or both sides are below the anonymity floor' end,
                 'gap', case when p.both_included
                              and coalesce(o1.n_scored, 0) >= v_floor
                              and coalesce(o2.n_scored, 0) >= v_floor
                             then abs(o1.top_box - o2.top_box) end,
                 'flagged', (p.both_included
                             and coalesce(o1.n_scored, 0) >= v_floor
                             and coalesce(o2.n_scored, 0) >= v_floor
                             and abs(o1.top_box - o2.top_box) > v_round.top_box_gap_margin))
               order by p.s1_code)
          from pairs p
          left join ov_stat o1 on o1.question_id = p.s1_qid
          left join ov_stat o2 on o2.question_id = p.s2_qid
        ), '[]'::jsonb)),

    -- ── FREE TEXT (added 20260831) ──────────────────────────────────────────────
    'free_text', jsonb_build_object(
      'method', jsonb_build_object(
        'verbatim', 'Comments are returned exactly as written. They are NEVER suppressed by the '
                 || 'anonymity floor — the floor withholds a group LABEL, not the text. Suppressing '
                 || 'a closing comment would defeat the only emerging-topic mechanism the module '
                 || 'has: survey scope is fixed at round creation, so that question is the only '
                 || 'route by which an out-of-scope matter reaches the preparer (ESRS 2 IRO-1).',
        'label_rule',
                    'A comment from a respondent who answers AS AN INDIVIDUAL carries its '
                 || 'stakeholder category only if at least free_text_group_floor individual '
                 || 'comments in this round share that category, and its track only if that many '
                 || 'share the track. Below the floor it carries respondent_type alone. A comment '
                 || 'from a respondent who answers FOR AN ORGANISATION always carries both labels: '
                 || 'the customer invited that organisation by name and holds the invite list, so '
                 || 'withholding the label conceals nothing and destroys the only thing that makes '
                 || 'the comment actionable.',
        'total_gate',
                    'No individual comments are returned at all until the round holds '
                 || 'free_text_group_floor of them. ⚠️ This blunts but does not close the attack '
                 || 'where the aggregate is polled as responses arrive and a newly-appearing '
                 || 'comment is attributed to whoever just completed. Once the floor is cleared, '
                 || 'the next comment to appear is still correlatable with the next completion.',
        'what_no_floor_can_do',
                    '⚠️ A comment naming a site, a manager or a role identifies its author whatever '
                 || 'the counts are. No aggregation rule prevents that. The control is telling the '
                 || 'respondent before they type, which the survey page does beside every box.',
        'omitted',  'function_department is never carried on a comment — it is free-form and the '
                 || 'most identifying non-name field in the schema. No score is returned beside a '
                 || 'question comment: the two together would be a per-respondent record.',
        'residual', 'respondent_type is on every comment, so an unlabelled comment is known to come '
                 || 'from one of the six individual categories. That narrowing is disclosed rather '
                 || 'than concealed: omitting the type would leave the pattern of labelled and '
                 || 'unlabelled comments carrying the same information silently.'),

      'individual_comments_withheld', (select c.n < v_ft_floor from cmt_ind_total c),
      'individual_comment_count',     (select c.n from cmt_ind_total c),

      'closing_comments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'respondent_type', c.answers_as,
                 'track', case when c.answers_as = 'organisation' then c.track
                               when coalesce((select t.n from cmt_by_track t
                                               where t.track = c.track), 0) >= v_ft_floor
                                 then c.track end,
                 'stakeholder_category', case when c.answers_as = 'organisation'
                                                then c.stakeholder_category
                               when coalesce((select k.n from cmt_by_cat k
                                               where k.cat = c.stakeholder_category), 0) >= v_ft_floor
                                 then c.stakeholder_category end,
                 'comment', c.comment)
               order by c.answers_as, c.comment)
          from cmt_closing c
         where c.answers_as = 'organisation'
            or (select t.n from cmt_ind_total t) >= v_ft_floor), '[]'::jsonb),

      'question_comments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'subtopic_code',   c.subtopic_code,
                 'short_name',      c.short_name,
                 'topic_label',     c.topic_label,
                 'respondent_type', c.answers_as,
                 'track', case when c.answers_as = 'organisation' then c.track
                               when coalesce((select t.n from cmt_by_track t
                                               where t.track = c.track), 0) >= v_ft_floor
                                 then c.track end,
                 'stakeholder_category', case when c.answers_as = 'organisation'
                                                then c.stakeholder_category
                               when coalesce((select k.n from cmt_by_cat k
                                               where k.cat = c.stakeholder_category), 0) >= v_ft_floor
                                 then c.stakeholder_category end,
                 'comment', c.comment)
               order by c.sort_order, c.answers_as, c.comment)
          from cmt_question c
         where c.answers_as = 'organisation'
            or (select t.n from cmt_ind_total t) >= v_ft_floor), '[]'::jsonb))
  )
  into v;

  if v is null then
    raise exception 'Aggregation produced no document for round %.', p_round_id;
  end if;

  return v;
end $$;

comment on function public.survey_aggregate(uuid) is
  'The stakeholder screening aggregation for one round, owner-scoped. THE ONLY PATH from a customer to materiality_survey_responses and materiality_survey_closing_comments — neither grants anon or authenticated anything and neither has a policy for either, so this function''s column scope and its suppression ARE the anonymity guarantee. Per sub-topic: the distribution at 1/2/3, top_box, median as an interval, modal_share, `polarised`, and the five counters of spec v9 §3.0.1, plus breakdowns by track, labour_group and stakeholder category under the round''s anonymity floor with complementary suppression. NO MEAN anywhere (§6.2.5). Returns verbatim free text under a SEPARATE, HIGHER floor: comments are never suppressed, but an individual''s group label is withheld below free_text_group_floor, while an organisational respondent''s label always shows because the customer invited them by name. Produces the disagreement register and the S1/S2 contrast, which are different things and never merged; does NOT produce a topic score or the divergence register.';

commit;
