-- NOT YET RUN. Written 10 Oct 2026 for BR8b; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1, after 20261017_staff_actions_and_reading_switch.sql. Run it BEFORE the BR8b app change
-- (br8b.patch) is pushed; then supabase/verify/20261018_br8b_verify.sql.
--
-- public.bill_review_spot_checks: a ThemisIQ specialist's check of an AI reading a customer confirmed (BR8b, Q4)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Creates public.bill_review_spot_checks: one row per check of one AI reading (an inventory, a document, a fuel and
--    the reading's position on the document), with the reading as the specialist saw it, the result ('agrees' or
--    'disagrees', with a note, required for a disagreement), who checked it and when. A reading is checked once
--    (unique). APPEND-ONLY, as the readings are: no row is ever changed; deleted only with its inventory (cascade).
-- 2. Creates public.bill_review_spot_checks_guard() and its trigger: on insert, the customer (user_id) is the
--    inventory's owner, never sent; checked_at is the server's time; checked_by must hold an active bill_reader role.
--    Every update is refused.
-- 3. Row level security with one SELECT policy, the customer's own rows; column-scoped SELECT that withholds
--    checked_by (Q10: customers and verifiers never see a staff member's id); the schema reload.
--
-- WHY
-- Ruled 10 Oct 2026 (Q4): spot-checks are built now; the sample is 10% of AI readings customers have confirmed, drawn
-- at random and stable (lib/staff/spotChecks.ts: md5 of the reading's identity, never a human-read bill), offered in
-- the staff queue. A disagreement blocks the customer's export until they confirm that reading again or correct it,
-- or withdraw or delete the bill (BR8 decision 5; the engine's spot_check_difference issue). The customer's confirmed
-- figure is never changed for them.
--
-- RLS ADDED: row level security on, one policy: SELECT to authenticated, user_id = (select auth.uid()) (wrapped).
-- No insert, update or delete policy: rows are written by the staff route only, with the service role.
--
-- GRANTS (revoke first; grants are separate from RLS):
--   all revoked from public, anon, authenticated and service_role, then
--   authenticated: SELECT on every column except checked_by, column-scoped in the per-privilege form
--     (lib/ghg/columnGrants.test.ts);
--   service_role: SELECT, INSERT (no UPDATE, no DELETE: append-only);
--   anon: nothing.
-- Execute on the guard function: revoked from public, anon and authenticated.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md). The wizard and the staff routes read the table
-- through the API.
--
-- PRE-CHECK, run first:
--   select to_regclass('public.bill_review_spot_checks') as spot_checks,
--          to_regprocedure('public.bill_review_spot_checks_guard()') as guard,
--          (select pg_get_constraintdef(oid) like '%record_spot_check%' from pg_constraint
--            where conname = 'staff_access_log_action_check') as log_action;
-- PROCEED if spot_checks and guard are null and log_action is true. STOP otherwise.
--
-- VERIFY, after: supabase/verify/20261018_br8b_verify.sql (names the table, index, policy, function and trigger; checks
-- every privilege, checked_by withheld; proves the guard in a rolled-back block).
--
-- Idempotent: IF NOT EXISTS on the table and index, CREATE OR REPLACE on the function, DROP ... IF EXISTS before CREATE
-- POLICY and CREATE TRIGGER, grants re-issued. ASCII only.

create table if not exists public.bill_review_spot_checks (
  id              uuid        primary key default gen_random_uuid(),
  inventory_id    uuid        not null references public.ghg_inventories(id) on delete cascade,
  user_id         uuid        not null,
  source_doc_id   text        not null,
  fuel_type       text        not null,
  proposal_index  integer     not null check (proposal_index >= 0),
  reading         jsonb       not null,
  result          text        not null check (result in ('agrees', 'disagrees')),
  note            text,
  checked_by      uuid        not null references auth.users(id) on delete restrict,
  checked_at      timestamptz not null default now(),
  check (result <> 'disagrees' or (note is not null and pg_catalog.btrim(note) <> ''))
);

create unique index if not exists bill_review_spot_checks_once
  on public.bill_review_spot_checks (inventory_id, source_doc_id, fuel_type, proposal_index);

comment on table public.bill_review_spot_checks is
  'BR8b (Q4): a specialist''s check of an AI reading a customer confirmed. Append-only. A disagreement is shown to the '
  'customer and blocks export until they confirm the reading again or correct it; their figure is never changed. '
  'See supabase/migrations/20261018_bill_review_spot_checks.sql.';

create or replace function public.bill_review_spot_checks_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if tg_op <> 'INSERT' then
    raise exception 'A spot-check is never changed.' using errcode = '42501';
  end if;
  select i.user_id into v_owner from public.ghg_inventories i where i.id = new.inventory_id;
  if v_owner is null then
    raise exception 'No such inventory.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.staff_roles s
                  where s.user_id = new.checked_by and s.role = 'bill_reader' and s.revoked_at is null) then
    raise exception 'A spot-check is recorded by a ThemisIQ specialist.' using errcode = '42501';
  end if;
  new.user_id := v_owner;
  new.checked_at := now();
  return new;
end;
$$;

comment on function public.bill_review_spot_checks_guard() is
  'BR8b: a spot-check is the inventory owner''s, recorded by an active bill_reader with the server''s time, and never '
  'changed. See 20261018_bill_review_spot_checks.sql.';

revoke all on function public.bill_review_spot_checks_guard() from public, anon, authenticated;

drop trigger if exists trg_bill_review_spot_checks_guard on public.bill_review_spot_checks;
create trigger trg_bill_review_spot_checks_guard
  before insert or update on public.bill_review_spot_checks
  for each row execute function public.bill_review_spot_checks_guard();

alter table public.bill_review_spot_checks enable row level security;

drop policy if exists bill_review_spot_checks_select_own on public.bill_review_spot_checks;
create policy bill_review_spot_checks_select_own on public.bill_review_spot_checks
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.bill_review_spot_checks from public, anon, authenticated, service_role;
grant select (id, inventory_id, user_id, source_doc_id, fuel_type, proposal_index, reading, result, note, checked_at)
  on public.bill_review_spot_checks to authenticated;
grant select, insert on public.bill_review_spot_checks to service_role;

notify pgrst, 'reload schema';
