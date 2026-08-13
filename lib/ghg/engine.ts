// ─────────────────────────────────────────────────────────────────────────────
// lib/ghg/engine.ts — the GHG calculation engine.
//
// Extracted VERBATIM from app/dashboard/ghg/page.tsx (Phase 1). Pure computation:
// no React, no DB, no side effects. This is the single source of truth for GHG
// factor tables, GWP routing, coverage analysis, and per-location / per-inventory
// calculation. page.tsx and lib/ghg/monthlyEmissions.ts import from here.
//
// The one non-verbatim change: analyzeCoverage's inner `exclusiveEnd` is lifted to
// a module-level exported function (behaviour identical) so monthlyEmissions can
// share it instead of re-declaring a diverged copy.
// ─────────────────────────────────────────────────────────────────────────────

// DISPLAY CONSTANTS ONLY — no functions, no I/O, so the purity note above still holds. The SB 253
// first-report date is a CARB PROPOSAL that has moved twice; it is not the engine's to assert, and
// FRAMEWORKS.deadline renders to a customer beside computed totals. See lib/sb253.ts.
import { SB253_FRAMEWORK_DEADLINE } from '../sb253'

// The two EXACT conversion anchors, from the repo's conversion authority. Imported rather than
// copied: lib/unitConversions.ts is the single source and its header forbids inlining these.
import { L_PER_GAL, GJ_PER_MMBTU } from '../unitConversions'
// Type only — erased at compile, no runtime dependency and nothing added to the bundle. The engine
// neither builds nor reads a comparability disclosure; it carries the field so the stored inventory
// shape stays in one place. See lib/ghg/comparability.ts.
import type { ComparabilityRecord } from './comparability'

// AR4/AR5 do not distinguish fossil vs biogenic methane — both keys carry the single published GWP100.
// AR6 is the first IPCC set to split them (fossil 29.8 incl. oxidation; biogenic/non-fossil 27.0). N2O AR6 = 273.
const GWP = {
  AR4: { CO2: 1, CH4_fossil: 25,   CH4_biogenic: 25,   N2O: 298 },
  AR5: { CO2: 1, CH4_fossil: 28,   CH4_biogenic: 28,   N2O: 265 },
  AR6: { CO2: 1, CH4_fossil: 29.8, CH4_biogenic: 27.0, N2O: 273 },
}

// Refrigerant GWP-100 by IPCC set, so fugitive emissions follow the same GWP routing as
   // combustion gases. AR4 column preserves the platform's prior hardcoded values (no SB 253
   // regression). Blends (R-404A/410A/507A) are composition-derived — CONFIRM before assurance.
   const REFRIGERANT_GWP: Record<string, Record<GwpVersion, number>> = {
     r22:   { AR4: 1810, AR5: 1760, AR6: 1960 },
     r134a: { AR4: 1430, AR5: 1300, AR6: 1530 },
     r404a: { AR4: 3922, AR5: 3943, AR6: 4728 },
     r410a: { AR4: 2088, AR5: 1924, AR6: 2256 },
     r507:  { AR4: 3985, AR5: 3985, AR6: 4775 },
   }

   const EF = {
  natural_gas_mcf: { co2: 54.43956, ch4: 0.001026, n2o: 0.0001026 },
  natural_gas_therms: { co2: 5.306, ch4: 0.0001, n2o: 0.00001 },
  natural_gas_mmbtu: { co2: 53.06, ch4: 0.001, n2o: 0.0001 },
  propane_gallon: { co2: 5.61561, ch4: 0.000273, n2o: 0.0000546 },
  propane_litre: { co2: 1.48349, ch4: 0.0000721, n2o: 0.0000144 },
  diesel_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  diesel_litre: { co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 },
  fuel_oil_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  // GRADE-EXPLICIT KEYS. fuel_oil_gallon above is UNCHANGED and still the only one read.
  // Distillate No. 2 is byte-identical to diesel_gallon, and to the legacy fuel_oil_gallon — EPA lists
  // diesel and Distillate Fuel Oil No. 2 as the same fuel, which is what makes the legacy key
  // identifiable as the distillate row rather than a guess.
  fuel_oil_distillate_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  // ⚠️ RESIDUAL FUEL OIL No. 6 IS NOT SEEDED. EPA publishes it in the same table as the distillate row
  // above, but I could not open that document to transcribe it, and a factor typed from memory with a
  // primary citation attached is worse than an absent one — it looks sourced. Seed it from EPA
  // "Emission Factors for Greenhouse Gas Inventories" Table 1 before commit 2 makes the key reachable;
  // until then a US location asking for it gets MissingEmissionFactorError, which is loud by design.
  gasoline_gallon: { co2: 8.7775, ch4: 0.000375, n2o: 0.000075 },
  gasoline_litre: { co2: 2.31877, ch4: 0.0000991, n2o: 0.0000198 },
  diesel_mobile_gallon: { co2: 10.20648, ch4: 0.000414, n2o: 0.0000828 },
  diesel_mobile_litre: { co2: 2.69627, ch4: 0.0001094, n2o: 0.0000219 },
  ammonia: 0,
  steam_mmbtu: 66.33,
}

// Canadian combustion factors — ECCC "Emission factors and reference values" v3.0 (Oct 2025).
// Stored as kg per activity unit (raw gas amounts; calcGas applies GWP). Source values are g/unit.
// Mirrors the US EF key structure so factor selection is a clean country swap, with two exceptions:
//   - natural_gas CO2 is per-province (see EF_CA_NG_CO2); the value below is a fallback only.
//   - therms/mmbtu have no ECCC energy-basis factor — CA natural gas uses mcf/m3 only (handled in UI).
// CH4/N2O use the Commercial/Industrial sector rows (Tables 2.x: ~0.037 CH4; 4.x Industrial for oils).
// ── YEAR-STABILITY: WHAT WAS CHECKED, AND WHAT THE CLAIM DOES NOT COVER ─────────────────────────
// Every factor SEEDED BELOW is identical across all three ECCC applicability sets (2023/24, 2025,
// 2026), so no year dimension is needed for them. Verified against v3.0 Tables 1.1-1.3, 2.1-2.3,
// 3.1-3.3 and 4.1-4.3 — LF, 13 Aug 2026.
//
// ⚠️ THE CLAIM IS ABOUT THESE ELEVEN KEYS, NOT ABOUT THE DOCUMENT. Ten factors in v3.0 DO diverge
// between sets. None is seeded here, and each would need a year dimension before it could be:
//   - natural gas, NON-MARKETABLE — Alberta and Newfoundland. (The MARKETABLE column, which is what
//     EF_CA_NG_CO2_M3 below carries, is stable; see its own note.)
//   - producer-consumption CH4 — BC and Saskatchewan. This one also RESTRUCTURES: one lumped row in
//     Table 2.1 becomes per-province rows in 2.2 and 2.3. A year key alone would not be enough —
//     the shape of the lookup changes with the set, not just the value.
//   - petroleum coke — CO2 and N2O, for both refineries and upgraders.
//   - still gas — CO2, refineries.
// Seeding any of those without a year dimension would carry a 2023/24 value into a 2026 inventory
// with nothing on the row saying so — which is the failure GRID_EF already keys by year to avoid.
const EF_CA = {
  // Natural gas: per m3 in source (1921 g CO2/m3 Ontario fallback; per-province override via EF_CA_NG_CO2).
  // mcf conversion: 1 mcf = 28.3168 m3. CH4 0.037 g/m3, N2O 0.035 g/m3 (Res/Comm/Institutional).
  natural_gas_mcf: { co2: 54.396611, ch4: 0.001048, n2o: 0.000991 },
  natural_gas_m3: { co2: 1.921, ch4: 0.000037, n2o: 0.000035 },
  // Propane "All Other Uses" (Table 3.x): 1515 / 0.024 / 0.108 g/L. gallon = litre × 3.78541.
  propane_litre: { co2: 1.515, ch4: 0.000024, n2o: 0.000108 },
  propane_gallon: { co2: 5.734896, ch4: 0.000091, n2o: 0.000409 },
  // Diesel "Refineries and Others" (Table 4.x): 2681 / 0.078 / 0.022 g/L.
  diesel_litre: { co2: 2.681, ch4: 0.000078, n2o: 0.000022 },
  diesel_gallon: { co2: 10.148684, ch4: 0.000295, n2o: 0.000083 },
  // Light fuel oil "Industrial" (Table 4.x): 2753 / 0.006 / 0.031 g/L.
  fuel_oil_gallon: { co2: 10.421234, ch4: 0.000023, n2o: 0.000117 },
  // GRADE-EXPLICIT KEYS — ECCC v3.0 Table 4.3 (2026 set), Industrial rows, g/L x 3.785411784.
  // The legacy key above is CONFIRMED to be the Light/Industrial row: 2753 g/L -> 10.421239 kg/gal
  // against its stored 10.421234, a 4.6e-6 rounding difference matching every other key in this table.
  // Light Fuel Oil - Industrial:  2753 / 0.006 / 0.031 g/L.
  fuel_oil_distillate_gallon: { co2: 10.421239, ch4: 0.000023, n2o: 0.000117 },
  // Heavy Fuel Oil - Industrial: 3156 / 0.12 / 0.064 g/L.
  fuel_oil_residual_gallon: { co2: 11.946760, ch4: 0.000454, n2o: 0.000242 },
  // Motor gasoline (Table 4.x): 2307 / 0.100 / 0.02 g/L.
  gasoline_litre: { co2: 2.307, ch4: 0.0001, n2o: 0.00002 },
  gasoline_gallon: { co2: 8.732941, ch4: 0.000379, n2o: 0.000076 },
  diesel_mobile_litre: { co2: 2.681, ch4: 0.000078, n2o: 0.000022 },
  diesel_mobile_gallon: { co2: 10.148684, ch4: 0.000295, n2o: 0.000083 },
}

// Per-province natural gas CO2 (kg/m3) — ECCC Tables 1.1-1.3, "MARKETABLE" column.
// Used to override EF_CA.natural_gas_*.co2 for the location's province. CH4/N2O stay sector-based.
// Year-stable across all three applicability sets (2023/24, 2025, 2026) — verified against v3.0,
// LF, 13 Aug 2026.
// ⚠️ THE MARKETABLE COLUMN ONLY. The NON-MARKETABLE column in these same tables is NOT year-stable:
// Alberta and Newfoundland diverge between sets. Nothing reads it today, and nothing should start
// without adding a year dimension first — see the block above EF_CA.
const EF_CA_NG_CO2_M3: Record<string, number> = {
  BC: 1.966, AB: 1.962, SK: 1.920, MB: 1.915, ON: 1.921, QC: 1.926,
  NB: 1.919, NS: 1.919, PE: 1.919, NL: 1.919, YT: 1.966, NT: 1.966, NU: 1.966,
}
const M3_PER_MCF = 1000 / 35.3147 // 28.3168

// UK combustion factors — DEFRA/DESNZ 2026 "Greenhouse gas reporting: conversion factors"
// (full set, Fuels tab). The mandatory basis for UK SECR reporting.
// STORAGE NOTE: stored as combined kg CO2e in the `co2` field with ch4:0, n2o:0, so calcGas
// reproduces DEFRA's PUBLISHED figure exactly (Option 2 — exact match for verifier reconciliation).
// DEFRA bakes in its own GWP basis, so UK fuels intentionally do NOT respond to the AR4/AR5 toggle.
// Per DEFRA guidance: natural gas uses the "Natural gas" row (kWh, gross CV — billing basis);
// diesel/petrol use the "average biofuel blend" rows (forecourt fuel). gallon values are a
// non-breaking fallback only (US gallon × litre value); UK wizard defaults to kWh/litres.
//
// ── EDITION HISTORY: 2025 → 2026, REFRESHED WHOLE ───────────────────────────────────────────────
// This table WAS DEFRA/DESNZ 2025. Refreshed to the 2026 workbook in full — LF, 13 Aug 2026.
// Refreshed WHOLE and in one commit, deliberately: EF_UK has no year dimension, so one edition prices
// every reporting year. Seeding a single key from a newer workbook would put two editions in one
// table with nothing on any row saying which priced it. (GRID_EF.UK below is different — it IS
// year-keyed, so it legitimately carries 2025 and 2026 side by side.)
//
// WHAT MOVED, 2025 -> 2026:
//   natural_gas_kwh   0.18296 -> 0.18231   (-0.355%)
//   diesel_litre      2.57082 -> 2.58354   (+0.495%)  — and diesel_mobile_litre, same row
//   gasoline_litre    2.06916 -> 2.075     (+0.282%)
// WHAT DID NOT:
//   propane_litre     1.54358 — CONFIRMED identical in both editions, not assumed.
//   fuel_oil_gallon   3.17492 kg/L — the residual-oil factor is unchanged between editions. Its
//     stored per-gallon value moves 12.018374 -> 12.018380 only because it was previously rounded
//     one digit short; 3.17492 x 3.785411784 = 12.018380.
//
// ⚠️ THE FUEL-OIL ROW IS WHY THE PREVIOUS EDITION CHECK WAS HARD, AND THE LESSON SURVIVES THE REFRESH.
// Because 3.17492 is identical in both workbooks, matching on that row alone would have "proved" this
// table was 2026 when it was 2025. The three keys that MOVED are what identified the edition. Any
// future edition check must use a row that changes, not one that happens to agree.
const EF_UK = {
  // Natural gas, kWh (Gross CV): 0.18231 kgCO2e/kWh (DEFRA 2026 Fuels row "Natural gas";
  // CO2 0.18194, CH4 0.00028, N2O 0.00009 — components sum to the total exactly).
  natural_gas_kwh: { co2: 0.18231, ch4: 0, n2o: 0 },
  // Propane, litres: 1.54358 kgCO2e/L (CO2 1.5414, CH4 0.00133, N2O 0.00084 — components sum to
  // 1.54357, DEFRA's own rounding against its stated 1.54358). UNCHANGED from the 2025 edition.
  propane_litre: { co2: 1.54358, ch4: 0, n2o: 0 },
  propane_gallon: { co2: 5.843086, ch4: 0, n2o: 0 },
  // Diesel (average biofuel blend), litres: 2.58354 kgCO2e/L (CO2 2.55035, CH4 0.00029, N2O 0.0329).
  diesel_litre: { co2: 2.58354, ch4: 0, n2o: 0 },
  diesel_gallon: { co2: 9.779763, ch4: 0, n2o: 0 },
  diesel_mobile_litre: { co2: 2.58354, ch4: 0, n2o: 0 },
  diesel_mobile_gallon: { co2: 9.779763, ch4: 0, n2o: 0 },
  // Fuel oil, litres 3.17492 (DEFRA "Processed fuel oils - residual oil") → per US-gallon fallback.
  // The FACTOR is unchanged from 2025; only the gallon conversion is corrected (see the header).
  fuel_oil_gallon: { co2: 12.018380, ch4: 0, n2o: 0 },
  // ── GRADE-EXPLICIT KEYS — DEFRA/DESNZ 2026 full set, Fuels tab, kg CO2e per litre ──────────────
  // Seedable now the whole table is 2026; seeding them while it was 2025 would have mixed editions.
  //
  // "Processed fuel oils - distillate oil" 2.75541 (CO2 2.72417, CH4 0.00315, N2O 0.02809 — sums
  //   exactly): 2.75541 x 3.785411784 = 10.430361484 -> 10.430361.
  fuel_oil_distillate_gallon: { co2: 10.430361, ch4: 0, n2o: 0 },
  // "Processed fuel oils - residual oil" 3.17492 (CO2 3.16262, CH4 0.0053, N2O 0.00701 — sums to
  //   3.17493, DEFRA's own rounding against its stated 3.17492):
  //   3.17492 x 3.785411784 = 12.018379581 -> 12.018380.
  //
  // ⚠️ IDENTICAL TO fuel_oil_gallon ABOVE BY CONSTRUCTION, NOT COINCIDENCE. The legacy key always
  // WAS the residual row — its comment has said so since it was seeded — so both keys are the same
  // published figure converted the same way. They must move together or one of them is wrong;
  // engine.test.ts Z15 pins the identity so a lone edit fails.
  fuel_oil_residual_gallon: { co2: 12.018380, ch4: 0, n2o: 0 },
  //
  // NAMING NOTE, recorded because it corroborates something still unconfirmed elsewhere:
  // DEFRA publishes "Gas oil" byte-identical to "Processed fuel oils - distillate oil", and
  // "Fuel oil" byte-identical to "Processed fuel oils - residual oil". The plain-language and
  // technical names are aliases for the same two figures — one publisher treating gas oil and
  // distillate fuel oil as one product. That is corroboration, NOT confirmation, for the EU
  // distillate key, which is derived from IPCC's Gas/Diesel Oil row on a category mapping still
  // flagged as unverified at EF_EU. A second publisher agreeing is evidence; the IPCC table saying
  // it is proof, and nobody has opened it.
  // Petrol (average biofuel blend), litres: 2.075 kgCO2e/L (CO2 2.06107, CH4 0.00806, N2O 0.00587).
  gasoline_litre: { co2: 2.075, ch4: 0, n2o: 0 },
  gasoline_gallon: { co2: 7.854729, ch4: 0, n2o: 0 },
}

// EU combustion factors — IPCC 2006 Guidelines Vol.2 Tier-1 defaults (fossil, full oxidation),
// converted to per-unit via standard net calorific values and densities. CO2 from Ch.1 Table 1.4;
// CH4/N2O stationary defaults from Ch.2. Gas split is stored (calcGas applies AR4/AR5).
// BASIS NOTE: these are 100% fossil Tier-1 defaults — they reconcile with ECCC (±1%) and run
// ~5–11% above DEFRA's blended figures purely because DEFRA excludes biofuel content. This is the
// agreed verifier-defensible EU baseline (proceeding on internal recommendation, not verifier sign-off).
// Metric units are the EU norm: natural gas m3, liquids litres. gallon/mcf are non-breaking fallbacks.
const EF_EU = {
  // Natural gas, per m3 (CO2 56100 kg/TJ × ~36 MJ/m3 net): 2.0196 kg CO2/m3.
  natural_gas_m3: { co2: 2.0196, ch4: 0.000036, n2o: 0.0000036 },
  natural_gas_mcf: { co2: 57.188649, ch4: 0.001019406, n2o: 0.000101941 },
  // Propane/LPG (CO2 63100 kg/TJ, NCV 47.3, dens 0.510): 1.52216 kg CO2/L.
  propane_litre: { co2: 1.52216, ch4: 0.0000241, n2o: 0.0000024 },
  propane_gallon: { co2: 5.762, ch4: 0.000091228, n2o: 0.000009085 },
  // Diesel/gas oil (CO2 74100 kg/TJ, NCV 43.0, dens 0.844): 2.68924 kg CO2/L.
  diesel_litre: { co2: 2.68924, ch4: 0.0001089, n2o: 0.0000218 },
  diesel_gallon: { co2: 10.179876, ch4: 0.000412231, n2o: 0.000082522 },
  diesel_mobile_litre: { co2: 2.68924, ch4: 0.0001089, n2o: 0.0000218 },
  diesel_mobile_gallon: { co2: 10.179876, ch4: 0.000412231, n2o: 0.000082522 },
  // Residual fuel oil (CO2 77400 kg/TJ, NCV 40.4, dens 0.990): 3.09569 kg CO2/L → per US-gallon fallback.
  fuel_oil_gallon: { co2: 11.718456, ch4: 0.000454249, n2o: 0.00009085 },
  // GRADE-EXPLICIT KEYS, derived by the method in this table's header (IPCC 2006 Vol.2: CO2 from
  // Ch.1 Table 1.4, CH4/N2O stationary defaults from Ch.2, converted via NCV and density).
  //
  // RESIDUAL reuses the derivation already recorded above, unchanged: CO2 77400 kg/TJ, NCV 40.4,
  // dens 0.990 -> 3.09569 kg CO2/L.
  fuel_oil_residual_gallon: { co2: 11.718456, ch4: 0.000454249, n2o: 0.00009085 },
  // DISTILLATE uses the GAS/DIESEL OIL row: CO2 74100 kg/TJ, NCV 43.0, dens 0.844 -> 2.68924 kg CO2/L
  // — the same three inputs this table already records for diesel_litre, so the values below are
  // byte-identical to diesel_gallon.
  // ⚠️ THE CATEGORY MAPPING IS A JUDGEMENT, NOT A TRANSCRIPTION. IPCC 2006 has no row headed
  // "distillate fuel oil"; Gas/Diesel Oil is the category distillate heating oil falls under. That
  // reading is mine and is not written in the Guidelines in those words — confirm it against Table 1.4
  // before commit 2 makes this key reachable.
  fuel_oil_distillate_gallon: { co2: 10.179876, ch4: 0.000412231, n2o: 0.000082522 },
  // Motor gasoline (CO2 69300 kg/TJ, NCV 44.3, dens 0.745): 2.28714 kg CO2/L.
  gasoline_litre: { co2: 2.28714, ch4: 0.000099, n2o: 0.0000198 },
  gasoline_gallon: { co2: 8.657763, ch4: 0.000374756, n2o: 0.000074951 },
}

