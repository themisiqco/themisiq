-- NOT YET RUN. Written 10 Oct 2026 for BR4; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 2. Run BEFORE the BR4 app change (br4b.patch) is pushed; then supabase/verify/20261013_br4_verify.sql.
-- 20261014_bill_review_reading_switch.sql runs AFTER that deploy is live.
--
-- public.bill_review_documents and public.bill_review_readings: the human-reading queue's data (BR4)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Creates public.bill_review_documents: one row per bill uploaded to a human-read inventory, recorded by
--    /api/bill-review/submit: the stored path, the document's id and name, its site, when it was submitted and the
--    date it is expected by (BR5, computed on the server). Its status moves once, from 'waiting' to 'read' or
--    'unreadable', when a specialist finishes (BR8). Unique by file_path, and by (inventory_id, source_doc_id).
-- 2. Creates public.bill_review_readings: one row per figure a specialist reads off a bill, APPEND-ONLY. A corrected
--    reading is a new row naming the one it supersedes; no row is ever changed.
-- 3. Guard triggers on both (below), row level security with one SELECT policy each for the customer's own rows,
--    the grants, and the schema reload.
--
-- WHY
-- Ruled 3 Oct 2026 ("BR: turnaround", "BR: specialist queue") and 10 Oct 2026 (Q3: new bill_review_* tables; the
-- unused concierge_* tables are dropped in the Bill Review rename, not here; the BR4 decisions).
--
-- WHAT A ROW DOES NOT RECORD: a customer's withdraw, restore or delete. Those are T18's record on the saved inventory
-- (locations_data[].source_docs[].withdrawn, the document_log tombstones, location_log), and BR8 reads them from there
-- (ruling, 10 Oct 2026). No status is written here for them, and no row is deleted for them.
--
-- GUARDS (SECURITY DEFINER, search_path ''):
--   bill_review_documents_guard(): on insert, the inventory must belong to user_id and be human-read
--     (ghg_inventories.bill_review_reading = 'human'), submitted_at is the server's time, status is 'waiting' and
--     nothing is read yet. On update, only one move is allowed: 'waiting' to 'read' or 'unreadable', naming read_by
--     (and unreadable_note for 'unreadable'); read_at is the server's time; every other column stays as it was.
--   bill_review_readings_guard(): on insert, user_id and inventory_id are copied from the document (never sent),
--     read_at is the server's time, the document must not be 'unreadable', and supersedes must name a reading of
--     the same document. Every update is refused.
-- APPEND-ONLY WITHOUT BLOCKING ERASURE. Readings refuse UPDATE by trigger and by grant. DELETE is refused by grant
-- alone (no role holds it); there is deliberately no delete trigger, so deleting an inventory (the erasure path; the
-- app never deletes one) still cascades through documents to readings: a referential cascade does not check grants.
--
-- STAFF IDS: read_by (the specialist) is withheld from customers by the column grants below, and the wizard's
-- proposals carry readBy { method: 'human', readingId, at } only, so neither a customer nor a verifier sees a staff
-- user id. How the specialist is named on verifier pages and PDFs is Q10, open for BR9. read_by references auth.users
-- ON DELETE RESTRICT (register STAFF-01).
--
-- RLS ADDED: row level security on both tables, one policy each: SELECT to authenticated, own rows,
-- user_id = (select auth.uid()) (the wrapped form). No insert, update or delete policy: rows are written by
-- service-role server code only (/api/bill-review/submit; BR8's staff routes, which log through lib/staff/access.ts).
--
-- GRANTS (revoke first; grants are separate from RLS):
--   all revoked from public, anon, authenticated and service_role, then
--   authenticated: SELECT on every column except read_by, column-scoped in the per-privilege form
--     (lib/ghg/columnGrants.test.ts);
--   service_role: SELECT, INSERT, UPDATE on bill_review_documents; SELECT, INSERT on bill_review_readings (no
--     UPDATE: readings are append-only; no DELETE on either);
--   anon: nothing.
-- Execute on the two guard functions: revoked from public, anon and authenticated.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md). The wizard and the routes read these tables
-- through the API.
--
-- PRE-CHECK, run first:
--   select to_regclass('public.bill_review_documents') as documents,
--          to_regclass('public.bill_review_readings') as readings,
--          to_regprocedure('public.bill_review_documents_guard()') as documents_guard,
--          to_regprocedure('public.bill_review_readings_guard()') as readings_guard,
--          (select count(*) from information_schema.columns where table_schema = 'public'
--             and table_name = 'ghg_inventories' and column_name = 'bill_review_reading') as reading_column;
-- PROCEED if the first four are null and reading_column is 1 (20261011_bill_review_reading.sql ran). STOP otherwise.
--
-- VERIFY, after: supabase/verify/20261013_br4_verify.sql (names each table, index, policy, function and trigger;
-- checks every privilege of anon, authenticated and service_role; proves the guards refuse, in a rolled-back block).
--
-- Idempotent: IF NOT EXISTS on the tables and indexes, CREATE OR REPLACE on the functions, DROP ... IF EXISTS before
-- each CREATE POLICY and CREATE TRIGGER, grants re-issued. ASCII only.

