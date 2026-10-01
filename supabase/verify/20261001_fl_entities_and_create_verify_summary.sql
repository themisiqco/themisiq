-- supabase/verify/20261001_fl_entities_and_create_verify_summary.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Verification for supabase/migrations/20261001_fl_entities_and_create.sql, as ONE read-only query: one row per
-- check, with check_name, expected, actual and pass. Run AFTER the migration. Every row should read pass = true.
-- What the functions DO is the second script, 20261001_fl_entities_and_create_verify_behaviour.sql.

-- Check "every table ... is schema-qualified" removes string literals before it looks: an error message such as
-- 'a Canada report starts from s211_reports' names a table in words, not in SQL. Until 1 Oct 2026 it did not, and
-- 20261001_fl_entities_and_create_verify_summary.sql reported "unqualified 1" for that sentence in
-- fl_create_report (a false positive: the behaviour script ran the function under its empty search_path).
with
fn as (
  select p.oid, p.proname::text as name, p.prosecdef, p.provolatile::text as volatility, p.proconfig, l.lanname::text as lang,
         pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.proname in ('fl_set_country_entities', 'fl_create_report')
),
col as (
  select c.data_type::text as data_type, c.is_nullable::text as nullable, c.column_default::text as dflt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'fl_report_entities' and c.column_name = 'giving_in'
),
checks as (
  select '01 the two functions, with their signatures' as check_name,
         'fl_create_report(p_organization_name text, p_country text) -> uuid; fl_set_country_entities(p_report_id uuid, p_country text, p_giving text, p_covered text[]) -> jsonb' as expected,
         (select string_agg(name || '(' || args || ') -> ' || result, '; ' order by name collate "C") from fn) as actual
  union all
  select '02 security invoker, volatile, plpgsql, empty search_path',
         'fl_create_report:false:v:plpgsql:true, fl_set_country_entities:false:v:plpgsql:true',
         (select string_agg(name || ':' || prosecdef::text || ':' || volatility || ':' || lang || ':' || coalesce(proconfig = array['search_path=""'], false)::text, ', ' order by name collate "C") from fn)
  union all
  select '03 execute: authenticated only',
         'fl_create_report:true/false/false/false, fl_set_country_entities:true/false/false/false',
         (select string_agg(name || ':' || has_function_privilege('authenticated', oid, 'execute')::text || '/' || has_function_privilege('anon', oid, 'execute')::text
                  || '/' || has_function_privilege('service_role', oid, 'execute')::text || '/' || has_function_privilege('public', oid, 'execute')::text, ', ' order by name collate "C") from fn)
  union all
  select '04 every table they name is schema-qualified',
         'unqualified 0',
         'unqualified ' || (select coalesce(sum(n), 0) from (select (select count(*) from regexp_matches(regexp_replace(def, '''(?:[^'']|'''')*''', '''''', 'g'), '(?:from|into|update|join)\s+(?!public\.)(fl_|s211_)\w+', 'gi')) as n from fn) x)
  union all
  select '05 giving_in: text array, not null, default empty',
         'ARRAY, NO, ''{}''::text[]',
         (select data_type || ', ' || nullable || ', ' || dflt from col)
  union all
  select '06 existing entities: giving_in empty',
         'non-empty 0',
         'non-empty ' || (select count(*) from public.fl_report_entities where giving_in <> '{}')
  union all
  select '07 policy counts on the tables they write, unchanged',
         'fl_report_countries:4, fl_report_entities:4, fl_reports:4',
         (select string_agg(t || ':' || n, ', ' order by t collate "C")
          from (select tablename::text as t, count(*) as n from pg_policies
                where schemaname = 'public' and tablename in ('fl_report_entities', 'fl_report_countries', 'fl_reports') group by tablename) x)
  union all
  select '08 S-211 policies identical to the 1 Oct dump (md5, schema prefixes removed)',
         'e32cffdfb583aec735919346b37b804f',
         (select md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || replace(coalesce(qual, ''), 'public.', '')
                                || '|' || replace(coalesce(with_check, ''), 'public.', ''),
                                E'\n' order by tablename collate "C", policyname collate "C"))
          from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections'))
)
select check_name, expected, coalesce(actual, '(null)') as actual, coalesce(actual = expected, false) as pass
from checks
order by check_name collate "C";
