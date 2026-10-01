-- supabase/migrations/20261001_fl_shared_core.sql
-- Forced Labour Reporting, Stage C step 2: the shared core that lets one report cover several countries.
--
-- Run in production on 2026-10-01 (verified). Written against db/dumps/schema_public_20261001_1057.sql.
-- Verified the same day with supabase/verify/20261001_fl_shared_core_verify_summary.sql (11 of 11 pass;
-- check 03 actual e32cffdfb583aec735919346b37b804f) and ..._verify_as_account.sql (8 of 8 pass). Lisa
-- confirmed fl_reports and fl_answers with to_regclass. Do not run it again: its pre-flight refuses.
--
-- ⚠️ TYPE-CHECKED ONLY BY RUNNING IN SUPABASE. The offline check (pglast) parses the grammar, not the
-- types. It passed verify_summary.sql while that file concatenated pg_proc.provolatile, a "char" column,
-- without a cast, which Supabase refused on 1 Oct 2026 (42725: operator is not unique: text || "char").
-- Concatenate a "char" catalog column (provolatile, prokind, relkind, polcmd, contype...) only with ::text.
--
-- ⚠️ RUN THE WHOLE FILE AS ONE. It is one transaction: the pre-flight refuses a database that is not the
-- one this was written against, and the post-flight raises (rolling everything back) if any existing
-- policy changed or any policy count moved. Then run supabase/verify/20261001_fl_shared_core_verify.sql,
-- whose queries run as they are, with nothing to uncomment.
--
-- WHAT IT ADDS
--   fl_reports            The neutral parent: one organization, one period, any number of countries.
--   fl_report_entities    The legal entities the report covers, shared by every country. `reporting_in`
--                         says in which countries each one is a reporting entity, because the sets differ
--                         (a Canadian subsidiary under S-211, the UK parent under s.54).
--   fl_report_countries   One row per (report, country): that country's status, its applicability inputs
--                         and its country-only answers. Canada keeps its answers in s211_report_sections
--                         for now (the Canada adapter, Stage C step 4, reads both).
--   fl_answers            Shared answers, one row per (report, field). field_key is a key in
--                         lib/forcedLabour/fieldRegistry.ts, which decides what is shared.
--   fl_can_read(country) / fl_can_write(country)
--                         The access checks. The country parameter is for the future: under the pricing
--                         decision of 1 Oct 2026 (one price, every available country) both check the single
--                         'forced-labour' entitlement, exactly as s211_can_read() / s211_can_write() did.
--                         An unknown country is refused. NULL asks about the module as a whole, which is
--                         what the parent, entity and answer tables need: they are not country-specific.
--   s211_reports.fl_report_id
--                         The Canada report's parent. Nullable until the backfill (step 3) fills it.
--
-- WHAT IT CHANGES
--   s211_can_read() and s211_can_write() keep their signature, SECURITY DEFINER, STABLE, search_path and
--   grants, and become wrappers: fl_can_read('canada') and fl_can_write('canada'). Their logic is the
--   same as before, now written once in fl_can_*. The eight policies on s211_reports and
--   s211_report_sections call them by name and are NOT touched: the post-flight compares each one's
--   command, roles, USING and WITH CHECK with a snapshot taken at the start, and raises on any difference.
--
-- OWNERSHIP
--   Every new policy pairs the access check with the owner condition, auth.uid() wrapped as
--   (select auth.uid()). Child tables check ownership through fl_reports, as s211_report_sections does
--   through s211_reports.
--   ⚠️ s211_reports.fl_report_id IS A COMPOSITE KEY, (fl_report_id, user_id) -> fl_reports (id, user_id).
--   A foreign key is checked without RLS, so a plain fl_report_id key would let a user link their Canada
--   report to a parent they cannot see, if they knew its id. The composite key makes that impossible:
--   the parent must have the same owner. NO ACTION (the default), not RESTRICT, so deleting an account,
--   which cascades to both tables in one statement, is not blocked by the order the cascade runs in.
--
-- GRANTS: revoke all from public, anon and authenticated first, then grant authenticated what the builder
-- uses (select, insert, update, delete) and service_role all, as the s211 tables have. Belt and braces:
-- 20260930_revoke_truncate_trigger_references.sql changed postgres's default privileges, but a table
-- created by another role would still receive Supabase's defaults.
--
-- NOT IN THIS FILE: the backfill (step 3, a separate file), any change to the application.
-- Deploy order: this file can run before the Stage C code ships. The deployed code calls s211_can_read()
-- and s211_can_write(), which keep answering exactly as before.

