-- docs/review/patches/L0-ENF1-verify.sql
--
-- ⚠️ RUN 4 Oct 2026 in the Supabase SQL editor (recorded by Lisa): all 14 checks passed. DO NOT RUN AGAIN as part of
-- the rollout. It is safe to re-run as a check (it undoes itself), but it is not a step anyone needs to repeat.
-- Ran AFTER L0-ENF1-source-documents-upload.sql, in the Supabase SQL editor, the whole file. It changes
-- nothing: every write happens inside one PL/pgSQL block that ends by raising 'enf1_undo', and catching it rolls
-- the block back to its savepoint, undoing the test uploads, the deletes and the entitlement changes. Results are
-- carried out of the block in variables, so the rollback does not take them too (same pattern as FI0-verify.sql).
--
-- WHAT IT PROVES, as the database's own `authenticated` role with a real user's JWT claims, so the storage policies
-- themselves decide (cases 1 to 7), and as `service_role` for the erasure path (case 8):
--   1. ACTIVE plan: an upload into the user's own folder is accepted.
--   2. EXPIRED plan: the same upload is refused by row-level security.
--   3. EXPIRED plan: the object uploaded in case 1 can still be READ (reading is not withdrawn by expiry).
--   4. NEVER BOUGHT (no ghg row): the upload is refused.
--   5. ACTIVE plan, someone else's folder: refused (the uid-prefix rule is still there).
--   6. EXPIRED plan: deleting the case-1 object is refused (no row deleted, the object is still there).
--   7. ACTIVE plan: deleting its own object is allowed.
--   8. ERASURE PATH: as service_role (what scripts/erase-account.mjs uses, through the Storage API with the service
--      role key), deleting the user's object works even though the user has no plan. RLS does not apply to it.
--   plus the static checks: three policies, INSERT and DELETE call has_active_entitlement, anon cannot execute it.
--
-- HOW. It uses the first user holding an active GHG pass. Later cases change that user's entitlement inside the
-- block, then roll it back. If no such user exists, the cases report 'skipped' and fail, the honest answer.
-- Uploads are direct inserts into storage.objects, which is what the Storage API does after its own checks, and what
-- RLS governs. Deletes are direct deletes: a refused delete under RLS removes no rows and raises nothing, so the
-- cases count rows deleted (ROW_COUNT) rather than wait for an error. Newer Supabase projects guard direct deletes
-- on storage.objects with a trigger that the Storage API passes by setting storage.allow_delete_query; the script
-- sets it the same way, so the policies, not that guard, decide. Setting it is harmless where no such guard exists.
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists enf1_checks (check_name text, expected text, actual text);
truncate enf1_checks;

-- Static
insert into enf1_checks
select 'source-documents policies', '3',
       count(*)::text
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%''source-documents''%';
insert into enf1_checks
select 'INSERT policy requires an active plan', 'true',
       (coalesce(with_check, '') like '%has_active_entitlement%')::text
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can upload own documents';
insert into enf1_checks
select 'DELETE policy requires an active plan', 'true',
       (coalesce(qual, '') like '%has_active_entitlement%')::text
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can delete own documents';
insert into enf1_checks
select 'SELECT policy does not require a plan', 'false',
       (coalesce(qual, '') like '%has_active_entitlement%')::text
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname = 'Users can view own documents';
insert into enf1_checks
select 'anon cannot execute has_active_entitlement', 'false',
       has_function_privilege('anon', 'public.has_active_entitlement(text)', 'execute')::text;

do $t$
declare
  v_user  uuid;
  v_other uuid := gen_random_uuid();
  v_a     text;   -- kept: read and delete-refused while expired, then erased as service_role
  v_b     text;   -- deleted while active
  v_n     int;
  r1 text; r2 text; r3 text; r4 text; r5 text; r6 text; r7 text; r8 text;
