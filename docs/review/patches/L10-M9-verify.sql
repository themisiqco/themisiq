-- docs/review/patches/L10-M9-verify.sql
--
-- ⚠️ NOT RUN. Run AFTER L10-M9-supply-chain-message.sql, in the Supabase SQL editor, the whole file. It changes nothing:
-- the test user, entitlement and registers are created inside one PL/pgSQL block that ends by raising 'm9_undo', and
-- catching it rolls the block back (the L0/L1/L3/L6/M8 pattern).
--
-- WHAT IT PROVES
--   static  B1 the body is the 1 Oct 2026 live body with ONLY the never-bought sentence swapped (full text, both ways)
--           B2 the new sentence appears exactly once, the old one not at all
--           B3 the expired-plan sentence is unchanged
--           B4 plpgsql, SECURITY DEFINER, search_path = public, pg_catalog; the trigger is in place
--   behaviour, as the `authenticated` role with the test user's claims, so the trigger decides:
--     S1  never bought: a register is inserted        refused PT402, the NEW sentence
--     S2  expired: a register is inserted             refused PT402, the expired sentence
--     S3  active: a register is inserted              accepted
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m9_checks (check_name text, expected text, actual text);
truncate m9_checks;

do $s$
declare
  v_expected text := $body$
declare
  has_active      boolean;
  had_entitlement boolean;
begin
  select exists (
    select 1 from public.entitlements e
    where e.user_id = new.user_id
      and e.module_key = 'supply-chain'
      and e.term_end > now()
  ) into has_active;

  if not has_active then
    select exists (
      select 1 from public.entitlements e
      where e.user_id = new.user_id
        and e.module_key = 'supply-chain'
    ) into had_entitlement;

    if had_entitlement then
      raise exception using
        errcode = 'PT402',
        message = 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.';
    else
      raise exception using
        errcode = 'PT402',
        message = 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.';
    end if;
  end if;

  return new;
end;
$body$;
  v_old text := 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.';
  v_new text := 'Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.';
  v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.enforce_supply_chain_entitlement()'::regprocedure;
  insert into m9_checks values
    ('B1 body = live body with only the never-bought sentence swapped', 'true',
     (v_src = replace(v_expected, v_old, v_new) and replace(v_src, v_new, v_old) = v_expected)::text),
    ('B2 new sentence once, old sentence absent', '1|0',
     ((length(v_src) - length(replace(v_src, v_new, ''))) / length(v_new))::text || '|' || (position(v_old in v_src))::text),
    ('B3 expired sentence unchanged', 'true',
     (position('Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.' in v_src) > 0)::text);
end
$s$;

insert into m9_checks select 'B4 plpgsql, security definer, search_path, trigger', 'plpgsql|true|{"search_path=public, pg_catalog"}|true',
  (select l.lanname || '|' || p.prosecdef::text || '|' || p.proconfig::text
     from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.enforce_supply_chain_entitlement()'::regprocedure)
  || '|' || exists (select 1 from pg_trigger t where t.tgrelid = 'public.supply_chain_registers'::regclass
                     and t.tgname = 'trg_enforce_supply_chain_entitlement' and not t.tgisinternal)::text;

do $t$
declare
  u uuid := gen_random_uuid();
  r text[] := array_fill(''::text, array[3]);
begin
  begin
    insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'm9-verify@example.com', now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into public.supply_chain_registers (user_id, name, reporting_year) values (u, 'M9 verify', 2099);
      r[1] := 'accepted';
    exception when others then r[1] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    insert into public.entitlements (user_id, module_key, term_start, term_end)
    values (u, 'supply-chain', now() - interval '2 years', now() - interval '1 day');
    execute 'set local role authenticated';
    begin
      insert into public.supply_chain_registers (user_id, name, reporting_year) values (u, 'M9 verify', 2099);
      r[2] := 'accepted';
    exception when others then r[2] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    update public.entitlements set term_end = now() + interval '1 day' where user_id = u and module_key = 'supply-chain';
    execute 'set local role authenticated';
    begin
      insert into public.supply_chain_registers (user_id, name, reporting_year) values (u, 'M9 verify', 2099);
      r[3] := 'accepted';
    exception when others then r[3] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    raise exception 'm9_undo';
  exception when others then
    if sqlerrm <> 'm9_undo' then raise; end if;
  end;

  insert into m9_checks values
    ('S1 never bought, register insert', 'refused PT402: Saving a register needs the Supply Chain module. Your suppliers are still on screen; choose a plan to keep them.', r[1]),
    ('S2 expired, register insert', 'refused PT402: Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.', r[2]),
    ('S3 active, register insert', 'accepted', r[3]);
end
$t$;

insert into m9_checks select 'nothing left behind', '0',
  (select count(*) from auth.users where email = 'm9-verify@example.com')::text;

select check_name, expected, actual, actual = expected as pass from m9_checks;
