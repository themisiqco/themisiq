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
-- ── THIS FILE: CATALOG-DRIVEN. READS pg_policies AT RUN TIME. ─────────────────────────────────
-- Safe with respect to the divergence above. It contains no policy expression of its own. It reads
-- `qual` and `with_check` from pg_policies as the database currently stores them, applies one
-- textual substitution, and writes them back. A policy edited through the dashboard is carried
-- through with that edit intact, because the edit is what gets read.
--
-- ⚠️ RUNNABLE ONCE, NOT REPEATABLE — BUT IT FAILS LOUDLY, NOT SILENTLY.
-- Its capture filter matches the plain substring 'auth.uid()', which an already-wrapped predicate
-- — rendered by the catalog as ( SELECT auth.uid() AS uid) — still contains. A second pass would
-- therefore nest the subselect inside itself. It does not get that far: the pre-flight counts
-- in-scope predicates that are already wrapped and RAISES, aborting the transaction before any
-- policy is touched. Run it once; a second run stops with 'Pre-flight: N ... already wrapped' and
-- changes nothing.
--
-- That guard also fires if any policy in scope was wrapped by some other route — by hand, or by an
-- overlapping batch. The file then will not run at all until the overlap is resolved. That is
-- deliberate. It is not a bug to be worked around by loosening the filter.
-- (Batches 4, 5a and 5b use a stripped capture filter instead and are freely re-runnable.)
--
-- 20260908_materiality_rls_initplan.sql
--
-- BATCH 2 of 5 — MATERIALITY. Wrap auth.uid() in a scalar subselect on every materiality_* policy.
--
-- ⚠️ THIS FILE DOES NOT REPLAY EXPRESSIONS FROM THE REPO. IT REBUILDS THEM FROM pg_policies.
-- Batch 1 (CBAM) hand-wrote each replacement from supabase/migrations, which is safe only while
-- the repo and the database agree. They do not: the repo contains 11 CBAM policies where the
-- advisor counts 12, and 16 materiality policies where the advisor counts 22. docs/backup-record.md
-- §6 documents why — sixteen tables have no CREATE TABLE in migrations at all, so policies created
-- in the dashboard exist only in the database.
--
-- Replaying a stale expression would silently revert whatever was changed after the migration that
-- last mentioned it. So this file reads `qual` and `with_check` AS THE DATABASE CURRENTLY STORES
-- THEM, applies one textual substitution, and writes them back. The database is the source; this
-- file is only the transformation. It therefore handles 16 policies or 22 without being told which.
--
-- ── THE TRANSFORMATION ──────────────────────────────────────────────────────────────────────
-- `auth.uid()` -> `(select auth.uid())`. auth.uid() is STABLE, so within one statement it returns
-- the same value for every row; wrapping it in a scalar subquery with no outer reference lets the
-- planner hoist it to an InitPlan and evaluate it once per query instead of once per row. The
-- result set cannot differ — that is what STABLE means. Supabase's linter reports the bare form as
-- `auth_rls_initplan`.
--
-- ── ⚠️ DERIVED WITH CHECK ON `FOR ALL` IS PRESERVED, AND THIS IS THE SUBTLE PART ─────────────
-- A FOR ALL policy with a USING clause and NO WITH CHECK uses its USING expression for the check
-- as well. pg_policies reports with_check as NULL in that case. This file emits a WITH CHECK clause
-- ONLY when with_check IS NOT NULL, so a derived check stays derived. Copying qual into an explicit
-- with_check would be equivalent TODAY and would silently decouple the two: a later edit to one
-- would no longer move the other. Same reasoning for USING, omitted on FOR INSERT policies.

begin;

-- ── CAPTURE THE BEFORE STATE ────────────────────────────────────────────────────────────────
create temp table _mat_before on commit drop as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename like 'materiality\_%'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

do $$
declare
  v_n int;
  v_wrapped int;
  r record;
