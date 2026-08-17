-- 20260825_survey_thresholds.sql
--
-- SURVEY AGGREGATION — FILE 1 of 2. THE DISCLOSED CONSTANTS. Run before
-- 20260826_survey_aggregate.sql, which reads the snapshot columns this file adds.
--
--   mr_survey_thresholds          reference table: key, value, DEFINITION, source. Seeded, four rows.
--   materiality_survey_rounds     three new columns, snapshotted from that table at round creation
--   materiality_survey_round_guard  extended: the snapshot is immutable once the round freezes
--
-- No RPC, no aggregation, no UI. Nothing reads any of this yet; file 2 does.
--
--
-- =====================================================================
-- ⚠️ THREE PARTS, AND EACH SOLVES SOMETHING THE OTHER TWO DO NOT
-- =====================================================================
-- Spec v9 §6.2.6 and §6.4 both require their thresholds to be DISCLOSED CONSTANTS, stated in the
-- assumptions register, "not derived and not tuned silently" — §10's rule applies to them as hard as
-- to anything else. That requirement decomposes into three, and one part alone satisfies none of it:
--
-- (1) THE REFERENCE TABLE carries a printable DEFINITION per threshold. A number with no definition
--     is not a disclosed constant — the assumptions register has to print a sentence, not a decimal,
--     and that sentence must live somewhere queryable rather than inside a function body or a
--     comment. Hence a `definition` column that is NOT NULL, and a `source` naming where the value
--     came from.
--
-- (2) THE PER-ROUND SNAPSHOT is the part that actually matters, and the precedent is already in this
--     schema. 20260819 made anonymity_floor per-round rather than global, and said why: "so raising
--     it later cannot silently restate what a historical round's aggregate showed." Every threshold
--     here has the identical hazard, and it is sharper than it looks because THE AGGREGATION IS
--     COMPUTED LIVE AND NOTHING IS STORED. Tune a margin in March and a disagreement register
--     published in January silently acquires or loses entries the next time anyone opens it. The
--     snapshot is what makes a historical round's register reproducible.
--
-- (3) THE PAYLOAD ECHO (file 2) returns every threshold actually used, so a report generated from it
--     states its own basis without a second lookup and without trusting that the table has not moved
--     since.
--
--
-- =====================================================================
-- ⚠️ A SNAPSHOT THAT CAN BE EDITED IS NOT A SNAPSHOT — HENCE THE GUARD EXTENSION
-- =====================================================================
-- Part (2) fails completely if the round's copy can be UPDATEd afterwards, and materiality_survey_
-- rounds grants UPDATE to authenticated under an owner policy. So the existing BEFORE UPDATE guard
-- is extended: the four constants (anonymity_floor plus the three new ones) are IMMUTABLE ONCE
-- frozen_at IS SET.
--
-- Not immutable from creation, deliberately. Before any response exists there is nothing to restate,
-- and a customer adjusting the floor on a draft round is doing something legitimate. frozen_at is
-- the right moment because it is already the moment the question set stops being editable (§3.3) —
-- once evidence exists, the basis for reading it is fixed too. One moment, two freezes, same reason.
--
--
-- =====================================================================
-- ⚠️ THE FOUR VALUES ARE CHOSEN, NOT DERIVED, AND THE FILE SAYS SO
-- =====================================================================
-- §10's rule and §6.2's own posture: the product's job is not to pick the one true constant — none
-- exists — but to make the choice explicit, apply it uniformly, and print it where an auditor reads
-- it. Each seeded value below carries its reasoning inline. None is empirical; there is no response
-- data to calibrate against and inventing a derivation would be worse than admitting a judgement.
--
-- ⚠️ NO DIVERGENCE THRESHOLDS ARE SEEDED. §6.4's high/low bands compare the survey against the
-- PREPARER's determination, and that register is not built — there is no link from
-- materiality_survey_rounds to materiality_assessments, and the preparer's band lives inside a jsonb
-- blob whose shape is owned by lib/materiality.ts. Seeding thresholds for a register that does not
-- exist would put two unused rows in a table whose whole purpose is that everything in it is
-- disclosed and used. They get added in the same pass that builds the register.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, before 20260826. Re-runnable — CREATE
-- TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, guarded CREATE POLICY, upserting seed, CREATE OR
-- REPLACE on the guard. No client change ships with it and none is needed.

begin;

