-- 20260828_mr_esrs_subtopic_display_s2_framing_fix.sql
--
-- Corrects mr_esrs_subtopic_display.question_framing on S2.1 through S2.6. Six strings, one column
-- comment, and a guarded correction of any question set that has not yet frozen. Nothing else.
--
--   OLD   'for workers in your suppliers'' and value-chain operations'
--   NEW   'in your organisation''s workforce'
--
--   S1.1-S1.6 are UNCHANGED at 'in your own workforce'.
--
-- ⚠️ 20260818_mr_subtopic_display_and_stakeholder_categories.sql HAS BEEN EDITED TO MATCH, and its
-- header carries a ✎ CORRECTED note pointing here. That is required, not optional: 20260818's seed
-- uses ON CONFLICT DO UPDATE on question_framing, so a replay of it would SILENTLY REVERT this fix.
-- Its own header says so — "a row hand-edited in the SQL editor is silently reverted by the next
-- run" — and that applies to a migration's UPDATE just as much as to a hand edit.
--
-- This file therefore follows the 20260815/20260816 arrangement exactly: 20260818 is now correct on
-- its own, and running it first and this file afterwards leaves this file a passing no-op. This one
-- remains the audit record of the defect, which is why the reasoning below lives here and not there.
--
--
-- =====================================================================
-- ⚠️ RECORD 1 — WHY THE ORIGINAL WORDING WAS WRONG, AND WHAT IT WOULD HAVE CAUSED
-- =====================================================================
-- THE DECISION IT MISSED, taken 16 August 2026: supplier workers are NOT surveyed directly. S2
-- evidence comes from a NAMED REPRESENTATIVE OF A SUPPLIER ORGANISATION, answering institutionally
-- about their own workforce. That is what customers actually do, and it is legitimate — ESRS S2
-- requires disclosure of the engagement PROCESS, not that workers answer anything, and ESRS 1 ¶57
-- imposes no conduct requirements at all.
--
-- The old framing was written for a different respondent: a value-chain worker describing the
-- conditions they personally work in. For that reader it was merely odd.
--
-- ⚠️ READ BY A SUPPLIER'S COMPLIANCE MANAGER, IT POINTS ONE TIER FURTHER DOWN. "Health and safety
-- for workers in your suppliers' and value-chain operations", put to a supplier, asks about THEIR
-- suppliers. That is a different question about a different population, and they would have answered
-- it — correctly, in good faith, and about the wrong workforce.
--
-- WHAT THAT WOULD HAVE CAUSED, and the shape of it is why this is not a copy tweak:
--
--   * The answer lands in S2.x as though it described the supplier's own workforce. S2 is the
--     undertaking's value chain — its direct suppliers' workers. A tier-2 answer stored as a tier-1
--     one is a wrong figure with a correct-looking provenance chain: asked_subtopic_code,
--     resolved_subtopic_code and resolution_basis would all read exactly as they should.
--   * NO ERROR, NO FLAG. Nothing in the schema can detect it. The XOR holds, the routing holds, the
--     counters reconcile, n_answered is right. The only evidence would be the wording itself, which
--     is frozen into the question row and which nobody re-reads.
--   * It corrupts the S1/S2 contrast, which 20260826 calls the sharpest output the routing produces.
--     "Your own workforce says health and safety is fine; workers in your suppliers say it needs
--     significant focus" would in fact compare the undertaking's workforce against a population two
--     tiers away, and state a conclusion about tier 1.
--
-- It is the same class as the concierge silently returning nothing for three document types, and as
-- the unit switch relabelling 332 m3 as 332 Mcf: the action looks like it worked, the output looks
-- high-confidence, and the provenance actively supports the wrong reading.
--
--
-- =====================================================================
-- ⚠️ RECORD 2 — question_framing IS LOAD-BEARING IN THE AGGREGATE, NOT ONLY IN THE SURVEY
-- =====================================================================
-- THE TWO SIDES ARE DELIBERATELY WORDED DIFFERENTLY AND MUST STAY THAT WAY.
--
--     S1.1-S1.6   'in your own workforce'             — an employee IS their own workforce
--     S2.1-S2.6   'in your organisation''s workforce'  — a supplier contact ANSWERS FOR theirs
--
-- ⚠️ ANYONE "TIDYING" S2'S WORDING TO MATCH S1'S MAKES TWELVE ROWS INDISTINGUISHABLE TO THE
-- PREPARER. It will look like an obvious cleanup — two rows, same sub-topic, why two strings — and
-- it removes the only field a human can read that tells them apart. What is left after such a tidy:
--
--     short_name       IDENTICAL by design ('Health and safety' on both). 20260818 seeds the twelve
--                      labour rows with six short names on purpose; do not "fix" that either.
--     topic_label      IDENTICAL by design. mr_esrs_topic_labels gives S1 and S2 Appendix A's one
--                      merged title, 'Own Workforce and Workers in the Value Chain', and that
--                      identity is load-bearing: 20260822 sends this label to an unauthenticated
--                      respondent's browser PRECISELY BECAUSE it discloses nothing about which side
--                      of the routing they are on. It cannot be made to distinguish the pair without
--                      becoming the routing key in disguise.
--     question_framing the only HUMAN-READABLE field that differs.
--
-- ⚠️ PRECISION, BECAUSE THE STRONGER CLAIM IS FALSE AND SOMEONE WILL CHECK IT. subtopic_code and
-- topic_code DO reach survey_aggregate's payload (20260826 projects both on every sub-topic entry),
-- so a consumer can always disambiguate PROGRAMMATICALLY. It is survey_get — the RESPONDENT's
-- payload — that withholds subtopic_code, and it withholds it deliberately so a client cannot
-- re-implement the routing.
--
-- So the accurate statement of the risk is this: a preparer surface rendering short_name and
-- question_framing — the two fields written to be read by a human — would show six duplicated pairs
-- with no visible difference, and the difference would only be recoverable by reading a code. That is
-- exactly the shape of defect this module keeps writing headers about: the figure looks right, and
-- the thing that makes it wrong is one field away and invisible.
--
-- WHERE A HUMAN LABEL EXISTS IF A SURFACE WANTS ONE ANYWAY: mr_esrs_topics.label, seeded since
-- 27 May 2026 and distinct — S1 'Own workforce', S2 'Workers in the value chain'. Confirmed against
-- db/dumps/mr_reference_data_20260819.sql. survey_aggregate does NOT currently project it; adding it
-- would be belt and braces alongside the distinct framing, and it must be read from that table and
-- never mapped from topic_code in application code, which is the failure
-- lib/supply-chain/templates.ts paid for with 68 of 75 labels disagreeing across two copies.
--
-- ⚠️ AND THE CONTRAST'S SOUNDNESS NOW RESTS ON EQUIVALENCE, NOT ON IDENTITY. 20260826's
-- s1_s2_contrast compares two populations, which is only meaningful if both answered the same
-- question. With two wordings that is no longer true by inspection — it is true because the two
-- strings say the same thing to differently-situated readers: both name the workforce the respondent
-- belongs to or answers for, and the difference tracks the respondent's RELATIONSHIP to that
-- workforce (a member of it, versus a representative of it) rather than changing the subject.
-- That is a weaker guarantee than byte-identity and it is stated here for that reason. If one side is
-- ever reworded so the two are no longer substantively the same question, the contrast becomes a
-- comparison of answers to different prompts and must be withdrawn in the same pass.
--
--
-- =====================================================================
-- ⚠️ RECORD 3 — THIS IS NOT THE SUPPLIER PORTAL, AND THEY MUST NOT BE MERGED
-- =====================================================================
-- Both instruments send a tokenised link to a named contact at a supplier organisation. They share a
-- token pattern, a page shape, and an audience. Someone will eventually propose merging them.
--
--   app/supplier/[token]   THE SUPPLIER PORTAL. Asks the supplier for FACTS IT HOLDS — emissions
--                          figures, energy consumption, compliance attestations — which feed the
--                          Scope 3 Category 1 bridge and the spend-based gap-fill. The answers are
--                          data the buyer does not have and the supplier does. Questionnaire:
--                          lib/supply-chain/templates.ts. Responses: supplier_responses.
--
--   app/survey/[token]     THIS INSTRUMENT. Asks the supplier for A VIEW ON MATERIALITY — which
--                          topics they think should be prioritised, on a three-point ordinal scale
--                          with an abstention. The answers are an OPINION, and their value is as
--                          ESRS 2 SBM-2 stakeholder-engagement evidence. Responses:
--                          materiality_survey_responses, which no role but service_role can read.
--
-- A figure and a view are not the same kind of claim and cannot share a table, a scale or an
-- aggregation. The portal's answers are quantities that get added up; these are ordinal judgements
-- that must never be averaged (§6.2.5). Merging them would put a Scope 3 activity figure and a
-- priority rating in one response table with one nullable value column, and the first thing to break
-- would be the abstention invariant — "not enough visibility to assess" is meaningful here and
-- meaningless there. The overlap is the audience and the token. That is all it is.
--
--
-- =====================================================================
-- ⚠️ S2 RESPONDENTS ARE ORGANISATIONAL AND NAMED — THE ANONYMITY DESIGN DOES NOT DESCRIBE THEM
-- =====================================================================
-- An S1 respondent is a member of the undertaking's own workforce, answering personally, and the
-- whole anonymity apparatus exists for them: §4 keeps no name or email on the response record,
-- materiality_survey_responses has no grant to anon or authenticated, and survey_aggregate applies
-- the round's anonymity_floor to every breakdown. That is what makes an employee answer honestly
-- about their own employer.
--
-- AN S2 RESPONDENT IS A NAMED INDIVIDUAL SPEAKING FOR AN ORGANISATION. Their identity is the point:
-- the customer knows which supplier they invited, the answer's value depends on knowing which
-- supplier gave it, and the person discloses nothing about themselves. They are not anonymous by
-- nature and the design never made them so.
--
-- CONSEQUENCE, STATED SO IT IS NOT DISCOVERED: for an S2-heavy round the floor produces suppression
-- that costs information and protects nobody — one supplier per category means its breakdown cell is
-- suppressed without anyone being shielded. That is the floor working as specified, not a defect. A
-- future decision about a per-track floor, or about not applying one to organisational respondents,
-- is real and reasonable and is NOT taken here.
-- ⚠️ It must NOT be taken by loosening the floor generally: the same round can carry both tracks, and
-- the S1 respondents in it need it exactly as much as before.
--
-- ⚠️ AND IT REACHES THE INTRO COPY. docs/survey-intro-copy.md variant B tells the respondent "Your
-- answers go to {Company}, not to your employer" and "No individual answer is shown on its own".
-- Both were written for a worker. For a named representative who IS answering on the employer's
-- behalf, the first is odd and the second is close to untrue — with one supplier invited, the
-- customer knows exactly whose answers those are. The first paragraph and the practical tips are
-- corrected in this pass; that second paragraph is NOT, because it is a claim about who sees what
-- rather than a description of the instrument, and rewording it is a decision about what the product
-- promises. FLAGGED, NOT SILENTLY FIXED.
--
--
-- =====================================================================
-- ⚠️ KNOWN LIMITATION — value_chain_worker AND workers_rep_value_chain NOW RECEIVE WORDING WRITTEN
-- FOR AN ORGANISATION
-- =====================================================================
-- mr_stakeholder_categories keeps all three s2-routed categories, and typically_surveyed is unchanged
-- on all of them (20260824). That is deliberate: `value_chain_worker` and
-- `workers_rep_value_chain` are ESRS 1 AR 23 categories, a customer may legitimately reach
-- value-chain workers or their representatives directly, and removing the rows or the default would
-- prevent something the standard contemplates.
--
-- ⚠️ BUT THE S2 FRAMING NOW ASSUMES AN ORGANISATIONAL RESPONDENT. A value-chain worker routed to s2
-- reads "Health and safety in your organisation's workforce" — institutional wording put to an
-- individual describing their own conditions. They may reasonably read it as asking about the company
-- rather than about themselves, which is a milder version of the very defect this migration fixes,
-- pointing sideways instead of one tier down.
--
-- THIS IS A KNOWN LIMITATION AND NOT AN OVERSIGHT. Fixing it properly needs a third framing selected
-- by stakeholder CATEGORY rather than by sub-topic — which the display table cannot express, because
-- question_framing hangs off the sub-topic row and knows nothing about who is reading it. That is a
-- schema change (a per-category framing layer, or a framing chosen at generation from the respondent
-- mix) and a design decision, and it is not taken here.
--
-- Until it is: a customer surveying value-chain workers directly should be told the wording is
-- addressed to organisations, or the two worker categories should be left out of that round.
--
--
-- =====================================================================
-- ⚠️ EXISTING QUESTION SETS: WHAT IS CORRECTED, AND WHAT IS DELIBERATELY LEFT ALONE
-- =====================================================================
-- materiality_survey_questions.question_framing is a SNAPSHOT, taken at generation and never
-- re-read (20260819): "a re-seed changes future rounds; it must not restate a past one." So fixing
-- the reference table alone leaves every existing round carrying the old wording.
--
--   FROZEN ROUNDS (frozen_at IS NOT NULL) ARE NOT TOUCHED, AND MUST NOT BE. Respondents answered the
--   wording they were shown, and their answers stay attached to it. Restating it would be the
--   wording-drift defect of §3.3 run backwards — the Bay State file's first two responses answered a
--   different scale from every response after, and the fix for that is a version bump, never an edit.
--   ⚠️ IT ALSO MEANS ANY S2 ANSWER ALREADY COLLECTED MAY DESCRIBE THE WRONG WORKFORCE. That cannot
--   be repaired by SQL. The count is reported below so the size of it is known rather than assumed.
--
--   UNFROZEN ROUNDS (frozen_at IS NULL) ARE CORRECTED. §3.3 makes the question set editable until the
--   first response arrives — that is what frozen_at is for — so this is the sanctioned path and not
--   an exception to it. Nobody has answered; there is nothing to restate.
--
--   ⚠️ AND ONLY WHERE THE CUSTOMER HAS NOT AUTHORED OVER IT. wording is the customer's layer (§3.1),
--   so the update touches a row only where question_framing still equals the old seeded string AND
--   wording still equals the default composition built from it. A customised row is left exactly as
--   it is and counted in a NOTICE, because overwriting someone's own words to fix ours would be a
--   worse defect than the one being fixed.
--
-- Expected to touch ZERO rows today: nothing in app/ or lib/ creates a survey round, so the only
-- rounds in existence are test fixtures.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — every statement is guarded on
-- the old value, so a second run finds nothing and the assertion below confirms the new state.
-- SHIPS WITH the intro-copy change to app/survey/[token]/page.tsx and docs/survey-intro-copy.md
-- (variant B's first paragraph and the removal of its workplace tip). Applying it early is harmless:
-- the framing only reaches a respondent through a round generated after it runs.

begin;

do $$
declare
  v_codes  constant text[] := array['S2.1', 'S2.2', 'S2.3', 'S2.4', 'S2.5', 'S2.6'];
  v_old    constant text   := 'for workers in your suppliers'' and value-chain operations';
  v_new    constant text   := 'in your organisation''s workforce';
  v_s1     constant text   := 'in your own workforce';

  v_present     int;
  v_display     int;
  v_correct     int;
  v_s1_intact   int;
  v_snapshot    int;
  v_customised  int;
  v_frozen      int;
  v_wrong       text;
begin
  -- The six rows must exist before anything is asserted about them. A renamed or missing code would
  -- otherwise leave the old framing in place and report success.
  select count(*) into v_present
    from public.mr_esrs_subtopic_display
   where standard_version = 'esrs_2026' and subtopic_code = any (v_codes);

  if v_present <> array_length(v_codes, 1) then
    raise exception
      'Cannot correct the S2 framing: % of the % rows S2.1-S2.6 are missing from '
      'mr_esrs_subtopic_display for esrs_2026. Reconcile against the seed in 20260818 first.',
      array_length(v_codes, 1) - v_present, array_length(v_codes, 1);
  end if;

  -- ── 1. The reference table. ────────────────────────────────────────────────
  update public.mr_esrs_subtopic_display
     set question_framing = v_new
   where standard_version = 'esrs_2026'
     and subtopic_code = any (v_codes)
     and question_framing = v_old;
  get diagnostics v_display = row_count;

  -- Re-runnable AND verified: a second run updates 0 rows and still asserts the end state, so "0
  -- updated" cannot be confused with "0 needed to be".
  select count(*) into v_correct
    from public.mr_esrs_subtopic_display
   where standard_version = 'esrs_2026' and subtopic_code = any (v_codes)
     and question_framing = v_new;

  if v_correct <> array_length(v_codes, 1) then
    select string_agg(subtopic_code || ' = ' || coalesce(question_framing, '(null)'), '; '
                      order by subtopic_code)
      into v_wrong
      from public.mr_esrs_subtopic_display
     where standard_version = 'esrs_2026' and subtopic_code = any (v_codes)
       and question_framing is distinct from v_new;

    raise exception
      'S2 framing is not what this file expects after the update. % of 6 rows carry the corrected '
      'string; the others read: %. Someone has authored a third wording — reconcile it deliberately '
      'rather than letting this file overwrite it.',
      v_correct, v_wrong;
  end if;

  -- ⚠️ S1 MUST BE UNTOUCHED. The two sides differing is the point (Record 2); if this file has
  -- somehow moved S1 as well, the twelve rows are indistinguishable to a preparer and the fix has
  -- reintroduced the problem it exists to prevent.
  select count(*) into v_s1_intact
    from public.mr_esrs_subtopic_display
   where standard_version = 'esrs_2026'
     and subtopic_code in ('S1.1', 'S1.2', 'S1.3', 'S1.4', 'S1.5', 'S1.6')
     and question_framing = v_s1;

  if v_s1_intact <> 6 then
    raise exception
      'Only % of the 6 S1 rows still read %L. The two sides of each labour pair MUST differ — it is '
      'the only human-readable field that tells them apart. Restore S1 before proceeding.',
      v_s1_intact, v_s1;
  end if;

  raise notice 'mr_esrs_subtopic_display: % of 6 S2 rows updated (0 on a replay); S1 intact.',
    v_display;

  -- ── 2. Unfrozen question sets, and only where the customer has not authored over them. ─────
  update public.materiality_survey_questions q
     set question_framing = v_new,
         wording          = q.short_name || ' ' || v_new
    from public.materiality_survey_rounds r
   where r.id = q.round_id
     and r.frozen_at is null
     and q.standard_version = 'esrs_2026'
     and q.subtopic_code = any (v_codes)
     and q.question_framing = v_old
     -- The customer's own wording is never overwritten. Their layer, their words (§3.1).
     and q.wording = q.short_name || ' ' || v_old;
  get diagnostics v_snapshot = row_count;

  select count(*) into v_customised
    from public.materiality_survey_questions q
    join public.materiality_survey_rounds r on r.id = q.round_id
   where r.frozen_at is null
     and q.subtopic_code = any (v_codes)
     and q.question_framing = v_old;

  select count(*) into v_frozen
    from public.materiality_survey_questions q
    join public.materiality_survey_rounds r on r.id = q.round_id
   where r.frozen_at is not null
     and q.subtopic_code = any (v_codes)
     and q.question_framing = v_old;

  raise notice 'materiality_survey_questions: % row(s) corrected on unfrozen rounds.', v_snapshot;

  if v_customised > 0 then
    raise notice
      '⚠️ % row(s) on UNFROZEN rounds still carry the old framing because their wording was edited '
      'by the customer. They were left alone deliberately. Review them by hand: '
      'select round_id, subtopic_code, wording from public.materiality_survey_questions q '
      'join public.materiality_survey_rounds r on r.id = q.round_id where r.frozen_at is null '
      'and q.question_framing = %L;', v_customised, v_old;
  end if;

  if v_frozen > 0 then
    raise notice
      '⚠️ % row(s) on FROZEN rounds keep the old framing, deliberately and permanently — respondents '
      'answered the wording they were shown and it must stay attached to their answers (§3.3). THOSE '
      'S2 ANSWERS MAY DESCRIBE THE WRONG WORKFORCE (their suppliers'' rather than their own) and no '
      'SQL can repair that. Identify the affected rounds and decide what the report says about them: '
      'select distinct q.round_id from public.materiality_survey_questions q '
      'join public.materiality_survey_rounds r on r.id = q.round_id where r.frozen_at is not null '
      'and q.question_framing = %L;', v_frozen, v_old;
  end if;
end $$;

-- ── 3. The column comment. ────────────────────────────────────────────────────
-- Re-emitted here, and corrected in 20260818 too, so the two files agree. The old text described the
-- framing as distinguishing "two byte-identical short names", which is still true — but it said
-- nothing about WHY the two strings must not be converged, which is the thing a future reader needs.
comment on column public.mr_esrs_subtopic_display.question_framing is
  'Whose workforce the question asks about, written from the RESPONDENT''S OWN POSITION. NULL on the 25 rows needing no framing; set on the twelve S1/S2 rows, where the two sides read DIFFERENTLY on purpose: S1 ''in your own workforce'' (an employee IS their own workforce), S2 ''in your organisation''''s workforce'' (a named representative of a supplier organisation ANSWERS FOR theirs). Corrected 16 Aug 2026 — the S2 rows previously read ''for workers in your suppliers'''' and value-chain operations'', which put to a supplier asks about THEIR suppliers, one tier too far down, and the answer would have landed in S2 as though it described the supplier''s own workforce, with no error and no flag. ⚠️ DO NOT CONVERGE THE TWO WORDINGS. short_name is identical across each pair by design and topic_label is byte-identical for S1 and S2 by design (20260822 depends on that identity), so question_framing is the ONLY human-readable field that tells the twelve rows apart; a preparer surface rendering short_name and framing alone would show six duplicated pairs. subtopic_code and topic_code do reach survey_aggregate''s payload, so a consumer can always disambiguate programmatically — it is survey_get, the respondent''s payload, that withholds subtopic_code. A distinct human label also exists in mr_esrs_topics.label (''Own workforce'' / ''Workers in the value chain''). See 20260828_mr_esrs_subtopic_display_s2_framing_fix.sql.';

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
--
-- 1) ⚠️ THE TWO SIDES DIFFER, AND EACH SIDE IS INTERNALLY CONSISTENT. This is the check that matters:
--    select subtopic_code, short_name, question_framing
--      from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and shared_with_subtopic_code is not null
--     order by subtopic_code;
--    -- expect 12 rows: S1.1-S1.6 'in your own workforce',
--    --                 S2.1-S2.6 'in your organisation''s workforce'
--    select count(distinct question_framing) from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and shared_with_subtopic_code is not null;  -- expect 2
--    -- ⚠️ If this ever reads 1, the two wordings have been converged and twelve rows are now
--    -- indistinguishable to a preparer. See Record 2 — that is the defect, not a tidy-up.
--    -- and the old string is gone entirely:
--    select count(*) from public.mr_esrs_subtopic_display
--     where question_framing like '%suppliers%';                                       -- expect 0
--
-- 2) The pairing and the short names are unchanged — this file touched framing and nothing else:
--    select short_name, count(*), count(distinct question_framing)
--      from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and shared_with_subtopic_code is not null
--     group by short_name order by short_name;
--    -- expect 6 rows, each 2 | 2   (two rows per short name, two different framings)
--    select a.subtopic_code, a.shared_with_subtopic_code, b.shared_with_subtopic_code as back
--      from public.mr_esrs_subtopic_display a
--      join public.mr_esrs_subtopic_display b
--        on b.subtopic_code = a.shared_with_subtopic_code
--       and b.standard_version = a.standard_version
--     where a.standard_version = 'esrs_2026' order by a.subtopic_code;
--    -- expect 12 rows, back = a.subtopic_code on every one
--
-- 3) The fields that CANNOT distinguish the pair, confirmed as still identical (both deliberate):
--    select count(distinct label) from public.mr_esrs_topic_labels
--     where topic_code in ('S1', 'S2') and standard_version = 'esrs_2026';             -- expect 1
--    select count(distinct short_name) from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and subtopic_code in ('S1.3', 'S2.3');      -- expect 1
--    -- and the one that CAN, if a surface wants a topic-level label:
--    select code, label from public.mr_esrs_topics where code in ('S1','S2') order by code;
--    -- expect S1 | Own workforce   and   S2 | Workers in the value chain
--
-- 4) A NEW round generates the corrected framing — the whole point of fixing the reference table:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'framing check', 'esrs_2026') returning id \gset r_
--      select subtopic_code, question_framing, wording
--        from public.materiality_survey_questions
--       where round_id = :'r_id' and subtopic_code in ('S1.3', 'S2.3')
--       order by subtopic_code;
--      -- expect S1.3 | in your own workforce            | Health and safety in your own workforce
--      --        S2.3 | in your organisation's workforce | Health and safety in your organisation's workforce
--      select count(distinct wording) from public.materiality_survey_questions
--       where round_id = :'r_id' and shared_with_subtopic_code is not null;            -- expect 12
--      -- twelve distinct wordings across twelve rows: the pair is legible without a code.
--    rollback;
--
-- 5) No frozen round was touched. Run BEFORE and AFTER and compare, on any round with responses:
--    select q.round_id, count(*) filter (where q.question_framing like '%suppliers%') as old_framing
--      from public.materiality_survey_questions q
--      join public.materiality_survey_rounds r on r.id = q.round_id
--     where r.frozen_at is not null
--     group by q.round_id;
--    -- expect UNCHANGED by this migration. A frozen round losing its old framing means the
--    -- frozen_at guard did not hold, and every response on it now points at wording nobody answered.
--
-- 6) End to end, and read it as the respondent would:
--    --   select public.survey_get('<a supplier respondent token on a NEW round>');
--    --   expect the six labour questions framed 'in your organisation's workforce'
--    --   ⚠️ On the page the badge should read "Health and safety" with "in your organisation's
--    --   workforce" beneath it, and NOTHING anywhere pointing at the respondent's own suppliers.
--    --   Then open an internal respondent's link on the same round: 'in your own workforce'.
--
-- 7) The two files agree, which is what stops the next replay reverting this:
--    -- grep 20260818 for the old string. Expect hits ONLY inside its ✎ CORRECTED notes:
--    --   grep -n "value-chain operations" supabase/migrations/20260818_*.sql
--    -- If the seed rows still carry it, running 20260818 will silently undo this migration.
