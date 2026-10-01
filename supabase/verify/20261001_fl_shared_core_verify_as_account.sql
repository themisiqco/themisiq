-- supabase/verify/20261001_fl_shared_core_verify_as_account.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- Check 12 of 20261001_fl_shared_core_verify.sql: as the account in s211_access (yours; the earliest row if
-- there are ever several), the new checks agree with the S-211 ones. ONE read-only statement.
--
-- HOW IT ACTS AS YOUR ACCOUNT WITHOUT begin/rollback. The SQL editor shows only the last result, and a
-- begin ... rollback script ends on the rollback, which returns nothing. So the first CTE sets the JWT
-- claims with set_config(..., true): local to the transaction, which here is this one statement, so they
-- are gone when it ends. It is MATERIALIZED and every later expression reads its column, so it runs first.
-- Both claim settings are set, because auth.uid() reads request.jwt.claim.sub before request.jwt.claims.
--
-- WHAT IT CANNOT DO: switch to the authenticated role, so it does not count rows through RLS (RLS is fixed
-- when a statement is planned, under the role that plans it). Row 08 instead applies the s211_reports
-- SELECT policy's own expression by hand. That the policy itself is unchanged is check 03 of the summary.
--
-- Every row should read pass = true.

with
who as materialized (
  select a.user_id,
         set_config('request.jwt.claims', json_build_object('sub', a.user_id, 'role', 'authenticated')::text, true) as claims,
         set_config('request.jwt.claim.sub', a.user_id::text, true) as sub
  from (select user_id from public.s211_access order by granted_at, user_id limit 1) a
),
r as (
  select who.user_id,
         (who.claims is not null and who.sub is not null) as ready,
         case when who.sub is not null then auth.uid() end as uid,
         case when who.sub is not null then public.s211_can_read() end as s211_read,
         case when who.sub is not null then public.s211_can_write() end as s211_write,
         case when who.sub is not null then public.fl_can_read('canada') end as fl_read_canada,
         case when who.sub is not null then public.fl_can_write('canada') end as fl_write_canada,
         case when who.sub is not null then public.fl_can_read('uk') end as fl_read_uk,
         case when who.sub is not null then public.fl_can_write('australia') end as fl_write_australia,
         case when who.sub is not null then public.fl_can_read(null) end as fl_read_module,
         case when who.sub is not null then public.fl_can_read('narnia') end as fl_read_unknown
  from who
),
checks as (
  select '01 acting as the s211_access account' as check_name, 'true' as expected,
         ((select uid from r) is not distinct from (select user_id from r) and (select ready from r))::text as actual
  union all select '02 s211_can_read()', 'true', (select s211_read from r)::text
  union all select '03 s211_can_write()', 'true', (select s211_write from r)::text
  union all select '04 fl_can_read/write(canada) equal s211_can_read/write()', 'true',
         ((select fl_read_canada = s211_read and fl_write_canada = s211_write from r))::text
  union all select '05 fl_can_read(uk), fl_can_write(australia): one entitlement covers every country', 'true, true',
         (select fl_read_uk::text || ', ' || fl_write_australia::text from r)
  union all select '06 fl_can_read(NULL): the module as a whole', 'true', (select fl_read_module from r)::text
  union all select '07 fl_can_read(narnia): an unknown country is refused', 'false', (select fl_read_unknown from r)::text
  union all select '08 reports the s211_reports SELECT policy admits = reports the account owns',
         (select count(*) from public.s211_reports x where x.user_id = (select user_id from r))::text,
         (select count(*) from public.s211_reports x, r
          where r.s211_read and r.uid = x.user_id)::text
)
select check_name, expected, coalesce(actual, '(null)') as actual, coalesce(actual = expected, false) as pass
from checks
order by check_name collate "C";
