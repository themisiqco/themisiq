-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- ⚠️  NOT RUN.  THIS MIGRATION HAS NEVER BEEN EXECUTED AGAINST ANY DATABASE.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Six files match 20260908_*_rls_initplan.sql. NONE of the six has been run — not against
-- production, not against a branch, not against a local copy. They were written on 8 Sep 2026 and
-- committed unrun.
--
-- Do not infer otherwise from their neighbours. TWO other migrations dated 20260908 WERE run
-- against production that day:
--     20260908_grant_audit_log_select.sql    — RUN
--     20260908_drop_audit_insert_policy.sql  — RUN
-- Same date, same commit, opposite status. The date prefix says nothing about whether a file has
-- been applied.
--
-- ── WHY THEY WERE NOT RUN: THE REPO AND THE DATABASE HAVE DIVERGED ────────────────────────────
-- pg_policies reports 110 policies. Reconstructing policy state from supabase/migrations yields
-- 60. The difference was created through the Supabase dashboard and exists in no migration file.
-- docs/backup-record.md §6 separately records SIXTEEN tables with no CREATE TABLE statement in any
-- migration.
--
-- The consequence for this class of migration specifically: a policy whose live definition differs
-- from the repo's version will be SILENTLY REVERTED to the repo's version by any file that replays
-- a repo-derived expression. The revert would look like a successful migration. Nothing in the
-- output would name it. An RLS predicate is the object where that failure is least visible and
-- most serious — it widens or narrows row access without raising anything.
--
-- So the only safe source for a policy's definition is pg_policies, read at run time. Whether THIS
-- file does that is stated immediately below, because it is the whole question.
--
-- ── THIS FILE: HAND-WRITTEN FROM REPO STATE.  ⛔ DO NOT RUN AS IT STANDS. ─────────────────────
-- This is the ONE file of the six that does not read pg_policies. It contains eleven literal
-- CREATE POLICY statements whose expressions were transcribed by hand from supabase/migrations,
-- on the assumption that the repo described the database. That is the assumption disproved above,
-- and it was disproved AFTER this file was written — batches 2 to 5 changed method because of it.
--
-- Its pre-flight guard checks that eleven policies of the expected NAMES exist and are un-wrapped.
-- It does not, and cannot, check that their DEFINITIONS match what this file is about to write.
-- A CBAM policy edited through the dashboard since its migration would pass every check in this
-- file and be silently reverted by it.
--
-- The advisor counts 12 CBAM policies; the repo yields 11. The twelfth is already direct evidence
-- that this file's source is incomplete.
--
-- ⛔ THIS FILE MUST BE REGENERATED FROM pg_policies BEFORE IT IS RUN — REGENERATED, NOT REVIEWED.
--    Reading it through and judging it correct cannot establish the fact at issue, because the
--    facts it would have to be checked against are in the database, not in this repo. No amount of
--    care applied to this text substitutes for reading the catalog. Rebuild it on the pattern of
--    20260908_supply_chain_rls_initplan.sql, which reads each expression from pg_policies at run
--    time, and discard this one.
--
-- 20260908_cbam_rls_initplan.sql
--
-- BATCH 1 of 5 — CBAM. Wrap auth.uid() in a scalar subselect on every CBAM RLS policy.
--
-- ── WHAT THIS CHANGES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────
-- `auth.uid()` is STABLE, so Postgres may re-evaluate it once PER ROW inside a policy predicate.
-- `(select auth.uid())` is a scalar subquery with no outer reference, so the planner hoists it to
-- an InitPlan and evaluates it ONCE PER QUERY. Supabase's linter reports the un-wrapped form as
-- `auth_rls_initplan`.
--
-- ⚠️ THE RESULT SET IS IDENTICAL, NOT MERELY SIMILAR, AND THE REASON IS WORTH STATING.
-- A STABLE function returns the same value for every row within a single statement — that is what
-- STABLE means. So evaluating it once and evaluating it n times cannot produce different answers.
-- The rewrite changes WHEN the value is computed, never WHAT it is. No predicate is widened, no
-- role is changed, no command is added or removed. Every USING and WITH CHECK expression below is
-- character-for-character its previous self with `auth.uid()` replaced by `(select auth.uid())`.
--
-- ⚠️ NINE OF THE ELEVEN HAVE NO `for` AND NO `to` CLAUSE, WHICH MEANS `FOR ALL TO PUBLIC`.
-- That is preserved deliberately. Adding `to authenticated` while re-emitting would be a silent
-- tightening — defensible on its own merits, but it is not this migration's job and it would hide
-- a semantic change inside a performance change.
--
-- ── DRIFT GUARD ─────────────────────────────────────────────────────────────────────────────
-- These policies are re-emitted from the definitions in supabase/migrations. The database is the
-- authority and has drifted from this repo before (see docs/backup-record.md §6). The pre-flight
-- block below therefore refuses to run unless all eleven policies exist AND still carry an
-- un-wrapped auth.uid() — so if any one has been edited in the dashboard since, this migration
-- aborts instead of reverting that edit.

begin;

