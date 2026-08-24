-- supabase/migrations/20260854_materiality_determination_axis.sql
-- The determination table gains an AXIS, and its primary key gains a fourth column.
--
-- WHY. Until now this table modelled ONE axis — the impact axis — and modelled it by being named
-- after it. `direction in ('negative','positive')` was the only discriminator, and the financial
-- side was not a determination at all: it lived in materiality_assessments.workings as the
-- climate-risk engine's scored output, a different shape written by a different path.
-- 20260838:227 records this as a known gap in its own words: "(4) No financial-effect axis (§5.2's
-- outside-in question) …". This migration closes it.
--
-- WHAT THE FOUR COMBINATIONS MEAN, customer-facing. No column is renamed to say this; the
-- vocabulary is a display concern and lives in TypeScript, the same split 20260838 argues for
-- severity:
--     axis='impact'    + direction='negative'  ->  Impact (adverse)
--     axis='impact'    + direction='positive'  ->  Impact (positive)
--     axis='financial' + direction='negative'  ->  Risk
--     axis='financial' + direction='positive'  ->  Opportunity
--
-- ⚠️ THIS TOUCHES TWO TABLES, NOT ONE, AND THE SECOND IS EASY TO MISS.
-- materiality_impact_assignee_determinations (20260839:245-256) — the pre-override snapshot — has
-- primary key (assessment_id, subtopic_code, direction) AND a foreign key on those same three
-- columns referencing the determination table's primary key. A three-column key cannot reference a
-- key that is now four columns, so the determination PK CANNOT be changed without moving this table
-- with it. Both tables gain axis; both keys become four columns; the FK is dropped and recreated.
--
-- ⚠️ NOTHING CAN WRITE axis='financial' AFTER THIS MIGRATION, AND THAT IS DELIBERATE. The check
-- permits the value; no writer produces it. impact_save_determination (20260840) and
-- impact_save_determination_v2 (20260841) do not mention the column, so both insert the default.
-- The financial axis becomes reachable only when an RPC is written for it — and
-- materiality_lead_submit's completeness rule must be widened BEFORE that happens. See §5.
--
-- ⚠️ NO BACKFILL IS NEEDED AND NONE IS WRITTEN. Two independent reasons, both checked:
--   (a) Every existing row IS an impact determination. There was no axis concept and no writer for
--       one, so 'impact' is not a guess about old data — it is the only thing old data can be.
--   (b) ADD COLUMN with a NOT NULL and a non-volatile DEFAULT fills existing rows in place on
--       PG 11+, with no table rewrite. §1 asserts the column is absent first, so this cannot
--       silently re-default a column somebody already added by hand.
--   Adding a constant column also cannot create a key collision: the old three-column key was
--   unique, so the same three columns plus one constant are still unique. There is no data state
--   this migration can refuse.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260854_materiality_determination_axis.sql
-- Without it psql continues past a failed statement and still exits 0. The Supabase SQL editor
-- stops on error by default. Either way this file is wrapped in begin/commit.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — every step is guarded and
-- §1 refuses a half-applied state rather than compounding it.
--
-- DEPENDS ON 20260838 (determinations), 20260839 (snapshot table + lock trigger),
-- 20260840 and 20260841 (the three ON CONFLICT sites), 20260851 (the two version triggers).

begin;

-- =====================================================================
-- 1. PRE-FLIGHT — refuse a world that is not the one this file assumes
-- =====================================================================
-- ⚠️ A PRIMARY-KEY CHANGE DESERVES WHAT A TRIGGER GOT. 20260851 §1 exists because "a constraint
-- added without checking the existing rows is a constraint that fails at the customer instead of at
-- the install". The same argument applies harder here: this file DROPS constraints. If the shape it
-- expects is not the shape that is there, dropping and recreating would leave the table with keys
-- nobody designed.
--
-- There is no data violation to look for — see the header on why a constant column cannot collide.
-- What IS worth refusing is a half-applied or hand-edited schema.
do $$
declare
  v_det_pk  text;
  v_snap_pk text;
  v_fk      text;
begin
  if to_regclass('public.materiality_impact_determinations') is null
     or to_regclass('public.materiality_impact_assignee_determinations') is null then
    raise exception
      'One of the two tables this migration moves does not exist here, so 20260838/20260839 have '
      'not been applied to this database. Apply them first.';
  end if;

  -- Already applied? Say so and stop, rather than dropping a key that is already correct.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'materiality_impact_determinations'
                and column_name  = 'axis') then
    raise exception
      'materiality_impact_determinations.axis already exists, so this migration has already been '
      'applied here (or the column was added by hand). Nothing has been changed. Verify with §6 '
      'rather than re-running: re-running would drop and recreate keys that are already right.';
  end if;

  select pg_get_constraintdef(c.oid) into v_det_pk
    from pg_constraint c
   where c.conrelid = 'public.materiality_impact_determinations'::regclass and c.contype = 'p';
  select pg_get_constraintdef(c.oid) into v_snap_pk
    from pg_constraint c
   where c.conrelid = 'public.materiality_impact_assignee_determinations'::regclass and c.contype = 'p';
  select pg_get_constraintdef(c.oid) into v_fk
    from pg_constraint c
   where c.conname = 'materiality_impact_assignee_determinations_parent_fkey';

  -- Named, not counted, for the reason 20260851 §1 names assessment ids: a maintainer told "the
  -- shape is wrong" has to go and find it; a maintainer shown the shape can start.
  if v_det_pk is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, direction)' then
    raise exception 'Determination primary key is not the expected three columns. Found: %', coalesce(v_det_pk, '(none)');
  end if;
  if v_snap_pk is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, direction)' then
    raise exception 'Snapshot-table primary key is not the expected three columns. Found: %', coalesce(v_snap_pk, '(none)');
  end if;
  if v_fk is null then
    raise exception
      'materiality_impact_assignee_determinations_parent_fkey is missing, so 20260839 is not fully '
      'applied here. This migration must drop and recreate that FK; it will not invent one.';
  end if;

  raise notice 'Pre-flight: both keys are the expected three columns and the parent FK is present.';