begin;

-- ── Pre-flight ─────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  found text;
begin
  if to_regclass('public.entitlements') is null then raise exception 'Pre-flight: public.entitlements does not exist.'; end if;
  if to_regclass('public.s211_access') is null then raise exception 'Pre-flight: public.s211_access does not exist.'; end if;
  if to_regclass('public.s211_reports') is null then raise exception 'Pre-flight: public.s211_reports does not exist.'; end if;
  if to_regprocedure('public.s211_can_read()') is null or to_regprocedure('public.s211_can_write()') is null then
    raise exception 'Pre-flight: s211_can_read() or s211_can_write() is missing. Run 20260930_s211_read_write_split.sql first.';
  end if;
  if to_regclass('public.fl_reports') is not null or to_regclass('public.fl_report_entities') is not null
     or to_regclass('public.fl_report_countries') is not null or to_regclass('public.fl_answers') is not null
     or to_regprocedure('public.fl_can_read(text)') is not null or to_regprocedure('public.fl_can_write(text)') is not null then
    raise exception 'Pre-flight: an fl_ table or function already exists. This file has run before; do not run it again.';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 's211_reports' and column_name = 'fl_report_id') then
    raise exception 'Pre-flight: s211_reports.fl_report_id already exists.';
  end if;
  select string_agg(tablename || '.' || policyname || ':' || cmd, ', ' order by tablename, policyname) into found
  from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections');
  if found is distinct from
     's211_report_sections.s211_report_sections_delete:DELETE, s211_report_sections.s211_report_sections_insert:INSERT, '
     's211_report_sections.s211_report_sections_select:SELECT, s211_report_sections.s211_report_sections_update:UPDATE, '
     's211_reports.s211_reports_delete:DELETE, s211_reports.s211_reports_insert:INSERT, '
     's211_reports.s211_reports_select:SELECT, s211_reports.s211_reports_update:UPDATE' then
    raise exception 'Pre-flight: expected the eight S-211 policies of 20260930_s211_read_write_split.sql, found: %', coalesce(found, '(none)');
  end if;
end
$$;

-- Snapshots for the post-flight. Temporary, gone at commit.
create temporary table _fl_policies_before on commit drop as
  select tablename, policyname, cmd, roles::text as roles, qual, with_check
  from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections');
