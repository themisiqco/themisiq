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

import { ENTERIC_CATTLE, ENTERIC_OTHER, FLAG_GWP_AR6, MANURE_VS, MANURE_WEIGHT, MANURE_FACTOR, SYSTEM_VALIDITY, MANURE_LIQUID_FACTOR, LIQUID_SYSTEM_VALIDITY, MANURE_BIOGAS_FACTOR, MANURE_N_RATE, MANURE_N2O_EF3, N2O_EF4, N2O_EF5, FRACGAS_MS, FRACLEACH_MS, N2O_EF1_SYNTH, FRACGASF, FRACLEACH_H, N2O_EF1_OTHER, FRACGASM, N2O_EF3PRP, CROP_RESIDUE_PARAMS, LUC_CARBON_FRACTION, LUC_CARBON_FRACTION_SRC, C_TO_CO2, DELTA_CG, FOREST_AGB, ROOT_SHOOT, LUC_SOC_AMORT_YEARS, SOC_REF, CLIMATE_MAP, F_LU, F_MG, F_I, F_LU_MG_I_SRC } from './params';
import type { EmissionFactor, ManureSpecies, ManureSubcategory, ManureSystem, ManureClimate, ManureClimateZone, ManureLiquidSystem, DigesterQuality, ManureN2OSystem, ManureN2OIndirectSystem, ManureSpeciesGroup, IndirectClimate, FertiliserType, CropType, CropResidueParams, CropConversionType, ForestZone, ForestContinent, SoilClimate, SoilType, Tillage, CarbonInput, SoilCoarseRegime, ManureActivityTable } from './params';
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

// Productivity default = LOW for ALL species, regions, and systems (dry AND liquid). The
// Table 10.14 high/low split is a Tier 1a construct ("omitted if using a simple Tier 1
// approach"); simple Tier 1 uses the conservative low-productivity EFs. HIGH is an explicit
// Tier 1a opt-in the caller chooses via `productivity`. Buffalo is force-routed to
// other_cattle LOW in the factor resolvers (footnote 6) regardless.
function defaultProductivity(): 'high' | 'low' {
  return 'low';
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
    // Turkeys & ducks carry a single GLOBAL value (region ignored); chicken sub-categories
    // (hens/pullets/broilers) and swine keep their 9-region lookup.
    const key = subcategory === 'turkeys' || subcategory === 'ducks' ? 'global' : region;
    return table[animal][subcategory]?.[key];
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

// Liquid systems (M3a+). Distinct from dry systems: they use the 10-zone climateZone.
const LIQUID_SYSTEMS: readonly ManureLiquidSystem[] = ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'liquid_slurry_pit_lt_1_month', 'anaerobic_digestion_biogas'];
function isLiquid(system: ManureSystem | ManureLiquidSystem): system is ManureLiquidSystem {
  return (LIQUID_SYSTEMS as readonly string[]).includes(system);
}

// Resolve the Table 10.14 liquid CH4 factor (10-zone). Poultry LOW → the all-systems 2.4
// scalar (applies to liquid too). Buffalo → other_cattle.low liquid factors (footnote 6).
function resolveLiquidFactor(
  animal: ManureSpecies,
  productivity: 'high' | 'low',
  liquidSystem: ManureLiquidSystem,
  climateZone: ManureClimateZone,
): EmissionFactor {
  if (animal === 'poultry') {
    if (productivity === 'low') return MANURE_FACTOR.poultry.low; // all-systems 2.4, even for lagoon
    const cz = MANURE_LIQUID_FACTOR.poultry.high[liquidSystem]?.[climateZone];
    if (!cz) throw new Error(`manure CH4: ${liquidSystem} not applicable for poultry (IPCC Table 10.14); check input`);
    return cz;
  }
  if (animal === 'dairy_cattle' || animal === 'other_cattle' || animal === 'swine' || animal === 'buffalo') {
    const isBuffalo = animal === 'buffalo';
    const factorSpecies: 'dairy_cattle' | 'other_cattle' | 'swine' = isBuffalo ? 'other_cattle' : animal;
    const factorProd: 'high' | 'low' = isBuffalo ? 'low' : productivity;
    const cz = MANURE_LIQUID_FACTOR[factorSpecies][factorProd][liquidSystem]?.[climateZone];
    if (!cz) throw new Error(`manure CH4: ${liquidSystem} not applicable for ${animal} (IPCC Table 10.14); check input`);
    return isBuffalo
      ? { ...cz, note: 'buffalo uses other_cattle low-productivity factors (Table 10.14 footnote 6)' }
      : cz;
  }
  // sheep/goats/horses/mules_asses/camels — no liquid systems (already blocked by validity).
  throw new Error(`manure CH4: ${liquidSystem} not applicable for ${animal} (IPCC Table 10.14); check input`);
}

