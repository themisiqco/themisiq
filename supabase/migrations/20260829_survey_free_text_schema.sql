-- 20260829_survey_free_text_schema.sql
--
-- FREE TEXT — FILE 1 of 3. SCHEMA AND REFERENCE DATA ONLY. No RPC, no UI.
--   20260830  the respondent path (survey_save_free_text, survey_save_closing_comment, survey_get)
--   20260831  the customer path (survey_aggregate)
--
-- Five things:
--   mr_stakeholder_categories    + answers_as ('individual' | 'organisation'), seeded
--   mr_survey_thresholds         + free_text_group_floor, seeded 5
--   materiality_survey_rounds    + free_text_group_floor snapshot column
--   materiality_survey_responses + a length bound on free_text (the column exists, unwritable)
--   materiality_survey_closing_comments   NEW TABLE
--
-- ⚠️ RUN AFTER 20260827. It re-emits materiality_survey_round_guard() whole and therefore CONTAINS
-- 20260825's threshold-freeze arm and 20260827's linked-round arm; out of order, those are lost.
-- Verify step 9 exercises all four arms.
--
--
-- =====================================================================
-- ⚠️ THE CLOSING QUESTION IS NOW LOAD-BEARING, NOT A NICETY
-- =====================================================================
-- Decided 16 August 2026: SURVEY SCOPE IS FIXED AT ROUND CREATION AND THERE IS NO SECOND SCOPING
-- MOMENT. A customer chooses which sub-topics to include, the generator writes the question set, and
-- from the first response the set is frozen (§3.3).
--
-- So the closing question — "Is there anything affecting people, the environment or the business
-- that we have not asked about?" — IS THE ONLY ROUTE BY WHICH A MATTER OUTSIDE THE CHOSEN SCOPE
-- REACHES THE PREPARER. Nothing else in the module can carry one. A respondent who knows about a
-- risk the customer did not think to ask about has this box or nothing.
--
-- ESRS 2 IRO-1 expects an emerging-topic identification process, and §5.1 names a survey as the
-- cheapest place to catch one. This is the module's entire catch. Two consequences follow and are
-- built on below:
--   * These comments are NEVER suppressed. The floor withholds a LABEL, never the text — suppressing
--     the comment would defeat the only mechanism the module has for the thing it is for.
--   * The table is not optional infrastructure. Removing it, or letting the page ship without the
--     box, removes an ESRS 2 IRO-1 process the report will claim to have.
--
--
-- =====================================================================
-- ⚠️ answers_as — WHY A NEW COLUMN AND NOT track, is_affected OR A LIST IN A FUNCTION
-- =====================================================================
-- Free text carries identification risk that a score does not: "our Manchester site", "my line
-- manager", "as the only woman on the night shift". No n protects that — the comment names its
-- author by what it says.
--
-- But that risk is NOT uniform across respondents, and 20260828 is why. S2 evidence now comes from a
-- NAMED ORGANISATIONAL CONTACT answering for a supplier company — a compliance manager writing on
-- company letterhead, whose identity the customer already knows because they invited them, and who
-- is disclosing nothing about themselves. An employee commenting about their own manager or site is
-- in an entirely different position, and the protection has to follow the person, not the track.
--
-- ⚠️ NO EXISTING COLUMN EXPRESSES IT.
--   track            wrong. value_chain_worker, affected_community and consumer_end_user are all
--                    EXTERNAL and all individuals.
--   labour_routing   wrong. s2 mixes `supplier` (organisational) with `value_chain_worker` and
--                    `workers_rep_value_chain` (individuals) — see 20260828's known limitation.
--   is_affected      wrong. `supplier` is is_affected = true and is organisational.
--
-- AND IT IS PROVABLY NOT DERIVABLE from the flags already there. `supplier` and
-- `workers_rep_value_chain` carry the IDENTICAL quadruple (is_affected, is_user,
-- can_proxy_for_affected, typically_surveyed) = (t, t, t, t) and land on opposite sides of this one.
-- Same demonstration 20260824 gives for typically_surveyed; verify step 3 runs it as a query.
--
-- The remaining option was a list of category codes inside survey_aggregate. That is the second
-- enumeration of the eleven categories in a function body which 20260818 and 20260823 both forbid:
-- it drifts from the seed the moment a category is added, and the drift is silent.
--
-- ⚠️ CHANGING A CATEGORY'S answers_as MUST BE A NEW CODE, NEVER AN UPDATE IN PLACE — the same rule
-- as labour_routing. A comment already returned unlabelled under 'individual' would retroactively
-- become labelled if the category were flipped to 'organisation', which is a disclosure made by
-- editing a reference row.
--
--
-- =====================================================================
-- ⚠️ WHAT THE FLOOR PROTECTS, AND WHERE I DECIDED IT DOES NOT APPLY
-- =====================================================================
-- free_text_group_floor is seeded at 5 against anonymity_floor's 3, and it governs ONE thing: whether
-- a comment carries a GROUP LABEL. It never suppresses a comment.
--
--   INDIVIDUAL respondents — the floor applies. A comment carries its stakeholder_category only if at
--     least free_text_group_floor individual comments share that category, and its track only if at
--     least that many share the track. Below it, the comment is returned with respondent_type alone.
--     Every comment also waits: NO individual comments are returned at all until the round has
--     free_text_group_floor of them, which blunts the attack where a customer polls the aggregate and
--     attributes each new comment to whoever's status just changed to 'completed'.
--
--   ORGANISATIONAL respondents — THE FLOOR DOES NOT APPLY, and this is a decision rather than an
--     omission. A supplier's compliance manager, a regulator, an investor: the customer chose them,
--     invited them by name, and the value of the answer depends on knowing which organisation gave
--     it. Withholding "this came from a supplier" protects nobody and destroys the only thing that
--     makes the comment actionable. Applying a floor here would also be theatre — with one supplier
--     invited, suppressing the label while the customer holds the invite list conceals nothing.
--
-- ⚠️ THE RESIDUAL, STATED RATHER THAN HIDDEN. respondent_type is returned on every comment, always.
-- So an unlabelled comment is known to come from one of the six individual categories. That is a
-- real narrowing — eleven to six — and it is disclosed deliberately: the alternative was to omit the
-- type as well, which would leave the PATTERN (some labelled, some not) carrying the same
-- information while pretending it did not. A six-way group is coarser than any single category, and
-- saying so is better than a silence that is not really silent.
--
-- ⚠️ AND WHAT NO FLOOR CAN DO. A comment naming a site, a manager or a role identifies its author
-- regardless of n. Nothing here fixes that and nothing can. The control is telling the respondent
-- the truth BEFORE they type, which is a copy change shipping with 20260830 — all three intro
-- variants currently promise answers are "combined with everyone else's", which is true of scores
-- and false of comments. That carve-out is not a follow-up; the page must not ship a comment box
-- while the paragraph above it says the opposite.
--
-- ⚠️ function_department IS NEVER CARRIED ON A COMMENT. §4 captures it, materiality_survey_responses
-- denormalises it, and it is the most identifying non-name field in the schema — free-form text like
-- "Manchester warehouse night shift". The closing-comments table does not have the column at all,
-- which is stronger than having it and remembering not to return it.
--
--
-- DEPLOY: Lisa hand-runs this in the Supabase SQL editor, after 20260827. Re-runnable — ADD COLUMN
-- IF NOT EXISTS, guarded ADD CONSTRAINT, CREATE TABLE IF NOT EXISTS, upserting seeds, CREATE OR
-- REPLACE on both functions. No client change ships with it.

