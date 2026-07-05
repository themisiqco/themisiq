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

import { ENTERIC_CATTLE, ENTERIC_OTHER, FLAG_GWP_AR6, MANURE_VS, MANURE_WEIGHT, MANURE_FACTOR } from './params';
import type { EmissionFactor, ManureSpecies, ManureSystem, ManureClimate } from './params';
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

// Resolve the Table 10.14 CH4 factor for a manure line. Buffalo has no own grid → routes
// to other_cattle.low (footnote 6). Pasture is a global scalar; burned_for_fuel is a
// per-species-productivity scalar; the other three systems are climate-keyed.
function resolveManureFactor(
  animal: ManureSpecies,
  productivity: 'high' | 'low',
  system: ManureSystem,
  climate?: ManureClimate,
): EmissionFactor {
  // Pasture is productivity/species/climate-invariant.
  if (system === 'pasture_range_paddock') return MANURE_FACTOR.pasture_range_paddock;

  // Buffalo uses other_cattle LOW factors in every region (Table 10.14 footnote 6).
  const isBuffalo = animal === 'buffalo';
  const factorSpecies: 'dairy_cattle' | 'other_cattle' = isBuffalo ? 'other_cattle' : animal;
  const factorProd: 'high' | 'low' = isBuffalo ? 'low' : productivity;
  const grid = MANURE_FACTOR[factorSpecies][factorProd];

  let base: EmissionFactor;
  if (system === 'burned_for_fuel') {
    base = grid.burned_for_fuel; // climate-invariant scalar
  } else {
    if (!climate) {
      throw new Error(`manure: climate (cool|temperate|warm) required for system ${system}; refusing to estimate`);
    }
    base = grid[system][climate];
  }

  // Surface footnote 6 on the estimate when buffalo borrowed the other_cattle-LP factor.
  return isBuffalo
    ? { ...base, note: 'buffalo uses other_cattle low-productivity factors (Table 10.14 footnote 6)' }
    : base;
}

// Manure CH4 for one line (tCO2e). VS & live weight use the ACTUAL animal's regional Mean
// (buffalo uses buffalo's own VS/weight); only the CH4 factor borrows other_cattle-LP.
// Fails loud for any species/region without a verified VS/weight — never guesses.
export function estimateManureCH4(input: {
  animal: ManureSpecies;
  headcount: number;
  region: string;                 // required — VS & weight are regional
  system: ManureSystem;
  climate?: ManureClimate;        // required for solid_storage/dry_lot/daily_spread
  productivity?: 'high' | 'low';  // default 'low' (screening-grade, matches enteric)
}): EmissionEstimate {
  const { animal, headcount, region, system, climate } = input;
  const productivity = input.productivity ?? 'low';

  if (headcount < 0) {
    throw new Error(`manure: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }

  const vsFactor = MANURE_VS[animal]?.[region];
  const wtFactor = MANURE_WEIGHT[animal]?.[region];
  if (!vsFactor || !wtFactor) {
    throw new Error(`manure: no verified IPCC VS/weight for ${animal} in region ${region}; refusing to estimate`);
  }

  const factor = resolveManureFactor(animal, productivity, system, climate);

  // VS_annual = VS_mean × weight_mean / 1000 × 365  (kg VS/head/yr).
  const vsAnnual = ((vsFactor.value * wtFactor.value) / 1000) * 365;
  // tCO2e = head × VS_annual × factor(gCH4/kgVS) × GWP / 1e6  (the /1e6 folds both /1000s).
  const emissions = (headcount * vsAnnual * factor.value * FLAG_GWP_AR6.CH4_biogenic) / 1e6;

  return {
    emissions,
    dataQuality: 'secondary',
    gas: 'CH4',
    factor,
    basis: 'IPCC 2019 Tier 1 manure CH4 (screening-grade default)',
  };
}
