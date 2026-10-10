-- NOT YET RUN. Written 10 Oct 2026 for the Bill Review staff notifications; Lisa runs it in the Supabase SQL editor and
-- records the run here.
-- RUN ORDER: 1 of 1, after 20261016_bill_review_notices.sql and 20261012_staff_roles_and_access_log.sql. Run it BEFORE
-- the app change (staff-notices.patch) is pushed; then supabase/verify/20261019_staff_notices_verify.sql.
--
-- Bill Review's outbox gains two staff emails: a new batch, and the morning digest
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Widens public.bill_review_notices (20261016):
--      kind: two more values, 'staff_new_batch' and 'staff_digest' (the constraint bill_review_notices_kind_check,
--        dropped and added again by name);
--      inventory_id: may be null, for the digest only (a CHECK says so: every other kind names its inventory);
--      dedupe_key: new, text, unique where set. What makes a staff email once only: one per bill_reader per batch
--        ('staff_new_batch:{first document id}:{reader}'), one per bill_reader per Toronto day
--        ('staff_digest:{yyyy-mm-dd}:{reader}'). The customer emails keep their own rule (bill_review_notice_documents).
--      user_id: for a staff email, the bill_reader it is sent to.
-- 2. Replaces bill_review_notices_guard() so dedupe_key cannot change after insert either (the rest as 20261016).
-- 3. Creates two enqueue functions, SECURITY DEFINER, service_role only:
--      bill_review_enqueue_staff_new_batch(p_document_id uuid): when the bill just submitted is the inventory's only
--        waiting bill (no other waiting bill on the saved inventory, not withdrawn), one email per active bill_reader;
--        returns the new notices' ids (none for a second bill of the same batch, none on a repeat call).
--      bill_review_enqueue_staff_digest(p_today date): when any bill is waiting (on its saved inventory, not
--        withdrawn), one email per active bill_reader for that day; returns the new notices' ids.
--    The emails' words are built when they are sent (lib/billReview/noticeEmails.ts): the company, the reporting-year
--    label, sites, counts and expected dates. Never a figure, a bill's contents, a file name or link, or a customer's
--    email address.
--
-- WHY
-- Ruled 10 Oct 2026 (staff notifications): staff were not told when bills arrived. Through BR7's outbox: sent once, up to
-- 5 attempts, failures kept and listed on the staff page under "Emails not sent".
--
-- NO RLS CHANGE. NO GRANT CHANGE on the tables (service_role: SELECT, UPDATE on notices, as 20261016). Execute on the
-- two new functions: revoked from public, anon and authenticated, granted to service_role.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md).
--
-- PRE-CHECK, run first:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = to_regclass('public.bill_review_notices') and contype = 'c' and pg_get_constraintdef(oid) like '%kind%';
-- PROCEED if it returns exactly one row named bill_review_notices_kind_check, listing 'ready' and 'overdue'. STOP and
-- report any other name: the drop below names it.
--   And: select (select count(*) from information_schema.columns where table_schema = 'public'
--                  and table_name = 'bill_review_notices' and column_name = 'dedupe_key') as dedupe_key,
--               to_regprocedure('public.bill_review_enqueue_staff_new_batch(uuid)') as new_batch,
--               to_regprocedure('public.bill_review_enqueue_staff_digest(date)') as digest;
-- PROCEED if dedupe_key is 0 and both functions are null.
--
-- VERIFY, after: supabase/verify/20261019_staff_notices_verify.sql (names the constraint, the column, its index, the
-- functions and their grants; proves once per batch and once per day in a rolled-back block).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS before ADD; ADD COLUMN IF NOT EXISTS; CREATE INDEX IF NOT EXISTS; CREATE OR
-- REPLACE FUNCTION; grants re-issued. ASCII only.

alter table public.bill_review_notices drop constraint if exists bill_review_notices_kind_check;
alter table public.bill_review_notices add constraint bill_review_notices_kind_check
  check (kind in ('ready', 'overdue', 'staff_new_batch', 'staff_digest'));

alter table public.bill_review_notices alter column inventory_id drop not null;
alter table public.bill_review_notices drop constraint if exists bill_review_notices_inventory_named;
alter table public.bill_review_notices add constraint bill_review_notices_inventory_named
  check ((kind = 'staff_digest') = (inventory_id is null));

alter table public.bill_review_notices add column if not exists dedupe_key text;
create unique index if not exists bill_review_notices_dedupe on public.bill_review_notices (dedupe_key) where dedupe_key is not null;

comment on column public.bill_review_notices.user_id is
  'Who the email is to: the customer for ready and overdue; the bill_reader for staff_new_batch and staff_digest.';
comment on column public.bill_review_notices.dedupe_key is
  'Staff emails only: once per bill_reader per batch, or per day. See 20261019_bill_review_staff_notices.sql.';

