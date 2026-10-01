-- supabase/verify/20261001_fl_save_country_section_verify_summary.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Verification for supabase/migrations/20261001_fl_save_country_section.sql, as ONE read-only query: one row
-- per check, with check_name, expected, actual and pass. Run AFTER the migration. Every row should read
-- pass = true. What the function DOES is the second script, 20261001_fl_save_country_section_verify_atomic.sql.

-- Check "every table ... is schema-qualified" removes string literals before it looks: an error message such as
-- 'a Canada report starts from s211_reports' names a table in words, not in SQL. Until 1 Oct 2026 it did not, and
-- 20261001_fl_entities_and_create_verify_summary.sql reported "unqualified 1" for that sentence in
-- fl_create_report (a false positive: the behaviour script ran the function under its empty search_path).
with
fn as (
  select p.oid, p.prosecdef, p.provolatile::text as volatility, p.proconfig, l.lanname::text as lang,
         pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
         pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.proname = 'fl_save_country_section'
),
col as (
  select c.data_type::text as data_type, c.is_nullable::text as nullable, c.column_default::text as dflt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'fl_report_countries' and c.column_name = 'section_status'
),
checks as (
  select '01 the function exists, once, with its signature' as check_name,
         '1: p_report_id uuid, p_country text, p_section_key text, p_content jsonb, p_status text, p_answers jsonb, p_remove text[] -> jsonb' as expected,
         (select count(*) || ': ' || coalesce(string_agg(args || ' -> ' || result, '; '), '') from fn) as actual
  union all
  select '02 security invoker, volatile, plpgsql',
         'security definer false, volatility v, plpgsql',
         (select 'security definer ' || prosecdef::text || ', volatility ' || volatility || ', ' || lang from fn)
  union all
  select '03 search_path empty',
         'true',
         (select coalesce(proconfig = array['search_path=""'], false)::text from fn)
  union all
  select '04 execute: authenticated only',
         'authenticated:true, anon:false, service_role:false, public:false',
         (select 'authenticated:' || has_function_privilege('authenticated', oid, 'execute')::text
              || ', anon:' || has_function_privilege('anon', oid, 'execute')::text
              || ', service_role:' || has_function_privilege('service_role', oid, 'execute')::text
              || ', public:' || has_function_privilege('public', oid, 'execute')::text from fn)
  union all
  select '05 every table it names is schema-qualified',
         'unqualified 0',
         (select 'unqualified ' || (select count(*) from regexp_matches(regexp_replace(def, '''(?:[^'']|'''')*''', '''''', 'g'), '(?:from|into|update|join)\s+(?!public\.)(fl_|s211_)\w+', 'gi')) from fn)
  union all
  select '06 section_status: jsonb, not null, default empty object',
         'jsonb, NO, ''{}''::jsonb',
         (select data_type || ', ' || nullable || ', ' || dflt from col)
  union all
  select '07 existing country rows: section_status empty',
         'non-empty 0',
         'non-empty ' || (select count(*) from public.fl_report_countries where section_status <> '{}'::jsonb)
  union all
  select '08 policy counts on the tables it writes, unchanged',
         'fl_answers:4, fl_report_countries:4, fl_reports:4',
         (select string_agg(t || ':' || n, ', ' order by t collate "C")
          from (select tablename::text as t, count(*) as n from pg_policies
                where schemaname = 'public' and tablename in ('fl_answers', 'fl_report_countries', 'fl_reports')
                group by tablename) x)
  union all
  select '09 S-211 policies identical to the 1 Oct dump (md5, schema prefixes removed)',
         'e32cffdfb583aec735919346b37b804f',
         (select md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || replace(coalesce(qual, ''), 'public.', '')
                                || '|' || replace(coalesce(with_check, ''), 'public.', ''),
                                E'\n' order by tablename collate "C", policyname collate "C"))
          from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections'))
)
select check_name, expected, coalesce(actual, '(null)') as actual, coalesce(actual = expected, false) as pass
from checks
order by check_name collate "C";
