-- supabase/verify/20261001_fl_shared_core_verify_summary.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Checks 1 to 11 of 20261001_fl_shared_core_verify.sql as ONE read-only query: one row per check, with
-- check_name, expected, actual and pass. The Supabase SQL editor shows only the last result of a script,
-- so this is a single statement. Check 12 (as your account) is a separate statement:
-- 20261001_fl_shared_core_verify_as_account.sql. Run AFTER the migration. Every row should read pass = true.
--
-- Check 03 fingerprints the eight S-211 policies against their text in db/dumps/schema_public_20261001_1057.sql,
-- taken before the migration ran: md5 of "policyname|cmd|roles|qual|with_check", one per line, sorted by
-- table and policy name in the "C" collation, with every "public." removed from qual and with_check. The
-- migration's own post-flight already compared them with a snapshot taken inside the same transaction;
-- this repeats the comparison against the dump.
-- ⚠️ WHY "public." IS REMOVED. pg_get_expr, which produces both pg_policies.qual and the dump's policy text,
-- schema-qualifies a name only when its schema is not on the current search_path. pg_dump runs with an empty
-- search_path, so the dump reads public.s211_can_write() and public.s211_reports; the SQL editor has public
-- on its path, so pg_policies reads s211_can_write() and s211_reports. Same policies, different text. The
-- first version of this check compared them raw and failed on 1 Oct 2026 for that reason alone: the eight
-- rows matched, character for character, Lisa's capture of 30 Sep. auth.uid() stays qualified either way.

