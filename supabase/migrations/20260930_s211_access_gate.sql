-- supabase/migrations/20260930_s211_access_gate.sql
-- Canada S-211 module, Stage 2c: the access gate, enforced in the database.
--
-- Run in production on 2026-09-30 (verified).
--
-- GRANTING AND REVOKING PREVIEW ACCESS. public.s211_access is the one list of who may use the builder:
-- the API routes ask public.s211_has_access() (lib/s211/access.ts) and every policy on the two tables
-- asks the same function. Run as postgres in the SQL editor; takes effect on the next request.
--   insert into public.s211_access (user_id, note) values ('<uuid>', '<who>');
--   delete from public.s211_access where user_id = '<uuid>';
--
-- ⚠️ RUN 20260930_s211_reports.sql AND 20260930_s211_report_sections.sql FIRST. This file replaces the
-- one policy each of them creates.
--
-- WHY. The S211_PREVIEW_USER_IDS environment allow-list, which the API routes checked when this file
-- was written (since removed; see below), guarded those routes only. RLS on
-- s211_reports and s211_report_sections asked who owns a row and nothing else, so any signed-in user
-- could read and write their own rows by calling the Supabase API directly with the public anon key
-- and their own session, never passing through a route. After this file, a user with no row in
-- public.s211_access sees no rows and can write none, their own included.
--
-- WHAT IT DOES, in one transaction:
--   1. public.s211_access: one row per user allowed into the module. RLS on, NO policies, and no
--      grants to anon or authenticated, so only service_role and postgres can read or change it.
--   2. public.s211_has_access(): true when the caller's (select auth.uid()) has a row there. SECURITY
--      DEFINER, so it can read a table the caller cannot; search_path = '', so every name in it is
--      schema-qualified and a caller cannot redirect it with an object of their own.
--   3. The two existing policies, dropped and recreated BY NAME with (select public.s211_has_access())
--      added to both USING and WITH CHECK. The owner conditions and their (select auth.uid()) wrapping
--      are unchanged.
--
-- ⚠️ THE PAYWALL STAGE REPLACES THE FUNCTION BODY, NOT THE POLICIES. The policies know only the
-- function's name. To gate on an entitlement instead, `create or replace function
-- public.s211_has_access()` with the same signature, return type, SECURITY DEFINER and search_path;
-- `create or replace` keeps the existing EXECUTE grants, and no policy needs touching. Changing the
-- signature (adding an argument) makes it a DIFFERENT function and leaves every policy on the old one.
--
-- ⚠️ WHY THE FUNCTION CALL IS WRAPPED IN (select ...). The same reason as (select auth.uid()): a bare
-- call to a STABLE function inside a policy may be evaluated once per row; a scalar subselect with no
-- outer reference is hoisted to an InitPlan and evaluated once per query. The result is identical
-- either way.
--
-- ⚠️ WHY THE PRE-FLIGHT REFUSES AN UNEXPECTED POLICY. Permissive policies are OR'd together. If either
-- table carried a third policy nobody knew about, dropping and recreating the two named ones would
-- leave that one in place, and it would let a user without access straight past the gate, with no
-- error anywhere. So the transaction first checks that the two tables carry exactly the policies this
-- file replaces, and raises otherwise. It checks again at the end that every policy on both tables
-- calls the function in both expressions.
--
-- ⚠️ RUNNING THIS LOCKS EVERYONE OUT UNTIL A ROW IS INSERTED, LISA INCLUDED. s211_access starts empty.
-- Between the commit and the insert at the foot of this file, the builder lists no reports, opens
-- none (404), and refuses every save. Nothing is deleted: the rows are all still there, and they
-- reappear as soon as the insert runs. Run the insert straight after.
--
-- ⚠️ RE-RUNNING IS NOT INERT: IT RAISES. `create table` carries no IF NOT EXISTS, as in the two files
-- before it. A second run fails on that statement and the whole transaction rolls back, leaving
-- everything as the first run left it.
--
-- WHAT THIS DOES NOT DO:
--   It does not change the API gate by itself. The routes checked S211_PREVIEW_USER_IDS when this ran;
--     the same day that allow-list was removed and the routes now ask public.s211_has_access() through
--     the user's own client, so s211_access is the single source of truth (lib/s211/server.ts).
--   It does not touch the service role. service_role bypasses RLS, so nothing here constrains it; no
--     S-211 code path uses it today.
--   It does not affect deleting a user. s211_reports.user_id and s211_access.user_id both cascade from
--     auth.users, and a cascade is a referential action, not a query that RLS filters.

begin;

-- ── Pre-flight: exactly the policies this file replaces, and nothing else ─────────────────────────
do $$
declare
  found text;
begin
  select string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname) into found
  from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections');
  if found is distinct from 's211_report_sections.s211_report_sections_owner, s211_reports.s211_reports_owner' then
    raise exception 'S-211 access gate: expected exactly s211_reports_owner and s211_report_sections_owner, found: %', coalesce(found, '(none)');
  end if;
end
$$;

-- ── 1. Who is allowed in ──────────────────────────────────────────────────────────────────────────
create table public.s211_access (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  note        text
);

comment on table public.s211_access is
  'Users allowed into the S-211 report builder. Read only through public.s211_has_access(). No policies and no grants to anon or authenticated: service_role and postgres only.';
comment on column public.s211_access.note is
  'Free text for whoever grants access, e.g. who and why. Not read by any code.';

alter table public.s211_access enable row level security;

-- Revoke first, then grant: a grant only adds, and the default privileges belong to the creating role.
-- service_role needs its own grant because BYPASSRLS does not bypass GRANT.
revoke all on table public.s211_access from public;
revoke all on table public.s211_access from anon;
revoke all on table public.s211_access from authenticated;
grant all on table public.s211_access to service_role;

-- ── 2. The check the policies call ────────────────────────────────────────────────────────────────
create or replace function public.s211_has_access()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.s211_access a
    where a.user_id = (select auth.uid())
  );
$$;

comment on function public.s211_has_access() is
  'True when the caller may use the S-211 builder. Called by every policy on s211_reports and s211_report_sections. The paywall stage replaces this body with an entitlement check; keep the signature, SECURITY DEFINER and search_path.';

revoke all on function public.s211_has_access() from public;
revoke all on function public.s211_has_access() from anon;
grant execute on function public.s211_has_access() to authenticated;

-- ── 3. The policies, dropped and recreated by name ────────────────────────────────────────────────
drop policy s211_reports_owner on public.s211_reports;

create policy s211_reports_owner on public.s211_reports
  for all to authenticated
  using ((select public.s211_has_access()) and (select auth.uid()) = user_id)
  with check ((select public.s211_has_access()) and (select auth.uid()) = user_id);

drop policy s211_report_sections_owner on public.s211_report_sections;

-- The parent lookup below is itself filtered by s211_reports' policy, which already asks for access.
-- The check is repeated here anyway, so this table's gate does not depend on another table's policy.
create policy s211_report_sections_owner on public.s211_report_sections
  for all to authenticated
  using ((select public.s211_has_access()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id
      and r.user_id = (select auth.uid())
  ))
  with check ((select public.s211_has_access()) and exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id
      and r.user_id = (select auth.uid())
  ));

-- ── Post-flight: every policy on both tables calls the gate, in both expressions ──────────────────
do $$
declare
  bad text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into bad
  from pg_policies
  where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
    and (coalesce(qual, '') !~ 's211_has_access\(\)' or coalesce(with_check, '') !~ 's211_has_access\(\)');
  if bad is not null then
    raise exception 'S-211 access gate: policies without the access check: %', bad;
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';

-- ── GRANT ACCESS: RUN SEPARATELY, STRAIGHT AFTER THE COMMIT ───────────────────────────────────────
-- insert into public.s211_access (user_id, note) values ('81a8962f-3e5c-40a3-8145-1ac01426df5c', 'Lisa, preview');

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   1. The policies on both tables, with their expressions.
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
--   order by tablename, policyname;
--   -- expect two rows, both ALL, {authenticated}. qual and with_check both begin with
--   -- ( SELECT s211_has_access() AS s211_has_access) AND ...; s211_reports then
--   -- (( SELECT auth.uid() AS uid) = user_id), s211_report_sections then the EXISTS on s211_reports.
--
--   2. No bare auth.uid() was introduced (the CLAUDE.md count query, narrowed to these tables).
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
--     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
--           '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)';
--   -- expect 0
--
--   3. s211_access: RLS on, no policies, and grants.
--   select relrowsecurity from pg_class where oid = 'public.s211_access'::regclass;
--   -- expect t
--   select count(*) from pg_policies where schemaname = 'public' and tablename = 's211_access';
--   -- expect 0
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 's211_access'
--   group by grantee order by grantee;
--   -- expect postgres and service_role only. NO row for anon, authenticated or PUBLIC.
--
--   4. The function: security definer, its search_path, and who may execute it.
--   select p.prosecdef, p.proconfig, p.provolatile, pg_get_userbyid(p.proowner) as owner
--   from pg_proc p where p.oid = 'public.s211_has_access()'::regprocedure;
--   -- expect t, {search_path=""}, s, postgres
--   select grantee, privilege_type from information_schema.routine_privileges
--   where routine_schema = 'public' and routine_name = 's211_has_access'
--   order by grantee;
--   -- expect authenticated and postgres. service_role may also appear, from Supabase's default
--   -- privileges on functions; that is harmless (it bypasses RLS, and auth.uid() is null for it, so the
--   -- function returns false). NO row for anon and NO row for PUBLIC.
--   select has_function_privilege('anon', 'public.s211_has_access()', 'execute') as anon_can,
--          has_function_privilege('public', 'public.s211_has_access()', 'execute') as public_can;
--   -- expect f, f
--
--   5. Who has access.
--   select count(*) from public.s211_access;
--   -- expect 0 straight after the commit, 1 after the insert above.
