export type SourceStreamKind = 'fuel' | 'process_material' | 'output';
export type CcMode = 'direct' | 'ef_per_t' | 'ef_per_tj';

export interface SourceStream {
  kind: SourceStreamKind;
  ad: number;      // activity data [t]. OUTPUTS ARE NEGATIVE — the sign convention nets carbon in − out.
  ccMode: CcMode;
  cc?: number;     // carbon content (fraction), when ccMode = 'direct'
  ef?: number;     // emission factor, when ccMode = 'ef_per_t' (t CO2/t) or 'ef_per_tj' (t CO2/TJ)
  ncv?: number;    // net calorific value (TJ/t), when ccMode = 'ef_per_tj'
  bf: number;      // biomass fraction (0..1). Conservative default 0 when unknown.
}

export type Provenance = 'computed_here' | 'actual_verified' | 'default';
export type Boundary = 'joint' | 'separate_internal' | 'external';

export interface PrecursorInput {
  cnCode: string;
  category: string;
  massConsumed: number;      // M_i — TOTAL mass consumed to make AL_g, not mass embodied
  boundary: Boundary;        // 'joint' → already inside AttrEm, excluded from the precursor sum
  provenance: Provenance;
  originCountry: string;     // for EU/exempted zero-rating
  seeValue?: number;         // resolved SEE_i, if known (actual_verified / computed_here)
  verifierReportId?: string; // REQUIRED when provenance === 'actual_verified'
  period: number;
}

export interface UnresolvedFlag {
  cnCode: string;
  reason: string;
}

// Which branch of resolveSEE produced a precursor's SEE_i. Additive provenance marker: it records
// HOW the value was obtained without changing the value. Load-bearing for the default-value share
// (IR 2025/2547 Annex IV §1.2 (4)(b) / §1.1 15(d)) — 'default' and 'default_fallback' are the two
// sources that count as "a default value was used".
export type PrecursorSource =
  | 'eu_zero_rated'      // EU/exempted origin, zero-rated
  | 'computed_here'      // recursive child SEE
  | 'verified_actual'    // actual_verified with a valid verifier report
  | 'default'            // plain default lookup
  | 'default_fallback';  // actual_verified that fell back to default (see unresolved for why)

// One precursor's resolved SEE_i plus its source. Mirrors resolveSEE's return so a caller can key a
// Map<PrecursorInput, PrecursorResolution> by object identity and recover per-precursor provenance.
export interface PrecursorResolution {
  direct: number;
  indirect: number;
  source: PrecursorSource;
  unresolved?: UnresolvedFlag;
}

export interface SEEResult {
  direct: number;                 // SEE_g direct  = aeG + Σ m_i·SEE_i,direct
  indirect: number;               // SEE_g indirect = ownIndirect + Σ m_i·SEE_i,indirect
  aeG: number;                    // specific attributed emissions (own process, no precursors)
  precursorContribution: number;  // Σ m_i · SEE_i (direct leg)
  precursorIndirect: number;      // Σ m_i · SEE_i (indirect leg) — the inherited part of `indirect`
  unresolved: UnresolvedFlag[];   // LOUD failures — never silently swallowed
  // Per-precursor resolution keyed by the SAME PrecursorInput object passed in. Skipped 'joint'
  // precursors are legitimately absent (never resolved). Lets a caller recover per-precursor
  // {direct, indirect, source} without re-resolving — see lib/cbam/defaultShare.ts.
  resolutions: Map<PrecursorInput, PrecursorResolution>;
}

// Injected resolver for a precursor's SEE_i — supplied by the DB/route layer later.
// Keeps the engine pure: it decides WHICH value to use; the caller provides HOW to fetch defaults / recurse.
export interface ResolveContext {
  isEuOrExempted: (country: string) => boolean;
  // 2621 default for this precursor — BOTH legs. see_indirect is null for most rows → treat as 0
  // (a legitimate zero for Annex II goods, not missing data).
  defaultLookup: (p: PrecursorInput) => { direct: number; indirect: number };
  // tCO2e/MWh from cbam_grid_factors for the given country, 'other' fallback. Throws if neither found.
  gridFactor: (country: string) => number;
  hasValidVerifierReport: (p: PrecursorInput) => boolean;
  // recurse for computed_here separate processes — returns both legs (still throws in MVP)
  computeChildSEE: (p: PrecursorInput) => { direct: number; indirect: number };
}
