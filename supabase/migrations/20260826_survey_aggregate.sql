-- 20260826_survey_aggregate.sql
--
-- SURVEY AGGREGATION — FILE 2 of 2. RUN 20260825_survey_thresholds.sql FIRST; this reads the
-- snapshot columns it adds, and survey_aggregate raises without them.
--
--   materiality_survey_median_bounds()   the ordinal median, as an interval, never interpolated
--   materiality_survey_counter_rows()    THE derivation. Every counter in the payload comes from here
--   survey_aggregate(p_round_id uuid)    the public RPC, owner-scoped, jsonb
--
-- Design authority: docs/materiality-questionnaire-spec-v9.md — §3.0.1 (the five counters), §6.1
-- (abstention), §6.2.5 (the statistic is the distribution), §6.2.6 (disagreement), §6.3 (roll-up),
-- §6.4 (divergence — NOT built, see below), §7 (the report).
--
-- ⚠️ THIS IS THE FUNCTION 20260819 WAS WRITTEN IN ANTICIPATION OF. That file gave
-- materiality_survey_responses no grant to anon or authenticated and no RLS policy for either, and
-- said why: "the customer reaches responses only through the aggregation RPC, which will apply the
-- round's anonymity_floor." This is that RPC. It is the ONLY path from a customer to their response
-- rows, which makes its column scope and its suppression the whole of the anonymity guarantee.
--
-- It returns no respondent id, no response id, no invite_email, no invite_name, no free_text and no
-- individual answer — only counts, and only counts that survive the floor. Adding any per-respondent
-- field here would defeat a guarantee three other files were built to support.
--
--
-- =====================================================================
-- ⚠️ NO MEAN. NOT ANYWHERE, NOT "FOR THE CHART".
-- =====================================================================
-- §6.2.5: the screening scale is ORDINAL. 1, 2 and 3 are ordered, but the distance between
-- "sufficient with continuous improvement" and "improvements would strengthen" is not demonstrably
-- the distance between that and "needs significant strategic focus". A mean assumes equal spacing
-- and that assumption is unjustified here.
--
-- The practical form of the rule: a mean present in the payload WILL be used, and the first place it
-- is used will be the place that needed a defensible number. So there is no avg() in this file, no
-- sum-divided-by-n, and no interpolated median — see the median helper's own header for why that
-- last one is the same defect wearing a different hat.
--
-- Verify step 9 greps pg_proc for `avg(` across the survey functions and expects zero. Run it after
-- any change here; it is cheaper than reading the file again.
--
--
-- =====================================================================
-- ⚠️ DEPARTURE FROM §3.0.1's LITERAL WORDING — n_asked COUNTS RESPONDENTS WHO REACHED THE FORM
-- =====================================================================
-- Recorded here so the spec and the code do not silently disagree. Lisa is amending the spec.
--
-- §3.0.1 derives n_asked from two inputs it calls immutable: the frozen question set, and the
-- category routing. 20260819's own verify sketch implements that as a cross join over ALL respondent
-- rows in the round. This function does not. It counts only respondents whose status is
-- 'in_progress' or 'completed' — those who actually opened the survey.
--
-- WHY: a respondent at status 'invited' has never called survey_get, so nothing was ever shown to
-- them. Counting them as asked puts every unopened invitation into n_skipped, and n_skipped is
-- supposed to mean "saw this and did not engage with it". Forty invitations and twelve openings
-- would then show enormous skip rates on all 31 sub-topics — a statement about email deliverability,
-- presented as a finding about the company, and erring in the direction that makes them look worse.
-- That is the same class of error as counting a not-asked respondent as an abstention, which §3.0.1
-- exists to prevent, arriving through the denominator instead of the numerator.
--
-- THE COST, STATED: respondent status is mutable, where the spec's two inputs are not. It only
-- ratchets forward (invited -> in_progress -> completed) and 20260821 locks the last transition, so
-- a historical figure can only ever grow as latecomers open the link — it cannot be edited
-- downward. That is a weaker guarantee than the spec's and it is the price of the correction.
--
-- WHAT IS NOT LOST: the invitation funnel is reported separately, in `participation`, which is what
-- ESRS 2 SBM-2 wants anyway — number invited, number responded, response rate. Nothing is hidden;
-- the two facts are simply not added together.
--
--
-- =====================================================================
-- ⚠️ THE SUPPRESSION RULE, AND THE TWO-VALUED COROLLARY THAT WILL LOOK LIKE A BUG
-- =====================================================================
-- §6.1/§7 and invariant 4: the anonymity floor applies to BREAKDOWNS ONLY. The overall figure for a
-- sub-topic is shown at any n — identification risk is in the splits, not in the total.
--
-- PRIMARY SUPPRESSION. A breakdown cell is suppressed when its n_answered is below the round's
-- anonymity_floor. Suppressed means the whole cell: counters and distribution alike, because the
-- counters are what let you difference.
--
-- ⚠️ COMPLEMENTARY SUPPRESSION, AND IT IS NOT OPTIONAL. Cells in a dimension sum to the overall, and
-- the overall is published at any n. So a SINGLE suppressed cell is recoverable by subtracting the
-- shown cells from the published total — the floor would hold in appearance and not in fact. After
-- primary suppression, this function keeps suppressing the smallest remaining cells until at least
-- TWO cells are suppressed AND their combined n_answered is itself at least the floor. If that
-- cannot be reached, the whole dimension is suppressed.
--
-- ⚠️ THE COROLLARY, WHICH SOMEONE WILL LATER READ AS A BUG AND "FIX":
--
--        ON A TWO-VALUED DIMENSION, ANY SUPPRESSION SUPPRESSES THE WHOLE DIMENSION.
--
-- `track` has exactly two values, internal and external. If the internal cell falls below the floor
-- it is suppressed — and the external cell is then the published total minus a suppressed cell,
-- which is to say it is not suppressed at all. So both go. This is not over-caution and it is not a
-- rounding error: showing one of two cells alongside their total publishes both. It falls straight
-- out of the rule above (one suppressed cell cannot satisfy "at least two"), and it is written here
-- because a payload showing an empty `track` breakdown while `category` still has entries looks
-- exactly like a defect.
--
-- A DIMENSION WITH ONLY ONE PARTICIPATING GROUP IS OMITTED ENTIRELY, with reason 'single_group'. Its
-- one cell would equal the overall exactly, so it carries no information the overall does not — and
-- suppressing it would imply a protection that the published overall already defeats. Omitting it
-- says what is true; suppressing it would say something false about what is being protected.
--
-- Cells with n_asked = 0 — a group the routing never asked — are shown and never suppressed. They
-- disclose no answer, and the fact itself is already public in mr_stakeholder_categories.
--
--
-- =====================================================================
-- ⚠️ TWO REGISTERS AND A CONTRAST — THREE OUTPUTS, NEVER MERGED
-- =====================================================================
-- DISAGREEMENT (§6.2.6) — stakeholders versus EACH OTHER. Built here. Triggers: a polarised
--   distribution, or a top-box gap between groups answering the same sub-topic.
--
-- DIVERGENCE (§6.4) — stakeholders versus THE PREPARER. NOT built, and not for want of effort:
--   there is no link from materiality_survey_rounds to materiality_assessments, and the preparer's
--   band lives inside materiality_assessments.results, a jsonb blob whose shape is owned by
--   runAssessment() in lib/materiality.ts. Reading that shape in SQL would create a second
--   definition of it, in a language with no type checking against the first, drifting silently the
--   next time the engine changes. §6.4 also leaves the granularity unresolved — the survey side is
--   per sub-topic, topicBand() is per topic over a 0-10 score.
--   ⚠️ THE MISSING ROUND -> ASSESSMENT LINK NOW BLOCKS TWO FEATURES: this register and survey_reopen
--   (20260821). That probably makes it the next thing worth building.
--
-- S1/S2 CONTRAST — and it is NOT disagreement, which is why it is its own output rather than a third
--   trigger on the register. §6.2.6 describes "own workforce and value-chain workers answering the
--   same sub-topic differently", but for the six labour sub-topics they do not answer the same row:
--   S1.3 and S2.3 are separate questions put to separate populations about separate workplaces. A
--   difference between them is not a disagreement — nobody disagrees. It is two populations
--   reporting different realities, which is a finding ABOUT THE COMPANY and is the sharpest thing
--   the S1/S2 routing produces. Filing it under a register titled "respondents disagree with each
--   other" would misdescribe the most valuable line this module has. The payload says so in words,
--   in `s1_s2_contrast.what_this_is`, because a consumer will otherwise merge them.
--
-- All three respect the floor: a register may not name a cell it cannot show.
--
--
-- =====================================================================
-- ⚠️ WHAT THE ROLL-UP DOES NOT PRODUCE: A TOPIC SCORE
-- =====================================================================
-- §6.3 requires unknown to propagate upward and the resolved-count to travel with the figures. It
-- does NOT ask for a topic score, and this function does not compute one — §1.0 is explicit that the
-- screening survey is the stakeholder dialogue layer and NOT the impact assessment, and that no
-- output of it may be presented as an impact determination. A single number per topic is the field
-- most likely to be mistaken for one, so the roll-up returns counts and nothing that looks like a
-- score.
--
-- Unknown carries a REASON, because "unknown" alone repeats the defect it is guarding against:
--   'no_eligible_respondents'  no respondent who reached the form was routed to any of its
--                              sub-topics. This is invariant 5 for S2 — a round with forty customers
--                              and no value-chain workers yields unknown S2, and it is NEVER
--                              inherited from S1. Nothing in this function copies a figure between
--                              topics.
--   'no_answers'               respondents were asked and none produced a value.
-- The two mean opposite things about the company and are never collapsed.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260825. Re-runnable (CREATE OR
-- REPLACE). Nothing in app/ or lib/ calls survey_aggregate yet, so it can be applied to live
-- independently of any deploy.

