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

import { ENTERIC_CATTLE, ENTERIC_OTHER, FLAG_GWP_AR6, MANURE_VS, MANURE_WEIGHT, MANURE_FACTOR, SYSTEM_VALIDITY } from './params';
import type { EmissionFactor, ManureSpecies, ManureSubcategory, ManureSystem, ManureClimate, ManureActivityTable } from './params';
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

// Table 10.14 footnote 1: North America, Europe, Oceania = developed; all others = developing.
// Callers may also pass 'developed'/'developing' directly (two-way species).
const DEVELOPED_REGIONS = ['north_america', 'western_europe', 'eastern_europe', 'oceania'];
function classifyDeveloped(region: string): 'developed' | 'developing' {
  if (region === 'developed') return 'developed';
  if (region === 'developing') return 'developing';
  return DEVELOPED_REGIONS.includes(region) ? 'developed' : 'developing';
}

// Productivity default (footnote 1): developed → high, developing → low. Cattle/buffalo keep
// their M1 'low' default (unchanged). Overridable via the caller's `productivity`.
function defaultProductivity(animal: ManureSpecies, region: string): 'high' | 'low' {
  if (animal === 'dairy_cattle' || animal === 'other_cattle' || animal === 'buffalo') {
    return 'low'; // unchanged from M1
  }
  return classifyDeveloped(region) === 'developed' ? 'high' : 'low';
}

// VS/weight lookup across all region-resolution strategies:
//   cattle/buffalo → [region] ; swine/poultry → [subcategory][region] ;
//   sheep/goats/horses → two-way (developed/developing) ; mules_asses/camels → single global.
// Returns undefined for any absent cell (caller fails loud).
function lookupActivity(
  table: ManureActivityTable,
  animal: ManureSpecies,
  subcategory: ManureSubcategory | undefined,
  region: string,
): EmissionFactor | undefined {
  if (animal === 'swine' || animal === 'poultry') {
    if (!subcategory) return undefined;
    return table[animal][subcategory]?.[region];
  }
  if (animal === 'sheep' || animal === 'goats' || animal === 'horses') {
    return table[animal][classifyDeveloped(region)];
  }
  if (animal === 'mules_asses' || animal === 'camels') {
    return table[animal]; // single global value — region ignored
  }
  // dairy_cattle / other_cattle / buffalo
  return table[animal][region];
}
// (animal is narrowed to the cattle/buffalo triple by the returns above.)

