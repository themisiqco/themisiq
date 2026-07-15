-- mr_scenarios — first starter → primary_source provenance upgrade.
-- ---------------------------------------------------------------------------
-- WHAT THIS DOES
-- Upgrades the PROVENANCE METADATA on the three IPCC SSP scenario rows from 'starter' to
-- 'primary_source', citing IPCC AR6 WGI. It changes provenance / source_ref / source_date ONLY.
--
-- VALUE vs METADATA — the split that keeps this honest:
--   * What is being sourced: the scenario LABELS and DESCRIPTORS (~1.8°C / ~2.7°C / ~4.4°C). These
--     are transcribed from a named primary source and now match it, so they earn 'primary_source'.
--   * What is NOT being sourced: physical_mult / transition_mult. Those are ThemisIQ METHODOLOGICAL
--     choices (how each pathway scales physical vs transition pressure) — nothing here sources them,
--     so they stay 'starter' by staying untouched. This migration does NOT write the multiplier
--     columns at all. Do not add them.
--
-- Verified against AR6 WGI Summary for Policymakers, Table SPM.1 (best estimate, global surface
-- temperature change 2081–2100 relative to 1850–1900): SSP1-2.6 → 1.8°C, SSP2-4.5 → 2.7°C,
-- SSP5-8.5 → 4.4°C. The existing descriptors already match; no value changes.
--
-- After this runs, any resilience assessment (which runs all three SSPs) reports n_primary_source ≥ 3
-- in its Data-provenance block and lists the IPCC citation — the proof that the starter →
-- primary_source pipeline works end to end.
--
-- DEPLOYMENT NOTE: mr_scenarios is hand-created DB drift not otherwise in git (see CLAUDE.md); this
-- file captures the change for parity. Re-runnable (the UPDATE is value-stable).

-- ── The three IPCC SSP rows → primary_source, cited to AR6 WGI ──────────────
update public.mr_scenarios
  set provenance = 'primary_source',
      source_ref = 'IPCC AR6 WGI (2021), Summary for Policymakers, Table SPM.1 — best estimate of global surface temperature change, 2081–2100 vs 1850–1900. Scenario framework: Box SPM.1.',
      source_date = '2021-08-09'
  where code in ('ssp126','ssp245','ssp585');

-- ── The three NGFS rows — DELIBERATELY LEFT AS 'starter' (not run) ──────────
-- The NGFS descriptors ('Early policy' / 'Late, abrupt' / 'Limited action') are generic and consistent
-- across NGFS phases; we cannot pin which published vintage they were transcribed from. Asserting a
-- specific citation (e.g. the June-2021 Phase II framework, 2021-06-01) we cannot verify would be
-- half-right provenance — worse than an honest 'starter'. So these three stay 'starter' until Lisa
-- confirms the exact NGFS vintage the descriptors were drawn from, at which point this block is
-- verified and enabled. DO NOT run it before that confirmation.
--
-- update public.mr_scenarios
--   set provenance = 'primary_source',
--       source_ref = 'NGFS Climate Scenarios framework (Orderly / Disorderly / Hot House World). Network for Greening the Financial System.',
--       source_date = '2021-06-01'   -- UNVERIFIED vintage — pending Lisa's confirmation
--   where code in ('ngfs_orderly','ngfs_disorderly','ngfs_hothouse');
