-- docs/review/patches/L6-M5-verify.sql
--
-- ⚠️ RUN 5 Oct 2026 in the Supabase SQL editor (recorded by Lisa), after M5: all 17 checks passed. DO NOT RUN AGAIN as
-- part of the rollout. It is safe to re-run as a check (it undoes itself), but no one needs to repeat it.
-- Run AFTER L6-M5-marketing-consents.sql, in the Supabase SQL editor, the whole file. It changes nothing:
-- the test users and rows are created inside one PL/pgSQL block that ends by raising 'm5_undo', and catching it rolls
-- the block back (the L0/L1/L3 pattern). Results are carried out in variables.
--
-- WHAT IT PROVES
--   static  RLS on; one policy, SELECT, for authenticated; anon holds nothing; authenticated SELECT only;
--           service_role SELECT, INSERT and UPDATE (withdrawn_at) only; nobody holds DELETE
--   C1  service_role records a granted choice                       accepted
--   C2  service_role records a not-granted choice                   accepted
--   C3  the owner reads their own rows, and no one else's           own 2, other 0
--   C4  the owner cannot insert                                     refused 42501
--   C5  the owner cannot withdraw (update)                          refused 42501
--   C6  service_role withdraws: withdrawn_at set, row kept          1 row, kept
--   C7  service_role cannot delete                                  refused 42501
--   C8  service_role cannot change what was granted                 refused 42501
--   C9  a withdrawal on a not-granted row                           refused 23514
--   C10 a purpose other than 'updates'                              refused 23514
--   C11 anon cannot read                                            refused 42501
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m5_checks (check_name text, expected text, actual text);
truncate m5_checks;

insert into m5_checks select 'RLS on', 'true', (select relrowsecurity from pg_class where oid = 'public.marketing_consents'::regclass)::text;
insert into m5_checks select 'one policy: SELECT for authenticated', '1|SELECT|{authenticated}',
  (select count(*) || '|' || max(cmd) || '|' || max(roles::text) from pg_policies where schemaname = 'public' and tablename = 'marketing_consents');
insert into m5_checks select 'anon holds nothing', 'false',
  has_table_privilege('anon', 'public.marketing_consents', 'select,insert,update,delete')::text;
insert into m5_checks select 'authenticated: SELECT only', 'true',
  (has_table_privilege('authenticated', 'public.marketing_consents', 'select')
   and not has_table_privilege('authenticated', 'public.marketing_consents', 'insert,update,delete'))::text;
insert into m5_checks select 'service_role: select, insert, update(withdrawn_at) only; no delete', 'true',
  (has_table_privilege('service_role', 'public.marketing_consents', 'select')
   and has_table_privilege('service_role', 'public.marketing_consents', 'insert')
   and has_column_privilege('service_role', 'public.marketing_consents', 'withdrawn_at', 'update')
   and not has_column_privilege('service_role', 'public.marketing_consents', 'granted', 'update')
   and not has_table_privilege('service_role', 'public.marketing_consents', 'delete'))::text;

do $t$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  c1 uuid;
  c2 uuid;
  v_n int;
  v_txt text;
  r text[] := array_fill(''::text, array[11]);
