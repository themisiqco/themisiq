-- supabase/migrations/20260856_custom_iro_lifecycle.sql
-- Custom IROs gain a creator, a deleter, and the two gates that make deleting one safe.
--
-- WHY NOW. 20260855 made custom IROs exist, enumerable and reportable. Nothing lets a customer
-- create one, and nothing lets them undo it. This file closes both, and fixes two defects 20260855
-- introduced that its own §11 grep list did not catch — it searched TypeScript for
-- `.from('materiality_impact_determinations')` and never looked for SQL functions selecting from
-- that table by THREE of its FIVE key columns.
--
-- =====================================================================
-- ⚠️ DEFECT 1, LIVE ON THE CONTRIBUTOR PATH: impact_determination_json RETURNS AN ARBITRARY ROW
-- =====================================================================
-- 20260841 §3 filters assessment_id, subtopic_code and direction. After 20260854 the key also has
-- axis, and after 20260855 it also has iro_key. The function is `language sql` returning a SCALAR
-- jsonb, so when the query matches more than one row Postgres takes THE FIRST AND DISCARDS THE
-- REST — no error, no warning, no way for the caller to know. The moment a lead names an IRO under
-- a delegated sub-topic, the contributor's screen shows whichever row the planner happened to
-- return: possibly the IRO's answers presented as the sub-topic's own.
--
-- It has been latent since 20260855 applied, because nothing creates a custom IRO yet. §3 of THIS
-- file is what would make it reachable, so the fix ships in the same migration as the cause.
--
-- ⚠️ impact_submit IS NOT AFFECTED AND IS NOT TOUCHED. Its completeness join carries
-- `and d.assignment_id = v_assignment_id` (20260853), which discriminates the contributor's own
-- rows from a lead's IRO row and stops the same multiplication. Checked rather than assumed — the
-- shape looked identical and the predicate is the whole difference.
--
-- =====================================================================
-- ⚠️ DEFECT 2, THE DEADLOCK: NOBODY COULD FINISH A DELEGATED SUB-TOPIC WITH AN IRO UNDER IT
-- =====================================================================
-- 20260855 §8a keyed lead_submit's HELD scope on subtopic_code alone, so a custom IRO under a
-- delegated sub-topic went to the contributor with its parent. But the contributor cannot see it:
-- impact_get builds their payload from materiality_impact_assignment_subtopics joined to
-- mr_esrs_subtopics, and there is no iro_key anywhere in it. Meanwhile materiality_finalise_scope
-- DOES require it. Lead cannot submit it, contributor cannot see it, finalise refuses forever:
-- the assessment could never be completed, and the only escape was deleting the IRO, which did not
-- exist.
--
-- 20260855's own §2 argued delegation needed no schema change because "a custom IRO is delegated
-- with its parent, never apart from it". That is true of lead_submit's arithmetic and false of
-- everything the contributor actually touches. Its hand test (c) did not catch it because that test
-- pins itself to an UNDELEGATED sub-topic on purpose, so the refusal would show.
--
-- THE DECISION: MAKE THE STATE UNREACHABLE. §4 refuses the combination outright — a sub-topic
-- carrying a named IRO cannot be delegated, and a delegated sub-topic cannot receive one.
--
-- ⚠️ THE REPAIR THAT WAS REJECTED, RECORDED SO IT IS NOT RE-PROPOSED. The obvious fix is one
-- predicate in lead_submit's held scope keeping named IROs with the lead regardless of delegation.
-- It works. It was rejected because ASSIGNMENT IS PER SUB-TOPIC: delegating E1.3 hands over
-- everything under it, and that rule would then live in exactly one function's WHERE clause while
-- impact_get, impact_submit, three client insert sites and four worksheet screens all still read
-- materiality_impact_assignment_subtopics and conclude the IRO was delegated. An invariant true in
-- one place and false everywhere else is not an invariant — it is a comment with a WHERE clause
-- attached.
--
-- Refusing the combination makes "custom IROs stay with the lead" true BY CONSTRUCTION, and
-- materiality_lead_submit is then correct exactly as 20260855 wrote it. THIS FILE DOES NOT TOUCH IT.
--
-- ⚠️ WHAT IT COSTS. A lead who delegates most of the worksheet can only name IROs under what they
-- kept, so for a heavy delegator most of the feature is unavailable. That is the price of the
-- guarantee, and it is the argument for 1c — a contributor naming and scoring IROs on the
-- sub-topics they hold — being a real unlock rather than a patch over a hole left open here.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql. This file is wrapped in begin/commit.
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable; §1 refuses a half-applied
-- state rather than compounding it.
--
-- DEPENDS ON 20260838, 20260839 (lock trigger), 20260840/20260841 (token RPCs), 20260848
-- (finalisations), 20260850 (finalise family), 20260851 (version triggers), 20260854 (axis),
-- 20260855 (iro_key, the custom-IRO table, the roll-up's SQL side).

begin;


-- =====================================================================
-- 1. PRE-FLIGHT — refuse a world that is not the one this file assumes
-- =====================================================================
do $$
declare v_def text; v_bad text;
begin
  -- 20260855 is applied, and the key is the five columns this file reasons about.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.materiality_impact_determinations'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction, iro_key)' then
    raise exception 'Expected 20260855''s five-column determination key. Found: %', coalesce(v_def, '(none)');
  end if;

  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='materiality_custom_iros') then
    raise exception 'materiality_custom_iros is missing. Apply 20260855 first.';
  end if;

  -- ⚠️ THE DEFECT THIS FILE FIXES MUST STILL BE PRESENT. If impact_determination_json already
  -- filters iro_key, somebody has been here and §3 would overwrite work this file cannot see.
  if position('iro_key' in pg_get_functiondef('public.impact_determination_json(uuid,text,text)'::regprocedure)) > 0 then
    raise exception
      'impact_determination_json already filters iro_key. This file forks 20260841''s body and '
      'would discard whatever else was changed. Stop and diff the installed definition first.';
  end if;

  -- 20260848's finalisation table, which §5's gate reads.
  if not exists (select 1 from information_schema.tables
                  where table_schema='public' and table_name='materiality_finalisations') then
    raise exception 'materiality_finalisations is missing. Apply 20260848 first; §5''s gate reads it.';
  end if;

  -- ⚠️ NAMED, NOT MATCHED BY PREFIX, AND THE COMMENT THAT USED TO SIT HERE WAS A LIE.
  -- It said "nothing this file creates exists already" while testing
  -- `proname like 'materiality_custom_iro_%'` — which covers four of the SIX functions this file
  -- newly creates. materiality_impact_determination_finalised_lock and
  -- materiality_assignment_subtopic_no_iros were both unchecked, so either could have pre-existed
  -- and been silently replaced by a re-run.
  --
  -- A prefix is a guess about a population. A list is the population. impact_determination_json is
  -- deliberately absent from it: that one is a CREATE OR REPLACE of an existing function and MUST
  -- already exist — the assertion above proves it still carries the defect §3 fixes.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'materiality_impact_determination_finalised_lock',
       'materiality_custom_iro_not_delegated',
       'materiality_assignment_subtopic_no_iros',
       'materiality_custom_iro_create',
       'materiality_custom_iro_delete_preview',
       'materiality_custom_iro_delete');
  if v_bad is not null then
    raise exception
      'These functions already exist and this file would replace them: %. Nothing here is a '
      'deliberate fork of an existing function except impact_determination_json, so any of these '
      'pre-existing means somebody has been here. Inspect before re-running.', v_bad;
  end if;

  -- ⚠️ §4's RULE IS ENFORCED ON INSERT ONLY, so rows that already violate it would survive this
  -- migration invisibly and then refuse the NEXT unrelated edit. 20260855 shipped with a direct
  -- INSERT grant on materiality_custom_iros, so the combination has been reachable since it applied.
  -- Reported, not repaired: which of the two to remove is the customer's judgement, not this file's.
  select string_agg(i.subtopic_code || ' / "' || i.name || '"', ', ' order by i.subtopic_code)
    into v_bad
    from public.materiality_custom_iros i
   where exists (select 1 from public.materiality_impact_assignment_subtopics a
                  where a.assessment_id = i.assessment_id and a.subtopic_code = i.subtopic_code);
  if v_bad is not null then
    raise exception
      'These named IROs already sit under a DELEGATED sub-topic, which §4 makes unreachable from '
      'here on: %. They are the state this migration exists to prevent, and they are currently '
      'determinable by nobody. Resolve each — delete the IRO, or take the sub-topic back from its '
      'contributor — then re-run. This file will not choose for you.', v_bad;
  end if;

  raise notice 'Pre-flight passed.';