begin;

-- =====================================================================
-- The ordinal median, as an interval
-- =====================================================================
-- ⚠️ NEVER INTERPOLATED. The median of {1, 3} is not 2 — nobody chose 2, and averaging the two
-- central order statistics is the interval assumption §6.2.5 just banned, returning through a side
-- door and looking like arithmetic rather than like a claim about the scale.
--
-- So both central order statistics are returned. They are equal when n is odd and when the two
-- middle observations fall in the same category; they differ otherwise, and the difference IS the
-- finding — a low of 1 and a high of 3 says the middle of this distribution is not a place anybody
-- actually is.
create or replace function public.materiality_survey_median_bounds(
  p_d1 int, p_d2 int, p_d3 int,
  out o_low  smallint,
  out o_high smallint)
returns record
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n  int := coalesce(p_d1, 0) + coalesce(p_d2, 0) + coalesce(p_d3, 0);
  v_k1 int;
  v_k2 int;
begin
  if v_n = 0 then
    -- No scored answers. NULL, not 2, and not 0 — an absence, never a measured middle.
    o_low := null; o_high := null; return;
  end if;

  v_k1 := (v_n + 1) / 2;   -- integer division; odd n gives the single centre, even n the lower
  v_k2 := v_n / 2 + 1;     -- the upper centre; equals v_k1 when n is odd

  o_low  := case when v_k1 <= coalesce(p_d1, 0)                        then 1
                 when v_k1 <= coalesce(p_d1, 0) + coalesce(p_d2, 0)    then 2
                 else 3 end;
  o_high := case when v_k2 <= coalesce(p_d1, 0)                        then 1
                 when v_k2 <= coalesce(p_d1, 0) + coalesce(p_d2, 0)    then 2
                 else 3 end;
