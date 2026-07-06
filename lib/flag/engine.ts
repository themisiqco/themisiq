// lib/flag/engine.ts
// ─────────────────────────────────────────────────────────────────────────────
// FLAG land-sector inventory engine — LSRS Track A.
//
// computeFlag partitions supplied activity lines into the three LSRS categories
// (land use change / land management / removals) and reports each SEPARATELY.
//
// INVARIANTS (asserted in tests):
//  - Removals are NEVER netted into grossEmissions (LUC + land management only).
//  - Hectares are tracked; a non-removals line with emissions > 0 but no hectares
//    THROWS (land occupation is mandatory under LSRS for emitting activities).
//  - The three categories are always distinct fields; the engine never returns one
//    merged number.
//  - An empty inventory is VALID (returns a zeroed result, does not throw).
// ─────────────────────────────────────────────────────────────────────────────

import type { FlagActivity, FlagResult, CategoryResult, LandCategory, GwpVersion } from './types';

// Roll up one category's lines. Missing hectares count as 0 in the sum.
function rollUp(category: LandCategory, lines: FlagActivity[]): CategoryResult {
  return {
    category,
    emissions: lines.reduce((sum, l) => sum + l.emissions, 0),
    hectares: lines.reduce((sum, l) => sum + (l.hectares ?? 0), 0),
    lineCount: lines.length,
  };
}

export function computeFlag(activities: FlagActivity[], gwpBasis: GwpVersion = 'AR6'): FlagResult {
  for (const a of activities) {
    // Removals are entered as a POSITIVE magnitude in the removals category, never as
    // negative emissions — so negatives are always invalid input.
    if (a.emissions < 0) {
      throw new Error(`FLAG: emissions must be >= 0 (line ${a.id}, category ${a.category}, got ${a.emissions})`);
    }
    // Land occupation is mandatory for an emitting non-removals activity.
    if (a.category !== 'removals' && a.emissions > 0 && (a.hectares == null || a.hectares <= 0)) {
      throw new Error(`FLAG: land occupation (hectares) required for emitting land activity ${a.id}`);
    }
  }

  const landUseChange = rollUp('land_use_change', activities.filter(a => a.category === 'land_use_change'));
  const landManagement = rollUp('land_management', activities.filter(a => a.category === 'land_management'));
  const removals = rollUp('removals', activities.filter(a => a.category === 'removals'));

  return {
    landUseChange,
    landManagement,
    removals,
    // Gross emissions exclude removals — LSRS reports removals separately, never netted.
    grossEmissions: landUseChange.emissions + landManagement.emissions,
    totalHectares: landUseChange.hectares + landManagement.hectares + removals.hectares,
    gwpBasis,
  };
}

// ── Reporting surface: assemble the ten estimators' EmissionEstimate[] into the LSRS inventory ──
// Does its OWN SIGNED roll-up (does NOT delegate to computeFlag): negatives are allowed (SOC gain
// is real), hectares are partial (livestock/fertiliser lines are not area-keyed), and screening
// flags propagate to the inventory level. computeFlag stays the strict FlagActivity validator.
import type { EmissionEstimate, FlagInventory, FlagCategorySummary } from './types';

const DQ_SCORE = { primary: 1, secondary: 2 } as const;

function summariseCategory(category: LandCategory, lines: EmissionEstimate[]): FlagCategorySummary {
  const byGas = { CH4: 0, N2O: 0, CO2: 0 };
  let emissions = 0, hectares = 0, wSum = 0, wDen = 0;
  for (const e of lines) {
    emissions += e.emissions;
    byGas[e.gas] += e.emissions;
    hectares += e.hectares ?? 0;
    const mag = Math.abs(e.emissions); // magnitude-weighted so negative lines still count
    wSum += mag * DQ_SCORE[e.dataQuality];
    wDen += mag;
  }
  return {
    category,
    emissions,
    byGas,
    hectares,
    lineCount: lines.length,
    weightedDataQuality: wDen > 0 ? wSum / wDen : 0, // NaN-guard: no magnitude → 0
  };
}

export function assembleFlagInventory(estimates: EmissionEstimate[], gwpBasis: GwpVersion = 'AR6'): FlagInventory {
  const bucket: Record<LandCategory, EmissionEstimate[]> = { land_management: [], land_use_change: [], removals: [] };
  for (const e of estimates) {
    (bucket[e.category ?? 'land_management'] ?? bucket.land_management).push(e); // 8 estimators default to land_management
  }

  const landManagement = summariseCategory('land_management', bucket.land_management);
  const landUseChange = summariseCategory('land_use_change', bucket.land_use_change);
  const removals = summariseCategory('removals', bucket.removals);

  // Overall DQ: |emissions|-weighted across the EMISSION lines only (removals excluded from DQ weighting).
  const emissionLines = [...bucket.land_management, ...bucket.land_use_change];
  let wSum = 0, wDen = 0;
  for (const e of emissionLines) { const mag = Math.abs(e.emissions); wSum += mag * DQ_SCORE[e.dataQuality]; wDen += mag; }

  const screeningFlags = [...new Set(estimates.flatMap(e => e.flags ?? []))];

  return {
    landManagement,
    landUseChange,
    removals,
    // Removals EXCLUDED from gross (LSRS never nets removals against emissions).
    grossEmissions: landManagement.emissions + landUseChange.emissions,
    totalHectares: landManagement.hectares + landUseChange.hectares + removals.hectares,
    overallWeightedDataQuality: wDen > 0 ? wSum / wDen : 0,
    screeningFlags,
    lineCount: estimates.length,
    gwpBasis,
  };
}
