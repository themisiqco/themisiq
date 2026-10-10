-- NOT YET RUN. Written 10 Oct 2026 for BR3; Lisa runs it in the Supabase SQL editor and records the run here.
-- RUN ORDER: after supabase/migrations/20261012_staff_roles_and_access_log.sql AND its verify
-- (supabase/verify/20261012_br3_verify.sql). Not a migration: it names a person, so it is kept out of
-- supabase/migrations and holds no personal data until Lisa types her sign-in email below.
--
-- The first Bill Review staff roles: Lisa holds both, bill_reader and bill_review_lead (BR3 ruling, 3 Oct 2026).
-- BEFORE RUNNING: replace <your sign-in email> below with the email you sign in to ThemisIQ with. Do not save the file
-- with the email in it.
--
-- SELF-GRANTED, AND SAYS SO. The first grant has no one else to grant it, so granted_by is the same user. Every later
-- grant names the lead who made it: insert into public.staff_roles (user_id, role, granted_by) values (...).
--
-- Refuses unless exactly one user has that email. Re-running is a no-op: an active row for the same user and role is
-- skipped (the partial unique index staff_roles_one_active).
--
-- VERIFY, after:
--   select u.email, s.role, s.granted_by = s.user_id as self_granted, s.granted_at, s.revoked_at
--   from public.staff_roles s join auth.users u on u.id = s.user_id
--   order by s.role;
--   -- expect two rows: bill_review_lead and bill_reader, your email on both, self_granted true, revoked_at null.
--   select count(*) as audit_rows from public.audit_log where table_name = 'staff_roles' and action = 'INSERT';
--   -- expect 2 the first time (log_audit records each grant).

do $$
declare
  v_user uuid;
  v_n    integer;
begin
  select count(*) into v_n from auth.users where lower(email) = lower('<your sign-in email>');
  if v_n <> 1 then
    raise exception 'Expected exactly one user with that email, found %. Nothing was granted.', v_n;
  end if;
  select id into v_user from auth.users where lower(email) = lower('<your sign-in email>');
  insert into public.staff_roles (user_id, role, granted_by)
  select v_user, r.role, v_user from unnest(array['bill_reader', 'bill_review_lead']) as r(role)
  on conflict (user_id, role) where revoked_at is null do nothing;
end $$;
