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
-- ✔ IDEMPOTENT. Its capture filter strips the wrapped form '( SELECT auth.uid() AS uid)' before
-- testing for the substring 'auth.uid()', so an already-wrapped predicate does not match and is
-- not re-processed. A second run selects nothing and is a no-op. (Batches 2 and 3 use the plain
-- substring and abort on a second run instead — see those files.)
--
-- 20260908_supply_chain_rls_initplan.sql
--
-- BATCH 4 of 5 — Supply chain. Wrap auth.uid() in a scalar subselect.
--
-- Catalog-driven, as batches 2 and 3: reads `qual` and `with_check` AS THE DATABASE CURRENTLY
-- STORES THEM, applies one textual substitution, writes them back, and verifies against
-- pg_policies. The database is the source; this file is only the transformation. auth.uid() is
-- STABLE, so evaluating it once per query rather than once per row cannot change a result set.
--
-- ⚠️ SCOPE IS FILTERED ON A *BARE* auth.uid(), NOT ON auth.uid() AT ALL.
-- An already-wrapped predicate renders as "( SELECT auth.uid() AS uid)", which still contains the
-- substring "auth.uid()". Filtering on the substring alone would re-process work already done and
-- nest the subselect. Every scope below strips the wrapped form first and then looks for what is
-- left, so this file is idempotent and picks up only what is genuinely outstanding.
--
-- ⚠️ DERIVED WITH CHECK PRESERVED. A FOR ALL policy with USING and no WITH CHECK derives its check
-- from USING; pg_policies reports with_check NULL. A clause is emitted ONLY when the catalog held
-- one, so a derived check stays derived rather than becoming explicit and silently decoupled.
--
-- ⚠️ THE MOST COMPLEX PREDICATES OF ANY BATCH. Nine of the twelve resolve ownership through a
-- JOIN or an EXISTS across supplier_campaigns / campaign_suppliers / supplier_documents rather
-- than a column on the row. docs/supplier-portal-rls-remediation.md exists because a USING (true)
-- on these very tables was a real exposure. The transformation is textual and the verification is
-- structural, so predicate shape is preserved whatever it is — but this is the batch where reading
-- the pre-flight NOTICE list before letting it proceed matters most.

begin;

create temp table _b_before on commit drop as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
     and tablename in ('supplier_campaigns', 'campaign_suppliers',
                       'supplier_responses', 'supplier_documents')
   and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                      '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%';

do $$
declare v_n int; r record;
begin
  select count(*) into v_n from _b_before;
  if v_n = 0 then
    raise exception 'Pre-flight: nothing in scope for batch 4 of 5. Already run, or the scope is wrong.';
  end if;
  raise notice 'Batch 4 of 5 (Supply chain): % policies in scope —', v_n;
  for r in select schemaname, tablename, policyname, cmd from _b_before
           order by schemaname, tablename, policyname loop
    raise notice '    %.%.%  [%]', r.schemaname, r.tablename, r.policyname, r.cmd;
  end loop;
end $$;

do $$
declare r record; v_sql text;
begin
  for r in select * from _b_before order by schemaname, tablename, policyname loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    v_sql := format('create policy %I on %I.%I as %s for %s to %s',
                    r.policyname, r.schemaname, r.tablename,
                    case when r.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                    r.cmd,
                    (select string_agg(quote_ident(x), ', ') from unnest(r.roles) as x));
    if r.qual is not null then
      v_sql := v_sql || format(' using (%s)', replace(r.qual, 'auth.uid()', '(select auth.uid())'));
    end if;
    if r.with_check is not null then
      v_sql := v_sql || format(' with check (%s)', replace(r.with_check, 'auth.uid()', '(select auth.uid())'));
    end if;
    execute v_sql;
  end loop;
end $$;

-- Verify by comparing pg_policies output before and after, not by inspection.
do $$
declare r record; v_bad int := 0;
begin
  for r in
    select b.schemaname, b.tablename, b.policyname,
           b.qual as oq, a.qual as nq, b.with_check as oc, a.with_check as nc,
           b.cmd as ocmd, a.cmd as ncmd, b.roles::text as orl, a.roles::text as nrl,
           b.permissive as op, a.permissive as np
      from _b_before b
      join pg_policies a on a.schemaname=b.schemaname and a.tablename=b.tablename
                        and a.policyname=b.policyname
  loop
    if r.ocmd is distinct from r.ncmd or r.orl is distinct from r.nrl
       or r.op is distinct from r.np then
      raise warning 'CHANGED STRUCTURE: %.%.%', r.schemaname, r.tablename, r.policyname;
      v_bad := v_bad + 1; continue;
    end if;
    if (r.oq is null) <> (r.nq is null) or (r.oc is null) <> (r.nc is null) then
      raise warning 'CLAUSE APPEARED OR VANISHED: %.%.%', r.schemaname, r.tablename, r.policyname;
      v_bad := v_bad + 1; continue;
    end if;
    if regexp_replace(regexp_replace(coalesce(r.nq,''),'\( SELECT auth\.uid\(\) AS uid\)','auth.uid()','g'),'\s+',' ','g')
       is distinct from regexp_replace(coalesce(r.oq,''),'\s+',' ','g') then
      raise warning 'USING DIFFERS BEYOND THE WRAP: %.%.%', r.schemaname, r.tablename, r.policyname;
      v_bad := v_bad + 1; continue;
    end if;
    if regexp_replace(regexp_replace(coalesce(r.nc,''),'\( SELECT auth\.uid\(\) AS uid\)','auth.uid()','g'),'\s+',' ','g')
       is distinct from regexp_replace(coalesce(r.oc,''),'\s+',' ','g') then
      raise warning 'WITH CHECK DIFFERS BEYOND THE WRAP: %.%.%', r.schemaname, r.tablename, r.policyname;
      v_bad := v_bad + 1; continue;
    end if;
  end loop;
  if v_bad > 0 then
    raise exception 'Post-flight: % policy/policies differ by more than the wrap. Nothing committed.', v_bad;
  end if;
end $$;

do $$
declare v_bare int; v_total int;
begin
  select count(*) into v_total from _b_before;
  select count(*) into v_bare from pg_policies
   where schemaname = 'public'
     and tablename in ('supplier_campaigns', 'campaign_suppliers',
                       'supplier_responses', 'supplier_documents')
     and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''),
                        '\( SELECT auth\.uid\(\) AS uid\)', '', 'g') like '%auth.uid()%';
  if v_bare <> 0 then
    raise exception 'Post-flight: % predicate(s) still carry a bare auth.uid().', v_bare;
  end if;
  raise notice 'Batch 4 of 5 (Supply chain): % policies re-emitted and verified.', v_total;
end $$;

commit;