begin
  select e.user_id into v_user
    from public.entitlements e
   where e.module_key = 'ghg' and e.term_end > now()
   limit 1;

  if v_user is null then
    insert into enf1_checks values
      ('1 active: upload accepted', 'accepted', 'skipped: no user with an active GHG pass'),
      ('2 expired: upload refused', 'refused', 'skipped'),
      ('3 expired: own document still readable', 'readable', 'skipped'),
      ('4 never bought: upload refused', 'refused', 'skipped'),
      ('5 active, other folder: refused', 'refused', 'skipped'),
      ('6 expired: delete refused, document kept', 'refused', 'skipped'),
      ('7 active: delete allowed', 'deleted', 'skipped'),
      ('8 erasure (service_role): delete works without a plan', 'deleted', 'skipped');
    return;
  end if;

  v_a := v_user::text || '/enf1-verify/' || gen_random_uuid()::text || '-a.pdf';
  v_b := v_user::text || '/enf1-verify/' || gen_random_uuid()::text || '-b.pdf';

  begin
    perform set_config('storage.allow_delete_query', 'true', true);
    -- Act as that user, through RLS.
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    -- 1. Active plan: accepted (two objects: A is kept for later cases, B is deleted in case 7)
    begin
      insert into storage.objects (bucket_id, name) values ('source-documents', v_a);
      insert into storage.objects (bucket_id, name) values ('source-documents', v_b);
      r1 := 'accepted';
    exception when others then
      r1 := 'refused: ' || sqlerrm;
    end;

    -- 5. Active plan, someone else's folder: refused
    begin
      insert into storage.objects (bucket_id, name) values ('source-documents', v_other::text || '/enf1-verify/x.pdf');
      r5 := 'accepted';
    exception when others then
      r5 := case when sqlerrm like '%row-level security%' then 'refused' else 'refused: ' || sqlerrm end;
    end;

    -- 7. Active plan: deleting its own object is allowed
    begin
      delete from storage.objects where bucket_id = 'source-documents' and name = v_b;
      get diagnostics v_n = row_count;
      r7 := case when v_n = 1 then 'deleted' else 'not deleted (' || v_n || ' rows)' end;
    exception when others then
      r7 := 'error: ' || sqlerrm;
    end;

    -- 2. Expired plan: upload refused (the entitlement change runs as the editor's own role, then back to the user)
    execute 'reset role';
    update public.entitlements set term_end = now() - interval '1 day' where user_id = v_user and module_key = 'ghg';
    execute 'set local role authenticated';
    begin
      insert into storage.objects (bucket_id, name) values ('source-documents', v_user::text || '/enf1-verify/expired.pdf');
      r2 := 'accepted';
    exception when others then
      r2 := case when sqlerrm like '%row-level security%' then 'refused' else 'refused: ' || sqlerrm end;
    end;

    -- 3. Expired plan: object A is still readable
    select count(*) into v_n from storage.objects where bucket_id = 'source-documents' and name = v_a;
    r3 := case when v_n = 1 then 'readable' else 'not visible (' || v_n || ')' end;

    -- 6. Expired plan: deleting A is refused. Under RLS that is zero rows deleted, not an error; A must remain.
    begin
      delete from storage.objects where bucket_id = 'source-documents' and name = v_a;
      get diagnostics v_n = row_count;
      if v_n = 0 then
        select count(*) into v_n from storage.objects where bucket_id = 'source-documents' and name = v_a;
        r6 := case when v_n = 1 then 'refused' else 'refused, but the object is gone' end;
      else
        r6 := 'deleted';
      end if;
    exception when others then
      r6 := case when sqlerrm like '%row-level security%' then 'refused' else 'error: ' || sqlerrm end;
    end;

    -- 4. Never bought: upload refused
    execute 'reset role';
    delete from public.entitlements where user_id = v_user and module_key = 'ghg';
    execute 'set local role authenticated';
    begin
      insert into storage.objects (bucket_id, name) values ('source-documents', v_user::text || '/enf1-verify/none.pdf');
      r4 := 'accepted';
    exception when others then
      r4 := case when sqlerrm like '%row-level security%' then 'refused' else 'refused: ' || sqlerrm end;
    end;

    -- 8. Erasure path: service_role deletes A although the user now has no plan at all
    execute 'reset role';
    execute 'set local role service_role';
    begin
      delete from storage.objects where bucket_id = 'source-documents' and name = v_a;
      get diagnostics v_n = row_count;
      r8 := case when v_n = 1 then 'deleted' else 'not deleted (' || v_n || ' rows)' end;
    exception when others then
      r8 := 'error: ' || sqlerrm;
    end;

    execute 'reset role';
    raise exception 'enf1_undo';
  exception when others then
    if sqlerrm <> 'enf1_undo' then
      raise;
    end if;
  end;

  insert into enf1_checks values
    ('1 active: upload accepted', 'accepted', r1),
    ('2 expired: upload refused', 'refused', r2),
    ('3 expired: own document still readable', 'readable', r3),
    ('4 never bought: upload refused', 'refused', r4),
    ('5 active, other folder: refused', 'refused', r5),
    ('6 expired: delete refused, document kept', 'refused', r6),
    ('7 active: delete allowed', 'deleted', r7),
    ('8 erasure (service_role): delete works without a plan', 'deleted', r8);
end
$t$;

-- Everything above the results is undone. This confirms it: an active GHG pass still exists.
insert into enf1_checks
select 'test user''s GHG pass unchanged after the run', 'true',
       (exists (select 1 from public.entitlements e where e.module_key = 'ghg' and e.term_end > now()))::text;

select check_name, expected, actual, actual = expected as pass from enf1_checks;
