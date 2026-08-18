-- 20260834_s2_6_context_final_wording.sql
--
-- Final wording for mr_esrs_subtopic_display.context on S2.6. One string. S1.6 is UNCHANGED.
--
--   FROM  '...and decent living conditions where the company provides them, including access to
--          water and sanitation.'
--   TO    '...and decent living conditions — including water and sanitation — where the company
--          provides them.'
--
--
-- =====================================================================
-- WHY THE PUNCTUATION IS THE CHANGE
-- =====================================================================
-- Appended at the end, the qualifier governs only the clause it follows:
--
--   '...decent living conditions where the company provides them, including access to water and
--    sanitation.'   -> "where the company provides them" attaches to LIVING CONDITIONS alone, and
--                      water and sanitation trail after it unqualified.
--
-- Set between dashes, it governs the whole list:
--
--   '...decent living conditions — including water and sanitation — where the company provides
--    them.'         -> housing, water and sanitation are all qualified together, which is the
--                      reading the annex intends.
--
-- The difference is not stylistic for a respondent who provides none of the three: the first version
-- asks them about water and sanitation unconditionally. A question that does not apply is how an
-- abstention gets manufactured on a topic the respondent could otherwise answer, and §6.1 reads that
-- abstention as the company having no visibility of its own impact.
--
-- ⚠️ S1.6 MUST NOT GAIN IT. The adopted annex's footnote confines water and sanitation to S2, which
-- the verbatim labels already reflect: S1.6 ends "privacy and adequate housing)", S2.6 ends
-- "privacy and adequate housing, water and sanitation)".
--
--
-- =====================================================================
-- ⚠️ THE GUARD ASSERTS THE PAIR ON THE TARGET STATE, NOT A LITERAL AND NOT THE CURRENT ONE
-- =====================================================================
-- The invariant that matters is structural and survives any rewording of the shared sentence:
--
--     S2.6 IS S1.6 WITH THE WATER-AND-SANITATION CLAUSE INSERTED, AND NOTHING ELSE.
--
-- Remove the clause from S2.6 and S1.6 must remain, character for character. Rewrite the shared
-- sentence on BOTH sides and this still passes; rewrite one side only and it fails, which is the
-- failure worth catching — a wording difference between the pair arrives in the aggregate as a
-- difference in ANSWERS, and nothing in survey_aggregate's payload can tell the two apart.
--
-- Asserting `context = <literal>` instead would put a second copy of the sentence in this file, and
-- the copies go stale the next time the wording is corrected in 20260832's seed — which is exactly
-- the arrangement here, where that seed is replayable and this file is the audit record.
--
-- ⚠️ AND THE UPDATE ACCEPTS EITHER STATE, SO A REPLAY IS A NO-OP RATHER THAN A FAILURE. It matches
-- the previous wording OR the final one. If the live string is NEITHER, the update touches nothing
-- and the block raises with the live value AND ITS LENGTH — because the likeliest cause of a
-- near-miss is an invisible character (a non-breaking space, a different dash), and that must
-- present as "this string is not what I expected, here it is" rather than as a later assertion
-- complaining that a clause is missing. An error naming the wrong problem is the failure this
-- codebase keeps paying for.
--
-- ✎ SUPERSEDES A BROKEN FIRST ATTEMPT. The version of this file dated 18 Aug 10:16 did not run: a
-- RAISE carried more arguments than placeholders ("too many parameters specified for RAISE"), which
-- is a parse-time error, so the whole DO block was rejected and nothing was applied. Every RAISE
-- below has been counted: no `%%` escapes are used, and each has exactly as many arguments as `%`.
--
-- DEPLOY: Lisa hand-runs this, after 20260832. Re-runnable.

begin;

do $$
declare
  -- The one thing the pair may differ by. Declared once; the target string and the assertions both
  -- read it, so there is no second place for it to drift.
  v_clause constant text := ' — including water and sanitation — ';

  v_prev constant text :=
    'Whether basic rights are respected across the workforce: no child or forced labour, privacy '
    'respected, and decent living conditions where the company provides them, including access to '
    'water and sanitation.';

  v_final constant text :=
    'Whether basic rights are respected across the workforce: no child or forced labour, privacy '
    'respected, and decent living conditions — including water and sanitation — where the company '
    'provides them.';

  v_updated int;
  v_s26     text;
  v_s16     text;
