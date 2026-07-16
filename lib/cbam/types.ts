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

export interface SEEResult {
  see: number;                    // SEE_g
  aeG: number;                    // specific attributed emissions (own process, no precursors)
  precursorContribution: number;  // Σ m_i · SEE_i
  unresolved: UnresolvedFlag[];   // LOUD failures — never silently swallowed
}

// Injected resolver for a precursor's SEE_i — supplied by the DB/route layer later.
// Keeps the engine pure: it decides WHICH value to use; the caller provides HOW to fetch defaults / recurse.
export interface ResolveContext {
  isEuOrExempted: (country: string) => boolean;
  defaultLookup: (p: PrecursorInput) => number;      // 2621 default for this precursor
  hasValidVerifierReport: (p: PrecursorInput) => boolean;
  computeChildSEE: (p: PrecursorInput) => number;    // recurse for computed_here separate processes
}
