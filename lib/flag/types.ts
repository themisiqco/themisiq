// lib/flag/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// FLAG land-sector inventory engine — LSRS-aligned (GHG Protocol Land Sector &
// Removals Standard).
//
// TRACK A: calculation + reporting from supplied activity data using secondary factors.
// OUT OF SCOPE: geospatial/traceability LUC (Track B), SBTi FLAG target-setting.
//
// Discipline: pure, tCO2e-native outputs, three categories reported SEPARATELY,
// never netted (LSRS requires land use change, land management, and removals to be
// disclosed distinctly — removals are never subtracted from gross emissions).
// ─────────────────────────────────────────────────────────────────────────────

// Reuse the platform's canonical GWP-version union rather than redefining it, so
// the FLAG basis stays in lockstep with the combustion engine. Type-only import —
// no runtime dependency on the GHG module.
import type { GwpVersion } from '../ghg/monthlyEmissions';

export type { GwpVersion };

// The three LSRS land-sector categories. Always reported separately.
export type LandCategory = 'land_use_change' | 'land_management' | 'removals';

// A single activity line the caller supplies. In this task the engine accepts a
// PRE-COMPUTED emissions figure per line (tCO2e); the next task adds estimators that
// derive it from enteric/manure/fertiliser/LUC activity + factors.
export interface FlagActivity {
  id: string;
  category: LandCategory;
  label?: string;
  emissions: number;        // tCO2e for this line (>=0 for LUC/management; removals see below)
  hectares?: number;        // land occupation for this line
  dataQuality?: 'primary' | 'secondary';
}

// One category's rolled-up outcome.
export interface CategoryResult {
  category: LandCategory;
  emissions: number;        // tCO2e — for 'removals' this is the removal magnitude (positive)
  hectares: number;         // summed land occupation in this category
  lineCount: number;
}

// The whole land-sector inventory — three categories always distinct.
export interface FlagResult {
  landUseChange: CategoryResult;
  landManagement: CategoryResult;
  removals: CategoryResult;          // reported SEPARATELY — never subtracted from emissions
  grossEmissions: number;            // LUC + landManagement ONLY (removals excluded)
  totalHectares: number;
  gwpBasis: GwpVersion;
}