-- =====================================================================
-- mr_survey_thresholds
-- =====================================================================
create table if not exists public.mr_survey_thresholds (
  key         text        not null,
  value       numeric     not null,

  -- ⚠️ NOT NULL ON PURPOSE. This column is the reason the table exists rather than the value being a
  -- constant in a function body. The assumptions register prints THIS, and a threshold whose
  -- definition is "3" cannot be disclosed, only stated.
  definition  text        not null check (length(btrim(definition)) > 0),
  -- Where the value came from. 'judgement' is an honest answer and the most common one here; what is
  -- not acceptable is silence, which reads as a derivation nobody can find.
  source      text        not null check (length(btrim(source)) > 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint mr_survey_thresholds_pkey primary key (key)
);

comment on table public.mr_survey_thresholds is
  'Disclosed constants for the survey aggregation (spec v9 §6.2.6, §10). Each row carries a printable DEFINITION, because the assumptions register has to print a sentence and not a decimal. THE VALUES HERE ARE DEFAULTS FOR NEW ROUNDS ONLY — materiality_survey_rounds snapshots them at creation, so changing a value here can never restate a historical round''s register. Same discipline, and the same reason, as anonymity_floor being per-round rather than global (20260819).';

comment on column public.mr_survey_thresholds.definition is
  'The sentence the assumptions register prints. NOT NULL because a threshold with no definition is not a disclosed constant — it is an unexplained number in a compliance report.';

comment on column public.mr_survey_thresholds.source is
  'Where the value came from. ''judgement'' is honest and is the correct answer for all four seeded rows; silence is not, because it reads as a derivation a reader cannot find.';

drop trigger if exists mr_survey_thresholds_set_updated_at on public.mr_survey_thresholds;
create trigger mr_survey_thresholds_set_updated_at
  before update on public.mr_survey_thresholds
  for each row execute function public.sbti_set_updated_at();

-- Grants and RLS — the mr_* posture, copied from 20260818.
revoke all on public.mr_survey_thresholds from anon;
revoke all on public.mr_survey_thresholds from authenticated;
revoke all on public.mr_survey_thresholds from service_role;
grant select on public.mr_survey_thresholds to anon, authenticated, service_role;

alter table public.mr_survey_thresholds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'mr_survey_thresholds'
      and policyname = 'mr_survey_thresholds_read'
  ) then
    create policy mr_survey_thresholds_read on public.mr_survey_thresholds
      for select to anon, authenticated using (true);
  end if;
end $$;

-- =====================================================================
-- Seed — four rows. Every value is a judgement, and every one says so.
-- =====================================================================
insert into public.mr_survey_thresholds (key, value, definition, source) values

  ('anonymity_floor', 3,
   'The minimum number of respondents who answered a breakdown cell (a track, respondent group or '
   'stakeholder category within one sub-topic) before that cell may be shown. Cells below it are '
   'suppressed entirely, together with enough further cells that the suppressed figures cannot be '
   'recovered by subtracting the shown cells from the published total. The overall figure for a '
   'sub-topic is shown at any number of responses: identification risk lies in the splits, not in '
   'the total.',
   'Judgement. Spec v9 §9 open decision 4 proposes 3 and remains open; 3 is the smallest floor at '
   'which a shown cell cannot be resolved to one person by elimination between two others.'),

  ('polarised_extreme_min_n', 2,
   'The minimum number of respondents at EACH end of the scale (choosing 1, and choosing 3) before '
   'a sub-topic can be reported as polarised. Together with the middle-share test below, this is '
   'what "responses split across non-adjacent categories" means arithmetically.',
   'Judgement. Set at 2 rather than 1 so that a single dissenting respondent cannot make a topic '
   'read as a split room, which would be a finding about one person reported as a finding about '
   'the organisation.'),

  ('polarised_middle_max_share', 0.20,
   'The largest share of answers that may sit in the middle category (2) for a sub-topic to be '
   'reported as polarised. Below this the middle is hollow, which is what distinguishes a genuine '
   'split from an ordinary spread of opinion.',
   'Judgement. A fifth is low enough that the distribution is visibly bimodal rather than merely '
   'wide, and it is stated as a share rather than a count so it does not tighten as a round grows.'),

  ('top_box_gap_margin', 0.25,
   'The difference in top-box share (the proportion choosing 3, "needs significant strategic focus") '
   'above which two groups are reported as differing materially. Used for two distinct comparisons: '
   'between respondent groups answering the SAME sub-topic (the disagreement register, §6.2.6), and '
   'between the paired S1 and S2 sub-topics answered by different populations (the S1/S2 contrast, '
   'which is not disagreement).',
   'Judgement. 25 percentage points is large enough that a gap survives the small response counts a '
   'screening survey produces, and it is deliberately ONE constant serving both comparisons until '
   'there is evidence that they need different ones.')

