-- NOT YET RUN. Written 10 Oct 2026 for BR6; Lisa runs it in the Supabase SQL editor, once per request, and records
-- each run here (date, inventory, reading).
-- RUN ORDER: after supabase/migrations/20261015_bill_review_reading_staff_only.sql and its verify. Not a migration: it
-- is run by hand for one customer's request, and holds no personal data until the placeholders are filled in.
--
-- Set one inventory's reading, on the customer's request (Q1, ruled 10 Oct 2026: specialist reading is by request
-- only; ThemisIQ quotes and invoices by hand, then sets the inventory to human reading). Until BR8's staff action.
--
-- BEFORE RUNNING, replace the three placeholders below, and do not save the file with them filled in:
--   <your sign-in email>   the email you sign in to ThemisIQ with (you must hold an active bill_review_lead role)
--   <inventory id>         the inventory's id (the id= in its wizard address)
--   <ai or human>          ai or human
--
-- WHAT IT DOES, in one transaction: checks you are an active bill_review_lead, sets you as this transaction's user
-- (request.jwt.claims, the value auth.uid() reads; it ends with the transaction), and updates the reading. The trigger
-- ghg_bill_review_reading_stamp() then stamps you as bill_review_reading_set_by with the server's time, and the audit
-- trigger records the change in audit_log with your id. The customer's GHG plan must be active (the entitlement
-- trigger on ghg_inventories refuses the update otherwise).
--
-- WHAT THE CUSTOMER SEES AFTERWARDS: on the Energy & fuel data step, the new reading, and "Since {date}, ..." (BR6).
-- Bills already uploaded keep their reading; bills already with our team stay with our team.
--
-- BEFORE SWITCHING AI TO SPECIALIST, tell the customer how many bills were already read by the AI:
--   select (select count(*) from jsonb_path_query(i.locations_data, '$[*].source_docs[*] ? (exists (@.extracted[*]) && !exists (@.bill_review))')) as read_by_ai,
--          i.bill_review_reading as reading_now, i.company_name, i.reporting_year
--   from public.ghg_inventories i where i.id = '<inventory id>';
--
-- VERIFY, after:
--   select i.bill_review_reading, i.bill_review_reading_set_at, u.email as set_by
--   from public.ghg_inventories i left join auth.users u on u.id = i.bill_review_reading_set_by
--   where i.id = '<inventory id>';
--   -- expect: the reading you set, set_at a moment ago, set_by your email (never null).

do $$
declare
  v_lead    uuid;
  v_n       integer;
  v_inv     uuid := '<inventory id>';
  v_reading text := '<ai or human>';
begin
  if v_reading not in ('ai', 'human') then
    raise exception 'The reading must be ai or human. Nothing was changed.';
  end if;
  select count(*) into v_n from auth.users u
   where lower(u.email) = lower('<your sign-in email>')
     and exists (select 1 from public.staff_roles s where s.user_id = u.id and s.role = 'bill_review_lead' and s.revoked_at is null);
  if v_n <> 1 then
    raise exception 'Expected exactly one active bill_review_lead with that email, found %. Nothing was changed.', v_n;
  end if;
  select u.id into v_lead from auth.users u where lower(u.email) = lower('<your sign-in email>');
  perform set_config('request.jwt.claims', json_build_object('sub', v_lead, 'role', 'authenticated')::text, true);
  update public.ghg_inventories set bill_review_reading = v_reading where id = v_inv;
  if not found then
    raise exception 'No inventory with that id. Nothing was changed.';
  end if;
end $$;
