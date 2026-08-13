// ── CANADIAN MOBILE COMBUSTION FACTORS ───────────────────────────────────────────────────────────
//
// NOT WIRED. Nothing in the engine reads this file yet. It exists because lib/ghg/engine.ts carries
// `diesel_mobile_*` and `gasoline_*` keys in all six factor tables whose values are byte-identical to
// the stationary entries — a key name promising a distinction the data does not contain. EF_NZ:179
// says so out loud (`// stationary value reused for mobile (deliberate, for consistency)`); the other
// five tables do it silently. This is the primary-source data that distinction needs, transcribed
// before any calc change, so the two questions stay separate: what does ECCC publish, and what should
// the engine apply.
//
// TWO SOURCE SETS, ON TWO DIFFERENT BASES. Do not mix them in one calculation without converting.
//
//   MOBILE_CA — per VOLUME (g/L). Environment and Climate Change Canada. 2026. National Inventory
//     Report 1990–2024: Greenhouse Gas Sources and Sinks in Canada. Part 2, Annex 6, Table A6.1–15,
//     "Emission Factors for Energy Mobile Combustion Sources", p. 541. Units: g/L fuel.
//
//   MOBILE_IPCC — per ENERGY (kg/TJ). 2006 IPCC Guidelines, Vol.2 Ch.3 Tables 3.2.2 / 3.3.1, with
//     CO2 from Vol.2 Ch.1 Table 1.4. See the IPCC section further down, and `energyPerLitre` for the
//     only sanctioned bridge between the two bases.
//
// Every factor carries its own `source`, `table`, `edition` and `basis`, and a test asserts all four
// are populated on all of them — so the two sets cannot be confused by reading a bare number.
//
// ⚠️ MOBILE DIESEL CO2 IS 2680.50 g/L HERE; THE STATIONARY TABLE ROUNDS TO 2681.
// The stationary refined-petroleum-products table (A6.1-6) — the one EF_CA.diesel_litre transcribes as
// 2.681 kg/L — carries 2681. Both trace to ECCC (2017). This is a REAL DIFFERENCE between two published
// tables, not a transcription error on either side, and it must not be "reconciled" by rounding one to
// the other. It is also the smallest part of the mobile/stationary gap: the CO2 figures differ by 0.02%,
// while mobile N2O runs 3x to 10,000x the stationary 0.022 g/L depending on vehicle class and control
// technology. CO2 is not where this matters. N2O is.
//
// ⚠️ THE CONTROL-TECHNOLOGY DIMENSION HAS NO INPUT TODAY. Every factor below is keyed by vehicle class
// AND emission-control technology, because that is how ECCC publishes them and because the spread is
// large enough that collapsing it would invent a figure. LDGV N2O runs 0.007 g/L on Tier 3 and 0.66 on
// Tier 0 — a factor of 94. The engine's Location type has no field that could select between them, so
// wiring this needs a data-model decision (fleet composition? a single fleet-average control tier?) and
// a defensible answer for customers who cannot characterise their fleet. Do not pick a row and call it
// "the" mobile factor.

export type MobileBasis = 'per_volume' | 'per_energy'

type MobileProvenance = {
  unit: string
  source: string
  table: string
  edition: string
  basis: MobileBasis
}

export type MobileFactor = MobileProvenance & {
  co2: number
  ch4: number
  n2o: number
}

// IPCC's mobile-combustion tables publish CH4 and N2O ONLY. CO2 lives in a different chapter on a
// different basis (Vol.2 Ch.1 Table 1.4) and is NOT reproduced per row here.
// `co2: null` rather than an omitted key, deliberately: an absence must never be readable as zero,
// and an optional `co2?: number` invites `?? 0` at a future call site — which would silently price
// road transport at zero CO2. Null forces the reader to go and get it from IPCC_CO2_KG_PER_TJ.
export type MobileNonCO2Factor = MobileProvenance & {
  co2: null
  ch4: number
  n2o: number
}

const SOURCE =
  'Environment and Climate Change Canada (2026) National Inventory Report 1990–2024: Greenhouse Gas ' +
  'Sources and Sinks in Canada, Part 2, Annex 6, Table A6.1-15 "Emission Factors for Energy Mobile ' +
  'Combustion Sources", p. 541'
const TABLE = 'A6.1-15'
const EDITION = 'NIR 2026 (1990-2024)'

