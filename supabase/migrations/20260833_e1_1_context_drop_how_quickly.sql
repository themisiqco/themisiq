-- 20260833_e1_1_context_drop_how_quickly.sql
--
-- Corrects mr_esrs_subtopic_display.context on E1.1. One string. Nothing else.
--
--   OLD  'Whether the company is reducing the greenhouse gases its operations release, and how
--          quickly. This covers energy use, transport, refrigerants and emissions from suppliers.'
--   NEW  'Whether the company is reducing the greenhouse gases its operations release. This covers
--          energy use, transport, refrigerants and emissions from suppliers.'
--
-- ⚠️ BOTH SOURCES HAVE BEEN EDITED TO MATCH, and both edits were required:
--   * 20260832_mr_esrs_subtopic_display_context.sql — its seed sets context unconditionally, so a
--     replay would silently revert this fix.
--   * docs/survey-question-context.md — the copy of record. Leaving the doc stale is how this comes
--     back: the next person re-transcribing the doc reintroduces the phrase, correctly, from the
--     wrong source.
-- Same arrangement as 20260815/20260816 (the sub-topic capitalisation fix) and 20260818/20260828
-- (the S2 framing fix): the seed file is now correct on its own, so running it first and this file
-- afterwards leaves this one a passing no-op. This file remains the audit record of the change.
--
--
-- =====================================================================
-- ⚠️ WHY "AND HOW QUICKLY" HAD TO GO — IT IS THE ABSTENTION RULE AGAIN
-- =====================================================================
-- The screening scale has four options and none of them expresses a rate. §5.1 asks what strategic
-- PRIORITY a topic deserves: existing programs are sufficient, sufficient but improvable, or need
-- significant focus — plus "not enough visibility to assess".
--
-- A context line asking whether the company is reducing emissions AND HOW QUICKLY asks two
-- questions and gives the respondent one answer to give. The second half is unanswerable on this
-- instrument by anyone who is not tracking a trajectory — which is most of a warehouse, a finance
-- team, and every external stakeholder. Faced with a question they can only half answer, an honest
-- respondent picks "not enough visibility to assess".
--
-- AND THAT IS NOT A NEUTRAL OUTCOME. §6.1 makes n_abstained a FINDING ABOUT THE COMPANY: a
-- sub-topic most respondents abstained on usually means the undertaking has no visibility of its
-- own impact. An abstention manufactured by the wording is indistinguishable in the aggregate from
-- one that means what §6.1 says it means. The instrument would be reporting its own copy as a fact
-- about the undertaking — on E1.1, which is the sub-topic most likely to be material and most
-- likely to be read.
--
-- This is the same rule 20260832's header states for management-practice language ("whether
-- controls are monitored"), reached by a different route: not by asking about the management
-- system, but by asking about a DIMENSION THE SCALE CANNOT CARRY. Both produce abstentions the
-- respondent did not mean.
--
-- ⚠️ SO THE STANDING CHECK IN 20260832 VERIFY STEP 7 DOES NOT CATCH THIS CLASS. That grep looks for
-- policy/monitor/target/governance/framework/KPI/assured. "How quickly" contains none of them. A
-- rate is a second axis, not a management word, and no keyword list would have found it. The check
-- that catches it is reading each string and asking: can a single choice from four options answer
-- ALL of what this sentence asks about?
--
--
-- THE OTHER 36 WERE CHECKED AND ARE CLEAN. Every seeded string was diffed against
-- docs/survey-question-context.md: 36 of 37 match byte for byte. The one difference is S2.6, which
-- is not a divergence — the doc gives S1.6 and S2.6 one shared string and states only in prose that
-- S2.6 should additionally cover water and sanitation, so that string was authored against the
-- annex footnote and flagged as such in 20260832. It still awaits sign-off.
-- E1.1 did not drift from the doc either: the DOC carried "and how quickly" and the seed
-- transcribed it faithfully. What changed is the decision, so the doc is corrected here too.
--
-- DEPLOY: Lisa hand-runs this. Re-runnable — guarded on the old value, and the assertion below
-- confirms the end state whether or not this run changed anything.

