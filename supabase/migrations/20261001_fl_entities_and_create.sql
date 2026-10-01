-- supabase/migrations/20261001_fl_entities_and_create.sql
-- Forced Labour Reporting, Stage D1b: per-country reporting entities, and starting a report from any country.
--
-- Run in production on 2026-10-01 (verified). RUN AFTER 20261001_fl_save_country_section.sql, which has run.
-- Verified the same day with supabase/verify/20261001_fl_entities_and_create_verify_summary.sql (8 of 8 pass on the
-- re-run, after check 04 was corrected to skip string literals: the first run reported "unqualified 1" for the words
-- "from s211_reports" inside an error message, a false positive) and ..._verify_behaviour.sql (13 of 13 pass: 00
-- found; A1, A2 entities set and reset; C1-C4 refusals; D1 a UK report created as Lisa's account; D2 Canada
-- refused; D3 blank name refused; D4 no user refused; E1, E2 unchanged). On localhost the same day: Canada Training
-- showed Canada's own wording and the UK kept its own; UK Risk showed "Started from your Canada answer" drafts,
-- cleared by editing or "It covers"; a UK giving organisation and group statement saved with Canada section 1
-- unchanged; a UK-only report was created; /forced-labour listed Canada only.
-- Do not run it again: its pre-flight refuses.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- RUN THE WHOLE FILE AS ONE. Then, in this order:
--   supabase/verify/20261001_fl_entities_and_create_verify_summary.sql   one row per check, all pass = true
--   supabase/verify/20261001_fl_entities_and_create_verify_behaviour.sql  calls both functions as you, and
--                                                                          rolls every call back; changes nothing
--
-- WHAT IT ADDS
--   fl_report_entities.giving_in   text[]: the countries whose report or statement this entity GIVES (approves
--     and signs). reporting_in already says which countries' reports cover it. A UK subsidiary can give the UK
--     statement while a Canadian parent gives the Canada report, on one report. Checked: a subset of the known
--     countries, and of the entity's own reporting_in. Canada keeps its own entities in its section 1 for now,
--     so its report and PDF are unchanged; these columns are for the other countries.
--   public.fl_set_country_entities(p_report_id, p_country, p_giving, p_covered)
--     As the CALLER (security invoker), in one transaction, for a country other than Canada that is on the report:
--       1. takes p_country out of every entity's reporting_in and giving_in on the report;
--       2. adds any name not yet an entity of the report;
--       3. puts p_country in reporting_in for p_giving and every name in p_covered, and in giving_in for p_giving.
--     Names are trimmed; blank and repeated names are refused. Returns { giving, covered }.
--   public.fl_create_report(p_organization_name, p_country)
--     As the CALLER: creates a report (fl_reports, owned by the caller) and its first country row together, for a
--     country other than Canada (Canada's reports start from s211_reports, as before). Returns the report id. This
--     is what lets a report start from the UK, with no Canada report behind it.
--   Both: security invoker, empty search_path, schema-qualified, no exception handler, execute for authenticated
--   only. RLS decides as for the same writes made directly; neither reaches anything the caller could not write.

begin;

-- ── Pre-flight ─────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.fl_report_entities') is null or to_regclass('public.fl_report_countries') is null then
    raise exception 'Pre-flight: fl_report_entities or fl_report_countries does not exist. Run 20261001_fl_shared_core.sql first.';
  end if;
  if to_regprocedure('public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[])') is null then
    raise exception 'Pre-flight: fl_save_country_section does not exist. Run 20261001_fl_save_country_section.sql first.';
  end if;
  if to_regprocedure('public.fl_set_country_entities(uuid, text, text, text[])') is not null
     or to_regprocedure('public.fl_create_report(text, text)') is not null
     or exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'fl_report_entities' and column_name = 'giving_in') then
    raise exception 'Pre-flight: this file has run before; do not run it again.';
  end if;
end
$$;

create temporary table _fl_ent_policies_before on commit drop as
  select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname = 'public';
create temporary table _fl_ent_counts_before on commit drop as
  select (select count(*) from public.fl_report_entities) as entities, (select count(*) from public.fl_reports) as reports,
         (select count(*) from public.fl_report_countries) as countries;

-- ── The column ─────────────────────────────────────────────────────────────────────────────────────
alter table public.fl_report_entities
  add column giving_in text[] not null default '{}'
  constraint fl_report_entities_giving_in_check check (giving_in <@ array['canada', 'uk', 'australia']::text[] and giving_in <@ reporting_in);
comment on column public.fl_report_entities.giving_in is
  'The countries whose report or statement this entity gives (approves and signs). A subset of reporting_in.';

