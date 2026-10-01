-- supabase/migrations/20261001_fl_save_country_section.sql
-- Forced Labour Reporting, Stage D1: save a non-Canada country's section (the UK first) and its shared answers
-- in ONE transaction, on the pattern of 20261001_fl_save_canada_section.sql.
--
-- Run in production on 2026-10-01 (verified). RUN AFTER 20261001_fl_shared_core.sql and
-- 20261001_fl_save_canada_section.sql, which have run.
-- Verified the same day with supabase/verify/20261001_fl_save_country_section_verify_summary.sql (9 of 9 pass:
-- signature; security invoker, volatile, plpgsql; empty search_path; execute authenticated only; tables
-- qualified; section_status jsonb, not null, default {}; existing rows empty; policy counts 4/4/4; S-211
-- fingerprint e32cffdfb583aec735919346b37b804f) and ..._verify_atomic.sql (14 of 14 pass: the test report found;
-- A1-A3, B1-B3, C1-C4, D1-D3). On localhost the same day: the overview showed the Canada card, Add a country and
-- shared answers; the UK was added with its sections badged Shared; a UK change to Training showed in Canada;
-- Steps taken "no steps" was marked complete; an old /training address redirected to /canada/training.
-- Do not run it again: its pre-flight refuses.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- RUN THE WHOLE FILE AS ONE. Then, in this order:
--   supabase/verify/20261001_fl_save_country_section_verify_summary.sql   one row per check, all pass = true
--   supabase/verify/20261001_fl_save_country_section_verify_atomic.sql    a failure in either write leaves both
--                                                                          tables unchanged; changes nothing
--
-- WHAT IT ADDS
--   fl_report_countries.section_status   jsonb, { "<section>": "not_started" | "in_progress" | "complete" }.
--     A country's sections keep their answers in content (by section) and their status here, as Canada's
--     keep both in s211_report_sections. Default '{}', so the existing rows (Canada's) are unchanged in
--     meaning: Canada's statuses stay in s211_report_sections.
--   public.fl_save_country_section(p_report_id, p_country, p_section_key, p_content, p_status, p_answers, p_remove)
--     As the CALLER (security invoker, so RLS decides exactly as for direct writes), in one transaction:
--       1. upserts p_answers (field_key -> value) into fl_answers for the parent report p_report_id;
--       2. deletes the fl_answers rows named in p_remove;
--       3. sets content[p_section_key] and section_status[p_section_key] on the report's p_country row,
--          and its updated_at; raises if the report has no row for that country (or RLS hides it);
--       4. sets fl_reports.updated_at.
--     Returns { section_key, content, status, updated_at }. No exception handler: any error undoes it all.
--     It refuses 'canada' (Canada's sections are s211_report_sections, saved by fl_save_canada_section), a
--     malformed section key and an unknown status, before writing anything.
--
-- WHAT IT DOES NOT ADD. Every write it makes, the caller could already make directly: authenticated holds
-- select, insert, update and delete on fl_answers and fl_report_countries and update on fl_reports, under
-- the same RLS. Execute: authenticated only (Supabase grants new functions to anon and service_role too).

begin;

-- ── Pre-flight ─────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.fl_report_countries') is null or to_regclass('public.fl_answers') is null then
    raise exception 'Pre-flight: fl_report_countries or fl_answers does not exist. Run 20261001_fl_shared_core.sql first.';
  end if;
  if to_regprocedure('public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[])') is null then
    raise exception 'Pre-flight: fl_save_canada_section does not exist. Run 20261001_fl_save_canada_section.sql first.';
  end if;
  if to_regprocedure('public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[])') is not null
     or exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'fl_report_countries' and column_name = 'section_status') then
    raise exception 'Pre-flight: fl_save_country_section or fl_report_countries.section_status already exists. This file has run before; do not run it again.';
  end if;
end
$$;

create temporary table _fl_country_policies_before on commit drop as
  select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname = 'public';
create temporary table _fl_country_rows_before on commit drop as
  select id, md5(to_jsonb(k)::text) as fingerprint from public.fl_report_countries k;

-- ── The column ─────────────────────────────────────────────────────────────────────────────────────
alter table public.fl_report_countries
  add column section_status jsonb not null default '{}'::jsonb
  constraint fl_report_countries_section_status_check check (jsonb_typeof(section_status) = 'object');
comment on column public.fl_report_countries.section_status is
  'Each section''s status for this country: { "<section>": "not_started" | "in_progress" | "complete" }. Canada''s are in s211_report_sections instead.';

-- ── The function ───────────────────────────────────────────────────────────────────────────────────
create function public.fl_save_country_section(
  p_report_id   uuid,
  p_country     text,
  p_section_key text,
  p_content     jsonb,
  p_status      text,
  p_answers     jsonb,
  p_remove      text[]
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.fl_report_countries%rowtype;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'fl_save_country_section: content and answers must be JSON objects' using errcode = '22023';
  end if;
  if p_country is null or p_country = 'canada' then
    raise exception 'fl_save_country_section: Canada''s sections are saved by fl_save_canada_section' using errcode = '22023';
  end if;
  if p_section_key is null or p_section_key !~ '^[a-z0-9_]+$' then
    raise exception 'fl_save_country_section: malformed section key' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('not_started', 'in_progress', 'complete') then
    raise exception 'fl_save_country_section: unknown status' using errcode = '22023';
  end if;

  insert into public.fl_answers (report_id, field_key, value, updated_at)
  select p_report_id, a.key, a.value, v_now from jsonb_each(p_answers) as a
  on conflict (report_id, field_key) do update set value = excluded.value, updated_at = excluded.updated_at;

  if coalesce(cardinality(p_remove), 0) > 0 then
    delete from public.fl_answers f where f.report_id = p_report_id and f.field_key = any (p_remove);
  end if;

  update public.fl_report_countries k
     set content = jsonb_set(k.content, array[p_section_key], p_content, true),
         section_status = jsonb_set(k.section_status, array[p_section_key], to_jsonb(p_status), true),
         updated_at = v_now
   where k.report_id = p_report_id and k.country = p_country
  returning * into v_row;
  if not found then
    raise exception 'fl_save_country_section: the report has no % row' , p_country using errcode = 'P0002';
  end if;

  update public.fl_reports r set updated_at = v_now where r.id = p_report_id;

  return jsonb_build_object('section_key', p_section_key, 'content', v_row.content -> p_section_key,
                            'status', v_row.section_status ->> p_section_key, 'updated_at', v_row.updated_at);
end;
$$;

comment on function public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[]) is
  'Saves one section of a non-Canada country (the UK first) and its shared answers in one transaction: upserts p_answers into fl_answers, deletes p_remove, sets content and section_status for p_section_key on the country row, sets fl_reports.updated_at. Security invoker: RLS applies as to the caller.';

revoke all on function public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[]) from public;
revoke all on function public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[]) from anon;
revoke all on function public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[]) from service_role;
grant execute on function public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[]) to authenticated;

