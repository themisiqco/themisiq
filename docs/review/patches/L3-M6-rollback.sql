-- docs/review/patches/L3-M6-rollback.sql
--
-- ⚠️ NOT RUN. Rollback for L3-M6-profiles-on-signup.sql.
--
-- WHAT IT DOES. Removes the trigger and the function, so new sign-ups stop creating profiles, and puts the grants back
-- as they were (nothing for anon or authenticated; service_role back to REFERENCES, TRIGGER, TRUNCATE, MAINTAIN only).
--
-- WHAT IT KEEPS, ON PURPOSE. The profile rows and the three columns (full_name, signup_source, country). They hold
-- sign-up data that the claim route and the leads view have written; dropping them is a separate decision. To drop
-- them as well, run the two commented statements at the end by hand.
--
-- ⚠️ With the grants revoked, /api/ghg/free-calc/claim can no longer update profiles: the claim itself still succeeds
-- (the profile step is best effort and logged), but leads lose name, company and country until M6 is run again.
--
-- RUN WITH: the Supabase SQL editor, the whole file, one transaction.

begin;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

revoke select on table public.profiles from authenticated;
revoke select, insert, update on table public.profiles from service_role;

commit;

-- To also remove the columns and every profile row (NOT part of the rollback; run only if that is the decision):
--   alter table public.profiles drop column full_name, drop column signup_source, drop column country;
--   delete from public.profiles;
