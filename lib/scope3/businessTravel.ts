// ── CATEGORY 6, BUSINESS TRAVEL: FLIGHT LEGS AND RAIL JOURNEYS, PRICED FROM DEFRA/DESNZ 2026 ────────
//
// ONE evaluation of a Cat 6 record, read by the figure, the calculated flag, the confidence, the panel,
// the workings, the CSV and factor_basis, so none of them can price a row differently. It reads only the
// record it is given (catData[catId]), which is what lets rowPriced.ts dispatch to it by the category's
// own id, as it does for Cats 5 and 12.
//
// THE FACTORS are lib/emissionFactors/defraTravel2026.json, read through defraTravel.ts. Nothing here
// holds a number from the workbook.
//
// THE CATEGORY RULE, per flight leg:
//   both ends UK       domestic
//   one end UK         the haul the Haul definition sheet gives the other end
//   neither end UK     by distance: domestic under 482.8032 km, short-haul from 482.8032 km to under
//                      3,701.4912 km, long-haul from 3,701.4912 km
// ⚠️ THE THIRD LINE DEPARTS FROM THE SHEET. For flights between two non-UK countries the sheet offers one
// "International, to/from non-UK" factor, an average of UK short- and long-haul (Business travel- air
// A56), which does not depend on distance. The bands are the US EPA GHG Emission Factors Hub's (2025),
// 300 and 2,300 miles: cited as the precedent for banding by distance, with NO EPA figure used. The
// disclosure says both things (businessTravelCopy.ts). So Toronto to Vancouver, about 3,350 km, is
// short-haul; New York to Los Angeles, about 3,940 km, is long-haul.
//
// ⚠️ NOTHING DEFAULTS TO ZERO. A leg missing a country, a distance or a count is not priced and names
// what is missing; a leg with a UK end whose other country the sheet does not list is not priced and
// says so. Neither contributes 0 to the figure, and neither makes the category "calculated".

import {
  airFactor, airRecord, wttAirFactor, wttAirRecord, railFactor, wttRailFactor, RAIL_RECORDS, WTT_RAIL_RECORDS,
  type AirCategory, type CabinClass, type GasSplit, type HaulRecord, HAUL_RECORDS,
} from '../emissionFactors/defraTravel'
import { haulIso3ForIso2, isUkIso2 } from './travelCountries'

// ── DISTANCE ─────────────────────────────────────────────────────────────────────────────────────

/** The international mile, exactly. */
export const KM_PER_MILE = 1.609344

export type DistanceUnit = 'km' | 'mi'

/** Under this, a flight with neither end in the UK is domestic: 300 miles. */
export const NON_UK_SHORT_HAUL_FROM_KM = 482.8032
/** From this, a flight with neither end in the UK is long-haul: 2,300 miles. */
export const NON_UK_LONG_HAUL_FROM_KM = 3701.4912

/**
 * ⚠️ THE ONE CONVERSION. The page calls this when a distance or its unit is edited, and stores all three:
 * the figure as entered, its unit, and the km figure. Pricing reads the stored km figure and never
 * converts again. A distance that is not a positive finite number has no km figure.
 */
export function withDistance(distance: number | undefined, unit: DistanceUnit): { distance: number | undefined; distance_unit: DistanceUnit; distance_km: number | undefined } {
  const ok = distance !== undefined && Number.isFinite(distance) && distance > 0
  return { distance, distance_unit: unit, distance_km: ok ? (unit === 'mi' ? distance * KM_PER_MILE : distance) : undefined }
}

// ── ROWS AS STORED ───────────────────────────────────────────────────────────────────────────────

export type CabinChoice = 'economy' | 'premium_economy' | 'business' | 'first' | 'unknown'

export const CABIN_CHOICES: readonly { value: CabinChoice; label: string }[] = [
  { value: 'economy', label: 'Economy' },
  { value: 'premium_economy', label: 'Premium economy' },
  { value: 'business', label: 'Business' },
  { value: 'first', label: 'First' },
  { value: 'unknown', label: 'Unknown' },
]

