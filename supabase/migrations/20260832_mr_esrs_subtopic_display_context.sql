-- 20260832_mr_esrs_subtopic_display_context.sql
--
-- Adds mr_esrs_subtopic_display.context and seeds all 37 strings, and re-emits survey_get to JOIN
-- it live. Copy of record: docs/survey-question-context.md.
--
-- ⚠️ RUN AFTER 20260830. It re-emits survey_get whole and therefore CONTAINS 20260822's
-- topic_label, 20260823's intro_variant and 20260830's closing_comment. Running any of those after
-- this one silently reverts this change. Verify step 1 checks all four at once.
--
-- ⚠️ ONE STRING IS NOT FROM THE DOC — S2.6. See the seed. Read that note before running.
--
--
-- =====================================================================
-- WHAT THIS FILLS, AND WHY IT WAS THE BIGGEST GAP
-- =====================================================================
-- materiality_survey_questions.context has existed since 20260819 and has been NULL on every row
-- ever created. The respondent page has rendered it conditionally since it was written, so it has
-- been rendering nothing. §5.1 specifies a context block of 2-4 sentences per topic — what the topic
-- is, why it matters to this company — and calls it the thing that makes broad distribution
-- possible. The Bay State survey ran 26 questions each carrying a paragraph and 26 people finished
-- it; this module has been shipping 37 bare labels.
--
--
-- =====================================================================
-- ⚠️ THESE ARE THEMISIQ PROSE. THEY ARE NOT TRANSCRIBED LAW.
-- =====================================================================
-- They sit in mr_esrs_subtopic_display, beside short_name and question_framing, and they carry the
-- identical warning: NOTHING IN THIS TABLE MAY EVER BE CITED AS THE INSTRUMENT'S WORDING. The
-- verbatim Appendix A label lives one table over in mr_esrs_subtopics.label, which is the
-- transcription of record and is never corrected in place, and it is the label that travels to the
-- report. This column is the translation, written here, for a respondent who has never read ESRS.
--
-- The risk is proximity: a reader who finds a well-written sentence about biodiversity in a table
-- full of ESRS codes may reasonably take it for the standard's own gloss. It is not. Same
-- separation, same reason, as the one that keeps `desc` out of mr_esrs_topic_labels.
--
--
-- =====================================================================
-- ⚠️ THEY DESCRIBE STATE, NOT MANAGEMENT PRACTICE — AND THAT IS A MEASUREMENT DECISION
-- =====================================================================
-- Every string points at what the company DOES TO the world: "Whether the company's operations
-- release substances into the air that affect health locally". None asks whether a policy exists,
-- whether controls are monitored, whether targets are set or whether an owner has been assigned.
--
-- THE REASON IS THE ABSTENTION COUNTER, AND IT IS NOT A STYLE PREFERENCE.
-- The screening survey asks a warehouse manager what strategic priority a topic deserves. Ask them
-- whether air-quality controls are monitored against a target and they will honestly answer "not
-- enough visibility to assess" — because they genuinely cannot see the management system, even
-- though they can see the dust.
--
-- §6.1 makes n_abstained a FINDING ABOUT THE COMPANY: a sub-topic most respondents abstained on
-- usually means the company has no visibility of its own impact, which is material information. A
-- context line pitched at management practice manufactures abstentions on topics the respondent
-- could have answered, and those abstentions are indistinguishable in the aggregate from real ones.
-- THE INSTRUMENT WOULD BE MEASURING ITS OWN WORDING and reporting the result as a fact about the
-- undertaking.
--
-- ⚠️ So a future editor "improving" a string toward management language — "whether the company has
-- a policy on...", "whether performance is tracked against..." — is not making it more rigorous.
-- They are moving a counter that §6.1 reads as evidence. If management maturity is wanted, it
-- belongs in the deep-dive (§5.2) or the preparer worksheet, asked of people who can see it.
--
--
-- =====================================================================
-- ⚠️ THE S1/S2 PAIR RULE — FIVE MATCH EXACTLY, ONE DIFFERS, AND THE PROBE REFUSES OTHERWISE
-- =====================================================================
-- S1.1-S1.5 carry context IDENTICAL to S2.1-S2.5, byte for byte. That is deliberate and it is
-- load-bearing:
--
--     A WORDING DIFFERENCE BETWEEN THE PAIR SHOWS UP IN THE AGGREGATE AS A DIFFERENCE IN ANSWERS.
--
-- 20260826's s1_s2_contrast compares what the own workforce says about their workplace against what
-- value-chain respondents say about theirs. It is only a contrast between two POPULATIONS if both
-- were asked the same question. Reword one side "for consistency" and the gap it measures becomes
-- partly a gap between two prompts, with nothing in the payload able to tell the two apart — the
-- module's sharpest output, quietly measuring its own copy.
--
-- question_framing is what tells the respondent whose workforce is meant ("in your own workforce" /
-- "in your organisation's workforce", 20260828). The context does not need to and must not.
--
-- ⚠️ S1.6 AND S2.6 DIFFER, AND ONLY THEY. The adopted annex confines "water and sanitation" to S2 —
-- mr_esrs_subtopics.label already reflects it, S1.6 ending "privacy and adequate housing)" and S2.6
-- ending "privacy and adequate housing, water and sanitation)". The context mirrors that difference
-- and nothing else.
--
-- The DO block after the seed asserts all of this and RAISES. It does not return rows to eyeball,
-- because the failure it guards against is somebody tidying the pair into agreement and the tidy
-- looking correct.
--
--
-- =====================================================================
-- ⚠️ LIVE JOIN, NOT A SNAPSHOT — A DELIBERATE DEPARTURE, AND ITS COST
-- =====================================================================
-- Every other display field is SNAPSHOTTED into materiality_survey_questions at generation.
-- 20260819 is explicit about why: "The question a respondent saw must not change because
-- mr_esrs_subtopic_display was later re-seeded... A re-seed changes future rounds; it must not
-- restate a past one."
--
-- CONTEXT IS DIFFERENT, BY DECISION TAKEN 17 AUGUST 2026. It is not copied at generation — the
-- question generator is deliberately NOT changed by this file, and its INSERT still omits the column
-- — and survey_get joins mr_esrs_subtopic_display live. So all 37 strings light up at once, on
-- every round including existing and frozen ones, with no backfill and no divergence between rounds
-- created before and after today.
--
-- THE COST, STATED PLAINLY BECAUSE IT IS THE SNAPSHOT RULE BEING SET ASIDE: a later edit to a
-- context string retroactively changes what a frozen round APPEARS to have shown. Someone who
-- answered under one explanation, and a reader opening that round afterwards, will not see the same
-- page.
--
-- Today that cost is exactly zero, which is precisely why now is the moment it is free: every
-- existing round shows no context at all, so there is no past wording to restate. It stops being
-- free the first time one of these strings is edited.
--
-- ⚠️ AND THE OVERRIDE IS WHAT KEEPS IT BOUNDED. survey_get returns
-- coalesce(q.context, display.context): materiality_survey_questions.context — the column that
-- already exists and has never been written — becomes the PER-ROUND OVERRIDE rather than a
-- snapshot. A round that has never been customised tracks the default and lights up today; a round
-- whose customer has written their own context is frozen against any later re-seed, automatically,
-- from the moment they touch it. That is the snapshot discipline reintroduced exactly where it
-- matters and nowhere it costs.
--
--
-- =====================================================================
-- ⚠️ THEY ARE CUSTOMER-EDITABLE DEFAULTS — AND THE PER-ROUND SLOTS ALREADY EXIST
-- =====================================================================
-- "Energy" means different things at a bakery and a data centre, so the question editor will let a
-- customer rewrite any of these. Shipping a default means the editor starts from something rather
-- than a blank box.
--
-- ⚠️ CORRECTION TO A PLANNING ASSUMPTION, BECAUSE IT CHANGES WHAT NEEDS BUILDING.
-- The concern that these live on a SHARED reference table, so that a bakery editing "energy" edits
-- it for every customer, does not hold — for any of the four fields:
--
--   short_name        already per-round on materiality_survey_questions, snapshotted at generation
--   question_framing  already per-round, snapshotted at generation
--   wording           already per-round, snapshotted at generation
--   context           per-round via the coalesce above; the column exists and is unwritten
--
-- materiality_survey_questions grants authenticated SELECT, INSERT and UPDATE under an owner RLS
-- policy (20260819), so a customer can already edit their own round's copies today. There is no
-- shared-table write path and no schema change needed for per-round customisation. The question
-- editor is a UI task.
--
-- ⚠️ WHAT IS ACTUALLY MISSING IS DIFFERENT, AND IT IS A REAL GAP. §3.3 says the question set freezes
-- on first response and that an edit after that is a copy-on-write bump to questionnaire_version
-- N+1 — and NOTHING ENFORCES IT. materiality_survey_questions has NO TRIGGER OF ANY KIND. A customer
-- with the owner policy can UPDATE the wording of a question that forty people have already
-- answered, in place, and every one of those responses will then point at wording nobody answered.
-- That is the Bay State defect, available today, with no guard.
--
-- The editor therefore needs a BEFORE UPDATE guard on materiality_survey_questions refusing edits to
-- wording, short_name, question_framing and context once the round's frozen_at is set — the same
-- shape as materiality_survey_round_guard, and the same shape as the respondent lock in 20260821.
-- It is NOT built here: this file seeds copy, and adding an enforcement trigger to a table under a
-- copy migration is how a guard gets applied without anyone reviewing it as a guard.
--
--
-- =====================================================================
-- REPLAY SAFETY, AND WHY 20260818 IS NOT EDITED
-- =====================================================================
-- 20260818's seed lists its columns explicitly in both the INSERT and the ON CONFLICT DO UPDATE
-- (short_name, question_framing, shared_with_subtopic_code), and context is in neither. So replaying
-- it after this file PRESERVES these strings and gives a newly-seeded row a NULL context. The two
-- files do not fight, and unlike the S2 framing fix (20260828) no edit to 20260818 is required.
--
-- The corollary is the usual one: a row hand-edited in the SQL editor is silently reverted by the
-- next run of THIS file. Change copy by editing docs/survey-question-context.md and this seed, never
-- by editing the row.
--
-- DEPLOY: Lisa hand-runs this, after 20260830. Re-runnable — ADD COLUMN IF NOT EXISTS, a reconciling
-- UPDATE, CREATE OR REPLACE. Ships with the scope line on app/survey/[token]/page.tsx.