end $$;

comment on function public.materiality_survey_median_bounds(int, int, int) is
  'The two central order statistics of an ordinal distribution over categories 1, 2, 3 — returned as an interval and NEVER averaged. On an even n the median of {1,3} is the interval [1,3]; interpolating it to 2 would assert a category nobody chose and would smuggle back the equal-spacing assumption spec v9 §6.2.5 rejects. NULL when nothing was scored: an absence, never a measured middle.';

-- =====================================================================
-- THE derivation. Every counter in the payload comes from this one function.
-- =====================================================================
-- ⚠️ ONE DERIVATION, FOUR DIMENSIONS, AND THAT IS THE POINT. n_asked is DERIVED from the frozen
-- question set and the category routing (§3.0.1) and never counted from response rows — a missing
-- row cannot distinguish "never shown" from "shown and skipped", and partial submission is permitted
-- so both occur. Deriving it twice would be the failure that rule exists to prevent, so the overall
-- figures, the three breakdowns and the topic roll-up all read THESE rows. The dimension is a cross
-- join, not four copied blocks: the counter expressions below appear exactly once.
create or replace function public.materiality_survey_counter_rows(
  p_round_id uuid,
  p_version  int)
returns table (
  question_id          uuid,
  dimension            text,
  dimension_value      text,
  n_asked              int,
  n_not_asked          int,
  n_answered           int,
  n_abstained          int,
  n_skipped            int,
  d1                   int,
  d2                   int,
  d3                   int,
  n_answered_off_route int
)
language sql
stable
set search_path = public
as $$
  with respondents as (
    -- ⚠️ REACHED THE FORM, not merely invited. See the migration header for the departure from
    -- §3.0.1's literal wording and why counting unopened invitations as "asked" is a statement about
    -- email deliverability dressed as a finding about the company.
    select r.id, r.track, r.stakeholder_category, c.labour_routing
      from public.materiality_survey_respondents r
      join public.mr_stakeholder_categories c on c.code = r.stakeholder_category
     where r.round_id = p_round_id
       and r.status in ('in_progress', 'completed')
  ),
  questions as (
    select q.id, q.shared_with_subtopic_code, s.topic_code
      from public.materiality_survey_questions q
      -- LEFT: an entity-specific matter has no sub-topic and therefore no topic. It is asked of
      -- everyone (shared_with_subtopic_code is null), and an inner join would drop it from every
      -- counter with no error.
      left join public.mr_esrs_subtopics s
        on s.code = q.subtopic_code
       and s.standard_version = q.standard_version
     where q.round_id = p_round_id
       and q.questionnaire_version = p_version
       -- An excluded question was never put to anyone; it appears in the payload as considered and
       -- excluded (§3.2) and carries no counters.
       and q.status = 'included'
  ),
  universe as (
    select q.id as question_id,
           r.id as respondent_id,
           d.dimension,
           case d.dimension
             when 'overall'      then 'all'
             when 'track'        then r.track
             when 'labour_group' then r.labour_routing
             when 'category'     then r.stakeholder_category
           end as dimension_value,
           -- The SAME predicate the read path and the write path use. Two copies of the routing rule
           -- would let the aggregation count a question the respondent was never shown.
           public.materiality_survey_routes_to(
             q.shared_with_subtopic_code, q.topic_code, r.labour_routing) as is_routed
      from questions q
      cross join respondents r
      cross join (values ('overall'), ('track'), ('labour_group'), ('category')) d(dimension)
  ),
  joined as (
    select u.*, rs.value, rs.abstained
      from universe u
      left join public.materiality_survey_responses rs
        on rs.respondent_id = u.respondent_id
       and rs.question_id   = u.question_id
  )
  select
    j.question_id,
    j.dimension,
    j.dimension_value,
    count(*) filter (where j.is_routed)::int,
    count(*) filter (where not j.is_routed)::int,
    count(*) filter (where j.is_routed and j.value is not null)::int,
    count(*) filter (where j.is_routed and j.abstained)::int,
    -- §3.0.1: n_skipped is the arithmetic remainder, and naming it is the point. "I saw this and
    -- didn't engage" is a different finding from "I saw this and cannot say"; folding the two
    -- together corrupts the abstention finding in the same direction as counting not-asked would.
    (count(*) filter (where j.is_routed)
     - count(*) filter (where j.is_routed and j.value is not null)
     - count(*) filter (where j.is_routed and j.abstained))::int,
    count(*) filter (where j.is_routed and j.value = 1)::int,
    count(*) filter (where j.is_routed and j.value = 2)::int,
    count(*) filter (where j.is_routed and j.value = 3)::int,
    -- INTEGRITY, not a counter. A stored answer to a question the respondent was never routed to is
    -- refused by survey_save_response and by survey_submit, so this should always be zero. It is
    -- excluded from n_answered rather than allowed to inflate it, and surfaced separately so a
    -- non-zero value reads as the defect it would be. Meaningful only on the 'overall' dimension —
    -- it is counted once per dimension, so summing across dimensions quadruples it.
    count(*) filter (where not j.is_routed and (j.value is not null or j.abstained))::int
  from joined j
  group by j.question_id, j.dimension, j.dimension_value