export interface FlightRow {
  id: string
  origin_iso2: string
  destination_iso2: string
  /** '' until chosen: an unchosen class is missing, never defaulted. 'unknown' is a choice. */
  cabin_class: CabinChoice | ''
  /** Passengers, or trips, flown on this leg. Multiplies the one-way distance. */
  count: number | undefined
  /** One-way, direct distance as entered, in distance_unit. */
  distance: number | undefined
  distance_unit: DistanceUnit
  /** distance converted once, by withDistance. */
  distance_km: number | undefined
}

export interface RailJourney {
  id: string
  country_iso2: string
  rail_type: string
  distance: number | undefined
  distance_unit: DistanceUnit
  distance_km: number | undefined
  passengers: number | undefined
}

/** The Cat 6 fields this module reads. Stored in cat_data.cat6. */
export interface BusinessTravelData {
  flights?: FlightRow[]
  rail_journeys?: RailJourney[]
  /** Radiative forcing, one setting per inventory. Absent means INCLUDED, the default. */
  include_rf?: boolean
}

/** Is radiative forcing included for this record? It is unless the customer turned it off. */
export const includesRf = (d: BusinessTravelData | undefined): boolean => d?.include_rf !== false

const positive = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0

/**
 * ⚠️ THE STORED km FIGURE IS PRICED, AND IT MUST BE THE ONE THE ENTERED DISTANCE GIVES. The page writes all
 * three through withDistance, so they always agree there. A row that arrives any other way (saved by an
 * older build, edited outside the page) could carry a distance with no km figure, or a km figure for a
 * different distance. Pricing either would be wrong, and calling the distance "not entered" would be
 * false, so such a row is not priced and says what is wrong with it.
 */
function storedKm(row: { distance: number | undefined; distance_unit: DistanceUnit; distance_km: number | undefined }): number | 'missing' | 'mismatch' {
  const expected = withDistance(row.distance, row.distance_unit).distance_km
  if (expected === undefined) return 'missing'
  if (row.distance_km === undefined || !Number.isFinite(row.distance_km) || Math.abs(row.distance_km - expected) > 1e-9 * expected) return 'mismatch'
  return row.distance_km
}

// ── THE CATEGORY RULE ────────────────────────────────────────────────────────────────────────────

export type FlightCategoryRule = 'both_uk' | 'uk_end' | 'distance_band'

export type FlightCategory =
  | { ok: true; category: AirCategory; rule: FlightCategoryRule; haul?: HaulRecord }
  /** A UK-end flight whose other country the Haul definition sheet does not list. */
  | { ok: false; unlisted_iso2: string }

const HAUL_BY_ISO3 = new Map(HAUL_RECORDS.map(r => [r.iso3, r]))

export function flightCategory(originIso2: string, destinationIso2: string, km: number): FlightCategory {
  const ukO = isUkIso2(originIso2)
  const ukD = isUkIso2(destinationIso2)
  if (ukO && ukD) return { ok: true, category: 'domestic', rule: 'both_uk' }
  if (ukO || ukD) {
    const other = ukO ? destinationIso2 : originIso2
    const iso3 = haulIso3ForIso2(other)
    const haul = iso3 ? HAUL_BY_ISO3.get(iso3) : undefined
    if (!haul) return { ok: false, unlisted_iso2: other }
    return { ok: true, category: haul.haul, rule: 'uk_end', haul }
  }
  const category: AirCategory = km < NON_UK_SHORT_HAUL_FROM_KM ? 'domestic' : km < NON_UK_LONG_HAUL_FROM_KM ? 'short_haul' : 'long_haul'
  return { ok: true, category, rule: 'distance_band' }
}

// ── CABIN CLASS ──────────────────────────────────────────────────────────────────────────────────

export type ClassNote = 'as_entered' | 'unknown' | 'not_published'

/** The class the factor is read for: the one entered where the sheet publishes it for the category,
 *  otherwise average passenger, with why. */
export function resolveClass(category: AirCategory, choice: CabinChoice): { used: CabinClass; note: ClassNote } {
  if (choice === 'unknown') return { used: 'average_passenger', note: 'unknown' }
  if (airRecord(category, choice)) return { used: choice, note: 'as_entered' }
  return { used: 'average_passenger', note: 'not_published' }
}

// ── PRICING ONE FLIGHT ───────────────────────────────────────────────────────────────────────────

