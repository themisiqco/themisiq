-- supabase/verify/20261013_br4_verify.sql
-- BR4 (the human-reading queue's data): run AFTER 20261013_bill_review_queue.sql. Every row should read pass = true.
--
-- TWO STATEMENTS. The first creates a TEMPORARY function (pg_temp: gone when the session ends); the second is the
-- check query. The function proves the guards refuse: inside one block it switches an inventory to human reading,
-- records a bill and a reading, tries what must be refused and what must be allowed, then raises to roll the whole
-- block back, so nothing it did is kept (the audit rows the inventory's trigger writes included). It needs an
-- inventory whose owner holds an active GHG plan (the entitlement trigger refuses the switch otherwise) and one
-- auth user to stand as the specialist; with none it reports n/a.
-- Each check names its table, index, policy, function or trigger directly. No count of columns or rows is the proof.

create or replace function pg_temp.br4_refusals() returns text language plpgsql as $$
declare
  v_inv uuid; v_owner uuid; v_reader uuid; v_doc uuid; v_r1 uuid;
  v_ai text := 'not refused'; v_upd text := 'not refused'; v_bad text := 'not refused'; v_read text := 'refused';
  v_again text := 'not refused'; v_cascade text := 'refused';
begin
  select i.id, i.user_id into v_inv, v_owner from public.ghg_inventories i
   where i.bill_review_reading = 'ai'
     and exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now())
   order by i.created_at limit 1;
  select id into v_reader from auth.users order by created_at limit 1;
  if v_inv is null or v_reader is null then return 'n/a'; end if;
  begin
    -- An AI-read inventory's bill is refused.
    begin
      insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
      values (v_owner, v_inv, 'br4-verify', 'br4-verify/path.pdf', 'path.pdf', 'utility_bill_electric', current_date);
    exception when insufficient_privilege then v_ai := 'refused'; end;
    update public.ghg_inventories set bill_review_reading = 'human' where id = v_inv;
    insert into public.bill_review_documents (user_id, inventory_id, source_doc_id, file_path, file_name, document_type, expected_by)
    values (v_owner, v_inv, 'br4-verify', 'br4-verify/path.pdf', 'path.pdf', 'utility_bill_electric', current_date)
    returning id into v_doc;
    insert into public.bill_review_readings (bill_review_document_id, user_id, inventory_id, fuel_type, raw_value, raw_unit, read_by)
    values (v_doc, v_owner, v_inv, 'electricity', 100, 'kWh', v_reader) returning id into v_r1;
    begin
      update public.bill_review_readings set raw_value = 200 where id = v_r1;
    exception when insufficient_privilege then v_upd := 'refused'; end;
    begin
      update public.bill_review_documents set file_name = 'other.pdf' where id = v_doc;
    exception when insufficient_privilege then v_bad := 'refused'; end;
    begin
      update public.bill_review_documents set status = 'read', read_by = v_reader where id = v_doc;
      v_read := 'allowed';
    exception when insufficient_privilege then v_read := 'refused'; end;
    begin
      update public.bill_review_documents set status = 'unreadable', read_by = v_reader, unreadable_note = 'x' where id = v_doc;
    exception when insufficient_privilege then v_again := 'refused'; end;
    begin
      delete from public.bill_review_documents where id = v_doc;
      if not exists (select 1 from public.bill_review_readings where id = v_r1) then v_cascade := 'allowed'; end if;
    exception when others then v_cascade := 'refused'; end;
    raise exception 'br4 verify: roll back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  return 'ai inventory ' || v_ai || ', reading update ' || v_upd || ', record change ' || v_bad || ', read ' || v_read
      || ', second move ' || v_again || ', cascade ' || v_cascade;
end $$;

with
priv(p) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')),
tbl(t) as (values ('public.bill_review_documents'), ('public.bill_review_readings')),
pol as (
  select tablename, policyname, cmd, roles::text as roles, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check
  from pg_policies where schemaname = 'public' and tablename in ('bill_review_documents', 'bill_review_readings')
),
cols as (
  select c.table_name, c.column_name from information_schema.columns c
  where c.table_schema = 'public' and c.table_name in ('bill_review_documents', 'bill_review_readings')
),
trg as (
  select t.tgname, c.relname, t.tgenabled::text as enabled, p.proname
  from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  where n.nspname = 'public' and not t.tgisinternal and c.relname in ('bill_review_documents', 'bill_review_readings')
),
checks(check_name, expected, actual) as (
  select 'br4_01 bill_review_documents exists, row level security on',
         'true', (select coalesce(bool_and(relrowsecurity), false)::text from pg_class where oid = to_regclass('public.bill_review_documents'))
  union all
  select 'br4_02 bill_review_readings exists, row level security on',
         'true', (select coalesce(bool_and(relrowsecurity), false)::text from pg_class where oid = to_regclass('public.bill_review_readings'))
  union all
  select 'br4_03 one SELECT policy per table, to authenticated, own rows, wrapped auth.uid(); no other policy',
         'bill_review_documents:bill_review_documents_select_own,bill_review_readings:bill_review_readings_select_own',
         (select string_agg(tablename || ':' || policyname, ',' order by tablename) from pol
           where cmd = 'SELECT' and roles = '{authenticated}' and qual = '(user_id = ( SELECT auth.uid() AS uid))' and with_check = '')
  union all
  select 'br4_04 no policy other than the two',
         '2', (select count(*)::text from pol)
  union all
  select 'br4_05 anon holds no privilege on either table',
         'none', (select coalesce(string_agg(tbl.t || ':' || priv.p, ','), 'none') from tbl cross join priv where has_table_privilege('anon', tbl.t, priv.p))
  union all
  select 'br4_06 authenticated holds no table-level privilege on either table (its SELECT is column-scoped)',
         'none', (select coalesce(string_agg(tbl.t || ':' || priv.p, ','), 'none') from tbl cross join priv
                  where priv.p <> 'SELECT' and has_table_privilege('authenticated', tbl.t, priv.p))
  union all
  select 'br4_07 authenticated can SELECT every column except read_by, on both tables',
         'none', (select coalesce(string_agg(table_name || '.' || column_name, ','), 'none') from cols
                  where has_column_privilege('authenticated', 'public.' || table_name, column_name, 'SELECT') <> (column_name <> 'read_by'))
  union all
  select 'br4_08 service_role: SELECT, INSERT, UPDATE on documents; SELECT, INSERT on readings; nothing else',
         'public.bill_review_documents:INSERT,public.bill_review_documents:SELECT,public.bill_review_documents:UPDATE,public.bill_review_readings:INSERT,public.bill_review_readings:SELECT',
         (select string_agg(tbl.t || ':' || priv.p, ',' order by tbl.t, priv.p) from tbl cross join priv where has_table_privilege('service_role', tbl.t, priv.p))
  union all
  select 'br4_09 the unique indexes, by name',
         'bill_review_documents_file_path,bill_review_documents_inventory_doc,bill_review_readings_supersedes',
         (select string_agg(c.relname, ',' order by c.relname) from pg_index i join pg_class c on c.oid = i.indexrelid
           where i.indisunique and not i.indisprimary
             and c.oid in (to_regclass('public.bill_review_documents_file_path'), to_regclass('public.bill_review_documents_inventory_doc'),
                           to_regclass('public.bill_review_readings_supersedes')))
  union all
  select 'br4_10 the inventory cascades to documents, documents to readings',
         'bill_review_documents:c,bill_review_readings:c',
         (select string_agg(conrelid::regclass::text || ':' || confdeltype::text, ',' order by conrelid::regclass::text)
            from pg_constraint where contype = 'f'
             and ((conrelid = to_regclass('public.bill_review_documents') and confrelid = to_regclass('public.ghg_inventories'))
               or (conrelid = to_regclass('public.bill_review_readings') and confrelid = to_regclass('public.bill_review_documents'))))
  union all
  select 'br4_11 both guard functions: definer, search_path empty, no execute for anon or authenticated',
         'true', (select coalesce(bool_and(p.prosecdef and p.proconfig = array['search_path=""']
                    and not has_function_privilege('anon', p.oid, 'execute') and not has_function_privilege('authenticated', p.oid, 'execute')), false)::text
                  from pg_proc p where p.oid in (to_regprocedure('public.bill_review_documents_guard()'), to_regprocedure('public.bill_review_readings_guard()'))
                  having count(*) = 2)
  union all
  select 'br4_12 the guard triggers, by name, on their tables, enabled; no delete trigger on readings',
         'trg_bill_review_documents_guard:bill_review_documents:bill_review_documents_guard,trg_bill_review_readings_guard:bill_review_readings:bill_review_readings_guard',
         (select string_agg(tgname || ':' || relname || ':' || proname, ',' order by tgname) from trg where enabled = 'O')
  union all
  select 'br4_13 the guards refuse and allow as ruled (in a rolled-back block)',
         coalesce((select 'ai inventory refused, reading update refused, record change refused, read allowed, second move refused, cascade allowed'
                    where exists (select 1 from public.ghg_inventories i where i.bill_review_reading = 'ai'
                      and exists (select 1 from public.entitlements e where e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now()))), 'n/a'),
         pg_temp.br4_refusals()
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