begin;

alter table public.mr_esrs_subtopic_display
  add column if not exists context text
    check (context is null or length(btrim(context)) between 1 and 600);

comment on column public.mr_esrs_subtopic_display.context is
  'ThemisIQ house prose shown beneath the question — one or two sentences saying what the topic means IN TERMS OF THIS COMPANY''S EFFECT ON IT, for a respondent who has never read ESRS. ⚠️ NOT TRANSCRIBED LAW: the verbatim Appendix A label is mr_esrs_subtopics.label and is what travels to the report; nothing here may ever be cited as the instrument''s wording. ⚠️ DESCRIBES STATE, NEVER MANAGEMENT PRACTICE — a line asking whether controls are monitored produces an honest "not enough visibility" from a respondent who can see the dust but not the management system, which manufactures abstentions on a counter §6.1 reads as a finding about the company. ⚠️ S1.x and S2.x carry IDENTICAL context except S1.6/S2.6 (the annex confines water and sanitation to S2); a wording difference between a pair surfaces in the aggregate as a difference in ANSWERS and corrupts the S1/S2 contrast. A DEFAULT: survey_get returns coalesce(question.context, this), so a customer''s per-round edit overrides it and is thereafter frozen against a re-seed. Copy of record: docs/survey-question-context.md.';