const scale = (g: GasSplit, k: number): GasSplit => ({ kg_co2e: g.kg_co2e * k, co2: g.co2 * k, ch4: g.ch4 * k, n2o: g.n2o * k })

export type FlightMissing = 'origin' | 'destination' | 'cabin class' | 'passengers or trips' | 'distance'

export interface PricedFlight {
  status: 'priced'
  km: number
  passenger_km: number
  category: AirCategory
  rule: FlightCategoryRule
  haul?: HaulRecord
  class_used: CabinClass
  class_note: ClassNote
  /** Per passenger.km, as published. */
  factor: { with_rf: GasSplit; without_rf: GasSplit; wtt: number }
  /** kg for this leg. Both combustion figures always; `combustion` is the one the RF setting chose. */
  kg: { with_rf: GasSplit; without_rf: GasSplit; combustion: number; wtt: number; total: number }
  cells: { air_with_rf: string; air_without_rf: string; wtt: string; haul?: string }
}

export type FlightPricing =
  | PricedFlight
  | { status: 'incomplete'; missing: FlightMissing[] }
  | { status: 'no_haul'; unlisted_iso2: string }
  /** The stored km figure is missing, or is not what the entered distance and unit give. */
  | { status: 'distance_mismatch' }

export function priceFlight(row: FlightRow, includeRf: boolean): FlightPricing {
  const missing: FlightMissing[] = []
  if (!row.origin_iso2) missing.push('origin')
  if (!row.destination_iso2) missing.push('destination')
  if (!row.cabin_class) missing.push('cabin class')
  if (!positive(row.count)) missing.push('passengers or trips')
  const km = storedKm(row)
  if (km === 'missing') missing.push('distance')
  if (km === 'missing' || missing.length > 0) return { status: 'incomplete', missing }
  if (km === 'mismatch') return { status: 'distance_mismatch' }

  const cat = flightCategory(row.origin_iso2, row.destination_iso2, km)
  if (!cat.ok) return { status: 'no_haul', unlisted_iso2: cat.unlisted_iso2 }
  const cls = resolveClass(cat.category, row.cabin_class as CabinChoice)
  // resolveClass only returns a class the sheet publishes for the category, and every category publishes
  // average passenger, so these lookups cannot miss; the non-null assertions say so rather than a 0.
  const rec = airRecord(cat.category, cls.used)!
  const wtt = wttAirRecord(cat.category, cls.used)!
  const pkm = km * row.count!
  const withRf = scale(airFactor(cat.category, cls.used, true)!, pkm)
  const withoutRf = scale(airFactor(cat.category, cls.used, false)!, pkm)
  const wttKg = wttAirFactor(cat.category, cls.used)! * pkm
  const combustion = includeRf ? withRf.kg_co2e : withoutRf.kg_co2e
  return {
    status: 'priced',
    km,
    passenger_km: pkm,
    category: cat.category,
    rule: cat.rule,
    haul: cat.haul,
    class_used: cls.used,
    class_note: cls.note,
    factor: { with_rf: rec.with_rf, without_rf: rec.without_rf, wtt: wtt.without_rf },
    kg: { with_rf: withRf, without_rf: withoutRf, combustion, wtt: wttKg, total: combustion + wttKg },
    cells: {
      air_with_rf: `${rec.sheet}!${rec.cells.with_rf}`,
      air_without_rf: `${rec.sheet}!${rec.cells.without_rf}`,
      wtt: `${wtt.sheet}!${wtt.cells.without_rf}`,
      ...(cat.haul ? { haul: `${cat.haul.sheet}!${cat.haul.cells}` } : {}),
    },
  }
}

// ── PRICING ONE RAIL JOURNEY ─────────────────────────────────────────────────────────────────────

export type RailMissing = 'country' | 'rail type' | 'distance' | 'passengers'

const RAIL_BY_TYPE = new Map(RAIL_RECORDS.map(r => [r.type as string, r]))
const WTT_RAIL_BY_TYPE = new Map(WTT_RAIL_RECORDS.map(r => [r.type as string, r]))

export interface PricedRail {
  status: 'priced'
  km: number
  passenger_km: number
  /** True outside the UK: the sheet's rail factors are UK figures, used here as a stand-in. */
  uk_stand_in: boolean
  factor: { combustion: GasSplit; wtt: number }
  kg: { combustion: number; wtt: number; total: number }
  cells: { rail: string; wtt: string }
}

