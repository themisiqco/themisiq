-- supabase/verify/20261001_fl_entities_and_create_verify_behaviour.sql
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- What fl_set_country_entities and fl_create_report DO. Run AFTER the migration. 13 rows, every one pass = true:
-- 00; A1, A2 (entities set, then set again); C1 to C4 (refusals); D1 to D4 (create, and its three refusals);
-- E1, E2 (everything rolled back). There is no B group.
--
-- IT CHANGES NOTHING. Every call is made inside its own savepoint (a BEGIN ... EXCEPTION block) and rolled back:
-- a failing call by its own error, and any call that succeeds by an error raised on purpose straight after its
-- effect has been read. fl_create_report needs a signed-in user, so the claims of the account in s211_access are
-- set for this transaction only (set_config(..., true)). Only the results survive, in a temporary table.

drop table if exists pg_temp._fl_ent_behaviour;
create temporary table _fl_ent_behaviour (check_name text, expected text, actual text, pass boolean);

do $$
declare
  v_user uuid;
  v_fl uuid;
  v_ent_before jsonb;
  v_rep_before bigint;
  v_err text;
  v_a text; v_b text; v_c text;
  v_id uuid;
begin
  select a.user_id into v_user from public.s211_access a order by a.granted_at, a.user_id limit 1;
  select r.fl_report_id into v_fl from public.s211_reports r where r.fl_report_id is not null order by r.created_at, r.id limit 1;
  if v_user is null or v_fl is null then
    insert into _fl_ent_behaviour values ('00 an account and a linked report to test on', 'found', 'none', false);
    return;
  end if;
  insert into _fl_ent_behaviour values ('00 an account and a linked report to test on', 'found', 'found', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.legal_name), '[]'::jsonb) into v_ent_before from public.fl_report_entities e where e.report_id = v_fl;
  select count(*) into v_rep_before from public.fl_reports;

  -- A: set the UK's entities on the report (adding a test 'uk' row if needed): a subsidiary gives, two are covered.
  v_a := 'not reached'; v_b := 'not reached'; v_c := 'not reached';
  begin
    insert into public.fl_report_countries (report_id, country) values (v_fl, 'uk') on conflict (report_id, country) do nothing;
    perform public.fl_set_country_entities(v_fl, 'uk', ' Verify UK Ltd ', array['Verify UK Ltd', 'Verify Holdings plc']);
    select string_agg(e.legal_name || ':' || array_to_string(e.reporting_in, '+') || ':' || array_to_string(e.giving_in, '+'), ', ' order by e.legal_name)
      into v_a from public.fl_report_entities e where e.report_id = v_fl and e.legal_name like 'Verify %';
    -- B: set again with a different giving entity: the UK moves, nothing is left behind.
    perform public.fl_set_country_entities(v_fl, 'uk', 'Verify Holdings plc', array['Verify Holdings plc']);
    select string_agg(e.legal_name || ':' || array_to_string(e.reporting_in, '+') || ':' || array_to_string(e.giving_in, '+'), ', ' order by e.legal_name)
      into v_b from public.fl_report_entities e where e.report_id = v_fl and e.legal_name like 'Verify %';
    raise exception 'roll back' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then null;
    when others then v_a := 'error ' || sqlstate;
  end;
  insert into _fl_ent_behaviour values
    ('A1 the giving entity and the covered entities are recorded for the UK', 'Verify Holdings plc:uk:, Verify UK Ltd:uk:uk', coalesce(v_a, '(null)'), v_a = 'Verify Holdings plc:uk:, Verify UK Ltd:uk:uk'),
    ('A2 set again: the UK moves to the new giving entity, nothing left behind', 'Verify Holdings plc:uk:uk, Verify UK Ltd::', coalesce(v_b, '(null)'), v_b = 'Verify Holdings plc:uk:uk, Verify UK Ltd::');

  -- C: refused before any write: Canada, a blank giving entity, a repeated name, a country not on the report.
  v_err := 'no error';
  begin perform public.fl_set_country_entities(v_fl, 'canada', 'X', array[]::text[]); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('C1 Canada is refused', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin perform public.fl_set_country_entities(v_fl, 'uk', '  ', array[]::text[]); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('C2 a blank giving entity is refused', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin perform public.fl_set_country_entities(v_fl, 'uk', 'A', array['B', ' B ']); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('C3 a repeated name is refused', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin perform public.fl_set_country_entities(v_fl, 'australia', 'A', array[]::text[]); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('C4 a country not on the report is refused', 'P0002', v_err, v_err = 'P0002');

  -- D: create a UK report as the account: the report and its uk row together, owned by the account.
  begin
    v_id := public.fl_create_report('Verify Report Ltd', 'uk');
    select r.user_id::text || ':' || (select string_agg(k.country, '+') from public.fl_report_countries k where k.report_id = r.id)
      into v_c from public.fl_reports r where r.id = v_id;
    raise exception 'roll back' using errcode = 'P0001';
  exception
    when sqlstate 'P0001' then null;
    when others then v_c := 'error ' || sqlstate;
  end;
  insert into _fl_ent_behaviour values ('D1 a UK report is created with its uk row, owned by the account', v_user::text || ':uk', coalesce(v_c, '(null)'), v_c = v_user::text || ':uk');
  v_err := 'no error';
  begin perform public.fl_create_report('X', 'canada'); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('D2 a Canada report is refused (it starts from s211_reports)', '22023', v_err, v_err = '22023');
  v_err := 'no error';
  begin perform public.fl_create_report('   ', 'uk'); raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('D3 a blank organization name is refused', '22023', v_err, v_err = '22023');
  -- D4: with no signed-in user. The claims are cleared inside this savepoint only; its rollback restores them.
  v_err := 'no error';
  begin
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.fl_create_report('Verify Report Ltd', 'uk');
    raise exception 'unexpected success' using errcode = 'P0001';
  exception when others then if sqlstate <> 'P0001' then v_err := sqlstate; end if; end;
  insert into _fl_ent_behaviour values ('D4 no signed-in user is refused', '42501', v_err, v_err = '42501');

  -- E: everything rolled back.
  insert into _fl_ent_behaviour values
    ('E1 entities as before', 'unchanged',
       case when (select coalesce(jsonb_agg(to_jsonb(e) order by e.legal_name), '[]'::jsonb) from public.fl_report_entities e where e.report_id = v_fl) = v_ent_before then 'unchanged' else 'CHANGED' end,
       (select coalesce(jsonb_agg(to_jsonb(e) order by e.legal_name), '[]'::jsonb) from public.fl_report_entities e where e.report_id = v_fl) = v_ent_before),
    ('E2 reports as before', v_rep_before::text, (select count(*) from public.fl_reports)::text, (select count(*) from public.fl_reports) = v_rep_before);
end
$$;

select check_name, expected, actual, pass from _fl_ent_behaviour order by check_name collate "C";