end $$;


-- =====================================================================
-- 2. The column, on both tables
-- =====================================================================
alter table public.materiality_impact_determinations
  add column axis text not null default 'impact'
    constraint materiality_impact_determinations_axis_check
      check (axis in ('impact', 'financial'));

alter table public.materiality_impact_assignee_determinations
  add column axis text not null default 'impact'
    constraint materiality_impact_assignee_determinations_axis_check
      check (axis in ('impact', 'financial'));

-- ⚠️ THE DEFAULT STAYS. It is not scaffolding for the backfill — it is what keeps every existing
-- writer correct. impact_save_determination and impact_save_determination_v2 do not name this
-- column, and after this migration they still do not: they write impact determinations, and the
-- default is how they say so. A financial writer must name the column explicitly, which is the
-- property that makes an accidental financial row impossible rather than merely unlikely.

comment on column public.materiality_impact_determinations.axis is
  'Which materiality axis this determination is on. With direction, gives the four IRO kinds: impact+negative = an adverse impact, impact+positive = a positive impact, financial+negative = a risk, financial+positive = an opportunity. Those four NAMES are customer-facing display and live in TypeScript, not here — same split 20260838 argues for severity. Defaults to ''impact'': every row written before 20260854 is an impact determination, there having been no other kind, and every existing writer omits this column and so continues to say ''impact'' by omission.';


-- =====================================================================
-- 3. The keys — snapshot FK first, then both primary keys
-- =====================================================================
-- ORDER IS FORCED. The snapshot FK references the determination primary key, so the key cannot be
-- dropped while the FK stands. Drop FK -> move both PKs -> recreate FK against the new key.
alter table public.materiality_impact_assignee_determinations
  drop constraint materiality_impact_assignee_determinations_parent_fkey;

alter table public.materiality_impact_determinations
  drop constraint materiality_impact_determinations_pkey;
alter table public.materiality_impact_determinations
  add  constraint materiality_impact_determinations_pkey
       primary key (assessment_id, subtopic_code, axis, direction);

alter table public.materiality_impact_assignee_determinations
  drop constraint materiality_impact_assignee_determinations_pkey;
alter table public.materiality_impact_assignee_determinations
  add  constraint materiality_impact_assignee_determinations_pkey
       primary key (assessment_id, subtopic_code, axis, direction);

-- ⚠️ COLUMN ORDER IS (…, axis, direction), NOT (…, direction, axis). The leading three columns stay
-- as they were, so every existing index prefix and every query filtering on
-- (assessment_id, subtopic_code) is served exactly as before. Putting axis last would have been
-- equally correct for uniqueness and would have made "all rows for this sub-topic on this axis" an
-- unindexed scan.
alter table public.materiality_impact_assignee_determinations
  add constraint materiality_impact_assignee_determinations_parent_fkey
      foreign key (assessment_id, subtopic_code, axis, direction)
      references public.materiality_impact_determinations
                (assessment_id, subtopic_code, axis, direction) on delete cascade;


-- =====================================================================
-- 4. The three ON CONFLICT targets — INLINED VERBATIM, TARGET ONLY CHANGED
-- =====================================================================
-- ⚠️ THESE DO NOT FAIL AT INSTALL, AND THAT IS WHY §6 GREPS FOR THEM. PL/pgSQL validates only the
-- SYNTAX of a function body at CREATE time; the SQL inside is planned at first execution. A stale
-- three-column ON CONFLICT therefore survives CREATE OR REPLACE without complaint and raises 42P10
-- — "there is no unique or exclusion constraint matching the ON CONFLICT specification" — at the
-- first call. Loud, never silent, but LATE, and to three different people:
--     impact_save_determination (12 args)  -> the first contributor to save anything. LIVE PATH:
--                                             app/impact/[token]/page.tsx:209 calls this overload.
--     impact_save_determination (10 args)  -> nothing calls it today (the client sends
--                                             p_abstained_dimensions and p_rationale, so it
--                                             resolves to the 12-arg overload). Fixed anyway: an
--                                             installed, callable function that raises 42P10 is a
--                                             trap for the next caller, not dead weight.
--     materiality_impact_determination_lock -> the first LEAD OVERRIDE, rarest of the three, and a
--                                             different person from the other two.
-- So the check belongs in this file rather than in the hands of whoever meets it first.
--
-- ⚠️ THE THIRD TARGET IS ON A DIFFERENT TABLE. The lock trigger inserts into
-- materiality_impact_assignee_determinations, not into the determination table — which is why §2
-- and §3 had to move that table too.
--
-- ⚠️⚠️ THIS IS A FORK, AND IT IS RECORDED IN BOTH DIRECTIONS.
-- The three bodies below were COPIED VERBATIM from their source migrations and ONE LINE was changed
-- in each — the ON CONFLICT target, three columns to four. Nothing else differs, not a comment, not
-- whitespace. A note has been added to the head of each source file saying its function is
-- superseded here. If you edit a function in 20260840 or 20260841 you are editing a version that is
-- no longer installed; edit this file, or supersede it in turn and record that too.
--   SOURCES:  impact_save_determination(10 args)   20260840_impact_token_rpcs.sql:305-419
--             materiality_impact_determination_lock 20260841_abstention_and_rationale.sql:170-252
--             impact_save_determination(12 args)   20260841_abstention_and_rationale.sql:360-490
--
-- Their COMMENT ON FUNCTION statements are NOT reproduced: those are already applied and unchanged
-- by this file, and re-issuing them would be a second place to keep the prose in step. Each gains
-- one appended sentence at the foot of this section instead.

