-- supabase/verify/20261010_t16_verify.sql
-- T16 (verifier links pinned to a saved version): ONE read-only query, one row per check, with check_name, expected,
-- actual and pass. Run AFTER all four 20261010 migrations. Every row should read pass = true. It writes nothing.
-- RUN 9 Oct 2026 (evening, Ontario; 10 Oct UTC) (Lisa): all 20 checks passed, twice (the second time after
-- location_log was added).
--
-- NOTE: TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. pglast parses the grammar, not the types. "char" catalog columns
-- (prosecdef is boolean; polcmd, tgtype bits are cast) are concatenated only with ::text (the 1 Oct 2026 lesson).

with
fn as (
  select p.proname, p.prosecdef, coalesce(p.proconfig, array[]::text[]) as cfg, p.prosrc,
         has_function_privilege('anon', p.oid, 'execute') as anon_x,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('ghg_verifier_projection', 'ghg_snapshot_inventory_version',
    'ghg_snapshot_inventory_version_internal', 'verifier_access_pin_version', 'get_verifier_inventory')
),
pol as (
  select policyname, cmd, roles::text as roles, coalesce(qual, '') as qual
  from pg_policies where schemaname = 'public' and tablename = 'ghg_inventory_versions'
),
one_grant as (
  select a.inventory_id, v.snapshot from public.verifier_access a
  join public.ghg_inventory_versions v on v.id = a.inventory_version_id
  limit 1
),
checks(check_name, expected, actual) as (
  select 't16_01 projection function exists, not definer, search_path empty',
         'true', (select coalesce(bool_and(not prosecdef and cfg = array['search_path=""']), false)::text from fn where proname = 'ghg_verifier_projection')
  union all
  select 't16_02 projection not executable by anon or authenticated',
         'false', (select coalesce(bool_or(anon_x or auth_x), true)::text from fn where proname = 'ghg_verifier_projection')
  union all
  select 't16_03 no bill-backed quantity key in any projected locations_data element',
         '0', (select count(*)::text from public.ghg_inventories i,
                 jsonb_array_elements(case when jsonb_typeof(public.ghg_verifier_projection(i) -> 'locations_data') = 'array'
                   then public.ghg_verifier_projection(i) -> 'locations_data' else '[]'::jsonb end) e
               where e ?| array['electricity_kwh', 'renewable_electricity_kwh', 'natural_gas_amount', 'propane_amount',
                 'diesel_stationary_amount', 'diesel_mobile_amount', 'gasoline_amount', 'light_petrol_amount',
                 'light_diesel_amount', 'heavy_petrol_amount', 'heavy_diesel_amount', 'nonroad_petrol_amount',
                 'nonroad_diesel_amount'])
  union all
  select 't16_04 ghg_inventory_versions exists with row level security on',
         'true', (select coalesce(bool_and(c.relrowsecurity), false)::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relname = 'ghg_inventory_versions')
  union all
  select 't16_05 one select policy, own rows, wrapped auth.uid()',
         '1', (select count(*)::text from pol where policyname = 'ghg_inventory_versions_select_own' and cmd = 'SELECT'
               and roles = '{authenticated}' and qual ilike '%( SELECT auth.uid() AS uid)%')
  union all
  select 't16_06 no insert, update or delete policy on ghg_inventory_versions',
         '0', (select count(*)::text from pol where cmd <> 'SELECT')
  union all
  select 't16_07 ghg_inventory_versions grants: authenticated and service_role SELECT only; anon none',
         'authenticated:SELECT,service_role:SELECT',
         (select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type), 'none')
            from information_schema.role_table_grants
           where table_schema = 'public' and table_name = 'ghg_inventory_versions'
             and grantee in ('anon', 'authenticated', 'service_role')
             and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
  union all
  select 't16_08 internal snapshot: definer, search_path empty, no execute for anon or authenticated',
         'true', (select coalesce(bool_and(prosecdef and cfg = array['search_path=""'] and not anon_x and not auth_x), false)::text
                  from fn where proname = 'ghg_snapshot_inventory_version_internal')
  union all
  select 't16_09 owner snapshot: definer, execute for authenticated, not anon',
         'true', (select coalesce(bool_and(prosecdef and auth_x and not anon_x), false)::text from fn where proname = 'ghg_snapshot_inventory_version')
  union all
  select 't16_10 the snapshot never writes ghg_inventories',
         'false', (select coalesce(bool_or(prosrc ilike '%update public.ghg_inventories%'), true)::text
                   from fn where proname in ('ghg_snapshot_inventory_version', 'ghg_snapshot_inventory_version_internal'))
  union all
  select 't16_11 verifier_access.inventory_version_id is NOT NULL, with version_shared_at and version_shared_by',
         'inventory_version_id:NO,version_shared_at:YES,version_shared_by:YES',
         (select string_agg(column_name || ':' || is_nullable, ',' order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'verifier_access'
             and column_name in ('inventory_version_id', 'version_shared_at', 'version_shared_by'))
  union all
  select 't16_12 trg_verifier_access_pin_version is attached, before insert or update, enabled',
         '1', (select count(*)::text from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = 'verifier_access' and t.tgname = 'trg_verifier_access_pin_version'
                 and not t.tgisinternal and t.tgenabled::text = 'O'
                 and (t.tgtype::int & 2) = 2 and (t.tgtype::int & 4) = 4 and (t.tgtype::int & 16) = 16)
  union all
  select 't16_13 no verifier link is unpinned',
         '0', (select count(*)::text from public.verifier_access where inventory_version_id is null)
  union all
  select 't16_14 every link shows a version of its own inventory and owner',
         '0', (select count(*)::text from public.verifier_access a join public.ghg_inventory_versions v on v.id = a.inventory_version_id
               where v.inventory_id <> a.inventory_id or v.user_id <> a.customer_user_id)
  union all
  select 't16_15 the pin trigger function is not executable by anon or authenticated',
         'false', (select coalesce(bool_or(anon_x or auth_x), true)::text from fn where proname = 'verifier_access_pin_version')
  union all
  select 't16_16 get_verifier_inventory checks revoke and consent, reads the pinned version, stops the audit at it',
         'true', (select coalesce(bool_and(prosecdef and prosrc like '%revoked_at is null%' and prosrc like '%accepted_at is null%'
                    and prosrc like '%ghg_inventory_versions%' and prosrc like '%a.created_at <= v_version.saved_at%'
                    and prosrc not like '%from ghg_inventories i where i.id = v_access.inventory_id;%into v_inventory%'), false)::text
                  from fn where proname = 'get_verifier_inventory')
  union all
  select 't16_17 get_verifier_inventory is still executable by anon (a verifier has no session)',
         'true', (select coalesce(bool_and(anon_x), false)::text from fn where proname = 'get_verifier_inventory')
  union all
  select 't16_18 a pinned snapshot and the live projection carry the same keys (no link: n/a)',
         coalesce((select 'same' from one_grant), 'n/a'),
         coalesce((select case when (select string_agg(k, ',' order by k) from jsonb_object_keys(g.snapshot) k)
                                  = (select string_agg(k, ',' order by k) from public.ghg_inventories i,
                                       jsonb_object_keys(public.ghg_verifier_projection(i)) k where i.id = g.inventory_id)
                               then 'same' else 'different' end from one_grant g), 'n/a')
  union all
  select 't16_19 the projection names sixteen keys',
         coalesce((select '16' from public.ghg_inventories limit 1), 'n/a'),
         coalesce((select count(*)::text from (select i.* from public.ghg_inventories i limit 1) i,
                   jsonb_object_keys(public.ghg_verifier_projection(i)) k), 'n/a')
  union all
  select 't16_20 the pin trigger refuses moving a link to another inventory, whatever the version',
         'true', (select coalesce(bool_and(prosrc like '%if new.inventory_id is distinct from old.inventory_id then%'
                    and prosrc like '%A verifier link cannot be moved to another inventory.%'
                    and prosrc not like '%or new.inventory_id is distinct from old.inventory_id%'), false)::text
                  from fn where proname = 'verifier_access_pin_version')
)
select check_name, expected, actual, (expected = actual) as pass from checks order by check_name;