-- ── fl_set_country_entities ────────────────────────────────────────────────────────────────────────
create function public.fl_set_country_entities(
  p_report_id uuid,
  p_country   text,
  p_giving    text,
  p_covered   text[]
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_giving text := btrim(coalesce(p_giving, ''));
  v_names  text[];
  v_start  integer;
begin
  if p_country is null or p_country = 'canada' then
    raise exception 'fl_set_country_entities: Canada keeps its entities in its own section 1' using errcode = '22023';
  end if;
  if v_giving = '' then
    raise exception 'fl_set_country_entities: name the entity giving the statement' using errcode = '22023';
  end if;
  select coalesce(array_agg(n order by o), array[]::text[]) into v_names
  from (select btrim(x) as n, min(o) as o from unnest(coalesce(p_covered, array[]::text[]) || array[v_giving]) with ordinality as u(x, o) group by btrim(x)) d;
  if exists (select 1 from unnest(v_names) as n where n = '') then
    raise exception 'fl_set_country_entities: a blank name' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_covered, array[]::text[])) as x group by btrim(x) having count(*) > 1) then
    raise exception 'fl_set_country_entities: a name is repeated' using errcode = '22023';
  end if;
  if not exists (select 1 from public.fl_report_countries k where k.report_id = p_report_id and k.country = p_country) then
    raise exception 'fl_set_country_entities: the report has no % row', p_country using errcode = 'P0002';
  end if;

  update public.fl_report_entities e
     set giving_in = array_remove(e.giving_in, p_country), reporting_in = array_remove(e.reporting_in, p_country), updated_at = now()
   where e.report_id = p_report_id and (p_country = any (e.reporting_in) or p_country = any (e.giving_in));

  select coalesce(max(e.position) + 1, 0) into v_start from public.fl_report_entities e where e.report_id = p_report_id;
  insert into public.fl_report_entities (report_id, legal_name, position)
  select p_report_id, n, v_start + (o - 1)::integer from unnest(v_names) with ordinality as u(n, o)
  on conflict (report_id, legal_name) do nothing;

  update public.fl_report_entities e
     set reporting_in = array_append(e.reporting_in, p_country), updated_at = now()
   where e.report_id = p_report_id and e.legal_name = any (v_names);
  update public.fl_report_entities e
     set giving_in = array_append(e.giving_in, p_country)
   where e.report_id = p_report_id and e.legal_name = v_giving;

  return jsonb_build_object('giving', v_giving, 'covered', to_jsonb(v_names));
end;
$$;

-- ── fl_create_report ───────────────────────────────────────────────────────────────────────────────
create function public.fl_create_report(
  p_organization_name text,
  p_country           text
)
returns uuid
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_organization_name, ''));
  v_id   uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'fl_create_report: not signed in' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'fl_create_report: name the organization' using errcode = '22023';
  end if;
  if p_country is null or p_country = 'canada' then
    raise exception 'fl_create_report: a Canada report starts from s211_reports' using errcode = '22023';
  end if;
  insert into public.fl_reports (user_id, organization_name) values ((select auth.uid()), left(v_name, 300)) returning id into v_id;
  insert into public.fl_report_countries (report_id, country) values (v_id, p_country);
  return v_id;
end;
$$;

comment on function public.fl_set_country_entities(uuid, text, text, text[]) is
  'Sets which entities a country''s statement covers and which gives it, in one transaction (fl_report_entities.reporting_in and giving_in). Not Canada. Security invoker.';
comment on function public.fl_create_report(text, text) is
  'Creates a report and its first country row in one transaction, owned by the caller. Not Canada (s211_reports). Security invoker.';

revoke all on function public.fl_set_country_entities(uuid, text, text, text[]) from public;
revoke all on function public.fl_set_country_entities(uuid, text, text, text[]) from anon;
revoke all on function public.fl_set_country_entities(uuid, text, text, text[]) from service_role;
grant execute on function public.fl_set_country_entities(uuid, text, text, text[]) to authenticated;
revoke all on function public.fl_create_report(text, text) from public;
revoke all on function public.fl_create_report(text, text) from anon;
revoke all on function public.fl_create_report(text, text) from service_role;
grant execute on function public.fl_create_report(text, text) to authenticated;

-- ── Post-flight ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  bad text;
  c record;
begin
  -- 1. Both functions: security invoker, volatile, plpgsql, empty search_path; execute authenticated only.
  select string_agg(p.proname::text, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('fl_set_country_entities', 'fl_create_report')
    and (p.prosecdef or p.provolatile <> 'v' or p.proconfig is distinct from array['search_path=""']
         or (select l.lanname from pg_language l where l.oid = p.prolang) <> 'plpgsql'
         or not has_function_privilege('authenticated', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute')
         or has_function_privilege('public', p.oid, 'execute'));
  if bad is not null then raise exception 'Post-flight: attributes or grants wrong on: %', bad; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('fl_set_country_entities', 'fl_create_report')) <> 2 then
    raise exception 'Post-flight: expected the two functions, once each';
  end if;

  -- 2. No policy anywhere in public changed.
  select string_agg(coalesce(b.tablename, a.tablename) || '.' || coalesce(b.policyname, a.policyname), ', ') into bad
  from _fl_ent_policies_before b
  full join (select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
             from pg_policies where schemaname = 'public') a
    on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or a.cmd is distinct from b.cmd or a.roles is distinct from b.roles
     or a.qual is distinct from b.qual or a.with_check is distinct from b.with_check;
  if bad is not null then raise exception 'Post-flight: policies changed: %', bad; end if;

  -- 3. No row added or removed anywhere this file touches; every existing entity has an empty giving_in.
  select * into c from _fl_ent_counts_before;
  if (select count(*) from public.fl_report_entities) <> c.entities or (select count(*) from public.fl_reports) <> c.reports
     or (select count(*) from public.fl_report_countries) <> c.countries then
    raise exception 'Post-flight: row counts changed';
  end if;
  if exists (select 1 from public.fl_report_entities where giving_in <> '{}') then
    raise exception 'Post-flight: an existing entity has a non-empty giving_in';
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';