end $$;


-- =====================================================================
-- 2. PT413 — a finalised assessment's determinations cannot be deleted
-- =====================================================================
-- ⚠️ ON THE CHILD TABLE, GUARDING THE CONSEQUENCE — 20260851's precedent, applied. That file puts
-- PT409 on materiality_impact_determinations to guard the CONSEQUENCE and PT412 on
-- materiality_assessments to guard the CAUSE. This is the same split: the RPC in §7 refuses the
-- CALLER with a sentence a customer can act on, and this trigger refuses the CONSEQUENCE no matter
-- who asks or how.
--
-- ⚠️ WHY NOT RLS, AND THIS IS THE DISQUALIFYING ARGUMENT RATHER THAN A PREFERENCE. An RLS policy on
-- DELETE FILTERS ROWS; it does not refuse. A delete that touched a finalised assessment would
-- remove FEWER ROWS THAN ASKED and report success. A partial delete that reports success is the
-- worst outcome available here — worse than refusing, and worse than deleting everything — because
-- the caller has no way to learn it happened.
--
-- ⚠️ WHY A TRIGGER AT ALL WHEN §7's RPC IS THE ONLY PATH. Because "the only path" is a property of
-- today's grants, not of the schema. authenticated holds no DELETE on this table (20260838:593) and
-- this file does not grant one — but service_role does, a future migration might, and the RPC's
-- guarantee evaporates the moment either happens. The trigger's does not.
--
-- ⚠️ DELETE ONLY, NOT UPDATE, AND THE DISTINCTION IS WHAT A FROZEN SNAPSHOT CAN AND CANNOT SURVIVE.
-- An EDIT after finalisation is permitted, and deliberately: 20260848:244 states the model —
-- "Finalising again is a new version, never an edit — the board report prints the version and its
-- date and regenerates from the latest" — and the worksheet renders a card for exactly that state
-- (page.tsx:1300, "Something has changed since this was finalised"). A trigger refusing UPDATE would
-- make that card unreachable and strand any assessment needing a correction.
--
-- A DELETE is a different act. A frozen snapshot survives an edit: the row it refers to still
-- exists, still carries its taxonomy key, and the finalised requirement rows still resolve against
-- it. It does not survive that row disappearing — the unit leaves materiality_finalise_scope, the
-- next report is about a different set of things, and there is no card and no state for it.
--
-- ⚠️ AND A CONSEQUENCE THAT WAS NOT INTENDED, RECORDED AS ONE. This trigger sees only OLD and does
-- not read OLD.iro_key, so it refuses the deletion of ANY determination on a finalised assessment —
-- a seeded sub-topic row (iro_key = '') exactly as much as a custom IRO's. This file was written to
-- gate the custom-IRO delete path in §7; the wider effect is a side effect of where the gate was
-- placed, not a decision that was taken. It is probably right — nothing should be quietly removing
-- determinations from a finalised assessment by any route — but it has not been argued, and if a
-- legitimate need to delete a seeded row after finalisation ever appears, THIS is the line that
-- will refuse it and this paragraph is why.
--
-- ⚠️ WHAT NEITHER A DELETE NOR AN UPDATE GATE CAN FIX. Nothing snapshots DETERMINATIONS at
-- finalisation — materiality_finalisations freezes the requirement ROWS only, which the worksheet
-- already records at page.tsx:1260: "A card saying 'this has changed since you finalised' would need
-- to know the DETERMINATIONS moved. Nothing records that ... which is its own design." So an edit
-- after a shipped report is unrecorded, and a trigger can refuse but cannot make a report say what
-- changed. That gap is separate work and is not closed here.
--
-- ⚠️ BEFORE DELETE, WHICH IS A TIMING NO TRIGGER ON THIS TABLE HAS EVER USED. All three existing
-- ones — the 20260839 lock, 20260851's PT409, 20260855's PT410 — are BEFORE INSERT OR UPDATE, so
-- NOTHING fires on a delete today. That is not an oversight to be preserved: it means the lock
-- trigger's guarantee ("the assignee's determination stands; change it with a reason and both
-- appear in the report") has a DELETE-shaped hole. §7 closes the hole for the one delete path that
-- exists; this trigger is what stops a future one reopening it silently.
create or replace function public.materiality_impact_determination_finalised_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version int;
  v_at      timestamptz;
begin
  select f.version, f.finalised_at
    into v_version, v_at
    from public.materiality_finalisations f
   where f.assessment_id = OLD.assessment_id
   order by f.version desc
   limit 1;

  if v_version is null then
    return OLD;
  end if;

  raise exception
    'This assessment was finalised (version %, %). Its determinations cannot be deleted. A '
    'finalised assessment is an answer that has been given: the board report regenerates from the '
    'live worksheet, so removing a determination now would change what the paper says without '
    'changing the record of what was decided. Finalise again to record a new version instead.',
    v_version, to_char(v_at, 'FMDD Mon YYYY')
    using errcode = 'PT413';
end $$;

comment on function public.materiality_impact_determination_finalised_lock() is
  'Refuses DELETE of any determination belonging to an assessment with a materiality_finalisations row; errcode PT413. DELETE ONLY, NOT UPDATE: an edit after finalisation is permitted by design (20260848 — finalising again is a new version, never an edit) and the worksheet has a card for that state, whereas a delete removes a unit from finalise_scope so the next report is about a different set of things. A frozen snapshot survives an edit; it does not survive its taxonomy row disappearing. CONSEQUENCE NOT INTENDED, RECORDED AS ONE: it reads no iro_key from OLD, so it refuses deletion of SEEDED sub-topic determinations too, not only custom IROs — probably right, never argued. On the CHILD table, guarding the consequence — 20260851''s split between PT409 (consequence) and PT412 (cause). NOT RLS: an RLS policy on DELETE filters rows rather than refusing, so a delete touching a finalised assessment would remove fewer rows than asked and report success, which is worse than either refusing or deleting. A trigger rather than only the RPC check, because "the RPC is the only path" is a property of today''s grants and not of the schema. BEFORE DELETE is the first such timing on this table: the other three triggers are BEFORE INSERT OR UPDATE, which is why nothing fired on a delete before this.';

drop trigger if exists materiality_impact_determination_finalised_lock_trg
  on public.materiality_impact_determinations;
create trigger materiality_impact_determination_finalised_lock_trg
  before delete on public.materiality_impact_determinations
  for each row execute function public.materiality_impact_determination_finalised_lock();


-- =====================================================================
-- 3. impact_determination_json — DEFECT 1. Forked verbatim from 20260841 §3.
-- =====================================================================
-- Two predicates added and nothing else. `iro_key = ''` restores the guarantee the function was
-- written under — one row per (assessment, sub-topic, direction) — and `axis = 'impact'` is the
-- predicate 20260854 added to lead_submit and 20260855 added to finalise_outstanding and neither
-- reached here. Third instance of the same class; the first two were latent for the same reason.
--
-- ⚠️ IT STILL RETURNS A SCALAR FROM A QUERY THAT COULD MATCH MANY. The fix is the predicates, not
-- the shape: with all five key columns pinned the query matches at most one row, which is what
-- `returns jsonb` requires. Removing either predicate silently reintroduces first-row-wins.
create or replace function public.impact_determination_json(
  p_assessment_id uuid, p_subtopic_code text, p_direction text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'nature',               d.nature,
           'scale',                d.scale,
           'scope',                d.scope,
           'irremediability',      d.irremediability,
           'likelihood',           d.likelihood,
           -- to_jsonb on named array COLUMNS, never on a table row. See 20260840's header.
           'abstained_dimensions', to_jsonb(d.abstained_dimensions),
           'value_chain_position', to_jsonb(d.value_chain_position),
           'time_horizon',         d.time_horizon,
           'rationale',            d.rationale,
           'status',               d.status)
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction
     -- The sub-topic taken as a whole. A contributor never determines a named IRO in this phase —
     -- §4 keeps those with the lead — so this is not a filter on what they may see, it is the
     -- restoration of the one-row guarantee the function's return type depends on.
     and d.iro_key       = ''
     and d.axis          = 'impact';
