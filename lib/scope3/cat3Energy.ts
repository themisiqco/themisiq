// ── CATEGORY 3: WHAT THE BOUND GHG INVENTORY'S ENERGY COSTS UPSTREAM ─────────────────────────────
//
// Pure calculation. No React, no Supabase, no network, and NOTHING FROM lib/ghg/engine.ts: the Scope 3
// page loads this module, and the engine carries every factor table in the product. The things this needs
// from outside are the DEFRA artefact (lib/emissionFactors/defraEnergy.ts, Task 1), the NGA 2025 Scope 3
// transcription for Australian gas and electricity (lib/emissionFactors/ngaScope3_2025.ts, FI6), and the
// exact energy constants in lib/unitConversions.ts, which is the repo's unit authority and is already
// what the engine itself uses for the same conversion.
//
// Task 2 of the Category 3 design (~/themisiq-sources/findings/cat3-design.md). Task 3 builds the
// adapter that turns the bound inventory's workings rows into Cat3InputRow; Task 5 turns the flags and
// reasons below into sentences. NOTHING HERE IS CUSTOMER-FACING: every flag and every reason is a code
// with its data, so one module decides what is true and another decides how to say it.
//
// ⚠️ NO ROUNDING HAPPENS HERE. Lines carry kg CO2e at full precision; display rounds.
//
// ⚠️ EVERY FIGURE IS UPSTREAM ONLY. The artefact holds WTT and T&D rows, which is what Category 3 may
// use (Scope 3 Standard, p. 70: life cycle factors "that exclude emissions from combustion"). The
// combustion itself is already in the customer's Scope 1 and Scope 2.

import {
  DEFRA_ENERGY_META, DEFRA_ENERGY_YEARS, defraEnergyMetaFor, energyFactor, energyConversion,
  type EnergyFuelFactor, type EnergyLineFactor,
} from '../emissionFactors/defraEnergy'
import { normalizeUnit, GJ_PER_MMBTU, KWH_PER_GJ, EXACT_CONVERSIONS } from '../unitConversions'
import { ngaScope3, AU_GAS_AREA_STATES, type NgaCited, type NgaElectricityRow, type NgaGasRow, type NgaGasArea } from '../emissionFactors/ngaScope3_2025'

// ── WHAT COMES IN ─────────────────────────────────────────────────────────────────────────────────

/** The streams a GHG inventory can hold, as lib/ghg/engine.ts's DECLARABLE_STREAMS names them, with
 *  mobile split into its two fuels because they price from different DEFRA rows. */
export type Cat3Stream =
  | 'natural_gas' | 'propane' | 'diesel_stationary' | 'fuel_oil_distillate' | 'fuel_oil_residual'
  | 'mobile_gasoline' | 'mobile_diesel' | 'electricity' | 'purchased_steam' | 'refrigerants'

export interface Cat3InputRow {
  /** Stable within one evaluation: the adapter's row id, used to tie a line back to its source row. */
  id: string
  /** The location name as the workings row carries it. Not a key: names are not unique. */
  location: string
  stream: Cat3Stream
  /** The figure as the customer entered it, in `unit`. Resolution-applied, per the design's decision 3. */
  activity: number
  /** The unit as stored or as the workings row prettifies it ('gal', 'L', 'm³', 'kWh' all arrive). */
  unit: string
  /** ISO country of the location, or null where the adapter could not resolve it. */
  country: string | null
  /** false when the join that supplies `country` could not answer; see the design, 10a. */
  country_resolved: boolean
  /** The workings row's own entry_method ('manual', 'concierge', 'concierge-extrapolated', …). */
  entry_method: string | null
  /** Electricity only. A market-based row is never priced: the location-based row is the basis. */
  scope2_method?: 'location-based' | 'market-based' | null
  /** The publisher that priced this row's Scope 1 or Scope 2 figure, for the stand-in disclosure. */
  scope1_publisher?: string | null
  /** New Zealand only: the engine's own s3_td figure for this location, in TONNES, as it publishes it. */
  nz_td_result_tco2e?: number | null
  /** FI6: Australia only. The location's state as the GHG wizard stores it (NSW, ACT, VIC, QLD, SA, WA, TAS, NT), or
   *  null where none is recorded or the join on the location name cannot answer. */
  au_state?: string | null
  /** FI6 (R15): Australia only. NGA's metro or non-metro gas area for the site, or null where not chosen. */
  au_gas_area?: NgaGasArea | null
}

