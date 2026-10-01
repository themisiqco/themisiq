-- supabase/migrations/20261001_fl_save_canada_section.sql
-- Forced Labour Reporting, Stage C step 4 follow-up: save a Canada section and its shared answers in ONE
-- transaction.
--
-- Run in production on 2026-10-01 (verified). RUN AFTER 20261001_fl_shared_core.sql, which has run.
-- Verified the same day with supabase/verify/20261001_fl_save_canada_section_verify_summary.sql (7 of 7 pass:
-- signature; security invoker, volatile, plpgsql; empty search_path; execute authenticated only; tables
-- qualified; policy counts 4/4/4; S-211 fingerprint e32cffdfb583aec735919346b37b804f) and
-- ..._verify_atomic.sql (10 of 10 pass: the test report found; A1-A3 second write fails, both tables
-- unchanged; B1-B3 first write fails, both unchanged; C1-C3 a good call changes both, rolled back).
-- Do not run it again: its pre-flight refuses.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- RUN THE WHOLE FILE AS ONE. Then, in this order:
--   supabase/verify/20261001_fl_save_canada_section_verify_summary.sql   one row per check, all pass = true
--   supabase/verify/20261001_fl_save_canada_section_verify_atomic.sql    calls the function and shows that a
--                                                                         failure in either write leaves
--                                                                         both tables unchanged; changes nothing
--
-- WHY. The section save (app/api/s211/reports/[id]/sections/[key]/route.ts) wrote fl_answers and then
-- s211_report_sections as two requests. If the first succeeded and the second failed, the route said "could
-- not be saved" while the next read laid the new shared value over the old section, so the change appeared
-- saved. One function call is one transaction: any error undoes every write it made.
--
-- WHAT THE FUNCTION DOES, in order, as the CALLER (security invoker, so RLS decides exactly as it does for
-- the same writes made directly):
--   1. finds the report and its Forced Labour parent (RLS: the caller must be able to read it);
--   2. upserts p_answers (an object: field_key -> value; a JSON null is stored as JSON null) into fl_answers;
--   3. deletes the fl_answers rows named in p_remove;
--   4. upserts the section into s211_report_sections;
--   5. sets s211_reports.updated_at, as the route did.
-- It returns the saved section: { section_key, content, status, updated_at }.
-- The route still decides the status (lib/s211/sectionStatus.ts) and which fields are shared
-- (lib/forcedLabour/canadaAdapter.ts); the table checks still refuse a bad section key, status or field key.
--
-- WHAT IT DOES NOT ADD. Every write it makes, the caller could already make directly: authenticated holds
-- select, insert, update and delete on all three tables, under the same RLS. So calling it through the API
-- with any arguments reaches nothing new.
--
-- GRANTS: execute to authenticated only. Revoked from public, anon and service_role, because Supabase's
-- default privileges grant new functions in public to all three.

begin;

-- ── Pre-flight ─────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.fl_answers') is null or to_regclass('public.s211_report_sections') is null then
    raise exception 'Pre-flight: fl_answers or s211_report_sections does not exist. Run 20261001_fl_shared_core.sql first.';
  end if;
  if to_regprocedure('public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[])') is not null then
    raise exception 'Pre-flight: fl_save_canada_section already exists. This file has run before; do not run it again.';
  end if;
  if not exists (select 1 from pg_constraint where conname = 's211_report_sections_report_section_key'
                   and conrelid = 'public.s211_report_sections'::regclass and contype = 'u') then
    raise exception 'Pre-flight: the unique key on s211_report_sections (report_id, section_key) is missing; the upsert needs it.';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.fl_answers'::regclass and contype = 'p') then
    raise exception 'Pre-flight: fl_answers has no primary key (report_id, field_key); the upsert needs it.';
  end if;
end
$$;

create temporary table _fl_save_policies_before on commit drop as
  select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname = 'public';