// Australia combustion factors — DCCEEW National Greenhouse Accounts (NGA) Factors 2025 (AR5 basis).
// NGA publishes an energy-content factor (GJ/unit) and a combined Scope 1 EF per GJ; effective per-unit
// values are PRE-COMPUTED here (energy_content × combined-EF/GJ) and stored AS-IS in `co2` with ch4:0,
// n2o:0 — so calcGas reproduces the NGA-derived figure exactly and AU intentionally does NOT respond to
// the AR4/AR5/AR6 toggle (AR5 is already baked into the published combined EF). Metric units (m³, litres).
const EF_AU = {
  // Natural gas (NGA Table 4, ex-Table 39 energy content): 0.0393 GJ/m³ × 51.53 kgCO2e/GJ = 2.0251 → 2.025 kg/m³.
  natural_gas_m3: { co2: 2.025, ch4: 0, n2o: 0 },
  // Diesel oil (NGA Table 4/Table 1): 38.6 GJ/kL × 70.2 kgCO2e/GJ ÷ 1000 = 2.70972 → 2.710 kg/L.
  diesel_litre: { co2: 2.710, ch4: 0, n2o: 0 },
  diesel_mobile_litre: { co2: 2.710, ch4: 0, n2o: 0 },
  // Petrol / gasoline (NGA Table 4): 34.2 GJ/kL × 67.8 kgCO2e/GJ ÷ 1000 = 2.31876 → 2.319 kg/L.
  gasoline_litre: { co2: 2.319, ch4: 0, n2o: 0 },
  // LPG (NGA Table 4): 25.7 GJ/kL × 60.6 kgCO2e/GJ ÷ 1000 = 1.55742 → 1.557 kg/L (per-litre, matches engine input).
  propane_litre: { co2: 1.557, ch4: 0, n2o: 0 },
  // GRADE-EXPLICIT KEYS — DCCEEW NGA 2025 Table 8, energy content x combined Scope 1 EF per GJ, the
  // same pre-computation every other key in this table uses. Stored per US GALLON (not per litre like
  // the keys above) because the engine's fuel-oil path converts to gallons before pricing.
  // Heating oil: 37.3 GJ/kL x 69.73 kgCO2e/GJ / 1000 = 2.600929 kg/L x 3.785411784 = 9.845587.
  fuel_oil_distillate_gallon: { co2: 9.845587, ch4: 0, n2o: 0 },
  // Fuel oil:    39.7 GJ/kL x 73.84 kgCO2e/GJ / 1000 = 2.931448 kg/L x 3.785411784 = 11.096738.
  fuel_oil_residual_gallon: { co2: 11.096738, ch4: 0, n2o: 0 },
  // NOTE: AU has no legacy fuel_oil_gallon — it falls through to the US table today. That fallthrough
  // is UNCHANGED by this commit; nothing reads the two keys above yet.
}

// New Zealand combustion factors — MfE "Measuring Emissions" 2026 (v2). Published per-unit directly, so
// stored AS-IS in `co2` with ch4:0, n2o:0 (like EF_UK/EF_AU) — reproduces the MfE figure exactly and does
// NOT respond to the AR toggle. Use-class selectable: Commercial (default) / Industrial only — the MfE
// stationary-combustion workbook has NO Residential row for these fuels (only coal), so Residential is
// intentionally absent (we do not invent factors). NG is per kWh; LPG is per kg (MfE publishes kg, engine
// gains a kg input path); liquids per litre. Petrol has NO stationary factor in MfE — it exists only as a
// Transport fuel, so gasoline_litre maps to Transport Regular Petrol (2.36143); Industrial has no petrol
// row and falls back to that same Regular transport value.
const EF_NZ = {
  commercial: {
    natural_gas_kwh: { co2: 0.19543, ch4: 0, n2o: 0 },   // MfE Stationary Combustion, Commercial
    diesel_litre: { co2: 2.6759, ch4: 0, n2o: 0 },
    diesel_mobile_litre: { co2: 2.6759, ch4: 0, n2o: 0 }, // stationary value reused for mobile (deliberate, for consistency)
    propane_kg: { co2: 2.97164, ch4: 0, n2o: 0 },        // LPG per kg (MfE)
    gasoline_litre: { co2: 2.36143, ch4: 0, n2o: 0 },    // Transport Regular Petrol (no stationary petrol row)
    // MfE Measuring Emissions Catalogue 2026 Table 3.2, per-gas columns already AR5-multiplied, so the
    // combined kgCO2e/L goes in `co2` like every other NZ key. Per US GALLON: the fuel-oil path
    // converts before pricing. Light 2.97088 x 3.785411784 = 11.246004; Heavy 3.05359 -> 11.559096.
    fuel_oil_distillate_gallon: { co2: 11.246004, ch4: 0, n2o: 0 },
    fuel_oil_residual_gallon: { co2: 11.559096, ch4: 0, n2o: 0 },
  },
  industrial: {
    natural_gas_kwh: { co2: 0.195067, ch4: 0, n2o: 0 },  // MfE Stationary Combustion, Industrial
    diesel_litre: { co2: 2.66873, ch4: 0, n2o: 0 },
    diesel_mobile_litre: { co2: 2.66873, ch4: 0, n2o: 0 },
    propane_kg: { co2: 2.96632, ch4: 0, n2o: 0 },
    gasoline_litre: { co2: 2.36143, ch4: 0, n2o: 0 },    // no Industrial petrol → Regular transport fallback
    // MfE 2026 Table 3.2, Industrial. Light 2.96335 x 3.785411784 = 11.217500; Heavy 3.04601 -> 11.530402.
    fuel_oil_distillate_gallon: { co2: 11.217500, ch4: 0, n2o: 0 },
    fuel_oil_residual_gallon: { co2: 11.530402, ch4: 0, n2o: 0 },
  },
}

const EF_SOURCES = {
  combustion: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  combustion_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  combustion_uk: 'UK DEFRA/DESNZ (2026) GHG Conversion Factors for Company Reporting',
  combustion_eu: 'IPCC (2006) Guidelines Vol.2 — Tier 1 default combustion factors',
  combustion_au: 'DCCEEW NGA Factors 2025 (AR5)',
  combustion_nz: 'NZ MfE Measuring Emissions 2026 v2 (as-published basis — factors stored verbatim, no AR re-basing)',
  // KEPT — exported, and still read by the methodology summary in app/dashboard/ghg/page.tsx as a
  // catalogue of every grid source this engine can apply. It must NOT be used on a workings row:
  // a verifier reading one row needs the ONE source that priced it, not the six it might have been.
  electricity: 'US EPA eGRID2023 (US) / ECCC v3.0 (CA) / DEFRA 2025+2026 (UK) / EEA 2023 (EU) / DCCEEW NGA 2025 (AU) / NZ MfE 2026 (NZ)',
  // The catalogue above, split so gridSource() can resolve the one actually applied.
  electricity_us: 'US EPA eGRID2023',
  electricity_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  // ⚠️ YEAR-NEUTRAL, UNLIKE combustion_uk — deliberately. GRID_EF.UK now holds 2025 AND 2026, and
  // gridSource() returns one string whatever year priced the row. Naming an edition here would
  // contradict factor_vintage on the other half of the table: a 2025 inventory would read
  // "DEFRA (2026)" beside "factor_vintage 2025". The vintage column already carries the year, so the
  // citation names the document family and the two together are unambiguous. Re-add a year here only
  // if GRID_EF.UK ever collapses back to a single edition.
  electricity_uk: 'UK DEFRA/DESNZ GHG Conversion Factors for Company Reporting',
  electricity_eu: 'EEA (2023) Greenhouse gas emission intensity of electricity generation',
  electricity_au: 'DCCEEW NGA Factors 2025',
  electricity_nz: 'NZ MfE Measuring Emissions 2026 v2',
  residual_us: 'Green-e Residual Mix 2025 (2023 data, publ. 2026-01-29, CRS) — residual CO₂; eGRID2023 Rev2 (publ. 2025-06-12) CH₄/N₂O. Green-e factors out Green-e-certified voluntary sales (the only published US residual source per CRS).',
  residual_eu: 'AIB European Residual Mixes 2024 (publ. 2025-05-30, Grexel/AIB; Ecoinvent CO₂ inputs) — combined CO₂e, gCO₂/kWh.',
  residual_au: 'DCCEEW National Greenhouse Accounts Factors 2025, Table 2 — national Residual Mix Factor, 0.81 kg CO₂-e/kWh Scope 2. Calculated on a FINANCIAL-YEAR basis (years ending June) with a lag adjustment using a 3-year average, because Large-scale Generation Certificates are created on a CALENDAR-year basis up to 12 months after the generation they represent. National aggregate only — see RESIDUAL_AU.',
  gwp_ar4: 'IPCC AR4 (2007) — selectable alternate; aligns with CARB AB 32 / Mandatory Reporting Regulation, but not the default for any current framework',
  gwp_ar5: 'IPCC AR5 (2014) — GHG Protocol baseline; selectable alternate, not the default for any current framework',
  gwp_ar6: 'IPCC AR6 (2021) — applied by default across all frameworks (SB 253, CDP, ESRS E1, GRI 305, EcoVadis, IFRS S2)',
}

// ── GWP BASIS FOR A FACTOR WE DID NOT COMBINE ────────────────────────────────────────────────────
// A published grid or steam factor arrives as a single kgCO₂e figure that its PUBLISHER produced by
// combining CH₄ and N₂O at a GWP vintage of their choosing — ECCC, eGRID, DEFRA, EEA, DCCEEW and MfE
// each pick their own, and NONE of those choices is recorded anywhere in this repo. Stamping such a
// row with the inventory's selected GWP set would assert that OUR AR6 governs a number ECCC may have
// published on AR5. That is a new false claim, not a fix.
// Same reasoning EF_SOURCES.combustion_nz already carries for NZ combustion: "as-published basis —
// factors stored verbatim, no AR re-basing". This generalises it to every row we did not combine.
// TO RESOLVE PROPERLY: store the vintage beside each factor table and stamp it here. Until then this
// string points the verifier at the citation, which is where the answer actually is.
const GWP_AS_PUBLISHED = 'as-published — see factor source'

const GRID_EF: Record<string, Record<number, number>> = {
  // Canadian provinces / territories — ECCC "Emission factors and reference values" v3.0 (Oct 2025), NIR 1990-2023 consumption intensities
  ON: { 2024: 0.030, 2025: 0.038, 2026: 0.059 },
  QC: { 2024: 0.0017, 2025: 0.0017, 2026: 0.0019 },
  BC: { 2024: 0.015, 2025: 0.015, 2026: 0.018 },
  AB: { 2024: 0.540, 2025: 0.490, 2026: 0.438 },
  SK: { 2024: 0.730, 2025: 0.670, 2026: 0.631 },
  MB: { 2024: 0.0020, 2025: 0.0014, 2026: 0.0025 },
  NB: { 2024: 0.300, 2025: 0.350, 2026: 0.234 },
  NS: { 2024: 0.690, 2025: 0.700, 2026: 0.581 },
  PE: { 2024: 0.300, 2025: 0.350, 2026: 0.234 },
  NL: { 2024: 0.017, 2025: 0.018, 2026: 0.017 },
  YT: { 2024: 0.080, 2025: 0.070, 2026: 0.074 },
  NT: { 2024: 0.170, 2025: 0.190, 2026: 0.420 },
  NU: { 2024: 0.840, 2025: 0.820, 2026: 0.800 },
  // US states — EPA eGRID2023 state output rates (lb/MWh x 0.4536 / 1000)
  US_AK: { 2023: 0.3695 }, US_AL: { 2023: 0.3239 }, US_AR: { 2023: 0.4529 }, US_AZ: { 2023: 0.3126 },
  US_CA: { 2023: 0.1791 }, US_CO: { 2023: 0.4949 }, US_CT: { 2023: 0.2453 }, US_DC: { 2023: 0.1792 },
  US_DE: { 2023: 0.3194 }, US_FL: { 2023: 0.3579 }, US_GA: { 2023: 0.3254 }, US_HI: { 2023: 0.6326 },
  US_IA: { 2023: 0.2877 }, US_ID: { 2023: 0.1424 }, US_IL: { 2023: 0.2152 }, US_IN: { 2023: 0.6648 },
  US_KS: { 2023: 0.3326 }, US_KY: { 2023: 0.7924 }, US_LA: { 2023: 0.3461 }, US_MA: { 2023: 0.3765 },
  US_MD: { 2023: 0.2369 }, US_ME: { 2023: 0.1437 }, US_MI: { 2023: 0.3617 }, US_MN: { 2023: 0.3412 },
  US_MO: { 2023: 0.6598 }, US_MS: { 2023: 0.3757 }, US_MT: { 2023: 0.4826 }, US_NC: { 2023: 0.2841 },
  US_ND: { 2023: 0.5887 }, US_NE: { 2023: 0.4653 }, US_NH: { 2023: 0.1253 }, US_NJ: { 2023: 0.2133 },
  US_NM: { 2023: 0.3509 }, US_NV: { 2023: 0.2921 }, US_NY: { 2023: 0.2116 }, US_OH: { 2023: 0.4846 },
  US_OK: { 2023: 0.2943 }, US_OR: { 2023: 0.1656 }, US_PA: { 2023: 0.2939 }, US_RI: { 2023: 0.3810 },
  US_SC: { 2023: 0.2542 }, US_SD: { 2023: 0.1522 }, US_TN: { 2023: 0.2999 }, US_TX: { 2023: 0.3498 },
  US_UT: { 2023: 0.6447 }, US_VA: { 2023: 0.2448 }, US_VT: { 2023: 0.0237 }, US_WA: { 2023: 0.1209 },
  US_WI: { 2023: 0.5278 }, US_WV: { 2023: 0.8931 }, US_WY: { 2023: 0.8316 },
  US_AVG: { 2023: 0.3497 },
  // United Kingdom — DEFRA/DESNZ "UK electricity" generation factor (location-based, excl. T&D).
  // TWO EDITIONS SIDE BY SIDE, and that is correct here where it would be wrong in EF_UK: this table
  // IS year-keyed, so 2025 keeps the figure the 2025 workbook published and 2026 takes the 2026 one.
  // Replacing 2025 would have re-priced every stored 2025 UK inventory at the 2026 factor — a 26%
  // move on a figure a customer has already reported.
  //   2025: 0.177   — DEFRA/DESNZ 2025 workbook. NOT restated from the 2026 edition; whether 2026
  //                   restates history has not been checked, so the original provenance stands.
  //   2026: 0.13096 — DEFRA/DESNZ 2026 workbook (CO2 0.12943, CH4 0.00067, N2O 0.00086, summing
  //                   exactly). ⚠️ A 26% single-year fall is large even for the UK grid; worth a
  //                   second look at the workbook before this reaches a customer report.
  UK: { 2025: 0.177, 2026: 0.13096 },
  // EU member states — EEA "GHG emission intensity of electricity generation, country level" (2023),
  // gCO2e/kWh ÷ 1000. Generation-based, location-based Scope 2. EU_AVG = EEA EU-27 aggregate.
  EU_AT: { 2023: 0.085 }, EU_BE: { 2023: 0.145 }, EU_BG: { 2023: 0.281 }, EU_HR: { 2023: 0.134 },
  EU_CY: { 2023: 0.585 }, EU_CZ: { 2023: 0.440 }, EU_DK: { 2023: 0.094 }, EU_EE: { 2023: 0.690 },
  EU_FI: { 2023: 0.040 }, EU_FR: { 2023: 0.050 }, EU_DE: { 2023: 0.329 }, EU_EL: { 2023: 0.258 },
  EU_HU: { 2023: 0.154 }, EU_IE: { 2023: 0.260 }, EU_IT: { 2023: 0.225 }, EU_LV: { 2023: 0.067 },
  EU_LT: { 2023: 0.124 }, EU_LU: { 2023: 0.056 }, EU_MT: { 2023: 0.342 }, EU_NL: { 2023: 0.263 },
  EU_PL: { 2023: 0.614 }, EU_PT: { 2023: 0.119 }, EU_RO: { 2023: 0.234 }, EU_SK: { 2023: 0.084 },
  EU_SI: { 2023: 0.176 }, EU_ES: { 2023: 0.158 }, EU_SE: { 2023: 0.008 },
  EU_AVG: { 2023: 0.210 },
  // Australia — DCCEEW National Greenhouse Accounts (NGA) Factors 2025, Table 1 Scope 2
  // (kg CO2e/kWh, AR5 basis). Single vintage. State grids; two auto-map decisions:
  //   ACT has no separate grid → shares NSW (mapping done in detectGridRegion).
  //   WA → SWIS (South West Interconnected System, the main WA grid); NT → DKIS
  //   (Darwin-Katherine Interconnected System, the main NT grid). Both mapped in detectGridRegion.
  AU_NSW: { 2025: 0.64 }, AU_VIC: { 2025: 0.78 }, AU_QLD: { 2025: 0.67 },
  AU_SA: { 2025: 0.22 }, AU_WA: { 2025: 0.50 }, AU_TAS: { 2025: 0.20 }, AU_NT: { 2025: 0.56 },
  AU_AVG: { 2025: 0.62 },
  // New Zealand — MfE "Measuring Emissions" 2026 (v2), national electricity (kg CO2e/kWh).
  // National grid (no sub-national split); year-keyed like the Canadian provinces.
  NZ: { 2023: 0.0766, 2024: 0.0994, 2025: 0.0787 },
}

