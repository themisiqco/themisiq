-- NOT YET RUN. Written 10 Oct 2026 for BR3; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1. Then supabase/verify/20261012_br3_verify.sql, then supabase/manual/20261012_staff_initial_grant.sql
-- and its verify. The app change (br3.patch) can be pushed before or after: nothing calls it until BR8.
--
-- public.staff_roles and public.staff_access_log: who on the ThemisIQ team may read customers' bills, and the
-- append-only record of every look (BR3)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Creates public.staff_roles: one row per grant of a role ('bill_reader' or 'bill_review_lead') to a user, with
--    who granted it and when, and who revoked it and when. At most one active row per (user, role): a partial unique
--    index where revoked_at is null. Revoking is a one-time update of revoked_at and revoked_by; a row is never deleted;
--    granting again is a new row, so the history of grants and revocations survives.
-- 2. Creates public.staff_roles_guard() and its trigger: on insert, granted_at is the server's time and the row is not
--    revoked; on update, only revoked_by may be set, once, and revoked_at is then the server's time; anything else is
--    refused, and so is every delete.
-- 3. Attaches log_audit() to staff_roles (audit_staff_roles), so every grant and revocation is also in audit_log with
--    the old and new row.
-- 4. Creates public.staff_access_log: one row per staff action (viewing the queue, a document, an AI reading or the
--    log; saving a reading; recording a spot-check), with the role that allowed it, the document and the inventory.
-- 5. Creates public.staff_access_log_append_only() and two triggers on the log: a row trigger that sets `at` to the
--    server's time on insert and refuses every update and delete, and a statement trigger that refuses truncate.
-- 6. Grants (below), and reloads the API schema cache.
--
-- WHY
-- Ruled 3 Oct 2026 (section 10, "BR: staff access") and 10 Oct 2026 (BR3 decisions): role-based, least privilege,
-- every view logged, and a hired analyst added with an insert, no code change. BR3 in
-- docs/review/design-derived-figures.md. lib/staff/access.ts is the only code that reads or writes these tables.
--
-- APPEND-ONLY, THREE LAYERS. audit_log is append-only only because it has no UPDATE or DELETE policy
-- (20260908_drop_audit_insert_policy.sql), which does not bind service_role: it bypasses RLS. The staff log is written
-- by service_role, so it is held by:
--   (a) grants: service_role holds SELECT and INSERT only, no UPDATE, DELETE or TRUNCATE (BYPASSRLS does not bypass
--       GRANT);
--   (b) a BEFORE UPDATE OR DELETE row trigger that refuses (errcode 42501);
--   (c) a BEFORE TRUNCATE statement trigger that refuses (42501).
-- The table owner (postgres) can still disable a trigger; that is an act in the SQL editor, not a code path.
--
-- ERASURE: both tables reference auth.users ON DELETE RESTRICT, deliberately. Deleting a staff member's auth user is
-- refused while they have role or log rows, rather than losing the record silently. scripts/erase-account.mjs does not
-- handle staff yet (register STAFF-01).
--
-- RLS ADDED: row level security on both tables, with NO policy. Reachable by service_role only (and the owner).
--
-- GRANTS (revoke first, then grant; grants are separate from RLS):
--   all revoked from public, anon, authenticated and service_role, then
--   service_role: SELECT on staff_roles (requireStaffRole reads it); SELECT, INSERT on staff_access_log
--   (logStaffAccess writes it, the lead's log view reads it).
--   anon, authenticated: NOTHING. Grants and revocations are made by Lisa in the SQL editor.
-- Execute on the two trigger functions: revoked from public, anon and authenticated.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md, the two rules for every new migration).
--
-- PRE-CHECK, run first:
--   select to_regclass('public.staff_roles') as staff_roles,
--          to_regclass('public.staff_access_log') as staff_access_log,
--          to_regprocedure('public.staff_roles_guard()') as roles_guard,
--          to_regprocedure('public.staff_access_log_append_only()') as log_guard,
--          to_regprocedure('public.log_audit()') as log_audit;
-- PROCEED if the first four are null and log_audit is not null. STOP and report anything else.
--
-- VERIFY, after: supabase/verify/20261012_br3_verify.sql. It names each table, function and trigger directly, proves
-- anon and authenticated hold no privilege on either table, and proves the refusals fire (inside a rolled-back block).
--
-- Idempotent: IF NOT EXISTS on the tables and index, CREATE OR REPLACE on the functions, DROP TRIGGER IF EXISTS before
-- CREATE TRIGGER, grants re-issued. ASCII only.

