-- CBAM verifier portal — Step 4b of 5: service_role SELECT grants
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS: app/api/cbam/verifier-documents/route.ts reads the CBAM
-- customer tables under the SERVICE-ROLE client (createServerClient), because
-- the caller is an unauthenticated verifier (anon) and RLS-based owner access
-- does not apply. Those tables' original migrations granted the authenticated
-- role only — service_role was never granted — so the verifier route, though
-- it compiles and passes build, 500s at runtime with 42501 permission denied
-- on the first query. This is the grants-are-separate-from-RLS trap (spec
-- §10.4): a route that compiles still fails without the grant.
--
-- LEAST PRIVILEGE: SELECT only. The verifier route never writes these tables —
-- it reads, recomputes in memory, and returns a report. No INSERT/UPDATE/DELETE
-- is granted. Tenant isolation is enforced in the route (explicit company_id
-- scoping on every query + the post-load cross-tenant assert), NOT by
-- withholding this grant; withholding it does not add security, it only breaks
-- the route.
--
-- SCOPE: exactly the seven tables the verifier route reads. cbam_verifier_access
-- already carries a service_role grant (its own step-1 migration), so it is not
-- repeated here.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

grant select on public.cbam_installations            to service_role;
grant select on public.cbam_operator_profile         to service_role;
grant select on public.cbam_installation_disclosures to service_role;
grant select on public.cbam_production_processes     to service_role;
grant select on public.cbam_see_records              to service_role;
grant select on public.cbam_source_streams           to service_role;
grant select on public.cbam_source_documents         to service_role;