// New Zealand electricity transmission & distribution (T&D) losses — MfE 2026 (v2), kg CO2e/kWh.
// This is a Scope 3 Category 3 factor, NOT Scope 2; year-keyed for nearest-year lookup like GRID_EF.
// Added as an optional, separately-labelled line only when a NZ location opts in (nz_td_losses).
const NZ_TD_LOSS: Record<number, number> = { 2025: 0.00596 }
// Nearest-year (≤ requested, else earliest) NZ T&D loss factor, kg CO2e/kWh. Scope 3 Cat 3.
// Shared by calcLocation and buildWorkings so the calc term and the workings row never diverge.
//
// ⚠️ RETURNS ITS OWN VINTAGE, BECAUSE THE CALLER CANNOT KNOW IT. This returned a bare number, and the
// workings row stamped `factor_vintage: String(year)` — the INVENTORY year. NZ_TD_LOSS holds one key,
// 2025, so every NZ inventory got the 2025 factor while the row claimed the factor was contemporaneous
// with the reporting year: a 2026 inventory read "factor_vintage 2026" over a 2025 figure. That is not
// a stale factor silently applied — it is a stale factor with a FALSE vintage printed beside it, which
// is worse, because the column exists so a verifier does not have to take the year on trust.
// The caller had no way to do better: a bare number carries no provenance, so `String(year)` was the
// only year in scope at the call site. Returning the provenance with the factor is the fix.
//
// Shaped like getResidualFactor's { ef, vintage, note } for the same reason and in the same style:
// same disclosure obligation, same nearest-year fallback, so the same contract.
//
// TWO NOTE WORDINGS, NOT ONE — and the second is the deviation from getResidualFactor, deliberately.
// The residual helpers say "(latest vintage held)" whichever direction they resolved. That is right
// when the factor is OLDER than the inventory (we reached back to the newest one we hold). It is wrong
// when the factor is NEWER: `let ty = years[0]` means a 2023 or 2024 inventory — both selectable today
// — resolves FORWARD to the 2025 factor, and a "latest" claim says the opposite of what happened.
//   ONE VOCABULARY ACROSS ALL THREE HELPERS: "(latest vintage held)" / "(earliest vintage held)" are
//   now the only two spellings getGridFactor, getResidualFactor and nzTdLoss emit. "vintage" is the
//   right noun because both branches are about WHEN the factor applies, which is also what the
//   factor_vintage column beside the note reports — one word, one meaning, in both places.
//
// ⚠️ THE FORWARD NOTE DESCRIBES OUR COVERAGE, NOT MfE'S. It first read "(no earlier factor published)",
// which was FALSE: MfE publishes an annual T&D loss series back to 2010. The gap is in NZ_TD_LOSS,
// which holds one year. A note blaming the publisher for our own single-key table would send a verifier
// to look for a source document that does not exist, and would quietly excuse a table that should be
// filled in. "(earliest vintage held)" claims only what can be checked from this file.
// Same rule as the error-message one: state what was observed, never a cause you have not verified.
function nzTdLoss(year: number): { ef: number; vintage: string; note: string } {
  const years = Object.keys(NZ_TD_LOSS).map(Number).sort((a, b) => a - b)
  let ty = years[0]; for (const y of years) { if (y <= year) ty = y }
  return {
    ef: NZ_TD_LOSS[ty],
    // 'MfE 2025', matching 'AIB 2024' / 'Green-e 2025 [2023 data]': publisher + the factor's own
    // applicability year, NOT the edition year of the document (MfE's 2026 v2 publishes a 2025 factor).
    vintage: `MfE ${ty}`,
    note:
      ty === year ? ''
      : ty < year ? `MfE ${ty} T&D loss factor applied to ${year} inventory (latest vintage held).`
      : `MfE ${ty} T&D loss factor applied to ${year} inventory (earliest vintage held).`,
  }
}
// ── DEFERRED: Scope 3 Category 3 (upstream / T&D) ELECTRICITY factors — AU + NZ ──────────────
// NOT WIRED. The engine has no Scope 3 Category 3 electricity line today; only the NZ T&D losses
// above (nz_td_losses opt-in) are surfaced. These primary-source values are captured here so they
// aren't lost — transcribe into a real Cat 3 electricity line in a future step before using them.
//   Australia — DCCEEW NGA Factors 2025, Scope 3 (kg CO2e/kWh, AR5):
//     NSW+ACT 0.03, VIC 0.09, QLD 0.09, SA 0.04, WA (SWIS) 0.06, TAS 0.03, NT 0.09, National 0.07
//   New Zealand — MfE "Measuring Emissions" 2026 Scope 3 electricity table: transcribe the exact
//     value(s) from the workbook when wiring (deliberately not reproduced here to avoid inventing figures).
// ── RESIDUAL MIX (market-based Scope 2) ──────────────────────────────────────
// Market-based Scope 2 applies a RESIDUAL-MIX factor to UNCOVERED load (electricity
// not backed by a contractual instrument) — NOT the location-based grid average.
// Both sources are primary and dated:
//   EU — AIB "European Residual Mixes" 2024 (publ. 2025-05-30; Grexel/AIB; Ecoinvent CO2 inputs).
//        Published as COMBINED CO2e in gCO2/kWh (no separate CH4/N2O); helper divides by 1000 -> kg/kWh.
//        Austria (AT) runs a full-disclosure regime -> NO residual mix calculated -> null (NOT zero).
//   US — Green-e "2025 Residual Mix" (2023 data, publ. 2026-01-29, CRS) supplies residual CO2
//        ("Adjusted System Mix", lb/MWh); eGRID2023 Rev2 (publ. 2025-06-12) supplies CH4/N2O (lb/MWh).
//        Green-e strips ONLY Green-e-certified voluntary sales (the only published US residual source).
//        Stored with the gas split so CO2e recomputes via the selected GWP set (AR6/AR5/AR4).
// Year keys = DATA year (EU 2024, US 2023). Helper falls back to nearest available and stamps the vintage.

const RESIDUAL_EU: Record<string, Record<number, number | null>> = {
  EU_AT: { 2024: null },   // full-disclosure regime — residual mix not applicable (do NOT treat as 0)
  EU_BE: { 2024: 131.73 }, EU_BG: { 2024: 379.53 }, EU_HR: { 2024: 573.17 },
  EU_CY: { 2024: 613.08 }, EU_CZ: { 2024: 584.07 }, EU_DK: { 2024: 421.89 },
  EU_EE: { 2024: 611.96 }, EU_FI: { 2024: 405.59 }, EU_FR: { 2024: 23.52 },
  EU_DE: { 2024: 724.56 }, EU_EL: { 2024: 367.07 }, EU_HU: { 2024: 318.64 },
  EU_IE: { 2024: 365.61 }, EU_IT: { 2024: 441.20 }, EU_LV: { 2024: 504.22 },
  EU_LT: { 2024: 567.91 }, EU_LU: { 2024: 213.07 }, EU_MT: { 2024: 398.45 },
  EU_NL: { 2024: 382.47 }, EU_PL: { 2024: 808.30 }, EU_PT: { 2024: 501.76 },
  EU_RO: { 2024: 233.02 }, EU_SK: { 2024: 334.33 }, EU_SI: { 2024: 429.45 },
  EU_ES: { 2024: 292.20 }, EU_SE: { 2024: 85.52 },
}

// US residual: lb/MWh with gas split. co2 = Green-e Adjusted System Mix (residual);
// ch4/n2o = eGRID2023 Rev2 grid values (Green-e publishes no residual CH4/N2O — grid is the
// accepted composite input; its contribution is <0.3% of total). Keyed by eGRID SUBREGION.
type ResidualGas = { co2: number; ch4: number; n2o: number }
const RESIDUAL_US: Record<string, Record<number, ResidualGas>> = {
  AKGD: { 2023: { co2: 914.64,  ch4: 0.086, n2o: 0.012 } },
  AKMS: { 2023: { co2: 532.73,  ch4: 0.026, n2o: 0.004 } },
  AZNM: { 2023: { co2: 707.73,  ch4: 0.039, n2o: 0.005 } },
  CAMX: { 2023: { co2: 434.22,  ch4: 0.025, n2o: 0.003 } },
  ERCT: { 2023: { co2: 823.81,  ch4: 0.043, n2o: 0.006 } },
  FRCC: { 2023: { co2: 801.24,  ch4: 0.041, n2o: 0.005 } },
  HIMS: { 2023: { co2: 1133.29, ch4: 0.146, n2o: 0.022 } },
  HIOA: { 2023: { co2: 1498.95, ch4: 0.134, n2o: 0.021 } },
  MROE: { 2023: { co2: 1405.43, ch4: 0.116, n2o: 0.017 } },
  MROW: { 2023: { co2: 977.88,  ch4: 0.097, n2o: 0.014 } },
  NEWE: { 2023: { co2: 543.23,  ch4: 0.063, n2o: 0.008 } },
  NWPP: { 2023: { co2: 656.53,  ch4: 0.054, n2o: 0.008 } },
  NYCW: { 2023: { co2: 865.74,  ch4: 0.022, n2o: 0.002 } },
  NYLI: { 2023: { co2: 1189.33, ch4: 0.140, n2o: 0.018 } },
  NYUP: { 2023: { co2: 242.80,  ch4: 0.011, n2o: 0.001 } },
  PRMS: { 2023: { co2: 1548.53, ch4: 0.077, n2o: 0.012 } },
  RFCE: { 2023: { co2: 599.24,  ch4: 0.036, n2o: 0.005 } },
  RFCM: { 2023: { co2: 988.66,  ch4: 0.082, n2o: 0.012 } },
  RFCW: { 2023: { co2: 917.78,  ch4: 0.071, n2o: 0.010 } },
  RMPA: { 2023: { co2: 1065.86, ch4: 0.090, n2o: 0.013 } },
  SPNO: { 2023: { co2: 1016.82, ch4: 0.087, n2o: 0.012 } },
  SPSO: { 2023: { co2: 1020.77, ch4: 0.054, n2o: 0.008 } },
  SRMV: { 2023: { co2: 744.96,  ch4: 0.032, n2o: 0.004 } },
  SRMW: { 2023: { co2: 1287.87, ch4: 0.132, n2o: 0.019 } },
  SRSO: { 2023: { co2: 855.10,  ch4: 0.056, n2o: 0.008 } },
  SRTV: { 2023: { co2: 903.72,  ch4: 0.079, n2o: 0.011 } },
  SRVC: { 2023: { co2: 601.89,  ch4: 0.045, n2o: 0.006 } },
}

// ── AUSTRALIA RESIDUAL MIX (market-based Scope 2) ───────────────────────────
// DCCEEW National Greenhouse Accounts Factors 2025, Table 2 (p.9): 0.81 kg CO2-e/kWh, Scope 2.
//
// ⚠️ NATIONAL ONLY, AND THAT IS THE PUBLISHED SHAPE — NOT AN INCOMPLETE SEEDING.
// Unlike RESIDUAL_EU (per member state) and RESIDUAL_US (per eGRID subregion), this table has NO
// region key, because DCCEEW calculates the Residual Mix Factor at national aggregate level: the
// Large-scale Generation Certificate market covers all networks, and creations can come from
// off-grid generation, so a per-state residual mix would not correspond to anything DCCEEW
// publishes. Do not "complete" this with AU_NSW / AU_VIC / … entries — there is nothing to put in
// them, and inventing state splits would attribute to DCCEEW figures it does not produce. The
// absent region key is why the type is Record<number, number> and not the nested shape.
//
// SCOPE 3 (0.11 kg CO2-e/kWh in the same table) IS DELIBERATELY NOT SEEDED. The engine has no
// Scope 3 Category 3 electricity line — only the NZ T&D opt-in — so a Scope 3 residual figure would
// sit here unreachable, and the first person to wire it would have to re-derive which of the two
// numbers belongs on which line. Same rule as the DEFERRED block above NZ_TD_LOSS.
//
// Year key = the WORKBOOK EDITION already cited by EF_SOURCES.electricity_au, so the location-based
// and market-based figures on one AU inventory name the same document.
const RESIDUAL_AU: Record<number, number> = { 2025: 0.81 }

// A grid_region is "resolved" iff it's a real GRID_EF key. 'us_average' (the init default), '' and any
// unmapped string are UNRESOLVED; the deliberate US_AVG/EU_AVG/AU_AVG fallback keys and every AU_/NZ
// key ARE keys → resolved. Single source of truth for the grid-region gate (does not read the factor).
function isResolvedGridRegion(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(GRID_EF, region)
}
// RETURNS ITS OWN FALLBACK NOTE, in the shape getResidualFactor and nzTdLoss already use. usedYear was
// stamped as factor_vintage from the start, so the year on the row was never wrong — but a bare year is
// not a disclosure. Eighty of the 103 GRID_EF keys resolve to 2023 for a 2026 inventory, and the only
// signal was a column reading "2023" beside a row headed 2026, which a reader has to notice and then
// interpret. The note says it.
//
// PUBLISHER-FREE WORDING, deliberately: ef_source already carries the publisher (gridSource(loc) picks
// eGRID / ECCC / DEFRA / EEA / DCCEEW / MfE per country), and repeating it here would let the two drift
// into naming different sources on one row.
//
// BOTH DIRECTIONS, because both are reachable. `let best = years[0]` means a year below the earliest
// key resolves FORWARD — Ontario at 2023 takes the 2024 factor, and 2023 is selectable in the wizard
// today. "latest vintage held" would be the opposite of what happened there. Same reasoning, and the
// same "held" (our coverage, not the publisher's), as the NZ T&D note.
//
// RESOLUTION SEMANTICS UNCHANGED. `years` was already sorted one line above `years[0]` — there was no
// enumeration-order hazard to fix — and the forward fallback is left exactly as it was. This adds
// disclosure only; no figure moves.
function getGridFactor(region: string, year: number): { ef: number; usedRegion: string; usedYear: number; note: string } {
  const table = GRID_EF[region]
  // Unknown region → US national average. UNCHANGED and still undisclosed: `note: ''` is here only
  // because the return type requires it. buildWorkings cannot reach this branch (isResolvedGridRegion
  // gates it), but calcLocation and four UI banners can. Giving it a note or an applicable flag is a
  // separate decision, deliberately not taken here.
  if (!table) return { ef: GRID_EF.US_AVG[2023], usedRegion: 'US_AVG', usedYear: 2023, note: '' }
  const years = Object.keys(table).map(Number).sort((a, b) => a - b)
  if (table[year] !== undefined) return { ef: table[year], usedRegion: region, usedYear: year, note: '' }
  let best = years[0]
  for (const y of years) { if (y <= year) best = y }
  return { ef: table[best], usedRegion: region, usedYear: best,
    note: best < year
      ? `Grid factor for ${best} applied to ${year} inventory (latest vintage held).`
      : `Grid factor for ${best} applied to ${year} inventory (earliest vintage held).` }
}
// DIRECTION-AWARE FALLBACK NOTE for the residual helpers. `year !== y` fired one wording in both
// directions, so a forward resolution claimed the LATEST vintage when it had reached for the EARLIEST.
// Live, not hypothetical: every EU region holds one key (2024), so an EU location on a 2023 inventory —
// selectable in the wizard — read "AIB 2024 residual mix applied to 2023 inventory (latest vintage
// held)", and that note reaches the assurance PDF and the XLSX export, not just the screen.
//
// Same two spellings getGridFactor and nzTdLoss emit, and `label` is whatever the caller uses for
// `vintage`, so the note and the vintage column can never name the factor differently.
// RESOLUTION SEMANTICS UNCHANGED — `let y = years[0]` still resolves forward, exactly as getGridFactor
// does. This is disclosure only; no figure moves.
const vintageNote = (label: string, resolved: number, year: number): string =>
  resolved === year ? ''
  : resolved < year ? `${label} residual mix applied to ${year} inventory (latest vintage held).`
  : `${label} residual mix applied to ${year} inventory (earliest vintage held).`

// Returns the market-based residual factor for a region, in kg CO2e/kWh, with provenance.
// applicable=false means no residual mix exists for this region (e.g. full-disclosure AT, or a
// region we don't cover) — caller MUST fall back to the location-based factor and stamp the note.
// US factors carry a gas split so CO2e responds to the GWP set; EU factors are published CO2e (GWP-fixed).
// THE RESIDUAL REGION KEY, derived once. This expression was copied at FOUR call sites — the calc
// term, the workings row, the assurance PDF's residual table and the XLSX methods block — and adding
// Australia meant teaching all four the same new rule. Miss one and the exports tell a different
// residual story from the workings table, which is the shape of the last three defects in this file.
//
// Returns '' when no residual mix applies, which getResidualFactor turns into the location-factor
// fallback. 'AU' is a COUNTRY token, not a grid region, because the Australian RMF is national (see
// RESIDUAL_AU); every other value here is a real region key.
export function residualRegionFor(loc: Pick<Location, 'residual_region' | 'grid_region' | 'country'>): string {
  if (loc.residual_region) return loc.residual_region
  if ((loc.grid_region || '').startsWith('EU_')) return loc.grid_region
  if ((loc.country || '').toUpperCase().trim() === 'AU') return 'AU'
  return ''
}

function getResidualFactor(
  region: string,
  year: number,
  gwpVersion: GwpVersion
): { ef: number; applicable: boolean; source: string; vintage: string; usedRegion: string; note: string } {
  // EU: published combined CO2e in gCO2/kWh. region is the EU_XX grid key.
  if (region.startsWith('EU_')) {
    const table = RESIDUAL_EU[region]
    if (table) {
      const years = Object.keys(table).map(Number).sort((a, b) => a - b)
      let y = years[0]; for (const yy of years) { if (yy <= year) y = yy }
      const val = table[y]
      // ONE binding for the factor's identity, used by BOTH `vintage` and the note. They named the same
      // factor twice in two places; a single source is what stops them drifting (see the US branch,
      // where they HAD drifted).
      const vintage = `AIB ${y}`
      if (val === null) {
        return { ef: 0, applicable: false, source: EF_SOURCES.residual_eu, vintage, usedRegion: region,
          note: 'Full-disclosure regime — no residual mix published; market-based falls back to location factor.' }
      }
      return { ef: val / 1000, applicable: true, source: EF_SOURCES.residual_eu, vintage, usedRegion: region,
        note: vintageNote(vintage, y, year) }
    }
    return { ef: 0, applicable: false, source: EF_SOURCES.residual_eu, vintage: 'n/a', usedRegion: region,
      note: 'No published residual mix for this region; market-based falls back to location factor.' }
  }
  // AU: DCCEEW publishes ONE national combined CO2e figure — no gas split, no region lookup, the year
  // is the only dimension. Dispatched on the country token residualRegionFor emits.
  if (region === 'AU') {
    const years = Object.keys(RESIDUAL_AU).map(Number).sort((a, b) => a - b)
    let y = years[0]; for (const yy of years) { if (yy <= year) y = yy }
    // Names the publisher, the edition AND the basis. DCCEEW computes the RMF over financial years
    // (ending June) with a 3-year averaging lag, because LGCs are created on a calendar-year basis up
    // to 12 months after the generation they represent. A verifier reconciling a CALENDAR-year
    // inventory against this figure needs that before they start; the full explanation is in
    // EF_SOURCES.residual_au.
    const vintage = `DCCEEW ${y} RMF (FY basis, 3-yr avg)`
    return { ef: RESIDUAL_AU[y], applicable: true, source: EF_SOURCES.residual_au, vintage, usedRegion: region,
      note: vintageNote(vintage, y, year) }
  }
  // US: Green-e residual CO2 + eGRID CH4/N2O, lb/MWh -> kg/kWh CO2e via selected GWP. region is the eGRID subregion.
  const table = RESIDUAL_US[region]
  if (table) {
    const years = Object.keys(table).map(Number).sort((a, b) => a - b)
    let y = years[0]; for (const yy of years) { if (yy <= year) y = yy }
    const g = table[y]
    const gwp = GWP[gwpVersion]
    const lbPerMwh = g.co2 + g.ch4 * gwp.CH4_fossil + g.n2o * gwp.N2O
    const ef = lbPerMwh * 0.453592 / 1000 // lb/MWh -> kg/kWh
    // ⚠️ THE NOTE AND THE VINTAGE NAMED THE SAME FACTOR TWO DIFFERENT WAYS, ON ONE ROW.
    // vintage read `Green-e 2025 [2023 data] + eGRID2023 Rev2`; the note read `Green-e 2023`. "Green-e
    // 2023" is not an edition Green-e publishes — 2023 is the DATA year, and the edition is 2025. A
    // verifier reconciling the row against the source would have gone looking for a document that does
    // not exist. Now built from one binding, so the two cannot say different things again.
    //
    // TWO BINDINGS, ONE DERIVED FROM THE OTHER — not one string reused. `vintage` is a PROVENANCE field
    // and correctly documents both inputs. The note is a SENTENCE about which mix was applied, and
    // eGRID publishes no residual mix: Green-e does, using eGRID's CH4/N2O. Naming eGRID in that
    // sentence would misattribute the mix to a publisher that does not produce one. So the note carries
    // the factor name alone, and the vintage is built FROM it — which is what keeps the two from
    // drifting while still letting them say the right thing in their different roles.
    const factorName = `Green-e ${y + 2} [${y} data]`
    const vintage = `${factorName} + eGRID2023 Rev2`
    return { ef, applicable: true, source: EF_SOURCES.residual_us, vintage, usedRegion: region,
      note: vintageNote(factorName, y, year) }
  }
  return { ef: 0, applicable: false, source: EF_SOURCES.residual_us, vintage: 'n/a', usedRegion: region,
    note: 'No published residual mix for this subregion; market-based falls back to location factor.' }
}

