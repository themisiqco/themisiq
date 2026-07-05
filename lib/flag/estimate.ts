// lib/flag/estimate.ts
// ─────────────────────────────────────────────────────────────────────────────
// FLAG land-management estimators — enteric fermentation (CH4).
//
// Every estimate routes through a STRUCTURED, SELF-CITING EmissionFactor and fails
// LOUD for any species/region it has no verified IPCC factor for — it never guesses
// or falls back. Enteric CH4 routes through the biogenic GWP (27.0), never fossil.
//
// Manure, fertiliser, and LUC estimators are SEPARATE later tasks.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTERIC_CATTLE, ENTERIC_OTHER, FLAG_GWP_AR6 } from './params';
import type { EmissionFactor } from './params';
import type { EmissionEstimate } from './types';

// Cattle & buffalo are region-keyed (Table 10.11); everything else is global (Table 10.10).
type CattleAnimal = 'dairy_cattle' | 'other_cattle' | 'buffalo';
const CATTLE_ANIMALS: readonly string[] = ['dairy_cattle', 'other_cattle', 'buffalo'];

// Returns tCO2e for one enteric line, tagged secondary, carrying the factor's provenance.
export function estimateEnteric(input: {
  animal: string;                 // 'dairy_cattle'|'other_cattle'|'buffalo'|'sheep'|'goats'|'swine'|'horses'|'camels'|'mules_asses'|'deer'
  headcount: number;
  region?: string;                // required for cattle/buffalo
  productivity?: 'high' | 'low';  // other livestock; default 'low'
}): EmissionEstimate {
  const { animal, headcount, region, productivity } = input;

  if (headcount < 0) {
    throw new Error(`enteric: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }

  let factor: EmissionFactor;

  if (CATTLE_ANIMALS.includes(animal)) {
    // Cattle/buffalo need a region — no region-agnostic default exists; refuse rather than guess.
    if (!region) {
      throw new Error(`enteric: region required for ${animal}; refusing to estimate`);
    }
    const f = ENTERIC_CATTLE[region]?.[animal as CattleAnimal];
    if (!f) {
      throw new Error(`enteric: no verified IPCC factor for ${animal} in region ${region}; refusing to estimate`);
    }
    factor = f;
  } else {
    const set = ENTERIC_OTHER[animal];
    if (!set) {
      throw new Error(`enteric: unknown animal '${animal}'; refusing to estimate`);
    }
    factor = set[productivity ?? 'low'];
  }

  // kg CH4/head/yr × head × GWP → kg CO2e → /1000 → tCO2e.
  const emissions = (headcount * factor.value * FLAG_GWP_AR6.CH4_biogenic) / 1000;

  return {
    emissions,
    dataQuality: 'secondary',
    gas: 'CH4',
    factor,
    basis: 'IPCC 2019 Tier 1 enteric (screening-grade default)',
  };
}