// Resolve the Table 10.14 biogas CH4 factor (3-zone climate, DIGESTER-QUALITY axis — NOT
// productivity). Poultry LEAKY has no source row → routes to the all-systems 2.4 scalar.
// Buffalo → other_cattle grid (footnote 6), own VS/weight.
function resolveBiogasFactor(
  animal: ManureSpecies,
  digesterQuality: DigesterQuality,
  climate: ManureClimate,
): EmissionFactor {
  if (animal === 'poultry') {
    if (digesterQuality === 'leaky') return MANURE_FACTOR.poultry.low; // no poultry.leaky biogas row → 2.4
    return MANURE_BIOGAS_FACTOR.poultry.gas_tight[climate];
  }
  if (animal === 'dairy_cattle' || animal === 'other_cattle' || animal === 'swine' || animal === 'buffalo') {
    const isBuffalo = animal === 'buffalo';
    const species: 'dairy_cattle' | 'other_cattle' | 'swine' = isBuffalo ? 'other_cattle' : animal;
    const f = MANURE_BIOGAS_FACTOR[species][digesterQuality][climate];
    return isBuffalo ? { ...f, note: 'buffalo uses other_cattle factors (Table 10.14 footnote 6)' } : f;
  }
  throw new Error(`manure CH4: anaerobic_digestion_biogas not applicable for ${animal} (IPCC Table 10.14); check input`);
}

