-- supabase/verify/20261001_fl_answers_per_country_count.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- READ-ONLY. How many fl_answers rows are held for the fields that became per-country in Stage D1b
-- (lib/forcedLabour/fieldRegistry.ts PER_COUNTRY). Since then nothing writes or reads them: each country keeps its
-- own answer in its own record. They are left over from Stage C and D1, when these fields were shared. One row per
-- field key, then a total. The delete is supabase/migrations/20261001_fl_answers_per_country_cleanup.sql.

with keys(field_key) as (
  select unnest(array[
    'policies_due_diligence.has_policy',
    'risks.risk_assessment_done',
    'risks.risk_areas',
    'risks.own_operations_risk',
    'risks.management_steps',
    'policies_due_diligence.due_diligence_description',
    'policies_due_diligence.purchasing_practices',
    'remediation.instances_identified',
    'remediation.remediation_taken',
    'remediation.remediation_description',
    'training.training_provided',
    'training.covers',
    'training.training_description',
    'effectiveness.assesses_effectiveness',
    'effectiveness.effectiveness_description',
    'effectiveness.goals_short_term',
    'effectiveness.goals_medium_term',
    'effectiveness.goals_long_term',
    'effectiveness.progress_since_last_report',
    'effectiveness.findings_changed_practice',
    'steps_taken.steps_summary',
    'report_details.legal_name',
    'report_details.joint_entities'
  ]::text[])
)
-- Ordered by the field key in the "C" collation, the total last. (A union is ordered by its output column names; a
-- number with a collation is an integer expression, not a column position, which Postgres refused on 1 Oct 2026.)
select field_key, rows_held from (
  select k.field_key, count(a.field_key) as rows_held
  from keys k left join public.fl_answers a on a.field_key = k.field_key
  group by k.field_key
  union all
  select '(total)', count(*) from public.fl_answers a where a.field_key in (select field_key from keys)
) x
order by (field_key = '(total)'), field_key collate "C";
