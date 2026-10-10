-- NOT YET RUN. Written 10 Oct 2026 for BR7; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1, after 20261013_bill_review_queue.sql. Run it BEFORE the BR7 app change (br7b.patch) is pushed;
-- then supabase/verify/20261016_br7_verify.sql.
--
-- public.bill_review_notices and public.bill_review_notice_documents: the Bill Review emails' outbox (BR7)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Creates public.bill_review_notices: one row per email to a customer, of two kinds:
--      'overdue'  one bill is past its expected date (Q7: the morning after, once per bill);
--      'ready'    the last waiting bill of an inventory has been read, read or unreadable (Q8: once per batch).
--    Each row records its sending: status pending, then sent or failed, the number of attempts (at most 5), the last
--    error and when. A failed row stays, for staff to see (BR8). Never deleted except with its inventory.
-- 2. Creates public.bill_review_notice_documents: which bills each email is about. The key (document_id, kind) means a
--    bill is in at most one 'overdue' email and at most one 'ready' email, ever: that is what makes both once only,
--    even with two callers at the same moment.
-- 3. Creates public.bill_review_notices_guard() and its trigger: an email is recorded as pending; each update is one
--    sending attempt (attempts + 1), ending sent (with the server's time) or failed (with the error); a sent email is
--    never changed again; nothing else about it changes.
-- 4. Creates public.bill_review_enqueue_ready(uuid) and public.bill_review_enqueue_overdue(date): the only writers of
--    new emails, SECURITY DEFINER, executable by service_role only.
--      enqueue_ready(inventory): if no bill of the inventory is still waiting (a waiting bill counts only while it is
--        on the saved inventory and not withdrawn: T18's record, BR4 ruling), records one 'ready' email for every bill
--        read or unreadable since the last one, and returns its id; else null. The inventory row is locked first, so
--        two calls are serialised.
--      enqueue_overdue(today): records one 'overdue' email for each waiting bill on the saved inventory, not withdrawn,
--        whose expected_by is before `today` (the Toronto date, passed by the caller), that has none yet; returns how
--        many. Serialised by an advisory lock.
-- 5. Row level security with no policy, the grants, and the schema reload.
--
-- WHY
-- Ruled 10 Oct 2026 (Q7, Q8, BR7 decision 5). Until now no email in the product recorded its sending or retried a
-- failure (the BR7 audit). The app (lib/billReview/notices.ts) sends each pending or failed email, up to 5 attempts:
-- at once when enqueued, and again from the daily job (/api/cron/bill-review-notices, Vercel Cron, 13:00 UTC).
--
-- NOT TOUCHED: public.bill_review_documents and its guard. Nothing new is written there.
--
-- RLS ADDED: row level security on both tables, NO policy. Reachable by service_role only (and the owner).
--
-- GRANTS (revoke first; grants are separate from RLS):
--   all revoked from public, anon, authenticated and service_role, then
--   service_role: SELECT, UPDATE on bill_review_notices (the sender records each attempt); SELECT on
--     bill_review_notice_documents. No INSERT for any role: emails are recorded only by the two functions. No DELETE.
--   anon, authenticated: nothing.
-- Execute: the guard function revoked from public, anon and authenticated; the two enqueue functions revoked from
-- public, anon and authenticated and granted to service_role.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md). The app calls the functions through the API.
--
-- PRE-CHECK, run first:
--   select to_regclass('public.bill_review_notices') as notices,
--          to_regclass('public.bill_review_notice_documents') as notice_documents,
--          to_regprocedure('public.bill_review_notices_guard()') as guard,
--          to_regprocedure('public.bill_review_enqueue_ready(uuid)') as enqueue_ready,
--          to_regprocedure('public.bill_review_enqueue_overdue(date)') as enqueue_overdue,
--          to_regclass('public.bill_review_documents') as documents;
-- PROCEED if the first five are null and documents is not null (20261013 ran). STOP otherwise.
--
-- VERIFY, after: supabase/verify/20261016_br7_verify.sql (names each table, index, function and trigger; checks every
-- privilege; proves once-only and the attempt rule inside a rolled-back block).
--
-- Idempotent: IF NOT EXISTS on the tables and index, CREATE OR REPLACE on the functions, DROP TRIGGER IF EXISTS before
-- CREATE TRIGGER, grants re-issued. ASCII only.

create table if not exists public.bill_review_notices (
  id               uuid        primary key default gen_random_uuid(),
  kind             text        not null check (kind in ('ready', 'overdue')),
  inventory_id     uuid        not null references public.ghg_inventories(id) on delete cascade,
  user_id          uuid        not null,
  status           text        not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts         integer     not null default 0 check (attempts between 0 and 5),
  last_error       text,
  created_at       timestamptz not null default now(),
  last_attempt_at  timestamptz,
  sent_at          timestamptz,
  check ((status = 'sent') = (sent_at is not null))
);

create index if not exists bill_review_notices_unsent on public.bill_review_notices (status) where status <> 'sent';

comment on table public.bill_review_notices is
  'BR7: the Bill Review emails to customers (overdue: once per bill; ready: once per batch), with each sending attempt. '
  'Written by bill_review_enqueue_ready / _overdue; sent by lib/billReview/notices.ts. '
  'See supabase/migrations/20261016_bill_review_notices.sql.';

create table if not exists public.bill_review_notice_documents (
  document_id  uuid  not null references public.bill_review_documents(id) on delete cascade,
  kind         text  not null check (kind in ('ready', 'overdue')),
  notice_id    uuid  not null references public.bill_review_notices(id) on delete cascade,
  primary key (document_id, kind)
);

comment on table public.bill_review_notice_documents is
  'BR7: the bills each Bill Review email is about. The key (document_id, kind) puts a bill in at most one email of '
  'each kind. See supabase/migrations/20261016_bill_review_notices.sql.';

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
     or new.created_at is distinct from old.created_at then
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

comment on function public.bill_review_notices_guard() is
  'BR7: an email is recorded pending; each update is one attempt, sent or failed with its error; sent is final. '
  'See 20261016_bill_review_notices.sql.';

revoke all on function public.bill_review_notices_guard() from public, anon, authenticated;

drop trigger if exists trg_bill_review_notices_guard on public.bill_review_notices;
create trigger trg_bill_review_notices_guard
  before insert or update on public.bill_review_notices
  for each row execute function public.bill_review_notices_guard();

create or replace function public.bill_review_enqueue_ready(p_inventory_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_docs uuid[];
  v_id   uuid;
begin
  -- Lock the inventory row first, so two calls for one inventory run one after the other. A row lock: no trigger fires.
  select i.user_id into v_user from public.ghg_inventories i where i.id = p_inventory_id for update;
  if v_user is null then
    return null;
  end if;
  -- A bill still waiting, on the saved inventory and not withdrawn: the batch is not complete.
  if exists (
    select 1 from public.bill_review_documents d join public.ghg_inventories i on i.id = d.inventory_id
     where d.inventory_id = p_inventory_id and d.status = 'waiting'
       and pg_catalog.jsonb_path_exists(i.locations_data, '$[*].source_docs[*] ? (@.id == $id && !exists(@.withdrawn))',
             pg_catalog.jsonb_build_object('id', d.source_doc_id))) then
    return null;
  end if;
  -- Every bill read or unreadable since the last ready email, still on the saved inventory.
  select pg_catalog.array_agg(d.id order by d.read_at, d.id) into v_docs
    from public.bill_review_documents d join public.ghg_inventories i on i.id = d.inventory_id
   where d.inventory_id = p_inventory_id and d.status in ('read', 'unreadable')
     and pg_catalog.jsonb_path_exists(i.locations_data, '$[*].source_docs[*] ? (@.id == $id)',
           pg_catalog.jsonb_build_object('id', d.source_doc_id))
     and not exists (select 1 from public.bill_review_notice_documents n where n.document_id = d.id and n.kind = 'ready');
  if v_docs is null then
    return null;
  end if;
  insert into public.bill_review_notices (kind, inventory_id, user_id) values ('ready', p_inventory_id, v_user)
    returning id into v_id;
  insert into public.bill_review_notice_documents (document_id, kind, notice_id)
    select x, 'ready', v_id from pg_catalog.unnest(v_docs) as x;
  return v_id;
end;
$$;

comment on function public.bill_review_enqueue_ready(uuid) is
  'BR7 (Q8): when no bill of the inventory is still with the team, record one ready email for the bills read since '
  'the last one; returns its id, or null. See 20261016_bill_review_notices.sql.';

create or replace function public.bill_review_enqueue_overdue(p_today date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r    record;
  v_id uuid;
  v_n  integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('bill_review_enqueue_overdue'));
  for r in
    select d.id, d.inventory_id, d.user_id
      from public.bill_review_documents d join public.ghg_inventories i on i.id = d.inventory_id
     where d.status = 'waiting' and d.expected_by < p_today
       and pg_catalog.jsonb_path_exists(i.locations_data, '$[*].source_docs[*] ? (@.id == $id && !exists(@.withdrawn))',
             pg_catalog.jsonb_build_object('id', d.source_doc_id))
       and not exists (select 1 from public.bill_review_notice_documents n where n.document_id = d.id and n.kind = 'overdue')
     order by d.expected_by, d.id
  loop
    insert into public.bill_review_notices (kind, inventory_id, user_id) values ('overdue', r.inventory_id, r.user_id)
      returning id into v_id;
    insert into public.bill_review_notice_documents (document_id, kind, notice_id) values (r.id, 'overdue', v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function public.bill_review_enqueue_overdue(date) is
  'BR7 (Q7): record one overdue email for each bill still with the team past its expected date, once per bill; '
  'returns how many. today is the Toronto date. See 20261016_bill_review_notices.sql.';

revoke all on function public.bill_review_enqueue_ready(uuid) from public, anon, authenticated;
revoke all on function public.bill_review_enqueue_overdue(date) from public, anon, authenticated;
grant execute on function public.bill_review_enqueue_ready(uuid) to service_role;
grant execute on function public.bill_review_enqueue_overdue(date) to service_role;

alter table public.bill_review_notices enable row level security;
alter table public.bill_review_notice_documents enable row level security;

revoke all on public.bill_review_notices, public.bill_review_notice_documents from public, anon, authenticated, service_role;
grant select, update on public.bill_review_notices to service_role;
grant select on public.bill_review_notice_documents to service_role;

notify pgrst, 'reload schema';
