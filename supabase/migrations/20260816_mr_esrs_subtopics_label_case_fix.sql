-- 20260816_mr_esrs_subtopics_label_case_fix.sql
--
-- CORRECTIVE. Restores the dropped initial capital on all 37 esrs_2026 sub-topic labels in
-- mr_esrs_subtopics. UPDATE only — no DDL, no new rows, no other column touched.
--
--
-- WHAT WAS WRONG
-- 20260815_mr_esrs_subtopics.sql seeded the 37 labels from
-- docs/materiality-questionnaire-spec-v5.md §11.1, which is the working transcription of
-- Commission Delegated Regulation C(2026) 5010 final, Annex I, ESRS 1 Appendix A. That
-- transcription is accurate in every respect but one: §11.1 presents the sub-topics as prose
-- lists ("climate change mitigation · climate change adaptation · energy"), and prose lists
-- lowercase their entries. The ANNEX capitalises the first letter of every sub-topic.
--
-- The seed was faithful to the spec. The spec was not faithful to the instrument on this one
-- point. So all 37 rows carry a dropped initial capital:
--
--     stored              'climate change mitigation'
--     annex               'Climate change mitigation'
--
-- Confirmed against the adopted annex text on 15 Aug 2026: 'Climate change mitigation',
-- 'Pollution of air', 'Water use, including withdrawal, consumption, discharges and storage',
-- 'Drivers of biodiversity and ecosystem change', 'Resource inflows', 'Working conditions
-- (including...)', 'Social dialogue and collective bargaining...', 'Health and safety',
-- 'Training and skills development', 'Diversity and equal treatment...', 'Other labour-related
-- human rights...'.
--
-- This is a fidelity correction, not a style preference. These strings are quoted into a
-- compliance artefact that names the delegated regulation as their source; a report that cites
-- the annex and then prints wording the annex does not use is wrong in the way this module exists
-- to avoid, however small the difference looks.
--
--
-- ONLY CHARACTER 0 CHANGES. Nothing else in any label is touched — not the parentheticals, not
-- the internal capitalisation, not the punctuation, not '(FPIC)', not the possessive in
-- "Communities' economic, social and cultural rights". Each corrected string below was derived
-- from the row currently stored and re-verified character-by-character against the original seed
-- so that only the leading letter differs.
--
-- THE S1/S2 ASYMMETRY IS PRESERVED. S1.6 ends at 'adequate housing'; S2.6 continues ', water and
-- sanitation', because the annex's footnote confines water and sanitation to value-chain workers.
-- The other five labour pairs remain identical to each other. Verify step 3 proves both.
--
-- WRITTEN AS EXPLICIT VALUES, NOT A TRANSFORM. `upper(left(label,1)) || substr(label,2)` would
-- produce the same result today in one line, but it states a RULE where this file needs to state
-- the TEXT: the point of a transcription of record is that a reader can diff it against the
-- instrument. A mechanical transform is also indiscriminate — it would silently "correct" any
-- future sub-topic the annex genuinely begins in lower case.
--
-- SCOPED TO esrs_2026. The where-clause names the version explicitly, so the two unseeded 2023
-- versions (see 20260815_mr_esrs_topic_labels.sql) are unaffected if they are ever populated.
--
--
-- WHY THIS IS FREE TO DO NOW AND WOULD NOT BE LATER
-- Nothing depends on these strings yet: mr_industry_subtopic_baselines is empty, no route reads
-- mr_esrs_subtopics, and no assessment has ever stored a sub-topic label. Once baselines are
-- entered and assessments freeze labels into their results jsonb, correcting the wording means
-- historical reports and current reports disagree about what the same sub-topic is called, and
-- the correction stops being free.
--
--
-- THIS FILE IS A NO-OP IN NORMAL OPERATION, AND THAT IS THE INTENDED END STATE.
-- 20260815_mr_esrs_subtopics.sql's seed block was corrected in the same pass (16 Aug 2026) to
-- carry these same 37 capitalised strings, so the original now lands the right wording on its
-- own. It ends its seed with `on conflict ... do update set label = excluded.label`, and its
-- header states the policy that follows: "Fix a transcription error by editing this file and
-- re-running it, never by editing the row." Correcting the original is what satisfies that
-- policy; this file exists alongside it for a different reason.
--
-- So the two files agree, and REPLAY ORDER NO LONGER MATTERS. Run the corrected 20260815 first
-- and this migration matches 37 rows that are already correct: the row-count guard still passes
-- (it counts MATCHED rows, not CHANGED ones), and the verify block still proves the end state.
-- Run this one first instead and the result is identical. A fresh rebuild replays 20260815 then
-- 20260816 and lands in the same place. There is no longer any sequence that reverts the labels.
--
-- WHY KEEP IT AT ALL, THEN. Because the corrected original no longer shows that anything was
-- ever wrong — it reads as though it was right from the start, and carries only a pointer here.
-- This file is the audit record: what the defect was, how it got in (a faithful transcription of
-- a spec that had lowercased the entries), when it was found, and what proves it fixed. On a
-- compliance product that is worth more than the UPDATE it performs. Treat it as documentation
-- with an executable assertion attached, not as load-bearing DDL.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — setting a label to the
-- value it already holds is a no-op, and the row-count assertion below passes either way because
-- it counts MATCHED rows, not CHANGED ones.

