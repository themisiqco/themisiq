-- supabase/migrations/20260930_s211_read_write_split.sql
-- Forced Labour Reporting, Stage 5a: reading and writing S-211 reports are decided separately, from the
-- 'forced-labour' entitlement as well as the s211_access preview list.
--
-- Run in production on 2026-09-30 (verified).
--
-- ⚠️ RUN 20260930_s211_access_gate.sql FIRST. This file replaces the two FOR ALL policies it created.
--
-- WHY. The module is now sold. The paywall decision (30 Sep 2026) is that a customer whose term has run
-- out can still open and read their own reports and download the PDF of a finished one, but cannot
-- create, edit or delete. One FOR ALL policy per table cannot say that, because USING and WITH CHECK
-- would have to answer "read?" and "write?" with the same function. So each table gets four policies,
-- one per command:
--   SELECT                 (select public.s211_can_read())  and the owner condition
--   INSERT                 (select public.s211_can_write()) and the owner condition, in WITH CHECK
--   UPDATE                 (select public.s211_can_write()) and the owner condition, in USING and WITH CHECK
--   DELETE                 (select public.s211_can_write()) and the owner condition, in USING
-- The owner conditions and their (select auth.uid()) wrapping are the ones the access gate kept. The
-- sections policies still check ownership through the parent report.
--
-- WHO GETS WHAT:
--   s211_can_read()   a row in s211_access, OR any entitlements row with module_key 'forced-labour',
--                     whatever its term_end: someone who ever bought the module keeps sight of their work.
--   s211_can_write()  a row in s211_access, OR a 'forced-labour' entitlements row with term_end > now().
--                     Strictly greater, as enforce_ghg_location_allowance() and every other entitlement
--                     trigger test it: a term ending exactly now is over.
-- Both are SECURITY DEFINER, so they can read s211_access (which no role but service_role and postgres
-- may read) and entitlements for the caller; search_path = '', so every name is schema-qualified.
--
-- ⚠️ s211_has_access() IS KEPT, NOT DROPPED. After this file no policy calls it, and the application
-- code of Stage 5a calls s211_can_read() and s211_can_write() instead. But the code deployed on main
-- when this runs still calls s211_has_access() through /api/s211, and dropping it would lock that
-- deployment out (its gate fails closed) until the new code ships. Drop it in a later migration, once
-- Stage 5a is deployed; the verification query 5 below shows whether anything still depends on it.
--
-- ⚠️ ORDER AGAINST THE DEPLOY. Run this BEFORE pushing Stage 5a. The deployed code keeps working
-- throughout: its API gate asks s211_has_access(), and the new policies grant s211_access users both
-- read and write. The Stage 5a code needs the two new functions, so pushing it first would fail closed
-- (every builder page reads "access could not be checked") until this runs.
--
-- ⚠️ RE-RUNNING IS INERT FOR THE FUNCTIONS AND RAISES FOR THE POLICIES. The functions are CREATE OR
-- REPLACE; the pre-flight refuses anything but the two FOR ALL policies it replaces, so a second run
-- stops there and rolls back, leaving the first run's state untouched.

begin;

-- ── Pre-flight: exactly the policies this file replaces, and nothing else ─────────────────────────
do $$
declare
  found text;
begin
  if to_regclass('public.entitlements') is null then
    raise exception 'Pre-flight: public.entitlements does not exist. s211_can_read() and s211_can_write() read it.';
  end if;
  if to_regprocedure('public.s211_has_access()') is null then
    raise exception 'Pre-flight: public.s211_has_access() does not exist. Run 20260930_s211_access_gate.sql first.';
  end if;
  select string_agg(tablename || '.' || policyname || ':' || cmd, ', ' order by tablename, policyname) into found
  from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections');
  if found is distinct from 's211_report_sections.s211_report_sections_owner:ALL, s211_reports.s211_reports_owner:ALL' then
    raise exception 'S-211 read/write split: expected exactly s211_reports_owner and s211_report_sections_owner, both FOR ALL, found: %', coalesce(found, '(none)');
  end if;
end
$$;

-- ── The two checks ────────────────────────────────────────────────────────────────────────────────
create or replace function public.s211_can_read()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.s211_access a where a.user_id = (select auth.uid()))
      or exists (select 1 from public.entitlements e
                 where e.user_id = (select auth.uid()) and e.module_key = 'forced-labour');