create table if not exists public.staff_roles (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete restrict,
  role        text        not null check (role in ('bill_reader', 'bill_review_lead')),
  granted_by  uuid        not null references auth.users(id) on delete restrict,
  granted_at  timestamptz not null default now(),
  revoked_by  uuid        references auth.users(id) on delete restrict,
  revoked_at  timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);

create unique index if not exists staff_roles_one_active
  on public.staff_roles (user_id, role) where revoked_at is null;

comment on table public.staff_roles is
  'BR3: one row per grant of a Bill Review staff role. Revoked by a one-time update of revoked_by (revoked_at is set '
  'by the trigger); never deleted; a new grant is a new row. Reachable by service_role only. '
  'See supabase/migrations/20261012_staff_roles_and_access_log.sql.';

create or replace function public.staff_roles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'A staff role is revoked, never deleted.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if new.revoked_at is not null or new.revoked_by is not null then
      raise exception 'A new staff role cannot be revoked already.' using errcode = '42501';
    end if;
    new.granted_at := now();
    return new;
  end if;
  -- UPDATE: only a first revocation, and nothing else about the row.
  if old.revoked_at is not null then
    raise exception 'This staff role is already revoked. Grant it again as a new row.' using errcode = '42501';
  end if;
  if new.revoked_by is null
     or new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.role is distinct from old.role
     or new.granted_by is distinct from old.granted_by
     or new.granted_at is distinct from old.granted_at then
    raise exception 'A staff role can only be revoked: set revoked_by, and nothing else.' using errcode = '42501';
  end if;
  new.revoked_at := now();
  return new;
end;
$$;

comment on function public.staff_roles_guard() is
  'BR3: staff_roles is grant, then at most one revocation; never deleted. See 20261012_staff_roles_and_access_log.sql.';

revoke all on function public.staff_roles_guard() from public, anon, authenticated;

drop trigger if exists trg_staff_roles_guard on public.staff_roles;
create trigger trg_staff_roles_guard
  before insert or update or delete on public.staff_roles
  for each row execute function public.staff_roles_guard();

drop trigger if exists audit_staff_roles on public.staff_roles;
create trigger audit_staff_roles
  after insert or delete or update on public.staff_roles
  for each row execute function public.log_audit();

create table if not exists public.staff_access_log (
  id             uuid        primary key default gen_random_uuid(),
  staff_user_id  uuid        not null references auth.users(id) on delete restrict,
  role           text        not null check (role in ('bill_reader', 'bill_review_lead')),
  action         text        not null check (action in ('view_queue', 'view_document', 'save_reading', 'view_ai_reading',
                                                        'record_spot_check', 'view_access_log')),
  document_ref   text,
  inventory_id   uuid,
  at             timestamptz not null default now()
);

create index if not exists staff_access_log_at on public.staff_access_log (at);

comment on table public.staff_access_log is
  'BR3: every Bill Review staff action, append-only (no UPDATE, DELETE or TRUNCATE grant; triggers refuse all three). '
  'document_ref is the stored path or the bill_review document id. Written before a document is served '
  '(lib/staff/access.ts, signStaffDocument). See supabase/migrations/20261012_staff_roles_and_access_log.sql.';

create or replace function public.staff_access_log_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.at := now();
    return new;
  end if;
  raise exception 'The staff access log is append-only: % is refused.', lower(tg_op) using errcode = '42501';
end;
$$;

comment on function public.staff_access_log_append_only() is
  'BR3: the staff access log takes inserts only, stamped with the server''s time. See 20261012_staff_roles_and_access_log.sql.';

revoke all on function public.staff_access_log_append_only() from public, anon, authenticated;

drop trigger if exists trg_staff_access_log_append_only on public.staff_access_log;
create trigger trg_staff_access_log_append_only
  before insert or update or delete on public.staff_access_log
  for each row execute function public.staff_access_log_append_only();

drop trigger if exists trg_staff_access_log_no_truncate on public.staff_access_log;
create trigger trg_staff_access_log_no_truncate
  before truncate on public.staff_access_log
  for each statement execute function public.staff_access_log_append_only();

alter table public.staff_roles enable row level security;
alter table public.staff_access_log enable row level security;

revoke all on public.staff_roles, public.staff_access_log from public, anon, authenticated, service_role;
grant select on public.staff_roles to service_role;
grant select, insert on public.staff_access_log to service_role;

notify pgrst, 'reload schema';