export interface Cat3Inputs {
  rows: readonly Cat3InputRow[]
  /**
   * ⚠️ DECISION 6 NEEDS BOTH HALVES. An inventory where every stream was ANSWERED and none carries data
   * is a zero. An inventory with a stream nobody answered is incomplete, and a zero would assert
   * something the customer never said. The engine already separates the two (findUndeclaredStreams).
   */
  declaration: { undeclared: readonly string[] }
}

// ── WHAT GOES OUT ─────────────────────────────────────────────────────────────────────────────────

/** Which of the design's lines this is. 3a, 3b and 3c are the Technical Guidance's own activity letters. */
export type Cat3LineKind =
  | 'fuel_wtt'                    // 3a: upstream of a fuel burned in Scope 1
  | 'electricity_generation_wtt'  // 3b: upstream of the fuels burned to generate purchased electricity
  | 'electricity_td_loss'         // 3c: the generation of the electricity lost in transmission
  | 'electricity_td_wtt'          // 3b: upstream of the fuels behind that lost electricity
  | 'steam_wtt'                   // 3b, for purchased heat and steam
  | 'steam_distribution_loss'     // 3c
  | 'steam_distribution_wtt'      // 3b
  | 'electricity_nga_scope3'      // FI6: Australia, NGA Table 1's one Scope 3 figure, which includes grid losses

export type Cat3Flag =
  /** Priced from a UK factor at a location that is not in the UK, or whose country is unknown. */
  | { code: 'uk_stand_in'; country: string | null; scope1_publisher: string | null }
  /** The adapter could not say which country this row belongs to. Always accompanied by uk_stand_in. */
  | { code: 'country_unresolved' }
  /** The 3c figure came from the GHG engine's own New Zealand T&D line, not from DEFRA. */
  | { code: 'nz_mfe_3c'; source: string }

export type Cat3Reason =
  | { code: 'unit_not_published'; stream: Cat3Stream; unit: string }
  | { code: 'refrigerants_not_in_category' }
  | { code: 'market_based_row_not_used' }
  | { code: 'no_nz_td_figure'; location: string }
  | { code: 'activity_not_a_number'; unit: string }
  /** FI6: an Australian gas or electricity row at a site with no state recorded. Never priced at NGA's National row. */
  | { code: 'au_state_missing'; location: string }
  /** FI6 (R15): Australian gas in NSW and the ACT, QLD, SA or WA, where NGA's factor depends on the metro or
   *  non-metro area and none has been chosen. */
  | { code: 'au_gas_area_missing'; location: string }
  /** T3c (R18): the factor edition the reporting window needs (DEFRA well-to-tank and T&D by the DESNZ rule; NGA Scope 3
   *  by its activity years) is not held. `message` is the engine's sentence, naming the site. */
  | { code: 'edition_missing'; edition: string; message: string }

export interface Cat3Conversion {
  factor: number
  from: string
  to: string
  /** 'defra' is a conversion the workbook publishes; 'definitional' is an exact unit identity; 'nga' uses NGA's own
   *  energy content (Table 5), which NGA's formula applies with its Table 6 gas factors (FI6). */
  source: 'defra' | 'definitional' | 'nga'
  /** The artefact key, for a DEFRA conversion. */
  key?: string
  /** The cell, for a DEFRA conversion, or the constant's name for a definitional one. */
  cite: string
}

export interface Cat3PricedLine {
  row_id: string
  location: string
  stream: Cat3Stream
  line: Cat3LineKind
  activity_as_entered: number
  unit_as_entered: string
  activity_priced: number
  unit_priced: string
  /** null only on the New Zealand 3c line, which is the engine's figure rather than a DEFRA product. */
  conversion: Cat3Conversion | null
  factor: { key: string; kg_co2e: number; unit: string; sheet: string; cell: string } | null
  /** Full precision, never rounded here. */
  kg_co2e: number
  entry_method: string | null
  flags: Cat3Flag[]
  /** FI6: the line's own citation and method sentence, where it is not a DEFRA line (NGA's Australian lines). */
  note?: string
  /** T3c (R18): the edition the window selected for this line, with its basis. Absent on the NZ 3c line (the
   *  engine's own figure, selected there). */
  edition?: { label: string; rule: string; basis: string; provisional: boolean }
}

export interface Cat3Unpriced {
  row_id: string
  location: string
  stream: Cat3Stream
  reason: Cat3Reason
}

export type Cat3Withheld =
  | { code: 'undeclared_streams'; streams: string[] }
  | { code: 'nothing_priced' }

