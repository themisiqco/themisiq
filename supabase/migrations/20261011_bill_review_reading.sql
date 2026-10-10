-- NOT YET RUN. Written 10 Oct 2026 for BR1; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1. Run BEFORE the BR1/BR2 app change is pushed (DEPLOY ORDER below).
--
-- ghg_inventories.bill_review_reading: how this inventory's bills are read (BR1)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Adds three columns to public.ghg_inventories:
--      bill_review_reading         text NOT NULL DEFAULT 'ai', CHECK in ('ai', 'human'): 'ai' = the AI reads, the
--                                  customer confirms; 'human' = a ThemisIQ specialist reads, the customer confirms, and
--                                  no document of this inventory is sent to the AI (BR2 enforces it in the extract route);
--      bill_review_reading_set_by  uuid: who last changed it; null while it has never been changed;
--      bill_review_reading_set_at  timestamptz: when.
-- 2. Creates public.ghg_bill_review_reading_stamp() and its BEFORE INSERT OR UPDATE trigger. It sets set_by and set_at
--    itself, from (select auth.uid()) and now(), whenever the reading changes, and keeps them otherwise: never taken
--    from the client. It refuses a change from 'human' to 'ai' (see ONE WAY, below).
-- 3. Grants the three columns, column-scoped (GRANTS below), and reloads the API schema cache.
--
-- WHY
-- Ruled 3 Oct 2026 (section 10, "BR: reading choice" and "BR: human-reading guarantee"); BR1 in
-- docs/review/design-derived-figures.md. No price is added: lib/pricing.ts already holds BILL_REVIEW_ONBOARDING_USD
-- (ai and human), BILL_REVIEW_SOURCE_USD and billReviewQuote; BILL_REVIEW_HUMAN_READING_SELLABLE stays false.
--
-- ONE WAY, UNTIL BR4. A switch applies to later uploads only, and a bill uploaded while the inventory was human-read
-- must never be extracted, even after a switch to AI. The design ties that to BR4's submission record, which does not
-- exist yet. Until it does, the trigger refuses a switch from 'human' to 'ai', so "the inventory is human-read now"
-- is a complete test for the extract route. BR4 lifts the refusal in the same change that records each submission.
--
-- AUDIT: the audit trigger on ghg_inventories (audit_ghg_inventories, log_audit()) records whole rows, so every change
-- of these columns is in audit_log with old and new values. NOT IN THE VERIFIER PROJECTION: ghg_verifier_projection
-- names its sixteen keys and these are not among them (lib/ghg/verifierWhitelist.test.ts).
--
-- ENTITLEMENT: trg_enforce_ghg_location_allowance fires on every UPDATE, so changing only the reading still needs an
-- active GHG pass (or the free row). Bill Review requires an active GHG plan, so this is as intended.
--
-- GRANTS (grants are separate from RLS). authenticated holds table-level SELECT, INSERT, UPDATE, DELETE on
-- ghg_inventories, which reaches new columns; they are granted again column-scoped below, as 20261008 and 20261009
-- grant theirs, so the record names them. Column-scoped PER PRIVILEGE, "select (cols), insert (cols), update (cols)",
-- as 20261008_ghg_factor_selection.sql does: "grant select, insert, update (cols)" attaches the column list to UPDATE
-- alone and grants SELECT and INSERT on the whole table (lib/ghg/columnGrants.test.ts pins the form in every
-- migration that grants columns on ghg_inventories). service_role: SELECT on the three (a later specialist route
-- reads them; it holds no table-level UPDATE and gets none here). anon: nothing.
-- set_by and set_at are writable by authenticated through the table-level grant; the trigger overwrites any value
-- sent, so what is stored is always the server's.
--
-- NO RLS CHANGE. ghg_inventories_owner governs the rows and covers every column.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md, the two rules for every new migration). The
-- extract route reads bill_review_reading through the API.
--
-- PRE-CHECK, run first:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'ghg_inventories'
--     and column_name in ('bill_review_reading', 'bill_review_reading_set_by', 'bill_review_reading_set_at');
-- PROCEED if it returns no rows. STOP and report any row: the columns exist and must be compared before re-running.
--   And: select grantee, column_name, privilege_type from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'ghg_inventories' and grantee not in ('postgres', 'supabase_admin')
--     and not (grantee = 'authenticated' and privilege_type in ('SELECT', 'INSERT', 'UPDATE'))
--     and not (grantee = 'service_role' and privilege_type in ('SELECT', 'REFERENCES'))
--   order by grantee, column_name, privilege_type;
-- PROCEED if the only row is service_role UPDATE on free_tier. STOP and report any other row.
--
-- VERIFY, after (each names the new objects directly; no count is the proof):
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--   where table_schema = 'public' and table_name = 'ghg_inventories'
--     and column_name in ('bill_review_reading', 'bill_review_reading_set_by', 'bill_review_reading_set_at')
--   order by column_name;
--   -- expect: bill_review_reading text NO 'ai'::text; bill_review_reading_set_at timestamp with time zone YES null;
--   --         bill_review_reading_set_by uuid YES null.
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'ghg_inventories_bill_review_reading_chk';
--   -- expect: CHECK ((bill_review_reading = ANY (ARRAY['ai'::text, 'human'::text])))
--   select to_regprocedure('public.ghg_bill_review_reading_stamp()') as stamp_fn,
--          (select count(*) from pg_trigger where tgname = 'trg_ghg_bill_review_reading_stamp' and not tgisinternal) as stamp_trigger;
--   -- expect: stamp_fn not null; stamp_trigger 1.
--   select grantee, column_name, privilege_type from information_schema.column_privileges
--   where table_schema = 'public' and table_name = 'ghg_inventories' and column_name like 'bill_review_reading%'
--     and grantee in ('anon', 'authenticated', 'service_role')
--   order by grantee, column_name, privilege_type;
--   -- expect: authenticated INSERT, SELECT, UPDATE on each; service_role SELECT on each (and REFERENCES if inherited);
--   --         no anon row.
--   select count(*) as not_ai from public.ghg_inventories where bill_review_reading <> 'ai';
--   -- expect: 0 (every existing inventory is AI-read by default).
--
-- DEPLOY ORDER: run this BEFORE pushing the app change that reads the column. Before it runs, the new extract route
-- cannot read the reading and refuses every extraction (it fails closed). The current app neither reads nor writes
-- these columns: its save names its columns, so the default holds.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; the CHECK is dropped and re-added by name; CREATE OR REPLACE FUNCTION; DROP
-- TRIGGER IF EXISTS before CREATE TRIGGER; grants re-issued. ASCII only.