// Resolve the Table 10.14 CH4 factor. Poultry & swine have their own grids; buffalo has no
// own grid → routes to other_cattle.low (footnote 6). Pasture is cattle/buffalo-only.
function resolveManureFactor(
  animal: ManureSpecies,
  productivity: 'high' | 'low',
  system: ManureSystem,
  climate?: ManureClimate,
): EmissionFactor {
  const needClimate = (): ManureClimate => {
    if (!climate) throw new Error(`manure CH4: climate (cool|temperate|warm) required for system ${system}; refusing to estimate`);
    return climate;
  };

  // Pasture — cattle/buffalo only (SYSTEM_VALIDITY blocks swine/poultry upstream).
  if (system === 'pasture_range_paddock') return MANURE_FACTOR.pasture_range_paddock;

  // Poultry: LOW collapses to a single all-systems scalar; HIGH is solid_storage/dry_lot by
  // climate + a burned_for_fuel scalar (no daily_spread).
  if (animal === 'poultry') {
    if (productivity === 'low') return MANURE_FACTOR.poultry.low;
    if (system === 'burned_for_fuel') return MANURE_FACTOR.poultry.high.burned_for_fuel;
    if (system === 'solid_storage' || system === 'dry_lot') return MANURE_FACTOR.poultry.high[system][needClimate()];
    throw new Error(`manure CH4: system ${system} not applicable for poultry (IPCC Table 10.14); check input`);
  }

  // Swine: solid_storage/dry_lot/daily_spread by climate + a burned_for_fuel scalar.
  if (animal === 'swine') {
    const s = MANURE_FACTOR.swine[productivity];
    if (system === 'burned_for_fuel') return s.burned_for_fuel;
    if (system === 'solid_storage' || system === 'dry_lot' || system === 'daily_spread') return s[system][needClimate()];
    throw new Error(`manure CH4: system ${system} not applicable for swine (IPCC Table 10.14); check input`);
  }

  // Small ruminants & equids: solid_storage / dry_lot only (climate-keyed). No daily_spread /
  // burned_for_fuel (pasture handled above). A camels warm dry_lot factor of 0.0 is a REAL value.
  if (animal === 'sheep' || animal === 'goats' || animal === 'horses' || animal === 'mules_asses' || animal === 'camels') {
    const g = MANURE_FACTOR[animal][productivity];
    if (system === 'solid_storage' || system === 'dry_lot') return g[system][needClimate()];
    throw new Error(`manure CH4: system ${system} not applicable for ${animal} (IPCC Table 10.14); check input`);
  }

  // Cattle / buffalo. Buffalo uses other_cattle LOW factors everywhere (footnote 6).
  const isBuffalo = animal === 'buffalo';
  const factorSpecies: 'dairy_cattle' | 'other_cattle' = isBuffalo ? 'other_cattle' : animal;
  const factorProd: 'high' | 'low' = isBuffalo ? 'low' : productivity;
  const grid = MANURE_FACTOR[factorSpecies][factorProd];

  let base: EmissionFactor;
  if (system === 'burned_for_fuel') base = grid.burned_for_fuel;
  else if (system === 'solid_storage' || system === 'dry_lot' || system === 'daily_spread') base = grid[system][needClimate()];
  else throw new Error(`manure CH4: system ${system} not applicable for ${animal} (IPCC Table 10.14); check input`);

  return isBuffalo
    ? { ...base, note: 'buffalo uses other_cattle low-productivity factors (Table 10.14 footnote 6)' }
    : base;
}

// Manure CH4 for one line (tCO2e). Cattle/buffalo use a species regional Mean for VS/weight;
// swine/poultry use a per-sub-category regional value. Fails loud for any inapplicable
// (species, system) combo or any species/region without a verified VS/weight — never guesses.
export function estimateManureCH4(input: {
  animal: ManureSpecies;
  headcount: number;
  region: string;                     // required — VS & weight are regional
  system: ManureSystem;
  climate?: ManureClimate;            // required for climate-keyed systems
  productivity?: 'high' | 'low';      // default: cattle/buffalo 'low'; swine/poultry region-based
  subcategory?: ManureSubcategory;    // REQUIRED for swine/poultry; cattle/buffalo ignore it
}): EmissionEstimate {
  const { animal, headcount, region, system, climate, subcategory } = input;

  if (headcount < 0) {
    throw new Error(`manure: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }

  // System applicability per species — fail loud on inapplicable combos (e.g. poultry pasture).
  if (!SYSTEM_VALIDITY[animal].includes(system)) {
    throw new Error(`manure CH4: system ${system} not applicable for ${animal} (IPCC Table 10.14); check input`);
  }

  // Swine/poultry require a sub-category (VS & weight are per sub-category, not a species Mean).
  if ((animal === 'swine' || animal === 'poultry') && !subcategory) {
    throw new Error(`manure CH4: subcategory required for ${animal}; refusing to estimate`);
  }

  const productivity = input.productivity ?? defaultProductivity(animal, region);

  const vsFactor = lookupActivity(MANURE_VS, animal, subcategory, region);
  const wtFactor = lookupActivity(MANURE_WEIGHT, animal, subcategory, region);
  if (!vsFactor || !wtFactor) {
    throw new Error(`manure: no verified IPCC VS/weight for ${animal}${subcategory ? '/' + subcategory : ''} in region ${region}; refusing to estimate`);
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
    basis: subcategory
      ? `IPCC 2019 Tier 1 manure CH4 (${subcategory}), screening-grade`
      : 'IPCC 2019 Tier 1 manure CH4 (screening-grade default)',
  };
}
