-- NOT YET RUN. Written 10 Oct 2026 for BR8; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: 1 of 1, after 20261012_staff_roles_and_access_log.sql and 20261015_bill_review_reading_staff_only.sql.
-- Run it BEFORE the BR8 app change (br8a-1.patch, br8a-2.patch) is pushed; then supabase/verify/20261017_br8_verify.sql.
--
-- Staff access log: four new actions; and staff_set_bill_review_reading(), the staff page's reading switch (BR8)
-- ---------------------------------------------------------------------------
-- WHAT IT DOES
-- 1. Widens public.staff_access_log's action list (the CHECK constraint staff_access_log_action_check, dropped and
--    added again by name) with four actions the specialist page writes:
--      mark_unreadable       a specialist marks a bill unreadable, with a note;
--      set_reading           a lead changes an inventory's reading (Q1, on the customer's request);
--      view_reading_switch   a lead opens the switch's confirmation screen for an inventory;
--      view_spot_checks      a specialist opens the spot-check sample (BR8b).
--    The six existing actions stay: view_queue, view_document, save_reading, view_ai_reading, record_spot_check,
--    view_access_log.
-- 2. Creates public.staff_set_bill_review_reading(p_inventory_id uuid, p_reading text, p_staff_user_id uuid), SECURITY
--    DEFINER, executable by service_role only. It requires p_staff_user_id to hold an active bill_review_lead role,
--    sets that user as the transaction's user (request.jwt.claims, the value auth.uid() reads; it ends with the
--    transaction), and updates the reading, so ghg_bill_review_reading_stamp() stamps the lead as set_by (20261015)
--    and the audit trigger records the change with the lead's id. Returns the new bill_review_reading_set_at.
--    The staff route (/api/staff/bill-review/reading-switch) calls it after requireStaffRole('bill_review_lead') and
--    after writing its set_reading log row.
--
-- WHY
-- Ruled 10 Oct 2026 (BR8 decisions 1, 2; Q1): staff change an inventory's reading from the staff page.
-- supabase/manual/20261015_set_bill_review_reading.sql stays in the repo as the fallback, for when the page cannot be
-- used; it does the same thing by hand.
--
-- NO RLS CHANGE. GRANTS: execute on the new function revoked from public, anon and authenticated, granted to
-- service_role. Nothing else changes.
--
-- SCHEMA RELOAD: ends with notify pgrst, 'reload schema'; (CLAUDE.md). The staff route calls the function through the
-- API.
--
-- PRE-CHECK, run first:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = to_regclass('public.staff_access_log') and contype = 'c' and conname like '%action%';
-- PROCEED if it returns exactly one row named staff_access_log_action_check, listing the six actions above. STOP and
-- report any other name or list: the drop below names it.
--   And: select to_regprocedure('public.staff_set_bill_review_reading(uuid, text, uuid)') as switch_fn,
--               (select prosrc like '%bill_review_lead%' from pg_proc
--                 where oid = to_regprocedure('public.ghg_bill_review_reading_stamp()')) as staff_only;
-- PROCEED if switch_fn is null and staff_only is true (20261015 ran).
--
-- VERIFY, after: supabase/verify/20261017_br8_verify.sql (names the constraint, the function and its grants; proves the
-- function refuses a non-lead and stamps a lead, inside a rolled-back block).
--
-- Idempotent: DROP CONSTRAINT IF EXISTS before ADD; CREATE OR REPLACE FUNCTION; grants re-issued. ASCII only.

alter table public.staff_access_log drop constraint if exists staff_access_log_action_check;
alter table public.staff_access_log add constraint staff_access_log_action_check
  check (action in ('view_queue', 'view_document', 'save_reading', 'view_ai_reading', 'record_spot_check', 'view_access_log',
                    'mark_unreadable', 'set_reading', 'view_reading_switch', 'view_spot_checks'));

create or replace function public.staff_set_bill_review_reading(p_inventory_id uuid, p_reading text, p_staff_user_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if p_reading is null or p_reading not in ('ai', 'human') then
    raise exception 'The reading must be ai or human.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.staff_roles s
     where s.user_id = p_staff_user_id and s.role = 'bill_review_lead' and s.revoked_at is null) then
    raise exception 'The reading of an inventory''s bills is changed by ThemisIQ on request.' using errcode = '42501';
  end if;
  perform pg_catalog.set_config('request.jwt.claims',
    pg_catalog.json_build_object('sub', p_staff_user_id, 'role', 'authenticated')::text, true);
  update public.ghg_inventories set bill_review_reading = p_reading where id = p_inventory_id
    returning bill_review_reading_set_at into v_at;
  if not found then
    raise exception 'No such inventory.' using errcode = 'P0002';
  end if;
  return v_at;
end;
$$;

comment on function public.staff_set_bill_review_reading(uuid, text, uuid) is
  'BR8 (Q1): a bill_review_lead changes an inventory''s reading from the staff page; the stamp trigger records the lead '
  'as set_by. service_role only. See supabase/migrations/20261017_staff_actions_and_reading_switch.sql.';

revoke all on function public.staff_set_bill_review_reading(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.staff_set_bill_review_reading(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
