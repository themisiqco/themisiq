-- supabase/migrations/20260855_custom_iros.sql
-- A determination gains an IRO KEY, and the primary keys gain a fifth column.
--
-- WHY. Until now the unit of determination was the ESRS sub-topic itself: one row per
-- (assessment, sub-topic, axis, direction), and nothing smaller could be named. A company whose
-- real exposure is "water scarcity at the Valencia plant" had to record it as E3 water in general,
-- which is both less true and less useful — the determination that reaches a verifier says less
-- than the preparer knows.
--
-- THE PRODUCT DECISION, MADE BEFORE THIS FILE WAS WRITTEN, AND THE WHOLE SHAPE FOLLOWS FROM IT:
-- A CUSTOM IRO ALWAYS SITS UNDER AN ESRS SUB-TOPIC. It is never taxonomy-free. "Water scarcity at
-- the Valencia plant" is an E3 IRO the company has named specifically, and it carries E3's code.
-- That is what keeps the disclosure roadmap working — the sub-topic is material, so its
-- requirements trigger — and it is why the taxonomy foreign key below survives this migration
-- COMPLETELY UNTOUCHED. Read that as the load-bearing consequence of the decision, not as luck:
-- a taxonomy-free IRO would have forced subtopic_code to become nullable, and a nullable column in
-- a MATCH SIMPLE foreign key is satisfied WITHOUT A LOOKUP. The reference would have become
-- decorative while still looking like a constraint.
--
-- =====================================================================
-- ⚠️ iro_key = '' IS NOT A SENTINEL FOR "MISSING". IT IS A VALUE WITH A MEANING.
-- =====================================================================
-- Every determination is about an IRO. The sub-topic taken as a whole IS an IRO — the default one —
-- and '' is its name. A non-empty iro_key names a sibling the company added under the same
-- sub-topic. Nothing is absent; there is no "unknown" state and no NULL anywhere in the key.
--
-- That was not a stylistic choice. A primary-key column is implicitly NOT NULL, so a nullable
-- discriminator cannot join the key at all, and the three ways around that are all worse:
--   (a) NULLABLE iro_id + PARTIAL UNIQUE INDEXES. A foreign key cannot reference a partial unique
--       index, so materiality_impact_assignee_determinations — the pre-override snapshot, the row
--       that exists to be evidence — loses its parent FK outright.
--   (b) NULLABLE iro_id + UNIQUE NULLS NOT DISTINCT. Legal, and an FK can reference it. But the
--       snapshot's FK columns then hold a NULL for every ordinary sub-topic row, and MATCH SIMPLE
--       skips the check whenever any FK column is NULL. Integrity on the COMMON path traded away
--       to avoid a sentinel on the rare one.
--   (c) A SEPARATE determinations table for custom IROs. No key change — and then lead_submit, the
--       divergence register, the lock trigger, both impact_save_determination overloads, all four
--       finalise functions and the snapshot each need a twin or a union. Four tables where there
--       are two, and 20260854's axis work duplicated into the copy.
-- The text form is the only one where EVERY KEY COLUMN IS NON-NULL, the snapshot FK moves 4->5
-- mechanically exactly as 20260854 moved it 3->4, and the taxonomy FK is not touched.
--
-- ⚠️ AND HERE IS WHAT IT COSTS, SAID PLAINLY BECAUSE IT WILL BE PAID BY WHOEVER READS THIS NEXT.
-- Every query that means "the sub-topic as a whole" must now say `iro_key = ''`. A forgotten
-- predicate does not error — it silently returns the custom IROs alongside the sub-topic row and
-- doubles a count. That is the mr_jurisdictions.active failure class from CLAUDE.md: a filter
-- everyone must remember, that is a no-op when omitted and looks like nothing is wrong.
-- §6 answers this STRUCTURALLY rather than with a comment: a view that pins the predicate, which
-- the eight client read sites in §11 are to be pointed at. A rule you cannot forget beats a rule
-- you are told twice.
--
-- =====================================================================
-- WHAT IS AND IS NOT IN THIS MIGRATION
-- =====================================================================
-- IN:  the column, the custom-IRO table, both primary keys, the snapshot FK, an existence trigger,
--      the view, three ON CONFLICT targets, the PT409 message, and EVERY SCOPE ENUMERATION.
-- OUT: contributor-created IROs. 1b is LEAD-ONLY by decision. A contributor naming an IRO changes
--      the scope the lead believed they had handed over, with neither party seeing the other —
--      that is a product-design question, not a schema one. materiality_impact_assignment_subtopics
--      is NOT TOUCHED by this file and needs no change when 1c arrives: assignment is sub-topic
--      granular, so a custom IRO is delegated WITH its parent and never apart from it. Assigning
--      one independently would break the one-assignee rule at 20260838:379, which exists precisely
--      so two people cannot determine overlapping things.
-- OUT: the roll-up itself. "Material if its own row is material OR any child is" is a DISJUNCTION
--      evaluated in lib/materiality/*.ts, where computeSeverity already is the sole authority on
--      severity. Putting it in SQL would create a second derivation competing with that authority.
--      This file makes the rows exist and be enumerable; it computes no materiality.
--
-- =====================================================================
-- ⚠️ SCOPE ENUMERATION — FIVE FUNCTIONS, NOT ONE, AND THE FIFTH IS THE DANGEROUS ONE
-- =====================================================================
-- 20260844:7 states the rule: SCOPE IS ENUMERATED, NEVER INFERRED FROM THE ROWS THAT EXIST. A
-- custom IRO appears in neither the round's included questions nor mr_esrs_subtopics, so every
-- enumeration in this platform is blind to it until told otherwise.
--
-- THE RULE IS NOT ABANDONED HERE, AND THE DISTINCTION IS EXACT. What 20260844 forbids is reading
-- the ANSWER table to decide what the QUESTIONS were — its named failure is "twelve determinations
-- across six sub-topics" reported as complete. materiality_custom_iros holds a name and a parent.
-- It holds no direction, no nature, no dimension, no status: nothing that constitutes a
-- determination. It is a question list. The test that keeps this honest is one line — DOES THE
-- SCOPE SOURCE CONTAIN ANSWERS? — and materiality_impact_determinations remains unread by every
-- enumeration in this file, exactly as now.
--
-- The five, and why materiality_lead_submit was NOT the whole problem:
--     materiality_lead_submit          (20260854 §5)   its own inline scope CTE
--     materiality_finalise_scope       (20260850 §1)   ONE DEFINITION, THREE CALLERS
--     materiality_finalise_outstanding (20260850 §2)
--     materiality_finalise             (20260850 §3)
--     materiality_finalise_readiness   (20260850 §4)
-- lead_submit predates the shared helper and never moved onto it, so there are TWO independent
-- enumerations in the platform. Fixing only lead_submit would leave materiality_finalise — the
-- FINAL gate, the one that freezes the assessment — reporting an assessment ready while a named
-- IRO sat unscored. That is the false all-clear, one gate later and with nothing after it to
-- catch it. Both enumerations move in this file or neither should.
--
-- ⚠️ AND WHILE THERE: materiality_finalise_outstanding JOINS THE DETERMINATION TABLE WITH NO AXIS
-- PREDICATE. 20260854 added `d.axis = 'impact'` to lead_submit and did not reach this function.
-- Harmless today because nothing writes axis='financial' — and a duplicate-row defect the moment
-- anything does, in the function that decides whether an assessment may be frozen. §8 adds it, in
-- the same pass, for the reason CLAUDE.md gives about `mr_jurisdictions.active`: a predicate that
-- must be added "in the same pass, or deactivation will keep doing nothing".
--
-- =====================================================================
-- ⚠️ WHAT check-sql.py CANNOT SEE — READ scripts/check-sql.py's LIMIT (1)
-- =====================================================================
-- This file was parsed with the real PostgreSQL grammar before it was proposed. That proves it
-- will not abort on a syntax error. It proves NOTHING about the ON CONFLICT targets: PL/pgSQL
-- stores a body and plans it at first execution, so a stale four-column target installs cleanly
-- and raises SQLSTATE 42P10 at the first customer save. §10 reads the installed bodies back out of
-- the catalogue, and §11 greps the client call sites by hand. Both are necessary. Neither is
-- ceremony.
--
-- ⚠️ RUN WITH -v ON_ERROR_STOP=1 IF YOU USE psql:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260855_custom_iros.sql
-- Without it psql continues past a failed statement and still exits 0. The Supabase SQL editor
-- stops on error by default. Either way this file is wrapped in begin/commit.
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor. Re-runnable — every step is guarded and
-- §1 refuses a half-applied state rather than compounding it.
--
-- DEPENDS ON 20260838 (determinations), 20260839 (snapshot + lock trigger), 20260850 (the finalise
-- family), 20260851 (the two version triggers), 20260854 (the axis and both four-column keys).

begin;


-- =====================================================================
-- 1. PRE-FLIGHT — refuse a world that is not the one this file assumes
-- =====================================================================
-- Same argument as 20260854 §1, one migration further along and with more to lose: this file DROPS
-- two primary keys and one foreign key that 20260854 built three days ago. If the shape it expects
-- is not the shape that is there, dropping and recreating would leave the table with keys nobody
-- designed. There is no DATA violation to look for — a constant column added to a unique key cannot
-- collide — so what is refused here is a half-applied or hand-edited schema.
do $$
declare
  v_def text;
begin
  -- 1.1 — 20260854 is actually applied, both keys, in order. Order is asserted because 20260854 §3
  -- argues (…, axis, direction) so the leading columns still serve every existing index prefix, and
  -- a key with the same columns rearranged satisfies uniqueness while quietly losing that.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.materiality_impact_determinations'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction)' then
    raise exception
      'This file forks 20260854 and expects its four-column determination key. Found: %. Apply '
      '20260854 first, or stop and work out what changed it.', coalesce(v_def, '(none)');
  end if;

  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid = 'public.materiality_impact_assignee_determinations'::regclass and c.contype = 'p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction)' then
    raise exception
      'Snapshot key is not 20260854''s four columns in order. Found: %.', coalesce(v_def, '(none)');
  end if;

  -- 1.2 — the snapshot parent FK is present and cascading. §4 drops it; if it is already absent the
  -- table is unbound from its parent RIGHT NOW and that is a bigger problem than this migration.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conname = 'materiality_impact_assignee_determinations_parent_fkey';
  if v_def is null then
    raise exception
      'The snapshot parent foreign key is missing before this migration ran. The snapshot table is '
      'unbound from the determinations it snapshots. Do not proceed — investigate first.';
  end if;
  if position('ON DELETE CASCADE' in v_def) = 0 then
    raise exception 'The snapshot parent FK is not ON DELETE CASCADE: %. §4 recreates it as cascade and would change behaviour.', v_def;
  end if;

  -- 1.3 — nothing this file creates already exists by another hand.
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='materiality_impact_determinations'
                and column_name='iro_key') then
    raise exception
      'materiality_impact_determinations.iro_key already exists. This file is not re-entrant past '
      'this point: §4 would drop and rebuild keys around a column whose contents it did not write. '
      'If a previous run got partway, inspect before re-running.';
  end if;
  if exists (select 1 from information_schema.tables
              where table_schema='public' and table_name='materiality_custom_iros') then
    raise exception 'materiality_custom_iros already exists. See the note on iro_key above.';
  end if;

  -- 1.4 — the finalise family is 20260850's, with the one-column scope signature §8 forks from. A
  -- different return shape means somebody has already been here and §8 would silently disagree.
  select pg_get_function_result(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='materiality_finalise_scope';
  if v_def is distinct from 'TABLE(subtopic_code text)' then
    raise exception
      'materiality_finalise_scope does not have 20260850''s signature. Found: %. §8 forks that body '
      'and would overwrite something else.', coalesce(v_def, '(not installed)');
  end if;

  -- 1.5 — both 20260851 triggers are present. §7 rewrites one of the two functions their firing
  -- order depends on, and §5 inserts a THIRD trigger into that order.
  if not exists (select 1 from pg_trigger
                  where tgrelid='public.materiality_impact_determinations'::regclass
                    and tgname='materiality_impact_determination_assessment_version_trg') then
    raise exception 'The 20260851 version trigger is missing; §7 forks its function.';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid='public.materiality_impact_determinations'::regclass
                    and tgname='materiality_impact_determination_lock_trg') then
    raise exception 'The 20260839 lock trigger is missing; §5 depends on sorting before it.';
  end if;

  raise notice 'Pre-flight passed: 20260854 applied, both keys four columns, snapshot FK cascading, nothing already added.';
end $$;


-- =====================================================================
-- 2. The column, on both tables
-- =====================================================================
-- ⚠️ NO BACKFILL, AND NONE IS NEEDED. Every existing row IS the sub-topic determined as a whole —
-- there was no smaller unit and no writer for one — so '' is not a guess about old data, it is the
-- only thing old data can be. ADD COLUMN with a NOT NULL and a non-volatile DEFAULT fills existing
-- rows in place on PG 11+ with no table rewrite, and §1 has already asserted the column is absent,
-- so this cannot re-default a column somebody added by hand.
--
-- ⚠️ THE DEFAULT STAYS, PERMANENTLY, AND IT IS NOT SCAFFOLDING. It is what keeps every existing
-- writer correct without naming the column: impact_save_determination (both overloads) writes
-- sub-topic determinations, and the default is how they say so. A custom-IRO writer must name
-- iro_key EXPLICITLY, which is the property that makes an accidental custom-IRO row impossible
-- rather than merely unlikely. Same argument as 20260854's axis default.
alter table public.materiality_impact_determinations
  add column if not exists iro_key text not null default '';

alter table public.materiality_impact_assignee_determinations
  add column if not exists iro_key text not null default '';

-- ⚠️ THE CHECK IS WHAT STOPS A DISPLAY NAME LANDING IN THE KEY. iro_key is an opaque, stable
-- handle; the human name lives in materiality_custom_iros.name and may be edited without moving a
-- single determination. Constraining the shape here means a caller who passes "Water scarcity at
-- the Valencia plant" as the key is refused at the write rather than discovered at a rename.
do $$
begin
  if not exists (select 1 from pg_constraint where conname='materiality_impact_determinations_iro_key_shape') then
    alter table public.materiality_impact_determinations
      add constraint materiality_impact_determinations_iro_key_shape
      check (iro_key = '' or (length(iro_key) <= 64 and iro_key ~ '^[a-z0-9][a-z0-9-]*$'));
  end if;
  if not exists (select 1 from pg_constraint where conname='materiality_impact_assignee_determinations_iro_key_shape') then
    alter table public.materiality_impact_assignee_determinations
      add constraint materiality_impact_assignee_determinations_iro_key_shape
      check (iro_key = '' or (length(iro_key) <= 64 and iro_key ~ '^[a-z0-9][a-z0-9-]*$'));
  end if;
end $$;

comment on column public.materiality_impact_determinations.iro_key is
  'Which IRO under this sub-topic the row determines. '''' (the empty string) is the sub-topic taken as a whole and is the default, so every writer that does not name this column keeps writing exactly what it wrote before. A non-empty value names a row in materiality_custom_iros for the same assessment, sub-topic and standard version — enforced by materiality_impact_determination_iro_exists(), which is a trigger rather than a foreign key because the requirement is CONDITIONAL on the value and no FK can express that. NOT NULL and never nullable: a primary-key column cannot be null, and the alternatives that would have allowed it all cost either the snapshot table''s foreign key or its MATCH SIMPLE integrity.';


-- =====================================================================
-- 3. materiality_custom_iros — the declaration, and it holds no answers
-- =====================================================================
-- ⚠️ THIS TABLE IS WHAT MAKES §8 LEGAL. 20260844:7 forbids inferring scope from the rows that
-- exist; enumerating from a table of names and parents is not that. Read the column list as the
-- argument: there is no direction, no nature, no scale, no scope, no irremediability, no
-- likelihood, no status and no determined_at here. Nothing in this table is a determination, so
-- reading it to build scope is enumeration and not inference. IF ANYONE EVER ADDS A SEVERITY
-- COLUMN HERE, §8's justification collapses and the enumerate-never-infer rule is broken.
create table if not exists public.materiality_custom_iros (
  assessment_id    uuid        not null,
  user_id          uuid        not null default auth.uid(),

  -- The ESRS parent. Never null, never free text: the product decision in the header, as a column.
  subtopic_code    text        not null,
  standard_version text        not null,

  iro_key          text        not null
    check (iro_key <> '' and length(iro_key) <= 64 and iro_key ~ '^[a-z0-9][a-z0-9-]*$'),

  -- ⚠️ THE NAME IS NOT THE KEY, AND MUST NOT BECOME ONE. A company will rename "Valencia water" to
  -- "Valencia water stress" halfway through an assessment. Renaming must not move a determination.
  name             text        not null check (length(btrim(name)) between 1 and 200),
  description      text,

  -- Reserved for 1c and NOT WRITTEN BY ANYTHING IN 1b. Null means the lead named it, which is the
  -- only case this migration permits. Present now so that adding the contributor path later is a
  -- grant and an RPC rather than another key change on a table that by then holds customer data.
  created_by_assignment_id uuid,

  created_at       timestamptz not null default now(),

  constraint materiality_custom_iros_pkey
    primary key (assessment_id, subtopic_code, iro_key),

  constraint materiality_custom_iros_assessment_fkey
    foreign key (assessment_id, user_id)
    references public.materiality_assessments (id, user_id) on delete cascade,

  -- ⚠️ THE SAME TAXONOMY FK EVERY OTHER TABLE CARRIES, AND THE POINT OF THE WHOLE DESIGN. A custom
  -- IRO references mr_esrs_subtopics exactly as a determination does. RESTRICT, matching 20260838:
  -- a reference row that an assessment was built on must not be deletable out from under it.
  constraint materiality_custom_iros_subtopic_fkey
    foreign key (subtopic_code, standard_version)
    references public.mr_esrs_subtopics (code, standard_version) on delete restrict,

  -- RESTRICT, not CASCADE: same argument as materiality_impact_determinations_assignment_fkey. An
  -- assignment that produced work is revoked, not erased.
  constraint materiality_custom_iros_assignment_fkey
    foreign key (created_by_assignment_id, assessment_id)
    references public.materiality_impact_assignments (id, assessment_id) on delete restrict
);

create index if not exists materiality_custom_iros_assessment_idx
  on public.materiality_custom_iros (assessment_id);
create index if not exists materiality_custom_iros_subtopic_idx
  on public.materiality_custom_iros (assessment_id, subtopic_code);

-- ⚠️ TWO IROs WITH THE SAME NAME UNDER ONE SUB-TOPIC ARE INDISTINGUISHABLE IN A BOARD REPORT, and
-- an auditor holding the paper cannot tell which determination belongs to which. Case- and
-- whitespace-insensitive, because "Valencia Water" and "valencia water " are the same claim to a
-- reader. An expression index rather than a table constraint, which is the only form Postgres
-- allows for this.
create unique index if not exists materiality_custom_iros_name_unique
  on public.materiality_custom_iros (assessment_id, subtopic_code, lower(btrim(name)));

comment on table public.materiality_custom_iros is
  'An IRO the company named specifically, sitting UNDER an ESRS sub-topic — never taxonomy-free. Holds a name and a parent and NOTHING ELSE: no direction, nature, dimension or status. That absence is load-bearing, not an oversight — it is what lets every scope enumeration read this table without breaking 20260844:7''s rule that scope is enumerated and never inferred from the rows that exist. Adding any severity column here would break that rule. The determinations themselves live in materiality_impact_determinations with iro_key set to this row''s key; the sub-topic taken as a whole is iro_key = '''' and has no row here.';

alter table public.materiality_custom_iros enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='materiality_custom_iros'
                    and policyname='mci_owner_all') then
    -- USING governs what is visible, WITH CHECK what may be written. A FOR ALL policy without
    -- WITH CHECK reads correctly and permits an insert carrying someone else's user_id — 20260838's
    -- wording, and the same hazard here.
    create policy mci_owner_all on public.materiality_custom_iros
      for all to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

-- ⚠️ RLS IS NOT A GRANT. A policy on a table nobody holds a privilege for does nothing, and the
-- reverse fails silently on the service-role path. 20260838 §5's heading, restated because a new
-- table is exactly where it gets forgotten.
revoke all on public.materiality_custom_iros from anon, authenticated, service_role;

-- ⚠️ NOTHING TO anon. 1b IS LEAD-ONLY. The contributor path is a SECURITY DEFINER RPC that does not
-- exist yet, and granting anon here "ready for it" would open the table to unauthenticated reads
-- before the gate is written. Same reasoning 20260838 gives for the determination tables.
grant select, insert, update, delete on public.materiality_custom_iros to authenticated;
grant all on public.materiality_custom_iros to service_role;

-- DELETE is granted, unlike on determinations, and the difference is real: an IRO named by mistake
-- before anything was determined against it is a typo, not an evidentiary record. Once a
-- determination exists the delete is refused anyway — not by policy but by arithmetic, since
-- materiality_impact_determination_iro_exists() would leave that determination pointing at nothing.
-- §5 is where that is actually enforced.


-- =====================================================================
-- 4. The keys — snapshot FK first, then both primary keys, then rebuild
-- =====================================================================
-- ORDER IS FORCED, exactly as in 20260854 §3: the snapshot FK references the determination primary
-- key, so the key cannot be dropped while the FK stands. Drop FK -> move both PKs -> recreate FK
-- against the new key.
--
-- ⚠️ COLUMN ORDER IS (…, axis, direction, iro_key) — iro_key LAST, by 20260854's own argument. The
-- leading four columns stay as they were, so every existing index prefix and every query filtering
-- on (assessment_id, subtopic_code) or (assessment_id, subtopic_code, axis) is served exactly as
-- before, and "every IRO under this sub-topic" is a prefix scan rather than a sequential one.
alter table public.materiality_impact_assignee_determinations
  drop constraint if exists materiality_impact_assignee_determinations_parent_fkey;

alter table public.materiality_impact_determinations
  drop constraint if exists materiality_impact_determinations_pkey;
alter table public.materiality_impact_determinations
  add constraint materiality_impact_determinations_pkey
  primary key (assessment_id, subtopic_code, axis, direction, iro_key);

alter table public.materiality_impact_assignee_determinations
  drop constraint if exists materiality_impact_assignee_determinations_pkey;
alter table public.materiality_impact_assignee_determinations
  add constraint materiality_impact_assignee_determinations_pkey
  primary key (assessment_id, subtopic_code, axis, direction, iro_key);

alter table public.materiality_impact_assignee_determinations
  add constraint materiality_impact_assignee_determinations_parent_fkey
  foreign key (assessment_id, subtopic_code, axis, direction, iro_key)
  references public.materiality_impact_determinations
            (assessment_id, subtopic_code, axis, direction, iro_key)
  on delete cascade;


-- =====================================================================
-- 5. Existence — a trigger, because no foreign key can express this
-- =====================================================================
-- ⚠️ THIS IS A DEPARTURE FROM 20260851's RULE AND THE REASON IS STATED RATHER THAN ASSUMED.
-- 20260851's header argues that EXISTENCE IS THE FK'S JOB and that a trigger should defer to one
-- wherever a foreign key can do the work. Here it provably cannot: the requirement is CONDITIONAL —
-- iro_key = '' must reference nothing, iro_key <> '' must reference a row — and a foreign key has
-- no conditional form. Making the reference unconditional would mean materialising an identity row
-- in materiality_custom_iros for every sub-topic of every assessment: dozens of rows of pure
-- scaffolding per assessment, written by whatever happens to touch the table first, in a table
-- whose whole justification (§3) is that it contains only what a human deliberately named.
--
-- ⚠️ AND IT CANNOT PRODUCE A FALSE REFUSAL — the failure 20260851 was avoiding when it chose the FK.
-- The question is whether this SELECT can miss a row that legitimately exists:
--   • The lead path runs as authenticated. materiality_custom_iros is visible under RLS at exactly
--     user_id = auth.uid(); the determination table's own WITH CHECK pins NEW.user_id to
--     auth.uid(); both rows hang off the same assessment and therefore the same user. Visible.
--   • The token path runs inside a SECURITY DEFINER RPC as the table owner, and no table in this
--     schema uses FORCE ROW LEVEL SECURITY, so RLS does not apply there at all. Visible.
-- There is no third caller. A not-found here therefore means the IRO genuinely does not exist, and
-- the message can say so without guessing — which is the standard CLAUDE.md sets for error text.
--
-- ⚠️ standard_version IS PART OF THE MATCH, NOT INCIDENTAL. A determination and the IRO it names
-- must be keyed to the same ESRS version for the same reason PT409 exists: ESRS (2026) renumbered
-- the disclosure requirements and 49 codes exist under both versions with different titles. Since
-- PT409 already pins the determination to its assessment, matching here pins the IRO to the
-- assessment transitively, with one check in one place instead of a second version trigger.
create or replace function public.materiality_impact_determination_iro_exists()
returns trigger
language plpgsql
as $$
begin
  -- The sub-topic taken as a whole references nothing and is the overwhelmingly common case, so it
  -- costs one comparison and no lookup.
  if NEW.iro_key = '' then
    return NEW;
  end if;

  if not exists (
    select 1
      from public.materiality_custom_iros i
     where i.assessment_id    = NEW.assessment_id
       and i.subtopic_code    = NEW.subtopic_code
       and i.iro_key          = NEW.iro_key
       and i.standard_version = NEW.standard_version)
  then
    raise exception
      'This determination names IRO "%" under sub-topic % (version %), and no such IRO is recorded '
      'for this assessment. A named IRO must be created before it can be determined — it is the '
      'thing that puts it in scope, and a determination against an unnamed IRO would be invisible '
      'to every completeness check on the assessment. Not saved.',
      NEW.iro_key, NEW.subtopic_code, NEW.standard_version
      using errcode = 'PT410';
  end if;

  return NEW;
end $$;

-- ⚠️ NO REVOKE, for 20260851's reason: Postgres refuses to run a trigger function called directly
-- ("trigger functions can only be called as triggers"), so the default EXECUTE to PUBLIC grants
-- nothing.
comment on function public.materiality_impact_determination_iro_exists() is
  'Refuses a determination whose non-empty iro_key names no row in materiality_custom_iros for the same assessment, sub-topic AND standard version; errcode PT410. A TRIGGER RATHER THAN A FOREIGN KEY because the requirement is conditional on the value — '''' must reference nothing — and no FK has a conditional form. Cannot produce a false refusal: the lead path sees the IRO under RLS (same user_id), and the token path runs SECURITY DEFINER where RLS does not apply, so not-found means genuinely absent. Fires between the version trigger and the lock trigger by name ordering, deliberately.';

-- ⚠️ THE NAME DECIDES THE FIRING ORDER, AND THE ORDER IS DELIBERATE — 20260851's argument, now with
-- three triggers. Postgres fires same-timing row triggers alphabetically by trigger name:
--     materiality_impact_determination_assessment_version_trg   (20260851)  a
--     materiality_impact_determination_iro_exists_trg           (this file) i
--     materiality_impact_determination_lock_trg                 (20260839)  l
-- Either order is transactionally correct — a raise anywhere rolls the statement back. What order
-- decides is WHICH REFUSAL THE CALLER READS, and the right one is always the most fundamental fact.
-- A version disagreement outranks a missing IRO, because under the wrong version the IRO lookup is
-- asking about the wrong taxonomy entirely. A missing IRO outranks the lock's demand for an
-- override reason, because there is no point writing a justification for a save that names
-- something that does not exist. §10 asserts this ordering rather than trusting the alphabet.
drop trigger if exists materiality_impact_determination_iro_exists_trg
  on public.materiality_impact_determinations;
create trigger materiality_impact_determination_iro_exists_trg
  before insert or update on public.materiality_impact_determinations
  for each row execute function public.materiality_impact_determination_iro_exists();


-- =====================================================================
-- 6. The view — the forgotten predicate, made unforgettable
-- =====================================================================
-- ⚠️ THIS IS THE MITIGATION THE HEADER PROMISED, AND IT IS THE REASON THE SENTINEL IS ACCEPTABLE.
-- Eight client read sites (§11) currently select from materiality_impact_determinations expecting
-- one row per sub-topic and direction. After §2 they silently receive the custom IROs as well.
-- Adding `.eq('iro_key','')` to eight call sites is a rule that must be remembered eight times and
-- again at every ninth. Pointing them at a view is a rule that cannot be forgotten once.
--
-- ⚠️ security_invoker = true IS NOT OPTIONAL AND IS NOT A STYLE CHOICE. A Postgres view runs with
-- the privileges of its OWNER by default, and RLS on the underlying table is evaluated as that
-- owner — so without this setting the view would return EVERY CUSTOMER'S DETERMINATIONS to any
-- authenticated caller. With it, mid_owner_all is evaluated as the caller, exactly as a direct
-- select on the table is. This is the single most dangerous line in the file.
--
-- ⚠️ COLUMNS ARE ENUMERATED, NOT `select *`. A view built with * freezes the column list at
-- creation time, so a column added to the table later is absent from the view and the two drift
-- apart with nothing raised. Enumerating means a future column is a visible, deliberate edit here.
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
 where d.iro_key = '';

comment on view public.materiality_impact_subtopic_determinations is
  'Every determination of a sub-topic taken as a whole — materiality_impact_determinations with iro_key = '''' pinned. EXISTS SO THE PREDICATE CANNOT BE FORGOTTEN: after 20260855 a bare select on the table returns custom-IRO rows alongside sub-topic rows and doubles a count, silently, which is the mr_jurisdictions.active failure class. security_invoker = true is load-bearing — without it the view would run as its owner and return every customer''s rows to any authenticated caller. iro_key is deliberately NOT among the columns: a consumer that needs it is not a consumer of this view.';

-- ⚠️ SELECT ONLY, AND DELIBERATELY NOT UPDATABLE-BY-GRANT. A simple view is updatable in Postgres,
-- and granting insert/update here would let a writer create determinations without naming iro_key
-- through a surface whose whole purpose is that iro_key is invisible. Writes go to the table, where
-- the column and its default are in plain sight.
revoke all on public.materiality_impact_subtopic_determinations from anon, authenticated, service_role;
grant select on public.materiality_impact_subtopic_determinations to authenticated;
grant select on public.materiality_impact_subtopic_determinations to service_role;


-- =====================================================================
-- 7. The three ON CONFLICT targets and the PT409 message
--    INLINED VERBATIM FROM 20260854, TARGET ONLY CHANGED
-- =====================================================================
-- ⚠️ THESE DO NOT FAIL AT INSTALL, WHICH IS WHY §10 READS THEM BACK. PL/pgSQL validates only the
-- SYNTAX of a function body at CREATE time; the SQL inside is planned at first execution. A stale
-- FOUR-column ON CONFLICT therefore survives CREATE OR REPLACE without complaint and raises 42P10 —
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification" — at the
-- first call. Loud, never silent, but LATE, and to three different people:
--     impact_save_determination (10 args) -> nobody today; the client sends 12 and resolves to the
--                                            other overload. Kept current because an installed,
--                                            callable function that raises 42P10 is a trap for the
--                                            next caller, not dead weight.
--     impact_save_determination (12 args) -> THE LIVE CONTRIBUTOR PATH. The first contributor to
--                                            save anything after this migration.
--     materiality_impact_determination_lock -> the lead, on their first override of a submitted
--                                            determination. Rarer, and the snapshot is evidence.
--
-- ⚠️ THE BODIES BELOW ARE 20260854'S, NOT 20260840'S OR 20260841'S. 20260854 is the installed
-- authority for all three; forking from the older files would silently revert its axis work. The
-- reciprocal note now lives in 20260854 as well as in 20260840 and 20260841 — three files pointing
-- at this one, which is the only way the chain stays readable.

-- ── 7a · impact_save_determination, 10 args ─ forked from 20260854 §4a ──────────
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
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do update
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

-- ── 7b · materiality_impact_determination_lock ─ forked from 20260854 §4b ─────────
-- ⚠️ ITS ON CONFLICT TARGETS THE SNAPSHOT TABLE, NOT THE DETERMINATION TABLE. Both primary keys
-- moved in §4 and both are now the same five columns, so the edit is textually identical and
-- semantically about a different table. That is exactly why 20260854's header insisted the snapshot
-- table could not be left behind.
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
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do nothing;

  NEW.overridden_at := now();
  return NEW;
end $$;

-- ── 7c · impact_save_determination, 12 args ─ THE LIVE CONTRIBUTOR PATH ────────────
-- Forked from 20260854 §4c. Of the three, this is the one a customer reaches first: app/impact/
-- [token]/page.tsx:209 sends p_abstained_dimensions and p_rationale and therefore resolves here.
-- ⚠️ IT DOES NOT NAME iro_key, AND MUST NOT. A contributor cannot create or determine a custom IRO
-- in 1b — that is the lead-only decision in the header — so this path writes the column's default,
-- '', which is the sub-topic taken as a whole. That is what it wrote before this migration and what
-- it should keep writing. Naming the column here would be the whole of 1c arriving by accident.
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
  on conflict (assessment_id, subtopic_code, axis, direction, iro_key) do update
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

-- ── 7d · PT409's message ─ name the IRO, not a fourth slash-separated code ─────────
-- ⚠️ THE MESSAGE STOPPED BEING READABLE BEFORE IT STOPPED BEING CORRECT. 20260854 widened it to
-- "%/%/%" for the axis; a fifth key column would make it "%/%/%/%", and four codes separated by
-- slashes is a string a maintainer decodes rather than reads. So the subject is composed instead:
-- the sub-topic code alone when the row is the sub-topic as a whole, and the IRO's NAME in quotes
-- when it is not. A person reading "Water scarcity at the Valencia plant" knows which row is meant;
-- nobody knows what E3-1/impact/negative/valencia-water is without opening the schema.
--
-- ⚠️ THE NAME LOOKUP IS ON THE ERROR PATH ONLY. It costs nothing on the millions of saves that
-- succeed, and it coalesces to the key — so a determination naming an IRO that does not exist
-- still produces a readable message here rather than a NULL-swallowed one. (That row would be
-- refused by §5's PT410 anyway; this trigger fires first and must not depend on the other having
-- run.)
create or replace function public.materiality_impact_determination_assessment_version()
returns trigger
language plpgsql
as $$
declare
  v_found   boolean;
  v_parent  text;
  v_subject text;
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
    -- Composed, not concatenated into the format string, so the two branches are visible side by
    -- side rather than hidden inside a % argument.
    if NEW.iro_key = '' then
      v_subject := NEW.subtopic_code;
    else
      select '"' || i.name || '" (under ' || NEW.subtopic_code || ')'
        into v_subject
        from public.materiality_custom_iros i
       where i.assessment_id    = NEW.assessment_id
         and i.subtopic_code    = NEW.subtopic_code
         and i.iro_key          = NEW.iro_key
         and i.standard_version = NEW.standard_version;
      v_subject := coalesce(v_subject, NEW.iro_key || ' (under ' || NEW.subtopic_code || ')');
    end if;

    raise exception
      'Determination % [%/%] carries standard_version %, but assessment % states %. A determination '
      'must be keyed to the version its assessment is prepared under: the two are joined by nothing '
      'but this trigger, and ESRS (2026) renumbered the disclosure requirements, so 49 codes exist '
      'under both versions with different titles. Not saved.',
      v_subject, NEW.axis, NEW.direction, NEW.standard_version,
      NEW.assessment_id, coalesce(v_parent, '(none stated)')
      using errcode = 'PT409';
  end if;

  return NEW;
end $$;

comment on function public.materiality_impact_determination_assessment_version() is
  'Refuses any determination whose standard_version differs from its assessment''''s, errcode PT409. IS DISTINCT FROM, so an assessment stating no version refuses rather than passing. Checks the row''''s STATE, not the delta: impact_save_determination''''s ON CONFLICT DO UPDATE omits standard_version, so an untouched value can go wrong underneath a contributor. Existence of the assessment is deferred to the composite FK, safe because RLS and that FK together make any FK-satisfiable parent visible to its SELECT. Names the IRO by NAME rather than by key when iro_key <> '''''''' — four slash-separated codes is a string a maintainer decodes rather than reads. Fires FIRST of the three row triggers on this table by name ordering, deliberately: a version disagreement outranks a missing IRO, which outranks the lock''''s demand for an override reason.';


-- =====================================================================
-- 8. Scope enumeration — ALL FIVE, because fixing one is worse than none
-- =====================================================================
-- Read the header's SCOPE ENUMERATION section before this one. In short: 20260844:7's rule is that
-- scope is ENUMERATED and never INFERRED FROM THE ROWS THAT EXIST, the failure it names is reading
-- the ANSWER table to decide what the QUESTIONS were, and materiality_custom_iros holds no answers.
-- Enumerating from it is enumeration. materiality_impact_determinations stays unread by every
-- function below, exactly as now.
--
-- ⚠️ RLS AND SCOPE POINT THE WRONG WAY IF THEY EVER DISAGREE, so this is argued and not assumed.
-- materiality_finalise_scope is SECURITY INVOKER and now reads an RLS-protected table. A row hidden
-- by RLS would SHRINK scope, and a shrunken scope reads as "nothing outstanding" and therefore
-- "ready to finalise" — the silent failure pointing the WRONG WAY that 20260850's own header exists
-- to prevent. It cannot happen here: mci_owner_all is user_id = auth.uid(); materiality_custom_iros
-- rows hang off an assessment whose user_id is the same; and both entry points check ownership
-- before calling. A direct caller sees their own assessment's IROs and no others, which is the same
-- scope they would get as the owner. The property is worth restating whenever a table is added to
-- this query.

-- ⚠️ A COMPOSITE TYPE, NOT TWO PARALLEL ARRAYS. materiality_lead_submit keeps scope in arrays
-- because "the same set decides the completeness check AND which rows the UPDATE may touch —
-- computing it twice would let the two drift apart within a single call" (20260844). A pair of
-- text[] indexed in lockstep reintroduces exactly that drift, by hand, one subscript at a time.
-- One array of one type keeps the guarantee the comment claims.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'materiality_iro_ref') then
    create type public.materiality_iro_ref as (subtopic_code text, iro_key text);
  end if;
end $$;

comment on type public.materiality_iro_ref is
  'One unit of determination: an ESRS sub-topic, and which IRO under it. iro_key = '''' is the sub-topic taken as a whole. Exists so materiality_lead_submit can hold scope and held-scope in single arrays rather than two indexed in lockstep, which is what makes its one-pass guarantee real rather than claimed.';


-- ── 8a · materiality_lead_submit ─ forked from 20260854 §5 ─────────────────────────
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
  v_scope       public.materiality_iro_ref[];
  v_held        public.materiality_iro_ref[];
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
    -- The taxonomy side, unchanged. Every sub-topic in scope is determined as a whole, ALWAYS —
    -- naming an IRO under it adds a row, it never replaces this one. ESRS requires the sub-topic
    -- assessed regardless, so the obligation is the standard's and not ours to relax.
    select q.subtopic_code, ''::text as iro_key
      from public.materiality_survey_questions q
      join linked l on l.round_id = q.round_id
     where q.status = 'included'
       and q.subtopic_code is not null
    union
    select s.code, ''::text
      from public.mr_esrs_subtopics s
     where s.standard_version = v_version
       and not exists (select 1 from linked)
    union
    -- ⚠️ THE COMPANY'S OWN DECLARATIONS. Not inference: this table holds a name and a parent and
    -- no determination of any kind. Without this arm a named IRO is invisible here, and the
    -- worksheet reports complete while it sits unscored — silent, and toward a false all-clear.
    --
    -- No `and not exists (select 1 from linked)` guard: a custom IRO is in scope whether or not a
    -- survey round is linked, because the company named it rather than a round including it.
    select i.subtopic_code, i.iro_key
      from public.materiality_custom_iros i
     where i.assessment_id = p_assessment_id
  ),
  held as (
    -- ⚠️ KEYED ON subtopic_code ALONE, AND THAT IS THE WHOLE ANSWER TO DELEGATION. Assignment is
    -- sub-topic granular (materiality_impact_assignment_subtopics, unique on
    -- (assessment_id, subtopic_code)), so a custom IRO under a delegated sub-topic is held by the
    -- contributor automatically, with no schema change and no second rule. Keying this on the pair
    -- would split an IRO from its parent and put two people on overlapping work — precisely what
    -- 20260838:379's one-assignee constraint exists to make impossible.
    select sc.subtopic_code, sc.iro_key
      from scope sc
     where not exists (
       select 1
         from public.materiality_impact_assignment_subtopics a
        where a.assessment_id = p_assessment_id
          and a.subtopic_code = sc.subtopic_code)
  )
  select (select array_agg((sc.subtopic_code, sc.iro_key)::public.materiality_iro_ref
                           order by sc.subtopic_code, sc.iro_key) from scope sc),
         (select array_agg((h.subtopic_code,  h.iro_key)::public.materiality_iro_ref
                           order by h.subtopic_code,  h.iro_key)  from held  h)
    into v_scope, v_held;

  if coalesce(array_length(v_scope, 1), 0) = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to submit. Either the linked '
      'survey round has no included questions, or no sub-topics are recorded for its standard '
      'version.';
  end if;

  if coalesce(array_length(v_held, 1), 0) = 0 then
    raise exception
      'Every one of the % sub-topics in scope is assigned to a contributor, so none of them is '
      'yours to submit. Each is submitted by the person holding it, from their own link.',
      array_length(v_scope, 1);
  end if;

  -- ⚠️ INCOMPLETE MEANS INCOMPLETE, AND IT IS NAMED. A determination is only coherent once its
  -- direction and nature are stated: "this is an actual negative impact and I cannot judge its
  -- scale" is a §6.1 abstention and is a real answer, but "I have no view on whether this is
  -- happening or might happen" is not a determination at all.
  --
  -- So every sub-topic the lead holds must carry BOTH directions with a nature. The dimensions may
  -- all be null. Refusing here rather than at the constraint means the lead is told WHICH ones,
  -- instead of receiving a check_violation naming a column.
  --
  -- ⚠️ NAMED, AND THE NAME HAS TO IDENTIFY ONE ROW. A held sub-topic with two named IROs under it
  -- can be outstanding three times over, and "E3-1 (negative), E3-1 (negative), E3-1 (negative)"
  -- sends a preparer to look for a bug rather than to finish their work. So the label carries the
  -- IRO's name where there is one. Left join, coalesced to the key: an IRO row that has gone
  -- missing must still be NAMED as outstanding rather than dropped from the list, which is the
  -- difference between an incomplete answer and a wrong one.
  select string_agg(m.label || ' (' || m.direction || ')', ', '
                    order by m.subtopic_code, m.iro_key, m.direction)
    into v_missing
    from (
      select c.subtopic_code,
             c.iro_key,
             case when c.iro_key = '' then c.subtopic_code
                  else c.subtopic_code || ' / ' || coalesce(i.name, c.iro_key) end as label,
             dir.direction
        from unnest(v_held) as c(subtopic_code, iro_key)
        cross join (values ('negative'), ('positive')) as dir(direction)
        left join public.materiality_custom_iros i
          on i.assessment_id = p_assessment_id
         and i.subtopic_code = c.subtopic_code
         and i.iro_key       = c.iro_key
        left join public.materiality_impact_determinations d
          on d.assessment_id = p_assessment_id
         and d.subtopic_code = c.subtopic_code
         and d.direction     = dir.direction
         and d.axis          = 'impact'
         and d.iro_key       = c.iro_key
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
     and (d.subtopic_code, d.iro_key)::public.materiality_iro_ref = any(v_held)
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

comment on function public.materiality_lead_submit(uuid) is
  'The lead''''s counterpart to impact_submit: flips every determination the lead holds directly to submitted, on the impact axis. Scope is ENUMERATED from three sources — the earliest linked round''''s included questions, or mr_esrs_subtopics for the assessment''''s standard_version when no round is linked, PLUS every row in materiality_custom_iros for the assessment — minus everything in materiality_impact_assignment_subtopics. Never inferred from the determination rows that happen to exist. The custom-IRO arm does not break 20260844''''s enumerate-never-infer rule: that rule forbids reading the ANSWER table to decide what the QUESTIONS were, and materiality_custom_iros holds a name and a parent and no determination of any kind. Held-scope is keyed on subtopic_code alone, so a custom IRO is delegated with its parent and never apart from it. Refuses while any held unit lacks a direction-and-nature in either direction, NAMING which by the IRO''''s name. Returns {"submitted": n}; n = 0 can only mean the work was already submitted.';

-- ── 8b · materiality_finalise_scope and _outstanding ─ forked from 20260850 §1-2 ───
-- ⚠️ DROP THEN CREATE, NOT CREATE OR REPLACE, AND THE REASON MATTERS FOR THE GRANTS. Postgres
-- refuses to change a function's return type in place, and both of these gain a column. A DROP
-- takes the function's PRIVILEGES with it — so the grants at the foot of this section are not
-- housekeeping, they are the difference between a working screen and "permission denied for
-- function materiality_finalise_scope" on the readiness card. This is the function-level form of
-- the rule that RLS is not a grant.
--
-- ⚠️ THE DROPS ARE ORDERED. materiality_finalise_outstanding calls materiality_finalise_scope in
-- its FROM clause. A string-bodied SQL function is not dependency-tracked, so Postgres would let
-- scope be dropped underneath it and the breakage would appear at the next call rather than here.
-- Dropping the caller first means there is no moment, even inside this transaction, at which an
-- installed function references a signature that is gone.
drop function if exists public.materiality_finalise_outstanding(uuid, text);
drop function if exists public.materiality_finalise_scope(uuid, text);

create or replace function public.materiality_finalise_scope(
  p_assessment_id uuid,
  p_standard_version text)
returns table (subtopic_code text, iro_key text)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_standard_version is null then
    raise exception
      'materiality_finalise_scope was called with no standard version. Scope for an assessment '
      'with no linked survey round is drawn from mr_esrs_subtopics for a STATED version; with '
      'none, this function would return an empty scope, and a caller reading that would conclude '
      'there is nothing outstanding and therefore that the assessment is ready to finalise. '
      'Refusing rather than answering wrongly. Establish the version first — materiality_finalise '
      'and materiality_finalise_readiness both do.'
      using errcode = 'null_value_not_allowed';
  end if;

  return query
  with linked as (
    select l.round_id
      from public.materiality_assessment_survey_rounds l
     where l.assessment_id = p_assessment_id
     order by l.linked_at
     limit 1
  )
  select q.subtopic_code, ''::text as iro_key
    from public.materiality_survey_questions q
    join linked l on l.round_id = q.round_id
   where q.status = 'included'
     and q.subtopic_code is not null
  union
  select s.code, ''::text
    from public.mr_esrs_subtopics s
   where s.standard_version = p_standard_version
     and not exists (select 1 from linked)
  union
  -- ⚠️ THE ARM WITHOUT WHICH materiality_finalise REPORTS A FALSE ALL-CLEAR. This is the FINAL
  -- gate — the one that freezes the assessment and has nothing after it to catch a miss. A named
  -- IRO appears in neither of the two arms above, so without this a company could name an IRO,
  -- leave it entirely undetermined, and finalise.
  --
  -- No `not exists (select 1 from linked)` guard, unlike the reference arm: a custom IRO is in
  -- scope because the COMPANY named it, not because a round included it, so a linked round neither
  -- adds nor removes it.
  select i.subtopic_code, i.iro_key
    from public.materiality_custom_iros i
   where i.assessment_id = p_assessment_id;
end $$;

create or replace function public.materiality_finalise_outstanding(
  p_assessment_id uuid,
  p_standard_version text)
returns table (subtopic_code text, iro_key text, label text, direction text)
language sql
stable
security invoker
set search_path = public
as $$
  select sc.subtopic_code,
         sc.iro_key,
         -- ONE AUTHORITY FORMATS THE LABEL. materiality_finalise and materiality_finalise_readiness
         -- both print this list, and 20260850's whole argument for these helpers is that "the
         -- screen's readiness card and this refusal read the SAME query". Two callers formatting
         -- their own label is that argument being abandoned one function later.
         case when sc.iro_key = '' then sc.subtopic_code
              else sc.subtopic_code || ' / ' || coalesce(i.name, sc.iro_key) end as label,
         dir.direction
    from public.materiality_finalise_scope(p_assessment_id, p_standard_version) sc
    cross join (values ('negative'), ('positive')) as dir(direction)
    left join public.materiality_custom_iros i
      on i.assessment_id = p_assessment_id
     and i.subtopic_code = sc.subtopic_code
     and i.iro_key       = sc.iro_key
    left join public.materiality_impact_determinations d
      on d.assessment_id = p_assessment_id
     and d.subtopic_code = sc.subtopic_code
     and d.direction     = dir.direction
     and d.iro_key       = sc.iro_key
     -- ⚠️ ADDED HERE, NOT IN 20260854, AND THAT WAS A MISS RATHER THAN A DECISION. 20260854 scoped
     -- materiality_lead_submit to the impact axis and did not reach this function. Without it, the
     -- first financial-axis row would join twice and report a submitted sub-topic as outstanding —
     -- in the function that decides whether an assessment may be frozen. Harmless only for as long
     -- as nothing writes axis = 'financial', which is exactly the kind of "harmless" CLAUDE.md
     -- records about mr_jurisdictions.active.
     and d.axis          = 'impact'
   where d.assessment_id is null
      or d.status <> 'submitted'
   order by sc.subtopic_code, sc.iro_key, dir.direction;
$$;

-- ── 8d · materiality_finalise ─ forked from 20260850 §3 ────────────────────────────
-- ⚠️ ONE EXPRESSION CHANGES, AND THE BODY IS INLINED WHOLE ANYWAY. Same discipline as §7: a
-- function is replaced in full from a known source, never patched blind, so what is installed can
-- be diffed against what was forked. The change is that the outstanding list prints the LABEL the
-- helper composed rather than the bare sub-topic code — without it a sub-topic with two named IROs
-- under it reads as the same code repeated three times.
create or replace function public.materiality_finalise(p_assessment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_missing     text;
  v_no          int;
  v_at          timestamptz;
  v_prev        int;
  v_changed     boolean;
  v_rows        int;
begin
  -- ── 1. Ownership ────────────────────────────────────────────────────────────────────────────
  -- Same shape as materiality_lead_submit: a missing assessment and someone else's are deliberately
  -- NOT told apart, because saying which would confirm whose work is stored under that id.
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

  -- ── 2. The version must be stated ───────────────────────────────────────────────────────────
  -- ⚠️ NO FALLBACK TO esrs_2023, AND THAT IS THE POINT OF REFUSING RATHER THAN DEFAULTING. Article
  -- 2(2) of Del. Reg. C(2026) 5010 requires the undertaking to state which version it applied.
  -- Freezing one standard's requirements under another standard's name would be a false statement
  -- that survives in an archive — and ESRS (2026) renumbered the DRs, so 49 codes exist under both
  -- versions with different titles. That is not a stale-label problem, it is the wrong requirement
  -- under the right code. api/materiality/route.ts may fall back only because drResolutionNote
  -- discloses the fallback on the report's face; nothing here would.
  --
  -- 20260848 permits a null standard_version on the row because a table should not enforce a rule
  -- this function owns. This is where it is owned.
  if v_version is null then
    raise exception
      'This assessment does not state which ESRS version it was prepared under, so there is no set '
      'of disclosure requirements to freeze. Article 2(2) of Del. Reg. C(2026) 5010 requires the '
      'undertaking to state the version, and assuming one would be a false statement about which '
      'law was applied. State the version on the assessment, then finalise.';
  end if;

  -- ── 3. Requirements must exist for that version ─────────────────────────────────────────────
  -- ⚠️ CHECKED BEFORE READINESS, ON PURPOSE. esrs_2023_reliefs is a permitted value with NO rows in
  -- mr_esrs_disclosure_requirements (20260817's own verification block: "expect exactly:
  -- esrs_2023 | 61 and esrs_2026 | 64"). Without this, such an assessment would finalise, copy
  -- nothing, and leave a record asserting "these were the requirements in force" when none were —
  -- which a later reader cannot tell from a copy that failed. An empty result is a result and must
  -- be reported as one.
  --
  -- Before readiness because a preparer on an unseeded version can NEVER finalise until it is
  -- seeded, and finding that out after determining 37 sub-topics would be the wrong order.
  select count(*) into v_req_count
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  if v_req_count = 0 then
    raise exception
      'No disclosure requirements are held for %, so finalising would freeze an empty set and '
      'record it as though it were the requirements in force. This is a gap in the platform''s '
      'reference data, not in your assessment, and nothing you can do on this screen will change '
      'it. Tell us and we will seed them.', v_version;
  end if;

  -- ── Refusals 4 and 5 — SAME RULE, NOW FROM THE HELPERS ─────────────────────────────────────
  -- The scope CTE and the both-directions join that stood here are now
  -- materiality_finalise_scope and materiality_finalise_outstanding, so the worksheet's readiness
  -- card and this refusal read the SAME query. A TypeScript copy could not be bound to a SQL one by
  -- any test in this repo — vitest has no database — so one query called by both is the only way
  -- they cannot disagree. The reasoning that stood here (scope-wide not `held`; submitted not
  -- complete; assignment status ignored) moved with the code and lives on those two functions.
  select count(*) into v_scope_n
    from public.materiality_finalise_scope(p_assessment_id, v_version);

  -- Guarded separately, and still necessary: materiality_finalise_outstanding over an empty scope
  -- returns no rows, so string_agg below would be NULL — which would read as "nothing
  -- outstanding" and finalise an assessment with no sub-topics at all.
  if v_scope_n = 0 then
    raise exception
      'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
      'linked survey round has no included questions, or no sub-topics are recorded for %.',
      v_version;
  end if;

  select string_agg(o.label || ' (' || o.direction || ')', ', '
                    order by o.subtopic_code, o.iro_key, o.direction)
    into v_missing
    from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

  -- ⚠️ NAMED, NOT COUNTED. materiality_lead_submit does the same at 20260844:117-136 and for the
  -- same reason: a caller told "3 outstanding" must go and find them, and a caller told which three
  -- can finish. Both directions of every sub-topic are listed, because a sub-topic submitted for
  -- harm and not for benefit is not finished.
  if v_missing is not null then
    raise exception
      'These are not submitted yet: %. Every sub-topic in scope must be submitted — once for harm '
      'and once for benefit — by whoever determined it, before the assessment can be finalised. '
      'Contributors submit theirs from their own link.', v_missing;
  end if;

  -- ── The write ───────────────────────────────────────────────────────────────────────────────
  -- version is omitted: materiality_finalisation_allocate_version assigns it under a per-assessment
  -- advisory lock, and refuses a caller-supplied one.
  --
  -- user_id is passed explicitly rather than left to its default. The default IS auth.uid() and
  -- would be correct — SECURITY DEFINER changes the executing role, not the JWT claim the helper
  -- reads — but this value was already selected under `a.user_id = auth.uid()` above, so passing it
  -- makes the composite FK check a real second assertion rather than a restatement of the default.
  insert into public.materiality_finalisations (assessment_id, user_id, standard_version)
  values (p_assessment_id, v_user_id, v_version)
  returning version, finalised_at into v_no, v_at;

  insert into public.materiality_finalisation_requirements
    (assessment_id, version, user_id, dr_code, topic_code, title, datapoints, sort_order)
  select p_assessment_id, v_no, v_user_id,
         r.dr_code, r.topic_code, r.title, r.datapoints, r.sort_order
    from public.mr_esrs_disclosure_requirements r
   where r.standard_version = v_version;

  get diagnostics v_rows = row_count;

  -- Checked, not assumed. v_req_count proved rows exist a moment ago, so a zero here would mean
  -- something changed underneath this transaction — worth failing on rather than returning a
  -- finalisation with an empty requirement set.
  if v_rows = 0 then
    raise exception
      'The requirements could not be copied, so nothing has been finalised. Nothing is lost — try '
      'again, and tell us if it keeps happening.';
  end if;

  -- ── Was anything different from last time? ──────────────────────────────────────────────────
  -- ⚠️ NULL ON THE FIRST VERSION, NEVER false. "There was nothing to compare against" and "nothing
  -- changed" are different facts, and collapsing them would let a UI print "no change since the
  -- previous version" on a first finalisation that has no previous version.
  select max(f.version) into v_prev
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
     and f.version < v_no;

  if v_prev is null then
    v_changed := null;
  else
    -- Symmetric difference over the copied columns. EXCEPT ALL treats NULL as equal to NULL, which
    -- is what is wanted: datapoints is null on every esrs_2026 row and two nulls are not a change.
    select count(*) > 0 into v_changed
      from (
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev)
        union all
        (select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_prev
         except all
         select dr_code, topic_code, title, datapoints, sort_order
           from public.materiality_finalisation_requirements
          where assessment_id = p_assessment_id and version = v_no)
      ) diff;
  end if;

  return jsonb_build_object(
    'version',              v_no,
    'previous_version',     v_prev,
    'standard_version',     v_version,
    'finalised_at',         v_at,
    'requirements',         v_rows,
    'requirements_changed', v_changed
  );
end $$;

-- ── 8e · materiality_finalise_readiness ─ forked from 20260850 §4 ──────────────────
-- ⚠️ THE PAYLOAD GAINS KEYS AND LOSES NONE, so the worksheet screen keeps working unchanged while
-- it is updated to show the new ones. subtopic_code and direction still mean exactly what they
-- meant. A client reading only those two renders a sub-topic code where an IRO name would be
-- clearer — imprecise, never false — which is the right failure mode for the window between this
-- migration and the screen that consumes it.
create or replace function public.materiality_finalise_readiness(p_assessment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_version     text;
  v_req_count   int;
  v_scope_n     int;
  v_outstanding jsonb;
  v_count       int;
  v_latest      jsonb;
  v_ready       boolean := false;
  v_reason      text    := null;
  v_message     text    := null;
begin
  -- Ownership, checked exactly as materiality_finalise checks it, with the same sentence and the
  -- same refusal to tell the two cases apart.
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

  -- The latest finalisation, if any. Returned whatever the readiness verdict: an assessment that
  -- has been finalised and has since gained outstanding work is a real state, and the card needs
  -- both halves to describe it.
  select jsonb_build_object(
           'version', f.version,
           'finalised_at', f.finalised_at,
           'standard_version', f.standard_version)
    into v_latest
    from public.materiality_finalisations f
   where f.assessment_id = p_assessment_id
   order by f.version desc
   limit 1;

  if v_version is null then
    v_reason  := 'version_not_stated';
    v_message := 'This assessment does not state which ESRS version it was prepared under, so '
               'there is no set of disclosure requirements to freeze. Article 2(2) of Del. Reg. '
               'C(2026) 5010 requires the undertaking to state the version, and assuming one would '
               'be a false statement about which law was applied. State the version on the '
               'assessment, then finalise.';
  else
    select count(*) into v_req_count
      from public.mr_esrs_disclosure_requirements r
     where r.standard_version = v_version;

    select count(*) into v_scope_n
      from public.materiality_finalise_scope(p_assessment_id, v_version);

    select coalesce(jsonb_agg(jsonb_build_object(
             'subtopic_code', o.subtopic_code, 'iro_key', o.iro_key,
             'label', o.label, 'direction', o.direction)
             order by o.subtopic_code, o.iro_key, o.direction), '[]'::jsonb),
           count(*)
      into v_outstanding, v_count
      from public.materiality_finalise_outstanding(p_assessment_id, v_version) o;

    if v_req_count = 0 then
      v_reason  := 'no_requirements_for_version';
      v_message := format(
        'No disclosure requirements are held for %s, so finalising would freeze an empty set and '
        'record it as though it were the requirements in force. This is a gap in the platform''s '
        'reference data, not in your assessment, and nothing you can do on this screen will change '
        'it. Tell us and we will seed them.', v_version);
    elsif v_scope_n = 0 then
      v_reason  := 'no_scope';
      v_message := format(
        'This assessment has no sub-topics in scope, so there is nothing to finalise. Either the '
        'linked survey round has no included questions, or no sub-topics are recorded for %s.',
        v_version);
    elsif v_count > 0 then
      v_reason  := 'outstanding_determinations';
      v_message := format(
        'These are not submitted yet: %s. Every sub-topic in scope must be submitted — once for '
        'harm and once for benefit — by whoever determined it, before the assessment can be '
        'finalised. Contributors submit theirs from their own link.',
        (select string_agg(e->>'subtopic_code' || ' (' || (e->>'direction') || ')', ', ')
           from jsonb_array_elements(v_outstanding) e));
    else
      v_ready := true;
    end if;
  end if;

  return jsonb_build_object(
    'ready',                  v_ready,
    'reason',                 v_reason,
    'message',                v_message,
    'outstanding',            coalesce(v_outstanding, '[]'::jsonb),
    'outstanding_count',      coalesce(v_count, 0),
    'scope_count',            coalesce(v_scope_n, 0),
    'standard_version',       v_version,
    'requirements_available', coalesce(v_req_count, 0),
    'latest',                 v_latest
  );
end $$;

-- ⚠️ THE GRANTS THE DROPS TOOK. Restated in full for the two dropped functions, and re-issued for
-- the two replaced ones so this section is a complete statement of who may call what rather than a
-- diff against 20260850 that a reader has to go and find.
revoke all on function public.materiality_finalise_scope(uuid, text)       from public;
revoke all on function public.materiality_finalise_outstanding(uuid, text) from public;
revoke all on function public.materiality_finalise(uuid)                   from public;
revoke all on function public.materiality_finalise_readiness(uuid)         from public;

grant execute on function public.materiality_finalise_scope(uuid, text)       to authenticated;
grant execute on function public.materiality_finalise_outstanding(uuid, text) to authenticated;
grant execute on function public.materiality_finalise(uuid)                   to authenticated;
grant execute on function public.materiality_finalise_readiness(uuid)         to authenticated;

comment on function public.materiality_finalise_scope(uuid, text) is
  'The units of determination in scope for an assessment, as (subtopic_code, iro_key): the earliest linked round''''s included questions, or mr_esrs_subtopics for the given standard version when no round is linked, PLUS every row in materiality_custom_iros for the assessment. iro_key = '''''''' is the sub-topic taken as a whole. ONE DEFINITION, three callers — materiality_finalise, materiality_finalise_outstanding and materiality_finalise_readiness — because the screen''''s readiness and the RPC''''s refusal must not be able to disagree. The custom-IRO arm is what stops the FINAL gate reporting ready while a named IRO sits unscored, and it does not breach 20260844''''s enumerate-never-infer rule: materiality_custom_iros holds a name and a parent and no determination. RAISES on a null standard version rather than returning an empty scope, because an empty scope reads as "nothing outstanding" and therefore "ready to finalise" — a silent failure pointing the wrong way. SECURITY INVOKER: an RLS-hidden custom IRO would shrink scope the same wrong way, which cannot occur because mci_owner_all matches the assessment''''s own user_id and both entry points check ownership first.';

comment on function public.materiality_finalise_outstanding(uuid, text) is
  'Every (sub-topic, IRO, direction) in scope that is not yet submitted on the impact axis, with a printable label. Submitted, NOT complete: a §6.1 abstention with every dimension null is a real answer the board report renders. Both directions always. Composes the LABEL ITSELF so materiality_finalise and materiality_finalise_readiness cannot print the same outstanding item differently — a sub-topic with two named IROs would otherwise read as one code repeated three times. Carries the axis predicate 20260854 added to materiality_lead_submit and did not reach here; without it the first financial-axis row would report a submitted sub-topic as outstanding. Has nothing of its own to refuse: a null standard version raises inside materiality_finalise_scope and propagates.';


-- =====================================================================
-- 9. The record, where it will be read
-- =====================================================================
comment on table public.materiality_impact_determinations is
  'Recorded determinations on BOTH materiality axes and at TWO GRANULARITIES, despite the name. The table was created (20260838) when only the impact axis and only the sub-topic existed, and was named after both; 20260854 added axis and 20260855 added iro_key rather than renaming, because a rename would break every foreign key, RPC, policy and client read for a cosmetic gain. READ THE NAME AS HISTORICAL. The primary key is (assessment_id, subtopic_code, axis, direction, iro_key). iro_key = '''' is the sub-topic taken as a whole and is what every pre-20260855 row holds; a non-empty value names a row in materiality_custom_iros. A QUERY THAT DOES NOT FILTER ON iro_key RETURNS BOTH GRANULARITIES AND WILL DOUBLE A COUNT — read materiality_impact_subtopic_determinations instead, which pins the predicate.';

comment on table public.materiality_impact_assignee_determinations is
  'Pre-override snapshot of a contributor''s determination, on either axis and at either granularity. Same misnomer as its parent and for the same reason. Its primary key and its parent foreign key gained axis in 20260854 and iro_key in 20260855; they must stay in step with the parent primary key, which is what forced this table into both migrations.';


-- =====================================================================
-- 10. Verification — what the database can check about itself
-- =====================================================================
-- ⚠️ NOT CEREMONY. Three of this migration's failure modes are SILENT AT INSTALL:
--   (a) a missed ON CONFLICT target — PL/pgSQL does not plan a function body at CREATE time, so a
--       stale four-column target installs cleanly and raises 42P10 at the first customer save;
--   (b) a key or FK left at four columns by a partially-run file;
--   (c) THE VIEW LOSING security_invoker, which does not fail — it succeeds, for everybody, on
--       everybody's data.
-- None would be caught by "the migration completed without error", and none is visible to
-- scripts/check-sql.py, which is a syntax checker and says so in its own header.
do $$
declare
  v_def   text;
  v_opts  text[];
  v_names text[];
  v_ver   int;
  v_iro   int;
  v_lock  int;
  v_fn    text;
  v_stale text[] := '{}';
begin
  -- ── 10.1 the column, on both tables, not null, defaulted ─────────────────────────────────────
  select coalesce(column_default, '(none)') into v_def from information_schema.columns
   where table_schema='public' and table_name='materiality_impact_determinations' and column_name='iro_key';
  if v_def is null then
    raise exception 'materiality_impact_determinations.iro_key does not exist. §2 did not apply.';
  end if;
  -- ⚠️ REPORTS WHAT IT FOUND. If a future Postgres renders the default differently this must be
  -- diagnosable in one read, not a bare disagreement — the same rule CLAUDE.md sets for error text:
  -- state what was observed, never what probably caused it.
  if v_def is distinct from '''''::text' then
    raise exception
      'materiality_impact_determinations.iro_key has lost its '''' default. Found: %. That default '
      'is what keeps impact_save_determination correct without naming the column; without it those '
      'writers would fail on a NOT NULL rather than write a sub-topic determination.', v_def;
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='materiality_impact_determinations'
                    and column_name='iro_key' and is_nullable='NO') then
    raise exception 'materiality_impact_determinations.iro_key is nullable. A primary-key column cannot be, so §4''s key is not what it claims.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='materiality_impact_assignee_determinations'
                    and column_name='iro_key' and is_nullable='NO') then
    raise exception 'materiality_impact_assignee_determinations.iro_key is missing or nullable.';
  end if;

  -- ── 10.2 both primary keys are the five columns, IN ORDER ────────────────────────────────────
  -- Order is asserted, not membership: §4 argues iro_key LAST so the leading four columns still
  -- serve every existing index prefix. The same five columns rearranged satisfy uniqueness and
  -- quietly lose that.
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='public.materiality_impact_determinations'::regclass and c.contype='p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction, iro_key)' then
    raise exception 'Determination primary key is not the expected five columns in order. Found: %', coalesce(v_def,'(none)');
  end if;
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conrelid='public.materiality_impact_assignee_determinations'::regclass and c.contype='p';
  if v_def is distinct from 'PRIMARY KEY (assessment_id, subtopic_code, axis, direction, iro_key)' then
    raise exception 'Snapshot primary key is not the expected five columns in order. Found: %', coalesce(v_def,'(none)');
  end if;

  -- ── 10.3 the recreated parent FK ─────────────────────────────────────────────────────────────
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
   where c.conname='materiality_impact_assignee_determinations_parent_fkey';
  if v_def is null then
    raise exception 'The snapshot parent FK was dropped in §4 and not recreated. The snapshot table is now unbound from its parent.';
  end if;
  if position('iro_key' in v_def) = 0 then
    raise exception 'The snapshot parent FK does not name iro_key: %', v_def;
  end if;
  if position('ON DELETE CASCADE' in v_def) = 0 then
    raise exception 'The snapshot parent FK lost ON DELETE CASCADE: %', v_def;
  end if;

  -- ── 10.4 the view, and the one setting on it that fails by succeeding ────────────────────────
  -- ⚠️ THE MOST IMPORTANT ASSERTION IN THIS BLOCK. A view without security_invoker runs as its
  -- OWNER, so RLS on the underlying table is evaluated as the owner and the view returns EVERY
  -- CUSTOMER'S DETERMINATIONS to any authenticated caller. There is no error, no empty result and
  -- nothing that looks wrong — the only reader positioned to notice is one holding two customers'
  -- data side by side. Checked here because nothing else in the stack can check it.
  select c.reloptions into v_opts from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='materiality_impact_subtopic_determinations' and c.relkind='v';
  if v_opts is null or not ('security_invoker=true' = any(v_opts)) then
    raise exception
      'materiality_impact_subtopic_determinations is not security_invoker. It would run as its '
      'owner and return every customer''s determinations to any authenticated caller, silently. '
      'Found reloptions: %', coalesce(array_to_string(v_opts, ','), '(none)');
  end if;

  -- ── 10.5 the custom-IRO table is protected, and GRANTED ──────────────────────────────────────
  -- RLS is not a grant, and a grant is not RLS. Both are asserted because a new table is exactly
  -- where one of the two gets forgotten and the failure is silent in opposite directions.
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
                  where n.nspname='public' and c.relname='materiality_custom_iros' and c.relrowsecurity) then
    raise exception 'Row level security is not enabled on materiality_custom_iros.';
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname='public' and tablename='materiality_custom_iros' and policyname='mci_owner_all') then
    raise exception 'The mci_owner_all policy is missing; RLS is on and nothing is permitted.';
  end if;
  if not has_table_privilege('authenticated', 'public.materiality_custom_iros', 'SELECT') then
    raise exception 'authenticated holds no SELECT on materiality_custom_iros. The policy would permit rows nobody may read.';
  end if;

  -- ── 10.6 NO SURVIVING FOUR-COLUMN ON CONFLICT, in any of the three ───────────────────────────
  -- The check the database cannot make for itself. Reads each installed body back and looks for the
  -- old targets — both the four-column one this file replaces and the three-column one 20260854
  -- replaced, in case something reverted further than expected. The closing parenthesis is what
  -- makes the four-column search unambiguous: the new target is a strict extension of the old
  -- string and would match without it.
  for v_fn in
    select p.oid::regprocedure::text
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('impact_save_determination', 'materiality_impact_determination_lock')
  loop
    if position('on conflict (assessment_id, subtopic_code, axis, direction)' in pg_get_functiondef(v_fn::regprocedure)) > 0
       or position('on conflict (assessment_id, subtopic_code, direction)' in pg_get_functiondef(v_fn::regprocedure)) > 0 then
      v_stale := v_stale || v_fn;
    end if;
  end loop;
  if array_length(v_stale, 1) > 0 then
    raise exception
      'These installed function(s) still carry a stale ON CONFLICT target and would raise SQLSTATE '
      '42P10 at their first call, not here: %. PL/pgSQL does not plan a function body at CREATE '
      'time, which is why this had to be checked rather than trusted.',
      array_to_string(v_stale, ', ');
  end if;

  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='impact_save_determination') <> 2 then
    raise exception
      'Expected exactly two impact_save_determination overloads (10 args and 12). A different count '
      'means §7 created a new signature rather than replacing an existing one — and 10.6 above '
      'would not have noticed, because it checks whatever is there.';
  end if;

  -- ── 10.7 three triggers, in the order §5 argued for ──────────────────────────────────────────
  select array_agg(t.tgname order by t.tgname) into v_names
    from pg_trigger t
   where t.tgrelid='public.materiality_impact_determinations'::regclass and not t.tgisinternal;
  v_ver  := array_position(v_names,'materiality_impact_determination_assessment_version_trg');
  v_iro  := array_position(v_names,'materiality_impact_determination_iro_exists_trg');
  v_lock := array_position(v_names,'materiality_impact_determination_lock_trg');
  if v_ver is null or v_iro is null or v_lock is null then
    raise exception 'A row trigger is missing from the determination table after this migration: %', v_names;
  end if;
  if not (v_ver < v_iro and v_iro < v_lock) then
    raise exception
      'Trigger firing order is not version -> iro_exists -> lock. Found: %. A caller would be told '
      'the least fundamental of the three facts that are wrong with their row.', v_names;
  end if;

  -- ── 10.8 every scope enumeration learned about custom IROs ───────────────────────────────────
  -- Both of them. Checking only one is how this migration would reproduce the defect it exists to
  -- fix, one gate further along.
  if position('materiality_custom_iros' in pg_get_functiondef('public.materiality_lead_submit(uuid)'::regprocedure)) = 0 then
    raise exception 'materiality_lead_submit does not read materiality_custom_iros; §8a did not apply. A named IRO would leave the worksheet reporting complete while unscored.';
  end if;
  if position('materiality_custom_iros' in pg_get_functiondef('public.materiality_finalise_scope(uuid,text)'::regprocedure)) = 0 then
    raise exception 'materiality_finalise_scope does not read materiality_custom_iros; §8b did not apply. The FINAL gate would report ready with a named IRO unscored, and nothing runs after it.';
  end if;
  select pg_get_function_result(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='materiality_finalise_scope';
  if v_def is distinct from 'TABLE(subtopic_code text, iro_key text)' then
    raise exception 'materiality_finalise_scope did not gain its iro_key column. Found: %', coalesce(v_def,'(not installed)');
  end if;
  if position('d.axis          = ''impact''' in pg_get_functiondef('public.materiality_finalise_outstanding(uuid,text)'::regprocedure)) = 0 then
    raise exception 'materiality_finalise_outstanding did not receive the axis predicate; §8b did not apply.';
  end if;

  -- ── 10.9 the grants the DROPs took ───────────────────────────────────────────────────────────
  -- §8 drops two functions, and a DROP takes privileges with it. Without these the readiness card
  -- fails with "permission denied for function", which reads to a customer as the feature being
  -- broken rather than as a migration being half-applied.
  if not has_function_privilege('authenticated', 'public.materiality_finalise_scope(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.materiality_finalise_outstanding(uuid,text)', 'EXECUTE') then
    raise exception 'authenticated lost EXECUTE on a finalise helper. §8 dropped it and the grant was not re-issued.';
  end if;

  raise notice 'Verified: iro_key on both tables, both keys five columns in order, snapshot FK rebuilt with cascade, view is security_invoker, custom-IRO table has RLS AND grants, no stale conflict target, three triggers in order, both scope enumerations read custom IROs, function grants restored.';
end $$;

commit;


-- =====================================================================
-- 11. WHAT THE DATABASE CANNOT CHECK — GREP THESE BY HAND
-- =====================================================================
-- ⚠️ EIGHT CLIENT READ SITES SELECT FROM THE DETERMINATION TABLE EXPECTING ONE ROW PER SUB-TOPIC
-- AND DIRECTION. After §2 they silently receive the custom IROs as well. Nothing raises; a count
-- doubles and a list grows. This is the single largest risk in this migration and it lives
-- entirely outside the database.
--
--   grep -rn "from('materiality_impact_determinations')" app lib
--
-- Expect exactly these, and decide for each whether it wants the VIEW (the sub-topic as a whole) or
-- the TABLE plus an explicit iro_key predicate:
--   app/dashboard/materiality/worksheet/page.tsx:76
--   app/dashboard/materiality/worksheet/[id]/page.tsx:261
--   app/dashboard/materiality/worksheet/[id]/determinations/page.tsx:143  (+ :232 write)
--   app/dashboard/materiality/worksheet/[id]/determine/page.tsx:178       (+ :300 write)
--   app/dashboard/materiality/worksheet/[id]/register/page.tsx:225
--   app/dashboard/materiality/assessment/[id]/edit/page.tsx:83
--   app/dashboard/stakeholder/[id]/report/page.tsx:302
-- The two WRITE sites are different in kind and must NOT be pointed at the view: a write has to
-- name iro_key or take its default deliberately, in plain sight.
--
--   grep -rn "from('materiality_impact_assignee_determinations')" app lib
--   -> app/dashboard/materiality/worksheet/[id]/determinations/page.tsx:146
--
-- ⚠️ AND THE ONE THAT IS NOT A GREP. lib/materiality/register.ts omits a sub-topic with no survey
-- result as 'no_substantive_answers', detail "Nobody who was asked gave a rating". For a custom IRO
-- created after the round closed, NOBODY WAS EVER ASKED — that sentence is a false statement about
-- the customer's respondents, printed in a board paper. It needs a new OmissionReason
-- ('never_in_survey_scope') and its own sentence, in register.ts with the prose constant beside
-- CONTRAST_UNAVAILABLE in lib/materiality/boardReport.ts. boardReport.ts:963-974 already settles
-- the hard half — "SURVEY COVERAGE IS NOT A CONDITION … a topic with no survey answers still
-- appears in the register's `omitted`, SAID AS WHAT IT IS" — so the architecture anticipated this
-- case and only the vocabulary is missing. THIS SHIPS WITH 1b. Without it the migration does not
-- leave a gap, it leaves a wrong sentence.


-- =====================================================================
-- HOW TO EXERCISE THIS BY HAND — run separately, AFTER this migration
-- =====================================================================
-- ⚠️ READ THIS FIRST. THESE RUN IN THE SUPABASE SQL EDITOR, WHICH IS NOT THE APP'S AUTH CONTEXT,
-- AND EVERY EARLIER SET OF HAND TESTS IN THIS REPO GOT THAT WRONG.
--
-- The editor connects as an owner role with NO AUTHENTICATED USER, so auth.uid() returns NULL.
-- Two separate consequences, and they are worth telling apart because they need different fixes:
--
--   (1) user_id IS `not null default auth.uid()` on materiality_custom_iros,
--       materiality_impact_determinations and their siblings. A test that inserts without naming
--       user_id gets NULL from the default and fails on NOT NULL — pointing at a column, not at
--       the cause. FIXED BY CARRYING user_id FROM THE PARENT ROW, which every insert below now
--       does. No JWT needed.
--
--   (2) materiality_lead_submit is SECURITY DEFINER and checks `a.user_id = auth.uid()`. NO
--       FIXTURE CAN GET PAST THAT — it is the security model working exactly as designed, and
--       "the assessment may belong to another account" is the correct answer to a request with no
--       identity. Only test (c) hits this, and only (c) needs the preamble below.
--
-- Which tests need what:
--   (a) (b) (e)   user_id carried explicitly — run as written
--   (c)           NEEDS THE AUTH PREAMBLE
--   (d) (f)       neither: materiality_finalise_outstanding takes no identity, and
--                 impact_save_determination is token-based and names user_id itself
--
-- ⚠️ AND WHAT NONE OF THEM PROVE. The editor's role BYPASSES ROW LEVEL SECURITY. These exercise
-- the LOGIC — completeness, refusals, keys, defaults — and never the POLICIES. Test (e) in
-- particular CANNOT detect a view that has lost security_invoker, because the bypass hides exactly
-- the failure that setting exists to prevent. §10.4 checks that, at install, and is the only thing
-- that does. Do not read a green (e) as the view being safe.
--
-- Substitute a real assessment id and, in (f), a real token. Every test rolls back.
--
--
-- ─────────────────────────────────────────────────────────────────────
-- THE AUTH PREAMBLE — for test (c) only
-- ─────────────────────────────────────────────────────────────────────
-- ⚠️ STEP 0 WAS RUN ON THIS PROJECT ON 24 Aug 2026 AND THE ANSWER IS RECORDED HERE SO THE NEXT
-- PERSON DOES NOT REPEAT IT: this Supabase build's auth.uid() reads BOTH GUCs, coalesced, so the
-- JSON claim in Step 1 is sufficient on its own and the flat-string line stays commented out.
-- Verified by running test (c) end to end, not by reading the definition alone.
--
-- Re-run Step 0 anyway IF THE PLATFORM IS UPGRADED. Which GUC auth.uid() reads is a property of the
-- Supabase build, not of this repo, so this recorded answer can go stale without anything here
-- changing — and it would go stale silently, with the preamble simply resolving NULL.
--
-- STEP 0. READ WHAT auth.uid() ACTUALLY READS, RATHER THAN ASSUMING IT. One command:
--
--     select pg_get_functiondef('auth.uid'::regproc);
--
-- Every Supabase build resolves 'sub' from one or both of:
--     current_setting('request.jwt.claims',    true)::jsonb ->> 'sub'   -- JSON object
--     current_setting('request.jwt.claim.sub', true)                    -- flat string, older PostgREST
-- Builds that read both use coalesce, so setting the first alone satisfies them. The preamble sets
-- the first. If Step 0 shows your build reads ONLY the flat string, add the commented line.
--
-- STEP 1. Set the claim and PROVE IT TOOK before running anything that depends on it.
--
--   begin;
--     -- Third argument true = transaction-local, so it is gone at rollback and cannot leak into
--     -- whatever you run next in this editor. Derived FROM THE ASSESSMENT so there is no user id
--     -- to paste twice and no way for the two to disagree.
--     select set_config('request.jwt.claims',
--                       json_build_object('sub', a.user_id, 'role', 'authenticated')::text, true)
--       from public.materiality_assessments a
--      where a.id = '<assessment-uuid>';
--
--     -- older PostgREST only — uncomment if Step 0 showed the flat string and nothing else:
--     -- select set_config('request.jwt.claim.sub', a.user_id::text, true)
--     --   from public.materiality_assessments a where a.id = '<assessment-uuid>';
--
--     -- ⚠️ THE SELF-CHECK. RUN IT AND READ IT. Do not skip to the test.
--     select auth.uid() as resolved,
--            (select user_id from public.materiality_assessments
--              where id = '<assessment-uuid>') as expected;
--
--     -- The two must be EQUAL AND NON-NULL. A NULL `resolved` means one of two things and both
--     -- stop the test: the claim shape is wrong for your build (go back to Step 0), or the
--     -- assessment id does not exist, in which case set_config ran over zero rows and set nothing.
--     -- ⚠️ EVERYTHING AFTER A NULL HERE IS MEANINGLESS RATHER THAN MERELY WRONG: lead_submit would
--     -- refuse on ownership and the refusal would look like a finding about scope.
--
--   ... test (c) here ...
--   rollback;
--
--
-- (a) A custom IRO can be named, and determined alongside its parent sub-topic.
--   begin;
--     insert into public.materiality_custom_iros
--       (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
--     select a.id, a.user_id, d.subtopic_code, a.standard_version, 'valencia-water',
--            'Water scarcity at the Valencia plant'
--       from public.materiality_assessments a
--       join public.materiality_impact_determinations d on d.assessment_id = a.id
--      where a.id = '<assessment-uuid>' and d.iro_key = '' limit 1;
--
--     insert into public.materiality_impact_determinations
--       (assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--        evidence_in_view, iro_key, status)
--     select assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--            false, 'valencia-water', 'draft'
--       from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' and iro_key = '' limit 1;
--   rollback;
--   EXPECT: INSERT 0 1 twice. Before this migration the second was a unique violation.
--   ⚠️ user_id IS NAMED IN BOTH. Drop it and you get "null value in column user_id violates
--   not-null constraint" — which names a column and not the missing auth context.
--
-- (b) PT410 refuses a determination naming an IRO nobody created.
--   begin;
--     insert into public.materiality_impact_determinations
--       (assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--        evidence_in_view, iro_key, status)
--     select assessment_id, user_id, subtopic_code, standard_version, axis, direction, nature,
--            false, 'no-such-iro', 'draft'
--       from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>' and iro_key = '' limit 1;
--   rollback;
--   EXPECT: ERROR, SQLSTATE PT410, naming "no-such-iro". If it succeeds, §5's trigger did not take
--   and a determination can point at nothing.
--
-- (c) THE POINT OF THE WHOLE MIGRATION. An unscored custom IRO blocks the lead's gate, BY NAME.
--     ⚠️ RUN THE AUTH PREAMBLE ABOVE FIRST, IN THE SAME TRANSACTION, AND CHECK ITS SELF-CHECK.
--   begin;
--     select set_config('request.jwt.claims',
--                       json_build_object('sub', a.user_id, 'role', 'authenticated')::text, true)
--       from public.materiality_assessments a
--      where a.id = '<assessment-uuid>';
--
--     select auth.uid() as resolved,
--            (select user_id from public.materiality_assessments
--              where id = '<assessment-uuid>') as expected;    -- must match, must not be null
--
--     -- ⚠️ THE SUB-TOPIC MUST BE ONE THE LEAD HOLDS. materiality_lead_submit walks HELD scope —
--     -- scope minus everything delegated — so an IRO hung off a DELEGATED sub-topic is the
--     -- contributor's and correctly does not appear in the lead's refusal. Picking one at random
--     -- would make a passing migration look like a failing one. The not-exists is what stops that.
--     insert into public.materiality_custom_iros
--       (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
--     select a.id, a.user_id, d.subtopic_code, a.standard_version, 'valencia-water',
--            'Water scarcity at the Valencia plant'
--       from public.materiality_assessments a
--       join public.materiality_impact_determinations d on d.assessment_id = a.id
--      where a.id = '<assessment-uuid>'
--        and d.iro_key = ''
--        and not exists (select 1 from public.materiality_impact_assignment_subtopics x
--                         where x.assessment_id = a.id and x.subtopic_code = d.subtopic_code)
--      limit 1;
--
--     -- If that inserted 0 rows, every sub-topic on this assessment is delegated and the lead has
--     -- nothing to submit. lead_submit will say so in its own words; that is a different (correct)
--     -- refusal and this test cannot run on that assessment.
--
--     select public.materiality_lead_submit('<assessment-uuid>');
--   rollback;
--   EXPECT: ERROR "These are not finished yet: …". OBSERVED VERBATIM ON 24 Aug 2026, on an
--   assessment with one named IRO under E1.3 — recorded so a future run has something exact to
--   compare against rather than a paraphrase:
--
--       These are not finished yet: E1.3 / Water scarcity at the Valencia plant (negative),
--       E1.3 / Water scarcity at the Valencia plant (positive).
--
--   Read that as the three separate things §8a had to do, all visible in one line: the IRO reached
--   HELD scope at all, BOTH directions were demanded of it, and it is identified by NAME rather
--   than by a bare code.
--
--   ⚠️ AND THIS TEST IS ALSO WHAT COVERS materiality_lead_submit'S `UNVERIFIED` STATUS.
--   scripts/check-sql.py reports that function as UNVERIFIED rather than PASS — see its LIMIT (3):
--   the function declares arrays of public.materiality_iro_ref, libpg_query has no catalogue for a
--   type this file creates, so its declarations are parsed but not resolved. Static checking stops
--   there. Running (c) exercises those declarations for real — the composite array is built,
--   aggregated, unnested and compared — which is the only place that gap is closed. IF THIS TEST IS
--   EVER DROPPED, materiality_lead_submit BECOMES THE ONE FUNCTION IN THIS FILE WITH NEITHER STATIC
--   NOR RUNTIME COVER.
--     • THE IRO'S NAME MUST APPEAR IN THE LIST. Other unfinished sub-topics may be listed too —
--       that is fine and is not the thing under test. What is under test is that the IRO is there
--       and is identified by its NAME rather than by a bare sub-topic code.
--     • A refusal naming only sub-topic codes means §8a's label did not take.
--     • NO REFUSAL AT ALL — a JSON result — means §8a's scope arm did not take, and the worksheet
--       reports complete while an IRO sits unscored. THAT IS THE DEFECT THIS FILE EXISTS TO
--       PREVENT and it must not be signed off without seeing the refusal.
--     • "No assessment with that reference is open to you" means the preamble did not take. That is
--       an auth failure wearing the clothes of a scope finding — go back to Step 0, do not
--       interpret it.
--
-- (d) The same, at the FINAL gate. Run with the same IRO inserted and not determined. No preamble:
--     materiality_finalise_outstanding takes no identity and checks none — both its entry points do.
--   begin;
--     insert into public.materiality_custom_iros
--       (assessment_id, user_id, subtopic_code, standard_version, iro_key, name)
--     select a.id, a.user_id, d.subtopic_code, a.standard_version, 'valencia-water',
--            'Water scarcity at the Valencia plant'
--       from public.materiality_assessments a
--       join public.materiality_impact_determinations d on d.assessment_id = a.id
--      where a.id = '<assessment-uuid>' and d.iro_key = '' limit 1;
--
--     select * from public.materiality_finalise_outstanding('<assessment-uuid>', '<version>');
--   rollback;
--   EXPECT: rows whose label reads "<code> / Water scarcity at the Valencia plant", for BOTH
--   directions. An empty result with an undetermined IRO present is the false all-clear.
--
-- (e) The view hides the custom IRO, and the table does not.
--   begin;
--     -- ... run (a)'s two inserts here, in this transaction ...
--     select count(*) from public.materiality_impact_determinations
--      where assessment_id = '<assessment-uuid>';
--     select count(*) from public.materiality_impact_subtopic_determinations
--      where assessment_id = '<assessment-uuid>';
--   rollback;
--   EXPECT: the first count exceeds the second by exactly the number of custom-IRO rows. If they
--   are equal, the view is not filtering and §6 did not take.
--   ⚠️ THIS SAYS NOTHING ABOUT security_invoker — see the RLS note at the top. A green result here
--   is consistent with a view that would leak every customer's rows.
--
-- (f) The existing contributor path still writes the sub-topic, not an IRO. No preamble: it is
--     token-based, calls auth.uid() nowhere, and names user_id itself.
--   begin;
--     select impact_save_determination('<token-uuid>', '<subtopic>', 'negative', 'actual',
--            null, null, null, null, '{}'::text[], '{}'::text[], 'short', null);
--     select iro_key, axis from public.materiality_impact_determinations
--      where subtopic_code = '<subtopic>' and direction = 'negative';
--   rollback;
--   EXPECT: iro_key = '' and axis = 'impact'. If this raises 42P10, §7c missed the 12-argument
--   overload — the live path, and the most important of these six.
