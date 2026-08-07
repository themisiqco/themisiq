-- 20260807_supplier_portal_policy_cleanup.sql
--
-- Removes over-broad RLS policies and residual anon grants on the
-- supplier-portal tables.
--
-- ROOT CAUSE
-- The 19 June 2026 remediation (20260619_supplier_portal_rls.sql) enabled RLS
-- and added correct owner-scoped policies targeting `authenticated`. It did not
-- remove the pre-existing policies, which were written without a `to` clause and
-- therefore defaulted to `public` -- a role that includes `anon`. RLS policies
-- are permissive and OR together, so the broad policy won every evaluation and
-- the June fix had no practical effect on anon access.
--
-- Combined with Supabase's default `grant all` to anon, this left the following
-- reachable through PostgREST with the browser-shipped anon key:
--
--   supplier_responses  -- select, insert, update, delete, all tenants
--   supplier_campaigns  -- select and delete, all tenants
--                          (with check blocked insert/update; DELETE consults
--                           USING only, so the check did not apply)
--   campaign_suppliers  -- select, all tenants, including the portal token column
--
-- user_subscriptions also held anon DML grants, but its sole policy predicate is
-- `auth.uid() = user_id`, which evaluates to NULL for an unauthenticated caller
-- and fails closed. Its grants were residue and are revoked here for consistency.
--
-- VERIFIED BEFORE APPLYING
--   service_role has rolbypassrls = true, so the two policies named
--   service_role_* were never consulted by service_role. Dropping them removes
--   only the unintended anon/authenticated blanket access.
--
--   portal_get, portal_save_response and portal_submit are all SECURITY DEFINER
--   and owned by postgres, so the supplier portal does not rely on anon grants
--   or on the dropped policies. Confirmed by live end-to-end test after applying:
--   questionnaire loaded, answer saved, submission completed.
--
-- POST-CONDITION WORTH KNOWING
--   supplier_responses now has exactly one policy, responses_select_own, which
--   is SELECT only. Every write must go through the three SECURITY DEFINER RPCs.
--   That is the intended end state -- a supplier response should only ever be
--   written by the holder of the campaign token -- but any future feature that
--   needs an authenticated user to write a response directly requires a new
--   policy, not a grant.
--
-- NOT ADDRESSED HERE
--   Supabase default privileges still grant new tables to anon on creation.
--   Fixing that requires `alter default privileges` and is a separate decision
--   about who owns table creation in this project.
--
--   ON REBUILD THIS MATTERS CONCRETELY. Migrations replay in filename order, so
--   the schema-wide revoke in step 3 covers only tables that exist at this point
--   in the sequence. Any table created by a later-dated migration inherits the
--   default anon grants and nothing here removes them. A database rebuilt from
--   this directory is therefore NOT equivalent to production on that point --
--   re-run step 3 after the final migration, or fix the defaults properly.
--
--   23 reference tables (cbam_*, mr_*) retain anon SELECT. Reviewed and left in
--   place: they hold published regulatory data and methodology reference data,
--   not tenant rows. Revoking them risks breaking unauthenticated marketing or
--   calculator surfaces and was deliberately deferred.

begin;

-- 1. Drop the policies that defaulted to `public`.

drop policy if exists service_role_supplier_responses on public.supplier_responses;
drop policy if exists service_role_campaign_suppliers on public.campaign_suppliers;
drop policy if exists buyers_own_campaigns            on public.supplier_campaigns;

-- 2. Revoke residual anon DML grants on the affected tables.

revoke select, insert, update, delete on public.supplier_responses  from anon;
revoke select, insert, update, delete on public.supplier_campaigns  from anon;
revoke select, insert, update, delete on public.campaign_suppliers  from anon;
revoke select, insert, update, delete on public.user_subscriptions  from anon;

-- 3. Revoke the non-DML residue across the whole schema.
--    RLS policies apply to SELECT, INSERT, UPDATE and DELETE only -- they do not
--    constrain TRUNCATE. Not currently reachable, since PostgREST exposes no
--    TRUNCATE verb, but it becomes live the day any SECURITY INVOKER function
--    callable by anon issues one.

revoke truncate, references, trigger on all tables in schema public from anon;

commit;

-- ROLLBACK (restores prior behaviour verbatim; reintroduces the exposure)
--
-- create policy service_role_supplier_responses on public.supplier_responses
--   for all to public using (true) with check (true);
-- create policy service_role_campaign_suppliers on public.campaign_suppliers
--   for select to public using (true);
-- create policy buyers_own_campaigns on public.supplier_campaigns
--   for all to public using (true) with check (auth.uid() = buyer_id);
--
-- grant select, insert, update, delete on public.supplier_responses  to anon;
-- grant select, insert, update, delete on public.supplier_campaigns  to anon;
-- grant select, insert, update, delete on public.campaign_suppliers  to anon;
-- grant select, insert, update, delete on public.user_subscriptions  to anon;