$$;

comment on function public.impact_determination_json(uuid, text, text) is
  'One determination as jsonb, for the contributor payload. PINS ALL FIVE KEY COLUMNS: the three arguments plus iro_key = '''''''' and axis = ''''impact''''. Without those two the query can match several rows and a `language sql` function returning a scalar takes THE FIRST AND DISCARDS THE REST silently — so a lead naming an IRO under a delegated sub-topic would change what the contributor sees, with nothing raised. Latent from 20260855 until 20260856 made custom IROs creatable.';


-- =====================================================================
-- 4. PT414 — a delegated sub-topic and a named IRO cannot coexist
-- =====================================================================
-- ⚠️ materiality_lead_submit IS NOT FORKED BY THIS FILE, AND THAT IS THE WHOLE POINT OF THE RULE
-- BELOW. 20260855 §8a keys held scope on subtopic_code alone, so a custom IRO under a delegated
-- sub-topic goes to the contributor with its parent — and impact_get cannot show them one, so
-- nobody could determine it and materiality_finalise refused forever.
--
-- The obvious repair was to make lead_submit keep named IROs regardless of delegation. It works,
-- and it was rejected: ASSIGNMENT IS PER SUB-TOPIC, so delegating E1.3 hands over everything under
-- it, and a rule saying otherwise would live in exactly one function's WHERE clause. Every other
-- reader of materiality_impact_assignment_subtopics — three client insert sites, impact_get,
-- impact_submit, four worksheet screens — would still believe the IRO was delegated. An invariant
-- true in one place and false everywhere else is not an invariant.
--
-- SO THE STATE IS MADE UNREACHABLE INSTEAD. A sub-topic carrying a named IRO cannot be delegated;
-- a delegated sub-topic cannot receive one. "Custom IROs stay with the lead" then holds BY
-- CONSTRUCTION rather than by everyone remembering, materiality_lead_submit is correct exactly as
-- 20260855 wrote it and is left alone, and the lead gets a plain choice: delete the IRO, or keep
-- the sub-topic.
--
-- ⚠️ WHAT THIS COSTS, SAID PLAINLY. A lead who delegates most of the worksheet can only name IROs
-- under what they kept. For a heavy delegator that is most of the feature unavailable. That is the
-- price of the guarantee, and it is the argument for 1c — a contributor naming and scoring IROs on
-- the sub-topics they hold — being a real unlock rather than a patch over a hole left open here.
--
-- ⚠️ TWO DOORS, ONE RULE, AND ONLY ONE OF THEM HAS A CALLER TO PUT A MESSAGE IN.
--   Door 1, adding an IRO to a delegated sub-topic: §5's RPC is the only writer once §8 withdraws
--     the direct INSERT grant, so the RPC raises the sentence a customer reads and the trigger
--     guards the row behind it.
--   Door 2, delegating a sub-topic that carries an IRO: THERE IS NO RPC. Rows are inserted from
--     app/dashboard/materiality/worksheet/[id]/page.tsx:500 and :600 and from
--     app/api/impact-invite/route.ts:248 — three call sites, no chokepoint, and a fourth could be
--     added tomorrow. The trigger is not the belt to some braces here; it is the only gate there
--     can be, which is why ITS message has to be the good one.
--
-- Both guard the CONSEQUENCE at the row, as PT413 does, rather than trusting a caller.
--
-- ⚠️ THE RULE IS CHOSEN, NEVER INHERITED, AND THAT IS WHY BOTH GATES ARE BEFORE INSERT ON THE TWO
-- ACTS RATHER THAN A CHECK THAT FIRES ON ANY LATER WRITE. Each refusal lands at the moment a person
-- CHOOSES the combination — assigning this sub-topic, or naming this IRO — and it lands on the
-- person making that choice, with both ways out in the sentence.
--
-- The failure this avoids: a lead editing something unrelated weeks later, meeting PT414 on a row
-- they did not touch, with no escape but deleting IROs somebody else named. A rule enforced at the
-- edit inherits its refusal to whoever happens to be there. A rule enforced at the choice refuses
-- the person who made it, while they still remember why.
create or replace function public.materiality_custom_iro_not_delegated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_who text;
begin
  select coalesce(g.contributor_name, g.contributor_email, 'a contributor')
    into v_who
    from public.materiality_impact_assignment_subtopics a
    join public.materiality_impact_assignments g
      on g.id = a.assignment_id and g.assessment_id = a.assessment_id
   where a.assessment_id = NEW.assessment_id
     and a.subtopic_code = NEW.subtopic_code
   limit 1;

  if v_who is null then
    return NEW;
  end if;

  raise exception
    'Sub-topic % is assigned to %, so a named IRO cannot be added to it. An IRO named under a '
    'delegated sub-topic would belong to nobody: the contributor''s link cannot show it, and the '
    'lead no longer holds it. Take the sub-topic back first, or name this IRO under one you hold.',
    NEW.subtopic_code, v_who
    using errcode = 'PT414';
end $$;

comment on function public.materiality_custom_iro_not_delegated() is
  'Door 1 of PT414: refuses a named IRO on a sub-topic assigned to a contributor. Guards the consequence at the row; materiality_custom_iro_create raises the same refusal at the caller so a customer reads a sentence rather than meeting a constraint. Pairs with materiality_assignment_subtopic_no_iros(), which closes the same rule from the other side. Together they make "custom IROs stay with the lead" unreachable to violate, which is what lets materiality_lead_submit keep 20260855''s held-scope unchanged. THE RULE IS CHOSEN, NEVER INHERITED: this fires when someone chooses to name an IRO here, not on some later unrelated edit, so the refusal reaches the person making the choice rather than whoever next touches the row.';

drop trigger if exists materiality_custom_iros_not_delegated_trg on public.materiality_custom_iros;
create trigger materiality_custom_iros_not_delegated_trg
  before insert on public.materiality_custom_iros
  for each row execute function public.materiality_custom_iro_not_delegated();


-- ⚠️ DOOR 2 — the gate with no caller to share the work. See the note above.
create or replace function public.materiality_assignment_subtopic_no_iros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_names text;
begin
  select string_agg('"' || i.name || '"', ', ' order by i.name)
    into v_names
    from public.materiality_custom_iros i
   where i.assessment_id = NEW.assessment_id
     and i.subtopic_code = NEW.subtopic_code;

  if v_names is null then
    return NEW;
  end if;

  -- ⚠️ NAMES THE IRO, NOT THE RULE. A lead who has just typed "Water scarcity at the Valencia
  -- plant" and then tries to hand E1.3 to procurement must be told WHICH IRO is in the way and what
  -- their two options are. A generic refusal sends them to support to find out.
  raise exception
    'Sub-topic % carries the named IRO(s) %, so it cannot be assigned to a contributor. A named IRO '
    'under a delegated sub-topic would belong to nobody: the contributor''s link cannot show it, and '
    'the lead no longer holds it. Delete the IRO, or keep this sub-topic and delegate another.',
    NEW.subtopic_code, v_names
    using errcode = 'PT414';
end $$;