on conflict (key) do update
  set value      = excluded.value,
      definition = excluded.definition,
      source     = excluded.source;

-- =====================================================================
-- The per-round snapshot
-- =====================================================================
-- Added nullable, backfilled, then set NOT NULL. ADD COLUMN ... NOT NULL with no default fails on a
-- table that already holds rows, and giving them a DDL default would put the values in two places
-- and let them drift from the table above — which is the whole thing this file exists to prevent.
alter table public.materiality_survey_rounds
  add column if not exists polarised_extreme_min_n    smallint,
  add column if not exists polarised_middle_max_share numeric,
  add column if not exists top_box_gap_margin         numeric;

-- ⚠️ THE BACKFILL IS AN HONEST APPROXIMATION AND IS THE ONE PLACE THIS FILE CANNOT BE EXACT.
-- A round created before this migration has no snapshot, and there is no record of what thresholds
-- it "would have used" — the aggregation did not exist. It therefore receives today's values, which
-- is the only available answer. Rounds created from here on snapshot at creation and are exact.
update public.materiality_survey_rounds r
   set polarised_extreme_min_n    = coalesce(r.polarised_extreme_min_n,
         (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'polarised_extreme_min_n')),
       polarised_middle_max_share = coalesce(r.polarised_middle_max_share,
         (select t.value          from public.mr_survey_thresholds t where t.key = 'polarised_middle_max_share')),
       top_box_gap_margin         = coalesce(r.top_box_gap_margin,
         (select t.value          from public.mr_survey_thresholds t where t.key = 'top_box_gap_margin'))
 where r.polarised_extreme_min_n is null
    or r.polarised_middle_max_share is null
    or r.top_box_gap_margin is null;

alter table public.materiality_survey_rounds
  alter column polarised_extreme_min_n    set not null,
  alter column polarised_middle_max_share set not null,
  alter column top_box_gap_margin         set not null;

alter table public.materiality_survey_rounds
  add constraint materiality_survey_rounds_polarised_middle_max_share_range
    check (polarised_middle_max_share >= 0 and polarised_middle_max_share <= 1)
  not valid;
alter table public.materiality_survey_rounds
  validate constraint materiality_survey_rounds_polarised_middle_max_share_range;

alter table public.materiality_survey_rounds
  add constraint materiality_survey_rounds_top_box_gap_margin_range
    check (top_box_gap_margin >= 0 and top_box_gap_margin <= 1)
  not valid;
alter table public.materiality_survey_rounds
  validate constraint materiality_survey_rounds_top_box_gap_margin_range;

comment on column public.materiality_survey_rounds.polarised_extreme_min_n is
  'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Minimum respondents at each end of the scale before a sub-topic is reported as polarised (§6.2.6). Immutable once frozen_at is set — see materiality_survey_round_guard.';
comment on column public.materiality_survey_rounds.polarised_middle_max_share is
  'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Largest share of answers that may sit in the middle category for a sub-topic to be reported as polarised (§6.2.6). Immutable once frozen_at is set.';
comment on column public.materiality_survey_rounds.top_box_gap_margin is
  'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Top-box difference above which two groups are reported as differing materially — used by the disagreement register AND the S1/S2 contrast (§6.2.6). Immutable once frozen_at is set.';

-- ── Snapshot on insert ────────────────────────────────────────────────────────
-- BEFORE INSERT, so the reference table is the single source of the defaults and the round holds a
-- copy that outlives any later edit to it. An explicit value passed by the caller is respected —
-- coalesce, not overwrite — because a customer choosing a stricter floor for a sensitive round is
-- doing something the design intends.
create or replace function public.materiality_survey_round_snapshot_thresholds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  select string_agg(k, ', ' order by k) into v_missing
    from unnest(array['polarised_extreme_min_n', 'polarised_middle_max_share', 'top_box_gap_margin']) k
   where not exists (select 1 from public.mr_survey_thresholds t where t.key = k);

  if v_missing is not null then
    raise exception
      'Cannot create a survey round: mr_survey_thresholds is missing %. The round snapshots its '
      'disclosed constants at creation, and a round with no snapshot would silently take whatever '
      'the table held on the day someone next opened its register (spec v9 §6.2.6, §10). Re-run '
      '20260825_survey_thresholds.sql.',
      v_missing;
  end if;

  new.polarised_extreme_min_n := coalesce(new.polarised_extreme_min_n,
    (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'polarised_extreme_min_n'));
  new.polarised_middle_max_share := coalesce(new.polarised_middle_max_share,
    (select t.value from public.mr_survey_thresholds t where t.key = 'polarised_middle_max_share'));
  new.top_box_gap_margin := coalesce(new.top_box_gap_margin,
    (select t.value from public.mr_survey_thresholds t where t.key = 'top_box_gap_margin'));

  return new;