-- ── PRE-FLIGHT ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_expected text[] := array[
    'cbam_charge_mix_owner', 'cbam_installation_disclosures_owner', 'cbam_installations_owner',
    'cbam_operator_profile_owner', 'cbam_precursor_inputs_owner', 'cbam_process_parameters_owner',
    'cbam_production_processes_owner', 'cbam_see_records_owner', 'cbam_source_documents_owner',
    'cbam_source_streams_owner', 'cbam_verifier_access_owner'
  ];
  v_name text;
  v_found int;
begin
  foreach v_name in array v_expected loop
    select count(*) into v_found
      from pg_policies
     where schemaname = 'public' and policyname = v_name;
    if v_found <> 1 then
      raise exception
        'Pre-flight: expected exactly one policy named % in public, found %. The database has '
        'drifted from supabase/migrations. Reconcile before re-emitting.', v_name, v_found;
    end if;

    -- Must still be un-wrapped. If it already reads (select auth.uid()) then either this migration
    -- has run, or someone fixed it by hand; either way, re-emitting from this file would overwrite
    -- a definition this file did not author.
    if not exists (
      select 1 from pg_policies
       where schemaname = 'public' and policyname = v_name
         and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%'
         and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) not like '%( SELECT auth.uid()%'
    ) then
      raise exception
        'Pre-flight: policy % does not carry an un-wrapped auth.uid(). It has already been changed. '
        'Inspect pg_policies before proceeding.', v_name;
    end if;
  end loop;
end $$;

-- ── THE NINE COMPANY-OWNERSHIP POLICIES (identical shape) ───────────────────────────────────
drop policy if exists cbam_charge_mix_owner                on public.cbam_charge_mix;
create policy cbam_charge_mix_owner on public.cbam_charge_mix
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_installation_disclosures_owner   on public.cbam_installation_disclosures;
create policy cbam_installation_disclosures_owner on public.cbam_installation_disclosures
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_installations_owner              on public.cbam_installations;
create policy cbam_installations_owner on public.cbam_installations
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_operator_profile_owner           on public.cbam_operator_profile;
create policy cbam_operator_profile_owner on public.cbam_operator_profile
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_precursor_inputs_owner           on public.cbam_precursor_inputs;
create policy cbam_precursor_inputs_owner on public.cbam_precursor_inputs
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_process_parameters_owner         on public.cbam_process_parameters;
create policy cbam_process_parameters_owner on public.cbam_process_parameters
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_production_processes_owner       on public.cbam_production_processes;
create policy cbam_production_processes_owner on public.cbam_production_processes
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_see_records_owner                on public.cbam_see_records;
create policy cbam_see_records_owner on public.cbam_see_records
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

drop policy if exists cbam_source_streams_owner             on public.cbam_source_streams;
create policy cbam_source_streams_owner on public.cbam_source_streams
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

-- ── THE TWO THAT DIFFER IN SHAPE ────────────────────────────────────────────────────────────
-- Carries an explicit `for all` (still TO PUBLIC). Preserved.
drop policy if exists cbam_source_documents_owner           on public.cbam_source_documents;
create policy cbam_source_documents_owner on public.cbam_source_documents
  for all
  using      (company_id in (select id from public.companies where user_id = (select auth.uid())))
  with check (company_id in (select id from public.companies where user_id = (select auth.uid())));

-- ⚠️ The only CBAM policy scoped `to authenticated`, and the only one whose WITH CHECK is stricter
-- than its USING: it requires BOTH that the row belongs to the caller AND that the company does.
-- 20260858 added a guard asserting this policy keeps its customer_user_id clause; that guard reads
-- pg_policies for the substring, which survives this rewrite unchanged.
drop policy if exists cbam_verifier_access_owner            on public.cbam_verifier_access;
create policy cbam_verifier_access_owner on public.cbam_verifier_access
  for all to authenticated
  using      (customer_user_id = (select auth.uid()))
  with check (customer_user_id = (select auth.uid())
              and company_id in (select id from public.companies where user_id = (select auth.uid())));

-- ── POST-FLIGHT ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_bare int;
  v_total int;
begin
  select count(*) into v_total
    from pg_policies
   where schemaname = 'public' and tablename like 'cbam\_%'
     and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%auth.uid()%';

  if v_total <> 11 then
    raise exception 'Post-flight: expected 11 CBAM policies referencing auth.uid(), found %.', v_total;
  end if;

  -- Every remaining auth.uid() must be inside a scalar subselect. pg_policies renders the wrapped
  -- form as "( SELECT auth.uid() AS uid)", so a bare occurrence is one not preceded by "( SELECT ".
  select count(*) into v_bare
    from pg_policies
   where schemaname = 'public' and tablename like 'cbam\_%'
     and (coalesce(qual,'') || ' ' || coalesce(with_check,''))
         ~ '(?<!\( SELECT )auth\.uid\(\)';

  if v_bare <> 0 then
    raise exception 'Post-flight: % CBAM policy predicate(s) still carry an un-wrapped auth.uid().', v_bare;
  end if;

  raise notice 'Batch 1 (CBAM): 11 policies re-emitted, all auth.uid() calls wrapped.';
end $$;

commit;
