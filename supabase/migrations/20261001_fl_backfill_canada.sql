-- supabase/migrations/20261001_fl_backfill_canada.sql
-- Forced Labour Reporting, Stage C step 3: give every existing Canada (S-211) report a Forced Labour parent.
--
-- Run in production on 2026-10-01 (verified). RUN AFTER 20261001_fl_shared_core.sql, which has run.
-- Verified the same day with supabase/verify/20261001_fl_backfill_canada_verify_summary.sql: 12 of 12 pass
-- (1 report, 1 parent, 0 unlinked, 0 mismatches, 0 orphans, 0 entities, 0 answers, S-211 policy
-- fingerprint e32cffdfb583aec735919346b37b804f). The builder on localhost showed the one report (Maple Test
-- Co.) unchanged and saving. Running it again is safe: it links only reports that have no parent.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- RUN THE WHOLE FILE AS ONE: one transaction. Then run
-- supabase/verify/20261001_fl_backfill_canada_verify_summary.sql: one row per check, every row pass = true.
--
-- WHAT IT DOES, for each s211_reports row whose fl_report_id is NULL:
--   1. one fl_reports row: same user_id; organization_name = company_name; period_end = financial_year_end;
--      period_start NULL; created_at = the Canada report's created_at.
--   2. one fl_report_countries row: country 'canada', status = the Canada report's status, applicability and
--      content '{}'. Canada's applicability inputs stay in s211_reports and its answers in
--      s211_report_sections; the Canada adapter (Stage C step 4) reads them there.
--   3. s211_reports.fl_report_id set to the new parent.
--
-- WHAT IT DOES NOT DO, ON PURPOSE
--   period_start is left NULL. The Canada report does not store a start date as a column (section 1 holds
--     year-end month and day, and an optional override); working one out is the application's
--     deriveFinancialYear, and a date this file computed would be an answer nobody gave.
--   No fl_report_entities and no fl_answers rows. Entities and shared answers come from section content,
--     which the adapter maps through lib/forcedLabour/fieldRegistry.ts. This file copies columns only.
--   s211_reports.updated_at is NOT touched: linking a report to a parent is not an edit the customer made,
--     and the list view sorts and labels by it.
--
-- RE-RUNNING: it only fills reports that have no parent, so a second run finds none and changes nothing.
-- Reports created by the current application after this runs (before step 4 ships) will have no parent;
-- running this file again links them.
--
-- CHECKS. The pre-flight refuses a blank company_name (organization_name may not be blank, and inventing
-- one is not this file's job) and records counts and a fingerprint of every s211_reports and
-- s211_report_sections row. The post-flight raises, rolling everything back, unless every Canada report is
-- linked, each new parent has exactly one 'canada' row, every copied value matches, the parent and country
-- counts rose by exactly the number of reports linked, and no s211_reports or s211_report_sections value
-- other than fl_report_id changed.

begin;

-- ── Pre-flight ─────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  if to_regclass('public.fl_reports') is null or to_regclass('public.fl_report_countries') is null then
    raise exception 'Pre-flight: fl_reports or fl_report_countries does not exist. Run 20261001_fl_shared_core.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 's211_reports' and column_name = 'fl_report_id') then
    raise exception 'Pre-flight: s211_reports.fl_report_id does not exist. Run 20261001_fl_shared_core.sql first.';
  end if;
  select count(*) into n from public.s211_reports where fl_report_id is null and btrim(company_name) = '';
  if n > 0 then
    raise exception 'Pre-flight: % unlinked S-211 report(s) have a blank company_name. Name them first; this file will not invent a name.', n;
  end if;
end
$$;

-- Snapshots for the post-flight. Temporary, gone at commit.
create temporary table _fl_bf_counts on commit drop as
  select (select count(*) from public.s211_reports) as reports,
         (select count(*) from public.s211_reports where fl_report_id is null) as unlinked,
         (select count(*) from public.fl_reports) as parents,
         (select count(*) from public.fl_report_countries where country = 'canada') as canada_rows,
         (select count(*) from public.fl_report_entities) as entities,
         (select count(*) from public.fl_answers) as answers;
create temporary table _fl_bf_reports on commit drop as
  select r.id, md5((to_jsonb(r) - 'fl_report_id')::text) as fingerprint from public.s211_reports r;
create temporary table _fl_bf_sections on commit drop as
  select s.id, md5(to_jsonb(s)::text) as fingerprint from public.s211_report_sections s;

-- One new parent id per unlinked Canada report.
create temporary table _fl_bf_map on commit drop as
  select r.id as s211_id, gen_random_uuid() as fl_id
  from public.s211_reports r
  where r.fl_report_id is null;

-- ── Backfill ───────────────────────────────────────────────────────────────────────────────────────
insert into public.fl_reports (id, user_id, organization_name, period_start, period_end, created_at, updated_at)
select m.fl_id, r.user_id, r.company_name, null, r.financial_year_end, r.created_at, now()
from _fl_bf_map m join public.s211_reports r on r.id = m.s211_id;

insert into public.fl_report_countries (report_id, country, status, applicability, content)
select m.fl_id, 'canada', r.status, '{}'::jsonb, '{}'::jsonb
from _fl_bf_map m join public.s211_reports r on r.id = m.s211_id;

update public.s211_reports r
set fl_report_id = m.fl_id
from _fl_bf_map m
where r.id = m.s211_id and r.fl_report_id is null;

-- ── Post-flight ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  c record;
  n int;
  bad text;
begin
  select * into c from _fl_bf_counts;

  -- 1. Every Canada report is linked, and the report count did not change.
  select count(*) into n from public.s211_reports where fl_report_id is null;
  if n <> 0 then raise exception 'Post-flight: % S-211 report(s) still have no parent', n; end if;
  select count(*) into n from public.s211_reports;
  if n <> c.reports then raise exception 'Post-flight: S-211 report count changed from % to %', c.reports, n; end if;

  -- 2. Parents and canada rows rose by exactly the number linked; entities and answers did not change.
  select count(*) into n from public.fl_reports;
  if n <> c.parents + c.unlinked then raise exception 'Post-flight: fl_reports % rows, expected % + %', n, c.parents, c.unlinked; end if;
  select count(*) into n from public.fl_report_countries where country = 'canada';
  if n <> c.canada_rows + c.unlinked then raise exception 'Post-flight: canada rows %, expected % + %', n, c.canada_rows, c.unlinked; end if;
  if (select count(*) from public.fl_report_entities) <> c.entities or (select count(*) from public.fl_answers) <> c.answers then
    raise exception 'Post-flight: fl_report_entities or fl_answers changed; this file writes neither';
  end if;

  -- 3. Each new parent: one canada row, copied values equal.
  select string_agg(m.s211_id::text, ', ') into bad
  from _fl_bf_map m
  join public.s211_reports r on r.id = m.s211_id
  join public.fl_reports f on f.id = m.fl_id
  where r.fl_report_id is distinct from m.fl_id
     or f.user_id <> r.user_id
     or f.organization_name <> r.company_name
     or f.period_end is distinct from r.financial_year_end
     or f.period_start is not null
     or (select count(*) from public.fl_report_countries k where k.report_id = f.id) <> 1
     or not exists (select 1 from public.fl_report_countries k
                    where k.report_id = f.id and k.country = 'canada' and k.status = r.status
                      and k.applicability = '{}'::jsonb and k.content = '{}'::jsonb);
  if bad is not null then raise exception 'Post-flight: backfilled values wrong for S-211 report(s): %', bad; end if;
  select count(*) into n from _fl_bf_map m join public.fl_reports f on f.id = m.fl_id;
  if n <> c.unlinked then raise exception 'Post-flight: % parents found for % reports linked', n, c.unlinked; end if;

  -- 4. Nothing else in s211_reports changed (fl_report_id aside), and s211_report_sections not at all.
  select count(*) into n
  from _fl_bf_reports b full join public.s211_reports r on r.id = b.id
  where b.id is null or r.id is null or md5((to_jsonb(r) - 'fl_report_id')::text) <> b.fingerprint;
  if n <> 0 then raise exception 'Post-flight: % s211_reports row(s) changed beyond fl_report_id', n; end if;
  select count(*) into n
  from _fl_bf_sections b full join public.s211_report_sections s on s.id = b.id
  where b.id is null or s.id is null or md5(to_jsonb(s)::text) <> b.fingerprint;
  if n <> 0 then raise exception 'Post-flight: % s211_report_sections row(s) changed', n; end if;
end
$$;

commit;