begin
  select count(*) into v_n from _mat_before;
  if v_n = 0 then
    raise exception 'Pre-flight: no materiality_* policies reference auth.uid(). Nothing to do — '
                    'either this migration has already run, or the scope pattern is wrong.';
  end if;

  -- None may already be wrapped: the substitution below is a plain replace, so a second pass would
  -- nest the subselect. If any is already wrapped, stop and let a human look.
  select count(*) into v_wrapped
    from _mat_before
   where (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%SELECT auth.uid()%';
  if v_wrapped > 0 then
    raise exception 'Pre-flight: % policy predicate(s) already contain a wrapped auth.uid(). '
                    'This migration has run before, or the policies were edited by hand.', v_wrapped;
  end if;

  raise notice 'Batch 2 (Materiality): % policies in scope —', v_n;
  for r in select tablename, policyname, cmd from _mat_before order by tablename, policyname loop
    raise notice '    %.%  [%]', r.tablename, r.policyname, r.cmd;
  end loop;
end $$;

-- ── REBUILD EACH POLICY FROM THE CATALOG ────────────────────────────────────────────────────
do $$
declare
  r record;
  v_sql text;
begin
  for r in select * from _mat_before order by tablename, policyname loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      r.policyname, r.schemaname, r.tablename,
      case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      r.cmd,
      (select string_agg(quote_ident(x), ', ') from unnest(r.roles) as x)
    );

    -- Emit each clause ONLY if the catalog held one. See the derived-WITH-CHECK note above.
    if r.qual is not null then
      v_sql := v_sql || format(' using (%s)',
                               replace(r.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if r.with_check is not null then
      v_sql := v_sql || format(' with check (%s)',
                               replace(r.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;

    execute v_sql;
  end loop;
end $$;

-- ── VERIFY BY COMPARING pg_policies OUTPUT, NOT BY INSPECTION ───────────────────────────────
-- For each policy: take the NEW expression, undo the wrapper textually, normalise whitespace, and
-- require it to equal the OLD expression normalised the same way. If anything other than the wrap
-- changed — a predicate, a column, a parenthesis — these will differ and the migration aborts.
-- cmd, roles and permissive are compared directly.
do $$
declare
  r record;
  v_bad int := 0;
begin
  for r in
    select b.tablename, b.policyname,
           b.qual  as old_qual,  a.qual  as new_qual,
           b.with_check as old_check, a.with_check as new_check,
           b.cmd as old_cmd, a.cmd as new_cmd,
           b.roles::text as old_roles, a.roles::text as new_roles,
           b.permissive as old_perm, a.permissive as new_perm
      from _mat_before b
      join pg_policies a
        on a.schemaname = b.schemaname and a.tablename = b.tablename
       and a.policyname = b.policyname
  loop
    -- Structural attributes must be untouched.
    if r.old_cmd is distinct from r.new_cmd
       or r.old_roles is distinct from r.new_roles
       or r.old_perm is distinct from r.new_perm then
      raise warning 'CHANGED STRUCTURE: %.% cmd %->% roles %->% permissive %->%',
        r.tablename, r.policyname, r.old_cmd, r.new_cmd, r.old_roles, r.new_roles,
        r.old_perm, r.new_perm;
      v_bad := v_bad + 1;
      continue;
    end if;

    -- A NULL clause must still be NULL: a derived WITH CHECK must not have become explicit.
    if (r.old_qual is null) <> (r.new_qual is null)
       or (r.old_check is null) <> (r.new_check is null) then
      raise warning 'CLAUSE APPEARED OR VANISHED: %.%', r.tablename, r.policyname;
      v_bad := v_bad + 1;
      continue;
    end if;

    if regexp_replace(regexp_replace(coalesce(r.new_qual, ''),
                      '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g'), '\s+', ' ', 'g')
       is distinct from
       regexp_replace(coalesce(r.old_qual, ''), '\s+', ' ', 'g')
    then
      raise warning 'USING DIFFERS BEYOND THE WRAP: %.%', r.tablename, r.policyname;
      v_bad := v_bad + 1;
      continue;
    end if;

    if regexp_replace(regexp_replace(coalesce(r.new_check, ''),
                      '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g'), '\s+', ' ', 'g')
       is distinct from
       regexp_replace(coalesce(r.old_check, ''), '\s+', ' ', 'g')
    then
      raise warning 'WITH CHECK DIFFERS BEYOND THE WRAP: %.%', r.tablename, r.policyname;
      v_bad := v_bad + 1;
      continue;
    end if;
  end loop;

  if v_bad > 0 then
    raise exception 'Post-flight: % policy/policies differ by more than the auth.uid() wrap. '
                    'Nothing has been committed.', v_bad;
  end if;
end $$;

-- Every policy in scope must now be wrapped, and none left bare.
do $$
declare
  v_bare int;
  v_total int;
begin
  select count(*) into v_total
    from pg_policies
   where schemaname = 'public' and tablename like 'materiality\_%'
     and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%auth.uid()%';

  select count(*) into v_bare
    from pg_policies
   where schemaname = 'public' and tablename like 'materiality\_%'
     and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                        '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%';

  if v_bare <> 0 then
    raise exception 'Post-flight: % materiality policy predicate(s) still carry a bare auth.uid().', v_bare;
  end if;

  raise notice 'Batch 2 (Materiality): % policies re-emitted, every auth.uid() wrapped, '
               'expressions verified identical apart from the wrap.', v_total;
end $$;

commit;
