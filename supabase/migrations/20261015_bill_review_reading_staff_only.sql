-- NOT YET RUN. Written 10 Oct 2026 for BR6; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1, after 20261014_bill_review_reading_switch.sql and 20261012_staff_roles_and_access_log.sql. Run it
-- BEFORE the BR6 app change is pushed (nothing in the app writes the reading, so the order is safe either way).
--
-- ghg_bill_review_reading_stamp(): the reading of an inventory's bills is changed by ThemisIQ staff only (BR6, Q1)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- Replaces public.ghg_bill_review_reading_stamp() (20261014_bill_review_reading_switch.sql). Any change of
-- ghg_inventories.bill_review_reading, and any insert as 'human', now needs (select auth.uid()) to hold an active
-- bill_review_lead role in public.staff_roles; otherwise it is refused, errcode 42501: "The reading of an
-- inventory's bills is changed by ThemisIQ on request." So bill_review_reading_set_by is always a lead's user id,
-- never null and never the customer's. An insert as 'ai' (the default, every new inventory) still works for anyone,
-- and leaves set_by and set_at null. Any other update keeps set_by and set_at as they were.
--
-- WHY
-- Ruled 10 Oct 2026 (Q1): specialist reading is by request only. There is no self-serve switch and no self-serve
-- price. A customer asks; ThemisIQ quotes and invoices by hand, then sets the inventory to human reading. Until now
-- the customer's own table-level UPDATE on ghg_inventories (granted to authenticated) let them change their reading
-- through the API, in either direction: a column grant cannot narrow a table-level one, so the trigger is where the
-- rule is held. The page has never written the reading.
--
-- HOW STAFF CHANGE IT, UNTIL BR8: supabase/manual/20261015_set_bill_review_reading.sql, which sets the lead's id as the
-- request's user for one transaction (request.jwt.claims, the value auth.uid() reads), so the trigger stamps them. BR8
-- builds the staff action (requireStaffRole('bill_review_lead'), logged first in staff_access_log).
--
-- The function stays SECURITY DEFINER with an empty search_path, so it reads staff_roles (service_role only) as its
-- owner. The trigger trg_ghg_bill_review_reading_stamp is unchanged; CREATE OR REPLACE keeps it and the grants.
--
-- NO RLS CHANGE. NO GRANT CHANGE.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md).
--
-- PRE-CHECK, run first:
--   select to_regclass('public.staff_roles') as staff_roles,
--          (select prosrc not like '%Switching it to AI reading is not available yet.%' from pg_proc
--            where oid = to_regprocedure('public.ghg_bill_review_reading_stamp()')) as switch_lifted,
--          (select count(*) from public.staff_roles where role = 'bill_review_lead' and revoked_at is null) as active_leads;
-- PROCEED if staff_roles is not null and switch_lifted is true (20261014 ran). active_leads should be 1 or more
-- (supabase/manual/20261012_staff_initial_grant.sql ran); with 0, no one can change a reading until a lead exists.
--
-- VERIFY, after: supabase/verify/20261015_br6_verify.sql. It names the function and its trigger, and proves the rule
-- inside a rolled-back block on a temporary copy of the table (no real inventory is touched): a customer's insert as
-- 'ai' is allowed, a customer's insert as 'human' and update of the reading are refused, and a lead's update is
-- allowed and stamps the lead as set_by.
--
-- Idempotent: CREATE OR REPLACE. ASCII only.

create or replace function public.ghg_bill_review_reading_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_lead boolean;
begin
  if tg_op = 'INSERT' then
    if new.bill_review_reading = 'ai' then
      new.bill_review_reading_set_by := null;
      new.bill_review_reading_set_at := null;
      return new;
    end if;
  elsif new.bill_review_reading is not distinct from old.bill_review_reading then
    new.bill_review_reading_set_by := old.bill_review_reading_set_by;
    new.bill_review_reading_set_at := old.bill_review_reading_set_at;
    return new;
  end if;
  -- A change, or an insert as human: ThemisIQ staff only, on request (Q1).
  select exists (
    select 1 from public.staff_roles s
     where s.user_id = v_uid and s.role = 'bill_review_lead' and s.revoked_at is null
  ) into v_lead;
  if v_uid is null or not v_lead then
    raise exception 'The reading of an inventory''s bills is changed by ThemisIQ on request.' using errcode = '42501';
  end if;
  new.bill_review_reading_set_by := v_uid;
  new.bill_review_reading_set_at := now();
  return new;
end;
$$;

comment on function public.ghg_bill_review_reading_stamp() is
  'BR1, BR4, BR6: a change of bill_review_reading, or an insert as human, needs an active bill_review_lead (Q1: '
  'specialist reading is by request only), who is stamped as set_by with the server''s time. An insert as ai works '
  'for anyone. See 20261011_bill_review_reading.sql, 20261014 and 20261015_bill_review_reading_staff_only.sql.';

notify pgrst, 'reload schema';