// Manure CH4 for one line (tCO2e). Cattle/buffalo use a species regional Mean for VS/weight;
// swine/poultry use a per-sub-category regional value. Dry systems use the 3-zone `climate`;
// liquid systems use the 10-zone `climateZone`. Fails loud for any inapplicable (species,
// system) combo, wrong/missing climate vocabulary, or unverified VS/weight — never guesses.
export function estimateManureCH4(input: {
  animal: ManureSpecies;
  headcount: number;
  region: string;                          // required — VS & weight are regional
  system: ManureSystem | ManureLiquidSystem;
  climate?: ManureClimate;                 // required for climate-keyed DRY systems
  climateZone?: ManureClimateZone;         // required for 10-zone LIQUID systems (lagoon, slurry/pit)
  productivity?: 'high' | 'low';           // default 'low' (simple Tier 1); 'high' = Tier 1a opt-in
  subcategory?: ManureSubcategory;         // REQUIRED for swine/poultry; cattle/buffalo ignore it
  digesterQuality?: DigesterQuality;       // ONLY for anaerobic_digestion_biogas; default 'leaky'
}): EmissionEstimate {
  const { animal, headcount, region, system, climate, climateZone, subcategory } = input;

  if (headcount < 0) {
    throw new Error(`manure: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }

  const liquid = isLiquid(system);
  const biogas = system === 'anaerobic_digestion_biogas'; // liquid, but 3-zone climate + digester axis

  // System applicability per species — fail loud (e.g. poultry pasture, sheep lagoon).
  if (liquid) {
    if (!LIQUID_SYSTEM_VALIDITY[animal].includes(system)) {
      throw new Error(`manure CH4: ${system} not applicable for ${animal} (IPCC Table 10.14); check input`);
    }
    if (biogas) {
      // Biogas uses the 3-zone climate, NOT the 10-zone climateZone.
      if (!climate) {
        throw new Error('manure CH4: anaerobic_digestion_biogas uses 3-zone climate (cool|temperate|warm), not the 10-zone climateZone; refusing to estimate');
      }
    } else if (!climateZone) {
      throw new Error(`manure CH4: climateZone (10-zone) required for liquid system ${system}; refusing to estimate`);
    }
  } else if (!SYSTEM_VALIDITY[animal].includes(system)) {
    throw new Error(`manure CH4: system ${system} not applicable for ${animal} (IPCC Table 10.14); check input`);
  }

  // Swine/poultry require a sub-category (VS & weight are per sub-category, not a species Mean).
  if ((animal === 'swine' || animal === 'poultry') && !subcategory) {
    throw new Error(`manure CH4: subcategory required for ${animal}; refusing to estimate`);
  }

  const productivity = input.productivity ?? defaultProductivity();

  const vsFactor = lookupActivity(MANURE_VS, animal, subcategory, region);
  const wtFactor = lookupActivity(MANURE_WEIGHT, animal, subcategory, region);
  if (!vsFactor || !wtFactor) {
    throw new Error(`manure: no verified IPCC VS/weight for ${animal}${subcategory ? '/' + subcategory : ''} in region ${region}; refusing to estimate`);
  }

  // Biogas: dedicated 3-zone + digester-quality resolution (default 'leaky', conservative);
  // productivity is IGNORED. Other liquids use 10-zone climateZone; dry systems require
  // `climate` (the needClimate throw inside resolveManureFactor fires if missing — so a
  // climateZone passed to a dry system never silently substitutes for the 3-zone climate).
  const digesterQuality: DigesterQuality = input.digesterQuality ?? 'leaky';
  const factor = biogas
    ? resolveBiogasFactor(animal, digesterQuality, climate as ManureClimate)
    : isLiquid(system)
      ? resolveLiquidFactor(animal, productivity, system, climateZone as ManureClimateZone)
      : resolveManureFactor(animal, productivity, system, climate);

  // VS_annual = VS_mean × weight_mean / 1000 × 365  (kg VS/head/yr).
  const vsAnnual = ((vsFactor.value * wtFactor.value) / 1000) * 365;
  // tCO2e = head × VS_annual × factor(gCH4/kgVS) × GWP / 1e6  (the /1e6 folds both /1000s).
  const emissions = (headcount * vsAnnual * factor.value * FLAG_GWP_AR6.CH4_biogenic) / 1e6;

  // Turkeys/ducks reuse the poultry factor grids with their own global VS/weight — make that explicit.
  const poultrySubNote = subcategory === 'turkeys' || subcategory === 'ducks'
    ? ` · poultry (${subcategory}) sub-category — VS/weight Tables 10.13a/10A.5 (global), manure CH4 factor Table 10.14 Poultry block`
    : '';

  let basis: string;
  if (biogas) {
    // Digester-quality basis — kept EXPLICIT so it is never confused with herd productivity.
    basis = `IPCC 2019 Tier 1 manure CH4, anaerobic digestion–biogas, ${digesterQuality} digester (footnote 8; leaky = conservative default)${poultrySubNote}, screening-grade`;
  } else {
    // Tier 1a (explicit high-productivity opt-in) vs simple Tier 1 (low-productivity default).
    const tierLabel = productivity === 'high'
      ? 'Tier 1a manure CH4 (high-productivity, caller-specified)'
      : 'simple Tier 1 manure CH4 (low-productivity default)';
    const ctx = isLiquid(system) ? ` (liquid, ${climateZone})` : subcategory ? ` (${subcategory})` : '';
    basis = `IPCC 2019 ${tierLabel}${ctx}${poultrySubNote}, screening-grade`;
  }

  return {
    emissions,
    dataQuality: 'secondary',
    gas: 'CH4',
    factor,
    basis,
  };
}

// ── Direct manure-management N2O (IPCC Eq. 10.25) ───────────────────────────────
// N-rate region resolution mirrors CH4 per species (region-resolution unification): camels &
// mules_asses are global; sheep/goats/horses two-way; cattle/swine/poultry region/sub-category.
function resolveNRate(
  animal: ManureSpecies,
  subcategory: ManureSubcategory | undefined,
  region: string,
): EmissionFactor | undefined {
  if (animal === 'swine' || animal === 'poultry') {
    if (!subcategory) return undefined;
    const key = subcategory === 'turkeys' || subcategory === 'ducks' ? 'global' : region;
    return MANURE_N_RATE[animal][subcategory]?.[key];
  }
  if (animal === 'sheep' || animal === 'goats' || animal === 'horses') {
    return MANURE_N_RATE[animal][classifyDeveloped(region)];
  }
  if (animal === 'mules_asses' || animal === 'camels') {
    return MANURE_N_RATE[animal]; // global — camels unified with CH4 (region ignored)
  }
  return MANURE_N_RATE[animal][region]; // dairy_cattle / other_cattle / buffalo
}

// Direct manure-management N2O for one line (tCO2e). Eq. 10.25: N_ex × EF3 × 44/28 × GWP.
// pasture → managed soils (Ch.11); burned-for-fuel → Fuel Combustion; niche/aerobic/composting
// → deferred. Legit-zero EF3 systems compute normally and return 0 (NOT a throw).
export function estimateManureN2O(input: {
  animal: ManureSpecies;
  region: string;
  headcount: number;
  system: ManureN2OSystem;
  subcategory?: ManureSubcategory;
  productivity?: 'high' | 'low'; // parallel to CH4; N-rate uses the MEAN column, so it never
                                 // changes the result — kept only for signature symmetry.
}): EmissionEstimate {
  const { animal, region, headcount, system, subcategory } = input;

  if (headcount < 0) {
    throw new Error(`manure N2O: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }

  // Three-way system handling.
  if (system === 'pasture_range_paddock') {
    throw new Error('manure N2O: direct manure N2O for pasture/range/paddock is assessed under managed soils (IPCC Chapter 11) — use estimateGrazingDepositionN2O');
  }
  if (system === 'burned_for_fuel') {
    throw new Error('manure N2O: burned-for-fuel N2O is reported under Fuel Combustion, not manure management');
  }
  const ef3Factor = MANURE_N2O_EF3[system];
  if (!ef3Factor) {
    throw new Error(`manure N2O: system ${system} not supported (niche/deferred EF3, e.g. composting/aerobic); refusing to estimate`);
  }

  // Swine/poultry require a sub-category (N-rate & weight are per sub-category).
  if ((animal === 'swine' || animal === 'poultry') && !subcategory) {
    throw new Error(`manure N2O: subcategory required for ${animal}; refusing to estimate`);
  }

  const nRate = resolveNRate(animal, subcategory, region);
  const wt = lookupActivity(MANURE_WEIGHT, animal, subcategory, region); // weight uses CH4 resolution
  if (!nRate || !wt) {
    throw new Error(`manure N2O: no verified IPCC N-rate/weight for ${animal}${subcategory ? '/' + subcategory : ''} in region ${region}; refusing to estimate`);
  }

  // N_ex_annual = Nrate × weight / 1000 × 365  (kg N/head/yr).
  const nExAnnual = ((nRate.value * wt.value) / 1000) * 365;
  // tCO2e = head × N_ex × EF3(kgN2O-N/kgN) × 44/28 × N2O_GWP / 1000.
  // (No extra /1e6 — N_ex is already kg, unlike the g-based CH4 factors.)
  const emissions = (headcount * nExAnnual * ef3Factor.value * (44 / 28) * FLAG_GWP_AR6.N2O) / 1000;

  return {
    emissions,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef3Factor,
    basis: 'IPCC 2019 Tier 1 direct manure N2O (Eq.10.25; EF3 Table 10.21; N Table 10.19), screening-grade',
  };
}

// ── Indirect manure N2O (volatilisation Eq. 10.26 + leaching Eq. 10.27) ──────────
// The 13 species collapse to 5 Table 10.22 groups for FracGas/FracLeach lookup ONLY;
// N_ex still uses the full species N-rate/weight.
function speciesGroup(species: ManureSpecies): ManureSpeciesGroup {
  if (species === 'dairy_cattle') return 'dairy_cow';
  if (species === 'other_cattle' || species === 'buffalo') return 'other_cattle'; // buffalo→other_cattle (footnote-6 consistency)
  if (species === 'swine') return 'swine';
  if (species === 'poultry') return 'poultry'; // hens/pullets/broilers/turkeys/ducks
  return 'other_animals'; // sheep/goats/horses/mules_asses/camels
}

export function estimateManureN2OIndirect(input: {
  animal: ManureSpecies;
  region: string;
  headcount: number;
  system: ManureN2OIndirectSystem;
  climate: IndirectClimate;              // REQUIRED — selects EF4 AND gates leaching
  subcategory?: ManureSubcategory;
  digesterFracGasOverride?: number;      // anaerobic_digester only (0.05–0.50)
}): EmissionEstimate {
  const { animal, region, headcount, system, climate, subcategory } = input;

  if (headcount < 0) {
    throw new Error(`manure N2O (indirect): headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  }
  // Climate is required — it selects EF4 and gates leaching; there is no honest default.
  if (climate !== 'wet' && climate !== 'dry') {
    throw new Error('manure N2O (indirect): climate (wet|dry) is required — it selects EF4 and gates leaching');
  }

  // Swine/poultry require a sub-category (N-rate & weight are per sub-category).
  if ((animal === 'swine' || animal === 'poultry') && !subcategory) {
    throw new Error(`manure N2O (indirect): subcategory required for ${animal}; refusing to estimate`);
  }

  const group = speciesGroup(animal);

  // FracGas — four-way: numeric (incl. 0) → compute; 'NA' → not applicable; 'NODATA' → country-specific required.
  const fracGasCell = FRACGAS_MS[system][group];
  if (fracGasCell === 'NA') {
    throw new Error(`manure N2O (indirect): system ${system} not applicable for ${group} (Table 10.22: NA)`);
  }
  if (fracGasCell === 'NODATA') {
    throw new Error(`manure N2O (indirect): no IPCC default volatilisation fraction for ${group}/${system} (Table 10.22: no data); country-specific value required`);
  }
  let fracGas: number = fracGasCell;
  if (system === 'anaerobic_digester' && input.digesterFracGasOverride != null) {
    const ov = input.digesterFracGasOverride;
    if (ov < 0.05 || ov > 0.50) {
      throw new Error(`manure N2O (indirect): digester FracGas override must be within 0.05–0.50 (got ${ov})`);
    }
    fracGas = ov;
  }
  const fracLeach = FRACLEACH_MS[system]?.[group] ?? 0;

  // N_ex_annual (REUSE the direct-N2O N-rate + weight, SAME region resolution).
  const nRate = resolveNRate(animal, subcategory, region);
  const wt = lookupActivity(MANURE_WEIGHT, animal, subcategory, region);
  if (!nRate || !wt) {
    throw new Error(`manure N2O (indirect): no verified IPCC N-rate/weight for ${animal}${subcategory ? '/' + subcategory : ''} in region ${region}; refusing to estimate`);
  }
  const nExAnnual = ((nRate.value * wt.value) / 1000) * 365;

  const ef4 = N2O_EF4[climate];
  const CONV = (44 / 28) * FLAG_GWP_AR6.N2O / 1000; // 44/28 (N→N2O) × GWP / 1000 → tCO2e per kg N-source
  const volatilisation = headcount * nExAnnual * fracGas * ef4.value * CONV;
  // Leaching applies ONLY in wet climates (Table 11.3 note); dry → 0.
  const leaching = climate === 'wet' ? headcount * nExAnnual * fracLeach * N2O_EF5.value * CONV : 0;

  return {
    emissions: volatilisation + leaching,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef4, // primary indirect factor (EF4, climate-selected); FracGas/FracLeach in the basis
    basis: 'IPCC 2019 Tier 1 indirect manure N2O (volatilisation Eq.10.26 + leaching Eq.10.27; FracGas/FracLeach Table 10.22; EF4/EF5 Table 11.3; leaching wet-climate only), screening-grade',
    breakdown: { volatilisation, leaching },
  };
}

// ── Managed-soils N2O from synthetic fertiliser (IPCC Ch.11) ─────────────────────
// Input model DIFFERS: the caller supplies kg N APPLIED (not headcount). Self-contained —
// NOT routed through the manure species/system machinery. Direct (Eq.11.1, EF1) + indirect
// volatilisation (Eq.11.9, FracGASF×EF4) + leaching (Eq.11.10, FracLEACH×EF5, wet only).
export function estimateSyntheticFertiliserN2O(input: {
  nApplied: number;             // kg N applied
  climate: IndirectClimate;     // REQUIRED — selects EF1/EF4 AND gates leaching
  fertiliserType?: FertiliserType;
}): EmissionEstimate {
  const { nApplied, climate, fertiliserType } = input;

  if (nApplied < 0) {
    throw new Error(`synthetic fertiliser N2O: nApplied must be >= 0 (got ${nApplied})`);
  }
  if (climate !== 'wet' && climate !== 'dry') {
    throw new Error('synthetic fertiliser N2O: climate (wet|dry) is required — it selects EF1/EF4 and gates leaching');
  }

  const ef1 = N2O_EF1_SYNTH[climate];
  const ef4 = N2O_EF4[climate];
  const type = fertiliserType ?? 'unspecified';
  const fracGasF = type === 'unspecified' ? FRACGASF.default : FRACGASF[type];

  const CONV = (44 / 28) * FLAG_GWP_AR6.N2O / 1000; // N→N2O × GWP / 1000 → tCO2e per kg N-source
  const direct = nApplied * ef1.value * CONV;
  const volatilisation = nApplied * fracGasF * ef4.value * CONV;
  // Leaching applies ONLY in wet climates (Table 11.3 note); dry → 0.
  const leaching = climate === 'wet' ? nApplied * FRACLEACH_H * N2O_EF5.value * CONV : 0;

  return {
    emissions: direct + volatilisation + leaching,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef1, // primary factor (EF1 direct, climate-selected); FracGASF/EF4/EF5 in the basis
    basis: 'IPCC 2019 Tier 1 synthetic fertiliser N2O (Ch.11 Eq.11.1 direct EF1 + Eq.11.9/11.10 indirect FracGASF×EF4 + FracLEACH×EF5; leaching wet-only), screening-grade',
    breakdown: { direct, volatilisation, leaching },
  };
}

// ── Managed-soils: applied manure to soil (kg N) & grazing deposition/PRP (headcount) ───
// Both reuse the indirect machinery (FracGASM×EF4 volatilisation, FracLEACH×EF5 leaching, wet-only).
const CONV_N2O = (44 / 28) * FLAG_GWP_AR6.N2O / 1000; // N→N2O × GWP / 1000 → tCO2e per kg N-source

// (a) Managed manure spread on soil. Direct via EF1 "other N inputs".
export function estimateAppliedManureN2O(input: {
  nApplied: number;             // kg N applied
  climate: IndirectClimate;     // REQUIRED
}): EmissionEstimate {
  const { nApplied, climate } = input;
  if (nApplied < 0) throw new Error(`applied manure N2O: nApplied must be >= 0 (got ${nApplied})`);
  if (climate !== 'wet' && climate !== 'dry') {
    throw new Error('applied manure N2O: climate (wet|dry) is required — it selects EF1/EF4 and gates leaching');
  }

  const ef1 = N2O_EF1_OTHER[climate];
  const direct = nApplied * ef1.value * CONV_N2O;
  const volatilisation = nApplied * FRACGASM * N2O_EF4[climate].value * CONV_N2O;
  const leaching = climate === 'wet' ? nApplied * FRACLEACH_H * N2O_EF5.value * CONV_N2O : 0;

  return {
    emissions: direct + volatilisation + leaching,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef1,
    basis: 'IPCC 2019 Tier 1 applied manure to soil N2O (Ch.11; EF1-other + FracGASM×EF4 + FracLEACH×EF5), screening-grade',
    breakdown: { direct, volatilisation, leaching },
  };
}

// PRP direct-EF grouping: cattle/buffalo/swine/poultry → 'cpp' (wet/dry); small ruminants &
// equids → 'so' (flat 0.003, no climate split for the DIRECT term).
function prpGroup(species: ManureSpecies): 'cpp' | 'so' {
  if (species === 'sheep' || species === 'goats' || species === 'horses' || species === 'mules_asses' || species === 'camels') return 'so';
  return 'cpp'; // dairy_cattle/other_cattle/buffalo/swine/poultry
}

// (b) Grazing deposition (PRP). Destination for the direct-manure pasture redirect. Deposited N
// is the full excreted N (reuse the direct-manure N-rate + weight lookup).
export function estimateGrazingDepositionN2O(input: {
  animal: ManureSpecies;
  region: string;
  headcount: number;
  climate: IndirectClimate;     // REQUIRED
  subcategory?: ManureSubcategory;
}): EmissionEstimate {
  const { animal, region, headcount, climate, subcategory } = input;
  if (headcount < 0) throw new Error(`grazing deposition N2O: headcount must be >= 0 (animal ${animal}, got ${headcount})`);
  if (climate !== 'wet' && climate !== 'dry') {
    throw new Error('grazing deposition N2O: climate (wet|dry) is required — it selects EF4 and gates leaching');
  }
  if ((animal === 'swine' || animal === 'poultry') && !subcategory) {
    throw new Error(`grazing deposition N2O: subcategory required for ${animal}; refusing to estimate`);
  }

  const nRate = resolveNRate(animal, subcategory, region);
  const wt = lookupActivity(MANURE_WEIGHT, animal, subcategory, region);
  if (!nRate || !wt) {
    throw new Error(`grazing deposition N2O: no verified IPCC N-rate/weight for ${animal}${subcategory ? '/' + subcategory : ''} in region ${region}; refusing to estimate`);
  }
  const nExAnnual = ((nRate.value * wt.value) / 1000) * 365;
  const nDeposited = headcount * nExAnnual; // all excreted N deposited on pasture

  const group = prpGroup(animal);
  const ef3 = group === 'so' ? N2O_EF3PRP.so : N2O_EF3PRP.cpp[climate]; // 'so' is climate-flat
  const direct = nDeposited * ef3.value * CONV_N2O;
  const volatilisation = nDeposited * FRACGASM * N2O_EF4[climate].value * CONV_N2O;
  const leaching = climate === 'wet' ? nDeposited * FRACLEACH_H * N2O_EF5.value * CONV_N2O : 0;

  return {
    emissions: direct + volatilisation + leaching,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef3, // EF3PRP (group/climate-selected); indirect fracs cited in the basis
    basis: 'IPCC 2019 Tier 1 grazing deposition (PRP) N2O (Ch.11; EF3PRP + FracGASM×EF4 + FracLEACH×EF5), screening-grade',
    breakdown: { direct, volatilisation, leaching },
  };
}

// ── Crop-residue N2O (managed soils) — residue-N derivation then the Ch.11 tail ─────
// FIRST pathway with an activity-data derivation step (Eq.11.6/11.7) before the emission chain.
export function estimateCropResidueN2O(input: {
  crop: CropType | string;      // unknown → 'generic' fallback (IPCC-provided)
  yieldFresh: number;           // kg fresh/ha
  area: number;                 // ha
  climate: IndirectClimate;     // REQUIRED
  fracRemove?: number;          // default 0 (Eq.11.6: assume no removal if unavailable)
  fracBurnt?: number;           // default 0
  fracRenew?: number;           // default 1 (annual; perennial = 1/X)
  cf?: number;                  // combustion factor (Ch.2 Table 2.6); only used if fracBurnt > 0
}): EmissionEstimate {
  const { crop, yieldFresh, area, climate } = input;

  if (yieldFresh < 0 || area < 0) {
    throw new Error(`crop residue N2O: yieldFresh and area must be >= 0 (got ${yieldFresh}, ${area})`);
  }
  if (climate !== 'wet' && climate !== 'dry') {
    throw new Error('crop residue N2O: climate (wet|dry) is required — it selects EF1/EF4 and gates leaching');
  }

  const fr = input.fracRemove ?? 0;
  const fb = input.fracBurnt ?? 0;
  const frenew = input.fracRenew ?? 1;
  const cf = input.cf ?? 0;
  const inRange = (x: number) => x >= 0 && x <= 1;
  if (![fr, fb, frenew, cf].every(inRange)) {
    throw new Error('crop residue N2O: fractions (fracRemove/fracBurnt/fracRenew/cf) must be within [0,1]');
  }
  if (fr + fb * cf > 1) {
    throw new Error('crop residue N2O: residue removed+burnt fraction exceeds 1 (AG residue-N would go negative)');
  }

  const isKnown = Object.prototype.hasOwnProperty.call(CROP_RESIDUE_PARAMS, crop);
  const p: CropResidueParams = (CROP_RESIDUE_PARAMS as Record<string, CropResidueParams>)[crop] ?? CROP_RESIDUE_PARAMS.generic;

  // Residue-N derivation (Eq.11.7 dry-matter, Eq.11.6 residue-N). Null coefficients drop their term.
  const cropDm = yieldFresh * p.dry;                                  // kg d.m./ha
  const agDm = p.rAg != null ? cropDm * p.rAg : 0;                    // rAg null → AG residue 0
  const agr = agDm * area;                                           // total above-ground residue d.m.
  const bgr = p.rs != null ? (cropDm + agDm) * p.rs * area * frenew : 0; // rs null → BGR 0
  const agN = agr * p.nAg * (1 - fr - fb * cf);
  const bgN = p.nBg != null ? bgr * p.nBg : 0;                        // nBg null → BGR-N 0
  const fCr = agN + bgN;                                              // kg residue N

  const ef1 = N2O_EF1_OTHER[climate];
  const direct = fCr * ef1.value * CONV_N2O;
  const volatilisation = fCr * FRACGASM * N2O_EF4[climate].value * CONV_N2O;
  const leaching = climate === 'wet' ? fCr * FRACLEACH_H * N2O_EF5.value * CONV_N2O : 0;

  return {
    emissions: direct + volatilisation + leaching,
    dataQuality: 'secondary',
    gas: 'N2O',
    factor: ef1,
    basis: `IPCC 2019 Tier 1 crop-residue N2O (Eq.11.6/11.7 residue-N derivation + EF1-other + FracGASM×EF4 + FracLEACH×EF5; Frac_Remove/Burnt exclude residue counted under manure/biomass-burning to avoid double-counting)${isKnown ? '' : ' [generic crop default]'}, screening-grade`,
    breakdown: { direct, volatilisation, leaching },
    fCrKgN: fCr,
  };
}

// ── Land Use Change → Cropland: biomass carbon stock change (Ch.5 §5.3.1, Tier 1) ───
// STRUCTURALLY NEW: not activity×factor but (B_before − ΔC_G) × area × 44/12, booked whole in
// the conversion year (instantaneous). SCREENING-GRADE, biomass pool only (soil pending LUC-2).
function rootShoot(zone: ForestZone, agb: number): number {
  const spec = ROOT_SHOOT[zone];
  if (spec == null) throw new Error(`LUC: no root:shoot R for ${zone}`);
  if (typeof spec === 'number') return spec;
  return agb < spec.threshold ? spec.below : spec.above;
}

// Forest biomass carbon B_before (t C/ha) = AGB × (1 + R) × CF(0.5). Table 4.7 × 4.4 × 5.8.
export function forestBiomassCarbon(zone: ForestZone, continent: ForestContinent): number {
  const zoneTable = FOREST_AGB[zone];
  if (!zoneTable) {
    throw new Error(`LUC: no point default for ${zone} (range/age-split zone omitted); supply bBefore directly`);
  }
  const agb = zoneTable[continent];
  if (agb == null) {
    throw new Error(`LUC: no Table 4.7 default for ${zone}/${continent}; supply bBefore directly`);
  }
  return agb * (1 + rootShoot(zone, agb)) * LUC_CARBON_FRACTION;
}

export function estimateLUCtoCropland(input: {
  bBefore_tCha: number;        // biomass C before conversion (t C/ha)
  area_ha: number;
  cropType: CropConversionType;
  originLandType?: 'forest' | 'grassland';
}): EmissionEstimate {
  const { bBefore_tCha, area_ha, cropType, originLandType } = input;
  if (bBefore_tCha < 0 || area_ha < 0) {
    throw new Error(`LUC to cropland: bBefore_tCha and area_ha must be >= 0 (got ${bBefore_tCha}, ${area_ha})`);
  }

  const deltaCG = DELTA_CG[cropType];
  const netLoss_tCha = bBefore_tCha - deltaCG; // may be negative (regrowth > loss) — allowed, not clamped
  const emissions_tCO2 = netLoss_tCha * area_ha * C_TO_CO2;

  // The carbon fraction (CF 0.5, Table 5.8) is the cited constant surfaced as the estimate's factor.
  const factor: EmissionFactor = { value: LUC_CARBON_FRACTION, unit: 'tC/t-dm', source: LUC_CARBON_FRACTION_SRC, tier: 1 };

  const soilFlag = originLandType === 'grassland'
    ? ' — WARNING: grassland conversion is SOIL-dominated; the biomass term is computed but the dominant soil carbon change is NOT included (pending LUC-2); this estimate is materially incomplete for grassland conversion'
    : '';

  return {
    emissions: emissions_tCO2,
    dataQuality: 'secondary',
    gas: 'CO2',
    factor,
    category: 'land_use_change', // NOT land_management — this books in the LUC category
    hectares: area_ha,
    carbonStock: { biomass: emissions_tCO2, soil: null }, // soil pending LUC-2
    basis: `IPCC 2006 GL Vol4 Tier-1 land-converted-to-cropland biomass (Eq 2.16; B_after=0, conversion-year instantaneous; CF 0.5 per Table 5.8; ΔC_G Table 5.9); SCREENING ESTIMATE, biomass pool only, excludes soil organic carbon change${soilFlag}`,
  };
}

// ── LUC → Cropland: SOIL organic carbon change (Ch2 §2.3.3 + Ch5 §5.3.3, Tier 1, 20-yr amortised) ──
// Pairs with LUC-1 biomass and CLOSES the grassland soil-incompleteness flag. Option-3 management:
// F_MG/F_I are applied only when BOTH tillage + carbonInput are supplied; otherwise F_LU-only + a loud flag.
function fMgAfter(tillage: Tillage, coarse: SoilCoarseRegime): number {
  if (tillage === 'full') return F_MG.full;
  return (tillage === 'reduced' ? F_MG.reduced : F_MG.no_till)[coarse];
}
function fIAfter(input: CarbonInput, coarse: SoilCoarseRegime): number {
  if (input === 'medium') return F_I.medium;
  if (input === 'low') return F_I.low[coarse];
  // high_no_manure / high_with_manure collapse to dry | moistwet (+ tropical_montane).
  const k: 'dry' | 'moistwet' | 'tropical_montane' =
    coarse === 'tropical_montane' ? 'tropical_montane'
    : coarse === 'temperate_dry' || coarse === 'tropical_dry' ? 'dry'
    : 'moistwet';
  return (input === 'high_no_manure' ? F_I.high_no_manure : F_I.high_with_manure)[k];
}

export function estimateLUCtoCroplandSoil(input: {
  climate: SoilClimate;
  soil: SoilType;
  area_ha: number;
  originLandType: 'forest' | 'grassland' | 'native'; // Tier-1: origin assumed native/stable → SOC_before = SOC_ref
  tillage?: Tillage;
  carbonInput?: CarbonInput;
}): EmissionEstimate {
  const { climate, soil, area_ha, tillage, carbonInput } = input;
  if (area_ha < 0) throw new Error(`LUC SOC: area_ha must be >= 0 (got ${area_ha})`);

  const socRef = SOC_REF[climate][soil];
  if (socRef == null) {
    throw new Error(`LUC SOC: soil ${soil} does not occur in ${climate} (Table 2.3: NA)`);
  }
  const coarse = CLIMATE_MAP[climate];
  const fLu = F_LU.long_term_cultivated[coarse];

  // Option-3: apply management/input factors only when BOTH are supplied; else F_LU-only fallback.
  let fMg = 1, fI = 1, managementApplied = false;
  if (tillage && carbonInput) {
    fMg = fMgAfter(tillage, coarse);
    fI = fIAfter(carbonInput, coarse);
    managementApplied = true;
  }

  const socAfter = socRef * fLu * fMg * fI;
  const deltaAnnual = (socRef - socAfter) / LUC_SOC_AMORT_YEARS; // SOC_before = SOC_ref (native origin)
  const emissions_tCO2 = deltaAnnual * area_ha * C_TO_CO2;       // positive = loss; negative = SOC gain

  const factor: EmissionFactor = { value: fLu, unit: 'ratio', source: F_LU_MG_I_SRC, tier: 1 }; // dominant F_LU factor
  const flag = managementApplied ? ''
    : ' — SOC management/input factors NOT applied (tillage/carbonInput regime not supplied); this is the land-use-conversion soil loss ONLY and LIKELY UNDER-ESTIMATES a tilled cropland; supply tillage + carbonInput for the complete figure';

  return {
    emissions: emissions_tCO2,
    dataQuality: 'secondary',
    gas: 'CO2',
    factor,
    category: 'land_use_change',
    hectares: area_ha,
    carbonStock: { biomass: null, soil: emissions_tCO2 }, // pairs with LUC-1 biomass; this is the soil pool
    basis: `IPCC 2006 GL Tier-1 land-converted-to-cropland SOC (Ch2 Table 2.3 SOC_ref × Ch5 Table 5.5 F_LU/F_MG/F_I, 20-yr amortised); SCREENING ESTIMATE${flag}`,
  };
}
