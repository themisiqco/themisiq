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
-- 20260908_ghg_rls_initplan.sql
--
-- BATCH 3 of 5 — GHG. Wrap auth.uid() in a scalar subselect on the GHG-area RLS policies.
--
-- Same catalog-driven method as batch 2: reads `qual` and `with_check` AS THE DATABASE CURRENTLY
-- STORES THEM, applies one textual substitution, writes them back, and verifies the result against
-- pg_policies. The database is the source; this file is only the transformation. See
-- 20260908_materiality_rls_initplan.sql for the full reasoning, including why the repo is not a
-- safe source (docs/backup-record.md §6 — dashboard-created policies exist only in the database).
--
-- `auth.uid()` is STABLE: within one statement it returns the same value for every row, so
-- evaluating it once per query instead of once per row cannot change a result set.
--
-- ── SCOPE, STATED EXPLICITLY ────────────────────────────────────────────────────────────────
--   ghg_inventories · ghg_monthly_emissions · ghg_entries · scope3_inventories ·
--   source_documents · verifier_access
--
-- ⚠️ audit_log IS DELIBERATELY OUT OF SCOPE. It carries `audit_select_own`, which does reference
-- auth.uid(). It is excluded from this batch and left for a decision of its own, because the
-- audit trail's append-only behaviour is an Annex II commitment in the DPA and it should not be
-- touched as a side effect of a performance fix. (For the record: append-only comes from the
-- ABSENCE of any UPDATE or DELETE policy on audit_log, so rewriting a SELECT policy could not
-- create a write path — but "could not" is an argument, and the commitment deserves a decision.)
--
-- ⚠️ storage.objects IS ALSO OUT OF SCOPE. Six policies there reference auth.uid(), three of them
-- on the GHG 'source-documents' bucket. They live in a schema Supabase manages and re-emitting
-- them risks fighting the platform on its next update. Batch 5, deliberately last.
--
-- ── ⚠️ ghg_inventories AND ghg_entries CARRY THE AUDIT TRIGGER ───────────────────────────────
-- `log_audit()` fires AFTER INSERT OR DELETE OR UPDATE FOR EACH ROW on both. Nothing here touches
-- it: a trigger is a separate catalog object, `drop policy` does not cascade to triggers, and the
-- rewrite changes when a predicate is evaluated, not which rows change. The post-flight block
-- asserts the triggers are still attached anyway, because asserting is cheaper than assuming.

begin;

-- ── CAPTURE THE BEFORE STATE ────────────────────────────────────────────────────────────────
create temp table _ghg_before on commit drop as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('ghg_inventories', 'ghg_monthly_emissions', 'ghg_entries',
                     'scope3_inventories', 'source_documents', 'verifier_access')
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%auth.uid()%';

-- Record which of the five policy-free tables are policy-free BEFORE, so the post-flight check
-- compares against fact rather than against an expectation.
create temp table _empty_before on commit drop as
select t.tablename, (select count(*) from pg_policies p
                      where p.schemaname = 'public' and p.tablename = t.tablename) as n_policies
  from (values ('ghg_entries'), ('materiality_survey_closing_comments'),
               ('materiality_survey_responses'), ('organizations'), ('rate_limits')) as t(tablename);

do $$
declare
  v_n int; v_wrapped int; r record;
