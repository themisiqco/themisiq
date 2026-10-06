-- docs/review/patches/RET1-M10-verify.sql
--
-- ⚠️ RUN 6 Oct 2026 in the Supabase SQL editor (recorded by Lisa), after M10: all 8 checks passed. DO NOT RUN AGAIN as
-- part of the rollout. It is safe to re-run as a check (it undoes itself), but no one needs to repeat it.
-- Run AFTER RET1-M10-retention-jobs.sql, in the Supabase SQL editor, the whole file. It changes nothing: the
-- test rows are inserted, both purge functions are called, and the block ends by raising 'm10_undo', which rolls it all
-- back, INCLUDING any real rows the purge calls deleted (the jobs delete those at their own time). The L0 to M9 pattern.
--
-- WHAT IT PROVES
--   J1  job ret1-purge-rate-limits exists once: '15 7 * * *', 'select public.ret1_purge_rate_limits()', active
--   J2  job ret1-purge-free-calc-holds exists once: '25 7 * * *', 'select public.ret1_purge_free_calc_holds()', active
--   J3  neither purge function is executable by anon, authenticated or service_role
--   R1  a rate_limits row 31 days old is deleted by the purge
--   R2  a rate_limits row 29 days old is kept
--   H1  a free_calc_pending hold whose 24 hours ended yesterday is deleted
--   H2  a hold whose 24 hours are still running is kept
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m10_checks (check_name text, expected text, actual text);
truncate m10_checks;

insert into m10_checks select 'J1 rate-limit job once, daily 07:15 UTC', '1',
  (select count(*) from cron.job where jobname = 'ret1-purge-rate-limits' and schedule = '15 7 * * *'
     and command = 'select public.ret1_purge_rate_limits()' and active)::text;
insert into m10_checks select 'J2 hold job once, daily 07:25 UTC', '1',
  (select count(*) from cron.job where jobname = 'ret1-purge-free-calc-holds' and schedule = '25 7 * * *'
     and command = 'select public.ret1_purge_free_calc_holds()' and active)::text;
insert into m10_checks select 'J3 no browser or API role can run a purge', 'false',
  (has_function_privilege('anon', 'public.ret1_purge_rate_limits()', 'execute')
   or has_function_privilege('authenticated', 'public.ret1_purge_rate_limits()', 'execute')
   or has_function_privilege('service_role', 'public.ret1_purge_rate_limits()', 'execute')
   or has_function_privilege('anon', 'public.ret1_purge_free_calc_holds()', 'execute')
   or has_function_privilege('authenticated', 'public.ret1_purge_free_calc_holds()', 'execute')
   or has_function_privilege('service_role', 'public.ret1_purge_free_calc_holds()', 'execute'))::text;

do $t$
declare
  v_old  bigint;
  v_new  bigint;
  v_exp  uuid;
  v_live uuid;
  r text[] := array_fill(''::text, array[4]);
begin
  begin
    insert into public.rate_limits (bucket, ip, email, created_at) values ('m10-verify', '192.0.2.1', null, now() - interval '31 days') returning id into v_old;
    insert into public.rate_limits (bucket, ip, email, created_at) values ('m10-verify', '192.0.2.1', null, now() - interval '29 days') returning id into v_new;
    insert into public.free_calc_pending (email, email_key, payload, created_at, expires_at)
    values ('m10-verify-expired@example.com', 'm10-verify-expired@example.com', '{}', now() - interval '2 days', now() - interval '1 day')
    returning id into v_exp;
    insert into public.free_calc_pending (email, email_key, payload, created_at, expires_at)
    values ('m10-verify-live@example.com', 'm10-verify-live@example.com', '{}', now(), now() + interval '24 hours')
    returning id into v_live;

    perform public.ret1_purge_rate_limits();
    perform public.ret1_purge_free_calc_holds();

    r[1] := case when exists (select 1 from public.rate_limits where id = v_old) then 'kept' else 'deleted' end;
    r[2] := case when exists (select 1 from public.rate_limits where id = v_new) then 'kept' else 'deleted' end;
    r[3] := case when exists (select 1 from public.free_calc_pending where id = v_exp) then 'kept' else 'deleted' end;
    r[4] := case when exists (select 1 from public.free_calc_pending where id = v_live) then 'kept' else 'deleted' end;

    raise exception 'm10_undo';
  exception when others then
    if sqlerrm <> 'm10_undo' then raise; end if;
  end;

  insert into m10_checks values
    ('R1 rate_limits row 31 days old', 'deleted', r[1]),
    ('R2 rate_limits row 29 days old', 'kept', r[2]),
    ('H1 hold whose 24 hours ended yesterday', 'deleted', r[3]),
    ('H2 hold still within its 24 hours', 'kept', r[4]);
end
$t$;

insert into m10_checks select 'nothing left behind', '0',
  ((select count(*) from public.rate_limits where bucket = 'm10-verify')
   + (select count(*) from public.free_calc_pending where email_key like 'm10-verify-%'))::text;

select check_name, expected, actual, actual = expected as pass from m10_checks;
