-- docs/review/patches/L10-M8-verify.sql
--
-- ⚠️ RUN 6 Oct 2026 in the Supabase SQL editor (recorded by Lisa), after M8: all 11 checks passed. DO NOT RUN AGAIN as
-- part of the rollout. It is safe to re-run as a check (it undoes itself), but no one needs to repeat it.
-- Run AFTER L10-M8-gate-message.sql, in the Supabase SQL editor, the whole file. It changes nothing: the
-- test user, entitlement, company and inventories are created inside one PL/pgSQL block that ends by raising
-- 'm8_undo', and catching it rolls the block back (the L0/L1/L3/L6 pattern). Results are carried out in variables.
--
-- WHAT IT PROVES
--   static  B1 the body is the L1-M2 body with ONLY the PT402 sentence swapped (compared in full, both directions)
--           B2 the new sentence appears exactly once, the old one not at all
--           B3 the PT410 and documents sentences are unchanged
--           B4 plpgsql, SECURITY DEFINER, search_path = public, pg_catalog; the trigger is in place
--   behaviour, as the `authenticated` role with the test user's claims, so the trigger decides:
--     G1  never bought: a non-free inventory is inserted                     refused PT402, the NEW sentence
--     G2  never bought: a free calculation is inserted                       accepted
--     G3  never bought: the free calculation is given a source document      refused PT402, documents sentence
--     G4  never bought: the free calculation is turned into a paid one       refused PT402, the NEW sentence
--     G5  expired: a non-free inventory is inserted                          refused PT410, expired sentence
--     G6  active: a non-free inventory is inserted                           accepted
--
-- Output: the house format (check_name, expected, actual, pass), as the LAST statement.

create temp table if not exists m8_checks (check_name text, expected text, actual text);
truncate m8_checks;

do $s$
declare
  v_expected text := $body$
DECLARE
  has_active   boolean;
  had_entitlement boolean;
  old_free     boolean := true;   -- an INSERT has no OLD row; only an UPDATE reads it, below
BEGIN
  -- An ACTIVE GHG pass allows any write, as in FI0.
  -- Absence is the RESTRICTIVE answer: a missing row never grants.
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
      AND e.term_end > now()
  ) INTO has_active;

  IF has_active THEN
    RETURN NEW;
  END IF;

  -- No active plan. The free calculation (free_tier) is the only row that may be written (LEAD1).
  SELECT EXISTS (
    SELECT 1 FROM public.entitlements e
    WHERE e.user_id = NEW.user_id
      AND e.module_key = 'ghg'
  ) INTO had_entitlement;

  -- A real inventory is read-only without a plan, and nothing may turn a row into or out of the free calculation:
  -- refused if the row being updated is not the free one, or the row being written is not free.
  IF TG_OP = 'UPDATE' THEN
    old_free := OLD.free_tier;
  END IF;
  IF NOT old_free OR NOT NEW.free_tier THEN
    IF had_entitlement THEN
      RAISE EXCEPTION 'Your GHG access has expired. Renew to save changes to your inventory.'
        USING ERRCODE = 'PT410';
    ELSE
      RAISE EXCEPTION 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.'
        USING ERRCODE = 'PT402';
    END IF;
  END IF;

  -- The free calculation carries no documents: uploading needs a plan (ENF1 refuses the upload itself).
  IF jsonb_path_exists(coalesce(NEW.locations_data, '[]'::jsonb), '$[*].source_docs[*]') THEN
    RAISE EXCEPTION 'Uploading documents needs an active GHG plan.'
      USING ERRCODE = 'PT402';
  END IF;

  -- One free calculation per account is enforced by ghg_inventories_one_free_per_user (M1).
  RETURN NEW;
END;
$body$;
  v_old text := 'Saving a GHG inventory requires the GHG module. Your work is still on screen. Purchase to save it.';
  v_new text := 'This needs a GHG plan. Your work is still on screen; choose a plan to keep it.';
  v_src text;
begin
  select prosrc into v_src from pg_proc where oid = 'public.enforce_ghg_location_allowance()'::regprocedure;
  insert into m8_checks values
    ('B1 body = L1-M2 body with only the PT402 sentence swapped', 'true',
     (v_src = replace(v_expected, v_old, v_new) and replace(v_src, v_new, v_old) = v_expected)::text),
    ('B2 new sentence once, old sentence absent', '1|0',
     ((length(v_src) - length(replace(v_src, v_new, ''))) / length(v_new))::text || '|' || (position(v_old in v_src))::text),
    ('B3 expired and documents sentences unchanged', 'true',
     (position('Your GHG access has expired. Renew to save changes to your inventory.' in v_src) > 0
      and position('Uploading documents needs an active GHG plan.' in v_src) > 0)::text);