// Every entry in this file is per-volume g/L, from one table in one edition. The helper carries that
// so a future second source cannot be added without stating its own — a bare number tuple would let
// an unsourced row in unnoticed, which is the whole failure mode this file exists to end.
const f = (co2: number, ch4: number, n2o: number): MobileFactor => ({
  co2, ch4, n2o, unit: 'g/L', source: SOURCE, table: TABLE, edition: EDITION, basis: 'per_volume',
})

// ── TODO: NATURAL GAS VEHICLES — NOT SEEDED, DELIBERATELY ────────────────────────────────────────
// Table A6.1-15 lists Natural Gas Vehicles at 1.9 CO2 under a "g/L fuel" column header. 1.9 g/L is
// implausible as a per-litre CO2 factor — roughly three orders of magnitude below every liquid fuel in
// the same table — and is almost certainly g/m3, or a different unit convention the header does not
// carry for gaseous fuels. Seeding it as g/L would under-report NGV combustion by ~1000x with a primary
// citation attached, which is worse than the gap: a wrong number wearing a source is harder to catch
// than a missing one. RESOLVE by reading the table's unit footnotes before adding it; if it is per-m3
// it needs `basis: 'per_energy'` or a per-volume-gaseous variant, not the per_volume path above.

// ── ROAD TRANSPORT — GASOLINE ────────────────────────────────────────────────────────────────────
// CO2 is constant at 2307.3 g/L across every gasoline row: CO2 from complete combustion depends on the
// fuel's carbon content, not on the vehicle or its controls. Only CH4 and N2O vary, and they vary a lot.
//
// N2O FALLS AS TIERS GET NEWER (LDGV 0.66 → 0.007 from Tier 0 to Tier 3). CH4 does NOT move
// monotonically — LDGT Tier 0 CH4 (0.21) sits BELOW Tier 1 (0.24). That is what the source publishes.
// Both patterns are pinned by tests in mobile.test.ts so neither gets "corrected" later.
const GASOLINE_ROAD = {
  // Light-duty Gasoline Vehicles
  ldgv: {
    tier_3: f(2307.3, 0.111, 0.007),
    tier_2: f(2307.3, 0.14, 0.022),
    tier_1: f(2307.3, 0.23, 0.47),
    tier_0: f(2307.3, 0.32, 0.66),
    oxidation_catalyst: f(2307.3, 0.52, 0.20),
    non_catalytic_controlled: f(2307.3, 0.46, 0.028),
  },
  // Light-duty Gasoline Trucks
  ldgt: {
    tier_3: f(2307.3, 0.111, 0.007),
    tier_2: f(2307.3, 0.14, 0.022),
    tier_1: f(2307.3, 0.24, 0.58),
    tier_0: f(2307.3, 0.21, 0.66),
    oxidation_catalyst: f(2307.3, 0.43, 0.20),
    non_catalytic_controlled: f(2307.3, 0.56, 0.028),
  },
  // Heavy-duty Gasoline Vehicles
  hdgv: {
    three_way_catalyst: f(2307.3, 0.068, 0.20),
    non_catalytic_controlled: f(2307.3, 0.29, 0.047),
    uncontrolled: f(2307.3, 0.49, 0.084),
  },
  motorcycles: {
    non_catalytic_controlled: f(2307.3, 0.77, 0.041),
    uncontrolled: f(2307.3, 2.3, 0.048),
  },
}

// ── ROAD TRANSPORT — DIESEL ──────────────────────────────────────────────────────────────────────
// ⚠️ N2O RISES WITH BETTER CONTROL TECHNOLOGY. Advanced-control diesel emits MORE N2O than
// uncontrolled, in all three classes (LDDV/LDDT 0.22 vs 0.16; HDDV 0.151 vs 0.075). This is
// counter-intuitive and it is correct: NOx aftertreatment — SCR and NOx adsorbers — converts a portion
// of NOx to N2O as a by-product, so the equipment that cuts the regulated pollutant creates the
// greenhouse gas. Every instinct says this is a transposition; it is not. Pinned by test.
//
// Compare EF_CA.diesel_mobile_litre in engine.ts, which currently reuses the STATIONARY N2O of
// 0.022 g/L. The lowest mobile figure here is 0.075 — 3.4x that — and the highest is 0.22, or 10x.
const DIESEL_ROAD = {
  // Light-duty Diesel Vehicles
  lddv: {
    advanced_control: f(2680.50, 0.051, 0.22),
    moderate_control: f(2680.50, 0.068, 0.21),
    uncontrolled: f(2680.50, 0.10, 0.16),
  },
  // Light-duty Diesel Trucks
  lddt: {
    advanced_control: f(2680.50, 0.068, 0.22),
    moderate_control: f(2680.50, 0.068, 0.21),
    uncontrolled: f(2680.50, 0.085, 0.16),
  },
  // Heavy-duty Diesel Vehicles
  hddv: {
    advanced_control: f(2680.50, 0.11, 0.151),
    moderate_control: f(2680.50, 0.14, 0.082),
    uncontrolled: f(2680.50, 0.15, 0.075),
  },
}