comment on function public.materiality_assignment_subtopic_no_iros() is
  'Door 2 of PT414: refuses delegating a sub-topic that carries a named IRO, naming the IRO. THE ONLY GATE THERE CAN BE in this direction — materiality_impact_assignment_subtopics has no RPC and three client insert sites (worksheet/[id]/page.tsx:500 and :600, api/impact-invite/route.ts:248), so there is no caller that could hold the rule. Its message is therefore the one a customer reads, and it names the IRO and both ways out rather than naming the rule. FIRES ON INSERT **AND UPDATE**: a first delegation is an insert, but a reassignment is an UPDATE of assignment_id by materiality_impact_reassign_subtopic (20260841), which a BEFORE INSERT trigger never sees — and moving a sub-topic between contributors is the commoner act of the two. THE RULE IS CHOSEN, NEVER INHERITED: this fires when someone chooses to delegate this sub-topic, so the lead is refused while they still remember why — not weeks later on an unrelated edit, with no escape but deleting IROs they did not name.';

-- ⚠️ INSERT **OR UPDATE**, AND THE UPDATE HALF IS THE ONE THAT MATTERS.
-- A first delegation is an INSERT. A REASSIGNMENT IS NOT: materiality_impact_reassign_subtopic
-- (20260841) moves a sub-topic between contributors with an
--     update public.materiality_impact_assignment_subtopics set assignment_id = ...
-- on the row that already exists. A BEFORE INSERT trigger never sees it.
--
-- So an INSERT-only gate leaves the rule holding only by ORDERING — door 1 keeps IROs off
-- already-delegated sub-topics, so the pair cannot arise in that direction — rather than by
-- construction. "Holds by accident of ordering" is exactly the property D was chosen to avoid, and
-- it would have been a hole in the path a lead actually takes: moving E1.3 from HR to procurement
-- is an ordinary Tuesday, and the worksheet screen calls that RPC in a loop at page.tsx:510.
--
-- ⚠️ DOOR 1 STAYS INSERT-ONLY, DELIBERATELY, AND HERE IS THE CHECK THAT SAYS SO. The equivalent
-- hole there would be an UPDATE moving an IRO's subtopic_code onto a delegated sub-topic. §8 grants
-- authenticated `update (name, description)` and nothing else, so no client can reach that column.
-- service_role can — it holds `grant all` — but service_role is not a path a lead takes and no
-- route uses it here. If that grant is ever widened, or a route starts writing this table as
-- service_role, door 1 needs the same treatment and this comment is the reason why.
drop trigger if exists materiality_assignment_subtopics_no_iros_trg
  on public.materiality_impact_assignment_subtopics;
create trigger materiality_assignment_subtopics_no_iros_trg
  before insert or update on public.materiality_impact_assignment_subtopics
  for each row execute function public.materiality_assignment_subtopic_no_iros();