const CA_PROVINCES = ['BC', 'AB', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU']
// eGRID subregions for the US market-based residual-mix picker (item 5). Code -> readable label.
// Users select their exact subregion via EPA Power Profiler (ZIP lookup) rather than inferring from state,
// because several states span multiple subregions (e.g. TX = ERCT + SPP; NY = NYCW/NYLI/NYUP).
const US_SUBREGIONS: Array<[string, string]> = [
  ['AKGD', 'AKGD — ASCC Alaska Grid'], ['AKMS', 'AKMS — ASCC Miscellaneous'],
  ['AZNM', 'AZNM — WECC Southwest'], ['CAMX', 'CAMX — WECC California'],
  ['ERCT', 'ERCT — ERCOT All'], ['FRCC', 'FRCC — FRCC All'],
  ['HIMS', 'HIMS — HICC Miscellaneous'], ['HIOA', 'HIOA — HICC Oahu'],
  ['MROE', 'MROE — MRO East'], ['MROW', 'MROW — MRO West'],
  ['NEWE', 'NEWE — NPCC New England'], ['NWPP', 'NWPP — WECC Northwest'],
  ['NYCW', 'NYCW — NPCC NYC/Westchester'], ['NYLI', 'NYLI — NPCC Long Island'],
  ['NYUP', 'NYUP — NPCC Upstate NY'], ['PRMS', 'PRMS — Puerto Rico Miscellaneous'],
  ['RFCE', 'RFCE — RFC East'], ['RFCM', 'RFCM — RFC Michigan'],
  ['RFCW', 'RFCW — RFC West'], ['RMPA', 'RMPA — WECC Rockies'],
  ['SPNO', 'SPNO — SPP North'], ['SPSO', 'SPSO — SPP South'],
  ['SRMV', 'SRMV — SERC Mississippi Valley'], ['SRMW', 'SRMW — SERC Midwest'],
  ['SRSO', 'SRSO — SERC South'], ['SRTV', 'SRTV — SERC Tennessee Valley'],
  ['SRVC', 'SRVC — SERC Virginia/Carolina'],
]
const US_STATES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY']
// Australian states/territories offered for grid selection. ACT shares the NSW grid factor, and
// WA/NT auto-map to their main interconnected grids (SWIS/DKIS) — both handled in detectGridRegion.
const AU_STATES = ['NSW','ACT','VIC','QLD','SA','WA','TAS','NT']
// EU-27 ISO codes (EL = Greece per EEA/EU convention). Maps country -> EU_XX grid key.
const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','EL','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']
// EU-27 dropdown options: [ISO, label with flag], alphabetical by country name.
const EU_COUNTRY_OPTIONS: Array<[string, string]> = [
  ['AT','🇦🇹 Austria'],['BE','🇧🇪 Belgium'],['BG','🇧🇬 Bulgaria'],['HR','🇭🇷 Croatia'],
  ['CY','🇨🇾 Cyprus'],['CZ','🇨🇿 Czechia'],['DK','🇩🇰 Denmark'],['EE','🇪🇪 Estonia'],
  ['FI','🇫🇮 Finland'],['FR','🇫🇷 France'],['DE','🇩🇪 Germany'],['EL','🇬🇷 Greece'],
  ['HU','🇭🇺 Hungary'],['IE','🇮🇪 Ireland'],['IT','🇮🇹 Italy'],['LV','🇱🇻 Latvia'],
  ['LT','🇱🇹 Lithuania'],['LU','🇱🇺 Luxembourg'],['MT','🇲🇹 Malta'],['NL','🇳🇱 Netherlands'],
  ['PL','🇵🇱 Poland'],['PT','🇵🇹 Portugal'],['RO','🇷🇴 Romania'],['SK','🇸🇰 Slovakia'],
  ['SI','🇸🇮 Slovenia'],['ES','🇪🇸 Spain'],['SE','🇸🇪 Sweden'],
]
function detectGridRegion(code: string, country?: string): string {
  const c = (code || '').toUpperCase().trim()
  const ctry = (country || '').toUpperCase().trim()
  // Australia first — its NT/WA codes collide with a CA province / US state, so gate on country.
  // ACT shares the NSW grid; WA→AU_WA (SWIS main); NT→AU_NT (DKIS main); else AU_<state>.
  if (ctry === 'AU' || ctry === 'AUSTRALIA') {
    if (c === 'ACT' || c === 'NSW') return 'AU_NSW'
    if (AU_STATES.includes(c)) return 'AU_' + c
    // Blank / unknown AU state → UNRESOLVED (''), NOT 'AU_AVG' — same rationale as the US fallback
    // below: a real AU_AVG key would read as resolved and slip past the gate. AU_AVG stays a
    // deliberate/calc-only key, never a silent blank-state result.
    return ''
  }
  if ((ctry === 'CA' || ctry === 'CANADA') && CA_PROVINCES.includes(c)) return c
  if (CA_PROVINCES.includes(c) && !US_STATES.includes(c)) return c
  if (US_STATES.includes(c)) return 'US_' + c
  // Blank / unknown state → UNRESOLVED ('' ), NOT 'US_AVG'. A real US_AVG key would read as resolved
  // and slip past the gate; '' lets the gate catch a US location with no state (like CA-no-province).
  // US_AVG remains a deliberate calc-time fallback inside getGridFactor; no UI offers it as a choice.
  return ''
}
// Country-level grid region for countries whose grid factor is national (UK, EU members).
// Returns the GRID_EF key, or '' if the country isn't one we map at country level.
function gridRegionForCountry(country: string): string {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') return 'UK'
  if (ctry === 'NZ' || ctry === 'NEW ZEALAND') return 'NZ'
  if (EU_COUNTRIES.includes(ctry)) return 'EU_' + ctry
  return ''
}
const GRID_REGIONS_CA = CA_PROVINCES.map(p => { const y = GRID_EF[p]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: p, label: p, ef: y[latest] } })
const GRID_REGIONS_US = US_STATES.map(s => { const y = GRID_EF['US_' + s]; const latest = Math.max(...Object.keys(y).map(Number)); return { value: 'US_' + s, label: s, ef: y[latest] } })