begin;

-- =====================================================================
-- 1. mr_stakeholder_categories.answers_as
-- =====================================================================
-- ADD COLUMN IF NOT EXISTS for the reason 20260824 gives at length: CREATE TABLE IF NOT EXISTS is a
-- no-op on an existing table, so a column introduced by editing 20260818's CREATE alone would exist
-- on a fresh rebuild and nowhere else, while consumers read a value that is not there.
alter table public.mr_stakeholder_categories
  add column if not exists answers_as text not null default 'individual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.mr_stakeholder_categories'::regclass
       and conname  = 'mr_stakeholder_categories_answers_as_check'
  ) then
    alter table public.mr_stakeholder_categories
      add constraint mr_stakeholder_categories_answers_as_check
        check (answers_as in ('individual', 'organisation'));
  end if;
end $$;

comment on column public.mr_stakeholder_categories.answers_as is
  'Whether a respondent in this category answers AS THEMSELVES or ON BEHALF OF AN ORGANISATION. Governs free-text protection only (20260829): an individual''s comment carries a group label only above free_text_group_floor, an organisation''s always does, because the customer invited that organisation by name and the value of the answer depends on knowing which one gave it. ⚠️ NOT derivable from the other flags — `supplier` and `workers_rep_value_chain` share the identical (is_affected, is_user, can_proxy_for_affected, typically_surveyed) = (t,t,t,t) and land on opposite sides. Defaults to ''individual'' so a category added later gets the PROTECTIVE value rather than inheriting an exposure nobody asserted. Changing a value here must be a NEW code, never an UPDATE in place — the same rule as labour_routing — because a comment already returned unlabelled would retroactively acquire a label.';

