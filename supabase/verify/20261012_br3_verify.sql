-- supabase/verify/20261012_br3_verify.sql
-- BR3 (staff roles and the staff access log): run AFTER 20261012_staff_roles_and_access_log.sql. Every row should read
-- pass = true.
--
-- TWO STATEMENTS. The first creates two TEMPORARY functions (pg_temp: they exist for this session only and are gone
-- when it ends); the second is the check query. The functions prove the refusals fire: each inserts a row inside a
-- block, tries what must be refused, then raises to roll the whole block back, so nothing it did is kept, the audit
-- rows log_audit() would write included. They need one existing auth user; with none they report n/a.
-- Each check names its table, function or trigger directly. No count of columns or rows is the proof.
-- No check reads public.staff_access_log itself: the refusal function truncates it inside a rolled-back block, and
-- Postgres refuses a TRUNCATE of a table the same query is reading.

create or replace function pg_temp.br3_log_refusals() returns text language plpgsql as $$
declare
  v_user uuid;
  v_upd text := 'not refused'; v_del text := 'not refused'; v_trunc text := 'not refused';
begin
  select id into v_user from auth.users order by created_at limit 1;
  if v_user is null then return 'n/a'; end if;
  begin
    insert into public.staff_access_log (staff_user_id, role, action) values (v_user, 'bill_reader', 'view_queue');
    begin
      update public.staff_access_log set action = 'view_document' where staff_user_id = v_user;
    exception when insufficient_privilege then v_upd := 'refused'; end;
    begin
      delete from public.staff_access_log where staff_user_id = v_user;
    exception when insufficient_privilege then v_del := 'refused'; end;
    begin
      truncate public.staff_access_log;
    exception when insufficient_privilege then v_trunc := 'refused'; end;
    raise exception 'br3 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'update ' || v_upd || ', delete ' || v_del || ', truncate ' || v_trunc;
end $$;

create or replace function pg_temp.br3_role_refusals() returns text language plpgsql as $$
declare
  v_user uuid; v_id uuid;
  v_del text := 'not refused'; v_change text := 'not refused'; v_revoke text := 'refused';
  v_unrevoke text := 'not refused'; v_regrant text := 'refused';
begin
  -- A user with no active bill_reader row, so the partial unique index does not refuse the test grant.
  select u.id into v_user from auth.users u
   where not exists (select 1 from public.staff_roles s where s.user_id = u.id and s.role = 'bill_reader' and s.revoked_at is null)
   order by u.created_at limit 1;
  if v_user is null then return 'n/a'; end if;
  begin
    insert into public.staff_roles (user_id, role, granted_by) values (v_user, 'bill_reader', v_user) returning id into v_id;
    begin
      delete from public.staff_roles where id = v_id;
    exception when insufficient_privilege then v_del := 'refused'; end;
    begin
      update public.staff_roles set role = 'bill_review_lead' where id = v_id;
    exception when insufficient_privilege then v_change := 'refused'; end;
    begin
      update public.staff_roles set revoked_by = v_user where id = v_id;
      v_revoke := 'allowed';
    exception when insufficient_privilege then v_revoke := 'refused'; end;
    begin
      update public.staff_roles set revoked_by = null, revoked_at = null where id = v_id;
    exception when insufficient_privilege then v_unrevoke := 'refused'; end;
    begin
      insert into public.staff_roles (user_id, role, granted_by) values (v_user, 'bill_reader', v_user);
      v_regrant := 'allowed';
    exception when others then v_regrant := 'refused'; end;
    raise exception 'br3 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'delete ' || v_del || ', change ' || v_change || ', revoke ' || v_revoke || ', unrevoke ' || v_unrevoke || ', regrant ' || v_regrant;
end $$;

with
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')),
tbl(t) as (values ('public.staff_roles'), ('public.staff_access_log')),
trg as (
  select t.tgname, c.relname, t.tgenabled::text as enabled, t.tgtype::int as tgtype, p.proname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal and c.relname in ('staff_roles', 'staff_access_log')
),
checks(check_name, expected, actual) as (
  select 'br3_01 staff_roles exists, row level security on',
         'true', (select coalesce(bool_and(c.relrowsecurity), false)::text from pg_class c where c.oid = to_regclass('public.staff_roles'))
  union all
  select 'br3_02 staff_access_log exists, row level security on',
         'true', (select coalesce(bool_and(c.relrowsecurity), false)::text from pg_class c where c.oid = to_regclass('public.staff_access_log'))
  union all
  select 'br3_03 no policy on either table (service_role only)',
         'none', (select coalesce(string_agg(tablename || ':' || policyname, ','), 'none') from pg_policies
                  where schemaname = 'public' and tablename in ('staff_roles', 'staff_access_log'))
  union all
  select 'br3_04 anon and authenticated hold no privilege on either table',
         'none', (select coalesce(string_agg(r.r || ':' || tbl.t || ':' || priv.p, ','), 'none')
                  from (values ('anon'), ('authenticated')) r(r) cross join tbl cross join priv
                  where has_table_privilege(r.r, tbl.t, priv.p))
  union all
  select 'br3_05 service_role holds exactly SELECT on staff_roles and SELECT, INSERT on staff_access_log',
         'public.staff_access_log:INSERT,public.staff_access_log:SELECT,public.staff_roles:SELECT',
         (select string_agg(tbl.t || ':' || priv.p, ',' order by tbl.t, priv.p) from tbl cross join priv
           where has_table_privilege('service_role', tbl.t, priv.p))
  union all
  select 'br3_06 staff_roles_one_active is a unique index on (user_id, role) where revoked_at is null',
         'true', (select (indisunique and pg_get_indexdef(indexrelid) like '%(user_id, role) WHERE (revoked_at IS NULL)%')::text
                  from pg_index where indexrelid = to_regclass('public.staff_roles_one_active'))
  union all
  select 'br3_07 staff_roles_guard() and staff_access_log_append_only(): definer, search_path empty, no execute for anon or authenticated',
         'true', (select coalesce(bool_and(p.prosecdef and p.proconfig = array['search_path=""']
                    and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')), false)::text
                  from pg_proc p where p.oid in (to_regprocedure('public.staff_roles_guard()'), to_regprocedure('public.staff_access_log_append_only()'))
                  having count(*) = 2)
  union all
  select 'br3_08 the triggers, by name, on their tables, enabled',
         'audit_staff_roles:staff_roles:log_audit,trg_staff_access_log_append_only:staff_access_log:staff_access_log_append_only,'
         || 'trg_staff_access_log_no_truncate:staff_access_log:staff_access_log_append_only,trg_staff_roles_guard:staff_roles:staff_roles_guard',
         (select string_agg(tgname || ':' || relname || ':' || proname, ',' order by tgname) from trg where enabled = 'O')
  union all
  select 'br3_09 trg_staff_access_log_no_truncate fires before truncate, per statement',
         'true', (select ((tgtype & 32) = 32 and (tgtype & 2) = 2 and (tgtype & 1) = 0)::text from trg where tgname = 'trg_staff_access_log_no_truncate')
  union all
  select 'br3_10 the log refuses update, delete and truncate (in a rolled-back block)',
         coalesce((select 'update refused, delete refused, truncate refused' where exists (select 1 from auth.users)), 'n/a'),
         pg_temp.br3_log_refusals()
  union all
  select 'br3_11 a staff role refuses delete and change, allows one revocation, refuses un-revoking, allows a new grant (rolled back)',
         coalesce((select 'delete refused, change refused, revoke allowed, unrevoke refused, regrant allowed' where exists (select 1 from auth.users)), 'n/a'),
         pg_temp.br3_role_refusals()

)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