-- =====================================================================
-- 5. materiality_custom_iro_create — the customer types a NAME
-- =====================================================================
-- ⚠️ THE KEY IS DERIVED HERE, NEVER SENT. Three reasons it cannot be the client's job: the
-- collision loop needs the database; standard_version must come from the assessment rather than be
-- asserted by a caller (nothing pins materiality_custom_iros.standard_version to its assessment's,
-- so a client-chosen one fails later at PT410 and names the wrong problem); and a slug rule living
-- in TypeScript is a rule two clients can eventually disagree about.
--
-- ⚠️ THE SLUG IS A COURTESY, NOT AN IDENTIFIER THE CUSTOMER OWNS. It is never shown. The customer
-- sees `name`; the board report prints `name`; PT409 and PT410 print `name` and fall back to the
-- key only when the row is already gone. So a readable key is worth having where the script allows
-- one and worth nothing where it does not — which is why an unslugabble name gets a generated key
-- rather than an error. SOMEONE NAMING AN IRO IN GREEK MUST NOT MEET A MESSAGE ABOUT CHARACTERS.
--
-- normalize(..., NFKD) then strip non-ASCII is core Postgres (13+), deliberately not unaccent():
-- that is an extension, and a function that fails on a database where it was never installed is a
-- worse failure than a slightly lossier slug. NFKD decomposes 'à' to 'a' + a combining mark and the
-- strip removes the mark, so Latin-with-diacritics survives as readable ASCII. Greek, Cyrillic, CJK,
-- Arabic and Hebrew do not decompose to ASCII and strip to nothing — that is the generated-key case
-- and it is the NORMAL case for a customer operating in those scripts, not an edge one.
create or replace function public.materiality_custom_iro_create(
  p_assessment_id uuid,
  p_subtopic_code text,
  p_name          text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid;
  v_version  text;
  v_name     text := btrim(coalesce(p_name, ''));
  v_base     text;
  v_key      text;
  v_who      text;
  v_n        int := 1;
begin
  -- Ownership, and a missing assessment and someone else's are deliberately NOT told apart —
  -- 20260844's reasoning: saying which would confirm that another account holds work under that id.
  select a.user_id, a.standard_version into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart.';
  end if;

  if v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, so an IRO named '
      'under it could not be keyed to a version. State the version on the assessment first.'
      using errcode = 'null_value_not_allowed';
  end if;

  if v_name = '' then
    raise exception 'An IRO needs a name. It is what the board report prints and what identifies it everywhere.'
      using errcode = 'check_violation';
  end if;
  if length(v_name) > 200 then
    raise exception 'That name is % characters. The limit is 200 — long enough for "Water scarcity at the Valencia plant" and short enough to print in a table.', length(v_name)
      using errcode = 'check_violation';
  end if;

  -- ⚠️ FINALISED MEANS ANSWERED. Creating an IRO on a finalised assessment would put a unit into
  -- scope that the finalised report does not mention, and materiality_finalise_scope would then
  -- report the assessment incomplete against a version already given to a board.
  if exists (select 1 from public.materiality_finalisations f where f.assessment_id = p_assessment_id) then
    raise exception
      'This assessment has been finalised. Naming a new IRO now would put something in scope that '
      'the finalised report does not mention. Finalise again to record a new version instead.'
      using errcode = 'PT413';
  end if;

  -- ⚠️ DOOR 1 AT THE CALLER. §4's trigger refuses this too and is the guarantee; this raise is what
  -- makes the refusal a sentence naming the contributor rather than a constraint firing.
  select coalesce(g.contributor_name, g.contributor_email, 'a contributor') into v_who
    from public.materiality_impact_assignment_subtopics a
    join public.materiality_impact_assignments g
      on g.id = a.assignment_id and g.assessment_id = a.assessment_id
   where a.assessment_id = p_assessment_id and a.subtopic_code = p_subtopic_code
   limit 1;
  if v_who is not null then
    raise exception
      'Sub-topic % is assigned to %, so a named IRO cannot be added to it — it would belong to '
      'nobody. Take the sub-topic back first, or name this IRO under one you hold.',
      p_subtopic_code, v_who
      using errcode = 'PT414';
  end if;

  -- The sub-topic must be one this assessment actually covers, and under its own version.
  if not exists (select 1 from public.mr_esrs_subtopics s
                  where s.code = p_subtopic_code and s.standard_version = v_version) then
    raise exception
      'Sub-topic % is not recorded for %. An IRO always sits under an ESRS sub-topic — that is what '
      'makes its disclosure requirements trigger.', p_subtopic_code, v_version
      using errcode = 'foreign_key_violation';
  end if;

  -- ── the slug ────────────────────────────────────────────────────────────────────────────────
  -- ⚠️ NO SEPARATE non-ASCII STRIP, AND ITS ABSENCE IS DELIBERATE. An earlier draft had
  -- regexp_replace(..., '[^\x20-\x7E]', '') between these two lines. It was redundant — the
  -- [^a-z0-9]+ pass below already removes everything that is not a slug character, combining marks
  -- included — and it relied on \xhh escapes in a POSIX bracket expression, which is a construct
  -- this file cannot exercise before Lisa runs it. Two behaviours where one will do, and the extra
  -- one untested.
  --
  -- NFKD is what does the real work: 'Valencià' decomposes to 'Valencia' + a combining grave, the
  -- lower() keeps the letters, and the [^a-z0-9]+ pass turns the mark into a '-' that btrim then
  -- removes. Result 'valencia'. Scripts that do not decompose to ASCII strip to nothing, which is
  -- the generated-key branch below.
  v_base := lower(normalize(v_name, NFKD));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := btrim(v_base, '-');
  v_base := left(v_base, 64);
  v_base := btrim(v_base, '-');

  if v_base = '' then
    -- Generated, opaque, and valid against the 20260855 §2 CHECK. Not an error and not a prompt.
    v_base := 'iro-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  end if;

  -- ⚠️ INSERT-AND-CATCH, NOT `select max(...)`. The primary key is the arbiter, so two browser tabs
  -- naming different IROs that slug alike cannot both win. A read-then-write would let them.
  -- Bounded at 20: past that something is wrong that another attempt will not fix.
  v_key := v_base;
  loop
    begin
      insert into public.materiality_custom_iros
        (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
      values (p_assessment_id, v_user_id, p_subtopic_code, v_version, v_key, v_name);
      exit;
    exception
      when unique_violation then
        -- Two DIFFERENT constraints can raise this and they mean opposite things.
        -- The NAME index is a refusal the customer must see: 20260855 §3 exists because two
        -- identically-named IROs under one sub-topic are indistinguishable in a board report.
        -- The KEY collision is ours to resolve silently: the names differ, only the slugs collided.
        if exists (select 1 from public.materiality_custom_iros i
                    where i.assessment_id = p_assessment_id
                      and i.subtopic_code = p_subtopic_code
                      and lower(btrim(i.name)) = lower(btrim(v_name))) then
          raise exception
            'An IRO called "%" is already recorded under %. Two with the same name cannot be told '
            'apart in the report — give this one a name that says how it differs.', v_name, p_subtopic_code
            using errcode = 'unique_violation';
        end if;
        v_n := v_n + 1;
        if v_n > 20 then
          raise exception
            'Could not derive a unique key for "%" after 20 attempts. Nothing is wrong with the '
            'name; something is wrong here. Tell us.', v_name;
        end if;
        v_key := left(v_base, 64 - length(v_n::text) - 1) || '-' || v_n::text;
    end;
  end loop;

  return jsonb_build_object('iro_key', v_key, 'name', v_name, 'subtopic_code', p_subtopic_code);
end $$;

comment on function public.materiality_custom_iro_create(uuid, text, text) is
  'Names an IRO under an ESRS sub-topic and returns its derived key. THE CUSTOMER TYPES A NAME; iro_key is derived here and never sent — the collision loop needs the database, standard_version must come from the assessment rather than be asserted by a caller, and a slug rule in TypeScript is one two clients can disagree about. A name that slugs to empty (Greek, Cyrillic, CJK, Arabic, punctuation only) gets a generated iro-xxxxxxxx key rather than a validation error: the key is never shown, so a readable one is a courtesy and an unreadable name is not a customer error. Key collisions between DIFFERENT names take a numeric suffix; a duplicate NAME is refused, because 20260855 §3''s index exists so two identically-named IROs cannot be told apart in a board report. Refuses on a finalised assessment (PT413).';


-- =====================================================================
-- 6. materiality_custom_iro_delete_preview — the cost, in the customer's terms
-- =====================================================================
-- ⚠️ A SEPARATE FUNCTION, BECAUSE THE CLIENT CANNOT COUNT THIS. The contributor's identity is
-- behind a join through materiality_impact_assignments that a worksheet screen has no business
-- doing, and two of the four figures below are invisible from the determination rows alone.
--
-- ⚠️ "AT LEAST", NEVER A CONFIDENT NUMBER, AND THE REASON IS STRUCTURAL. assignment_id tells you a
-- contributor authored the row AS IT STANDS. A lead's override REWRITES THE ROW IN PLACE — the
-- contributor's original survives only in materiality_impact_assignee_determinations — so a
-- determination that was theirs can now read as the lead's. Any count of "contributor work" is
-- therefore a FLOOR. A confident number would understate, in the direction of making the deletion
-- look cheaper than it is, which is the one direction it must not err.
--
-- ⚠️ THE SNAPSHOT IS COUNTED SEPARATELY AND THIS IS THE FIGURE THAT WOULD OTHERWISE BE MISSED.
-- 20260855 §4 rebuilt the snapshot's parent FK as ON DELETE CASCADE, so deleting a determination
-- takes its pre-override snapshot with it — the record of what the contributor ORIGINALLY said
-- before the lead changed it. Nothing in the delete path mentions it and no error is raised.
-- "2 determinations" understates the loss when a snapshot goes too, and the snapshot is the part
-- that cannot be reconstructed from anything else.
create or replace function public.materiality_custom_iro_delete_preview(
  p_assessment_id uuid,
  p_subtopic_code text,
  p_iro_key       text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_name        text;
  v_dets        int;
  v_submitted   int;
  v_contrib     int;
  v_snapshots   int;
  v_blockers    jsonb;
  v_finalised   int;
begin
  select a.user_id into v_user_id
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception 'No assessment with that reference is open to you.';
  end if;

  if p_iro_key is null or p_iro_key = '' then
    raise exception
      'This is the sub-topic itself, not a named IRO under it. ESRS requires the sub-topic to be '
      'assessed whether or not anything is named beneath it, so it cannot be removed.'
      using errcode = 'check_violation';
  end if;

  select i.name into v_name
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;
  if v_name is null then
    raise exception 'No IRO with that key is recorded under % on this assessment.', p_subtopic_code
      using errcode = 'no_data_found';
  end if;

  select count(*),
         count(*) filter (where d.status = 'submitted'),
         count(*) filter (where d.assignment_id is not null)
    into v_dets, v_submitted, v_contrib
    from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key;

  select count(*) into v_snapshots
    from public.materiality_impact_assignee_determinations s
   where s.assessment_id = p_assessment_id
     and s.subtopic_code = p_subtopic_code
     and s.iro_key       = p_iro_key;

  -- ⚠️ WHAT WOULD REFUSE, RETURNED RATHER THAN DISCOVERED AT THE DELETE. A confirmation dialog that
  -- asks "are you sure?" and then fails is worse than one that never opened. §7 raises on exactly
  -- these two conditions, so they are computed here by the same rules and surfaced first.
  select count(*) into v_finalised
    from public.materiality_finalisations f where f.assessment_id = p_assessment_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'direction', d.direction,
           'contributor', coalesce(g.contributor_name, g.contributor_email, 'a contributor'),
           'submitted_at', d.determined_at)
           order by d.direction), '[]'::jsonb)
    into v_blockers
    from public.materiality_impact_determinations d
    join public.materiality_impact_assignments g
      on g.id = d.assignment_id and g.assessment_id = d.assessment_id
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key
     and d.status        = 'submitted'
     and d.assignment_id is not null;

  return jsonb_build_object(
    'name',                    v_name,
    'determinations',          v_dets,
    'submitted',               v_submitted,
    -- Named 'at_least' in the payload so a renderer cannot print it as an exact count by accident.
    'by_contributor_at_least', v_contrib,
    'snapshots',               v_snapshots,
    'refuses_finalised',       v_finalised > 0,
    'refuses_submitted_by',    v_blockers);
end $$;

comment on function public.materiality_custom_iro_delete_preview(uuid, text, text) is
  'What deleting a named IRO would destroy, for the confirmation. by_contributor_at_least is a FLOOR and is named so a renderer cannot print it as exact: a lead''s override rewrites a determination in place, so work that was a contributor''s can now read as the lead''s and any count of contributor work understates. snapshots is counted separately because the parent FK cascades (20260855 §4) and takes the pre-override record of what the contributor originally said — the part that cannot be reconstructed. Also returns the two conditions that would REFUSE, so a confirmation dialog does not open on a delete that was never going to happen.';


