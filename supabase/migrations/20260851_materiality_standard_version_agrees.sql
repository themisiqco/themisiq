-- supabase/migrations/20260851_materiality_standard_version_agrees.sql
-- A determination's standard_version must equal its assessment's. Enforced on BOTH sides, because
-- the invariant has two writers and they break it differently.
--
--   §2 the determination side (PT409) guards the CONSEQUENCE. A determination may not be written
--      carrying a version its assessment does not state.
--   §3 the assessment side (PT412) guards the CAUSE. An assessment's version may not be changed to
--      one that would leave its existing determinations disagreeing.
--
-- ⚠️ BOTH ARE WANTED, AND §3 DOES NOT MAKE §2 REDUNDANT. §3 makes the disagreement unreachable
-- through the application; §2 is what refuses it when it arrives anyway — from hand-run SQL, from a
-- future writer, or from data that predates this file. They also catch different actors: §2 refuses
-- the contributor whose row went stale underneath them, which §3 has no visibility of at all.
--
-- ⚠️ §3 DOES NOT REFUSE EVERY CHANGE WHILE DETERMINATIONS EXIST, AND THE DIFFERENCE IS THE WHOLE
-- REPAIR PATH. That stricter rule was the client's, and it is what made this state terminal: once a
-- disagreement existed, the edit screen locked the version and omitted the column from its patch,
-- so no path in the application could set it back. "Refuse a change that leaves a determination
-- disagreeing" refuses esrs_2026 -> esrs_2023 with determinations at esrs_2026, and PERMITS
-- esrs_2023 -> esrs_2026, which is the repair. A rule that forbade both would be a rule under which
-- the contributor refusal in §2 names a remedy that does not exist.
--
-- ⚠️ THIS CLOSES A HOLE THAT PREDATES THE EDIT SCREEN, AND WHY IT WENT UNNOTICED IS WORTH WRITING
-- DOWN. Until 22 Aug 2026 materiality_assessments was INSERT-ONLY from the application:
-- app/api/materiality/route.ts:293 inserts it and nothing anywhere issued an .update() against that
-- table. standard_version was therefore write-once, and a page that read it once at load was
-- reading it forever. That was a real guarantee, nothing depended on it in writing, and it was
-- never stated anywhere. app/dashboard/materiality/assessment/[id]/edit ended it.
--
-- The two tables were never bound. materiality_impact_determinations.standard_version has its own
-- FK — (subtopic_code, standard_version) -> mr_esrs_subtopics — which proves the sub-topic exists
-- under that version and says nothing about the assessment. So a determination could be written
-- under one standard while its assessment claimed another, raising no error and breaking no
-- constraint, and the board report would freeze requirements under a version half its
-- determinations were not made under.
--
-- WHY IS DISTINCT FROM AND NOT <>, ON BOTH SIDES. An assessment may legitimately hold a null
-- standard_version (20260848 permits it; materiality_finalise owns the refusal). `<>` against null
-- yields null, the IF would not fire, and a determination would attach to an assessment stating no
-- version at all — the case that most needs refusing, passing silently. A null parent REFUSES.
--
-- WHY §2 CHECKS THE ROW'S STATE AND NOT THE DELTA. It does not ask whether standard_version changed
-- in this statement; it asks whether the row, as it will stand, agrees with its parent. That is
-- what catches the contributor: impact_save_determination's ON CONFLICT DO UPDATE omits
-- standard_version (20260840:409-418), so an untouched value can become wrong underneath someone
-- who did nothing. A delta check would miss every one of those.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260851_materiality_standard_version_agrees.sql
-- Without it psql continues past a failed statement and still exits 0, so §1 could report existing
-- bad data and the triggers still land on top of it. The Supabase SQL editor stops on error by
-- default. Either way this file is wrapped in begin/commit and any failure rolls all of it back.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS before CREATE, COMMENT ON is idempotent. §1 is re-runnable by being a
-- read-only assertion.
--
-- DEPENDS ON 20260838 (the determinations table), 20260839 (the lock trigger §2 must fire before)
-- and 20260846 (materiality_assessments.updated_at trigger).

begin;

