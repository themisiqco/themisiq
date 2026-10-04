-- docs/review/patches/L3-M4-verify.sql
--
-- ⚠️ RUN 4 Oct 2026 in the Supabase SQL editor (recorded by Lisa), after M4 and M6: all 13 checks passed. DO NOT RUN AGAIN as
-- part of the rollout. It is safe to re-run as a check (it undoes itself), but no one needs to repeat it.
-- Run AFTER L3-M4-free-calc-pending.sql, in the Supabase SQL editor, the whole file. It changes nothing:
-- the writes happen inside one PL/pgSQL block that ends by raising 'm4_undo', and catching it rolls the block back.
-- Results are carried out in variables (the L0/L1 pattern).
--
-- WHAT IT PROVES
--   static  RLS on, no policy, anon and authenticated hold no privilege, service_role holds select/insert/delete
--   P1  service_role can hold a calculation                         accepted
--   P2  service_role can read it back by email_key                  1 row
--   P3  service_role can delete it                                  1 row
--   P4  authenticated cannot read the table                         refused 42501
--   P5  anon cannot write the table                                 refused 42501
--   P6  an email_key that is not lower-cased and trimmed            refused 23514
--   P7  a hold that expires before it was made                      refused 23514
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m4_checks (check_name text, expected text, actual text);
truncate m4_checks;

insert into m4_checks select 'RLS on', 'true', (select relrowsecurity from pg_class where oid = 'public.free_calc_pending'::regclass)::text;
insert into m4_checks select 'no policy', '0', (select count(*) from pg_policies where schemaname = 'public' and tablename = 'free_calc_pending')::text;
insert into m4_checks select 'anon holds no privilege', 'false',
  has_table_privilege('anon', 'public.free_calc_pending', 'select,insert,update,delete')::text;
insert into m4_checks select 'authenticated holds no privilege', 'false',
  has_table_privilege('authenticated', 'public.free_calc_pending', 'select,insert,update,delete')::text;
insert into m4_checks select 'service_role: select, insert, delete', 'true',
  (has_table_privilege('service_role', 'public.free_calc_pending', 'select')
   and has_table_privilege('service_role', 'public.free_calc_pending', 'insert')
   and has_table_privilege('service_role', 'public.free_calc_pending', 'delete'))::text;

do $t$
declare
  v_key text := 'm4-verify-' || substr(gen_random_uuid()::text, 1, 8) || '@example.com';
  v_n int;
  r text[] := array_fill(''::text, array[7]);
begin
  begin
    execute 'set local role service_role';
    begin
      insert into public.free_calc_pending (email, email_key, full_name, company, payload, expires_at)
      values (v_key, v_key, 'Verify Person', 'Verify Co', '{"locations":[{"id":"1"}]}', now() + interval '24 hours');
      r[1] := 'accepted';
    exception when others then r[1] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    select count(*) into v_n from public.free_calc_pending where email_key = v_key;
    r[2] := v_n || ' row';

    begin
      insert into public.free_calc_pending (email, email_key, payload, expires_at)
      values ('X@Example.com', ' X@Example.com', '{}', now() + interval '1 hour');
      r[6] := 'accepted';
    exception when others then r[6] := 'refused ' || sqlstate; end;

    begin
      insert into public.free_calc_pending (email, email_key, payload, created_at, expires_at)
      values (v_key, v_key, '{}', now(), now() - interval '1 hour');
      r[7] := 'accepted';
    exception when others then r[7] := 'refused ' || sqlstate; end;

    execute 'reset role';
    execute 'set local role authenticated';
    begin
      perform 1 from public.free_calc_pending limit 1;
      r[4] := 'readable';
    exception when others then r[4] := 'refused ' || sqlstate; end;

    execute 'reset role';
    execute 'set local role anon';
    begin
      insert into public.free_calc_pending (email, email_key, payload, expires_at) values (v_key, v_key, '{}', now() + interval '1 hour');
      r[5] := 'accepted';
    exception when others then r[5] := 'refused ' || sqlstate; end;

    execute 'reset role';
    execute 'set local role service_role';
    delete from public.free_calc_pending where email_key = v_key;
    get diagnostics v_n = row_count;
    r[3] := v_n || ' row';

    execute 'reset role';
    raise exception 'm4_undo';
  exception when others then
    if sqlerrm <> 'm4_undo' then raise; end if;
  end;

  insert into m4_checks values
    ('P1 service_role holds a calculation', 'accepted', r[1]),
    ('P2 service_role reads it by email_key', '1 row', r[2]),
    ('P3 service_role deletes it', '1 row', r[3]),
    ('P4 authenticated cannot read', 'refused 42501', r[4]),
    ('P5 anon cannot write', 'refused 42501', r[5]),
    ('P6 un-normalised email_key refused', 'refused 23514', r[6]),
    ('P7 expiry before creation refused', 'refused 23514', r[7]);
end
$t$;

insert into m4_checks select 'nothing left behind', '0',
  (select count(*) from public.free_calc_pending where email_key like 'm4-verify-%')::text;

select check_name, expected, actual, actual = expected as pass from m4_checks;
