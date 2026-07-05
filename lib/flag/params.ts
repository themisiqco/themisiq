// lib/flag/params.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for FLAG (land-sector) factor values. Engine logic lives
// in lib/flag/engine.ts and reads ONLY from here.
//
// AR6 GWP multipliers below are REDEFINED here (the component-local copy in
// app/dashboard/ghg/page.tsx is unexported) — keep in sync on any GWP refresh.
// Provenance: IPCC AR6 (GWP-100).
//   CH4 biogenic = 27.0 (enteric, manure, land-sector biogenic CH4 — NOT fossil 29.8)
//   N2O          = 273  (manure + fertiliser-applied N2O)
//   CO2          = 1
// ─────────────────────────────────────────────────────────────────────────────

export const FLAG_GWP_AR6 = { CO2: 1, CH4_biogenic: 27.0, N2O: 273 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Structured, self-citing emission factor. Every factor value in this file is one
// of these — no bare numbers — so the provenance travels with the estimate.
// ─────────────────────────────────────────────────────────────────────────────
export interface EmissionFactor {
  value: number;              // meaning depends on `unit`
  unit: 'kgCH4/head/yr'       // enteric EF
      | 'kgVS/1000kg/day'     // manure volatile-solids excretion rate
      | 'kg'                  // live weight
      | 'gCH4/kgVS';          // manure CH4 factor (Table 10.14)
  source: string;             // exact table citation
  tier: 1 | 2;
  region?: string;
  note?: string;
}

// ── Enteric fermentation (CH4) — IPCC 2019 Refinement to the 2006 Guidelines ────
// Vol.4 (AFOLU) Ch.10, Tables 10.11 (cattle & buffalo) & 10.10 (other livestock),
// Tier 1 simple EF (kg CH4/head/yr).
//   Footnote 1 (Table 10.11): compilers should not rely on region alone — regional
//     defaults are screening-grade; a Tier 2 characterisation is preferred where data allow.
//   Footnote 3: Tier 1 uncertainty ranges per 2006 Guidelines §10.3.4 — these are
//     SCREENING-grade defaults, surfaced as such on the estimate's `basis`.
const CATTLE_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10.11';
const OTHER_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10.10';
const cf = (value: number, region: string): EmissionFactor =>
  ({ value, unit: 'kgCH4/head/yr', source: CATTLE_SRC, tier: 1, region });
const of = (value: number, note?: string): EmissionFactor =>
  ({ value, unit: 'kgCH4/head/yr', source: OTHER_SRC, tier: 1, region: 'global', ...(note ? { note } : {}) });

// Cattle & buffalo — Table 10.11, keyed [region][category]. Value = Tier 1 simple EF.
// north_america & oceania have NO buffalo herd default — the buffalo key is OMITTED
// (never zero-filled; a missing factor makes the estimator refuse rather than guess).
export const ENTERIC_CATTLE: Record<string, Partial<Record<'dairy_cattle' | 'other_cattle' | 'buffalo', EmissionFactor>>> = {
  north_america:       { dairy_cattle: cf(138, 'north_america'), other_cattle: cf(64, 'north_america') },
  western_europe:      { dairy_cattle: cf(126, 'western_europe'), other_cattle: cf(52, 'western_europe'), buffalo: cf(78, 'western_europe') },
  eastern_europe:      { dairy_cattle: cf(93, 'eastern_europe'),  other_cattle: cf(58, 'eastern_europe'), buffalo: cf(68, 'eastern_europe') },
  oceania:             { dairy_cattle: cf(93, 'oceania'),         other_cattle: cf(63, 'oceania') },
  latin_america:       { dairy_cattle: cf(87, 'latin_america'),   other_cattle: cf(56, 'latin_america'), buffalo: cf(68, 'latin_america') },
  africa:              { dairy_cattle: cf(76, 'africa'),          other_cattle: cf(52, 'africa'),        buffalo: cf(81, 'africa') },
  middle_east:         { dairy_cattle: cf(76, 'middle_east'),     other_cattle: cf(60, 'middle_east'),   buffalo: cf(67, 'middle_east') },
  asia:                { dairy_cattle: cf(78, 'asia'),            other_cattle: cf(54, 'asia'),          buffalo: cf(68, 'asia') },
  indian_subcontinent: { dairy_cattle: cf(73, 'indian_subcontinent'), other_cattle: cf(46, 'indian_subcontinent'), buffalo: cf(85, 'indian_subcontinent') },
};

// Other livestock — Table 10.10, global by productivity (high/low), kg CH4/head/yr.
// Outside NA/Europe/Oceania the LOW value is the Tier 1 default (Table 10.10 note),
// so the estimator defaults to 'low'. Single-value species carry high===low.
const single = (value: number): { high: EmissionFactor; low: EmissionFactor } => {
  const f = of(value, 'single Tier 1 value (high === low)');
  return { high: f, low: f };
};
export const ENTERIC_OTHER: Record<string, { high: EmissionFactor; low: EmissionFactor }> = {
  sheep:       { high: of(9, 'high-productivity system'), low: of(5, 'low-productivity default') },
  goats:       { high: of(9, 'high-productivity system'), low: of(5, 'low-productivity default') },
  swine:       { high: of(1.5, 'high-productivity system'), low: of(1, 'low-productivity default') },
  horses:      single(18),
  camels:      single(46),
  mules_asses: single(10),
  deer:        single(20),
};

// Tier 1a high/low productivity splits for CATTLE also exist in Table 10.11, but their
// values are NOT reproduced here (the v1 estimator uses the simple Tier 1 EF above). When
// a Tier-1a climb is built, add a parallel ENTERIC_CATTLE_TIER1A map with those cited
// values — do not invent them. Left out deliberately rather than zero-/guess-filled.

// ── Manure management (CH4) — IPCC 2019 Refinement, Vol.4 Ch.10 ─────────────────
// M1 scope: cattle & buffalo, dry systems (solid_storage / dry_lot / daily_spread /
// pasture_range_paddock / burned_for_fuel), 3-zone climate (cool/temperate/warm).
// Chain: VS_annual = VS_mean × weight_mean / 1000 × 365 (kg VS/head/yr); then
//   tCO2e = head × VS_annual × factor(gCH4/kgVS) × 27.0 / 1e6.
// VS_mean & weight_mean are the regional MEAN (productivity-INDEPENDENT). Productivity
// selects ONLY the Table 10.14 factor. B0 is already baked into the 10.14 factor
// (factor = MCF×B0×0.67) — never re-applied.

export type ManureSpecies =
  | 'dairy_cattle' | 'other_cattle' | 'buffalo' | 'swine' | 'poultry'
  | 'sheep' | 'goats' | 'horses' | 'mules_asses' | 'camels';
// Swine/poultry carry NO species Mean — VS & weight are per sub-category.
export type ManureSubcategory = 'finishing' | 'breeding' | 'hens' | 'pullets' | 'broilers';
export type ManureSystem =
  | 'solid_storage' | 'dry_lot' | 'daily_spread' | 'pasture_range_paddock' | 'burned_for_fuel';
export type ManureClimate = 'cool' | 'temperate' | 'warm';
// Liquid systems use a SEPARATE, finer 10-zone climate vocabulary (Table 10.14), distinct
// from the dry-system 3-zone `ManureClimate`.
export type ManureClimateZone =
  | 'cool_temp_moist' | 'cool_temp_dry' | 'boreal_moist' | 'boreal_dry'
  | 'warm_temp_moist' | 'warm_temp_dry'
  | 'tropical_montane' | 'tropical_wet' | 'tropical_moist' | 'tropical_dry';
export type ManureLiquidSystem =
  | 'uncovered_anaerobic_lagoon'
  | 'liquid_slurry_pit_gt_1_month'
  | 'liquid_slurry_pit_lt_1_month'  // lt_1_month is SWINE-only (Table 10.14)
  | 'anaerobic_digestion_biogas';   // 3-zone climate + digester-quality axis (footnote 8)
// Biogas High/Low is DIGESTER QUALITY (not herd productivity) and it INVERTS: leaky emits
// MORE than gas-tight. Conservative default = 'leaky'.
export type DigesterQuality = 'gas_tight' | 'leaky';

// Activity-data keying differs by species (Table 10.14 footnote 1 region resolution):
//   cattle/buffalo   → [region] (9-region)
//   swine/poultry    → [subcategory][region]
//   sheep/goats/horses → two-way {developed, developing}
//   mules_asses/camels → single global value
type RegionFactorMap = Partial<Record<string, EmissionFactor>>;
type SubcategoryFactorMap = Partial<Record<ManureSubcategory, RegionFactorMap>>;
type TwoWayFactorMap = { developed: EmissionFactor; developing: EmissionFactor };
export interface ManureActivityTable {
  dairy_cattle: RegionFactorMap;
  other_cattle: RegionFactorMap;
  buffalo: RegionFactorMap;
  swine: SubcategoryFactorMap;
  poultry: SubcategoryFactorMap;
  sheep: TwoWayFactorMap;
  goats: TwoWayFactorMap;
  horses: TwoWayFactorMap;
  mules_asses: EmissionFactor; // single global
  camels: EmissionFactor;      // single global
}

const VS_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10.13a';
const WEIGHT_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10A.5';
const MANURE_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10.14';
const vs = (value: number, region: string): EmissionFactor =>
  ({ value, unit: 'kgVS/1000kg/day', source: VS_SRC, tier: 1, region });
const wt = (value: number, region: string): EmissionFactor =>
  ({ value, unit: 'kg', source: WEIGHT_SRC, tier: 1, region });
const mf = (value: number): EmissionFactor =>
  ({ value, unit: 'gCH4/kgVS', source: MANURE_SRC, tier: 1 });

// Volatile-solids excretion — Table 10.13a, regional Mean (kg VS/1000 kg mass/day).
// Buffalo north_america / oceania are NOT farmed there — keys OMITTED (never 0-filled;
// a missing lookup makes the estimator refuse rather than guess).
export const MANURE_VS: ManureActivityTable = {
  dairy_cattle: {
    north_america: vs(9.2, 'north_america'), western_europe: vs(8.4, 'western_europe'), eastern_europe: vs(6.7, 'eastern_europe'),
    oceania: vs(6.0, 'oceania'), latin_america: vs(7.9, 'latin_america'), africa: vs(18.2, 'africa'),
    middle_east: vs(10.7, 'middle_east'), asia: vs(9.0, 'asia'), indian_subcontinent: vs(14.1, 'indian_subcontinent'),
  },
  other_cattle: {
    north_america: vs(7.6, 'north_america'), western_europe: vs(5.7, 'western_europe'), eastern_europe: vs(7.6, 'eastern_europe'),
    oceania: vs(8.7, 'oceania'), latin_america: vs(8.5, 'latin_america'), africa: vs(12.1, 'africa'),
    middle_east: vs(12.3, 'middle_east'), asia: vs(9.8, 'asia'), indian_subcontinent: vs(12.2, 'indian_subcontinent'),
  },
  buffalo: {
    western_europe: vs(7.7, 'western_europe'), eastern_europe: vs(6.2, 'eastern_europe'), latin_america: vs(11.2, 'latin_america'),
    africa: vs(12.9, 'africa'), middle_east: vs(9.8, 'middle_east'), asia: vs(13.5, 'asia'), indian_subcontinent: vs(15.2, 'indian_subcontinent'),
    // north_america, oceania: not farmed — omitted.
  },
  // Swine & poultry — per sub-category, all 9 regions (Table 10.13a).
  swine: {
    finishing: {
      north_america: vs(3.9, 'north_america'), western_europe: vs(5.3, 'western_europe'), eastern_europe: vs(4.9, 'eastern_europe'),
      oceania: vs(5.6, 'oceania'), latin_america: vs(6.4, 'latin_america'), africa: vs(8.2, 'africa'),
      middle_east: vs(4.9, 'middle_east'), asia: vs(6.8, 'asia'), indian_subcontinent: vs(8.6, 'indian_subcontinent'),
    },
    breeding: {
      north_america: vs(1.8, 'north_america'), western_europe: vs(2.4, 'western_europe'), eastern_europe: vs(2.0, 'eastern_europe'),
      oceania: vs(2.1, 'oceania'), latin_america: vs(2.7, 'latin_america'), africa: vs(4.4, 'africa'),
      middle_east: vs(2.5, 'middle_east'), asia: vs(3.4, 'asia'), indian_subcontinent: vs(4.6, 'indian_subcontinent'),
    },
  },
  poultry: {
    hens: {
      north_america: vs(9.4, 'north_america'), western_europe: vs(8.6, 'western_europe'), eastern_europe: vs(9.4, 'eastern_europe'),
      oceania: vs(8.6, 'oceania'), latin_america: vs(10.1, 'latin_america'), africa: vs(10.2, 'africa'),
      middle_east: vs(9.0, 'middle_east'), asia: vs(9.3, 'asia'), indian_subcontinent: vs(13.2, 'indian_subcontinent'),
    },
    pullets: {
      north_america: vs(5.9, 'north_america'), western_europe: vs(5.3, 'western_europe'), eastern_europe: vs(5.9, 'eastern_europe'),
      oceania: vs(6.2, 'oceania'), latin_america: vs(7.6, 'latin_america'), africa: vs(12.0, 'africa'),
      middle_east: vs(6.8, 'middle_east'), asia: vs(7.5, 'asia'), indian_subcontinent: vs(13.2, 'indian_subcontinent'),
    },
    broilers: {
      north_america: vs(16.8, 'north_america'), western_europe: vs(16.1, 'western_europe'), eastern_europe: vs(16.0, 'eastern_europe'),
      oceania: vs(18.3, 'oceania'), latin_america: vs(15.6, 'latin_america'), africa: vs(15.9, 'africa'),
      middle_east: vs(17.7, 'middle_east'), asia: vs(15.7, 'asia'), indian_subcontinent: vs(17.7, 'indian_subcontinent'),
    },
  },
  // Small ruminants & equids — two-way (developed/developing) or single global (Table 10.13a).
  sheep:  { developed: vs(8.2, 'developed'),  developing: vs(8.3, 'developing') },
  goats:  { developed: vs(9, 'developed'),    developing: vs(10.4, 'developing') },
  horses: { developed: vs(5.65, 'developed'), developing: vs(7.2, 'developing') },
  mules_asses: vs(7.2, 'global'),
  camels:      vs(11.5, 'global'),
};

// Live weight — Table 10A.5, regional Mean (kg). Same buffalo NA omissions.
export const MANURE_WEIGHT: ManureActivityTable = {
  dairy_cattle: {
    north_america: wt(650, 'north_america'), western_europe: wt(600, 'western_europe'), eastern_europe: wt(550, 'eastern_europe'),
    oceania: wt(488, 'oceania'), latin_america: wt(508, 'latin_america'), africa: wt(260, 'africa'),
    middle_east: wt(349, 'middle_east'), asia: wt(386, 'asia'), indian_subcontinent: wt(285, 'indian_subcontinent'),
  },
  other_cattle: {
    north_america: wt(407, 'north_america'), western_europe: wt(405, 'western_europe'), eastern_europe: wt(389, 'eastern_europe'),
    oceania: wt(359, 'oceania'), latin_america: wt(303, 'latin_america'), africa: wt(236, 'africa'),
    middle_east: wt(275, 'middle_east'), asia: wt(299, 'asia'), indian_subcontinent: wt(226, 'indian_subcontinent'),
  },
  buffalo: {
    western_europe: wt(509, 'western_europe'), eastern_europe: wt(467, 'eastern_europe'), latin_america: wt(315, 'latin_america'),
    africa: wt(339, 'africa'), middle_east: wt(381, 'middle_east'), asia: wt(336, 'asia'), indian_subcontinent: wt(321, 'indian_subcontinent'),
    // north_america, oceania: not farmed — omitted.
  },
  // Swine & poultry — per sub-category, all 9 regions (Table 10A.5).
  swine: {
    finishing: {
      north_america: wt(61, 'north_america'), western_europe: wt(61, 'western_europe'), eastern_europe: wt(59, 'eastern_europe'),
      oceania: wt(41, 'oceania'), latin_america: wt(51, 'latin_america'), africa: wt(41, 'africa'),
      middle_east: wt(52, 'middle_east'), asia: wt(49, 'asia'), indian_subcontinent: wt(51, 'indian_subcontinent'),
    },
    breeding: {
      north_america: wt(184, 'north_america'), western_europe: wt(190, 'western_europe'), eastern_europe: wt(204, 'eastern_europe'),
      oceania: wt(163, 'oceania'), latin_america: wt(143, 'latin_america'), africa: wt(100, 'africa'),
      middle_east: wt(118, 'middle_east'), asia: wt(122, 'asia'), indian_subcontinent: wt(121, 'indian_subcontinent'),
    },
  },
  poultry: {
    hens: {
      north_america: wt(1.5, 'north_america'), western_europe: wt(1.9, 'western_europe'), eastern_europe: wt(1.9, 'eastern_europe'),
      oceania: wt(2.0, 'oceania'), latin_america: wt(1.4, 'latin_america'), africa: wt(1.4, 'africa'),
      middle_east: wt(1.2, 'middle_east'), asia: wt(1.5, 'asia'), indian_subcontinent: wt(1.3, 'indian_subcontinent'),
    },
    pullets: {
      north_america: wt(1.2, 'north_america'), western_europe: wt(1.5, 'western_europe'), eastern_europe: wt(1.3, 'eastern_europe'),
      oceania: wt(1.4, 'oceania'), latin_america: wt(0.7, 'latin_america'), africa: wt(0.7, 'africa'),
      middle_east: wt(0.6, 'middle_east'), asia: wt(0.8, 'asia'), indian_subcontinent: wt(0.6, 'indian_subcontinent'),
    },
    broilers: {
      north_america: wt(1.4, 'north_america'), western_europe: wt(1.2, 'western_europe'), eastern_europe: wt(1.1, 'eastern_europe'),
      oceania: wt(1.2, 'oceania'), latin_america: wt(0.9, 'latin_america'), africa: wt(0.8, 'africa'),
      middle_east: wt(0.7, 'middle_east'), asia: wt(0.8, 'asia'), indian_subcontinent: wt(0.8, 'indian_subcontinent'),
    },
  },
  // Small ruminants & equids — two-way (developed/developing) or single global (Table 10A.5).
  // goats developed = 40 (western_europe representative; 10A.5 lists 41/40/36/33 across the
  // four developed regions) — see report note.
  sheep:  { developed: wt(40, 'developed'),  developing: wt(31, 'developing') },
  goats:  { developed: wt(40, 'developed'),  developing: wt(24, 'developing') },
  horses: { developed: wt(377, 'developed'), developing: wt(238, 'developing') },
  mules_asses: wt(130, 'global'),
  camels:      wt(217, 'global'),
};

// Manure CH4 factor — Table 10.14 (g CH4/kg VS), species × productivity × system × climate.
// solid_storage/dry_lot/daily_spread are climate-keyed; burned_for_fuel is a single scalar
// per species-productivity; pasture_range_paddock is a single global scalar (all
// species/productivity/climate). Buffalo has NO own grid → the estimator routes it to
// other_cattle.low (Table 10.14 footnote 6).
type ClimateFactors = Record<ManureClimate, EmissionFactor>;
interface ManureProductivityFactors {
  solid_storage: ClimateFactors;
  dry_lot: ClimateFactors;
  daily_spread: ClimateFactors;
  burned_for_fuel: EmissionFactor;
}
// Poultry has NO daily_spread / pasture, and its LOW productivity collapses to a single
// "all systems" scalar (system- and climate-invariant).
interface PoultryHighFactors {
  solid_storage: ClimateFactors;
  dry_lot: ClimateFactors;
  burned_for_fuel: EmissionFactor;
}
interface PoultryFactors {
  high: PoultryHighFactors;
  low: EmissionFactor; // ALL_SYSTEMS single scalar
}
// Sheep/goats/horses/mules_asses/camels: solid_storage + dry_lot only (NO daily_spread,
// NO burned_for_fuel); pasture_range_paddock (0.6, "All Animals") DOES apply to them.
interface TwoSystemFactors {
  solid_storage: ClimateFactors;
  dry_lot: ClimateFactors;
}
interface SmallRuminantFactors {
  high: TwoSystemFactors;
  low: TwoSystemFactors;
}
export interface ManureFactorTable {
  dairy_cattle: { high: ManureProductivityFactors; low: ManureProductivityFactors };
  other_cattle: { high: ManureProductivityFactors; low: ManureProductivityFactors };
  swine: { high: ManureProductivityFactors; low: ManureProductivityFactors };
  poultry: PoultryFactors;
  sheep: SmallRuminantFactors;
  goats: SmallRuminantFactors;
  horses: SmallRuminantFactors;
  mules_asses: SmallRuminantFactors;
  camels: SmallRuminantFactors;
  pasture_range_paddock: EmissionFactor; // cattle/buffalo AND small ruminants/equids (0.6)
}
export const MANURE_FACTOR: ManureFactorTable = {
  dairy_cattle: {
    high: {
      solid_storage: { cool: mf(3.2), temperate: mf(6.4), warm: mf(8.0) },
      dry_lot:       { cool: mf(1.6), temperate: mf(2.4), warm: mf(3.2) },
      daily_spread:  { cool: mf(0.2), temperate: mf(0.8), warm: mf(1.6) },
      burned_for_fuel: mf(16.1),
    },
    low: {
      solid_storage: { cool: mf(1.7), temperate: mf(3.5), warm: mf(4.4) },
      dry_lot:       { cool: mf(0.9), temperate: mf(1.3), warm: mf(1.7) },
      daily_spread:  { cool: mf(0.1), temperate: mf(0.4), warm: mf(0.9) },
      burned_for_fuel: mf(8.7),
    },
  },
  other_cattle: {
    high: {
      solid_storage: { cool: mf(2.4), temperate: mf(4.8), warm: mf(6.0) },
      dry_lot:       { cool: mf(1.2), temperate: mf(1.8), warm: mf(2.4) },
      daily_spread:  { cool: mf(0.1), temperate: mf(0.6), warm: mf(1.2) },
      burned_for_fuel: mf(12.1),
    },
    low: {
      solid_storage: { cool: mf(1.7), temperate: mf(3.5), warm: mf(4.4) },
      dry_lot:       { cool: mf(0.9), temperate: mf(1.3), warm: mf(1.7) },
      daily_spread:  { cool: mf(0.1), temperate: mf(0.4), warm: mf(0.9) },
      burned_for_fuel: mf(8.7),
    },
  },
  swine: {
    high: {
      solid_storage: { cool: mf(6.0), temperate: mf(12.1), warm: mf(15.1) },
      dry_lot:       { cool: mf(3.0), temperate: mf(4.5),  warm: mf(6.0) },
      daily_spread:  { cool: mf(0.3), temperate: mf(1.5),  warm: mf(3.0) },
      burned_for_fuel: mf(30.2),
    },
    low: {
      solid_storage: { cool: mf(3.9), temperate: mf(7.8),  warm: mf(9.7) },
      dry_lot:       { cool: mf(1.9), temperate: mf(2.9),  warm: mf(3.9) },
      daily_spread:  { cool: mf(0.2), temperate: mf(1.0),  warm: mf(1.9) },
      burned_for_fuel: mf(19.4),
    },
  },
  poultry: {
    high: {
      solid_storage: { cool: mf(5.2), temperate: mf(10.5), warm: mf(13.1) },
      dry_lot:       { cool: mf(2.6), temperate: mf(3.9),  warm: mf(5.2) },
      burned_for_fuel: mf(2.6),
      // NO daily_spread, NO pasture for poultry.
    },
    low: mf(2.4), // ALL_SYSTEMS, climate-invariant
  },
  sheep: {
    high: { solid_storage: { cool: mf(2.5), temperate: mf(5.1), warm: mf(6.4) }, dry_lot: { cool: mf(1.3), temperate: mf(1.9), warm: mf(2.5) } },
    low:  { solid_storage: { cool: mf(1.7), temperate: mf(3.5), warm: mf(4.4) }, dry_lot: { cool: mf(0.9), temperate: mf(1.3), warm: mf(1.7) } },
  },
  goats: {
    high: { solid_storage: { cool: mf(2.4), temperate: mf(4.8), warm: mf(6.0) }, dry_lot: { cool: mf(1.2), temperate: mf(1.8), warm: mf(2.4) } },
    low:  { solid_storage: { cool: mf(1.7), temperate: mf(3.5), warm: mf(4.4) }, dry_lot: { cool: mf(0.9), temperate: mf(1.3), warm: mf(1.7) } },
  },
  horses: {
    high: { solid_storage: { cool: mf(4.0), temperate: mf(8.0), warm: mf(10.1) }, dry_lot: { cool: mf(2.0), temperate: mf(3.0), warm: mf(4.0) } },
    low:  { solid_storage: { cool: mf(3.5), temperate: mf(7.0), warm: mf(8.7) },  dry_lot: { cool: mf(1.7), temperate: mf(2.6), warm: mf(3.5) } },
  },
  mules_asses: {
    high: { solid_storage: { cool: mf(4.4), temperate: mf(8.8), warm: mf(11.1) }, dry_lot: { cool: mf(2.2), temperate: mf(3.3), warm: mf(4.4) } },
    low:  { solid_storage: { cool: mf(3.5), temperate: mf(7.0), warm: mf(8.7) },  dry_lot: { cool: mf(1.7), temperate: mf(2.6), warm: mf(3.5) } },
  },
  camels: {
    high: { solid_storage: { cool: mf(3.5), temperate: mf(7.0), warm: mf(8.7) }, dry_lot: { cool: mf(1.7), temperate: mf(2.6), warm: mf(0.0) } }, // warm dry_lot = 0.0 is REAL (Table 10.14)
    low:  { solid_storage: { cool: mf(2.8), temperate: mf(5.6), warm: mf(7.0) }, dry_lot: { cool: mf(1.4), temperate: mf(2.1), warm: mf(2.8) } },
  },
  pasture_range_paddock: mf(0.6), // cattle/buffalo + small ruminants/equids (SYSTEM_VALIDITY blocks swine/poultry)
};

// Per-species applicable manure systems — anything else is an input error (THROWS).
export const SYSTEM_VALIDITY: Record<ManureSpecies, ManureSystem[]> = {
  dairy_cattle: ['solid_storage', 'dry_lot', 'daily_spread', 'pasture_range_paddock', 'burned_for_fuel'],
  other_cattle: ['solid_storage', 'dry_lot', 'daily_spread', 'pasture_range_paddock', 'burned_for_fuel'],
  buffalo:      ['solid_storage', 'dry_lot', 'daily_spread', 'pasture_range_paddock', 'burned_for_fuel'],
  swine:        ['solid_storage', 'dry_lot', 'daily_spread', 'burned_for_fuel'], // NO pasture
  poultry:      ['solid_storage', 'dry_lot', 'burned_for_fuel'],                 // NO daily_spread, NO pasture
  // Small ruminants & equids: solid_storage, dry_lot, pasture (NO daily_spread, NO burned_for_fuel).
  sheep:        ['solid_storage', 'dry_lot', 'pasture_range_paddock'],
  goats:        ['solid_storage', 'dry_lot', 'pasture_range_paddock'],
  horses:       ['solid_storage', 'dry_lot', 'pasture_range_paddock'],
  mules_asses:  ['solid_storage', 'dry_lot', 'pasture_range_paddock'],
  camels:       ['solid_storage', 'dry_lot', 'pasture_range_paddock'],
};

// ── Liquid manure systems (M3a) — Table 10.14, gCH4/kgVS, keyed by the 10-zone climate ──
// [species][productivity][liquidSystem][climateZone]. Zone order in each source array:
const ZONE_ORDER: ManureClimateZone[] = [
  'cool_temp_moist', 'cool_temp_dry', 'boreal_moist', 'boreal_dry',
  'warm_temp_moist', 'warm_temp_dry', 'tropical_montane', 'tropical_wet', 'tropical_moist', 'tropical_dry',
];
// Build a fully-keyed, self-citing climate-zone factor set from a 10-value source array.
const lf = (arr: number[]): Record<ManureClimateZone, EmissionFactor> => {
  const out = {} as Record<ManureClimateZone, EmissionFactor>;
  ZONE_ORDER.forEach((z, i) => { out[z] = mf(arr[i]); });
  return out;
};

type ClimateZoneFactors = Record<ManureClimateZone, EmissionFactor>;
type LiquidSystemFactors = Partial<Record<ManureLiquidSystem, ClimateZoneFactors>>;
export interface ManureLiquidFactorTable {
  dairy_cattle: { high: LiquidSystemFactors; low: LiquidSystemFactors };
  other_cattle: { high: LiquidSystemFactors; low: LiquidSystemFactors };
  swine: { high: LiquidSystemFactors; low: LiquidSystemFactors };
  poultry: { high: LiquidSystemFactors }; // poultry LOW routes to the all-systems 2.4 scalar
}
export const MANURE_LIQUID_FACTOR: ManureLiquidFactorTable = {
  dairy_cattle: {
    high: {
      uncovered_anaerobic_lagoon:   lf([96.5, 107.7, 80.4, 78.8, 117.4, 122.2, 122.2, 128.6, 128.6, 128.6]),
      liquid_slurry_pit_gt_1_month: lf([33.8, 41.8, 22.5, 22.5, 59.5, 65.9, 94.9, 122.2, 117.4, 119.0]),
    },
    low: {
      uncovered_anaerobic_lagoon:   lf([52.3, 58.4, 43.6, 42.7, 63.6, 66.2, 66.2, 69.7, 69.7, 69.7]),
      liquid_slurry_pit_gt_1_month: lf([18.3, 22.6, 12.2, 12.2, 32.2, 35.7, 51.4, 66.2, 63.6, 64.5]),
    },
  },
  other_cattle: {
    high: {
      uncovered_anaerobic_lagoon:   lf([72.4, 80.8, 60.3, 59.1, 88.0, 91.7, 91.7, 96.5, 96.5, 96.5]),
      liquid_slurry_pit_gt_1_month: lf([25.3, 31.4, 16.9, 16.9, 44.6, 49.4, 71.2, 91.7, 88.0, 89.2]),
    },
    low: {
      uncovered_anaerobic_lagoon:   lf([52.3, 58.4, 43.6, 42.7, 63.6, 66.2, 66.2, 69.7, 69.7, 69.7]),
      liquid_slurry_pit_gt_1_month: lf([18.3, 22.6, 12.2, 12.2, 32.2, 35.7, 51.4, 66.2, 63.6, 64.5]),
    },
  },
  swine: {
    high: {
      uncovered_anaerobic_lagoon:   lf([180.9, 202.0, 150.8, 147.7, 220.1, 229.1, 229.1, 241.2, 241.2, 241.2]),
      liquid_slurry_pit_gt_1_month: lf([63.3, 78.4, 42.2, 42.2, 111.6, 123.6, 177.9, 229.1, 220.1, 223.1]),
      liquid_slurry_pit_lt_1_month: lf([18.1, 24.1, 12.1, 12.1, 39.2, 45.2, 75.4, 114.6, 108.5, 126.6]),
    },
    low: {
      uncovered_anaerobic_lagoon:   lf([116.6, 130.2, 97.2, 95.2, 141.8, 147.7, 147.7, 155.4, 155.4, 155.4]),
      liquid_slurry_pit_gt_1_month: lf([40.8, 50.5, 27.2, 27.2, 71.9, 79.7, 114.6, 147.7, 141.8, 143.8]),
      liquid_slurry_pit_lt_1_month: lf([11.7, 15.5, 7.8, 7.8, 25.3, 29.1, 48.6, 73.8, 69.9, 81.6]),
    },
  },
  poultry: {
    high: {
      uncovered_anaerobic_lagoon:   lf([156.8, 175.1, 130.7, 128.0, 190.7, 198.6, 198.6, 209.0, 209.0, 209.0]),
      liquid_slurry_pit_gt_1_month: lf([54.9, 67.9, 36.6, 36.6, 96.7, 107.1, 154.2, 198.6, 190.7, 193.4]),
    },
    // poultry LOW → no liquid arrays; routes to the All-Systems 2.4 scalar (see estimate.ts).
  },
};

// Which species support which liquid systems (anything else THROWS).
export const LIQUID_SYSTEM_VALIDITY: Record<ManureSpecies, ManureLiquidSystem[]> = {
  dairy_cattle: ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'anaerobic_digestion_biogas'],
  other_cattle: ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'anaerobic_digestion_biogas'],
  // buffalo routes to other_cattle; lt_1_month has no other_cattle source row → NOT allowed.
  buffalo:      ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'anaerobic_digestion_biogas'],
  swine:        ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'liquid_slurry_pit_lt_1_month', 'anaerobic_digestion_biogas'],
  poultry:      ['uncovered_anaerobic_lagoon', 'liquid_slurry_pit_gt_1_month', 'anaerobic_digestion_biogas'],
  sheep: [], goats: [], horses: [], mules_asses: [], camels: [], // no liquid systems
};