-- ── 4a · impact_save_determination, 10 args — 20260840:305-419 ──────────────────────────────
create or replace function public.impact_save_determination(
  p_token                uuid,
  p_subtopic_code        text,
  p_direction            text,
  p_nature               text,
  p_scale                smallint,
  p_scope                smallint,
  p_irremediability      smallint,
  p_likelihood           smallint,
  p_value_chain_position text[],
  p_time_horizon         text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v_existing      text;
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  if p_direction is null or p_direction not in ('negative', 'positive') then
    raise exception
      'direction must be negative or positive. Every sub-topic is determined both ways and the two '
      'are never netted against each other (ESRS 1 para 44).';
  end if;

  if p_nature is not null and p_nature not in ('actual', 'potential') then
    raise exception 'nature must be actual or potential, or null while the answer is unfinished.';
  end if;

  -- §5.3: four points on every dimension. Null is "not enough visibility" (§6.1) and is allowed;
  -- anything outside 1-4 is a bug, and clamping it would fabricate a compliance figure.
  if p_scale           is not null and p_scale           not between 1 and 4
  or p_scope           is not null and p_scope           not between 1 and 4
  or p_irremediability is not null and p_irremediability not between 1 and 4
  or p_likelihood      is not null and p_likelihood      not between 1 and 4 then
    raise exception
      'Severity dimensions are scored 1-4 (spec §5.3), or left null for "not enough visibility to '
      'assess" (§6.1). A value outside that range cannot be stored.';
  end if;

  -- ⚠️ ¶41, REFUSED RATHER THAN SILENTLY DROPPED. The constraints are the guarantee; these two
  -- raises exist so the refusal arrives as a sentence instead of a check_violation. See the header.
  if p_direction = 'positive' and p_irremediability is not null then
    raise exception
      'A positive impact carries no irremediability — there is nothing to remediate (ESRS 1 para '
      '41). Your answer was not saved rather than being quietly dropped; remove it and save again.';
  end if;

  if p_nature = 'actual' and p_likelihood is not null then
    raise exception
      'An impact that is already happening carries no likelihood (ESRS 1 para 41). Applying one to '
      'an actual impact understates its severity. Your answer was not saved rather than being '
      'quietly dropped; remove it and save again.';
  end if;

  -- The sub-topic must be assigned to THIS contributor. Not to this assessment — to this assignment.
  if not exists (
    select 1 from public.materiality_impact_assignment_subtopics s
     where s.assignment_id = v_assignment_id
       and s.subtopic_code = p_subtopic_code) then
    raise exception
      'That sub-topic is not part of your assignment. Reload the page — it may have been reassigned.'
      using errcode = 'no_data_found';
  end if;

  -- A submitted determination is not writable from here at all. resolve_token already refuses a
  -- submitted ASSIGNMENT, so this covers the narrower case of a single row left submitted by some
  -- other path, and it refuses with a sentence rather than leaving 20260839's lock to raise.
  select d.status into v_existing
    from public.materiality_impact_determinations d
   where d.assessment_id = v_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;

  if v_existing = 'submitted' then
    raise exception
      'This determination has already been submitted and cannot be changed here.'
      using errcode = 'PT410';
  end if;

  insert into public.materiality_impact_determinations (
    assessment_id, user_id, subtopic_code, standard_version, direction,
    nature, scale, scope, irremediability, likelihood,
    value_chain_position, time_horizon,
    -- ⚠️ ALWAYS FALSE ON THIS PATH, AND THE CONSTRAINT AGREES. Contributors do not see the survey
    -- evidence, so a determination made here cannot claim it was in view.
    evidence_in_view, assignment_id, status)
  values (
    v_assessment_id, v_user_id, p_subtopic_code, v_version, p_direction,
    p_nature, p_scale, p_scope, p_irremediability, p_likelihood,
    coalesce(p_value_chain_position, '{}'::text[]), p_time_horizon,
    false, v_assignment_id, 'draft')
  on conflict (assessment_id, subtopic_code, axis, direction) do update
     set nature               = excluded.nature,
         scale                = excluded.scale,
         scope                = excluded.scope,
         irremediability      = excluded.irremediability,
         likelihood           = excluded.likelihood,
         value_chain_position = excluded.value_chain_position,
         time_horizon         = excluded.time_horizon,
         assignment_id        = excluded.assignment_id,
         evidence_in_view     = false;
end $$;

-- ── 4b · materiality_impact_determination_lock — 20260841:170-252 ──────────────────────────
create or replace function public.materiality_impact_determination_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if TG_OP = 'INSERT' then
    if NEW.overridden_at is not null then
      raise exception 'A determination cannot be created as already overridden.'
        using errcode = 'check_violation';
    end if;
    return NEW;
  end if;

  if OLD.status <> 'submitted' or OLD.assignment_id is null then
    NEW.overridden_at   := OLD.overridden_at;
    NEW.override_reason := OLD.override_reason;
    return NEW;
  end if;

  if NEW.status <> 'submitted' then
    raise exception
      'This determination was submitted by a contributor and cannot be returned to draft. Change '
      'the values directly, giving a reason — the contributor''s determination is kept and both '
      'appear in the report.'
      using errcode = 'check_violation';
  end if;

  if NEW.assignment_id is distinct from OLD.assignment_id then
    raise exception
      'A submitted determination stays attributed to the contributor who made it. Reassignment '
      'moves sub-topics that are not yet submitted; use materiality_impact_reassign_subtopic().'
      using errcode = 'check_violation';
  end if;

  v_changed :=
       NEW.nature               is distinct from OLD.nature
    or NEW.scale                is distinct from OLD.scale
    or NEW.scope                is distinct from OLD.scope
    or NEW.irremediability      is distinct from OLD.irremediability
    or NEW.likelihood           is distinct from OLD.likelihood
    -- ⚠️ ADDED 20260841, AND ITS ABSENCE WAS A HOLE. Turning an expert's recorded "I could not
    -- judge this" into a lead-supplied null — or clearing the abstention so the blank reads as
    -- unanswered — changes what the report says the contributor concluded. Without this comparison
    -- it required no reason and left no trace.
    or NEW.abstained_dimensions is distinct from OLD.abstained_dimensions
    or NEW.value_chain_position is distinct from OLD.value_chain_position
    or NEW.time_horizon         is distinct from OLD.time_horizon
    or NEW.rationale            is distinct from OLD.rationale;

  if not v_changed then
    NEW.overridden_at := OLD.overridden_at;
    return NEW;
  end if;

  if NEW.override_reason is null or length(btrim(NEW.override_reason)) = 0 then
    raise exception
      'Changing a contributor''s submitted determination requires a reason. It is recorded with '
      'the change and shown in the report beside what the contributor determined.'
      using errcode = 'check_violation';
  end if;

  insert into public.materiality_impact_assignee_determinations (
    assessment_id, subtopic_code, direction, user_id, assignment_id,
    nature, scale, scope, irremediability, likelihood,
    -- ⚠️ WITHOUT THIS, AN OVERRIDDEN ABSTENTION BECOMES A BLANK. The report would then show the
    -- lead's score beside an empty cell, implying the expert had no view — when they had explicitly
    -- recorded that they could not judge it. That is the worst misreading this table can produce.
    abstained_dimensions,
    value_chain_position, time_horizon, rationale, determined_at)
  values (
    OLD.assessment_id, OLD.subtopic_code, OLD.direction, OLD.user_id, OLD.assignment_id,
    OLD.nature, OLD.scale, OLD.scope, OLD.irremediability, OLD.likelihood,
    OLD.abstained_dimensions,
    OLD.value_chain_position, OLD.time_horizon, OLD.rationale, OLD.determined_at)
  on conflict (assessment_id, subtopic_code, axis, direction) do nothing;

  NEW.overridden_at := now();
  return NEW;
end $$;

-- ── 4c · impact_save_determination, 12 args — 20260841:360-490 ─────────────────────────────
create or replace function public.impact_save_determination(
  p_token                uuid,
  p_subtopic_code        text,
  p_direction            text,
  p_nature               text,
  p_scale                smallint,
  p_scope                smallint,
  p_irremediability      smallint,
  p_likelihood           smallint,
  p_abstained_dimensions text[],
  p_value_chain_position text[],
  p_time_horizon         text,
  p_rationale            text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment_id uuid;
  v_assessment_id uuid;
  v_user_id       uuid;
  v_company       text;
  v_version       text;
  v_name          text;
  v_role          text;
  v_expires       timestamptz;
  v_existing      text;
  v_abst          text[];
begin
  select * into v_assignment_id, v_assessment_id, v_user_id, v_company, v_version,
                v_name, v_role, v_expires
    from public.materiality_impact_resolve_token(p_token);

  if p_direction is null or p_direction not in ('negative', 'positive') then
    raise exception
      'direction must be negative or positive. Every sub-topic is determined both ways and the two '
      'are never netted against each other (ESRS 1 para 44).';
  end if;

  if p_nature is not null and p_nature not in ('actual', 'potential') then
    raise exception 'nature must be actual or potential, or null while the answer is unfinished.';
  end if;

  if p_scale           is not null and p_scale           not between 1 and 4
  or p_scope           is not null and p_scope           not between 1 and 4
  or p_irremediability is not null and p_irremediability not between 1 and 4
  or p_likelihood      is not null and p_likelihood      not between 1 and 4 then
    raise exception
      'Severity dimensions are scored 1-4 (spec §5.3), or recorded as "not enough visibility to '
      'assess" (§6.1). A value outside that range cannot be stored.';
  end if;

  v_abst := coalesce(p_abstained_dimensions, '{}'::text[]);

  if not (v_abst <@ array['scale', 'scope', 'irremediability', 'likelihood']::text[]) then
    raise exception
      'abstained_dimensions may name only scale, scope, irremediability or likelihood.';
  end if;

  -- ⚠️ REFUSED, NOT RECONCILED. If a dimension arrives with both a score and an abstention, the two
  -- contradict and there is no correct one to keep. Dropping either would be this module choosing
  -- what the determiner meant — see the ¶41 refusals below, same principle.
  if ('scale'           = any(v_abst) and p_scale           is not null)
  or ('scope'           = any(v_abst) and p_scope           is not null)
  or ('irremediability' = any(v_abst) and p_irremediability is not null)
  or ('likelihood'      = any(v_abst) and p_likelihood      is not null) then
    raise exception
      'A dimension cannot be both scored and recorded as "not enough visibility to assess". '
      'Nothing was saved — send one or the other.';
  end if;

  -- ⚠️ ¶41, REFUSED RATHER THAN SILENTLY DROPPED — for the abstention as well as for the value. A
  -- dimension that is never asked cannot be abstained on: there is no question to decline.
  if p_direction = 'positive' and (p_irremediability is not null or 'irremediability' = any(v_abst)) then
    raise exception
      'A positive impact carries no irremediability — there is nothing to remediate (ESRS 1 para '
      '41). Your answer was not saved rather than being quietly dropped; remove it and save again.';
  end if;

  if p_nature = 'actual' and (p_likelihood is not null or 'likelihood' = any(v_abst)) then
    raise exception
      'An impact that is already happening carries no likelihood (ESRS 1 para 41). Applying one to '
      'an actual impact understates its severity. Your answer was not saved rather than being '
      'quietly dropped; remove it and save again.';
  end if;

  if not exists (
    select 1 from public.materiality_impact_assignment_subtopics s
     where s.assignment_id = v_assignment_id
       and s.subtopic_code = p_subtopic_code) then
    raise exception
      'That sub-topic is not part of your assignment. Reload the page — it may have been reassigned.'
      using errcode = 'no_data_found';
  end if;

  select d.status into v_existing
    from public.materiality_impact_determinations d
   where d.assessment_id = v_assessment_id
     and d.subtopic_code = p_subtopic_code
     and d.direction     = p_direction;

  if v_existing = 'submitted' then
    raise exception
      'This determination has already been submitted and cannot be changed here.'
      using errcode = 'PT410';
  end if;

  insert into public.materiality_impact_determinations (
    assessment_id, user_id, subtopic_code, standard_version, direction,
    nature, scale, scope, irremediability, likelihood,
    abstained_dimensions, value_chain_position, time_horizon, rationale,
    evidence_in_view, assignment_id, status)
  values (
    v_assessment_id, v_user_id, p_subtopic_code, v_version, p_direction,
    p_nature, p_scale, p_scope, p_irremediability, p_likelihood,
    v_abst, coalesce(p_value_chain_position, '{}'::text[]), p_time_horizon, p_rationale,
    false, v_assignment_id, 'draft')
  on conflict (assessment_id, subtopic_code, axis, direction) do update
     set nature               = excluded.nature,
         scale                = excluded.scale,
         scope                = excluded.scope,
         irremediability      = excluded.irremediability,
         likelihood           = excluded.likelihood,
         abstained_dimensions = excluded.abstained_dimensions,
         value_chain_position = excluded.value_chain_position,
         time_horizon         = excluded.time_horizon,
         rationale            = excluded.rationale,
         assignment_id        = excluded.assignment_id,
         evidence_in_view     = false;
end $$;

-- The fork, recorded on the functions themselves. Appended rather than rewritten: the original
-- sentences are still true and still the best description of what each does.
comment on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text) is
  'Saves ONE sub-topic in ONE direction as a draft. ⚠️ HAS NO override_reason PARAMETER, AND MUST NEVER GAIN ONE — its absence is what makes 20260839''s lock fail closed on a post-submit contributor write, with no role introspection anywhere. Refuses rather than silently dropping a value the ESRS 1 para 41 constraints forbid: an irremediability on a positive impact and a likelihood on an actual one are both rejected with a sentence, because a form that appears to accept a judgement and discards it is worse than one that says no. evidence_in_view is written false unconditionally. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose ON CONFLICT names four columns. Nothing calls this overload today — the client sends p_abstained_dimensions and p_rationale and so resolves to the 12-argument version.';

comment on function public.impact_save_determination(uuid, text, text, text, smallint, smallint, smallint, smallint, text[], text[], text, text) is
  'Saves ONE sub-topic in ONE direction as a draft, carrying abstained dimensions and a free-text rationale. THIS is the overload app/impact/[token]/page.tsx calls. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose ON CONFLICT names four columns. Edit it there.';

comment on function public.materiality_impact_determination_lock() is
  'Refuses a post-submit write to a delegated determination unless the lead supplies an override reason, and snapshots the contributor''s row into materiality_impact_assignee_determinations before the override lands. ⚠️ SUPERSEDED BY 20260854: the installed body is the copy in that migration, whose snapshot ON CONFLICT names four columns — the snapshot table gained axis in the same file, because its primary key and its parent foreign key both reference the determination key.';


-- =====================================================================
-- 5. materiality_lead_submit — scope its rule to the axis it means
-- =====================================================================
-- ⚠️ THIS CHANGES NOTHING TODAY AND PREVENTS A FALSE ALL-CLEAR TOMORROW. The completeness rule
-- cross-joins held sub-topics against ('negative','positive') and left-joins the determination
-- table. Until now that join could not be wrong, there being one axis. The moment a financial row
-- exists, a financial determination would satisfy the impact requirement and the lead would be told
-- the worksheet is complete with the impact axis unfinished — a silent pass, in the direction that
-- costs a customer rather than annoys them. The UPDATE that flips drafts to submitted has the same
-- gap: unfiltered, it would submit financial drafts as part of an impact submission.
--
-- ⚠️ DELIBERATELY NARROW, NOT INCOMPLETE. Widening this to enumerate scope x AXIS x direction
-- belongs with whatever first makes the financial axis reachable — an RPC that writes
-- axis='financial' — because only that change knows whether the financial axis is in the lead's
-- scope, delegated, or optional. Two predicates here say "this rule is about the impact axis",
-- which is what it has always meant. Do not read the narrowness as an oversight to widen casually.
--
-- Copied verbatim from 20260844:17-162 with TWO predicates added, both marked below.

CREATE OR REPLACE FUNCTION public.materiality_lead_submit(p_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id     uuid;
  v_version     text;
  v_linked      boolean;
  v_scope_codes text[];
  v_held_codes  text[];
  v_missing     text;
  v_rows        int;
begin
  select a.user_id, a.standard_version
    into v_user_id, v_version
    from public.materiality_assessments a
   where a.id = p_assessment_id
     and a.user_id = auth.uid();

  if v_user_id is null then
    raise exception
      'No assessment with that reference is open to you. It may not exist, or it may belong to '
      'another account — those two are deliberately not told apart, because saying which would '
      'confirm whose work is stored under it.';
  end if;

  select exists (
    select 1 from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id)
    into v_linked;

  -- ⚠️ NOT STATED IS A REAL STATE (20260816), never an assumed version. With no round linked there
  -- is nothing else to draw scope from, so this is a refusal rather than a default.
  if not v_linked and v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, and no survey round '
      'is linked to it, so there is no list of sub-topics to check against. Article 2(2) of Del. '
      'Reg. C(2026) 5010 requires the undertaking to state the version, and assuming one would be a '
      'false statement about which law was applied. State the version on the assessment first.';
  end if;

  -- Scope once, and what the lead holds within it. ⚠️ ONE PASS, kept in arrays, because the same
  -- set decides the completeness check AND which rows the UPDATE may touch — computing it twice
  -- would let the two drift apart within a single call.
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  ),
  scope as (
    select q.subtopic_code
      from public.materiality_survey_questions q
      join linked l on l.round_id = q.round_id
     where q.status = 'included'
       and q.subtopic_code is not null
    union
    select s.code
      from public.mr_esrs_subtopics s
     where s.standard_version = v_version
       and not exists (select 1 from linked)
  ),
  held as (
    select sc.subtopic_code
      from scope sc
     where not exists (
       select 1
         from public.materiality_impact_assignment_subtopics a
        where a.assessment_id = p_assessment_id
          and a.subtopic_code = sc.subtopic_code)
  )
  select (select array_agg(sc.subtopic_code order by sc.subtopic_code) from scope sc),
         (select array_agg(h.subtopic_code  order by h.subtopic_code)  from held  h)
    into v_scope_codes, v_held_codes;

  if coalesce(array_length(v_scope_codes, 1), 0) = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to submit. Either the linked '
      'survey round has no included questions, or no sub-topics are recorded for its standard '
      'version.';
  end if;

  if coalesce(array_length(v_held_codes, 1), 0) = 0 then
    raise exception
      'Every one of the % sub-topics in scope is assigned to a contributor, so none of them is '
      'yours to submit. Each is submitted by the person holding it, from their own link.',
      array_length(v_scope_codes, 1);
  end if;

  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every sub-topic the lead holds must carry BOTH directions with a nature. The dimensions may
  -- all be null. Refusing here rather than at the constraint means the lead is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  select string_agg(m.subtopic_code || ' (' || m.direction || ')', ', '
                    order by m.subtopic_code, m.direction)
    into v_missing
    from (
      select c.subtopic_code, dir.direction
        from unnest(v_held_codes) as c(subtopic_code)
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_impact_determinations d
          on d.assessment_id = p_assessment_id
         and d.subtopic_code = c.subtopic_code
         and d.direction     = dir.direction
         and d.axis          = 'impact'
       where d.assessment_id is null or d.nature is null
    ) m;

  if v_missing is not null then
    raise exception
      'These are not finished yet: %. Each sub-topic is determined twice — once for harm and once '
      'for benefit — and each needs to say whether it is already happening or might happen. The '
      'severity questions themselves can be left as "not enough visibility to assess".', v_missing;
  end if;

  -- ⚠️ RESTRICTED TO WHAT THE LEAD HOLDS, not merely to assignment_id is null. THE TWO ARE NOT THE
  -- SAME SET, and the subtopic_code line below is NOT redundant tidying: a sub-topic the lead
  -- started and then DELEGATED leaves a row with assignment_id null on a sub-topic that is now
  -- somebody else's. Such a row sits outside the completeness check above, which walks held
  -- sub-topics only — so without the restriction a half-finished row with no nature would be
  -- flipped to submitted and hit materiality_impact_determinations_submitted_is_complete,
  -- producing exactly the check_violation naming a column that the named-missing list exists to
  -- prevent. Deleting the line puts that back.
  update public.materiality_impact_determinations d
     set status        = 'submitted',
         determined_at = now()
   where d.assessment_id = p_assessment_id
     and d.assignment_id is null
     and d.subtopic_code = any(v_held_codes)
     and d.axis = 'impact'
     and d.status = 'draft';

  get diagnostics v_rows = row_count;

  -- Checked, not assumed: an UPDATE matching no row raises nothing and returns nothing. Here zero
  -- can mean only ONE thing — every held determination was already submitted — because the
  -- completeness check above has just proved a row exists for both directions of every held
  -- sub-topic. The ambiguity is designed out rather than documented, so a caller reading
  -- {"submitted": 0} knows it was a repeat call and not a silent failure.
  return jsonb_build_object('submitted', v_rows);
end $function$;


-- =====================================================================
-- 5b. PT409's message — name the axis
-- =====================================================================
-- ⚠️ THE MESSAGE STOPPED IDENTIFYING ONE ROW. It named subtopic_code and direction, which were the
-- key's discriminators until this migration. With two axes the same pair exists twice, so the
-- message would send a maintainer to either of two rows. The TRIGGER needs no other change: it
-- compares NEW.standard_version against the parent's and reads nothing else. Copied verbatim from
-- 20260851:107-149 with the format string and its arguments widened by one.
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
      'Determination %/%/% carries standard_version %, but assessment % states %. A determination '
      'must be keyed to the version its assessment is prepared under: the two are joined by nothing '
      'but this trigger, and ESRS (2026) renumbered the disclosure requirements, so 49 codes exist '
      'under both versions with different titles. Not saved.',
      NEW.subtopic_code, NEW.axis, NEW.direction, NEW.standard_version,
      NEW.assessment_id, coalesce(v_parent, '(none stated)')
      using errcode = 'PT409';
  end if;

  return NEW;
end $$;

-- =====================================================================
-- 5c. The misnomer, recorded where it will be read
-- =====================================================================
comment on table public.materiality_impact_determinations is
  'Recorded determinations on BOTH materiality axes, despite the name. The table was created (20260838) when only the impact axis existed and was named after it; 20260854 added the axis column rather than renaming the table, because a rename would break every foreign key, RPC, policy and client read for a cosmetic gain. READ THE NAME AS HISTORICAL: axis=''financial'' rows are risks and opportunities, not impacts. materiality_impact_assignee_determinations, materiality_impact_assignments and materiality_impact_assignment_subtopics carry the same historical prefix and mean the same thing.';

comment on table public.materiality_impact_assignee_determinations is
  'Pre-override snapshot of a contributor''s determination, on either axis. Same misnomer as its parent and for the same reason — see the comment on materiality_impact_determinations. Its primary key and its parent foreign key both gained axis in 20260854; they must stay in step with the parent primary key, which is what forced this table into that migration at all.';


-- =====================================================================
-- 6. Verification
-- =====================================================================
-- ⚠️ WHAT THIS BLOCK EXISTS FOR, AND IT IS NOT CEREMONY. Two of this migration's failure modes are
-- SILENT AT INSTALL:
--   (a) a missed ON CONFLICT target — PL/pgSQL does not plan a function body at CREATE time, so a
--       stale three-column target installs cleanly and raises 42P10 at the first customer save;
--   (b) a key or FK left at three columns by a partially-run file.
-- Neither would be caught by "the migration completed without error". So this block reads the
-- INSTALLED definitions back out of the catalogue and refuses if they are not what §3 and §4 say.
-- It asserts SHAPE, not behaviour: it does not exercise a save, because that needs a real
-- assessment and a real auth.users row, and fixtures built inside a migration are a worse risk than
-- the gap. The hand tests at the foot of this file exercise the live paths.
do $$
declare
  v_def   text;
  v_names text[];
  v_mine  int;
  v_lock  int;
  v_fn    text;
  v_stale text[] := '{}';
begin
  -- ── 6.1 the column, on both tables, with its domain ──────────────────────────────────────────
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='materiality_impact_determinations'
                    and column_name='axis' and is_nullable='NO') then
    raise exception 'materiality_impact_determinations.axis is missing or nullable.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='materiality_impact_assignee_determinations'
                    and column_name='axis' and is_nullable='NO') then
    raise exception 'materiality_impact_assignee_determinations.axis is missing or nullable.';
  end if;
  -- The CHECK is what stops a third axis appearing by typo. Asserted by name, so a rename is caught.
  if not exists (select 1 from pg_constraint
                  where conname='materiality_impact_determinations_axis_check') then
    raise exception 'The axis CHECK on the determination table is missing — a typo could introduce a third axis silently.';
  end if;
  if not exists (select 1 from pg_constraint
                  where conname='materiality_impact_assignee_determinations_axis_check') then
    raise exception 'The axis CHECK on the snapshot table is missing.';
  end if;

  -- ── 6.2 both primary keys are the four columns, IN ORDER ─────────────────────────────────────
  -- Order is asserted, not just membership: §3 argues (…, axis, direction) so that the leading
  -- three columns still serve every existing index prefix. A key with the same four columns in a
  -- different order satisfies uniqueness and quietly loses that.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='public.materiality_impact_determinations'::regclass and c.contype='p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction)' then
    raise exception 'Determination primary key is not the expected four columns in order. Found: %', coalesce(v_def,'(none)');
  end if;

  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='public.materiality_impact_assignee_determinations'::regclass and c.contype='p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction)' then
    raise exception 'Snapshot primary key is not the expected four columns in order. Found: %', coalesce(v_def,'(none)');
  end if;

  -- ── 6.3 the recreated parent FK is four columns and still cascades ───────────────────────────
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conname='materiality_impact_assignee_determinations_parent_fkey';
  if v_def is null then
    raise exception 'The snapshot parent FK was dropped in §3 and not recreated. The snapshot table is now unbound from its parent.';
  end if;
  if position('axis' in v_def) = 0 then
    raise exception 'The snapshot parent FK does not name axis: %', v_def;
  end if;
  -- ON DELETE CASCADE is load-bearing: a determination''s snapshot must not outlive it.
  if position('ON DELETE CASCADE' in v_def) = 0 then
    raise exception 'The snapshot parent FK lost ON DELETE CASCADE: %', v_def;
  end if;

  -- ── 6.4 NO SURVIVING THREE-COLUMN ON CONFLICT, in any of the three ───────────────────────────
  -- This is the check the database cannot make for itself. Reads each installed body back and looks
  -- for the old target. Collects ALL offenders before raising, for the reason 20260844 names
  -- outstanding sub-topics rather than counting them: fixing one and rediscovering the next is two
  -- round trips.
  for v_fn in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('impact_save_determination', 'materiality_impact_determination_lock')
  loop
    if position('on conflict (assessment_id, subtopic_code, direction)' in pg_get_functiondef(v_fn::regprocedure)) > 0 then
      v_stale := v_stale || v_fn;
    end if;
  end loop;
  if array_length(v_stale, 1) > 0 then
    raise exception
      'These installed function(s) still carry the three-column ON CONFLICT target and would raise '
      'SQLSTATE 42P10 at their first call, not here: %. PL/pgSQL does not plan a function body at '
      'CREATE time, which is why this had to be checked rather than trusted.',
      array_to_string(v_stale, ', ');
  end if;

  -- Both overloads must actually be present — a signature typo in §4 would create a THIRD overload
  -- and leave the original untouched, which 6.4 above would not notice.
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='impact_save_determination') <> 2 then
    raise exception
      'Expected exactly two impact_save_determination overloads (10 args and 12). A different count '
      'means §4 created a new signature rather than replacing an existing one.';
  end if;

  -- ── 6.5 the 20260851 triggers survived, and their firing order with them ─────────────────────
  -- Dropping and recreating a primary key does not drop triggers, but this file rewrites one of the
  -- two functions those triggers order against, and 20260851 §4 exists because a rename breaks that
  -- order silently. Re-asserted here rather than assumed.
  select array_agg(t.tgname order by t.tgname) into v_names
    from pg_trigger t
   where t.tgrelid='public.materiality_impact_determinations'::regclass and not t.tgisinternal;
  v_mine := array_position(v_names,'materiality_impact_determination_assessment_version_trg');
  v_lock := array_position(v_names,'materiality_impact_determination_lock_trg');
  if v_mine is null or v_lock is null then
    raise exception 'A 20260839/20260851 trigger is missing after this migration: %', v_names;
  end if;
  if v_mine > v_lock then
    raise exception 'Firing order inverted: % now runs after %.', v_names[v_mine], v_names[v_lock];
  end if;

  -- ── 6.6 lead_submit is scoped ────────────────────────────────────────────────────────────────
  if position('d.axis          = ''impact''' in pg_get_functiondef('public.materiality_lead_submit(uuid)'::regprocedure)) = 0 then
    raise exception 'materiality_lead_submit did not receive its axis predicate; §5 did not apply.';
  end if;

  raise notice 'Verified: axis on both tables, both keys four columns in order, parent FK rebuilt with cascade, no stale conflict target, trigger order intact, lead_submit scoped.';
