-- supabase/migrations/20260930_s211_reports.sql
-- Canada S-211 module, Stage 1: the module's first table. One row per report a user is preparing under
-- the Fighting Against Forced Labour and Child Labour in Supply Chains Act, holding what the entity
-- test in lib/s211/entity.ts reads.
--
-- Run in production on 2026-09-30 (verified; authenticated grants tightened).
-- Nothing in the application reads or writes this table yet.
--
-- ⚠️ THE GRANTS AS FIRST WRITTEN WERE NOT ENOUGH, AND VERIFICATION QUERY 4 IS WHAT FOUND IT. Supabase's
-- default privileges hand a new table in public to authenticated in full, so after the first run
-- authenticated held REFERENCES, TRIGGER and TRUNCATE beside the four intended privileges. `grant
-- select, insert, update, delete` ADDS to what a role holds; it removes nothing. The two statements
-- marked below were run by hand in production the same day and re-verified: authenticated now holds
-- only DELETE, INSERT, SELECT, UPDATE. They are in this file so a replay produces the verified state.
--
-- ⚠️ RUN THIS BEFORE ANY CODE THAT READS OR WRITES THE TABLE IS DEPLOYED. On 29 Sep 2026 every deal
-- save failed because the wizard wrote a column the table did not have.
--
-- ⚠️ RE-RUNNING IS NOT INERT: IT RAISES. `create table` carries no IF NOT EXISTS on purpose. A second
-- run fails on the first statement and the transaction rolls back, leaving the table as it was. That
-- is preferred to a silent no-op that would hide a table created by hand with a different shape.
--
-- NULL MEANS "NOT ANSWERED" THROUGHOUT, AND NOTHING HAS A DEFAULT THAT WOULD ERASE THAT. The entity
-- test tells "no" from "not answered" (a listing question left blank cannot rule the listing route
-- out), and tells a figure of zero from a figure not provided. A default of false or 0 on any of these
-- columns would turn an unanswered question into an answer.
--
-- THE TWO YEARS. The Act tests the size conditions in EITHER of the two most recent financial years,
-- so both are held: recent_fy_* and prior_fy_*. Each year carries its own currency, because a figure
-- is converted to CAD at a dated rate before it is compared and the two years need not match.
--   *_assets, *_revenue     numeric  As in the consolidated financial statements, in *_currency.
--   *_avg_employees         numeric  The AVERAGE number of employees over the year, which is what the
--                                    Act measures. numeric, not integer: an average may be fractional.
--   *_currency              text     ISO 4217 code, three capitals. Not checked against a rate list:
--                                    the list is versioned in lib/fx.ts and a stale CHECK would refuse
--                                    a save. A code with no rate is reported as "not compared".
--
-- WHAT THIS DOES NOT DO:
--   No entitlement trigger. The module has no key in lib/pricing.ts yet, so there is nothing to gate
--     on. RLS below asks who owns a row, not who paid; the paywall trigger comes with the pricing stage
--     and must be in place before the module is sold.
--   No unique constraint on (user_id, company_name, reporting_year). Whether a user may hold two
--     drafts for one company and year is a product decision not yet taken.
--   No link to public.companies. The house pattern has company_id beside company_name; it is left out
--     until the module decides how it prefills.

begin;

create table public.s211_reports (
  id                          uuid primary key default gen_random_uuid(),

  -- Cascades: a report is the user's own working document and has no reader once the account is gone.
  user_id                     uuid not null references auth.users(id) on delete cascade,

  company_name                text not null,
  reporting_year              integer not null check (reporting_year between 2000 and 2100),
  -- The last day of the financial year the report covers. NULL = not given.
  financial_year_end          date,

  -- Route 1 of the entity test. NULL = not answered.
  listed_in_canada            boolean,

  -- The Canada nexus for route 2: any one suffices. NULL = not answered.
  place_of_business_in_canada boolean,
  does_business_in_canada     boolean,
  has_assets_in_canada        boolean,

  -- The most recent financial year.
  recent_fy_assets            numeric check (recent_fy_assets is null or recent_fy_assets >= 0),
  recent_fy_revenue           numeric check (recent_fy_revenue is null or recent_fy_revenue >= 0),
  recent_fy_avg_employees     numeric check (recent_fy_avg_employees is null or recent_fy_avg_employees >= 0),
  recent_fy_currency          text check (recent_fy_currency is null or recent_fy_currency ~ '^[A-Z]{3}$'),

  -- The financial year before it.
  prior_fy_assets             numeric check (prior_fy_assets is null or prior_fy_assets >= 0),
  prior_fy_revenue            numeric check (prior_fy_revenue is null or prior_fy_revenue >= 0),
  prior_fy_avg_employees      numeric check (prior_fy_avg_employees is null or prior_fy_avg_employees >= 0),
  prior_fy_currency           text check (prior_fy_currency is null or prior_fy_currency ~ '^[A-Z]{3}$'),

  -- A closed set, checked. Adding a state needs a migration, which is the intended friction.
  status                      text not null default 'draft' check (status in ('draft', 'final')),

  created_at                  timestamptz not null default now(),
  -- Set explicitly by the save path on every update, as supply_chain_registers.updated_at is. No trigger.
  updated_at                  timestamptz not null default now()
);