do $$
declare
  v_org constant text[] := array['supplier', 'customer', 'investor_lender', 'regulator',
                                 'civil_society'];
  v_found int;
  v_ind   int;
begin
  select count(*) into v_found
    from public.mr_stakeholder_categories where code = any (v_org);
  if v_found <> array_length(v_org, 1) then
    raise exception
      'Cannot seed answers_as: % of the % organisational categories are missing from '
      'mr_stakeholder_categories. Reconcile against 20260818 first.',
      array_length(v_org, 1) - v_found, array_length(v_org, 1);
  end if;

  -- Reconciles in both directions, so a hand-edited row is put back and this file stays the record.
  update public.mr_stakeholder_categories
     set answers_as = case when code = any (v_org) then 'organisation' else 'individual' end;

  select count(*) into v_ind
    from public.mr_stakeholder_categories where answers_as = 'individual';

  -- own_workforce, workers_rep_own, value_chain_worker, workers_rep_value_chain,
  -- affected_community, consumer_end_user.
  if v_ind <> 6 then
    raise exception
      'answers_as = individual on % categories, expected 6. A category has been added or renamed and '
      'its free-text exposure has not been decided — decide it in this file rather than letting the '
      'default stand unexamined.', v_ind;
  end if;
end $$;

-- =====================================================================
-- 2. free_text_group_floor — the disclosed constant
-- =====================================================================
insert into public.mr_survey_thresholds (key, value, definition, source) values
  ('free_text_group_floor', 5,
   'The minimum number of comments from INDIVIDUAL respondents sharing a group before that group''s '
   'name may be attached to any of them. Below it a comment is still returned in full — it is never '
   'suppressed — but carries only whether its author answered as an individual or for an '
   'organisation. It is also the minimum number of individual comments a round must hold before any '
   'of them is returned at all. It does NOT apply to respondents who answer for an organisation: the '
   'customer invited them by name and the value of their comment depends on knowing which '
   'organisation gave it. Higher than anonymity_floor because verbatim text identifies its author by '
   'what it describes, which no count of respondents can prevent.',
   'Judgement. Set above anonymity_floor (3) because the identification risk in free text is of a '
   'different kind and not merely a larger amount of the same one; 5 costs little, since it now '
   'applies only to the six individual categories.')
on conflict (key) do update
  set value = excluded.value, definition = excluded.definition, source = excluded.source;

-- Snapshot column. Nullable -> backfill -> NOT NULL, per 20260825: a DDL default would put the value
-- in two places and let it drift from the table that carries its definition.
alter table public.materiality_survey_rounds
  add column if not exists free_text_group_floor smallint;

update public.materiality_survey_rounds r
   set free_text_group_floor =
         (select t.value::smallint from public.mr_survey_thresholds t
           where t.key = 'free_text_group_floor')
 where r.free_text_group_floor is null;

alter table public.materiality_survey_rounds
  alter column free_text_group_floor set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.materiality_survey_rounds'::regclass
       and conname  = 'materiality_survey_rounds_free_text_group_floor_check'
  ) then
    alter table public.materiality_survey_rounds
      add constraint materiality_survey_rounds_free_text_group_floor_check
        check (free_text_group_floor >= 1);
  end if;
end $$;

comment on column public.materiality_survey_rounds.free_text_group_floor is
  'SNAPSHOT of mr_survey_thresholds at round creation, never re-read. Governs whether a verbatim comment carries a group label; see that table''s definition. Applies to INDIVIDUAL respondents only. Immutable once frozen_at is set, like the other three constants.';

