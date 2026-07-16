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