$$;

comment on function public.materiality_survey_counter_rows(uuid, int) is
  'THE counter derivation for one survey round, one row per (question, dimension, dimension_value) over dimensions overall / track / labour_group / category. n_asked is DERIVED from the frozen question set and the category routing (spec v9 §3.0.1) and never counted from response rows. Counts respondents who REACHED the form (status in_progress or completed), not all invited — a documented departure from §3.0.1''s literal wording; see the header of 20260826_survey_aggregate.sql. Internal: revoked from PUBLIC and called only from inside survey_aggregate, because it returns unsuppressed cells.';

-- =====================================================================
-- survey_aggregate
-- =====================================================================
create or replace function public.survey_aggregate(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round record;
  v_floor int;
  v jsonb;
begin
  -- Owner-scoped. One message for "no such round" and "not yours", so a round id cannot be probed.
  select r.id, r.name, r.company_name, r.standard_version, r.questionnaire_version,
         r.anonymity_floor, r.polarised_extreme_min_n, r.polarised_middle_max_share,
         r.top_box_gap_margin, r.deadline, r.frozen_at, r.status
    into v_round
    from public.materiality_survey_rounds r
   where r.id = p_round_id
     and r.user_id = auth.uid();

  if not found then
    raise exception 'survey round not found' using errcode = 'no_data_found';
  end if;

  v_floor := v_round.anonymity_floor;

  with
  -- ── ONE call to the derivation. MATERIALIZED so the overall figures, the three breakdowns, the
  -- roll-up and both registers are provably the same numbers rather than four re-derivations.
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
  -- ── Overall. NEVER suppressed, at any n: identification risk is in the splits, not the total.
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
           -- §6.2.6's first bullet, as arithmetic rather than as a coefficient: both extremes
           -- occupied at or above the disclosed minimum, and a hollow middle.
           (o.n_scored > 0
            and o.d1 >= v_round.polarised_extreme_min_n
            and o.d3 >= v_round.polarised_extreme_min_n
            and (o.d2::numeric / o.n_scored) < v_round.polarised_middle_max_share) as polarised,
           m.o_low  as median_low,
           m.o_high as median_high
      from ov o
      cross join lateral public.materiality_survey_median_bounds(o.d1, o.d2, o.d3) m
  ),
  -- ── Breakdown cells, before suppression. Cells with n_asked = 0 are set aside: they disclose no
  -- answer, are already public in mr_stakeholder_categories, and would otherwise sort to the front
  -- of the suppression ordering and absorb it.
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
  -- ── COMPLEMENTARY SUPPRESSION. Primary-suppressed cells are exactly the smallest ones (their
  -- n_scored is below the floor and every other cell's is at or above it), so an ascending ordering
  -- puts them first and the suppression set is always a prefix. L is the shortest prefix that both
  -- covers the primary set and satisfies "at least two cells, and at least `floor` answers between
  -- them". Where no such prefix exists the dimension goes entirely.
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
  -- ── The between-group comparison. Track and labour_group only: `category` has eleven values, so
  -- its pairs are mostly suppressed and the survivors would be dominated by whichever two categories
  -- happened to clear the floor. The category breakdown is still returned; it just does not trigger
  -- the register.
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
  -- ── The S1/S2 pairs. `subtopic_code < shared_with_subtopic_code` is a DEDUP over a symmetric
  -- relation, nothing more — the pairing is data (20260818) and this picks one row of each pair to
  -- emit. It is not a routing decision and it does not read the code for meaning.
  pairs as (
    select a.subtopic_code as s1_code, b.subtopic_code as s2_code,
           a.short_name, a.question_id as s1_qid, b.question_id as s2_qid,
           -- Deselected pairs are KEPT and reported as not comparable, not filtered out. A pair that
           -- silently disappears is indistinguishable from a pair nobody thought to draw, which is
           -- the same failure §3.2 forbids one level down for a deselected sub-topic.
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

    -- ⚠️ THE PAYLOAD STATES ITS OWN BASIS. §10 and §6.2.6: the constants are disclosed, and a report
    -- generated from this document must be able to print the assumptions register without a second
    -- lookup and without trusting that mr_survey_thresholds has not moved since.
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
             || 'suppressing it would imply a protection the published overall already defeats.'),
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
           || 'register (§6.4) needs a link from this round to a materiality assessment, which does '
           || 'not exist.'),

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

    -- ── Per sub-topic. Included and excluded alike: §3.2 and ESRS 2 IRO-1 require a deselected
    -- topic to appear as considered and excluded, because absence is indistinguishable from never
    -- considered.
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
                             -- coalesce, because sup_len has NO row for a dimension with no
                             -- participating group at all. `null <= 1` is null, which would fall
                             -- through to the else arm and emit `omitted: false, cells: []` — an
                             -- empty breakdown presented as a computed one.
                             case when coalesce(s.cells_in_dim, 0) <= 1
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

    -- ── Entity-specific matters. Their own array, NEVER in the topic roll-up: §3.2 places them
    -- outside Appendix A's list and outside the matrix.
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

    -- ── The roll-up. Counts, never a score. Unknown propagates upward WITH ITS REASON.
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
                   'unknown_reason', case
                     when count(*) filter (
                            where q.status = 'included' and coalesce(o.n_answered, 0) > 0) > 0
                       then null
                     when coalesce(sum(o.n_asked) filter (where q.status = 'included'), 0) = 0
                       -- ⚠️ INVARIANT 5. No respondent who reached the form was routed to any
                       -- sub-topic of this topic. For S2 that is the "forty customers and no
                       -- value-chain workers" case, and it is NEVER filled from S1: nothing in this
                       -- function copies a figure between topics.
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

    -- ── DISAGREEMENT: stakeholders versus each other.
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
           -- A register may not name a cell it cannot show. The overall must itself clear the floor
           -- before a sub-topic is named at all.
           and o.n_scored >= v_floor
           and (o.polarised or exists (select 1 from gaps g where g.question_id = q.question_id))
        ), '[]'::jsonb)),

    -- ── S1/S2 CONTRAST: not disagreement, and the payload says so.
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
        ), '[]'::jsonb))
  )
  into v;

  if v is null then
    -- Unreachable: the round was found above. Kept because returning NULL would reach the client as
    -- a successful empty aggregate, which is an absence rendered as a result.
    raise exception 'Aggregation produced no document for round %.', p_round_id;
  end if;

  return v;