-- =====================================================================
-- 7. materiality_custom_iro_delete
-- =====================================================================
-- ⚠️ NO NEW TABLE GRANT. authenticated holds no DELETE on materiality_impact_determinations
-- (20260838:593) and this file does not give it one. The delete happens inside this SECURITY
-- DEFINER function, which is what lets the rule be "only rows with a non-empty iro_key, only when
-- not finalised, only when no contributor's submitted work is under it" — none of which an RLS
-- policy could express, and the last of which no policy should try to (see §2 on filtering vs
-- refusing).
--
-- ⚠️ ORDER IS FORCED AND NOTHING ENFORCES IT BUT THIS FUNCTION. There is no foreign key from
-- materiality_impact_determinations to materiality_custom_iros — existence is checked by
-- materiality_impact_determination_iro_exists(), which is BEFORE INSERT OR UPDATE and does not fire
-- on delete. So deleting the IRO row first leaves its determinations pointing at nothing, with
-- nothing to complain, until somebody UPDATES one and meets a PT410 about a row they did not touch.
-- Determinations first, IRO row last.
create or replace function public.materiality_custom_iro_delete(
  p_assessment_id uuid,
  p_subtopic_code text,
  p_iro_key       text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_name    text;
  v_who     text;
  v_dets    int;
begin
  select a.user_id into v_user_id
    from public.materiality_assessments a
   where a.id = p_assessment_id and a.user_id = auth.uid();
  if v_user_id is null then
    raise exception 'No assessment with that reference is open to you.';
  end if;

  if p_iro_key is null or p_iro_key = '' then
    raise exception
      'This is the sub-topic itself, not a named IRO under it. ESRS requires the sub-topic to be '
      'assessed regardless, so it cannot be removed.'
      using errcode = 'check_violation';
  end if;

  select i.name into v_name
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;
  if v_name is null then
    raise exception 'No IRO with that key is recorded under % on this assessment.', p_subtopic_code
      using errcode = 'no_data_found';
  end if;

  -- The caller-facing half of PT413. §2's trigger would refuse this anyway; raising here is what
  -- makes the refusal a sentence about an IRO rather than about a row.
  if exists (select 1 from public.materiality_finalisations f where f.assessment_id = p_assessment_id) then
    raise exception
      'This assessment has been finalised, so "%" cannot be removed. The board report regenerates '
      'from the live worksheet, so deleting it now would change what the paper says without '
      'changing the record of what was decided.', v_name
      using errcode = 'PT413';
  end if;

  -- ⚠️ REFUSES AT EXACTLY THE LINE THE LOCK TRIGGER REFUSES AT, AND THAT IS THE WHOLE ARGUMENT.
  -- materiality_impact_determination_lock() passes through on
  -- `OLD.status <> 'submitted' or OLD.assignment_id is null` — draft contributor work is not
  -- protected there either. Refusing on the same condition means the lock has NO HOLE rather than a
  -- hole with a confirmation dialog in front of it: a contributor's SUBMITTED determination cannot
  -- be erased by any path, and the lead's route is the one that already exists — override it, with
  -- a reason, both preserved in the report.
  select string_agg(distinct coalesce(g.contributor_name, g.contributor_email, 'a contributor'), ', ')
    into v_who
    from public.materiality_impact_determinations d
    join public.materiality_impact_assignments g
      on g.id = d.assignment_id and g.assessment_id = d.assessment_id
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key
     and d.status        = 'submitted'
     and d.assignment_id is not null;

  if v_who is not null then
    raise exception
      '"%" carries a determination submitted by %. A submitted determination is not deleted, it is '
      'overridden — change the values and give a reason, and both their judgement and yours appear '
      'in the report. Deleting it would erase theirs with no record that it existed.', v_name, v_who
      using errcode = 'check_violation';
  end if;

  -- Determinations first. Their snapshots go with them by ON DELETE CASCADE (20260855 §4) — that is
  -- counted separately in the preview because it is not visible here.
  delete from public.materiality_impact_determinations d
   where d.assessment_id = p_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.iro_key       = p_iro_key;
  get diagnostics v_dets = row_count;

  delete from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id
     and i.subtopic_code = p_subtopic_code
     and i.iro_key       = p_iro_key;

  return jsonb_build_object('deleted', v_name, 'determinations_deleted', v_dets);
end $$;

comment on function public.materiality_custom_iro_delete(uuid, text, text) is
  'Deletes a named IRO and the determinations under it, in that order — determinations first, because no foreign key binds them to materiality_custom_iros and the existence trigger is BEFORE INSERT OR UPDATE, so an IRO deleted first leaves orphans nothing complains about. Grants NO new table privilege: authenticated still holds no DELETE on materiality_impact_determinations, and the rule (non-empty iro_key, not finalised, no contributor''s submitted work) is one no RLS policy could express. REFUSES on a contributor''s SUBMITTED determination at exactly the line materiality_impact_determination_lock() refuses at, so that lock has no delete-shaped hole; the lead''s route is to override with a reason, keeping both. Refuses on a finalised assessment (PT413), which the §2 trigger also refuses independently.';


-- =====================================================================
-- 8. Grants — and one narrowing
-- =====================================================================
revoke all on function public.materiality_custom_iro_create(uuid, text, text)         from public;
revoke all on function public.materiality_custom_iro_delete_preview(uuid, text, text) from public;
revoke all on function public.materiality_custom_iro_delete(uuid, text, text)         from public;

grant execute on function public.materiality_custom_iro_create(uuid, text, text)         to authenticated;
grant execute on function public.materiality_custom_iro_delete_preview(uuid, text, text) to authenticated;
grant execute on function public.materiality_custom_iro_delete(uuid, text, text)         to authenticated;

-- ⚠️ THE NARROWING. 20260855 §3 granted authenticated insert/update/delete on
-- materiality_custom_iros so the table could be exercised before an RPC existed. It exists now, and
-- a direct INSERT bypasses every rule in §5: the slug, the collision loop, the finalisation gate,
-- and the derivation of standard_version from the assessment. A direct DELETE bypasses all of §7,
-- including the contributor protection. Both are withdrawn.
--
-- UPDATE is kept and NARROWED TO TWO COLUMNS. Renaming an IRO is a legitimate direct edit — the key
-- does not move, which is deliberate — but an UPDATE that could reach iro_key or subtopic_code
-- would re-parent determinations that reference them, with no trigger firing to notice.
revoke insert, delete, update on public.materiality_custom_iros from authenticated;
grant  update (name, description) on public.materiality_custom_iros to authenticated;
-- select was and remains granted; RLS (mci_owner_all) still scopes it to the owner.


-- =====================================================================
-- 9. Verification — what the database can check about itself
-- =====================================================================
do $$
declare v_def text; v_names text[]; v_bad text;
begin
  -- 9.1 DEFECT 1 is actually fixed. The check the database cannot make for itself: PL/pgSQL and SQL
  -- function bodies are not planned at CREATE time, so a missing predicate installs cleanly.
  v_def := pg_get_functiondef('public.impact_determination_json(uuid,text,text)'::regprocedure);
  if position('d.iro_key       = ''''' in v_def) = 0 then
    raise exception 'impact_determination_json did not receive its iro_key predicate; §3 did not apply. It would return an arbitrary row the moment an IRO exists.';
  end if;
  if position('d.axis          = ''impact''' in v_def) = 0 then
    raise exception 'impact_determination_json did not receive its axis predicate; §3 did not apply.';
  end if;

  -- 9.2 DEFECT 2. BOTH doors, and their timing. A trigger installed BEFORE UPDATE by copy-paste
  -- would never fire on the only event it exists for, and nothing else would notice.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid='public.materiality_custom_iros'::regclass
                    and t.tgname='materiality_custom_iros_not_delegated_trg'
                    and (t.tgtype & 4) = 4 and (t.tgtype & 2) = 2) then
    raise exception 'Door 1 of PT414 is missing or is not BEFORE INSERT on materiality_custom_iros.';
  end if;
  -- ⚠️ ALL THREE BITS, AND THE UPDATE ONE IS THE POINT. tgtype: 2 = BEFORE, 4 = INSERT, 16 = UPDATE.
  -- Asserted separately so the message can say WHICH is absent — an INSERT-only trigger here is not
  -- a missing gate, it is a gate that a reassignment walks straight past while looking installed.
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid='public.materiality_impact_assignment_subtopics'::regclass
                    and t.tgname='materiality_assignment_subtopics_no_iros_trg') then
    raise exception
      'Door 2 of PT414 is missing on materiality_impact_assignment_subtopics. That table has no RPC '
      'and three client insert sites, so this trigger is the ONLY gate in that direction — without '
      'it a sub-topic carrying a named IRO can still be delegated, and the IRO becomes determinable '
      'by nobody.';
  end if;
  select (case when (t.tgtype & 2)  <> 2  then 'BEFORE ' else '' end)
      || (case when (t.tgtype & 4)  <> 4  then 'INSERT ' else '' end)
      || (case when (t.tgtype & 16) <> 16 then 'UPDATE ' else '' end)
    into v_def
    from pg_trigger t
   where t.tgrelid='public.materiality_impact_assignment_subtopics'::regclass
     and t.tgname='materiality_assignment_subtopics_no_iros_trg';
  if v_def <> '' then
    raise exception
      'Door 2 of PT414 is installed but is missing: %. UPDATE is the one that matters — '
      'materiality_impact_reassign_subtopic moves a sub-topic between contributors with an UPDATE, '
      'so an INSERT-only trigger looks installed and never fires on the path a lead actually takes.',
      btrim(v_def);
  end if;

  -- ⚠️ AND materiality_lead_submit MUST NOT HAVE BEEN TOUCHED. The whole argument for §4 is that
  -- making the state unreachable leaves 20260855's held scope correct. If somebody later "helps" by
  -- adding the iro_key predicate as well, the rule is enforced twice by different means and the
  -- next reader cannot tell which one is load-bearing.
  if position('sc.iro_key <> ''''' in pg_get_functiondef('public.materiality_lead_submit(uuid)'::regprocedure)) > 0 then
    raise exception
      'materiality_lead_submit carries an iro_key predicate in its held scope. This file deliberately '
      'does NOT fork it — §4 makes the state it would guard against unreachable. Two enforcements of '
      'one rule is one too many; work out which is intended before proceeding.';
  end if;

  -- 9.3 the PT413 trigger exists AND is BEFORE DELETE. Timing is asserted, not just presence: the
  -- other three triggers on this table are BEFORE INSERT OR UPDATE, and a copy-paste that kept that
  -- timing would install a trigger that never fires on the only event it exists for.
  select array_agg(t.tgname order by t.tgname) into v_names
    from pg_trigger t
   where t.tgrelid = 'public.materiality_impact_determinations'::regclass and not t.tgisinternal;
  if array_position(v_names, 'materiality_impact_determination_finalised_lock_trg') is null then
    raise exception 'The PT413 trigger is missing: %', v_names;
  end if;
  if not exists (
    select 1 from pg_trigger t
     where t.tgrelid = 'public.materiality_impact_determinations'::regclass
       and t.tgname = 'materiality_impact_determination_finalised_lock_trg'
       -- tgtype bit 3 (value 8) is DELETE; bit 1 (value 2) is BEFORE.
       and (t.tgtype & 8) = 8 and (t.tgtype & 2) = 2) then
    raise exception 'The PT413 trigger is not BEFORE DELETE. It would never fire on the only event it exists for.';
  end if;

  -- 9.3b ⚠️ NO CASCADE FROM AN ASSIGNMENT TO A NAMED IRO. Deleting an assignment is TAKING WORK
  -- BACK; deleting an IRO is DESTROYING ASSESSMENT CONTENT. Different acts, different buttons, and
  -- a cascade would silently make the first perform the second. Under §4 the pair cannot coexist so
  -- the cascade has no legitimate origin — which is exactly when a wrong ON DELETE goes unnoticed,
  -- because nothing exercises it. 20260855 §3 wrote this FK as RESTRICT; asserted, not assumed.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conname = 'materiality_custom_iros_assignment_fkey';
  if v_def is null then
    raise exception 'materiality_custom_iros_assignment_fkey is missing; 20260855 §3 did not fully apply.';
  end if;
  if position('ON DELETE RESTRICT' in v_def) = 0 then
    raise exception
      'materiality_custom_iros_assignment_fkey is not ON DELETE RESTRICT: %. Taking an assignment '
      'back would then delete named IROs as a side effect — a delete wearing a different label.', v_def;
  end if;

  -- 9.4 the three RPCs, and that authenticated can call them.
  -- ⚠️ EVERY NAME, EXPLICITLY. A COUNT IS WHAT LET THIS SHIP BROKEN TWICE.
  -- This asserted `count(*) ... like 'materiality_custom_iro_%' <> 3`, written when there were
  -- exactly three RPCs and counting those. §4's door-1 trigger function is
  -- materiality_custom_iro_not_delegated — it joined the population the pattern matches without
  -- joining the number, so a CORRECT file aborted here at install.
  --
  -- The deeper reason to name them: a count of four would still pass if one function were renamed
  -- and another added. It tests arithmetic, not identity. A list fails on exactly the name that is
  -- missing, and says which.
  select string_agg(x.name, ', ' order by x.name) into v_bad
    from (values
      ('materiality_custom_iro_not_delegated'),
      ('materiality_custom_iro_create'),
      ('materiality_custom_iro_delete_preview'),
      ('materiality_custom_iro_delete'),
      ('materiality_assignment_subtopic_no_iros'),
      ('materiality_impact_determination_finalised_lock')
    ) as x(name)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = x.name);
  if v_bad is not null then
    raise exception
      'These functions were not created by this migration: %. Every one is named rather than '
      'counted, so this message says WHICH is missing instead of that a total was wrong.', v_bad;
  end if;
  if not has_function_privilege('authenticated', 'public.materiality_custom_iro_create(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.materiality_custom_iro_delete(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.materiality_custom_iro_delete_preview(uuid,text,text)', 'EXECUTE') then
    raise exception 'authenticated cannot execute one of the custom-IRO RPCs. The feature would fail with "permission denied for function", which reads to a customer as the feature being broken.';
  end if;

  -- 9.5 THE NARROWING TOOK, and no DELETE was granted on determinations by accident.
  if has_table_privilege('authenticated', 'public.materiality_custom_iros', 'INSERT')
     or has_table_privilege('authenticated', 'public.materiality_custom_iros', 'DELETE') then
    raise exception 'authenticated still holds INSERT or DELETE on materiality_custom_iros. A direct write bypasses the slug, the collision loop, the finalisation gate and the contributor protection.';
  end if;
  if not has_table_privilege('authenticated', 'public.materiality_custom_iros', 'SELECT') then
    raise exception 'authenticated lost SELECT on materiality_custom_iros; the worksheet could not list IROs.';
  end if;
  if has_table_privilege('authenticated', 'public.materiality_impact_determinations', 'DELETE') then
    raise exception 'authenticated has gained DELETE on materiality_impact_determinations. Nothing in this file grants it; the delete path is a SECURITY DEFINER RPC precisely so this stays false.';
  end if;

  raise notice 'Verified: both defects fixed, PT413 trigger is BEFORE DELETE, three RPCs granted, direct write on custom IROs withdrawn, no DELETE on determinations.';
end $$;

commit;


-- =====================================================================
-- HOW TO EXERCISE THIS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- ⚠️ THESE CANNOT RUN AGAINST A FINALISED ASSESSMENT, AND THAT IS NOT A FLAW IN THEM.
-- Verified 24 Aug 2026 against a live finalised assessment: §5's PT413 gate fires inside
-- materiality_custom_iro_create before (a)-(c) reach the behaviour they are testing, and §7's fires
-- on the delete. The refusal is correct — naming an IRO on a finalised assessment would put
-- something in scope the finalised report does not mention — but it means the tests would report the
-- finalisation gate rather than the slug rules, the two doors, or the delete path.
--
-- ⚠️ SO BUILD A TEST ASSESSMENT INSIDE EACH TRANSACTION AND ROLL IT BACK. That is better than
-- hunting for an unfinalised real one anyway: no fixture can outlive a dropped connection, nothing
-- on a customer's assessment is touched even momentarily, and there is no state to check first.
-- All four tests were run that way on 24 Aug 2026 and passed — create, both doors, delete.
-- Before using a real assessment at all:
--     select count(*) from public.materiality_finalisations where assessment_id = '<uuid>';
-- Anything other than 0 and (a) through (d) will report PT413 and nothing else.
--
-- ⚠️ THE AUTH CONTEXT, AGAIN. All five RPCs below call auth.uid(), which is NULL in the SQL editor.
-- EVERY TEST HERE NEEDS THE JWT PREAMBLE — unlike 20260855, where only (c) did, because there the
-- inserts could carry user_id explicitly and here every path is a SECURITY DEFINER function whose
-- first act is an ownership check. There is no fixture that gets past it.
--
-- The preamble, and the answer to Step 0 as recorded in 20260855: this build's auth.uid() reads
-- both GUCs coalesced, so the JSON claim alone is sufficient. Re-run Step 0 after a platform
-- upgrade — see 20260855's hand-test header.
--
--   begin;
--     select set_config('request.jwt.claims',
--                       json_build_object('sub', a.user_id, 'role', 'authenticated')::text, true)
--       from public.materiality_assessments a where a.id = '<assessment-uuid>';
--     select auth.uid() as resolved,
--            (select user_id from public.materiality_assessments where id='<assessment-uuid>') as expected;
--     -- must match and must not be null; a NULL means everything after it is meaningless
--   ... test ...
--   rollback;
--
-- (a) NAMING ONE, AND THE KEY IS DERIVED.  [JWT preamble required]
--     select public.materiality_custom_iro_create(
--              '<assessment-uuid>', '<subtopic>', 'Water scarcity at the Valencia plant');
--   EXPECT: {"iro_key": "water-scarcity-at-the-valencia-plant", "name": "...", ...}
--
-- (b) A NAME IN A NON-LATIN SCRIPT GETS A KEY, NOT AN ERROR.  [JWT preamble required]
--     select public.materiality_custom_iro_create('<assessment-uuid>', '<subtopic>', '水不足');
--   EXPECT: {"iro_key": "iro-xxxxxxxx", ...}. AN ERROR HERE IS THE DEFECT — a customer naming an
--   IRO in Japanese, Greek or Arabic must not meet a message about characters.
--
-- (c) TWO DIFFERENT NAMES THAT SLUG ALIKE BOTH SURVIVE; THE SAME NAME TWICE DOES NOT.
--     [JWT preamble required]
--     select public.materiality_custom_iro_create('<assessment-uuid>','<subtopic>','Water — Valencia');
--     select public.materiality_custom_iro_create('<assessment-uuid>','<subtopic>','Water, Valencia');
--     select public.materiality_custom_iro_create('<assessment-uuid>','<subtopic>','Water — Valencia');
--   EXPECT: 'water-valencia', then 'water-valencia-2', then ERROR naming the duplicate. The third
--   must be refused BY NAME and not silently keyed -3.
--
-- (d) BOTH PT414 DOORS. This is the pair that replaces the deadlock; test them in both directions
--     or you have tested half a rule.  [JWT preamble required for d1 only]
--
--   d1 — cannot ADD an IRO to a delegated sub-topic. Pick a sub-topic that IS in
--        materiality_impact_assignment_subtopics for this assessment:
--     select public.materiality_custom_iro_create('<assessment-uuid>', '<delegated-subtopic>', 'Test');
--   EXPECT: ERROR, SQLSTATE PT414, NAMING THE CONTRIBUTOR. A generic refusal means the caller-side
--   raise in §5 was skipped and the trigger caught it instead — still safe, still the wrong message.
--
--   d2 — cannot DELEGATE a sub-topic that carries an IRO. NO PREAMBLE NEEDED: this is a plain
--        INSERT and the trigger reads no auth context. Use a sub-topic that HAS an IRO from (a):
--     begin;
--       insert into public.materiality_impact_assignment_subtopics
--         (assignment_id, assessment_id, user_id, subtopic_code, standard_version)
--       select g.id, g.assessment_id, g.user_id, '<subtopic-with-iro>', a.standard_version
--         from public.materiality_impact_assignments g
--         join public.materiality_assessments a on a.id = g.assessment_id
--        where g.assessment_id = '<assessment-uuid>' limit 1;
--     rollback;
--   EXPECT: ERROR, SQLSTATE PT414, NAMING THE IRO — "carries the named IRO(s) "Water scarcity at
--   the Valencia plant"". A success here is the important failure: that table has no RPC and three
--   client insert sites, so this trigger is the only thing enforcing the rule in that direction.
--
-- (d3) MOVING A SUB-TOPIC TO A DIFFERENT CONTRIBUTOR IS THE SAME DOOR, and must be shown to be.
--     A "move" is a delete of one assignment_subtopics row and an INSERT of another, so door 2
--     is refused by the UPDATE half of door 2 — NOT by the INSERT half, because
--     materiality_impact_reassign_subtopic does not insert. It UPDATEs assignment_id on the row that
--     is already there. THIS TEST IS THE ONE THAT WOULD HAVE PASSED WHILE THE HOLE WAS OPEN if it
--     were written as "repeat d2", so it calls the real RPC instead.  [JWT preamble required]
--
--     Requires: a sub-topic that IS delegated AND carries a named IRO. Under §4 that pair cannot be
--     created, so build it in the only order that works — delegate first, then note that door 1 now
--     refuses the IRO. If door 1 refuses, THE STATE IS UNREACHABLE and this test cannot be
--     constructed, which is itself the result: say so rather than recording a pass.
--
--     On an assessment where the pair somehow exists (a pre-20260856 row, which §1 refuses, or a
--     service_role write):
--       select public.materiality_impact_reassign_subtopic(
--                '<assessment-uuid>', '<subtopic-with-iro>', '<other-assignment-uuid>');
--   EXPECT: ERROR, SQLSTATE PT414, naming the IRO. A SUCCESS HERE MEANS THE TRIGGER IS INSERT-ONLY
--   — it will look installed, §9's presence check will pass, and every reassignment will walk past
--   it. That is precisely what §9's tgtype assertion exists to catch at install instead.
--
-- (e) THE PREVIEW COUNTS THE SNAPSHOT SEPARATELY.  [JWT preamble required]
--     select public.materiality_custom_iro_delete_preview('<assessment-uuid>','<subtopic>','<key>');
--   EXPECT: determinations, submitted, by_contributor_at_least, snapshots, refuses_finalised,
--   refuses_submitted_by. On an IRO the lead determined alone: snapshots = 0. The figure to watch
--   is by_contributor_at_least — it is a FLOOR and the payload names it so.
--
-- (f) DELETE REFUSES ON A CONTRIBUTOR'S SUBMITTED WORK.  [JWT preamble required]
--   Requires an IRO with a submitted determination carrying assignment_id. If none exists this test
--   cannot run on that assessment — say so rather than concluding it passed.
--     select public.materiality_custom_iro_delete('<assessment-uuid>','<subtopic>','<key>');
--   EXPECT: ERROR naming the contributor, telling the lead to override rather than delete.
--
-- (g) PT413 REFUSES AFTER FINALISATION, FROM BOTH DIRECTIONS.  [JWT preamble required]
--   On a FINALISED assessment:
--     select public.materiality_custom_iro_delete('<assessment-uuid>','<subtopic>','<key>');
--   EXPECT: ERROR, SQLSTATE PT413, naming the version and date.
--   Then the backstop, which must refuse independently of the RPC:
--     delete from public.materiality_impact_determinations
--      where assessment_id='<assessment-uuid>' and iro_key='<key>';
--   EXPECT: ERROR, SQLSTATE PT413. A success here means §2's trigger is not BEFORE DELETE, and the
--   RPC would then be the only thing standing between a finalised report and a silent edit.
--
-- (h) THE SUB-TOPIC'S OWN ROW CANNOT BE DELETED THIS WAY.  [JWT preamble required]
--     select public.materiality_custom_iro_delete('<assessment-uuid>','<subtopic>','');
--   EXPECT: ERROR. ESRS requires the sub-topic assessed whether or not anything is named under it.