-- =====================================================================
-- 1. PRE-FLIGHT — refuse to install over data that already violates this
-- =====================================================================
-- ⚠️ A CONSTRAINT ADDED WITHOUT CHECKING THE EXISTING ROWS IS A CONSTRAINT THAT FAILS AT THE
-- CUSTOMER INSTEAD OF AT THE INSTALL. Both triggers below validate rows as they are written and
-- neither looks at what is already stored. Without this block, an assessment that is ALREADY
-- decoupled would install cleanly and then refuse every save on the worksheet — surfacing days
-- later, to the wrong person, as an error about a change they did not make.
--
-- It names the assessment ids rather than counting them, for the reason materiality_lead_submit
-- names outstanding sub-topics rather than counting them: a maintainer told "3 rows are wrong" has
-- to go and find them, and a maintainer told which three can start.
--
-- IF THIS FIRES, DO NOT REMOVE IT TO GET THE MIGRATION IN. It is reporting real divergence, and
-- installing over it is what makes the divergence permanent — determinations cannot be deleted
-- (20260838:593 grants no DELETE). The repair is to set each named assessment's standard_version
-- to the version its determinations carry, which is exactly what the edit screen now offers.
do $$
declare
  v_rows int;
  v_ids  text;
begin
  select count(*), string_agg(distinct d.assessment_id::text, ', ' order by d.assessment_id::text)
    into v_rows, v_ids
    from public.materiality_impact_determinations d
    join public.materiality_assessments a on a.id = d.assessment_id
   where d.standard_version is distinct from a.standard_version;

  if v_rows > 0 then
    raise exception
      '% determination row(s) already disagree with their assessment''s standard_version, so this '
      'migration has NOT been applied. Nothing is broken and nothing is lost — but installing these '
      'triggers over this data would refuse every later save on those assessments. Affected '
      'assessments: %. Set each one''s standard_version to the version its determinations carry, '
      'then run this file again.', v_rows, v_ids;
  end if;

  raise notice 'Pre-flight: every determination agrees with its assessment.';
end $$;


-- =====================================================================
-- 2. The determination side — PT409
-- =====================================================================
create or replace function public.materiality_impact_determination_assessment_version()
returns trigger
language plpgsql
as $$
declare
  v_found  boolean;
  v_parent text;
begin
  select true, a.standard_version
    into v_found, v_parent
    from public.materiality_assessments a
   where a.id = NEW.assessment_id;

  -- ⚠️ EXISTENCE IS THE FK'S JOB, NOT THIS TRIGGER'S — and deferring is provably safe, which is why
  -- it is done rather than guessed at. A BEFORE trigger runs ahead of the FK check, so a bogus or an
  -- RLS-invisible assessment_id reaches here first. Refusing it would surface an invisible parent as
  -- a version conflict, naming a cause that had not occurred.
  --
  -- It cannot open a hole. The composite FK is (assessment_id, user_id) -> (id, user_id), and this
  -- table's RLS WITH CHECK pins NEW.user_id to auth.uid(); materiality_assessments is visible under
  -- RLS at exactly user_id = auth.uid(). Any row that could satisfy the FK is a row this SELECT can
  -- see, so not-found implies the FK is about to fail. Nothing passes unchecked.
  if not coalesce(v_found, false) then
    return NEW;
  end if;

  -- SECURITY INVOKER (the default, stated because it was decided rather than defaulted into). The
  -- preparer path runs as authenticated and sees the parent by the argument above. The token path
  -- runs inside a SECURITY DEFINER RPC as the table owner, and no table in this schema uses FORCE
  -- ROW LEVEL SECURITY, so RLS does not apply there. Neither needs DEFINER.
  if NEW.standard_version is distinct from v_parent then
    raise exception
      'Determination %/% carries standard_version %, but assessment % states %. A determination '
      'must be keyed to the version its assessment is prepared under: the two are joined by nothing '
      'but this trigger, and ESRS (2026) renumbered the disclosure requirements, so 49 codes exist '
      'under both versions with different titles. Not saved.',
      NEW.subtopic_code, NEW.direction, NEW.standard_version,
      NEW.assessment_id, coalesce(v_parent, '(none stated)')
      using errcode = 'PT409';
  end if;

  return NEW;
end $$;

-- ⚠️ NO REVOKE, UNLIKE THE SECURITY DEFINER FUNCTIONS IN 20260839/20260840. Postgres refuses to run
-- a trigger function called directly ("trigger functions can only be called as triggers"), so the
-- default EXECUTE to PUBLIC grants nothing. Matches materiality_impact_determination_lock().
comment on function public.materiality_impact_determination_assessment_version() is
  'Refuses any determination whose standard_version differs from its assessment''s, errcode PT409. IS DISTINCT FROM, so an assessment stating no version refuses rather than passing. Checks the row''s STATE, not the delta: impact_save_determination''s ON CONFLICT DO UPDATE omits standard_version, so an untouched value can go wrong underneath a contributor, and a delta check would miss it. Existence is deferred to the composite FK, safe because RLS and that FK together make any FK-satisfiable parent visible to this SELECT. Fires BEFORE the 20260839 lock trigger by name ordering, deliberately. Guards the CONSEQUENCE; materiality_assessment_standard_version_agrees() guards the cause.';

