-- supabase/migrations/20260930_s211_report_sections.sql
-- Canada S-211 module, Stage 2a: the sections of a report in preparation. One row per section of one
-- report; the report itself is a row in public.s211_reports.
--
-- Run in production on 2026-09-30 (verified).
-- Verified then: 6 columns, all NOT NULL; one owner policy, s211_report_sections_owner, ALL,
-- {authenticated}; authenticated holds DELETE, INSERT, SELECT, UPDATE only; no row for anon.
--
-- ⚠️ RUN 20260930_s211_reports.sql FIRST. This table references public.s211_reports and its policy
-- reads it. That file's header says it has run; the first statement below fails cleanly if it has not.
--
-- ⚠️ RE-RUNNING IS NOT INERT: IT RAISES. `create table` carries no IF NOT EXISTS on purpose. A second
-- run fails on the first statement and the transaction rolls back, leaving the table as it was.
--
-- THE ELEVEN SECTIONS, in the order the report prints them. section_key is CHECKed against this list,
-- so a key the application writes and the database has never heard of is refused, not stored.
--    1  report_details                       reporting entity, financial year, single or joint report
--    2  structure_activities_supply_chains   Act s.11(3)(a)
--    3  policies_due_diligence               Act s.11(3)(b)
--    4  risks                                Act s.11(3)(c)
--    5  remediation                          Act s.11(3)(d)
--    6  remediation_income_loss              Act s.11(3)(e)
--    7  training                             Act s.11(3)(f)
--    8  effectiveness                        Act s.11(3)(g)
--    9  steps_taken                          Act s.11(1), the general requirement
--   10  other_information                    optional; no provision of the Canadian Act
--   11  approval_attestation                 Act s.11(4) and (5)
--
-- content IS THE USER'S ANSWERS FOR THAT SECTION, as one jsonb object: the structured fields and the
-- free text together. Its shape is owned by the application and versioned there, because the prompts
-- will change between reporting years and a column per prompt would need a migration each time. It is
-- NOT NULL with a default of '{}', so "nothing entered yet" is an empty object and never a null that
-- every reader has to guard against. A CHECK holds it to an object, so an array or a bare string can
-- never be stored where the builder expects fields.
--   ⚠️ NO PERSONAL INFORMATION belongs in content except the signer's name and title, in
--   approval_attestation. Public Safety Canada will not publish a report that contains any.
--
-- status: not_started, in_progress, complete. A closed set, checked. A missing row and a row with
-- status not_started mean the same thing to a reader; the application may create rows lazily.
--
-- OWNERSHIP IS THE PARENT'S. There is no user_id here. A section belongs to whoever owns its report,
-- and the policy below asks public.s211_reports. Copying user_id down would create a second place for
-- ownership to be recorded, and the two could disagree.
--
-- WHAT THIS DOES NOT DO:
--   No entitlement trigger. The module has no key in lib/pricing.ts yet. RLS asks who owns a row, not
--     who paid; the paywall trigger comes with the pricing stage, on public.s211_reports, and must be
--     in place before the module is sold.
--   No trigger maintaining updated_at. The save path sets it on every write, as it does for
--     supply_chain_registers and s211_reports.

begin;

create table public.s211_report_sections (
  id           uuid primary key default gen_random_uuid(),

  -- Cascades: a section has no meaning without its report.
  report_id    uuid not null references public.s211_reports(id) on delete cascade,

  section_key  text not null check (section_key in (
                 'report_details',
                 'structure_activities_supply_chains',
                 'policies_due_diligence',
                 'risks',
                 'remediation',
                 'remediation_income_loss',
                 'training',
                 'effectiveness',
                 'steps_taken',
                 'other_information',
                 'approval_attestation'
               )),

  content      jsonb not null default '{}'::jsonb check (jsonb_typeof(content) = 'object'),

  status       text not null default 'not_started'
                 check (status in ('not_started', 'in_progress', 'complete')),

  updated_at   timestamptz not null default now(),

  -- One row per section per report. Also the index every read uses: all sections of one report.
  constraint s211_report_sections_report_section_key unique (report_id, section_key)
);

comment on table public.s211_report_sections is
  'Sections of a Canada S-211 report in preparation: one row per (report, section). content holds the user''s answers for that section as a jsonb object whose shape the application owns. Ownership is the parent report''s; there is no user_id here.';
comment on column public.s211_report_sections.section_key is
  'One of eleven keys, in report order: report_details, structure_activities_supply_chains, policies_due_diligence, risks, remediation, remediation_income_loss, training, effectiveness, steps_taken, other_information, approval_attestation.';
comment on column public.s211_report_sections.content is
  'The user''s answers for this section, as a jsonb object. Never null; an empty object means nothing entered. No personal information except the signer''s name and title in approval_attestation.';