alter table public.ghg_inventories
  add column if not exists bill_review_reading        text not null default 'ai',
  add column if not exists bill_review_reading_set_by uuid references auth.users(id),
  add column if not exists bill_review_reading_set_at timestamptz;

alter table public.ghg_inventories drop constraint if exists ghg_inventories_bill_review_reading_chk;
alter table public.ghg_inventories add constraint ghg_inventories_bill_review_reading_chk
  check (bill_review_reading in ('ai', 'human'));

comment on column public.ghg_inventories.bill_review_reading is
  'Bill Review: how this inventory''s bills are read. ai = the AI reads, the customer confirms (default); human = a '
  'ThemisIQ specialist reads, the customer confirms, and no document is ever sent to the AI. A change applies to later '
  'uploads only; human to ai is refused until BR4. See supabase/migrations/20261011_bill_review_reading.sql.';
comment on column public.ghg_inventories.bill_review_reading_set_by is
  'BR1: who last changed bill_review_reading; set by trg_ghg_bill_review_reading_stamp, never by the client.';
comment on column public.ghg_inventories.bill_review_reading_set_at is
  'BR1: when bill_review_reading last changed; set by trg_ghg_bill_review_reading_stamp, never by the client.';

create or replace function public.ghg_bill_review_reading_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.bill_review_reading = 'ai' then
      new.bill_review_reading_set_by := null;
      new.bill_review_reading_set_at := null;
    else
      new.bill_review_reading_set_by := (select auth.uid());
      new.bill_review_reading_set_at := now();
    end if;
    return new;
  end if;
  if new.bill_review_reading is distinct from old.bill_review_reading then
    if old.bill_review_reading = 'human' and new.bill_review_reading = 'ai' then
      raise exception 'This inventory''s bills are read by a ThemisIQ specialist. Switching it to AI reading is not available yet.'
        using errcode = '42501';
    end if;
    new.bill_review_reading_set_by := (select auth.uid());
    new.bill_review_reading_set_at := now();
  else
    new.bill_review_reading_set_by := old.bill_review_reading_set_by;
    new.bill_review_reading_set_at := old.bill_review_reading_set_at;
  end if;
  return new;
end;
$$;

comment on function public.ghg_bill_review_reading_stamp() is
  'BR1: records who changed bill_review_reading and when, server side; refuses human to ai until BR4. '
  'See 20261011_bill_review_reading.sql.';

revoke all on function public.ghg_bill_review_reading_stamp() from public, anon, authenticated;

drop trigger if exists trg_ghg_bill_review_reading_stamp on public.ghg_inventories;
create trigger trg_ghg_bill_review_reading_stamp
  before insert or update on public.ghg_inventories
  for each row execute function public.ghg_bill_review_reading_stamp();

grant select (bill_review_reading, bill_review_reading_set_by, bill_review_reading_set_at),
      insert (bill_review_reading, bill_review_reading_set_by, bill_review_reading_set_at),
      update (bill_review_reading, bill_review_reading_set_by, bill_review_reading_set_at)
  on public.ghg_inventories to authenticated;
grant select (bill_review_reading, bill_review_reading_set_by, bill_review_reading_set_at)
  on public.ghg_inventories to service_role;

notify pgrst, 'reload schema';
