-- supabase/verify/20261001_fl_shared_core_verify.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Verification for supabase/migrations/20261001_fl_shared_core.sql. Run AFTER it. Every statement here
-- reads; nothing changes. Run the whole file: each query says what to expect. Kept outside
-- supabase/migrations/ so a replay of the migrations never runs it.

-- 1. The new tables: RLS on, four policies each.
select c.relname as table_name, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace s on s.oid = c.relnamespace
where s.nspname = 'public' and c.relname in ('fl_reports', 'fl_report_entities', 'fl_report_countries', 'fl_answers')
order by c.relname;
-- expect 4 rows, each rls_on = true, policies = 4

-- 2. Policy counts on the S-211 tables, unchanged.
select tablename, count(*) as policies from pg_policies
where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
group by tablename order by tablename;
-- expect s211_report_sections 4, s211_reports 4

-- 3. The S-211 policies still call s211_can_read() / s211_can_write() by name.
select tablename, policyname, cmd, qual, with_check from pg_policies
where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
order by tablename, cmd;
-- expect the same 8 rows as before: SELECT with s211_can_read(); INSERT, UPDATE, DELETE with s211_can_write()

-- 4. The new policies, per command.
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename like 'fl\_%'
order by tablename, cmd;
-- expect 16 rows, all {authenticated}. fl_report_countries calls fl_can_read(country) / fl_can_write(country);
-- the other three call fl_can_read(NULL) / fl_can_write(NULL). All carry ( SELECT auth.uid() AS uid).

-- 5. No bare auth.uid() anywhere in public (the CLAUDE.md query, by schema).
select schemaname, count(*) as unwrapped_auth_uid
from pg_policies
where regexp_replace(
  coalesce(qual, '') || ' ' || coalesce(with_check, ''),
  '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi'
) ~ 'auth\.uid\(\)'
group by schemaname
order by schemaname;
-- expect the same rows as before the migration (on 21 Sep 2026: public 1, audit_log.audit_select_own, bare by
-- design). The migration's own post-flight already refused a bare auth.uid() in the fl_ policies.

-- 6. The four access functions.
select p.oid::regprocedure as function, p.prosecdef as security_definer, p.proconfig, p.provolatile,
       pg_get_userbyid(p.proowner) as owner
from pg_proc p
where p.oid in ('public.fl_can_read(text)'::regprocedure, 'public.fl_can_write(text)'::regprocedure,
                'public.s211_can_read()'::regprocedure, 'public.s211_can_write()'::regprocedure)
order by 1;
-- expect 4 rows: t, {search_path=""}, s, postgres

-- 7. The wrappers' bodies.
select pg_get_functiondef('public.s211_can_read()'::regprocedure) as s211_can_read,
       pg_get_functiondef('public.s211_can_write()'::regprocedure) as s211_can_write;
-- expect select public.fl_can_read('canada') and select public.fl_can_write('canada')

-- 8. Who may execute them.
select has_function_privilege('anon', 'public.fl_can_read(text)', 'execute') as anon_fl_read,
       has_function_privilege('anon', 'public.fl_can_write(text)', 'execute') as anon_fl_write,
       has_function_privilege('public', 'public.fl_can_write(text)', 'execute') as public_fl_write,
       has_function_privilege('authenticated', 'public.fl_can_read(text)', 'execute') as auth_fl_read,
       has_function_privilege('authenticated', 'public.fl_can_write(text)', 'execute') as auth_fl_write,
       has_function_privilege('anon', 'public.s211_can_read()', 'execute') as anon_s211_read,
       has_function_privilege('authenticated', 'public.s211_can_read()', 'execute') as auth_s211_read;
-- expect f, f, f, t, t, f, t

-- 9. Table grants for anon and authenticated.
select t as table_name, r as role,
       has_table_privilege(r, 'public.' || t, 'SELECT') as sel, has_table_privilege(r, 'public.' || t, 'INSERT') as ins,
       has_table_privilege(r, 'public.' || t, 'UPDATE') as upd, has_table_privilege(r, 'public.' || t, 'DELETE') as del,
       has_table_privilege(r, 'public.' || t, 'TRUNCATE') as trunc, has_table_privilege(r, 'public.' || t, 'REFERENCES') as refs,
       has_table_privilege(r, 'public.' || t, 'TRIGGER') as trig, has_table_privilege(r, 'public.' || t, 'MAINTAIN') as maint
from unnest(array['fl_reports', 'fl_report_entities', 'fl_report_countries', 'fl_answers']) as t,
     unnest(array['anon', 'authenticated']) as r
order by 1, 2;
-- expect anon: all f. authenticated: sel, ins, upd, del t; trunc, refs, trig, maint f.

-- 10. The new column and its composite key.
select conname, pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid = 'public.s211_reports'::regclass and conname = 's211_reports_fl_report_fkey';
-- expect FOREIGN KEY (fl_report_id, user_id) REFERENCES fl_reports(id, user_id)
select count(*) as reports, count(fl_report_id) as linked from public.s211_reports;
-- expect linked = 0 until the backfill (step 3) runs

-- 11. What the checks answer for you, now (run in the SQL editor as postgres, auth.uid() is null: all f).
select public.fl_can_read('canada') as read_canada, public.fl_can_read('uk') as read_uk,
       public.fl_can_read('narnia') as read_unknown, public.s211_can_read() as s211_read;
-- expect f, f, f, f as postgres. The live check is 12.

-- 12. As the account in s211_access (yours; the first row if there are ever several), read and write
--     agree with the S-211 checks. Nothing to replace. Rolled back at the end.
begin;
select set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.s211_access limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select public.s211_can_read() as s211_read, public.fl_can_read('canada') as fl_read_canada,
       public.fl_can_read('uk') as fl_read_uk, public.fl_can_read(null) as fl_read_module,
       public.fl_can_read('narnia') as fl_read_unknown,
       public.s211_can_write() as s211_write, public.fl_can_write('australia') as fl_write_australia;
-- expect t, t, t, t, f, t, t
select count(*) as s211_reports_visible from public.s211_reports;
-- expect the number of S-211 reports you own (unchanged from before the migration)
rollback;
