// ── CATEGORY 3: WHAT THE BOUND GHG INVENTORY'S ENERGY COSTS UPSTREAM ─────────────────────────────
//
// Pure calculation. No React, no Supabase, no network, and NOTHING FROM lib/ghg/engine.ts: the Scope 3
// page loads this module, and the engine carries every factor table in the product. The two things this
// needs from outside are the DEFRA artefact (lib/emissionFactors/defraEnergy.ts, Task 1) and the two
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
  DEFRA_ENERGY_META, energyFactor, energyConversion,
  type EnergyFuelFactor, type EnergyLineFactor,
} from '../emissionFactors/defraEnergy'
import { normalizeUnit, GJ_PER_MMBTU, KWH_PER_GJ } from '../unitConversions'

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

export interface Cat3Conversion {
  factor: number
  from: string
  to: string
  /** 'defra' is a conversion the workbook publishes; 'definitional' is an exact unit identity. */
  source: 'defra' | 'definitional'
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
function defraConversion(key: string, from: string, to: string, scale = 1): Cat3Conversion {
  const c = energyConversion(key)
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

interface FuelRoute { factorKey: string; conversion: () => Cat3Conversion | null }

const FUEL_ROUTES: Record<Exclude<Cat3Stream, 'electricity' | 'purchased_steam' | 'refrigerants'>,
                          Record<string, FuelRoute>> = {
  natural_gas: {
    kwh: { factorKey: 'natural_gas_kwh_gross_cv', conversion: () => null },
    m3: { factorKey: 'natural_gas_cubic_metres', conversion: () => null },
    mcf: { factorKey: 'natural_gas_cubic_metres', conversion: () => defraConversion('cubic_foot_to_cubic_metre', 'mcf', 'm3', 1000) },
    therms: { factorKey: 'natural_gas_kwh_gross_cv', conversion: () => defraConversion('therm_to_kwh', 'therms', 'kWh') },
    mmbtu: { factorKey: 'natural_gas_kwh_gross_cv', conversion: () => definitional(KWH_PER_MMBTU, 'mmbtu', 'kWh', 'GJ_PER_MMBTU x KWH_PER_GJ (lib/unitConversions.ts)') },
  },
  propane: {
    litres: { factorKey: 'propane_litres', conversion: () => null },
    gallons: { factorKey: 'propane_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
    kg: { factorKey: 'propane_tonnes', conversion: () => defraConversion('kilogram_to_tonne', 'kg', 'tonnes') },
  },
  diesel_stationary: {
    litres: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
  },
  mobile_diesel: {
    litres: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'diesel_average_biofuel_blend_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
  },
  mobile_gasoline: {
    litres: { factorKey: 'petrol_average_biofuel_blend_litres', conversion: () => null },
    gallons: { factorKey: 'petrol_average_biofuel_blend_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
  },
  fuel_oil_distillate: {
    litres: { factorKey: 'fuel_oil_distillate_litres', conversion: () => null },
    gallons: { factorKey: 'fuel_oil_distillate_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
  },
  fuel_oil_residual: {
    litres: { factorKey: 'fuel_oil_residual_litres', conversion: () => null },
    gallons: { factorKey: 'fuel_oil_residual_litres', conversion: () => defraConversion('us_gallon_to_litre', 'gallons', 'litres') },
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
  row: Cat3InputRow, line: Cat3LineKind, factorKey: string, conversion: Cat3Conversion | null,
): Cat3PricedLine {
  const factor = energyFactor(factorKey) as EnergyFuelFactor | EnergyLineFactor | null
  if (!factor) throw new Error(`cat3Energy: the artefact holds no factor ${factorKey}`)
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

function priceRow(row: Cat3InputRow, lines: Cat3PricedLine[], unpriced: Cat3Unpriced[]): void {
  const reject = (reason: Cat3Reason) =>
    unpriced.push({ row_id: row.id, location: row.location, stream: row.stream, reason })

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
    const isNz = (row.country ?? '').toUpperCase().trim() === 'NZ'
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
      lines.push(priced(row, line, key, null))
    }
    return
  }

  if (row.stream === 'purchased_steam') {
    const make = unit ? STEAM_CONVERSIONS[unit] : undefined
    if (!make) {
      reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit })
      return
    }
    for (const [line, key] of STEAM_LINES) lines.push(priced(row, line, key, make()))
    return
  }

  const routes = FUEL_ROUTES[row.stream]
  const route = unit ? routes[unit] : undefined
  if (!route) {
    reject({ code: 'unit_not_published', stream: row.stream, unit: row.unit })
    return
  }
  lines.push(priced(row, 'fuel_wtt', route.factorKey, route.conversion()))
}

/**
 * Category 3 from the bound inventory's energy, or the reason there is no figure.
 *
 * ⚠️ A ZERO AND AN ABSENCE ARE DIFFERENT ANSWERS, AND DECISION 6 IS WHERE THEY PART. Every stream
 * answered and none carrying data is a real zero, with its basis recorded. A stream nobody answered
 * means the inventory does not yet say what it burns, and a zero would assert something the customer
 * never said: that withholds, naming the streams.
 */
export function priceCat3(inputs: Cat3Inputs): Cat3Result {
  const meta = {
    gwp_basis: DEFRA_ENERGY_META.gwp_basis,
    source: DEFRA_ENERGY_META.source,
    edition: DEFRA_ENERGY_META.edition,
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
  for (const row of inputs.rows) priceRow(row, lines, unpriced)
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
