-- docs/review/patches/L3-M6-verify.sql
--
-- ⚠️ NOT RUN. Run AFTER L3-M6-profiles-on-signup.sql, in the Supabase SQL editor, the whole file. It changes nothing:
-- the test users and everything they cause are created inside one PL/pgSQL block that ends by raising 'm6_undo', and
-- catching it rolls the block back (the L0/L1 pattern). It inserts into auth.users the way a sign-up does, with the
-- columns GoTrue sets; if this project's auth.users needs more, the S cases report the error instead of passing.
--
-- WHAT IT PROVES
--   static  the trigger is on auth.users; the function is SECURITY DEFINER with an empty search_path; every existing
--           user has a profile (the backfill); anon holds nothing; authenticated SELECT only; service_role S/I/U
--   S1  a free-account sign-up (full_name, company, signup_source) gets a profile with those values
--   S2  a password sign-up (first_name, last_name, company, role) gets one, full_name composed from the two names
--   S3  a profile insert that fails does NOT block the sign-up: the user row exists, with no profile
--   S4  a signed-in user reads their own profile and no one else's
--   S5  a signed-in user cannot write profiles (no INSERT/UPDATE grant)
--   S6  anon cannot read profiles
--   S7  service_role can update a profile (the claim route's path)
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m6_checks (check_name text, expected text, actual text);
truncate m6_checks;

insert into m6_checks select 'trigger on auth.users', 'true',
  exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal)::text;
insert into m6_checks select 'function is security definer', 'true',
  (select prosecdef from pg_proc where oid = 'public.handle_new_user()'::regprocedure)::text;
insert into m6_checks select 'function search_path is empty', 'true',
  coalesce((select 'search_path=""' = any(proconfig) or 'search_path=' = any(proconfig) from pg_proc where oid = 'public.handle_new_user()'::regprocedure), false)::text;
insert into m6_checks select 'every user has a profile', '0',
  (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id))::text;
insert into m6_checks select 'anon holds nothing on profiles', 'false',
  has_table_privilege('anon', 'public.profiles', 'select,insert,update,delete')::text;
insert into m6_checks select 'authenticated: SELECT only', 'true',
  (has_table_privilege('authenticated', 'public.profiles', 'select')
   and not has_table_privilege('authenticated', 'public.profiles', 'insert,update,delete'))::text;
insert into m6_checks select 'service_role: select, insert, update', 'true',
  (has_table_privilege('service_role', 'public.profiles', 'select')
   and has_table_privilege('service_role', 'public.profiles', 'insert')
   and has_table_privilege('service_role', 'public.profiles', 'update'))::text;

do $t$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  u3 uuid := gen_random_uuid();
  v_n int;
  v_txt text;
  r text[] := array_fill(''::text, array[7]);
begin
  begin
    -- S1: free-account sign-up
    begin
      insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u1, 'authenticated', 'authenticated', 'm6-verify-1@example.com',
              '{"full_name":"Free Person","company":"Free Co","signup_source":"free_calc"}', now(), now());
      select full_name || '|' || company || '|' || signup_source into v_txt from public.profiles where id = u1;
      r[1] := coalesce(v_txt, 'no profile');
    exception when others then r[1] := 'error ' || sqlstate || ': ' || sqlerrm; end;

    -- S2: password sign-up
    begin
      insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u2, 'authenticated', 'authenticated', 'm6-verify-2@example.com',
              '{"first_name":"Pat","last_name":"Lee","company":"Lee Ltd","role":"CFO"}', now(), now());
      select full_name || '|' || company || '|' || coalesce(signup_source, 'null') into v_txt from public.profiles where id = u2;
      r[2] := coalesce(v_txt, 'no profile');
    exception when others then r[2] := 'error ' || sqlstate || ': ' || sqlerrm; end;

    -- S3: a failing profile insert does not block the sign-up
    begin
      alter table public.profiles add constraint m6_verify_always_fails check (false) not valid;
      insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', u3, 'authenticated', 'authenticated', 'm6-verify-3@example.com',
              '{"full_name":"Blocked Profile"}', now(), now());
      select count(*) into v_n from public.profiles where id = u3;
      r[3] := case when exists (select 1 from auth.users where id = u3) and v_n = 0 then 'user kept, no profile'
                   else 'user ' || exists (select 1 from auth.users where id = u3)::text || ', profiles ' || v_n end;
      alter table public.profiles drop constraint m6_verify_always_fails;
    exception when others then r[3] := 'error ' || sqlstate || ': ' || sqlerrm; end;

    -- S4, S5: as u1, signed in
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into v_n from public.profiles where id = u1;
    select count(*) into v_txt from public.profiles where id = u2;
    r[4] := 'own ' || v_n || ', other ' || v_txt;
    begin
      update public.profiles set company = 'Changed' where id = u1;
      r[5] := 'updated';
    exception when others then r[5] := 'refused ' || sqlstate; end;

    -- S6: anon
    execute 'reset role';
    execute 'set local role anon';
    begin
      perform 1 from public.profiles limit 1;
      r[6] := 'readable';
    exception when others then r[6] := 'refused ' || sqlstate; end;

    -- S7: service_role, as the claim route
    execute 'reset role';
    execute 'set local role service_role';
    begin
      update public.profiles set country = 'CA' where id = u1;
      get diagnostics v_n = row_count;
      r[7] := v_n || ' row';
    exception when others then r[7] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    raise exception 'm6_undo';
  exception when others then
    if sqlerrm <> 'm6_undo' then raise; end if;
  end;

  insert into m6_checks values
    ('S1 free-account sign-up: name|company|source', 'Free Person|Free Co|free_calc', r[1]),
    ('S2 password sign-up: name|company|source', 'Pat Lee|Lee Ltd|null', r[2]),
    ('S3 failing profile does not block sign-up', 'user kept, no profile', r[3]),
    ('S4 signed in: own profile only', 'own 1, other 0', r[4]),
    ('S5 signed in: cannot write', 'refused 42501', r[5]),
    ('S6 anon cannot read', 'refused 42501', r[6]),
    ('S7 service_role updates a profile', '1 row', r[7]);
end
$t$;

insert into m6_checks select 'no test user left behind', '0',
  (select count(*) from auth.users where email like 'm6-verify-%@example.com')::text;

select check_name, expected, actual, actual = expected as pass from m6_checks;