export interface Cat3Result {
  /** 'priced' with a figure, 'zero' where there is nothing to price, 'withheld' where a figure would lie. */
  status: 'priced' | 'zero' | 'withheld'
  lines: Cat3PricedLine[]
  /** The sum of the lines, in kg CO2e, full precision. 0 when the status is 'zero'. */
  kg_co2e: number
  unpriced: Cat3Unpriced[]
  /** Why there is no figure. null when there is one. */
  withheld: Cat3Withheld | null
  /** Why a zero is a zero rather than an absence. null unless the status is 'zero'. */
  zero_basis: { code: 'no_rows' } | null
  /** Carried so a surface can disclose the basis without importing the artefact. */
  meta: { gwp_basis: string; source: string; edition: string }
}

// ── THE FACTOR TABLE: STREAM AND UNIT TO A PUBLISHED ROW ─────────────────────────────────────────
//
// ⚠️ EVERY UNIT THE GHG SIDE CAN STORE IS NAMED HERE OR HAS A REASON. lib/ghg/engine.ts's Location type
// allows: natural gas mcf | therms | mmbtu | m3 | kwh; propane gallons | litres | kg; stationary and
// mobile diesel, petrol and both fuel oils gallons | litres; electricity kWh; purchased steam mmbtu |
// gj | kwh. Refrigerants are kg of a gas and are NOT a Category 3 input at all (Technical Guidance
// table 3.1, p. 39, covers fuels and energy). Anything else is unit_not_published, by name.

/** A conversion the DEFRA artefact publishes, optionally scaled by an exact multiple (mcf is 1,000 ft3). */
function defraConversion(year: number, key: string, from: string, to: string, scale = 1): Cat3Conversion {
  const c = energyConversion(key, year)
  if (!c) throw new Error(`cat3Energy: the artefact publishes no conversion ${key}`)
  return {
    factor: c.factor * scale,
    from, to,
    source: 'defra',
    key,
    cite: `${c.sheet}!${c.cells.factor}${scale === 1 ? '' : ` x ${scale}`}`,
  }
}

/**
 * The two energy identities DEFRA does not publish in this artefact.
 *
 * ⚠️ EXACT, AND FROM THE REPO'S UNIT AUTHORITY. 1 kWh is 3.6 MJ by definition and 1 MMBtu is
 * 1.05505585262 GJ (International Table), both from lib/unitConversions.ts, which the GHG engine uses
 * for the same steam conversion. Using them rather than DEFRA's therm row for MMBtu is a deliberate
 * choice: it keeps MMBtu and GJ on one basis. The two paths differ by 4.5e-8 relative, which no
 * reported figure can see, and the line records which one priced it.
 */
const KWH_PER_MMBTU = GJ_PER_MMBTU * KWH_PER_GJ
const definitional = (factor: number, from: string, to: string, cite: string): Cat3Conversion =>
  ({ factor, from, to, source: 'definitional', cite })

interface FuelRoute { factorKey: string; conversion: (defraYear: number) => Cat3Conversion | null }

