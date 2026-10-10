-- supabase/verify/20261015_br6_verify.sql
-- BR6 (the reading is staff-only): run AFTER 20261015_bill_review_reading_staff_only.sql. Every column should read as
-- the comment at the end says.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the
-- check. The function copies ghg_inventories' columns into a temporary table (no rows, no other triggers), attaches the
-- stamp trigger to it, and acts as a customer (an auth user with no active bill_review_lead role) and then as a lead,
-- by setting request.jwt.claims for the transaction, the value auth.uid() reads. It then raises to roll everything
-- back. No real inventory is read or written. With no auth user it reports n/a; with no active lead, the lead step
-- reports n/a.

create or replace function pg_temp.br6_rule() returns text language plpgsql as $v$
declare v_lead uuid; v_customer uuid; v_ai text := 'refused'; v_human text := 'allowed'; v_upd text := 'allowed';
  v_lead_upd text := 'refused'; v_by uuid;
begin
  select user_id into v_lead from public.staff_roles where role = 'bill_review_lead' and revoked_at is null limit 1;
  select u.id into v_customer from auth.users u where not exists (select 1 from public.staff_roles s
    where s.user_id = u.id and s.role = 'bill_review_lead' and s.revoked_at is null) order by u.created_at limit 1;
  if v_customer is null then return 'n/a'; end if;
  begin
    create temp table br6_t on commit drop as select * from public.ghg_inventories limit 0;
    create trigger br6_t_stamp before insert or update on br6_t for each row execute function public.ghg_bill_review_reading_stamp();
    perform set_config('request.jwt.claims', json_build_object('sub', v_customer, 'role', 'authenticated')::text, true);
    begin insert into br6_t (id, bill_review_reading) values (gen_random_uuid(), 'ai'); v_ai := 'allowed';
    exception when insufficient_privilege then v_ai := 'refused'; end;
    begin insert into br6_t (id, bill_review_reading) values (gen_random_uuid(), 'human');
    exception when insufficient_privilege then v_human := 'refused'; end;
    begin update br6_t set bill_review_reading = 'human';
    exception when insufficient_privilege then v_upd := 'refused'; end;
    if v_lead is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
      begin update br6_t set bill_review_reading = 'human' returning bill_review_reading_set_by into v_by;
        if v_by = v_lead then v_lead_upd := 'allowed'; end if;
      exception when insufficient_privilege then v_lead_upd := 'refused'; end;
    else v_lead_upd := 'n/a'; end if;
    raise exception 'br6 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'customer insert ai ' || v_ai || ', customer insert human ' || v_human || ', customer update ' || v_upd
      || ', lead update ' || v_lead_upd;
end $v$;
select (select prosrc like '%role = ''bill_review_lead''%' from pg_proc
         where oid = to_regprocedure('public.ghg_bill_review_reading_stamp()')) as staff_rule,
       (select count(*) from pg_trigger where tgname = 'trg_ghg_bill_review_reading_stamp' and not tgisinternal) as stamp_trigger,
       pg_temp.br6_rule() as rule;
-- expect: staff_rule true; stamp_trigger 1;
--         rule 'customer insert ai allowed, customer insert human refused, customer update refused, lead update allowed'.