-- ⚠️ THE NAME DECIDES THE FIRING ORDER, AND THE ORDER IS DELIBERATE. Postgres fires same-timing row
-- triggers alphabetically by trigger name. This table already carries
-- materiality_impact_determination_lock_trg (20260839:368), also BEFORE INSERT OR UPDATE.
-- "...determination_assessment_version_trg" sorts before "...determination_lock_trg" on a < l.
--
-- Either order is transactionally correct — a raise anywhere rolls the statement back, including the
-- lock trigger's snapshot insert. What order decides is WHICH REFUSAL THE CALLER READS. Second, a
-- lead overriding a submitted determination on a decoupled assessment would be told they had not
-- given a reason, sending them to write one for a save that was never going to land. The version
-- disagreement is the more fundamental fact and must be the one reported. §4 asserts this.
drop trigger if exists materiality_impact_determination_assessment_version_trg
  on public.materiality_impact_determinations;
create trigger materiality_impact_determination_assessment_version_trg
  before insert or update on public.materiality_impact_determinations
  for each row execute function public.materiality_impact_determination_assessment_version();


-- =====================================================================
-- 3. The assessment side — PT412
-- =====================================================================
-- The client lock's rule, server-side — but the rule the client SHOULD have had, not the one it did.
-- See the header: "refuse while determinations exist" is what made this state terminal.
create or replace function public.materiality_assessment_standard_version_agrees()
returns trigger
language plpgsql
as $$
declare
  v_rows    int;
  v_carried text;
begin
  -- IS NOT DISTINCT FROM: `before update of standard_version` fires whenever the column appears in
  -- the SET list, changed or not, so an UPDATE that rewrites the same value must cost nothing. Not
  -- an optimisation — without it, a save from the edit screen that touches only the company name
  -- would be refused on an assessment that is perfectly consistent.
  if NEW.standard_version is not distinct from OLD.standard_version then
    return NEW;
  end if;

  -- ⚠️ COUNTS THE ROWS THAT WOULD DISAGREE AFTER THIS CHANGE, NOT THE ROWS THAT EXIST. This is the
  -- entire difference between a guard and a dead end. With determinations at esrs_2026:
  --   esrs_2026 -> esrs_2023   every row would disagree  -> refused, which is the cause we guard
  --   esrs_2023 -> esrs_2026   no row would disagree     -> PERMITTED, and it is the repair
  -- A rule keyed on `exists (determinations)` refuses both, and there is then no way back from a
  -- disagreement, because determinations cannot be deleted (20260838:593 grants no DELETE) and
  -- neither can the assessment (20260827:153-157).
  select count(*), string_agg(distinct d.standard_version, ', ' order by d.standard_version)
    into v_rows, v_carried
    from public.materiality_impact_determinations d
   where d.assessment_id = NEW.id
     and d.standard_version is distinct from NEW.standard_version;

  if v_rows > 0 then
    raise exception
      'Assessment % cannot move to %: % of its recorded determinations are keyed to %. Sub-topic '
      'codes differ in name, count and structure between ESRS versions, so those determinations '
      'would survive keyed to a taxonomy this assessment no longer uses and would simply stop '
      'appearing — scope comes from mr_esrs_subtopics for the stated version. Setting the version '
      'to what the determinations already carry is permitted and is the repair. Not saved.',
      NEW.id, coalesce(NEW.standard_version, '(none stated)'), v_rows, v_carried
      using errcode = 'PT412';
  end if;

  return NEW;
end $$;

comment on function public.materiality_assessment_standard_version_agrees() is
  'Refuses a change to materiality_assessments.standard_version that would leave existing determinations disagreeing, errcode PT412. Guards the CAUSE; materiality_impact_determination_assessment_version() guards the consequence, and both are wanted because the two writers of the invariant fail differently — a preparer sends a stale version, while a contributor sends none at all and is refused over a stored value nobody touched. Deliberately NOT "refuse while determinations exist": that stricter rule was the client''s, and it is what made a disagreement terminal, since neither determinations nor assessments can be deleted. Moving the assessment ONTO the version its determinations already carry is permitted, and is the repair path the edit screen offers.';

-- ⚠️ UPDATE OF standard_version, NOT PLAIN UPDATE. Every other write to this table — company name,
-- reporting period, the climate workings — must not pay for this query.
--
-- Firing order against materiality_assessments_set_updated_at (20260846:115), also BEFORE UPDATE, is
-- immaterial here and that is worth stating so nobody re-derives it: that trigger only stamps
-- NEW.updated_at, and if this one raises the whole statement rolls back, stamp included. Contrast
-- §2, where the order decides which of two refusals the caller reads.
drop trigger if exists materiality_assessments_version_agrees_trg
  on public.materiality_assessments;