// ── ROAD TRANSPORT — OTHER FUELS ─────────────────────────────────────────────────────────────────
// Propane road CO2 (1515 g/L) matches EF_CA.propane_litre exactly — the "All Other Uses" stationary
// row. CH4/N2O do not: 0.64 / 0.028 here against 0.024 / 0.108 stationary. Note the N2O runs the OTHER
// WAY for propane (mobile is LOWER), so "mobile N2O is always higher" is not the rule; per-fuel,
// per-class transcription is.
const OTHER_ROAD = {
  propane_vehicles: f(1515, 0.64, 0.028),
}

// ── OFF-ROAD ─────────────────────────────────────────────────────────────────────────────────────
// Off-road CH4 is where the mobile/stationary gap is widest: 2-stroke gasoline at 10.56 g/L is ~285x
// the stationary gasoline CH4 (0.037 g/L in the EF_CA sector rows), because incomplete combustion in
// small 2-stroke engines passes unburned fuel straight through.
//
// `lubricating_oil_2_stroke` carries a DIFFERENT CO2 (2705.0) from every gasoline row — it is the
// two-stroke oil burned with the fuel, not the fuel. It is a separate activity input, not a variant of
// gasoline_2_stroke; applying both to the same litres would double-count.
//
// diesel_under_19kw and diesel_19kw_tier_1_3 are identical in the source. Kept as two named entries
// rather than one alias, because they are two published rows and a future edition may split them.
const OFF_ROAD = {
  gasoline_2_stroke: f(2307.3, 10.56, 0.013),
  gasoline_4_stroke: f(2307.3, 5.08, 0.064),
  diesel_under_19kw: f(2680.50, 0.073, 0.022),
  diesel_19kw_tier_1_3: f(2680.50, 0.073, 0.022),
  diesel_19kw_tier_4: f(2680.50, 0.073, 0.227),
  lubricating_oil_2_stroke: f(2705.0, 12.69, 0.016),
  propane: f(1515, 0.64, 0.087),
}

export const MOBILE_CA = {
  road: {
    gasoline: GASOLINE_ROAD,
    diesel: DIESEL_ROAD,
    other: OTHER_ROAD,
  },
  off_road: OFF_ROAD,
}

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// IPCC DEFAULTS — PER ENERGY, NOT PER VOLUME
// ═════════════════════════════════════════════════════════════════════════════════════════════════
//
// SOURCES — two, and BOTH are cited on every entry below, because a per-energy CH4/N2O factor cannot
// reach a litre of fuel without the CO2 table doing the volumetric work (see energyPerLitre):
//
//   A. IPCC. 2006. 2006 IPCC Guidelines for National Greenhouse Gas Inventories, Volume 2 (Energy),
//      Chapter 3 (Mobile Combustion).
//        Table 3.2.2 — "Road transport N2O and CH4 default emission factors" (kg/TJ)
//        Table 3.3.1 — "Default emission factors for off-road mobile sources and machinery" (kg/TJ)
//   B. Same Guidelines, Volume 2, Chapter 1 (Introduction),
//        Table 1.4 — "Default CO2 emission factors for combustion" (kg/TJ)
//
// WHY THESE SIT BESIDE MOBILE_CA RATHER THAN REPLACING ANYTHING. MOBILE_CA is the Canadian primary
// source and is what a Canadian inventory should use. These IPCC defaults serve the jurisdictions
// where engine.ts currently has NO mobile data at all and falls back to a stationary value — EF_EU is
// already IPCC-derived, and EF_UK/EF_AU/EF_NZ carry combined published figures with no gas split. They
// are DEFAULTS, materially coarser than MOBILE_CA (three road gasoline control classes against
// ECCC's six), and nothing here should displace a national factor where one exists.

