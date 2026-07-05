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
  value: number;              // kg CH4 / head / yr (for enteric)
  unit: 'kgCH4/head/yr';
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

// (Manure, fertiliser, and LUC factor sets — enteric's siblings — are SEPARATE later
//  tasks, each with its own cited provenance. Intentionally absent for now.)
