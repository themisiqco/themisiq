-- ghg_inventories.pct_estimated — estimation-transparency figure for SBTi
-- ---------------------------------------------------------------------------
-- Captures a column already hand-run in the Supabase SQL editor (2026-07-14).
--
-- WHY THIS COLUMN EXISTS:
-- SBTi permits estimation but requires TRANSPARENCY about it. pct_estimated is that
-- transparency figure: the share (0-100) of an inventory's Scope 1+2 tCO2e that is
-- ESTIMATED (extrapolated from partial bills via coverage resolutions), weighted by
-- EMISSIONS — not by fuel count. Computed at save by lib/ghg/engine.ts pctEstimated().
-- NULL means a wholly manual inventory with no evidence basis to measure against
-- (an absence, not a 0% claim — see lib/ghg/series.ts, which never coerces null → 0).
--
-- Consumed by lib/ghg/loadSeries.ts → series.ts (baselinePctEstimated,
-- estimationConsistent) → the SBTi baseline disclosure. It does NOT gate
-- target-setting; an estimated baseline is a legitimate SBTi baseline.

alter table public.ghg_inventories
  add column if not exists pct_estimated numeric;

comment on column public.ghg_inventories.pct_estimated is
  'Emissions-weighted share (0-100) of Scope 1+2 tCO2e that is estimated (extrapolated from partial bills). NULL = wholly manual inventory, an absence (not 0). Written at save by engine.pctEstimated(); disclosed on the SBTi baseline.';