-- ── The function ───────────────────────────────────────────────────────────────────────────────────
create function public.fl_save_canada_section(
  p_report_id   uuid,
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
  v_fl  uuid;
  v_now timestamptz := now();
  v_row public.s211_report_sections%rowtype;
begin
  if jsonb_typeof(p_content) is distinct from 'object' or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'fl_save_canada_section: content and answers must be JSON objects' using errcode = '22023';
  end if;

  select r.fl_report_id into v_fl from public.s211_reports r where r.id = p_report_id;
  if not found then
    raise exception 'fl_save_canada_section: report not found' using errcode = 'P0002';
  end if;
  if v_fl is null then
    raise exception 'fl_save_canada_section: the report has no Forced Labour parent' using errcode = '55000';
  end if;

  insert into public.fl_answers (report_id, field_key, value, updated_at)
  select v_fl, a.key, a.value, v_now from jsonb_each(p_answers) as a
  on conflict (report_id, field_key) do update set value = excluded.value, updated_at = excluded.updated_at;

  if coalesce(cardinality(p_remove), 0) > 0 then
    delete from public.fl_answers f where f.report_id = v_fl and f.field_key = any (p_remove);
  end if;

  insert into public.s211_report_sections (report_id, section_key, content, status, updated_at)
  values (p_report_id, p_section_key, p_content, p_status, v_now)
  on conflict (report_id, section_key) do update
    set content = excluded.content, status = excluded.status, updated_at = excluded.updated_at
  returning * into v_row;

  update public.s211_reports r set updated_at = v_now where r.id = p_report_id;

  return jsonb_build_object('section_key', v_row.section_key, 'content', v_row.content,
                            'status', v_row.status, 'updated_at', v_row.updated_at);
end;
$$;

comment on function public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[]) is
  'Saves one Canada (S-211) section and its shared answers in one transaction: upserts p_answers into fl_answers, deletes p_remove, upserts the section, sets s211_reports.updated_at. Security invoker: RLS applies as to the caller. Called by the section save route.';

revoke all on function public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[]) from public;
revoke all on function public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[]) from anon;
revoke all on function public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[]) from service_role;
grant execute on function public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[]) to authenticated;

-- ── Post-flight ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  f oid := 'public.fl_save_canada_section(uuid, text, jsonb, text, jsonb, text[])'::regprocedure;
  bad text;
begin
  -- 1. Security invoker, volatile, plpgsql, empty search_path.
  if exists (select 1 from pg_proc p where p.oid = f and (p.prosecdef or p.provolatile <> 'v'
               or p.proconfig is distinct from array['search_path=""']
               or (select l.lanname from pg_language l where l.oid = p.prolang) <> 'plpgsql')) then
    raise exception 'Post-flight: fl_save_canada_section attributes wrong (want security invoker, volatile, plpgsql, search_path empty)';
  end if;

  -- 2. Execute: authenticated only.
  if not has_function_privilege('authenticated', f, 'execute')
     or has_function_privilege('anon', f, 'execute')
     or has_function_privilege('service_role', f, 'execute')
     or has_function_privilege('public', f, 'execute') then
    raise exception 'Post-flight: execute on fl_save_canada_section must be authenticated only';
  end if;

  -- 3. No policy anywhere in public changed.
  select string_agg(coalesce(b.tablename, a.tablename) || '.' || coalesce(b.policyname, a.policyname), ', ') into bad
  from _fl_save_policies_before b
  full join (select tablename::text as tablename, policyname::text as policyname, cmd, roles::text as roles, qual, with_check
             from pg_policies where schemaname = 'public') a
    on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or a.cmd is distinct from b.cmd or a.roles is distinct from b.roles
     or a.qual is distinct from b.qual or a.with_check is distinct from b.with_check;
  if bad is not null then raise exception 'Post-flight: policies changed: %', bad; end if;
end
$$;

commit;

notify pgrst, 'reload schema';