end $$;

comment on function public.survey_aggregate(uuid) is
  'The stakeholder screening aggregation for one round, owner-scoped. THE ONLY PATH from a customer to materiality_survey_responses — that table grants anon and authenticated nothing and has no policy for either (20260819), so this function''s column scope and its suppression ARE the anonymity guarantee. Returns no respondent id, no individual answer and no free text. Per sub-topic: the distribution at 1/2/3, top_box, median as an interval, modal_share, `polarised`, and the five counters of spec v9 §3.0.1, plus breakdowns by track, labour_group and stakeholder category under the round''s anonymity floor with complementary suppression. NO MEAN is computed anywhere (§6.2.5). Produces the disagreement register (§6.2.6) and the S1/S2 contrast, which are different things and are never merged; does NOT produce a topic score (§1.0) or the divergence register (§6.4, blocked on a round-to-assessment link that does not exist).';

-- =====================================================================
-- Grants
-- =====================================================================
-- authenticated only. NOT anon: this is the customer's view of their own round, and the respondent
-- path (survey_get / survey_save_response / survey_submit) neither needs nor may have it.
revoke all on function public.survey_aggregate(uuid) from public;
grant execute on function public.survey_aggregate(uuid) to authenticated;

-- ⚠️ THE HELPERS ARE REVOKED AND GRANTED TO NOBODY. materiality_survey_counter_rows returns
-- UNSUPPRESSED cells — every breakdown down to a single respondent, with no floor applied. Granting
-- it to authenticated would hand the customer exactly what survey_aggregate exists to withhold, and
-- it would do so without touching a table grant or an RLS policy, so nothing else in the schema
-- would go red. Neither helper needs a grant: a nested function inside a SECURITY DEFINER body runs
-- as the definer's owner.
revoke all on function public.materiality_survey_counter_rows(uuid, int) from public;
revoke all on function public.materiality_survey_median_bounds(int, int, int) from public;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- Savepoints around anything expecting an ERROR; user_id supplied explicitly because auth.uid() is
-- NULL in the SQL editor. ⚠️ survey_aggregate reads auth.uid(), so calling it AS postgres returns no
-- round — test it from the app, or temporarily set request.jwt.claims. The structural checks below
-- that do not call the RPC work anywhere.
--
-- 1) ⚠️ NO MEAN — the standing check. Run after ANY change to this file:
--    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname in ('survey_aggregate', 'materiality_survey_counter_rows',
--                         'materiality_survey_median_bounds')
--       and (p.prosrc ilike '%avg(%' or p.prosrc ilike '%::numeric / 2%');
--    -- expect ZERO rows. A hit means a mean has appeared, and the first place it gets used will be
--    -- the place that needed a defensible number (§6.2.5).
--
-- 2) The median is an interval and is never interpolated. {1,3} is the case that matters:
--    select * from public.materiality_survey_median_bounds(1, 0, 1);   -- expect 1 | 3, NOT 2 | 2
--    select * from public.materiality_survey_median_bounds(0, 0, 5);   -- expect 3 | 3
--    select * from public.materiality_survey_median_bounds(2, 1, 0);   -- expect 1 | 1
--    select * from public.materiality_survey_median_bounds(1, 1, 0);   -- expect 1 | 2
--    select * from public.materiality_survey_median_bounds(0, 0, 0);   -- expect null | null
--    -- ⚠️ never 0, and never a fractional value. Both would be claims the scale cannot support.
--
-- 3) The counters reconcile. n_skipped is the remainder and must never be negative — a negative one
--    means a response exists for a question the respondent was not routed to:
--    select count(*) from public.materiality_survey_counter_rows(:'round_id', 1)
--     where n_skipped < 0;                                            -- expect 0
--    select count(*) from public.materiality_survey_counter_rows(:'round_id', 1)
--     where n_asked <> n_answered + n_abstained + n_skipped;          -- expect 0
--    select count(*) from public.materiality_survey_counter_rows(:'round_id', 1)
--     where n_answered <> d1 + d2 + d3;                               -- expect 0
--    select coalesce(sum(n_answered_off_route), 0)
--      from public.materiality_survey_counter_rows(:'round_id', 1)
--     where dimension = 'overall';                                    -- expect 0
--
-- 4) ⚠️ n_asked IS DERIVED, NOT COUNTED — prove it moves with the ROUTING and not with the answers.
--    For a round with 2 internal, 3 supplier and 1 customer respondent, all reached:
--    select dimension_value, n_asked, n_not_asked
--      from public.materiality_survey_counter_rows(:'round_id', 1) c
--      join public.materiality_survey_questions q on q.id = c.question_id
--     where c.dimension = 'labour_group' and q.subtopic_code = 'S2.3';
--    -- expect s2 | 3 | 0   and   s1 | 0 | 2   and   not_asked | 0 | 1
--    -- The S1 respondents and the customer are NOT_ASKED S2.3, not skipped. Delete every response
--    -- row in the round and re-run: n_asked must be IDENTICAL, n_answered zero.
--
-- 5) ⚠️ INVARIANT 5 — S2 UNKNOWN, AND NOT INHERITED. Take a round with own-workforce and customer
--    respondents but NO s2-eligible ones (no supplier, no value_chain_worker, no
--    workers_rep_value_chain), with S1 well answered:
--    -- in the payload: topics -> the S2 entry
--    --   expect unknown = true, unknown_reason = 'no_eligible_respondents',
--    --          subtopics_resolved = 0, n_asked = 0, n_not_asked > 0
--    --   and S1's figures must NOT appear anywhere under S2. Compare the two objects directly:
--    --   they must differ in every counter.
--    -- Then add ONE supplier who abstains on all six S2 sub-topics and re-run:
--    --   expect unknown = true but unknown_reason = 'no_answers' — a different finding, and the
--    --   distinction is the whole of §3.0.1.
--
-- 6) ⚠️ THE FLOOR, AND THE TWO-VALUED COROLLARY. With anonymity_floor = 3, a round whose internal
--    track has 2 respondents and external has 6:
--    -- in the payload for any sub-topic both tracks answered:
--    --   breakdowns.track.cells: BOTH cells suppressed = true, all counters null.
--    --   ⚠️ Not just the internal one. If external shows, subtract it from overall and the
--    --   suppressed cell is published. This is the rule working.
--    --   breakdowns.labour_group may still show, if three or more of its groups clear the floor.
--    --   overall: shown in full, at any n. Confirm n_answered there is unchanged by suppression.
--    -- And a round where every respondent is internal:
--    --   breakdowns.track: { omitted: true, reason: 'single_group' } — NOT a suppressed cell.
--
-- 7) The complementary rule actually fires. Three categories with n_answered 1, 4, 4 and floor 3:
--    -- expect the 1-cell suppressed (primary) AND one 4-cell suppressed (complementary), because
--    -- one suppressed cell alone is recoverable. Two suppressed, combined n = 5 >= 3. The third
--    -- shows. Check: sum of shown cells < overall n_answered, by more than the floor.
--
-- 8) Excluded and entity-specific questions:
--    -- Deselect one sub-topic with a reason, then re-run. In the payload:
--    --   subtopics still contains it, with status 'excluded', its exclusion_reason, overall null.
--    --   ⚠️ It must NOT vanish: absence is indistinguishable from never considered (§3.2, IRO-1).
--    --   topics: its topic's subtopics_excluded goes to 1 and subtopics_included drops by 1.
--    -- Insert an entity-specific question (subtopic_code null) and re-run:
--    --   it appears in `entity_specific`, NOT in `subtopics`, and changes NO topic's counters.
--
-- 9) Both registers, and that they are not the same list:
--    -- Craft one sub-topic answered 3,0,3 (polarised) and another where internal top_box = 1.0 and
--    -- external top_box = 0.0 with both cells above the floor (between-group gap).
--    --   expect the first in disagreement_register with triggers ['polarised'],
--    --          the second with ['between_group_top_box_gap'], and a third answered 0,5,0 in
--    --          NEITHER.
--    -- s1_s2_contrast is a separate key with its own entries and its own `what_this_is_not`.
--    --   ⚠️ A labour sub-topic must never appear as a between-group gap on the SAME row: S1.3 and
--    --   S2.3 are different questions. Confirm no disagreement entry names a subtopic_code
--    --   starting S1 or S2 with a between_group entry on dimension 'labour_group' — those groups
--    --   were never both asked it.
--    -- And the floor binds the registers: drop a round below the floor and confirm neither names it.
--
-- 10) Ownership and grants:
--    select has_function_privilege('anon', 'public.survey_aggregate(uuid)', 'execute');          -- f
--    select has_function_privilege('authenticated', 'public.survey_aggregate(uuid)', 'execute'); -- t
--    select has_function_privilege('anon',
--             'public.materiality_survey_counter_rows(uuid, int)', 'execute');                   -- f
--    select has_function_privilege('authenticated',
--             'public.materiality_survey_counter_rows(uuid, int)', 'execute');                   -- f
--    -- ⚠️ if the counter helper is executable by authenticated, the floor can be bypassed entirely
--    -- without touching a table grant or an RLS policy. That is the check to re-run after any
--    -- permissions work.
--    -- Another user's round is refused with the same message as a missing one:
--    --   select public.survey_aggregate('<someone else''s round id>');
--    --   -- ERROR: survey round not found
--
-- 11) The response table is still unreachable directly — this file must not have widened anything:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'materiality_survey_responses'
--     group by grantee order by grantee;
--    -- expect service_role ONLY