const SOURCE_IPCC = '2006 IPCC Guidelines for National Greenhouse Gas Inventories, Vol.2 (Energy)'
const IPCC_EDITION = 'IPCC 2006 Guidelines'
const SOURCE_IPCC_ROAD =
  `IPCC (2006) ${SOURCE_IPCC}, Ch.3 (Mobile Combustion), Table 3.2.2 "Road transport N2O and CH4 ` +
  `default emission factors" (CH4/N2O); CO2 basis for volumetric derivation: Vol.2 Ch.1 Table 1.4 ` +
  `"Default CO2 emission factors for combustion"`
const SOURCE_IPCC_OFFROAD =
  `IPCC (2006) ${SOURCE_IPCC}, Ch.3 (Mobile Combustion), Table 3.3.1 "Default emission factors for ` +
  `off-road mobile sources and machinery" (CH4/N2O); CO2 basis for volumetric derivation: Vol.2 Ch.1 ` +
  `Table 1.4 "Default CO2 emission factors for combustion"`

// CO2 IS NULL BY CONSTRUCTION, not by omission — see MobileNonCO2Factor above. Tables 3.2.2 and 3.3.1
// publish no CO2 column; it is in Table 1.4, on a per-fuel rather than per-technology basis, because
// CO2 tracks fuel carbon and not the engine (the same reason every MOBILE_CA gasoline row shares 2307.3).
const e = (table: string, source: string) => (ch4: number, n2o: number): MobileNonCO2Factor => ({
  co2: null, ch4, n2o, unit: 'kg/TJ', source, table, edition: IPCC_EDITION, basis: 'per_energy',
})
const road = e('3.2.2', SOURCE_IPCC_ROAD)
const offRoad = e('3.3.1', SOURCE_IPCC_OFFROAD)

export const MOBILE_IPCC = {
  // ── Table 3.2.2, road ──
  // N2O RISES FROM UNCONTROLLED TO OXIDATION CATALYST (3.2 → 8.0), the same direction MOBILE_CA shows
  // for diesel aftertreatment, from an independent source two decades earlier. Two publishers, two
  // methodologies, same counter-intuitive sign — this is a property of catalytic NOx chemistry, not a
  // quirk of one table. Pinned in the tests alongside the ECCC assertion for exactly that reason.
  //   Note the IPCC road-gasoline series does NOT then fall to near-zero the way ECCC's Tier 3 does
  //   (5.7 here for post-1995 light duty, against ECCC's 0.007 for Tier 3). The vintages are twenty
  //   years apart and the classes are not equivalent; do not read one as correcting the other.
  road: {
    gasoline_uncontrolled: road(33, 3.2),
    gasoline_oxidation_catalyst: road(25, 8.0),
    gasoline_light_duty_1995_on: road(3.8, 5.7),
    gas_diesel_oil: road(3.9, 3.9),
    natural_gas: road(92, 3),
    lpg: road(62, 0.2),
  },
  // ── Table 3.3.1, off-road, by engine type and sector ──
  // Off-road diesel N2O (28.6) is 7.3x the road figure (3.9) and ~1300x the stationary 0.022 g/L that
  // engine.ts reuses for mobile. Diesel CH4/N2O are sector-INVARIANT in this table; gasoline CH4 is not.
  off_road: {
    diesel: {
      agriculture: offRoad(4.15, 28.6),
      forestry: offRoad(4.15, 28.6),
      industry: offRoad(4.15, 28.6),
      household: offRoad(4.15, 28.6),
    },
    // ⚠️ FORESTRY IS ABSENT FROM 4-STROKE, AND THAT IS THE SOURCE, NOT AN OVERSIGHT.
    // Table 3.3.1 leaves the forestry cell BLANK for 4-stroke gasoline. Interpolating from the
    // neighbouring sectors would produce a figure IPCC declined to publish, carrying an IPCC citation.
    // A missing entry a caller must handle is recoverable; an invented one reaches a verifier. The
    // 2-stroke row below DOES have forestry (170), so the gap is specific, not a truncated table.
    // A test asserts this key stays absent.
    gasoline_4_stroke: {
      agriculture: offRoad(80, 2),
      industry: offRoad(50, 2),
      household: offRoad(120, 2),
    },
    gasoline_2_stroke: {
      agriculture: offRoad(140, 0.4),
      forestry: offRoad(170, 0.4),
      industry: offRoad(130, 0.4),
      household: offRoad(180, 0.4),
    },
  },
}

// ── Table 1.4 — DEFAULT CO2 EMISSION FACTORS FOR COMBUSTION (kg/TJ) ──────────────────────────────
// Held separately from MOBILE_IPCC because it is a different chapter, a different table, and a
// different axis: per FUEL, not per vehicle technology. Its job here is to be the denominator in
// energyPerLitre — it is not a mobile factor and must not be applied as one.
export const IPCC_CO2_KG_PER_TJ = {
  motor_gasoline: 69300,
  gas_diesel_oil: 74100,
  lpg: 63100,
  natural_gas: 56100,
}