-- user_id carries the RLS predicate, the list view and the cascade.
create index idx_s211_reports_user      on public.s211_reports (user_id);
create index idx_s211_reports_user_year on public.s211_reports (user_id, reporting_year);

comment on table public.s211_reports is
  'Canada S-211 (Fighting Against Forced Labour and Child Labour in Supply Chains Act) reports in preparation. Holds the inputs to the entity test in lib/s211/entity.ts; the result is recomputed, never stored. NULL means not answered in every nullable column.';
comment on column public.s211_reports.listed_in_canada is
  'Listed on a stock exchange in Canada: an entity at any size. NULL = not answered, which is not the same as false.';
comment on column public.s211_reports.recent_fy_avg_employees is
  'Average number of employees over the most recent financial year. The Act measures an average, not a point count.';
comment on column public.s211_reports.recent_fy_currency is
  'ISO 4217 code the most recent year''s assets and revenue are in. Converted to CAD in code at a dated rate; not constrained to a rate list here.';
comment on column public.s211_reports.prior_fy_currency is
  'ISO 4217 code the prior year''s assets and revenue are in. May differ from recent_fy_currency.';

-- ── RLS and grants ────────────────────────────────────────────────────────────────────────────────
-- The house pattern, as supply_chain_registers:
--   to authenticated, not the implicit PUBLIC;
--   (select auth.uid()), never a bare auth.uid(), so the planner hoists it to an InitPlan and evaluates
--     it once per query instead of once per row;
--   explicit grants, because a hand-run CREATE TABLE grants nothing and service_role is not a member
--     of authenticated. BYPASSRLS does not bypass GRANT.
alter table public.s211_reports enable row level security;

create policy s211_reports_owner on public.s211_reports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.s211_reports from public;
revoke all on table public.s211_reports from anon;
grant select, insert, update, delete on table public.s211_reports to authenticated;
grant all on table public.s211_reports to service_role;

-- ADDED 30 SEP 2026, after the first run (see the header). Revoke first, then grant the four: the
-- default privileges had already given authenticated REFERENCES, TRIGGER and TRUNCATE, and only a
-- revoke takes them away. Run by hand in production that day; safe to run again.
revoke all on table public.s211_reports from authenticated;
grant select, insert, update, delete on table public.s211_reports to authenticated;

commit;

-- Ask PostgREST to reload its schema cache now, so the API sees the table at once.
notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   1. The table and its columns.
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 's211_reports'
--   order by ordinal_position;
--   -- expect 20 rows. NOT NULL: id, user_id, company_name, reporting_year, status, created_at,
--   -- updated_at. Defaults only on id, status, created_at, updated_at. Everything else nullable, no default.
--
--   2. RLS is on, and the one policy is wrapped.
--   select relrowsecurity from pg_class where oid = 'public.s211_reports'::regclass;
--   -- expect t
--   select policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 's211_reports';
--   -- expect one row: s211_reports_owner, ALL, {authenticated},
--   -- qual and with_check both (( SELECT auth.uid() AS uid) = user_id)
--
--   3. No bare auth.uid() was introduced (the CLAUDE.md count query, narrowed to this table).
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 's211_reports'
--     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
--           '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)';
--   -- expect 0
--
--   4. Grants.
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 's211_reports'
--   group by grantee order by grantee;
--   -- expect authenticated: DELETE, INSERT, SELECT, UPDATE. service_role: all seven. postgres: all seven.
--   -- NO row for anon and NO row for PUBLIC.
--
--   5. The checks.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.s211_reports'::regclass and contype = 'c' order by conname;
--   -- expect 10: reporting_year, status, three figures and a currency for each of the two years.
--
--   6. Indexes.
--   select indexname from pg_indexes where schemaname = 'public' and tablename = 's211_reports' order by 1;
--   -- expect idx_s211_reports_user, idx_s211_reports_user_year, s211_reports_pkey