end $$;

drop trigger if exists materiality_survey_rounds_snapshot_thresholds
  on public.materiality_survey_rounds;
create trigger materiality_survey_rounds_snapshot_thresholds
  before insert on public.materiality_survey_rounds
  for each row execute function public.materiality_survey_round_snapshot_thresholds();

-- ⚠️ anonymity_floor IS NOT SNAPSHOTTED BY THAT TRIGGER, AND DOES NOT NEED TO BE. It has carried
-- `not null default 3` since 20260819, so it is already per-round and already never null at BEFORE
-- INSERT — the trigger could not override it if it tried. What that leaves is two places holding the
-- number 3: the column default, and the seeded row above whose DEFINITION the report prints. Those
-- two must agree or the register cites a floor it did not apply, so the guard below makes the
-- agreement a fact rather than a coincidence.
do $$
declare
  v_seeded  numeric;
  v_default text;
begin
  select value into v_seeded from public.mr_survey_thresholds where key = 'anonymity_floor';

  select column_default into v_default
    from information_schema.columns
   where table_schema = 'public' and table_name = 'materiality_survey_rounds'
     and column_name = 'anonymity_floor';

  if v_default is null or btrim(split_part(v_default, '::', 1)) <> v_seeded::text then
    raise exception
      'anonymity_floor disagrees between its two homes: materiality_survey_rounds.anonymity_floor '
      'defaults to %, mr_survey_thresholds seeds %. The report prints the seeded row''s definition '
      'while the database applies the column default, so a mismatch means the assumptions register '
      'cites a floor that was not the one used. Reconcile them before proceeding.',
      coalesce(v_default, '(none)'), v_seeded;
  end if;
end $$;

