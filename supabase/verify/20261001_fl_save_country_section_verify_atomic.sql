-- supabase/verify/20261001_fl_save_country_section_verify_atomic.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- What fl_save_country_section DOES: a failure in either write leaves both tables unchanged, a good call
-- changes both, and Canada, a bad section key and an unknown status are refused before anything is written.
-- Run AFTER the migration. Every row should read pass = true.
--
-- IT CHANGES NOTHING. Every call is made inside its own savepoint (a BEGIN ... EXCEPTION block), and every
-- one is rolled back: a failing call by its own error, and any call that succeeds (the good call, or a
-- failing one that unexpectedly did not fail) by an error raised on purpose straight after it. The good
-- call needs a 'uk' row, which no report has yet, so it adds one inside that same rolled-back savepoint.
-- Only the results survive, in a temporary table; the last statement shows them.
--
-- It runs as you (postgres in the SQL editor), on the earliest linked report's parent. RLS does not apply to
-- postgres, so this checks the function's transaction, not its access rules (summary checks 08 and 09).

drop table if exists pg_temp._fl_country_atomic;
create temporary table _fl_country_atomic (check_name text, expected text, actual text, pass boolean);

do $$
declare
  v_fl uuid;
  v_ans_before jsonb;
  v_rows_before jsonb;
  v_ans jsonb;
  v_rows jsonb;
  v_err text;
  v_c_sec text;
  v_c_ans text;
  v_c_status text;
begin
  select r.fl_report_id into v_fl from public.s211_reports r
  where r.fl_report_id is not null order by r.created_at, r.id limit 1;
  if v_fl is null then
    insert into _fl_country_atomic values ('00 a linked report to test on', 'found', 'none', false);
    return;
  end if;
  insert into _fl_country_atomic values ('00 a linked report to test on', 'found', 'found', true);

  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans_before
  from public.fl_answers a where a.report_id = v_fl;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.country), '[]'::jsonb) into v_rows_before
  from public.fl_report_countries k where k.report_id = v_fl;

  -- A: the second write (the country row) fails after the first (the answers) has run: no 'australia' row.
  v_err := 'no error';
  begin
    perform public.fl_save_country_section(v_fl, 'australia', 'training', '{"training_provided":"VERIFY-A"}'::jsonb, 'in_progress',
                                           '{"training.training_provided":"VERIFY-A"}'::jsonb, array[]::text[]);
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then
    if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans from public.fl_answers a where a.report_id = v_fl;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.country), '[]'::jsonb) into v_rows from public.fl_report_countries k where k.report_id = v_fl;
  insert into _fl_country_atomic values
    ('A1 second write fails: the call raises no_data_found', 'P0002', v_err, v_err = 'P0002'),
    ('A2 second write fails: shared answers unchanged', 'unchanged', case when v_ans = v_ans_before then 'unchanged' else 'CHANGED' end, v_ans = v_ans_before),
    ('A3 second write fails: country rows unchanged', 'unchanged', case when v_rows = v_rows_before then 'unchanged' else 'CHANGED' end, v_rows = v_rows_before);

  -- B: the first write (the answers) fails on a field key the table refuses.
  v_err := 'no error';
  begin
    insert into public.fl_report_countries (report_id, country) values (v_fl, 'uk') on conflict (report_id, country) do nothing;
    perform public.fl_save_country_section(v_fl, 'uk', 'training', '{"training_provided":"VERIFY-B"}'::jsonb, 'in_progress',
                                           '{"training.training_provided":"VERIFY-B","BAD KEY":"x"}'::jsonb, array[]::text[]);
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then
    if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans from public.fl_answers a where a.report_id = v_fl;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.country), '[]'::jsonb) into v_rows from public.fl_report_countries k where k.report_id = v_fl;
  insert into _fl_country_atomic values
    ('B1 first write fails: the call raises check_violation', '23514', v_err, v_err = '23514'),
    ('B2 first write fails: shared answers unchanged', 'unchanged', case when v_ans = v_ans_before then 'unchanged' else 'CHANGED' end, v_ans = v_ans_before),
    ('B3 first write fails: country rows unchanged (the test uk row included)', 'unchanged', case when v_rows = v_rows_before then 'unchanged' else 'CHANGED' end, v_rows = v_rows_before);

  -- C: a good call changes both; read inside the savepoint, then rolled back on purpose.
  v_c_sec := 'not reached'; v_c_ans := 'not reached'; v_c_status := 'not reached';
  begin
    insert into public.fl_report_countries (report_id, country) values (v_fl, 'uk') on conflict (report_id, country) do nothing;
    perform public.fl_save_country_section(v_fl, 'uk', 'training', '{"training_provided":"VERIFY-C"}'::jsonb, 'in_progress',
                                           '{"training.training_provided":"VERIFY-C"}'::jsonb, array[]::text[]);
    select k.content #>> '{training,training_provided}', k.section_status ->> 'training' into v_c_sec, v_c_status
    from public.fl_report_countries k where k.report_id = v_fl and k.country = 'uk';
    select a.value #>> '{}' into v_c_ans from public.fl_answers a where a.report_id = v_fl and a.field_key = 'training.training_provided';
    raise exception 'roll back the good call' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then null;
    when others then v_c_sec := 'error ' || sqlstate;
  end;
  select coalesce(jsonb_object_agg(a.field_key, jsonb_build_array(a.value, a.updated_at)), '{}'::jsonb) into v_ans from public.fl_answers a where a.report_id = v_fl;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.country), '[]'::jsonb) into v_rows from public.fl_report_countries k where k.report_id = v_fl;
  insert into _fl_country_atomic values
    ('C1 good call: the uk section changed', 'VERIFY-C', coalesce(v_c_sec, '(null)'), v_c_sec = 'VERIFY-C'),
    ('C2 good call: the section status was set', 'in_progress', coalesce(v_c_status, '(null)'), v_c_status = 'in_progress'),
    ('C3 good call: the shared answer changed', 'VERIFY-C', coalesce(v_c_ans, '(null)'), v_c_ans = 'VERIFY-C'),
    ('C4 good call rolled back: both tables as before', 'unchanged',
       case when v_ans = v_ans_before and v_rows = v_rows_before then 'unchanged' else 'CHANGED' end,
       v_ans = v_ans_before and v_rows = v_rows_before);

  -- D: refused before any write: Canada, a malformed section key, an unknown status.
  v_err := 'no error';
  begin
    perform public.fl_save_country_section(v_fl, 'canada', 'training', '{}'::jsonb, 'in_progress', '{}'::jsonb, array[]::text[]);
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  insert into _fl_country_atomic values ('D1 Canada is refused', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin
    perform public.fl_save_country_section(v_fl, 'uk', 'Bad Key', '{}'::jsonb, 'in_progress', '{}'::jsonb, array[]::text[]);
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  insert into _fl_country_atomic values ('D2 a malformed section key is refused', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin
    perform public.fl_save_country_section(v_fl, 'uk', 'training', '{}'::jsonb, 'done', '{}'::jsonb, array[]::text[]);
    raise exception 'unexpected success, rolled back' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if;
  end;
  insert into _fl_country_atomic values ('D3 an unknown status is refused', '22023', v_err, v_err = '22023');
end
$$;

select check_name, expected, actual, pass from _fl_country_atomic order by check_name collate "C";