const FRAMEWORKS = [
  {
    id: 'sb253', name: 'SB 253', full: 'California SB 253 — CARB', color: '#B91C1C', bg: '#FCEBEB',
    gwp: 'AR6', deadline: SB253_FRAMEWORK_DEADLINE,
    desc: 'Scope 1 + 2 disclosure for California-nexus companies with $1B+ global revenue',
    requires: ['revenue_millions', 'california_nexus'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'cdp', name: 'CDP', full: 'CDP Climate — C6/C7/C11', color: '#0C447C', bg: '#E6F1FB',
    gwp: 'AR6', deadline: 'Annual — July',
    desc: 'Full CDP Climate questionnaire Scope 1 + 2 disclosure with prior year comparison',
    requires: ['prior_year_s1', 'prior_year_s2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'esrs', name: 'ESRS E1', full: 'ESRS E1 — EU CSRD (Scope 3 mandatory)', color: '#7425e3', bg: '#EDE9FE',
    gwp: 'AR6', deadline: 'FY2024 (large EU companies)',
    desc: 'Full ESRS E1 disclosure — location AND market-based Scope 2, biogenic, by gas',
    requires: ['market_based_s2', 'renewable_energy_kwh', 'biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'gri', name: 'GRI 305', full: 'GRI 305 — Emissions', color: '#0F6E56', bg: '#E1F5EE',
    gwp: 'AR6', deadline: 'Annual',
    desc: 'GRI 305-1, 305-2, 305-3 disclosure — by gas (CO₂, CH₄, N₂O, HFCs separately)',
    requires: ['biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'ecovadis', name: 'EcoVadis', full: 'EcoVadis — E1 Module', color: '#ba7517', bg: '#FEF3E2',
    gwp: 'AR6', deadline: 'Annual — assessment cycle',
    desc: 'Simplified Scope 1 + 2 total with revenue and employee intensity ratios',
    requires: ['employee_count'],
    intensity_denominator: 'both',
  },
  {
    id: 'ifrs', name: 'IFRS S2', full: 'IFRS S2 — Climate Disclosures', color: '#555553', bg: '#f8f7f5',
    gwp: 'AR6', deadline: 'Jurisdiction dependent',
    desc: 'GHG inventory component of IFRS S2 — feeds into physical and transition risk disclosure',
    requires: ['revenue_millions'],
    intensity_denominator: 'revenue',
  },
]

type ConciergeStatus = 'extracted' | 'confirmed' | 'rejected' | 'needs_manual_review'

interface ExtractedProposal {
  fuelType: string
  rawValue: number | null
  rawUnit: string | null
  value: number | null            // canonical value, after lib conversion
  unit: string | null             // canonical unit
  conversionNote?: string
  periodStart: string | null      // ISO yyyy-mm-dd
  periodEnd: string | null
  periodConfidence?: 'high' | 'medium' | 'low' | null
  confidence: 'high' | 'medium' | 'low'
  sourceQuote: string | null
  notes: string | null
  status: ConciergeStatus
}

interface SourceDoc {
  id: string
  file_name: string
  document_type: string
  uploaded_at: string
  file_path: string
  extracted?: ExtractedProposal[]   // concierge proposals (one per fuel read from this doc)
  // WHY this document carries no figures. Absent means the question does not arise — figures were
  // read, or the customer holds no concierge tier. Persisted with the inventory deliberately: an
  // uploaded document showing no figures and no reason is the silent state this field exists to
  // prevent, and it has to still be answered when the customer comes back a week later.
  //   'abstained'  — read, but no figure could be taken from it with confidence. NOT a failure:
  //                  the extractor is instructed to abstain rather than guess.
  //   'failed'     — the extraction call itself errored.
  //   'not_read'   — no attempt was made (document type or file type the reader does not handle).
  read_outcome?: 'abstained' | 'failed' | 'not_read'
  read_note?: string                // one plain sentence shown to the customer
}

interface Location {
 id: string; name: string; country: string; state?: string; province?: string; region?: string
  has_natural_gas: boolean; natural_gas_amount: number; natural_gas_unit: 'mcf' | 'therms' | 'mmbtu' | 'm3' | 'kwh'
  has_propane: boolean; propane_amount: number; propane_unit: 'gallons' | 'litres' | 'kg'
  has_diesel_stationary: boolean; diesel_stationary_amount: number; diesel_stationary_unit: 'gallons' | 'litres'
  // fuel_oil_gallons is NOT renamed — the key exists in every stored locations_data row. It now
  // holds the amount in `fuel_oil_unit`, which is 'gallons' when the key is absent. The name is
  // therefore misleading, which is exactly why nothing reads it directly: go through fuelOilInGallons.
  has_fuel_oil: boolean; fuel_oil_gallons: number; fuel_oil_unit?: 'gallons' | 'litres'
  has_mobile: boolean; gasoline_amount: number; gasoline_unit: 'gallons' | 'litres'; diesel_mobile_amount: number; diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean; has_hfc_refrigerants: boolean; refrigerant_type: string; refrigerant_purchased_kg: number
  electricity_kwh: number; grid_region: string; renewable_electricity_kwh: number; residual_region: string
  // Same as fuel_oil_gallons: key kept, unit added, 'mmbtu' when absent. Read via steamInMmbtu.
  has_purchased_steam: boolean; purchased_steam_mmbtu: number; purchased_steam_unit?: 'mmbtu' | 'gj'
  biogenic_co2_mt: number
  // New Zealand-only (optional, default-safe): use-class picks the EF_NZ variant (Commercial default /
  // Industrial — no Residential in MfE data); nz_td_losses toggles the optional Scope 3 Cat 3 T&D line.
  nz_use_class?: 'commercial' | 'industrial'
  nz_td_losses?: boolean
  source_docs: SourceDoc[]
  // Per-stream "this site has no such supply" attestations. Absent (undefined/missing entry) means
  // NOBODY has answered → the stream is UNDECLARED and blocks export. See findUndeclaredStreams.
  stream_attestations?: StreamAttestation[]
}

// Derive the reporting period from a reporting year + fiscal year-end MONTH (1-12).
// 12 (December) -> Jan 1 – Dec 31 of the reporting year (calendar year, the default).
// Any other month -> the 12 months ENDING on the last day of that month in the reporting year.
// The last day is computed leap-year-aware (e.g. a February end resolves to 28 or 29 correctly).
const parseLocalDate = (s: string): Date => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
function periodFromYearAndEnd(reportingYear: number, fiscalYearEndMonth: number = 12): { start: Date; end: Date; label: string } {
  const m = (fiscalYearEndMonth >= 1 && fiscalYearEndMonth <= 12) ? fiscalYearEndMonth : 12
  const end = new Date(reportingYear, m, 0) // day 0 of the next month = last day of month m (leap-aware)
  const start = new Date(end)
  start.setDate(start.getDate() + 1)
  start.setFullYear(start.getFullYear() - 1)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}
// ── Concierge coverage analysis (spec: docs/pricing-and-concierge-spec-v4.md addendum) ──
// Pure function. Given a fuel's CONFIRMED proposals (each carrying a billing period)
// and the reporting-year window, classifies data completeness so the wizard can
// surface gaps/overlaps/straddles and never silently produce an incomplete annual total.
//
// METHOD (documented for verifiers): coverage, gaps, and overlaps are assessed at DAY
// level. Each bill period is normalized to a half-open [start, end) interval — utility
// bills arrive in two end-date conventions (last-day-of-month and first-of-next-month);
// both are canonicalized so coverage is convention-independent. A month is reported as
// covered only if every in-window day of it is covered (a partial month is a gap, never
// silently claimed). Straddle proration is computed at day level. The basis is recorded
// in buildWorkings so every estimate is traceable.
interface CoveragePeriod { docId: string; pi: number; start: Date; end: Date }
interface CoverageResult {
  status: 'full' | 'gap' | 'overlap' | 'straddle' | 'none'
  // EVERY condition that holds, not just the one the scalar `status` collapsed to. `status` is a scalar
  // and the conditions are NOT mutually exclusive — a fuel with BOTH a gap and an overlap used to report
  // only 'overlap', so acknowledging the duplicate slipped the gap past the gate (the D1 masking bug).
  // The gate iterates `issues` and requires a resolution for EACH. `status` is kept for display/callsites.
  issues: Array<'gap' | 'overlap' | 'straddle'>
  monthsCovered: number
  coverageRatio: number               // monthsCovered / 12
  pctEstimated: number                // (12 - monthsCovered)/12, for disclosure
  gaps: { label: string }[]           // uncovered months, human-readable
  overlaps: { a: CoveragePeriod; b: CoveragePeriod }[]
  straddles: { p: CoveragePeriod; daysInYear: number; totalDays: number; pctInYear: number }[]
  outOfWindow: { label: string }[]    // bills fully outside the reporting year (not counted)
  summary: string
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthLabel(y: number, m0: number): string {
  return new Date(y, m0, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1 // inclusive
}

// Canonicalize a bill's printed end date to a half-open exclusive boundary (the first
// UNCOVERED day). Bills print their end one of two ways:
//   "Dec 20 – Jan 19"  → Jan 19 is the last COVERED day (inclusive; the common meter-read cycle)
//   "Dec 01 – Jan 01"  → Jan 01 is the first UNCOVERED day (exclusive; first-of-next-month)
// The 1st of a month is the ONLY date that reads as exclusive; every other end date is the
// last covered day and must be pushed +1 to get the exclusive boundary. (The old heuristic
// keyed on "last day of month", which silently dropped a day at every mid-month boundary.)
// Shared by analyzeCoverage AND lib/ghg/monthlyEmissions — one definition, no diverged copy.
function exclusiveEnd(end: Date): Date {
  return end.getDate() === 1
    ? new Date(end.getFullYear(), end.getMonth(), 1)
    : new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1)
}

function analyzeCoverage(periods: CoveragePeriod[], winStart: Date, winEnd: Date): CoverageResult {
  if (periods.length === 0) {
    return { status: 'none', issues: [], monthsCovered: 0, coverageRatio: 0, pctEstimated: 0, gaps: [], overlaps: [], straddles: [], outOfWindow: [], summary: 'No dated bills yet.' }
  }
  const DAY = 86400000
  // exclusiveEnd (canonicalizes both bill-end conventions to a half-open boundary)
  // is now a module-level function — the documented basis for the day-continuity check.

  // Reporting-year months (month-shaped reporting the strip/export expect).
  const reqMonths: string[] = []
  {
    const d = new Date(winStart.getFullYear(), winStart.getMonth(), 1)
    const last = new Date(winEnd.getFullYear(), winEnd.getMonth(), 1)
    while (d <= last) { reqMonths.push(monthKey(d)); d.setMonth(d.getMonth() + 1) }
  }

  // Canonical half-open reporting window: winEnd is inclusive, so the exclusive boundary is winEnd + 1
  // day. This is the SAME boundary the day-map below uses — straddle detection and coverage can never
  // disagree (that disagreement, via the raw-end test, was the phantom-straddle bug).
  const winS = new Date(winStart.getFullYear(), winStart.getMonth(), winStart.getDate())
  const winEexcl = new Date(winEnd.getFullYear(), winEnd.getMonth(), winEnd.getDate() + 1)
  const dayCount = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / DAY) // half-open, NOT the inclusive daysBetween

  // Straddles: a bill whose CANONICAL [start, exclusiveEnd(end)) interval has days BOTH inside and
  // outside the window. Out-of-window: no in-window days. Using exclusiveEnd (which handles both
  // bill-end conventions) means a first-of-next-month end like 2024-12-01→2025-01-01 is seen as
  // covering December ONLY — no phantom straddle. daysInYear/totalDays are half-open, consistent
  // with the day-map. No materiality threshold: once the convention is right, every straddle is real.
  const straddles: CoverageResult['straddles'] = []
  const outOfWindow: CoverageResult['outOfWindow'] = []
  const fmtPeriod = (p: CoveragePeriod) =>
    `${p.start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
  periods.forEach(p => {
    const pStart = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate())
    const pEndExcl = exclusiveEnd(p.end)
    const totalDays = dayCount(pStart, pEndExcl)
    const ovStart = pStart > winS ? pStart : winS
    const ovEndExcl = pEndExcl < winEexcl ? pEndExcl : winEexcl
    const daysInYear = Math.max(0, dayCount(ovStart, ovEndExcl))
    if (daysInYear <= 0) {
      // No in-window days → fully outside the reporting year.
      outOfWindow.push({ label: fmtPeriod(p) })
    } else if (daysInYear < totalDays) {
      // Part in, part out → a real straddle.
      straddles.push({ p, daysInYear, totalDays, pctInYear: Math.round((daysInYear / totalDays) * 1000) / 10 })
    }
    // daysInYear === totalDays → fully in-window → neither straddle nor out-of-window.
  })

  // ── DAY-LEVEL CONTINUITY (verifier-defensible primitive) ──
  // Build a per-day coverage count across the window; a day is covered when ≥1 bill's
  // canonical [start, exclusiveEnd) spans it. Gaps = uncovered days; overlaps = days
  // covered by ≥2 bills. Month-level results below are derived from this day map, so
  // the calendar-vs-billing-cycle artifact never produces false gaps or false overlaps.
  // (winS / winEexcl are defined above, shared with straddle detection.)
  const totalDaysInWin = Math.round((winEexcl.getTime() - winS.getTime()) / DAY)
  const idxOf = (d: Date): number =>
    Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - winS.getTime()) / DAY)
  const coverCount: number[] = new Array(Math.max(0, totalDaysInWin)).fill(0)
  periods.forEach(p => {
    let i = Math.max(0, idxOf(p.start))
    const jExcl = Math.min(totalDaysInWin, idxOf(exclusiveEnd(p.end)))
    for (; i < jExcl; i++) coverCount[i]++
  })

  // Overlap pairs: any two bills sharing ≥1 in-window day.
  const overlapPairs: CoverageResult['overlaps'] = []
  for (let a = 0; a < periods.length; a++) {
    for (let b = a + 1; b < periods.length; b++) {
      const aS = Math.max(0, idxOf(periods[a].start)), aE = Math.min(totalDaysInWin, idxOf(exclusiveEnd(periods[a].end)))
      const bS = Math.max(0, idxOf(periods[b].start)), bE = Math.min(totalDaysInWin, idxOf(exclusiveEnd(periods[b].end)))
      if (Math.max(aS, bS) < Math.min(aE, bE)) overlapPairs.push({ a: periods[a], b: periods[b] })
    }
  }

  // Month is COVERED iff every in-window day of it is covered (conservative: a partial
  // month is a gap, never silently claimed — fails toward honest gaps, not false coverage).
  const covered: string[] = []
  const gaps: CoverageResult['gaps'] = []
  reqMonths.forEach(mk => {
    const [y, m] = mk.split('-').map(Number)
    const lo = Math.max(0, idxOf(new Date(y, m - 1, 1)))
    const hi = Math.min(totalDaysInWin, idxOf(new Date(y, m, 1)))
    let allCovered = hi > lo
    for (let i = lo; i < hi; i++) if (coverCount[i] === 0) { allCovered = false; break }
    if (allCovered) covered.push(mk)
    else gaps.push({ label: monthLabel(y, m - 1) })
  })

  const monthsCovered = covered.length
  const total = reqMonths.length || 12
  // issues: ALL conditions present (a bill can straddle AND leave a gap AND overlap another). status
  // is the scalar display value, kept for existing callsites; the gate reads `issues`, not `status`.
  const issues: CoverageResult['issues'] = []
  if (gaps.length > 0) issues.push('gap')
  if (overlapPairs.length > 0) issues.push('overlap')
  if (straddles.length > 0) issues.push('straddle')
  let status: CoverageResult['status'] = 'full'
  if (gaps.length > 0) status = 'gap'
  if (overlapPairs.length > 0) status = 'overlap'
  if (straddles.length > 0 && gaps.length === 0 && overlapPairs.length === 0) status = 'straddle'
  // Summary lists EVERY issue present, so the display never advertises just one of several problems.
  const summaryParts: string[] = []
  if (issues.includes('gap')) summaryParts.push(`missing ${gaps.map(g => g.label).join(', ')}`)
  if (issues.includes('overlap')) summaryParts.push(`${overlapPairs.length} month(s) covered by more than one bill`)
  if (issues.includes('straddle')) summaryParts.push(`${straddles.length} bill(s) cross the reporting-year boundary`)
  return {
    status,
    issues,
    monthsCovered,
    coverageRatio: monthsCovered / total,
    pctEstimated: Math.round(((total - monthsCovered) / total) * 1000) / 10,
    gaps,
    overlaps: overlapPairs,
    straddles,
    outOfWindow,
    summary: status === 'full'
      ? `Full year covered (${monthsCovered}/${total} months).`
      : `${monthsCovered}/${total} months covered — ${summaryParts.join('; ')}.`,
  }
}

// A documented coverage resolution (gap/overlap/straddle), stored on the inventory.
// Raw confirmed proposals stay untouched; this is the transparent, additive layer
// the verifier sees (workings records method + basis). Spec: coverage-check addendum.
interface CoverageResolution {
  locId: string
  fuelType: string
  kind: 'extrapolate' | 'duplicate' | 'straddle'
  // extrapolate: gross up partial-year data by coverage ratio
  monthsCovered?: number          // for extrapolate: e.g. 11
  pctEstimated?: number           // for extrapolate: e.g. 8.3
  // straddle: day-level proration choice
  straddleChoice?: 'this_year' | 'next_year' | 'prorate'
  daysInYear?: number
  totalDays?: number
  // duplicate: which doc/proposal was dropped
  droppedDocId?: string
  note: string                    // human-readable, flows into workings
  acknowledgedAt: string          // ISO timestamp
}
interface Inventory {
  company_name: string; company_id?: string | null; reporting_year: number; revenue_millions: number
  employee_count: number; boundary_approach: string
  california_nexus: boolean
  fiscal_year_end_month: number
  prior_year_s1: number; prior_year_s2: number
  selected_frameworks: string[]
locations: Location[]
  coverage_resolutions?: CoverageResolution[]
  /**
   * The year-over-year comparability disclosure — `ghg_inventories.comparability_disclosure`.
   *
   * NULL / absent means THE QUESTION WAS NEVER ASKED. It is not an empty disclosure, and must never
   * be defaulted to one: "nobody put an observation in front of them" and "they were asked and had
   * nothing to add" are the two states this whole feature exists to let a verifier tell apart, and
   * an `{}` written on save collapses them.
   *
   * Holds the RECORD (what the customer was shown, their answer, the basis at answer time, and the
   * save-time drift check) — not a bare disclosure. The disclosure is recomputed on every render;
   * the record is evidence of one moment and is never recomputed.
   */
  comparability_disclosure?: ComparabilityRecord | null
}

const emptyLocation = (id: string, name: string, state = ''): Location => ({
  id, name, country: 'US', state: '', province: '', region: '',
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil: false, fuel_oil_gallons: 0, fuel_oil_unit: 'gallons',
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average', renewable_electricity_kwh: 0, residual_region: '',
  has_purchased_steam: false, purchased_steam_mmbtu: 0, purchased_steam_unit: 'mmbtu',
  biogenic_co2_mt: 0,
  nz_use_class: 'commercial', nz_td_losses: false,
  source_docs: [],
})

// Natural gas units offered per country. CA uses mcf/m3 only (ECCC has no energy-basis
// factor for therms/mmbtu). UK uses kWh only (DEFRA's billing basis — how UK gas bills read).
// US keeps all three. Returned as [value, label] pairs.
function ngUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'CA') return [['m3', 'm³'], ['mcf', 'Mcf']]
  if (ctry === 'GB' || ctry === 'UK') return [['kwh', 'kWh']]
  if (ctry === 'NZ') return [['kwh', 'kWh']]
  if (ctry === 'AU') return [['m3', 'm³']]
  if (EU_COUNTRIES.includes(ctry)) return [['m3', 'm³']]
  return [['mcf', 'Mcf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']]
}
// Snap a natural gas unit to a valid one for the given country (used when country changes).
function normalizeNgUnit(country: string, unit: string): string {
  const valid = ngUnitOptions(country).map(([v]) => v)
  return valid.includes(unit) ? unit : valid[0]
}
// Liquid-fuel units offered per country. Metric countries (CA, UK, EU) get litres only —
// gallons is never offered, so a verifier can't find US units on a metric inventory.
function liquidUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || ctry === 'NZ' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}
// Propane/LPG units are separate from other liquids: NZ publishes LPG per kg (MfE), so NZ offers kg
// only; other metric countries (CA/UK/EU/AU) use litres; US/other keep gallons+litres.
// District-heating / steam units offered per country. Same principle as liquidUnitOptions: never
// show a unit a customer in that country would not see on a bill.
//   US/default — MMBtu, the US district-steam convention. GJ also offered; some US campus systems
//     bill metric and neither unit is ambiguous, so offering both costs nothing.
//   Metric countries — GJ only. MMBtu is not a billing unit anywhere outside the US.
//
// ⚠️ KNOWN GAP, not an oversight: the ACTUAL billing unit for UK heat networks is kWh (Heat Network
// (Metering and Billing) Regulations) and for much of Germany it is MWh. Neither is offered here, so
// those customers must convert by hand. Adding them means a third unit plus an energy conversion —
// deliberately out of scope of this change, and recorded so it is not mistaken for a decision that
// kWh is wrong.
function steamUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || ctry === 'NZ' || EU_COUNTRIES.includes(ctry)
  return metric ? [['gj', 'GJ']] : [['mmbtu', 'MMBtu'], ['gj', 'GJ']]
}

function propaneUnitOptions(country: string): Array<[string, string]> {
  const ctry = (country || '').toUpperCase().trim()
  if (ctry === 'NZ') return [['kg', 'kg']]
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}


// ── The unit registry: ONE place that says which option list governs which field ─────────────────
// Every fuel with a selectable unit is listed here, and snapUnitsForCountry below derives entirely
// from it. That makes the coupling STRUCTURAL rather than a comment asking two lists to agree: a
// fuel added here is snapped automatically, and lib/ghg/unitSnap.test.ts fails if a *_unit field
// exists on a Location without an entry.
//
// Replaces a hand-written `metric ? 'litres' : …` block in the wizard's country-change handler,
// which listed the fuels a second time and silently omitted whichever was added last.
export const UNIT_FIELDS = [
  { field: 'natural_gas_unit',       label: 'natural gas',            options: ngUnitOptions,      list: 'ngUnitOptions' },
  { field: 'propane_unit',           label: 'propane / LPG',          options: propaneUnitOptions, list: 'propaneUnitOptions' },
  { field: 'diesel_stationary_unit', label: 'diesel (stationary)',    options: liquidUnitOptions,  list: 'liquidUnitOptions' },
  { field: 'fuel_oil_unit',          label: 'fuel oil',               options: liquidUnitOptions,  list: 'liquidUnitOptions' },
  { field: 'gasoline_unit',          label: 'petrol (mobile)',        options: liquidUnitOptions,  list: 'liquidUnitOptions' },
  { field: 'diesel_mobile_unit',     label: 'diesel (mobile)',        options: liquidUnitOptions,  list: 'liquidUnitOptions' },
  { field: 'purchased_steam_unit',   label: 'purchased steam',        options: steamUnitOptions,   list: 'steamUnitOptions' },
] as const

export type UnitFieldName = typeof UNIT_FIELDS[number]['field']

// Snap every unit to one the country actually offers, keeping the current unit when it is still
// valid. Derived from UNIT_FIELDS, so it cannot fall behind the option lists.
//
// This generalises what normalizeNgUnit did for natural gas alone. The old wizard block forced
// litres on every metric country instead, which happened to agree for the fuels it listed and was
// simply absent for the ones it did not — the stranding bug.
export function snapUnitsForCountry(
  country: string,
  current: Partial<Record<UnitFieldName, string | undefined>> = {},
): Record<UnitFieldName, string> {
  const out = {} as Record<UnitFieldName, string>
  for (const f of UNIT_FIELDS) {
    const opts = f.options(country).map(([v]) => v)
    const held = current[f.field]
    out[f.field] = held && opts.includes(held) ? held : opts[0]
  }
  return out
}

function validateElectricity(kwh: number): string | null {
  if (kwh > 0 && kwh < 1000) return "⚠ This seems low for a commercial location — please confirm this is the annual total, not a single month."
  if (kwh > 50000000) return "⚠ This is unusually high — please confirm the unit is kWh, not MWh."
  return null
}
function validateNaturalGas(amount: number, unit: string): string | null {
  if (amount > 0 && unit === "mcf" && amount < 10) return "⚠ This seems low — please confirm this is the annual total."
  if (unit === "mcf" && amount > 500000) return "⚠ This seems high — please double-check your bills."
  return null
}
function validateCompleteness(loc: Location): string[] {
  const warnings: string[] = []
  if (loc.electricity_kwh === 0) warnings.push("No electricity entered — most commercial locations use grid electricity.")
  return warnings
}

// Country-aware combustion factor selection.
// US -> EPA EF[key] (unchanged). CA -> ECCC EF_CA[key], with per-province NG CO2 override.
// GB/UK -> DEFRA EF_UK[key] (national). EU member -> IPCC EF_EU[key] (national Tier-1 defaults).
// Falls back to EF[key] if a country key is missing, so a location can never silently zero out.
// Build the propane/LPG EF key from the stored unit. NZ adds a per-kg path (propane_kg); all other
// jurisdictions use gallon/litre. Kept in one place so calc + workings + review stay in lock-step.
// ── Fuel oil and purchased steam: CONVERT-THEN-APPLY ────────────────────────────────────────────
// DELIBERATELY DIFFERENT from every other multi-unit fuel here. Natural gas and propane each carry a
// PUBLISHED EMISSION FACTOR PER UNIT (natural_gas_mcf / _therms / _m3 …, propane_gallon / _litre /
// _kg) and select between them. Fuel oil and steam instead convert the entered figure to the one
// unit that HAS a published factor, then apply it.
//
// WHY: the conversions below are EXACT BY DEFINITION — a US liquid gallon is 231 in³ and an inch is
// 25.4 mm, both exact; MMBtu uses the International Table Btu of exactly 1055.05585262 J. Neither
// depends on temperature or composition (unlike the propane density anchor, which carries its own
// "verify provenance" warning). Applying one is arithmetic on a published factor, not a new
// methodology claim. Sourcing per-unit factors instead would mean a litre figure and a GJ figure
// from EPA, ECCC, DEFRA and IPCC each — multiplying the citation surface in EF_SOURCES fourfold for
// no gain in fidelity. Both constants come from lib/unitConversions.ts, the repo's conversion
// authority, so nothing is inlined here.
//
// Each returns the note the workings row prints, so a verifier reads entered → conversion → factored
// rather than an unexplained number. No note when no conversion happened.
// Take (amount, unit) rather than the Location so the WORKINGS can convert the
// resolution-applied figure rather than the raw stored one — otherwise a coverage-estimated
// litres figure would be scaled and then converted from the wrong base.
export function fuelOilToGallons(amount: number, unit?: 'gallons' | 'litres'): { gallons: number; note?: string } {
  if ((unit ?? 'gallons') === 'gallons') return { gallons: amount }
  const gallons = amount / L_PER_GAL
  return { gallons, note: `${amount} litres ÷ ${L_PER_GAL} = ${gallons.toFixed(4)} US gallons (exact, NIST) — the published factor is per gallon` }
}

export function steamToMmbtu(amount: number, unit?: 'mmbtu' | 'gj'): { mmbtu: number; note?: string } {
  if ((unit ?? 'mmbtu') === 'mmbtu') return { mmbtu: amount }
  const mmbtu = amount / GJ_PER_MMBTU
  return { mmbtu, note: `${amount} GJ ÷ ${GJ_PER_MMBTU} = ${mmbtu.toFixed(4)} MMBtu (exact, International Table Btu) — the published factor is per MMBtu` }
}

const fuelOilInGallons = (loc: Location) => fuelOilToGallons(loc.fuel_oil_gallons, loc.fuel_oil_unit)
const steamInMmbtu = (loc: Location) => steamToMmbtu(loc.purchased_steam_mmbtu, loc.purchased_steam_unit)

function propaneEfKey(unit: string): 'propane_gallon' | 'propane_litre' | 'propane_kg' {
  return unit === 'gallons' ? 'propane_gallon' : unit === 'kg' ? 'propane_kg' : 'propane_litre'
}
// A complete published factor: the three gases calcGas needs to price an activity figure.
type CombustionEF = { co2: number; ch4: number; n2o: number }

// What pickEF returns when NEITHER the country's own table NOR the US fallback carries the key.
// It deliberately carries no gases — a blank must not be priced as zero — and instead records what
// was looked up, so calcGas can name the fuel, unit and country it refused rather than guess.
//
// ⚠️ THE SHAPE IS THE POINT. Before this existed, five of pickEF's six country branches spread a
// missing key (`{ ...undefined }` is legal JS and yields `{}`, so the figure silently became NaN)
// while the sixth returned the raw `undefined` and crashed on `ef.co2`. The same absent factor was
// a TypeError in the US and a silent NaN everywhere else, decided only by jurisdiction. Every
// branch now returns THIS, and calcGas refuses it identically.
interface MissingEF { co2?: undefined; ch4?: undefined; n2o?: undefined; __missing: { key: string; country: string } }

const efMiss = (key: string, country: string): CombustionEF =>
  ({ __missing: { key, country: country || '(unset)' } } as unknown as CombustionEF)

// The ONE resolution step every branch below shares: take the table hit if there is one, else the
// uniform miss. Scalar table entries (EF.ammonia, EF.steam_mmbtu) are not factors and count as a
// miss — spreading a number yields `{}`, which would otherwise read as a complete factor of zero.
const efOr = (base: unknown, key: string, ctry: string): CombustionEF =>
  base && typeof base === 'object' ? { ...(base as CombustionEF) } : efMiss(key, ctry)

// Thrown when an activity figure cannot be priced. Carries the fuel, unit and country as fields
// (not just prose) so a customer-facing message can be composed from it without re-parsing text.
export class MissingEmissionFactorError extends Error {
  readonly name = 'MissingEmissionFactorError'
  constructor(
    readonly fuel: string,
    readonly unit: string,
    readonly country: string,
    readonly factorKey: string,
  ) {
    super(`No published emission factor for ${fuel.replace(/_/g, ' ')} measured in ${unit} in ${country} (factor key "${factorKey}"). This figure cannot be priced.`)
  }
}

// Factor keys are `<fuel>_<unit>` and fuels themselves contain underscores (natural_gas_m3,
// diesel_mobile_litre, fuel_oil_gallon) — the unit is the segment after the LAST underscore.
function splitFactorKey(key: string): { fuel: string; unit: string } {
  const i = key.lastIndexOf('_')
  return i < 0 ? { fuel: key || '(unknown fuel)', unit: '(unknown unit)' } : { fuel: key.slice(0, i), unit: key.slice(i + 1) }
}

// The refusal. Asserts rather than returns a boolean so callers narrow without a cast.
function assertPriceable(ef: CombustionEF | MissingEF | null | undefined): asserts ef is CombustionEF {
  if (ef && typeof ef.co2 === 'number' && typeof ef.ch4 === 'number' && typeof ef.n2o === 'number') return
  const miss = (ef as MissingEF | null | undefined)?.__missing
  const { fuel, unit } = splitFactorKey(miss?.key ?? '')
  throw new MissingEmissionFactorError(fuel, unit, miss?.country ?? '(unknown country)', miss?.key ?? '(unknown key)')
}

function pickEF(loc: Location, key: keyof typeof EF | keyof typeof EF_CA | keyof typeof EF_UK | keyof typeof EF_EU | keyof typeof EF_AU | keyof (typeof EF_NZ)['commercial']): CombustionEF {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'GB' || ctry === 'UK') {
    return efOr((EF_UK as any)[key] ?? (EF as any)[key], String(key), ctry)
  }
  if (EU_COUNTRIES.includes(ctry)) {
    return efOr((EF_EU as any)[key] ?? (EF as any)[key], String(key), ctry)
  }
  // Australia: EF_AU per-unit table; missing keys (e.g. fuel oil) fall back to US EF (UK/EU parity).
  if (ctry === 'AU') {
    return efOr((EF_AU as any)[key] ?? (EF as any)[key], String(key), ctry)
  }
  // New Zealand: EF_NZ is use-class keyed (commercial default / industrial); missing keys fall back to US EF.
  if (ctry === 'NZ') {
    const nzTable = (EF_NZ as any)[loc.nz_use_class ?? 'commercial']
    return efOr(nzTable?.[key] ?? (EF as any)[key], String(key), ctry)
  }
  // US / default / any unlisted country. Structurally identical to the five above — it used to be
  // the odd one out, returning the raw table value, and that asymmetry WAS the crash.
  if (ctry !== 'CA') {
    return efOr((EF as any)[key], String(key), ctry)
  }
  const ef = efOr((EF_CA as any)[key] ?? (EF as any)[key], String(key), ctry)
  // Per-province natural gas CO2 override (CH4/N2O remain sector-based). Skipped on a miss — there
  // is no base factor to override, and stamping co2 onto a blank would manufacture a factor.
  if ((key === 'natural_gas_mcf' || key === 'natural_gas_m3') && typeof ef.co2 === 'number') {
    const prov = (loc.grid_region || loc.province || '').toUpperCase().trim()
    const provCo2M3 = EF_CA_NG_CO2_M3[prov]
    if (provCo2M3 !== undefined) {
      ef.co2 = key === 'natural_gas_mcf' ? provCo2M3 * M3_PER_MCF : provCo2M3
    }
  }
  return ef
}

// Source citation for an ELECTRICITY row, country-aware — the same shape as combustionSource below.
// It exists because the workings printed EF_SOURCES.electricity, the whole six-jurisdiction catalogue,
// on every grid row: a verifier could not tell which source had priced the line in front of them.
export function gridSource(loc: Location): string {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'CA') return EF_SOURCES.electricity_ca
  if (ctry === 'GB' || ctry === 'UK') return EF_SOURCES.electricity_uk
  if (ctry === 'AU') return EF_SOURCES.electricity_au
  if (ctry === 'NZ') return EF_SOURCES.electricity_nz
  if (EU_COUNTRIES.includes(ctry)) return EF_SOURCES.electricity_eu
  return EF_SOURCES.electricity_us
}

// Every DISTINCT electricity citation an inventory resolves to. Mirror of combustionSourcesFor, and
// it exists for the same reason one level along: the assurance PDF printed EF_SOURCES.electricity —
// the six-jurisdiction CATALOGUE — on its methodology page. That string is correct as a catalogue and
// wrong as an attribution: it names six publishers where one priced the rows. 06b6125 removed the
// same catalogue from the workings table; the methodology page kept it.
export function gridSourcesFor(locations: readonly { country?: string }[]): string[] {
  return [...new Set(locations.map(l => gridSource(l as Location)))]
}

// Source citation for a combustion row, country-aware (ECCC for CA, DEFRA for GB/UK, IPCC for EU, EPA otherwise).
function combustionSource(loc: Location): string {
  const ctry = (loc.country || '').toUpperCase().trim()
  if (ctry === 'CA') return EF_SOURCES.combustion_ca
  if (ctry === 'GB' || ctry === 'UK') return EF_SOURCES.combustion_uk
  if (ctry === 'AU') return EF_SOURCES.combustion_au
  if (ctry === 'NZ') return EF_SOURCES.combustion_nz
  if (EU_COUNTRIES.includes(ctry)) return EF_SOURCES.combustion_eu
  return EF_SOURCES.combustion
}

// Every DISTINCT combustion citation an inventory resolves to, in first-appearance order.
//
// ONE DERIVATION FOR EVERY EXPORT. The XLSX methods block computed this inline and the assurance PDF
// did not compute it at all — it printed EF_SOURCES.combustion, the US EPA constant, on every
// inventory. A Canadian inventory priced end-to-end by ECCC carried a methodology page citing US EPA:
// not a stale figure but a wrong attribution, on the document a verifier reads first.
//
// A SET, not a single string, because an inventory may span jurisdictions. Taking locations[0] would
// be right for most customers and silently wrong for the multi-country ones — the reading that looks
// fine until the case that matters.
export function combustionSourcesFor(locations: readonly { country?: string }[]): string[] {
  return [...new Set(locations.map(l => combustionSource(l as Location)))]
}

type GwpVersion = 'AR4' | 'AR5' | 'AR6'

// `ef` is typed as POSSIBLY missing on purpose: the guard below is the only thing standing between
// an unpriceable activity figure and a number, so the type must not assert the completeness the
// caller's `as keyof typeof EF` cast was pretending to guarantee. Refuse, never substitute — a zero
// here would export as an attested zero, which is a wrong figure rather than a visible failure.
function calcGas(ef: CombustionEF | MissingEF | null | undefined, amount: number, gwpVersion: GwpVersion, biogenic = false) {
  assertPriceable(ef)
  const gwp = GWP[gwpVersion]
  const ch4Gwp = biogenic ? gwp.CH4_biogenic : gwp.CH4_fossil
  return {
    co2: amount * ef.co2 / 1000,
    ch4: amount * ef.ch4 * ch4Gwp / 1000,
    n2o: amount * ef.n2o * gwp.N2O / 1000,
    total: amount * (ef.co2 + ef.ch4 * ch4Gwp + ef.n2o * gwp.N2O) / 1000,
  }
}

function calcLocation(loc: Location, gwpVersion: GwpVersion = 'AR6', year: number = 2024) {
  let s1_stationary = 0, s1_mobile = 0
  const gases = { co2: 0, ch4: 0, n2o: 0 }
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    const ef = pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF)
    const g = calcGas(ef, loc.natural_gas_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_propane && loc.propane_amount > 0) {
    const ef = pickEF(loc, propaneEfKey(loc.propane_unit) as keyof typeof EF)
    const g = calcGas(ef, loc.propane_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) {
    const ef = pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
    const g = calcGas(ef, loc.diesel_stationary_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) {
    const g = calcGas(pickEF(loc, 'fuel_oil_gallon'), fuelOilInGallons(loc).gallons, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_mobile) {
    if (loc.gasoline_amount > 0) {
      const ef = pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
      const g = calcGas(ef, loc.gasoline_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
    if (loc.diesel_mobile_amount > 0) {
      const ef = pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF)
      const g = calcGas(ef, loc.diesel_mobile_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
  }
  const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[gwpVersion] ?? 0
  const s1_fugitive = (!loc.uses_ammonia && loc.has_hfc_refrigerants) ? loc.refrigerant_purchased_kg * ref_gwp / 1000 : 0
  const s1_total = s1_stationary + s1_mobile + s1_fugitive
  // Grid-region gate: when the location's grid_region isn't a real GRID_EF key (us_average default,
  // '', unmapped country), OMIT the electricity Scope 2 entirely — no getGridFactor call, no electricity
  // contribution — exactly like an absent Scope 1 fuel. Steam (grid-independent) is unaffected.
  const gridResolved = isResolvedGridRegion(loc.grid_region)
  const grid_ef = gridResolved ? getGridFactor(loc.grid_region, year).ef : 0
  const steam_kg = loc.has_purchased_steam ? steamInMmbtu(loc).mmbtu * EF.steam_mmbtu : 0
  const s2_location = ((gridResolved ? loc.electricity_kwh * grid_ef : 0) + steam_kg) / 1000
  // Market-based: covered (contractual) kWh @ 0 (RECs/PPAs/green tariffs assumed zero-emission — documented);
  // uncovered kWh @ residual-mix factor. If no residual mix applies (full-disclosure region, or US subregion
  // not yet selected), fall back to the location grid factor for uncovered load and flag it.
  const uncovered_kwh = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
  const resRegion = residualRegionFor(loc)
  const res = getResidualFactor(resRegion, year, gwpVersion)
  const market_elec_ef = res.applicable ? res.ef : grid_ef
  const s2_market = ((gridResolved ? uncovered_kwh * market_elec_ef : 0) + steam_kg) / 1000
  // NZ transmission & distribution losses — Scope 3 Category 3, NOT Scope 2. Kept as a DISTINCT
  // term (s3_td) and deliberately never added into s2_location/s2_market. Opt-in per NZ location.
  const s3_td = (loc.country === 'NZ' && loc.nz_td_losses && loc.electricity_kwh > 0)
    ? loc.electricity_kwh * nzTdLoss(year).ef / 1000
    : 0
  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location, s2_market, s3_td, gases, biogenic: loc.biogenic_co2_mt }
}

// ── Unpriceable locations: ONE decision, four consumers ──────────────────────────────────────────
// A location is unpriceable when the factor tables carry nothing for the unit one of its fuels is
// recorded in (e.g. a US location holding a gas figure in m3). calcGas refuses it by name; this is
// the single place that decides what to DO about the refusal, so calcInventory, buildWorkings,
// pctEstimated and the component's banner cannot disagree about which locations are in the total.
//
// EXCLUDED WHOLE, NOT PER-FUEL. calcLocation totals a location's streams together, so pricing the
// rest and dropping the one that failed would put a knowingly-short figure into the total under
// that location's name — the same defect as counting it as zero, just harder to see. A location
// either contributes everything or nothing, and the exclusion is stated on screen and in the
// workings. Its electricity is excluded too; that is the cost of not publishing a partial figure.
//
// Only MissingEmissionFactorError is absorbed. Any other error still propagates — a bug in the
// arithmetic must not be silently converted into "this location is excluded".
function unpriceableReason(loc: Location, gwpVersion: GwpVersion, year: number): MissingEmissionFactorError | null {
  try { calcLocation(loc, gwpVersion, year); return null }
  catch (e) { if (e instanceof MissingEmissionFactorError) return e; throw e }
}

export interface UnpriceableLocation {
  locId: string
  locName: string
  fuel: string      // engine token, e.g. 'natural_gas' — the wording is the component's job
  unit: string      // e.g. 'm3'
  country: string   // e.g. 'US', or '(unset)' when the location has no country
}

// Pure probe, same shape as findUnresolvedCoverage / findUndeclaredStreams: a list of what is
// wrong, which the component turns into a per-location state, a note on every affected total,
// and an export gate.
export function findUnpriceableLocations(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024): UnpriceableLocation[] {
  const out: UnpriceableLocation[] = []
  for (const loc of locations) {
    const why = unpriceableReason(loc, gwpVersion, year)
    if (why) out.push({ locId: loc.id, locName: loc.name || 'Location', fuel: why.fuel, unit: why.unit, country: why.country })
  }
  return out
}

function calcInventory(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024) {
  return locations.reduce((acc, loc) => {
    // Excluded, never zeroed: a location that cannot be priced contributes nothing and is named on
    // screen. Adding 0 would assert it emits nothing, which is a figure we have no evidence for.
    if (unpriceableReason(loc, gwpVersion, year)) return acc
    const c = calcLocation(loc, gwpVersion, year)
    return {
      s1_total: acc.s1_total + c.s1_total,
      s2_location: acc.s2_location + c.s2_location,
      s2_market: acc.s2_market + c.s2_market,
      // s3_td is a DISTINCT Scope 3 (Cat 3) total — NZ electricity T&D losses. Accumulated here so the
      // line that renders in the workings/CSV is totalled SOMEWHERE. NEVER added into s1/s2 (E2 guards).
      s3_td: acc.s3_td + c.s3_td,
      co2: acc.co2 + c.gases.co2,
      ch4: acc.ch4 + c.gases.ch4,
      n2o: acc.n2o + c.gases.n2o,
      biogenic: acc.biogenic + c.biogenic,
    }
  }, { s1_total: 0, s2_location: 0, s2_market: 0, s3_td: 0, co2: 0, ch4: 0, n2o: 0, biogenic: 0 })
}

// tCO2e per fuelType for ONE location, keyed by the same fuelType strings a CoverageResolution
// carries ('natural_gas' | 'propane' | 'diesel' | 'gasoline' | 'electricity'). This is the per-fuel
// decomposition calcLocation deliberately lumps together (it sums s1_stationary/s1_mobile); pctEstimated
// needs the split to weight an extrapolation by the emissions it actually estimated. Same EFs, same
// grid gate, same GWP as calcLocation — so a fuel's share here reconciles with the inventory total.
// diesel (stationary AND mobile) both map to 'diesel', matching fieldFor's two diesel docTypes.
function fuelEmissionsByType(loc: Location, gwpVersion: GwpVersion, year: number): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (k: string, v: number) => { out[k] = (out[k] ?? 0) + v }
  if (loc.has_natural_gas && loc.natural_gas_amount > 0)
    add('natural_gas', calcGas(pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF), loc.natural_gas_amount, gwpVersion).total)
  if (loc.has_propane && loc.propane_amount > 0)
    add('propane', calcGas(pickEF(loc, propaneEfKey(loc.propane_unit) as keyof typeof EF), loc.propane_amount, gwpVersion).total)
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0)
    add('diesel', calcGas(pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), loc.diesel_stationary_amount, gwpVersion).total)
  if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0)
    add('fuel_oil', calcGas(pickEF(loc, 'fuel_oil_gallon'), fuelOilInGallons(loc).gallons, gwpVersion).total)
  if (loc.has_mobile) {
    if (loc.gasoline_amount > 0)
      add('gasoline', calcGas(pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), loc.gasoline_amount, gwpVersion).total)
    if (loc.diesel_mobile_amount > 0)
      add('diesel', calcGas(pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), loc.diesel_mobile_amount, gwpVersion).total)
  }
  // Electricity = Scope 2 location-based (the series' headline basis). Same grid gate as calcLocation:
  // an unresolved grid_region contributes 0 there, so it must contribute 0 here too.
  if (isResolvedGridRegion(loc.grid_region) && loc.electricity_kwh > 0)
    add('electricity', loc.electricity_kwh * getGridFactor(loc.grid_region, year).ef / 1000)
  return out
}

/**
 * Share of an inventory's Scope 1+2 tCO2e that is ESTIMATED rather than
 * evidenced, 0-100. Derived from coverage resolutions, weighted by emissions —
 * NOT by fuel count. A 91.7%-estimated gas figure on a location whose emissions
 * are 95% electricity is not a 91.7%-estimated inventory.
 *
 * Returns null when nothing is estimated AND nothing was concierge-read
 * (a wholly manual inventory has no evidence basis to measure against —
 * null is an absence, not zero).
 */
export function pctEstimated(
  locations: Location[],
  resolutions: CoverageResolution[],
  gwpVersion: GwpVersion,
  year: number
): number | null {
  // Only 'extrapolate' produces estimated emissions. A straddle 'next_year' EXCLUDES emissions
  // (not estimation); a straddle 'prorate' is a day-level allocation of REAL metered data (not
  // estimation); a 'duplicate' resolution drops a double-count (not estimation). None are counted.
  const extraps = resolutions.filter(r => r.kind === 'extrapolate' && !!r.monthsCovered && r.monthsCovered > 0)
  let estimated = 0
  for (const loc of locations) {
    // Excluded from the denominator by calcInventory below, so it must be excluded from the
    // numerator too — otherwise an unpriceable location's estimated share would be measured
    // against a total it is not part of.
    if (unpriceableReason(loc, gwpVersion, year)) continue
    const byFuel = fuelEmissionsByType(loc, gwpVersion, year)
    for (const r of extraps) {
      if (r.locId !== loc.id) continue
      const m = r.monthsCovered as number
      const estimatedFraction = Math.max(0, (12 - m) / 12) // e.g. 1/12 evidenced → 11/12 estimated
      estimated += (byFuel[r.fuelType] ?? 0) * estimatedFraction
    }
  }
  // A wholly manual inventory (no confirmed concierge proposal on any location) has no evidence
  // basis to measure "estimated share" against — null is an absence, not a 0% claim.
  const hasConciergeData = locations.some(loc =>
    (loc.source_docs ?? []).some(d => (d.extracted ?? []).some(p => p.status === 'confirmed' && p.value != null)))
  if (estimated <= 0 && !hasConciergeData) return null

  const inv = calcInventory(locations, gwpVersion, year)
  const total = inv.s1_total + inv.s2_location
  if (total <= 0) return 0 // concierge data present but zero emissions → 0% estimated, not an absence
  return (estimated / total) * 100
}

// Map a concierge (docType, fuelType) pair to its inventory field(s). Module-scoped so both the
// confirm path (updateProposal / addCoverageResolution) and buildWorkings share one join key.
function fieldFor(docType: string, fuelType: string): { amount: keyof Location; unit?: keyof Location } | null {
  if (docType === 'utility_electricity' && fuelType === 'electricity') return { amount: 'electricity_kwh' }
  if (docType === 'renewable_cert' && fuelType === 'electricity') return { amount: 'renewable_electricity_kwh' }
  if (docType === 'utility_bill_gas' && fuelType === 'natural_gas') return { amount: 'natural_gas_amount', unit: 'natural_gas_unit' }
  if (docType === 'fuel_propane' && fuelType === 'propane') return { amount: 'propane_amount', unit: 'propane_unit' }
  if (docType === 'fuel_diesel' && fuelType === 'diesel') return { amount: 'diesel_stationary_amount', unit: 'diesel_stationary_unit' }
  if (docType === 'fleet_fuel' && fuelType === 'diesel') return { amount: 'diesel_mobile_amount', unit: 'diesel_mobile_unit' }
  if (docType === 'fleet_fuel' && fuelType === 'gasoline') return { amount: 'gasoline_amount', unit: 'gasoline_unit' }
  return null
}

// Reverse of fieldFor at the docType level: the fuelType a document_type carries, when we cannot read
// it off a dated proposal (e.g. a 'none'-status strip with no usable dates). fleet_fuel carries TWO
// fuels → null here (3c gives it proper per-fuel handling); non-concierge docs → null.
function fuelTypeForDocType(docType: string): string | null {
  switch (docType) {
    case 'utility_electricity': return 'electricity'
    case 'renewable_cert': return 'electricity'
    case 'utility_bill_gas': return 'natural_gas'
    case 'fuel_propane': return 'propane'
    case 'fuel_diesel': return 'diesel'
    default: return null // fleet_fuel (two fuels — 3c), service_record, fuel_oil, purchased_steam
  }
}

// ── Resolution application — single source of truth for what a figure IS ──────
// The human-readable method/basis strings are composed HERE, once. Both the per-field
// adjustment (applyResolutions) and the coverage-resolution audit rows in buildWorkings
// read from these, so the claim on the figure and the claim in the audit trail cannot
// drift apart — the divergence they used to have IS the SEV 0 bug.
function resolutionMethod(r: CoverageResolution): string {
  return r.kind === 'extrapolate' ? `Extrapolation (×12/${r.monthsCovered}, ${r.pctEstimated}% estimated)`
    : r.kind === 'duplicate' ? 'Overlap confirmed (no double-count adjustment)'
    : r.kind === 'straddle' ? `Straddle — ${r.straddleChoice}${r.daysInYear != null && r.totalDays != null ? ` (${r.daysInYear}/${r.totalDays} days in year)` : ''}`
    : r.kind
}
function resolutionBasis(r: CoverageResolution): string {
  if (r.kind === 'extrapolate' && r.monthsCovered) {
    const mult = 12 / r.monthsCovered
    const multStr = Number.isInteger(mult) ? String(mult) : mult.toFixed(2)
    return `${r.monthsCovered} of 12 months from bills; grossed ×${multStr} for acknowledged coverage gap`
  }
  if (r.kind === 'straddle') {
    return r.daysInYear != null && r.totalDays != null
      ? `${r.daysInYear} of ${r.totalDays} days fall in the reporting year`
      : `boundary-straddling bill resolved by ${r.straddleChoice}`
  }
  if (r.kind === 'duplicate') return 'overlapping bills accepted as-is; no double-count adjustment applied'
  return r.note
}

/**
 * Single source of truth for what a location's activity figures ARE, given its
 * confirmed proposals and any coverage resolutions on file.
 * Pure. Called by the component's write path AND by buildWorkings — so the
 * figure in the total and the figure in the audit trail cannot diverge.
 */
export interface AppliedField {
  field: keyof Location
  unitField?: keyof Location
  rawSum: number          // sum of confirmed proposals, before any adjustment
  value: number           // the figure actually used
  unit?: string
  adjustment: null | {
    kind: 'extrapolate' | 'straddle' | 'duplicate'
    method: string        // human-readable, flows verbatim into workings
    basis: string         // e.g. "9 of 12 months; ×12/9" | "12 of 31 days in FY"
    factor: number        // multiplier applied to rawSum (1 = unchanged)
  }
  mixedUnits: boolean     // true → do not write; caller flags for manual review
  fuelTypes: string[]
  quotes: string[]
  docIds: string[]
  filePaths: string[]
  refs: { docId: string; pi: number }[]   // (docId, proposal index) feeding this field — for the write path's mixed-unit flip
}

export function applyResolutions(loc: Location, resolutions: CoverageResolution[], winStart: Date, winEnd: Date): Record<string, AppliedField> {
  const DAY = 86400000
  const winEexcl = new Date(winEnd.getFullYear(), winEnd.getMonth(), winEnd.getDate() + 1)
  const year = winEnd.getFullYear()
  // Does THIS proposal's canonical [start, exclusiveEnd(end)) interval straddle the window? Same
  // convention as analyzeCoverage's detector, so the strip, the figure and the audit trail agree.
  const proposalStraddles = (periodStart: string | null, periodEnd: string | null): boolean => {
    if (!periodStart || !periodEnd) return false
    const s = parseLocalDate(periodStart)
    const e = exclusiveEnd(parseLocalDate(periodEnd))
    const total = Math.round((e.getTime() - s.getTime()) / DAY)
    const ovS = s > winStart ? s : winStart
    const ovE = e < winEexcl ? e : winEexcl
    const inWin = Math.max(0, Math.round((ovE.getTime() - ovS.getTime()) / DAY))
    return inWin > 0 && inWin < total
  }

  // 1. Gather confirmed proposals per target field (via the shared fieldFor join key).
  type Acc = { field: keyof Location; unitField?: keyof Location; rawSum: number; units: Set<string>; fuelType: string; fuelTypes: Set<string>; quotes: string[]; docIds: string[]; filePaths: string[]; refs: { docId: string; pi: number }[]; props: { value: number; periodStart: string | null; periodEnd: string | null }[] }
  const acc: Record<string, Acc> = {}
  loc.source_docs.forEach(d => {
    d.extracted?.forEach((p, pi) => {
      if (p.status !== 'confirmed' || p.value == null) return
      const map = fieldFor(d.document_type, p.fuelType)
      if (!map) return
      const key = String(map.amount)
      if (!acc[key]) acc[key] = { field: map.amount, unitField: map.unit, rawSum: 0, units: new Set(), fuelType: p.fuelType, fuelTypes: new Set(), quotes: [], docIds: [], filePaths: [], refs: [], props: [] }
      acc[key].rawSum += p.value
      acc[key].props.push({ value: p.value, periodStart: p.periodStart, periodEnd: p.periodEnd })
      if (p.unit) acc[key].units.add(p.unit)
      acc[key].fuelTypes.add(p.fuelType)
      acc[key].refs.push({ docId: d.id, pi })
      // paths[] index-aligned with quotes[] (quote[i] ↔ source_file_paths[i] on the verifier row).
      if (p.sourceQuote) { acc[key].quotes.push(p.sourceQuote); acc[key].filePaths.push(d.file_path) }
      if (!acc[key].docIds.includes(d.id)) acc[key].docIds.push(d.id)
    })
  })
  // 2. Compute each field's figure + adjustment.
  const out: Record<string, AppliedField> = {}
  for (const [key, a] of Object.entries(acc)) {
    const mixedUnits = a.units.size > 1
    const unit = a.units.size === 1 ? [...a.units][0] : undefined
    const extr = resolutions.find(r => r.kind === 'extrapolate' && r.locId === loc.id && r.fuelType === a.fuelType && !!r.monthsCovered && r.monthsCovered > 0)
    const strad = resolutions.find(r => r.kind === 'straddle' && r.locId === loc.id && r.fuelType === a.fuelType)
    const dup = resolutions.find(r => r.kind === 'duplicate' && r.locId === loc.id && r.fuelType === a.fuelType)

    // STRADDLE scaling is PER-PROPOSAL — only the straddling bill(s) are scaled; the other bills for
    // this field are left untouched (scaling the whole sum would corrupt eleven correct bills).
    const straddleFactor =
      strad?.straddleChoice === 'next_year' ? 0
      : strad?.straddleChoice === 'this_year' ? 1
      : strad?.straddleChoice === 'prorate' ? (strad.totalDays ? (strad.daysInYear ?? 0) / strad.totalDays : 1)
      : 1
    const straddledSum = strad
      ? a.props.reduce((s, pr) => s + pr.value * (proposalStraddles(pr.periodStart, pr.periodEnd) ? straddleFactor : 1), 0)
      : a.rawSum
    // EXTRAPOLATION gross-up applies AFTER the per-proposal straddle scaling. ORDER MATTERS.
    const extrFactor = (extr && extr.monthsCovered) ? 12 / extr.monthsCovered : 1
    const value = mixedUnits ? a.rawSum : straddledSum * extrFactor

    let adjustment: AppliedField['adjustment'] = null
    if (extr || strad || dup) {
      // basis states the REAL arithmetic, in application order (straddle per-proposal, THEN extrapolate).
      const parts: string[] = []
      if (strad) {
        const tot = strad.totalDays ?? 0, din = strad.daysInYear ?? 0
        parts.push(
          strad.straddleChoice === 'next_year' ? `next_year: straddling bill excluded (0 of ${tot} days counted)`
          : strad.straddleChoice === 'this_year' ? `this_year: straddling bill counted in full (${tot} of ${tot} days)`
          : `prorate: ${din} of ${tot} days in FY${year}; straddling bill scaled ×${(tot ? din / tot : 1).toFixed(3)}`
        )
      }
      if (extr) parts.push(resolutionBasis(extr))
      if (dup && !strad && !extr) parts.push(resolutionBasis(dup))
      // primary drives kind + method: extrapolate (the gross-up) if present, else the straddle/duplicate.
      const primary = extr ?? strad ?? dup!
      adjustment = { kind: primary.kind, method: resolutionMethod(primary), basis: parts.join('; then '), factor: a.rawSum > 0 ? value / a.rawSum : 1 }
    }

    out[key] = { field: a.field, unitField: a.unitField, rawSum: a.rawSum, value, unit, adjustment, mixedUnits, fuelTypes: [...a.fuelTypes], quotes: a.quotes, docIds: a.docIds, filePaths: a.filePaths, refs: a.refs }
  }
  return out
}

// Provenance stamp attached to a workings row so the verifier can trace a figure back to its bills.
// concierge = read verbatim off confirmed bills; concierge-extrapolated = grossed up for a coverage
// gap (number is estimated, quotes are the underlying bills); manual = not concierge-read.
interface Provenance {
  source_quotes?: string[]
  source_doc_ids?: string[]
  source_file_paths?: string[]
  entry_method: 'manual' | 'concierge' | 'concierge-extrapolated'
  extrapolation_note?: string
}

function buildWorkings(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024, resolutions: CoverageResolution[] = [], fiscalYearEndMonth: number = 12) {
  const rows: any[] = []
  const win = periodFromYearAndEnd(year, fiscalYearEndMonth)
  // Screen abbreviations for the combined-factor display, matching what renderStep4 showed (gal / L);
  // every other unit (mcf, kg, therms, mmbtu…) passes through unchanged. emission_factor (the gas split)
  // is UNTOUCHED — the CSV / verifier path depends on it. emission_factor_display is display-only.
  const abbrevUnit = (u: string) => u === 'gallons' ? 'gal' : (u === 'litres' || u === 'liters') ? 'L' : u === 'm3' ? 'm³' : u
  // RECOMPUTABLE, NOT TIDY — and this is the whole point of a workings table. toFixed(3) printed a
  // factor of 1.9316576 as "1.932", so a verifier retyping the row got 231,840 kg where we stated
  // 231,798.9: a 41 kg divergence on one line, and EVERY priced row failed the same way. A workings
  // table a verifier cannot reproduce is not evidence, it is decoration.
  // toPrecision(10) strips float artefacts (1.9316576000000002); String() then emits the shortest
  // form that round-trips, so the displayed factor multiplies back to the displayed result.
  const efDisplay = (x: number) => String(Number(x.toPrecision(10)))
  // `convNote` records a convert-then-apply step (fuel oil in litres, steam in GJ) so the workings
  // show entered → conversion → factored rather than a number the reviewer cannot reproduce.
  // `stream` TAGS THE ROW WITH THE DECLARABLE STREAM IT SATISFIES, and that tag is what the
  // declaration loop below counts. It is not decoration: it is how "this stream produced a priced row"
  // becomes an OBSERVED FACT rather than a second copy of the pricing condition. See the loop's header.
  const pushFuel = (loc: Location, stream: DeclarableStream, source: string, scope: number, activity: number, unit: string, ef: { co2: number; ch4: number; n2o: number }, prov?: Provenance, convNote?: string) => {
    const g = calcGas(ef, activity, gwpVersion)
    const gwp = GWP[gwpVersion]
    const efCo2e = ef.co2 + ef.ch4 * gwp.CH4_fossil + ef.n2o * gwp.N2O
    // ── IS THIS FACTOR A COMBINED CO2e FIGURE, OR A GAS SPLIT? ─────────────────────────────────
    // DEFRA, DCCEEW and MfE publish one kgCO2e per unit with their OWN GWP set already applied, so
    // EF_UK / EF_AU / EF_NZ store that figure in `co2` with ch4 and n2o at 0. The row nonetheless
    // stamped gwp_basis: gwpVersion, so an AU diesel line read "AR6" on a number DCCEEW combined on
    // AR5 — and which does not move when the toggle does. Probed: 2.71 at AR4, AR5 and AR6 alike.
    //
    // DETECTED FROM THE FACTOR, NEVER FROM A COUNTRY LIST. `['GB','AU','NZ']` would be correct today
    // and silently wrong the day a fourth table converts to combined storage, or one of these three
    // gains a gas split — the list and the tables would drift with nothing to notice. Reading
    // ch4 === 0 && n2o === 0 asks the factor that is being applied, at the moment it is applied, so
    // it cannot disagree with the table it came from: convert EF_CA to combined storage and its rows
    // start stamping as-published on their own; give EF_UK a real split and its rows start stamping
    // the live set. Verified to separate the seven tables with no mixed case (see engine.test.ts X4,
    // which fails if any table stops being uniform).
    //   The zero is not "this fuel emits no methane" — it is "the publisher already counted it", and
    // the emission_factor cell now says so rather than printing CH4 0, N2O 0 as though measured.
    const combinedCo2e = ef.ch4 === 0 && ef.n2o === 0
    rows.push({ location: loc.name || 'Location', stream, source, scope, activity_data: activity, activity_unit: unit,
      emission_factor: combinedCo2e
        ? `CO₂e ${ef.co2} kg/${unit} — CH₄/N₂O included`
        : `CO2 ${ef.co2}, CH4 ${ef.ch4}, N2O ${ef.n2o} kg/${unit}`,
      emission_factor_display: `${efDisplay(efCo2e)} kg CO₂e/${abbrevUnit(unit)}`, ef_source: combustionSource(loc), gwp_basis: combinedCo2e ? GWP_AS_PUBLISHED : gwpVersion, result_tco2e: g.total, ...(convNote ? { note: convNote } : {}), ...(prov ?? {}) })
  }
  for (const loc of locations) {
    // Decided BEFORE any row is emitted, and with the same helper calcInventory uses. A location
    // the total excluded must not also appear here with priced rows — the audit trail would then
    // show workings for emissions no total contains. One row stating the exclusion instead, with
    // result_tco2e null, following the 'undeclared' row below: an absence never renders as 0.
    const blocked = unpriceableReason(loc, gwpVersion, year)
    if (blocked) {
      rows.push({ location: loc.name || 'Location', source: 'All streams at this location', scope: 0,
        activity_data: 0, activity_unit: '—', emission_factor: '—', emission_factor_display: '—',
        ef_source: '—', gwp_basis: 'excluded', result_tco2e: null, declaration: 'unpriceable',
        entry_method: 'excluded', unpriceable: { fuel: blocked.fuel, unit: blocked.unit, country: blocked.country },
        note: `EXCLUDED FROM TOTALS — ${blocked.message} No figure for this location is included in any total on this report.` })
      continue
    }
    // First row index for THIS location. The declaration loop at the end of the iteration reads back
    // rows.slice(locRowStart) to see which streams actually priced. Captured after the unpriceable
    // `continue` above, so an excluded location keeps its single exclusion row and gains no others.
    const locRowStart = rows.length
    // applyResolutions is the single source of the figure AND its provenance/method, so the number
    // in the row and the claim in the audit trail cannot diverge (that divergence was the SEV 0 bug).
    const applied = applyResolutions(loc, resolutions, win.start, win.end)
    // Figure for a field: the resolution-applied value when the field is concierge-derived; otherwise
    // the location's own value (manual entry, or a mixed-unit field the write path deliberately skipped).
    const figure = (field: keyof Location): number => {
      const a = applied[String(field)]
      return a && !a.mixedUnits ? a.value : (loc as any)[field] as number
    }
    // Provenance stamp from the applied field. No quotes → honest 'manual'. An adjustment on file
    // (extrapolate/straddle/duplicate) with quotes → 'concierge-extrapolated' + the method/basis note.
    const provOf = (field: keyof Location): Provenance => {
      const a = applied[String(field)]
      const quotes = a?.quotes ?? []
      if (!quotes.length) return { entry_method: 'manual' }
      if (a && a.adjustment) {
        return { source_quotes: quotes, source_doc_ids: a.docIds, source_file_paths: a.filePaths,
          entry_method: 'concierge-extrapolated', extrapolation_note: `${a.adjustment.method} — ${a.adjustment.basis}` }
      }
      return { source_quotes: quotes, source_doc_ids: a!.docIds, source_file_paths: a!.filePaths, entry_method: 'concierge' }
    }
    if (loc.has_natural_gas && loc.natural_gas_amount > 0) pushFuel(loc, 'natural_gas', 'Natural gas', 1, figure('natural_gas_amount'), loc.natural_gas_unit, pickEF(loc, `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF), provOf('natural_gas_amount'))
    if (loc.has_propane && loc.propane_amount > 0) pushFuel(loc, 'propane', 'Propane', 1, figure('propane_amount'), loc.propane_unit, pickEF(loc, propaneEfKey(loc.propane_unit) as keyof typeof EF), provOf('propane_amount'))
    if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) pushFuel(loc, 'diesel_stationary', 'Diesel (stationary)', 1, figure('diesel_stationary_amount'), loc.diesel_stationary_unit, pickEF(loc, `diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('diesel_stationary_amount'))
    // Reports the figure AS ENTERED with its own unit, and the conversion as the note — the factored
    // gallons figure is inside the note, so all three steps are on one row.
    if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) {
      // Convert AFTER applying resolutions, then hand pushFuel the gallons figure — the factor is
      // published per gallon, so the activity it multiplies must be gallons or the row would state a
      // result the engine did not compute. The note carries the entered figure and the arithmetic.
      const fo = fuelOilToGallons(figure('fuel_oil_gallons'), loc.fuel_oil_unit)
      pushFuel(loc, 'fuel_oil', 'Fuel oil', 1, fo.gallons, 'gallons', pickEF(loc, 'fuel_oil_gallon'), provOf('fuel_oil_gallons'), fo.note)
    }
    if (loc.has_mobile && loc.gasoline_amount > 0) pushFuel(loc, 'mobile', 'Gasoline (mobile)', 1, figure('gasoline_amount'), loc.gasoline_unit, pickEF(loc, `gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('gasoline_amount'))
    if (loc.has_mobile && loc.diesel_mobile_amount > 0) pushFuel(loc, 'mobile', 'Diesel (mobile)', 1, figure('diesel_mobile_amount'), loc.diesel_mobile_unit, pickEF(loc, `diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF), provOf('diesel_mobile_amount'))
    if (!loc.uses_ammonia && loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0) {
      const ref_gwp = REFRIGERANT_GWP[loc.refrigerant_type]?.[gwpVersion] ?? 0
      rows.push({ location: loc.name || 'Location', stream: 'refrigerants', source: `Refrigerant (${loc.refrigerant_type})`, scope: 1, activity_data: loc.refrigerant_purchased_kg, activity_unit: 'kg', emission_factor: `GWP₁₀₀ ${ref_gwp}`, ef_source: EF_SOURCES[`gwp_${gwpVersion.toLowerCase()}` as 'gwp_ar6'], gwp_basis: gwpVersion, quantification_method: 'Recharge quantity treated as emitted (IPCC Tier 1 simplified material balance)', result_tco2e: loc.refrigerant_purchased_kg * ref_gwp / 1000, entry_method: 'manual' })
    }
    // Grid-region gate: unresolved grid_region → OMIT the electricity Scope 2 rows entirely (no
    // getGridFactor call, no US_AVG row). NZ (T&D row below) is always resolved, so no real T&D is lost.
    if (loc.electricity_kwh > 0 && isResolvedGridRegion(loc.grid_region)) {
      const gf = getGridFactor(loc.grid_region, year)
      // ONE note, appended wherever the grid factor priced the row. factor_vintage below is UNCHANGED —
      // it was already the factor's own year; the note is what turns a year into a disclosure.
      const gridNote = gf.note ? ` · ${gf.note}` : ''
      rows.push({ location: loc.name || 'Location', stream: 'electricity', source: `Electricity (${gf.usedRegion})`, scope: 2, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${efDisplay(gf.ef)} kg CO₂e/kWh`, ef_source: `${gridSource(loc)}${gridNote}`, factor_vintage: String(gf.usedYear), scope2_method: 'location-based', gwp_basis: GWP_AS_PUBLISHED, result_tco2e: loc.electricity_kwh * gf.ef / 1000, ...provOf('electricity_kwh') })
      // Market-based Scope 2: residual-mix factor on uncovered load, with provenance stamped for the verifier.
      const resRegion = residualRegionFor(loc)
      const res = getResidualFactor(resRegion, year, gwpVersion)
      const uncovered = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
      const mktEf = res.applicable ? res.ef : gf.ef
      // ⚠️ THE ROW MUST CITE WHAT PRICED IT. When no residual mix applies, mktEf IS gf.ef — the location
      // grid factor — yet the row cited Green-e (or AIB) and stamped NO vintage at all, because res.vintage
      // is 'n/a' on that path. So a US site with no eGRID subregion selected showed a 2023 grid factor
      // under a Green-e citation with an empty vintage column: both structured fields a verifier reads
      // pointed away from the number in front of them. The prose note said "falls back to location
      // factor", which is the only reason this was recoverable at all.
      //   applicable === true is UNTOUCHED: res.ef priced it, so res.source and res.vintage are correct.
      const mktApplied = res.applicable
        ? { src: res.source, vintage: res.vintage && res.vintage !== 'n/a' ? { factor_vintage: res.vintage } : {}, gridNote: '' }
        // gridNote rides along ONLY here. On the applicable path the grid factor did not price this row,
        // so a note about the grid vintage would describe a factor the row never used — a new falsehood
        // in place of the one being removed. "Both rows disclose" holds exactly when both are priced by
        // the same factor, which is this branch.
        : { src: gridSource(loc), vintage: { factor_vintage: String(gf.usedYear) }, gridNote }
      // Market-based row is a derived (uncovered = grid − renewable) figure, not a verbatim bill read → manual.
      rows.push({ location: loc.name || 'Location', stream: 'electricity', source: `Electricity (S2 market-based${res.applicable ? `, residual mix ${res.usedRegion}` : ', location-factor fallback'})`, scope: 2, activity_data: uncovered, activity_unit: 'kWh uncovered', emission_factor: `${efDisplay(mktEf)} kg CO₂e/kWh`, ef_source: `${mktApplied.src}${res.note ? ` · ${res.note}` : ''}${mktApplied.gridNote}`, ...mktApplied.vintage, scope2_method: 'market-based', gwp_basis: res.applicable && res.source !== EF_SOURCES.residual_eu ? gwpVersion : GWP_AS_PUBLISHED, result_tco2e: uncovered * mktEf / 1000, entry_method: 'manual' })
      // NZ T&D losses — Scope 3 Category 3, NOT Scope 2. Distinct row (scope 3) so it never reads as
      // part of the S2 figure; opt-in per NZ location. Kept in lock-step with calcLocation via nzTdLoss.
      if (loc.country === 'NZ' && loc.nz_td_losses) {
        const td = nzTdLoss(year)
        rows.push({ location: loc.name || 'Location', stream: 'electricity', source: 'Electricity T&D losses (NZ) — Scope 3 Cat 3', scope: 3, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${efDisplay(td.ef)} kg CO₂e/kWh`, ef_source: `${EF_SOURCES.electricity_nz} · T&D losses (Scope 3 Cat 3)${td.note ? ` · ${td.note}` : ''}`, factor_vintage: td.vintage, gwp_basis: 'scope3-cat3', result_tco2e: loc.electricity_kwh * td.ef / 1000, entry_method: 'manual' })
      }
    }
    if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
      // Same rule as fuel oil: the factor is published per MMBtu, so the activity it multiplies must
      // be MMBtu. The note carries the entered GJ figure and the arithmetic.
      const st = steamToMmbtu(loc.purchased_steam_mmbtu, loc.purchased_steam_unit)
      rows.push({ location: loc.name || 'Location', stream: 'purchased_steam', source: 'Purchased steam', scope: 2, activity_data: st.mmbtu, activity_unit: 'mmbtu', emission_factor: `${efDisplay(EF.steam_mmbtu)} kg CO₂e/mmbtu`, ef_source: EF_SOURCES.combustion, scope2_method: 'location-based', gwp_basis: GWP_AS_PUBLISHED, result_tco2e: st.mmbtu * EF.steam_mmbtu / 1000, entry_method: 'manual', ...(st.note ? { note: st.note } : {}) })
    }
    // ── Declaration rows: EVERY stream gets a row, so no stream can ever be silent ────────────────
    //
    // ⚠️ THE TRIGGER IS AN OBSERVED FACT, NOT A SECOND COPY OF THE PRICING CONDITION. This loop used to
    // ask `streamHasData(loc, s)` — a predicate that had to stay in agreement with ten separate
    // `flag && amount > 0` conditions above, and did not. A location with has_diesel_stationary true
    // and no amount entered failed the pricing condition (no priced row) AND passed streamHasData (no
    // declaration row), so the stream vanished from the workings entirely: not priced, not declared,
    // nothing. The same hole existed for natural gas, propane, fuel oil, mobile and refrigerants — and
    // for ammonia, which is deliberately never priced (no GWP) and therefore always fell through.
    //
    // Now the loop reads which streams ACTUALLY emitted a row, from the rows themselves. The two can no
    // longer disagree, because there is nothing left to disagree with: if a stream priced, its tag is
    // present; if it did not, a declaration row follows. Adding or removing a priced row keeps this
    // correct with no second edit. A forgotten `stream` tag produces a SPURIOUS declaration row beside
    // a priced one — visible and loud — rather than silence, which is the right way to fail.
    const emitted = new Set<DeclarableStream>(rows.slice(locRowStart).map(r => r.stream).filter(Boolean))
    const attestedAt = new Map((loc.stream_attestations ?? []).map(a => [a.stream, a.attested_at]))
    for (const s of DECLARABLE_STREAMS) {
      if (emitted.has(s)) continue
      const meta = STREAM_META[s]
      const at = attestedAt.get(s)
      const base = { location: loc.name || 'Location', stream: s, source: meta.name, scope: meta.scope,
        activity_data: 0, activity_unit: '—', emission_factor: '—', emission_factor_display: '—',
        ef_source: '—', gwp_basis: 'declaration' }
      // DECLARED-BUT-UNQUANTIFIED IS CHECKED BEFORE THE ATTESTATION, and the order is the point. If a
      // location both says it uses a stream and attests the stream is absent, those two answers
      // contradict each other, and the row must show the one a verifier needs to resolve. "We use gas
      // here, and no figure for it is in the report" is the finding; "no gas here" would bury it.
      if (streamDeclared(loc, s)) {
        rows.push({ ...base, result_tco2e: null, declaration: 'declared_unquantified', entry_method: 'declared-unquantified',
          note: `DECLARED, NOT QUANTIFIED — this location ${meta.verb === 'use' ? 'uses' : 'has'} ${meta.name}, and no amount for it has been priced. Nothing from this stream is included in any total on this report.` })
        continue
      }
      // attested_absent: result 0 is a CLAIM of no emissions, made by a named party at a stated time.
      // undeclared: result null is an ABSENCE of any claim — it must never render as a figure.
      rows.push(at
        ? { ...base, result_tco2e: 0, declaration: 'attested_absent', entry_method: 'attestation', note: `No ${meta.name} at this location. Attested ${at}.` }
        : { ...base, result_tco2e: null, declaration: 'undeclared', entry_method: 'undeclared', note: 'NOT DECLARED — completeness cannot be asserted for this stream.' })
    }
  }
  // ── Coverage-resolution audit trail ──────────────────────────────────────
  // Every gap/overlap/straddle the user resolved is recorded here so a verifier
  // sees the method and basis behind any estimated or adjusted figure. Spec: line 462.
  for (const r of resolutions) {
    // Method string comes from the SAME resolutionMethod() that fills AppliedField.adjustment.method,
    // so the audit row and the figure's provenance stamp can never claim different things.
    rows.push({
      location: '—',
      source: `Coverage resolution: ${r.fuelType || 'fuel'}`,
      scope: 0,
      activity_data: null,
      activity_unit: r.kind,
      emission_factor: resolutionMethod(r),
      ef_source: r.note,
      gwp_basis: 'coverage_resolution',
      result_tco2e: null,
      resolved_at: r.acknowledgedAt,
    })
  }
  // Rows with no gas split (electricity, refrigerant, steam, market-based, T&D, coverage resolutions)
  // have no combined-factor form — their emission_factor IS already the display string. Declaration
  // rows set their own '—'. Fill the rest so every row carries a display field for the workings table.
  for (const r of rows) if (r.emission_factor_display === undefined) r.emission_factor_display = r.emission_factor
  return rows
}

// Coverage gate (step 9b). Per location × (document_type, fuelType), run analyzeCoverage and flag any
// gap/overlap/straddle lacking a matching resolution, AND any 'none' (docs uploaded but no dated
// confirmed bills). Pure.
// Phase 3c: keyed on (docType, FUELTYPE), not docType. A fleet_fuel doc carries BOTH gasoline and diesel
// from the SAME bills; the old per-docType grouping picked ONE fuel as the strip and let a resolution on
// it clear the gate for the other — silent partial extrapolation (the C1 bug). Each fuel is now its own
// group, requiring its own resolution. And the gate iterates cov.ISSUES (all conditions), not the scalar
// status, so a gap masked by an overlap can't slip through (the D1 bug).
export function findUnresolvedCoverage(
  locations: Location[],
  reportingYear: number,
  fiscalYearEndMonth: number,
  resolutions: CoverageResolution[]
): { locId: string; fuelType: string; status: string }[] {
  const coverageWin = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
  const KIND_FOR: Record<'gap' | 'overlap' | 'straddle', CoverageResolution['kind']> =
    { gap: 'extrapolate', overlap: 'duplicate', straddle: 'straddle' }
  return locations.flatMap(loc => {
    // Group confirmed DATED proposals by (docType, fuelType). Each group is its own coverage unit.
    const groups = new Map<string, { fuelType: string; periods: CoveragePeriod[] }>()
    // A doc whose confirmed proposals carry NO usable dates yields a 'none' (must date the bills — no
    // resolution can clear it). Label with the doc's known fuel if any, else the docType's canonical fuel;
    // fleet_fuel (two fuels) can't be labelled from nothing → fuelType '' (one 'none' row per such doc).
    const noneFuels: string[] = []
    loc.source_docs.forEach(d => {
      const confirmed = (d.extracted ?? []).filter(p => p.status === 'confirmed')
      const dated = confirmed.filter(p => p.periodStart && p.periodEnd)
      dated.forEach(p => {
        const key = `${d.document_type}|${p.fuelType}`
        const g = groups.get(key) ?? { fuelType: p.fuelType, periods: [] }
        g.periods.push({ docId: d.id, pi: 0, start: parseLocalDate(p.periodStart as string), end: parseLocalDate(p.periodEnd as string) })
        groups.set(key, g)
      })
      if (dated.length === 0 && confirmed.length > 0) {
        // Confirmed but undated → 'none'. Label from the confirmed proposal's fuel, else the docType's.
        noneFuels.push(confirmed.find(p => p.fuelType)?.fuelType ?? fuelTypeForDocType(d.document_type) ?? '')
      } else if ((d.extracted?.length ?? 0) === 0) {
        // No extracted proposals at all — can't read a fuel. One 'none' row; fleet_fuel → '' (don't invent).
        noneFuels.push(fuelTypeForDocType(d.document_type) ?? '')
      }
    })

    const out: { locId: string; fuelType: string; status: string }[] = []
    noneFuels.forEach(fuelType => out.push({ locId: loc.id, fuelType, status: 'none' }))
    for (const [, g] of groups) {
      const cov = analyzeCoverage(g.periods, coverageWin.start, coverageWin.end)
      const hasRes = (kind: CoverageResolution['kind']) =>
        resolutions.some(r => r.kind === kind && r.locId === loc.id && r.fuelType === g.fuelType)
      // Require a resolution for EVERY issue present. Any unresolved issue blocks; report them together.
      const unresolvedIssues = cov.issues.filter(iss => !hasRes(KIND_FOR[iss]))
      if (unresolvedIssues.length > 0) out.push({ locId: loc.id, fuelType: g.fuelType, status: unresolvedIssues.join('+') })
    }
    return out
  })
}

// ── Undeclared streams (completeness gate) ────────────────────────────────────
// Same pattern as the grid-region gate (isResolvedGridRegion / gridReady): a `has_*` flag of false is
// BOTH the init default AND "no such supply" — one field, two meanings. A stream is DECLARED only when
// it has data OR carries an explicit attestation; otherwise it is UNDECLARED and blocks export.
export const DECLARABLE_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil',
  'mobile', 'refrigerants', 'electricity', 'purchased_steam',
] as const
export type DeclarableStream = typeof DECLARABLE_STREAMS[number]

export interface StreamAttestation {
  stream: DeclarableStream
  attested_at: string      // ISO
}

// ONE canonical name per stream — the single source the QuestionCard question, the absence
// attestation, and the workings declaration row all derive from, so the thing a user is ASKED and the
// thing they ATTEST (a timestamped legal assertion in the assurance package) are word-for-word the same.
// `verb` selects "use" vs "have" for the question. Same pattern as applyResolutions: define once,
// consume in three places, they cannot drift.
export const STREAM_META: Record<DeclarableStream, { name: string; verb: 'use' | 'have'; scope: number }> = {
  natural_gas:       { name: 'natural gas',                          verb: 'use',  scope: 1 },
  propane:           { name: 'propane / LPG',                        verb: 'use',  scope: 1 },
  diesel_stationary: { name: 'diesel in stationary equipment',       verb: 'use',  scope: 1 },
  fuel_oil:          { name: 'fuel oil',                             verb: 'use',  scope: 1 },
  mobile:            { name: 'company vehicles or mobile equipment', verb: 'have', scope: 1 },
  refrigerants:      { name: 'refrigeration or cooling',             verb: 'have', scope: 1 },
  electricity:       { name: 'purchased electricity',               verb: 'use',  scope: 2 },
  purchased_steam:   { name: 'purchased steam or district heating',  verb: 'use',  scope: 2 },
}

// ── ONE CONVENTION, ALL EIGHT STREAMS ────────────────────────────────────────────────────────────
//
// `streamHasData` answered ONE question — "is there data?" — for a situation with THREE answers, and
// answered it a different way per stream: natural gas, propane, diesel, fuel oil and mobile read the
// `has_*` flag; electricity and purchased steam read an amount; refrigerants OR'd two flags. So the
// same customer action produced different outcomes depending on which convention that stream happened
// to be written under — a checked steam box with no figure was reported as undeclared, while a checked
// diesel box with no figure was reported as nothing at all.
//
// THE CONVENTION, applied to every stream: TWO INDEPENDENT SIGNALS, NEVER ONE FIELD ANSWERING BOTH.
//   DECLARATION — the customer's own yes/no answer to "do you use this here?".
//   QUANTITY    — a positive amount on the field(s) the stream is priced from.
// Chosen this way round because the two questions are genuinely different and the wizard asks them
// separately: the checkbox says the stream EXISTS, the number says HOW MUCH. Collapsing them is what
// made "we use diesel here" and "we have never been asked about diesel" indistinguishable.
//
// ⚠️ ELECTRICITY IS THE ONE STREAM WITH NO CHECKBOX — the wizard offers a bare kWh field, so there is
// no yes/no answer to read and the quantity is the only signal that exists. Its declared-unquantified
// state is therefore UNREACHABLE from the wizard, and that is a property of the input, not an
// exception to the convention. If an electricity checkbox is ever added, delete this note and let
// streamDeclared read it; nothing else here changes.
export type StreamState = 'undeclared' | 'declared_unquantified' | 'quantified'

// SIGNAL 1 — the customer said this stream exists here.
function streamDeclared(loc: Location, s: DeclarableStream): boolean {
  switch (s) {
    case 'natural_gas': return loc.has_natural_gas
    case 'propane': return loc.has_propane
    case 'diesel_stationary': return loc.has_diesel_stationary
    case 'fuel_oil': return loc.has_fuel_oil
    case 'mobile': return loc.has_mobile
    // Either refrigerant answer declares the stream. Ammonia is deliberately never PRICED (NH₃ has no
    // global warming potential), which is exactly why it needs to be declarable — before this change an
    // ammonia site with a recharge figure produced no row of any kind.
    case 'refrigerants': return loc.has_hfc_refrigerants || loc.uses_ammonia
    // has_purchased_steam EXISTED and was ignored here; that was the steam half of the inconsistency.
    case 'purchased_steam': return loc.has_purchased_steam
    case 'electricity': return loc.electricity_kwh > 0   // no checkbox — see the note above
  }
}

// SIGNAL 2 — a figure was supplied. Mobile carries two fuels and either one quantifies the stream.
function streamQuantified(loc: Location, s: DeclarableStream): boolean {
  switch (s) {
    case 'natural_gas': return loc.natural_gas_amount > 0
    case 'propane': return loc.propane_amount > 0
    case 'diesel_stationary': return loc.diesel_stationary_amount > 0
    case 'fuel_oil': return loc.fuel_oil_gallons > 0
    case 'mobile': return loc.gasoline_amount > 0 || loc.diesel_mobile_amount > 0
    case 'refrigerants': return loc.refrigerant_purchased_kg > 0
    case 'purchased_steam': return loc.purchased_steam_mmbtu > 0
    case 'electricity': return loc.electricity_kwh > 0
  }
}

// The three states, from the location alone. buildWorkings does NOT use this to decide whether to emit
// a declaration row — it counts the rows it actually produced, which is stronger. This is for callers
// that hold a Location and no workings (the export gate), and for tests.
export function streamState(loc: Location, s: DeclarableStream): StreamState {
  if (!streamDeclared(loc, s)) return 'undeclared'
  return streamQuantified(loc, s) ? 'quantified' : 'declared_unquantified'
}

// ⚠️ THIS GATE NOW BLOCKS ON declared_unquantified TOO, AND THAT IS A TIGHTENING — read before changing.
// It blocks export unless every stream is either quantified or attested absent. Before this change a
// location with has_diesel_stationary true and no amount entered PASSED: streamHasData read the bare
// flag, called it data, and let an inventory export while silently omitting a stream the customer had
// said they have. That is precisely what the gate exists to prevent, so the state now blocks.
// No case is loosened — every outcome either stays as it was or moves from pass to block.
// `state` is returned so a caller can tell the two blocking reasons apart: "nobody answered" needs the
// question asked, "answered yes, no figure" needs a number. The wizard's copy does not yet distinguish
// them and tells the customer to enter the data or attest absent, which is right for both.
export function findUndeclaredStreams(
  locations: Location[]
): { locId: string; locName: string; stream: DeclarableStream; state: StreamState }[] {
  return locations.flatMap(loc => {
    const attested = new Set((loc.stream_attestations ?? []).map(a => a.stream))
    return DECLARABLE_STREAMS
      .map(stream => ({ stream, state: streamState(loc, stream) }))
      // An attestation answers 'undeclared' — nobody had been asked, now someone has. It does NOT
      // answer 'declared_unquantified': a site cannot attest a stream absent and also report using it.
      .filter(({ stream, state }) => state !== 'quantified' && !(state === 'undeclared' && attested.has(stream)))
      .map(({ stream, state }) => ({ locId: loc.id, locName: loc.name || 'Location', stream, state }))
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API. Declarations above are kept in their original (verbatim) order;
// exports are collected here so the move stays byte-for-byte auditable.
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Constants / tables
  GWP, REFRIGERANT_GWP, EF, EF_CA, EF_CA_NG_CO2_M3, M3_PER_MCF,
  EF_UK, EF_EU, EF_AU, EF_NZ, EF_SOURCES, GRID_EF, NZ_TD_LOSS,
  RESIDUAL_EU, RESIDUAL_US,
  CA_PROVINCES, US_STATES, US_SUBREGIONS, AU_STATES,
  EU_COUNTRIES, EU_COUNTRY_OPTIONS,
  GRID_REGIONS_CA, GRID_REGIONS_US, FRAMEWORKS,
  // Functions
  nzTdLoss, isResolvedGridRegion, getGridFactor, getResidualFactor,
  detectGridRegion, gridRegionForCountry, propaneEfKey, pickEF,
  combustionSource, calcGas, calcLocation, calcInventory, fieldFor,
  buildWorkings, emptyLocation,
  ngUnitOptions, normalizeNgUnit, liquidUnitOptions, propaneUnitOptions, steamUnitOptions,
  validateElectricity, validateNaturalGas, validateCompleteness,
  parseLocalDate, periodFromYearAndEnd, monthKey, monthLabel,
  daysBetween, exclusiveEnd, analyzeCoverage,
}
export type {
  CombustionEF,
  GwpVersion, ResidualGas, Location, Inventory, SourceDoc,
  ExtractedProposal, ConciergeStatus, CoveragePeriod, CoverageResult,
  CoverageResolution, Provenance,
}