create table if not exists public.bill_review_documents (
  id                   uuid        primary key default gen_random_uuid(),
  user_id              uuid        not null,
  inventory_id         uuid        not null references public.ghg_inventories(id) on delete cascade,
  source_doc_id        text        not null,
  file_path            text        not null,
  file_name            text        not null,
  document_type        text        not null,
  location_id          text,
  location_name        text,
  status               text        not null default 'waiting' check (status in ('waiting', 'read', 'unreadable')),
  submitted_at         timestamptz not null default now(),
  expected_by          date,
  expected_by_refusal  text,
  read_by              uuid        references auth.users(id) on delete restrict,
  read_at              timestamptz,
  unreadable_note      text,
  check ((expected_by is null) <> (expected_by_refusal is null)),
  check ((status = 'waiting') = (read_by is null and read_at is null)),
  check ((status = 'unreadable') = (unreadable_note is not null))
);

create unique index if not exists bill_review_documents_file_path on public.bill_review_documents (file_path);
create unique index if not exists bill_review_documents_inventory_doc on public.bill_review_documents (inventory_id, source_doc_id);

comment on table public.bill_review_documents is
  'BR4: a bill uploaded to a human-read inventory, waiting for or read by a ThemisIQ specialist. Written by '
  '/api/bill-review/submit and BR8 staff routes only. Customer withdraw, restore and delete are not recorded here '
  '(T18, on the saved inventory). See supabase/migrations/20261013_bill_review_queue.sql.';

create table if not exists public.bill_review_readings (
  id                       uuid        primary key default gen_random_uuid(),
  bill_review_document_id  uuid        not null references public.bill_review_documents(id) on delete cascade,
  user_id                  uuid        not null,
  inventory_id             uuid        not null,
  fuel_type                text        not null check (fuel_type in ('electricity', 'natural_gas', 'diesel', 'propane', 'gasoline')),
  raw_value                numeric     not null,
  raw_unit                 text        not null,
  period_start             date,
  period_end               date,
  delivery_date            date,
  source_quote             text,
  notes                    text,
  supersedes               uuid        references public.bill_review_readings(id),
  read_by                  uuid        not null references auth.users(id) on delete restrict,
  read_at                  timestamptz not null default now()
);

create index if not exists bill_review_readings_document on public.bill_review_readings (bill_review_document_id);
create unique index if not exists bill_review_readings_supersedes on public.bill_review_readings (supersedes) where supersedes is not null;

comment on table public.bill_review_readings is
  'BR4: a figure a ThemisIQ specialist read off a bill. Append-only: a correction is a new row naming the one it '
  'supersedes. Merged into the wizard as a proposal the customer confirms, like an AI reading. '
  'See supabase/migrations/20261013_bill_review_queue.sql.';

create or replace function public.bill_review_documents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   uuid;
  v_reading text;
