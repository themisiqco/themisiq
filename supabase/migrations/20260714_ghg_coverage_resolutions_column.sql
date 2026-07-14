-- ghg_inventories.coverage_resolutions — persist concierge coverage-gap resolutions
-- ---------------------------------------------------------------------------
-- Captures a column already hand-run in the Supabase SQL editor (2026-07-14).
--
-- WHY THIS COLUMN MUST EXIST AND PERSIST:
-- coverage_resolutions is the audit trail for every acknowledged coverage gap
-- (e.g. a user extrapolating a 9/12-month bill window up to a full year). It is
-- the input to applyResolutions(), which is the single source of truth for what
-- a figure IS and the method claimed for it. Without persistence:
--   1. The grossed-up figure (locations_data) survives a reload, but the
--      explaining coverage-resolution audit row does NOT — a verifier then sees
--      a total that exceeds its source quotes with no methodology row. That is
--      an unexplained discrepancy, not a disclosed estimate.
--   2. Confirming any later proposal re-runs applyResolutions with [] and
--      silently reverts the figure to the raw source sum.
-- See lib/ghg/engine.test.ts (round-trip contract I1, detectability I2).

alter table public.ghg_inventories
  add column if not exists coverage_resolutions jsonb not null default '[]'::jsonb;

comment on column public.ghg_inventories.coverage_resolutions is
  'Concierge coverage-gap resolutions (CoverageResolution[]). Input to applyResolutions(); the audit trail explaining any figure grossed up beyond its source quotes. Must round-trip with locations_data — see the July 2026 write-only-feature fix.';