comment on column public.s211_report_sections.status is
  'not_started, in_progress or complete. Set by the application; complete is the user''s own mark.';

-- ── RLS and grants ────────────────────────────────────────────────────────────────────────────────
-- Ownership through the parent: a row is visible and writable exactly when the caller owns the report
-- it belongs to. (select auth.uid()), never a bare auth.uid(), so the planner hoists it to an InitPlan
-- and evaluates it once per query. WITH CHECK repeats the test so a row cannot be inserted under, or
-- moved to, a report the caller does not own.
alter table public.s211_report_sections enable row level security;

create policy s211_report_sections_owner on public.s211_report_sections
  for all to authenticated
  using (exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id
      and r.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.s211_reports r
    where r.id = s211_report_sections.report_id
      and r.user_id = (select auth.uid())
  ));

-- Revoke first, then grant. Since 20260930_revoke_truncate_trigger_references.sql a new table no longer
-- starts with TRUNCATE, TRIGGER, REFERENCES or MAINTAIN for anon or authenticated, so the revokes should
-- find nothing to remove. They stay as belt and braces: the default belongs to the creating role, and a
-- table created by any role other than postgres would start wide open.
revoke all on table public.s211_report_sections from public;
revoke all on table public.s211_report_sections from anon;
revoke all on table public.s211_report_sections from authenticated;
grant select, insert, update, delete on table public.s211_report_sections to authenticated;
grant all on table public.s211_report_sections to service_role;

commit;

-- Ask PostgREST to reload its schema cache now, so the API sees the table at once.
notify pgrst, 'reload schema';

-- ── VERIFY AFTER RUNNING ──────────────────────────────────────────────────────────────────────────
--   1. The table and its columns.
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 's211_report_sections'
--   order by ordinal_position;
--   -- expect 6 rows, all NOT NULL: id, report_id, section_key, content, status, updated_at.
--   -- Defaults on id, content ('{}'::jsonb), status ('not_started'::text), updated_at. None on the other two.
--
--   2. Constraints.
--   select conname, contype, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.s211_report_sections'::regclass order by contype, conname;
--   -- expect: 3 checks (section_key with its 11 keys, content is an object, status with its 3 values),
--   -- 1 foreign key to s211_reports(id) ON DELETE CASCADE, 1 primary key,
--   -- 1 unique (report_id, section_key) named s211_report_sections_report_section_key.
--
--   3. RLS is on, and the one policy is wrapped.
--   select relrowsecurity from pg_class where oid = 'public.s211_report_sections'::regclass;
--   -- expect t
--   select policyname, cmd, roles, qual, with_check from pg_policies
--   where schemaname = 'public' and tablename = 's211_report_sections';
--   -- expect one row: s211_report_sections_owner, ALL, {authenticated}; qual and with_check each an
--   -- EXISTS over s211_reports containing ( SELECT auth.uid() AS uid).
--
--   4. No bare auth.uid() was introduced. Expect 0.
--   select count(*) from pg_policies
--   where schemaname = 'public' and tablename = 's211_report_sections'
--     and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
--           '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'gi') ~ 'auth\.uid\(\)';
--
--   5. Grants: only the four, and nothing for anon.
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 's211_report_sections'
--   group by grantee order by grantee;
--   -- expect authenticated: DELETE, INSERT, SELECT, UPDATE. service_role and postgres: all seven.
--   -- NO row for anon and NO row for PUBLIC.
--
--   6. The extras check. Expect ZERO ROWS.
--   select table_name, grantee,
--          string_agg(privilege_type, ', ' order by privilege_type) as extra_privileges
--   from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 's211_report_sections'
--     and grantee in ('authenticated', 'anon')
--     and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
--   group by table_name, grantee;
--
--   7. MAINTAIN, which the view above cannot show. Expect ZERO ROWS.
--   select r.role
--   from (values ('anon'), ('authenticated')) as r(role)
--   where has_table_privilege(r.role, 'public.s211_report_sections'::regclass, 'MAINTAIN');
--
--   8. The same two checks across the whole schema, to confirm the default still holds. Expect ZERO ROWS each.
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('authenticated', 'anon')
--     and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
--   group by table_name, grantee order by 1, 2;
--   select c.relname, r.role
--   from pg_class c cross join (values ('anon'), ('authenticated')) as r(role)
--   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
--     and has_table_privilege(r.role, c.oid, 'MAINTAIN')
--   order by 1, 2;
--
--   9. Ownership through the parent really is enforced. Optional; rolls back. Run as yourself in the SQL
--      editor (postgres bypasses RLS, so this only proves the constraints, not the policy):
--   begin;
--   insert into public.s211_report_sections (report_id, section_key) values (gen_random_uuid(), 'risks');
--   -- expect ERROR: violates foreign key constraint (no such report)
--   rollback;