begin
  if tg_op = 'INSERT' then
    select i.user_id, i.bill_review_reading into v_owner, v_reading
      from public.ghg_inventories i where i.id = new.inventory_id;
    if v_owner is null or v_owner <> new.user_id then
      raise exception 'That inventory does not belong to this customer.' using errcode = '42501';
    end if;
    if v_reading is distinct from 'human' then
      raise exception 'Only a bill of a human-read inventory goes to the Bill Review team.' using errcode = '42501';
    end if;
    new.submitted_at := now();
    new.status := 'waiting';
    new.read_by := null;
    new.read_at := null;
    new.unreadable_note := null;
    return new;
  end if;
  -- UPDATE: one move, waiting to read or unreadable, and nothing else about the row.
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.inventory_id is distinct from old.inventory_id
     or new.source_doc_id is distinct from old.source_doc_id
     or new.file_path is distinct from old.file_path
     or new.file_name is distinct from old.file_name
     or new.document_type is distinct from old.document_type
     or new.location_id is distinct from old.location_id
     or new.location_name is distinct from old.location_name
     or new.submitted_at is distinct from old.submitted_at
     or new.expected_by is distinct from old.expected_by
     or new.expected_by_refusal is distinct from old.expected_by_refusal then
    raise exception 'A submitted bill''s record cannot be changed.' using errcode = '42501';
  end if;
  if old.status <> 'waiting' or new.status not in ('read', 'unreadable') or new.read_by is null then
    raise exception 'A bill moves once, from waiting to read or unreadable, naming who read it.' using errcode = '42501';
  end if;
  new.read_at := now();
  return new;
end;
$$;

comment on function public.bill_review_documents_guard() is
  'BR4: a submitted bill is recorded for a human-read inventory of its owner, then moves once to read or unreadable. '
  'See 20261013_bill_review_queue.sql.';

revoke all on function public.bill_review_documents_guard() from public, anon, authenticated;

drop trigger if exists trg_bill_review_documents_guard on public.bill_review_documents;
create trigger trg_bill_review_documents_guard
  before insert or update on public.bill_review_documents
  for each row execute function public.bill_review_documents_guard();

create or replace function public.bill_review_readings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user   uuid;
  v_inv    uuid;
  v_status text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'A reading is never changed. Save a corrected reading as a new row that supersedes it.' using errcode = '42501';
  end if;
  select d.user_id, d.inventory_id, d.status into v_user, v_inv, v_status
    from public.bill_review_documents d where d.id = new.bill_review_document_id;
  if v_user is null then
    raise exception 'No such submitted bill.' using errcode = '42501';
  end if;
  if v_status = 'unreadable' then
    raise exception 'This bill was recorded as unreadable.' using errcode = '42501';
  end if;
  if new.supersedes is not null and not exists (
    select 1 from public.bill_review_readings r
     where r.id = new.supersedes and r.bill_review_document_id = new.bill_review_document_id) then
    raise exception 'A correction must supersede a reading of the same bill.' using errcode = '42501';
  end if;
  new.user_id := v_user;
  new.inventory_id := v_inv;
  new.read_at := now();
  return new;
end;
$$;

comment on function public.bill_review_readings_guard() is
  'BR4: readings are append-only; the customer and inventory are the bill''s; a correction supersedes a reading of '
  'the same bill. See 20261013_bill_review_queue.sql.';

revoke all on function public.bill_review_readings_guard() from public, anon, authenticated;

drop trigger if exists trg_bill_review_readings_guard on public.bill_review_readings;
create trigger trg_bill_review_readings_guard
  before insert or update on public.bill_review_readings
  for each row execute function public.bill_review_readings_guard();

alter table public.bill_review_documents enable row level security;
alter table public.bill_review_readings enable row level security;

drop policy if exists bill_review_documents_select_own on public.bill_review_documents;
create policy bill_review_documents_select_own on public.bill_review_documents
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists bill_review_readings_select_own on public.bill_review_readings;
create policy bill_review_readings_select_own on public.bill_review_readings
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.bill_review_documents, public.bill_review_readings from public, anon, authenticated, service_role;

grant select (id, user_id, inventory_id, source_doc_id, file_path, file_name, document_type, location_id, location_name,
              status, submitted_at, expected_by, expected_by_refusal, read_at, unreadable_note)
  on public.bill_review_documents to authenticated;
grant select (id, bill_review_document_id, user_id, inventory_id, fuel_type, raw_value, raw_unit, period_start,
              period_end, delivery_date, source_quote, notes, supersedes, read_at)
  on public.bill_review_readings to authenticated;

grant select, insert, update on public.bill_review_documents to service_role;
grant select, insert on public.bill_review_readings to service_role;

notify pgrst, 'reload schema';
