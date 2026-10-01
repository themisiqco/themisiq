-- supabase/migrations/20261001_fl_answers_per_country_cleanup.sql
-- Forced Labour Reporting, Stage D1b follow-up: delete the fl_answers rows left over for fields that became
-- per-country (lib/forcedLabour/fieldRegistry.ts PER_COUNTRY).
--
-- Run in production on 2026-10-01 (verified). Do not run it a second time: there is nothing left for it to delete.
-- Result, as reported: the count script (supabase/verify/20261001_fl_answers_per_country_count.sql) found 1 row,
-- training.training_provided, total 1. This file's before/after showed training.training_provided before 1, after 0;
-- total before 1, after 0.
-- Written 1 Oct 2026. The count script was to be run FIRST, and its result kept as the "before" this file is checked against.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- WHY THEY ARE SAFE TO DELETE. Since Stage D1b these 23 keys are no longer shared: Canada's answers to them are in
-- s211_report_sections (which held them all along, the Canada adapter writes the whole section there), and the
-- UK's are in fl_report_countries.content under its own keys (uk_<section>.<field>). No code reads these rows:
-- the overlay reads only shared keys, and drafts read each country's own record. They still hold the last value a
-- country gave while the field was shared, which the overview would show nowhere and nothing would correct.
--
-- WHAT IT DOES. One transaction: counts the rows for exactly these keys and every other row, deletes exactly these
-- keys, and checks that none remain and that no other row was touched. Any failure rolls it all back. The last
-- statement shows each key's count before and after.

drop table if exists pg_temp._fl_cleanup_before;

begin;

create temporary table _fl_cleanup_keys (field_key text primary key) on commit drop;
insert into _fl_cleanup_keys (field_key) values
    ('policies_due_diligence.has_policy'),
    ('risks.risk_assessment_done'),
    ('risks.risk_areas'),
    ('risks.own_operations_risk'),
    ('risks.management_steps'),
    ('policies_due_diligence.due_diligence_description'),
    ('policies_due_diligence.purchasing_practices'),
    ('remediation.instances_identified'),
    ('remediation.remediation_taken'),
    ('remediation.remediation_description'),
    ('training.training_provided'),
    ('training.covers'),
    ('training.training_description'),
    ('effectiveness.assesses_effectiveness'),
    ('effectiveness.effectiveness_description'),
    ('effectiveness.goals_short_term'),
    ('effectiveness.goals_medium_term'),
    ('effectiveness.goals_long_term'),
    ('effectiveness.progress_since_last_report'),
    ('effectiveness.findings_changed_practice'),
    ('steps_taken.steps_summary'),
    ('report_details.legal_name'),
    ('report_details.joint_entities');

create temporary table _fl_cleanup_before on commit preserve rows as
  select k.field_key, (select count(*) from public.fl_answers a where a.field_key = k.field_key) as before
  from _fl_cleanup_keys k;
create temporary table _fl_cleanup_others on commit drop as
  select count(*) as n, md5(coalesce(string_agg(a.report_id::text || '|' || a.field_key || '|' || a.value::text, E'\n' order by a.report_id, a.field_key), '')) as fingerprint
  from public.fl_answers a where a.field_key not in (select field_key from _fl_cleanup_keys);

delete from public.fl_answers a where a.field_key in (select field_key from _fl_cleanup_keys);

do $$
declare
  n int;
  o record;
begin
  select count(*) into n from public.fl_answers a where a.field_key in (select field_key from _fl_cleanup_keys);
  if n <> 0 then raise exception 'Post-flight: % rows remain for the per-country keys', n; end if;
  select * into o from _fl_cleanup_others;
  if (select count(*) from public.fl_answers a where a.field_key not in (select field_key from _fl_cleanup_keys)) <> o.n
     or (select md5(coalesce(string_agg(a.report_id::text || '|' || a.field_key || '|' || a.value::text, E'\n' order by a.report_id, a.field_key), ''))
         from public.fl_answers a where a.field_key not in (select field_key from _fl_cleanup_keys)) <> o.fingerprint then
    raise exception 'Post-flight: rows for other keys changed';
  end if;
end
$$;

commit;

-- Before and after, per key, the total last (the temporary table lasts for this session only). Ordered by name: a
-- union is ordered by its output column names, and "order by 1 collate" is an integer expression, not a column.
select field_key, before, after from (
  select b.field_key, b.before, (select count(*) from public.fl_answers a where a.field_key = b.field_key) as after
  from _fl_cleanup_before b
  union all
  select '(total)', (select sum(before) from _fl_cleanup_before)::bigint,
         (select count(*) from public.fl_answers a where a.field_key in (select field_key from _fl_cleanup_before))
) x
order by (field_key = '(total)'), field_key collate "C";
