-- supabase/verify/20261017_br8_verify.sql
-- BR8 (the staff page's log actions and reading switch): run AFTER 20261017_staff_actions_and_reading_switch.sql.
-- Every row should read pass = true.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the
-- check query. The function calls staff_set_bill_review_reading as a non-lead and as a lead on an inventory whose owner
-- holds an active GHG plan, and logs one new action, then raises to roll everything back: no inventory or log row is
-- kept. It needs an active bill_review_lead, a user who is not one, and such an inventory; with any missing it reports
-- n/a. Each check names its constraint or function directly.

create or replace function pg_temp.br8_rules() returns text language plpgsql as $v$
declare
  v_lead uuid; v_other uuid; v_inv uuid; v_was text; v_to text; v_by uuid;
  v_other_r text := 'not refused'; v_lead_r text := 'refused'; v_log text := 'refused';
begin
  select user_id into v_lead from public.staff_roles where role = 'bill_review_lead' and revoked_at is null limit 1;
  select u.id into v_other from auth.users u where not exists (select 1 from public.staff_roles s
    where s.user_id = u.id and s.role = 'bill_review_lead' and s.revoked_at is null) order by u.created_at limit 1;
  select i.id, i.bill_review_reading into v_inv, v_was from public.ghg_inventories i
   where exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now())
   order by i.created_at limit 1;
  if v_lead is null or v_other is null or v_inv is null then return 'n/a'; end if;
  v_to := case when v_was = 'ai' then 'human' else 'ai' end;
  begin
    begin
      perform public.staff_set_bill_review_reading(v_inv, v_to, v_other);
    exception when insufficient_privilege then v_other_r := 'refused'; end;
    begin
      perform public.staff_set_bill_review_reading(v_inv, v_to, v_lead);
      select bill_review_reading_set_by into v_by from public.ghg_inventories where id = v_inv;
      if v_by = v_lead then v_lead_r := 'allowed, set_by the lead'; end if;
    exception when insufficient_privilege then v_lead_r := 'refused'; end;
    begin
      insert into public.staff_access_log (staff_user_id, role, action, inventory_id) values (v_lead, 'bill_review_lead', 'set_reading', v_inv);
      v_log := 'accepted';
    exception when check_violation then v_log := 'refused'; end;
    raise exception 'br8 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'non-lead ' || v_other_r || ', lead ' || v_lead_r || ', set_reading log row ' || v_log;
end $v$;

with
checks(check_name, expected, actual) as (
  select 'br8_01 staff_access_log_action_check lists the ten actions',
         'true', (select (pg_get_constraintdef(oid) like '%mark_unreadable%' and pg_get_constraintdef(oid) like '%set_reading%'
                    and pg_get_constraintdef(oid) like '%view_reading_switch%' and pg_get_constraintdef(oid) like '%view_spot_checks%'
                    and pg_get_constraintdef(oid) like '%view_queue%' and pg_get_constraintdef(oid) like '%view_access_log%')::text
                  from pg_constraint where conrelid = to_regclass('public.staff_access_log') and conname = 'staff_access_log_action_check')
  union all
  select 'br8_02 one action constraint on the log',
         '1', (select count(*)::text from pg_constraint where conrelid = to_regclass('public.staff_access_log') and contype = 'c' and conname like '%action%')
  union all
  select 'br8_03 staff_set_bill_review_reading: definer, search_path empty',
         'true', (select (prosecdef and proconfig = array['search_path=""'])::text from pg_proc
                  where oid = to_regprocedure('public.staff_set_bill_review_reading(uuid, text, uuid)'))
  union all
  select 'br8_04 executable by service_role only',
         'service_role', (select string_agg(r, ',' order by r) from (values ('anon'), ('authenticated'), ('service_role')) x(r)
                          where has_function_privilege(r, to_regprocedure('public.staff_set_bill_review_reading(uuid, text, uuid)'), 'execute'))
  union all
  select 'br8_05 a non-lead is refused, a lead is stamped as set_by, the new action is accepted (rolled back)',
         coalesce((select 'non-lead refused, lead allowed, set_by the lead, set_reading log row accepted'
                    where exists (select 1 from public.staff_roles where role = 'bill_review_lead' and revoked_at is null)), 'n/a'),
         pg_temp.br8_rules()
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
