-- supabase/verify/20261016_br7_verify.sql
-- BR7 (the Bill Review emails' outbox): run AFTER 20261016_bill_review_notices.sql. Every row should read pass = true.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the
-- check query. The function proves once-only and the attempt rule: inside one block it acts as a bill_review_lead
-- (request.jwt.claims, the value auth.uid() reads) to set an inventory to human reading with two bills on it, records
-- both as waiting and overdue, enqueues and sends, then raises to roll the whole block back, so nothing it did is kept.
-- It needs an active bill_review_lead and an inventory whose owner holds an active GHG plan; with either missing it
-- reports n/a. Each check names its table, index, function or trigger directly.

create or replace function pg_temp.br7_rules() returns text language plpgsql as $v$
declare
  v_lead uuid; v_inv uuid; v_owner uuid; v_a uuid; v_b uuid; v_r uuid; v_r2 uuid; v_n1 integer; v_n2 integer; v_cnt integer;
  v_waiting text; v_one text; v_both text; v_again text; v_sent text := 'refused'; v_resend text := 'not refused';
begin
  select user_id into v_lead from public.staff_roles where role = 'bill_review_lead' and revoked_at is null limit 1;
  select i.id, i.user_id into v_inv, v_owner from public.ghg_inventories i
   where exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now())
   order by i.created_at limit 1;
  if v_lead is null or v_inv is null then return 'n/a'; end if;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
    update public.ghg_inventories set bill_review_reading = 'human',
      locations_data = '[{"id": "br7-loc", "name": "Verify", "source_docs": [{"id": "br7-a"}, {"id": "br7-b"}]}]'::jsonb
     where id = v_inv;
    insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
    values (v_owner, v_inv, 'br7-a', 'br7-verify/a.pdf', 'a.pdf', 'utility_electricity', current_date - 3) returning id into v_a;
    insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
    values (v_owner, v_inv, 'br7-b', 'br7-verify/b.pdf', 'b.pdf', 'utility_electricity', current_date - 3) returning id into v_b;
    v_waiting := coalesce(public.bill_review_enqueue_ready(v_inv)::text, 'none');
    v_n1 := public.bill_review_enqueue_overdue(current_date);
    v_n2 := public.bill_review_enqueue_overdue(current_date);
    update public.bill_review_documents set status = 'read', read_by = v_lead where id = v_a;
    v_one := coalesce(public.bill_review_enqueue_ready(v_inv)::text, 'none');
    update public.bill_review_documents set status = 'unreadable', read_by = v_lead, unreadable_note = 'Torn' where id = v_b;
    v_r := public.bill_review_enqueue_ready(v_inv);
    select count(*) into v_cnt from public.bill_review_notice_documents where notice_id = v_r;
    v_both := case when v_r is null then 'none' else '1 email of ' || v_cnt || ' bills' end;
    v_r2 := public.bill_review_enqueue_ready(v_inv);
    v_again := coalesce(v_r2::text, 'none');
    begin
      update public.bill_review_notices set status = 'sent', attempts = 1 where id = v_r;
      v_sent := 'allowed';
    exception when insufficient_privilege then v_sent := 'refused'; end;
    begin
      update public.bill_review_notices set status = 'failed', attempts = 2, last_error = 'x' where id = v_r;
    exception when insufficient_privilege then v_resend := 'refused'; end;
    raise exception 'br7 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'ready while waiting ' || v_waiting || ', overdue ' || v_n1 || ' then ' || v_n2 || ', ready after one ' || v_one
      || ', ready after both ' || v_both || ', ready again ' || v_again || ', sent ' || v_sent || ', after sent ' || v_resend;
end $v$;

with
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')),
tbl(t) as (values ('public.bill_review_notices'), ('public.bill_review_notice_documents')),
fn(f) as (values ('public.bill_review_notices_guard()'), ('public.bill_review_enqueue_ready(uuid)'), ('public.bill_review_enqueue_overdue(date)')),
checks(check_name, expected, actual) as (
  select 'br7_01 bill_review_notices exists, row level security on',
         'true', (select coalesce(bool_and(relrowsecurity), false)::text from pg_class where oid = to_regclass('public.bill_review_notices'))
  union all
  select 'br7_02 bill_review_notice_documents exists, row level security on',
         'true', (select coalesce(bool_and(relrowsecurity), false)::text from pg_class where oid = to_regclass('public.bill_review_notice_documents'))
  union all
  select 'br7_03 no policy on either table (service_role only)',
         'none', (select coalesce(string_agg(tablename || ':' || policyname, ','), 'none') from pg_policies
                  where schemaname = 'public' and tablename in ('bill_review_notices', 'bill_review_notice_documents'))
  union all
  select 'br7_04 anon and authenticated hold no privilege on either table',
         'none', (select coalesce(string_agg(r.r || ':' || tbl.t || ':' || priv.p, ','), 'none')
                  from (values ('anon'), ('authenticated')) r(r) cross join tbl cross join priv where has_table_privilege(r.r, tbl.t, priv.p))
  union all
  select 'br7_05 service_role: SELECT, UPDATE on notices; SELECT on notice documents; nothing else',
         'public.bill_review_notice_documents:SELECT,public.bill_review_notices:SELECT,public.bill_review_notices:UPDATE',
         (select string_agg(tbl.t || ':' || priv.p, ',' order by tbl.t, priv.p) from tbl cross join priv where has_table_privilege('service_role', tbl.t, priv.p))
  union all
  select 'br7_06 one email of each kind per bill: the primary key is (document_id, kind)',
         'document_id,kind', (select string_agg(a.attname, ',' order by array_position(i.indkey::int2[], a.attnum)) from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
          where i.indrelid = to_regclass('public.bill_review_notice_documents') and i.indisprimary)
  union all
  select 'br7_07 the three functions: definer, search_path empty; anon and authenticated cannot execute them',
         'true', (select coalesce(bool_and(p.prosecdef and p.proconfig = array['search_path=""']
                    and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')), false)::text
                  from fn join pg_proc p on p.oid = to_regprocedure(fn.f) having count(*) = 3)
  union all
  select 'br7_08 service_role can execute both enqueue functions',
         'true', (select (has_function_privilege('service_role', to_regprocedure('public.bill_review_enqueue_ready(uuid)'), 'execute')
                    and has_function_privilege('service_role', to_regprocedure('public.bill_review_enqueue_overdue(date)'), 'execute'))::text)
  union all
  select 'br7_09 trg_bill_review_notices_guard, by name, on bill_review_notices, enabled',
         '1', (select count(*)::text from pg_trigger where tgname = 'trg_bill_review_notices_guard' and not tgisinternal
               and tgrelid = to_regclass('public.bill_review_notices') and tgenabled::text = 'O')
  union all
  select 'br7_10 once only, and the attempt rule (in a rolled-back block)',
         coalesce((select 'ready while waiting none, overdue 2 then 0, ready after one none, ready after both 1 email of 2 bills, ready again none, sent allowed, after sent refused'
                    where exists (select 1 from public.staff_roles where role = 'bill_review_lead' and revoked_at is null)
                      and exists (select 1 from public.ghg_inventories i where exists (select 1 from public.entitlements e
                        where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now()))), 'n/a'),
         pg_temp.br7_rules()
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
