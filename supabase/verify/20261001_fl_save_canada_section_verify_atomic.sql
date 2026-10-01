-- supabase/verify/20261001_fl_save_canada_section_verify_atomic.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- What fl_save_canada_section DOES: a failure in either write leaves both tables unchanged, and a good call
-- changes both. Run AFTER the migration. Every row should read pass = true.
--
-- IT CHANGES NOTHING. Every call is made inside its own savepoint (a BEGIN ... EXCEPTION block), and every
-- one of those is rolled back: a failing call by its own error, and any call that succeeds (the good call,
-- or a failing one that unexpectedly did not fail) by an error raised on purpose straight after it. Only the results survive, in a temporary table that lasts for this
-- session; the last statement shows them, because the SQL editor shows only the last result.
--
-- It runs as you (postgres in the SQL editor), on the earliest linked S-211 report, section 'training'.
-- RLS does not apply to postgres, so this checks the function's transaction, not its access rules; those are
-- the tables' own policies, unchanged (summary checks 06 and 07).
--
-- The three calls:
--   A  the SECOND write fails: valid answers, then a section status the table refuses ('bogus').
--   B  the FIRST write fails: an answer with a field key the table refuses ('BAD KEY').
--   C  a good call: both tables change; then rolled back on purpose.

drop table if exists pg_temp._fl_atomic;
create temporary table _fl_atomic (check_name text, expected text, actual text, pass boolean);

do $$
declare
  v_report uuid;
  v_fl uuid;
  v_sec_before jsonb;
  v_ans_before jsonb;
  v_err text;
  v_sec jsonb;
  v_ans jsonb;
  v_c_sec text;
  v_c_ans text;
begin
  select r.id, r.fl_report_id into v_report, v_fl from public.s211_reports r
  where r.fl_report_id is not null order by r.created_at, r.id limit 1;
  if v_report is null then
    insert into _fl_atomic values ('00 a linked S-211 report to test on', 'found', 'none', false);
    return;
  end if;
  insert into _fl_atomic values ('00 a linked S-211 report to test on', 'found', 'found', true);

  -- Snapshot: the training section and every shared answer of this report.
  select to_jsonb(s) - 'id' into v_sec_before from public.s211_report_sections s where s.report_id = v_report and s.section_key = 'training';
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans_before
  from public.fl_answers a where a.report_id = v_fl;

  -- A: the second write (the section) fails after the first (the answers) has run.
  v_err := 'no error';
  begin
    perform public.fl_save_canada_section(v_report, 'training', '{"training_provided":"VERIFY-A"}'::jsonb, 'bogus',
                                          '{"training.training_provided":"VERIFY-A"}'::jsonb, array[]::text[]);
    -- Reached only if the call did NOT fail: roll it back anyway, so this script never keeps a write.
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then
    if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  select to_jsonb(s) - 'id' into v_sec from public.s211_report_sections s where s.report_id = v_report and s.section_key = 'training';
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans
  from public.fl_answers a where a.report_id = v_fl;
  insert into _fl_atomic values
    ('A1 second write fails: the call raises check_violation', '23514', v_err, v_err = '23514'),
    ('A2 second write fails: shared answers unchanged', 'unchanged', case when v_ans = v_ans_before then 'unchanged' else 'CHANGED' end, v_ans = v_ans_before),
    ('A3 second write fails: section unchanged', 'unchanged', case when v_sec is not distinct from v_sec_before then 'unchanged' else 'CHANGED' end, v_sec is not distinct from v_sec_before);

  -- B: the first write (the answers) fails; the section write never runs.
  v_err := 'no error';
  begin
    perform public.fl_save_canada_section(v_report, 'training', '{"training_provided":"VERIFY-B"}'::jsonb, 'in_progress',
                                          '{"training.training_provided":"VERIFY-B","BAD KEY":"x"}'::jsonb, array[]::text[]);
    -- Reached only if the call did NOT fail: roll it back anyway, so this script never keeps a write.
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then
    if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  select to_jsonb(s) - 'id' into v_sec from public.s211_report_sections s where s.report_id = v_report and s.section_key = 'training';
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans
  from public.fl_answers a where a.report_id = v_fl;
  insert into _fl_atomic values
    ('B1 first write fails: the call raises check_violation', '23514', v_err, v_err = '23514'),
    ('B2 first write fails: shared answers unchanged', 'unchanged', case when v_ans = v_ans_before then 'unchanged' else 'CHANGED' end, v_ans = v_ans_before),
    ('B3 first write fails: section unchanged', 'unchanged', case when v_sec is not distinct from v_sec_before then 'unchanged' else 'CHANGED' end, v_sec is not distinct from v_sec_before);

  -- C: a good call changes both; read inside the savepoint, then rolled back on purpose.
  v_c_sec := 'not reached';
  v_c_ans := 'not reached';
  begin
    perform public.fl_save_canada_section(v_report, 'training', '{"training_provided":"VERIFY-C"}'::jsonb, 'in_progress',
                                          '{"training.training_provided":"VERIFY-C"}'::jsonb, array[]::text[]);
    select s.content ->> 'training_provided' into v_c_sec from public.s211_report_sections s where s.report_id = v_report and s.section_key = 'training';
    select a.value #>> '{}' into v_c_ans from public.fl_answers a where a.report_id = v_fl and a.field_key = 'training.training_provided';
    raise exception 'roll back the good call' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then null;
    when others then v_c_sec := 'error ' || sqlstate;
  end;
  select to_jsonb(s) - 'id' into v_sec from public.s211_report_sections s where s.report_id = v_report and s.section_key = 'training';
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans
  from public.fl_answers a where a.report_id = v_fl;
  insert into _fl_atomic values
    ('C1 good call: the section changed', 'VERIFY-C', coalesce(v_c_sec, '(null)'), v_c_sec = 'VERIFY-C'),
    ('C2 good call: the shared answer changed', 'VERIFY-C', coalesce(v_c_ans, '(null)'), v_c_ans = 'VERIFY-C'),
    ('C3 good call rolled back: both tables as before', 'unchanged',
       case when v_ans = v_ans_before and v_sec is not distinct from v_sec_before then 'unchanged' else 'CHANGED' end,
       v_ans = v_ans_before and v_sec is not distinct from v_sec_before);
end
$$;

select check_name, expected, actual, pass from _fl_atomic order by check_name collate "C";
