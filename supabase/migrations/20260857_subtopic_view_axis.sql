-- supabase/migrations/20260857_subtopic_view_axis.sql
-- The sub-topic view pins the AXIS as well as the IRO key, and says which "impact" its name means.
--
-- WHY NOW, WHILE IT IS A NO-OP. 20260855 §6 created
-- materiality_impact_subtopic_determinations to make one forgettable predicate unforgettable:
-- `iro_key = ''`. It pins that and NOTHING ELSE — it exposes `axis` without filtering it. Nothing
-- writes axis = 'financial' today, so every consumer of the view is impact-axis by accident of
-- what does not exist yet rather than by anything the view guarantees.
--
-- ⚠️ THIS FILE CHANGES NO RESULT SET. Every row in materiality_impact_determinations carries
-- axis = 'impact', so the predicate added below selects exactly what the view already returned.
-- That is the argument for doing it now rather than later: there is no data to consider, no
-- consumer to re-test, and no financial-axis work in flight to coordinate with. Done later, it is
-- a change to a live view with real rows behind it, made by whoever is building the financial axis
-- and has a different problem in front of them.
--
-- ⚠️ THE HAZARD IS NOT HYPOTHETICAL — IT HAS BEEN FORGOTTEN THREE TIMES IN THIS REPO, each time
-- latent until someone looked directly at it:
--   20260854 added `d.axis = 'impact'` to materiality_lead_submit and did not reach
--     impact_determination_json.
--   20260855 added it to materiality_finalise_outstanding and still did not reach that function.
--     Its own words: "Harmless today because nothing writes axis='financial' — and a duplicate-row
--     defect the moment something does."
--   20260856 §3 finally fixed it, and called it "Third instance of the same class; the first two
--     were latent for the same reason."
-- A predicate with that record does not belong in N call sites. It belongs where it cannot be
-- omitted, which is what a view is for.
--
-- ⚠️ NO FINANCIAL MIRROR VIEW, DELIBERATELY. A sibling
-- materiality_financial_subtopic_determinations would encode a symmetry nobody has decided. The
-- impact axis is the ESRS 1 ¶43 severity triple — scale, scope, irremediability, with
-- computeSeverity routing on topic category. Financial materiality is magnitude and likelihood and
-- is specified nowhere in this repo. A view built now would either mirror columns the financial
-- axis does not use or guess at ones it does. Build it in the same migration as its first
-- consumer, where the column list is enumerated from something real. Its absence costs nothing
-- while no financial row exists.
--
-- ⚠️ WHAT THIS DOES NOT FIX. The view protects only the sites that use it. FOUR client sites still
-- read the table directly and still mix axes when one lands:
--     app/dashboard/stakeholder/[id]/report/page.tsx   (the board report — highest stakes)
--     app/dashboard/materiality/worksheet/[id]/register/page.tsx
--     app/dashboard/materiality/worksheet/[id]/determinations/page.tsx
--     app/dashboard/materiality/worksheet/[id]/determine/page.tsx
-- The last two need the TABLE and not this view, because they must show custom-IRO rows. All four
-- need an explicit axis predicate of their own. This file is necessary, not sufficient.
--
-- ⚠️ CREATE OR REPLACE, NEVER DROP. A drop would take the grants with it (20260855 §8's lesson,
-- where dropping two functions took their EXECUTE privileges and the grants had to be re-issued)
-- and would fail on anything depending on the view. Adding a WHERE clause does not change the
-- column list, so replace is available: Postgres permits CREATE OR REPLACE VIEW only when the
-- output columns keep their names, types and order, and §2 below asserts that they did.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql. This file is wrapped in begin/commit.
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable.
--
-- DEPENDS ON 20260854 (the axis column), 20260855 (the view, and iro_key).

begin;

-- =====================================================================
-- 1. The view — iro_key AND axis, and a name that explains itself
-- =====================================================================
-- ⚠️ COLUMNS ENUMERATED AND UNCHANGED FROM 20260855 §6, IN THE SAME ORDER. Not `select *`, for
-- that file's reason — a view built with * freezes its column list at creation and drifts from the
-- table with nothing raised — and not reordered or trimmed, because CREATE OR REPLACE VIEW refuses
-- anything but an append, and an append here would be a new column nobody asked for.
--
-- ⚠️ axis IS STILL A COLUMN, AND IS NOW ALSO A PREDICATE. Keeping it exposed is deliberate: a
-- consumer that wants to assert what it is reading can, and removing it would change the column
-- list this file exists not to change.
create or replace view public.materiality_impact_subtopic_determinations
with (security_invoker = true) as
  select
    d.assessment_id,
    d.user_id,
    d.subtopic_code,
    d.standard_version,
    d.axis,
    d.direction,
    d.nature,
    d.scale,
    d.scope,
    d.irremediability,
    d.likelihood,
    d.value_chain_position,
    d.time_horizon,
    d.evidence_in_view,
    d.assignment_id,
    d.status,
    d.rationale,
    d.determined_at,
    d.created_at
  from public.materiality_impact_determinations d
 where d.iro_key = ''
   and d.axis    = 'impact';