// ── Anaerobic digestion — biogas (Table 10.14, footnote 8) ──────────────────────
// Structurally distinct: 3-zone climate [cool, temperate, warm] and a DIGESTER-QUALITY axis
// (gas_tight vs leaky) that INVERTS the usual split — leaky emits more. NOT the herd
// productivity axis. Poultry has no leaky row (poultry LOW routes to the all-systems 2.4).
const BIOGAS_SRC = 'IPCC 2019 Refinement Vol.4 Ch.10 Table 10.14 (Anaerobic Digestion–Biogas; footnote 8: High=gas-tight, Low=leaky)';
const bf = (value: number): EmissionFactor => ({ value, unit: 'gCH4/kgVS', source: BIOGAS_SRC, tier: 1 });
const bc3 = (arr: number[]): Record<ManureClimate, EmissionFactor> =>
  ({ cool: bf(arr[0]), temperate: bf(arr[1]), warm: bf(arr[2]) });

export interface ManureBiogasFactorTable {
  dairy_cattle: { gas_tight: ClimateFactors; leaky: ClimateFactors };
  other_cattle: { gas_tight: ClimateFactors; leaky: ClimateFactors };
  swine: { gas_tight: ClimateFactors; leaky: ClimateFactors };
  poultry: { gas_tight: ClimateFactors }; // no leaky row
}
export const MANURE_BIOGAS_FACTOR: ManureBiogasFactorTable = {
  dairy_cattle: { gas_tight: bc3([3.2, 3.7, 3.7]),  leaky: bc3([9.2, 9.5, 9.5]) },
  other_cattle: { gas_tight: bc3([2.4, 2.7, 2.8]),  leaky: bc3([9.2, 9.5, 9.5]) },
  swine:        { gas_tight: bc3([6.0, 6.8, 7.0]),  leaky: bc3([20.6, 21.1, 21.2]) },
  poultry:      { gas_tight: bc3([5.2, 10.5, 13.1]) }, // leaky → all-systems 2.4 (see estimate.ts)
};

// (Fertiliser and LUC factor sets — enteric's/manure's siblings — are SEPARATE later
//  tasks, each with its own cited provenance. Intentionally absent for now.)