with
fl_tables as (
  select unnest(array['fl_answers', 'fl_report_countries', 'fl_report_entities', 'fl_reports']) as t
),
new_policies as (
  select tablename, policyname, cmd, roles::text as roles,
         coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
  from pg_policies where schemaname = 'public' and tablename like 'fl\_%'
),
fns as (
  select p.proname,
         p.proname || ':' || p.prosecdef::text || ':' || coalesce(p.proconfig = array['search_path=""'], false)::text
           || ':' || p.provolatile::text || ':' || pg_get_userbyid(p.proowner) as line
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fl_can_read', 'fl_can_write', 's211_can_read', 's211_can_write')
),
grants as (
  select t, r,
         (case when has_table_privilege(r, 'public.' || t, 'SELECT') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'INSERT') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'UPDATE') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'DELETE') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'TRUNCATE') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'REFERENCES') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'TRIGGER') then '1' else '0' end)
      || (case when has_table_privilege(r, 'public.' || t, 'MAINTAIN') then '1' else '0' end) as bits
  from fl_tables, unnest(array['anon', 'authenticated']) as r
),
checks as (
  -- 01
  select '01 new tables: RLS on, 4 policies each' as check_name,
         'fl_answers:true:4, fl_report_countries:true:4, fl_report_entities:true:4, fl_reports:true:4' as expected,
         (select string_agg(t || ':' || c.relrowsecurity::text || ':'
                   || (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t), ', '
                   order by t collate "C")
          from fl_tables join pg_class c on c.oid = to_regclass('public.' || t)) as actual
  union all
  -- 02
  select '02 S-211 tables: policy counts unchanged',
         's211_report_sections:4, s211_reports:4',
         (select string_agg(tablename || ':' || n, ', ' order by tablename collate "C")
          from (select tablename::text, count(*) as n from pg_policies
                where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')
                group by tablename) x)
  union all
  -- 03
  select '03 S-211 policies identical to the 1 Oct dump (md5, schema prefixes removed)',
         'e32cffdfb583aec735919346b37b804f',
         (select md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || replace(coalesce(qual, ''), 'public.', '')
                                || '|' || replace(coalesce(with_check, ''), 'public.', ''),
                                E'\n' order by tablename collate "C", policyname collate "C"))
          from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections'))
  union all
  -- 04
  select '04 new policies: 16, authenticated, right check per command, auth.uid() wrapped',
         '16 policies, 16 correct',
         (select count(*) || ' policies, ' || count(*) filter (where
                   roles = '{authenticated}'
               and expr ~ case when cmd = 'SELECT' then 'fl_can_read' else 'fl_can_write' end
               and expr !~ case when cmd = 'SELECT' then 'fl_can_write' else 'fl_can_read' end
               and expr ~ case when tablename = 'fl_report_countries' then 'fl_can_(read|write)\(country\)'
                               else 'fl_can_(read|write)\(NULL(::text)?\)' end
               and expr ~ 'SELECT auth\.uid\(\) AS uid') || ' correct'
          from new_policies)
  union all
  -- 05
  select '05 bare auth.uid() in any policy, any schema',
         'public.audit_log.audit_select_own',
         (select coalesce(string_agg(schemaname || '.' || tablename || '.' || policyname, ', '
                   order by schemaname collate "C", tablename collate "C", policyname collate "C"), '(none)')
          from pg_policies
          where regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
                  '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)')
  union all
  -- 06
  select '06 functions: security definer, search_path empty, stable, owner postgres',
         'fl_can_read:true:true:s:postgres, fl_can_write:true:true:s:postgres, s211_can_read:true:true:s:postgres, s211_can_write:true:true:s:postgres',
         (select string_agg(line, ', ' order by proname collate "C") from fns)
  union all
  -- 07
  select '07 wrappers call fl_can_read/write(''canada'')',
         's211_can_read:true, s211_can_write:true',
         's211_can_read:' || (pg_get_functiondef('public.s211_can_read()'::regprocedure) ~ 'fl_can_read\(''canada''\)')::text
         || ', s211_can_write:' || (pg_get_functiondef('public.s211_can_write()'::regprocedure) ~ 'fl_can_write\(''canada''\)')::text
  union all
  -- 08
  select '08 execute: anon none, authenticated yes',
         'anon fl_read:false, anon fl_write:false, public fl_write:false, auth fl_read:true, auth fl_write:true, anon s211_read:false, auth s211_read:true',
         'anon fl_read:' || has_function_privilege('anon', 'public.fl_can_read(text)', 'execute')::text
         || ', anon fl_write:' || has_function_privilege('anon', 'public.fl_can_write(text)', 'execute')::text
         || ', public fl_write:' || has_function_privilege('public', 'public.fl_can_write(text)', 'execute')::text
         || ', auth fl_read:' || has_function_privilege('authenticated', 'public.fl_can_read(text)', 'execute')::text
         || ', auth fl_write:' || has_function_privilege('authenticated', 'public.fl_can_write(text)', 'execute')::text
         || ', anon s211_read:' || has_function_privilege('anon', 'public.s211_can_read()', 'execute')::text
         || ', auth s211_read:' || has_function_privilege('authenticated', 'public.s211_can_read()', 'execute')::text
  union all
  -- 09: bits are SELECT INSERT UPDATE DELETE TRUNCATE REFERENCES TRIGGER MAINTAIN
  select '09 table grants (bits: sel ins upd del trunc refs trig maint)',
         'fl_answers:anon:00000000, fl_answers:authenticated:11110000, fl_report_countries:anon:00000000, fl_report_countries:authenticated:11110000, '
         || 'fl_report_entities:anon:00000000, fl_report_entities:authenticated:11110000, fl_reports:anon:00000000, fl_reports:authenticated:11110000',
         (select string_agg(t || ':' || r || ':' || bits, ', ' order by t collate "C", r collate "C") from grants)
  union all
  -- 10
  select '10 s211_reports.fl_report_id: composite key to fl_reports, nothing linked before the backfill',
         'FOREIGN KEY (fl_report_id, user_id) REFERENCES fl_reports(id, user_id); linked 0',
         coalesce((select regexp_replace(pg_get_constraintdef(oid), 'REFERENCES public\.', 'REFERENCES ')
                   from pg_constraint where conrelid = 'public.s211_reports'::regclass and conname = 's211_reports_fl_report_fkey'), '(missing)')
         || '; linked ' || (select count(fl_report_id) from public.s211_reports)
  union all
  -- 11
  select '11 as postgres (no signed-in user) every check is false',
         'fl canada:false, fl uk:false, fl narnia:false, s211:false',
         'fl canada:' || public.fl_can_read('canada')::text || ', fl uk:' || public.fl_can_read('uk')::text
         || ', fl narnia:' || public.fl_can_read('narnia')::text || ', s211:' || public.s211_can_read()::text
)
select check_name, expected, coalesce(actual, '(null)') as actual, coalesce(actual = expected, false) as pass
from checks
order by check_name collate "C";
