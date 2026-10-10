-- supabase/verify/20261019_staff_notices_verify.sql
-- Staff notifications (the outbox's two staff kinds): run AFTER 20261019_bill_review_staff_notices.sql. Every row
-- should read pass = true.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the check
-- query. The function acts as a bill_review_lead (request.jwt.claims) to set an inventory to human reading with two
-- bills on it, submits both, and enqueues the staff emails, then raises to roll everything back: nothing is kept. It
-- needs an active bill_review_lead, an active bill_reader, and an inventory whose owner holds an active GHG plan; with
-- any missing it reports n/a. Each check names its constraint, column, index or function directly.

create or replace function pg_temp.staff_notice_rules() returns text language plpgsql as $v$
declare
  v_lead uuid; v_readers integer; v_inv uuid; v_owner uuid; v_a uuid; v_b uuid;
  v_first integer; v_second integer; v_repeat integer; v_d1 integer; v_d1_again integer; v_d2 integer; v_none integer;
begin
  select user_id into v_lead from public.staff_roles where role = 'bill_review_lead' and revoked_at is null limit 1;
  select count(distinct user_id) into v_readers from public.staff_roles where role = 'bill_reader' and revoked_at is null;
  select i.id, i.user_id into v_inv, v_owner from public.ghg_inventories i
   where exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now())
   order by i.created_at limit 1;
  if v_lead is null or v_readers = 0 or v_inv is null then return 'n/a'; end if;
  begin
    -- Nothing waiting anywhere, for the "none" check (rows rolled back with the rest).
    update public.bill_review_documents set status = 'read', read_by = v_lead where status = 'waiting';
    v_none := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_digest(current_date + 100), 1), 0);
    perform set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
    update public.ghg_inventories set bill_review_reading = 'human',
      locations_data = '[{"id": "sn-loc", "name": "Verify", "source_docs": [{"id": "sn-a"}, {"id": "sn-b"}]}]'::jsonb
     where id = v_inv;
    insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
    values (v_owner, v_inv, 'sn-a', 'sn-verify/a.pdf', 'a.pdf', 'utility_electricity', current_date + 2) returning id into v_a;
    v_first := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_new_batch(v_a), 1), 0);
    v_repeat := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_new_batch(v_a), 1), 0);
    insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
    values (v_owner, v_inv, 'sn-b', 'sn-verify/b.pdf', 'b.pdf', 'utility_electricity', current_date + 2) returning id into v_b;
    v_second := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_new_batch(v_b), 1), 0);
    v_d1 := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_digest(current_date + 100), 1), 0);
    v_d1_again := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_digest(current_date + 100), 1), 0);
    v_d2 := coalesce(pg_catalog.array_length(public.bill_review_enqueue_staff_digest(current_date + 101), 1), 0);
    raise exception 'staff notices verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'digest with nothing waiting ' || v_none
      || ', first bill ' || (case when v_first = v_readers then 'one per reader' else v_first::text end)
      || ', same bill again ' || v_repeat || ', second bill ' || v_second
      || ', digest ' || (case when v_d1 = v_readers then 'one per reader' else v_d1::text end)
      || ', same day again ' || v_d1_again
      || ', next day ' || (case when v_d2 = v_readers then 'one per reader' else v_d2::text end);
end $v$;

with
fn(f) as (values ('public.bill_review_enqueue_staff_new_batch(uuid)'), ('public.bill_review_enqueue_staff_digest(date)')),
checks(check_name, expected, actual) as (
  select 'sn_01 bill_review_notices_kind_check lists the four kinds',
         'true', (select (pg_get_constraintdef(oid) like '%staff_new_batch%' and pg_get_constraintdef(oid) like '%staff_digest%'
                    and pg_get_constraintdef(oid) like '%ready%' and pg_get_constraintdef(oid) like '%overdue%')::text
                  from pg_constraint where conrelid = to_regclass('public.bill_review_notices') and conname = 'bill_review_notices_kind_check')
  union all
  select 'sn_02 bill_review_notices_inventory_named: only the digest has no inventory',
         '1', (select count(*)::text from pg_constraint where conrelid = to_regclass('public.bill_review_notices') and conname = 'bill_review_notices_inventory_named')
  union all
  select 'sn_03 bill_review_notices.dedupe_key exists, with its unique index',
         'true', (select (exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bill_review_notices' and column_name = 'dedupe_key')
                    and exists (select 1 from pg_index where indexrelid = to_regclass('public.bill_review_notices_dedupe') and indisunique))::text)
  union all
  select 'sn_04 the two enqueue functions: definer, search_path empty, service_role only',
         'true', (select coalesce(bool_and(p.prosecdef and p.proconfig = array['search_path=""']
                    and has_function_privilege('service_role', p.oid, 'execute')
                    and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')), false)::text
                  from fn join pg_proc p on p.oid = to_regprocedure(fn.f) having count(*) = 2)
  union all
  select 'sn_05 the guard keeps dedupe_key fixed',
         'true', (select (prosrc like '%new.dedupe_key is distinct from old.dedupe_key%')::text from pg_proc where oid = to_regprocedure('public.bill_review_notices_guard()'))
  union all
  select 'sn_06 once per batch, never per bill; once per day; nothing when nothing waits (rolled back)',
         coalesce((select 'digest with nothing waiting 0, first bill one per reader, same bill again 0, second bill 0, digest one per reader, same day again 0, next day one per reader'
                    where exists (select 1 from public.staff_roles where role = 'bill_review_lead' and revoked_at is null)
                      and exists (select 1 from public.staff_roles where role = 'bill_reader' and revoked_at is null)), 'n/a'),
         pg_temp.staff_notice_rules()
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
