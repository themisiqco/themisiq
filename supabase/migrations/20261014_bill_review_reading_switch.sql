-- NOT YET RUN. Written 10 Oct 2026 for BR4; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 2 of 2. Run AFTER 20261013_bill_review_queue.sql AND AFTER the BR4 app change (br4b.patch) is deployed
-- and live: the extract route must refuse a submitted bill before a switch to AI becomes possible.
--
-- ghg_bill_review_reading_stamp(): a switch from specialist reading to AI reading is allowed again (BR4)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Replaces public.ghg_bill_review_reading_stamp() (20261011_bill_review_reading.sql) with the same function less one
-- refusal: a change of bill_review_reading from 'human' to 'ai'. Who and when are still stamped by the server on
-- every change, and kept on any other update. The trigger is unchanged; CREATE OR REPLACE keeps it and its grants.
--
-- WHY
-- Ruled 10 Oct 2026 (BR2, decision 1): human to AI was refused until BR4 recorded each submission. A switch applies
-- to later uploads only, and a bill uploaded while the inventory was human-read is never extracted, even after a
-- switch. Since BR4 the extract route refuses, before the file is fetched or the model is called:
--   (a) any bill with a submission record (public.bill_review_documents, by file_path);
--   (b) any bill stored before the inventory's last reading change (bill_review_reading_set_at), when the inventory
--       is AI-read now: that covers a bill uploaded while human-read whose submission never landed. If the stored
--       file's creation time cannot be read, the route refuses (fails closed).
-- The switch screen is BR6's. Until it exists, a switch is made only in the SQL editor.
--
-- NO RLS CHANGE. NO GRANT CHANGE.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md).
--
-- PRE-CHECK, run first:
--   select to_regclass('public.bill_review_documents') as documents,
--          (select prosrc like '%Switching it to AI reading is not available yet.%' from pg_proc
--            where oid = to_regprocedure('public.ghg_bill_review_reading_stamp()')) as lock_present;
-- PROCEED if documents is not null and lock_present is true, AND the BR4 app change is live (the wizard shows "With
-- our team" on a human-read upload). STOP otherwise.
--
-- VERIFY, after (names the function and its trigger directly):
--   select (prosrc not like '%Switching it to AI reading is not available yet.%') as lock_lifted,
--          (prosrc like '%new.bill_review_reading_set_at := now();%') as still_stamps,
--          prosecdef as definer,
--          (select count(*) from pg_trigger where tgname = 'trg_ghg_bill_review_reading_stamp' and not tgisinternal) as stamp_trigger
--   from pg_proc where oid = to_regprocedure('public.ghg_bill_review_reading_stamp()');
--   -- expect: lock_lifted true, still_stamps true, definer true, stamp_trigger 1.
--
-- Idempotent: CREATE OR REPLACE. ASCII only.

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
  'BR1, BR4: records who changed bill_review_reading and when, server side. Since BR4 a switch from human to ai is '
  'allowed; the extract route refuses every bill submitted or stored while the inventory was human-read. '
  'See 20261011_bill_review_reading.sql and 20261014_bill_review_reading_switch.sql.';

notify pgrst, 'reload schema';