$$;

create or replace function public.s211_can_write()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (select 1 from public.s211_access a where a.user_id = (select auth.uid()))
      or exists (select 1 from public.entitlements e
                 where e.user_id = (select auth.uid()) and e.module_key = 'forced-labour'
                   and e.term_end > now());
$$;

comment on function public.s211_can_read() is
  'True when the caller may read their S-211 reports: a row in s211_access, or a forced-labour entitlement with any term. Called by the SELECT policies on s211_reports and s211_report_sections, and by /api/s211.';
comment on function public.s211_can_write() is
  'True when the caller may create, change or delete S-211 reports: a row in s211_access, or a forced-labour entitlement whose term has not ended. Called by the INSERT, UPDATE and DELETE policies, and by /api/s211.';

revoke all on function public.s211_can_read() from public;
revoke all on function public.s211_can_read() from anon;
grant execute on function public.s211_can_read() to authenticated;
revoke all on function public.s211_can_write() from public;
revoke all on function public.s211_can_write() from anon;
grant execute on function public.s211_can_write() to authenticated;

-- ── s211_reports: four policies ───────────────────────────────────────────────────────────────────
drop policy s211_reports_owner on public.s211_reports;

create policy s211_reports_select on public.s211_reports
  for select to authenticated
  using ((select public.s211_can_read()) and (select auth.uid()) = user_id);

create policy s211_reports_insert on public.s211_reports
  for insert to authenticated
  with check ((select public.s211_can_write()) and (select auth.uid()) = user_id);

create policy s211_reports_update on public.s211_reports
  for update to authenticated
  using ((select public.s211_can_write()) and (select auth.uid()) = user_id)
  with check ((select public.s211_can_write()) and (select auth.uid()) = user_id);

create policy s211_reports_delete on public.s211_reports
  for delete to authenticated
  using ((select public.s211_can_write()) and (select auth.uid()) = user_id);

-- ── s211_report_sections: four policies, ownership through the parent report ──────────────────────
-- The parent lookup is itself filtered by s211_reports' SELECT policy, which asks s211_can_read(). The
-- write policies repeat s211_can_write() here, so this table's gate does not rest on the parent's.
drop policy s211_report_sections_owner on public.s211_report_sections;

create policy s211_report_sections_select on public.s211_report_sections
  for select to authenticated
  using ((select public.s211_can_read()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id and r.user_id = (select auth.uid())
  ));

create policy s211_report_sections_insert on public.s211_report_sections
  for insert to authenticated
  with check ((select public.s211_can_write()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id and r.user_id = (select auth.uid())
  ));

create policy s211_report_sections_update on public.s211_report_sections
  for update to authenticated
  using ((select public.s211_can_write()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id and r.user_id = (select auth.uid())
  ))
  with check ((select public.s211_can_write()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id and r.user_id = (select auth.uid())
  ));

create policy s211_report_sections_delete on public.s211_report_sections
  for delete to authenticated
  using ((select public.s211_can_write()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id and r.user_id = (select auth.uid())
  ));