-- =====================================================================
-- The 37 strings. Verbatim from docs/survey-question-context.md.
-- =====================================================================
-- ⚠️ 31 distinct strings across 37 rows: the six labour sub-topics are shared between S1 and S2, and
-- five of the six pairs are byte-identical here on purpose. Do not deduplicate the rows and do not
-- converge S1.6 with S2.6.
--
-- An UPDATE ... FROM (VALUES ...) rather than an upsert: every row already exists, and an INSERT
-- form could create a row with a fabricated short_name if a code were ever mistyped.
update public.mr_esrs_subtopic_display d
   set context = v.context
  from (values
    -- ✎ CORRECTED 18 AUGUST 2026 — "and how quickly" removed. The four-point priority scale cannot
    -- express a rate, so asking about one invites an abstention from a respondent who could have
    -- answered about state — and §6.1 reads that abstention as the company having no visibility of
    -- its own impact. Audit record, reasoning and the guarded UPDATE:
    -- 20260833_e1_1_context_drop_how_quickly.sql. Do not restore the phrase.
    ('E1.1', 'Whether the company is reducing the greenhouse gases its operations release. This covers energy use, transport, refrigerants and emissions from suppliers.'),
    ('E1.2', 'Whether the company is prepared for the physical effects of a changing climate — flooding, heat, drought, storms — at its sites and across the places it depends on.'),
    ('E1.3', 'How much energy the company uses, where it comes from, and whether it is shifting toward lower-carbon sources.'),

    ('E2.1', 'Whether the company''s operations release substances into the air that affect health or the environment locally — exhaust, dust, fumes, odour.'),
    ('E2.2', 'Whether the company''s discharges affect the quality of rivers, groundwater or the sea, including runoff and wastewater from its sites.'),
    ('E2.3', 'Whether the company''s activities contaminate land, through spills, leaks, waste handling or the substances it applies to the ground.'),
    ('E2.4', 'Whether the company uses or handles chemicals known to be harmful to people or the environment, and whether safer alternatives exist.'),
    ('E2.5', 'Whether the company''s products, packaging or processes release tiny plastic particles that end up in the environment.'),

    ('E3.1', 'How much water the company takes, uses and discharges, and whether that puts pressure on supplies in areas where water is already scarce.'),

    ('E4.1', 'Whether the company''s activities change habitats — clearing land, altering waterways, introducing species that do not belong there.'),
    ('E4.2', 'Whether the company''s operations affect populations of plants and animals nearby, including anything rare or protected.'),
    ('E4.3', 'Whether the natural areas around the company''s sites and supply chain are in better or worse condition because of what it does there.'),
    ('E4.4', 'Whether the company depends on things nature provides for free — pollination, clean water, stable soil, flood protection — and whether it is protecting or eroding them.'),

    ('E5.1', 'What materials the company brings in, whether they are recycled or renewable, and whether it uses more than it needs.'),
    ('E5.2', 'Whether products are made to last, to be repaired and to be recycled at the end of their life, rather than thrown away.'),
    ('E5.3', 'How much waste the company produces, what happens to it, and whether the amount is falling.'),

    -- ⚠️ S1.1-S1.5 and S2.1-S2.5 are BYTE-IDENTICAL. The probe below refuses any divergence.
    ('S1.1', 'Whether people are paid enough to live on, work reasonable hours, have secure contracts, and are covered if they fall ill or lose their job.'),
    ('S2.1', 'Whether people are paid enough to live on, work reasonable hours, have secure contracts, and are covered if they fall ill or lose their job.'),
    ('S1.2', 'Whether workers can organise, be represented, and have a real say in decisions that affect them.'),
    ('S2.2', 'Whether workers can organise, be represented, and have a real say in decisions that affect them.'),
    ('S1.3', 'Whether people are kept safe at work — injuries, near misses, exposure to harmful substances, and whether concerns get acted on.'),
    ('S2.3', 'Whether people are kept safe at work — injuries, near misses, exposure to harmful substances, and whether concerns get acted on.'),
    ('S1.4', 'Whether people get the training they need to do their jobs well and to progress.'),
    ('S2.4', 'Whether people get the training they need to do their jobs well and to progress.'),
    ('S1.5', 'Whether people are treated fairly regardless of who they are — in pay, promotion, hiring — and whether harassment and discrimination are dealt with.'),
    ('S2.5', 'Whether people are treated fairly regardless of who they are — in pay, promotion, hiring — and whether harassment and discrimination are dealt with.'),

    -- ⚠️ THE ONE PAIR THAT DIFFERS, per the adopted annex's footnote confining water and sanitation
    -- to S2 — which mr_esrs_subtopics.label already reflects.
    ('S1.6', 'Whether basic rights are respected across the workforce: no child or forced labour, privacy respected, and decent living conditions where the company provides them.'),
    -- ⚠️⚠️ THIS ONE STRING IS NOT FROM docs/survey-question-context.md. The doc specifies at line 148
    -- that S2.6 "should say so" about water and sanitation but does not give the text. It is the S1.6
    -- string with the annex's own addition appended, mirroring how the labels differ and nothing
    -- more. IT NEEDS LISA'S WORD BEFORE IT IS TREATED AS FINAL, and when she gives it, the doc and
    -- this line change together.
    ('S2.6', 'Whether basic rights are respected across the workforce: no child or forced labour, privacy respected, and decent living conditions where the company provides them, including access to water and sanitation.'),

    ('S3.1', 'Whether the company''s operations affect the people who live nearby — their land, their housing, their access to water, their way of life.'),
    ('S3.2', 'Whether people can speak up about the company''s activities without fear, including anyone campaigning against them.'),
    ('S3.3', 'Whether the company operates on or near indigenous lands, and whether those communities were properly consulted and consented.'),

    ('S4.1', 'Whether customers get honest, clear information about products, and whether their personal data is handled properly.'),
    ('S4.2', 'Whether products are safe to use, and whether particular care is taken where children or vulnerable people use them.'),
    ('S4.3', 'Whether products and services are accessible and affordable to the people who need them, and whether marketing is responsible.'),

    ('G1.1', 'Whether the company does business honestly — no bribery or corruption, people can raise concerns safely, and animals are treated properly where relevant.'),
    ('G1.2', 'Whether the company''s lobbying and political activity is transparent and proportionate.'),
    ('G1.3', 'Whether suppliers are treated fairly — paid on time, given reasonable terms, not squeezed in ways that push problems down the chain.')
  ) as v(code, context)
 where d.subtopic_code = v.code
   and d.standard_version = 'esrs_2026';

