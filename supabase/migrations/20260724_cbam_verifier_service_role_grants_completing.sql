-- CBAM verifier portal — Step 4d of 5: completing service_role SELECT grants
-- ---------------------------------------------------------------------------
-- WHY THIS EXISTS: step 4b granted service_role SELECT on the seven tables the
-- verifier route reads DIRECTLY. But the route calls loadAndComputeProcess,
-- which transitively reads four more cbam_ tables under the same service-role
-- client (the compute + SEFA resolver path). Those were not in 4b's list, so
-- the route fails mid-assembly with 42501 on the first uncovered table.
--
-- DATA-DEPENDENT FAILURE (important): three of these four are read on EVERY
-- verifier compute; cbam_default_values is read ONLY when a process has >= 1
-- precursor (the resolver's Column-A default lookup). So a precursor-free
-- fixture would pass without this grant and a precursor-bearing report would
-- 42501 in production. The failure is data-dependent, not code-path-dependent —
-- do not treat a clean smoke test on a simple fixture as proof.
--
-- LEAST PRIVILEGE: SELECT only; the compute path only reads these. Tenant
-- isolation remains enforced in the route (explicit company_id scoping + the
-- cross-tenant assert), not by withholding grants.
--
-- COMPLETE PATH SET (for the record) = these 4 + the 7 from step 4b = 11 tables
-- read in the loadProcess/SEFA compute path. cbam_sefa_params and
-- cbam_benchmarks are deliberately NOT here: they are pure injected inputs with
-- no table reads in this path. If SEFA persistence is ever routed through the
-- verifier, revisit.
--
-- DEPLOY: do NOT auto-run. Hand-run in the Supabase SQL editor after review.

grant select on public.cbam_precursor_inputs to service_role;
grant select on public.cbam_goods_categories to service_role;
grant select on public.cbam_grid_factors     to service_role;
grant select on public.cbam_default_values    to service_role;
