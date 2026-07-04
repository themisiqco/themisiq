// lib/pcaf/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// PCAF-aligned financed-emissions engine — shared types (attribution layer).
//
// Scope 3 Category 15. Implements the Partnership for Carbon Accounting Financials
// (PCAF) Global GHG Accounting and Reporting Standard for the Financial Industry.
//
// tCO2e-native: investee emissions are passed IN as tCO2e. This engine performs NO
// gas→CO2e / GWP math (that lives in the core GHG combustion engine). GWP is only
// CITED here, as the basis the investee figures are assumed to be reported on.
//
// Phase-1 scope: the six original asset classes only. Sovereign debt and the
// December-2025 additions are intentionally OUT of scope for this layer.
// ─────────────────────────────────────────────────────────────────────────────

// Reuse the platform's canonical GWP-version union rather than redefining it, so
// the PCAF citation basis stays in lockstep with the combustion engine. Type-only
// import — no runtime dependency on the GHG module.
import type { GwpVersion } from '../ghg/monthlyEmissions';

export type { GwpVersion };

// The six Phase-1 PCAF asset classes. Sovereign + Dec-2025 additions are OUT of scope.
export type PcafAssetClass =
  | 'listed_equity_corp_bonds'
  | 'business_loans_unlisted_equity'
  | 'project_finance'
  | 'commercial_real_estate'
  | 'mortgages'
  | 'motor_vehicle_loans';

// A single financed asset (loan / investment). The engine defines its own input
// shape and is DB-agnostic — it does NOT import the UI's CategoryData.
export interface PcafAsset {
  id: string;
  assetClass: PcafAssetClass;
  outstandingAmount: number; // numerator (exposure), same currency as denominator
  denominator: number; // total value of the asset (see attribution rules per class)
  investeeEmissions: number; // tCO2e (reported path for now; estimator is a later step)
}

// Raw attribution outcome for one asset.
export interface AttributionResult {
  factor: number; // outstanding / denominator, clamped to [0,1]
  capped: boolean; // true when a >1 raw factor was clamped (data error)
}

// Financed emissions for one asset, with provenance.
export interface FinancedEmissionsResult {
  assetId: string;
  attributionFactor: number;
  capped: boolean;
  financedEmissions: number; // tCO2e
  gwpBasis: GwpVersion; // cite 'AR6'
}

// PCAF data-quality score. 1 = highest fidelity (reported, verified),
// 5 = lowest (lumped portfolio spend proxy).
export type DataQualityScore = 1 | 2 | 3 | 4 | 5;

// Candidate inputs for estimating a single investee's emissions. The estimator
// picks the highest-fidelity tier for which inputs are present.
export interface EmissionInputs {
  reportedEmissions?: number; // tCO2e (investee's own)
  verified?: boolean; // true → score 1; else score 2
  physicalActivity?: number; // activity amount
  physicalEmissionFactor?: number; // tCO2e per activity unit
  revenue?: number; // investee revenue, USD (score 4)
  sector?: string; // key into EMISSION_FACTORS.spend
}

// One emissions estimate with its data-quality score and human-readable provenance.
export interface EmissionEstimate {
  emissions: number; // tCO2e
  dqScore: DataQualityScore;
  basis: string; // human-readable provenance
}
