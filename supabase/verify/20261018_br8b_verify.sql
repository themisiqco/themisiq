-- supabase/verify/20261018_br8b_verify.sql
-- BR8b (spot-checks): run AFTER 20261018_bill_review_spot_checks.sql. Every row should read pass = true.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the
-- check query. The function records a spot-check as an active bill_reader on an existing inventory, tries the same
-- check again, an update, and a check by someone who is not staff, then raises to roll everything back: no row is
-- kept. It needs an active bill_reader, a user who is not one, and an inventory; with any missing it reports n/a.
-- Each check names its table, index, policy, function or trigger directly.

create or replace function pg_temp.br8b_rules() returns text language plpgsql as $v$
declare
  v_reader uuid; v_other uuid; v_inv uuid; v_owner uuid; v_id uuid; v_got uuid;
  v_first text := 'refused'; v_owner_set text := 'not set'; v_again text := 'allowed'; v_upd text := 'allowed'; v_nonstaff text := 'allowed';
begin
  select user_id into v_reader from public.staff_roles where role = 'bill_reader' and revoked_at is null limit 1;
  select u.id into v_other from auth.users u where not exists (select 1 from public.staff_roles s
    where s.user_id = u.id and s.role = 'bill_reader' and s.revoked_at is null) order by u.created_at limit 1;
  select id, user_id into v_inv, v_owner from public.ghg_inventories order by created_at limit 1;
  if v_reader is null or v_other is null or v_inv is null then return 'n/a'; end if;
  begin
    insert into public.bill_review_spot_checks (inventory_id, user_id, source_doc_id, fuel_type, proposal_index, reading, result, note, checked_by)
    values (v_inv, v_other, 'br8b-doc', 'electricity', 0, '{}'::jsonb, 'disagrees', 'Verify', v_reader) returning id, user_id into v_id, v_got;
    v_first := 'allowed';
    if v_got = v_owner then v_owner_set := 'the owner'; end if;
    begin
      insert into public.bill_review_spot_checks (inventory_id, user_id, source_doc_id, fuel_type, proposal_index, reading, result, checked_by)
      values (v_inv, v_owner, 'br8b-doc', 'electricity', 0, '{}'::jsonb, 'agrees', v_reader);
    exception when unique_violation then v_again := 'refused'; end;
    begin
      update public.bill_review_spot_checks set note = 'changed' where id = v_id;
    exception when insufficient_privilege then v_upd := 'refused'; end;
    begin
      insert into public.bill_review_spot_checks (inventory_id, user_id, source_doc_id, fuel_type, proposal_index, reading, result, checked_by)
      values (v_inv, v_owner, 'br8b-doc', 'electricity', 1, '{}'::jsonb, 'agrees', v_other);
    exception when insufficient_privilege then v_nonstaff := 'refused'; end;
    raise exception 'br8b verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'check ' || v_first || ', customer ' || v_owner_set || ', same reading again ' || v_again || ', update ' || v_upd || ', non-staff ' || v_nonstaff;
end $v$;

with
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')),
cols as (select column_name from information_schema.columns where table_schema = 'public' and table_name = 'bill_review_spot_checks'),
checks(check_name, expected, actual) as (
  select 'br8b_01 bill_review_spot_checks exists, row level security on',
         'true', (select coalesce(bool_and(relrowsecurity), false)::text from pg_class where oid = to_regclass('public.bill_review_spot_checks'))
  union all
  select 'br8b_02 one policy: SELECT to authenticated, own rows, wrapped auth.uid()',
         'bill_review_spot_checks_select_own', (select string_agg(policyname, ',') from pg_policies where schemaname = 'public' and tablename = 'bill_review_spot_checks'
           and cmd = 'SELECT' and roles::text = '{authenticated}' and qual = '(user_id = ( SELECT auth.uid() AS uid))')
  union all
  select 'br8b_03 no other policy',
         '1', (select count(*)::text from pg_policies where schemaname = 'public' and tablename = 'bill_review_spot_checks')
  union all
  select 'br8b_04 anon holds no privilege',
         'none', (select coalesce(string_agg(p, ','), 'none') from priv where has_table_privilege('anon', 'public.bill_review_spot_checks', p))
  union all
  select 'br8b_05 authenticated: no table-level privilege; SELECT on every column but checked_by',
         'none', (select coalesce(string_agg(x, ','), 'none') from (
                    select 'table:' || p as x from priv where has_table_privilege('authenticated', 'public.bill_review_spot_checks', p) and p <> 'SELECT'
                    union all
                    select 'column:' || column_name from cols
                     where has_column_privilege('authenticated', 'public.bill_review_spot_checks', column_name, 'SELECT') <> (column_name <> 'checked_by')) y)
  union all
  select 'br8b_06 service_role: SELECT, INSERT only',
         'INSERT,SELECT', (select string_agg(p, ',' order by p) from priv where has_table_privilege('service_role', 'public.bill_review_spot_checks', p))
  union all
  select 'br8b_07 bill_review_spot_checks_once is unique on (inventory_id, source_doc_id, fuel_type, proposal_index)',
         'true', (select (indisunique and pg_get_indexdef(indexrelid) like '%(inventory_id, source_doc_id, fuel_type, proposal_index)%')::text
                  from pg_index where indexrelid = to_regclass('public.bill_review_spot_checks_once'))
  union all
  select 'br8b_08 the guard: definer, search_path empty, no execute for anon or authenticated; its trigger by name',
         'true', (select (p.prosecdef and p.proconfig = array['search_path=""'] and not has_function_privilege('anon', p.oid, 'execute')
                    and not has_function_privilege('authenticated', p.oid, 'execute')
                    and exists (select 1 from pg_trigger where tgname = 'trg_bill_review_spot_checks_guard' and not tgisinternal
                                 and tgrelid = to_regclass('public.bill_review_spot_checks') and tgenabled::text = 'O'))::text
                  from pg_proc p where p.oid = to_regprocedure('public.bill_review_spot_checks_guard()'))
  union all
  select 'br8b_09 the guard refuses as ruled (in a rolled-back block)',
         coalesce((select 'check allowed, customer the owner, same reading again refused, update refused, non-staff refused'
                    where exists (select 1 from public.staff_roles where role = 'bill_reader' and revoked_at is null)), 'n/a'),
         pg_temp.br8b_rules()
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