-- =====================================================================
-- ⚠️ THE PROBE. It RAISES; it does not return rows to read.
-- =====================================================================
-- The failure it exists to catch is a future editor harmonising S1.6 and S2.6 "for consistency", or
-- rewording one side of a matched pair. Both look like tidying and both silently corrupt the S1/S2
-- contrast, because a difference in prompt arrives in the aggregate as a difference in answers with
-- nothing able to tell them apart.
do $$
declare
  v_seeded    int;
  v_mismatch  text;
  v_pairs     int;
  v_differing text;
  v_s26       text;
begin
  -- 1. All 37 rows carry a string.
  select count(*) into v_seeded
    from public.mr_esrs_subtopic_display
   where standard_version = 'esrs_2026' and context is not null;

  if v_seeded <> 37 then
    raise exception
      'Seeded context on % of 37 esrs_2026 rows. A sub-topic code in this file does not match the '
      'seed in 20260818, so at least one question would render with no explanation while the others '
      'have one — which reads to a respondent as a broken page, not a missing default. Missing: %.',
      v_seeded,
      (select string_agg(subtopic_code, ', ' order by subtopic_code)
         from public.mr_esrs_subtopic_display
        where standard_version = 'esrs_2026' and context is null);
  end if;

  -- 2. FIVE PAIRS MATCH EXACTLY.
  select string_agg(a.subtopic_code || '/' || b.subtopic_code, ', ' order by a.subtopic_code)
    into v_mismatch
    from public.mr_esrs_subtopic_display a
    join public.mr_esrs_subtopic_display b
      on b.subtopic_code = a.shared_with_subtopic_code
     and b.standard_version = a.standard_version
   where a.standard_version = 'esrs_2026'
     and a.subtopic_code in ('S1.1', 'S1.2', 'S1.3', 'S1.4', 'S1.5')
     and a.context is distinct from b.context;

  if v_mismatch is not null then
    raise exception
      'S1/S2 context has diverged on: %. Those pairs MUST be byte-identical. 20260826''s '
      's1_s2_contrast compares two POPULATIONS answering the same question; a wording difference '
      'between the pair arrives in the aggregate as a difference in ANSWERS, and nothing in the '
      'payload can tell the two apart. If the wording needed improving, improve BOTH sides in the '
      'same statement. question_framing is what tells a respondent whose workforce is meant — the '
      'context must not.',
      v_mismatch;
  end if;

  -- 3. EXACTLY ONE PAIR DIFFERS, AND IT IS S1.6/S2.6.
  select count(*) / 2, string_agg(distinct a.subtopic_code, ', ' order by a.subtopic_code)
    into v_pairs, v_differing
    from public.mr_esrs_subtopic_display a
    join public.mr_esrs_subtopic_display b
      on b.subtopic_code = a.shared_with_subtopic_code
     and b.standard_version = a.standard_version
   where a.standard_version = 'esrs_2026'
     and a.context is distinct from b.context;

  if v_pairs <> 1 or v_differing is null or v_differing not like '%S1.6%' then
    raise exception
      '% labour pair(s) differ in context (%), expected exactly one: S1.6/S2.6. The annex confines '
      '"water and sanitation" to S2 and that is the ONLY sanctioned difference between a pair. Any '
      'other divergence is a defect, and S1.6/S2.6 being made IDENTICAL is also a defect — it drops '
      'a scope the standard puts on one side and not the other.',
      coalesce(v_pairs, 0), coalesce(v_differing, '(none)');
  end if;

  -- 4. And the difference is the sanctioned one, not some other edit.
  select context into v_s26
    from public.mr_esrs_subtopic_display
   where subtopic_code = 'S2.6' and standard_version = 'esrs_2026';

  if v_s26 !~* 'sanitation' then
    raise exception
      'S2.6 differs from S1.6 but does not mention sanitation. The only sanctioned reason for the '
      'pair to differ is the annex''s footnote confining water and sanitation to S2 (compare '
      'mr_esrs_subtopics.label, where S2.6 ends "...adequate housing, water and sanitation"). If the '
      'copy has been reworded so that reason no longer holds, the difference needs re-justifying '
      'here rather than surviving on inertia.';
  end if;

  raise notice 'Context seeded on 37 rows. Five labour pairs identical, S1.6/S2.6 differ as intended.';