begin
  -- Accepts either state: the previous wording, or the final one already in place. A replay updates
  -- nothing and still validates below.
  update public.mr_esrs_subtopic_display
     set context = v_final
   where subtopic_code = 'S2.6'
     and standard_version = 'esrs_2026'
     and context in (v_prev, v_final);
  get diagnostics v_updated = row_count;

  select context into v_s26 from public.mr_esrs_subtopic_display
   where subtopic_code = 'S2.6' and standard_version = 'esrs_2026';
  select context into v_s16 from public.mr_esrs_subtopic_display
   where subtopic_code = 'S1.6' and standard_version = 'esrs_2026';

  if v_s26 is null or v_s16 is null then
    raise exception
      'S1.6 or S2.6 has no context row for esrs_2026. Run '
      '20260832_mr_esrs_subtopic_display_context.sql first.';
  end if;

  -- ── The update either found a row it recognised, or the live string is something else entirely.
  -- Say which, and show it, before any structural assertion can complain about a symptom.
  if v_s26 <> v_final then
    raise exception
      'S2.6 was not updated: its context matches neither the previous wording nor the final one, so '
      'this file left it alone. Either a third version has been authored, or an invisible character '
      'differs — the live string is % characters. Reconcile it deliberately. Live S2.6 >>>%<<<',
      length(v_s26), v_s26;
  end if;

  -- ── The structural invariant, on the TARGET state.
  if position(v_clause in v_s26) = 0 then
    raise exception
      'S2.6 does not carry the water-and-sanitation clause after the update. Live S2.6 >>>%<<<',
      v_s26;
  end if;

  if replace(v_s26, v_clause, ' ') <> v_s16 then
    raise exception
      'S1.6 and S2.6 differ by more than the water-and-sanitation clause. Removing the clause from '
      'S2.6 must leave S1.6 character for character. They are the same question asked of two '
      'populations, and a wording difference between them reaches the aggregate as a difference in '
      'ANSWERS. Live S1.6 >>>%<<< Live S2.6 >>>%<<<',
      v_s16, v_s26;
  end if;

  -- Implied by the test above, kept separate because it names a distinct failure: S1.6 gaining water
  -- and sanitation asserts a scope the annex puts on one side only.
  if v_s16 ~* 'sanitation' then
    raise exception
      'S1.6 context mentions sanitation. The adopted annex confines water and sanitation to S2, so '
      'S1.6 must not carry it. Live S1.6 >>>%<<<',
      v_s16;
  end if;

  raise notice 'S2.6 context: % row(s) updated (0 on a replay). Pair invariant holds.', v_updated;
end $$;

commit;

-- ── VERIFY AFTER RUNNING ─────────────────────────────────────────────────────
--
-- 1) The two strings side by side, and the invariant expressed as a query rather than trusted:
--    select subtopic_code, context from public.mr_esrs_subtopic_display
--     where subtopic_code in ('S1.6','S2.6') and standard_version = 'esrs_2026' order by 1;
--
--    select replace(
--             (select context from public.mr_esrs_subtopic_display
--               where subtopic_code = 'S2.6' and standard_version = 'esrs_2026'),
--             ' — including water and sanitation — ', ' ')
--         = (select context from public.mr_esrs_subtopic_display
--             where subtopic_code = 'S1.6' and standard_version = 'esrs_2026') as pair_holds;
--    -- expect t
--
-- 2) Only S2.6 mentions it, across all 37:
--    select subtopic_code from public.mr_esrs_subtopic_display
--     where standard_version = 'esrs_2026' and context ~* 'sanitation';   -- expect one row: S2.6
--
-- 3) 20260832's own pair probe still passes — five identical, S1.6/S2.6 differing:
--    select a.subtopic_code, (a.context = b.context) as identical
--      from public.mr_esrs_subtopic_display a
--      join public.mr_esrs_subtopic_display b
--        on b.subtopic_code = a.shared_with_subtopic_code
--       and b.standard_version = a.standard_version
--     where a.standard_version = 'esrs_2026' and a.subtopic_code like 'S1.%'
--     order by 1;
--    -- expect S1.1-S1.5 t, S1.6 f
--
-- 4) Re-run THIS file. Expect 'S2.6 context: 0 row(s) updated (0 on a replay). Pair invariant holds.'
--    and no error — that is what makes it safe to leave in the directory.