begin;

-- Single UPDATE against an explicit value list, then assert it touched exactly 37 rows.
-- The assertion is the point: a mistyped code would otherwise leave that row uncorrected and
-- silently succeed, which on a legal transcription is precisely the outcome to prevent. The
-- RAISE rolls the whole transaction back, so a partial correction cannot be committed.
do $$
declare
  n integer;
begin
  update public.mr_esrs_subtopics s
     set label = v.label
    from (values
      ('E1.1', 'Climate change mitigation'),
      ('E1.2', 'Climate change adaptation'),
      ('E1.3', 'Energy'),

      ('E2.1', 'Pollution of air'),
      ('E2.2', 'Pollution of water'),
      ('E2.3', 'Pollution of soil'),
      ('E2.4', 'Substances of concern, including substances of very high concern'),
      ('E2.5', 'Microplastics'),

      ('E3.1', 'Water use, including withdrawal, consumption, discharges and storage'),

      ('E4.1', 'Drivers of biodiversity and ecosystem change (including terrestrial and marine habitat change, invasive species)'),
      ('E4.2', 'State of species'),
      ('E4.3', 'The extent and condition of terrestrial and marine ecosystems'),
      ('E4.4', 'Ecosystem services'),

      ('E5.1', 'Resource inflows'),
      ('E5.2', 'Resource outflows related to products and services'),
      ('E5.3', 'Resource outflows (waste)'),

      -- S1 — the shared labour set, first copy. S1.6 has NO 'water and sanitation'.
      ('S1.1', 'Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection'),
      ('S1.2', 'Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils'),
      ('S1.3', 'Health and safety'),
      ('S1.4', 'Training and skills development'),
      ('S1.5', 'Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)'),
      ('S1.6', 'Other labour-related human rights (including child labour, forced labour, privacy and adequate housing)'),

      -- S2 — second copy. S2.6 DOES carry 'water and sanitation'. The asymmetry is deliberate.
      ('S2.1', 'Working conditions (including adequate wages, work-life balance, working time, secure employment) and social protection'),
      ('S2.2', 'Social dialogue and collective bargaining, freedom of association, information and consultation rights of workers, including through works councils'),
      ('S2.3', 'Health and safety'),
      ('S2.4', 'Training and skills development'),
      ('S2.5', 'Diversity and equal treatment (including gender equality, equal pay for work of equal value, employment and inclusion of people with disabilities, non-discrimination, anti-harassment, measures against violence)'),
      ('S2.6', 'Other labour-related human rights (including child labour, forced labour, privacy and adequate housing, water and sanitation)'),

      ('S3.1', 'Communities'' economic, social and cultural rights (including land-related impacts, security-related impacts, adequate housing and food, water and sanitation)'),
      ('S3.2', 'Communities'' civil and political rights (including freedom of expression, freedom of assembly, impacts on human rights defenders)'),
      ('S3.3', 'Rights of indigenous peoples (including free, prior and informed consent (FPIC), self-determination, cultural rights)'),

      ('S4.1', 'Information-related impacts for consumers or users (including privacy, access to information, freedom of expression)'),
      ('S4.2', 'Personal safety of consumers or end-users (including health and safety, protection of children, security of a person)'),
      ('S4.3', 'Social inclusion of consumers or end-users (including access to products and services, responsible marketing practices, non-discrimination)'),

      ('G1.1', 'Corporate culture, including anti-corruption and bribery, the protection of whistle-blowers and animal welfare'),
      ('G1.2', 'Political influence, including lobbying activities'),
      ('G1.3', 'Management of relationships with suppliers, including payment practices, especially late payment to small- and medium-sized undertakings')
    ) as v(code, label)
   where s.code = v.code
     and s.standard_version = 'esrs_2026';

  get diagnostics n = row_count;
  if n <> 37 then
    raise exception
      'Expected to match 37 esrs_2026 sub-topic rows, matched %. Rolling back — no partial correction.', n;
  end if;
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- 1) All 37 labels now begin with an uppercase letter — the headline assertion:
--    select count(*) as total,
--           count(*) filter (where label ~ '^[A-Z]') as starts_upper,
--           count(*) filter (where label !~ '^[A-Z]') as still_lower
--    from public.mr_esrs_subtopics
--    where standard_version = 'esrs_2026';
--    -- expect 37 | 37 | 0
--
--    And list any that failed, so a non-zero count names itself rather than needing a hunt:
--    select code, label from public.mr_esrs_subtopics
--    where standard_version = 'esrs_2026' and label !~ '^[A-Z]' order by code;
--    -- expect ZERO rows
--
-- 2) Still exactly 37 rows, still only esrs_2026 — the UPDATE inserted nothing and deleted
--    nothing:
--    select standard_version, count(*) from public.mr_esrs_subtopics
--    group by standard_version;                        -- expect esrs_2026 | 37
--    select topic_code, count(*) from public.mr_esrs_subtopics
--    where standard_version = 'esrs_2026' group by topic_code order by topic_code;
--    -- expect E1|3  E2|5  E3|1  E4|4  E5|3  G1|3  S1|6  S2|6  S3|3  S4|3
--
-- 3) The S1/S2 asymmetry survived the correction — the thing most likely to be flattened:
--    select code, label like '%water and sanitation%' as has_water_sanitation
--    from public.mr_esrs_subtopics
--    where code in ('S1.6','S2.6') and standard_version = 'esrs_2026' order by code;
--    -- expect S1.6|f  S2.6|t
--    select count(*) from public.mr_esrs_subtopics a
--    join public.mr_esrs_subtopics b
--      on b.code = 'S2' || substring(a.code from 3) and b.standard_version = a.standard_version
--    where a.topic_code = 'S1' and a.standard_version = 'esrs_2026' and a.label = b.label;
--    -- expect 5 (all pairs but .6)
--
-- 4) ONLY the first character moved. Lower-casing the leading letter must reproduce the
--    pre-correction string, and nothing else can have shifted — spot-check the three labels with
--    the most internal punctuation:
--    select code, label from public.mr_esrs_subtopics
--    where code in ('S3.1','S3.3','E4.1') and standard_version = 'esrs_2026' order by code;
--    -- E4.1  Drivers of biodiversity and ecosystem change (including terrestrial and marine
--    --       habitat change, invasive species)
--    -- S3.1  Communities' economic, social and cultural rights (including land-related impacts,
--    --       security-related impacts, adequate housing and food, water and sanitation)
--    -- S3.3  Rights of indigenous peoples (including free, prior and informed consent (FPIC),
--    --       self-determination, cultural rights)
--    -- The apostrophe in Communities', the nested (FPIC) parens and the internal commas must all
--    -- be intact.
--
-- 5) Nothing else on the rows was touched — topic_code, sort_order and parent_code unchanged:
--    select count(*) from public.mr_esrs_subtopics
--    where standard_version = 'esrs_2026'
--      and (parent_code is not null or sort_order < 1 or sort_order > 6);
--    -- expect 0
--
-- 6) The baseline table is still empty, so nothing was scored against the old wording:
--    select count(*) from public.mr_industry_subtopic_baselines;   -- expect 0