export type RailPricing =
  | PricedRail
  | { status: 'incomplete'; missing: RailMissing[] }
  /** A saved type the artefact does not hold. The control cannot produce this. */
  | { status: 'no_factor' }
  | { status: 'distance_mismatch' }

export function priceRail(row: RailJourney): RailPricing {
  const missing: RailMissing[] = []
  if (!row.country_iso2) missing.push('country')
  if (!row.rail_type) missing.push('rail type')
  const storedDistance = storedKm(row)
  if (storedDistance === 'missing') missing.push('distance')
  if (!positive(row.passengers)) missing.push('passengers')
  if (storedDistance === 'missing' || missing.length > 0) return { status: 'incomplete', missing }
  if (storedDistance === 'mismatch') return { status: 'distance_mismatch' }
  const f = railFactor(row.rail_type)
  const w = wttRailFactor(row.rail_type)
  const rec = RAIL_BY_TYPE.get(row.rail_type)
  const wrec = WTT_RAIL_BY_TYPE.get(row.rail_type)
  if (!f || w === null || !rec || !wrec) return { status: 'no_factor' }
  const km = storedDistance
  const pkm = km * row.passengers!
  const combustion = f.kg_co2e * pkm
  const wtt = w * pkm
  return {
    status: 'priced',
    km,
    passenger_km: pkm,
    uk_stand_in: !isUkIso2(row.country_iso2),
    factor: { combustion: f, wtt: w },
    kg: { combustion, wtt, total: combustion + wtt },
    cells: { rail: `${rec.sheet}!${rec.cells.values}`, wtt: `${wrec.sheet}!${wrec.cells.value}` },
  }
}

// ── THE WHOLE RECORD ─────────────────────────────────────────────────────────────────────────────

export interface EvaluatedFlight { n: number; row: FlightRow; pricing: FlightPricing }
export interface EvaluatedRail { n: number; row: RailJourney; pricing: RailPricing }

export interface BusinessTravelEvaluation {
  includeRf: boolean
  flights: EvaluatedFlight[]
  rail: EvaluatedRail[]
  pricedFlights: (EvaluatedFlight & { pricing: PricedFlight })[]
  pricedRail: (EvaluatedRail & { pricing: PricedRail })[]
  /** kg over every priced row. `combustion` follows the RF setting; both air figures are kept. */
  kg: { air_with_rf: number; air_without_rf: number; combustion: number; wtt: number; total: number }
  mt: number
  /** At least one flight or rail row priced. An entered figure never makes it so. */
  calculated: boolean
}

export function evaluateBusinessTravel(d: BusinessTravelData | undefined): BusinessTravelEvaluation {
  const includeRf = includesRf(d)
  const flights = (d?.flights ?? []).map((row, i) => ({ n: i + 1, row, pricing: priceFlight(row, includeRf) }))
  const rail = (d?.rail_journeys ?? []).map((row, i) => ({ n: i + 1, row, pricing: priceRail(row) }))
  const pricedFlights = flights.filter((e): e is EvaluatedFlight & { pricing: PricedFlight } => e.pricing.status === 'priced')
  const pricedRail = rail.filter((e): e is EvaluatedRail & { pricing: PricedRail } => e.pricing.status === 'priced')
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const airWith = sum(pricedFlights.map(e => e.pricing.kg.with_rf.kg_co2e))
  const airWithout = sum(pricedFlights.map(e => e.pricing.kg.without_rf.kg_co2e))
  const railComb = sum(pricedRail.map(e => e.pricing.kg.combustion))
  const combustion = (includeRf ? airWith : airWithout) + railComb
  const wtt = sum(pricedFlights.map(e => e.pricing.kg.wtt)) + sum(pricedRail.map(e => e.pricing.kg.wtt))
  const total = combustion + wtt
  return {
    includeRf,
    flights,
    rail,
    pricedFlights,
    pricedRail,
    kg: { air_with_rf: airWith, air_without_rf: airWithout, combustion, wtt, total },
    mt: total / 1000,
    calculated: pricedFlights.length + pricedRail.length > 0,
  }
}