const FUEL_ROUTES: Record<Exclude<Cat3Stream, 'electricity' | 'purchased_steam' | 'refrigerants'>,
                          Record<string, FuelRoute>> = {
  natural_gas: {
    kwh: { factorKey: 'natural_gas_kwh_gross_cv', conversion: () => null },
    m3: { factorKey: 'natural_gas_cubic_metres', conversion: () => null },
    mcf: { factorKey: 'natural_gas_cubic_metres', conversion: y => defraConversion(y, 'cubic_foot_to_cubic_metre', 'mcf', 'm3', 1000) },
    therms: { factorKey: 'natural_gas_kwh_gross_cv', conversion: y => defraConversion(y, 'therm_to_kwh', 'therms', 'kWh') },
    mmbtu: { factorKey: 'natural_gas_kwh_gross_cv', conversion: () => definitional(KWH_PER_MMBTU, 'mmbtu', 'kWh', 'GJ_PER_MMBTU x KWH_PER_GJ (lib/unitConversions.ts)') },
  },
  propane: {
    litres: { factorKey: 'propane_litres', conversion: () => null },
    gallons: { factorKey: 'propane_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
    kg: { factorKey: 'propane_tonnes', conversion: y => defraConversion(y, 'kilogram_to_tonne', 'kg', 'tonnes') },
  },
  diesel_stationary: {
    litres: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
  },
  mobile_diesel: {
    litres: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
  },
  mobile_gasoline: {
    litres: { factorKey: 'petrol_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'petrol_average_biofuel_blend_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
  },
  fuel_oil_distillate: {
    litres: { factorKey: 'fuel_oil_distillate_litres', conversion: () => null },
    gallons: { factorKey: 'fuel_oil_distillate_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
  },
  fuel_oil_residual: {
    litres: { factorKey: 'fuel_oil_residual_litres', conversion: () => null },
    gallons: { factorKey: 'fuel_oil_residual_litres', conversion: y => defraConversion(y, 'us_gallon_to_litre', 'gallons', 'litres') },
  },
}

/** Purchased steam and heat: every published row is per kWh, so a GJ or MMBtu figure converts first. */
const STEAM_CONVERSIONS: Record<string, () => Cat3Conversion | null> = {
  kwh: () => null,
  gj: () => definitional(KWH_PER_GJ, 'gj', 'kWh', 'KWH_PER_GJ (lib/unitConversions.ts, 1 kWh = 3.6 MJ exactly)'),
  mmbtu: () => definitional(KWH_PER_MMBTU, 'mmbtu', 'kWh', 'GJ_PER_MMBTU x KWH_PER_GJ (lib/unitConversions.ts)'),
}

const ELECTRICITY_LINES: [Cat3LineKind, string][] = [
  ['electricity_generation_wtt', 'electricity_generation_wtt'],
  ['electricity_td_loss', 'electricity_td_loss'],
  ['electricity_td_wtt', 'electricity_td_wtt'],
]
const STEAM_LINES: [Cat3LineKind, string][] = [
  ['steam_wtt', 'district_heat_steam_wtt'],
  ['steam_distribution_loss', 'district_heat_steam_distribution_loss'],
  ['steam_distribution_wtt', 'district_heat_steam_distribution_wtt'],
]

// ── PRICING ───────────────────────────────────────────────────────────────────────────────────────

const UK = new Set(['GB', 'UK'])

/** ⚠️ FUELS TOO, NOT ONLY ELECTRICITY AND HEAT. A DEFRA factor at a non-UK location is a stand-in
 *  whatever it prices, and an unresolved country is treated as non-UK: over-disclosing is harmless,
 *  a missing flag is a false claim. */
function standInFlags(row: Cat3InputRow): Cat3Flag[] {
  const country = (row.country ?? '').toUpperCase().trim()
  const flags: Cat3Flag[] = []
  if (!row.country_resolved) flags.push({ code: 'country_unresolved' })
  if (!row.country_resolved || !UK.has(country)) {
    flags.push({ code: 'uk_stand_in', country: row.country, scope1_publisher: row.scope1_publisher ?? null })
  }
  return flags
}

function priced(
  row: Cat3InputRow, line: Cat3LineKind, factorKey: string, conversion: Cat3Conversion | null, defraYear: number,
): Cat3PricedLine {
  // T3d: the DEFRA edition the window selected (eds.defra), never a fixed one.
  const factor = energyFactor(factorKey, defraYear) as EnergyFuelFactor | EnergyLineFactor | null
  if (!factor) throw new Error(`cat3Energy: the DEFRA ${defraYear} artefact holds no factor ${factorKey}`)
  const activityPriced = conversion ? row.activity * conversion.factor : row.activity
  return {
    row_id: row.id,
    location: row.location,
    stream: row.stream,
    line,
    activity_as_entered: row.activity,
    unit_as_entered: row.unit,
    activity_priced: activityPriced,
    unit_priced: conversion ? conversion.to : row.unit,
    conversion,
    factor: {
      key: factor.key,
      // ⚠️ THE PUBLISHED TOTAL, NEVER A SUM OF THE GAS SPLIT. DEFRA rounds each column to five decimal
      // places, so the split adds to slightly more than the total it sits beside; see
      // DEFRA_ENERGY_META.gas_split_rounding_note and defraEnergy.test.ts E10.
      kg_co2e: factor.kg_co2e,
      unit: factor.unit,
      sheet: factor.sheet,
      cell: factor.cells.kg_co2e,
    },
    kg_co2e: activityPriced * factor.kg_co2e,
    entry_method: row.entry_method ?? null,
    flags: standInFlags(row),
  }
}

// ── AUSTRALIA: NGA 2025 SCOPE 3 FOR GAS AND ELECTRICITY (FI6, ruling R15) ──────────────────────────
//
// An Australian site's gas and electricity are priced from DCCEEW's own Scope 3 factors, by state, not from the UK
// stand-in. Every other Australian stream (liquids, LPG, steam) keeps the DEFRA stand-in and its flag. The NGA Table 2
// market-based Scope 3 figure is not read: Category 3 rests on the location-based row (CAT3_LOCATION_BASED_SENTENCE).

/** T3d: the NGA editions held for Category 3, with the printed page of each note the lines quote (the 2024 edition's
 *  Table 5 and 6 notes run a page earlier than 2025's). The edition a line uses is the window's (eds.nga). */
const NGA_PAGES: Readonly<Record<string, { instruction: number; metro: number; leakage: number; formula: number; ecNotes: number }>> = {
  '2023': { instruction: 18, metro: 17, leakage: 18, formula: 18, ecNotes: 17 },   // printed pages (one less than the PDF's)
  '2024': { instruction: 19, metro: 18, leakage: 19, formula: 19, ecNotes: 18 },
  '2025': { instruction: 20, metro: 20, leakage: 20, formula: 20, ecNotes: 19 },
  '2026': { instruction: 21, metro: 21, leakage: 21, formula: 21, ecNotes: 20 },
}

/** The state as the wizard stores it, to NGA's Table 1 row. WA and the NT use the grids the Scope 2 factor uses
 *  (detectGridRegion maps WA to SWIS and the NT to DKIS); NSW and the ACT share a row. */
const NGA_ELECTRICITY_ROW: Readonly<Record<string, NgaElectricityRow>> = {
  NSW: 'NSW_ACT', ACT: 'NSW_ACT', VIC: 'VIC', QLD: 'QLD', SA: 'SA', WA: 'WA_SWIS', TAS: 'TAS', NT: 'NT_DKIS',
}
const NGA_GRID_SENTENCE: Readonly<Record<string, string>> = {
  WA: 'Western Australia uses the South West Interconnected System (SWIS) row, the grid the Scope 2 factor for this site uses.',
  NT: 'The Northern Territory uses the Darwin Katherine Interconnected System (DKIS) row, the grid the Scope 2 factor for this site uses.',
}

/** NGA Table 6 notes, p. 20, verbatim (R15 a). */
export const NGA_TAS_NT_GAS_INSTRUCTION =
  'It is suggested that for Tasmania the use of the Victorian emission factors is appropriate, while for ' +
  'Northern Territory the use of the Western Australian emission factors is appropriate.'
/** NGA Table 6 notes, p. 20, verbatim (R15 b). */
export const NGA_METRO_DEFINITION =
  'Metro is defined as located on or east of the dividing range in NSW, including Canberra and Queanbeyan, ' +
  'Melbourne, Brisbane, Adelaide or Perth. Otherwise, the non-metro factor should be used.'

/** NGA Table 5, natural gas distributed in a pipeline: the energy content NGA's own formula (p. 20) applies with Table
 *  6. 0.0393 GJ/m3, measured at 101.325 kPa and 15.0 degrees Celsius (Table 5 notes, p. 19). */
const NGA_GJ_PER_M3 = 0.0393   // the same in the 2024 and 2025 editions (Table 5, p. 17 and p. 19)
const ngaEcCite = (ed: string) => `NGA ${ed} Table 5, natural gas distributed in a pipeline, 0.0393 GJ/m3, the energy content NGA's formula on p. ${NGA_PAGES[ed].formula} applies with Table 6`

const ngaGasConversion = (unit: string, ed: string): Cat3Conversion | null | undefined => {
  const NGA_EC_CITE = ngaEcCite(ed)
  switch (unit) {
    case 'gj': return null
    case 'm3': return { factor: NGA_GJ_PER_M3, from: 'm3', to: 'GJ', source: 'nga', cite: NGA_EC_CITE }
    case 'mcf': return { factor: EXACT_CONVERSIONS.M3_PER_MCF * NGA_GJ_PER_M3, from: 'mcf', to: 'GJ', source: 'nga',
      cite: `1 Mcf = ${EXACT_CONVERSIONS.M3_PER_MCF} m3 exactly (M3_PER_MCF, lib/unitConversions.ts), then ${NGA_EC_CITE}` }
    case 'mmbtu': return definitional(GJ_PER_MMBTU, 'mmbtu', 'GJ', 'GJ_PER_MMBTU (lib/unitConversions.ts)')
    case 'therms': return definitional(EXACT_CONVERSIONS.GJ_PER_THERM, 'therms', 'GJ', 'GJ_PER_THERM (lib/unitConversions.ts)')
    case 'kwh': return definitional(EXACT_CONVERSIONS.GJ_PER_KWH, 'kwh', 'GJ', 'GJ_PER_KWH (lib/unitConversions.ts, 1 kWh = 3.6 MJ exactly)')
    case 'mj': return definitional(EXACT_CONVERSIONS.GJ_PER_MJ, 'mj', 'GJ', 'GJ_PER_MJ (lib/unitConversions.ts)')
    default: return undefined
  }
}

const isAu = (row: Cat3InputRow): boolean => row.country_resolved && (row.country ?? '').toUpperCase().trim() === 'AU'
const auState = (row: Cat3InputRow): string => (row.au_state ?? '').toUpperCase().trim()

function ngaLine(
  row: Cat3InputRow, line: Cat3LineKind, f: NgaCited, conversion: Cat3Conversion | null, unitPriced: string, note: string, NGA_EDITION: string,
): Cat3PricedLine {
  const activityPriced = conversion ? row.activity * conversion.factor : row.activity
  return {
    row_id: row.id, location: row.location, stream: row.stream, line,
    activity_as_entered: row.activity, unit_as_entered: row.unit,
    activity_priced: activityPriced, unit_priced: unitPriced,
    conversion,
    // T3d: the 2024 edition is a PDF only, so its record has a printed page and no workbook cell.
    factor: { key: `nga_${NGA_EDITION}_${f.table.split(' ').slice(0, 2).join('_').toLowerCase()}_${f.cell ?? `p${f.page}`}`,
      kg_co2e: f.value as number, unit: f.unit === 'kg CO2-e/kWh' ? 'kWh' : 'GJ',
      sheet: `NGA ${NGA_EDITION} ${f.table.split(' ').slice(0, 2).join(' ')}`, cell: f.cell ?? `p. ${f.page}` },
    kg_co2e: activityPriced * (f.value as number),
    entry_method: row.entry_method ?? null,
    // No uk_stand_in: the factor is the site's own country's publisher.
    flags: [],
    note,
  }
}

/** Australian electricity: one NGA Table 1 line, which includes grid losses (R15 c). Replaces DEFRA's three lines. */
function priceAuElectricity(row: Cat3InputRow, lines: Cat3PricedLine[], reject: (r: Cat3Reason) => void, NGA_EDITION: string): void {
  const key = NGA_ELECTRICITY_ROW[auState(row)]
  if (!key) { reject({ code: 'au_state_missing', location: row.location }); return }
  const f = ngaScope3(NGA_EDITION)!.electricity[key]
  const grid = NGA_GRID_SENTENCE[auState(row)]
  lines.push(ngaLine(row, 'electricity_nga_scope3', f, null, 'kWh',
    `NGA ${NGA_EDITION}, Table 1, Scope 3, ${f.row}: ${f.printed} kg CO2-e/kWh. This factor includes electricity lost ` +
    `in the grid, so there is no separate transmission and distribution line.${grid ? ` ${grid}` : ''}`, NGA_EDITION))
}

/** Australian natural gas: NGA Table 6 for the state and area, per GJ (R15 a, b). */
function priceAuGas(row: Cat3InputRow, unit: string | null, lines: Cat3PricedLine[], reject: (r: Cat3Reason) => void, NGA_EDITION: string): void {
  const pages = NGA_PAGES[NGA_EDITION]
  const state = auState(row)
  if (!NGA_ELECTRICITY_ROW[state]) { reject({ code: 'au_state_missing', location: row.location }); return }
  const conversion = unit ? ngaGasConversion(unit, NGA_EDITION) : undefined
  if (conversion === undefined) { reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit }); return }
  const gas = ngaScope3(NGA_EDITION)!.naturalGas
  let f: NgaCited
  let extra = ''
  if (state === 'TAS' || state === 'NT') {
    // NGA prints "C" for both; its note directs Victoria's factors for Tasmania and Western Australia's for the NT.
    // Neither names a metro area, so the non-metro factor applies (R15 b), and the area is not asked.
    f = (state === 'TAS' ? gas.VIC : gas.WA).non_metro
    extra = ` NGA prints no factor for ${state === 'TAS' ? 'Tasmania' : 'the Northern Territory'} (C, confidential) ` +
      `and says: "${NGA_TAS_NT_GAS_INSTRUCTION}" (Table 6 notes, p. ${pages.instruction}). No metro area is named there, so the ` +
      `non-metro factor applies.`
  } else if (state === 'VIC') {
    // 4.0 either way, so the area is not asked; the chosen one is cited if there is one.
    f = gas.VIC[row.au_gas_area ?? 'metro']
    if (!row.au_gas_area) extra = ' Victoria\'s Metro and Non-metro factors are both 4.0, so the area is not asked.'
  } else {
    // AU_GAS_AREA_STATES: the states the wizard asks the area in, so every one of them reaches here.
    if (!AU_GAS_AREA_STATES.includes(state) || !row.au_gas_area) { reject({ code: 'au_gas_area_missing', location: row.location }); return }
    const r: NgaGasRow = state === 'NSW' || state === 'ACT' ? 'NSW_ACT' : state as NgaGasRow
    f = gas[r][row.au_gas_area]
  }
  const area = f.column.endsWith('Non-Metro') ? 'Non-metro' : 'Metro'
  // The conversion to GJ is not repeated here: the line's own arithmetic (cat3LineText, the CSV) states it, with its cite.
  lines.push(ngaLine(row, 'fuel_wtt', f, conversion, 'GJ',
    `NGA ${NGA_EDITION}, Table 6, ${f.row}, ${area}: ${f.printed} kg CO2-e/GJ. NGA's Scope 3 gas factors ` +
    `exclude leakage from low-pressure distribution pipelines (p. ${pages.leakage}).${extra}`, NGA_EDITION))
}

/** T3c (R18): the edition a Category 3 line is priced on, as the engine selected it. */
export interface Cat3EditionCell { label: string; rule: string; basis: string; provisional: boolean; /** The edition year (class (a)). */ key: number | null }
/**
 * T3c (R18): one Category 3 edition for the window, or why it is missing. Selected by the engine's selectEdition and
 * passed in (lib/scope3/cat3Editions.ts builds it), so this module still imports nothing from lib/ghg.
 */
export type Cat3Edition =
  | { held: Cat3EditionCell }
  | { missing: { edition: string; sentence: (site: string) => string } }
/** T3c (R18): the two Category 3 editions for the window: DEFRA well-to-tank and T&D, and NGA Scope 3. */
export interface Cat3Editions { defra: Cat3Edition; nga: Cat3Edition }
/** T3d: the NGA Scope 3 edition a line is priced on, as the table key ('2024', '2025'). After `missing(eds.nga)`. */
function ngaEditionOf(eds: Cat3Editions): string {
  if (!('held' in eds.nga) || eds.nga.held.key === null || !NGA_PAGES[String(eds.nga.held.key)]) throw new Error('cat3Energy: no NGA Scope 3 edition held for this window')
  return String(eds.nga.held.key)
}
/** The DEFRA edition year a line is priced on. Called only after `missing(eds.defra)` has returned false. */
function defraYearOf(eds: Cat3Editions): number {
  if (!('held' in eds.defra) || eds.defra.held.key === null) throw new Error('cat3Energy: no DEFRA edition held for this window')
  return eds.defra.held.key
}

function priceRow(row: Cat3InputRow, lines: Cat3PricedLine[], unpriced: Cat3Unpriced[], eds: Cat3Editions): void {
  const reject = (reason: Cat3Reason) =>
    unpriced.push({ row_id: row.id, location: row.location, stream: row.stream, reason })
  // T3c (R18): a line whose edition is missing is unpriced with the engine's message, never priced on another edition.
  // The engine's sentence without its export clause: a Category 3 line that is not counted does not block a GHG export.
  const missing = (e: Cat3Edition) => {
    if ('held' in e) return false
    reject({ code: 'edition_missing', edition: e.missing.edition,
      message: e.missing.sentence(row.location).replace(/ Export is blocked until they are loaded\.$/, '') })
    return true
  }

  if (row.stream === 'refrigerants') {
    // ⚠️ REJECTED BY NAME, NOT DROPPED. Refrigerants are Scope 1 fugitive emissions with no upstream
    // row in this artefact, and the Technical Guidance's table 3.1 covers fuels and energy only. A row
    // that arrives here is an adapter defect, and a silent skip would hide it.
    reject({ code: 'refrigerants_not_in_category' })
    return
  }
  if (!Number.isFinite(row.activity)) {
    reject({ code: 'activity_not_a_number', unit: row.unit })
    return
  }
  const unit = normalizeUnit(row.unit)

  if (row.stream === 'electricity') {
    if (row.scope2_method === 'market-based') {
      // The location-based row carries the same site's kWh; pricing both would double it.
      reject({ code: 'market_based_row_not_used' })
      return
    }
    if (unit !== 'kwh') {
      reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit })
      return
    }
    if (isAu(row)) {
      if (missing(eds.nga)) return
      priceAuElectricity(row, lines, reject, ngaEditionOf(eds)); return
    }
    const isNz = (row.country ?? '').toUpperCase().trim() === 'NZ'
    let defraMissingSaid = false
    for (const [line, key] of ELECTRICITY_LINES) {
      if (line === 'electricity_td_loss' && isNz) {
        // ⚠️ NEW ZEALAND'S 3c IS THE ENGINE'S OWN FIGURE, NEVER RECOMPUTED. lib/ghg/engine.ts already
        // prices MfE's T&D loss for an NZ location and puts it in the workings as a Scope 3 Cat 3 row;
        // pricing it again from DEFRA would report a different number for the same loss.
        if (row.nz_td_result_tco2e == null || !Number.isFinite(row.nz_td_result_tco2e)) {
          reject({ code: 'no_nz_td_figure', location: row.location })
          continue
        }
        lines.push({
          row_id: row.id, location: row.location, stream: row.stream, line,
          activity_as_entered: row.activity, unit_as_entered: row.unit,
          activity_priced: row.activity, unit_priced: row.unit,
          conversion: null, factor: null,
          // The engine publishes tonnes; this module works in kg. An exact unit identity, not a re-pricing.
          kg_co2e: row.nz_td_result_tco2e * 1000,
          entry_method: row.entry_method ?? null,
          flags: [{ code: 'nz_mfe_3c', source: 'lib/ghg/engine.ts s3_td (MfE)' }],
        })
        continue
      }
      if ('missing' in eds.defra) { if (!defraMissingSaid) missing(eds.defra); defraMissingSaid = true; continue }
      lines.push(priced(row, line, key, null, defraYearOf(eds)))
    }
    return
  }

  if (row.stream === 'purchased_steam') {
    const make = unit ? STEAM_CONVERSIONS[unit] : undefined
    if (!make) {
      reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit })
      return
    }
    if (missing(eds.defra)) return
    for (const [line, key] of STEAM_LINES) lines.push(priced(row, line, key, make(), defraYearOf(eds)))
    return
  }

  if (row.stream === 'natural_gas' && isAu(row)) {
    if (missing(eds.nga)) return
    priceAuGas(row, unit, lines, reject, ngaEditionOf(eds)); return
  }
  const routes = FUEL_ROUTES[row.stream]
  const route = unit ? routes[unit] : undefined
  if (!route) {
    reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit })
    return
  }
  if (missing(eds.defra)) return
  lines.push(priced(row, 'fuel_wtt', route.factorKey, route.conversion(defraYearOf(eds)), defraYearOf(eds)))
}

