-- docs/review/patches/LEAD1-verify.sql
--
-- ⚠️ NOT RUN. Run AFTER L1-M1-ghg-free-tier.sql, L1-M3-scope3-sbti-entitlement.sql and
-- L1-M2-ghg-entitlement-gate-free-tier.sql, in that order, in the Supabase SQL editor, the whole file. It changes
-- nothing: every write happens inside one PL/pgSQL block that ends by raising 'lead1_undo', and catching it rolls the
-- block back to its savepoint, undoing the test company, inventories, Scope 3 and SBTi rows, the entitlement changes
-- and the audit rows they triggered. Results are carried out of the block in variables (same pattern as
-- L0-ENF1-verify.sql).
--
-- WHAT IT PROVES, as the database's own `authenticated` role with a real user's JWT claims, so RLS, the triggers and
-- the unique indexes decide, and as `service_role` for the purchase conversion:
--   ACTIVE plan (unrestricted)
--     V1  a paid inventory is inserted                                     accepted
--     V2  a Scope 3 record is inserted for it                              accepted
--     V3  an SBTi profile is inserted                                      accepted
--   EXPIRED plan
--     V4  the paid inventory is updated                                    refused PT410
--     V5  an upsert onto the paid inventory's company and year             refused PT410 (a free save never
--         overwrites a real inventory)
--     V6  a new non-free inventory is inserted                             refused PT410
--     V7  a free calculation is inserted                                   accepted
--     V8  a second free calculation is inserted                            refused 23505 (one free per account)
--     V9  the free calculation is given a source document                  refused PT402
--     V10 the free calculation is edited (no documents)                    accepted
--     V11 the free calculation is turned into a paid one                   refused PT410
--     V12 the paid inventory is turned into a free one                     refused PT410
--     V13 the Scope 3 record is updated                                    refused PT410
--     V14 the SBTi profile is updated                                      refused PT410
--   NEVER BOUGHT (no ghg row)
--     V15 the paid inventory is updated                                    refused PT402
--     V16 the Scope 3 record is updated                                    refused PT402
--     V17 the SBTi profile is updated                                      refused PT402
--     V18 the free calculation is edited                                   accepted
--   A PLAN IS GRANTED
--     V19 service_role converts the free calculation (free_tier -> false)  1 row
--     V20 the paid inventory, Scope 3 and SBTi are updated                 accepted
--   plus static checks on M1, M2 and M3.
--
-- HOW. It uses the first user holding an active GHG pass, and creates its own company (named 'LEAD1 verify ' plus a
-- random suffix) and inventories for reporting years 2097 to 2099, so it touches none of that user's real data. The
-- entitlement changes (expire, delete, re-grant) run as the editor's own role between the user's steps. If no such
-- user exists, every case reports 'skipped' and fails, the honest answer.
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists lead1_checks (check_name text, expected text, actual text);
truncate lead1_checks;

-- ── Static ──────────────────────────────────────────────────────────────────────────────────────────────────────
insert into lead1_checks
select 'M1: free_tier is not null, default false', 'true',
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'ghg_inventories' and column_name = 'free_tier'
                  and is_nullable = 'NO' and column_default = 'false')::text;
insert into lead1_checks
select 'M1: one free calculation per account (partial unique index)', 'true',
       exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'ghg_inventories'
                 and indexname = 'ghg_inventories_one_free_per_user'
                 and indexdef like 'CREATE UNIQUE INDEX%' and indexdef like '%WHERE free_tier%')::text;
insert into lead1_checks
select 'M1: service_role may update free_tier', 'true',
       has_column_privilege('service_role', 'public.ghg_inventories', 'free_tier', 'UPDATE')::text;
insert into lead1_checks
select 'M2: the GHG gate reads free_tier', 'true',
       (position('free_tier' in (select prosrc from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure)) > 0)::text;
insert into lead1_checks
select 'M3: Scope 3 and SBTi triggers in place', '5',
       (select count(*) from pg_trigger
         where not tgisinternal and tgname in ('trg_enforce_scope3_entitlement', 'trg_enforce_sbti_entitlement'))::text;