// ── DERIVATION: TJ PER LITRE ─────────────────────────────────────────────────────────────────────
//
// THE PROBLEM. MOBILE_CA is per VOLUME (g/L). MOBILE_IPCC is per ENERGY (kg/TJ). To apply an IPCC
// CH4/N2O default to a customer's litres, you need the energy content of a litre.
//
// IPCC publishes CH4/N2O per unit ENERGY (kg/TJ) and NCV per unit MASS
// (Table 1.2, TJ/Gg). It publishes no fuel densities — Ch.1 §1.4.1.2 and
// Box 1.1 cover only gross-to-net calorific conversion, never volume-to-mass.
// So there is no route from TJ/Gg to TJ/L within the Guidelines, and the
// jurisdiction's own per-litre CO2 factor has to act as the bridge.
//   [IPCC facts above (Table 1.2 basis, absence of a density table, scope of
//    Ch.1 §1.4.1.2 / Box 1.1) verified against the source — LF, 13 Aug 2026.
//    The DECISION to bridge via the jurisdiction's CO2 factor is a
//    methodological choice, not a sourced claim. See the assumption note below.]
//
// The obvious workaround — reaching for a density from somewhere else — imports an uncited number into
// the middle of a derivation that is otherwise fully sourced.
//
// THE METHOD. Use CO2 as the bridge. The same litre of fuel has one CO2 figure expressed two ways:
// ECCC publishes it per volume (g/L), IPCC publishes it per energy (kg/TJ). Their ratio IS the energy
// content, with density and NCV cancelling out because both are already baked into each side:
//
//     TJ/L  =  (co2_g_per_litre / 1000)  ÷  ipcc_co2_kg_per_TJ
//               └── kg CO2 per litre ──┘     └── kg CO2 per TJ ──┘
//
// Dimensionally: (kg/L) ÷ (kg/TJ) = TJ/L. No density, no NCV, no uncited constant.
//
// ⚠️ THE ASSUMPTION THIS RESTS ON, stated plainly because it is the part that can be wrong: it treats
// the ECCC and IPCC CO2 figures as describing the SAME fuel. They are close but not identical — ECCC's
// 2307.3 g/L gasoline reflects the Canadian market fuel, IPCC's 69300 kg/TJ is a global default — so
// the derived energy content inherits any divergence between them. The result is a DERIVED quantity,
// not a published one, and a workings row using it must say so rather than presenting it as sourced.
// Sanity-checked in the tests against the physically expected range for each fuel (~33 MJ/L gasoline,
// ~36 diesel, ~24 LPG), which is what would catch a swapped or mis-scaled denominator.
export const energyPerLitre = (co2GPerLitre: number, ipccCo2KgPerTJ: number): number =>
  (co2GPerLitre / 1000) / ipccCo2KgPerTJ

// ═════════════════════════════════════════════════════════════════════════════════════════════════

// Flattened view, so a guard can assert something about EVERY factor without enumerating the tree and
// silently missing a branch someone adds later. Path is dot-joined for readable failure messages.
export type MobileEntry<T = MobileFactor> = { path: string; factor: T }

// Keys on ch4 rather than co2: MOBILE_IPCC leaves carry `co2: null`, so a co2 test would walk straight
// past every one of them and report an empty tree. Every leaf in both tables has a numeric ch4.
const isLeaf = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && typeof (v as { ch4?: unknown }).ch4 === 'number'

const flatten = <T>(node: unknown, prefix = ''): MobileEntry<T>[] => {
  if (isLeaf(node)) return [{ path: prefix, factor: node as T }]
  if (typeof node !== 'object' || node === null) return []
  return Object.entries(node).flatMap(([k, v]) => flatten<T>(v, prefix ? `${prefix}.${k}` : k))
}

export const mobileEntries = (node: unknown = MOBILE_CA, prefix = ''): MobileEntry<MobileFactor>[] =>
  flatten<MobileFactor>(node, prefix)

export const MOBILE_CA_ENTRIES: MobileEntry<MobileFactor>[] = mobileEntries(MOBILE_CA)
export const MOBILE_IPCC_ENTRIES: MobileEntry<MobileNonCO2Factor>[] = flatten<MobileNonCO2Factor>(MOBILE_IPCC)