create temporary table _fl_policy_counts_before on commit drop as
  select c.relname::text as tablename, (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as n
  from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind in ('r', 'p');

-- ── Tables ─────────────────────────────────────────────────────────────────────────────────────────
create table public.fl_reports (
  id                 uuid primary key default gen_random_uuid(),
  -- Cascades: a report is the user's own working document and has no reader once the account is gone.
  user_id            uuid not null references auth.users(id) on delete cascade,
  organization_name  text not null check (length(btrim(organization_name)) > 0),
  -- The organization's financial year (or, for Australia, its annual accounting period). Each country
  -- derives its own due date from these. NULL = not given.
  period_start       date,
  period_end         date,
  created_at         timestamptz not null default now(),
  -- Set explicitly by the save path, as s211_reports.updated_at is. No trigger.
  updated_at         timestamptz not null default now(),
  constraint fl_reports_period_order check (period_start is null or period_end is null or period_end > period_start),
  -- The target of s211_reports' composite key: the parent must have the same owner.
  constraint fl_reports_id_user_key unique (id, user_id)
);
create index idx_fl_reports_user on public.fl_reports (user_id);

create table public.fl_report_entities (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.fl_reports(id) on delete cascade,
  legal_name    text not null check (length(btrim(legal_name)) > 0),
  -- The countries in which this entity is a reporting entity. Empty = covered by the report but not
  -- itself reporting anywhere (Australia's "other" entity).
  reporting_in  text[] not null default '{}' check (reporting_in <@ array['canada', 'uk', 'australia']::text[]),
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint fl_report_entities_name_key unique (report_id, legal_name)
);
create index idx_fl_report_entities_report on public.fl_report_entities (report_id);

create table public.fl_report_countries (
  id             uuid primary key default gen_random_uuid(),
  report_id      uuid not null references public.fl_reports(id) on delete cascade,
  -- A closed set, checked. Adding a country needs a migration, which is the intended friction.
  country        text not null check (country in ('canada', 'uk', 'australia')),
  status         text not null default 'draft' check (status in ('draft', 'final')),
  -- That country's applicability inputs, in its own currency and measure. The result is recomputed.
  applicability  jsonb not null default '{}'::jsonb check (jsonb_typeof(applicability) = 'object'),
  -- Country-only answers, by section: { "<section>": { "<field>": value } }.
  content        jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fl_report_countries_report_country_key unique (report_id, country)
);

create table public.fl_answers (
  report_id   uuid not null references public.fl_reports(id) on delete cascade,
  -- A lib/forcedLabour/fieldRegistry.ts key: "<section>.<field>" or "report.<column>".
  field_key   text not null check (field_key ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (report_id, field_key)
);

alter table public.s211_reports add column fl_report_id uuid;
alter table public.s211_reports
  add constraint s211_reports_fl_report_fkey
  foreign key (fl_report_id, user_id) references public.fl_reports (id, user_id);
-- One Canada report per parent.
create unique index uq_s211_reports_fl_report on public.s211_reports (fl_report_id) where fl_report_id is not null;

comment on table public.fl_reports is
  'Forced Labour Reporting: one organization, one period, any number of country reports. Shared answers are in fl_answers; each country''s own in fl_report_countries (Canada''s in s211_report_sections, linked by s211_reports.fl_report_id).';
comment on table public.fl_report_entities is
  'The legal entities a Forced Labour report covers, shared by every country. reporting_in lists the countries in which each is a reporting entity.';
comment on table public.fl_report_countries is
  'One row per (report, country): status, applicability inputs in that law''s own currency and measure, and country-only answers by section.';
comment on table public.fl_answers is
  'Answers shared by more than one country, one row per (report, field). field_key is a key in lib/forcedLabour/fieldRegistry.ts.';
comment on column public.s211_reports.fl_report_id is
  'The Forced Labour parent (fl_reports.id) this Canada report belongs to. Composite key with user_id, so the parent has the same owner. NULL until backfilled.';

-- ── Access checks ──────────────────────────────────────────────────────────────────────────────────
create function public.fl_can_read(p_country text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (p_country is null or p_country = any (array['canada', 'uk', 'australia']))
     and (exists (select 1 from public.s211_access a where a.user_id = (select auth.uid()))
          or exists (select 1 from public.entitlements e
                     where e.user_id = (select auth.uid()) and e.module_key = 'forced-labour'));
$$;

create function public.fl_can_write(p_country text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select (p_country is null or p_country = any (array['canada', 'uk', 'australia']))
     and (exists (select 1 from public.s211_access a where a.user_id = (select auth.uid()))
          or exists (select 1 from public.entitlements e
                     where e.user_id = (select auth.uid()) and e.module_key = 'forced-labour'
                       and e.term_end > now()));
$$;

comment on function public.fl_can_read(text) is
  'True when the caller may read Forced Labour reports for the country (NULL = the module as a whole): a row in s211_access, or a forced-labour entitlement with any term. An unknown country is false. One entitlement covers every country (pricing decision, 1 Oct 2026).';
comment on function public.fl_can_write(text) is
  'True when the caller may create, change or delete Forced Labour reports for the country (NULL = the module as a whole): a row in s211_access, or a forced-labour entitlement whose term has not ended. An unknown country is false.';

revoke all on function public.fl_can_read(text) from public;
revoke all on function public.fl_can_read(text) from anon;
grant execute on function public.fl_can_read(text) to authenticated;
revoke all on function public.fl_can_write(text) from public;
revoke all on function public.fl_can_write(text) from anon;
grant execute on function public.fl_can_write(text) to authenticated;

-- The S-211 checks become wrappers. CREATE OR REPLACE keeps the function's identity, owner and grants;
-- SECURITY DEFINER, STABLE and search_path are restated because a replace resets them to what it says.
create or replace function public.s211_can_read()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.fl_can_read('canada');
$$;

create or replace function public.s211_can_write()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.fl_can_write('canada');
$$;

comment on function public.s211_can_read() is
  'fl_can_read(''canada''): a row in s211_access, or a forced-labour entitlement with any term. Called by the SELECT policies on s211_reports and s211_report_sections, and by /api/s211.';
comment on function public.s211_can_write() is
  'fl_can_write(''canada''): a row in s211_access, or a forced-labour entitlement whose term has not ended. Called by the INSERT, UPDATE and DELETE policies, and by /api/s211.';

-- ── Grants ─────────────────────────────────────────────────────────────────────────────────────────
revoke all on table public.fl_reports, public.fl_report_entities, public.fl_report_countries, public.fl_answers from public;
revoke all on table public.fl_reports, public.fl_report_entities, public.fl_report_countries, public.fl_answers from anon;
revoke all on table public.fl_reports, public.fl_report_entities, public.fl_report_countries, public.fl_answers from authenticated;
grant select, insert, update, delete on table public.fl_reports, public.fl_report_entities, public.fl_report_countries, public.fl_answers to authenticated;
grant all on table public.fl_reports, public.fl_report_entities, public.fl_report_countries, public.fl_answers to service_role;

-- ── RLS ────────────────────────────────────────────────────────────────────────────────────────────
alter table public.fl_reports          enable row level security;
alter table public.fl_report_entities  enable row level security;
alter table public.fl_report_countries enable row level security;
alter table public.fl_answers          enable row level security;

-- fl_reports: the module check (NULL country) and the owner.
create policy fl_reports_select on public.fl_reports
  for select to authenticated
  using ((select public.fl_can_read(null)) and (select auth.uid()) = user_id);
create policy fl_reports_insert on public.fl_reports
  for insert to authenticated
  with check ((select public.fl_can_write(null)) and (select auth.uid()) = user_id);
create policy fl_reports_update on public.fl_reports
  for update to authenticated
  using ((select public.fl_can_write(null)) and (select auth.uid()) = user_id)
  with check ((select public.fl_can_write(null)) and (select auth.uid()) = user_id);
create policy fl_reports_delete on public.fl_reports
  for delete to authenticated
  using ((select public.fl_can_write(null)) and (select auth.uid()) = user_id);

-- fl_report_entities: the module check, ownership through the parent.
create policy fl_report_entities_select on public.fl_report_entities
  for select to authenticated
  using ((select public.fl_can_read(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_entities.report_id and r.user_id = (select auth.uid())));
create policy fl_report_entities_insert on public.fl_report_entities
  for insert to authenticated
  with check ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_entities.report_id and r.user_id = (select auth.uid())));
create policy fl_report_entities_update on public.fl_report_entities
  for update to authenticated
  using ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_entities.report_id and r.user_id = (select auth.uid())))
  with check ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_entities.report_id and r.user_id = (select auth.uid())));