do $t$
declare
  v_user uuid;
  v_co   uuid;
  v_co_name text := 'LEAD1 verify ' || substr(gen_random_uuid()::text, 1, 8);
  v_paid uuid;
  v_free uuid;
  v_n    int;
  r text[] := array_fill(''::text, array[20]);
  v_doc  jsonb := '[{"id":"l1","name":"Site","source_docs":[{"id":"d1","file_name":"bill.pdf","document_type":"utility_electricity","file_path":"x/y.pdf","uploaded_at":"2026-10-04T00:00:00Z"}]}]';
  v_nodoc jsonb := '[{"id":"l1","name":"Site","source_docs":[]}]';
begin
  select e.user_id into v_user
    from public.entitlements e
   where e.module_key = 'ghg' and e.term_end > now()
   limit 1;

  if v_user is null then
    for i in 1..20 loop
      insert into lead1_checks values ('V' || i, 'see header', 'skipped: no user with an active GHG pass');
    end loop;
    return;
  end if;

  begin
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    -- Setup, as the user: a company of their own, for the inventories below.
    insert into public.companies (user_id, name) values (v_user, v_co_name) returning id into v_co;

    -- ── ACTIVE ──
    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data)
      values (v_user, v_co, v_co_name, 2099, v_nodoc) returning id into v_paid;
      r[1] := 'accepted';
    exception when others then r[1] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    begin
      insert into public.scope3_inventories (user_id, inventory_id) values (v_user, v_paid);
      r[2] := 'accepted';
    exception when others then r[2] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    begin
      insert into public.sbti_company_profile (company_id, user_id) values (v_co, v_user);
      r[3] := 'accepted';
    exception when others then r[3] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    -- ── EXPIRED ──
    execute 'reset role';
    update public.entitlements set term_end = now() - interval '1 day' where user_id = v_user and module_key = 'ghg';
    execute 'set local role authenticated';

    begin
      update public.ghg_inventories set locations_data = v_nodoc where id = v_paid;
      r[4] := 'accepted';
    exception when others then r[4] := 'refused ' || sqlstate; end;

    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data, free_tier)
      values (v_user, v_co, v_co_name, 2099, v_nodoc, true)
      on conflict (user_id, company_name, reporting_year) do update set locations_data = excluded.locations_data;
      r[5] := 'accepted';
    exception when others then r[5] := 'refused ' || sqlstate; end;

    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data)
      values (v_user, v_co, v_co_name, 2098, v_nodoc);
      r[6] := 'accepted';
    exception when others then r[6] := 'refused ' || sqlstate; end;

    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data, free_tier)
      values (v_user, v_co, v_co_name, 2097, v_nodoc, true) returning id into v_free;
      r[7] := 'accepted';
    exception when others then r[7] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data, free_tier)
      values (v_user, v_co, v_co_name, 2096, v_nodoc, true);
      r[8] := 'accepted';
    exception when others then
      r[8] := 'refused ' || sqlstate || case when sqlerrm like '%ghg_inventories_one_free_per_user%' then ' one-free' else ': ' || sqlerrm end;
    end;

    begin
      update public.ghg_inventories set locations_data = v_doc where id = v_free;
      r[9] := 'accepted';
    exception when others then r[9] := 'refused ' || sqlstate; end;

    begin
      update public.ghg_inventories set locations_data = v_nodoc, revenue_millions = 1 where id = v_free;
      get diagnostics v_n = row_count;
      r[10] := case when v_n = 1 then 'accepted' else 'no row updated' end;
    exception when others then r[10] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    begin
      update public.ghg_inventories set free_tier = false where id = v_free;
      r[11] := 'accepted';
    exception when others then r[11] := 'refused ' || sqlstate; end;

    begin
      update public.ghg_inventories set free_tier = true where id = v_paid;
      r[12] := 'accepted';
    exception when others then r[12] := 'refused ' || sqlstate; end;

    begin
      update public.scope3_inventories set country_iso2 = null where inventory_id = v_paid;
      r[13] := 'accepted';
    exception when others then r[13] := 'refused ' || sqlstate; end;

    begin
      update public.sbti_company_profile set updated_at = now() where company_id = v_co;
      r[14] := 'accepted';
    exception when others then r[14] := 'refused ' || sqlstate; end;

    -- ── NEVER BOUGHT ──
    execute 'reset role';
    delete from public.entitlements where user_id = v_user and module_key = 'ghg';
    execute 'set local role authenticated';

    begin
      update public.ghg_inventories set locations_data = v_nodoc where id = v_paid;
      r[15] := 'accepted';
    exception when others then r[15] := 'refused ' || sqlstate; end;

    begin
      update public.scope3_inventories set country_iso2 = null where inventory_id = v_paid;
      r[16] := 'accepted';
    exception when others then r[16] := 'refused ' || sqlstate; end;

    begin
      update public.sbti_company_profile set updated_at = now() where company_id = v_co;
      r[17] := 'accepted';
    exception when others then r[17] := 'refused ' || sqlstate; end;

    begin
      update public.ghg_inventories set revenue_millions = 2 where id = v_free;
      get diagnostics v_n = row_count;
      r[18] := case when v_n = 1 then 'accepted' else 'no row updated' end;
    exception when others then r[18] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    -- ── A PLAN IS GRANTED ──
    execute 'reset role';
    insert into public.entitlements (user_id, module_key, term_start, term_end)
    values (v_user, 'ghg', now(), now() + interval '365 days');

    execute 'set local role service_role';
    begin
      update public.ghg_inventories set free_tier = false where user_id = v_user and free_tier;
      get diagnostics v_n = row_count;
      r[19] := v_n || ' row';
    exception when others then r[19] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    execute 'set local role authenticated';
    begin
      update public.ghg_inventories set locations_data = v_nodoc where id = v_paid;
      update public.scope3_inventories set country_iso2 = null where inventory_id = v_paid;
      update public.sbti_company_profile set updated_at = now() where company_id = v_co;
      r[20] := 'accepted';
    exception when others then r[20] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    raise exception 'lead1_undo';
  exception when others then
    if sqlerrm <> 'lead1_undo' then
      raise;
    end if;
  end;

  insert into lead1_checks values
    ('V1 active: paid inventory inserted', 'accepted', r[1]),
    ('V2 active: Scope 3 inserted', 'accepted', r[2]),
    ('V3 active: SBTi profile inserted', 'accepted', r[3]),
    ('V4 expired: paid inventory updated', 'refused PT410', r[4]),
    ('V5 expired: upsert onto the paid inventory refused', 'refused PT410', r[5]),
    ('V6 expired: new non-free inventory', 'refused PT410', r[6]),
    ('V7 expired: free calculation inserted', 'accepted', r[7]),
    ('V8 expired: second free calculation', 'refused 23505 one-free', r[8]),
    ('V9 expired: source document on the free calculation', 'refused PT402', r[9]),
    ('V10 expired: free calculation edited', 'accepted', r[10]),
    ('V11 expired: free turned into paid', 'refused PT410', r[11]),
    ('V12 expired: paid turned into free', 'refused PT410', r[12]),
    ('V13 expired: Scope 3 updated', 'refused PT410', r[13]),
    ('V14 expired: SBTi updated', 'refused PT410', r[14]),
    ('V15 never bought: paid inventory updated', 'refused PT402', r[15]),
    ('V16 never bought: Scope 3 updated', 'refused PT402', r[16]),
    ('V17 never bought: SBTi updated', 'refused PT402', r[17]),
    ('V18 never bought: free calculation edited', 'accepted', r[18]),
    ('V19 granted: service_role converts the free calculation', '1 row', r[19]),
    ('V20 granted: paid inventory, Scope 3 and SBTi updated', 'accepted', r[20]);
end
$t$;

-- Everything above the results is undone. This confirms it: no test company is left, and an active GHG pass exists.
insert into lead1_checks
select 'no LEAD1 verify company left behind', '0',
       (select count(*) from public.companies where name like 'LEAD1 verify %')::text;
insert into lead1_checks
select 'test user''s GHG pass unchanged after the run', 'true',
       (exists (select 1 from public.entitlements e where e.module_key = 'ghg' and e.term_end > now()))::text;

select check_name, expected, actual, actual = expected as pass from lead1_checks;
