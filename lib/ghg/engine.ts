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
import type { FactorEditionComparison } from './comparability'
import { SB253_FRAMEWORK_DEADLINE } from '../sb253'

// The two EXACT conversion anchors, from the repo's conversion authority. Imported rather than
// copied: lib/unitConversions.ts is the single source and its header forbids inlining these.
import { GJ_PER_MMBTU, KWH_PER_GJ, M3_PER_MCF, EXACT_UNITS, exactConversion, convertToCanonical, type FuelType } from '../unitConversions'
import { dateInWords, isoDateInWords } from './dateWords'
import { periodFromYearAndEnd, reportingYearLabel, reportingPeriodWords, reportingWindowIso, periodWords, yearLabel, type ReportingYearLabel } from './reportingYear'
export { reportingYearLabel, reportingPeriodWords, reportingWindowIso, periodWords, yearLabel, type ReportingYearLabel }
import { selectEdition, registryDateInWords, DATASETS, type DatasetId, type FrozenSelection, type SelectionRule } from './factorEditionRegistry'
// The empty-value words for every workings cell that has no value. See lib/notProvided.ts for why the
// glyph was retired; the row's own `note` says WHY the cell is empty, this says only that it is.
import { NOT_PROVIDED } from '../notProvided'
import { ALL_LOCATIONS, NOT_APPLICABLE, DOCUMENT_EVENT_ROW_BASIS, LOCATION_EVENT_ROW_BASIS } from './workingsCells'
// Type only — erased at compile, no runtime dependency and nothing added to the bundle. The engine
// neither builds nor reads a comparability disclosure; it carries the field so the stored inventory
// shape stays in one place. See lib/ghg/comparability.ts.
import type { ComparabilityRecord } from './comparability'
// Type only, for the same reason and with the same effect: erased at compile, so the fact that
// factorEditions.ts imports VALUES back out of this file is not a runtime cycle.
import type { FactorEditions } from './factorEditions'
// The engine composes the refusal note it stores in the workings row, so the sentence a verifier
// reads in an export and the sentence the customer reads on screen come from ONE module and cannot
// drift. countryRefusalCopy imports only the TYPE back from here, so there is no runtime cycle.
import { countryRefusalText, countryNameEn } from './countryRefusalCopy'
import { GRID_REGION_CA, GRID_REGION_US, GRID_REGION_AU, GRID_REGION_AVERAGES, US_SUBREGIONS } from './gridRegionWords'
import { DELIVERY_DOC_TYPES, docTypeLabel } from './conciergeDocTypes'
import { unitLabel } from './unitLabels'
// T11: the fuel names every coverage message uses, in their own module so the verifier helpers can read them too.
import { FUEL_NAME, fuelName } from './fuelNames'
// ⚠️ THE ONLY QUESTION THE ENGINE ASKS THIS MODULE IS "CAN WE NAME THIS CODE?", AND THAT IS ALSO
// WHY IT IS THE RIGHT AUTHORITY. countryByIso2 answers over the 212-country concordance that the
// country control is built from, so "a country this platform can express" has ONE definition and
// the picker and the router cannot disagree about it. Client-safe by construction: it imports
// countryRegions.json (29 KB) and no factor file, which is the whole reason that split exists.
//   It carries NO display name into the engine, deliberately. A name shown to a customer is copy,
// is locale-sensitive, and belongs in the copy module where it can be pinned to ['en'] once.
import { countryByIso2 } from '../emissionFactors/countryOptions'
import type { EquipmentType, FleetType, MobileGasRow, MobilePublisher } from '../emissionFactors/mobile/types'
import { selectMobileRow } from '../emissionFactors/mobile/select'
import { EPA_MOBILE_2025 } from '../emissionFactors/mobile/epa2025'
import { ECCC_MOBILE_2025 } from '../emissionFactors/mobile/eccc2025'
import { DEFRA_MOBILE_2026 } from '../emissionFactors/mobile/defra2026'
import { DEFRA_MOBILE_2025 } from '../emissionFactors/mobile/defra2025'
import { DEFRA_MOBILE_2024 } from '../emissionFactors/mobile/defra2024'
import { DEFRA_MOBILE_2023 } from '../emissionFactors/mobile/defra2023'
import { DESNZ_2024 } from './factors/desnz-2024'
import { DESNZ_2023 } from './factors/desnz-2023'
import { DESNZ_2025 } from './factors/desnz-2025'
import type { CitedValue } from './factors/types'
import { NGA_MOBILE_2025, NGA_MOBILE_ENERGY_CONTENT_2025 } from '../emissionFactors/mobile/nga2025'
import { NGA_MOBILE_2024, NGA_MOBILE_ENERGY_CONTENT_2024 } from '../emissionFactors/mobile/nga2024'
import { NGA_MOBILE_2023, NGA_MOBILE_ENERGY_CONTENT_2023 } from '../emissionFactors/mobile/nga2023'
import { NGA_MOBILE_2026, NGA_MOBILE_ENERGY_CONTENT_2026 } from '../emissionFactors/mobile/nga2026'
import { NGA_2026 } from './factors/nga-2026'
import { EPA_MOBILE_2023 } from '../emissionFactors/mobile/epa2023'
import { MFE_MOBILE_2023 } from '../emissionFactors/mobile/mfe2023'
import { EPA_2023 } from './factors/epa-2023'
import { NGA_2023 } from './factors/nga-2023'
import { MFE_2023 } from './factors/mfe-2023'
import { MFE_GRID_2026V2 } from './factors/mfe-2026v2-grid'
import { AIB_2023 } from './factors/aib-2023'
import { EEA_2023_REVISED } from './factors/eea-2023'
import { EPA_MOBILE_2024 } from '../emissionFactors/mobile/epa2024'
import { MFE_MOBILE_2024 } from '../emissionFactors/mobile/mfe2024'
import { MFE_MOBILE_2025 } from '../emissionFactors/mobile/mfe2025'
import { ECCC_MOBILE_2026 } from '../emissionFactors/mobile/eccc2026'
import { EPA_2024 } from './factors/epa-2024'
import { NGA_2024 } from './factors/nga-2024'
import { MFE_2024 } from './factors/mfe-2024'
import { MFE_2025 } from './factors/mfe-2025'
import { MFE_TD_2026V2 } from './factors/mfe-2026v2-td'
import { ECCC_TABLE_5_4, ECCC_NIR_2026_NG_HEAT } from './factors/eccc-2026'
import { AIB_2025 } from './factors/aib-2025'
import { AIB_2024_NL } from './factors/aib-2024'
import { EEA_2024 } from './factors/eea-2024'
import { MFE_MOBILE_2026 } from '../emissionFactors/mobile/mfe2026'
import { IPCC_MOBILE_2006 } from '../emissionFactors/mobile/ipcc2006'

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

// T3c: SETTLED AS 2025. EF_SOURCES.combustion cited "US EPA (2024)" until T3c; the workbook these values were
// read from is the 2025 edition, last modified 15 January 2025. Nobody has checked whether the two
// editions differ, so the citation may name the wrong year — exactly the position EF_UK was in before
// 13 Aug 2026.
//   THE DISTILLATE ROW REPRODUCING EXACTLY IS NOT EVIDENCE OF EDITION. That was the UK lesson: DEFRA's
// residual-oil factor was identical in the 2025 and 2026 workbooks, so matching on it would have
// "proved" a 2025 table was 2026. An edition check needs rows that CHANGE.
//   TO CHECK, in rough order of how much customer volume they price:
//     natural_gas_mmbtu 53.06   natural_gas_mcf 54.44 (Table 1: 0.05444 kg per scf)
//     diesel_gallon 10.21*   gasoline_gallon 8.78
//   (*and with it fuel_oil_distillate_gallon and diesel_mobile_gallon, which share the row.)
//   FI2 diff 3 (ruling R5): the per-gallon and per-Mcf keys are now Table 1's own published per-gallon and per-scf
//   columns, which is what this list is typed into the workbook against. They were heat content x per-mmBtu factor
//   (10.20648, 8.7775, 54.43956) until then. The 2025 workbook carries no change marker on any of these rows.
//   propane_gallon has LEFT this list — checked 13 Aug 2026, and it was wrong for a different
//   reason. See its own note at the key.
// Whichever rows differ between the 2024 and 2025 editions are the ones to pin, the way EF_UK now pins
// natural_gas_kwh / diesel_litre / gasoline_litre.
//
// ── END-USE SECTOR: NO CHOICE WAS MADE, BECAUSE EPA OFFERS NONE ─────────────────────────────────
// Verified against EPA Hub 2025 Table 1 (Stationary Combustion) — LF, 14 Aug 2026.
//
// EVERY ROW in the Petroleum Products block carries an IDENTICAL 3 g CH4 / 0.6 g N2O per mmBtu —
// Distillate No. 1, No. 2, No. 4, Residual No. 5, No. 6, LPG, Propane, Motor Gasoline, Kerosene and
// Crude Oil alike. There is ONE column, not a sector set. Natural Gas is 1 / 0.1. So the CH4/N2O in
// every key below is the only value EPA publishes for that fuel, and no end-use selection was made
// here or is available to make. Contrast EF_CA (which picks a named end-use row per key) and EF_EU
// (which sits on IPCC's industrial tables while three other sector tables exist).
//
// ⚠️ EPA'S OWN NOTE UNDER TABLE 1 SAYS OTHERWISE, AND IT IS QUOTED HERE SO NOBODY GOES LOOKING.
// Verbatim: "The CH4 and N2O emission factors provided represent emissions in terms of fuel type and
// by end-use sector (i.e., residential, commercial, industrial, electricity generation)." The
// published table has NO sector columns. A verifier reading that note will look for them, fail to
// find them, and reasonably wonder whether we dropped a dimension. We did not — there is nothing
// there to drop. Do not go hunting for a sector split in this workbook on the strength of that note.
//
// ⚠️ EPA AND IPCC DISAGREE ON LPG, AND THE DIVERGENCE IS DELIBERATE ON BOTH SIDES. EPA gives
// propane/LPG the same 3 / 0.6 as every other petroleum product; IPCC gives LPG 1 / 0.1, distinct
// from the liquids in all four of its sector tables. Neither is wrong: each table follows its own
// publisher, and EF_EU carries the matching note. DO NOT "fix" one to agree with the other — that
// would substitute a publisher's judgement we do not hold for the one we cited.
// ── EPA'S OWN PUBLISHED COLUMNS (FI2 diff 3, ruling R5: a table holds the publisher's own units) ──────────────
// Table 1 publishes every fuel below per mmBtu AND per physical unit (per scf for natural gas, per gallon for the
// petroleum products). Each per-gallon and per-Mcf key is the per-unit column as EPA printed it, cited on the workings
// row by US_PUBLISHED_NOTE; per Mcf is per scf x 1,000. Until 7 Oct 2026 these keys were heat content x the per-mmBtu
// factor at full precision (for example 0.138 x 73.96 = 10.20648 against EPA's printed 10.21), which put on the row a
// figure EPA never printed. The per-mmBtu keys are EPA's own column and are unchanged.
   const EF = {
  // Natural Gas, Table 1: 0.05444 kg CO2, 0.00103 g CH4, 0.0001 g N2O per scf, x 1,000 per Mcf.
  natural_gas_mcf: { co2: 54.44, ch4: 0.00103, n2o: 0.0001 },
  natural_gas_mmbtu: { co2: 53.06, ch4: 0.001, n2o: 0.0001 },
  // ── PROPANE — EPA Table 1 Stationary Combustion, Petroleum Products, row "Propane" ─────────────
  // ⚠️ THIS CO2 FACTOR WAS WRONG UNTIL 13 AUG 2026, AND THE WRONG VALUE CAME FROM THE ADJACENT ROW.
  // Table 1 lists Propane and Liquefied Petroleum Gases (LPG) NEXT TO EACH OTHER with DIFFERENT
  // factors, and they read across almost identically:
  //     Propane   0.091 mmBtu/gal   CO2 62.87 kg/mmBtu   CH4 3 g/mmBtu   N2O 0.6 g/mmBtu
  //     LPG       0.092 mmBtu/gal   CO2 61.71 kg/mmBtu   CH4 3 g/mmBtu   N2O 0.6 g/mmBtu
  // The stored CO2 was 5.61561, which is 0.091 x 61.71 — PROPANE's heat content with LPG's CO2
  // factor. CH4 and N2O were always right (0.091 x 3 g, 0.091 x 0.6 g), and that asymmetry is what
  // pins the mistake to the CO2 column alone rather than to a whole-row misread: only one of the
  // three gases came off the wrong line.
  //   co2 0.091 x 62.87 = 5.72117   (WAS 5.61561 = 0.091 x 61.71)
  //   ch4 0.091 x 3 g   = 0.273 g   n2o 0.091 x 0.6 g = 0.0546 g   (both UNCHANGED)
  // Verified in the 2025 Hub workbook (last modified 15 Jan 2025) — LF, 13 Aug 2026.
  // FI2 diff 3: now Table 1's printed per-gallon column for Propane, 5.72 kg CO2, 0.27 g CH4, 0.05 g N2O, in place of
  // the full-precision derivation above (ruling R5). The wrong-row correction above is unaffected: 5.72 is Propane's.
  //
  // ⚠️ NOT AN EDITION PROBLEM, and keeping the two apart is the point. No row in the Petroleum
  // Products block carries the blue-text marker the workbook uses to flag changes from the 2024
  // edition, so those rows are IDENTICAL across the two editions — 62.87 was the 2024 value too.
  // A wrong-row read and a stale edition present the same way (a factor that does not match the
  // current workbook) and have opposite fixes. Re-citing EF_SOURCES.combustion as 2025 would never
  // have found this, and finding this settles nothing about the edition of any other key: the
  // header warning above stays exactly as it is.
  //
  // EVERY US PROPANE CUSTOMER'S SCOPE 1 RISES 1.88% (62.87 / 61.71). Stored inventories do NOT
  // move — workings is a saved snapshot, recomputed only on re-save — so a customer's 2025 figure
  // and their next one will differ by this on unchanged consumption.
  propane_gallon: { co2: 5.72, ch4: 0.00027, n2o: 0.00005 },
  diesel_gallon: { co2: 10.21, ch4: 0.00041, n2o: 0.00008 },
  fuel_oil_gallon: { co2: 10.21, ch4: 0.00041, n2o: 0.00008 },
  // ── GRADE-EXPLICIT KEYS — EPA Table 1 Stationary Combustion, Petroleum Products ────────────────
  // Each is Table 1's printed per-gallon column (FI2 diff 3, ruling R5).
  //
  // DISTILLATE FUEL OIL No. 2, per gallon: 10.21 kg CO2, 0.41 g CH4, 0.08 g N2O. The legacy fuel_oil_gallon and
  // diesel_gallon carry the same row, because EPA lists diesel and Distillate No. 2 as one fuel. (Its per-mmBtu
  // columns, 0.138 mmBtu/gal x 73.96 kg CO2, 3 g CH4, 0.6 g N2O, give 10.20648, which is what this key held.)
  fuel_oil_distillate_gallon: { co2: 10.21, ch4: 0.00041, n2o: 0.00008 },
  // RESIDUAL FUEL OIL No. 6, per gallon: 11.27 kg CO2, 0.45 g CH4, 0.09 g N2O. Until FI2 diff 3 this key carried
  // 0.15 x 75.10 = 11.265 rather than the printed 11.27, so that the row matched the derivation; ruling R5 reverses
  // that: the row cites the value EPA printed, and nothing is derived.
  fuel_oil_residual_gallon: { co2: 11.27, ch4: 0.00045, n2o: 0.00009 },
  // FI9 (R16): no mobile key here. Fleet fuel prices from EPA's mobile tables (lib/emissionFactors/mobile/epa2025.ts).
  ammonia: 0,
  // ── PURCHASED STEAM / DISTRICT HEAT — EPA Hub 2025 Table 7 (Steam and Heat) ────────────────────
  // ⚠️ THIS WAS THE BARE SCALAR 66.33 UNTIL 14 AUG 2026 — THE CO2 COLUMN ALONE. Table 7 publishes
  // three columns and we stored one, then displayed that one as "kg CO₂e/mmbtu" and stamped the row
  // GWP_AS_PUBLISHED — the basis this engine reserves for a publisher that already combined the
  // gases (DEFRA, DCCEEW, MfE). EPA did not: it publishes them separately, and we dropped two. So
  // the row asserted a completeness it did not have. Same class as the propane defect above — a
  // factor and a citation that do not describe each other.
  //   CO2 66.33 kg/mmBtu, CH4 1.25 g/mmBtu, N2O 0.125 g/mmBtu in the source; stored in kg here, like
  // every other US mass-basis key.
  //
  // DERIVED, NOT INDEPENDENTLY MEASURED. Table 7's own note: "These factors assume natural gas fuel
  // is used to generate steam or heat at 80 percent thermal efficiency." Every cell is the Table 1
  // natural gas row divided by 0.80 —
  //   53.06 / 0.8 = 66.325 -> 66.33     1.00 / 0.8 = 1.25     0.10 / 0.8 = 0.125
  // — so an EPA natural-gas revision MUST move this key too, and a commit that updates one and not
  // the other leaves two rows of the same table disagreeing. engine.test.ts pins that identity
  // against EF.natural_gas_mmbtu rather than the three literals alone, so a desync fails there.
  //
  // SCOPE OF THE FACTOR, verbatim from the table's second note: "The factors represented in the
  // table above represent combustion emissions only (tank-to-wheel) and do not represent upstream
  // emissions or well-to-wheel emissions."
  //
  // US SITES ONLY. Steam routes per jurisdiction through STEAM_EF (no fallback): this row prices a US location; the
  // UK prices on DEFRA's district heat factor; CA, AU, NZ and the EU have no published factor and take a supplier
  // figure or are an unpriced line (FI7).
  steam_mmbtu: { co2: 66.33, ch4: 0.00125, n2o: 0.000125 },
}

// Canadian combustion factors — ECCC "Emission factors and reference values" v3.0 (Oct 2025).
// Stored as kg per activity unit (raw gas amounts; calcGas applies GWP). Source values are g/unit.
// Mirrors the US EF key structure so factor selection is a clean country swap, with two exceptions:
//   - natural_gas CO2 is per-province (see EF_CA_NG_CO2_M3), per m³; there is no table value without a province.
//   - ECCC prints no energy-basis gas factor. Since FI3 (R12) CA gas in GJ, therms, MMBtu or kWh is converted to m³ at
//     the national gross heat content (CA_NG_GJ_PER_M3, NIR Table A4-2) and priced on the province's per-m³ factor.
//   FI2 diff 2: every key is in ECCC's own unit (per litre, per m³). The gallon and per-Mcf keys are gone: those
//   units convert exactly, with the conversion stated on the row.
// CH4/N2O: natural gas uses ECCC's "Residential, Construction, Commercial/Institutional, Agriculture" row (Table 2.3,
// 0.037 / 0.035 g/m³; see EF_CA_NG_CH4_N2O_M3); the oils use the Table 4.x Industrial rows.
//
// ── END-USE SECTOR: A CHOICE WAS MADE, PER KEY, AND HERE IS WHY ─────────────────────────────────
// ECCC splits stationary combustion by END USE and publishes several variants of the same fuel. For
// Light Fuel Oil alone v3.0 carries five, including "Forestry, Construction, Public Administration
// and Commercial/Institutional" alongside "Industrial" and "Residential". Each key below names the
// row it took — Light/Heavy Fuel Oil "Industrial", diesel "Refineries and Others", propane "All
// Other Uses" — so the choice is recorded rather than implied.
//
// WHY INDUSTRIAL: it is the row that covers the largest share of the commercial and industrial sites
// this product serves, and it keeps all three oil keys on ONE consistent end use rather than mixing
// a Commercial oil with an Industrial one at the same location, which would make a site's own rows
// incomparable. It is a defensible default, not a derivation.
//
// ⚠️ AND IT IS APPLIED TO EVERY CANADIAN LOCATION, WITH NO SELECTOR. A Toronto office burning
// heating oil is priced on the INDUSTRIAL row today, not on the "Forestry, Construction, Public
// Administration and Commercial/Institutional" row that describes it. Nothing on the workings row or
// in the citation discloses which end use applied. Same open design item as EF_EU records, reached
// from the opposite direction: there the sector was unidentified, here it is named but unchosen by
// the customer. EF_NZ's nz_use_class is the only table with a selector.
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
  // NATURAL GAS IS NOT IN THIS TABLE (FI1). Its CO2 is the province's own (EF_CA_NG_CO2_M3) and its
  // CH4 and N2O are EF_CA_NG_CH4_N2O; pickEF assembles the factor from the two. The Ontario value that sat
  // here as a fallback for a blank or unrecognised province is removed: such a line is unpriced, with an
  // export-blocking issue asking for the province (ruling, design doc section 10).
  // Propane "All Other Uses" (Table 3.x): 1515 / 0.024 / 0.108 g/L. gallon = litre × 3.78541.
  propane_litre: { co2: 1.515, ch4: 0.000024, n2o: 0.000108 },
  // Diesel "Refineries and Others" (Table 4.x): 2681 / 0.078 / 0.022 g/L.
  diesel_litre: { co2: 2.681, ch4: 0.000078, n2o: 0.000022 },
  // Light fuel oil "Industrial" (Table 4.x): 2753 / 0.006 / 0.031 g/L.
  // GRADE-EXPLICIT KEYS — ECCC v3.0 Table 4.3 (2026 set), Industrial rows, g/L x 3.785411784.
  // The legacy key above is CONFIRMED to be the Light/Industrial row: 2753 g/L -> 10.421239 kg/gal
  // against its stored 10.421234, a 4.6e-6 rounding difference matching every other key in this table.
  // Light Fuel Oil - Industrial:  2753 / 0.006 / 0.031 g/L.
  // Heavy Fuel Oil - Industrial: 3156 / 0.12 / 0.064 g/L.
  // ── PER-LITRE KEYS — ECCC's OWN PUBLISHED BASIS, and the ones a CA location now prices from.
  // ECCC v3.0 Table 4.3 (2026 set), INDUSTRIAL rows, g/L -> kg/L. FI2 diff 2: the gallon keys converted from these are
  // gone; a figure in US gallons converts to litres exactly at pricing.
  fuel_oil_distillate_litre: { co2: 2.753, ch4: 0.000006, n2o: 0.000031 },
  fuel_oil_residual_litre: { co2: 3.156, ch4: 0.00012, n2o: 0.000064 },
  // FI9 (R16): no mobile key here. Fleet fuel prices from ECCC's mobile table, NIR Table A6.1-15
  // (lib/emissionFactors/mobile/eccc2025.ts).
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
// FI2: M3_PER_MCF is the EXACT value (28.316846592, NIST SP 811), from lib/unitConversions.ts. It was 1000/35.3147,
// a rounded reciprocal (28.316819…), which moved every Canadian per-Mcf figure by about one part in a million.
// Canadian natural gas CH4 and N2O, ECCC Res/Comm/Institutional: 0.037 and 0.035 g/m3, per m³ only. The CO2 is never
// here: it is the province's (FI1).
const EF_CA_NG_CH4_N2O_M3 = { ch4: 0.000037, n2o: 0.000035 }
// FI3 (ruling R12, 7 Oct 2026): Canada's national gross heat content for natural gas, 38.59 TJ/GL GCV, 2023 (ECCC
// National Inventory Report 1990-2023, Part 2, Table A4-2 "Reference Approach Energy Contents and Emission Factors
// for Canada", row Natural Gas, page 236). 1 GL = 10^6 m³, so 38.59 MJ/m³ = 0.03859 GJ/m³. ECCC publishes no provincial
// value (its provincial energy contents are in an unpublished internal report); The Climate Registry 2025 and BC's 2024
// Best Practices Methodology also use one national figure. A gas figure in GJ (gross, as billed) is converted to m³ at
// this value and priced on the province's own per-m³ factor.
const CA_NG_GJ_PER_M3 = 38.59 / 1000
/** T3c (R18): the heat content keyed by its NIR data year (eccc_ng_heat). NIR 2025 (data year 2023) is the one held. */
const CA_NG_HEAT_BY_EDITION: Record<number, number> = { 2023: CA_NG_GJ_PER_M3, 2024: ECCC_NIR_2026_NG_HEAT.value }   // T3d: NIR 2026, 38.52 TJ/GL
/** R12: the note on a Canadian gas row priced through the national heat content. */
export const CA_GAS_GJ_NOTE =
  'Converted to m³ at 38.59 MJ/m³, Canada\'s national gross heat content for natural gas (ECCC National Inventory ' +
  'Report 1990-2023, Part 2, Table A4-2). ECCC does not publish a provincial value.'
/** T3d: the R12 note for the heat content edition the window selected (NIR 2025 or NIR 2026), never the other's figure. */
const CA_GAS_HEAT_TEXT: Record<number, { note: string; words: string }> = {
  2023: { note: CA_GAS_GJ_NOTE, words: 'of 38.59 MJ/m³ (ECCC National Inventory Report 1990-2023, Part 2, Table A4-2)' },
  2024: { note: 'Converted to m³ at 38.52 MJ/m³, Canada\'s national gross heat content for natural gas (ECCC National Inventory ' +
    'Report 1990-2024, Table A4-2, p. 521). ECCC does not publish a provincial value.',
    words: 'of 38.52 MJ/m³ (ECCC National Inventory Report 1990-2024, Table A4-2, p. 521)' },
}
// FI2 diff 2 (ruling R5): the per-Mcf CH4 and N2O that sat here (0.001048 and 0.000991, rounded from per m³ × 28.3168)
// are gone. Every Canadian gas volume other than m³ converts to the per-m³ factor exactly (1 Mcf = 28.316846592 m³).
/** FI1: the province a Canadian location's gas is priced for, or null when it is blank or not one we hold. */
function caGasProvince(loc: Pick<Location, 'grid_region' | 'province'>): string | null {
  const prov = (loc.grid_region || loc.province || '').toUpperCase().trim()
  return EF_CA_NG_CO2_M3[prov] !== undefined ? prov : null
}

// UK combustion factors — DEFRA/DESNZ 2026 "Greenhouse gas reporting: conversion factors"
// (full set, Fuels tab). The mandatory basis for UK SECR reporting.
// STORAGE NOTE: stored as combined kg CO2e in the `co2` field with ch4:0, n2o:0, so calcGas
// reproduces DEFRA's PUBLISHED figure exactly (Option 2 — exact match for verifier reconciliation).
// DEFRA bakes in its own GWP basis, so UK fuels intentionally do NOT respond to the AR4/AR5 toggle.
// Per DEFRA guidance: natural gas uses the "Natural gas" row (kWh, gross CV — billing basis);
// diesel/petrol use the "average biofuel blend" rows (forecourt fuel). FI2 diff 2: no gallon keys; a figure in US
// gallons converts to litres exactly, and gas in therms or MMBtu converts to kWh exactly (DEFRA's kWh is gross CV).
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
// ── END-USE SECTOR: NO CHOICE EXISTS. DEFRA's Fuels tab publishes ONE figure per fuel, with no
// end-use or sector dimension for any of the keys below — and because the figures are combined CO2e
// with the gases already summed at source, there is no CH4/N2O split for a sector to act on even in
// principle. Stated explicitly because an ABSENT note is ambiguous between "no choice was made" and
// "a choice was made and not recorded"; here it is the former. (DEFRA does publish per-VEHICLE and
// per-passenger transport tables, but those are per km — a different activity basis from anything
// this engine collects. See the mobile-combustion note on EF.)
const EF_UK = {
  // Natural gas, kWh (Gross CV): 0.18231 kgCO2e/kWh (DEFRA 2026 Fuels row "Natural gas";
  // CO2 0.18194, CH4 0.00028, N2O 0.00009 — components sum to the total exactly).
  natural_gas_kwh: { co2: 0.18231, ch4: 0, n2o: 0 },
  // FI2 follow-up (7 Oct 2026): DEFRA's own per-cubic-metre row. "Factors by Category", Scope 1 > Fuels > Gaseous fuels >
  // Natural gas, unit "cubic metres", factor ID 1_100_1004_1_1: kg CO2e 2.02633 (CO2 2.02231, CH4 0.00307, N2O 0.00095).
  // Stored combined, GWP as published, like every key here. UK gas in m³ prices on it directly; Mcf and Ccf convert to
  // m³ exactly (1 Mcf = 28.316846592 m³, 1 Ccf = 2.8316846592 m³), stated on the row.
  natural_gas_m3: { co2: 2.02633, ch4: 0, n2o: 0 },
  // Propane, litres: 1.54358 kgCO2e/L (CO2 1.5414, CH4 0.00133, N2O 0.00084 — components sum to
  // 1.54357, DEFRA's own rounding against its stated 1.54358). UNCHANGED from the 2025 edition.
  propane_litre: { co2: 1.54358, ch4: 0, n2o: 0 },
  // FI4 (R13): propane by mass, on DEFRA's own per-tonne row for the SAME fuel as propane_litre (both are the "Propane"
  // rows, not LPG). DEFRA/DESNZ 2026 flat file, "Factors by Category", Scope 1 > Fuels > Gaseous fuels > Propane,
  // unit tonnes, factor ID 1_100_1007_15_1 (row 119): 2,997.63233 kg CO2e per tonne. Per kg is per tonne / 1,000,
  // exact: 2.99763233. Combined CO2e in `co2`, GWP as published, like every key here.
  propane_kg: { co2: 2.99763233, ch4: 0, n2o: 0 },
  // Diesel (average biofuel blend), litres: 2.58354 kgCO2e/L (CO2 2.55035, CH4 0.00029, N2O 0.0329).
  diesel_litre: { co2: 2.58354, ch4: 0, n2o: 0 },
  // FI9 (R16): no mobile key here. Fleet fuel prices from the same Fuels rows through lib/emissionFactors/mobile/
  // defra2026.ts, which cites DEFRA's statement that they apply to vehicles (Passenger and Delivery vehicles!A11).
  // Fuel oil, litres 3.17492 (DEFRA "Processed fuel oils - residual oil"). (FI2 diff 2: the per-gallon keys are gone.)
  // The FACTOR is unchanged from 2025; only the gallon conversion is corrected (see the header).
  // ── GRADE-EXPLICIT KEYS — DEFRA/DESNZ 2026 full set, Fuels tab, kg CO2e per litre ──────────────
  // Seedable now the whole table is 2026; seeding them while it was 2025 would have mixed editions.
  //
  // "Processed fuel oils - distillate oil" 2.75541 (CO2 2.72417, CH4 0.00315, N2O 0.02809 — sums
  //   exactly): 2.75541 x 3.785411784 = 10.430361484 -> 10.430361.
  // "Processed fuel oils - residual oil" 3.17492 (CO2 3.16262, CH4 0.0053, N2O 0.00701 — sums to
  //   3.17493, DEFRA's own rounding against its stated 3.17492):
  //   3.17492 x 3.785411784 = 12.018379581 -> 12.018380.
  //
  // ⚠️ IDENTICAL TO fuel_oil_gallon ABOVE BY CONSTRUCTION, NOT COINCIDENCE. The legacy key always
  // WAS the residual row — its comment has said so since it was seeded — so both keys are the same
  // published figure converted the same way. They must move together or one of them is wrong;
  // engine.test.ts Z15 pins the identity so a lone edit fails.
  // ── PER-LITRE KEYS — DEFRA'S OWN PRINTED FIGURES, verbatim, no arithmetic at all.
  // "Processed fuel oils - distillate oil" 2.75541 and "- residual oil" 3.17492 kg CO2e/L, exactly as
  // the two comments above quote them. The gallon keys are these numbers x 3.785411784; these are the
  // numbers DEFRA prints. A UK verifier can now find the row value in the flat file unchanged.
  fuel_oil_distillate_litre: { co2: 2.75541, ch4: 0, n2o: 0 },
  fuel_oil_residual_litre: { co2: 3.17492, ch4: 0, n2o: 0 },
  //
  // NAMING NOTE. DEFRA publishes "Gas oil" byte-identical to "Processed fuel oils - distillate oil",
  // and "Fuel oil" byte-identical to "Processed fuel oils - residual oil". The plain-language and
  // technical names are aliases for the same two figures — one publisher treating gas oil and
  // distillate fuel oil as one product.
  //   This was written as corroboration for the EU distillate key while its IPCC category mapping was
  // still unconfirmed. That mapping is now CONFIRMED against IPCC Table 1.1 (13 Aug 2026) — see
  // EF_EU — so this note stands as a second publisher agreeing, not as the evidence it was.
  // ── DISTRICT HEAT AND STEAM — Scope 2, PER kWh ────────────────────────────────────────────────
  // DESNZ/DEFRA 2026 conversion factors, flat file v1.2 (updated 2026-07-10), Scope 2 sheet,
  // "Heat and steam" > "District heat and steam". Published columns, per kWh:
  //     kg CO2e 0.17529 | kg CO2e of CO2 0.17355 | kg CO2e of CH4 0.00122 | kg CO2e of N2O 0.00052
  //
  // ⚠️ THE CONSTITUENT COLUMNS ARE "kg CO2e OF" EACH GAS — CO2e, NOT GAS MASS. DEFRA has already
  // multiplied by its own (AR5) GWPs. Loading 0.00122 into `ch4` would make calcGas multiply by a GWP
  // a second time, inflating methane ~28-fold. So this takes the same combined-CO2e-in-`co2` shape as
  // every other EF_UK key, and factorCells detects the zeros and stamps GWP_AS_PUBLISHED. The zeros
  // mean "DEFRA already counted them", exactly as the convention comment in buildWorkings says.
  //
  // ⚠️ KEY IS _kwh, NOT _mmbtu, AND THAT IS LOAD-BEARING. DEFRA publishes per kWh and UK heat networks
  // bill in kWh by law. Converting 0.17529 to a per-mmBtu figure would bury a unit conversion inside a
  // stored factor where no verifier can audit it; the conversion belongs on the activity, on the row,
  // in the note. steamToBasis does it there.
  //
  // NO CV BASIS APPLIES, and its absence is correct rather than an omission: natural gas carries
  // explicit Gross CV (0.18231) and Net CV (0.20199) rows because it is a FUEL, whereas a kWh of
  // delivered heat is measured heat and has no calorific basis to state.
  // DEFRA's "Onsite heat and steam" row carries an identical factor, so no district/onsite split is
  // needed here — one key answers both.
  steam_kwh: { co2: 0.17529, ch4: 0, n2o: 0 },
}

/** T3d: an edition file's combustion values as an EF_UK-shaped table: the CO2e DESNZ combines, in `co2`, as EF_UK stores
 *  it, with steam_kwh beside them as EF_UK carries it. */
function ukTable(f: { combustion: Record<string, CitedValue>; steam_kwh: CitedValue }): Record<string, CombustionEF> {
  return { ...Object.fromEntries(Object.entries(f.combustion).map(([k, c]) => [k, { co2: c.value, ch4: 0, n2o: 0 }])),
    steam_kwh: { co2: f.steam_kwh.value, ch4: 0, n2o: 0 } }
}
const EF_UK_2023 = ukTable(DESNZ_2023)   // T3d 2024: the 2023 full set's stored (unrounded) totals
const EF_UK_2024 = ukTable(DESNZ_2024)
const EF_UK_2025 = ukTable(DESNZ_2025)
/** T3d: where an older held edition prints a value, from the citation its edition file carries. */
function citedNote(edition: string, v: CitedValue): string {
  return `${edition}, ${v.cite.table} sheet, ${v.cite.row} (${v.cite.cell}): ${v.value} ${v.unit}${v.derivation ? `; ${v.derivation}` : ''}`
}
const citedNotes = (edition: string, values: Record<string, CitedValue>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, citedNote(edition, v)]))
/**
 * T3d: the "where it is printed" note for a value priced on an older held edition, by dataset, edition key and table
 * key. It replaces the jurisdiction's own note (US_PUBLISHED_NOTE, UK_PUBLISHED_NOTE, AU_PUBLISHED_NOTE), which
 * describes the newest edition's cells, so a 2024 row never points a verifier at a 2026 cell.
 */
const EDITION_VALUE_NOTE: Partial<Record<DatasetId, Record<number, Record<string, string>>>> = {
  desnz_combustion: { 2023: citedNotes(DESNZ_2023.edition, DESNZ_2023.combustion), 2024: citedNotes(DESNZ_2024.edition, DESNZ_2024.combustion), 2025: citedNotes(DESNZ_2025.edition, DESNZ_2025.combustion) },
  // EPA: where Table 1 prints the three gases, and the same exact steps EF applies (per scf x 1,000; g / 1,000).
  epa_hub_combustion: Object.fromEntries(([[2023, EPA_2023], [2024, EPA_2024]] as const).map(([y, F]) => [y, Object.fromEntries(Object.entries(F.combustion).map(([k, g]) =>
    [k, `${F.edition}, ${g.co2.cite.table}, ${g.co2.cite.row} (${[g.co2, g.ch4, g.n2o].map(x => x.cite.cell).join(', ')}): ${g.co2.value} kg CO2, ${g.ch4.value} kg CH4, ${g.n2o.value} kg N2O ${g.co2.unit.replace(/^kg CO2 /, '')}${g.co2.derivation ? `; ${g.co2.derivation}` : ''}`]))])),
  // NGA 2024: a PDF only, so the row shows the energy content and per-GJ factor it is the product of (FI3: cited on the row).
  nga_combustion: Object.fromEntries(([[2023, NGA_2023], [2024, NGA_2024], [2026, NGA_2026]] as const).map(([y, F]) => [y, Object.fromEntries(Object.entries(F.combustion).map(([k, v]) =>
    [k, `${F.edition}, ${v.cite.table.split(' ').slice(0, 2).join(' ')} (p. ${v.cite.page}), ${v.cite.row}: ${v.value} ${v.unit}${v.derivation ? `; ${v.derivation}` : ''}`]))])),
}

// EU combustion factors: the emission factor per TJ and the net calorific value per mass from EU MRR Annex VI
// Table 1 (Commission Implementing Regulation (EU) 2018/2066, consolidated 27.05.2025, pages 167 and 168; its Source
// column reads "IPCC 2006 GL"), with CH4 and N2O per TJ from IPCC 2006 Vol. 2 Ch. 2 Tables 2.2 and 2.3 (pages 2.16
// and 2.18), which are identical for these fuels. Gas split stored (calcGas applies AR4/AR5/AR6).
//
// ── FI3 (7 Oct 2026): EVERY PROPERTY IS CITED, OR THE KEY IS GONE ───────────────────────────────────────────────
// Record: docs/review/eu-fuel-properties.md. Rulings R6 to R10 (design-derived-figures.md section 10).
//   MRR Annex VI Table 1, rows as printed (t CO2/TJ, TJ/Gg):
//     Motor gasoline 69,3 / 44,3   Gas/Diesel oil 74,1 / 43,0   Residual fuel oil 77,4 / 40,4
//     Liquefied petroleum gases 63,1 / 47,3   Natural gas 56,1 / 48,0
//   It prints no density, no volumetric energy content and no gross/net ratio. IPCC Ch. 1 and 2 print none either.
//   - PER LITRE (R2 step 2, R9, R10): the factor x the NCV from MRR, x the density from the JEC Well-to-Tank report v5
//     (EU JRC, EUR 30269 EN, 2020), Annexes, Appendix 2 section 4.1 "Standard properties of fuels", Liquids, page 9:
//     Diesel 832, Gasoline 743, HFO 970 kg/m³. CO2, CH4 and N2O all use the same density. Each row's note names both
//     documents (R10).
//   - HEATING OIL IN LITRES: NO KEY (R8). IPCC Table 1.1 (page 1.12) puts light heating oil in Gas/Diesel Oil, so it
//     shares diesel's NCV and factor, but no source prints a heating-oil density, and the diesel density is not used
//     for it. Heating oil prices by mass only.
//   - LPG IN LITRES: NO KEY. No local source prints a liquid LPG density (JEC gives LPG only in its gaseous state).
//     Propane by mass is FI4.
//   - NATURAL GAS IN m³: NO KEY (R6). A per-Nm³ energy content (JEC Table 37, 36.4 MJ/Nm³ at 0 °C) is never applied to
//     a billed m³: billing reference conditions differ by country and are not printed on every bill. The 36 MJ/m³
//     behind the old 2.0196 kg CO2/m³ was printed by no source.
//   - NATURAL GAS IN kWh (R7): gross, as EU gas bills show it. MRR's factor is per TJ NET; net = gross x 0.90, cited to
//     IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2 (page 1.16) and the notes under Ch. 2 Tables 2.6 to 2.8 (pages 2.25 to
//     2.27). GJ, MJ and the other energy units convert to it exactly (GAS_CALORIFIC_BASIS.EU).
//   - PER KG (MRR mass basis): the factor per TJ x the NCV per Gg from the one table, nothing else. Tonnes convert to kg
//     exactly. Offered for heating oil and heavy fuel oil; held for diesel too, which offers litres only.
// The densities this table used until FI3 (0.844, 0.745, 0.990, 0.510 kg/L and 36 MJ/m³) were printed by no source
// and are gone; the analysis of them is in the git history of this block and in the record above.
//
// ── CH4/N2O: THE SECTOR CHOICE, NOW IDENTIFIED ──────────────────────────────────────────────────
// Annex VI carries no CH4/N2O combustion factors at all (its Section 3 Table 6 gives GWPs only), so
// these come from IPCC 2006 Vol.2 Ch.2, which publishes them BY END-USE SECTOR across four tables.
// Identified 14 Aug 2026 by reversing the stored values out against their own NCV and density:
//     natural gas 1.000 / 0.100 kg/TJ     propane/LPG 0.999 / 0.0995
//     gas/diesel oil 3.001 / 0.601        residual 3.000 / 0.600      motor gasoline 3.000 / 0.600
//
// THE VALUES ARE TABLE 2.2 (energy industries) OR 2.3 (manufacturing/construction). Those two are
// IDENTICAL for these fuels, so the stored numbers CANNOT distinguish them and this comment must not
// claim to. What they definitively are NOT is 2.4 or 2.5. How the four tables differ — N2O does not
// move at all, only CH4:
//
//     Fuel                T2.2/2.3    T2.4 commercial/institutional    T2.5 residential/agriculture
//     Gas/Diesel Oil          3                   10                              10
//     Motor Gasoline          3                   10                              10
//     Residual Fuel Oil       3                   10                              10
//     LPG                     1                    5                               5
//     Natural Gas             1                    5                               5
//
// ⚠️ THE SWITCH IS NOT UNIFORM SCALING: LPG and natural gas move 5x while the three liquids move
// 3.33x, so a sector change cannot be applied as one multiplier.
//
// ⚠️ OPEN DESIGN ITEM — NOT A DEFECT. Sitting on the industrial tables is defensible and is what the
// stored values do. The gap is that there is NO SELECTOR and NO DISCLOSURE: every EU location is
// priced on them, so a Berlin office and a Ruhr smelter get identical CH4, and nothing on the
// workings row or in the citation says which sector table applied. EF_NZ's nz_use_class is the
// existing precedent for a per-location selector — see that table. Whole-row effect is small (+0.19%
// to +0.30% per unit at AR6 if 2.4 were applied), because CH4 is a trace term against CO2, which is
// why this can wait for a design rather than a patch.
//
// ⚠️ IPCC AND EPA DISAGREE ON LPG, AND BOTH ARE FOLLOWED DELIBERATELY. IPCC keeps LPG on the gaseous
// pair (1 / 0.1) in all four tables, distinct from the liquids; EPA gives propane/LPG the same
// 3 / 0.6 as every other petroleum product. So an EU LPG key (FI4) and EF.propane_gallon will
// disagree on the same fuel's CH4 and N2O. That is two publishers, not a transcription error; the matching note
// is on EF. DO NOT harmonise either onto the other.
//
// ── BASIS: WHY 100% FOSSIL IS THE RIGHT CHOICE HERE, not a caveat ───────────────────────────────
// These run ~5–11% above DEFRA's figures because DEFRA BLENDS UK BIOFUEL CONTENT (4.92% by volume,
// per the DfT renewable-fuel statistics DEFRA's own methodology paper cites) and IPCC Tier 1 does not.
// That is a UK fuel-SUPPLY figure. Applying it across 27 member states would import one country's
// blending mandate into 26 others. A 100% fossil basis makes no national supply assumption, which is
// why it is the appropriate baseline for a table shared by all of them. They also reconcile with
// ECCC to ±1%.
//
// ── ROUTES CONSIDERED AND REJECTED — do not re-open without new information ──────────────────────
//  1. FIND THE ORIGINAL AUTHOR'S REFERENCE. CLOSED. EF_EU originates at a21e894 (26 May 2026) in
//     final form: densities present from the first line, no commit body, and the header word
//     "standard" was doing the sourcing work and names nothing. It is not recoverable from history.
//  2. USE DEFRA'S DENSITIES. REJECTED — see the basis note above. Not for being British: for
//     embedding a UK supply mandate in a 27-country table.
//  3. REPLACE WITH A PUBLISHED EU-WIDE PER-LITRE SET. CLOSED — none exists. The EU's own fuel data
//     (Fuel Quality Directive 98/70/EC, EEA dataset) is life-cycle GHG intensity per unit ENERGY
//     reported by fuel suppliers, not corporate combustion factors per litre.
//  4. GO PER-MEMBER-STATE (ADEME Base Carbone for FR, UBA for DE, …). NOT A DEFECT, a possible future
//     direction. It means 27 tables and 27 vintages, most member states have no national database,
//     and it contradicts the deliberate design at factorEditions.ts ("DE AND FR ARE BOTH 'EU', AND
//     THAT IS THE POINT").
//
// DO NOT paper over a density gap by inventing a source. Every row carries euDerivationNote() below, which
// states the arithmetic and names every document a value came from (R10).
const EF_EU = {
  // ── PER LITRE: MRR factor x MRR NCV x JEC density. kg/L = t/m³, so kg CO2/L = t CO2/TJ x TJ/Gg x t/m³ / 1000.
  // CO2 at this table's 6 significant figures; CH4 and N2O at 4. Rates per TJ: IPCC Ch. 2 Tables 2.2/2.3.
  // Gas/Diesel oil, JEC Diesel 832 kg/m³:
  //   CO2 74.1 x 43.0 x 0.832 / 1000 = 2.651002 -> 2.65100   CH4 3 x 43.0e-6 x 0.832 = 1.07328e-4 -> 0.0001073
  //   N2O 0.6 x 43.0e-6 x 0.832 = 2.14656e-5 -> 0.00002147
  diesel_litre: { co2: 2.65100, ch4: 0.0001073, n2o: 0.00002147 },
  // FI9 (R16): no mobile key here. Fleet fuel takes IPCC Ch. 3's mobile CH4 and N2O (EU_FLEET below), with CO2 and the
  // litres-to-TJ step from MRR and JEC as above.
  // Residual fuel oil, JEC HFO 970 kg/m³:
  //   CO2 77.4 x 40.4 x 0.970 / 1000 = 3.033151 -> 3.03315   CH4 3 x 40.4e-6 x 0.970 = 1.17564e-4 -> 0.0001176
  //   N2O 0.6 x 40.4e-6 x 0.970 = 2.35128e-5 -> 0.00002351
  fuel_oil_residual_litre: { co2: 3.03315, ch4: 0.0001176, n2o: 0.00002351 },
  // ── PER kg: MRR mass basis, one table. kg CO2/kg = t CO2/TJ x TJ/Gg / 1000; CH4 and N2O = kg/TJ x TJ/Gg / 1e6.
  // Gas/Diesel oil (diesel and heating oil, IPCC Table 1.1): CO2 74.1 x 43.0 = 3186.3 kg/t; CH4 3 x 43.0 = 129 g/t;
  //   N2O 0.6 x 43.0 = 25.8 g/t.
  diesel_kg: { co2: 3.1863, ch4: 0.000129, n2o: 0.0000258 },
  fuel_oil_distillate_kg: { co2: 3.1863, ch4: 0.000129, n2o: 0.0000258 },
  // Residual fuel oil: CO2 77.4 x 40.4 = 3126.96 kg/t; CH4 3 x 40.4 = 121.2 g/t; N2O 0.6 x 40.4 = 24.24 g/t.
  fuel_oil_residual_kg: { co2: 3.12696, ch4: 0.0001212, n2o: 0.00002424 },
  // ── LPG PER kg (FI4, R13): MRR mass basis, "Liquefied petroleum gases" 63,1 t CO2/TJ x 47,3 TJ/Gg (Annex VI Table 1,
  // page 167). IPCC 2006 Table 1.1 (page 1.12) defines LPG as propane, butane or a combination of the two.
  //   CO2 63.1 x 47.3 / 1000 = 2.98463   CH4 1 x 47.3 / 1e6 = 0.0000473   N2O 0.1 x 47.3 / 1e6 = 0.00000473
  //   (CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2 Tables 2.2 and 2.3, LPG, 1 and 0.1 kg/TJ.)
  propane_kg: { co2: 2.98463, ch4: 0.0000473, n2o: 0.00000473 },
  // ── NATURAL GAS PER kWh, GROSS (R7). kg/kWh = kg/TJ x 0.90 (net per gross) x 3.6e-6 TJ/kWh.
  //   CO2 56 100 x 0.90 x 3.6e-6 = 0.181764   CH4 1 x 0.90 x 3.6e-6 = 3.24e-6   N2O 0.1 x 0.90 x 3.6e-6 = 3.24e-7
  natural_gas_kwh: { co2: 0.181764, ch4: 0.00000324, n2o: 0.000000324 },
}

// ── THE DERIVATION, ON THE ROW ───────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS. Until 14 Aug 2026 an EU combustion row printed a per-litre factor, cited IPCC, and
// left `note` EMPTY — the one field whose purpose is to show a convert-then-apply step. Fuel oil and
// steam both populate it; EU combustion, which needs it most, did not. The row therefore asserted
// that its cited source had published a figure that source has never published.
//
// EACH NOTE MUST state the arithmetic a verifier can retype and name the document, table and row each value came
// from (FI3, R10). A specification that only BOUNDS a value (a range, or IPCC Table 1.1's "more than 0.90 kg/l" for
// residual oil) is never a source for it; since FI3 every density here is one JEC prints as a single value.
//
// KEYED ON THE FACTOR KEY, and pushFuel now takes that key and looks the factor up ITSELF, so the
// note and the number are derived from the same key by construction. Passing both separately would
// let a row cite one fuel's derivation beside another fuel's factor.
const EU_DERIVATION: Partial<Record<string, string>> = {
  // FI3: each note states the arithmetic and names every document a value came from (R10). Plain sentences.
  diesel_litre:
    '74.1 t CO₂/TJ × 43.0 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil) × 832 kg/m³ (JEC Well-to-Tank report v5, ' +
    'Annexes section 4.1, Diesel) = 2.65100 kg CO₂/L. CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV and density.',
  fuel_oil_residual_litre:
    '77.4 t CO₂/TJ × 40.4 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Residual fuel oil) × 970 kg/m³ (JEC Well-to-Tank report v5, ' +
    'Annexes section 4.1, HFO) = 3.03315 kg CO₂/L. CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV and density.',
  diesel_kg:
    'Published on a mass basis: 74.1 t CO₂/TJ × 43.0 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil) = 3.1863 kg CO₂/kg. ' +
    'CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV.',
  fuel_oil_distillate_kg:
    'Published on a mass basis: 74.1 t CO₂/TJ × 43.0 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Gas/Diesel oil, which includes light ' +
    'heating oil: IPCC 2006 Vol. 2 Ch. 1 Table 1.1) = 3.1863 kg CO₂/kg. CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV.',
  fuel_oil_residual_kg:
    'Published on a mass basis: 77.4 t CO₂/TJ × 40.4 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Residual fuel oil) = 3.12696 kg CO₂/kg. ' +
    'CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same NCV.',
  propane_kg:
    'Published on a mass basis: 63.1 t CO₂/TJ × 47.3 TJ/Gg (EU MRR 2018/2066, Annex VI Table 1, Liquefied petroleum ' +
    'gases) = 2.98463 kg CO₂/kg. IPCC 2006 Table 1.1 defines LPG as propane, butane or a mix of the two. CH4 and N2O: ' +
    'IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3 (LPG), per TJ, on the same NCV.',
  natural_gas_kwh:
    '56.1 t CO₂/TJ on a net basis (EU MRR 2018/2066, Annex VI Table 1, Natural gas) × 0.90 net per gross (IPCC 2006 Vol. 2 Ch. 1 section ' +
    '1.4.1.2, and the notes under Ch. 2 Tables 2.6 to 2.8) × 0.0036 GJ/kWh = 0.181764 kg CO₂ per kWh gross, as ' +
    'billed. CH4 and N2O: IPCC 2006 Vol. 2 Ch. 2, Tables 2.2 and 2.3, per TJ, on the same basis.',
}
// FI9: no mobile key is aliased here any more; fleet rows carry their own note. Heating oil no longer
// aliases to diesel (R8): the two share the Gas/Diesel oil row's NCV and factor, but not a density, and heating oil has
// no litre key. A unit entered in another unit of the same quantity (gallons, tonnes, MJ) converts exactly to the key
// the table holds, and the note is read under that key, so no gallon or tonne alias is needed.
const EU_DERIVATION_ALIAS: Record<string, string> = {}

/** The derivation disclosure for a row, or undefined where the publisher gave us the figure directly. */
function euDerivationNote(loc: Location, key: string): string | undefined {
  if (efJurisdiction(loc) !== 'EU') return undefined
  return EU_DERIVATION[EU_DERIVATION_ALIAS[key] ?? key]
}

// AUSTRALIA: WHERE NGA PRINTS EACH VALUE (FI2 follow-up, 7 Oct 2026, ruling R5). NGA's "Energy - Scope 1" sheet prints a
// combined Scope 1 factor per kL for each liquid fuel and per m³ for each gaseous fuel, beside the energy content and
// per-GJ factor it is built from. Every EF_AU per-unit key is now that printed figure (per kL ÷ 1,000 per litre), so
// the row cites it rather than showing arithmetic. Until then these keys were energy content × per-GJ factor rounded
// to 3 decimal places (2.025, 2.710, 2.319, 1.557), and fi2c's notes showed that arithmetic; they are superseded.
// natural_gas_gj is NGA's own per-GJ figure and, like EPA's per-mmBtu keys, needs no note beyond the citation.
const NGA_SCOPE_1 = 'DCCEEW NGA 2025, Energy - Scope 1 sheet'
const NGA_PER_KL = (fuel: string, perKl: string, table: number) =>
  `${NGA_SCOPE_1} (Table ${table}), ${fuel}: ${perKl} kg CO2-e/kL; per litre is per kL ÷ 1,000`
const AU_PUBLISHED_NOTE: Record<string, string> = {
  natural_gas_m3: `${NGA_SCOPE_1} (Table 5), Natural gas distributed in a pipeline: 2.025129 kg CO2-e/m³`,
  diesel_litre: NGA_PER_KL('Diesel oil', '2,709.72', 8),
  propane_litre: NGA_PER_KL('Liquefied petroleum gas (LPG)', '1,557.42', 8),
  fuel_oil_distillate_litre: NGA_PER_KL('Heating oil', '2,600.929', 8),
  fuel_oil_residual_litre: NGA_PER_KL('Fuel oil', '2,931.448', 8),
}
// Keys that hold the same NGA value as a key above, mapped so the two rows cannot describe it differently. FI9: none
// now; fleet fuel prices from NGA Table 9 (and Table 8 for non-road) through lib/emissionFactors/mobile/nga2025.ts.
const AU_PUBLISHED_ALIAS: Record<string, string> = {}
function auPublishedNote(loc: Location, key: string): string | undefined {
  if (efJurisdiction(loc) !== 'AU') return undefined
  return AU_PUBLISHED_NOTE[AU_PUBLISHED_ALIAS[key] ?? key]
}

// US EPA: THE PUBLISHED COLUMN EACH PER-UNIT KEY IS (FI2 diff 3, ruling R5). Not a derivation: the row says where in
// Table 1 the value is printed, so a verifier finds it without retyping any arithmetic. The per-mmBtu keys are EPA's
// own column too and need no note beyond the citation.
// UK (FI4): where DEFRA prints a value per tonne and the table holds it per kg, the row says so.
const UK_PUBLISHED_NOTE: Record<string, string> = {
  propane_kg: 'DEFRA/DESNZ 2026, Propane, tonnes: 2,997.63233 kg CO2e (factor ID 1_100_1007_15_1); per kg is per tonne ÷ 1,000.',
}
const EPA_TABLE_1 = 'US EPA GHG Emission Factors Hub, Table 1'
const EPA_DISTILLATE_NOTE = `${EPA_TABLE_1}, Distillate Fuel Oil No. 2, per gallon: 10.21 kg CO2, 0.41 g CH4, 0.08 g N2O`
const US_PUBLISHED_NOTE: Record<string, string> = {
  natural_gas_mcf: `${EPA_TABLE_1}, Natural Gas, per scf: 0.05444 kg CO2, 0.00103 g CH4, 0.0001 g N2O; per Mcf is per scf × 1,000`,
  propane_gallon: `${EPA_TABLE_1}, Propane, per gallon: 5.72 kg CO2, 0.27 g CH4, 0.05 g N2O`,
  diesel_gallon: EPA_DISTILLATE_NOTE,
  fuel_oil_gallon: EPA_DISTILLATE_NOTE,
  fuel_oil_distillate_gallon: EPA_DISTILLATE_NOTE,
  fuel_oil_residual_gallon: `${EPA_TABLE_1}, Residual Fuel Oil No. 6, per gallon: 11.27 kg CO2, 0.45 g CH4, 0.09 g N2O`,
}

/**
 * The factor derivations and unit conversions behind the figures these locations price, for the PDF and XLSX methods
 * tables: one line per distinct step, named by the line it prices. FI2 follow-up (7 Oct 2026): built from the same
 * line list, factor pick and steam basis the workings rows use, so the methods tables list every conversion and
 * every derivation a row notes, and nothing a row does not. It listed Australian gas alone until then.
 *   Listed: an exact unit conversion (the entered unit to the unit the publisher prints), and a derived table value
 * (EU_DERIVATION). Not listed: where a published value is printed (US Table 1, NGA), which is a citation, and the NZ
 * gas basis note, which states a basis; both stay on the row. Refused locations and unpriced lines are dropped, as in
 * combustionSourcesFor.
 */
export function factorDerivationsFor(locations: readonly { country?: string }[], sel: Sel): string[] {
  const out: string[] = []
  const words = (u: string) => EXACT_UNITS[u]?.many ?? u
  // The PDF passes its own location shape (the derived locations, typed loosely); read as a Location, as before.
  for (const loc of locations as readonly Location[]) {
    if (countryRefusal(loc)) continue
    for (const line of combustionLines(loc)) {
      const picked = pickEF(loc, line.efKey as keyof typeof EF, sel)
      if (!picked.publisher) continue
      const c = picked.conversion
      if (c) out.push(`${line.source}: ${words(c.from)} converted to ${words(c.to)} (${c.statement}, exact).`)
      // FI9: an EU fleet row is derived through MRR's NCV and JEC's density (R10), so its note is listed, as the EU
      // stationary derivations are.
      const derived = picked.publisher.jurisdiction !== 'EU' ? undefined
        : picked.fleet ? picked.fleet.note : euDerivationNote(loc, picked.key ?? line.efKey)
      if (derived) out.push(`${line.source}: ${derived}`)
    }
    if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
      const priced = steamPricingOrMissing(loc, sel)
      const from = loc.purchased_steam_unit ?? 'mmbtu'
      const c = priced && from !== priced.basis ? exactConversion(from, priced.basis) : null
      if (c) out.push(`Purchased steam: ${words(from)} converted to ${words(priced!.basis)} (${c.statement}, exact).`)
      // R14: an estimated steam factor is a derivation, so the PDF and XLSX methods tables carry its note too.
      if (priced?.estimated) out.push(`Purchased steam: ${priced.estimated.note}`)
    }
  }
  return [...new Set(out)]
}

// Australia combustion factors — DCCEEW National Greenhouse Accounts (NGA) Factors 2025 (AR5 basis).
// NGA publishes an energy-content factor (GJ/unit) and a combined Scope 1 EF per GJ; effective per-unit
// values are PRE-COMPUTED here (energy_content × combined-EF/GJ) and stored AS-IS in `co2` with ch4:0,
// n2o:0 — so calcGas reproduces the NGA-derived figure exactly and AU intentionally does NOT respond to
// the AR4/AR5/AR6 toggle (AR5 is already baked into the published combined EF). Metric units (m³, litres).
// ── END-USE SECTOR: NO CHOICE EXISTS. NGA Tables 4 and 8 are keyed by FUEL and energy content, not
// by end-use sector, for every fuel used below. As with EF_UK the stored values are combined CO2e
// (ch4/n2o at 0), so no sector-varying gas split is being collapsed. Recorded so the absence of a
// sector note here reads as "the publisher offers none" rather than "nobody looked".
const EF_AU = {
  // FI2 follow-up (7 Oct 2026): every per-unit key below is NGA's own printed figure from the "Energy - Scope 1" sheet,
  // per m³ as printed and per litre as the printed per-kL ÷ 1,000 (exact), cited on the row by AU_PUBLISHED_NOTE. They
  // were the same products rounded to 3 decimal places, and natural gas was cited to Table 4: it is Table 5, and the
  // liquids are Table 8. (The sheet's per-unit column is NGA's own G × F formula; it is the figure NGA publishes.)
  // Natural gas distributed in a pipeline (Table 5): 0.0393 GJ/m³ × 51.53 kg CO2-e/GJ, printed 2.025129 kg CO2-e/m³.
  natural_gas_m3: { co2: 2.025129, ch4: 0, n2o: 0 },
  // T10a: the same NGA factor on an ENERGY basis, for bills that print energy (MJ or GJ) rather than volume.
  // NGA publishes it per GJ, so no energy content is assumed: 51.53 kgCO2e/GJ × 1.05505585262 GJ/MMBtu
  // = 54.3670 → 54.367 kg/MMBtu (MMBtu is the canonical energy unit lib/unitConversions converts GJ and MJ to).
  // FI2 diff 2: NGA's OWN figure, per GJ (Table 5, gross basis; this said Table 4 until 7 Oct 2026). Every other energy unit (kWh, MJ, MMBtu, therms)
  // converts to it exactly; the derived per-MMBtu 54.367 that sat here is gone.
  natural_gas_gj: { co2: 51.53, ch4: 0, n2o: 0 },
  // Diesel oil (Table 8): 38.6 GJ/kL × 70.2 kg CO2-e/GJ, printed 2,709.72 kg CO2-e/kL (was 2.710 per litre, cited "Table 4/Table 1").
  diesel_litre: { co2: 2.70972, ch4: 0, n2o: 0 },
  // FI9 (R16): no mobile key here. Fleet fuel prices from NGA Table 9 (and Table 8 for non-road equipment, under the
  // NGER Determination s 2.41(2)) through lib/emissionFactors/mobile/nga2025.ts.
  // Liquefied petroleum gas (LPG) (Table 8): 25.7 GJ/kL × 60.6 kg CO2-e/GJ, printed 1,557.42 kg CO2-e/kL (was 1.557, cited Table 4).
  propane_litre: { co2: 1.55742, ch4: 0, n2o: 0 },
  // GRADE-EXPLICIT KEYS: DCCEEW NGA 2025 Table 8. Held per litre like the keys above (FI2: a US-gallon figure converts
  // to litres exactly at pricing; the per-gallon keys that once sat here are gone).
  // ── PER-LITRE KEYS: NGA's printed per-kL figures (Heating oil 2,600.929, Fuel oil 2,931.448) ÷ 1,000. These were
  // already at full precision, so they do not move; they equal the product NGA prints:
  //   heating oil 37.3 GJ/kL x 69.73 kgCO2e/GJ / 1000 = 2.600929 kg/L
  //   fuel oil    39.7 GJ/kL x 73.84 kgCO2e/GJ / 1000 = 2.931448 kg/L
  // Carried at full precision rather than this table's usual 3dp rounding, matching what the
  // gallon keys were built from — rounding here would move the figure instead of re-basing it.
  fuel_oil_distillate_litre: { co2: 2.600929, ch4: 0, n2o: 0 },
  fuel_oil_residual_litre: { co2: 2.931448, ch4: 0, n2o: 0 },
  // FI2 diff 2: no gallon keys and no US fallthrough. A fuel-oil figure in US gallons converts to litres exactly.
}

// New Zealand combustion factors — MfE "Measuring Emissions" 2026 (v2). Published per-unit directly, so
// stored AS-IS in `co2` with ch4:0, n2o:0 (like EF_UK/EF_AU) — reproduces the MfE figure exactly and does
// NOT respond to the AR toggle. Use-class selectable: Commercial (default) / Industrial only — the MfE
// stationary-combustion workbook has NO Residential row for these fuels (only coal), so Residential is
// intentionally absent (we do not invent factors). NG is per kWh; LPG is per kg (MfE publishes kg, engine
// gains a kg input path); liquids per litre. Petrol has NO stationary factor in MfE. FI9 (R16): fleet fuel, petrol and
// diesel, prices from MfE's Transport Fuel rows through lib/emissionFactors/mobile/mfe2026.ts, not from this table.
// ── END-USE SECTOR: THE ONLY TABLE WITH A SELECTOR, AND THE PRECEDENT FOR THE OTHERS ────────────
// MfE publishes stationary combustion by use class, and this is the one table where the customer
// picks: Location.nz_use_class ('commercial' | 'industrial', defaulting to commercial), read by
// pickEF's NZ branch and offered in the wizard ("Use class: Commercial (change)").
//
// FI10 (7 Oct 2026): THE USE CLASS IS DISCLOSED WHEREVER IT PRICED SOMETHING. Every row priced from this table, and
// the NZ steam estimate (R14) that reads its gas factor, carries factor_variant ('Commercial use class' or 'Industrial
// use class'). It is shown in the Factor source cell (workings table, review table, verifier page), in the NZ
// combustion citation of the PDF and XLSX methods lists, and in factor_editions, so two years differing only in use
// class compare as changed. It is the model for the open items on EF_CA and EF_EU: a selector added there carries the
// same disclosure through the same field.
// UNCHANGED BY THE 14 Aug 2026 sector-documentation pass — that pass added comments only.
const EF_NZ = {
  commercial: {
    natural_gas_kwh: { co2: 0.19543, ch4: 0, n2o: 0 },   // MfE Stationary Combustion, Commercial
    diesel_litre: { co2: 2.6759, ch4: 0, n2o: 0 },
    propane_kg: { co2: 2.97164, ch4: 0, n2o: 0 },        // LPG per kg (MfE)
    // MfE Measuring Emissions Catalogue 2026 Table 3.2, per-gas columns already AR5-multiplied, so the
    // combined kgCO2e/L goes in `co2` like every other NZ key. Per US GALLON: the fuel-oil path
    // converts before pricing. Light 2.97088 x 3.785411784 = 11.246004; Heavy 3.05359 -> 11.559096.
    // PER-LITRE, MfE's own printed kg CO2-e/L. (FI2 diff 2: the per-gallon keys built from these are gone.)
    fuel_oil_distillate_litre: { co2: 2.97088, ch4: 0, n2o: 0 },
    fuel_oil_residual_litre: { co2: 3.05359, ch4: 0, n2o: 0 },
  },
  industrial: {
    natural_gas_kwh: { co2: 0.195067, ch4: 0, n2o: 0 },  // MfE Stationary Combustion, Industrial
    diesel_litre: { co2: 2.66873, ch4: 0, n2o: 0 },
    propane_kg: { co2: 2.96632, ch4: 0, n2o: 0 },
    // MfE 2026 Table 3.2, Industrial. Light 2.96335 x 3.785411784 = 11.217500; Heavy 3.04601 -> 11.530402.
    // PER-LITRE — MfE 2026 Table 3.2 Industrial, printed values.
    fuel_oil_distillate_litre: { co2: 2.96335, ch4: 0, n2o: 0 },
    fuel_oil_residual_litre: { co2: 3.04601, ch4: 0, n2o: 0 },
  },
}

// ── THE DEFRA/DESNZ PUBLICATION ─────────────────────────────────────────────────────────────────────
// The citation, the licence and the attribution it requires live in lib/ghg/defraPublication.ts, which
// imports nothing, so the methodology page can read them without the engine. Re-exported here for every
// existing importer.
import { DEFRA_DESNZ_PUBLICATION, defraCitation, sourceAttributionsFor, type SourceAttribution } from './defraPublication'
export { DEFRA_DESNZ_PUBLICATION, defraCitation, sourceAttributionsFor, type SourceAttribution }

/** The attributions an inventory's locations require: from the same citations its exports print. */
export function sourceAttributionsForLocations(locations: readonly { country?: string }[], sel: Sel): SourceAttribution[] {
  return sourceAttributionsFor([...combustionSourcesFor(locations, sel), ...gridSourcesFor(locations)])
}

/** Where, inside a publication, a factor was read from. Separate from the citation by design. */
export type FactorLocator = {
  /** The publisher's name for the download: 'Full set', 'Condensed set', 'Flat file'. null = not recorded. */
  factor_set: string | null
  /** The workbook's own Version cell, as printed. null = not recorded when the factor was transcribed. */
  file_version: string | null
  /** The sheet or tab. */
  sheet: string | null
  /** The row path within the sheet, as the publisher labels it. null = not recorded. */
  row: string | null
}

/**
 * Locators for the citations that have one. RECORDED, NOT INFERRED: each field says what was noted when
 * the factor was transcribed, and null where nothing was — a version this repo never wrote down is not
 * supplied after the fact, even where a later check found the same value (see the Part A report).
 */
const EF_SOURCE_LOCATORS: Partial<Record<keyof typeof EF_SOURCES, FactorLocator>> = {
  // EF_UK header: "(full set, Fuels tab)". No version recorded.
  combustion_uk: { factor_set: 'Full set', file_version: null, sheet: 'Fuels', row: null },
  // EF_UK.steam_kwh: "flat file v1.2 (updated 2026-07-10), Scope 2 sheet, 'Heat and steam' > 'District heat and steam'".
  steam_uk: { factor_set: 'Flat file', file_version: '1.2', sheet: 'Scope 2', row: 'Heat and steam > District heat and steam' },
  // GRID_EF.UK: DEFRA/DESNZ "UK electricity" generation factor. File, version and row not recorded.
  electricity_uk: { factor_set: null, file_version: null, sheet: 'UK electricity', row: null },
}

/**
 * A citation with its locator appended, for a WORKINGS ROW, where a verifier needs the table and not only
 * the publication. Never stored as a factor_editions `source`: that stays the bare citation, so a change
 * of sheet or file version cannot read as a change of edition.
 */
function citeWithLocator(key: keyof typeof EF_SOURCES): string {
  const loc = EF_SOURCE_LOCATORS[key]
  if (!loc) return EF_SOURCES[key]
  const file = [loc.factor_set?.toLowerCase(), loc.file_version && `v${loc.file_version}`].filter(Boolean).join(' ')
  const where = [file, loc.sheet && `${loc.sheet} sheet`, loc.row].filter(Boolean).join(', ')
  return where ? `${EF_SOURCES[key]} — ${where}` : EF_SOURCES[key]
}

const EF_SOURCES = {
  // T3c: the held values are the 2025 workbook (factorEditionRegistry, epa_hub_combustion), so the citation says 2025.
  combustion: 'US EPA (2025) Emission Factors for Greenhouse Gas Inventories',
  combustion_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  combustion_uk: defraCitation(2026),
  // ⚠️ NAMES THE DENSITY CONVERSION, AND THAT CLAUSE IS THE POINT OF THE STRING.
  // This read 'IPCC (2006) Guidelines Vol.2 — Tier 1 default combustion factors' until 14 Aug 2026,
  // printed on a PER-LITRE figure. Both cited sources publish on a MASS basis (t CO2/TJ and TJ/Gg);
  // neither publishes a density. So the row told a verifier that IPCC had published a number IPCC has
  // never published, and the note field that exists to show the conversion was empty. A verifier
  // opening Vol.2 to check 2.68924 kg CO2/L found TJ/Gg and no such figure, with nothing joining them.
  //   MRR Annex VI is named FIRST because it is the EU-applicable instrument — directly applicable law
  // for EU installations — and it carries the same values with "IPCC 2006 GL" as its own stated source.
  // Citing both gives the verifier the legal instrument and the underlying science.
  //   ⚠️ TWO TESTS CONSTRAIN THIS STRING. F16 requires every token of COMBUSTION_EDITION.EU
  // ('IPCC 2006') to appear in it; F17 requires a four-digit year in parentheses. Keep '(2006)'.
  combustion_eu: 'EU MRR Reg. (EU) 2018/2066 Annex VI Table 1; IPCC 2006 Vol. 2 Ch. 1 and 2; densities from the JEC Well-to-Tank report v5 (EU JRC)',
  combustion_au: 'DCCEEW NGA 2025 (AR5)',
  combustion_nz: 'NZ MfE Measuring Emissions 2026 v2 (as-published basis — factors stored verbatim, no AR re-basing)',
  // ── STEAM / DISTRICT HEAT — NAMED TO THE TABLE, UNLIKE combustion ─────────────────────────────
  // These cite the exact table, which combustion above does NOT ('US EPA (2024) Emission Factors for
  // Greenhouse Gas Inventories' names a workbook, not a row). Steam had been citing that same string,
  // so a verifier reading a steam row and a stationary-combustion row saw one identical citation for
  // two different tables with different assumptions behind them. Cheap to fix here because each steam
  // factor now carries its own source in STEAM_EF; the general citation-granularity question for the
  // combustion_* family is untouched and still open.
  steam_us: 'US EPA (2025) GHG Emission Factors Hub, Table 7 — Steam and Heat (natural gas at 80% thermal efficiency; combustion only, tank-to-wheel)',
  // Canonical since 17 Sep 2026. The table it cites — flat file v1.2, Scope 2, District heat and steam —
  // is in EF_SOURCE_LOCATORS.steam_uk and reaches the workings row through STEAM_EF.UK.source.
  steam_uk: defraCitation(2026),
  // ── T3d: THE OLDER HELD EDITIONS, ONE CITATION EACH ─────────────────────────────────────────────────────────────
  // The keys above name the newest edition a jurisdiction holds. A row priced on an older held edition cites one of
  // these instead (EDITION_CITATION), so a 2024 row never names the 2026 document. Values: lib/ghg/factors/.
  edition_desnz_2023: `${defraCitation(2023)}, full set v1.1 (as updated 28 Jun 2023)`,
  edition_desnz_2024: `${defraCitation(2024)}, full set v1.1 (as corrected 30 Oct 2024)`,
  edition_desnz_2025: `${defraCitation(2025)}, full set v1`,
  edition_nga_2026: 'DCCEEW NGA 2026, Table 1, Scope 2 (location-based)',
  edition_nga_2026_combustion: 'DCCEEW NGA 2026 (AR5), Energy - Scope 1 sheet (Tables 5 and 8)',
  edition_nga_2026_mobile: 'DCCEEW NGA 2026, Table 9 (transport) and Table 8 (non-road equipment)',
  edition_nga_2026_residual: 'DCCEEW NGA 2026, Table 2: national Residual Mix Factor, Scope 2 (see residual_au)',
  edition_epa_2023: 'US EPA (2023) Emission Factors for Greenhouse Gas Inventories',
  edition_epa_2023_mobile: 'US EPA GHG Emission Factors Hub 2023 (Last Modified 12 September 2023), Tables 2 to 5, mobile combustion',
  edition_nga_2023: 'DCCEEW NGA 2023, Table 1, Scope 2 (location-based)',
  edition_nga_2023_combustion: 'DCCEEW NGA 2023 (AR5), Tables 5 and 8, energy content x combined Scope 1 factor as printed',
  edition_nga_2023_mobile: 'DCCEEW NGA 2023, Table 9 (transport) and Table 8 (non-road equipment)',
  edition_nga_2023_residual: 'DCCEEW NGA 2023, Table 2a: national Residual Mix Factor, Scope 2 (see residual_au)',
  edition_mfe_2023: 'NZ MfE Measuring Emissions 2023 (as-published basis: factors stored verbatim, no AR re-basing)',
  edition_aib_2023: 'AIB European Residual Mixes 2023 (Version 1.0, 2024-05-30, Grexel/AIB): combined CO₂e, gCO₂/kWh.',
  edition_eea_2023_revised: 'EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, data year 2023 as revised in the data year 2024 release (the final 2023 inventory)',
  edition_epa_2024: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  edition_epa_2024_mobile: 'US EPA GHG Emission Factors Hub 2024 (Last Modified 5 June 2024), Tables 2 to 5, mobile combustion',
  edition_nga_2024: 'DCCEEW NGA 2024, Table 1, Scope 2 (location-based)',
  edition_nga_2024_combustion: 'DCCEEW NGA 2024 (AR5), Tables 5 and 8, energy content x combined Scope 1 factor as printed',
  edition_nga_2024_mobile: 'DCCEEW NGA 2024, Table 9 (transport) and Table 8 (non-road equipment)',
  edition_nga_2024_residual: 'DCCEEW NGA 2024, Table 2: national Residual Mix Factor, Scope 2, on the same financial-year basis as the 2025 edition (see residual_au)',
  edition_mfe_2024: 'NZ MfE Measuring Emissions 2024 (as-published basis: factors stored verbatim, no AR re-basing)',
  edition_mfe_2025: 'NZ MfE Measuring Emissions 2025 v3 (as-published basis: factors stored verbatim, no AR re-basing)',
  edition_eccc_v4: 'ECCC (2026) Emission factors and reference values v4.0, Table 5.4 (NIR 1990-2024)',
  edition_eccc_nir_2026_mobile: 'ECCC National Inventory Report 1990 to 2024 (2026), Annex 6, Table A6.1-15, mobile combustion',
  edition_aib_2025: 'AIB European Residual Mixes 2025 (Version 1.0, 2026-05-26, Grexel/AIB): combined CO₂e, gCO₂/kWh.',
  edition_eea_2024: 'EEA (2025) Greenhouse gas emission intensity of electricity generation, country level, data year 2024 (as modified 10 Jul 2026)',
  // Not a published table: the customer's own supplier figure. Named so a verifier can see instantly
  // that this row was NOT priced from a national default, which is the whole point of allowing it.
  steam_supplier: 'Supplier-specific factor supplied by the district energy provider (see row note)',
  // KEPT — exported, and still read by the methodology summary in app/dashboard/ghg/page.tsx as a
  // catalogue of every grid source this engine can apply. It must NOT be used on a workings row:
  // a verifier reading one row needs the ONE source that priced it, not the six it might have been.
  electricity: 'US EPA eGRID2023 (US) / ECCC v3.0 and v4.0 (CA) / DEFRA 2023 to 2026 (UK) / EEA 2023 and 2024 (EU) / DCCEEW NGA 2023 to 2026 (AU) / NZ MfE 2026 (NZ)',
  // The catalogue above, split so gridSource() can resolve the one actually applied.
  electricity_us: 'US EPA eGRID2023',
  electricity_ca: 'ECCC (2025) Emission factors and reference values v3.0',
  // ⚠️ YEAR-NEUTRAL, UNLIKE combustion_uk — deliberately. GRID_EF.UK now holds 2025 AND 2026, and
  // gridSource() returns one string whatever year priced the row. Naming an edition here would
  // contradict factor_vintage on the other half of the table: a 2025 inventory would read
  // "DEFRA (2026)" beside "factor_vintage 2025". The vintage column already carries the year, so the
  // citation names the document family and the two together are unambiguous. Re-add a year here only
  // if GRID_EF.UK ever collapses back to a single edition.
  electricity_uk: defraCitation(),
  electricity_eu: 'EEA (2023) Greenhouse gas emission intensity of electricity generation',
  electricity_au: 'DCCEEW NGA 2025',
  electricity_nz: 'NZ MfE Measuring Emissions 2026 v2',
  residual_us: 'Green-e Residual Mix 2025 (2023 data, publ. 2026-01-29, CRS) — residual CO₂; eGRID2023 Rev2 (publ. 2025-06-12) CH₄/N₂O. Green-e factors out Green-e-certified voluntary sales (the only published US residual source per CRS).',
  residual_eu: 'AIB European Residual Mixes 2024 (publ. 2025-05-30, Grexel/AIB; Ecoinvent CO₂ inputs) — combined CO₂e, gCO₂/kWh.',
  residual_au: 'DCCEEW NGA 2025, Table 2 — national Residual Mix Factor, 0.81 kg CO₂-e/kWh Scope 2. Calculated on a FINANCIAL-YEAR basis (years ending June) with a lag adjustment using a 3-year average, because Large-scale Generation Certificates are created on a CALENDAR-year basis up to 12 months after the generation they represent. National aggregate only — see RESIDUAL_AU.',
  // ⚠️ NOTHING IS SELECTABLE. gwp_ar4 and gwp_ar5 said "selectable alternate" from f83326a (20 Jun 2026)
  // until 17 Sep 2026; git history holds no selector, parameter or saved preference by which any inventory
  // could choose either, then or since. The basis comes from FRAMEWORKS[].gwp, which is AR6 for all six.
  //   AR5 is still NAMED because published factors arrive on it: DEFRA/DESNZ UK combustion and district
  // heat, DCCEEW and NZ MfE combustion are combined on AR5 by their publishers (see EF_UK, EF_AU, EF_NZ,
  // STEAM_EF.UK) and applied as published. AR4 is named for history only: no factor applied is recorded
  // as AR4. Neither string names a publisher, so sourceAttributionsFor never reads them as a citation.
  gwp_ar4: 'IPCC AR4 (2007) — not applied. No emission factor ThemisIQ uses is recorded on AR4. SB 253 was calculated on AR4 until June 2026 and has used AR6 since.',
  gwp_ar5: 'IPCC AR5 (2014) — not applied by ThemisIQ. Some published factors arrive with the gases already combined on AR5 (the UK, Australian and New Zealand fuel factors and UK district heat); those are used as published and their workings rows say so.',
  gwp_ar6: 'IPCC AR6 (2021) — the GWP set for every framework (SB 253, CDP, ESRS E1, GRI 305, EcoVadis, IFRS S2), applied wherever ThemisIQ combines CO₂, CH₄ and N₂O itself. There is no setting to change it.',
}

// ── THE EDITION LABEL PER JURISDICTION — ONE DECLARATION, TWO CONSUMERS ──────────────────────────
//
// The short label naming which published edition priced a row: the workings column `factor_vintage`,
// and `ghg_inventories.factor_editions` via lib/ghg/factorEditions.ts. BOTH MAPS MOVED HERE ON
// 14 AUG 2026; until then they were declared inside factorEditions.ts and the workings table had
// no access to them, which is why every combustion and steam row rendered its vintage as '—' while
// the grid, T&D and residual rows beside it carried theirs. The verifier reading one inventory saw
// the edition recorded in one place and blank in another, for the same factor.
//
// They cannot live in factorEditions.ts: that module imports this one, so this one cannot import back.
// Here is also the honest home — this is the file that owns EF, EF_CA, EF_UK, EF_EU, EF_AU and EF_NZ,
// and an edition label is a fact about those tables.
//
// ⚠️ DECLARED, NOT PARSED. No regex runs over citation prose, and that is a deliberate answer rather
// than convenience. A regex is not merely fragile here, it is already WRONG against the current table.
// The obvious pattern — the year in parentheses, /\((\d{4})\)/ — matches five of the six citations and
// misses Australia outright, because DCCEEW's parenthesised token is not a year:
//     'DCCEEW NGA Factors 2025 (AR5)'   →  captures nothing; a laxer pattern captures "AR5"
// The looser alternative, first four-digit run, gets Australia right and is one edit away from being
// wrong elsewhere: any citation that ever names a standard number, a directive year or a page range
// before its edition silently yields the wrong answer, with no failure to notice.
//
// So the label is written down. It is a second copy of a fact — the risk that always comes with a
// declaration — and EDITION LABELS MATCH THEIR CITATION (factorEditions.test.ts) is the test that
// closes it, asserting every whitespace-separated token of each label appears in the citation it
// claims to summarise. Refreshing a factor table without updating its label fails there, loudly,
// naming both strings.
// Emits `factor_vintage` only when the location HAS a jurisdiction. An absent key is how a
// workings row says "no published edition", which is already the shape STEAM_EDITION uses for the
// four jurisdictions with no steam factor: the column renders a dash, rather than a publication's
// name attached to a figure that publication did not produce.
function vintageOf(
  editions: Record<EfJurisdiction, string> | Partial<Record<EfJurisdiction, string>>,
  loc: { country?: string },
): { factor_vintage?: string } {
  const j = efJurisdiction(loc)
  const v = j === null ? undefined : editions[j]
  return v ? { factor_vintage: v } : {}
}

// ── T3c: FACTOR EDITIONS ARE CHOSEN BY selectEdition, NEVER SUBSTITUTED ─────────────────────────────────────────
// Rulings: docs/review/factor-year-selection.md section 8 (8.1 to 8.7) and design section 10 (R17 to R20). Every
// year-keyed factor is read through editionFor, which asks the registry (lib/ghg/factorEditionRegistry.ts) which
// edition the reporting WINDOW needs, prepared on a date. There is no nearest-year lookup anywhere: a required edition
// that is not held throws MissingEditionError, and the caller leaves THAT LINE unpriced with an export-blocking issue
// (edition_missing); an edition not yet published is priced on the newest published one, provisionally (R19).
/** T3c: the frozen class (b) selections an inventory carries, by dataset, as selectEdition takes them. Read from the
 *  saved column (StoredFactorSelection) by lib/ghg/factorSelection.ts, for the inventory's current window only. */
export type FactorSelection = Partial<Record<DatasetId, FrozenSelection>>
/** One entry of `ghg_inventories.factor_selection` (T3c diff 3): a class (b) edition chosen on `selected_on` for the
 *  reporting window `window` ("yyyy-mm-dd/yyyy-mm-dd", ruling A of 8 Oct 2026). Only data_year_match and
 *  data_year_newest selections are stored (ruling D); a provisional or class (a) selection is never frozen. */
export interface StoredSelectionEntry { edition: string; data_year: number | null; rule: 'data_year_match' | 'data_year_newest'; selected_on: string; window: string }
export type StoredFactorSelection = Partial<Record<DatasetId, StoredSelectionEntry>>
/** What a caller passes: when the inventory was prepared (default: now), any frozen class (b) selections, and, for a
 *  save, a map that records every edition the calculation used (lib/ghg/savePayload.ts writes the column from it). */
export interface SelectionContext {
  preparedOn?: Date; frozen?: FactorSelection; record?: Map<DatasetId, EditionUse>
  /** F-06: the editions the rules required and were not held, by dataset, recorded like `record`. */
  recordMissing?: Map<DatasetId, string>
  /** F-06 only (lib/ghg/factorEditionComparison.ts): price `dataset` with this edition, as another year's
   *  calculation selected it, to measure what a change of edition alone does to this year's figures. Never set by
   *  a save or a surface: no figure anyone reports is priced through it. */
  override?: Partial<Record<DatasetId, EditionUse>>
  /** T18 diff 4: a calculation with nothing saved (the free calculator, or a new inventory before its first save). A
   *  class (b) edition chosen as the newest is then worded as selected today for this calculation, since nothing is
   *  kept until a save. Set only by the page for an inventory with no id; a save and every saved surface never set it. */
  unsaved?: true
}
/** The resolved context every selector takes: the reporting window, its year and the preparation date. */
export interface Sel {
  year: number; win: { start: Date; end: Date }; preparedOn: string; frozen?: FactorSelection; record?: Map<DatasetId, EditionUse>
  recordMissing?: Map<DatasetId, string>; override?: Partial<Record<DatasetId, EditionUse>>; unsaved?: true
}
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
/** The selection context for a reporting year and year end, prepared on `ctx.preparedOn` (today when not given). */
export function selectionFor(year: number, fiscalYearEndMonth: number | null | undefined = 12, ctx: SelectionContext = {}): Sel {
  const w = periodFromYearAndEnd(year, fiscalYearEndMonth ?? 12)
  return { year, win: { start: w.start, end: w.end }, preparedOn: isoDay(ctx.preparedOn ?? new Date()), ...(ctx.frozen ? { frozen: ctx.frozen } : {}),
    ...(ctx.record ? { record: ctx.record } : {}), ...(ctx.recordMissing ? { recordMissing: ctx.recordMissing } : {}),
    ...(ctx.override ? { override: ctx.override } : {}), ...(ctx.unsaved ? { unsaved: true as const } : {}) }
}
/** The edition a line was priced with, and what its workings row says about it. `key` is the table key: the data year
 *  for class (b), the edition year for class (a), null for an exempt default. */
export interface EditionUse {
  dataset: DatasetId; key: number | null; label: string; rule: SelectionRule; basis: string
  published: string; corrected: string | null; provisional: boolean; selected_on?: string
}
/** T3c: the edition the rules require is not held (or nothing is published). The line is unpriced, never zero. */
export class MissingEditionError extends Error {
  readonly name = 'MissingEditionError'
  constructor(readonly dataset: DatasetId, readonly edition: string, readonly reason: 'not_held' | 'no_date' | 'nothing_published', readonly basis: string) {
    super(basis)
  }
  /** The message with the site named, as every other blocking message names it. */
  forSite(site: string): string { return this.basis.replace('so this line is not counted', `so this line at ${site} is not counted`) }
}
const EDITION_MEMO = new Map<string, EditionUse | MissingEditionError>()
/** The edition `dataset` is priced with for `sel`, or MissingEditionError. Pure; memoised on its inputs. */
export function editionFor(dataset: DatasetId, sel: Sel): EditionUse {
  // F-06: a comparison pricing this year's activity at another year's edition (never a reported figure).
  const forced = sel.override?.[dataset]
  if (forced) { sel.record?.set(dataset, forced); return forced }
  const frozen = sel.frozen?.[dataset]
  const k = [dataset, isoDay(sel.win.start), isoDay(sel.win.end), sel.year, sel.preparedOn, frozen ? `${frozen.label}@${frozen.selected_on}` : '', sel.unsaved ? 'unsaved' : ''].join('|')
  let hit = EDITION_MEMO.get(k)
  if (!hit) {
    const r = selectEdition(dataset, sel.win, sel.year, sel.preparedOn, frozen, undefined, { unsaved: !!sel.unsaved })
    if ('missing' in r) hit = new MissingEditionError(dataset, r.missing.edition, r.missing.reason, r.missing.basis)
    else {
      const c = 'provisional' in r ? r.provisional : r
      const e = c.edition
      hit = { dataset, key: e.dataYear ?? e.editionYear ?? null, label: e.label, rule: c.rule, basis: c.basis,
        // R20: an edition with no printed date is dated "on or before" the earliest date it is proven to exist.
        published: e.published.date ? registryDateInWords(e.published.date)
          : e.published.onOrBefore ? `on or before ${registryDateInWords(e.published.onOrBefore.date)}` : '',
        corrected: c.correction && c.correctionHeld ? registryDateInWords(c.correction.date) : null,
        provisional: 'provisional' in r, ...(c.selected_on ? { selected_on: c.selected_on } : {}) }
    }
    EDITION_MEMO.set(k, hit)
  }
  if (hit instanceof MissingEditionError) { sel.recordMissing?.set(dataset, hit.edition); throw hit }
  // T3c diff 3: a save records what it used, so the class (b) choices can be frozen (lib/ghg/factorSelection.ts).
  sel.record?.set(dataset, hit)
  return hit
}
/** The fields every factor row carries (T3c). factor_vintage is the edition label. */
export function editionCells(u: EditionUse) {
  return { factor_vintage: u.label, factor_edition: u.label, selection_rule: u.rule, selection_basis: u.basis,
    edition_published: u.published, ...(u.corrected ? { edition_corrected: u.corrected } : {}), provisional: u.provisional,
    ...(u.selected_on ? { selected_on: u.selected_on } : {}) }
}
/** The registry dataset each jurisdiction's stationary combustion table belongs to. The EU table is MRR Annex VI with
 *  IPCC 2006 defaults: exempt, a fixed default (R17). */
const COMBUSTION_DATASET: Record<EfJurisdiction, DatasetId> = {
  US: 'epa_hub_combustion', CA: 'eccc_combustion', UK: 'desnz_combustion', EU: 'ipcc2006', AU: 'nga_combustion', NZ: 'mfe_combustion',
}
/** Purchased steam: only the US and the UK publish a factor (STEAM_EF); the R14 estimate takes its gas factor's edition. */
const STEAM_DATASET: Partial<Record<EfJurisdiction, DatasetId>> = { US: 'epa_hub_steam', UK: 'desnz_steam' }
/** The registry dataset a GRID_EF region belongs to. */
function gridDataset(region: string): DatasetId {
  if (region === 'UK') return 'desnz_grid'
  if (region === 'NZ') return 'mfe_grid'
  if (region.startsWith('US_')) return 'egrid'
  if (region.startsWith('EU_')) return 'eea_grid'
  if (region.startsWith('AU_')) return 'nga_grid'
  return 'eccc_grid'   // the Canadian provinces and territories, keyed by ECCC data year
}

// THE HELD EDITION'S LABEL per jurisdiction, for the surfaces that name a table without pricing a line (a catalogue,
// an unpriced line's publisher). Every priced row carries its SELECTED edition instead (editionCells). US: the held
// values are the 2025 workbook (registry), so the label says 2025; it said "US EPA 2024" until T3c.
const COMBUSTION_EDITION: Record<EfJurisdiction, string> = {
  US: 'US EPA 2025',
  CA: 'ECCC 2025 v3.0',
  UK: 'DEFRA 2026',
  EU: 'IPCC 2006',
  AU: 'DCCEEW NGA 2025',
  NZ: 'MfE 2026 v2',
}

/**
 * FI2: THE TABLE A COMBUSTION FACTOR CAME FROM, carried with the value. `publisher` is the citation a workings row
 * prints, `edition` its factor_vintage, `jurisdiction` the table. The shape leaves room for T3c, which keys these
 * tables by edition (`{ publisher, edition?, value }`): a value is always reported with the source that supplied it,
 * never with the location's country.
 */
export interface FactorSource { jurisdiction: EfJurisdiction; publisher: string; edition?: string; provisional?: true }
const COMBUSTION_TABLE_SOURCE: Record<EfJurisdiction, FactorSource> = {
  US: { jurisdiction: 'US', publisher: EF_SOURCES.combustion, edition: COMBUSTION_EDITION.US },
  CA: { jurisdiction: 'CA', publisher: EF_SOURCES.combustion_ca, edition: COMBUSTION_EDITION.CA },
  UK: { jurisdiction: 'UK', publisher: EF_SOURCES.combustion_uk, edition: COMBUSTION_EDITION.UK },
  EU: { jurisdiction: 'EU', publisher: EF_SOURCES.combustion_eu, edition: COMBUSTION_EDITION.EU },
  AU: { jurisdiction: 'AU', publisher: EF_SOURCES.combustion_au, edition: COMBUSTION_EDITION.AU },
  NZ: { jurisdiction: 'NZ', publisher: EF_SOURCES.combustion_nz, edition: COMBUSTION_EDITION.NZ },
}

// PARTIAL, and the four absences are the honest shape: only the US and UK publish a purchased-steam
// factor at all. An entry for the others would assert a table that does not exist, and STEAM_EF
// already says so in its own vocabulary ('unpublished' / 'not_searched').
//
// ⚠️ A SUPPLIER-SPECIFIC FACTOR RECORDS NO EDITION, and that is correct rather than a gap. This label
// answers "which published edition priced this row"; a factor the customer obtained from their own
// district energy provider is not an edition of anything, and inventing a label for it would put a
// publication claim on a private figure. Both consumers gate on that: buildWorkings leaves
// factor_vintage unset on a supplier-priced row, and buildFactorEditions records no steam entry for
// one. The row's own citation (EF_SOURCES.steam_supplier) carries the attribution instead.
const STEAM_EDITION: Partial<Record<EfJurisdiction, string>> = {
  US: 'US EPA 2025 Table 7',
  UK: 'DEFRA 2026',
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
// T18 diff 4: no em dash in a cell a customer and a verifier read.
const GWP_AS_PUBLISHED = 'as published: see factor source'

const GRID_EF: Record<string, Record<number, number>> = {
  // Canadian provinces / territories — ECCC "Emission factors and reference values" v3.0 (Oct 2025) Tables 5.1 to 5.3.
  // T3c: KEYED BY DATA YEAR (the NIR edition each table cites: 5.1 NIR 1990-2021, 5.2 1990-2022, 5.3 1990-2023), not by
  // the calendar year ECCC says each "must be used for" (2023/24, 2025, 2026), which is the offset-system rule; class
  // (b) applies (ruling 8.1, C1). The values are unchanged in v4.0. Data year 2024 (v4.0 Table 5.4) is not held yet.
  ON: { 2021: 0.030, 2022: 0.038, 2023: 0.059 },
  QC: { 2021: 0.0017, 2022: 0.0017, 2023: 0.0019 },
  BC: { 2021: 0.015, 2022: 0.015, 2023: 0.018 },
  AB: { 2021: 0.540, 2022: 0.490, 2023: 0.438 },
  SK: { 2021: 0.730, 2022: 0.670, 2023: 0.631 },
  MB: { 2021: 0.0020, 2022: 0.0014, 2023: 0.0025 },
  NB: { 2021: 0.300, 2022: 0.350, 2023: 0.234 },
  NS: { 2021: 0.690, 2022: 0.700, 2023: 0.581 },
  PE: { 2021: 0.300, 2022: 0.350, 2023: 0.234 },
  NL: { 2021: 0.017, 2022: 0.018, 2023: 0.017 },
  YT: { 2021: 0.080, 2022: 0.070, 2023: 0.074 },
  NT: { 2021: 0.170, 2022: 0.190, 2023: 0.420 },
  NU: { 2021: 0.840, 2022: 0.820, 2023: 0.800 },
  // T3d: data year 2024 is v4.0 Table 5.4 (NIR 1990-2024), from lib/ghg/factors/eccc-2026.ts, cited per province there.
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
  //   T3d: 2024 and 2025 are read from their edition files (lib/ghg/factors/desnz-2024.ts and -2025.ts), each cited to its
  //   workbook cell; 2025 is the same 0.177 (UK electricity!E26 of the 2025 full set), now with its citation.
  UK: { 2023: DESNZ_2023.grid_uk.value, 2024: DESNZ_2024.grid_uk.value, 2025: DESNZ_2025.grid_uk.value, 2026: 0.13096 },
  // EU member states — EEA "GHG emission intensity of electricity generation, country level" (2023),
  // gCO2e/kWh ÷ 1000. Generation-based, location-based Scope 2. EU_AVG = EEA EU-27 aggregate.
  EU_AT: { 2023: 0.085 }, EU_BE: { 2023: 0.145 }, EU_BG: { 2023: 0.281 }, EU_HR: { 2023: 0.134 },
  EU_CY: { 2023: 0.585 }, EU_CZ: { 2023: 0.440 }, EU_DK: { 2023: 0.094 }, EU_EE: { 2023: 0.690 },
  EU_FI: { 2023: 0.040 }, EU_FR: { 2023: 0.050 }, EU_DE: { 2023: 0.329 }, EU_EL: { 2023: 0.258 },
  EU_HU: { 2023: 0.154 }, EU_IE: { 2023: 0.260 }, EU_IT: { 2023: 0.225 }, EU_LV: { 2023: 0.067 },
  EU_LT: { 2023: 0.124 }, EU_LU: { 2023: 0.056 }, EU_MT: { 2023: 0.342 }, EU_NL: { 2023: 0.263 },
  EU_PL: { 2023: 0.614 }, EU_PT: { 2023: 0.119 }, EU_RO: { 2023: 0.234 }, EU_SK: { 2023: 0.084 },
  EU_SI: { 2023: 0.176 }, EU_ES: { 2023: 0.158 }, EU_SE: { 2023: 0.008 },
  EU_AVG: {},   // T3d 2024: no 2023 value (the EU-27 row of the revised release is not loaded); was 0.210, the superseded estimate
  // T3d: data year 2024 from lib/ghg/factors/eea-2024.ts (the corrected export of 10 Jul 2026), added to each EU_XX key
  // below. EU_AVG has no 2024 value: the EU-27 row ("#N/A" in the export) is not loaded (ruling, 8 Oct 2026).
  // Australia — DCCEEW National Greenhouse Accounts (NGA) Factors 2025, Table 1 Scope 2
  // (kg CO2e/kWh, AR5 basis). Single vintage. State grids; two auto-map decisions:
  //   ACT has no separate grid → shares NSW (mapping done in detectGridRegion).
  //   WA → SWIS (South West Interconnected System, the main WA grid); NT → DKIS
  //   (Darwin-Katherine Interconnected System, the main NT grid). Both mapped in detectGridRegion.
  AU_NSW: { 2025: 0.64 }, AU_VIC: { 2025: 0.78 }, AU_QLD: { 2025: 0.67 },
  AU_SA: { 2025: 0.22 }, AU_WA: { 2025: 0.50 }, AU_TAS: { 2025: 0.20 }, AU_NT: { 2025: 0.56 },
  AU_AVG: { 2025: 0.62 },
  // T3d: NGA 2024 (activity year 2024-25) from lib/ghg/factors/nga-2024.ts, added to each AU key below.
  // New Zealand — MfE "Measuring Emissions" 2026 (v2), national electricity (kg CO2e/kWh).
  // National grid (no sub-national split); year-keyed like the Canadian provinces.
  NZ: {},   // T3d 2024: the printed 2023 to 2025 rows, joined below from lib/ghg/factors/mfe-2026v2-grid.ts (were 0.0766, 0.0994, 0.0787)
}
// T3d: each edition file's values joined onto GRID_EF under its data year (CA, EU) or edition year (AU), so a value is
// typed once, in the file that cites it.
for (const [k, v] of Object.entries(ECCC_TABLE_5_4)) GRID_EF[k][2024] = v.value
for (const [k, v] of Object.entries(EEA_2024)) GRID_EF[k][2024] = v.value
for (const [k, v] of Object.entries(NGA_2024.grid)) GRID_EF[k][2024] = v.value
// T3d 2024: NGA 2023; EEA data year 2023 as revised (ruling 1); the MfE grid rows as printed (ruling 2). ECCC data year 2023
// stays Table 5.3 as v4.0 prints it (ruling 3 reversed, 8 Oct 2026; see the registry note on Table 5.3).
for (const [k, v] of Object.entries(NGA_2023.grid)) GRID_EF[k][2023] = v.value
// T3d 2026: NGA 2026 (activity year 2026-27).
for (const [k, v] of Object.entries(NGA_2026.grid)) GRID_EF[k][2026] = v.value
for (const [k, v] of Object.entries(EEA_2023_REVISED)) GRID_EF[k][2023] = v.value
for (const [y, v] of Object.entries(MFE_GRID_2026V2)) GRID_EF.NZ[Number(y)] = v.value

// New Zealand electricity transmission & distribution (T&D) losses — MfE 2026 (v2), kg CO2e/kWh.
// This is a Scope 3 Category 3 factor, NOT Scope 2; keyed by the MfE series data year, selected by editionFor('mfe_td').
// Added as an optional, separately-labelled line only when a NZ location opts in (nz_td_losses).
// T3d: the 2024 row (data!J1708) and the 2025 row as printed (data!J1712, 0.00595616; it was held rounded as 0.00596), both
// from lib/ghg/factors/mfe-2026v2-td.ts.
const NZ_TD_LOSS: Record<number, number> = { 2023: MFE_TD_2026V2[2023].value, 2024: MFE_TD_2026V2[2024].value, 2025: MFE_TD_2026V2[2025].value }
// The NZ T&D loss factor the window selects (class (b), MfE series data year), kg CO2e/kWh. Scope 3 Cat 3.
// Shared by calcLocation and buildWorkings so the calc term and the workings row never diverge.
//
// It returns its edition with the factor because the caller cannot know it. Before T3c this returned a bare number
// from a nearest-year lookup, and the row printed the INVENTORY year as the factor's vintage over another year's
// figure. T3c removed the lookup: the edition is the one selectEdition chooses, or the line is unpriced
// (MissingEditionError), and editionCells prints that edition's label, rule and basis on the row.
function nzTdLoss(sel: Sel): { ef: number; vintage: string; edition: EditionUse } {
  // T3c: the MfE T&D series row the window selects (class (b), data year). No nearest-year lookup.
  const u = editionFor('mfe_td', sel)
  const ef = NZ_TD_LOSS[u.key as number]
  if (ef === undefined) throw new Error(`The registry holds ${u.label}, but NZ_TD_LOSS has no ${u.key} value.`)
  return { ef, vintage: u.label, edition: u }
}
// ── DEFERRED: Scope 3 Category 3 (upstream / T&D) ELECTRICITY factors — AU + NZ ──────────────
// NOT WIRED HERE. Category 3 electricity is priced in lib/scope3/cat3Energy.ts from DEFRA's upstream factors (a UK
// stand-in outside the UK, flagged on each line), and the NZ T&D losses above (nz_td_losses opt-in) are the engine's own
// line. These Australian and New Zealand primary-source values are captured so they are not lost: AU Category 3 is
// FI6, and they are transcribed into a real line there before being used.
//   Australia: DCCEEW NGA Factors 2025 Scope 3 is transcribed, with citations, in
//     lib/emissionFactors/ngaScope3_2025.ts (FI6 diff 1), and priced in lib/scope3/cat3Energy.ts (FI6 diff 2).
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
  EU_NL: { 2024: AIB_2024_NL.value },   // T3d: "NA", full disclosure (lib/ghg/factors/aib-2024.ts); was 382.47, the CO2 sheet's figure
  EU_PL: { 2024: 808.30 }, EU_PT: { 2024: 501.76 },
  EU_RO: { 2024: 233.02 }, EU_SK: { 2024: 334.33 }, EU_SI: { 2024: 429.45 },
  EU_ES: { 2024: 292.20 }, EU_SE: { 2024: 85.52 },
}
// T3d: AIB 2025 (data year 2025) from lib/ghg/factors/aib-2025.ts; Austria and the Netherlands print "NA" (null).
for (const [k, v] of Object.entries(AIB_2025)) RESIDUAL_EU[k][2025] = v.value
// T3d 2024: AIB 2023 (data year 2023), Table 2's printed figures; Austria "N/A" is null.
for (const [k, v] of Object.entries(AIB_2023)) RESIDUAL_EU[k][2023] = v.value

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
// SCOPE 3 IS NOT HELD HERE. Table 2's Scope 3 figure, with NGA's Scope 3 electricity by state (Table 1)
// and natural gas by state (Table 6), is transcribed in lib/emissionFactors/ngaScope3_2025.ts (FI6 diff 1).
// lib/scope3/cat3Energy.ts reads Tables 1 and 6 for Australian Category 3 (FI6 diff 2); Table 2's Scope 3 figure is
// held there and not read. This table stays Scope 2.
//
// Year key = the WORKBOOK EDITION already cited by EF_SOURCES.electricity_au, so the location-based
// and market-based figures on one AU inventory name the same document.
const RESIDUAL_AU: Record<number, number> = { 2023: NGA_2023.residual.value, 2024: NGA_2024.residual.value, 2025: 0.81, 2026: NGA_2026.residual.value }   // T3d: NGA 2024, Table 2, p. 9

// A grid_region is "resolved" iff it's a real GRID_EF key. 'us_average' (the init default), '' and any
// unmapped string are UNRESOLVED; the deliberate US_AVG/EU_AVG/AU_AVG fallback keys and every AU_/NZ
// key ARE keys → resolved. Single source of truth for the grid-region gate (does not read the factor).
function isResolvedGridRegion(region: string): boolean {
  return Object.prototype.hasOwnProperty.call(GRID_EF, region)
}
// getGridFactor (below) returns its edition with the factor, as nzTdLoss and getResidualFactor do, so the row's
// vintage, rule and basis come from the selection and never from the call site. Before T3c it resolved the nearest
// held year (backward, or forward to the earliest key) and wrote a "(latest|earliest vintage held)" note to disclose
// it; T3c removed that substitution, and with it the notes. A region whose required edition is not held is unpriced.
/** T3d 2024: a GRID_EF region as a person reads it in a sentence ("the EU-27 average", "Ontario", "Germany"); never the
 *  key. Names from lib/ghg/gridRegionWords.ts, EU member states from the engine's country names. */
export function gridRegionWords(region: string): string {
  const avg = GRID_REGION_AVERAGES[region]
  if (avg) return /average$|Kingdom$/.test(avg) ? `the ${avg}` : avg
  if (GRID_REGION_CA[region]) return GRID_REGION_CA[region]
  if (region.startsWith('US_') && GRID_REGION_US[region.slice(3)]) return GRID_REGION_US[region.slice(3)]
  if (region.startsWith('AU_') && GRID_REGION_AU[region.slice(3)]) return GRID_REGION_AU[region.slice(3)]
  if (region.startsWith('EU_')) { const c = region.slice(3); return countryNameEn(c === 'EL' ? 'GR' : c) }
  return 'this grid region'
}
function getGridFactor(region: string, sel: Sel): { ef: number; usedRegion: string; edition: EditionUse } {
  // T3c: the edition the window needs for this region's publisher, through editionFor; MissingEditionError when it is not
  // held. No `<=` loop, no forward move to the earliest key: those were the nearest-year substitution this replaces.
  const table = GRID_EF[region]
  // Unknown region → US national average. UNCHANGED and still undisclosed, as before T3c, except that the eGRID edition is
  // now selected. buildWorkings cannot reach this branch (isResolvedGridRegion gates it).
  if (!table) {
    const u = editionFor('egrid', sel)
    return { ef: GRID_EF.US_AVG[u.key as number], usedRegion: 'US_AVG', edition: u }
  }
  const u = editionFor(gridDataset(region), sel)
  const ef = table[u.key as number]
  // T3d: a held edition that carries no value for this region (EU_AVG: the EU-27 row of EEA 2024 is not loaded, by
  // ruling) is a missing edition FOR THAT REGION, under the unpriced-line rule: excluded from the totals, never zero,
  // an export-blocking edition_missing issue naming the site. Never an uncaught error, and never another year's value.
  if (ef === undefined) {
    throw new MissingEditionError(u.dataset, u.label, 'not_held',
      `${u.label} ${DATASETS[u.dataset].family} factors for ${gridRegionWords(region)} are needed for ${reportingYearLabel(sel.win).inText} ` +
      'and are not loaded, so this line is not counted. Export is blocked until they are loaded.')
  }
  return { ef, usedRegion: region, edition: u }
}
// The residual helpers select their edition the same way (editionFor, by the window), with no nearest-year move and
// no "vintage held" note: T3c removed both. A residual edition that is not held is a missing edition (unpriced line).
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
  // FI5: residual_region is chosen only at US sites (the eGRID subregion select), so it belongs to the US. A value left
  // over from before a country change is ignored rather than pricing a GB site's market-based row from Green-e.
  if (loc.residual_region && canonicalCountryCode(loc.country) === 'US') return loc.residual_region
  if ((loc.grid_region || '').startsWith('EU_')) return loc.grid_region
  if ((loc.country || '').toUpperCase().trim() === 'AU') return 'AU'
  return ''
}

function getResidualFactor(
  region: string,
  sel: Sel,
  gwpVersion: GwpVersion,
  // FI8: the location's country, so the note can say which country has no residual mix loaded.
  country?: string,
): { ef: number; applicable: boolean; source: string; vintage: string; usedRegion: string; note: string; edition?: EditionUse } {
  // EU: published combined CO2e in gCO2/kWh. region is the EU_XX grid key.
  if (region.startsWith('EU_')) {
    const table = RESIDUAL_EU[region]
    if (table) {
      // T3c: the AIB data year the window selects (class (b)); MissingEditionError when it is not held.
      const u = editionFor('aib', sel)
      const val = table[u.key as number]
      if (val === undefined) throw new Error(`The registry holds ${u.label}, but RESIDUAL_EU.${region} has no ${u.key} value.`)
      // ONE binding for the factor's identity, used by BOTH `vintage` and the note. They named the same
      // factor twice in two places; a single source is what stops them drifting (see the US branch,
      // where they HAD drifted).
      const vintage = u.label
      if (val === null) {
        return { ef: 0, applicable: false, source: editionCitation(u, EF_SOURCES.residual_eu), vintage, usedRegion: region,
          note: 'Full-disclosure regime — no residual mix published; market-based falls back to location factor.' }
      }
      return { ef: val / 1000, applicable: true, source: editionCitation(u, EF_SOURCES.residual_eu), vintage, usedRegion: region, note: '', edition: u }
    }
    return { ef: 0, applicable: false, source: EF_SOURCES.residual_eu, vintage: 'n/a', usedRegion: region,
      note: 'No published residual mix for this region; market-based falls back to location factor.' }
  }
  // AU: DCCEEW publishes ONE national combined CO2e figure — no gas split, no region lookup, the year
  // is the only dimension. Dispatched on the country token residualRegionFor emits.
  if (region === 'AU') {
    // T3c: the NGA edition the window selects (class (a), activity years).
    const u = editionFor('nga_residual', sel)
    const y = u.key as number
    if (RESIDUAL_AU[y] === undefined) throw new Error(`The registry holds ${u.label}, but RESIDUAL_AU has no ${y} value.`)
    // Names the publisher, the edition AND the basis. DCCEEW computes the RMF over financial years
    // (ending June) with a 3-year averaging lag, because LGCs are created on a calendar-year basis up
    // to 12 months after the generation they represent. A verifier reconciling a CALENDAR-year
    // inventory against this figure needs that before they start; the full explanation is in
    // EF_SOURCES.residual_au.
    const vintage = `DCCEEW ${y} RMF (FY basis, 3-yr avg)`
    return { ef: RESIDUAL_AU[y], applicable: true, source: editionCitation(u, EF_SOURCES.residual_au), vintage, usedRegion: region, note: '', edition: u }
  }
  // US: Green-e residual CO2 + eGRID CH4/N2O, lb/MWh -> kg/kWh CO2e via selected GWP. region is the eGRID subregion.
  const table = RESIDUAL_US[region]
  if (table) {
    // T3c: the Green-e data year the window selects (class (b)).
    const u = editionFor('greene', sel)
    const y = u.key as number
    const g = table[y]
    if (g === undefined) throw new Error(`The registry holds ${u.label}, but RESIDUAL_US.${region} has no ${y} value.`)
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
    const vintage = `${u.label} + eGRID2023 Rev2`
    return { ef, applicable: true, source: EF_SOURCES.residual_us, vintage, usedRegion: region, note: '', edition: u }
  }
  // FI8: say WHY there is no residual mix. A blank region outside the US means none is loaded for that country (the
  // UK, Canada and New Zealand today); a blank US region means no eGRID subregion has been chosen. Not "no published
  // residual mix": whether one is published was never checked for every country, so the note does not claim it.
  const ctry = canonicalCountryCode(country)
  const fallback = 'so the market-based figure uses the location-based grid average for the electricity not covered by contractual instruments.'
  const note = region === '' && ctry && ctry !== 'US'
    ? `No residual mix is loaded for ${countryNameEn(ctry === 'EL' ? 'GR' : ctry)}, ${fallback}`
    : region === '' ? `No eGRID subregion is selected for this location, ${fallback}`
    : 'No published residual mix for this subregion; market-based falls back to location factor.'
  return { ef: 0, applicable: false, source: EF_SOURCES.residual_us, vintage: 'n/a', usedRegion: region, note }
}

// ⚠️ THE ORDER IS PRESENTATION, AND IT IS DELIBERATE — DO NOT "RESTORE" THE STANDARD ONE.
// This list held the Statistics Canada west-to-east order (BC AB SK MB ON QC NB NS PE NL YT NT NU)
// until 14 Aug 2026. It was changed to ON-first ON PURPOSE, and the previous order was not lost by
// accident: Ontario is where most Canadian commercial activity sits, so it is the option most
// customers are looking for, and this array's only consumers put it in front of one.
//   Nothing computes on the order. There are exactly two consumers — CA_PROVINCES.includes() in
// detectGridRegion (membership, order-blind) and two .map()s that render <option> lists: the step-1
// locations table in app/dashboard/ghg/page.tsx and GRID_REGIONS_CA, which drives step 2. So the
// order is the DROPDOWN ORDER and nothing else, and no figure can move by changing it.
//   IT IS ALSO WHY THIS IS ONE ARRAY. Step 1 previously held its own literal in this ON-first order
// while step 2 rendered the west-to-east one, so a customer answered the same question twice with
// the options shuffled between screens. Consolidating was the fix; keeping the better order cost
// nothing. lib/ghg/provinceList.test.ts pins the order, not just the membership — order was the
// thing that disagreed.
const CA_PROVINCES = ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT']
// eGRID subregions for the US market-based residual-mix picker (item 5). Code -> readable label.
// Users select their exact subregion via EPA Power Profiler (ZIP lookup) rather than inferring from state,
// because several states span multiple subregions (e.g. TX = ERCT + SPP; NY = NYCW/NYLI/NYUP).
// T17: the list lives in lib/ghg/gridRegionWords.ts (no imports), so the region names can be read without the engine.
const US_STATES = ['AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL','GA','HI','IA','ID','IL','IN','KS','KY','LA','MA','MD','ME','MI','MN','MO','MS','MT','NC','ND','NE','NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY']
// Australian states/territories offered for grid selection. ACT shares the NSW grid factor, and
// WA/NT auto-map to their main interconnected grids (SWIS/DKIS) — both handled in detectGridRegion.
const AU_STATES = ['NSW','ACT','VIC','QLD','SA','WA','TAS','NT']
// EU-27 ISO codes (EL = Greece per EEA/EU convention). Maps country -> EU_XX grid key.
const EU_COUNTRIES = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','EL','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']

// ── THE ONE COUNTRY ROUTER FOR FACTOR SELECTION ──────────────────────────────────────────────────
//
// Which FACTOR TABLE a location resolves to, not its country. DE and FR are both 'EU'. An unlisted country resolves to
// null (efJurisdiction below): the location is refused, and no table, the US one included, prices it.
//
// EXTRACTED FROM pickEF, WHICH NOW SWITCHES ON IT, so steam can dispatch on the same answer instead
// of carrying a second copy of the branching. lib/vsme/b3Energy.ts once held exactly that second copy
// (`jurisdictionOf()`) and was deleted for it: it mapped US/CA/UK/EU only and threw on Australia.
// factorEditions.ts documents the same lesson from the other side. One router, two callers.
//
// ⚠️ THE CITATION ROUTERS ARE STILL SEPARATE. combustionSource() and gridSource() each branch on
// country themselves, and this does not unify them — that is a larger change than this one, and
// their answers are citations rather than table identities. Flagged, not fixed.
export type EfJurisdiction = 'US' | 'CA' | 'UK' | 'EU' | 'AU' | 'NZ'

// ── ONE SPELLING PER COUNTRY, BEFORE ANY ROUTER LOOKS AT IT ──────────────────────────────────────
//
// Two codes name a country this engine supports under a spelling none of its tables use:
//   GR -> EL   ISO 3166-1 assigns GR to Greece. EVERY factor key here is spelled EL, the
//              EEA/Eurostat convention: GRID_EF.EU_EL, RESIDUAL_EU.EU_EL, EU_COUNTRIES.
//   UK -> GB   ISO assigns GB; UK is exceptionally reserved and is what people type.
//
// ⚠️ THIS EXISTS BECAUSE GREECE WAS WRONG IN SEVEN PLACES, NOT ONE, AND FIXING THE ROUTER ALONE
// WOULD HAVE HALF-FIXED IT. For a location stored as 'GR', efJurisdiction fell to US, AND
// gridRegionForCountry returned '' (unresolved, so the electricity rows vanish and export blocks),
// AND gridSource cited US EPA, AND combustionSource cited US EPA, AND ngUnitOptions offered Mcf,
// AND liquidUnitOptions offered gallons, AND no EU_GR key exists in either grid table. Routing the
// FUELS to the EU tables while electricity stayed unresolved and the units stayed American would
// have been harder to spot than the original defect, because the fuel rows would have looked right.
//
// ⚠️ APPLIED AT BOTH ENDS, DELIBERATELY. The country control stores the canonical code, so saved
// data keeps one spelling; the engine canonicalises again on read, so a 'GR' arriving from an
// import, a hand-edited jsonb or a surface written later still resolves. Doing only the first
// leaves the engine silently wrong for a value the rest of the product considers valid, which is
// the shape of the defect this whole change removes.
//
// NOT AN ALIAS TABLE FOR NAMES. 'GREECE' and 'UNITED KINGDOM' are not handled here; see the alias
// note on detectGridRegion.
const COUNTRY_CANONICAL: Readonly<Record<string, string>> = { GR: 'EL', UK: 'GB' }

/** The engine's stored spelling for a country code: upper-cased, trimmed, aliases resolved. */
export function canonicalCountryCode(country?: string): string {
  const ctry = (country || '').toUpperCase().trim()
  return COUNTRY_CANONICAL[ctry] ?? ctry
}

// ── WHY A COUNTRY IS NOT PRICEABLE, IN THREE DISTINCT STATES ─────────────────────────────────────
//
// ⚠️ THESE ARE NOT INTERCHANGEABLE AND MUST NEVER BE FOLDED INTO ONE. They need opposite remedies:
// a blank country is an unanswered question, a value that names no country is an answered question
// the list could not express, and a real ISO code is a coverage limit of this platform. One state
// would give all three the same sentence, and two of them would then be wrong.
//
// CONSUMED: efJurisdiction returns null for an unsupported country (since 21 Sep 2026), and countryRefusal says which
// of the three states that location is in, for every surface that names the exclusion.
export type CountryRefusal =
  /** Never answered. Stored as ''. */
  | { state: 'country_not_set' }
  /** A stored value that names no country: the 'OTHER' the control stores for "Not listed",
   *  or any legacy token. `value` is carried VERBATIM so a surface can quote what was stored. */
  | { state: 'country_not_listed'; value: string }
  /**
   * A country code the platform can NAME but holds no factor set for.
   *
   * ⚠️ "CAN NAME", NOT "IS AN ISO CODE", AND THE DIFFERENCE IS FORCED BY THE COPY. This state's
   * sentence is "we do not hold emission factors for this location's country (Philippines)", which
   * cannot be written without a name. The concordance holds 212 of the 249 assigned alpha-2 codes,
   * so JE, GG, IM, GI, GU and the rest of the territory list have no name here and fall to
   * country_not_listed, which quotes the stored value instead. That is the honest split: we say
   * which country we cannot price only when we can say which country it is.
   */
  | { state: 'country_not_supported'; iso2: string }

/**
 * Can the customer clear this refusal by doing something?
 *
 * ⚠️ THIS IS ONE PREDICATE FOR TWO DECISIONS THAT MUST NOT DISAGREE: whether the Review sentence
 * offers a remedy, and whether the export gate blocks. A gate that blocks with no remedy strands the
 * customer: there is no control anywhere in the wizard that turns "Not listed" or an unsupported
 * country into a supported one, so blocking on those means the report can never be produced. A
 * remedy offered where the gate does not block is the opposite error, nagging about something that
 * is not stopping anything.
 *   So the rule is: THE GATE BLOCKS IF AND ONLY IF THE SENTENCE OFFERS A REMEDY, and both read this.
 */
export function refusalIsFixable(refusal: CountryRefusal): boolean {
  switch (refusal.state) {
    // Nobody answered. Answering it is the fix.
    case 'country_not_set': return true
    // A stored value that names no country can be replaced with one. "Not listed" cannot: the
    // customer answered honestly and the list still has nothing for them.
    case 'country_not_listed': return refusal.value.trim().toUpperCase() !== 'OTHER'
    // A limit of this platform, not of the record. Nothing the customer does changes it.
    case 'country_not_supported': return false
  }
}

export type EfRouting =
  | { supported: true; jurisdiction: EfJurisdiction }
  | { supported: false; refusal: CountryRefusal }

/**
 * THE ONE COUNTRY ROUTER. Which factor table a location resolves to, or why it resolves to none.
 *
 * ⚠️ US IS RETURNED FOR 'US' AND FOR NOTHING ELSE. The old `return 'US'` at the end of
 * efJurisdiction caught every unrecognised country, so a Japanese site was priced from EPA tables,
 * its steam from EPA Table 7 (a US natural-gas boiler at 80% efficiency), and factor_editions
 * recorded 'US EPA 2024' against it. That is the fallback this function exists to replace.
 */
export function efRouting(loc: { country?: string }): EfRouting {
  const ctry = canonicalCountryCode(loc.country)
  const ok = (jurisdiction: EfJurisdiction): EfRouting => ({ supported: true, jurisdiction })
  if (ctry === 'GB') return ok('UK')
  if (EU_COUNTRIES.includes(ctry)) return ok('EU')
  if (ctry === 'AU') return ok('AU')
  if (ctry === 'NZ') return ok('NZ')
  if (ctry === 'CA') return ok('CA')
  if (ctry === 'US') return ok('US')
  if (ctry === '') return { supported: false, refusal: { state: 'country_not_set' } }
  // A code the country list can express is a coverage limit; anything else names no country.
  // ⚠️ 'OTHER' TAKES NO SPECIAL CASE, AND THAT IS THE POINT. It is one member of the open set
  // "a stored string that is not a country code", which also holds typos, truncations and whatever
  // a future import produces. Naming it here would handle the one value we know about and drop the
  // rest somewhere else.
  return countryByIso2(ctry) !== undefined
    ? { supported: false, refusal: { state: 'country_not_supported', iso2: ctry } }
    : { supported: false, refusal: { state: 'country_not_listed', value: (loc.country || '').trim() } }
}

/** The refusal for a location, or null when its country is supported. */
export function countryRefusal(loc: { country?: string }): CountryRefusal | null {
  const r = efRouting(loc)
  return r.supported ? null : r.refusal
}

/**
 * The factor table a location resolves to, or null when it resolves to none.
 *
 * ⚠️ null, NOT A SEVENTH MEMBER OF EfJurisdiction. Every factor table here is keyed
 * Record<EfJurisdiction, ...> (STEAM_EF, COMBUSTION_EDITION, CITATIONS in factorEditions), and a
 * seventh member would oblige each of them to carry an entry for a jurisdiction that by definition
 * has no factors. The only entries that could be written are placeholders, which is how a US
 * fallback gets reintroduced. null makes the compiler name every call site instead.
 *
 * ⚠️ AND US IS RETURNED FOR 'US' ALONE. Until 21 Sep 2026 this function ended `return 'US'`, so a
 * Japanese site was priced from EPA tables, its steam from EPA Table 7 (a US natural gas boiler at
 * 80% efficiency), and factor_editions recorded 'US EPA 2024' against it. Nothing on screen said so.
 */
export function efJurisdiction(loc: { country?: string }): EfJurisdiction | null {
  const r = efRouting(loc)
  return r.supported ? r.jurisdiction : null
}
function detectGridRegion(code: string, country?: string): string {
  const c = (code || '').toUpperCase().trim()
  // ⚠️ canonicalCountryCode HANDLES CODES, THE NAME COMPARISONS BELOW ARE LEFT EXACTLY AS THEY WERE.
  // This function accepts 'AUSTRALIA' and 'CANADA' as well as AU and CA, which efRouting does not;
  // the three country routers have three different alias policies and unifying them is a separate
  // change. Canonicalising here fixes the CODE path without widening or narrowing the name path.
  const ctry = canonicalCountryCode(country)
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
  // canonicalCountryCode FIRST: 'GR' must reach EU_EL, which is the only spelling GRID_EF carries.
  const ctry = canonicalCountryCode(country)
  if (ctry === 'GB') return 'UK'
  if (ctry === 'NZ' || ctry === 'NEW ZEALAND') return 'NZ'
  if (EU_COUNTRIES.includes(ctry)) return 'EU_' + ctry
  return ''
}
// ── OPTION LISTS: value AND label ONLY. THERE IS NO `.ef` HERE, AND THERE MUST NOT BE. ───────────
//
// Both objects carried a third field, `ef`, built as `y[Math.max(...Object.keys(y).map(Number))]` —
// the newest year in each region's table, computed ONCE AT IMPORT, with no access to any inventory.
// It was removed on 14 Aug 2026. A field whose value is a factor chosen without reference to the
// reporting year has exactly one honest use, and it is not a use: any surface that renders it states
// a number the engine will not apply.
//
// ⚠️ IT WAS RENDERED, AND IT WAS WRONG BY A FACTOR OF TWO. The CA province dropdown printed `{r.ef}`,
// so on a 2023 Ontario inventory the customer chose "ON — 0.059" and getGridFactor then priced the
// location at 0.03. Same screen, 1.97x apart, nothing reconciling them. Every other factor surface —
// the US dropdown, all four confirmation banners, the step-1 grid label — already called
// getGridFactor(region, inventory.reporting_year). This was the one display path reading the
// year-blind constant, and it was wrong for EVERY Canadian province on any pre-2026 inventory.
//
// The render site was fixed first and the field left in place, read only by the tests that proved it
// disagreed with the engine. That was the wrong shape: a field that exists to be wrong is an
// invitation, and `{r.ef}` compiles. Deleting it makes the regression a TYPE ERROR rather than a
// silent 1.97x, and lib/ghg/gridDisplay.test.ts now reconstructs the year-blind value from GRID_EF
// itself — the formula is what could come back, not the field.
//
// ⚠️ THE ANSWER TO "WHICH FACTOR" IS getGridFactor(region, year). Nothing on this line may cache one.
// Callers needing the number ask the engine at the reporting year; these lists exist to fill a
// <select> and to resolve a stored region to its display label.
const GRID_REGIONS_CA = CA_PROVINCES.map(p => ({ value: p, label: p }))
const GRID_REGIONS_US = US_STATES.map(s => ({ value: 'US_' + s, label: s }))

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
    // Supply Chain's module hue (--color-module-supply / -wash), reused here as a FRAMEWORK
    // colour. 5.6:1 on white, and hue 313 — its nearest neighbour among the other five frameworks
    // is SB 253's red at hue 0, a 47° gap. Every framework pair now clears 20°.
    //
    // ⚠️ TWO COLOURS HAVE ALREADY BEEN REJECTED HERE. DO NOT RETRY EITHER.
    //   #7425e3 / #EDE9FE — the retired brand violet. It made an ESRS card read as a ThemisIQ
    //     action rather than as a framework, because the same violet was every button and link.
    //   #1C5EAA / #E6EBFC — CBAM's blue, tried 5 Sep 2026 on the reasoning that CBAM and ESRS are
    //     both EU instruments. MEASURED AND REVERSED THE SAME DAY: it is 2° from CDP's #0C447C
    //     (hue 212 against 210), the two text colours are 1.51:1 apart and the two WASHES are
    //     1.04:1 apart. These cards sit adjacent in the framework grid, so that is not a
    //     difference — it is one colour appearing twice. The 12-point lightness gap was the only
    //     separation, and lightness alone is exactly what fails in greyscale, on a projector and
    //     on a photocopy.
    //
    // ⚠️ THE RULE THE FAILURE ESTABLISHES: a framework colour is chosen against the OTHER FIVE, by
    // hue separation, not by what the framework is about. "EU framework, so use the EU-ish blue"
    // is the reasoning that produced the collision — CDP is already blue, and thematic fit says
    // nothing about whether two cards can be told apart.
    // ⚠️ THE VALUES ARE UNCHANGED; ONLY WHERE THEY ARE DECLARED HAS MOVED (25 Sep 2026). #AF3790 /
    // #F9E6F2 is now --color-accent-magenta, so this chip no longer carries Supply Chain's module hue as
    // a literal. Everything above about hue separation still governs the VALUE and now lives with the
    // token as well, because whoever edits the family next will be reading that file and not this one.
    id: 'esrs', name: 'ESRS E1', full: 'ESRS E1 — EU CSRD (Scope 3 mandatory)', color: 'var(--color-accent-magenta)', bg: 'var(--color-accent-magenta-wash)',
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
    // ⚠️ WAS --color-module-climate, WHICH WAS NEVER ABOUT CLIMATE RISK. EcoVadis is a framework, and this
    // chip borrowed a module hue for want of an accent family. Same colour, #A94E0D; the wash #FEF3E2 is
    // now named too. Note accent-amber and --color-state-warn share the colour and NOT the wash.
    id: 'ecovadis', name: 'EcoVadis', full: 'EcoVadis — E1 Module', color: 'var(--color-accent-amber)', bg: 'var(--color-accent-amber-wash)',
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
  // T10b: the date a fuel was delivered or bought, read from a delivery document that prints no service period.
  // Present with periodStart and periodEnd null. deliveryDateOf decides whether a reading is a delivery.
  deliveryDate?: string | null
  periodConfidence?: 'high' | 'medium' | 'low' | null
  confidence: 'high' | 'medium' | 'low'
  sourceQuote: string | null
  notes: string | null
  status: ConciergeStatus
  // T9 (rule R5): where the billing dates came from. Set at extraction from periodConfidence (high →
  // printed, medium → billing_month); customer_confirmed once the customer confirms or enters the dates.
  // Absent on proposals saved before T9: periodOriginOf reads periodConfidence for those.
  periodOrigin?: PeriodOrigin | null
  periodConfirmedAt?: string
  periodConfirmedBy?: { userId: string; email: string }
  // T9 ruling: what was READ from the bill, kept the first time the dates, unit or figure are changed, so a
  // verifier can see the original beside the correction (verbatim source values are never lost). `unit` is the
  // unit as printed (rawUnit). T18: `rawValue` is the figure as printed and `value` the figure as converted;
  // both are absent on an asRead kept before T18 and filled on its next change.
  asRead?: { periodStart: string | null; periodEnd: string | null; unit: string | null; value?: number | null; rawValue?: number | null }
  // T9: every change the customer made to the dates or unit, with who and when, in order. T18: and the figure.
  // T18: a unit change on a reading whose figure the customer had typed clears that figure (the unit-change
  // invariant: never relabel), recording the figure cleared and the unit it must be entered again in.
  corrections?: { fields: ('period' | 'unit' | 'value')[]; at: string; by: { userId: string; email: string }; figureCleared?: FigureCleared }[]
  // T9 (Reject and Undo): every rejection and every undo, with who, when and the status before it, in order.
  // A rejected proposal stays on its document as evidence; it is simply not counted. T18: Flag for review
  // ('flagged'), and a document's withdrawal and restoration ('withdrawn', 'restored', T18 diff 2).
  statusLog?: { action: 'rejected' | 'undone' | 'flagged' | 'withdrawn' | 'restored'; at: string; by: { userId: string; email: string }; statusBefore: ConciergeStatus }[]
  // T18: every confirmation, with who, when and the reading exactly as shown when it was accepted. Appended on each
  // confirmation (after an Undo, or a date confirmation), never overwritten. Absent on proposals confirmed before T18.
  confirmations?: Confirmation[]
  // FI9 diff 4 (ruling R16): a fleet-fuel reading's vehicle type, chosen by the customer at review (never inferred by the
  // reader), with every choice recorded. Absent on a fleet reading made before FI9: it lands on the legacy field until a
  // type is chosen, which moves it.
  fleetType?: FleetType
  fleetTypeLog?: { from: FleetType | null; to: FleetType; at: string; by: { userId: string; email: string } }[]
}

/** T18: the figure a unit change cleared from a reading: the typed figure and its unit, and the unit to enter it in. */
export interface FigureCleared {
  value: number | null
  unit: string | null
  toUnit: string | null
}

/**
 * T18: the figure a unit change cleared, while it is still to be entered again: the reading has no figure, is not
 * rejected, and its latest correction is that clear. Entering the figure (Edit figure) appends a later correction,
 * which ends it.
 */
export function clearedFigureOf(p: Pick<ExtractedProposal, 'value' | 'status' | 'corrections'>): FigureCleared | null {
  if (p.value != null || p.status === 'rejected') return null
  return (p.corrections ?? []).at(-1)?.figureCleared ?? null
}

/** T18: what a reading whose typed figure was cleared by a unit change says, on the reading and (with the file
 * and the site) on its unpriced line. Plain language, no em dash. */
export const READING_FIGURE_CLEARED_MESSAGE = (c: FigureCleared): string => {
  const from = unitLabel(c.unit), to = unitLabel(c.toUnit)
  return `This figure was entered in ${from}. The unit has been changed to ${to}, so the figure has been cleared. Enter it again in ${to}.`
}

/** T18: one confirmation of a reading: who, when, and the reading as printed on the bill and as converted. */
export interface Confirmation {
  at: string
  by: { userId: string; email: string }
  reading: {
    value: number | null
    unit: string | null
    rawValue: number | null
    rawUnit: string | null
    periodStart: string | null
    periodEnd: string | null
    sourceQuote: string | null
    deliveryDate?: string
  }
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
  // The meter or account this document belongs to, when a location has more than one per fuel. Absent is
  // the default single meter. Read by billContributions (T1); set by the 'different_meters' resolution (T3).
  meter_label?: string
  // T15 (rule R6): SHA-256 of the file's bytes, hex, computed in the browser at upload. FOR DUPLICATE DETECTION
  // ONLY: it is supplied by the client, so it is not an integrity guarantee. Absent on documents uploaded before
  // T15, or when hashing failed; a missing hash never matches (findExactDuplicates).
  sha256?: string
  // T18: withdrawn by the customer. The file and its readings stay as evidence; every reading is set to rejected,
  // with its status before kept in its statusLog, and contributes with reason `withdrawn`. Cleared on restore.
  withdrawn?: { at: string; by: { userId: string; email: string }; reason: string }
}

/**
 * T18: one entry in a location's document log: a withdrawal, a restoration, or a deletion. Append-only: a save
 * whose log lacks an entry the loaded record had is refused (lib/ghg/savePayload.ts, documentLogProblem). A
 * deletion entry is a tombstone: the file, its type, when it was uploaded, its SHA-256 where known, who, when and
 * why. It holds no reading and no source quote, since the point of a deletion may be that they are not kept.
 */
export type DocumentEvent =
  | { kind: 'withdrawn' | 'restored'; docId: string; file: string; at: string; by: { userId: string; email: string }; reason: string }
  | { kind: 'deleted'; docId: string; file: string; documentType: string; uploadedAt: string; sha256: string | null; at: string; by: { userId: string; email: string }; reason: string }
  | { kind: 'deleted_unused'; docId: string; file: string; documentType: string; uploadedAt: string; sha256: string | null; at: string; by: { userId: string; email: string } }

/**
 * T18: one typed figure as saved: the field, its value and unit, who saved it and when. `overrideReason` when the
 * figure was entered by hand instead of from the field's documents (T10). `note` when it was not entered by the
 * person it is attributed to: "entered before sign-in" for a free calculation claimed by that person.
 */
export interface TypedEntry {
  field: string
  value: number
  unit: string | null
  at: string
  by: { userId: string; email: string }
  overrideReason?: string
  note?: string
}

/** T18: a field whose figure is typed: no document backs it, or the customer entered it by hand instead (T10). */
export function isTypedFigure(loc: Location, field: keyof Location | string): boolean {
  return documentsBacking(loc, field as keyof Location) === 0 || !!activeOverride(loc, field)
}

/** T18: what a coverage-resolution row says about who made the choice. A stored resolution without a person still
 * validates (pre-launch, section 4) and says so rather than naming nobody silently. */
export const resolvedByText = (r: { by?: { email: string } | null }): string => r.by?.email ? `Who: ${r.by.email}` : 'Who: not recorded'

/**
 * T18 section D: the record a deleted location leaves at inventory level. Who, when, the location's name and country,
 * and, when it held documents, the reason and a tombstone for each document (the same shape a document deletion
 * leaves) with the earlier saved versions wording. The location's own document log and typed entries go with it, so
 * a tombstone or a who-and-when written earlier is not lost when its location is. A location with no documents leaves
 * the lighter record: no reason and no tombstones.
 */
export interface LocationEvent {
  kind: 'location_deleted'
  locationId: string
  name: string
  country: string
  at: string
  by: { userId: string; email: string }
  reason?: string
  documents: Extract<DocumentEvent, { kind: 'deleted' }>[]
  document_log?: DocumentEvent[]
  typed_entries?: TypedEntry[]
}

/** T18 section D: one sentence for a deleted location, the same on every surface that shows it. No em dash. */
export function locationEventSentence(e: LocationEvent): string {
  const when = isoDateInWords(e.at.slice(0, 10))
  const where = `${e.name || 'A location'}${e.country ? ` (${countryNameEn(e.country) || e.country})` : ''}`
  if (e.documents.length === 0) return `${where} was deleted by ${e.by.email} on ${when}. It held no documents.`
  const n = e.documents.length
  return `${where} was deleted by ${e.by.email} on ${when}: ${e.reason ?? 'no reason recorded'}. Its ${n === 1 ? 'document was' : `${n} documents were`} deleted with it: ${e.documents.map(d => d.file).join(', ')}. The ${n === 1 ? 'file' : 'files'} and what was read from ${n === 1 ? 'it' : 'them'} were removed. ${n === 1 ? EARLIER_VERSIONS_SENTENCE : EARLIER_VERSIONS_SENTENCE.replace('from it.', 'from them.')}`
}

/** T18: what a deletion leaves of what was read (ruling of 9 Oct 2026, option (a)). "Earlier saved versions", not a
 * named store, so it stays true when pinned verifier versions (T16) keep copies too. */
export const EARLIER_VERSIONS_SENTENCE = 'Earlier saved versions of this inventory still contain what was read from it.'

/**
 * T18: one sentence per document event, the same on every surface that shows it: the evidence list, the saved
 * workings, the verifier page and the PDF. Plain language, no em dash.
 */
export function documentEventSentence(e: DocumentEvent): string {
  const when = isoDateInWords(e.at.slice(0, 10))
  switch (e.kind) {
    case 'withdrawn': return `${e.file} was withdrawn by ${e.by.email} on ${when}: ${e.reason}. It is kept as evidence and not counted.`
    case 'restored': return `${e.file} was restored by ${e.by.email} on ${when}: ${e.reason}.`
    case 'deleted': return `${e.file} was deleted by ${e.by.email} on ${when}: ${e.reason}. The file and what was read from it were removed. ${EARLIER_VERSIONS_SENTENCE}`
    case 'deleted_unused': return `${e.file} was deleted by ${e.by.email} on ${when}. Nothing from it had been used.`
  }
}

interface Location {
 id: string; name: string; country: string; state?: string; province?: string; region?: string
  has_natural_gas: boolean; natural_gas_amount: number; natural_gas_unit: 'mcf' | 'therms' | 'mmbtu' | 'm3' | 'kwh' | 'ccf' | 'gj'   // ccf: US sites (FI5); gj: Canada (FI3)
  has_propane: boolean; propane_amount: number; propane_unit: 'gallons' | 'litres' | 'kg' | 'tonnes'   // FI4: kg at UK, EU, NZ; tonnes at EU
  has_diesel_stationary: boolean; diesel_stationary_amount: number; diesel_stationary_unit: 'gallons' | 'litres'
  // TWO GRADES, TWO FIELD TRIPLES — and `_amount`, NOT the retired `_gallons` misnomer.
  // The single key this replaces was `fuel_oil_gallons`, a name that lied about its unit and was kept
  // only because it existed in every stored locations_data row, so renaming meant a migration. These
  // are NEW keys: nothing stored carries them, there is nothing to preserve, and deliberately
  // inheriting a bad name would be indefensible. `_amount` is what every other multi-unit fuel here
  // uses (natural_gas_amount, propane_amount, diesel_stationary_amount), so fuel oil is now the same
  // shape as its neighbours instead of the exception that needed a comment to be read correctly.
  // Priced through pickEF, which converts the unit entered to the unit the publisher printed (FI2).
  // FI3: kg and tonnes at EU sites, where MRR publishes on a mass basis (fuelOilUnitOptions).
  has_fuel_oil_distillate: boolean; fuel_oil_distillate_amount: number; fuel_oil_distillate_unit?: 'gallons' | 'litres' | 'kg' | 'tonnes'
  has_fuel_oil_residual: boolean; fuel_oil_residual_amount: number; fuel_oil_residual_unit?: 'gallons' | 'litres' | 'kg' | 'tonnes'
  has_mobile: boolean; gasoline_amount: number; gasoline_unit: 'gallons' | 'litres'; diesel_mobile_amount: number; diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean; has_hfc_refrigerants: boolean; refrigerant_type: string; refrigerant_purchased_kg: number
  electricity_kwh: number; grid_region: string; renewable_electricity_kwh: number; residual_region: string
  // Same as fuel_oil_gallons: key kept, unit added, 'mmbtu' when absent. Read via steamPricing.
  // ⚠️ THE KEY STILL SAYS _mmbtu AND THE UNIT MAY BE kWh. Deliberate, and unchanged from the original
  // convention: renaming the column would orphan every stored figure. The unit field is authoritative.
  has_purchased_steam: boolean; purchased_steam_mmbtu: number; purchased_steam_unit?: SteamUnit
  // ── SUPPLIER-SPECIFIC STEAM FACTOR ────────────────────────────────────────────────────────────
  // The remedy for a jurisdiction STEAM_EF has no published factor for (CA/AU/NZ/EU). Absent means
  // "not supplied" and the stream cannot be priced — it does NOT mean zero, and nothing anywhere may
  // treat it as such. A positive value OUTRANKS a published default even where one exists, because a
  // figure from the network that supplied the heat is primary data (see steamPricing).
  //   Stored as kg CO2e per `_basis` unit: one combined figure, since that is how a district energy
  // provider publishes. Its own basis is recorded rather than inherited from purchased_steam_unit, so
  // changing the activity unit later cannot silently re-interpret the factor.
  purchased_steam_supplier_ef?: number
  purchased_steam_supplier_ef_basis?: SteamBasis
  /** Who supplied it and from what document — printed on the workings row for the verifier. */
  purchased_steam_supplier_source?: string
  biogenic_co2_mt: number
  // New Zealand-only (optional, default-safe): use-class picks the EF_NZ variant (Commercial default /
  // Industrial — no Residential in MfE data); nz_td_losses toggles the optional Scope 3 Cat 3 T&D line.
  nz_use_class?: 'commercial' | 'industrial'
  nz_td_losses?: boolean
  // FI6 (R15 b): Australia only, and asked only in NSW/ACT, QLD, SA and WA where the site has gas. NGA's Scope 3 gas
  // factor (Table 6) differs by metro and non-metro area; Category 3 withholds the gas line until it is chosen. No
  // default. Not read by the engine: Scope 1 gas does not depend on it. Lives in locations_data (no SQL).
  au_gas_area?: 'metro' | 'non_metro'
  source_docs: SourceDoc[]
  // Per-stream "this site has no such supply" attestations. Absent (undefined/missing entry) means
  // NOBODY has answered → the stream is UNDECLARED and blocks export. See findUndeclaredStreams.
  stream_attestations?: StreamAttestation[]
  // T10 (section 3.3, ruling Q1): document-backed figures the customer chose to enter by hand instead, each
  // with a required reason, who and when. While one is active, the field's documents stay as evidence but are
  // not counted (contribution reason manual_override), and the typed value on the field is the figure.
  manual_overrides?: ManualOverride[]
  // FI5: every unit change that moved a typed figure, in order: an exact conversion (factor, before and after), or a
  // clear where no exact conversion joins the two units (factor null, valueAfter 0, cleared). Who and when on each.
  // Lives in locations_data (no SQL). The workings row for the field cites the conversion that produced its figure.
  unit_changes?: UnitChange[]
  // T10 ruling: overrides the customer removed ("Use the bills instead"), with who and when, so the history
  // stays in the record.
  manual_overrides_removed?: (ManualOverride & { removedAt: string; removedBy: { userId: string; email: string } })[]
  // T18: every withdrawal, restoration and deletion of a document at this location, in order. Append-only; lives in
  // locations_data (no SQL). Written by lib/ghg/documentActions.ts.
  document_log?: DocumentEvent[]
  // T18: who entered or changed each typed figure, and when: one entry per change per save, in order
  // (lib/ghg/typedEntries.ts). Lives in locations_data (no SQL).
  typed_entries?: TypedEntry[]
  // ── FI9 (ruling R16): FLEET FUEL BY VEHICLE TYPE ──────────────────────────────────────────────────────
  // Light (cars, vans, utes), Heavy (trucks, buses), Non-road (forklifts, plant, machinery), each with its own petrol and
  // diesel quantity. The three ticks are saved (R16 choice 5): a type ticked with no figure yet is a real state. All
  // optional, because locations saved before FI9 carry none of them; absent reads as not ticked and 0. Lives in
  // locations_data (no SQL). The legacy gasoline_amount / diesel_mobile_amount above are assigned to a type by the
  // customer (assignLegacyFleet), never moved silently (R16 choice 2).
  fleet_light?: boolean; fleet_heavy?: boolean; fleet_nonroad?: boolean
  light_petrol_amount?: number; light_petrol_unit?: 'gallons' | 'litres'
  light_diesel_amount?: number; light_diesel_unit?: 'gallons' | 'litres'
  heavy_petrol_amount?: number; heavy_petrol_unit?: 'gallons' | 'litres'
  heavy_diesel_amount?: number; heavy_diesel_unit?: 'gallons' | 'litres'
  nonroad_petrol_amount?: number; nonroad_petrol_unit?: 'gallons' | 'litres'
  nonroad_diesel_amount?: number; nonroad_diesel_unit?: 'gallons' | 'litres'
  /** Road types: the typical model year, optional (R16). */
  light_model_year?: number; heavy_model_year?: number
  /** US road only, optional: miles per type AND fuel (R16 choice 1), for EPA's per-mile CH4 and N2O. */
  light_petrol_miles?: number; light_diesel_miles?: number; heavy_petrol_miles?: number; heavy_diesel_miles?: number
  /** Non-road: the equipment type, per fuel (R16 choice 3). No default. */
  nonroad_petrol_equipment?: EquipmentType; nonroad_diesel_equipment?: EquipmentType
  /** Every legacy fleet figure the customer assigned to a vehicle type, with who and when (R16 choice 2). */
  fleet_assignments?: FleetAssignment[]
  /** FI9 diff 3: an optional fleet answer cleared by a country change (miles off a US site, an equipment type where the
   *  new publisher does not split by it), with the sentence shown and who and when. FI5's record, for answers that are
   *  not figures. */
  fleet_changes?: FleetChange[]
}

/** FI9 diff 3: one optional fleet answer a country change cleared. */
export interface FleetChange {
  field: string
  valueBefore: string | number
  message: string
  at: string
  by: { userId: string; email: string } | null
}

/** FI9: one legacy fleet figure moved to a vehicle type by the customer. */
export interface FleetAssignment {
  from: 'gasoline_amount' | 'diesel_mobile_amount'
  to: FleetType
  field: string
  value: number
  unit: string
  at: string
  by: { userId: string; email: string }
}

// ── FI9 (R16): THE SIX FLEET FIELDS, IN ONE TABLE ─────────────────────────────────────────────────────────
// Every map that names a field (units, streams, switches, names, cleared figures, combustion lines) is derived from
// this list, so a seventh field cannot be added to one map and missed by another. Each line prices from its publisher's
// mobile row (pickFleet, FI9 diff 2b).
export type FleetFuel = 'petrol' | 'diesel'
export interface FleetField {
  type: FleetType; fuel: FleetFuel
  amount: keyof Location; unit: keyof Location; typeSwitch: keyof Location
  source: string; name: string
  /** Optional per-type inputs (R16): the typical model year (road), miles (US road, per fuel), equipment type (non-road). */
  modelYear?: keyof Location; miles?: keyof Location; equipment?: keyof Location
}
const FLEET_TYPE_SWITCH: Record<FleetType, keyof Location> = { light: 'fleet_light', heavy: 'fleet_heavy', non_road: 'fleet_nonroad' }
const FLEET_TYPE_WORDS: Record<FleetType, string> = { light: 'light vehicles', heavy: 'heavy vehicles', non_road: 'non-road equipment' }
const FLEET_PREFIX: Record<FleetType, string> = { light: 'light', heavy: 'heavy', non_road: 'nonroad' }
export const FLEET_FIELDS: readonly FleetField[] = (['light', 'heavy', 'non_road'] as const).flatMap(type =>
  (['petrol', 'diesel'] as const).map(fuel => ({
    type, fuel,
    amount: `${FLEET_PREFIX[type]}_${fuel}_amount` as keyof Location,
    unit: `${FLEET_PREFIX[type]}_${fuel}_unit` as keyof Location,
    typeSwitch: FLEET_TYPE_SWITCH[type],
    source: `${fuel === 'petrol' ? 'Petrol' : 'Diesel'} (${FLEET_TYPE_WORDS[type]})`,
    name: `${fuel} in ${FLEET_TYPE_WORDS[type]}`,
    ...(type === 'non_road'
      ? { equipment: `nonroad_${fuel}_equipment` as keyof Location }
      : { modelYear: `${FLEET_PREFIX[type]}_model_year` as keyof Location, miles: `${FLEET_PREFIX[type]}_${fuel}_miles` as keyof Location }),
  })))
const fleetNum = (loc: Location, f: FleetField): number => Number((loc as unknown as Record<string, unknown>)[f.amount] ?? 0) || 0
const fleetUnit = (loc: Location, f: FleetField): string => String((loc as unknown as Record<string, unknown>)[f.unit] ?? 'gallons')
/** FI9: the fleet field's figure counts only under the stream switch and its type tick. */
const fleetOn = (loc: Location, f: FleetField): boolean =>
  loc.has_mobile && (loc as unknown as Record<string, unknown>)[f.typeSwitch] === true

/** FI9 diff 4: the vehicle type a fleet field belongs to, or null for any other field (and the legacy two). */
export const fleetTypeOfField = (field: keyof Location | string): FleetType | null =>
  FLEET_FIELDS.find(f => f.amount === field)?.type ?? null

/** FI9 diff 4: the fleet fields an unread fleet-fuel upload is evidence for: the ticked types', or all six if none is. */
export function unreadFleetFields(loc: Location): (keyof Location)[] {
  const ticked = FLEET_FIELDS.filter(f => (loc as unknown as Record<string, unknown>)[f.typeSwitch] === true)
  return (ticked.length > 0 ? ticked : FLEET_FIELDS).map(f => f.amount)
}

/** FI9 diff 4: choosing a reading's vehicle type at review ticks that type, so the figure it routes to is counted and
 *  never lands on a field nothing prices. Unticking stays the customer's own step (untickFleetType). */
export function withFleetTypeTicked(loc: Location, type: FleetType): Location {
  return { ...loc, has_mobile: true, [FLEET_TYPE_SWITCH[type]]: true } as Location
}

/** FI9: the legacy fleet figures still waiting for a vehicle type, in field order. */
export function legacyFleetFigures(loc: Location): { field: 'gasoline_amount' | 'diesel_mobile_amount'; fuel: FleetFuel; value: number; unit: string }[] {
  const out: { field: 'gasoline_amount' | 'diesel_mobile_amount'; fuel: FleetFuel; value: number; unit: string }[] = []
  if (loc.gasoline_amount > 0) out.push({ field: 'gasoline_amount', fuel: 'petrol', value: loc.gasoline_amount, unit: loc.gasoline_unit })
  if (loc.diesel_mobile_amount > 0) out.push({ field: 'diesel_mobile_amount', fuel: 'diesel', value: loc.diesel_mobile_amount, unit: loc.diesel_mobile_unit })
  return out
}

/**
 * FI9 (R16 choice 2): the customer's button, "These were {type}". Moves one legacy figure, its unit and its unit-change
 * history to the type's field, ticks the type, and records the move with who and when. Nothing else calls it: a legacy
 * figure is never assigned without the customer saying which type.
 *   Refused, with the reason, where the move would lose or merge something: the target field already holds a typed
 * figure. Documents behind the legacy field move with it (FI9 diff 4).
 */
export function assignLegacyFleet(
  loc: Location, from: 'gasoline_amount' | 'diesel_mobile_amount', to: FleetType, at: string, by: FleetAssignment['by'],
): { ok: true; location: Location } | { ok: false; reason: 'nothing_to_move' | 'target_has_figure' } {
  const fuel: FleetFuel = from === 'gasoline_amount' ? 'petrol' : 'diesel'
  const target = FLEET_FIELDS.find(f => f.type === to && f.fuel === fuel)!
  const value = loc[from]
  // FI9 diff 4: documents that still name the legacy field move too: each untyped fleet reading of this fuel takes the
  // vehicle type, recorded with who and when, exactly as choosing it at review would (chooseFleetType).
  const fuelType = fuel === 'petrol' ? 'gasoline' : 'diesel'
  const untyped = loc.source_docs.some(d => d.document_type === 'fleet_fuel' && (d.extracted ?? []).some(p => p.fuelType === fuelType && !p.fleetType))
  if (!(value > 0) && !untyped) return { ok: false, reason: 'nothing_to_move' }
  if (value > 0 && fleetNum(loc, target) > 0) return { ok: false, reason: 'target_has_figure' }
  const source_docs = loc.source_docs.map(d => d.document_type !== 'fleet_fuel' || !d.extracted ? d : {
    ...d, extracted: d.extracted.map(p => p.fuelType !== fuelType || p.fleetType ? p : {
      ...p, fleetType: to, fleetTypeLog: [...(p.fleetTypeLog ?? []), { from: null, to, at, by }] }) })
  if (!(value > 0)) return { ok: true, location: { ...loc, source_docs, has_mobile: true, [target.typeSwitch]: true } as Location }
  const fromUnit = from === 'gasoline_amount' ? loc.gasoline_unit : loc.diesel_mobile_unit
  const fromUnitField = from === 'gasoline_amount' ? 'gasoline_unit' : 'diesel_mobile_unit'
  const rekey = <T extends { field: string }>(xs: T[] | undefined, field: string, to2: string): T[] | undefined =>
    xs?.map(x => (x.field === field ? { ...x, field: to2 } : x))
  return { ok: true, location: {
    ...loc,
    has_mobile: true,
    [target.typeSwitch]: true,
    [target.amount]: value,
    [target.unit]: fromUnit,
    [from]: 0,
    unit_changes: loc.unit_changes?.map(c => (c.field === from ? { ...c, field: String(target.amount) }
      : c.field === fromUnitField ? { ...c, field: String(target.unit) } : c)),
    manual_overrides: rekey(loc.manual_overrides, from, String(target.amount)),
    fleet_assignments: [...(loc.fleet_assignments ?? []), { from, to, field: String(target.amount), value, unit: fromUnit, at, by }],
    source_docs,
  } as Location }
}

/** FI5: one unit change on a typed figure. `field` is the figure's field (natural_gas_amount, ...). */
export interface UnitChange {
  field: string
  from: string
  to: string
  /** Units of `to` per unit of `from`, exact (lib/unitConversions EXACT_UNITS); null when the figure was cleared. */
  factor: number | null
  valueBefore: number
  valueAfter: number
  at: string
  by: { userId: string; email: string } | null
  cleared?: true
}

interface ManualOverride {
  field: string
  reason: string
  at: string
  by: { userId: string; email: string }
}

/** The override in force for a field, if any (T10). */
export function activeOverride(loc: Pick<Location, 'manual_overrides'>, field: keyof Location | string): ManualOverride | undefined {
  return (loc.manual_overrides ?? []).filter(o => o.field === String(field)).at(-1)
}

/** Why an override cannot be recorded, or null (T10): a reason is required, and who made it. */
export function overrideProblem(o: { reason: string; by?: { userId: string; email: string } | null }): string | null {
  if (!o.reason.trim()) return 'Give a reason for entering this figure manually.'
  if (!o.by?.userId || !o.by?.email) return 'An override must record who made it.'
  return null
}

// The reporting window and its labels live in lib/ghg/reportingYear.ts (T3c diff 2), imported above and re-exported.
const parseLocalDate = (s: string): Date => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }

// T10c: dates in words come from lib/ghg/dateWords.ts, the one place they are built; re-exported for callers.
export { dateInWords, isoDateInWords }

/**
 * T10b: the words of the completeness confirmation, naming the fuel, the site and the window (ruling):
 * "These are all the propane deliveries for Melbourne between 1 October 2024 and 30 September 2025."
 * The button says it and the stored note repeats it, so what was clicked is what is recorded.
 */
export function deliveriesStatement(fuel: string, site: string, win: { start: Date; end: Date }): string {
  return `These are all the ${fuel} deliveries for ${site} between ${dateInWords(win.start)} and ${dateInWords(win.end)}.`
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
  status: 'full' | 'gap' | 'overlap' | 'none'
  // EVERY condition that holds, not just the one the scalar `status` collapsed to. `status` is a scalar
  // and the conditions are NOT mutually exclusive — a fuel with BOTH a gap and an overlap used to report
  // only 'overlap', so acknowledging the duplicate slipped the gap past the gate (the D1 masking bug).
  // The gate iterates `issues` and requires a resolution for EACH. `status` is kept for display/callsites.
  issues: Array<'gap' | 'overlap'>
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

// T10b: THE CANONICAL HALF-OPEN PERIOD OF A STORED [start, end]. A one-day period (start = end) covers that
// day, whatever the date. exclusiveEnd alone read an end on the 1st as exclusive, so start = end = the 1st had
// no days and was reported as ending before it starts, contradicting the T1 ruling that a one-day bill is
// valid. Every other period is [start, exclusiveEnd(end)), unchanged. Coverage and contributions both read
// periods through here, so the two cannot disagree; exclusiveEnd stays the one definition of an end date.
export function canonicalPeriod(start: Date, end: Date): { start: Date; endExclusive: Date } {
  const s0 = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const sameDay = start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth() && start.getDate() === end.getDate()
  return { start: s0, endExclusive: sameDay ? new Date(s0.getFullYear(), s0.getMonth(), s0.getDate() + 1) : exclusiveEnd(end) }
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
    const pEndExcl = canonicalPeriod(p.start, p.end).endExclusive
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
    const jExcl = Math.min(totalDaysInWin, idxOf(canonicalPeriod(p.start, p.end).endExclusive))
    for (; i < jExcl; i++) coverCount[i]++
  })

  // Overlap pairs: any two bills whose FULL canonical periods share ≥1 day (rule R3, T3). Not clipped to
  // the window: two bills overlapping only outside the reporting year are still the same days billed
  // twice, and before T3 they were never compared (finding F-10 for a 2025 inventory).
  const overlapPairs: CoverageResult['overlaps'] = []
  for (let a = 0; a < periods.length; a++) {
    for (let b = a + 1; b < periods.length; b++) {
      const aS = periods[a].start.getTime(), aE = canonicalPeriod(periods[a].start, periods[a].end).endExclusive.getTime()
      const bS = periods[b].start.getTime(), bE = canonicalPeriod(periods[b].start, periods[b].end).endExclusive.getTime()
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
  // A straddle is NOT an issue since T2/T3: the bill is prorated automatically by its own days (rule R2).
  // `straddles` is still returned, for display.
  let status: CoverageResult['status'] = 'full'
  if (gaps.length > 0) status = 'gap'
  if (overlapPairs.length > 0) status = 'overlap'
  // Summary lists EVERY issue present, so the display never advertises just one of several problems.
  const summaryParts: string[] = []
  if (issues.includes('gap')) summaryParts.push(`missing ${gaps.map(g => g.label).join(', ')}`)
  if (issues.includes('overlap')) summaryParts.push(`${overlapPairs.length} month(s) covered by more than one bill`)
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
  // Written kinds (T3): extrapolate, same_bill, different_meters, used_none. 'duplicate' and 'straddle' are
  // LEGACY: readable, never accepted (validateResolution), so they change no figure and resolve no issue.
  kind: 'extrapolate' | 'same_bill' | 'different_meters' | 'used_none' | 'duplicate' | 'straddle' | 'deliveries_complete' | 'exact_duplicate'
  // extrapolate: gross up partial-year data by coverage ratio
  monthsCovered?: number          // for extrapolate: e.g. 11
  pctEstimated?: number           // for extrapolate: e.g. 8.3
  // extrapolate: which meter's gap (absent or null = the default single meter). different_meters: the
  // label given, which must equal the document's own meter_label (the one source the engine groups by).
  meterLabel?: string | null
  // extrapolate (T5): which document type's gap. Stationary diesel (fuel_diesel) and fleet diesel
  // (fleet_fuel) share fuelType 'diesel', so without this one estimate grossed up and cleared both.
  // Absent is accepted only where the location has a single document type for the fuel.
  documentType?: string
  // extrapolate (FI9 diff 4): which vehicle type's fleet-fuel gap. Light and heavy diesel share document type and fuel,
  // so without this one estimate would gross up both. Absent for every other document type, and for a legacy (untyped)
  // fleet reading.
  fleetType?: FleetType
  // exact_duplicate (T15, rule R6): the customer's answer to an exact duplicate across document types.
  //   count_once: countedDocId counts; excludedDocIds are retained as evidence, not counted (exact_duplicate_of).
  //   not_same:   docIds all count. Both record who chose (`by`) and when (`acknowledgedAt`).
  choice?: 'count_once' | 'not_same'
  // same_bill, and exact_duplicate count_once: the document that counts, and the ones retained as evidence
  // but not counted.
  countedDocId?: string
  excludedDocIds?: string[]
  // different_meters: the document the meter label was given to.
  docId?: string
  // used_none: the location field confirmed as zero.
  field?: string
  // deliveries_complete (T10b): the documents the customer confirmed as all the deliveries for the year. If the
  // confirmed deliveries change, the set no longer matches and the confirmation stops applying (ruling).
  docIds?: string[]
  // Who confirmed (used_none: required). The account's user id and email at the time of confirming.
  by?: { userId: string; email: string }
  // LEGACY straddle and duplicate fields: still present on rows stored before T3, read by nothing (T13).
  straddleChoice?: 'this_year' | 'next_year' | 'prorate'
  daysInYear?: number
  totalDays?: number
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
  // T18 section D: every location deleted from this inventory, append-only, in its own column
  // (ghg_inventories.location_log, supabase/migrations/20261009_ghg_location_log.sql). It sits outside
  // locations_data because the location it describes is no longer there.
  location_log?: LocationEvent[]
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
  /**
   * Which emission-factor editions priced this inventory — `ghg_inventories.factor_editions`.
   *
   * ABSENT / `{}` MEANS UNRECORDED, NOT "no factors applied". Every inventory was priced by some
   * edition; the ones saved before this column existed cannot say which, because the factor tables
   * are code and nothing recorded which revision was live at save time. Empty must warn, never
   * block, and must never be read as "the editions agree".
   *
   * Computed at save by lib/ghg/factorEditions.ts from the same locations and reporting_year that
   * produced the saved totals. Carried here — like comparability_disclosure — only so the stored
   * inventory shape stays in one place; the engine neither builds nor reads it.
   */
  factor_editions?: FactorEditions
  /**
   * The frozen class (b) edition choices, `ghg_inventories.factor_selection` (T3c diff 3). Absent or `{}`: none made
   * yet (an inventory saved before the column existed, or never saved); the next save makes them, dated that day.
   * Carried here like factor_editions; lib/ghg/factorSelection.ts reads and writes it, the engine does not.
   */
  factor_selection?: StoredFactorSelection
  /**
   * F-06: the factor editions that changed since the stored prior year, `ghg_inventories.factor_edition_comparison`,
   * written on every save whether or not the comparability question was answered. Null: no comparison made.
   * Carried here like factor_editions; lib/ghg/factorEditionComparison.ts computes it, the engine does not read it.
   */
  factor_edition_comparison?: FactorEditionComparison | null
}

const emptyLocation = (id: string, name: string, state = ''): Location => ({
  id, name, country: 'US', state: '', province: '', region: '',
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil_distillate: false, fuel_oil_distillate_amount: 0, fuel_oil_distillate_unit: 'gallons',
  has_fuel_oil_residual: false, fuel_oil_residual_amount: 0, fuel_oil_residual_unit: 'gallons',
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  // FI9: the three type ticks start unticked (no default for a type-dependent choice); the six figures start at 0.
  fleet_light: false, fleet_heavy: false, fleet_nonroad: false,
  light_petrol_amount: 0, light_petrol_unit: 'gallons', light_diesel_amount: 0, light_diesel_unit: 'gallons',
  heavy_petrol_amount: 0, heavy_petrol_unit: 'gallons', heavy_diesel_amount: 0, heavy_diesel_unit: 'gallons',
  nonroad_petrol_amount: 0, nonroad_petrol_unit: 'gallons', nonroad_diesel_amount: 0, nonroad_diesel_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average', renewable_electricity_kwh: 0, residual_region: '',
  // Supplier fields deliberately ABSENT rather than 0: absent means "not supplied", and 0 would be a
  // factor of zero — a claim that purchased heat is emission-free.
  has_purchased_steam: false, purchased_steam_mmbtu: 0, purchased_steam_unit: 'mmbtu',
  biogenic_co2_mt: 0,
  nz_use_class: 'commercial', nz_td_losses: false,
  source_docs: [],
})

// Natural gas units offered per country, as [value, label] pairs: US Mcf, Ccf, therms and MMBtu; CA m³, Mcf and GJ (GJ
// through the national heat content, R12); UK kWh and m³ (R11); AU m³ and MMBtu; NZ kWh; EU kWh (R6, R7). A bill may
// still deliver another unit; it prices only through an exact conversion to a unit the publisher prints (FI2).
// ── ORDER IS THE DEFAULT, AND RETENTION IS WHAT KEEPS A STORED FIGURE HONEST ─────────────────────
//
// snapUnitsForCountry keeps a held unit when the list still offers it, and otherwise takes opts[0].
// The three refused states (no country set, "Not listed", a country with no factor set) therefore
// get METRIC FIRST and the US units RETAINED after them:
//   - metric first => a NEW refused location, and any location switched INTO a refused state while
//     holding nothing, defaults to litres or m3. The customer is not offered a US billing unit for
//     a site that is not in the United States.
//   - US units RETAINED => a location already holding 'gallons' or 'mcf' KEEPS it. Dropping them
//     would re-snap those rows and SILENTLY REINTERPRET the stored number: 1,000 gallons would
//     start reading as 1,000 litres, a 3.79-fold error, with no conversion and no flag. That is the
//     live "unit switch relabels without converting" defect, and narrowing a list must never
//     trigger it.
// Exactly the reasoning steamUnitOptions already carries for GB kWh and GJ. Metric-ONLY lists for
// these states are the right end state and are recorded as a follow-up, to be done AFTER the unit
// conversion work, never before it.
function ngUnitOptions(country: string): Array<[string, string]> {
  const ctry = canonicalCountryCode(country)
  // Refused: m3 first, the US trio retained behind it. US itself is unchanged, below.
  if (efJurisdiction({ country: ctry }) === null) return [['m3', 'm³'], ['mcf', 'Mcf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']]
  // FI3 (R12): Canada also takes GJ, as Canadian gas bills print it, priced through ECCC's national heat content.
  if (ctry === 'CA') return [['m3', 'm³'], ['mcf', 'Mcf'], ['gj', 'GJ']]
  // FI3 (R11): UK also takes m³, priced on DEFRA's own per-m³ row; kWh stays first, the default.
  if (ctry === 'GB' || ctry === 'UK') return [['kwh', 'kWh'], ['m3', 'm³']]
  if (ctry === 'NZ') return [['kwh', 'kWh']]
  // AU: m3, and MMBtu for energy-basis bills (MJ and GJ convert to it; T10a), priced from NGA's per-GJ factor.
  if (ctry === 'AU') return [['m3', 'm³'], ['mmbtu', 'MMBtu']]
  // FI3 (R6, R7): kWh, as EU gas bills show it. m³ is not offered (no cited energy content applies to a billed m³).
  // A stored m³ figure is never relabelled: nothing snaps a unit on load, and a change of unit or country converts
  // exactly or clears it (FI5); until then it is an unpriced line with its message.
  if (EU_COUNTRIES.includes(ctry)) return [['kwh', 'kWh']]
  // FI5: Ccf as US gas bills print it (hundred cubic feet), beside Mcf. Priced on EPA's per-Mcf value through the exact
  // conversion (1 Ccf = 0.1 Mcf), stated on the row; Mcf stays first, so the default does not move.
  return [['mcf', 'Mcf'], ['ccf', 'Ccf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']]
}
// Snap a natural gas unit to a valid one for the given country (used when country changes).
function normalizeNgUnit(country: string, unit: string): string {
  const valid = ngUnitOptions(country).map(([v]) => v)
  return valid.includes(unit) ? unit : valid[0]
}
// Liquid-fuel units offered per country. Metric countries (CA, UK, AU, NZ, EU) are offered litres only, so a verifier
// does not find a US unit chosen on a metric inventory. A gallons figure that arrives from a bill converts to litres
// exactly at pricing (FI2), with the conversion stated on the row.
function liquidUnitOptions(country: string): Array<[string, string]> {
  const ctry = canonicalCountryCode(country)
  // Refused: litres first, gallons retained. See the note above ngUnitOptions.
  if (efJurisdiction({ country: ctry }) === null) return [['litres', 'Litres'], ['gallons', 'US gallons']]
  const metric = ctry === 'CA' || ctry === 'GB' || ctry === 'UK' || ctry === 'AU' || ctry === 'NZ' || EU_COUNTRIES.includes(ctry)
  return metric ? [['litres', 'Litres']] : [['gallons', 'US gallons'], ['litres', 'Litres']]
}
// FI3: heating oil and heavy fuel oil. At EU sites they are also offered in kg and tonnes, which MRR prices on a mass
// basis (Annex VI Table 1, the factor per TJ and the NCV per Gg in one row). Litres stay first so a stored litre
// figure does not move; EU heating oil in litres is unpriced with its message (R8). Elsewhere, as liquidUnitOptions.
function fuelOilUnitOptions(country: string): Array<[string, string]> {
  const ctry = canonicalCountryCode(country)
  if (EU_COUNTRIES.includes(ctry)) return [['litres', 'Litres'], ['kg', 'kg'], ['tonnes', 'Tonnes']]
  return liquidUnitOptions(country)
}
// District-heating / steam units offered per country. Same principle as liquidUnitOptions: never
// show a unit a customer in that country would not see on a bill.
//   US/default — MMBtu, the US district-steam convention. GJ also offered; some US campus systems
//     bill metric and neither unit is ambiguous, so offering both costs nothing.
//   UK: kWh first (how UK heat networks bill, and DEFRA's basis), GJ kept.
//   Other metric countries: GJ only. MMBtu is not a billing unit anywhere outside the US.
//
// KNOWN GAP: much of Germany bills district heat in MWh, which is not offered; the customer converts by hand. (The UK
// kWh gap this note used to record is closed: kWh is offered and is the UK default.)
// ⚠️ ORDER IS THE DEFAULT, AND THAT IS WHY GB LISTS kWh FIRST AND STILL LISTS GJ.
// snapUnitsForCountry keeps a held unit when the list still offers it and otherwise takes opts[0].
// So:
//   - kWh first  => a NEW GB location, and any location switched to GB holding a unit GB does not
//     offer, defaults to kWh — which is how UK heat networks bill, and the basis DEFRA publishes on.
//   - GJ RETAINED => a GB location already holding 'gj' keeps it. Dropping GJ from the list would
//     re-snap those rows to kWh and SILENTLY REINTERPRET the stored number — 212121 GJ would start
//     reading as 212121 kWh, a 277-fold error, with no conversion and no flag. That is the live
//     "unit switch relabels without converting" defect, and widening a list must never trigger it.
function steamUnitOptions(country: string): Array<[string, string]> {
  switch (efJurisdiction({ country })) {
    // DEFRA publishes per kWh; GJ kept so stored metric values are never re-snapped (see above).
    case 'UK': return [['kwh', 'kWh'], ['gj', 'GJ']]
    // EPA Table 7 publishes per mmBtu. Unchanged.
    case 'US': return [['mmbtu', 'MMBtu'], ['gj', 'GJ']]
    // CA/EU/AU/NZ publish no steam factor: the line prices on the labelled gas-boiler estimate (R14), per GJ, until
    // the customer enters their provider's figure. GJ is the basis district energy is metered in across these markets.
    default: return [['gj', 'GJ']]
  }
}

// Propane/LPG units are separate from other liquids (FI4, R13): mass is offered only where the publisher prints a
// per-mass factor. NZ kg only (MfE per kg); UK litres then kg (DEFRA per tonne); EU kg and tonnes (MRR mass basis);
// CA and AU litres; US and refused countries gallons and litres.
function propaneUnitOptions(country: string): Array<[string, string]> {
  const ctry = canonicalCountryCode(country)
  // Refused: litres first, gallons retained. See the note above ngUnitOptions.
  if (efJurisdiction({ country: ctry }) === null) return [['litres', 'Litres'], ['gallons', 'US gallons']]
  if (ctry === 'NZ') return [['kg', 'kg']]
  // FI4 (R13): mass only where the publisher prints a per-mass factor. UK: DEFRA's per-tonne Propane row, litres first so
  // the default does not move. EU: MRR's mass basis; EU litres have no cited density (FI3), so mass only.
  if (ctry === 'GB' || ctry === 'UK') return [['litres', 'Litres'], ['kg', 'kg']]
  if (EU_COUNTRIES.includes(ctry)) return [['kg', 'kg'], ['tonnes', 'Tonnes']]
  const metric = ctry === 'CA' || ctry === 'AU'
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
// `amount` is the figure the unit governs. It is here so unitsForCountryChange can tell a unit the
// customer CHOSE from one the template happened to seed, which is the only thing standing between a
// new location and a US default it never asked for.
export const UNIT_FIELDS = [
  { field: 'natural_gas_unit',       label: 'natural gas',            options: ngUnitOptions,      list: 'ngUnitOptions',      amount: 'natural_gas_amount' },
  { field: 'propane_unit',           label: 'propane / LPG',          options: propaneUnitOptions, list: 'propaneUnitOptions', amount: 'propane_amount' },
  { field: 'diesel_stationary_unit', label: 'diesel (stationary)',    options: liquidUnitOptions,  list: 'liquidUnitOptions',  amount: 'diesel_stationary_amount' },
  { field: 'fuel_oil_distillate_unit', label: 'heating oil',          options: fuelOilUnitOptions, list: 'fuelOilUnitOptions', amount: 'fuel_oil_distillate_amount' },
  { field: 'fuel_oil_residual_unit', label: 'heavy fuel oil',         options: fuelOilUnitOptions, list: 'fuelOilUnitOptions', amount: 'fuel_oil_residual_amount' },
  { field: 'gasoline_unit',          label: 'petrol (mobile)',        options: liquidUnitOptions,  list: 'liquidUnitOptions',  amount: 'gasoline_amount' },
  { field: 'diesel_mobile_unit',     label: 'diesel (mobile)',        options: liquidUnitOptions,  list: 'liquidUnitOptions',  amount: 'diesel_mobile_amount' },
  // FI9: the six fleet fields (FLEET_FIELDS), the same liquid units as the two they replace.
  { field: 'light_petrol_unit',      label: 'petrol in light vehicles',      options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'light_petrol_amount' },
  { field: 'light_diesel_unit',      label: 'diesel in light vehicles',      options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'light_diesel_amount' },
  { field: 'heavy_petrol_unit',      label: 'petrol in heavy vehicles',      options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'heavy_petrol_amount' },
  { field: 'heavy_diesel_unit',      label: 'diesel in heavy vehicles',      options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'heavy_diesel_amount' },
  { field: 'nonroad_petrol_unit',    label: 'petrol in non-road equipment',  options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'nonroad_petrol_amount' },
  { field: 'nonroad_diesel_unit',    label: 'diesel in non-road equipment',  options: liquidUnitOptions, list: 'liquidUnitOptions', amount: 'nonroad_diesel_amount' },
  { field: 'purchased_steam_unit',   label: 'purchased steam',        options: steamUnitOptions,   list: 'steamUnitOptions',   amount: 'purchased_steam_mmbtu' },
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

/**
 * The units to store when a location's COUNTRY changes, and what happens to each figure (FI5).
 *
 * ⚠️ snapUnitsForCountry CANNOT ANSWER THIS, AND THE DIFFERENCE IS A UNIT NOBODY CHOSE.
 * That function keeps any unit the new country still offers, which is right for a stream carrying a
 * figure: the customer picked gallons, gallons are still offered, gallons stand. But emptyLocation
 * seeds every unit US-first (mcf, gallons, mmbtu) before a country is picked at all, so a BRAND NEW
 * location arrives already "holding" gallons. Picking a country whose list still offers gallons then
 * kept them, and a site set to "Not listed" defaulted to a United States billing unit it had never
 * been offered.
 *
 * ⚠️ THE TEST IS `amount > 0`, AND IT IS THE SMALLEST THING THE DATA CAN ACTUALLY DISTINGUISH.
 * Nothing records whether a customer opened a unit selector, so "chose gallons and entered nothing"
 * and "never touched it" are the same row today. A figure is the one honest evidence of a choice.
 * With no figure there is nothing to relabel, and the country's own default is the better answer.
 *
 * FI5: WITH A FIGURE, IT IS CONVERTED EXACTLY OR CLEARED, NEVER RELABELLED. A held unit the new country still offers
 * stays, figure and all. Otherwise the figure moves to the first unit the country offers that an exact conversion
 * reaches from it (US gallons to litres, MMBtu to kWh), or, where none does (gallons of propane at a site that buys it
 * by the kg, Mcf of gas at a site that bills kWh), it is cleared and the customer is asked. A figure from documents
 * keeps its locked unit (T7): its unit is corrected on the bill, never by a country change.
 */
export function unitsForCountryChange(
  country: string,
  loc: Partial<Record<string, unknown>>,
): Record<UnitFieldName, UnitOutcome> {
  const out = {} as Record<UnitFieldName, UnitOutcome>
  for (const f of UNIT_FIELDS) {
    const opts = f.options(country).map(([v]) => v)
    const amount = typeof loc[f.amount] === 'number' ? loc[f.amount] as number : 0
    const held = heldUnit(loc, f.field)
    if (fieldLocked(loc, f.amount)) { out[f.field] = { unit: held ?? opts[0], value: amount, conversion: null, locked: true }; continue }
    if (!(amount > 0)) { out[f.field] = { unit: opts[0], value: amount, conversion: null }; continue }
    if (held && opts.includes(held)) { out[f.field] = { unit: held, value: amount, conversion: null }; continue }
    const reachable = held ? opts.find(o => exactConversion(unitToken(held), unitToken(o))) : undefined
    out[f.field] = changeUnit(f.amount, amount, held ?? '', reachable ?? opts[0])
  }
  return out
}

// ── FI5: A UNIT CHANGE CONVERTS EXACTLY OR CLEARS AND ASKS ────────────────────────────────────────────────────────
//
// The defect this closes (CLAUDE.md, found 5 Aug 2026): switching the unit selector on a figure relabelled it, so
// 332 m³ became 332 Mcf, about 28 times the gas, with no flag. The rule (design FI5): convert ONLY where both units
// measure the same quantity and EXACT_CONVERSIONS joins them (gallons and litres, m³ and Mcf or Ccf per the 7 Oct
// reference-conditions ruling, MMBtu, therms, GJ and kWh); otherwise clear the figure and ask. A density, an energy
// content or a gross/net ratio is never applied to a figure the customer typed.

/** What a unit change does to one figure: kept or converted (conversion null when nothing moved), cleared, or locked. */
export type UnitOutcome =
  | { unit: string; value: number; conversion: { factor: number; statement: string } | null; locked?: true }
  | { unit: string; cleared: true; from: string }

/** The unit a field holds, with the defaults the engine reads when it is absent (fuel oil gallons, steam MMBtu). */
function heldUnit(loc: Partial<Record<string, unknown>>, field: UnitFieldName): string | undefined {
  const v = loc[field]
  if (typeof v === 'string' && v) return v
  if (field === 'fuel_oil_distillate_unit' || field === 'fuel_oil_residual_unit') return 'gallons'
  if (field === 'purchased_steam_unit') return 'mmbtu'
  return undefined
}

/** T7: a figure worked out from documents (and not overridden by hand) has a locked unit. */
function fieldLocked(loc: Partial<Record<string, unknown>>, amountField: string): boolean {
  if (!Array.isArray(loc.source_docs)) return false
  const l = loc as unknown as Location
  return documentsBacking(l, amountField as keyof Location) > 0 && !activeOverride(l, amountField)
}

/**
 * The unit selector (FI5): a figure in `from` changed to `to`. Pure. Converts exactly, or clears and asks; a field
 * with no figure just takes the new unit. `field` is the figure's field, carried for the record the caller writes.
 */
export function changeUnit(field: string, value: number, from: string, to: string): UnitOutcome {
  void field
  if (from === to || !(value > 0)) return { unit: to, value, conversion: null }
  const c = exactConversion(unitToken(from), unitToken(to))
  if (!c) return { unit: to, cleared: true, from }
  return { unit: to, value: value * c.toPerFrom, conversion: { factor: c.toPerFrom, statement: c.statement } }
}

/**
 * Applies unit outcomes to a location: the units, the converted or cleared figures, and one unit_changes entry per
 * figure that moved. A locked field, or one whose figure did not move, records nothing.
 */
export function applyUnitOutcomes(
  loc: Location, outcomes: Partial<Record<UnitFieldName, UnitOutcome>>, at: string, by: { userId: string; email: string } | null,
): Location {
  const next = { ...loc } as unknown as Record<string, unknown>
  const changes: UnitChange[] = [...(loc.unit_changes ?? [])]
  for (const f of UNIT_FIELDS) {
    const o = outcomes[f.field]
    if (!o) continue
    const before = typeof next[f.amount] === 'number' ? next[f.amount] as number : 0
    const fromUnit = heldUnit(next, f.field) ?? ''
    next[f.field] = o.unit
    if ('cleared' in o) {
      next[f.amount] = 0
      changes.push({ field: f.amount, from: o.from, to: o.unit, factor: null, valueBefore: before, valueAfter: 0, at, by, cleared: true })
    } else if (o.conversion) {
      next[f.amount] = o.value
      changes.push({ field: f.amount, from: fromUnit, to: o.unit, factor: o.conversion.factor, valueBefore: before, valueAfter: o.value, at, by })
    }
  }
  return { ...(next as unknown as Location), ...(changes.length ? { unit_changes: changes } : {}) }
}

const unitWords = (unit: string, n: number) => {
  const u = EXACT_UNITS[unitToken(unit)]
  return u ? (n === 1 ? u.one : u.many) : unitLabel(unit)
}
const figureWords = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: Math.abs(x) < 10 ? 4 : 2 })

/** The fuel a unit field's figure is, in the words UNIT_FIELDS gives it. */
function unitFieldFuel(amountField: string): string {
  return UNIT_FIELDS.find(f => f.amount === amountField)?.label ?? amountField
}

/** FI5: the sentence beside a field after its unit changed, exactly as the design gives it. No em dash. */
export function unitChangeMessage(c: UnitChange): string {
  if (c.cleared) {
    return `The ${unitFieldFuel(c.field)} figure was in ${unitWords(c.from, 2)}, which cannot be converted exactly to ${unitWords(c.to, 2)}, so it has been cleared. Enter it in ${unitWords(c.to, 2)}.`
  }
  const statement = exactConversion(unitToken(c.from), unitToken(c.to))?.statement ?? ''
  return `Converted from ${figureWords(c.valueBefore)} ${unitWords(c.from, c.valueBefore)} to ${figureWords(c.valueAfter)} ${unitWords(c.to, c.valueAfter)} (${statement}).`
}

/** The latest unit change recorded for a figure, if any. */
export function latestUnitChange(loc: Pick<Location, 'unit_changes'>, amountField: string): UnitChange | undefined {
  return (loc.unit_changes ?? []).filter(c => c.field === amountField).at(-1)
}

/**
 * The conversion that produced a field's current figure, for its workings row: the latest change, when it was a
 * conversion into the unit the field holds and the figure is still the converted value. A figure typed again since,
 * or one from documents, did not come from it, and the row does not claim it.
 */
function unitChangeBehind(loc: Location, amountField: keyof Location, entered: number, unit: string): UnitChange | undefined {
  const c = latestUnitChange(loc, String(amountField))
  if (!c || c.cleared || c.to !== unit || c.valueAfter !== entered || fieldLocked(loc as never, String(amountField))) return undefined
  return c
}
/** FI5: the conversion to show beside a typed field: the one that produced the figure it holds now, if any. */
export function convertedUnitChange(loc: Location, amountField: string): UnitChange | undefined {
  const f = UNIT_FIELDS.find(x => x.amount === amountField)
  if (!f) return undefined
  const amount = Number((loc as unknown as Record<string, unknown>)[amountField] ?? 0)
  return unitChangeBehind(loc, amountField as keyof Location, amount, heldUnit(loc as never, f.field) ?? '')
}
function unitChangeNote(c: UnitChange): string {
  return `${unitChangeMessage(c)} Unit changed${c.by ? ` by ${c.by.email}` : ''} on ${dateInWords(new Date(c.at))}.`
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

// Country-aware combustion factor selection is pickEF (below): US EPA (EF), ECCC (EF_CA, with the province's gas CO2),
// DEFRA (EF_UK), MRR/IPCC (EF_EU), NGA (EF_AU) or MfE (EF_NZ, by use class). There is no fallback (FI2): a key the
// location's own table does not hold, directly or by an exact conversion, is a miss (efMiss), which FI1 turns into an
// unpriced line rather than a zero. The propane key is built from the stored unit by propaneEfKey.
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
// FI2 diff 2: fuelOilToGallons is gone. A fuel-oil figure in litres priced on a per-gallon table (EPA) is converted by
// pickEF's exact router, and the row's conversion_note states the step.

// ── STEAM: CONVERT TO THE BASIS THIS JURISDICTION'S FACTOR IS PUBLISHED IN ──────────────────────
// The unit a customer enters and the unit a factor is published in are two different facts, and
// steam is the stream where they genuinely diverge by country: EPA Table 7 is per mmBtu, DEFRA's
// Scope 2 district heat row is per kWh. steamToMmbtu hardcoded mmBtu as THE canonical basis, which
// was true only while the US factor was the only one.
//
// So the basis is a PARAMETER, supplied by the factor itself (STEAM_EF entries carry their own
// `basis`), never chosen here. A factor and the unit it is per are one thing; this is what keeps
// them from separating.
export type SteamUnit = 'mmbtu' | 'gj' | 'kwh'
/** The units a steam factor is held in: EPA per MMBtu, DEFRA per kWh, and (R14) the gas-boiler estimate per GJ. */
export type SteamBasis = 'mmbtu' | 'kwh' | 'gj'

export function steamToBasis(amount: number, unit: SteamUnit | undefined, basis: SteamBasis): { amount: number; note?: string } {
  const from = unit ?? 'mmbtu'
  if (from === basis) return { amount }
  // R14: the estimate is per GJ. Any other energy unit converts to it exactly, with the conversion stated.
  if (basis === 'gj') {
    const c = exactConversion(from, 'gj')!
    const out = amount * c.toPerFrom
    return { amount: out, note: `${amount} ${EXACT_UNITS[from].many} converted to ${out.toFixed(4)} GJ (${c.statement}, exact)` }
  }
  // Each note names the DEFINING constant, not just the arithmetic — a verifier retyping the row has
  // to be able to see which Btu (there are several) or which kWh is meant. Same standard as the
  // fuel-oil note's "(exact, NIST)".
  if (basis === 'mmbtu') {
    // Only GJ reaches here: no jurisdiction offers kWh alongside a per-mmBtu factor.
    const out = from === 'gj' ? amount / GJ_PER_MMBTU : amount / KWH_PER_GJ / GJ_PER_MMBTU
    return { amount: out, note: from === 'gj'
      ? `${amount} GJ ÷ ${GJ_PER_MMBTU} = ${out.toFixed(4)} MMBtu (exact, International Table Btu) — the published factor is per MMBtu`
      : `${amount} kWh ÷ ${KWH_PER_GJ} ÷ ${GJ_PER_MMBTU} = ${out.toFixed(4)} MMBtu (exact: 1 kWh ≡ 3.6 MJ, International Table Btu) — the published factor is per MMBtu` }
  }
  const out = from === 'gj' ? amount * KWH_PER_GJ : amount * GJ_PER_MMBTU * KWH_PER_GJ
  return { amount: out, note: from === 'gj'
    ? `${amount} GJ × ${KWH_PER_GJ} = ${out.toFixed(4)} kWh (exact, 1 kWh ≡ 3.6 MJ by definition) — the published factor is per kWh`
    : `${amount} MMBtu × ${GJ_PER_MMBTU} × ${KWH_PER_GJ} = ${out.toFixed(4)} kWh (exact: International Table Btu, 1 kWh ≡ 3.6 MJ) — the published factor is per kWh` }
}

// FI2 diff 2: fuelOilPricing, the chooser between a fuel-oil grade's litre and gallon keys, is gone. Every table now
// holds each grade in the unit its publisher prints (per litre for ECCC, DEFRA, DCCEEW and MfE; per US gallon for EPA),
// and pickEF converts the unit entered to it exactly, with the conversion on the row.
/** FI2 (ruling R5): a stored unit as a factor-key unit token. Unrecognised units pass through, so the lookup misses. */
function unitToken(unit: string): string {
  return unit === 'gallons' ? 'gallon' : unit === 'litres' ? 'litre' : unit === 'lbs' ? 'lb' : unit === 'tonnes' ? 'tonne' : unit
}
function propaneEfKey(unit: string): string {
  return `propane_${unitToken(unit)}`
}
// A complete published factor: the three gases calcGas needs to price an activity figure.
type CombustionEF = { co2: number; ch4: number; n2o: number }

// ── PURCHASED STEAM / DISTRICT HEAT, BY JURISDICTION ─────────────────────────────────────────────
//
// ⚠️ THIS TABLE HAS NO US FALLBACK, AND ITS ABSENCE IS THE WHOLE DESIGN. Since FI2 combustion has none either (pickEF
// reads the location's own table only). For steam a fallback would be worse still, because the US steam factor is not a
// measurement at all: it is EPA ASSUMING a natural-gas boiler at 80% thermal efficiency. Serving that to a Canadian customer under
// an ECCC citation invents a boiler that may not exist. (It is also exactly what the commercial data
// vendors do: "District steam, Canada" factors trace back to Energy Star Portfolio Manager, i.e. EPA.)
//
// STRUCTURALLY ENFORCED, NOT CONVENTIONAL. This is a TOTAL Record over EfJurisdiction — every
// jurisdiction has an explicit entry, so there is no lookup miss for a fallback to catch, and no `??`
// anywhere in the steam path. Adding a jurisdiction fails tsc here until someone states what its
// steam factor IS. A test also greps this region for `EF[` / `?? EF` so re-introducing a fallback
// fails loudly rather than quietly repricing four countries.
//
// ⚠️ 'unpublished' AND 'not_searched' ARE DIFFERENT CLAIMS AND MUST STAY DISTINGUISHABLE IN CODE.
// A comment saying "we looked and found nothing" reads identically to one saying "nobody looked", and
// the two license completely different actions: the first is settled until the publisher moves, the
// second is an open task. Making it a discriminant means the customer-facing wording cannot claim a
// search that never happened, and a future reader cannot mistake one for the other.
type SteamPublished = {
  kind: 'published'
  ef: CombustionEF
  /** The unit the factor is published in. The activity converts onto THIS, never the reverse. */
  basis: SteamBasis
  source: string
}
type SteamAbsent = {
  /** 'unpublished' = primary source searched, factor confirmed absent. 'not_searched' = no primary source consulted. */
  kind: 'unpublished' | 'not_searched'
  /** What was actually checked. Empty for 'not_searched' — there is nothing to report. */
  searched: string
  /** Customer-facing remedy. Must not assert a search that did not happen. */
  guidance: string
}
/**
 * R14 (7 Oct 2026): no publisher prints a factor, so the line prices on a LABELLED ESTIMATE: the country's own
 * natural gas factor per unit of energy (gross) / 0.80. Method: GHG Protocol Scope 2 Guidance, Appendix A, endnote 1
 * (page 92). The 0.80 is US EPA GHG Emission Factors Hub 2025, Table 7 note ("These factors assume natural gas fuel is
 * used to generate steam or heat at 80 percent thermal efficiency"); the emission factor is always the site's own
 * country's (R2). `searched` keeps the record of what was checked for a published factor.
 */
type SteamEstimated = { kind: 'estimated'; searched: string }
export type SteamEntry = SteamPublished | SteamAbsent | SteamEstimated

const STEAM_EF: Record<EfJurisdiction, SteamEntry> = {
  // EPA Hub 2025 Table 7 — a real gas split, so calcGas applies OUR selected GWP set and the row
  // stamps the live gwpVersion. See the key's own note in EF.
  US: { kind: 'published', ef: EF.steam_mmbtu, basis: 'mmbtu', source: EF_SOURCES.steam_us },
  // DEFRA 2026 Scope 2 district heat — combined CO2e per kWh with AR5 already applied, hence the
  // zeros and the as-published stamp. See the key's own note in EF_UK.
  // `source` is what the WORKINGS ROW prints, so it carries the table as well as the publication — the
  // reason steam was given its own citation in the first place (see steam_us/steam_uk in EF_SOURCES).
  // factor_editions records EF_SOURCES.steam_uk, the bare citation, via factorEditions.ts.
  UK: { kind: 'published', ef: EF_UK.steam_kwh, basis: 'kwh', source: citeWithLocator('steam_uk') },
  CA: {
    kind: 'estimated',
    searched: 'ECCC "Emission factors and reference values" v3.0 (Oct 2025), full document. Sections cover fossil fuel combustion, grid electricity and biogas. The only occurrence of "steam" is "Steam-flaked corn" — a beef-cattle diet parameter in Table 9.',
    // The B.C. Best Practices Methodology (2025) prescribes the supplier-specific route explicitly:
    // an organisation buying heat or cooling determines emissions from the fuels the district energy
    // plant consumed, its generation, and its distribution and heat-transfer efficiencies. So this is
    // not us declining to guess — it is the published Canadian method.
  },
  AU: {
    kind: 'estimated',
    searched: 'DCCEEW National Greenhouse Accounts Factors 2025, all 27 sheets. Tables 1 and 2 are the only Scope 2 tables and both are scoped explicitly to "purchased or acquired electricity".',
  },
  NZ: {
    // ⚠️ THE TABLE OF CONTENTS LIES, AND THAT IS WHY THIS IS WRITTEN OUT. The catalogue has a page
    // titled "Purchased Electricity, Heat, and Steam" — a reader checking the contents would conclude
    // a steam factor exists. It contains two sections, Purchased Electricity and Transmission and
    // distribution losses, and NOT ONE factor label in the entire catalogue contains "steam". The
    // heading names a category MfE does not populate.
    kind: 'estimated',
    searched: 'MfE Measuring Emissions Catalogue 2026 v2, all 3,252 rows of the flat file. No factor label contains "steam". The page titled "Purchased Electricity, Heat, and Steam" holds only Purchased Electricity and T&D losses.',
  },
  EU: {
    // ⚠️ NOT THE SAME RECORD AS CA/AU/NZ. No primary source was searched (there is no single EU-wide publisher), so
    // `searched` says so rather than claiming a search. If a member-state publisher is ever seeded, that state becomes
    // 'published'. Priced on the R14 estimate from EF_EU's gross kWh gas factor.
    kind: 'estimated',
    searched: 'No primary source searched: there is no single EU-wide publisher across 27 member states.',
  },
}

/**
 * The `entry_method` a steam row carries when the customer's own provider figure priced it.
 *
 * ⚠️ A NAMED CONSTANT BECAUSE A SECOND MODULE MATCHES ON IT. factorEditions.anyPublishedFactorApplied
 * has to tell a row priced from a PUBLISHED table from one priced by a private figure, and a bare
 * string literal in two files is the drift this repo keeps writing tests against. Exported so the
 * producer and the consumer of the value cannot disagree about its spelling.
 */
export const SUPPLIER_SPECIFIC_ENTRY_METHOD = 'supplier-specific'

/** The steam factor (or the reasoned absence) for a location. The ONLY steam lookup — no fallback. */
export function steamFactorFor(loc: { country?: string }): SteamEntry | null {
  // null when the country resolves to no jurisdiction at all. A refused location never reaches a
  // steam lookup in practice, because it is excluded whole before anything prices, but this
  // function is exported and its type must not promise an entry it cannot produce.
  const j = efJurisdiction(loc)
  return j === null ? null : STEAM_EF[j]
}

/**
 * What actually prices a location's steam, once the customer's own supplier figure is taken into
 * account. Returns null when the stream cannot be priced at all, which is a REPORTABLE STATE and not
 * an error — see the declaration row in buildWorkings and findSteamFactorGaps.
 *
 * A SUPPLIER FIGURE OUTRANKS A PUBLISHED DEFAULT, deliberately. The published factors are national
 * averages (or, for the US, an assumed boiler); a figure from the network that actually supplied the
 * heat is primary data. This is the same precedence Scope 3 Category 1 already applies — supplier-
 * specific first, default second — and the B.C. methodology prescribes it for exactly this stream.
 */
/** R14: the thermal efficiency the estimate assumes, from US EPA GHG Emission Factors Hub 2025, Table 7 note. */
export const STEAM_BOILER_EFFICIENCY = 0.80
/** R14: the flag an estimated steam row carries. */
export const STEAM_ESTIMATE_FLAG = 'steam_gas_boiler_80'
/** R14: the short label beside the steam figure in the wizard. */
export const STEAM_ESTIMATE_SHORT = "Estimated from natural gas at 80% efficiency. Enter your provider's figure below to replace it."

/** R14: where the gas factor behind a steam estimate comes from, in words, per jurisdiction. */
function steamGasSource(loc: Location, j: EfJurisdiction, heat?: EditionUse): string {
  switch (j) {
    case 'CA': return `${EF_SOURCES.combustion_ca}, ${caGasProvince(loc)} marketable natural gas per m³, at Canada's national gross heat content ${CA_GAS_HEAT_TEXT[(heat?.key as number) ?? 2023]?.words ?? CA_GAS_HEAT_TEXT[2023].words}`
    case 'AU': return `${EF_SOURCES.combustion_au}, natural gas per GJ (Table 5, gross basis)`
    case 'NZ': return `${EF_SOURCES.combustion_nz}, natural gas per kWh, ${loc.nz_use_class ?? 'commercial'} use class (gross basis, Measuring Emissions Guide Appendix A), converted exactly to per GJ`
    case 'EU': return 'EU MRR 2018/2066 Annex VI Table 1, natural gas, x 0.90 net per gross (IPCC 2006 Vol. 2 Ch. 1 section 1.4.1.2), converted exactly to per GJ'
    default: return ''
  }
}

/** R14: the note on an estimated steam row, on every surface that shows the row. No em dash. */
export function steamEstimateNote(country: string, gasFactor: string, gasSource: string): string {
  return `Estimated: no published factor for purchased steam or district heat in ${country}. Calculated as if generated from natural gas at 80% efficiency: ${gasFactor} (${gasSource}) / 0.80 (method: GHG Protocol Scope 2 Guidance, Appendix A; 80% assumption: US EPA GHG Emission Factors Hub 2025, Table 7). It excludes distribution losses and may overstate a network that uses low-carbon heat. Enter your provider's emission intensity to replace it.`
}

export type SteamPriced = { ef: CombustionEF; basis: SteamBasis; source: string; supplier: boolean; edition?: EditionUse; estimated?: { note: string; vintage?: string } }
/**
 * The factor that prices this location's purchased steam, or null where there is none (FI7). T3c: a published factor
 * (US EPA Table 7, DEFRA) is the edition the window selects, and the R14 estimate takes its gas factor's selection;
 * either throws MissingEditionError when the edition it needs is not held. A supplier figure has no edition.
 */
export function steamPricing(loc: Location, sel: Sel): SteamPriced | null {
  const sup = loc.purchased_steam_supplier_ef
  if (typeof sup === 'number' && sup > 0) {
    // A supplier states ONE kg CO2e per unit with its own GWP set baked in — the same shape as DEFRA,
    // so it takes the same zeros convention and factorCells stamps it as-published. Storing it in
    // `ch4`/`n2o` would double-count, and claiming our AR set governs their arithmetic would be false.
    return {
      ef: { co2: sup, ch4: 0, n2o: 0 },
      basis: loc.purchased_steam_supplier_ef_basis ?? 'kwh',
      source: `${EF_SOURCES.steam_supplier}${loc.purchased_steam_supplier_source ? ` — ${loc.purchased_steam_supplier_source}` : ''}`,
      supplier: true,
    }
  }
  const entry = steamFactorFor(loc)
  // null entry = the country resolves to no jurisdiction, so there is no table to ask: not priced. The location is
  // excluded whole before this is reached.
  if (entry?.kind === 'published') {
    const j = efJurisdiction(loc)!
    const u = editionFor(STEAM_DATASET[j]!, sel)
    // T3d: the value and citation of the edition selected; the newest edition is STEAM_EF's own entry.
    const ed = STEAM_BY_EDITION[j]?.[u.key as number]
    if (!ed) throw new Error(`The registry holds ${u.label}, but no ${j} steam factor is held for ${u.key}.`)
    return { ef: ed.ef, basis: entry.basis, source: ed.source ?? entry.source, supplier: false, edition: u }
  }
  if (entry?.kind !== 'estimated') return null
  // R14: the site's OWN country's natural gas factor per GJ gross (pickEF reads that table only: never another
  // country's, R2), each gas divided by the efficiency. CA needs its province (R12); with none, there is no gas factor
  // and the line is unpriced with the province message.
  const j = efJurisdiction(loc)!
  const gas = pickEF(loc, 'natural_gas_gj', sel)
  // R14 (R17): the estimate takes its gas factor's edition, so a missing gas edition is the steam line's too.
  const gasEdition = editionMissOf(gas.factor)
  if (gasEdition) throw gasEdition
  if (!isPriceableEF(gas.factor) || !gas.publisher) return null
  const e = STEAM_BOILER_EFFICIENCY
  const ef = { co2: gas.factor.co2 / e, ch4: gas.factor.ch4 / e, n2o: gas.factor.n2o / e }
  const combined = gas.factor.ch4 === 0 && gas.factor.n2o === 0
  const gasFactor = `${Number(gas.factor.co2.toPrecision(5))} kg ${combined ? 'CO2e' : 'CO2 (with CH4 and N2O on the same basis)'} per GJ gross natural gas`
  const ctry = canonicalCountryCode(loc.country)
  const note = steamEstimateNote(countryNameEn(ctry === 'EL' ? 'GR' : ctry), gasFactor, steamGasSource(loc, j, gas.heat))
  return { ef, basis: 'gj', supplier: false, estimated: { note, vintage: gas.publisher.edition }, ...(gas.edition ? { edition: gas.edition } : {}),
    source: `Estimate: ${gas.publisher.publisher} natural gas / 0.80 (GHG Protocol Scope 2 Guidance, Appendix A; US EPA GHG Emission Factors Hub 2025, Table 7)` }
}

/** T3d: each published steam table keyed by the edition it holds, with its citation where it is not STEAM_EF's own. */
const STEAM_BY_EDITION: Partial<Record<EfJurisdiction, Record<number, { ef: CombustionEF; source?: string }>>> = {
  US: {
    2023: { ef: { co2: EPA_2023.steam_mmbtu.co2.value, ch4: EPA_2023.steam_mmbtu.ch4.value, n2o: EPA_2023.steam_mmbtu.n2o.value },
      source: 'US EPA (2023) GHG Emission Factors Hub, Table 7, Steam and Heat (natural gas at 80% thermal efficiency; combustion only, tank-to-wheel)' },
    2024: { ef: { co2: EPA_2024.steam_mmbtu.co2.value, ch4: EPA_2024.steam_mmbtu.ch4.value, n2o: EPA_2024.steam_mmbtu.n2o.value },
      source: 'US EPA (2024) GHG Emission Factors Hub, Table 7, Steam and Heat (natural gas at 80% thermal efficiency; combustion only, tank-to-wheel)' },
    2025: { ef: EF.steam_mmbtu },
  },
  UK: {
    2023: { ef: EF_UK_2023.steam_kwh, source: `${EF_SOURCES.edition_desnz_2023}, Heat and steam sheet, Heat and steam > District heat and steam (${DESNZ_2023.steam_kwh.cite.cell})` },
    2024: { ef: EF_UK_2024.steam_kwh, source: `${EF_SOURCES.edition_desnz_2024}, Heat and steam sheet, Heat and steam > District heat and steam (${DESNZ_2024.steam_kwh.cite.cell})` },
    2025: { ef: EF_UK_2025.steam_kwh, source: `${EF_SOURCES.edition_desnz_2025}, Heat and steam sheet, Heat and steam > District heat and steam (${DESNZ_2025.steam_kwh.cite.cell})` },
    2026: { ef: EF_UK.steam_kwh },
  },
}

/** steamPricing, with a missing edition read as "not priced" (null). For callers that only need the figure; the
 *  unpriced line and its message come from unpricedLines. */
export function steamPricingOrMissing(loc: Location, sel: Sel): SteamPriced | null {
  try { return steamPricing(loc, sel) } catch (e) { if (e instanceof MissingEditionError) return null; throw e }
}
/** The priced steam figure in tonnes, or 0 when the stream cannot be priced. Shared by both callers. */
function steamTonnes(loc: Location, gwpVersion: GwpVersion, sel: Sel): number {
  if (!loc.has_purchased_steam || loc.purchased_steam_mmbtu <= 0) return 0
  const p = steamPricingOrMissing(loc, sel)
  if (!p) return 0
  return calcGas(p.ef, steamToBasis(loc.purchased_steam_mmbtu, loc.purchased_steam_unit, p.basis).amount, gwpVersion).total
}

// What pickEF returns when the location's own table does not carry the key, directly or by an exact conversion (there
// is no US fallback since FI2).
// It deliberately carries no gases — a blank must not be priced as zero — and instead records what
// was looked up, so calcGas can name the fuel, unit and country it refused rather than guess.
//
// ⚠️ THE SHAPE IS THE POINT. Before this existed, five of pickEF's six country branches spread a
// missing key (`{ ...undefined }` is legal JS and yields `{}`, so the figure silently became NaN)
// while the sixth returned the raw `undefined` and crashed on `ef.co2`. The same absent factor was
// a TypeError in the US and a silent NaN everywhere else, decided only by jurisdiction. Every
// branch now returns THIS, and calcGas refuses it identically.
// `cause` 'province' (FI1): Canadian gas whose province is blank or not one ECCC publishes a value for. The
// factor is not missing from a table; the input that selects it is, so the line asks for the province.
// FI9: 'fleet_legacy', a fleet figure entered before vehicle types were asked; 'equipment', non-road fuel whose publisher
// splits by equipment type, with none chosen. Like 'province', the factor exists; the input that selects it is missing.
type MissCause = 'province' | 'fleet_legacy' | 'equipment' | 'edition'
interface MissingEF { co2?: undefined; ch4?: undefined; n2o?: undefined; __missing: { key: string; country: string; cause?: MissCause; edition?: MissingEditionError } }

const efMiss = (key: string, country: string, cause?: MissCause, edition?: MissingEditionError): CombustionEF =>
  ({ __missing: { key, country: country || '(unset)', ...(cause ? { cause } : {}), ...(edition ? { edition } : {}) } } as unknown as CombustionEF)
/** T3c: the MissingEditionError a miss carries, if the edition was the reason. */
const editionMissOf = (ef: CombustionEF): MissingEditionError | undefined => (ef as unknown as MissingEF).__missing?.edition

// FI2: the shared resolution step that lived here (efOr) is tableLookup, below pickEF, which also returns the table
// that supplied the value. Scalar entries such as EF.ammonia (never priced: no GWP) are still a miss there.

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

/** Does this lookup carry a complete factor? The non-throwing half of assertPriceable, shared with it
 *  so "priceable" has ONE definition. Used to ask a table whether it publishes on a given basis. */
const isPriceableEF = (ef: CombustionEF | MissingEF | null | undefined): ef is CombustionEF =>
  !!ef && typeof ef.co2 === 'number' && typeof ef.ch4 === 'number' && typeof ef.n2o === 'number'

// The refusal. Asserts rather than returns a boolean so callers narrow without a cast.
function assertPriceable(ef: CombustionEF | MissingEF | null | undefined): asserts ef is CombustionEF {
  if (isPriceableEF(ef)) return
  const miss = (ef as MissingEF | null | undefined)?.__missing
  // T3c: a missing edition is its own refusal, so a caller can name the edition rather than a unit.
  if (miss?.edition) throw miss.edition
  const { fuel, unit } = splitFactorKey(miss?.key ?? '')
  throw new MissingEmissionFactorError(fuel, unit, miss?.country ?? '(unknown country)', miss?.key ?? '(unknown key)')
}

/**
 * FI2: what pickEF returns. `factor` is per unit of the key ASKED FOR (or the uniform miss); `publisher` is the table
 * that supplied it, null on a miss; `key` is the key that table holds and was read; `conversion` is the exact
 * conversion from the unit asked for to that key's unit, when one was applied.
 */
export interface PickedFactor {
  factor: CombustionEF
  publisher: FactorSource | null
  key?: string
  conversion?: { from: string; to: string; toPerFrom: number; statement: string }
  /** FI9: a fleet row's note (publisher, row used, why) and, for a US road line with no miles, the sentence saying
   *  methane and nitrous oxide are not counted. */
  fleet?: { note: string; notCounted?: string; type: FleetType; fuel: FleetFuel }
  /** T3c: the edition the value came from, as selected for the window. Absent on a miss. */
  edition?: EditionUse
  /** T3c (R12, R18): a Canadian gas figure in an energy unit, priced through this NIR edition's heat content. */
  heat?: EditionUse
}

/**
 * FI2 rulings: the calorific basis each table's gas factor per unit of energy is on, as its publisher states it. A gas
 * quantity in an energy unit is converted to another energy unit (exactly) only where the table states its basis.
 *   US EPA: higher heating value (EPA's factors per MMBtu are HHV). DEFRA: gross CV (EF_UK natural_gas_kwh is the
 *   gross-CV row). DCCEEW NGA: gross (51.53 kg CO2e/GJ is on gross energy content). MfE: gross, by ruling R4 (7 Oct
 *   2026), citing the Measuring Emissions Guide, Appendix A (A.1): "we have used gross calorific values".
 *   EU (FI3, R7): EF_EU.natural_gas_kwh is per kWh GROSS, as EU bills show it, from MRR's net factor x 0.90 (IPCC).
 *   CA (FI3, R12): EF_CA's per-GJ gas key is per GJ GROSS, from ECCC's national gross heat content (NIR Table A4-2).
 */
const GAS_CALORIFIC_BASIS: Partial<Record<EfJurisdiction, 'gross'>> = { US: 'gross', UK: 'gross', AU: 'gross', NZ: 'gross', EU: 'gross', CA: 'gross' }
/**
 * FI10: which variant of a publisher's table priced a row, where the publisher prints more than one for the same fuel.
 * Today only MfE's use classes. A later variant (the CA and EU fixed end-use CH4 and N2O rows) extends this union and
 * is carried on the same row field, `factor_variant`.
 */
export type FactorVariant = 'Commercial use class' | 'Industrial use class'
/** FI10: the use class that selected the EF_NZ table, as the row names it. pickEF defaults to commercial, and so does this. */
export function nzUseClassVariant(loc: Pick<Location, 'nz_use_class'>): FactorVariant {
  return loc.nz_use_class === 'industrial' ? 'Industrial use class' : 'Commercial use class'
}
/** R4: the note on every NZ natural gas row, saying which calorific basis the MfE per-kWh factor is on. */
export const NZ_GAS_BASIS_NOTE =
  'MfE natural gas factor per kWh, on a gross calorific value basis: Measuring Emissions Guide, Appendix A (A.1), "we have used gross calorific values".'

/** "natural_gas_m3" to ["natural_gas", "m3"]: the unit is the segment after the LAST underscore. */
const splitKey = (key: string): [string, string] => {
  const i = key.lastIndexOf('_')
  return i < 0 ? [key, ''] : [key.slice(0, i), key.slice(i + 1)]
}

// T3c: each combustion table keyed by the edition it holds. Today's single held edition per table, as the registry
// records it held; a window that needs another edition gets MissingEditionError, never this one.
/**
 * T3d: the citation each held edition is printed in, by dataset and edition key, where it is not the newest edition's
 * (which the jurisdiction's own EF_SOURCES string already names). A row priced on DEFRA 2024 cites the 2024 document,
 * never the 2026 one beside it.
 */
const EDITION_CITATION: Partial<Record<DatasetId, Record<number, string>>> = {
  desnz_combustion: { 2023: EF_SOURCES.edition_desnz_2023, 2024: EF_SOURCES.edition_desnz_2024, 2025: EF_SOURCES.edition_desnz_2025 },
  desnz_mobile: { 2023: EF_SOURCES.edition_desnz_2023, 2024: EF_SOURCES.edition_desnz_2024, 2025: EF_SOURCES.edition_desnz_2025 },
  desnz_steam: { 2023: EF_SOURCES.edition_desnz_2023, 2024: EF_SOURCES.edition_desnz_2024, 2025: EF_SOURCES.edition_desnz_2025 },
  epa_hub_combustion: { 2023: EF_SOURCES.edition_epa_2023, 2024: EF_SOURCES.edition_epa_2024 },
  epa_hub_mobile: { 2023: EF_SOURCES.edition_epa_2023_mobile, 2024: EF_SOURCES.edition_epa_2024_mobile },
  nga_grid: { 2026: EF_SOURCES.edition_nga_2026, 2023: EF_SOURCES.edition_nga_2023, 2024: EF_SOURCES.edition_nga_2024 },
  nga_combustion: { 2026: EF_SOURCES.edition_nga_2026_combustion, 2023: EF_SOURCES.edition_nga_2023_combustion, 2024: EF_SOURCES.edition_nga_2024_combustion },
  nga_mobile: { 2026: EF_SOURCES.edition_nga_2026_mobile, 2023: EF_SOURCES.edition_nga_2023_mobile, 2024: EF_SOURCES.edition_nga_2024_mobile },
  nga_residual: { 2026: EF_SOURCES.edition_nga_2026_residual, 2023: EF_SOURCES.edition_nga_2023_residual, 2024: EF_SOURCES.edition_nga_2024_residual },
  mfe_combustion: { 2023: EF_SOURCES.edition_mfe_2023, 2024: EF_SOURCES.edition_mfe_2024, 2025: EF_SOURCES.edition_mfe_2025 },
  mfe_mobile: { 2023: EF_SOURCES.edition_mfe_2023, 2024: EF_SOURCES.edition_mfe_2024, 2025: EF_SOURCES.edition_mfe_2025 },
  eccc_grid: { 2024: EF_SOURCES.edition_eccc_v4 },
  eccc_mobile: { 2024: EF_SOURCES.edition_eccc_nir_2026_mobile },
  aib: { 2023: EF_SOURCES.edition_aib_2023, 2025: EF_SOURCES.edition_aib_2025 },
  eea_grid: { 2023: EF_SOURCES.edition_eea_2023_revised, 2024: EF_SOURCES.edition_eea_2024 },
}
/** The citation for an edition, or `fallback` (the newest edition's) where none is recorded separately. */
export function editionCitation(u: EditionUse, fallback: string): string {
  return (u.key !== null && EDITION_CITATION[u.dataset]?.[u.key]) || fallback
}
// T3d: the older held editions' combustion tables, built from their edition files (lib/ghg/factors/), in each table's
// own shape: US by gas (kg per unit, as EF), AU and NZ combined CO2e in \`co2\` (as EF_AU and EF_NZ).
const gasTable = (v: Record<string, { co2: CitedValue; ch4: CitedValue; n2o: CitedValue }>): Record<string, CombustionEF> =>
  Object.fromEntries(Object.entries(v).map(([k, g]) => [k, { co2: g.co2.value, ch4: g.ch4.value, n2o: g.n2o.value }]))
const combinedTable = (v: Record<string, CitedValue>): Record<string, CombustionEF> =>
  Object.fromEntries(Object.entries(v).map(([k, c]) => [k, { co2: c.value, ch4: 0, n2o: 0 }]))
const EF_US_2023 = gasTable(EPA_2023.combustion)
const EF_US_2024 = gasTable(EPA_2024.combustion)
const EF_AU_2023 = combinedTable(NGA_2023.combustion)
const EF_AU_2024 = combinedTable(NGA_2024.combustion)
const EF_AU_2026 = combinedTable(NGA_2026.combustion)
const EF_NZ_2023 = { commercial: combinedTable(MFE_2023.combustion.commercial), industrial: combinedTable(MFE_2023.combustion.industrial) }
const EF_NZ_2024 = { commercial: combinedTable(MFE_2024.combustion.commercial), industrial: combinedTable(MFE_2024.combustion.industrial) }
const EF_NZ_2025 = { commercial: combinedTable(MFE_2025.combustion.commercial), industrial: combinedTable(MFE_2025.combustion.industrial) }
const COMBUSTION_BY_EDITION: Record<EfJurisdiction, Record<number, unknown>> = {
  US: { 2023: EF_US_2023, 2024: EF_US_2024, 2025: EF },
  CA: { 2023: EF_CA, 2024: EF_CA, 2025: EF_CA, 2026: EF_CA },   // ECCC v3.0's 2023/24, 2025 and 2026 sets (identical for these keys)
  UK: { 2023: EF_UK_2023, 2024: EF_UK_2024, 2025: EF_UK_2025, 2026: EF_UK },
  EU: {},                                                    // exempt: a fixed default (MRR Annex VI, IPCC 2006)
  AU: { 2023: EF_AU_2023, 2024: EF_AU_2024, 2025: EF_AU, 2026: EF_AU_2026 },
  NZ: { 2023: EF_NZ_2023, 2024: EF_NZ_2024, 2025: EF_NZ_2025, 2026: EF_NZ },
}
function pickEF(loc: Location, key: keyof typeof EF | keyof typeof EF_CA | keyof typeof EF_UK | keyof typeof EF_EU | keyof typeof EF_AU | keyof (typeof EF_NZ)['commercial'] | string, sel: Sel): PickedFactor {
  const ctry = canonicalCountryCode(loc.country)
  // ⚠️ STEAM DOES NOT COME THROUGH HERE. See STEAM_EF.
  const j = efJurisdiction(loc)
  // ⚠️ AN UNSUPPORTED COUNTRY IS A MISS. efMiss is the uniform marker a missing factor produces, so calcGas's
  // assertPriceable refuses it, and the country refusal excludes the location.
  if (j === null) return { factor: efMiss(String(key), loc.country || ''), publisher: null }
  if (String(key).startsWith('fleet:')) return pickFleet(loc, String(key), j, ctry, sel)
  // T3c: the edition the window needs, from the registry. A missing one is a miss carrying the error, so the line is
  // unpriced with its own message (unpricedLines), never priced from another edition.
  let edition: EditionUse
  try { edition = editionFor(COMBUSTION_DATASET[j], sel) } catch (e) {
    if (e instanceof MissingEditionError) return { factor: efMiss(String(key), ctry, 'edition', e), publisher: null }
    throw e
  }
  const held = j === 'EU' ? EF_EU : COMBUSTION_BY_EDITION[j][edition.key as number]
  if (!held) throw new Error(`The registry holds ${edition.label}, but the ${j} combustion table has no ${edition.key} edition.`)
  let heat: EditionUse | undefined
  let own: Record<string, unknown> = j === 'NZ'
    ? (held as Record<string, Record<string, unknown>>)[loc.nz_use_class ?? 'commercial']   // NZ is use-class keyed
    : held as Record<string, unknown>
  if (j === 'CA' && String(key).startsWith('natural_gas_')) {
    // ⚠️ CANADIAN GAS, ANY UNIT, NEEDS THE PROVINCE (FI1). ECCC publishes natural gas CO2 by province, per m³; with no
    // province there is no factor, so the line is a miss with cause 'province'. With one, the province's CO2 and the
    // sector CH4 and N2O make the table's per-m³ factor, and every other gas volume converts to it exactly.
    const prov = caGasProvince(loc)
    if (prov === null) return { factor: efMiss(String(key), ctry, 'province'), publisher: null }
    const perM3 = { co2: EF_CA_NG_CO2_M3[prov], ...EF_CA_NG_CH4_N2O_M3 }
    // FI3 (R12): per GJ gross = the province's per-m³ factor / 0.03859 GJ per m³, computed here so a factor update
    // flows through. No per-GJ literal is stored.
    own = { ...own, natural_gas_m3: perM3 }
    // T3c (R12, R18): the heat content is its own edition (ECCC NIR, by data year). Only a figure in an energy unit
    // goes through it; a missing NIR edition is a miss on that line alone, never priced on another year's heat content.
    if (EXACT_UNITS[splitKey(String(key))[1]]?.kind === 'energy') {
      try { heat = editionFor('eccc_ng_heat', sel) } catch (e) {
        if (e instanceof MissingEditionError) return { factor: efMiss(String(key), ctry, 'edition', e), publisher: null }
        throw e
      }
      const gjPerM3 = CA_NG_HEAT_BY_EDITION[heat.key as number]
      if (gjPerM3 === undefined) throw new Error(`The registry holds ${heat.label}, but no Canadian heat content is held for ${heat.key}.`)
      const m3PerGj = 1 / gjPerM3
      own = { ...own, natural_gas_gj: { co2: perM3.co2 * m3PerGj, ch4: perM3.ch4 * m3PerGj, n2o: perM3.n2o * m3PerGj } }
    }
  }
  const r = routeFactor(own, String(key), j, ctry)
  // The row cites the table and the SELECTED edition (not the table's default label).
  return r.publisher ? { ...r, publisher: { ...r.publisher, publisher: editionCitation(edition, r.publisher.publisher), edition: edition.label, ...(edition.provisional ? { provisional: true as const } : {}) }, edition,
    ...(heat && r.key === 'natural_gas_gj' ? { heat } : {}) } : r
}

// ── FI9 (R16): FLEET FUEL FROM EACH PUBLISHER'S MOBILE ROW ─────────────────────────────────────────────────
// A fleet line's key is `fleet:{type}:{fuel}:{unit}` (or `fleet:legacy:{fuel}:{unit}` for a figure with no type). The row
// is chosen by selectMobileRow (model year, equipment type, the latest-row rule, the highest row), and the value is the
// publisher's own, in its own unit, converted to the unit entered only by an exact conversion (FI2):
//   US EPA: CO2 per gallon (Table 2); road CH4 and N2O per vehicle-mile (Tables 3, 4), so they need the miles, and with
//     none they are not counted (said on the row, not blocking); non-road per gallon (Table 5).
//   ECCC: g per litre (NIR Table A6.1-15). DEFRA and MfE: kg CO2e per litre as published. NGA: kg CO2-e per GJ at the
//     table's own energy content. IPCC (EU): kg per TJ, through MRR's NCV and JEC's density (FI3, R10), CO2 from MRR.
// A stationary key is never read for a vehicle. The UK's Fuels rows are the same figures DEFRA states apply to vehicles.
const FLEET_PUBLISHER: Record<EfJurisdiction, MobilePublisher> = {
  US: EPA_MOBILE_2025, CA: ECCC_MOBILE_2025, UK: DEFRA_MOBILE_2026, EU: IPCC_MOBILE_2006, AU: NGA_MOBILE_2025, NZ: MFE_MOBILE_2026,
}
/** T3c (R18): each jurisdiction's mobile dataset in the edition registry. IPCC 2006 (EU) is exempt: never missing. */
const FLEET_DATASET: Record<EfJurisdiction, DatasetId> = {
  US: 'epa_hub_mobile', CA: 'eccc_mobile', UK: 'desnz_mobile', EU: 'ipcc2006', AU: 'nga_mobile', NZ: 'mfe_mobile',
}
/** T3c: each mobile table keyed by the edition it holds (the registry's editionYear, or dataYear for ECCC's NIR). */
const FLEET_BY_EDITION: Record<EfJurisdiction, Record<number, MobilePublisher>> = {
  US: { 2023: EPA_MOBILE_2023, 2024: EPA_MOBILE_2024, 2025: EPA_MOBILE_2025 }, CA: { 2023: ECCC_MOBILE_2025, 2024: ECCC_MOBILE_2026 },
  UK: { 2023: DEFRA_MOBILE_2023, 2024: DEFRA_MOBILE_2024, 2025: DEFRA_MOBILE_2025, 2026: DEFRA_MOBILE_2026 }, EU: {},
  AU: { 2023: NGA_MOBILE_2023, 2024: NGA_MOBILE_2024, 2025: NGA_MOBILE_2025, 2026: NGA_MOBILE_2026 }, NZ: { 2023: MFE_MOBILE_2023, 2024: MFE_MOBILE_2024, 2025: MFE_MOBILE_2025, 2026: MFE_MOBILE_2026 },
}
/**
 * FI9 diff 3: which optional fleet questions a site's publisher needs. Miles: US only (EPA's road CH4 and N2O are per
 * vehicle-mile). Equipment type, per fuel: only where the publisher splits non-road by it (US EPA Table 5, IPCC Table
 * 3.3.1 for the EU); elsewhere one non-road row prices every equipment type and nothing is asked. A refused country
 * asks nothing.
 */
export function fleetAsks(loc: Pick<Location, 'country'>): { miles: boolean; equipment: Record<FleetFuel, boolean>; publisher: string | null } {
  const j = efJurisdiction(loc as Location)
  if (j === null) return { miles: false, equipment: { petrol: false, diesel: false }, publisher: null }
  const pub = FLEET_PUBLISHER[j]
  const splits = (fuel: FleetFuel) => pub.rows.some(r => r.type === 'non_road' && r.fuel === fuel && r.equipment !== undefined)
  return { miles: j === 'US', equipment: { petrol: splits('petrol'), diesel: splits('diesel') }, publisher: pub.publisher }
}

/** FI9: the document each jurisdiction's fleet rows are cited to, and its edition label. */
export const FLEET_SOURCE: Record<EfJurisdiction, FactorSource> = {
  US: { jurisdiction: 'US', publisher: 'US EPA GHG Emission Factors Hub 2025 (Last Modified 15 January 2025), Tables 2 to 5, mobile combustion', edition: 'US EPA 2025' },
  CA: { jurisdiction: 'CA', publisher: 'ECCC National Inventory Report 1990 to 2023 (2025), Part 2, Annex 6, Table A6.1-15, mobile combustion', edition: 'ECCC NIR 2025' },
  UK: { jurisdiction: 'UK', publisher: EF_SOURCES.combustion_uk, edition: COMBUSTION_EDITION.UK },
  EU: { jurisdiction: 'EU', publisher: 'IPCC 2006 Guidelines Vol. 2 Ch. 3, Tables 3.2.2 and 3.3.1 (CH4 and N2O); CO2, NCV and density: EU MRR 2018/2066 Annex VI Table 1 and JEC Well-to-Tank report v5', edition: 'IPCC 2006' },
  AU: { jurisdiction: 'AU', publisher: 'DCCEEW NGA 2025, Table 9 (transport) and Table 8 (non-road equipment); NGER (Measurement) Determination 2008, Compilation No. 21', edition: COMBUSTION_EDITION.AU },
  NZ: { jurisdiction: 'NZ', publisher: EF_SOURCES.combustion_nz, edition: COMBUSTION_EDITION.NZ },
}
/** FI3 and R10, for the EU fleet rows: litres to TJ (MRR NCV x JEC density) and CO2 per litre (MRR factor). */
const EU_FLEET = {
  diesel: { tjPerL: 43.0e-6 * 0.832, co2PerL: EF_EU.diesel_litre.co2, props: '43.0 TJ/Gg (MRR, Gas/Diesel oil) x 832 kg/m3 (JEC, Diesel)' },
  // Motor gasoline: 69.3 t CO2/TJ x 44.3 TJ/Gg x 0.743 t/m3 / 1000 = 2.281003, to 6 significant figures 2.28100 kg/L.
  petrol: { tjPerL: 44.3e-6 * 0.743, co2PerL: 2.28100, props: '44.3 TJ/Gg (MRR, Motor gasoline) x 743 kg/m3 (JEC, Gasoline)' },
}
const FLEET_TYPE_SHORT: Record<FleetType, string> = { light: 'light', heavy: 'heavy', non_road: 'non-road' }
// Values exactly as the publisher prints them (no rounding, no grouping); miles grouped for reading.
const nFleet = (x: number) => String(x)
const fleetWhere = (r: MobileGasRow['cite']) => r.page ? ` (p. ${r.page})` : r.cell ? ` (${r.cell})` : ''
/** "Table 9 Direct (scope 1) ... equipment, notes" to "Table 9, notes"; "Fuels" to "Fuels sheet". The full title is in
 *  the data file and the citation; the row names the table by its number. */
const fleetTable = (t: string): string => {
  const m = t.match(/^Table [A-Z]?\d+(?:[.–-]\d+)*/)
  const base = m ? m[0] : t === 'Fuels' ? 'Fuels sheet' : t
  return t.endsWith(', notes') ? `${base}, notes` : base
}

function pickFleet(loc: Location, key: string, j: EfJurisdiction, ctry: string, factorSel: Sel): PickedFactor {
  const [, typeTok, fuelTok, unitTok] = key.split(':')
  const fuel = fuelTok as FleetFuel
  if (typeTok === 'legacy') return { factor: efMiss(key, ctry, 'fleet_legacy'), publisher: null }
  const type = typeTok as FleetType
  const field = FLEET_FIELDS.find(f => f.type === type && f.fuel === fuel)!
  const val = (k?: keyof Location) => (k ? (loc as unknown as Record<string, unknown>)[k] : undefined)
  // T3c (R18): the mobile edition the window needs. A missing one is a miss carrying the error, as for combustion.
  let edition: EditionUse
  try { edition = editionFor(FLEET_DATASET[j], factorSel) } catch (e) {
    if (e instanceof MissingEditionError) return { factor: efMiss(key, ctry, 'edition', e), publisher: null }
    throw e
  }
  const pub = j === 'EU' ? IPCC_MOBILE_2006 : FLEET_BY_EDITION[j][edition.key as number]
  if (!pub) throw new Error(`The registry holds ${edition.label}, but the ${j} mobile table has no ${edition.key} edition.`)
  const equipment = val(field.equipment) as EquipmentType | undefined
  const modelYear = typeof val(field.modelYear) === 'number' ? val(field.modelYear) as number : undefined
  if (type === 'non_road' && !equipment && pub.rows.some(r => r.type === 'non_road' && r.fuel === fuel && r.equipment !== undefined)) {
    return { factor: efMiss(key, ctry, 'equipment'), publisher: null }
  }
  const sel = selectMobileRow(pub, { type, fuel, ...(modelYear !== undefined ? { modelYear } : {}), ...(equipment ? { equipmentType: equipment } : {}) })
  const co2 = pub.co2.find(c => c.fuel === fuel)
  if (!sel || !co2) return { factor: efMiss(key, ctry), publisher: null }
  const row = sel.row
  // The publisher's own unit, and the factor per that unit (kg).
  const nativeUnit = j === 'US' ? 'gallon' : 'litre'
  let native: CombustionEF
  let valueText: string
  let notCounted: string | undefined
  if (j === 'US') {
    const perMile = row.unit === 'g/vehicle-mile'
    native = { co2: co2.value, ch4: perMile ? 0 : row.ch4 / 1000, n2o: perMile ? 0 : row.n2o / 1000 }
    valueText = `CO2 ${fleetTable(co2.cite.table)}, ${co2.cite.row}, ${nFleet(co2.value)} ${co2.unit}`
  } else if (j === 'CA') {
    native = { co2: co2.value / 1000, ch4: row.ch4 / 1000, n2o: row.n2o / 1000 }
    valueText = `CO2 ${nFleet(co2.value)} ${co2.unit}`
  } else if (j === 'UK' || j === 'NZ') {
    // Published in kg CO2e per litre, by gas, on AR5: applied as published, like every other UK and NZ factor.
    native = { co2: co2.value + row.ch4 + row.n2o, ch4: 0, n2o: 0 }
    valueText = `CO2 ${nFleet(co2.value)} ${co2.unit}`
  } else if (j === 'AU') {
    // T3d: the energy content printed in the same edition as the row.
    const ec = (edition.key === 2023 ? NGA_MOBILE_ENERGY_CONTENT_2023 : edition.key === 2024 ? NGA_MOBILE_ENERGY_CONTENT_2024 : edition.key === 2026 ? NGA_MOBILE_ENERGY_CONTENT_2026 : NGA_MOBILE_ENERGY_CONTENT_2025)[fuel].value
    native = { co2: (co2.value + row.ch4 + row.n2o) * ec / 1000, ch4: 0, n2o: 0 }
    valueText = `CO2 ${nFleet(co2.value)} ${co2.unit}, at ${nFleet(ec)} GJ/kL (Table ${type === 'non_road' ? 8 : 9} energy content)`
  } else {
    const eu = EU_FLEET[fuel]
    native = { co2: eu.co2PerL, ch4: row.ch4 * eu.tjPerL, n2o: row.n2o * eu.tjPerL }
    valueText = `CO2 ${nFleet(eu.co2PerL)} kg/L (MRR); litres to TJ at ${eu.props}`
  }
  const c = unitTok === nativeUnit ? null : exactConversion(unitTok, nativeUnit)
  if (unitTok !== nativeUnit && !c) return { factor: efMiss(key, ctry), publisher: null }
  const k = c ? c.toPerFrom : 1
  const factor: CombustionEF = { co2: native.co2 * k, ch4: native.ch4 * k, n2o: native.n2o * k }
  // US road CH4 and N2O are per vehicle-mile: with miles, the total over the year spread across the fuel entered; with
  // none, not counted, said on the row. Never estimated from a fuel economy (R16).
  let milesText = ''
  if (j === 'US' && row.unit === 'g/vehicle-mile') {
    const miles = Number(val(field.miles) ?? 0)
    const entered = fleetNum(loc, field)
    if (miles > 0 && entered > 0) {
      factor.ch4 = miles * row.ch4 / 1000 / entered
      factor.n2o = miles * row.n2o / 1000 / entered
      milesText = `, x ${miles.toLocaleString('en-US')} miles entered`
    } else {
      notCounted = `Methane and nitrous oxide for ${fuel} in ${FLEET_TYPE_SHORT[type]} vehicles at ${loc.name || 'Location'} are ` +
        `not counted because EPA publishes them per mile and no miles were entered. Enter the miles to include them.`
    }
  }
  const src: FactorSource = { ...FLEET_SOURCE[j], publisher: editionCitation(edition, FLEET_SOURCE[j].publisher), edition: edition.label, ...(edition.provisional ? { provisional: true as const } : {}) }
  const gases = notCounted ? '' :
    ` CH4 and N2O ${fleetTable(row.cite.table)}, ${row.cite.row}${fleetWhere(row.cite)}, ${nFleet(row.ch4)} and ${nFleet(row.n2o)} ${row.unit}${milesText}.`
  const basis = row.cite.basis && (type === 'non_road' || j === 'UK') ? ` ${row.cite.basis}` : ''
  const note = `${pub.publisher}, ${pub.edition}: ${valueText}.${gases} ${notCounted ? '' : sel.reason}${basis}${notCounted ? notCounted : ''}`
    .replace(/\s+/g, ' ').trim()
  return {
    factor, publisher: src, key: `mobile: ${fleetTable(row.cite.table)}, ${row.cite.row}`, edition,
    ...(c ? { conversion: { from: unitTok, to: nativeUnit, toPerFrom: k, statement: c.statement } } : {}),
    fleet: { note, ...(notCounted ? { notCounted } : {}), type, fuel },
  }
}

/**
 * FI2: THE ONE LOOKUP, AND THERE IS NO FALLBACK. A key resolves in the location's own table only:
 *   1. the key itself, in the unit its publisher prints; else
 *   2. an EXACT conversion (lib/unitConversions.ts) from the unit asked for to a unit that table holds for the same
 *      fuel and the same quantity: liquid volume, gas volume, energy or mass. A gas in an energy unit converts only
 *      where the table states its calorific basis (GAS_CALORIFIC_BASIS); else
 *   3. the uniform miss, which FI1 turns into an unpriced line with an export-blocking issue.
 * Another country's table is never read. A density or energy content is never a conversion here: a table that prices a
 * fuel through one carries the derived key itself, with its derivation note. An unrecognised unit misses, never prices
 * as litres. A scalar entry (EF.ammonia, never priced: no GWP) is a miss.
 */
function routeFactor(own: Record<string, unknown>, key: string, j: EfJurisdiction, ctry: string): PickedFactor {
  const isFactor = (v: unknown): v is CombustionEF => !!v && typeof v === 'object'
  const direct = own[key]
  if (direct !== undefined && direct !== null) {
    return isFactor(direct) ? { factor: { ...direct }, publisher: COMBUSTION_TABLE_SOURCE[j], key } : { factor: efMiss(key, ctry), publisher: null }
  }
  const [fuel, unit] = splitKey(key)
  const wanted = EXACT_UNITS[unit]
  if (!wanted) return { factor: efMiss(key, ctry), publisher: null }
  if (fuel === 'natural_gas' && wanted.kind === 'energy' && !GAS_CALORIFIC_BASIS[j]) return { factor: efMiss(key, ctry), publisher: null }
  for (const [heldKey, held] of Object.entries(own)) {
    const [heldFuel, heldUnit] = splitKey(heldKey)
    if (heldFuel !== fuel || !isFactor(held)) continue
    const c = exactConversion(unit, heldUnit)
    if (!c) continue
    const k = c.toPerFrom   // held units in one unit asked for
    return {
      factor: { co2: held.co2 * k, ch4: held.ch4 * k, n2o: held.n2o * k },
      publisher: COMBUSTION_TABLE_SOURCE[j], key: heldKey,
      conversion: { from: unit, to: heldUnit, toPerFrom: k, statement: c.statement },
    }
  }
  return { factor: efMiss(key, ctry), publisher: null }
}

/** FI2: "1,000 US gallons converted to 3,785.41 litres (1 US gallon = 3.785411784 litres, exact)." */
export function conversionNote(amount: number, c: NonNullable<PickedFactor['conversion']>): string {
  const n = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: Math.abs(x) < 10 ? 4 : 2 })
  const words = (u: string, x: number) => (x === 1 ? EXACT_UNITS[u].one : EXACT_UNITS[u].many)
  const converted = amount * c.toPerFrom
  return `${n(amount)} ${words(c.from, amount)} converted to ${n(converted)} ${words(c.to, converted)} (${c.statement}, exact).`
}

// Source citation for an ELECTRICITY row, country-aware — the same shape as combustionSource below.
// It exists because the workings printed EF_SOURCES.electricity, the whole six-jurisdiction catalogue,
// on every grid row: a verifier could not tell which source had priced the line in front of them.
export function gridSource(loc: Location): string {
  const ctry = canonicalCountryCode(loc.country)
  if (ctry === 'CA') return EF_SOURCES.electricity_ca
  if (ctry === 'GB' || ctry === 'UK') return EF_SOURCES.electricity_uk
  if (ctry === 'AU') return EF_SOURCES.electricity_au
  if (ctry === 'NZ') return EF_SOURCES.electricity_nz
  if (EU_COUNTRIES.includes(ctry)) return EF_SOURCES.electricity_eu
  return EF_SOURCES.electricity_us
}

const COMBUSTION_STREAMS = new Set([
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual', 'mobile',
])

/**
 * The publishers that ACTUALLY PRICED this location, as short labels, in first-appearance order.
 *
 * ⚠️ IT READS THE PRICED ROWS, NOT THE COUNTRY, AND THAT IS THE WHOLE POINT. The live results panel
 * carried a hard-coded line reading "EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2026 (UK) · IPCC AR6 GWP
 * · eGRID 2023" under EVERY location. A UK site cited the EPA and eGRID, which priced nothing there;
 * a refused site cited five publishers when nothing had priced it at all. A catalogue is correct as
 * a catalogue and wrong as an attribution, which is the same defect 06b6125 removed from the
 * workings table and a later change removed from the assurance PDF's methodology page.
 *
 * ⚠️ DERIVED FROM buildWorkings, SO IT CANNOT DISAGREE WITH THE ROWS A VERIFIER READS. A row with a
 * null result priced nothing, so a refused location and a location with no figures both yield an
 * empty list by construction rather than by a special case.
 *
 * MARKET-BASED ROWS ARE EXCLUDED because the panel shows location-based Scope 2 only. Citing the AIB
 * residual mix beside figures that do not include it would name a publisher for a number not shown.
 *
 * This is the beginning of the structured publisher-per-activity record that lib/publisherClaims
 * .test.ts closes by saying does not exist yet. It is per location, not per page, so it does not
 * close that gap on its own.
 */
export function publishersForLocation(loc: Location, gwpVersion: GwpVersion = 'AR6', year: number = 2024, fiscalYearEndMonth: number = 12, ctx: SelectionContext = {}): string[] {
  const j = efJurisdiction(loc)
  if (j === null) return []
  const out: string[] = []
  const add = (label: string | undefined) => { if (label && !out.includes(label)) out.push(label) }
  let usedOurGwp = false
  // T3c: with the year end (it was built without it, so a non-December inventory named December's editions).
  for (const r of buildWorkings([loc], gwpVersion, year, [], fiscalYearEndMonth, ctx)) {
    if (r.result_tco2e == null) continue
    if (r.scope2_method === 'market-based') continue
    const stream = String(r.stream ?? '')
    // FI2: the edition the row itself records, which is the table that supplied its value.
    if (COMBUSTION_STREAMS.has(stream)) add(r.factor_vintage ?? COMBUSTION_EDITION[j])
    // T3c: the edition label the row records (eGRID2023, DEFRA 2026 ...), not a publisher and a year rebuilt here.
    else if (stream === 'electricity') add(r.factor_vintage)
    else if (stream === 'purchased_steam') add(r.factor_vintage ?? STEAM_EDITION[j])   // R14: an estimate names its gas table
    if (r.gwp_basis === gwpVersion) usedOurGwp = true
  }
  // ⚠️ THE GWP SET IS NAMED ONLY WHEN A ROW APPLIED IT. Most grid and steam factors arrive already
  // combined by their publisher and are stamped as-published, so an inventory can price every row
  // without this platform's AR set touching any of them. Printing "IPCC AR6 GWP" there would claim
  // a basis for figures nobody re-based. Same rule as R5 in lib/publisherClaims.test.ts.
  if (usedOurGwp) add(`IPCC ${gwpVersion} GWP`)
  return out
}

// Every DISTINCT electricity citation an inventory resolves to. Mirror of combustionSourcesFor, and
// it exists for the same reason one level along: the assurance PDF printed EF_SOURCES.electricity —
// the six-jurisdiction CATALOGUE — on its methodology page. That string is correct as a catalogue and
// wrong as an attribution: it names six publishers where one priced the rows. 06b6125 removed the
// same catalogue from the workings table; the methodology page kept it.
export function gridSourcesFor(locations: readonly { country?: string; grid_region?: string }[], sel?: Sel): string[] {
  // Same filter, same reason: gridSource ends `return EF_SOURCES.electricity_us`.
  // T3d: with the inventory's selection, each location cites the edition that priced its grid row (an older held edition
  // cites its own document); a region with no held edition, or none chosen, keeps the jurisdiction's citation.
  const cite = (l: Location): string => {
    if (!sel || !isResolvedGridRegion(l.grid_region)) return gridSource(l)
    try { return editionCitation(getGridFactor(l.grid_region, sel).edition, gridSource(l)) } catch (e) {
      if (e instanceof MissingEditionError) return gridSource(l)
      throw e
    }
  }
  return [...new Set(locations.filter(l => !countryRefusal(l)).map(l => cite(l as Location)))]
}

// ⚠️ CANONICALISED LIKE EVERY OTHER COUNTRY BRANCH. This function and gridSource each normalise
// country privately (the engine's own note calls them "still separate"), so canonicalising only the
// factor router left Greece citing US EPA on rows the EU tables had priced. A test asserting that
// GR and EL are indistinguishable to all seven country-keyed functions is what found it.
// Source citation for a combustion row, country-aware (ECCC for CA, DEFRA for GB/UK, IPCC for EU, EPA otherwise).
function combustionSource(loc: Location): string {
  const ctry = canonicalCountryCode(loc.country)
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
export function combustionSourcesFor(locations: readonly { country?: string }[], sel: Sel): string[] {
  // ⚠️ REFUSED LOCATIONS ARE DROPPED BEFORE THE CITATION IS TAKEN, AND THIS IS THE LAST PLACE A US
  // EPA CLAIM COULD HAVE SURVIVED. combustionSource falls through to EF_SOURCES.combustion for any
  // country it does not recognise, so a Japanese site would put "US EPA" on the methodology page of
  // the assurance PDF and in the export's source list, naming a publisher for a location nothing
  // priced. factor_editions was fixed by returning null; this list has no null to return, so it
  // filters instead.
  //   pricingReady blocks export while a FIXABLE refusal exists (no country set); a country we do not support is
  // excluded from every total and stated, and does not block. Either way this list must not name a publisher for it.
  // FI2: the publishers of the tables that priced each location's combustion lines; a location with none keeps its
  // country's citation, as before. A line whose value came from another table (the US fallback, until FI2 diff 2)
  // therefore adds that table's citation instead of hiding behind the location's.
  // FI10: an NZ citation names the use class that priced it, as the PDF and XLSX have no per-row column for it.
  return [...new Set(locations.filter(l => !countryRefusal(l)).flatMap(l => {
    const priced = [...combustionLinePublishers(l as Location, sel).map(p => p.jurisdiction === 'NZ' ? `${p.publisher}, ${nzUseClassVariant(l as Location)}` : p.publisher),
      ...fleetLinePublishers(l as Location, sel).map(p => p.publisher)]
    return priced.length > 0 ? priced : [combustionSource(l as Location)]
  }))]
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

// ── FI1: THE SCOPE 1 LINES, AND WHICH OF THEM CANNOT BE PRICED ───────────────────────────────────────
// ONE list of a location's combustion lines, in workings order, read by calcLocation, fuelEmissionsByType,
// buildWorkings and unpricedLines, so the four cannot disagree about which lines exist or what key prices
// them. A line exists when its "uses this fuel" switch is on and its figure is above zero, as before.
interface CombustionLine {
  field: keyof Location
  stream: DeclarableStream
  source: string          // the workings row label, and the noun in the factor_missing message
  mobile: boolean         // s1_mobile rather than s1_stationary
  entered: number         // the figure as entered (the derived figure, on deriveLocations output)
  enteredUnit: string
  unitField: keyof Location
  efKey: string
}
function combustionLines(loc: Location): CombustionLine[] {
  const out: CombustionLine[] = []
  const add = (l: CombustionLine) => out.push(l)
  // FI2 (ruling R5): the stored unit names the key's unit token. An unrecognised unit passes through as itself, so the
  // lookup misses and the line is unpriced (FI1), instead of being priced as litres as it used to be.
  const lit = unitToken
  if (loc.has_natural_gas && loc.natural_gas_amount > 0)
    add({ field: 'natural_gas_amount', stream: 'natural_gas', source: 'Natural gas', mobile: false, entered: loc.natural_gas_amount, enteredUnit: loc.natural_gas_unit, unitField: 'natural_gas_unit', efKey: `natural_gas_${loc.natural_gas_unit}` })
  if (loc.has_propane && loc.propane_amount > 0)
    add({ field: 'propane_amount', stream: 'propane', source: 'Propane', mobile: false, entered: loc.propane_amount, enteredUnit: loc.propane_unit, unitField: 'propane_unit', efKey: propaneEfKey(loc.propane_unit) })
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0)
    add({ field: 'diesel_stationary_amount', stream: 'diesel_stationary', source: 'Diesel (stationary)', mobile: false, entered: loc.diesel_stationary_amount, enteredUnit: loc.diesel_stationary_unit, unitField: 'diesel_stationary_unit', efKey: `diesel_${lit(loc.diesel_stationary_unit)}` })
  // TWO GRADES, PRICED SEPARATELY. FI2 diff 2: the key is the grade in the unit entered; pickEF converts exactly to the
  // unit the publisher prints (fuelOilPricing, which made that choice here, is gone).
  if (loc.has_fuel_oil_distillate && loc.fuel_oil_distillate_amount > 0)
    add({ field: 'fuel_oil_distillate_amount', stream: 'fuel_oil_distillate', source: 'Heating oil', mobile: false, entered: loc.fuel_oil_distillate_amount, enteredUnit: loc.fuel_oil_distillate_unit ?? 'gallons', unitField: 'fuel_oil_distillate_unit', efKey: `fuel_oil_distillate_${lit(loc.fuel_oil_distillate_unit ?? 'gallons')}` })
  if (loc.has_fuel_oil_residual && loc.fuel_oil_residual_amount > 0)
    add({ field: 'fuel_oil_residual_amount', stream: 'fuel_oil_residual', source: 'Heavy fuel oil', mobile: false, entered: loc.fuel_oil_residual_amount, enteredUnit: loc.fuel_oil_residual_unit ?? 'gallons', unitField: 'fuel_oil_residual_unit', efKey: `fuel_oil_residual_${lit(loc.fuel_oil_residual_unit ?? 'gallons')}` })
  // FI9 (R16 choice 2): a legacy fleet figure is a line with no vehicle type, so it cannot be priced (pickFleet misses it,
  // cause 'fleet_legacy') and blocks export until the customer assigns it to a type. It is never moved silently.
  if (loc.has_mobile && loc.gasoline_amount > 0)
    add({ field: 'gasoline_amount', stream: 'mobile', source: 'Gasoline (mobile)', mobile: true, entered: loc.gasoline_amount, enteredUnit: loc.gasoline_unit, unitField: 'gasoline_unit', efKey: `fleet:legacy:petrol:${lit(loc.gasoline_unit)}` })
  if (loc.has_mobile && loc.diesel_mobile_amount > 0)
    add({ field: 'diesel_mobile_amount', stream: 'mobile', source: 'Diesel (mobile)', mobile: true, entered: loc.diesel_mobile_amount, enteredUnit: loc.diesel_mobile_unit, unitField: 'diesel_mobile_unit', efKey: `fleet:legacy:diesel:${lit(loc.diesel_mobile_unit)}` })
  // FI9 (R16): one line per vehicle type and fuel, under the stream switch and the type's tick, priced from the
  // publisher's mobile row (pickFleet).
  for (const f of FLEET_FIELDS) {
    if (!fleetOn(loc, f) || !(fleetNum(loc, f) > 0)) continue
    const unit = fleetUnit(loc, f)
    add({ field: f.amount, stream: 'mobile', source: f.source, mobile: true, entered: fleetNum(loc, f), enteredUnit: unit, unitField: f.unit, efKey: `fleet:${f.type}:${f.fuel}:${lit(unit)}` })
  }
  return out
}

// The units a field can be entered in, to probe which of them the location's publisher prices (the
// factor_missing message names them). The same sets the Location type allows.
const LINE_UNITS: Partial<Record<keyof Location, string[]>> = {
  natural_gas_amount: ['m3', 'mcf', 'therms', 'mmbtu', 'kwh'],
  propane_amount: ['gallons', 'litres', 'kg'],
  diesel_stationary_amount: ['gallons', 'litres'], gasoline_amount: ['gallons', 'litres'], diesel_mobile_amount: ['gallons', 'litres'],
  fuel_oil_distillate_amount: ['gallons', 'litres', 'kg', 'tonnes'], fuel_oil_residual_amount: ['gallons', 'litres', 'kg', 'tonnes'],
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, ['gallons', 'litres']])),
}

/** FI1: the GWP a refrigerant type is held at, or null. Never 0 for a type we do not hold. */
function refrigerantGwp(type: string, gwpVersion: GwpVersion): number | null {
  const v = REFRIGERANT_GWP[type]?.[gwpVersion]
  return typeof v === 'number' ? v : null
}
/** FI1: the refrigerant line exists when refrigerants are declared, kg are entered, and it is not ammonia. */
const hasRefrigerantLine = (loc: Location): boolean =>
  !loc.uses_ammonia && loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0

/**
 * FI1 (docs/review/design-derived-figures.md): ONE row shape for a line that cannot be priced, keyed
 * (location, field). It is excluded from every total, never counted as zero, its workings row carries
 * `result_tco2e: null` and the message, and the location's other lines are still priced.
 *   `reason` is open: T3c adds 'edition_missing' to the same shape. `factor` is the lookup that failed, in the
 * `{ publisher, edition?, value }` shape FI2 and T3c extend; `value` is null because no factor applied.
 */
export type UnpricedReason = 'factor_missing' | 'refrigerant_unknown' | 'province_missing' | 'figure_cleared' | 'steam_factor_missing'
  | 'fleet_type_missing' | 'equipment_missing' | 'edition_missing'
/** The coverage-issue statuses an unpriced line raises (FI1): the reason, used as the status. */
export const UNPRICED_STATUSES: ReadonlySet<string> = new Set<UnpricedReason>(['factor_missing', 'refrigerant_unknown', 'province_missing', 'figure_cleared', 'steam_factor_missing',
  'fleet_type_missing', 'equipment_missing', 'edition_missing'])
export interface UnpricedLine {
  reason: UnpricedReason
  locId: string
  site: string
  field: keyof Location
  stream: DeclarableStream
  source: string
  amount: number
  unit: string
  country: string
  factorKey: string
  factor: { publisher: string; edition?: string; value: number | null }
  /** factor_missing: the units this location's publisher does price this fuel in, in words. */
  supportedUnits: string[]
  message: string
  /** T18: a line for ONE reading, not for the field: a typed figure on a document cleared by a unit change. The
   * field's other bills are still priced; this line names the document and records who changed the unit, and when. */
  reading?: { docId: string; proposalIndex: number; file: string; fuelType: string; figureCleared: FigureCleared; at: string; by: { userId: string; email: string } }
}

// The plain-language messages (FI1). No em dash: they reach the customer and the verifier.
export const UNPRICED_MESSAGE = {
  factor_missing: (fuel: string, site: string, unit: string, publisher: string, units: string[]) =>
    `${fuel} at ${site} is recorded in ${unit}, and ${publisher} publishes no factor this figure can be converted to exactly, so it is not counted. ${units.length ? `Enter it in ${listInWords(units).replace(/ and ([^ ]+)$/, ' or $1')}, or reject the bill.` : 'Reject the bill, or remove the figure.'} Export is blocked until this is resolved.`,
  refrigerant_unknown: (site: string) =>
    `The refrigerant type at ${site} is not one we hold a GWP for, so it is not counted. Choose the refrigerant type. Export is blocked until it is chosen.`,
  // FI7: purchased steam or district heat with no published factor and no supplier figure. One message per kind of
  // absence, naming the country as the wizard's selector shows it and the site. 'unpublished' (CA, AU, NZ): the
  // publisher was searched and prints none. 'not_searched' (EU): no source was searched, so it says only what we hold.
  steam_unpublished: (country: string, site: string) =>
    `There is no published factor in ${country} for purchased steam or district heat, so this line at ${site} is not counted. Ask your provider for their emission intensity and enter it below. Export is blocked until it is entered.`,
  steam_not_searched: (country: string, site: string) =>
    `We hold no factor for purchased steam or district heat in ${country}, so this line at ${site} is not counted. Ask your provider for their emission intensity and enter it below. Export is blocked until it is entered.`,
  // FI3: an EU line in a volume unit with no cited density or energy content. No em dash.
  eu_property: (fuel: string, site: string, unit: string, property: 'density' | 'energy content', remedy: 'mass' | 'kwh' | null) =>
    `The EU factor for ${fuel} at ${site} is published per unit of energy, and we hold no cited ${property} to convert ${unit} to it, so this line is not counted. ${remedy === 'mass' ? 'Enter the quantity in kilograms or tonnes, or reject the bill.' : remedy === 'kwh' ? 'Enter the quantity in kWh, as shown on your gas bill, or reject the bill.' : 'Reject the bill, or remove the figure.'} Export is blocked until this is resolved.`,
  // R14: also for purchased steam, whose estimate is priced from the province's natural gas factor.
  // FI9 (R16 choice 2): a fleet figure entered before vehicle types were asked. The assign buttons (FI9 diff 3) say
  // "These were light vehicles", "These were heavy vehicles", "This was non-road equipment".
  fleet_type_missing: (site: string, amount: string, unit: string, fuel: string) =>
    `${site} has ${amount} ${unit} of ${fuel} for vehicles recorded before vehicle types were asked, so it is not counted. Choose the vehicles it was used in: light vehicles, heavy vehicles or non-road equipment. Export is blocked until it is chosen.`,
  // FI9 (R16): non-road fuel where the publisher's factors differ by equipment type, with none chosen.
  equipment_missing: (site: string, fuel: string, publisher: string) =>
    `${publisher} publishes non-road factors by equipment type, so the ${fuel} used in non-road equipment at ${site} is not counted until the equipment type is chosen. Choose the equipment type. Export is blocked until it is chosen.`,
  province_missing: (site: string, unrecognised: string | null, what: 'natural gas' | 'purchased steam' = 'natural gas') => unrecognised
    ? `The province for ${site} (${unrecognised}) is not one we hold a natural gas factor for, so its ${what} is not counted. Choose the province. Export is blocked until it is chosen.`
    : `The province for ${site} is not set, so its ${what} is not counted. Choose the province. Export is blocked until it is chosen.`,
}

/**
 * Every line at a location that cannot be priced, and why (FI1). A location refused for its country has no
 * lines here: its exclusion is whole and stated (findUnpriceableLocations), not a line-level gap.
 */
export function unpricedLines(loc: Location, gwpVersion: GwpVersion, sel: Sel): UnpricedLine[] {
  const j = efJurisdiction(loc)
  if (j === null) return []
  const site = loc.name || 'Location'
  const publisher = COMBUSTION_EDITION[j]
  const out: UnpricedLine[] = []
  // T3c: a line whose required edition is not held is unpriced with the edition message (edition_missing).
  const editionLine = (e: MissingEditionError, field: keyof Location, stream: DeclarableStream, source: string, amount: number, unit: string, factorKey: string): UnpricedLine =>
    ({ reason: 'edition_missing', locId: loc.id, site, field, stream, source, amount, unit, country: canonicalCountryCode(loc.country), factorKey,
      factor: { publisher: e.edition, edition: e.edition, value: null }, supportedUnits: [], message: e.forSite(site) })
  for (const line of combustionLines(loc)) {
    const ef = pickEF(loc, line.efKey as keyof typeof EF, sel).factor
    if (isPriceableEF(ef)) continue
    const miss = (ef as unknown as MissingEF).__missing
    if (miss.edition) { out.push(editionLine(miss.edition, line.field, line.stream, line.source, line.entered, line.enteredUnit, line.efKey)); continue }
    const base = { locId: loc.id, site, field: line.field, stream: line.stream, source: line.source, amount: line.entered,
      unit: line.enteredUnit, country: miss.country, factorKey: line.efKey, factor: { publisher, value: null } }
    if (miss.cause === 'province') {
      const typed = (loc.grid_region || loc.province || '').trim()
      out.push({ ...base, reason: 'province_missing', supportedUnits: [], message: UNPRICED_MESSAGE.province_missing(site, typed || null) })
      continue
    }
    // FI9: a legacy fleet figure (no vehicle type), or non-road fuel with no equipment type where the publisher splits.
    if (miss.cause === 'fleet_legacy') {
      const fuel = line.field === 'gasoline_amount' ? 'petrol' : 'diesel'
      out.push({ ...base, reason: 'fleet_type_missing', supportedUnits: [],
        message: UNPRICED_MESSAGE.fleet_type_missing(site, line.entered.toLocaleString('en-US', { maximumFractionDigits: 4 }), unitLabel(line.enteredUnit), fuel) })
      continue
    }
    if (miss.cause === 'equipment') {
      const f = FLEET_FIELDS.find(x => x.amount === line.field)!
      out.push({ ...base, reason: 'equipment_missing', factor: { publisher: FLEET_SOURCE[j].publisher, value: null }, supportedUnits: [],
        message: UNPRICED_MESSAGE.equipment_missing(site, f.fuel, FLEET_PUBLISHER[j].publisher) })
      continue
    }
    // The units the same publisher DOES price this fuel in at this location: each candidate unit is put
    // through the same line construction and lookup, so the list cannot name a unit that would also fail.
    const supported = (LINE_UNITS[line.field] ?? []).filter(u => u !== line.enteredUnit && combustionLines({ ...loc, [line.unitField]: u } as Location)
      .filter(l => l.field === line.field).every(l => isPriceableEF(pickEF(loc, l.efKey as keyof typeof EF, sel).factor)))
    // FI3: at an EU site, a volume with no cited property to reach MRR's per-energy factor says so, and offers the unit
    // that does price: kg or tonnes where MRR's mass basis is offered for the fuel, kWh for gas.
    const kind = EXACT_UNITS[unitToken(line.enteredUnit)]?.kind
    if (j === 'EU' && (kind === 'liquid_volume' || kind === 'gas_volume')) {
      const gas = line.stream === 'natural_gas'
      const unitField = UNIT_FIELDS.find(f => f.amount === line.field)
      const massOffered = !!unitField && unitField.options(loc.country).some(([v]) => v === 'kg')
      out.push({ ...base, reason: 'factor_missing', supportedUnits: supported.map(u => unitLabel(u)),
        message: UNPRICED_MESSAGE.eu_property(line.source.toLowerCase(), site, unitLabel(line.enteredUnit), gas ? 'energy content' : 'density',
          gas ? 'kwh' : massOffered ? 'mass' : null) })
      continue
    }
    out.push({ ...base, reason: 'factor_missing', supportedUnits: supported.map(u => unitLabel(u)),
      message: UNPRICED_MESSAGE.factor_missing(line.source, site, unitLabel(line.enteredUnit), publisher, supported.map(u => unitLabel(u))) })
  }
  if (hasRefrigerantLine(loc) && refrigerantGwp(loc.refrigerant_type, gwpVersion) === null) {
    out.push({ reason: 'refrigerant_unknown', locId: loc.id, site, field: 'refrigerant_purchased_kg', stream: 'refrigerants',
      source: `Refrigerant (${loc.refrigerant_type || 'type not chosen'})`, amount: loc.refrigerant_purchased_kg, unit: 'kg',
      country: canonicalCountryCode(loc.country), factorKey: `refrigerant_${loc.refrigerant_type || ''}`,
      factor: { publisher: EF_SOURCES[`gwp_${gwpVersion.toLowerCase()}` as 'gwp_ar6'], value: null }, supportedUnits: [],
      message: UNPRICED_MESSAGE.refrigerant_unknown(site) })
  }
  // T3c: electricity, its market-based residual mix and the NZ T&D line, each through its own edition.
  if (loc.electricity_kwh > 0 && isResolvedGridRegion(loc.grid_region)) {
    const kwh = loc.electricity_kwh
    try { getGridFactor(loc.grid_region, sel) } catch (e) {
      if (!(e instanceof MissingEditionError)) throw e
      out.push(editionLine(e, 'electricity_kwh', 'electricity', `Electricity (${loc.grid_region})`, kwh, 'kWh', `grid:${loc.grid_region}`))
    }
    try { getResidualFactor(residualRegionFor(loc), sel, gwpVersion, loc.country) } catch (e) {
      if (!(e instanceof MissingEditionError)) throw e
      out.push(editionLine(e, 'electricity_kwh', 'electricity', 'Electricity (S2 market-based)', Math.max(0, kwh - loc.renewable_electricity_kwh), 'kWh uncovered', `residual:${residualRegionFor(loc)}`))
    }
    if (loc.country === 'NZ' && loc.nz_td_losses) {
      try { nzTdLoss(sel) } catch (e) {
        if (!(e instanceof MissingEditionError)) throw e
        out.push(editionLine(e, 'electricity_kwh', 'electricity', 'Electricity T&D losses (NZ)', kwh, 'kWh', 'nz_td'))
      }
    }
  }
  if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
    try { steamPricing(loc, sel) } catch (e) {
      if (!(e instanceof MissingEditionError)) throw e
      out.push(editionLine(e, 'purchased_steam_mmbtu', 'purchased_steam', 'Purchased steam', loc.purchased_steam_mmbtu, loc.purchased_steam_unit ?? 'mmbtu', 'steam'))
    }
  }
  // FI7: steam with no published factor and no supplier figure is an unpriced line, like any other (FI1). A supplier
  // figure prices it (steamPricing), and the line goes.
  if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0 && !out.some(u => u.field === 'purchased_steam_mmbtu') && !steamPricingOrMissing(loc, sel)) {
    const entry = steamFactorFor(loc)
    if (entry && entry.kind !== 'published') {
      const ctry = canonicalCountryCode(loc.country)
      // The selector names a country from its ISO code; EL is Eurostat's code for Greece, so it is named from GR.
      const country = countryNameEn(ctry === 'EL' ? 'GR' : ctry)
      const base = { locId: loc.id, site, field: 'purchased_steam_mmbtu' as const, stream: 'purchased_steam' as const,
        source: 'Purchased steam', amount: loc.purchased_steam_mmbtu, unit: loc.purchased_steam_unit ?? 'mmbtu', country: ctry,
        factorKey: 'steam', factor: { publisher: '', value: null }, supportedUnits: [] }
      // R14: the estimate needs the site's gas factor. A Canadian site with no province has none, so the province message.
      if (entry.kind === 'estimated' && j === 'CA' && caGasProvince(loc) === null) {
        const typed = (loc.grid_region || loc.province || '').trim()
        out.push({ ...base, reason: 'province_missing', message: UNPRICED_MESSAGE.province_missing(site, typed || null, 'purchased steam') })
      } else {
        out.push({ ...base, reason: 'steam_factor_missing',
          message: entry.kind === 'unpublished' || (entry.kind === 'estimated' && j !== 'EU') ? UNPRICED_MESSAGE.steam_unpublished(country, site) : UNPRICED_MESSAGE.steam_not_searched(country, site) })
      }
    }
  }
  // FI5: a figure a unit change cleared (no exact conversion joined the units) is a line with no figure until it is
  // entered again, or the stream is answered as not used here. Its message is the one shown when it was cleared.
  for (const f of UNIT_FIELDS) {
    const c = latestUnitChange(loc, f.amount)
    const stream = CLEARED_FIELD_STREAM[f.amount]
    if (!c?.cleared || !stream || !streamDeclared(loc, stream.stream)) continue
    if (Number((loc as unknown as Record<string, unknown>)[f.amount] ?? 0) > 0) continue
    out.push({ reason: 'figure_cleared', locId: loc.id, site, field: f.amount as keyof Location, stream: stream.stream, source: stream.source,
      amount: 0, unit: heldUnit(loc as never, f.field) ?? c.to, country: canonicalCountryCode(loc.country), factorKey: '',
      factor: { publisher, value: null }, supportedUnits: [], message: unitChangeMessage(c) })
  }
  // T18: a reading whose typed figure a unit change cleared is a line with no figure until it is entered again or
  // the bill is rejected. One line per reading, never for the field: the field's other bills are still counted.
  loc.source_docs.forEach(d => (d.extracted ?? []).forEach((p, pi) => {
    const cleared = clearedFigureOf(p)
    const map = cleared && fieldFor(d.document_type, p.fuelType, p.fleetType)
    if (!cleared || !map) return
    const field = String(map.amount)
    const line = READING_LINE[field] ?? { stream: CLEARED_FIELD_STREAM[field]?.stream ?? 'mobile', source: CLEARED_FIELD_STREAM[field]?.source ?? field }
    const last = p.corrections!.at(-1)!
    out.push({ reason: 'figure_cleared', locId: loc.id, site, field: map.amount, stream: line.stream, source: line.source,
      amount: 0, unit: cleared.toUnit ?? '', country: canonicalCountryCode(loc.country), factorKey: '',
      factor: { publisher, value: null }, supportedUnits: [],
      message: `${d.file_name} at ${site}: ${READING_FIGURE_CLEARED_MESSAGE(cleared)} It is not counted, and export is blocked until it is entered or the bill is rejected.`,
      reading: { docId: d.id, proposalIndex: pi, file: d.file_name, fuelType: p.fuelType, figureCleared: cleared, at: last.at, by: last.by } })
  }))
  return out
}
/** T18: the stream and line name of a reading's field where CLEARED_FIELD_STREAM (typed figures) has none. */
const READING_LINE: Record<string, { stream: DeclarableStream; source: string }> = {
  electricity_kwh: { stream: 'electricity', source: 'Electricity' },
  renewable_electricity_kwh: { stream: 'electricity', source: 'Renewable electricity' },
}
/** FI5: the stream and line name of each unit field's figure, for a cleared figure's line. */
const CLEARED_FIELD_STREAM: Record<string, { stream: DeclarableStream; source: string }> = {
  natural_gas_amount: { stream: 'natural_gas', source: 'Natural gas' },
  propane_amount: { stream: 'propane', source: 'Propane' },
  diesel_stationary_amount: { stream: 'diesel_stationary', source: 'Diesel (stationary)' },
  fuel_oil_distillate_amount: { stream: 'fuel_oil_distillate', source: 'Heating oil' },
  fuel_oil_residual_amount: { stream: 'fuel_oil_residual', source: 'Heavy fuel oil' },
  gasoline_amount: { stream: 'mobile', source: 'Gasoline (mobile)' },
  diesel_mobile_amount: { stream: 'mobile', source: 'Diesel (mobile)' },
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, { stream: 'mobile' as const, source: f.source }])),
  purchased_steam_mmbtu: { stream: 'purchased_steam', source: 'Purchased steam' },
}

/**
 * FI1: true when at least one combustion line at the location is priced by its table. A location whose only
 * fuel line is unpriced burned nothing the table priced, so it names no combustion edition (factorEditions).
 */
export function hasPricedCombustionLine(loc: Location, sel: Sel): boolean {
  return combustionLinePublishers(loc, sel).length > 0
}

/**
 * FI2: the tables that priced this location's combustion lines, each once, in line order. Read by every list that
 * names a combustion publisher for a location (factorEditions, combustionSourcesFor), so a list can only name a
 * table that supplied a value. Usually one; two where a line's key came from the US fallback (until FI2 diff 2).
 */
export function combustionLinePublishers(loc: Location, sel: Sel): FactorSource[] {
  const out: FactorSource[] = []
  for (const l of combustionLines(loc)) {
    // FI9: fleet rows are cited to their own mobile document (fleetLinePublishers), not to the stationary table, so they
    // do not name the combustion edition here. Recording mobile editions in factor_editions is T3c's.
    if (l.efKey.startsWith('fleet:')) continue
    const p = pickEF(loc, l.efKey as keyof typeof EF, sel)
    if (isPriceableEF(p.factor) && p.publisher && !out.some(o => o.jurisdiction === p.publisher!.jurisdiction)) out.push(p.publisher)
  }
  return out
}

/** FI9: the mobile documents that priced this location's fleet lines, each once. */
export function fleetLinePublishers(loc: Location, sel: Sel): FactorSource[] {
  const out: FactorSource[] = []
  for (const l of combustionLines(loc)) {
    if (!l.efKey.startsWith('fleet:')) continue
    const p = pickEF(loc, l.efKey, sel)
    if (isPriceableEF(p.factor) && p.publisher && !out.some(o => o.publisher === p.publisher!.publisher)) out.push(p.publisher)
  }
  return out
}

/** T3c: a value read through a selector, or null when the edition it needs is missing (the line is unpriced). */
function orMissing<T>(f: () => T): T | null {
  try { return f() } catch (e) { if (e instanceof MissingEditionError) return null; throw e }
}
/** T3c: a selection context given for `year`, or the default one (December, prepared today). A mismatch is a bug. */
function selFor(year: number, sel?: Sel): Sel {
  const s = sel ?? selectionFor(year)
  if (s.year !== year) throw new Error('Selection context is for ' + s.year + ', but the year asked for is ' + year + '.')
  return s
}
function calcLocation(loc: Location, gwpVersion: GwpVersion = 'AR6', year: number = 2024, selArg?: Sel) {
  const sel = selFor(year, selArg)
  let s1_stationary = 0, s1_mobile = 0
  const gases = { co2: 0, ch4: 0, n2o: 0 }
  // FI1: a line with no factor is skipped, never priced as zero and never taking the location with it.
  // unpricedLines names it; findUnresolvedCoverage blocks export on it; buildWorkings writes its row.
  for (const line of combustionLines(loc)) {
    const ef = pickEF(loc, line.efKey as keyof typeof EF, sel).factor
    if (!isPriceableEF(ef)) continue
    const g = calcGas(ef, line.entered, gwpVersion)   // the factor is per unit entered (pickEF converts exactly)
    if (line.mobile) s1_mobile += g.total; else s1_stationary += g.total
    gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  // FI1: an unrecognised or blank refrigerant type is unpriced (unpricedLines), never `?? 0`. The fugitive
  // total is then 0 because NOTHING WAS PRICED, and the workings row says so with a null result.
  const ref_gwp = hasRefrigerantLine(loc) ? refrigerantGwp(loc.refrigerant_type, gwpVersion) : null
  const s1_fugitive = ref_gwp === null ? 0 : loc.refrigerant_purchased_kg * ref_gwp / 1000
  const s1_total = s1_stationary + s1_mobile + s1_fugitive
  // Grid-region gate: when the location's grid_region isn't a real GRID_EF key (us_average default,
  // '', unmapped country), OMIT the electricity Scope 2 entirely — no getGridFactor call, no electricity
  // contribution — exactly like an absent Scope 1 fuel. Steam (grid-independent) is unaffected.
  const gridResolved = isResolvedGridRegion(loc.grid_region)
  // T3c: a grid edition that is not held leaves electricity unpriced (both Scope 2 figures), never another year's factor.
  const grid = gridResolved ? orMissing(() => getGridFactor(loc.grid_region, sel)) : null
  const grid_ef = grid ? grid.ef : 0
  // Steam prices through calcGas like every other stream, so a split factor's CH4 and N2O are counted
  // at the active GWP set. calcGas returns TONNES while the electricity term is still kg, so the /1000
  // sits on the electricity term alone rather than wrapping the sum.
  // ⚠️ ZERO HERE MEANS "NOT PRICED", NOT "NO EMISSIONS" — steamTonnes returns 0 when the jurisdiction
  // has no published factor and no supplier figure was given. The location total is therefore SHORT by
  // a stream the customer declared, which is why buildWorkings emits a loud no_published_factor row and
  // findSteamFactorGaps blocks export. Do NOT read this 0 as evidence of anything.
  const steam_t = steamTonnes(loc, gwpVersion, sel)
  const s2_location = (grid ? loc.electricity_kwh * grid_ef : 0) / 1000 + steam_t
  // Market-based: covered (contractual) kWh @ 0 (RECs/PPAs/green tariffs assumed zero-emission — documented);
  // uncovered kWh @ residual-mix factor. If no residual mix applies (full-disclosure region, or US subregion
  // not yet selected), fall back to the location grid factor for uncovered load and flag it.
  const uncovered_kwh = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
  const resRegion = residualRegionFor(loc)
  // T3c: a residual-mix edition that is not held leaves the market-based electricity unpriced; it never falls back.
  const res = orMissing(() => getResidualFactor(resRegion, sel, gwpVersion, loc.country))
  const market_elec_ef = res === null ? null : res.applicable ? res.ef : grid ? grid_ef : null
  // steam_t is the SAME term in both figures, unchanged: no market instrument applies to steam today,
  // so location- and market-based carry an identical steam contribution. Recovering CH4/N2O above
  // moves both by the same amount, which keeps that identity intact.
  const s2_market = (gridResolved && market_elec_ef !== null ? uncovered_kwh * market_elec_ef : 0) / 1000 + steam_t
  // NZ transmission & distribution losses — Scope 3 Category 3, NOT Scope 2. Kept as a DISTINCT
  // term (s3_td) and deliberately never added into s2_location/s2_market. Opt-in per NZ location.
  const td = (loc.country === 'NZ' && loc.nz_td_losses && loc.electricity_kwh > 0) ? orMissing(() => nzTdLoss(sel)) : null
  const s3_td = td ? loc.electricity_kwh * td.ef / 1000 : 0
  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location, s2_market, s3_td, gases, biogenic: loc.biogenic_co2_mt }
}

// ── Excluded locations: ONE decision, four consumers ────────────────────────────────────────────────
// FI1 (ruling "no silent drop-out", design doc section 10): A MISSING FACTOR NO LONGER EXCLUDES A LOCATION.
// It is one unpriced line (unpricedLines), excluded from every total, never counted as zero, with an
// export-blocking factor_missing, refrigerant or province issue naming the site, the fuel and the unit;
// the location's other lines are still priced. The earlier whole-location exclusion withheld every figure
// at the site to avoid a "knowingly short" total; the line-level issue blocks export instead, so a short
// total can never be exported unstated.
//   The ONLY whole-location exclusion left is the country: a location whose country resolves to no factor
// set (country_not_set, country_not_listed, country_not_supported). That is decided here, once, so
// calcInventory, buildWorkings, pctEstimated and the component's banner cannot disagree.
// ⚠️ GATES ONE CLAUSE OF ONE SENTENCE, AND IT EARNS ITS PLACE. "Its figures are kept as entered."
// is a claim, and on a location where nothing has been entered it is a false one. Small, but it is
// the kind of small falsehood that makes a customer doubt the larger sentence beside it.
//   Reads the amounts, never the has_* flags: a stream flagged present with no figure has nothing
// to keep.
function locationHasFigures(loc: Location): boolean {
  return loc.electricity_kwh > 0 || loc.natural_gas_amount > 0 || loc.propane_amount > 0
    || loc.diesel_stationary_amount > 0 || loc.fuel_oil_distillate_amount > 0
    || loc.fuel_oil_residual_amount > 0 || loc.gasoline_amount > 0 || loc.diesel_mobile_amount > 0
    || FLEET_FIELDS.some(f => fleetNum(loc, f) > 0)
    || loc.refrigerant_purchased_kg > 0 || loc.purchased_steam_mmbtu > 0
    || loc.renewable_electricity_kwh > 0
}

/** Why a location contributes nothing: its country (FI1: the only whole-location exclusion). */
export type LocationBlock = { kind: 'country'; refusal: CountryRefusal }

// ⚠️ THE COUNTRY IS CHECKED BEFORE calcLocation, AND THE ORDER IS LOAD BEARING.
// calcLocation only asks for a factor when a stream HAS a figure, so a location in Japan with
// electricity alone, or with nothing entered yet, would never reach pickEF and would pass as
// priceable. A country governs every stream at a site, so it is a property of the LOCATION and is
// answered on the location, not as a consequence of pricing one of its streams.
//   The country answer also wins when both apply. A site in Japan holding gas in m3 has two
// problems, and "change the unit" is the wrong instruction for it: fixing the unit would not make
// the figure priceable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function unpriceableReason(loc: Location, _gwpVersion: GwpVersion, _year: number): LocationBlock | null {
  const refusal = countryRefusal(loc)
  return refusal ? { kind: 'country', refusal } : null
}

/**
 * A location excluded from every total, and why: its country (FI1). A factor gap used to be a second kind
 * here, with a fuel and a unit; it is now an unpriced line, reported per line by unpricedLines and the
 * coverage gate, so this type has one arm.
 */
// FI1: a COUNTRY refusal only. A factor gap is an unpriced line (unpricedLines), never an excluded location,
// so the 'factor' arm this union carried is gone. `kind` stays so every surface keeps branching on it.
export type UnpriceableLocation = {
  kind: 'country'
  locId: string
  locName: string
  refusal: CountryRefusal
}

// Pure probe, same shape as findUnresolvedCoverage / findUndeclaredStreams: a list of what is
// wrong, which the component turns into a per-location state, a note on every affected total,
// and an export gate.
// `locations` must be deriveLocations output (T4), so a location is judged on the figures it will be priced on.
// T3c: takes the year end and selection context with the year, like every pricing entry point. The answer is the
// country alone (FI1), so neither changes it; a missing edition is a line (unpricedLines), never a location.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function findUnpriceableLocations(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024, _fiscalYearEndMonth: number = 12, _ctx: SelectionContext = {}): UnpriceableLocation[] {
  const out: UnpriceableLocation[] = []
  for (const loc of locations) {
    const why = unpriceableReason(loc, gwpVersion, year)
    if (!why) continue
    out.push({ kind: 'country', locId: loc.id, locName: loc.name || 'Location', refusal: why.refusal })
  }
  return out
}

// `locations` must be deriveLocations output (T4): a stored document-backed field can be stale.
function calcInventory(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024, selArg?: Sel) {
  const sel = selFor(year, selArg)
  return locations.reduce((acc, loc) => {
    // Excluded, never zeroed: a location that cannot be priced contributes nothing and is named on
    // screen. Adding 0 would assert it emits nothing, which is a figure we have no evidence for.
    if (unpriceableReason(loc, gwpVersion, year)) return acc
    const c = calcLocation(loc, gwpVersion, year, sel)
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

// tCO2e per document-backed FIELD for ONE location (T5). Keyed by field, not fuelType, so stationary
// diesel and fleet diesel, which share fuelType 'diesel', stay separate: an estimate on one must never
// count the other as estimated. Same EFs, same grid gate, same GWP as calcLocation, so a field's share
// here reconciles with the inventory total.
function fuelEmissionsByType(loc: Location, gwpVersion: GwpVersion, year: number, selArg?: Sel): Record<string, number> {
  const sel = selFor(year, selArg)
  const out: Record<string, number> = {}
  const add = (k: string, v: number) => { out[k] = (out[k] ?? 0) + v }
  // The same lines calcLocation prices, skipping the same unpriced ones (FI1), so a field's share here
  // reconciles with the inventory total.
  for (const line of combustionLines(loc)) {
    const ef = pickEF(loc, line.efKey as keyof typeof EF, sel).factor
    if (isPriceableEF(ef)) add(String(line.field), calcGas(ef, line.entered, gwpVersion).total)
  }
  // Electricity = Scope 2 location-based (the series' headline basis). Same grid gate as calcLocation:
  // an unresolved grid_region contributes 0 there, so it must contribute 0 here too. T3c: so does a missing edition.
  const grid = isResolvedGridRegion(loc.grid_region) && loc.electricity_kwh > 0 ? orMissing(() => getGridFactor(loc.grid_region, sel)) : null
  if (grid) add('electricity_kwh', loc.electricity_kwh * grid.ef / 1000)
  return out
}

// The fuel each emissions field belongs to, as slices and resolutions name it. Stationary and fleet
// diesel share 'diesel' here; they stay apart as FIELDS wherever a figure is concerned (T5 ruling).
const FIELD_FUEL: Record<string, string> = {
  natural_gas_amount: 'natural_gas', propane_amount: 'propane', diesel_stationary_amount: 'diesel',
  diesel_mobile_amount: 'diesel', gasoline_amount: 'gasoline', electricity_kwh: 'electricity',
  fuel_oil_distillate_amount: 'fuel_oil_distillate', fuel_oil_residual_amount: 'fuel_oil_residual',
  // FI9: by fuel, as the legacy two are, so slices and trends stay comparable across the split.
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, f.fuel === 'petrol' ? 'gasoline' : 'diesel'])),
}

/**
 * Per priced location and emissions field: the annual tCO2e (Scope 1, or Scope 2 location-based) and the
 * part of it that is ESTIMATED by a gap gross-up. One implementation for pctEstimated and for the
 * monthly reconcile (T6), so the share reported as estimated and the gap the reconciliation explains are
 * the same number.
 *   estimated = emissions × (derived figure − evidenced quantity) / derived figure
 * where the evidenced quantity is Σ counted contributions' value × in-window share. applyResolutions has
 * already grossed up each meter by its own coverage and matched each estimate to its document type, so
 * the difference is exactly what was grossed up, per meter, per field (T5 ruling). Proration allocates
 * real metered data, so a prorated field's evidenced quantity equals its figure.
 * `documentBacked` is true when at least one counted bill backs the field; a typed figure is not.
 * Unpriceable and refused locations are skipped, as calcInventory skips them.
 */
export interface FieldEmissions {
  locId: string; field: string; fuelType: string; scope: 1 | 2
  annual: number; estimated: number; documentBacked: boolean
}
export function emissionsByLocationField(
  inventory: { locations: Location[]; reporting_year: number; fiscal_year_end_month?: number; coverage_resolutions?: CoverageResolution[] },
  gwpVersion: GwpVersion,
  ctx: SelectionContext = {},
): FieldEmissions[] {
  const year = inventory.reporting_year
  const sel = selectionFor(year, inventory.fiscal_year_end_month, ctx)
  const win = periodFromYearAndEnd(year, inventory.fiscal_year_end_month ?? 12)
  const resolutions = inventory.coverage_resolutions ?? []
  const out: FieldEmissions[] = []
  for (const loc of deriveLocations(inventory)) {
    if (unpriceableReason(loc, gwpVersion, year)) continue
    const evidenced: Record<string, number> = {}
    for (const c of billContributions(loc, acceptedResolutions(loc, resolutions), win)) {
      if (c.counted) evidenced[String(c.field)] = (evidenced[String(c.field)] ?? 0) + c.value * (c.share ?? 0)
    }
    for (const [field, annual] of Object.entries(fuelEmissionsByType(loc, gwpVersion, year, sel))) {
      const figure = (loc as unknown as Record<string, number>)[field]
      const ev = evidenced[field]
      const grossedUp = ev == null ? 0 : figure - ev
      // Summation order differs from applyResolutions' per-meter sums, so an unestimated field can
      // differ from its evidence by rounding alone; that is not estimation.
      const estimated = ev != null && figure > 0 && grossedUp > figure * 1e-9 ? annual * (grossedUp / figure) : 0
      out.push({ locId: loc.id, field, fuelType: FIELD_FUEL[field] ?? field, scope: field === 'electricity_kwh' ? 2 : 1,
        annual, estimated, documentBacked: ev != null })
    }
  }
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
 *
 * Takes the inventory and derives its locations itself (T5), so the share is measured against the
 * figures the totals are calculated on, never a stored field that may be stale. Per meter and per field
 * by construction: see emissionsByLocationField.
 */
export function pctEstimated(
  inventory: { locations: Location[]; reporting_year: number; fiscal_year_end_month?: number; coverage_resolutions?: CoverageResolution[] },
  gwpVersion: GwpVersion,
  ctx: SelectionContext = {},
): number | null {
  const locations = deriveLocations(inventory)
  const sel = selectionFor(inventory.reporting_year, inventory.fiscal_year_end_month, ctx)
  const estimated = emissionsByLocationField(inventory, gwpVersion, ctx).reduce((a, f) => a + f.estimated, 0)
  // A wholly manual inventory (no confirmed concierge proposal on any location) has no evidence
  // basis to measure "estimated share" against — null is an absence, not a 0% claim.
  const hasConciergeData = locations.some(loc =>
    (loc.source_docs ?? []).some(d => (d.extracted ?? []).some(p => p.status === 'confirmed' && p.value != null)))
  if (estimated <= 0 && !hasConciergeData) return null

  const inv = calcInventory(locations, gwpVersion, inventory.reporting_year, sel)
  const total = inv.s1_total + inv.s2_location
  if (total <= 0) return 0 // concierge data present but zero emissions → 0% estimated, not an absence
  return (estimated / total) * 100
}

// Map a concierge (docType, fuelType) pair to its inventory field(s). Module-scoped so both the
// confirm path (updateProposal / addCoverageResolution) and buildWorkings share one join key.
function fieldFor(docType: string, fuelType: string, fleetType?: FleetType): { amount: keyof Location; unit?: keyof Location } | null {
  // FI9 diff 4: a fleet-fuel reading with a vehicle type lands on that type's field; without one (read before FI9), on
  // the legacy field, which is unpriced until the type is chosen.
  if (docType === 'fleet_fuel' && fleetType && (fuelType === 'diesel' || fuelType === 'gasoline')) {
    const f = FLEET_FIELDS.find(x => x.type === fleetType && x.fuel === (fuelType === 'gasoline' ? 'petrol' : 'diesel'))!
    return { amount: f.amount, unit: f.unit }
  }
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
    default: return null // fleet_fuel (two fuels — 3c), service_record, fuel_oil (both grades), purchased_steam
  }
}

// ── Resolution application — single source of truth for what a figure IS ──────
// The human-readable method/basis strings are composed HERE, once. Both the per-field
// adjustment (applyResolutions) and the coverage-resolution audit rows in buildWorkings
// read from these, so the claim on the figure and the claim in the audit trail cannot
// drift apart — the divergence they used to have IS the SEV 0 bug.
// Both are called with ACCEPTED resolutions only (applyResolutions' extrapolations, and buildWorkings' audit
// rows after validateResolution), so a legacy 'duplicate' or 'straddle' never reaches them and has no wording
// here (T13).
// `loc` names the copies of an exact duplicate by document type (T15-fix1); without it they read "Source document".
function resolutionMethod(r: CoverageResolution, loc?: Location): string {
  const typeOf = (id?: string) => docTypeLabel(loc?.source_docs.find(d => d.id === id)?.document_type ?? '')
  return r.kind === 'extrapolate' ? `Extrapolation (×12/${r.monthsCovered}, ${r.pctEstimated}% estimated)`
    : r.kind === 'same_bill' ? 'Same bill, counted once'
    : r.kind === 'different_meters' ? `Different meters or accounts: ${r.meterLabel ?? ''}`
    : r.kind === 'used_none' ? `Site used none, confirmed by ${r.by?.email ?? ''} on ${dateInWords(new Date(r.acknowledgedAt))}`
    : r.kind === 'deliveries_complete' ? `Deliveries confirmed complete by ${r.by?.email ?? ''} on ${dateInWords(new Date(r.acknowledgedAt))}`
    : r.kind === 'exact_duplicate' ? (r.choice === 'count_once'
      ? `Same document, counted once as the ${typeOf(r.countedDocId)}, chosen by ${r.by?.email ?? ''} on ${dateInWords(new Date(r.acknowledgedAt))}`
      : `Not the same document, the ${(r.docIds ?? []).map(typeOf).join(' and the ')} each counted, chosen by ${r.by?.email ?? ''} on ${dateInWords(new Date(r.acknowledgedAt))}`)
    : r.kind
}
function resolutionBasis(r: CoverageResolution): string {
  if (r.kind === 'extrapolate' && r.monthsCovered) {
    const mult = 12 / r.monthsCovered
    const multStr = Number.isInteger(mult) ? String(mult) : mult.toFixed(2)
    return `${r.monthsCovered} of 12 months from bills; grossed ×${multStr} for acknowledged coverage gap`
  }
  if (r.kind === 'same_bill') return `document ${r.countedDocId} counted; ${(r.excludedDocIds ?? []).join(', ')} retained as evidence, not counted`
  return r.note
}

// ── T3: RESOLUTION VALIDATION, COVERAGE MESSAGES, FIELD TABLES ───────────────────────────────────────
// docs/review/design-derived-figures.md, section 11 T3, and the T3 rulings in section 10.
//
// A resolution is ACCEPTED only if it validates against the location. Every engine path reads accepted
// resolutions only, so an invalid or legacy one changes no figure, resolves no issue and gets no audit row.
// 'duplicate' and 'straddle' are never accepted: 'duplicate' left a known double count in the total
// (rule R4), and 'straddle' is replaced by automatic proration (rule R2, T2).
export function validateResolution(r: CoverageResolution, loc: Location): string | null {
  if (r.locId !== loc.id) return 'Resolution is for a different location.'
  const docs = loc.source_docs
  const hasFuel = (docId: string) =>
    docs.some(d => d.id === docId && (d.extracted ?? []).some(p => p.fuelType === r.fuelType))
  switch (r.kind) {
    case 'extrapolate': {
      if (!(r.monthsCovered && r.monthsCovered > 0)) return 'An estimate needs the number of months covered by bills.'
      const types = new Set(docs.filter(d => (d.extracted ?? []).some(p => p.fuelType === r.fuelType)).map(d => d.document_type))
      if (r.documentType != null && !types.has(r.documentType)) return 'The estimate names documents that are not on this site.'
      if (r.documentType == null && types.size > 1) return 'Choose which documents this estimate covers.'
      // T10b: deliveries are counted as delivered; a delivery-based group is never estimated (ruling).
      const docType = r.documentType ?? [...types][0]
      if (docType != null && isDeliveryGroup(loc, docType, r.fuelType)) return 'Deliveries are counted as delivered, not estimated.'
      return null
    }
    case 'deliveries_complete': {
      if (!r.by?.userId || !r.by?.email) return 'A confirmation must record who confirmed it.'
      if (!r.documentType) return 'Name the documents these deliveries are on.'
      const ids = r.docIds ?? []
      // The ids are a SNAPSHOT of what was confirmed, so a document removed since is not an error here: the
      // set no longer matches, and findUnresolvedCoverage reopens the issue saying the deliveries changed.
      if (ids.length === 0) return 'Name the deliveries being confirmed.'
      if (!isDeliveryGroup(loc, r.documentType, r.fuelType)) return 'These documents are not deliveries, so their coverage is checked by month instead.'
      return null
    }
    case 'same_bill': {
      const ex = r.excludedDocIds ?? []
      if (!r.countedDocId) return 'Choose the document that counts.'
      if (ex.length === 0) return 'Choose the document that is the same bill.'
      if (ex.includes(r.countedDocId)) return 'The document that counts cannot also be excluded.'
      if (![r.countedDocId, ...ex].every(hasFuel)) return 'Every document named must be on this site and carry this fuel.'
      return null
    }
    case 'different_meters': {
      const label = (r.meterLabel ?? '').trim()
      if (!label) return 'Name the meter or account for the second document.'
      const doc = docs.find(d => d.id === r.docId)
      if (!doc) return 'The document named is not on this site.'
      if ((doc.meter_label ?? '') !== label) return "The meter name must match the document's meter label."
      return null
    }
    case 'used_none':
      if (!r.field || !USED_NONE_FIELDS.has(r.field)) return 'Name the figure that is being confirmed as none.'
      if (!r.by?.userId || !r.by?.email) return 'A confirmation must record who confirmed it.'
      return null
    case 'exact_duplicate': {
      if (!r.by?.userId || !r.by?.email) return 'A choice must record who made it.'
      const typeOf = (id: string) => docs.find(d => d.id === id)?.document_type
      if (r.choice === 'count_once') {
        const ex = r.excludedDocIds ?? []
        if (!r.countedDocId) return 'Choose the document that counts.'
        if (ex.length === 0) return 'Choose the document that is the same as it.'
        if (ex.includes(r.countedDocId)) return 'The document that counts cannot also be excluded.'
        if (![r.countedDocId, ...ex].every(hasFuel)) return 'Every document named must be on this site and carry this fuel.'
        // R6 is across document types. Two documents of one type are an overlap, answered by Same bill.
        if (ex.some(id => typeOf(id) === typeOf(r.countedDocId as string))) return 'These documents are the same kind, so choose Same bill, count it once.'
        return null
      }
      if (r.choice === 'not_same') {
        const ids = r.docIds ?? []
        if (new Set(ids).size < 2) return 'Name the two documents that are not the same.'
        if (!ids.every(hasFuel)) return 'Every document named must be on this site and carry this fuel.'
        return null
      }
      return 'Choose Same document, count once, or Not the same.'
    }
    case 'duplicate':
      return 'This resolution is no longer accepted. Choose Same bill, count it once, or Different meters or accounts.'
    case 'straddle':
      return 'This resolution is no longer accepted. Bills that cross the year boundary are prorated by their own days.'
  }
}
/** T10b: two document-id lists name the same documents, order ignored. */
export function sameDocSet(a: readonly string[], b: readonly string[]): boolean {
  const A = new Set(a), B = new Set(b)
  return A.size === B.size && [...A].every(x => B.has(x))
}

/**
 * T10b: true when a location's (document type, fuel) group holds a confirmed delivery, so it is checked for
 * completeness and never estimated. Read from the readings, not the type alone (ruling: the reading decides).
 */
export function isDeliveryGroup(loc: Location, documentType: string, fuelType: string): boolean {
  return loc.source_docs.some(d => d.document_type === documentType
    && (d.extracted ?? []).some(p => p.fuelType === fuelType && p.status === 'confirmed' && p.value != null && deliveryDateOf(documentType, p) !== null))
}

export const acceptedResolutions = (loc: Location, resolutions: CoverageResolution[]): CoverageResolution[] =>
  resolutions.filter(r => r.locId === loc.id && validateResolution(r, loc) === null)

// The declarable stream each document-backed field belongs to, for used_none and the declarations gate.
// renewable_electricity_kwh is not a stream (it reduces market-based Scope 2), so it cannot be used_none.
const FIELD_STREAM: Partial<Record<keyof Location, DeclarableStream>> = {
  natural_gas_amount: 'natural_gas',
  propane_amount: 'propane',
  diesel_stationary_amount: 'diesel_stationary',
  diesel_mobile_amount: 'mobile',
  gasoline_amount: 'mobile',
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, 'mobile' as const])),
  electricity_kwh: 'electricity',
  // T10 ruling on unread uploads: "used none" is offered for every field a document type supports, so these
  // streams can be answered that way too.
  fuel_oil_distillate_amount: 'fuel_oil_distillate',
  fuel_oil_residual_amount: 'fuel_oil_residual',
  purchased_steam_mmbtu: 'purchased_steam',
  refrigerant_purchased_kg: 'refrigerants',
}

// The fields each document type is evidence for (T10 ruling on unread uploads). A document with nothing read
// from it is evidence when any of these already has a figure; otherwise it blocks, naming them.
export const DOC_TYPE_FIELDS: Record<string, (keyof Location)[]> = {
  utility_bill_gas: ['natural_gas_amount'],
  utility_electricity: ['electricity_kwh'],
  fuel_propane: ['propane_amount'],
  fuel_diesel: ['diesel_stationary_amount'],
  // FI9 diff 4: the six vehicle-type fields; an unread upload names only the ticked types' (unreadFleetFields).
  fleet_fuel: FLEET_FIELDS.map(f => f.amount),
  fuel_oil: ['fuel_oil_distillate_amount', 'fuel_oil_residual_amount'],
  purchased_steam: ['purchased_steam_mmbtu'],
  service_record: ['refrigerant_purchased_kg'],
  renewable_cert: ['renewable_electricity_kwh'],
  biogenic: ['biogenic_co2_mt'],
}
// How each of those fields is named to the customer.
export const FIELD_NAME: Record<string, string> = {
  natural_gas_amount: 'natural gas', electricity_kwh: 'electricity', propane_amount: 'propane',
  diesel_stationary_amount: 'diesel', gasoline_amount: 'gasoline', diesel_mobile_amount: 'diesel',
  fuel_oil_distillate_amount: 'heating oil', fuel_oil_residual_amount: 'heavy fuel oil',
  purchased_steam_mmbtu: 'purchased steam', refrigerant_purchased_kg: 'refrigerant',
  renewable_electricity_kwh: 'renewable electricity', biogenic_co2_mt: 'biomass',
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, f.name])),
}
/** "a", "a and b", "a, b and c". */
export const listInWords = (xs: string[]): string =>
  xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
const USED_NONE_FIELDS = new Set(Object.values(DOC_TYPE_FIELDS).flat().map(String))

// The plain-language messages behind the export-blocking coverage issues (T3 ruling "no silent zero", and
// "all documents rejected"). Shown by the strip in T8. invalid_period uses INVALID_PERIOD_MESSAGE (T1).
/** T15-fix1: one copy of a document, as the customer sees it: its file name and the kind of document it was uploaded as. */
export type DocCopy = { file: string; documentType: string }
/** "a Diesel purchase record", "an Electricity bill". The labels are DOC_TYPE_LABELS nouns, kept as written. */
export const withArticle = (label: string): string => `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`
/**
 * T15-fix1: two copies named so they can be told apart. Different file names: each with its type in brackets.
 * The same file name: the file once, then the two types it was uploaded as.
 */
export function twoCopies(a: DocCopy, b: DocCopy): string {
  const A = docTypeLabel(a.documentType), B = docTypeLabel(b.documentType)
  return a.file === b.file
    ? `${a.file}, uploaded as ${withArticle(A)} and as ${withArticle(B)},`
    : `${a.file} (${A}) and ${b.file} (${B})`
}

// T15-fix2: the instructions the gate gives for a bill it does not count, ONCE, so the gate message and the
// line under the reading (notCountedLines) cannot word the same fix two ways.
export const FIX_DATES = 'Enter the dates as they appear on the bill.'
export const FIX_REVERSED = 'Check the dates and correct them.'
export const FIX_UNITS = 'Correct the units, or enter the figure manually.'
export const FIX_STREAM_OFF = (stream: string, n: number): string => `Turn ${stream} on for this site, or reject the bill${n === 1 ? '' : 's'}.`

/**
 * T15-fix1: shown on the reading of a copy left out by "Same document, count once". The reading itself still
 * says what was read from the file, so without this a customer sees the same figure, confirmed, under both
 * uploads and cannot tell that only one of them reaches the total.
 */
export const EXACT_DUPLICATE_NOT_COUNTED = (countedDocumentType: string): string =>
  `Not counted: this is the same document as the ${docTypeLabel(countedDocumentType)}, which is counted.`

export const COVERAGE_MESSAGE = {
  undated: (file: string) =>
    `${file} has no billing period, so it is not counted. ${FIX_DATES}`,
  mixed_units: (fuel: string, site: string, units: string[], files: string[]) =>
    `The ${fuel} bills for ${site} are in different units (${units.join(', ')}: ${files.join(', ')}), so none of them is counted. ${FIX_UNITS}`,
  overlap: (fileA: string, fileB: string, from: string, to: string) =>
    `${fileA} and ${fileB} cover the same days (${from} to ${to}). Choose Same bill, count it once, or Different meters or accounts.`,
  // T18: a withdrawn document counts as rejected here, and the message says "rejected or withdrawn" when one is.
  all_rejected: (fuel: string, site: string, withdrawn = false) =>
    `Every ${fuel} document for ${site} was ${withdrawn ? 'rejected or withdrawn' : 'rejected'} and no figure has been entered. Enter the figure manually, or confirm this site used no ${fuel}.`,
  // T6 ruling. `stream` and `verb` are the declarable stream's own wording (STREAM_META).
  // T10a: a proposal confirmed with no figure (saved before confirming one was refused).
  no_value: (file: string) =>
    `${file} is confirmed, but no figure could be read from it, so it is not counted. Edit the unit or the figure, or reject the bill.`,
  // T10 ruling: an upload with nothing read from it, when no field its document type supports has a figure.
  unread: (file: string, fuels: string, site: string) =>
    `${file} is uploaded for ${fuels} at ${site}, but no figure has been read from it or entered. Enter the figure from the bill, or confirm this site used no ${fuels}.`,
  // T10b: a delivery-based fuel is checked for completeness, not monthly coverage. Until the customer confirms
  // the deliveries listed are all of them, export waits.
  // T10c: no count; the list beside it shows the deliveries.
  deliveries_unconfirmed: (fuel: string, site: string, from: string, to: string) =>
    `Confirm these are all the ${fuel} deliveries for ${site} between ${from} and ${to}. Export is blocked until you confirm.`,
  deliveries_changed: (fuel: string, site: string, email: string, date: string) =>
    `The ${fuel} deliveries for ${site} have changed since ${email} confirmed them on ${date}. Check the list and confirm again. Export is blocked until you do.`,
  // T15 (rule R6): the same document under two document types. What was observed is stated, not guessed at.
  // T15-fix1: each copy is named by its document type, because the commonest case is ONE file uploaded twice,
  // and two identical file names told the customer nothing about which copy was which.
  exact_duplicate: (site: string, a: DocCopy, b: DocCopy, match: 'sha256' | 'reading', fuel: string) => {
    const A = docTypeLabel(a.documentType), B = docTypeLabel(b.documentType)
    const tail = 'Choose Same document, count once, or Not the same. Export is blocked until you choose.'
    if (a.file === b.file) return match === 'sha256'
      ? `${a.file} at ${site} was uploaded twice, as ${withArticle(A)} and as ${withArticle(B)}. ${tail}`
      : `${a.file} at ${site} was uploaded as ${withArticle(A)} and as ${withArticle(B)}, and both show the same ${fuel} figure, unit and dates. ${tail}`
    return `${a.file} (${A}) and ${b.file} (${B}) at ${site} ${match === 'sha256' ? 'are the same file' : `show the same ${fuel} figure, unit and dates`}, uploaded as two different kinds of document. ${tail}`
  },
  stream_off: (site: string, verb: 'use' | 'have', stream: string, n: number, fuel: string) =>
    `${site} is marked as not ${verb === 'use' ? 'using' : 'having'} ${stream}, but ${n} ${fuel} bill${n === 1 ? ' is' : 's are'} confirmed. ${FIX_STREAM_OFF(stream, n)}`,
}

// The "uses this fuel" switch behind each document-backed field (T6 ruling). calcLocation and buildWorkings
// price a field only when its switch is on, so confirmed bills under a switch that is off would leave the
// annual figure silently. Electricity has no switch.
const FIELD_SWITCH: Partial<Record<keyof Location, keyof Location>> = {
  natural_gas_amount: 'has_natural_gas', propane_amount: 'has_propane', diesel_stationary_amount: 'has_diesel_stationary',
  diesel_mobile_amount: 'has_mobile', gasoline_amount: 'has_mobile',
  ...Object.fromEntries(FLEET_FIELDS.map(f => [f.amount, 'has_mobile'])),
}
/** True when the field has a "uses this fuel" switch and it is off, so the annual figure omits the field. */
export function streamSwitchOff(loc: Location, field: keyof Location | string): boolean {
  const sw = FIELD_SWITCH[field as keyof Location]
  // FI9: a fleet field also needs its vehicle type ticked.
  const fleet = FLEET_FIELDS.find(f => f.amount === field)
  if (fleet && (loc as unknown as Record<string, unknown>)[fleet.typeSwitch] !== true) return true
  return sw != null && !(loc as unknown as Record<string, unknown>)[String(sw)]
}

// ── BILL CONTRIBUTIONS (docs/review/design-derived-figures.md, task T1) ─────────────────────────
//
// One row per proposal that carries a value and maps to a location field: what that bill contributes to
// the figure for the reporting window, and why. PURE, and NOT YET CALLED: T2 re-expresses applyResolutions
// as the fold of these rows. Until then nothing reads it, so it changes no figure.
//
// ⚠️ DAYS ARE HALF-OPEN ON THE CANONICAL PERIOD [start, exclusiveEnd(end)). Ruled C4 in the design doc:
// "inclusive" means inclusive of the LAST COVERED DAY, which is exclusiveEnd(end) − 1. So "Dec 1 – Jan 1"
// is 31 days, not 32, and the per-bill share reconciles with the half-open monthly split. This uses the
// same arithmetic analyzeCoverage uses for its window (dayCount); it does NOT use the inclusive
// daysBetween, and neither function is changed. exclusiveEnd is the one definition, reused.
//
// REASONS, in order of precedence. Rulings recorded on 1 Oct 2026 (design doc, T1 decisions):
//   not_confirmed  any status other than 'confirmed'. A row, so every document's status reads from one list.
//   mixed_units    the field's confirmed proposals carry more than one unit: EVERY confirmed row of that
//                  field, matching today's whole-field behaviour (no figure until the units agree).
//   invalid_period confirmed, both dates present, but the period cannot be used. Two kinds, each with its
//                  own plain-language message (INVALID_PERIOD_MESSAGE): 'unparseable', a date string that is
//                  not a real yyyy-mm-dd date (including one like 2025-02-30, which JavaScript would silently
//                  roll to 2 March); and 'reversed', both dates real but the end before the start (no days in
//                  the canonical period). Not counted. Distinct from undated (ruled).
//   undated        confirmed, but no usable period: dates missing. No evidence of in-year days, so no
//                  contribution; the coverage gate's 'none' still blocks export.
// T3 RULING: of the not-counted reasons only outside_year and same_bill_as may be silent (and, since T15,
// exact_duplicate_of, which the customer chose). undated,
// invalid_period and mixed_units must each raise an export-blocking coverage issue with a plain-language
// message, so a field can never drop to zero without the customer being told. T1 only labels the rows.
//   outside_year   no day inside the window (rule R1).
//   prorated       some days inside, some outside: share = inWindowDays / totalDays, per bill (rule R2).
//   counted        every day inside.
// A proposal with value null produces NO row (ruled): there is no figure to count or exclude, and the
// document's read_outcome already says why. A proposal whose (document_type, fuelType) maps to no field
// produces no row either, as applyResolutions skips it today.
// same_bill_as (T3), exact_duplicate_of (T15) and manual_override (T10) are set from the customer's choices;
// reasonRef names the document that counts instead.
//
// `value` is the bill's full canonical value. What it contributes is value × share when counted (T2).
// `periodStart` is kept VERBATIM as stored; `periodEndExclusive` is the canonical boundary.
// `periodOrigin`: 'high' → printed, 'medium' → billing_month (rule R5); anything else, including a missing
// periodConfidence, is null, meaning not recorded (ruled). `meterLabel` null is the default single meter (ruled).
export type PeriodOrigin = 'printed' | 'billing_month' | 'customer_confirmed' | 'delivery'
export type ContributionReason =
  | 'counted' | 'prorated' | 'outside_year' | 'undated' | 'invalid_period' | 'not_confirmed' | 'mixed_units'
  | 'same_bill_as' | 'exact_duplicate_of' | 'manual_override' | 'delivered' | 'withdrawn'
export interface BillContribution {
  docId: string
  proposalIndex: number
  fuelType: string
  field: keyof Location
  meterLabel: string | null
  periodStart: string | null
  periodEndExclusive: string | null
  periodOrigin: PeriodOrigin | null
  totalDays: number | null
  inWindowDays: number | null
  share: number | null
  value: number
  unit: string | null
  counted: boolean
  reason: ContributionReason
  /** Set only when reason is invalid_period: which kind, so T3 can show the matching message. */
  periodProblem?: InvalidPeriodKind
  reasonRef?: string
  meteredSplit?: { evidenceDocId: string; inYearValue: number }
  /** T9: what was read from the bill, present once the customer changed the dates or unit. */
  asRead?: ExtractedProposal['asRead']
  /** T9: the customer's changes to the dates or unit, with who and when. */
  corrections?: ExtractedProposal['corrections']
  /** T9: who rejected the bill, or undid a rejection, and when. T18: and who flagged it. */
  statusLog?: ExtractedProposal['statusLog']
  /** T18: who confirmed the reading, when, and the reading as shown then. */
  confirmations?: ExtractedProposal['confirmations']
  /** T18: who confirmed or entered the billing dates, and when (periodOrigin customer_confirmed). */
  periodConfirmedAt?: string
  periodConfirmedBy?: ExtractedProposal['periodConfirmedBy']
  /** T18: who chose the vehicle type of a fleet-fuel reading, and when (FI9). */
  fleetTypeLog?: ExtractedProposal['fleetTypeLog']
  /** T18: set when reason is withdrawn: who withdrew the document, when and why. */
  withdrawal?: SourceDoc['withdrawn']
  /** T10b: the delivery date, when this reading is a delivery (counted in full if inside the year). */
  deliveryDate?: string
}

/**
 * T10b: the delivery date of a reading that is a DELIVERY, or null when it is not one. Rulings (design doc
 * section 10): within a delivery-capable document type (DELIVERY_DOC_TYPES) the READING decides. A single
 * delivery date with no billing period is a delivery; so is a reading whose stored period starts and ends on
 * the same day, which is how a delivery date was stored before T10b (read as a delivery, no migration). A
 * reading with a period of more than one day is a statement, prorated by its own days. Gas, electricity and
 * steam are never deliveries.
 */
export function deliveryDateOf(documentType: string, p: Pick<ExtractedProposal, 'periodStart' | 'periodEnd' | 'deliveryDate'>): string | null {
  if (!DELIVERY_DOC_TYPES.has(documentType)) return null
  if (p.periodStart && p.periodEnd) return p.periodStart.slice(0, 10) === p.periodEnd.slice(0, 10) ? p.periodStart : null
  if (!p.periodStart && !p.periodEnd && p.deliveryDate) return p.deliveryDate
  return null
}

/**
 * Where a proposal's billing dates came from (rule R5). The recorded periodOrigin wins; a proposal saved
 * before T9 has none, and reads it from periodConfidence: high → printed, medium → billing_month (the T1
 * ruling), anything else null, meaning not recorded.
 */
export function periodOriginOf(p: Pick<ExtractedProposal, 'periodOrigin' | 'periodConfidence'>): PeriodOrigin | null {
  if (p.periodOrigin !== undefined && p.periodOrigin !== null) return p.periodOrigin
  return p.periodConfidence === 'high' ? 'printed' : p.periodConfidence === 'medium' ? 'billing_month' : null
}

/** The sentence the review shows when a month-only bill is accepted (R5): the customer must confirm its days. */
export const BILLING_MONTH_CONFIRM_MESSAGE =
  'This bill only shows the month, so we set the dates to the first and last day of it. Check them against the bill, correct them if needed, then confirm.'

/**
 * The ACCEPTANCE VALIDATOR (T9, rule R5): why this proposal cannot be confirmed as it stands, or null when it
 * can. A month-only proposal (billing_month) needs the customer to confirm or correct its dates first, which
 * sets periodOrigin to customer_confirmed. Every path that confirms a proposal goes through this.
 */
export function acceptanceProblem(p: Pick<ExtractedProposal, 'periodOrigin' | 'periodConfidence'>): string | null {
  return periodOriginOf(p) === 'billing_month' ? BILLING_MONTH_CONFIRM_MESSAGE : null
}

/**
 * FI9 diff 4 (ruling R16): a fleet-fuel reading cannot be confirmed until the customer chooses the vehicles it was used
 * in. The reader never infers the type, so a confirmed fleet figure always names a type someone chose.
 */
export function fleetTypeProblem(docType: string, p: Pick<ExtractedProposal, 'fuelType' | 'fleetType'>): string | null {
  if (docType !== 'fleet_fuel' || p.fleetType) return null
  return `Choose the vehicles this ${p.fuelType === 'gasoline' ? 'petrol' : p.fuelType} was used in before confirming.`
}

/** T10a, worded by T10c: why a proposal with no figure cannot be confirmed, shown beside the disabled Confirm. */
export const NO_VALUE_MESSAGE =
  "We couldn't find a usable figure on this bill. Check the unit or enter the figure yourself, or reject the bill if it shouldn't be included."
/** T10c: the same, when a figure and unit were read but the unit is one the conversion cannot use. */
export const NO_VALUE_UNIT_MESSAGE = (quote: string, fuel: string): string =>
  `We read "${quote}" from this bill, but we can't use that unit for ${fuel} yet. Choose the unit from the list, or enter the figure yourself.`

/**
 * T10a: a proposal with no figure (value null: an unreadable number, or a unit with no conversion) can never be
 * confirmed. Confirming it counted nothing and raised nothing, so the figure fell to zero in silence.
 * T10c: when the reading has a quote and a unit the conversion does not recognise (the same test that left the
 * figure empty at extraction), the message names the quote and the fuel.
 */
export function valueProblem(
  p: Pick<ExtractedProposal, 'value'> & Partial<Pick<ExtractedProposal, 'sourceQuote' | 'fuelType' | 'rawValue' | 'rawUnit' | 'status' | 'corrections'>>,
): string | null {
  if (p.value != null) return null
  // T18: a typed figure cleared by a unit change asks for the figure again, in the new unit.
  const cleared = clearedFigureOf({ value: p.value, status: p.status ?? 'extracted', corrections: p.corrections })
  if (cleared) return READING_FIGURE_CLEARED_MESSAGE(cleared)
  const quote = (p.sourceQuote ?? '').trim()
  if (quote && p.rawUnit && p.fuelType && convertToCanonical(p.fuelType as FuelType, p.rawValue ?? null, p.rawUnit).tier === 3) {
    return NO_VALUE_UNIT_MESSAGE(quote, FUEL_NAME[p.fuelType] ?? p.fuelType.replace(/_/g, ' '))
  }
  return NO_VALUE_MESSAGE
}

/**
 * T10c: a bill confirmed with no figure (possible only for one confirmed before T10a) is shown as "Needs
 * attention", never with the green "Confirmed" badge. Display only: the stored status and the export-blocking
 * no_value issue are unchanged.
 */
export function proposalNeedsAttention(p: Pick<ExtractedProposal, 'status' | 'value'>): boolean {
  return p.status === 'confirmed' && p.value == null
}

export type InvalidPeriodKind = 'unparseable' | 'reversed'
// The plain-language sentence for each kind, naming the document and the dates as stored. Defined here so
// T3's export-blocking issue and any surface that explains a row use the same words.
export const INVALID_PERIOD_MESSAGE: Record<InvalidPeriodKind, (fileName: string, start: string, end: string) => string> = {
  unparseable: (fileName, start, end) =>
    `The billing period on ${fileName} could not be read as dates ("${start}" to "${end}"). ${FIX_DATES}`,
  // T10c: real dates are shown in words; the unparseable message above keeps the stored text, as evidence.
  reversed: (fileName, start, end) =>
    `The billing period on ${fileName} ends before it starts (${isoDateInWords(start)} to ${isoDateInWords(end)}). ${FIX_REVERSED}`,
}

// A stored period date that is a real calendar date in yyyy-mm-dd form. parseLocalDate reads the first ten
// characters and lets the Date constructor roll over (2025-02-30 becomes 2 March), so validity is checked
// here by reading the parts and confirming they survive the round trip unchanged.
function isRealIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(y, mo - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
}

// `resolutions`: T3 reads accepted same_bill resolutions (excluded documents → same_bill_as), and T15 accepted
// exact_duplicate count_once ones (excluded documents → exact_duplicate_of). T10 and T14 extend it.
export function billContributions(
  loc: Location,
  resolutions: CoverageResolution[],
  win: { start: Date; end: Date },
): BillContribution[] {
  // same_bill (T3): documents excluded by an accepted resolution, keyed docId → the document that counts.
  const excludedBy = new Map<string, string>()
  // exact_duplicate count_once (T15): the same, for a copy uploaded under another document type.
  const duplicateOf = new Map<string, string>()
  for (const r of acceptedResolutions(loc, resolutions)) {
    if (r.kind === 'same_bill') for (const id of r.excludedDocIds ?? []) excludedBy.set(`${id}|${r.fuelType}`, r.countedDocId as string)
    if (r.kind === 'exact_duplicate' && r.choice === 'count_once')
      for (const id of r.excludedDocIds ?? []) duplicateOf.set(`${id}|${r.fuelType}`, r.countedDocId as string)
  }
  const DAY = 86400000
  const dayCount = (a: Date, b: Date): number => Math.round((b.getTime() - a.getTime()) / DAY)
  const iso = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // The window as periodFromYearAndEnd returns it: `end` is the last day IN the year, so the exclusive
  // boundary is end + 1 day. Same construction as analyzeCoverage and applyResolutions.
  const winS = new Date(win.start.getFullYear(), win.start.getMonth(), win.start.getDate())
  const winEexcl = new Date(win.end.getFullYear(), win.end.getMonth(), win.end.getDate() + 1)

  // Units per field across CONFIRMED proposals with a value: the same set applyResolutions tests for
  // mixedUnits, so the two cannot disagree on which fields are mixed.
  const unitsByField = new Map<string, Set<string>>()
  loc.source_docs.forEach(d => d.extracted?.forEach(p => {
    if (p.status !== 'confirmed' || p.value == null) return
    if (excludedBy.has(`${d.id}|${p.fuelType}`) || duplicateOf.has(`${d.id}|${p.fuelType}`)) return   // not counted, so it cannot make a field mixed
    const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
    if (!map) return
    const units = unitsByField.get(String(map.amount)) ?? new Set<string>()
    if (p.unit) units.add(p.unit)
    unitsByField.set(String(map.amount), units)
  }))

  const out: BillContribution[] = []
  loc.source_docs.forEach(d => d.extracted?.forEach((p, pi) => {
    if (p.value == null) return
    const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
    if (!map) return

    let endExcl: Date | null = null
    let totalDays: number | null = null
    let inWindowDays: number | null = null
    let share: number | null = null
    let periodProblem: InvalidPeriodKind | null = null
    // T10b: a DELIVERY counts in full when its delivery date is inside the window and not at all otherwise.
    // It is never prorated and has no period, so it never enters the monthly coverage check.
    const deliveryDate = deliveryDateOf(d.document_type, p)
    let deliveredInWindow = false
    if (deliveryDate !== null) {
      if (!isRealIsoDate(deliveryDate)) periodProblem = 'unparseable'
      else {
        const dd = parseLocalDate(deliveryDate)
        deliveredInWindow = dd >= winS && dd < winEexcl
        share = deliveredInWindow ? 1 : 0
      }
    } else if (p.periodStart && p.periodEnd && (!isRealIsoDate(p.periodStart) || !isRealIsoDate(p.periodEnd))) {
      periodProblem = 'unparseable'
    } else if (p.periodStart && p.periodEnd) {
      const start = parseLocalDate(p.periodStart)
      const e = canonicalPeriod(start, parseLocalDate(p.periodEnd)).endExclusive
      const t = dayCount(start, e)
      // Both dates real, and the end falls before the start: the canonical period has no days.
      if (t <= 0) periodProblem = 'reversed'
      if (t > 0) {
        endExcl = e
        totalDays = t
        const ovS = start > winS ? start : winS
        const ovE = e < winEexcl ? e : winEexcl
        inWindowDays = Math.max(0, dayCount(ovS, ovE))
        share = inWindowDays / t
      }
    }

    const sameBillAs = excludedBy.get(`${d.id}|${p.fuelType}`)
    const exactDuplicateOf = duplicateOf.get(`${d.id}|${p.fuelType}`)
    const reason: ContributionReason =
      // T18: a withdrawn document's readings are all set to rejected; the reason says why, not merely that.
      d.withdrawn ? 'withdrawn'
      : p.status !== 'confirmed' ? 'not_confirmed'
      // T10: the customer entered this figure by hand instead; the bill stays as evidence, not counted.
      : activeOverride(loc, map.amount) ? 'manual_override'
      : sameBillAs ? 'same_bill_as'
      : exactDuplicateOf ? 'exact_duplicate_of'
      : (unitsByField.get(String(map.amount))?.size ?? 0) > 1 ? 'mixed_units'
      : periodProblem ? 'invalid_period'
      : deliveryDate !== null ? (deliveredInWindow ? 'delivered' : 'outside_year')
      : totalDays === null ? 'undated'
      : inWindowDays === 0 ? 'outside_year'
      : (inWindowDays as number) < totalDays ? 'prorated'
      : 'counted'

    out.push({
      docId: d.id,
      proposalIndex: pi,
      fuelType: p.fuelType,
      field: map.amount,
      meterLabel: d.meter_label ?? null,
      periodStart: p.periodStart,
      periodEndExclusive: endExcl ? iso(endExcl) : null,
      periodOrigin: deliveryDate !== null ? 'delivery' : periodOriginOf(p),
      totalDays,
      inWindowDays,
      share,
      value: p.value,
      unit: p.unit,
      counted: reason === 'counted' || reason === 'prorated' || reason === 'delivered',
      reason,
      ...(reason === 'invalid_period' && periodProblem ? { periodProblem } : {}),
      ...(reason === 'same_bill_as' && sameBillAs ? { reasonRef: sameBillAs } : {}),
      ...(reason === 'exact_duplicate_of' && exactDuplicateOf ? { reasonRef: exactDuplicateOf } : {}),
      ...(deliveryDate !== null && periodProblem === null ? { deliveryDate } : {}),
      // T9: the original reading and the customer's changes travel with the contribution into workings.
      ...(p.asRead ? { asRead: p.asRead } : {}),
      ...(p.corrections?.length ? { corrections: p.corrections } : {}),
      ...(p.statusLog?.length ? { statusLog: p.statusLog } : {}),
      // T18: who confirmed it, its dates and its vehicle type, and when, travel the same way.
      ...(p.confirmations?.length ? { confirmations: p.confirmations } : {}),
      ...(p.periodConfirmedAt && p.periodConfirmedBy ? { periodConfirmedAt: p.periodConfirmedAt, periodConfirmedBy: p.periodConfirmedBy } : {}),
      ...(p.fleetTypeLog?.length ? { fleetTypeLog: p.fleetTypeLog } : {}),
      ...(d.withdrawn ? { withdrawal: d.withdrawn } : {}),
    })
  }))
  return out
}

// ── T15-fix2: WHAT THE READING ITSELF SAYS WHEN IT IS NOT COUNTED ─────────────────────────────────────────
// A confirmed reading shows its figure and "Confirmed". Where it reaches no total, the line under it says so, so
// "1,200 litres, Confirmed" is never read as counted. Built from billContributions, the same rows the figure is
// folded from, so the line and the figure cannot disagree. Keyed `${docId}:${proposalIndex}`.
//   counted, prorated, delivered   no line (a prorated bill IS counted; the strip shows its share)
//   not_confirmed                  no line (the reading's own badge says it is not confirmed)
//   exact_duplicate_of, same_bill_as, outside_year, manual_override   "Not counted: ..."
//   mixed_units, invalid_period, undated   "Not counted until resolved: ...", with the gate's own instruction
//   counted, but its "uses this fuel" switch is off (stream_off)   "Not counted until resolved: ..."
export function notCountedLines(loc: Location, allResolutions: CoverageResolution[], win: { start: Date; end: Date }): Map<string, string> {
  const out = new Map<string, string>()
  const docOf = (id?: string) => loc.source_docs.find(d => d.id === id)
  const yearText = reportingYearLabel(win).inText
  const sameBillName = (self: SourceDoc | undefined, counted: SourceDoc | undefined): string => {
    if (!counted) return 'another document'
    if (self?.file_name !== counted.file_name) return counted.file_name
    // The same file name on both copies: name the counted one by when it was uploaded, to the minute if both
    // were uploaded on the same day.
    const at = new Date(counted.uploaded_at)
    const sameDay = self?.uploaded_at && dateInWords(new Date(self.uploaded_at)) === dateInWords(at)
    const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
    return `the copy uploaded on ${dateInWords(at)}${sameDay ? ` at ${time}` : ''}`
  }
  for (const c of billContributions(loc, acceptedResolutions(loc, allResolutions), win)) {
    const key = `${c.docId}:${c.proposalIndex}`
    const self = docOf(c.docId)
    let line: string | null = null
    switch (c.reason) {
      case 'exact_duplicate_of': line = EXACT_DUPLICATE_NOT_COUNTED(docOf(c.reasonRef)?.document_type ?? ''); break
      case 'same_bill_as': line = `Not counted: this is the same bill as ${sameBillName(self, docOf(c.reasonRef))}, which is counted.`; break
      case 'outside_year': line = `Not counted: ${c.deliveryDate ? 'delivered' : 'billed'} outside ${yearText}.`; break
      case 'manual_override': line = 'Not counted: you entered this figure by hand instead.'; break
      case 'withdrawn': line = c.withdrawal ? `Not counted: this document was withdrawn by ${c.withdrawal.by.email} on ${isoDateInWords(c.withdrawal.at.slice(0, 10))}.` : 'Not counted: this document was withdrawn.'; break
      case 'mixed_units': line = `Not counted until resolved: the ${FUEL_NAME[c.fuelType] ?? c.fuelType} bills for this site are in different units. ${FIX_UNITS}`; break
      case 'invalid_period': line = c.periodProblem === 'reversed'
        ? `Not counted until resolved: the billing period ends before it starts. ${FIX_REVERSED}`
        : `Not counted until resolved: the billing period could not be read as dates. ${FIX_DATES}`; break
      case 'undated': line = `Not counted until resolved: this bill has no billing period. ${FIX_DATES}`; break
      case 'counted': case 'prorated': case 'delivered':
        if (streamSwitchOff(loc, c.field)) {
          const meta = STREAM_META[FIELD_STREAM[c.field] as DeclarableStream]
          line = `Not counted until resolved: this site is marked as not ${meta.verb === 'use' ? 'using' : 'having'} ${meta.name}. ${FIX_STREAM_OFF(meta.name, 1)}`
        }
        break
    }
    if (line) out.set(key, line)
  }
  return out
}

/**
 * Single source of truth for what a location's activity figures ARE, given its
 * confirmed proposals and any coverage resolutions on file.
 * Pure. Called by the component's write path AND by buildWorkings — so the
 * figure in the total and the figure in the audit trail cannot diverge.
 *
 * T2 (docs/review/design-derived-figures.md): the figure is the FOLD OF billContributions — the sum of
 * each counted bill's value × its own in-window share — then the extrapolation gross-up. So a bill wholly
 * outside the reporting year contributes nothing (rule R1, finding F-09), a straddling bill is prorated
 * automatically by its own days (rule R2), and undated or invalid-period bills are not counted (T1
 * rulings). A stored 'straddle' resolution is IGNORED: the customer's this-year / next-year / prorate
 * choice no longer reaches the figure, and buildWorkings writes no audit row for it.
 */
export interface AppliedField {
  field: keyof Location
  unitField?: keyof Location
  rawSum: number          // sum of confirmed proposals, before any adjustment
  value: number           // the figure actually used
  unit?: string
  adjustment: null | {
    // 'prorate' is automatic (rule R2), not a customer resolution. (The legacy 'duplicate' adjustment is gone
    // in T3: a duplicate resolution is never accepted.)
    kind: 'extrapolate' | 'prorate'
    method: string        // human-readable, flows verbatim into workings
    basis: string         // e.g. "9 of 12 months; ×12/9" | "2024-12-20 to 2025-01-19: 12 of 31 days in reporting year 2024, ×0.387"
    factor: number        // multiplier applied to rawSum (1 = unchanged)
  }
  mixedUnits: boolean     // true → do not write; caller flags for manual review
  fuelTypes: string[]
  quotes: string[]
  docIds: string[]
  filePaths: string[]
  refs: { docId: string; pi: number }[]   // (docId, proposal index) feeding this field — for the write path's mixed-unit flip
  /** T11: the quotes, document ids and paths of the bills that COUNTED toward `value`, the row's source_* fields. The
   *  three lists above are every confirmed bill for the field, whether counted or not. */
  evidence: { quotes: string[]; docIds: string[]; filePaths: string[] }
}

// The method label on a figure prorated by billing days. One string, so the figure's adjustment and the
// provenance note the verifier reads cannot word it two ways.
export const PRORATE_METHOD = 'Prorated by billing days'

export function applyResolutions(loc: Location, allResolutions: CoverageResolution[], winStart: Date, winEnd: Date): Record<string, AppliedField> {
  const yearText = reportingYearLabel({ start: winStart, end: winEnd }).inText
  // Only ACCEPTED resolutions reach a figure (T3). A legacy duplicate or straddle, or an invalid one, does not.
  const resolutions = acceptedResolutions(loc, allResolutions)
  const contributions = billContributions(loc, resolutions, { start: winStart, end: winEnd })
  const isoDay = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // The last covered day of a contribution, for the basis text: the exclusive end minus one day.
  const lastCoveredDay = (endExclusive: string): string => {
    const e = parseLocalDate(endExclusive)
    return isoDay(new Date(e.getFullYear(), e.getMonth(), e.getDate() - 1))
  }

  // 1. Gather confirmed proposals per target field (via the shared fieldFor join key). Provenance — quotes,
  //    document ids, file paths, refs — is unchanged from before T2: every confirmed proposal with a value.
  //    Per-bill provenance (which bills counted, and why the others did not) arrives with T5.
  type Acc = { field: keyof Location; unitField?: keyof Location; documentType: string; rawSum: number; units: Set<string>; fuelType: string; fuelTypes: Set<string>; quotes: string[]; docIds: string[]; filePaths: string[]; refs: { docId: string; pi: number }[] }
  const acc: Record<string, Acc> = {}
  loc.source_docs.forEach(d => {
    d.extracted?.forEach((p, pi) => {
      if (p.status !== 'confirmed' || p.value == null) return
      const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
      // T10: an overridden field is the customer's typed figure, not the documents', so it has no entry here.
      if (!map || activeOverride(loc, map.amount)) return
      const key = String(map.amount)
      if (!acc[key]) acc[key] = { field: map.amount, unitField: map.unit, documentType: d.document_type, rawSum: 0, units: new Set(), fuelType: p.fuelType, fuelTypes: new Set(), quotes: [], docIds: [], filePaths: [], refs: [] }
      acc[key].rawSum += p.value
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
    // THE FOLD: each counted bill contributes its value × its own in-window share. Nothing else reaches
    // the figure — not a bill outside the year, not an undated or invalid-period bill, not a stored
    // straddle choice, not a bill excluded as the same bill as another.
    const counted = contributions.filter(c => String(c.field) === key && c.counted)
    // T11 (problem 1): what the row claims as its evidence is the bills that counted, and only those. A bill outside the
    // year, the same bill as another, an exact duplicate, mixed units or undated is a contribution not counted: the row
    // lists it there, with its reason, and never as a source of the figure. (Withdrawn, not confirmed and overridden
    // bills never reach `acc`.) a.docIds stays every confirmed bill: it is what makes the field document-backed (T5).
    const evidence = { quotes: [] as string[], docIds: [] as string[], filePaths: [] as string[] }
    for (const c of counted) {
      const d = loc.source_docs.find(x => x.id === c.docId)
      const p = d?.extracted?.[c.proposalIndex]
      if (!d || !p) continue
      if (p.sourceQuote) { evidence.quotes.push(p.sourceQuote); evidence.filePaths.push(d.file_path) }
      if (!evidence.docIds.includes(d.id)) evidence.docIds.push(d.id)
    }
    // EXTRAPOLATION gross-up applies AFTER the fold, PER METER (T3 ruling): each meter's counted sum is
    // grossed up by that meter's own acknowledged coverage. An extrapolate resolution names its meter
    // (absent or null = the default single meter).
    const meters = new Map<string | null, number>()
    for (const c of counted) meters.set(c.meterLabel, (meters.get(c.meterLabel) ?? 0) + c.value * (c.share ?? 0))
    const extrs: { meter: string | null; r: CoverageResolution }[] = []
    let grossed = 0
    for (const [meter, sum] of meters) {
      // Matched on document type too (T5): accepted resolutions without one exist only where the fuel has
      // a single document type at this location, so `null` cannot reach a second group.
      const r = resolutions.find(x => x.kind === 'extrapolate' && x.fuelType === a.fuelType && (x.meterLabel ?? null) === meter
        && (x.documentType == null || x.documentType === a.documentType) && (x.fleetType ?? null) === fleetTypeOfField(key))
      if (r) extrs.push({ meter, r })
      grossed += sum * (r && r.monthsCovered ? 12 / r.monthsCovered : 1)
    }
    const value = mixedUnits ? a.rawSum : grossed

    const prorated = counted.filter(c => c.reason === 'prorated')
    let adjustment: AppliedField['adjustment'] = null
    if (extrs.length > 0 || prorated.length > 0) {
      // basis states the REAL arithmetic, in application order (per-bill proration, THEN extrapolate).
      const meterTag = (m: string | null) => (m == null ? '' : `${m}: `)
      const parts: string[] = prorated.map(c =>
        `${meterTag(c.meterLabel)}${isoDateInWords(c.periodStart)} to ${isoDateInWords(lastCoveredDay(c.periodEndExclusive as string))}: ${c.inWindowDays} of ${c.totalDays} days in ${yearText}, ×${(c.share ?? 0).toFixed(3)}`)
      for (const e of extrs) parts.push(`${meterTag(e.meter)}${resolutionBasis(e.r)}`)
      // primary drives kind + method: extrapolate (the gross-up) if present, else proration.
      const kind: NonNullable<AppliedField['adjustment']>['kind'] = extrs.length > 0 ? 'extrapolate' : 'prorate'
      const method = kind === 'prorate' ? PRORATE_METHOD : extrs.map(e => `${meterTag(e.meter)}${resolutionMethod(e.r)}`).join('; ')
      adjustment = { kind, method, basis: parts.join('; then '), factor: a.rawSum > 0 ? value / a.rawSum : 1 }
    }

    out[key] = { field: a.field, unitField: a.unitField, rawSum: a.rawSum, value, unit, adjustment, mixedUnits, fuelTypes: [...a.fuelTypes], quotes: a.quotes, docIds: a.docIds, filePaths: a.filePaths, refs: a.refs, evidence }
  }
  // used_none (T3 ruling "all documents rejected"): a field confirmed as zero, with no confirmed document,
  // is written as 0, so a figure left from earlier bills cannot stand. A confirmed document outranks it.
  for (const r of resolutions) {
    // A typed figure supersedes an earlier "used none" (T10): confirming none and then entering a figure
    // must not silently zero the figure the customer entered.
    if (r.kind !== 'used_none' || !r.field || out[r.field] || activeOverride(loc, r.field)
      || Number((loc as unknown as Record<string, unknown>)[r.field] ?? 0) > 0) continue
    out[r.field] = { field: r.field as keyof Location, rawSum: 0, value: 0, adjustment: null, mixedUnits: false,
      fuelTypes: [r.fuelType], quotes: [], docIds: [], filePaths: [], refs: [], evidence: { quotes: [], docIds: [], filePaths: [] } }
  }
  return out
}

/**
 * The inventory's locations with every document-backed figure DERIVED from its documents, not read from
 * the stored field (T4). Feed this, never `inventory.locations`, to calcInventory, pctEstimated,
 * findUnpriceableLocations, buildWorkings and buildFactorEditions: they all read figures off the
 * locations they are given, so a stored field the page failed to refresh reaches every total unless the
 * locations are derived first. With all of them fed the same derived locations, totals equal the sum of
 * the workings rows by construction.
 *
 * WHY THE STORED FIELD CANNOT BE TRUSTED. It is a cache of applyResolutions that only two page handlers
 * refresh (confirming a proposal, adding a resolution). Removing a document, un-confirming a proposal and
 * changing the reporting year or year end all leave it describing evidence that is no longer there.
 *
 * PER FIELD (rulings in docs/review/design-derived-figures.md section 10):
 *   - At least one confirmed proposal: the figure is applyResolutions' fold of the counted contributions,
 *     grossed up per meter. Mixed units: 0, because no mixed-units contribution is counted (T1); the
 *     export-blocking mixed_units issue says why (T3). A used_none confirmation: 0.
 *   - No confirmed proposal but at least one PENDING one (extracted, needs_manual_review) with a value:
 *     document-backed, so 0. The pending-proposal gate already blocks export. (T4 ruling.)
 *   - Proposals all rejected, or none: the stored value stands, as the customer's typed figure
 *     (section 3.3; the T3 all-rejected ruling).
 * A proposal with no value backs nothing (T1: it has no contribution row).
 *
 * Since T7 the page never writes a document-backed figure (locations_data is saved raw, lib/ghg/savePayload.ts),
 * so a stored value on an all-rejected field, or on a location whose last document was removed, is only ever
 * the customer's typed figure.
 *
 * Pure: locations in, new locations out. Units are taken from the documents where a figure is derived.
 */
export function deriveLocations(inventory: {
  locations: Location[]
  reporting_year: number
  fiscal_year_end_month?: number
  coverage_resolutions?: CoverageResolution[]
}): Location[] {
  const win = periodFromYearAndEnd(inventory.reporting_year, inventory.fiscal_year_end_month ?? 12)
  const resolutions = inventory.coverage_resolutions ?? []
  return inventory.locations.map(loc => {
    const next: Location = { ...loc }
    const set = (field: keyof Location, v: unknown) => { (next as unknown as Record<string, unknown>)[String(field)] = v }
    // Pending first: a field with a pending proposal is document-backed even when nothing is confirmed.
    loc.source_docs.forEach(d => d.extracted?.forEach(p => {
      if (p.value == null || (p.status !== 'extracted' && p.status !== 'needs_manual_review')) return
      const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
      // T10: an overridden field keeps the typed figure, whatever its documents say.
      if (map && !activeOverride(loc, map.amount)) set(map.amount, 0)
    }))
    // Then every field applyResolutions covers (any confirmed proposal, or a used_none confirmation).
    for (const a of Object.values(applyResolutions(loc, resolutions, win.start, win.end))) {
      set(a.field, a.mixedUnits ? 0 : a.value)
      if (!a.mixedUnits && a.unitField && a.unit != null) set(a.unitField, a.unit)
    }
    return next
  })
}

/**
 * deriveLocations for a STORED ghg_inventories row (T7). locations_data is saved RAW: a document-backed
 * field holds only what was typed (usually 0), never its figure (T7 ruling). So every reader of a stored
 * row that looks at a figure must derive first, or a figure that comes from bills reads as 0. Readers:
 * the prior-year summary (GHG page) and the trends completeness check (lib/ghg/loadSeries.ts). Scope 3
 * Cat 3 may not import the engine, so it reads priced streams from the saved workings instead
 * (lib/scope3/cat3Inputs.ts).
 * Returns the stored value unchanged when it is not an array, or when deriving throws on a malformed row,
 * so each reader's own "no location data" or "cannot evaluate" handling still applies. An old row
 * without source_docs on a location is read as having no documents.
 */
export function deriveStoredLocations(row: {
  locations_data: unknown; reporting_year: number; fiscal_year_end_month?: number | null; coverage_resolutions?: unknown
}): unknown {
  if (!Array.isArray(row.locations_data)) return row.locations_data
  try {
    const locations = (row.locations_data as Location[]).map(l => ({ ...l, source_docs: Array.isArray(l?.source_docs) ? l.source_docs : [] }))
    return deriveLocations({
      locations, reporting_year: row.reporting_year, fiscal_year_end_month: row.fiscal_year_end_month ?? 12,
      coverage_resolutions: Array.isArray(row.coverage_resolutions) ? row.coverage_resolutions as CoverageResolution[] : [],
    })
  } catch {
    return row.locations_data
  }
}

/**
 * How many documents back a field, by the same rule deriveLocations uses (T4 ruling): a document counts
 * when it holds a confirmed or pending proposal with a value for the field. A rejected proposal does not.
 * Above 0, the field's figure is derived from its documents, so the page shows it read-only with "From N
 * documents" (section 3.3, T7 ruling); at 0, the field is the customer's typed figure.
 */
export function documentsBacking(loc: Location, field: keyof Location): number {
  const ids = new Set<string>()
  loc.source_docs.forEach(d => d.extracted?.forEach(p => {
    if (p.value == null || p.status === 'rejected') return
    if (fieldFor(d.document_type, p.fuelType, p.fleetType)?.amount === field) ids.add(d.id)
  }))
  return ids.size
}

// Provenance stamp attached to a workings row so the verifier can trace a figure back to its bills.
// concierge = read verbatim off confirmed bills; concierge-extrapolated = grossed up for a coverage
// gap (number is estimated, quotes are the underlying bills); manual = not concierge-read.
interface Provenance {
  source_quotes?: string[]
  source_doc_ids?: string[]
  source_file_paths?: string[]
  // concierge-prorated (T2): read off confirmed bills, with at least one bill apportioned to the reporting
  // year by its own billing days. ALLOCATED, NOT ESTIMATED: every unit traces to a bill.
  entry_method: 'manual' | 'concierge' | 'concierge-prorated' | 'concierge-extrapolated'
  extrapolation_note?: string
  // The per-bill day arithmetic behind a concierge-prorated figure. Separate from extrapolation_note,
  // which the verifier page reads as an estimate.
  proration_note?: string
  // T5: every bill for this field and what became of it: counted, prorated, or not counted and why
  // (outside the year, the same bill as another, undated, invalid period, mixed units, not confirmed).
  // Stored in workings, so the verifier page and the PDF never recompute it.
  contributions?: BillContribution[]
  // T10: the reason this document-backed figure was entered by hand instead, with who and when.
  manual_override?: { reason: string; at: string; by: { userId: string; email: string } }
  // T18: on a typed figure's row, who entered the figure last and when, and every entry for it in order.
  entered_by?: { userId: string; email: string }
  entered_at?: string
  typed_entries?: TypedEntry[]
  // T18: on a reading's own unpriced row, the reading whose typed figure a unit change cleared, with who and when.
  reading_cleared?: UnpricedLine['reading']
  // T18: earlier overrides of this field the customer removed ("Use the bills instead"), with the reason they gave,
  // who entered and who removed each, and when, in order.
  manual_overrides_removed?: { reason: string; at: string; by: { userId: string; email: string }; removedAt: string; removedBy: { userId: string; email: string } }[]
}

// Document-backed fields that get a zero row when every confirmed bill is silently excluded (T5 ruling).
// The source labels match the priced rows' labels. renewable_electricity_kwh is not an emissions line.
const ZERO_ROW_FIELDS: { field: keyof Location; source: string; scope: number; unitField?: keyof Location; unit: string }[] = [
  { field: 'natural_gas_amount', source: 'Natural gas', scope: 1, unitField: 'natural_gas_unit', unit: '' },
  { field: 'propane_amount', source: 'Propane', scope: 1, unitField: 'propane_unit', unit: '' },
  { field: 'diesel_stationary_amount', source: 'Diesel (stationary)', scope: 1, unitField: 'diesel_stationary_unit', unit: '' },
  { field: 'gasoline_amount', source: 'Gasoline (mobile)', scope: 1, unitField: 'gasoline_unit', unit: '' },
  { field: 'diesel_mobile_amount', source: 'Diesel (mobile)', scope: 1, unitField: 'diesel_mobile_unit', unit: '' },
  // FI9 diff 4: fleet-fuel bills land on the vehicle-type fields once their type is chosen.
  ...FLEET_FIELDS.map(f => ({ field: f.amount, source: f.source, scope: 1, unitField: f.unit, unit: '' })),
  { field: 'electricity_kwh', source: 'Electricity', scope: 2, unit: 'kWh' },
]

function buildWorkings(locations: Location[], gwpVersion: GwpVersion = 'AR6', year: number = 2024, resolutions: CoverageResolution[] = [], fiscalYearEndMonth: number = 12, ctx: SelectionContext = {}, locationLog: readonly LocationEvent[] = []) {
  const rows: any[] = []
  const win = periodFromYearAndEnd(year, fiscalYearEndMonth)
  // T3c: one selection context for every row: the reporting window, prepared on ctx.preparedOn (today by default).
  const sel = selectionFor(year, fiscalYearEndMonth, ctx)
  // Screen abbreviations for the combined-factor display, matching what renderStep4 showed (gal / L);
  // every other unit (mcf, kg, therms, mmbtu…) passes through unchanged. emission_factor (the gas split)
  // is UNTOUCHED — the VERIFIER PAGE depends on it: app/verify/[token] renders emission_factor, and its
  // WorkingRow type has no emission_factor_display member at all, so the split string is the only
  // factor a verifier sees. emission_factor_display is the dashboard's cell and is display-only.
  //   (This comment said "the CSV / verifier path" until 14 Aug 2026. The CSV half was false —
  //   generateExport emits organisation, results, methods and a location breakdown, and NO workings
  //   rows whatever, so it reads neither field.)
  // 'kwh' -> 'kWh' so a DEFRA district-heat row renders the unit the way DEFRA writes it, and the way
  // the electricity rows beside it already do. 'mmbtu' is deliberately NOT prettified to 'MMBtu' here:
  // it is the pre-existing rendering on every stored US steam snapshot, and changing it would make
  // saved workings differ from freshly computed ones for no gain in correctness.
  // T18 diff 4: every other unit as unitLabel writes it ("GJ", "Mcf", "MMBtu"), never as stored ("gj").
  const abbrevUnit = (u: string) => u === 'gallons' ? 'gal' : (u === 'litres' || u === 'liters') ? 'L' : unitLabel(u)
  // RECOMPUTABLE, NOT TIDY — and this is the whole point of a workings table. toFixed(3) printed a
  // factor of 1.9316576 as "1.932", so a verifier retyping the row got 231,840 kg where we stated
  // 231,798.9: a 41 kg divergence on one line, and EVERY priced row failed the same way. A workings
  // table a verifier cannot reproduce is not evidence, it is decoration.
  // toPrecision(10) strips float artefacts (1.9316576000000002); String() then emits the shortest
  // form that round-trips, so the displayed factor multiplies back to the displayed result.
  const efDisplay = (x: number) => String(Number(x.toPrecision(10)))
  // ── IS THIS FACTOR A COMBINED CO2e FIGURE, OR A GAS SPLIT? ───────────────────────────────────
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
  //
  // ── ONE PLACE, TWO CALLERS, AND THE SECOND ONE IS WHY THIS IS A FUNCTION ──────────────────────
  // This lived inline in pushFuel, which priced every Scope 1 stream. The Scope 2 steam row did not
  // call pushFuel and hardcoded `gwp_basis: GWP_AS_PUBLISHED` instead — a SECOND answer to the same
  // question, arrived at by assertion, and the wrong one: EPA Table 7 publishes a gas split, so
  // as-published claimed the publisher had combined gases it had in fact listed separately (and that
  // we had dropped). Returning the three provenance cells TOGETHER means no row can state a factor
  // and a basis that disagree about that same factor — the question is asked of the factor, once,
  // wherever the factor is used.
  const factorCells = (ef: CombustionEF, unit: string) => {
    const combinedCo2e = ef.ch4 === 0 && ef.n2o === 0
    const gwp = GWP[gwpVersion]
    return {
      // T18 diff 4: the unit as unitLabel writes it, and no em dash.
      emission_factor: combinedCo2e
        ? `CO₂e ${ef.co2} kg/${unitLabel(unit)}, CH₄ and N₂O included`
        : `CO2 ${ef.co2}, CH4 ${ef.ch4}, N2O ${ef.n2o} kg/${unitLabel(unit)}`,
      emission_factor_display: `${efDisplay(ef.co2 + ef.ch4 * gwp.CH4_fossil + ef.n2o * gwp.N2O)} kg CO₂e/${abbrevUnit(unit)}`,
      gwp_basis: combinedCo2e ? GWP_AS_PUBLISHED : gwpVersion,
    }
  }
  // `convNote` records a convert-then-apply step (fuel oil in litres, steam in GJ) so the workings
  // show entered → conversion → factored rather than a number the reviewer cannot reproduce.
  // `stream` TAGS THE ROW WITH THE DECLARABLE STREAM IT SATISFIES, and that tag is what the
  // declaration loop below counts. It is not decoration: it is how "this stream produced a priced row"
  // becomes an OBSERVED FACT rather than a second copy of the pricing condition. See the loop's header.
  // ⚠️ TAKES THE FACTOR KEY, NOT THE FACTOR, and looks it up itself. That is what makes the row's
  // derivation note and its number provably the same fuel: passing both separately would let a row
  // print gas/diesel oil's arithmetic beside motor gasoline's factor, and nothing would catch it.
  //
  // ── ACTIVITY IS WHAT THE CUSTOMER ENTERED. THE FACTOR MOVES TO MEET IT. ──────────────────────────
  // `entered` / `enteredUnit` are the figure and unit off the form; `pricedIn` is that figure
  // converted to the unit the published factor is per, and it is what actually prices the row.
  //
  // Until 14 Aug 2026 the CONVERTED figure went into the activity column: a French site that entered
  // 1,000 litres of heating oil read "264.17205 gallons", with the entry demoted into the note. The
  // activity column is the first thing a verifier reads to confirm what the company consumed, and it
  // was showing an intermediate the company never saw. Six jurisdictions were affected — every metric
  // one, plus a US site that chose litres — because fuel-oil factors are stored per US gallon.
  //
  // ⚠️ THE FACTOR HAD TO BE RESCALED IN THE SAME CHANGE, and this is the part that is easy to miss.
  // Showing 1,000 litres beside a per-GALLON factor would leave the row UNREPRODUCIBLE: 1000 ×
  // 10.21468899 = 10.2147 t against a stated 2.6984 t, wrong by exactly L_PER_GAL. So the displayed
  // factor is scaled onto the entered unit by the same ratio the activity was, and `entered ×
  // displayed = result` holds again. calcGas still prices off the UNSCALED factor and the converted
  // amount, so no figure moves — this is presentation, and the note carries the conversion.
  //   Section M asserts that reconciliation, but note that its fixtures never exercised a converted
  // row (M1 CA gas, M2 steam already in mmbtu, M3 EU gas), which is why the old shape survived.
  const pushFuel = (loc: Location, stream: DeclarableStream, source: string, scope: number, entered: number, enteredUnit: string, efKey: string, prov?: Provenance, field?: keyof Location) => {
    // FI2: the value AND the table that supplied it. The row cites that table, never the location's country.
    // `picked.factor` is per unit ENTERED: where the table prints another unit of the same quantity, pickEF has already
    // converted exactly, so the displayed factor × the entered activity is the result, and the note states the step.
    const picked = pickEF(loc, efKey as keyof typeof EF, sel)
    const ef = picked.factor
    const g = calcGas(ef, entered, gwpVersion)
    const efShown = ef
    // Notes, joined: the exact conversion (FI2), the derivation of a derived table value (EU), where in EPA's Table 1 or
    // NGA's Energy - Scope 1 sheet a US or AU value is printed (FI2 diff 3 and follow-up), and the calorific basis of a NZ gas factor (ruling R4). Each note describes a
    // value in THAT table, read under the key the table holds, so it applies only to a value that table supplied.
    const fromTable = picked.publisher?.jurisdiction
    const heldKey = picked.key ?? efKey
    // FI5: the unit change that produced a typed figure is the first step on its row, then any conversion to the
    // publisher's unit. Both are the row's conversion_note.
    const unitChange = field ? unitChangeBehind(loc, field, entered, enteredUnit) : undefined
    const conversion_note = [unitChange ? unitChangeNote(unitChange) : '', picked.conversion ? conversionNote(entered, picked.conversion) : '']
      .filter(Boolean).join(' ') || undefined
    // FI9: a fleet row's note is its own (publisher, row used, why), and replaces the table notes below.
    // T3d: a value from an older held edition says where THAT edition prints it, in place of the newest edition's note.
    const editionNote = picked.edition?.key != null ? EDITION_VALUE_NOTE[picked.edition.dataset]?.[picked.edition.key]?.[heldKey] : undefined
    const note = picked.fleet ? [conversion_note, picked.fleet.note].filter(Boolean).join(' · ') : [conversion_note,
      fromTable === 'EU' ? euDerivationNote(loc, heldKey) : '',
      editionNote ?? '',
      fromTable === 'AU' && !editionNote ? auPublishedNote(loc, heldKey) : '',
      fromTable === 'US' && !editionNote ? US_PUBLISHED_NOTE[heldKey] : '',
      fromTable === 'UK' && !editionNote ? UK_PUBLISHED_NOTE[heldKey] : '',
      fromTable === 'CA' && heldKey === 'natural_gas_gj' ? `${(picked.heat && CA_GAS_HEAT_TEXT[picked.heat.key as number]?.note) || CA_GAS_GJ_NOTE}${picked.heat ? ` Heat content: ${picked.heat.basis}` : ''}` : '',
      fromTable === 'NZ' && heldKey.startsWith('natural_gas_') ? NZ_GAS_BASIS_NOTE : ''].filter(Boolean).join(' · ')
    // `factor_vintage` IS THE EDITION LABEL, NOT THE REPORTING YEAR — the same distinction section O
    // pinned for the NZ T&D row after it stamped the inventory year over a 2025 factor. Since T3c every
    // factor row, combustion and grid alike, takes it from the edition selectEdition chose for the window
    // (editionCells), so "which edition priced this line" has one answer on every row.
    //   ONE DECLARATION, shared with ghg_inventories.factor_editions — see COMBUSTION_EDITION. A
    // separate source here would let the workings row and the stored edition map name two different
    // publications for one figure, which is precisely the disagreement factor_editions exists to end.
    rows.push({ location: loc.name || 'Location', stream, source, scope, activity_data: entered, activity_unit: enteredUnit,
      ...factorCells(efShown, enteredUnit),
      // ⚠️ THE `?? undefined` IS A STATEMENT, NOT A GUARD. A row can only be pushed here for a
      // location that priced, and a location whose country resolves to no jurisdiction cannot
      // price, so the null arm is unreachable. It is spelled out rather than asserted because a
      // factor_vintage of 'US EPA 2024' on a site that is not American is exactly the false claim
      // this change removes, and `!` would let a future edit reintroduce it silently.
      // FI2: cited from the table that supplied the value. Where the US fallback supplied it (removed in FI2's second
      // diff), the row now says US EPA rather than the location's own publisher.
      ef_source: picked.publisher?.publisher ?? combustionSource(loc),
      // FI2: the key the value was read under, in the table ef_source names, so a verifier can find the figure; and,
      // where the unit entered differs, the exact conversion to it (conversion_factor = held units per unit entered).
      factor_key: heldKey,
      // FI10: the MfE use class that selected the table, on every row it priced.
      ...(fromTable === 'NZ' && !picked.fleet ? { factor_variant: nzUseClassVariant(loc) } : {}),
      // FI9: the vehicle type and fuel of a fleet row, and, for a US road line with no miles, that methane and nitrous
      // oxide are not counted (a priced row; it does not block export on its own).
      ...(picked.fleet ? { fleet_type: picked.fleet.type, fleet_fuel: picked.fleet.fuel } : {}),
      ...(picked.fleet?.notCounted ? { ch4_n2o: 'not_counted', ch4_n2o_note: picked.fleet.notCounted } : {}),
      ...(conversion_note ? { conversion_note } : {}),
      ...(picked.conversion ? { conversion_factor: picked.conversion.toPerFrom } : {}),
      ...(unitChange ? { unit_change: unitChange } : {}),
      // T3c: the SELECTED edition, with its rule, basis and dates. A provisional (R19) row says so in its note too.
      ...(picked.edition ? editionCells(picked.edition) : picked.publisher?.edition ? { factor_vintage: picked.publisher.edition } : vintageOf(COMBUSTION_EDITION, loc)),
      result_tco2e: g.total, ...(note || picked.edition?.provisional ? { note: [note, picked.edition?.provisional ? picked.edition.basis : ''].filter(Boolean).join(' · ') } : {}), ...(prov ?? {}) })
  }
  // NO STALE-FIELD FALLBACK (T5). Workings are built from derived locations, so every document-backed
  // figure is the fold of its counted bills whatever the stored field says. Idempotent, so a caller that
  // already passes deriveLocations output (T4) gets the same rows.
  const derivedLocations = deriveLocations({ locations, reporting_year: year, fiscal_year_end_month: fiscalYearEndMonth, coverage_resolutions: resolutions })
  for (const loc of derivedLocations) {
    // Decided BEFORE any row is emitted, and with the same helper calcInventory uses. A location
    // the total excluded must not also appear here with priced rows — the audit trail would then
    // show workings for emissions no total contains. One row stating the exclusion instead, with
    // result_tco2e null, following the 'undeclared' row below: an absence never renders as 0.
    const blocked = unpriceableReason(loc, gwpVersion, year)
    if (blocked) {
      const base = { location: loc.name || 'Location', source: 'All streams at this location', scope: 0,
        activity_data: 0, activity_unit: NOT_PROVIDED, emission_factor: NOT_PROVIDED, emission_factor_display: NOT_PROVIDED,
        ef_source: NOT_PROVIDED, gwp_basis: 'excluded', result_tco2e: null, entry_method: 'excluded' } as const
      if (blocked.kind === 'country') {
        // ⚠️ THE DECLARATION IS THE STATE'S OWN LITERAL, NOT 'unpriceable' WITH A PAYLOAD.
        // lib/ghg/declarationStates.test.ts reads this file and the two pages from disk and fails
        // unless every literal the engine can emit is NAMED by a branch on every surface. Three
        // literals force three named branches; one literal plus a field would let a surface render
        // all three identically and still pass, which is how 'unpriceable' and
        // 'declared_unquantified' each shipped rendering as ordinary rows.
        //
        // ⚠️ AND THEY ARE WRITTEN OUT, NOT INTERPOLATED, WHICH IS WHY THIS IS A SWITCH AND NOT ONE
        // PUSH. The guard greps for `declaration: '<literal>'`; `declaration: refusal.state` is
        // correct TypeScript and invisible to it, so all three states would have shipped with no
        // surface obliged to name them. The first draft of this block did exactly that and the
        // guard caught it. The repetition is the point: it is what makes the states greppable.
        const cells = { ...base, country_refusal: blocked.refusal,
          // ⚠️ NO PREFIX. The sentence already ends "Nothing from this location is included in any
          // total on this report", and gwp_basis on this same row reads 'excluded'. That was three
          // statements of one fact in one row. The unit-mismatch row below KEEPS its prefix,
          // because its message does not say it.
          note: countryRefusalText(blocked.refusal, 'verifier', locationHasFigures(loc)) }
        switch (blocked.refusal.state) {
          case 'country_not_set':       rows.push({ ...cells, declaration: 'country_not_set' }); break
          case 'country_not_listed':    rows.push({ ...cells, declaration: 'country_not_listed' }); break
          case 'country_not_supported': rows.push({ ...cells, declaration: 'country_not_supported' }); break
        }
      }
      continue
    }
    // First row index for THIS location. The declaration loop at the end of the iteration reads back
    // rows.slice(locRowStart) to see which streams actually priced. Captured after the unpriceable
    // `continue` above, so an excluded location keeps its single exclusion row and gains no others.
    const locRowStart = rows.length
    // applyResolutions is the single source of the figure AND its provenance/method, so the number
    // in the row and the claim in the audit trail cannot diverge (that divergence was the SEV 0 bug).
    const applied = applyResolutions(loc, resolutions, win.start, win.end)
    // Every bill for this location and what became of it, the same rows applyResolutions folded.
    const contributions = billContributions(loc, acceptedResolutions(loc, resolutions), win)
    const contributionsFor = (field: keyof Location) => contributions.filter(c => String(c.field) === String(field))
    // T18: the typed entries behind a row whose figure is typed (no document backs it, or it is overridden): the
    // latest entry as entered_by and entered_at, and the history. Nothing for a figure read from documents.
    const typedOf = (...fields: (keyof Location)[]): Pick<Provenance, 'entered_by' | 'entered_at' | 'typed_entries'> => {
      const typedFields = fields.filter(f => isTypedFigure(loc, f)).map(String)
      const h = (loc.typed_entries ?? []).filter(e => typedFields.includes(e.field))
      const last = h.at(-1)
      return last ? { entered_by: last.by, entered_at: last.at, typed_entries: h } : {}
    }
    // Figure for a field: the location's own value, which deriveLocations has already set from the
    // documents for every document-backed field. A typed figure is used only where no document backs it.
    const figure = (field: keyof Location): number => (loc as unknown as Record<string, number>)[String(field)]
    // Provenance stamp from the applied field. A field with confirmed documents is never 'manual' (T5),
    // whether or not its bills carried a quote. An adjustment on file → prorated or extrapolated stamp.
    // Every row for a document-backed field carries its contributions, including documents not counted.
    const provOf = (field: keyof Location): Provenance => {
      const a = applied[String(field)]
      const contrib = contributionsFor(field)
      // T18: an override removed from this field stays on its row, whether the row is now from the bills or typed.
      const removed = (loc.manual_overrides_removed ?? []).filter(o => o.field === String(field))
        .map(o => ({ reason: o.reason, at: o.at, by: o.by, removedAt: o.removedAt, removedBy: o.removedBy }))
      const withContrib = (p: Provenance): Provenance => ({
        ...p, ...(contrib.length ? { contributions: contrib } : {}), ...(removed.length ? { manual_overrides_removed: removed } : {}) })
      // T10: entered by hand instead of from its documents. Manual, with the reason, who and when; the
      // documents are listed as contributions not counted, reason manual_override.
      const override = activeOverride(loc, field)
      // T18: a fleet figure's miles and model year are typed with it and priced with it, so their entries go on its row.
      const fleet = FLEET_FIELDS.find(f => f.amount === field)
      const typed = typedOf(field, ...(fleet?.miles ? [fleet.miles] : []), ...(fleet?.modelYear ? [fleet.modelYear] : []))
      if (override) return withContrib({ entry_method: 'manual', manual_override: { reason: override.reason, at: override.at, by: override.by }, ...typed })
      if (!a || a.docIds.length === 0) return withContrib({ entry_method: 'manual', ...typed })
      // T11: the row's sources are the bills that counted (a.evidence); the others are in its contributions, with reasons.
      const { quotes, docIds, filePaths } = a.evidence
      if (a.adjustment && a.adjustment.kind === 'prorate') {
        return withContrib({ source_quotes: quotes, source_doc_ids: docIds, source_file_paths: filePaths,
          entry_method: 'concierge-prorated', proration_note: a.adjustment.basis })
      }
      if (a.adjustment) {
        return withContrib({ source_quotes: quotes, source_doc_ids: docIds, source_file_paths: filePaths,
          entry_method: 'concierge-extrapolated', extrapolation_note: `${a.adjustment.method} — ${a.adjustment.basis}` })
      }
      return withContrib({ source_quotes: quotes, source_doc_ids: docIds, source_file_paths: filePaths, entry_method: 'concierge' })
    }
    // FI1: every combustion line, from the same list calcLocation prices. A line with a factor is a priced
    // row, as before. A line with none is ONE 'unpriced' row: its activity as entered, result null, the
    // message, and its stream tag, so the declaration loop below does not also call the stream unanswered.
    // The entered figure is the derived one (T5): figure() and line.entered read the same derived location.
    // Fuel oil reports the figure AS ENTERED with its own unit, and the conversion to the factor's unit as
    // the note, so all three steps are on one row (pickEF converts to the publisher's unit, FI2).
    const unpricedAll = unpricedLines(loc, gwpVersion, sel)
    // Combustion and steam lines by field. The electricity edition lines are read by source below (three per field).
    // T18: a reading's own line (a cleared typed figure) never stands in for its field's row; it is a row of its own.
    const unpriced = new Map(unpricedAll.filter(u => u.stream !== 'electricity' && !u.reading).map(u => [String(u.field), u]))
    const pushUnpriced = (u: UnpricedLine, prov?: Provenance, scope = 1) => rows.push({ location: loc.name || 'Location', stream: u.stream,
      source: u.source, scope, activity_data: u.amount, activity_unit: u.unit, emission_factor: NOT_PROVIDED,
      emission_factor_display: NOT_PROVIDED, ef_source: NOT_PROVIDED, gwp_basis: 'unpriced', result_tco2e: null,
      declaration: 'unpriced', entry_method: prov?.entry_method ?? 'manual',
      unpriced: { reason: u.reason, field: String(u.field), factor_key: u.factorKey, publisher: u.factor.publisher, value: null },
      note: `NOT PRICED: ${u.message}`, ...(u.reading ? { reading_cleared: u.reading } : {}), ...(prov ?? {}) })
    for (const u of unpricedAll) if (u.reading) pushUnpriced(u, { entry_method: 'concierge' }, u.stream === 'electricity' ? 2 : 1)
    for (const line of combustionLines(loc)) {
      const u = unpriced.get(String(line.field))
      if (u) { pushUnpriced(u, provOf(line.field)); continue }
      pushFuel(loc, line.stream, line.source, 1, figure(line.field), line.enteredUnit, line.efKey, provOf(line.field), line.field)
    }
    if (hasRefrigerantLine(loc)) {
      const ref_gwp = refrigerantGwp(loc.refrigerant_type, gwpVersion)
      const u = unpriced.get('refrigerant_purchased_kg')
      if (u || ref_gwp === null) pushUnpriced(u as UnpricedLine, { entry_method: 'manual', ...typedOf('refrigerant_purchased_kg') })
      else rows.push({ location: loc.name || 'Location', stream: 'refrigerants', source: `Refrigerant (${loc.refrigerant_type})`, scope: 1, activity_data: loc.refrigerant_purchased_kg, activity_unit: 'kg', emission_factor: `GWP₁₀₀ ${ref_gwp}`, ef_source: EF_SOURCES[`gwp_${gwpVersion.toLowerCase()}` as 'gwp_ar6'], gwp_basis: gwpVersion, quantification_method: 'Recharge quantity treated as emitted (IPCC Tier 1 simplified material balance)', result_tco2e: loc.refrigerant_purchased_kg * ref_gwp / 1000, entry_method: 'manual', ...typedOf('refrigerant_purchased_kg') })
    }
    // Grid-region gate: unresolved grid_region → OMIT the electricity Scope 2 rows entirely (no
    // getGridFactor call, no US_AVG row). The NZ T&D row below sits inside this gate too, so it needs grid_region 'NZ',
    // which gridRegionForCountry sets for an NZ location.
    if (loc.electricity_kwh > 0 && isResolvedGridRegion(loc.grid_region)) {
      // T3c: each of the three electricity rows is priced through its own edition, or is an unpriced row (result null,
      // the edition message) when that edition is not held. One missing edition never takes another row with it.
      // Found by factor key (grid:, residual:, nz_td), not by wording.
      const elecUnpriced = (keyPrefix: string) => unpricedAll.find(u => u.reason === 'edition_missing' && u.factorKey.startsWith(keyPrefix))
      const gf = orMissing(() => getGridFactor(loc.grid_region, sel))
      if (gf) {
        rows.push({ location: loc.name || 'Location', stream: 'electricity', source: `Electricity (${gf.usedRegion})`, scope: 2, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${efDisplay(gf.ef)} kg CO₂e/kWh`, ef_source: editionCitation(gf.edition, gridSource(loc)), ...editionCells(gf.edition), scope2_method: 'location-based', gwp_basis: GWP_AS_PUBLISHED, result_tco2e: loc.electricity_kwh * gf.ef / 1000, ...(gf.edition.provisional ? { note: gf.edition.basis } : {}), ...provOf('electricity_kwh') })
      } else {
        const u = elecUnpriced('grid:')!
        pushUnpriced(u, provOf('electricity_kwh'), 2)
        rows[rows.length - 1].scope2_method = 'location-based'
      }
      // Market-based Scope 2: residual-mix factor on uncovered load, with provenance stamped for the verifier.
      const resRegion = residualRegionFor(loc)
      const res = orMissing(() => getResidualFactor(resRegion, sel, gwpVersion, loc.country))
      const uncovered = Math.max(0, loc.electricity_kwh - loc.renewable_electricity_kwh)
      if (res === null || (!res.applicable && !gf)) {
        // The residual edition is missing, or there is no residual mix and the grid factor it falls back to is missing.
        const u = elecUnpriced('residual:') ?? { ...elecUnpriced('grid:')!, source: 'Electricity (S2 market-based)', amount: uncovered, unit: 'kWh uncovered' }
        pushUnpriced(u, { entry_method: 'manual' }, 2)
        rows[rows.length - 1].scope2_method = 'market-based'
      } else {
        const mktEf = res.applicable ? res.ef : gf!.ef
        // ⚠️ THE ROW MUST CITE WHAT PRICED IT. When no residual mix applies, mktEf IS gf.ef, the location grid factor,
        // so the row cites the grid source and the grid edition; otherwise the residual mix and its own edition.
        const mktApplied = res.applicable
          ? { src: res.source, cells: res.edition ? editionCells(res.edition) : res.vintage && res.vintage !== 'n/a' ? { factor_vintage: res.vintage } : {} }
          : { src: editionCitation(gf!.edition, gridSource(loc)), cells: editionCells(gf!.edition) }
        // US: the residual edition is Green-e; the vintage also names the eGRID revision supplying CH4 and N2O.
        const vintage = res.applicable && res.edition && res.vintage !== res.edition.label ? { factor_vintage: res.vintage } : {}
        const provisional = res.applicable ? res.edition?.provisional : gf!.edition.provisional
        // Market-based row is a derived (uncovered = grid − renewable) figure, not a verbatim bill read → manual.
        rows.push({ location: loc.name || 'Location', stream: 'electricity', source: `Electricity (S2 market-based${res.applicable ? `, residual mix ${res.usedRegion}` : ', location-factor fallback'})`, scope: 2, activity_data: uncovered, activity_unit: 'kWh uncovered', emission_factor: `${efDisplay(mktEf)} kg CO₂e/kWh`, ef_source: `${mktApplied.src}${res.note ? ` · ${res.note}` : ''}`, ...mktApplied.cells, ...vintage, scope2_method: 'market-based', gwp_basis: res.applicable && !res.usedRegion.startsWith('EU_') ? gwpVersion : GWP_AS_PUBLISHED, result_tco2e: uncovered * mktEf / 1000, ...(provisional ? { note: (res.applicable ? res.edition! : gf!.edition).basis } : {}), entry_method: 'manual', ...typedOf('electricity_kwh', 'renewable_electricity_kwh') })
      }
      // NZ T&D losses — Scope 3 Category 3, NOT Scope 2. Distinct row (scope 3) so it never reads as
      // part of the S2 figure; opt-in per NZ location. Kept in lock-step with calcLocation via nzTdLoss.
      if (loc.country === 'NZ' && loc.nz_td_losses) {
        const td = orMissing(() => nzTdLoss(sel))
        if (td) rows.push({ location: loc.name || 'Location', stream: 'electricity', source: 'Electricity T&D losses (NZ) — Scope 3 Cat 3', scope: 3, activity_data: loc.electricity_kwh, activity_unit: 'kWh', emission_factor: `${efDisplay(td.ef)} kg CO₂e/kWh`, ef_source: `${EF_SOURCES.electricity_nz} · T&D losses (Scope 3 Cat 3)`, ...editionCells(td.edition), gwp_basis: 'scope3-cat3', result_tco2e: loc.electricity_kwh * td.ef / 1000, ...(td.edition.provisional ? { note: td.edition.basis } : {}), entry_method: 'manual', ...typedOf('electricity_kwh') })
        else pushUnpriced(elecUnpriced('nz_td')!, { entry_method: 'manual' }, 3)
      }
    }
    if (loc.has_purchased_steam && loc.purchased_steam_mmbtu > 0) {
      // Same rule as fuel oil: the factor is published per MMBtu, so the activity it multiplies must
      // be MMBtu. The note carries the entered GJ figure and the arithmetic.
      // T3c: a published factor (or the R14 estimate's gas factor) whose edition is not held is an unpriced line.
      const steamEditionLine = unpricedAll.find(u => u.reason === 'edition_missing' && u.field === 'purchased_steam_mmbtu')
      const priced = steamEditionLine ? null : steamPricing(loc, sel)
      if (steamEditionLine) pushUnpriced(steamEditionLine, undefined, 2)
      else if (!priced) {
        // ── NO PUBLISHED FACTOR, AND NO SUPPLIER FIGURE ──────────────────────────────────────────
        // FI7: an FI1 unpriced line (unpricedLines, reason steam_factor_missing): result null, never 0, listed by the
        // export gate with its message, and the rest of the location prices normally. The row keeps its own
        // declaration marker, no_published_factor, which Category 3, the review table and the verifier page read.
        //   activity_data IS THE ENTERED FIGURE, unlike the declared_unquantified rows below which
        // carry 0 because no figure exists. Here one does, and showing it is the honest record: "you
        // told us 500 GJ and we could not price it" is a different, more useful statement to a
        // verifier than "no figure".
        const entry = steamFactorFor(loc)
        const absent = entry === null || entry.kind === 'published' ? null : entry
        const steamLine = unpriced.get('purchased_steam_mmbtu')
        rows.push({ location: loc.name || 'Location', stream: 'purchased_steam', source: 'Purchased steam', scope: 2, ...typedOf('purchased_steam_mmbtu'),
          activity_data: loc.purchased_steam_mmbtu, activity_unit: loc.purchased_steam_unit ?? 'mmbtu',
          emission_factor: NOT_PROVIDED, emission_factor_display: NOT_PROVIDED, ef_source: NOT_PROVIDED, scope2_method: NOT_PROVIDED,
          gwp_basis: 'declaration', result_tco2e: null,
          declaration: 'no_published_factor', entry_method: 'no-published-factor',
          // The two absence kinds produce DIFFERENT prose. 'unpublished' may say a search was done and
          // name it; 'not_searched' must not, and says only what this platform applies.
          steam_absence: absent?.kind ?? 'not_searched',
          ...(steamLine ? { unpriced: { reason: steamLine.reason, field: String(steamLine.field), factor_key: steamLine.factorKey, publisher: steamLine.factor.publisher, value: null } } : {}),
          note: `NOT PRICED: ${steamLine?.message ?? ''} Nothing from this stream is included in any total on this report.`,
          ...(absent?.searched ? { quantification_method: `Checked: ${absent.searched}` } : {}) })
      } else {
      const st = steamToBasis(loc.purchased_steam_mmbtu, loc.purchased_steam_unit, priced.basis)
      // FI5: a unit change that produced the typed figure comes first on the row, as on a fuel row.
      const steamChange = unitChangeBehind(loc, 'purchased_steam_mmbtu', loc.purchased_steam_mmbtu, loc.purchased_steam_unit ?? 'mmbtu')
      // T3d 2026: a provisional steam edition says so on the row's note, with the R19 sentence, as the fuel, fleet and grid
      // rows do (it was in selection_basis only).
      const steamNote = [steamChange ? unitChangeNote(steamChange) : '', st.note ?? '', priced.estimated?.note ?? '',
        priced.edition?.provisional ? priced.edition.basis : ''].filter(Boolean).join(' · ')
      // ⚠️ SHARES factorCells AND calcGas, BUT DELIBERATELY NOT pushFuel. pushFuel stamps
      // `ef_source: combustionSource(loc)` — the COMBUSTION citation for the country, which would name
      // DEFRA's fuels table on a Scope 2 district-heat row. Steam cites its own table (STEAM_EF entries
      // carry their source), and it carries scope2_method, which pushFuel has no parameter for. So it
      // borrows the two things that decide what the figure IS and states its own citation.
      // SAME RULE AS pushFuel, and steam needs it for the same reason: a GB site entering 1,000 GJ
      // read "277777.8 kwh" in the activity column, and a US site entering GJ read MMBtu. The entered
      // figure goes in the activity column and the factor is rescaled onto that unit, so
      // `entered × displayed = result` holds. Unlike fuel oil this conversion can never be designed
      // away — GB bills in kWh or GJ, the US in MMBtu or GJ, and one factor serves both.
      const enteredUnit = loc.purchased_steam_unit ?? 'mmbtu'
      const steamRatio = loc.purchased_steam_mmbtu === 0 ? 1 : st.amount / loc.purchased_steam_mmbtu
      const steamEfShown = steamRatio === 1 ? priced.ef
        : { co2: priced.ef.co2 * steamRatio, ch4: priced.ef.ch4 * steamRatio, n2o: priced.ef.n2o * steamRatio }
      // ⚠️ NO VINTAGE ON A SUPPLIER-PRICED ROW, AND THE ABSENCE IS THE CORRECT ANSWER. A figure from
      // the customer's own district energy provider is not an edition of any publication; labelling it
      // 'US EPA 2025 Table 7' because the site happens to be American would put a publication's name
      // on a private number. The column renders '—' there, which is what "no published edition" looks
      // like, and ef_source already names the supplier route. Same gate buildFactorEditions applies.
      // R14: an estimated row records the edition of the gas table it was computed from.
      // T3c: a published factor or an estimate carries its selected edition (the estimate, its gas factor's).
      const steamVintage = priced.supplier ? undefined : priced.edition ? editionCells(priced.edition) : priced.estimated ? { factor_vintage: priced.estimated.vintage } : vintageOf(STEAM_EDITION, loc)
      rows.push({ location: loc.name || 'Location', stream: 'purchased_steam', source: `Purchased steam${priced.supplier ? ' (supplier-specific factor)' : ''}`, scope: 2, activity_data: loc.purchased_steam_mmbtu, activity_unit: enteredUnit, ...factorCells(steamEfShown, enteredUnit), ef_source: priced.source, ...(steamVintage ?? {}), scope2_method: 'location-based', result_tco2e: calcGas(priced.ef, st.amount, gwpVersion).total, entry_method: priced.supplier ? SUPPLIER_SPECIFIC_ENTRY_METHOD : 'manual', ...(priced.estimated ? { estimated: STEAM_ESTIMATE_FLAG } : {}), ...(priced.estimated && efJurisdiction(loc) === 'NZ' ? { factor_variant: nzUseClassVariant(loc) } : {}), ...(steamNote ? { note: steamNote } : {}), ...(steamChange ? { conversion_note: unitChangeNote(steamChange), unit_change: steamChange } : {}), ...typedOf('purchased_steam_mmbtu', 'purchased_steam_supplier_ef') })
      }
    }
    // ── All-excluded fields: a zero row carrying the contributions (T5 ruling) ─────────────────────
    // A field whose confirmed bills are ALL silently excluded (outside the year, or the same bill as
    // another document) has a figure of 0 and produced no row above, so without this the documents and
    // why they were excluded would be missing from the workings. Activity 0 and result 0 add nothing to
    // any total.
    // ⚠️ DELIBERATELY NOT TAGGED WITH A STREAM. The declaration loop below treats a tagged row as "this
    // stream was priced", and nothing was priced here: a bill outside the year evidences nothing about
    // the year. Untagged, the stream still gets its declaration row (declared, not quantified), so the
    // gap in the inventory stays visible beside the evidence of why.
    for (const z of ZERO_ROW_FIELDS) {
      if (figure(z.field) !== 0) continue
      const contrib = contributionsFor(z.field)
      const confirmed = contrib.filter(c => c.reason !== 'not_confirmed')
      if (confirmed.length === 0 || !confirmed.every(c => c.reason === 'outside_year' || c.reason === 'same_bill_as' || c.reason === 'exact_duplicate_of')) continue
      rows.push({ location: loc.name || 'Location', source: z.source, scope: z.scope,
        activity_data: 0, activity_unit: z.unitField ? String((loc as unknown as Record<string, string>)[String(z.unitField)]) : z.unit,
        emission_factor: NOT_APPLICABLE, emission_factor_display: NOT_APPLICABLE, ef_source: NOT_APPLICABLE,
        ...(z.scope === 2 ? { scope2_method: 'location-based' } : {}),
        gwp_basis: 'all_bills_excluded', result_tco2e: 0, entry_method: 'concierge', contributions: contrib,
        note: `No bill is counted for this line: each confirmed bill is outside ${reportingYearLabel(win).inText} or is the same bill as another document.` })
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
        activity_data: 0, activity_unit: NOT_PROVIDED, emission_factor: NOT_PROVIDED, emission_factor_display: NOT_PROVIDED,
        ef_source: NOT_PROVIDED, gwp_basis: 'declaration' }
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
    // Only ACCEPTED resolutions get an audit row (T3): a row must not claim a method the figure did not
    // apply. That excludes a stored 'straddle' (ignored since T2; straddling bills are prorated
    // automatically and disclosed on the figure's own row) and a stored 'duplicate' (never accepted: it
    // left a known double count), and any resolution that does not validate against its location.
    const owner = locations.find(l => l.id === r.locId)
    if (!owner || validateResolution(r, owner) !== null) continue
    // Method string comes from the SAME resolutionMethod() that fills AppliedField.adjustment.method,
    // so the audit row and the figure's provenance stamp can never claim different things.
    rows.push({
      location: ALL_LOCATIONS,
      // T11: the fuel in words ("natural gas"), as the coverage messages name it, never its key.
      source: `Coverage resolution: ${fuelName(r.fuelType)}`,
      scope: 0,
      activity_data: null,
      activity_unit: r.kind,
      emission_factor: resolutionMethod(r, owner),
      ef_source: r.note,
      gwp_basis: 'coverage_resolution',
      result_tco2e: null,
      resolved_at: r.acknowledgedAt,
      // T18: who made the choice, structured, on every kind; null for a stored resolution that never recorded one,
      // which still validates and says "Who: not recorded". The note keeps its own wording.
      resolved_by: r.by?.userId && r.by?.email ? { userId: r.by.userId, email: r.by.email } : null,
      resolved_by_text: resolvedByText(r),
    })
  }
  // ── T18: document events ─────────────────────────────────────────────────
  // One row per entry in each location's document log: withdrawn, restored, deleted (a tombstone) and deleted
  // unused, beside the coverage-resolution rows, so a verifier sees every upload that existed and what became of
  // it. The sentence is the row's note (shown beside the activity on every surface); no factor applies.
  for (const loc of locations) for (const e of loc.document_log ?? []) {
    rows.push({
      location: loc.name || 'Location',
      source: `Document ${e.kind === 'deleted_unused' ? 'deleted, unused' : e.kind}: ${e.file}`,
      scope: 0,
      activity_data: null,
      activity_unit: e.kind,
      emission_factor: NOT_APPLICABLE,
      ef_source: NOT_APPLICABLE,
      gwp_basis: DOCUMENT_EVENT_ROW_BASIS,
      result_tco2e: null,
      note: documentEventSentence(e),
      document_event: e,
    })
  }
  // ── T18 section D: deleted locations ──────────────────────────────────────
  // One row per location deleted from the inventory (ghg_inventories.location_log). The location is not in
  // `locations`, so this record is the only trace of it and its documents in the saved workings.
  for (const e of locationLog) {
    rows.push({
      location: e.name || 'Location',
      source: `Location deleted: ${e.name || 'Location'}`,
      scope: 0,
      activity_data: null,
      activity_unit: e.kind,
      emission_factor: NOT_APPLICABLE,
      ef_source: NOT_APPLICABLE,
      gwp_basis: LOCATION_EVENT_ROW_BASIS,
      result_tco2e: null,
      note: locationEventSentence(e),
      location_event: e,
    })
  }
  // Rows with no gas split (electricity, refrigerant, steam, market-based, T&D, coverage resolutions)
  // have no combined-factor form — their emission_factor IS already the display string. Declaration
  // rows set their own NOT_PROVIDED. Fill the rest so every row carries a display field for the table.
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
export interface CoverageIssue {
  locId: string
  fuelType: string
  // gap | overlap (per coverage group), undated | invalid_period | mixed_units | all_rejected (T3 ruling
  // "no silent zero"), stream_off (T6 ruling), none (an unread upload, T10 ruling), no_value (T10a),
  // exact_duplicate (T15, rule R6), factor_missing | refrigerant_unknown | province_missing (FI1).
  status: string
  message?: string        // plain-language, for the strip (T8); absent for gap and none (copy unchanged)
  // T8: what the strip needs to place the issue and act on it. documentType on gap and overlap (the coverage
  // group's document type); field on all_rejected (which figure "used none" or a typed figure answers).
  documentType?: string
  field?: string
  // T10: the fields an unread upload (status none) is evidence for, each answerable by a typed figure or used_none.
  fields?: string[]
  docIds?: string[]
  meterLabel?: string | null
  /** FI9 diff 4: a fleet-fuel gap or overlap's vehicle type, so its estimate names it. */
  fleetType?: FleetType
}

// ── T15: EXACT DUPLICATES ACROSS DOCUMENT TYPES (rule R6, docs/review/design-derived-figures.md) ──────────
// Within one location, two ACCEPTED proposals (confirmed, with a figure, for a field not entered by hand) from
// DIFFERENT document types, for the same fuel, are an exact duplicate when either:
//   (a) their documents carry the same sha256 (a missing hash never matches); or
//   (b) the same canonical value and unit, and the same periodStart and periodEnd. A delivery has no period, so
//       its delivery date stands for both ends.
// Same fuel, because only a fuel read twice can be counted twice: a dual-fuel bill uploaded as the gas bill and
// as the electricity bill, read once for each fuel, counts each fuel once.
// A WARNING, NOT A COVERAGE ISSUE: it is not in analyzeCoverage's issues. findUnresolvedCoverage still blocks
// export on it until an accepted exact_duplicate resolution names both documents.
export interface ExactDuplicate {
  locId: string
  fuelType: string
  docIds: [string, string]
  match: 'sha256' | 'reading'
  /** The accepted choice that answers this pair, or null while it is unanswered. */
  resolution: CoverageResolution | null
}

export function findExactDuplicates(loc: Location, allResolutions: CoverageResolution[]): ExactDuplicate[] {
  type Cand = { doc: SourceDoc; p: ExtractedProposal }
  const cands: Cand[] = []
  loc.source_docs.forEach(d => (d.extracted ?? []).forEach(p => {
    if (p.status !== 'confirmed' || p.value == null) return
    const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
    if (!map || activeOverride(loc, map.amount)) return
    cands.push({ doc: d, p })
  }))
  const startOf = (p: ExtractedProposal) => p.periodStart ?? p.deliveryDate ?? null
  const endOf = (p: ExtractedProposal) => p.periodEnd ?? p.deliveryDate ?? null
  const sameReading = (a: ExtractedProposal, b: ExtractedProposal) =>
    a.value === b.value && a.unit != null && a.unit === b.unit
    && startOf(a) != null && startOf(a) === startOf(b) && endOf(a) != null && endOf(a) === endOf(b)
  const accepted = acceptedResolutions(loc, allResolutions).filter(r => r.kind === 'exact_duplicate')
  const answers = (r: CoverageResolution, fuelType: string, a: string, b: string) => {
    if (r.fuelType !== fuelType) return false
    const ids = r.choice === 'count_once' ? [r.countedDocId, ...(r.excludedDocIds ?? [])] : (r.docIds ?? [])
    return ids.includes(a) && ids.includes(b)
  }
  const found = new Map<string, ExactDuplicate>()
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const A = cands[i], B = cands[j]
      if (A.doc.id === B.doc.id || A.doc.document_type === B.doc.document_type || A.p.fuelType !== B.p.fuelType) continue
      const byHash = !!A.doc.sha256 && A.doc.sha256 === B.doc.sha256
      if (!byHash && !sameReading(A.p, B.p)) continue
      const key = `${A.p.fuelType}|${[A.doc.id, B.doc.id].sort().join('|')}`
      const prev = found.get(key)
      if (prev && (prev.match === 'sha256' || !byHash)) continue
      found.set(key, {
        locId: loc.id, fuelType: A.p.fuelType, docIds: [A.doc.id, B.doc.id], match: byHash ? 'sha256' : 'reading',
        resolution: accepted.filter(r => answers(r, A.p.fuelType, A.doc.id, B.doc.id)).at(-1) ?? null,
      })
    }
  }
  return [...found.values()]
}

// Every export-blocking coverage issue. Coverage groups are keyed (document_type, fuelType, meter_label)
// (ruling C6(a)); a document with no meter_label is the default single meter.
//   gap      a group with in-window days uncovered and no accepted extrapolate for THAT meter.
//   overlap  two documents in one group whose full periods share a day. No resolution clears it directly:
//            Same bill (same_bill) takes one out of the group, Different meters (meter labels) splits the
//            group. Legacy 'duplicate' is not accepted, so it leaves the overlap standing (rule R4).
//   undated, invalid_period, mixed_units   a confirmed bill that is not counted for a reason the customer
//            must be told (T3 ruling: only outside_year and same_bill_as may be silent).
//   all_rejected   every document for a field rejected, no figure entered (the field is 0), and no
//            accepted used_none.
//   none     a document with no figure read from it at all (unchanged from before T3).
//   factor_missing, refrigerant_unknown, province_missing   a line that cannot be priced (FI1), keyed
//            (location, field): excluded from every total, never counted as zero, until it is resolved.
//   exact_duplicate   the same document under two document types (T15, rule R6) with no accepted
//            exact_duplicate choice naming both: Same document, count once, or Not the same.
export function findUnresolvedCoverage(
  locations: Location[],
  reportingYear: number,
  fiscalYearEndMonth: number,
  allResolutions: CoverageResolution[],
  ctx: SelectionContext = {},
): CoverageIssue[] {
  const coverageWin = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
  // T3c: the same selection context the totals use, so an edition_missing line here is the line the totals leave out.
  const sel = selectionFor(reportingYear, fiscalYearEndMonth, ctx)
  return locations.flatMap(loc => {
    const resolutions = acceptedResolutions(loc, allResolutions)
    const site = loc.name || 'Location'
    const fileOf = (docId: string) => loc.source_docs.find(d => d.id === docId)?.file_name ?? docId
    const contributions = billContributions(loc, resolutions, coverageWin)
    const out: CoverageIssue[] = []

    // T10a: a CONFIRMED proposal with no figure produces no contribution row (T1), so without this it counted
    // nothing and raised nothing. It blocks, naming the document.
    loc.source_docs.forEach(d => (d.extracted ?? []).forEach(p => {
      if (p.status === 'confirmed' && p.value == null)
        out.push({ locId: loc.id, fuelType: p.fuelType, status: 'no_value', docIds: [d.id], message: COVERAGE_MESSAGE.no_value(d.file_name) })
    }))
    // A document with nothing read from it (T10 ruling). EVIDENCE, not a blocker, when any field its
    // document type supports already has a figure: typed, from another counted bill, or a used_none
    // confirmation. Otherwise it blocks, naming the file, the fuel(s) and the site, and the strip offers
    // "Enter the figure manually" and "Confirm this site used no {fuel}" for each field.
    const derivedHere = deriveLocations({ locations: [loc], reporting_year: reportingYear, fiscal_year_end_month: fiscalYearEndMonth, coverage_resolutions: allResolutions })[0]
    const hasFigure = (f: keyof Location) => Number((derivedHere as unknown as Record<string, unknown>)[String(f)] ?? 0) > 0
      || resolutions.some(r => r.kind === 'used_none' && r.field === String(f))
    loc.source_docs.forEach(d => {
      if ((d.extracted?.length ?? 0) > 0 || d.withdrawn) return
      // FI9 diff 4: an unread fleet-fuel upload names the ticked vehicle types' fields (all six when none is ticked).
      const fields = d.document_type === 'fleet_fuel' ? unreadFleetFields(loc) : DOC_TYPE_FIELDS[d.document_type] ?? []
      if (fields.length === 0 || fields.some(hasFigure)) return
      out.push({ locId: loc.id, fuelType: fuelTypeForDocType(d.document_type) ?? '', status: 'none', docIds: [d.id],
        fields: fields.map(String), message: COVERAGE_MESSAGE.unread(d.file_name, listInWords(fields.map(f => FIELD_NAME[String(f)] ?? String(f))), site) })
    })

    // Not-counted bills the customer must be told about.
    for (const c of contributions) {
      if (c.reason === 'undated') {
        out.push({ locId: loc.id, fuelType: c.fuelType, status: 'undated', docIds: [c.docId], meterLabel: c.meterLabel,
          message: COVERAGE_MESSAGE.undated(fileOf(c.docId)) })
      } else if (c.reason === 'invalid_period' && c.periodProblem) {
        const p = loc.source_docs.find(d => d.id === c.docId)?.extracted?.[c.proposalIndex]
        out.push({ locId: loc.id, fuelType: c.fuelType, status: 'invalid_period', docIds: [c.docId], meterLabel: c.meterLabel,
          message: INVALID_PERIOD_MESSAGE[c.periodProblem](fileOf(c.docId), p?.periodStart ?? p?.deliveryDate ?? '', p?.periodEnd ?? p?.deliveryDate ?? '') })
      }
    }
    const mixedByField = new Map<string, BillContribution[]>()
    for (const c of contributions) if (c.reason === 'mixed_units') mixedByField.set(String(c.field), [...(mixedByField.get(String(c.field)) ?? []), c])
    for (const cs of mixedByField.values()) {
      const units = [...new Set(cs.map(c => c.unit ?? ''))].filter(Boolean)
      const files = [...new Set(cs.map(c => fileOf(c.docId)))]
      out.push({ locId: loc.id, fuelType: cs[0].fuelType, status: 'mixed_units', docIds: [...new Set(cs.map(c => c.docId))],
        message: COVERAGE_MESSAGE.mixed_units(FUEL_NAME[cs[0].fuelType] ?? cs[0].fuelType, site, units, files) })
    }

    // All documents for a field rejected, no figure entered, no used_none.
    const byField = new Map<string, { fuelType: string; statuses: string[]; withdrawn: boolean }>()
    loc.source_docs.forEach(d => (d.extracted ?? []).forEach(p => {
      // T10a: a proposal with no figure is still a document for its field. Skipping it let a field whose only
      // bills had no figure and were rejected fall to zero with no issue (found by the property test).
      const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
      if (!map) return
      const e = byField.get(String(map.amount)) ?? { fuelType: p.fuelType, statuses: [], withdrawn: false }
      e.statuses.push(p.status)
      // T18: a withdrawn document's readings are rejected, so they count as rejected here; the message says so.
      if (d.withdrawn) e.withdrawn = true
      byField.set(String(map.amount), e)
    }))
    for (const [field, e] of byField) {
      if (!e.statuses.every(st => st === 'rejected')) continue
      const entered = Number((loc as unknown as Record<string, unknown>)[field] ?? 0) > 0
      const usedNone = resolutions.some(r => r.kind === 'used_none' && r.field === field)
      if (!entered && !usedNone) out.push({ locId: loc.id, fuelType: e.fuelType, status: 'all_rejected', field,
        message: COVERAGE_MESSAGE.all_rejected(FUEL_NAME[e.fuelType] ?? e.fuelType, site, e.withdrawn) })
    }

    // FI1: every line that cannot be priced blocks export, keyed (location, field), with its own message.
    // Judged on the DERIVED location, as the totals are: a figure from bills is the figure that would price.
    // status is the reason: factor_missing, refrigerant_unknown, province_missing ... or edition_missing (T3c).
    for (const u of unpricedLines(derivedHere, 'AR6', sel)) {
      // FI5: a cleared figure confirmed as none (an accepted used_none for the field) is answered.
      // T18: not a reading's own line. A bill on file says the fuel was used, so it is entered again or rejected.
      if (u.reason === 'figure_cleared' && !u.reading && resolutions.some(r => r.kind === 'used_none' && r.field === String(u.field))) continue
      out.push({ locId: loc.id, fuelType: FIELD_FUEL[String(u.field)] ?? String(u.field), status: u.reason, field: String(u.field), message: u.message })
    }

    // T15 (rule R6): an exact duplicate across document types blocks export until the customer chooses.
    const copyOf = (docId: string): DocCopy => ({ file: fileOf(docId), documentType: loc.source_docs.find(d => d.id === docId)?.document_type ?? '' })
    for (const x of findExactDuplicates(loc, allResolutions)) {
      if (x.resolution) continue
      out.push({ locId: loc.id, fuelType: x.fuelType, status: 'exact_duplicate', docIds: [...x.docIds],
        message: COVERAGE_MESSAGE.exact_duplicate(site, copyOf(x.docIds[0]), copyOf(x.docIds[1]), x.match, FUEL_NAME[x.fuelType] ?? x.fuelType) })
    }

    // Confirmed bills under a "uses this fuel" switch that is off (T6 ruling). The annual figure omits a
    // switched-off field, so without this the bills would vanish from every total with nothing said.
    const confirmedByField = new Map<string, { fuelType: string; docIds: Set<string>; n: number }>()
    loc.source_docs.forEach(d => (d.extracted ?? []).forEach(p => {
      if (p.status !== 'confirmed' || p.value == null) return
      const map = fieldFor(d.document_type, p.fuelType, p.fleetType)
      if (!map || !streamSwitchOff(loc, map.amount)) return
      const e = confirmedByField.get(String(map.amount)) ?? { fuelType: p.fuelType, docIds: new Set(), n: 0 }
      e.n += 1; e.docIds.add(d.id)
      confirmedByField.set(String(map.amount), e)
    }))
    for (const [field, e] of confirmedByField) {
      const meta = STREAM_META[FIELD_STREAM[field as keyof Location] as DeclarableStream]
      out.push({ locId: loc.id, fuelType: e.fuelType, status: 'stream_off', docIds: [...e.docIds],
        message: COVERAGE_MESSAGE.stream_off(site, meta.verb, meta.name, e.n, FUEL_NAME[e.fuelType] ?? e.fuelType) })
    }

    // T10b: DELIVERY-BASED GROUPS, keyed (document_type, fuelType). A group with any confirmed delivery is
    // checked for COMPLETENESS, not monthly coverage (ruling): no gap, no estimate, and export waits until the
    // customer confirms that the deliveries listed are all of them. The confirmation covers every confirmed
    // reading of the group, statements included (a mixed field is confirmed as a whole), and it applies only
    // while that set is unchanged: adding, removing or rejecting a delivery reopens it (ruling).
    const docTypeOf = (docId: string) => loc.source_docs.find(x => x.id === docId)?.document_type ?? ''
    const placed = (c: BillContribution) => c.counted || c.reason === 'outside_year'
    const deliveryGroups = new Map<string, { documentType: string; fuelType: string; n: number }>()
    for (const c of contributions) {
      if (!c.deliveryDate || !placed(c)) continue
      const key = `${docTypeOf(c.docId)}|${c.fuelType}`
      const g = deliveryGroups.get(key) ?? { documentType: docTypeOf(c.docId), fuelType: c.fuelType, n: 0 }
      g.n += 1
      deliveryGroups.set(key, g)
    }
    for (const g of deliveryGroups.values()) {
      const docIds = [...new Set(contributions.filter(c => placed(c) && c.fuelType === g.fuelType && docTypeOf(c.docId) === g.documentType).map(c => c.docId))]
      const conf = resolutions.filter(r => r.kind === 'deliveries_complete' && r.fuelType === g.fuelType && r.documentType === g.documentType).at(-1)
      if (conf && sameDocSet(conf.docIds ?? [], docIds)) continue
      const fuel = FUEL_NAME[g.fuelType] ?? g.fuelType
      out.push({ locId: loc.id, fuelType: g.fuelType, status: 'deliveries_unconfirmed', documentType: g.documentType, docIds,
        message: conf
          ? COVERAGE_MESSAGE.deliveries_changed(fuel, site, conf.by?.email ?? 'someone', dateInWords(new Date(conf.acknowledgedAt)))
          : COVERAGE_MESSAGE.deliveries_unconfirmed(fuel, site, dateInWords(coverageWin.start), dateInWords(coverageWin.end)) })
    }

    // Coverage groups: confirmed, counted-or-outside-year bills with a usable period, keyed by
    // (document_type, fuelType, meter_label). Same-bill exclusions, undated, invalid and mixed bills are
    // not placed (each is reported above, or is a resolved overlap).
    // FI9 diff 4: and by vehicle type, so a fleet-fuel gap in light vehicles is not covered by heavy-vehicle bills.
    const groups = new Map<string, { documentType: string; fuelType: string; meterLabel: string | null; fleetType: FleetType | null; periods: CoveragePeriod[] }>()
    for (const c of contributions) {
      if (!(c.counted || c.reason === 'outside_year') || !c.periodStart || !c.periodEndExclusive) continue
      const d = loc.source_docs.find(x => x.id === c.docId)!
      const ft = fleetTypeOfField(c.field)
      const key = `${d.document_type}|${c.fuelType}|${c.meterLabel ?? ''}|${ft ?? ''}`
      const g = groups.get(key) ?? { documentType: d.document_type, fuelType: c.fuelType, meterLabel: c.meterLabel, fleetType: ft, periods: [] }
      const p = d.extracted![c.proposalIndex]
      g.periods.push({ docId: c.docId, pi: c.proposalIndex, start: parseLocalDate(p.periodStart as string), end: parseLocalDate(p.periodEnd as string) })
      groups.set(key, g)
    }
    for (const g of groups.values()) {
      const cov = analyzeCoverage(g.periods, coverageWin.start, coverageWin.end)
      // T10b: a delivery-based group has no monthly gap; its statements are still checked for overlaps.
      if (cov.issues.includes('gap') && !deliveryGroups.has(`${g.documentType}|${g.fuelType}`)) {
        const res = resolutions.some(r => r.kind === 'extrapolate' && r.fuelType === g.fuelType && (r.meterLabel ?? null) === g.meterLabel
          && (r.documentType == null || r.documentType === g.documentType) && (r.fleetType ?? null) === g.fleetType)
        if (!res) out.push({ locId: loc.id, fuelType: g.fuelType, status: 'gap', meterLabel: g.meterLabel, documentType: g.documentType,
          ...(g.fleetType ? { fleetType: g.fleetType } : {}) })
      }
      for (const pair of cov.overlaps) {
        const from = pair.a.start > pair.b.start ? pair.a.start : pair.b.start
        const endA = canonicalPeriod(pair.a.start, pair.a.end).endExclusive, endB = canonicalPeriod(pair.b.start, pair.b.end).endExclusive
        const toExcl = endA < endB ? endA : endB
        const to = new Date(toExcl.getFullYear(), toExcl.getMonth(), toExcl.getDate() - 1)
        out.push({ locId: loc.id, fuelType: g.fuelType, status: 'overlap', docIds: [pair.a.docId, pair.b.docId], meterLabel: g.meterLabel, documentType: g.documentType,
          ...(g.fleetType ? { fleetType: g.fleetType } : {}),
          message: COVERAGE_MESSAGE.overlap(fileOf(pair.a.docId), fileOf(pair.b.docId), dateInWords(from), dateInWords(to)) })
      }
    }
    return out
  })
}

// ── Undeclared streams (completeness gate) ────────────────────────────────────
// Same pattern as the grid-region gate (isResolvedGridRegion / gridReady): a `has_*` flag of false is
// BOTH the init default AND "no such supply" — one field, two meanings. A stream is DECLARED only when
// it has data OR carries an explicit attestation; otherwise it is UNDECLARED and blocks export.
export const DECLARABLE_STREAMS = [
  'natural_gas', 'propane', 'diesel_stationary', 'fuel_oil_distillate', 'fuel_oil_residual',
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
  // Lowercase noun phrases, like every other entry — `name` is a NOUN, not a title. streamQuestion()
  // frames it ("Does this location use heating oil (light / distillate)?"), the attestation frames it
  // ("This location has no heating oil (light / distillate)."), and the declaration row prints it bare.
  // One string, three frames: a title-cased name would read wrong in two of the three.
  fuel_oil_distillate: { name: 'heating oil (light / distillate)',   verb: 'use',  scope: 1 },
  fuel_oil_residual:   { name: 'heavy fuel oil (residual)',          verb: 'use',  scope: 1 },
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
    case 'fuel_oil_distillate': return loc.has_fuel_oil_distillate
    case 'fuel_oil_residual': return loc.has_fuel_oil_residual
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
    case 'fuel_oil_distillate': return loc.fuel_oil_distillate_amount > 0
    case 'fuel_oil_residual': return loc.fuel_oil_residual_amount > 0
    case 'mobile': return loc.gasoline_amount > 0 || loc.diesel_mobile_amount > 0 || FLEET_FIELDS.some(f => fleetNum(loc, f) > 0)
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
  locations: Location[],
  resolutions: CoverageResolution[] = []
): { locId: string; locName: string; stream: DeclarableStream; state: StreamState }[] {
  return locations.flatMap(loc => {
    const attested = new Set((loc.stream_attestations ?? []).map(a => a.stream))
    // An accepted used_none (T3) is a recorded figure of zero for its stream, with who and when: it
    // answers both 'undeclared' and 'declared_unquantified', so confirming "this site used none" unblocks.
    const usedNone = new Set(acceptedResolutions(loc, resolutions)
      .filter(r => r.kind === 'used_none' && r.field)
      .map(r => FIELD_STREAM[r.field as keyof Location])
      .filter((x): x is DeclarableStream => !!x))
    return DECLARABLE_STREAMS
      .map(stream => ({ stream, state: streamState(loc, stream) }))
      // An attestation answers 'undeclared' — nobody had been asked, now someone has. It does NOT
      // answer 'declared_unquantified': a site cannot attest a stream absent and also report using it.
      .filter(({ stream, state }) => state !== 'quantified' && !usedNone.has(stream) && !(state === 'undeclared' && attested.has(stream)))
      .map(({ stream, state }) => ({ locId: loc.id, locName: loc.name || 'Location', stream, state }))
  })
}

// ── STEAM THAT CANNOT BE PRICED — the export gate's probe ────────────────────────────────────────
//
// A SEPARATE PROBE, NOT A FOURTH StreamState. StreamState answers "what did the customer tell us"
// (undeclared / declared_unquantified / quantified) from the location alone, and its three-way shape
// is load-bearing — the comment above it explains why a boolean was not enough. This asks a different
// question, "can we price what they told us", whose answer depends on the JURISDICTION and not on the
// customer's answers at all. Folding it into StreamState would make a stream's declared state change
// when the country dropdown moves, which is not what that type means.
//
// It composes into the export gate beside gridReady / pricingReady / declarationsReady — the pattern
// the page already uses for exactly this: one independent readiness condition per unrelated defect.
//
// ⚠️ THIS BLOCKS EXPORT, AND THE REMEDY IS purchased_steam_supplier_ef. A stream the customer declared
// and quantified is being left out of every total; shipping an assurance package that way would put an
// incomplete Scope 2 in front of a verifier. The supplier-factor field is what lets them clear it, and
// blocking without that field would strand them with no way out.
export function findSteamFactorGaps(
  locations: Location[],
  sel: Sel,
): { locId: string; locName: string; jurisdiction: EfJurisdiction; kind: 'unpublished' | 'not_searched' | 'estimated'; guidance: string }[] {
  return locations.flatMap(loc => {
    if (!loc.has_purchased_steam || loc.purchased_steam_mmbtu <= 0) return []
    // T3c: a missing edition is an edition_missing line (unpricedLines), not a request for a supplier figure.
    try { if (steamPricing(loc, sel)) return [] } catch (e) { if (e instanceof MissingEditionError) return []; throw e }
    const entry = steamFactorFor(loc)
    // ⚠️ A REFUSED COUNTRY IS SKIPPED HERE, DELIBERATELY, AND IT IS NOT AN OVERSIGHT.
    // This gate asks the customer for a supplier-specific factor so the steam row can price. A
    // location whose country resolves to no jurisdiction is excluded WHOLE, so no figure it carries
    // will be priced whatever they enter: asking would be busy-work that cannot clear the block,
    // and it would put two different remedies on one location at once. The country refusal states
    // the reason on its own. An unsupported country is out of every total and named as excluded; a location
    // with no country set is the fixable refusal, and that one blocks the export through pricingReady.
    if (entry === null) return []
    if (entry.kind === 'published') return []   // unreachable; steamPricing would have returned it
    const j = efJurisdiction(loc)
    if (j === null) return []                   // unreachable: a null entry above implies a null j
    // R14: an estimate that could not be computed (a Canadian site with no province) is reported with its line's message.
    const guidance = entry.kind === 'estimated' ? (unpricedLines(loc, 'AR6', sel).find(u => u.field === 'purchased_steam_mmbtu')?.message ?? '') : entry.guidance
    return [{ locId: loc.id, locName: loc.name || 'Location', jurisdiction: j, kind: entry.kind, guidance }]
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API. Declarations above are kept in their original (verbatim) order;
// exports are collected here so the move stays byte-for-byte auditable.
// ─────────────────────────────────────────────────────────────────────────────
export {
  // Constants / tables
  GWP, REFRIGERANT_GWP, EF, EF_CA, EF_CA_NG_CO2_M3, M3_PER_MCF,
  EF_UK, EF_EU, EF_AU, EF_NZ, EF_SOURCES, EF_SOURCE_LOCATORS, GRID_EF, NZ_TD_LOSS,
  RESIDUAL_EU, RESIDUAL_US,
  CA_PROVINCES, US_STATES, US_SUBREGIONS, AU_STATES,
  EU_COUNTRIES,
  GRID_REGIONS_CA, GRID_REGIONS_US, FRAMEWORKS,
  COMBUSTION_EDITION, STEAM_EDITION,
  // Functions
  nzTdLoss, isResolvedGridRegion, getGridFactor, getResidualFactor,
  detectGridRegion, gridRegionForCountry, propaneEfKey, pickEF,
  combustionSource, calcGas, calcLocation, calcInventory, fieldFor,
  buildWorkings, emptyLocation,
  ngUnitOptions, normalizeNgUnit, liquidUnitOptions, fuelOilUnitOptions, propaneUnitOptions, steamUnitOptions,
  // Steam: the registry itself is deliberately NOT exported. The only ways in are steamFactorFor and
  // steamPricing, so no caller — including a test — can index it and bolt a `?? EF` onto the result.
  // The seeding tests assert through steamFactorFor, which is the path the engine actually uses.
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
