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

export type ManureSpecies = 'dairy_cattle' | 'other_cattle' | 'buffalo';
export type ManureSystem =
  | 'solid_storage' | 'dry_lot' | 'daily_spread' | 'pasture_range_paddock' | 'burned_for_fuel';
export type ManureClimate = 'cool' | 'temperate' | 'warm';

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
export const MANURE_VS: Record<ManureSpecies, Partial<Record<string, EmissionFactor>>> = {
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
};

// Live weight — Table 10A.5, regional Mean (kg). Same buffalo NA omissions.
export const MANURE_WEIGHT: Record<ManureSpecies, Partial<Record<string, EmissionFactor>>> = {
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
export interface ManureFactorTable {
  dairy_cattle: { high: ManureProductivityFactors; low: ManureProductivityFactors };
  other_cattle: { high: ManureProductivityFactors; low: ManureProductivityFactors };
  pasture_range_paddock: EmissionFactor;
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
  pasture_range_paddock: mf(0.6), // all species/productivity/climate
};

// (Fertiliser and LUC factor sets — enteric's/manure's siblings — are SEPARATE later
//  tasks, each with its own cited provenance. Intentionally absent for now.)