-- ⚠️ THE COMMENT CARRIES THE SENSE OF THE WORD "impact", BECAUSE THE NAME CANNOT.
-- The parent table is materiality_impact_determinations and it holds BOTH axes — 20260854 §5c says
-- so on the table itself: "Recorded determinations on BOTH materiality axes, despite the name …
-- READ THE NAME AS HISTORICAL". The view inherits that misnomer, so a reader meeting this name has
-- no way to tell whether "impact" is the historical family prefix or an assertion about the axis.
-- Since this file it is BOTH, and that has to be written down rather than inferred.
comment on view public.materiality_impact_subtopic_determinations is
  'Every determination of a sub-topic taken as a whole, ON THE IMPACT AXIS — materiality_impact_determinations with iro_key = '''' AND axis = ''impact'' pinned. ⚠️ "impact" IN THIS NAME NOW CARRIES BOTH SENSES, AND COULD NOT BE INFERRED BEFORE 20260857: the parent table shares the prefix as a HISTORICAL family name while holding both axes (20260854 §5c — "READ THE NAME AS HISTORICAL"), and this view additionally FILTERS to axis = ''impact''. A financial-axis consumer must not use it; it must not be widened to serve one either, because every existing reader depends on the pin. EXISTS SO THE PREDICATES CANNOT BE FORGOTTEN: a bare select on the table returns custom-IRO rows alongside sub-topic rows and doubles a count, silently, which is the mr_jurisdictions.active failure class — and the axis predicate was omitted three times in this repo (20260854, 20260855, fixed in 20260856 §3) for the same reason. security_invoker = true is load-bearing — without it the view runs as its owner and returns every customer''s rows to any authenticated caller. iro_key is deliberately NOT among the columns: a consumer that needs it is not a consumer of this view. NO FINANCIAL SIBLING EXISTS BY DECISION, not by omission — build one with its first consumer, where its column list can be enumerated from something real.';

-- ⚠️ NO GRANT STATEMENTS, AND THEIR ABSENCE IS THE POINT. CREATE OR REPLACE VIEW preserves the
-- privileges 20260855 §6 granted (select to authenticated and service_role, revoked from anon).
-- §2.4 asserts they survived rather than assuming it — a re-grant here would mask a drop-and-
-- recreate someone performed by hand, which is exactly the state worth finding out about.


-- =====================================================================
-- 2. Verification — extends 20260855 §10.4, which read this view back for security_invoker
-- =====================================================================
-- ⚠️ A VIEW'S BODY IS NOT CHECKED FOR MEANING AT CREATION. A WHERE clause that never got applied
-- installs cleanly and returns more rows than it claims to, with nothing raised — the same class
-- as 20260855 §10, where three of the failure modes were silent at install. So the definition is
-- read back out of the catalogue.
--
-- ⚠️ THE PREDICATE IS NAMED, NOT COUNTED. 20260856 §9 recorded why: it asserted
-- `count(*) ... like 'materiality_custom_iro_%' <> 3`, a correctly-written file grew a fourth
-- matching function, and the migration aborted at install on a file with nothing wrong with it.
-- "The general lesson … an assertion that counts tests arithmetic; an assertion that names tests
-- identity." A count of predicates here would pass on a view filtering axis TWICE and iro_key not
-- at all.
do $$
declare
  v_def  text;
  v_opts text[];
  v_cols text;
begin
  v_def := pg_get_viewdef('public.materiality_impact_subtopic_determinations'::regclass, true);

  -- ── 2.1 the axis predicate, BY NAME ──────────────────────────────────────────────────────────
  -- pg_get_viewdef normalises whitespace, casts AND ALIASES. §1 has ONE source relation, so the
  -- alias is dropped and the installed text reads `(axis = 'impact'::text)` — not `d.axis`, which
  -- is how §1 is written and what this assertion first searched for. It matched nothing and the
  -- migration aborted on a view that was correct: the assertion was wrong, not the predicate.
  --
  -- ⚠️ NEITHER THE ALIAS NOR THE CAST BELONGS TO THE PREDICATE'S IDENTITY. Both are the renderer's
  -- choice — the alias is emitted only when more than one relation is in scope, and the cast's
  -- spelling is Postgres's to change between versions. What cannot be anything else is a predicate
  -- naming the column `axis` and the literal `'impact'`, so that is what is matched. Unanchoring
  -- the alias WIDENS what passes rather than narrowing it: this now holds whether or not a future
  -- §1 acquires a join and the alias is rendered again. No column in the view's list ends in
  -- `axis`, so the shorter string cannot bind to a different predicate.
  if position('axis = ''impact''' in v_def) = 0 then
    raise exception
      'No axis predicate found in the installed definition of '
      'materiality_impact_subtopic_determinations. That is the observation; the cause is open. '
      'Either §1 did not apply, or this assertion''s search string no longer matches how Postgres '
      'renders the predicate — it has already fired once for the second reason, on a view that was '
      'correct. Read the definition below before changing §1. If the predicate is genuinely absent, '
      'every reader of this view silently mixes impact and financial determinations the moment a '
      'financial row exists. Installed definition: %', v_def;
  end if;

  -- ── 2.2 AND iro_key IS STILL PINNED ──────────────────────────────────────────────────────────
  -- ⚠️ THE ASSERTION THAT CATCHES THIS FILE REPLACING THE VIEW WITH A WORSE ONE. §1 rewrites the
  -- whole definition, so a mistyped body could install an axis pin while dropping the iro_key pin —
  -- trading one silent defect for the other, and 20260855's entire reason for existing with it.
  --
  -- Unaliased for 2.1's reason, and it was the same defect: the installed text is
  -- `iro_key = ''::text`, never `d.iro_key`. The second branch drops the cast too — it is a
  -- substring of the first, so it can only widen what passes, and it is kept against a renderer
  -- that stops emitting the cast. `iro_key` is not among the view's columns, so neither string can
  -- match anywhere but the WHERE clause.
  if position('iro_key = ''''::text' in v_def) = 0
     and position('iro_key = ''''' in v_def) = 0 then
    raise exception
      'No iro_key predicate found in the installed definition of '
      'materiality_impact_subtopic_determinations. That is the observation; the cause is open. '
      'Either §1 dropped the pin, or these search strings no longer match how Postgres renders it '
      '— 2.1 has already fired once for the second reason, on a view that was correct. Read the '
      'definition below before changing §1. If the pin is genuinely gone, this file traded one '
      'silent defect for the other: without iro_key = '''' the view returns custom IROs alongside '
      'sub-topic rows and every count drawn from it doubles. Installed definition: %', v_def;
  end if;

  -- ── 2.3 security_invoker, RE-ASSERTED — 20260855 §10.4 verbatim in intent ────────────────────
  -- ⚠️ THE MOST IMPORTANT ASSERTION HERE, AND THE REASON IT IS REPEATED RATHER THAN ASSUMED. A
  -- view without security_invoker runs as its OWNER, so RLS on the underlying table is evaluated as
  -- the owner and the view returns EVERY CUSTOMER'S DETERMINATIONS to any authenticated caller.
  -- There is no error and no empty result. 20260855 §10.4 checked it at ITS install; this file
  -- REPLACES the view, and `with (security_invoker = true)` omitted from §1 above would drop the
  -- setting silently. A property re-established by this file must be re-checked by this file.
  select c.reloptions into v_opts from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'materiality_impact_subtopic_determinations'
     and c.relkind = 'v';
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception
      'materiality_impact_subtopic_determinations is not security_invoker. It would run as its '
      'owner and return every customer''s determinations to any authenticated caller, silently. '
      'Found reloptions: %', coalesce(array_to_string(v_opts, ','), '(none)');
  end if;

  -- ── 2.4 the column list did not move, and the grants survived ────────────────────────────────
  -- ⚠️ NINETEEN COLUMNS, NAMED IN ORDER, NOT COUNTED. CREATE OR REPLACE VIEW already refuses a
  -- changed column list, so this cannot fail after a successful §1 — it fails when someone reaches
  -- for `drop view ... cascade` to get around that refusal, which is the very thing this file's
  -- header forbids. Then the drop has also taken the grants, which is why 2.4 checks both.
  select string_agg(a.attname, ',' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = 'public.materiality_impact_subtopic_determinations'::regclass
     and a.attnum > 0 and not a.attisdropped;
  if v_cols is distinct from
     'assessment_id,user_id,subtopic_code,standard_version,axis,direction,nature,scale,scope,'
     'irremediability,likelihood,value_chain_position,time_horizon,evidence_in_view,assignment_id,'
     'status,rationale,determined_at,created_at' then
    raise exception
      'The view''s columns are not 20260855 §6''s nineteen in order. This file must not change '
      'them. Found: %', coalesce(v_cols, '(none)');
  end if;

  if not has_table_privilege('authenticated', 'public.materiality_impact_subtopic_determinations', 'SELECT') then
    raise exception
      'authenticated cannot select from materiality_impact_subtopic_determinations. CREATE OR '
      'REPLACE preserves privileges, so this means the view was dropped and recreated rather than '
      'replaced — the worksheet screens would fail with "permission denied", which reads to a '
      'customer as the feature being broken.';
  end if;
  if not has_table_privilege('service_role', 'public.materiality_impact_subtopic_determinations', 'SELECT') then
    raise exception 'service_role lost SELECT on materiality_impact_subtopic_determinations. See the note in 2.4.';
  end if;
  -- anon was never granted and must stay that way: this view is the lead's side of the firewall,
  -- and the contributor token path reads through impact_get, never through here.
  if has_table_privilege('anon', 'public.materiality_impact_subtopic_determinations', 'SELECT') then
    raise exception
      'anon has gained SELECT on materiality_impact_subtopic_determinations. Nothing in this file '
      'or in 20260855 §6 grants it; the contributor path reads through impact_get by design.';
  end if;

  raise notice 'Verified: axis and iro_key both pinned, security_invoker intact, nineteen columns unchanged, grants preserved.';
end $$;

commit;


-- =====================================================================
-- HOW TO EXERCISE THIS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- ⚠️ THE HONEST DIFFICULTY WITH TESTING THIS FILE: there is no financial-axis row anywhere, so the
-- predicate it adds cannot be shown to filter anything using data that exists. A test that says
-- "the counts match" would pass equally on a view with no axis predicate at all — it would be
-- testing nothing and reporting a pass. So (a) MAKES a financial row inside a transaction and
-- rolls it back. That is the only way to see the predicate do its job.
--
-- ⚠️ NO AUTH PREAMBLE NEEDED. Nothing here calls auth.uid(). The editor's role bypasses RLS, which
-- is fine for (a) and (b) and is exactly why neither says anything about security_invoker — see
-- 20260855's hand-test header, and §2.3 above, which is the only thing that checks it.
--
-- (a) THE PREDICATE FILTERS. Insert one financial-axis row and watch the view refuse it.
--   begin;
--     insert into public.materiality_impact_determinations
--       (assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--        evidence_in_view, iro_key, status)
--     select assessment_id, user_id, subtopic_code, standard_version, 'financial', direction,
--            nature, false, '', 'draft'
--       from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' and iro_key = '' and axis = 'impact'
--      limit 1;
--
--     select count(*) from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' and iro_key = '';
--     select count(*) from public.materiality_impact_subtopic_determinations
--      where assessment_id = '<assessment-uuid>';
--   rollback;
--   EXPECT: the first count exceeds the second by exactly 1. EQUAL COUNTS MEAN THE PREDICATE IS NOT
--   THERE and every worksheet figure will mix axes as soon as the financial axis ships.
--   ⚠️ IF THE INSERT ITSELF IS REFUSED, READ THE ERROR BEFORE ASSUMING THIS FILE IS AT FAULT: a
--   check constraint on axis, or the PT409 version trigger, is a finding about 20260854 rather than
--   about this migration. Say which was observed rather than recording a fail.
--
-- (b) THE IRO PIN STILL HOLDS. 20260855's test (e), re-run, because §1 rewrote the whole body and
--     the point of 2.2 is that this file could have traded one predicate for the other.
--   begin;
--     insert into public.materiality_custom_iros
--       (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
--     select a.id, a.user_id, d.subtopic_code, a.standard_version, 'axis-test-iro',
--            'Axis test IRO'
--       from public.materiality_assessments a
--       join public.materiality_impact_determinations d on d.assessment_id = a.id
--      where a.id = '<assessment-uuid>' and d.iro_key = '' limit 1;
--
--     insert into public.materiality_impact_determinations
--       (assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--        evidence_in_view, iro_key, status)
--     select assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--            false, 'axis-test-iro', 'draft'
--       from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' and iro_key = '' limit 1;
--
--     select count(*) from public.materiality_impact_subtopic_determinations
--      where assessment_id = '<assessment-uuid>';
--   rollback;
--   EXPECT: unchanged from the count before the inserts. A count that grew means the iro_key pin
--   was lost by this file, and 2.2 did not catch it.
--   ⚠️ THE ASSESSMENT MUST NOT BE FINALISED and the sub-topic must not be delegated, or 20260856's
--   PT413/PT414 will refuse the first insert. That refusal is correct and is not a result about
--   this file: pick another assessment rather than recording a fail.
--     select count(*) from public.materiality_finalisations where assessment_id = '<assessment-uuid>';
--   Anything other than 0 and (b) reports PT413 and nothing else.
