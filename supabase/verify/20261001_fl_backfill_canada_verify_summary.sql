-- supabase/verify/20261001_fl_backfill_canada_verify_summary.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Verification for supabase/migrations/20261001_fl_backfill_canada.sql, as ONE read-only query: one row
-- per check, with check_name, expected, actual and pass. Run AFTER the backfill. Every row should read
-- pass = true.
--
-- It checks the state the backfill leaves, not the run itself (the migration's own post-flight did that):
-- so it stays valid for re-runs, and it reads the same before the Canada adapter (step 4) writes entities
-- or shared answers. Rows 10 and 11 expect no entities and no shared answers; once step 4 ships and a
-- customer saves, those two will rightly stop reading 0.

with
r as (select * from public.s211_reports),
linked as (
  select r.id as s211_id, r.user_id, r.company_name, r.financial_year_end, r.status, f.id as fl_id,
         f.user_id as fl_user, f.organization_name, f.period_start, f.period_end
  from r join public.fl_reports f on f.id = r.fl_report_id
),
checks as (
  select '01 every S-211 report has a parent' as check_name,
         'unlinked 0' as expected,
         'unlinked ' || (select count(*) from r where fl_report_id is null) as actual
  union all
  select '02 one Canada report per parent',
         'shared parents 0',
         'shared parents ' || (select count(*) from (select fl_report_id from r where fl_report_id is not null
                                                     group by fl_report_id having count(*) > 1) x)
  union all
  select '03 parents and S-211 reports: same number',
         'reports ' || (select count(*) from r) || ', parents ' || (select count(*) from r),
         'reports ' || (select count(*) from r) || ', parents ' || (select count(*) from public.fl_reports)
  union all
  select '04 parent owner = report owner',
         'mismatches 0',
         'mismatches ' || (select count(*) from linked where fl_user <> user_id)
  union all
  select '05 organization_name = company_name',
         'mismatches 0',
         'mismatches ' || (select count(*) from linked where organization_name <> company_name)
  union all
  select '06 period_end = financial_year_end, period_start empty',
         'mismatches 0',
         'mismatches ' || (select count(*) from linked
                           where period_end is distinct from financial_year_end or period_start is not null)
  union all
  select '07 each parent has exactly one country row, canada, status = the report''s',
         'mismatches 0',
         'mismatches ' || (select count(*) from linked l
                           where (select count(*) from public.fl_report_countries k where k.report_id = l.fl_id) <> 1
                              or not exists (select 1 from public.fl_report_countries k
                                             where k.report_id = l.fl_id and k.country = 'canada' and k.status = l.status))
  union all
  select '08 canada rows hold nothing yet (Canada''s answers stay in the S-211 tables)',
         'non-empty 0',
         'non-empty ' || (select count(*) from public.fl_report_countries
                          where country = 'canada' and (applicability <> '{}'::jsonb or content <> '{}'::jsonb))
  union all
  select '09 no parent without a Canada report, no canada row without one',
         'orphan parents 0, orphan canada rows 0',
         'orphan parents ' || (select count(*) from public.fl_reports f where not exists (select 1 from r where r.fl_report_id = f.id))
         || ', orphan canada rows ' || (select count(*) from public.fl_report_countries k
                                        where k.country = 'canada' and not exists (select 1 from r where r.fl_report_id = k.report_id))
  union all
  select '10 no entities written',
         'entities 0',
         'entities ' || (select count(*) from public.fl_report_entities)
  union all
  select '11 no shared answers written',
         'answers 0',
         'answers ' || (select count(*) from public.fl_answers)
  union all
  select '12 S-211 policies untouched (md5, schema prefixes removed; see the shared-core summary, check 03)',
         'e32cffdfb583aec735919346b37b804f',
         (select md5(string_agg(policyname || '|' || cmd || '|' || roles::text || '|' || replace(coalesce(qual, ''), 'public.', '')
                                || '|' || replace(coalesce(with_check, ''), 'public.', ''),
                                E'\n' order by tablename collate "C", policyname collate "C"))
          from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections'))
)
select check_name, expected, coalesce(actual, '(null)') as actual, coalesce(actual = expected, false) as pass
from checks
order by check_name collate "C";