end $$;

-- =====================================================================
-- survey_get — re-emitted whole, joining the context live
-- =====================================================================
-- Contains 20260822's topic_label, 20260823's intro_variant and 20260830's closing_comment. The only
-- change is the mr_esrs_subtopic_display join and coalesce(q.context, dsp.context).
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

  select jsonb_build_object(
           'intro_variant', public.materiality_survey_intro_variant(v_routing),
           'round', jsonb_build_object(
                      'name',         rd.name,
                      'company_name', rd.company_name,
                      'deadline',     rd.deadline),
           'respondent', jsonb_build_object(
                      'display_name', v_name),
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
                      -- ⚠️ THE PER-ROUND OVERRIDE FIRST, THE SHARED DEFAULT SECOND. q.context is
                      -- unwritten on every row today, so every round picks up the seeded string at
                      -- once — including rounds created before this migration. The moment a customer
                      -- writes their own, that round stops tracking the default and is thereafter
                      -- frozen against any re-seed. See the header for why context is the one
                      -- display field that is NOT snapshotted at generation, and what that costs.
                      'context',          coalesce(q.context, dsp.context),
                      'topic_label',      tl.label)
                    order by q.sort_order)
               from public.materiality_survey_questions q
               left join public.mr_esrs_subtopics s
                 on s.code = q.subtopic_code
                and s.standard_version = q.standard_version
               left join public.mr_esrs_topic_labels tl
                 on tl.topic_code = s.topic_code
                and tl.standard_version = s.standard_version
               -- LEFT, for the same reason as the other two: an entity-specific matter has no
               -- sub-topic and therefore no display row, and must still reach the respondent. Its
               -- context can only ever come from q.context, which is correct — nobody has authored
               -- a default for a matter that exists only in one customer's round.
               left join public.mr_esrs_subtopic_display dsp
                 on dsp.subtopic_code = q.subtopic_code
                and dsp.standard_version = q.standard_version
              where q.round_id = v_round_id
                and q.questionnaire_version = v_version
                and q.status = 'included'
                and public.materiality_survey_routes_to(
                      q.shared_with_subtopic_code, s.topic_code, v_routing)),
             '[]'::jsonb),
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
  'What a survey respondent needs to fill the form in, and nothing else. Explicit whitelists — no to_jsonb of any table; see 20260820 for every column withheld, 20260822 for topic_label (never topic_code), 20260823 for intro_variant, 20260830 for the free-text keys. context is returned as coalesce(question.context, mr_esrs_subtopic_display.context): the shared default is joined LIVE rather than snapshotted at generation, so all 37 strings reach every round at once including existing ones, and a customer''s per-round edit overrides and thereafter freezes it. Applies the §3.0.1 labour routing (31 questions for s1/s2, 25 for not_asked) and refuses rather than serving a short form. Flips invited -> in_progress on first touch.';

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor, or psql) ───────────────────
--
-- 1) ⚠️ RUN-ORDER CHECK — every survey_get addition present at once. If any is missing, an older
--    file was applied after this one:
--    select jsonb_object_keys(public.survey_get(:'s1_token'));
--    -- expect: intro_variant, round, respondent, closing_comment, questions, responses
--    select jsonb_object_keys(public.survey_get(:'s1_token') -> 'questions' -> 0);
--    -- expect: question_id, short_name, question_framing, wording, context, topic_label
--
-- 2) All 37 seeded, none blank, none over the bound:
--    select count(*) filter (where context is not null) as seeded,
--           count(*) filter (where context is null)     as missing,
--           max(length(context))                        as longest
--      from public.mr_esrs_subtopic_display where standard_version = 'esrs_2026';
--    -- expect 37 | 0 | <= 600
--
-- 3) ⚠️ THE PAIR RULE. The DO block above already raises, but this is the query to run by hand
--    whenever the copy is touched:
--    select a.subtopic_code, b.subtopic_code,
--           (a.context = b.context) as identical
--      from public.mr_esrs_subtopic_display a
--      join public.mr_esrs_subtopic_display b
--        on b.subtopic_code = a.shared_with_subtopic_code
--       and b.standard_version = a.standard_version
--     where a.standard_version = 'esrs_2026' and a.subtopic_code like 'S1.%'
--     order by a.subtopic_code;
--    -- expect S1.1-S1.5 identical = t, S1.6 identical = f, and NOTHING ELSE
--    select context from public.mr_esrs_subtopic_display
--     where subtopic_code = 'S2.6' and standard_version = 'esrs_2026';
--    -- expect the S1.6 text plus water and sanitation
--
-- 4) ⚠️ ALL 37 LIGHT UP AT ONCE, INCLUDING EXISTING ROUNDS — the point of the live join. Against a
--    round created BEFORE this migration:
--    select count(*) filter (where q ->> 'context' is not null)
--      from jsonb_array_elements(public.survey_get(:'old_round_token') -> 'questions') q;
--    -- expect the full question count (31 or 25), NOT zero. No backfill was run; if this is zero,
--    -- the coalesce or the join did not take.
--    -- and materiality_survey_questions.context is STILL null everywhere, which is correct:
--    select count(*) from public.materiality_survey_questions where context is not null;  -- expect 0
--
-- 5) The per-round override wins, and freezes that round against a re-seed:
--    begin;
--      update public.materiality_survey_questions
--         set context = 'Our own words about energy at a bakery.'
--       where round_id = :'round_id' and subtopic_code = 'E1.3';
--      select q ->> 'context' from jsonb_array_elements(
--               public.survey_get(:'s1_token') -> 'questions') q
--       where q ->> 'short_name' = 'Energy use and sourcing';
--      -- expect the customer's sentence, NOT the seeded default
--    rollback;
--
-- 6) An entity-specific matter has no display row and must still appear, with null context rather
--    than being dropped by the new join:
--    begin;
--      insert into public.materiality_survey_questions
--        (round_id, user_id, questionnaire_version, subtopic_code, standard_version,
--         status, short_name, wording, sort_order)
--      values (:'round_id', :'u_id', 1, null, 'esrs_2026', 'included',
--              'Grain supply chains', 'Grain supply chains', 99);
--      select count(*) from jsonb_array_elements(
--               public.survey_get(:'s1_token') -> 'questions') q
--       where q ->> 'short_name' = 'Grain supply chains';       -- expect 1, not 0
--    rollback;
--
-- 7) ⚠️ STATE, NOT MANAGEMENT PRACTICE — the standing check on the copy. Re-run after any edit:
--    select subtopic_code, context from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026'
--       and context ~* '(polic|monitor|target|governance|framework|KPI|assured)';
--    -- expect ZERO rows. A hit means a string has drifted toward asking about the management
--    -- system, which manufactures abstentions from respondents who can see the impact but not the
--    -- controls — and §6.1 reads those abstentions as a finding about the company.
--
-- 8) Nothing was cited as law. The verbatim labels are untouched and still live one table over:
--    select count(*) from public.mr_esrs_subtopic_display d
--      join public.mr_esrs_subtopics s
--        on s.code = d.subtopic_code and s.standard_version = d.standard_version
--     where d.context = s.label;        -- expect 0: house prose is never the annex text
--
-- 9) The page renders it. Open a real link: each question shows the short name, the framing badge on
--    the six labour rows, the wording, then the context paragraph, then the stem and four options.
--    ⚠️ And the scope line appears ONCE above the first topic group — not repeated per question, and
--    not contradicting the framing badge on the labour rows.