create policy fl_report_entities_delete on public.fl_report_entities
  for delete to authenticated
  using ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_entities.report_id and r.user_id = (select auth.uid())));

-- fl_report_countries: the check for the row's own country, ownership through the parent. The country
-- argument is the row's column, so this check is evaluated per row (at most three per report), not
-- hoisted; auth.uid() inside fl_can_* is wrapped and is evaluated once.
create policy fl_report_countries_select on public.fl_report_countries
  for select to authenticated
  using (public.fl_can_read(country) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_countries.report_id and r.user_id = (select auth.uid())));
create policy fl_report_countries_insert on public.fl_report_countries
  for insert to authenticated
  with check (public.fl_can_write(country) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_countries.report_id and r.user_id = (select auth.uid())));
create policy fl_report_countries_update on public.fl_report_countries
  for update to authenticated
  using (public.fl_can_write(country) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_countries.report_id and r.user_id = (select auth.uid())))
  with check (public.fl_can_write(country) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_countries.report_id and r.user_id = (select auth.uid())));
create policy fl_report_countries_delete on public.fl_report_countries
  for delete to authenticated
  using (public.fl_can_write(country) and exists (
    select 1 from public.fl_reports r where r.id = fl_report_countries.report_id and r.user_id = (select auth.uid())));

-- fl_answers: the module check, ownership through the parent.
create policy fl_answers_select on public.fl_answers
  for select to authenticated
  using ((select public.fl_can_read(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_answers.report_id and r.user_id = (select auth.uid())));
create policy fl_answers_insert on public.fl_answers
  for insert to authenticated
  with check ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_answers.report_id and r.user_id = (select auth.uid())));
create policy fl_answers_update on public.fl_answers
  for update to authenticated
  using ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_answers.report_id and r.user_id = (select auth.uid())))
  with check ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_answers.report_id and r.user_id = (select auth.uid())));
create policy fl_answers_delete on public.fl_answers
  for delete to authenticated
  using ((select public.fl_can_write(null)) and exists (
    select 1 from public.fl_reports r where r.id = fl_answers.report_id and r.user_id = (select auth.uid())));

-- ── Post-flight ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  bad text;
  n int;
