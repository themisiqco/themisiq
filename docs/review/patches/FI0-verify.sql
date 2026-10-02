-- docs/review/patches/FI0-verify.sql
--
-- ⚠️ NOT RUN. Run AFTER FI0-entitlement-gate-only.sql. It changes nothing: every write is inside a transaction
-- that is rolled back (see below), and each attempted write is inside its own sub-block, so a refused write is
-- caught and recorded rather than aborting the script.
--
-- WHAT IT PROVES (the FI0 tests that need the database; there is no local Postgres server to run them elsewhere):
--   1. The function body no longer reads location_allowance and carries no em dash.
--   2. A 25-location inventory SAVES for a user with an active GHG pass.
--   3. The same save is REFUSED once that pass has expired ("Your GHG access has expired ...").
--   4. The same save is REFUSED for a user with no GHG row ("Saving a GHG inventory requires the GHG module ...").
--
-- HOW. It uses the first user who holds an active GHG pass AND owns at least one inventory (today: the developer
-- test account, per 20260928_concierge_source_model.sql). The save is an UPDATE of that inventory's
-- locations_data to 25 locations, because the trigger fires on UPDATE and an UPDATE needs no knowledge of the
-- table's other required columns. Cases 3 and 4 change that user's entitlement inside the transaction, then
-- roll it back. If no such user exists, cases 2 to 4 report 'skipped' and fail, which is the honest answer.
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement, because the Supabase SQL
-- editor shows only the last result. So the writes cannot be undone by a closing ROLLBACK. Instead every write
-- happens inside one PL/pgSQL block that ends by raising 'fi0_undo'. Catching it rolls the block back to its
-- savepoint, which undoes the entitlement changes, the inventory updates and the audit_log rows they triggered.
-- Results are carried out of the block in a variable, not a table, so the rollback does not take them too.

create temp table if not exists fi0_checks (check_name text, expected text, actual text);
truncate fi0_checks;

-- 1. The body
insert into fi0_checks
select 'body does not read location_allowance', 'false',
       (position('location_allowance' in pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure)) > 0)::text;
insert into fi0_checks
select 'body has no em dash', 'false',
       (position(E'\u2014' in pg_get_functiondef('public.enforce_ghg_location_allowance()'::regprocedure)) > 0)::text;

do $t$
declare
  v_user uuid;
  v_inv  uuid;
  v_locs jsonb := (select jsonb_agg(jsonb_build_object('id', 'fi0_loc_' || g, 'name', 'Location ' || g))
                   from generate_series(1, 25) g);
  v_msg  text;
  r2 text; r3 text; r4 text;
begin
  select i.user_id, i.id into v_user, v_inv
  from public.ghg_inventories i
  join public.entitlements e on e.user_id = i.user_id and e.module_key = 'ghg' and e.term_end > now()
  limit 1;

  if v_user is null then
    insert into fi0_checks values
      ('25 locations save with an active pass', 'saved', 'skipped: no user with an active pass and an inventory'),
      ('refused when the pass has expired', 'expired message', 'skipped'),
      ('refused with no GHG row', 'module message', 'skipped');
    return;
  end if;

  begin
    -- 2. Active pass: 25 locations save
    begin
      update public.ghg_inventories set locations_data = v_locs where id = v_inv;
      r2 := 'saved';
    exception when others then
      r2 := 'refused: ' || sqlerrm;
    end;

    -- 3. Expired pass: refused
    update public.entitlements set term_end = now() - interval '1 day' where user_id = v_user and module_key = 'ghg';
    begin
      update public.ghg_inventories set locations_data = v_locs where id = v_inv;
      r3 := 'saved';
    exception when others then
      v_msg := sqlerrm;
      r3 := case when v_msg = 'Your GHG access has expired. Renew to save changes to your inventory.'
                 then 'expired message' else v_msg end;
    end;

    -- 4. No GHG row at all: refused
    delete from public.entitlements where user_id = v_user and module_key = 'ghg';
    begin
      update public.ghg_inventories set locations_data = v_locs where id = v_inv;
      r4 := 'saved';
    exception when others then
      v_msg := sqlerrm;
      r4 := case when v_msg = 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'
                 then 'module message' else v_msg end;
    end;

    raise exception 'fi0_undo';
  exception when others then
    if sqlerrm <> 'fi0_undo' then
      raise;
    end if;
  end;

  insert into fi0_checks values
    ('25 locations save with an active pass', 'saved', r2),
    ('refused when the pass has expired', 'expired message', r3),
    ('refused with no GHG row', 'module message', r4);
end
$t$;

-- Everything above the results is undone. This confirms it: the user's pass is still active.
insert into fi0_checks
select 'test user''s GHG pass unchanged after the run', 'true',
       (exists (select 1 from public.entitlements e join public.ghg_inventories i on i.user_id = e.user_id
                where e.module_key = 'ghg' and e.term_end > now()))::text;

select check_name, expected, actual, actual = expected as pass from fi0_checks;