end $$;

commit;

-- =====================================================================
-- HOW TO EXERCISE THIS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- (a) The new key admits both axes for one sub-topic and direction. Rolled back; proves the PK
--     change did what it was for. Substitute a real assessment id and one of its sub-topic codes.
--   begin;
--     insert into public.materiality_impact_determinations
--       (assessment_id, subtopic_code, standard_version, axis, direction, nature, status)
--     select assessment_id, subtopic_code, standard_version, 'financial', direction, nature, 'draft'
--       from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' limit 1;
--   rollback;
--   EXPECT: INSERT 0 1. Before 20260854 this was a unique violation.
--
-- (b) The default still applies to every existing writer. Rolled back.
--   begin;
--     select impact_save_determination('<token-uuid>', '<subtopic>', 'negative', 'actual',
--            null, null, null, null, '{}'::text[], '{}'::text[], 'short', null);
--     select axis from public.materiality_impact_determinations
--      where subtopic_code = '<subtopic>' and direction = 'negative';
--   rollback;
--   EXPECT: axis = 'impact'. If this raises 42P10, §4 missed the 12-argument overload — which is
--   the live path, so this is the single most important of these three.
--
-- (c) PT409 still refuses, and now names the axis:
--   begin;
--     update public.materiality_impact_determinations
--        set standard_version = case standard_version
--              when 'esrs_2026' then 'esrs_2023' else 'esrs_2026' end
--      where assessment_id = '<assessment-uuid>';
--   rollback;
--   EXPECT: ERROR, SQLSTATE PT409, message of the form "Determination <code>/<axis>/<direction>
--   carries standard_version ...". If the axis is absent the §5b copy did not take.
