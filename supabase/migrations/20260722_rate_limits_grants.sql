-- supabase/migrations/20260722_rate_limits_grants.sql
--
-- 20260702_rate_limits.sql created the table and enabled RLS with no policy
-- (deliberate — deny-all to anon/authenticated; service_role has BYPASSRLS).
-- It did not GRANT. Under this project's locked-down grant scheme that left
-- lib/rateLimit.ts's admin client without table access: every check threw,
-- the limiter failed open, and no rows were ever written.
--
-- GRANT and RLS are separate layers. BYPASSRLS does not bypass GRANT.
--
-- No DELETE: retention cleanup is a manual operation run as owner.

grant select, insert on public.rate_limits to service_role;
