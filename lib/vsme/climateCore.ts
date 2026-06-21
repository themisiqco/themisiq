/**
 * VSME Climate Core export
 * --------------------------------------------------------------------------
 * Phase 1 scope: B3 (energy + GHG emissions), assembled from a saved
 * ghg_inventories row via buildB3Block(). The B3 chain is:
 *   climateCore → b3Block (emissions + assembly) → b3Energy (energy aggregation)
 *                                                → energyContent (fuel → MWh)
 *
 * C3 (reduction targets / transition plan) and C4 (climate risks) are DEFERRED:
 *   - C3 needs the not-yet-built SBTi module (no backing data today).
 *   - C4 needs the Climate Risk down-mapping reducer.
 * They are omitted from the Phase-1 export and modulesCovered reflects B3 only.
 * Their types remain defined below so the shape is ready when they land.
 *
 * Mapping rules baked in (verified against EFRAG VSME guidance):
 *   - B3 energy is reported in MWh, split renewable / non-renewable.
 *   - B3 Scope 2 REQUIRED method is location-based; market-based is optional.
 *   - B3 GHG intensity = total GHG emissions / turnover.
 *   - Scope 3 is NOT a Basic-module field (Comprehensive only, if material).
 *   - VSME requires NO external assurance — never assert it (see meta).
 *   - VSME is an EU mechanism — `jurisdiction` gates downstream messaging.
 *
 * Standard naming: kept as "VSME". Switch the `standard` literal to the
 * Commission's "VS" label once the delegated act finalises.
 */

import { buildB3Block, type B3InventoryRow } from "./b3Block";

// ===========================================================================
// Types
// ===========================================================================

export type Scope = "scope1" | "scope2" | "scope3";
export type GwpBasis = "AR4" | "AR5" | "AR6";
export type Jurisdiction = "EU" | "UK" | "other";

/** B3 — total energy consumption, in MWh, with required splits. */
export interface VsmeEnergyConsumption {
  totalMWh: number;
  renewableMWh: number;       // required: renewable / non-renewable split
  nonRenewableMWh: number;
  electricityMWh?: number;    // recommended: electricity / fuels split
  fuelsMWh?: number;
}

/** B3 — GHG emissions block. Scope 1 + location-based Scope 2 are required. */
export interface VsmeGhgEmissions {
  scope1_tCO2e: number;
  scope2LocationBased_tCO2e: number;   // REQUIRED method under VSME B3
  scope2MarketBased_tCO2e?: number;    // optional supplement (residual-mix)
  scope3_tCO2e?: number;               // Comprehensive only, if material
  scope3Categories?: { category: number; tCO2e: number }[]; // 15-cat screen
  /** Intensity = (Scope 1 + location-based Scope 2) / turnover. */
  ghgIntensity_tCO2ePerTurnover: number;
  turnover: number;
  turnoverCurrency: string;            // e.g. "USD"
  gwpBasis: GwpBasis;                  // surfaced for methodology transparency
  reportingPeriodStart: string;        // ISO date
  reportingPeriodEnd: string;          // ISO date
}

/** C3 — GHG reduction target(s). Deferred (Phase 2). */
export interface VsmeReductionTarget {
  hasTargets: boolean;
  baseYear?: number;
  targetYear?: number;
  baseYearEmissions_tCO2e?: number;
  targetReductionPct?: number;                 // vs base year
  scopesCovered?: Scope[];
  validationFramework?: string;                // e.g. "SBTi Corp. Net-Zero V2.0"
  netZeroTargetYear?: number;
}

/** C3 — summarised transition plan (NOT the full plan). Deferred (Phase 2). */
export interface VsmeTransitionPlanSummary {
  hasPlan: boolean;
  summary?: string;                            // narrative
  keyLevers?: string[];                        // e.g. ["electrification", "PPA"]
  estimatedInvestment?: { amount: number; currency: string } | null;
}

/** C4 — a single climate risk. Deferred (Phase 2). */
export type ClimateRiskType = "physical" | "transition";
export type RiskTimeHorizon = "short" | "medium" | "long";

export interface VsmeClimateRisk {
  type: ClimateRiskType;
  description: string;
  timeHorizon: RiskTimeHorizon;
  scenario?: string;                           // e.g. "SSP2-4.5"
  materiality?: "low" | "medium" | "high";
  adaptationActions?: string;
}

/** C4 — climate risk block. Deferred (Phase 2). */
export interface VsmeClimateRisks {
  assessed: boolean;
  risks: VsmeClimateRisk[];
}