create or replace function public.bill_review_notices_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.attempts := 0;
    new.last_error := null;
    new.created_at := now();
    new.last_attempt_at := null;
    new.sent_at := null;
    return new;
  end if;
  if new.id is distinct from old.id or new.kind is distinct from old.kind
     or new.inventory_id is distinct from old.inventory_id or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at or new.dedupe_key is distinct from old.dedupe_key then
    raise exception 'A Bill Review email''s record cannot be changed.' using errcode = '42501';
  end if;
  if old.status = 'sent' then
    raise exception 'This email was sent; it is not sent again.' using errcode = '42501';
  end if;
  if new.attempts is distinct from old.attempts + 1 or new.status not in ('sent', 'failed') then
    raise exception 'Each update records one sending attempt, sent or failed.' using errcode = '42501';
  end if;
  if new.status = 'failed' and new.last_error is null then
    raise exception 'A failed attempt records its error.' using errcode = '42501';
  end if;
  new.last_attempt_at := now();
  if new.status = 'sent' then
    new.sent_at := now();
    new.last_error := null;
  else
    new.sent_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.bill_review_enqueue_staff_new_batch(p_document_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv uuid;
  v_ids uuid[] := '{}';
  v_id  uuid;
  r     record;
begin
  select d.inventory_id into v_inv from public.bill_review_documents d where d.id = p_document_id and d.status = 'waiting';
  if v_inv is null then
    return v_ids;
  end if;
  -- Serialised per inventory, as enqueue_ready is: a row lock, no trigger fires.
  perform 1 from public.ghg_inventories i where i.id = v_inv for update;
  -- Another bill of this inventory already waiting (on the saved inventory, not withdrawn): the batch has begun.
  if exists (
    select 1 from public.bill_review_documents d join public.ghg_inventories i on i.id = d.inventory_id
     where d.inventory_id = v_inv and d.id <> p_document_id and d.status = 'waiting'
       and pg_catalog.jsonb_path_exists(i.locations_data, '$[*].source_docs[*] ? (@.id == $id && !exists(@.withdrawn))',
             pg_catalog.jsonb_build_object('id', d.source_doc_id))) then
    return v_ids;
  end if;
  for r in select distinct s.user_id from public.staff_roles s where s.role = 'bill_reader' and s.revoked_at is null loop
    insert into public.bill_review_notices (kind, inventory_id, user_id, dedupe_key)
    values ('staff_new_batch', v_inv, r.user_id, 'staff_new_batch:' || p_document_id::text || ':' || r.user_id::text)
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_ids := v_ids || v_id;
      v_id := null;
    end if;
  end loop;
  return v_ids;
end;
$$;

comment on function public.bill_review_enqueue_staff_new_batch(uuid) is
  'Staff notifications: when a submitted bill starts a batch (no other bill of its inventory waiting), one email per '
  'active bill_reader, once. See 20261019_bill_review_staff_notices.sql.';

create or replace function public.bill_review_enqueue_staff_digest(p_today date)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
  v_id  uuid;
  r     record;
begin
  if not exists (
    select 1 from public.bill_review_documents d join public.ghg_inventories i on i.id = d.inventory_id
     where d.status = 'waiting'
       and pg_catalog.jsonb_path_exists(i.locations_data, '$[*].source_docs[*] ? (@.id == $id && !exists(@.withdrawn))',
             pg_catalog.jsonb_build_object('id', d.source_doc_id))) then
    return v_ids;
  end if;
  for r in select distinct s.user_id from public.staff_roles s where s.role = 'bill_reader' and s.revoked_at is null loop
    insert into public.bill_review_notices (kind, inventory_id, user_id, dedupe_key)
    values ('staff_digest', null, r.user_id, 'staff_digest:' || p_today::text || ':' || r.user_id::text)
    on conflict (dedupe_key) where dedupe_key is not null do nothing
    returning id into v_id;
    if v_id is not null then
      v_ids := v_ids || v_id;
      v_id := null;
    end if;
  end loop;
  return v_ids;
end;
$$;

comment on function public.bill_review_enqueue_staff_digest(date) is
  'Staff notifications: when any bill is waiting, one digest per active bill_reader per Toronto day. '
  'See 20261019_bill_review_staff_notices.sql.';

revoke all on function public.bill_review_enqueue_staff_new_batch(uuid) from public, anon, authenticated;
revoke all on function public.bill_review_enqueue_staff_digest(date) from public, anon, authenticated;
grant execute on function public.bill_review_enqueue_staff_new_batch(uuid) to service_role;
grant execute on function public.bill_review_enqueue_staff_digest(date) to service_role;

notify pgrst, 'reload schema';