-- ── Post-flight ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  f oid := 'public.fl_save_country_section(uuid, text, text, jsonb, text, jsonb, text[])'::regprocedure;
  bad text;
  n int;
begin
  -- 1. Security invoker, volatile, plpgsql, empty search_path.
  if exists (select 1 from pg_proc p where p.oid = f and (p.prosecdef or p.provolatile <> 'v'
               or p.proconfig is distinct from array['search_path=""']
               or (select l.lanname from pg_language l where l.oid = p.prolang) <> 'plpgsql')) then
    raise exception 'Post-flight: fl_save_country_section attributes wrong (want security invoker, volatile, plpgsql, search_path empty)';
  end if;

  -- 2. Execute: authenticated only.
  if not has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('anon', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('public', f, 'execute') then
    raise exception 'Post-flight: execute on fl_save_country_section must be authenticated only';
  end if;

  -- 3. No policy anywhere in public changed.
  select string_agg(coalesce(b.tablename, a.tablename) || '.' || coalesce(b.policyname, a.policyname), ', ') into bad
  from _fl_country_policies_before b
  full join (select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
             from pg_policies where schemaname = 'public') a
    on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or a.cmd is distinct from b.cmd or a.roles is distinct from b.roles
     or a.qual is distinct from b.qual or a.with_check is distinct from b.with_check;
  if bad is not null then raise exception 'Post-flight: policies changed: %', bad; end if;

  -- 4. Every existing country row is unchanged but for the new, empty section_status.
  select count(*) into n
  from _fl_country_rows_before b full join public.fl_report_countries k on k.id = b.id
  where b.id is null or k.id is null
     or k.section_status <> '{}'::jsonb
     or md5((to_jsonb(k) - 'section_status')::text) <> b.fingerprint;
  if n <> 0 then raise exception 'Post-flight: % fl_report_countries row(s) changed beyond the new empty section_status', n; end if;
end
$$;

commit;

notify pgrst, 'reload schema';