-- ── Post-flight: eight policies, each calling the right check in the right expression ─────────────
do $$
declare
  n int;
  bad text;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections');
  if n <> 8 then
    raise exception 'S-211 read/write split: expected 8 policies on the two tables, found %', n;
  end if;
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
    and not case cmd
      when 'SELECT' then coalesce(qual, '') ~ 's211_can_read\(\)' and with_check is null
      when 'INSERT' then coalesce(with_check, '') ~ 's211_can_write\(\)' and qual is null
      when 'UPDATE' then coalesce(qual, '') ~ 's211_can_write\(\)' and coalesce(with_check, '') ~ 's211_can_write\(\)'
      when 'DELETE' then coalesce(qual, '') ~ 's211_can_write\(\)' and with_check is null
      else false
    end;
  if bad is not null then
    raise exception 'S-211 read/write split: policies without the right check: %', bad;
  end if;
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 's211_has_access\(\)';
  if bad is not null then
    raise exception 'S-211 read/write split: policies still calling s211_has_access(): %', bad;
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   1. The policies, per command, with their expressions.
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
--   order by tablename, cmd, policyname;
--   -- expect 8 rows, all {authenticated}: per table one DELETE (qual only, s211_can_write), one INSERT
--   -- (with_check only, s211_can_write), one SELECT (qual only, s211_can_read), one UPDATE (both,
--   -- s211_can_write). Owner conditions: (( SELECT auth.uid() AS uid) = user_id) on s211_reports, the
--   -- EXISTS on s211_reports with r.user_id = ( SELECT auth.uid() AS uid) on s211_report_sections.
--
--   2. No bare auth.uid() was introduced (the CLAUDE.md count query, narrowed to these tables).
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
--     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
--           '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)';
--   -- expect 0
--
--   3. The two functions: security definer, empty search_path, stable, owned by postgres.
--   select p.proname, p.prosecdef, p.proconfig, p.provolatile, pg_get_userbyid(p.proowner) as owner
--   from pg_proc p
--   where p.oid in ('public.s211_can_read()'::regprocedure, 'public.s211_can_write()'::regprocedure);
--   -- expect two rows: t, {search_path=""}, s, postgres
--
--   4. Who may execute them.
--   select routine_name, grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name in ('s211_can_read', 's211_can_write')
--   order by routine_name, grantee;
--   -- expect authenticated and postgres for each (service_role may also appear from Supabase's default
--   -- privileges: harmless, auth.uid() is null for it). NO row for anon and NO row for PUBLIC.
--   select has_function_privilege('anon', 'public.s211_can_read()', 'execute') as anon_read,
--          has_function_privilege('anon', 'public.s211_can_write()', 'execute') as anon_write,
--          has_function_privilege('public', 'public.s211_can_write()', 'execute') as public_write;
--   -- expect f, f, f
--
--   5. Whether anything in the database still depends on s211_has_access() (so it can be dropped later).
--   select count(*) from pg_policies
--   where (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 's211_has_access\(\)';
--   -- expect 0. The deployed application may still call it until Stage 5a ships; see the header.
--
--   6. An EXPIRED entitlement can read but not write. Run as one block and it rolls itself back.
--      Replace <uuid> with the id of an account that owns at least one S-211 report (yours: the one in
--      s211_access). Inside the transaction it takes that account out of s211_access and gives it an
--      expired forced-labour entitlement, then acts as that account under RLS. Nothing survives the
--      rollback. If the account already holds a forced-labour entitlement, the insert below fails on
--      the unique (user_id, module_key) key and nothing is tested: use another account.
--
--   begin;
--   delete from public.s211_access where user_id = '<uuid>';
--   insert into public.entitlements (user_id, module_key, source, term_start, term_end)
--   values ('<uuid>', 'forced-labour', 'rls test', now() - interval '400 days', now() - interval '35 days');
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub": "<uuid>", "role": "authenticated"}';
--   select public.s211_can_read() as can_read, public.s211_can_write() as can_write;
--   -- expect t, f
--   select count(*) as reports_visible from public.s211_reports;
--   -- expect the number of reports the account owns (at least 1)
--   do $$
--   declare n int;
--   begin
--     begin
--       insert into public.s211_reports (user_id, company_name, reporting_year) values (auth.uid(), 'RLS test', 2026);
--       raise exception 'FAIL: an insert was allowed on an expired term';
--     exception when insufficient_privilege then raise notice 'OK: insert refused (%).', sqlerrm;
--     end;
--     update public.s211_reports set company_name = company_name where user_id = auth.uid();
--     get diagnostics n = row_count;
--     if n <> 0 then raise exception 'FAIL: % rows updated on an expired term', n; end if;
--     raise notice 'OK: update changed 0 rows.';
--     delete from public.s211_report_sections where report_id in (select id from public.s211_reports);
--     get diagnostics n = row_count;
--     if n <> 0 then raise exception 'FAIL: % section rows deleted on an expired term', n; end if;
--     raise notice 'OK: delete removed 0 rows.';
--   end
--   $$;
--   -- expect three OK notices and no FAIL
--   rollback;
--   -- then confirm nothing survived:
--   select count(*) from public.s211_access where user_id = '<uuid>';   -- expect 1 again
--   select count(*) from public.entitlements where user_id = '<uuid>' and source = 'rls test';   -- expect 0