end
$s$;

insert into m8_checks select 'B4 plpgsql, security definer, search_path, trigger', 'plpgsql|true|{"search_path=public, pg_catalog"}|true',
  (select l.lanname || '|' || p.prosecdef::text || '|' || p.proconfig::text
     from pg_proc p join pg_language l on l.oid = p.prolang
    where p.oid = 'public.enforce_ghg_location_allowance()'::regprocedure)
  || '|' || exists (select 1 from pg_trigger t where t.tgrelid = 'public.ghg_inventories'::regclass
                     and t.tgname = 'trg_enforce_ghg_location_allowance' and not t.tgisinternal)::text;

do $t$
declare
  u    uuid := gen_random_uuid();
  v_co uuid;
  v_free uuid;
  v_nodoc jsonb := '[{"id":"l1","name":"Site","source_docs":[]}]';
  v_doc   jsonb := '[{"id":"l1","name":"Site","source_docs":[{"id":"d1","file_name":"bill.pdf","document_type":"utility_electricity","file_path":"x/y.pdf","uploaded_at":"2026-10-06T00:00:00Z"}]}]';
  r text[] := array_fill(''::text, array[6]);
begin
  begin
    insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'm8-verify@example.com', now(), now());
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into public.companies (user_id, name) values (u, 'M8 verify') returning id into v_co;

    -- NEVER BOUGHT
    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data)
      values (u, v_co, 'M8 verify', 2098, v_nodoc);
      r[1] := 'accepted';
    exception when others then r[1] := 'refused ' || sqlstate || ': ' || sqlerrm; end;
    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data, free_tier)
      values (u, v_co, 'M8 verify', 2099, v_nodoc, true) returning id into v_free;
      r[2] := 'accepted';
    exception when others then r[2] := 'refused ' || sqlstate || ': ' || sqlerrm; end;
    begin
      update public.ghg_inventories set locations_data = v_doc where id = v_free;
      r[3] := 'accepted';
    exception when others then r[3] := 'refused ' || sqlstate || ': ' || sqlerrm; end;
    begin
      update public.ghg_inventories set free_tier = false where id = v_free;
      r[4] := 'accepted';
    exception when others then r[4] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    -- EXPIRED, then ACTIVE (entitlements are written as the service role, as the webhook does)
    execute 'reset role';
    insert into public.entitlements (user_id, module_key, term_start, term_end)
    values (u, 'ghg', now() - interval '2 years', now() - interval '1 day');
    execute 'set local role authenticated';
    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data)
      values (u, v_co, 'M8 verify', 2097, v_nodoc);
      r[5] := 'accepted';
    exception when others then r[5] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    update public.entitlements set term_end = now() + interval '1 day' where user_id = u and module_key = 'ghg';
    execute 'set local role authenticated';
    begin
      insert into public.ghg_inventories (user_id, company_id, company_name, reporting_year, locations_data)
      values (u, v_co, 'M8 verify', 2096, v_nodoc);
      r[6] := 'accepted';
    exception when others then r[6] := 'refused ' || sqlstate || ': ' || sqlerrm; end;

    execute 'reset role';
    raise exception 'm8_undo';
  exception when others then
    if sqlerrm <> 'm8_undo' then raise; end if;
  end;

  insert into m8_checks values
    ('G1 never bought, non-free insert', 'refused PT402: This needs a GHG plan. Your work is still on screen; choose a plan to keep it.', r[1]),
    ('G2 never bought, free insert', 'accepted', r[2]),
    ('G3 never bought, document on the free row', 'refused PT402: Uploading documents needs an active GHG plan.', r[3]),
    ('G4 never bought, free turned paid', 'refused PT402: This needs a GHG plan. Your work is still on screen; choose a plan to keep it.', r[4]),
    ('G5 expired, non-free insert', 'refused PT410: Your GHG access has expired. Renew to save changes to your inventory.', r[5]),
    ('G6 active, non-free insert', 'accepted', r[6]);
end
$t$;

insert into m8_checks select 'nothing left behind', '0',
  (select count(*) from auth.users where email = 'm8-verify@example.com')::text;

select check_name, expected, actual, actual = expected as pass from m8_checks;