-- Re-emits 20260825's snapshot trigger with the fourth constant added.
create or replace function public.materiality_survey_round_snapshot_thresholds()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing text;
begin
  select string_agg(k, ', ' order by k) into v_missing
    from unnest(array['polarised_extreme_min_n', 'polarised_middle_max_share',
                      'top_box_gap_margin', 'free_text_group_floor']) k
   where not exists (select 1 from public.mr_survey_thresholds t where t.key = k);

  if v_missing is not null then
    raise exception
      'Cannot create a survey round: mr_survey_thresholds is missing %. The round snapshots its '
      'disclosed constants at creation, and a round with no snapshot would silently take whatever '
      'the table held on the day someone next opened its register (spec v9 §6.2.6, §10). Re-run '
      '20260825_survey_thresholds.sql and 20260829_survey_free_text_schema.sql.',
      v_missing;
  end if;

  new.polarised_extreme_min_n := coalesce(new.polarised_extreme_min_n,
    (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'polarised_extreme_min_n'));
  new.polarised_middle_max_share := coalesce(new.polarised_middle_max_share,
    (select t.value from public.mr_survey_thresholds t where t.key = 'polarised_middle_max_share'));
  new.top_box_gap_margin := coalesce(new.top_box_gap_margin,
    (select t.value from public.mr_survey_thresholds t where t.key = 'top_box_gap_margin'));
  new.free_text_group_floor := coalesce(new.free_text_group_floor,
    (select t.value::smallint from public.mr_survey_thresholds t where t.key = 'free_text_group_floor'));

  return new;
end $$;

-- =====================================================================
-- 3. A bound on free_text
-- =====================================================================
-- The column has existed since 20260819 and has never been writable, so it is entirely NULL and the
-- constraint validates trivially. Added now rather than later because the write path is about to
-- open to an unauthenticated caller and an unbounded text column behind an anon RPC is a cost with
-- no ceiling — and because a report has to render whatever is in here.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.materiality_survey_responses'::regclass
       and conname  = 'materiality_survey_responses_free_text_len'
  ) then
    alter table public.materiality_survey_responses
      add constraint materiality_survey_responses_free_text_len
        check (free_text is null or length(free_text) <= 4000);
  end if;
end $$;

-- =====================================================================
-- 4. materiality_survey_closing_comments
-- =====================================================================
-- ⚠️ ITS OWN TABLE, AND THE REASON IS STRUCTURAL RATHER THAN TIDY. The closing question belongs to no
-- sub-topic, has no value and no abstention, and MUST NEVER BE COUNTED — it is not part of n_asked or
-- any other counter (§3.0.1). materiality_survey_counter_rows() reads materiality_survey_responses
-- and cannot see this table, so the invariant holds BY CONSTRUCTION rather than by every future
-- author remembering it. If adding the closing question changed any counter, that would be the
-- defect; here it cannot.
--
-- Two shapes were rejected. A nullable question_id on materiality_survey_responses fails the XOR
-- (a closing comment has neither a value nor an abstention) and would make
-- unique (respondent_id, question_id) meaningless under NULLS DISTINCT. A column on
-- materiality_survey_respondents is worse: that row holds invite_email and invite_name and the
-- customer has SELECT on it, so `select invite_name, closing_comment` would attribute every comment
-- to a named person in one query. 20260819 keeps responses off the respondent row for exactly that
-- reason.
create table if not exists public.materiality_survey_closing_comments (
  id                    uuid        not null default gen_random_uuid(),
  round_id              uuid        not null,
  respondent_id         uuid        not null
                                      references public.materiality_survey_respondents (id)
                                      on delete cascade,
  questionnaire_version int         not null,

  comment               text        not null
    check (length(btrim(comment)) between 1 and 4000),

  -- Denormalised at write, exactly as materiality_survey_responses does it, so the aggregation never
  -- needs to join to the respondent — the table that holds the email.
  -- ⚠️ function_department IS ABSENT ON PURPOSE. It is the most identifying non-name field in the
  -- schema and free text is the last place it should travel. Not having the column is stronger than
  -- having it and remembering not to return it.
  track                 text        not null,
  stakeholder_category  text        not null references public.mr_stakeholder_categories (code),

  answered_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint materiality_survey_closing_comments_pkey primary key (id),
  -- One closing comment per respondent. The question is asked once, at the end.
  constraint materiality_survey_closing_comments_respondent_key unique (respondent_id)
);

create index if not exists materiality_survey_closing_comments_round_idx
  on public.materiality_survey_closing_comments (round_id);

comment on table public.materiality_survey_closing_comments is
  'The closing free-text question — "Is there anything affecting people, the environment or the business that we have not asked about?" ⚠️ THE MODULE''S ENTIRE EMERGING-TOPIC CATCH. Survey scope is fixed at round creation with no second scoping moment, so this is the ONLY route by which a matter outside the chosen scope reaches the preparer, and ESRS 2 IRO-1 expects one. A SEPARATE TABLE so that "never counted" is structural: materiality_survey_counter_rows reads materiality_survey_responses and cannot see this. No value, no abstention, no sub-topic, and no function_department. Same grant posture as materiality_survey_responses — nothing to anon or authenticated, RLS on with no policy for either — so the customer reaches it only through survey_aggregate.';