begin
  -- 1. The eight S-211 policies are byte-identical to the snapshot.
  select string_agg(coalesce(b.policyname, a.policyname), ', ') into bad
  from _fl_policies_before b
  full join (select tablename, policyname, cmd, roles::text as roles, qual, with_check
             from pg_policies where schemaname = 'public' and tablename in ('s211_reports', 's211_report_sections')) a
    on a.tablename = b.tablename and a.policyname = b.policyname
  where a.policyname is null or b.policyname is null
     or a.cmd is distinct from b.cmd or a.roles is distinct from b.roles
     or a.qual is distinct from b.qual or a.with_check is distinct from b.with_check;
  if bad is not null then raise exception 'Post-flight: S-211 policies changed: %', bad; end if;

  -- 2. Every table that existed before has the same number of policies.
  select string_agg(b.tablename || ' ' || b.n || '->' || coalesce(a.n, -1), ', ') into bad
  from _fl_policy_counts_before b
  left join (select tablename::text as tablename, count(*) as n from pg_policies where schemaname = 'public' group by tablename) a
    on a.tablename = b.tablename
  where coalesce(a.n, 0) <> b.n;
  if bad is not null then raise exception 'Post-flight: policy counts changed on existing tables: %', bad; end if;

  -- 3. Each new table: RLS on, exactly four policies, one per command.
  select string_agg(t, ', ') into bad
  from unnest(array['fl_reports', 'fl_report_entities', 'fl_report_countries', 'fl_answers']) as t
  where not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass)
     or (select string_agg(cmd, ',' order by cmd) from pg_policies where schemaname = 'public' and tablename = t)
        is distinct from 'DELETE,INSERT,SELECT,UPDATE';
  if bad is not null then raise exception 'Post-flight: RLS or policies wrong on: %', bad; end if;

  -- 4. No bare auth.uid() in the new policies (the CLAUDE.md count, narrowed to them).
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename like 'fl\_%'
    and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
          '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)';
  if n <> 0 then raise exception 'Post-flight: % new policies carry a bare auth.uid()', n; end if;

  -- 5. The four functions: security definer, empty search_path, stable; the wrappers call fl_can_*.
  select string_agg(p.oid::regprocedure::text, ', ') into bad
  from pg_proc p
  where p.oid in ('public.fl_can_read(text)'::regprocedure, 'public.fl_can_write(text)'::regprocedure,
                  'public.s211_can_read()'::regprocedure, 'public.s211_can_write()'::regprocedure)
    and not (p.prosecdef and p.provolatile = 's' and p.proconfig = array['search_path=""']);
  if bad is not null then raise exception 'Post-flight: function attributes wrong on: %', bad; end if;
  if pg_get_functiondef('public.s211_can_read()'::regprocedure) !~ 'fl_can_read\(''canada''\)'
     or pg_get_functiondef('public.s211_can_write()'::regprocedure) !~ 'fl_can_write\(''canada''\)' then
    raise exception 'Post-flight: s211_can_read/s211_can_write do not wrap fl_can_read/fl_can_write(''canada'')';
  end if;

  -- 6. Grants: anon nothing; authenticated exactly select, insert, update, delete.
  select string_agg(t || ':' || r, ', ') into bad
  from unnest(array['fl_reports', 'fl_report_entities', 'fl_report_countries', 'fl_answers']) as t,
       unnest(array['anon', 'authenticated']) as r
  where (r = 'anon' and (has_table_privilege(r, 'public.' || t, 'SELECT') or has_table_privilege(r, 'public.' || t, 'INSERT')
                         or has_table_privilege(r, 'public.' || t, 'UPDATE') or has_table_privilege(r, 'public.' || t, 'DELETE')))
     or (r = 'authenticated' and not (has_table_privilege(r, 'public.' || t, 'SELECT') and has_table_privilege(r, 'public.' || t, 'INSERT')
                                      and has_table_privilege(r, 'public.' || t, 'UPDATE') and has_table_privilege(r, 'public.' || t, 'DELETE')))
     or has_table_privilege(r, 'public.' || t, 'TRUNCATE') or has_table_privilege(r, 'public.' || t, 'REFERENCES')
     or has_table_privilege(r, 'public.' || t, 'TRIGGER') or has_table_privilege(r, 'public.' || t, 'MAINTAIN');
  if bad is not null then raise exception 'Post-flight: grants wrong: %', bad; end if;
  if has_function_privilege('anon', 'public.fl_can_read(text)', 'execute')
     or has_function_privilege('anon', 'public.fl_can_write(text)', 'execute') then
    raise exception 'Post-flight: anon may execute fl_can_read or fl_can_write';
  end if;
end
$$;

commit;

notify pgrst, 'reload schema';