begin
  begin
    insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated', 'm5-verify-1@example.com', now(), now()),
           ('00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated', 'm5-verify-2@example.com', now(), now());

    execute 'set local role service_role';
    begin
      insert into public.marketing_consents (user_id, email, purpose, granted, wording, wording_version, source_page, ip, user_agent)
      values (u1, 'm5-verify-1@example.com', 'updates', true, 'Wording shown.', 'v-test', '/dashboard/ghg', '203.0.113.1', 'verify')
      returning id into c1;
      r[1] := 'accepted';
    exception when others then r[1] := 'refused ' || sqlstate || ': ' || sqlerrm; end;
    begin
      insert into public.marketing_consents (user_id, email, purpose, granted, wording, wording_version, source_page)
      values (u1, 'm5-verify-1@example.com', 'updates', false, 'Wording shown.', 'v-test', '/dashboard/ghg')
      returning id into c2;
      insert into public.marketing_consents (user_id, email, purpose, granted, wording, wording_version, source_page)
      values (u2, 'm5-verify-2@example.com', 'updates', true, 'Wording shown.', 'v-test', '/dashboard/ghg');
      r[2] := 'accepted';
    exception when others then r[2] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    -- C9, C10: the checks
    begin
      update public.marketing_consents set withdrawn_at = now() where id = c2;
      r[9] := 'accepted';
    exception when others then r[9] := 'refused ' || sqlstate; end;
    begin
      insert into public.marketing_consents (email, purpose, granted, wording, wording_version, source_page)
      values ('x@example.com', 'partners', true, 'w', 'v', '/p');
      r[10] := 'accepted';
    exception when others then r[10] := 'refused ' || sqlstate; end;

    -- C3 to C5: as u1, signed in
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_n from public.marketing_consents where user_id = u1;
    select count(*) into v_txt from public.marketing_consents where user_id = u2;
    r[3] := 'own ' || v_n || ', other ' || v_txt;
    begin
      insert into public.marketing_consents (user_id, email, purpose, granted, wording, wording_version, source_page)
      values (u1, 'm5-verify-1@example.com', 'updates', true, 'w', 'v', '/p');
      r[4] := 'accepted';
    exception when others then r[4] := 'refused ' || sqlstate; end;
    begin
      update public.marketing_consents set withdrawn_at = now() where id = c1;
      r[5] := 'updated';
    exception when others then r[5] := 'refused ' || sqlstate; end;

    -- C6 to C8: service role
    execute 'reset role';
    execute 'set local role service_role';
    update public.marketing_consents set withdrawn_at = now() where id = c1 and granted and withdrawn_at is null;
    get diagnostics v_n = row_count;
    r[6] := v_n || ' row, ' || (case when exists (select 1 from public.marketing_consents where id = c1 and withdrawn_at is not null) then 'kept' else 'missing' end);
    begin
      delete from public.marketing_consents where id = c1;
      r[7] := 'deleted';
    exception when others then r[7] := 'refused ' || sqlstate; end;
    begin
      update public.marketing_consents set granted = false where id = c1;
      r[8] := 'updated';
    exception when others then r[8] := 'refused ' || sqlstate; end;

    -- C11: anon
    execute 'reset role';
    execute 'set local role anon';
    begin
      perform 1 from public.marketing_consents limit 1;
      r[11] := 'readable';
    exception when others then r[11] := 'refused ' || sqlstate; end;

    execute 'reset role';
    raise exception 'm5_undo';
  exception when others then
    if sqlerrm <> 'm5_undo' then raise; end if;
  end;

  insert into m5_checks values
    ('C1 service_role records a granted choice', 'accepted', r[1]),
    ('C2 service_role records a not-granted choice', 'accepted', r[2]),
    ('C3 owner reads own rows only', 'own 2, other 0', r[3]),
    ('C4 owner cannot insert', 'refused 42501', r[4]),
    ('C5 owner cannot withdraw', 'refused 42501', r[5]),
    ('C6 service_role withdraws, row kept', '1 row, kept', r[6]),
    ('C7 service_role cannot delete', 'refused 42501', r[7]),
    ('C8 service_role cannot change granted', 'refused 42501', r[8]),
    ('C9 withdrawal on a not-granted row refused', 'refused 23514', r[9]),
    ('C10 purpose other than updates refused', 'refused 23514', r[10]),
    ('C11 anon cannot read', 'refused 42501', r[11]);
end
$t$;

insert into m5_checks select 'nothing left behind', '0',
  (select count(*) from auth.users where email like 'm5-verify-%@example.com')::text;

select check_name, expected, actual, actual = expected as pass from m5_checks;
