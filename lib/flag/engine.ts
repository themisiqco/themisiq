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