create trigger materiality_assessments_version_agrees_trg
  before update of standard_version on public.materiality_assessments
  for each row execute function public.materiality_assessment_standard_version_agrees();


-- =====================================================================
-- 4. Verification
-- =====================================================================
-- ⚠️ WHAT THIS BLOCK CAN AND CANNOT PROVE. It asserts both triggers exist, that their timings are
-- what the reasoning above assumes, and that §2's fires ahead of the lock trigger — the things a
-- rename or a typo breaks silently. It does NOT exercise a refusal: that needs a real assessment and
-- a real auth.users row, and fixtures built inside a migration are a worse risk than the gap. The
-- hand tests at the foot of this file exercise both refusals; the errcodes are pinned on the client
-- side by lib/materiality/versionAgreement.test.ts, which cannot see this file.
do $$
declare
  v_names text[];
  v_def   text;
  v_mine  int;
  v_lock  int;
begin
  select array_agg(t.tgname order by t.tgname) into v_names
    from pg_trigger t
   where t.tgrelid = 'public.materiality_impact_determinations'::regclass
     and not t.tgisinternal;

  v_mine := array_position(v_names, 'materiality_impact_determination_assessment_version_trg');
  v_lock := array_position(v_names, 'materiality_impact_determination_lock_trg');

  if v_mine is null then
    raise exception 'materiality_impact_determination_assessment_version_trg was not created.';
  end if;

  -- Not "if it happens to be there". Its absence means 20260839 was never applied here, and the
  -- firing-order reasoning above would be describing a trigger that does not exist.
  if v_lock is null then
    raise exception
      'materiality_impact_determination_lock_trg is missing, so 20260839 has not been applied to '
      'this database. Apply it first: §2''s firing-order reasoning assumes it exists.';
  end if;

  if v_mine > v_lock then
    raise exception
      'Firing order is inverted: % runs after %. Same-timing row triggers fire in name order, so a '
      'rename has broken it and the lock trigger would report first.', v_names[v_mine], v_names[v_lock];
  end if;

  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.materiality_impact_determinations'::regclass
     and t.tgname  = 'materiality_impact_determination_assessment_version_trg';
  if position('BEFORE INSERT OR UPDATE' in v_def) = 0 or position('FOR EACH ROW' in v_def) = 0 then
    raise exception 'Determination-side timing is not BEFORE INSERT OR UPDATE FOR EACH ROW: %', v_def;
  end if;

  select pg_get_triggerdef(t.oid) into v_def
    from pg_trigger t
   where t.tgrelid = 'public.materiality_assessments'::regclass
     and t.tgname  = 'materiality_assessments_version_agrees_trg';
  if v_def is null then
    raise exception 'materiality_assessments_version_agrees_trg was not created.';
  end if;
  -- The column list is the point: a plain BEFORE UPDATE would run this query on every period edit.
  if position('BEFORE UPDATE OF standard_version' in v_def) = 0 then
    raise exception 'Assessment-side trigger is not BEFORE UPDATE OF standard_version: %', v_def;
  end if;

  raise notice 'Both triggers installed; determination side fires ahead of the lock trigger.';
end $$;

commit;

-- =====================================================================
-- HOW TO EXERCISE BOTH REFUSALS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- Neither needs fixtures and neither writes anything: both are rolled back, and both are expected
-- to fail. Substitute an assessment id that holds at least one determination.
--
-- (a) The determination side — PT409:
--   begin;
--     update public.materiality_impact_determinations
--        set standard_version = case standard_version
--              when 'esrs_2026' then 'esrs_2023' else 'esrs_2026' end
--      where assessment_id = '<assessment-uuid>';
--   rollback;
--   EXPECT: ERROR, SQLSTATE PT409, "Determination .../... carries standard_version ...".
--   If it instead reports a missing override reason, the firing order has inverted.
--
-- (b) The assessment side — PT412:
--   begin;
--     update public.materiality_assessments
--        set standard_version = case standard_version
--              when 'esrs_2026' then 'esrs_2023' else 'esrs_2026' end
--      where id = '<assessment-uuid>';
--   rollback;
--   EXPECT: ERROR, SQLSTATE PT412, "Assessment ... cannot move to ...".
--
-- (c) The REPAIR is permitted — this one SUCCEEDS, and proving it does is the point:
--   begin;
--     update public.materiality_assessments
--        set standard_version = (select min(d.standard_version)
--                                  from public.materiality_impact_determinations d
--                                 where d.assessment_id = '<assessment-uuid>')
--      where id = '<assessment-uuid>';
--   rollback;
--   EXPECT: UPDATE 1, no error. If this fails, §3 has been written as "refuse while determinations
--   exist" and the contributor refusal in §2 now names a remedy that does not exist.