begin
  select count(*) into v_n from _ghg_before;
  if v_n = 0 then
    raise exception 'Pre-flight: no GHG-area policies reference auth.uid(). Already run, or the '
                    'scope list is wrong.';
  end if;

  select count(*) into v_wrapped from _ghg_before
   where (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%SELECT auth.uid()%';
  if v_wrapped > 0 then
    raise exception 'Pre-flight: % predicate(s) already wrapped. Stop and inspect.', v_wrapped;
  end if;

  raise notice 'Batch 3 (GHG): % policies in scope —', v_n;
  for r in select tablename, policyname, cmd from _ghg_before order by tablename, policyname loop
    raise notice '    %.%  [%]', r.tablename, r.policyname, r.cmd;
  end loop;

  for r in select tablename, n_policies from _empty_before order by tablename loop
    raise notice '  policy-free check, before: % has % policy/policies', r.tablename, r.n_policies;
  end loop;
end $$;

-- ── REBUILD EACH POLICY FROM THE CATALOG ────────────────────────────────────────────────────
do $$
declare r record; v_sql text;
begin
  for r in select * from _ghg_before order by tablename, policyname loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);

    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
                    r.policyname, r.schemaname, r.tablename,
                    case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                    r.cmd,
                    (select string_agg(quote_ident(x), ', ') from unnest(r.roles) as x));

    -- Clause emitted ONLY if the catalog held one. A FOR ALL policy with USING and no WITH CHECK
    -- derives its check from USING; making that explicit would decouple the two on a later edit.
    if r.qual is not null then
      v_sql := v_sql || format(' using (%s)', replace(r.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if r.with_check is not null then
      v_sql := v_sql || format(' with check (%s)', replace(r.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;

    execute v_sql;
  end loop;
end $$;

-- ── VERIFY BY COMPARING pg_policies OUTPUT ──────────────────────────────────────────────────
do $$
declare r record; v_bad int := 0;
begin
  for r in
    select b.tablename, b.policyname,
           b.qual as old_qual, a.qual as new_qual,
           b.with_check as old_check, a.with_check as new_check,
           b.cmd as old_cmd, a.cmd as new_cmd,
           b.roles::text as old_roles, a.roles::text as new_roles,
           b.permissive as old_perm, a.permissive as new_perm
      from _ghg_before b
      join pg_policies a on a.schemaname = b.schemaname and a.tablename = b.tablename
                        and a.policyname = b.policyname
  loop
    if r.old_cmd is distinct from r.new_cmd
       or r.old_roles is distinct from r.new_roles
       or r.old_perm is distinct from r.new_perm then
      raise warning 'CHANGED STRUCTURE: %.%', r.tablename, r.policyname; v_bad := v_bad + 1; continue;
    end if;

    if (r.old_qual is null) <> (r.new_qual is null)
       or (r.old_check is null) <> (r.new_check is null) then
      raise warning 'CLAUSE APPEARED OR VANISHED: %.%', r.tablename, r.policyname; v_bad := v_bad + 1; continue;
    end if;

    if regexp_replace(regexp_replace(coalesce(r.new_qual,''), '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g'), '\s+', ' ', 'g')
       is distinct from regexp_replace(coalesce(r.old_qual,''), '\s+', ' ', 'g') then
      raise warning 'USING DIFFERS BEYOND THE WRAP: %.%', r.tablename, r.policyname; v_bad := v_bad + 1; continue;
    end if;

    if regexp_replace(regexp_replace(coalesce(r.new_check,''), '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g'), '\s+', ' ', 'g')
       is distinct from regexp_replace(coalesce(r.old_check,''), '\s+', ' ', 'g') then
      raise warning 'WITH CHECK DIFFERS BEYOND THE WRAP: %.%', r.tablename, r.policyname; v_bad := v_bad + 1; continue;
    end if;
  end loop;

  if v_bad > 0 then
    raise exception 'Post-flight: % policy/policies differ by more than the wrap. Nothing committed.', v_bad;
  end if;
end $$;

-- ── THE THREE THINGS THIS BATCH MUST NOT HAVE CHANGED ───────────────────────────────────────
do $$
declare v_bare int; v_total int; r record; v_trig int;
begin
  -- 1. Every in-scope auth.uid() wrapped, none bare.
  select count(*) into v_total from pg_policies
   where schemaname='public'
     and tablename in ('ghg_inventories','ghg_monthly_emissions','ghg_entries',
                       'scope3_inventories','source_documents','verifier_access')
     and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%auth.uid()%';
  select count(*) into v_bare from pg_policies
   where schemaname='public'
     and tablename in ('ghg_inventories','ghg_monthly_emissions','ghg_entries',
                       'scope3_inventories','source_documents','verifier_access')
     and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                        '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%';
  if v_bare <> 0 then
    raise exception 'Post-flight: % GHG predicate(s) still carry a bare auth.uid().', v_bare;
  end if;

  -- 2. The five policy-free tables are still policy-free — stated, not assumed.
  for r in
    select e.tablename, e.n_policies as before_n,
           (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=e.tablename) as after_n
      from _empty_before e order by e.tablename
  loop
    if r.before_n <> r.after_n then
      raise exception 'Post-flight: % had % policy/policies and now has %.',
        r.tablename, r.before_n, r.after_n;
    end if;
    raise notice '  policy-free check, after: % still has % policy/policies', r.tablename, r.after_n;
  end loop;

  -- 3. The audit triggers on ghg_inventories and ghg_entries are still attached.
  select count(*) into v_trig
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relname in ('ghg_inventories','ghg_entries')
     and not t.tgisinternal;
  if v_trig < 2 then
    raise exception 'Post-flight: expected an audit trigger on both ghg_inventories and ghg_entries, '
                    'found % non-internal trigger(s).', v_trig;
  end if;

  raise notice 'Batch 3 (GHG): % policies re-emitted and verified; audit triggers intact; '
               'policy-free tables unchanged.', v_total;
end $$;

commit;