begin;

do $$
declare
  v_old constant text :=
    'Whether the company is reducing the greenhouse gases its operations release, and how quickly. '
    'This covers energy use, transport, refrigerants and emissions from suppliers.';
  v_new constant text :=
    'Whether the company is reducing the greenhouse gases its operations release. This covers '
    'energy use, transport, refrigerants and emissions from suppliers.';
  v_updated int;
  v_live    text;
begin
  update public.mr_esrs_subtopic_display
     set context = v_new
   where subtopic_code = 'E1.1'
     and standard_version = 'esrs_2026'
     and context = v_old;
  get diagnostics v_updated = row_count;

  select context into v_live
    from public.mr_esrs_subtopic_display
   where subtopic_code = 'E1.1' and standard_version = 'esrs_2026';

  if v_live is null then
    raise exception
      'E1.1 has no row in mr_esrs_subtopic_display for esrs_2026. Run '
      '20260832_mr_esrs_subtopic_display_context.sql first.';
  end if;

  -- Re-runnable AND verified: a replay updates 0 rows and still asserts the end state, so "0
  -- updated" cannot be mistaken for "0 needed updating".
  if v_live <> v_new then
    raise exception
      'E1.1 context is neither the old string nor the corrected one. Someone has authored a third '
      'wording; reconcile it deliberately rather than letting this file overwrite it. Live value: %',
      v_live;
  end if;

  -- The phrase, not just the whole string: a later edit could reintroduce it in different words
  -- around it.
  if v_live ~* 'how quickly|how fast|rate of' then
    raise exception
      'E1.1 context asks about a RATE. The four-point priority scale cannot express one, so a '
      'respondent who cannot judge speed abstains — and §6.1 reads that abstention as the company '
      'having no visibility of its own impact. Ask about state, not pace.';
  end if;

  raise notice 'E1.1 context: % row(s) updated (0 on a replay); wording confirmed.', v_updated;
end $$;

commit;

-- ── VERIFY AFTER RUNNING ─────────────────────────────────────────────────────
--
-- 1) The live value, read rather than assumed:
--    select context from public.mr_esrs_subtopic_display
--     where subtopic_code = 'E1.1' and standard_version = 'esrs_2026';
--    -- expect: Whether the company is reducing the greenhouse gases its operations release. This
--    --         covers energy use, transport, refrigerants and emissions from suppliers.
--
-- 2) The phrase is gone from every string, not only E1.1:
--    select subtopic_code, context from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and context ~* 'how quickly|how fast|rate of';
--    -- expect ZERO rows
--
-- 3) 20260832's own probes still pass — this file touched one non-labour row, so the S1/S2 pair
--    rule is unaffected, but confirm rather than assume:
--    select count(*) filter (where context is not null) from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026';                                    -- expect 37
--    select a.subtopic_code, (a.context = b.context) as identical
--      from public.mr_esrs_subtopic_display a
--      join public.mr_esrs_subtopic_display b
--        on b.subtopic_code = a.shared_with_subtopic_code
--       and b.standard_version = a.standard_version
--     where a.standard_version = 'esrs_2026' and a.subtopic_code like 'S1.%'
--     order by a.subtopic_code;
--    -- expect S1.1-S1.5 t, S1.6 f
--
-- 4) A replay of 20260832 does NOT revert this — the seed there now carries the corrected string:
--    -- re-run 20260832, then repeat check 1. Same value.
--    -- grep the seed for the phrase; expect hits only in this file's audit note:
--    --   grep -n "how quickly" supabase/migrations/20260832_*.sql
--
-- 5) The respondent sees it. On a round created before or after this migration — context is joined
--    live from mr_esrs_subtopic_display (20260832), so both light up at once:
--    --   select q ->> 'context' from jsonb_array_elements(
--    --            public.survey_get('<token>') -> 'questions') q
--    --    where q ->> 'short_name' = 'Climate change mitigation';
