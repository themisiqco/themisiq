-- docs/review/patches/RET1-M10-retention-jobs.sql
--
-- ⚠️ NOT RUN. Drafted 6 Oct 2026 (RET1, migration M10). To become supabase/migrations/2026MMDD_retention_jobs.sql.
--
-- WHY. Two tables hold personal data with no deletion (PIPEDA's limiting-retention principle; Quebec's Law 25):
--   public.rate_limits         IP addresses and email keys, written by lib/rateLimit.ts and never deleted
--                              (supabase/migrations/20260702_rate_limits.sql said so: "rows accrue indefinitely");
--   public.free_calc_pending   a visitor's calculation, email and IP, held 24 hours (L3-M4); an expired hold is deleted
--                              only when the NEXT hold is made, so the last ones can sit indefinitely.
-- Lisa's decision (6 Oct 2026): rate-limit records 30 days; expired holds removed by a daily sweep. The Privacy Policy
-- (v2.4) states both periods, so THIS FILE MUST RUN BEFORE THAT PAGE GOES LIVE (see RUN ORDER).
--
-- WHAT IT DOES
--   1. Enables pg_cron. It was NOT enabled: the full dump of 27 Sep 2026 (db/dumps/schema_public_20260927_1928.sql)
--      lists the extensions pg_stat_statements, pgcrypto, supabase_vault and uuid-ossp, and no pg_cron and no cron
--      schema. (extensions.grant_pg_cron_access() is in that dump, but Supabase ships it on every project, enabled or
--      not.) `create extension if not exists` makes this a no-op if it has been enabled since.
--      If the SQL editor refuses it, enable pg_cron in the dashboard (Database, Extensions, pg_cron) and run the file
--      again: the rest does not depend on how it was enabled.
--   2. An index on rate_limits (created_at), so the daily delete does not scan the whole table.
--   3. Two functions, each deleting from ONE table by ONE time condition, in batches of 5,000 rows:
--        public.ret1_purge_rate_limits()   rate_limits rows with created_at older than 30 days
--        public.ret1_purge_free_calc_holds()  free_calc_pending rows whose expires_at has passed
--      SECURITY DEFINER, empty search_path, every name qualified; EXECUTE revoked from public, anon, authenticated and
--      service_role, so only the job (run by the postgres role that owns them) can call them. Each returns the number
--      of rows it deleted, which cron.job_run_details records.
--   4. Two daily jobs, by name. cron.schedule() with an existing job name REPLACES that job, and this file also
--      unschedules each name first, so running the file twice leaves one job of each name:
--        ret1-purge-rate-limits     '15 7 * * *'   07:15 UTC = 03:15 Eastern (EDT, UTC-4), 02:15 Eastern from 1 Nov (EST)
--        ret1-purge-free-calc-holds '25 7 * * *'   07:25 UTC = 03:25 Eastern (EDT), 02:25 Eastern from 1 Nov (EST)
--      The quietest hours for North American and European traffic overlap here.
--
-- WHAT IT CANNOT TOUCH: each function names one table and one condition; no other table is read or written; a row
-- inside its period (rate_limits newer than 30 days, a hold whose expires_at is still ahead) does not match.
--
-- RUN ORDER: BEFORE the Privacy Policy v2.4 change (docs/review/patches/ret1.patch) goes live, because that page
-- promises deletion that only these jobs perform. Then RET1-M10-verify.sql.
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.
-- PARSED OFFLINE with pglast on 6 Oct 2026 (see the RET1 report). Re-parse after any edit.
-- ROLLBACK: select cron.unschedule('ret1-purge-rate-limits'); select cron.unschedule('ret1-purge-free-calc-holds');
-- then drop the two functions. The index can stay.

begin;

create extension if not exists pg_cron with schema pg_catalog;

do $pre$
begin
  if to_regclass('public.rate_limits') is null or to_regclass('public.free_calc_pending') is null then
    raise exception 'Pre-flight: public.rate_limits or public.free_calc_pending is missing. Nothing was changed.';
  end if;
  if to_regclass('cron.job') is null then
    raise exception 'Pre-flight: pg_cron is not available (cron.job missing). Enable it in the dashboard and run again. Nothing was changed.';
  end if;
end
$pre$;

create index if not exists rate_limits_created_at_idx on public.rate_limits (created_at);

create or replace function public.ret1_purge_rate_limits()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.rate_limits
     where id in (select id from public.rate_limits
                   where created_at < now() - interval '30 days'
                   order by created_at
                   limit 5000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 5000;
  end loop;
  return v_total;
end;
$fn$;

comment on function public.ret1_purge_rate_limits() is
  'RET1 (Oct 2026): deletes rate_limits rows older than 30 days, in batches of 5,000. Run daily by pg_cron job ret1-purge-rate-limits. Touches no other table.';

create or replace function public.ret1_purge_free_calc_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_total integer := 0;
  v_n     integer;
begin
  loop
    delete from public.free_calc_pending
     where id in (select id from public.free_calc_pending
                   where expires_at < now()
                   order by expires_at
                   limit 5000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 5000;
  end loop;
  return v_total;
end;
$fn$;

comment on function public.ret1_purge_free_calc_holds() is
  'RET1 (Oct 2026): deletes free_calc_pending holds whose expires_at has passed, in batches of 5,000. Run daily by pg_cron job ret1-purge-free-calc-holds. Touches no other table.';

revoke all on function public.ret1_purge_rate_limits() from public, anon, authenticated, service_role;
revoke all on function public.ret1_purge_free_calc_holds() from public, anon, authenticated, service_role;

-- The jobs. Unscheduled first by name (if present), then scheduled: one job of each name, however often this runs.
do $jobs$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('ret1-purge-rate-limits', 'ret1-purge-free-calc-holds');
  perform cron.schedule('ret1-purge-rate-limits', '15 7 * * *', 'select public.ret1_purge_rate_limits()');
  perform cron.schedule('ret1-purge-free-calc-holds', '25 7 * * *', 'select public.ret1_purge_free_calc_holds()');
end
$jobs$;

do $post$
begin
  if (select count(*) from cron.job where jobname = 'ret1-purge-rate-limits'
        and schedule = '15 7 * * *' and command = 'select public.ret1_purge_rate_limits()' and active) <> 1 then
    raise exception 'Post-flight: job ret1-purge-rate-limits is not in place exactly once. Nothing committed.';
  end if;
  if (select count(*) from cron.job where jobname = 'ret1-purge-free-calc-holds'
        and schedule = '25 7 * * *' and command = 'select public.ret1_purge_free_calc_holds()' and active) <> 1 then
    raise exception 'Post-flight: job ret1-purge-free-calc-holds is not in place exactly once. Nothing committed.';
  end if;
  if has_function_privilege('anon', 'public.ret1_purge_rate_limits()', 'execute')
     or has_function_privilege('authenticated', 'public.ret1_purge_rate_limits()', 'execute')
     or has_function_privilege('anon', 'public.ret1_purge_free_calc_holds()', 'execute')
     or has_function_privilege('authenticated', 'public.ret1_purge_free_calc_holds()', 'execute') then
    raise exception 'Post-flight: a browser role can execute a purge function. Nothing committed.';
  end if;
  raise notice 'M10 applied: two daily retention jobs. Next: RET1-M10-verify.sql.';
end
$post$;

commit;