/** Top-level export object. C3/C4 optional — omitted until those modules land. */
export interface VsmeClimateCoreExport {
  meta: {
    standard: "VSME";                          // → "VS" when delegated act finalises
    modulesCovered: ("B3" | "C3" | "C4")[];
    schemaVersion: string;
    generatedAt: string;                       // ISO timestamp
    jurisdiction: Jurisdiction;                // VSME is EU; gates messaging
    assuranceProvided: false;                  // VSME requires none — never claim it
  };
  entity: {
    legalName: string;
    reportingYear: number;
  };
  b3_energyAndEmissions: {
    energy: VsmeEnergyConsumption;
    emissions: VsmeGhgEmissions;
  };
  c3_targetsAndTransition?: {                  // Phase 2 — SBTi module (net-new)
    targets: VsmeReductionTarget;
    transitionPlan: VsmeTransitionPlanSummary;
  };
  c4_climateRisks?: VsmeClimateRisks;          // Phase 2 — Climate Risk reducer
}

// ===========================================================================
// Adapter
// ===========================================================================

/**
 * Build the Phase-1 VSME Climate Core export from a saved ghg_inventories row.
 * B3 (energy + emissions) is assembled via buildB3Block(); C3/C4 are deferred
 * and therefore omitted, with modulesCovered reflecting B3 only.
 */
export function buildVsmeClimateCore(
  row: B3InventoryRow,
  jurisdiction: Jurisdiction = "EU"
): VsmeClimateCoreExport {
  return {
    meta: {
      standard: "VSME",
      modulesCovered: ["B3"],
      schemaVersion: "climate-core-0.1",
      generatedAt: new Date().toISOString(),
      jurisdiction,
      assuranceProvided: false,
    },
    entity: {
      legalName: row.company_name,
      reportingYear: row.reporting_year,
    },
    b3_energyAndEmissions: buildB3Block(row),
  };
}

// ===========================================================================
// Sample output — illustrates the FULL eventual shape (B3 + C3 + C4).
// Note: buildVsmeClimateCore currently emits B3 only; C3/C4 here are shown for
// reference of where Phase-2 data will sit.
// ===========================================================================

export const SAMPLE_VSME_CLIMATE_CORE: VsmeClimateCoreExport = {
  meta: {
    standard: "VSME",
    modulesCovered: ["B3", "C3", "C4"],
    schemaVersion: "climate-core-0.1",
    generatedAt: "2026-06-20T12:00:00.000Z",
    jurisdiction: "EU",
    assuranceProvided: false,
  },
  entity: {
    legalName: "Example SME Ltd.",
    reportingYear: 2025,
  },
  b3_energyAndEmissions: {
    energy: {
      totalMWh: 1840,
      renewableMWh: 520,
      nonRenewableMWh: 1320,
      electricityMWh: 740,
      fuelsMWh: 1100,
    },
    emissions: {
      scope1_tCO2e: 412.6,
      scope2LocationBased_tCO2e: 188.3,
      scope2MarketBased_tCO2e: 96.1,
      ghgIntensity_tCO2ePerTurnover: 0.000048, // tCO2e per unit turnover
      turnover: 12_500_000,
      turnoverCurrency: "USD",
      gwpBasis: "AR6",
      reportingPeriodStart: "2025-01-01",
      reportingPeriodEnd: "2025-12-31",
    },
  },
  c3_targetsAndTransition: {
    targets: {
      hasTargets: true,
      baseYear: 2022,
      targetYear: 2030,
      baseYearEmissions_tCO2e: 712.0,
      targetReductionPct: 42,
      scopesCovered: ["scope1", "scope2"],
      validationFramework: "SBTi Corporate Net-Zero Standard V2.0",
      netZeroTargetYear: 2045,
    },
    transitionPlan: {
      hasPlan: true,
      summary:
        "Phased electrification of the vehicle fleet and a renewable PPA " +
        "covering ~70% of grid electricity by 2028, targeting a 42% absolute " +
        "reduction in Scope 1+2 by 2030 against a 2022 base year.",
      keyLevers: ["fleet electrification", "renewable PPA", "energy efficiency"],
      estimatedInvestment: { amount: 1_300_000, currency: "EUR" },
    },
  },
  c4_climateRisks: {
    assessed: true,
    risks: [
      {
        type: "physical",
        description:
          "Increased flood exposure at the primary distribution site under " +
          "higher-warming pathways.",
        timeHorizon: "medium",
        scenario: "SSP5-8.5",
        materiality: "medium",
        adaptationActions:
          "Site drainage upgrade scheduled; secondary site identified for continuity.",
      },
      {
        type: "transition",
        description:
          "Rising carbon-pricing exposure on Scope 1 fuel use as the EU ETS tightens.",
        timeHorizon: "short",
        scenario: "SSP1-2.6",
        materiality: "high",
        adaptationActions: "Fleet electrification brought forward to 2027.",
      },
    ],
  },
};