-- ── The snapshot is immutable once the round freezes ──────────────────────────
-- Re-emits materiality_survey_round_guard() from 20260819 with ONE added block. The two existing
-- checks (standard_version fixed at creation; questionnaire_version cannot go backwards) are
-- byte-identical.
create or replace function public.materiality_survey_round_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.standard_version is distinct from old.standard_version then
    raise exception
      'materiality_survey_rounds.standard_version is fixed at creation (spec v8 §3.3): % -> %. '
      'Changing it would re-point every question in this round at a different sub-topic set. '
      'Create a new round instead.',
      old.standard_version, new.standard_version;
  end if;
  if new.questionnaire_version < old.questionnaire_version then
    raise exception
      'materiality_survey_rounds.questionnaire_version cannot go backwards: % -> %. '
      'Every response records the version it answered; moving the pointer back would make those '
      'records point at wording that is no longer the current wording for that number.',
      old.questionnaire_version, new.questionnaire_version;
  end if;

  -- ── ADDED 20260825. The disclosed constants are a SNAPSHOT, and a snapshot that can be edited is
  -- just a copy. Frozen from the moment the first response arrives — the same moment the question
  -- set stops being editable, and for the same reason: once evidence exists, the basis on which it
  -- is read is fixed. Before that, adjusting them is legitimate and permitted.
  if old.frozen_at is not null then
    if new.anonymity_floor            is distinct from old.anonymity_floor
    or new.polarised_extreme_min_n    is distinct from old.polarised_extreme_min_n
    or new.polarised_middle_max_share is distinct from old.polarised_middle_max_share
    or new.top_box_gap_margin         is distinct from old.top_box_gap_margin then
      raise exception
        'The disclosed constants for this round are fixed from the first response (frozen_at = %). '
        'The aggregation is computed live and nothing is stored, so changing a threshold now would '
        'silently add or remove entries from a register that has already been read — and would '
        'leave the assumptions register citing a value that was not the one applied (spec v9 '
        '§6.2.6, §10). Create a new round to assess the same questions on a different basis.',
        old.frozen_at;
    end if;
  end if;

  return new;
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- As in 20260820: savepoints around anything expecting an ERROR, and user_id supplied explicitly
-- because auth.uid() is NULL in the SQL editor.
--
-- 1) Four rows, every one with a printable definition and a stated source:
--    select key, value, length(definition) as def_chars, source
--      from public.mr_survey_thresholds order by key;
--    -- expect 4 rows: anonymity_floor 3, polarised_extreme_min_n 2,
--    --                polarised_middle_max_share 0.20, top_box_gap_margin 0.25
--    select count(*) from public.mr_survey_thresholds
--     where btrim(definition) = '' or btrim(source) = '';          -- expect 0
--
-- 2) A new round snapshots all four, without being told:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'threshold snapshot', 'esrs_2026') returning id \gset round_
--      select anonymity_floor, polarised_extreme_min_n, polarised_middle_max_share, top_box_gap_margin
--        from public.materiality_survey_rounds where id = :'round_id';
--      -- expect 3 | 2 | 0.20 | 0.25
--    rollback;
--
-- 3) ⚠️ THE SNAPSHOT IS A SNAPSHOT — changing the table does NOT move an existing round:
--    begin;
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'snapshot proof', 'esrs_2026') returning id \gset s_
--      update public.mr_survey_thresholds set value = 0.60 where key = 'top_box_gap_margin';
--      select top_box_gap_margin from public.materiality_survey_rounds where id = :'s_id';
--      -- expect 0.25, NOT 0.60. If this reads 0.60 the snapshot is not a snapshot and every
--      -- historical register is retroactively editable.
--      -- and a round created AFTER the change does pick it up:
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'after the change', 'esrs_2026') returning id \gset a_
--      select top_box_gap_margin from public.materiality_survey_rounds where id = :'a_id';  -- 0.60
--    rollback;
--
-- 4) An explicit value at insert is respected rather than overwritten:
--    begin;
--      insert into public.materiality_survey_rounds
--        (user_id, name, standard_version, anonymity_floor, top_box_gap_margin)
--      values (:'u_id', 'stricter round', 'esrs_2026', 5, 0.40) returning id \gset x_
--      select anonymity_floor, top_box_gap_margin, polarised_extreme_min_n
--        from public.materiality_survey_rounds where id = :'x_id';
--      -- expect 5 | 0.40 | 2   (the two given are kept, the third still snapshots)
--    rollback;
--
-- 5) ⚠️ IMMUTABLE ONCE FROZEN, EDITABLE BEFORE. Both halves matter:
--    begin;
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'freeze test', 'esrs_2026') returning id \gset f_
--      update public.materiality_survey_rounds set anonymity_floor = 4 where id = :'f_id';
--      -- expect SUCCESS (not frozen yet — adjusting a draft round is legitimate)
--      update public.materiality_survey_rounds set frozen_at = now() where id = :'f_id';
--      savepoint v5;
--        update public.materiality_survey_rounds set anonymity_floor = 2 where id = :'f_id';
--        -- expect ERROR: The disclosed constants for this round are fixed from the first response...
--      rollback to savepoint v5;
--      savepoint v5;
--        update public.materiality_survey_rounds set top_box_gap_margin = 0.10 where id = :'f_id';
--        -- expect ERROR: same
--      rollback to savepoint v5;
--      -- and an unrelated edit to a frozen round still works:
--      update public.materiality_survey_rounds set deadline = current_date + 7 where id = :'f_id';
--      -- expect SUCCESS
--    rollback;
--
-- 6) The two existing guard arms are unchanged by the re-emit:
--    begin;
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'guard regression', 'esrs_2026') returning id \gset g_
--      update public.materiality_survey_rounds set standard_version = 'esrs_2026' where id = :'g_id';
--      -- expect SUCCESS (a no-op update must not raise)
--      savepoint v6;
--        update public.materiality_survey_rounds set questionnaire_version = 0 where id = :'g_id';
--        -- expect ERROR: questionnaire_version cannot go backwards
--      rollback to savepoint v6;
--    rollback;
--
-- 7) The missing-threshold refusal, which is what stops a round existing with no snapshot:
--    begin;
--      delete from public.mr_survey_thresholds where key = 'top_box_gap_margin';
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'no threshold', 'esrs_2026');
--      -- expect ERROR: Cannot create a survey round: mr_survey_thresholds is missing top_box_gap_margin
--    rollback;
--
-- 8) The two homes of anonymity_floor agree. Re-run this after ANY change to either:
--    select (select value::text from public.mr_survey_thresholds where key = 'anonymity_floor')
--             as seeded,
--           (select btrim(split_part(column_default, '::', 1)) from information_schema.columns
--             where table_schema = 'public' and table_name = 'materiality_survey_rounds'
--               and column_name = 'anonymity_floor') as column_default;
--    -- expect 3 | 3. If they differ, the assumptions register cites a floor that was not applied.
--
-- 9) Grants are read-only for every role, and RLS names its roles explicitly:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'mr_survey_thresholds'
--     group by grantee order by grantee;
--    -- expect SELECT and nothing else, for anon / authenticated / service_role
--    select policyname, roles, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'mr_survey_thresholds';
--    -- expect {anon,authenticated} / SELECT