/**
 * Category 3 from the bound inventory's energy, or the reason there is no figure.
 *
 * ⚠️ A ZERO AND AN ABSENCE ARE DIFFERENT ANSWERS, AND DECISION 6 IS WHERE THEY PART. Every stream
 * answered and none carrying data is a real zero, with its basis recorded. A stream nobody answered
 * means the inventory does not yet say what it burns, and a zero would assert something the customer
 * never said: that withholds, naming the streams.
 */
export function priceCat3(inputs: Cat3Inputs, eds: Cat3Editions): Cat3Result {
  // T3d: the selected DEFRA edition's own record; the newest edition's when none is held for the window.
  const m = 'held' in eds.defra && eds.defra.held.key !== null && DEFRA_ENERGY_YEARS.includes(eds.defra.held.key)
    ? defraEnergyMetaFor(eds.defra.held.key) : DEFRA_ENERGY_META
  const meta = {
    gwp_basis: m.gwp_basis,
    source: m.source,
    edition: m.edition,
  }
  const undeclared = [...inputs.declaration.undeclared]
  if (undeclared.length > 0) {
    return { status: 'withheld', lines: [], kg_co2e: 0, unpriced: [],
             withheld: { code: 'undeclared_streams', streams: undeclared }, zero_basis: null, meta }
  }
  if (inputs.rows.length === 0) {
    return { status: 'zero', lines: [], kg_co2e: 0, unpriced: [], withheld: null,
             zero_basis: { code: 'no_rows' }, meta }
  }
  const lines: Cat3PricedLine[] = []
  const unpriced: Cat3Unpriced[] = []
  for (const row of inputs.rows) {
    const before = lines.length
    priceRow(row, lines, unpriced, eds)
    for (const l of lines.slice(before)) {
      if (l.flags.some(f => f.code === 'nz_mfe_3c')) continue
      const u = l.note ? eds.nga : eds.defra
      if ('held' in u) l.edition = { ...u.held }
    }
  }
  if (lines.length === 0) {
    // Rows arrived and none could be priced: a figure of zero would be a claim about emissions when
    // what happened is that nothing was priceable. The reasons say which rows and why.
    return { status: 'withheld', lines, kg_co2e: 0, unpriced, withheld: { code: 'nothing_priced' },
             zero_basis: null, meta }
  }
  return {
    status: 'priced',
    lines,
    kg_co2e: lines.reduce((sum, l) => sum + l.kg_co2e, 0),
    unpriced,
    withheld: null,
    zero_basis: null,
    meta,
  }
}
