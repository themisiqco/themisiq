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

// One estimator output — a derived per-line emissions figure with the exact factor
// (and its provenance) that produced it, so the audit trail travels with the number.
export interface EmissionEstimate {
  emissions: number;            // tCO2e
  dataQuality: 'primary' | 'secondary';
  gas: 'CH4' | 'N2O' | 'CO2';
  factor: import('./params').EmissionFactor;   // provenance travels with the estimate
  basis: string;
  // Optional sub-amounts. Indirect manure N2O splits into volatilisation + leaching;
  // synthetic fertiliser N2O adds a `direct` component.
  breakdown?: { direct?: number; volatilisation: number; leaching: number };
  // Crop-residue N2O surfaces the derived residue-N (kg N) so the Eq.11.6/11.7 step is auditable.
  fCrKgN?: number;
  // Carbon-stock-change estimators (LUC) report a distinct category, land occupation, and a
  // biomass/soil split (soil null until the soil pool is built).
  category?: LandCategory;
  hectares?: number;
  carbonStock?: { biomass: number | null; soil: number | null };
  // Structured screening/incompleteness markers (surfaced at inventory level by
  // assembleFlagInventory). E.g. 'screening_estimate', 'biomass_only_excludes_soil',
  // 'grassland_soil_incomplete', 'soc_management_not_applied'.
  flags?: string[];
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

// ── Reporting surface (assembleFlagInventory) — signed roll-up over EmissionEstimate[] ──
export interface FlagCategorySummary {
  category: LandCategory;
  emissions: number;              // SIGNED tCO2e (may be negative if sequestration > emission within category)
  byGas: { CH4: number; N2O: number; CO2: number };
  hectares: number;               // summed land occupation (partial — only lines carrying hectares)
  lineCount: number;
  weightedDataQuality: number;    // |emissions|-weighted DQ (1=primary, 2=secondary)
}
export interface FlagInventory {
  landManagement: FlagCategorySummary;
  landUseChange: FlagCategorySummary;
  removals: FlagCategorySummary;        // present-but-empty until a removals estimator exists; POSITIVE magnitude
  grossEmissions: number;               // landManagement + landUseChange (SIGNED; removals EXCLUDED)
  totalHectares: number;
  overallWeightedDataQuality: number;   // |emissions|-weighted across all emission lines (removals excluded)
  screeningFlags: string[];             // de-duped union of all lines' flags
  lineCount: number;
  gwpBasis: GwpVersion;
}