comment on column public.materiality_survey_closing_comments.comment is
  'Verbatim, as the respondent wrote it. NEVER suppressed by the anonymity floor: the floor withholds the GROUP LABEL, because suppressing the text would defeat the only emerging-topic mechanism the module has. Bounded at 4000 characters — the write path is open to an unauthenticated caller and a report has to render this.';

-- Grants and RLS — copied from materiality_survey_responses, which is the posture this table needs.
revoke all on public.materiality_survey_closing_comments from anon, authenticated, service_role;
grant all on public.materiality_survey_closing_comments to service_role;
alter table public.materiality_survey_closing_comments enable row level security;

-- ⚠️ DELIBERATELY NO POLICY, for anon or authenticated. Both are denied twice — by the absent grant
-- and by RLS with no policy — and that pair IS the anonymity guarantee for verbatim text. The
-- respondent writes through a token-scoped definer RPC (20260830) and the customer reads through
-- survey_aggregate (20260831), which applies free_text_group_floor. If a policy is ever added here,
-- the intro copy's promise about comments changes in the same commit.

-- =====================================================================
-- 5. The round guard, re-emitted with free_text_group_floor added to the frozen set
-- =====================================================================
-- Contains 20260819's two arms, 20260825's threshold arm and 20260827's linked-round arm, unchanged
-- apart from the one added column.
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

  if old.frozen_at is not null then
    if new.anonymity_floor            is distinct from old.anonymity_floor
    or new.polarised_extreme_min_n    is distinct from old.polarised_extreme_min_n
    or new.polarised_middle_max_share is distinct from old.polarised_middle_max_share
    or new.top_box_gap_margin         is distinct from old.top_box_gap_margin
    or new.free_text_group_floor      is distinct from old.free_text_group_floor then
      raise exception
        'The disclosed constants for this round are fixed from the first response (frozen_at = %). '
        'The aggregation is computed live and nothing is stored, so changing a threshold now would '
        'silently add or remove entries from a register that has already been read — and for '
        'free_text_group_floor it would retroactively attach or withdraw a group label on comments '
        'someone has already read (spec v9 §6.2.6, §10). Create a new round instead.',
        old.frozen_at;
    end if;
  end if;

  if old.status = 'closed' and new.status is distinct from 'closed' then
    if exists (select 1 from public.materiality_assessment_survey_rounds l
                where l.round_id = old.id) then
      raise exception
        'Survey round % has informed % materiality assessment(s) and cannot leave ''closed'' (% -> '
        '%). Reopening it would let further responses change the evidence base of a determination '
        'that has already been made from it, with nothing anywhere recording that the figures '
        'moved. Unlink it from the assessment(s) first — that is the deliberate act that permits '
        'this, and it correctly leaves them no longer citing this round.',
        old.id,
        (select count(*) from public.materiality_assessment_survey_rounds l where l.round_id = old.id),
        old.status, new.status;
    end if;
  end if;

  return new;
end $$;

commit;

-- ── VERIFY AFTER RUNNING (paste in the SQL editor) ────────────────────────────
-- Savepoints around anything expecting an ERROR; user_id explicit because auth.uid() is NULL here.
--
-- 1) answers_as exists and splits 6 / 5:
--    select answers_as, count(*), string_agg(code, ', ' order by sort_order)
--      from public.mr_stakeholder_categories group by 1 order by 1;
--    -- expect individual   | 6 | own_workforce, workers_rep_own, value_chain_worker,
--    --                          workers_rep_value_chain, affected_community, consumer_end_user
--    --        organisation | 5 | supplier, customer, investor_lender, regulator, civil_society
--
-- 2) ⚠️ THE s2 SPLIT IS THE POINT — one routing group, both kinds of respondent:
--    select code, labour_routing, answers_as from public.mr_stakeholder_categories
--     where labour_routing = 's2' order by code;
--    -- expect supplier | s2 | organisation
--    --        value_chain_worker | s2 | individual
--    --        workers_rep_value_chain | s2 | individual
--    -- This is why the protection keys on answers_as and NOT on track or labour_routing.
--
-- 3) ⚠️ IT IS A FIFTH FACT, NOT A RESTATEMENT. Two categories share the identical flag quadruple and
--    differ here. If this returns fewer than 2 rows, the column has collapsed into the others:
--    select code, is_affected, is_user, can_proxy_for_affected, typically_surveyed, answers_as
--      from public.mr_stakeholder_categories
--     where is_affected and is_user and can_proxy_for_affected and typically_surveyed
--     order by code;
--    -- expect supplier (organisation), workers_rep_own (individual),
--    --        workers_rep_value_chain (individual)
--
-- 4) The threshold is seeded with a printable definition, and is higher than anonymity_floor:
--    select key, value, length(definition) from public.mr_survey_thresholds order by key;
--    -- expect 5 rows; free_text_group_floor = 5, anonymity_floor = 3
--    select (select value from public.mr_survey_thresholds where key = 'free_text_group_floor')
--         > (select value from public.mr_survey_thresholds where key = 'anonymity_floor') as higher;
--    -- expect t. If it is ever not, verbatim text is protected no better than a score.
--
-- 5) A new round snapshots all FOUR constants:
--    begin;
--      select id from auth.users order by created_at limit 1 \gset u_
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'free text snapshot', 'esrs_2026') returning id \gset r_
--      select anonymity_floor, polarised_extreme_min_n, polarised_middle_max_share,
--             top_box_gap_margin, free_text_group_floor
--        from public.materiality_survey_rounds where id = :'r_id';
--      -- expect 3 | 2 | 0.20 | 0.25 | 5
--    rollback;
--
-- 6) The closing-comments table is unreachable except through service_role:
--    select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--      from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'materiality_survey_closing_comments'
--     group by grantee order by grantee;
--    -- expect service_role ONLY. If authenticated appears, the customer can read raw comments
--    -- joined to nothing — but joined to their own respondent list, which they hold.
--    select count(*) from pg_policies where schemaname = 'public'
--     and tablename = 'materiality_survey_closing_comments';              -- expect 0
--    select relrowsecurity from pg_class
--     where oid = 'public.materiality_survey_closing_comments'::regclass; -- expect t
--    -- and it does NOT carry function_department:
--    select count(*) from information_schema.columns
--     where table_schema = 'public' and table_name = 'materiality_survey_closing_comments'
--       and column_name = 'function_department';                          -- expect 0
--
-- 7) One comment per respondent, and it cascades with them:
--    -- against a real respondent id, as service_role:
--    begin;
--      insert into public.materiality_survey_closing_comments
--        (round_id, respondent_id, questionnaire_version, comment, track, stakeholder_category)
--      values (:'round', :'resp', 1, 'first', 'internal', 'own_workforce');
--      savepoint v7;
--        insert into public.materiality_survey_closing_comments
--          (round_id, respondent_id, questionnaire_version, comment, track, stakeholder_category)
--        values (:'round', :'resp', 1, 'second', 'internal', 'own_workforce');
--        -- expect ERROR: duplicate key ... materiality_survey_closing_comments_respondent_key
--      rollback to savepoint v7;
--      savepoint v7;
--        insert into public.materiality_survey_closing_comments
--          (round_id, respondent_id, questionnaire_version, comment, track, stakeholder_category)
--        values (:'round', :'resp2', 1, '   ', 'internal', 'own_workforce');
--        -- expect ERROR: violates check constraint (whitespace is not a comment)
--      rollback to savepoint v7;
--    rollback;
--
-- 8) The free_text bound bites, and the column is still all NULL until 20260830 ships:
--    select count(*) from public.materiality_survey_responses where free_text is not null; -- 0
--    select conname, pg_get_constraintdef(oid) from pg_constraint
--     where conrelid = 'public.materiality_survey_responses'::regclass
--       and conname = 'materiality_survey_responses_free_text_len';       -- expect 1 row
--
-- 9) ⚠️ ALL FOUR GUARD ARMS — the run-order check. If the linked-round arm does not fire, this file
--    was applied before 20260827 and that arm has been silently dropped:
--    -- arm 1: standard_version fixed          (no-op update must succeed)
--    -- arm 2: questionnaire_version backwards (ERROR)
--    -- arm 3: thresholds frozen — NOW INCLUDING free_text_group_floor:
--    begin;
--      insert into public.materiality_survey_rounds (user_id, name, standard_version)
--      values (:'u_id', 'guard', 'esrs_2026') returning id \gset g_
--      update public.materiality_survey_rounds set frozen_at = now() where id = :'g_id';
--      savepoint v9;
--        update public.materiality_survey_rounds set free_text_group_floor = 2 where id = :'g_id';
--        -- expect ERROR: The disclosed constants for this round are fixed from the first response
--      rollback to savepoint v9;
--    rollback;
--    -- arm 4: a linked round cannot reopen — see 20260827 verify step 6.
