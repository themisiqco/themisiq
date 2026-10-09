// ── CATEGORY 7, EMPLOYEE COMMUTING: GROUPS OF COMMUTERS AND HOMEWORKING, PRICED FROM DEFRA/DESNZ 2026 ──
//
// ONE evaluation of a Cat 7 record, read by the figure, the calculated flag, the confidence, the panel, the
// workings, the CSV and factor_basis. It reads only the record it is given (catData[catId]), which is what
// lets rowPriced.ts dispatch to it by the category's own id, as it does for Cats 5, 6 and 12.
//
// THE FACTORS are lib/emissionFactors/defraTravel2026.json through defraTravel.ts: 'Business travel- land'
// and its well-to-tank sheet for the journey, the Homeworking sheet for working from home. No number from
// the workbook is held here.
//
// THE FORMULA, per commuting row (GHG Protocol Technical Guidance, formula [7.1], p. 89):
//   annual distance per commuter = one-way km x 2 x days per week x weeks per year
//   passenger-km                 = employees x annual distance per commuter
//   per passenger-km modes       taxi, bus, coach, rail:  passenger-km x factor
//   per vehicle-km modes         car, motorbike:          passenger-km / occupancy x factor
//   plus well-to-tank on the same distance basis. Walking and cycling are an explicit zero.
//
// ⚠️ NO DEFAULT FOR ANY INPUT. The previous form priced a blank distance at 15 km, a missing mode as a
// petrol car, and every employee at 235 days a year less homeworking. Each of those was a figure nobody
// entered. Here a row missing a mode, a country, the employees, a distance, either day figure or (for a car
// or motorbike) its occupancy is not priced and names what is missing.
//
// ⚠️ OCCUPANCY IS ENTERED, NEVER ASSUMED, FOR CARS AND MOTORBIKES ALIKE. Both sheets' factors are per
// vehicle-km (Business travel- land A12): the whole vehicle. A car shared by two commuters must be halved,
// and one driven alone must not be, and only the customer knows which. A motorbike could have been treated
// as always carrying one person, but that is exactly the silent default this rule exists to remove, and a
// pillion commuter is possible; so it takes the same field, bounded at 2. Taxis use the sheet's
// per-passenger-km factor, which already reflects the sheet's own occupancy, so they need none.
//
// ⚠️ UK FACTORS EVERYWHERE, SAID EVERYWHERE THEY STAND IN. A row outside the UK is priced and flagged as
// using a UK factor as a stand-in, as Category 6 rail is. Electric cars and rail also carry UK grid
// electricity (land A14; What's new B22), which the row says. Homeworking is the exception: its factor is a
// UK average, mostly heating, and is not priced outside the UK at all.

import {
  defraTravelFor, DEFRA_TRAVEL_NEWEST, type DefraTravelTables,
  type CarSize, type CarFuel, type MotorbikeSize, type TaxiType, type BusType, type GasSplit,
} from '../emissionFactors/defraTravel'
import { withDistance, travelTables, type DistanceUnit, type TravelEditionMissing } from './businessTravel'
import type { DefraEdition, DefraEditionCell } from './defraEditionTypes'
import { isUkIso2 } from './travelCountries'

export { withDistance }

// ── ROWS AS STORED ───────────────────────────────────────────────────────────────────────────────

export type CommuteMode = 'car' | 'motorbike' | 'taxi' | 'bus' | 'coach' | 'rail' | 'walk_cycle'

export const COMMUTE_MODES: readonly { value: CommuteMode; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'bus', label: 'Bus' },
  { value: 'coach', label: 'Coach' },
  { value: 'rail', label: 'Rail, tram or underground' },
  { value: 'walk_cycle', label: 'Walking or cycling' },
]

/** The bus types a commuting row offers: every bus row except the coach, which is its own mode. */
export type CommuteBusType = Exclude<BusType, 'coach'>
/** The rail types a commuting row offers. International rail is not a commute. */
export type CommuteRailType = 'National rail' | 'Light rail and tram' | 'London Underground'
export const COMMUTE_RAIL_TYPES: readonly CommuteRailType[] = ['National rail', 'Light rail and tram', 'London Underground']

export interface CommuteRow {
  id: string
  /** '' until chosen: never preselected. */
  mode: CommuteMode | ''
  country_iso2: string
  employees: number | undefined
  car_size?: CarSize | ''
  car_fuel?: CarFuel | ''
  motorbike_size?: MotorbikeSize | ''
  taxi_type?: TaxiType | ''
  bus_type?: CommuteBusType | ''
  rail_type?: CommuteRailType | ''
  /** People per vehicle, car and motorbike only. Required there; never defaulted. */
  occupancy?: number
  distance: number | undefined
  distance_unit: DistanceUnit
  distance_km: number | undefined
  days_per_week: number | undefined
  weeks_per_year: number | undefined
}

export interface HomeworkingRow {
  id: string
  country_iso2: string
  employees: number | undefined
  days_per_week: number | undefined
  weeks_per_year: number | undefined
  hours_per_day: number | undefined
}

/** The Cat 7 fields this module reads. Stored in cat_data.cat7. */
export interface CommutingData {
  commute_rows?: CommuteRow[]
  homeworking_rows?: HomeworkingRow[]
}

// ── VALIDATION ───────────────────────────────────────────────────────────────────────────────────

const positive = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v) && v > 0

/** The bounds a figure must fall in to be read as what its label says. Outside them the row is not priced
 *  and the reason names the field: 235 typed as weeks is a mistake to show, not a figure to multiply. */
export const LIMITS = {
  days_per_week: 7,
  weeks_per_year: 53,
  hours_per_day: 24,
  car_occupancy_min: 1,
  // ⚠️ 7, THE LARGEST STANDARD PASSENGER CAR. A 7-seat MPV or SUV is still a car (DEFRA's own market segments
  // include MPV); an 8- or 9-seat vehicle is effectively a minibus, which the car factors do not describe.
  // Commuting survey averages run around 1.1 to 1.6, so 7 leaves room for any real figure, decimals included,
  // and catches the typo that priced 10 people per car in the click test (and a 1.8 typed as 18).
  car_occupancy_max: 7,
  motorbike_occupancy_min: 1,
  motorbike_occupancy_max: 2,
} as const

export type CommuteMissing =
  | 'mode' | 'country' | 'employees' | 'distance' | 'days per week' | 'weeks per year' | 'occupancy'
  | 'car size' | 'car fuel' | 'motorbike size' | 'taxi type' | 'bus type' | 'rail type'

/** A stored km figure that is missing or disagrees with the entered distance: as Category 6 treats it. */
function storedKm(row: { distance: number | undefined; distance_unit: DistanceUnit; distance_km: number | undefined }): number | 'missing' | 'mismatch' {
  const expected = withDistance(row.distance, row.distance_unit).distance_km
  if (expected === undefined) return 'missing'
  if (row.distance_km === undefined || !Number.isFinite(row.distance_km) || Math.abs(row.distance_km - expected) > 1e-9 * expected) return 'mismatch'
  return row.distance_km
}

// ── PRICING ONE COMMUTING ROW ────────────────────────────────────────────────────────────────────

/** Which factor a row reads, and on what distance basis. */
interface Factors {
  basis: 'vehicle_km' | 'passenger_km' | 'none'
  combustion: GasSplit
  wtt: number
  cells: { factor: string; wtt: string } | null
  /** The factor includes UK grid electricity: electric cars (land A14) and rail (What's new B22). */
  uk_electricity: boolean
}

const cellsOf = (r: { sheet: string; row: number; cells: Record<string, string> } | undefined, key: string) =>
  r ? `${r.sheet}!${r.cells[key]}` : ''

/** The newest edition's tables, used only to say which fields a row still needs when its edition is missing. */
const FIELD_CHECK_TABLES = defraTravelFor(DEFRA_TRAVEL_NEWEST)!

function factorsFor(row: CommuteRow, T: DefraTravelTables): Factors | { missing: CommuteMissing[] } | { no_factor: true } {
  switch (row.mode) {
    case 'car': {
      const missing: CommuteMissing[] = []
      if (!row.car_size) missing.push('car size')
      if (!row.car_fuel) missing.push('car fuel')
      if (missing.length) return { missing }
      const f = T.carFactor(row.car_size!, row.car_fuel!)
      const w = T.wttCarFactor(row.car_size!, row.car_fuel!)
      if (!f || w === null) return { no_factor: true }
      const rec = T.carRecord(row.car_size!, row.car_fuel!)!
      const wrec = T.WTT_CAR_RECORDS.find(r => r.size === row.car_size && r.fuel === row.car_fuel)
      return { basis: 'vehicle_km', combustion: f, wtt: w, cells: { factor: cellsOf(rec, 'values'), wtt: cellsOf(wrec, 'values') },
        uk_electricity: row.car_fuel === 'battery_electric' || row.car_fuel === 'plug_in_hybrid' }
    }
    case 'motorbike': {
      if (!row.motorbike_size) return { missing: ['motorbike size'] }
      const f = T.motorbikeFactor(row.motorbike_size), w = T.wttMotorbikeFactor(row.motorbike_size)
      if (!f || w === null) return { no_factor: true }
      return { basis: 'vehicle_km', combustion: f, wtt: w, uk_electricity: false,
        cells: { factor: cellsOf(T.MOTORBIKE_RECORDS.find(r => r.size === row.motorbike_size), 'values'),
                 wtt: cellsOf(T.WTT_MOTORBIKE_RECORDS.find(r => r.size === row.motorbike_size), 'values') } }
    }
    case 'taxi': {
      if (!row.taxi_type) return { missing: ['taxi type'] }
      const f = T.taxiFactor(row.taxi_type, 'passenger_km'), w = T.wttTaxiFactor(row.taxi_type, 'passenger_km')
      if (!f || w === null) return { no_factor: true }
      return { basis: 'passenger_km', combustion: f, wtt: w, uk_electricity: false,
        cells: { factor: cellsOf(T.TAXI_RECORDS.find(r => r.type === row.taxi_type && r.basis === 'passenger_km'), 'values'),
                 wtt: cellsOf(T.WTT_TAXI_RECORDS.find(r => r.type === row.taxi_type && r.basis === 'passenger_km'), 'values') } }
    }
    case 'bus':
    case 'coach': {
      const type: BusType | '' = row.mode === 'coach' ? 'coach' : (row.bus_type ?? '')
      if (!type) return { missing: ['bus type'] }
      const f = T.busFactor(type), w = T.wttBusFactor(type)
      if (!f || w === null) return { no_factor: true }
      return { basis: 'passenger_km', combustion: f, wtt: w, uk_electricity: false,
        cells: { factor: cellsOf(T.BUS_RECORDS.find(r => r.type === type), 'values'), wtt: cellsOf(T.WTT_BUS_RECORDS.find(r => r.type === type), 'values') } }
    }
    case 'rail': {
      if (!row.rail_type) return { missing: ['rail type'] }
      if (!COMMUTE_RAIL_TYPES.includes(row.rail_type)) return { no_factor: true }
      const f = T.railFactor(row.rail_type), w = T.wttRailFactor(row.rail_type)
      if (!f || w === null) return { no_factor: true }
      // T3e: claimed only where the edition says so (What's new B22, 2026); older editions state it nowhere read.
      return { basis: 'passenger_km', combustion: f, wtt: w, uk_electricity: !!T.META.guidance.whats_new_uk_electricity_knock_on,
        cells: { factor: cellsOf(T.RAIL_RECORDS.find(r => r.type === row.rail_type), 'values'),
                 wtt: cellsOf(T.WTT_RAIL_RECORDS.find(r => r.type === row.rail_type), 'value') } }
    }
    case 'walk_cycle':
      return { basis: 'none', combustion: { kg_co2e: 0, co2: 0, ch4: 0, n2o: 0 }, wtt: 0, cells: null, uk_electricity: false }
    default:
      return { missing: ['mode'] }
  }
}

export interface PricedCommute {
  status: 'priced'
  km: number
  /** One commuter's year: km x 2 x days per week x weeks per year. */
  annual_km_per_commuter: number
  passenger_km: number
  /** passenger_km / occupancy for cars and motorbikes; null for the per-passenger modes. */
  vehicle_km: number | null
  occupancy: number | null
  basis: Factors['basis']
  factor: { combustion: GasSplit; wtt: number }
  kg: { combustion: number; wtt: number; total: number }
  /** A UK factor used for a row outside the UK. False for walking and cycling, which use no factor. */
  uk_stand_in: boolean
  uk_electricity: boolean
  cells: { factor: string; wtt: string } | null
  /** T3e: the DEFRA edition the window selected. */
  edition: DefraEditionCell
}

export type CommutePricing =
  | PricedCommute
  | { status: 'incomplete'; missing: CommuteMissing[] }
  /** A figure outside what its label can mean; `field` names it. */
  | { status: 'invalid'; field: 'days per week' | 'weeks per year' | 'occupancy'; limit: string }
  | { status: 'distance_mismatch' }
  /** A saved choice the artefact does not hold. The controls cannot produce this. */
  | { status: 'no_factor' }
  | TravelEditionMissing

/** Price one row on the DEFRA travel edition the window selected (T3e). A missing edition is checked after the
 *  row's own fields, so a half-entered row still asks for what is missing first. */
export function priceCommute(row: CommuteRow, ed: DefraEdition): CommutePricing {
  const t = travelTables(ed)
  const T = 'status' in t ? null : t.tables
  const missing: CommuteMissing[] = []
  if (!row.mode) missing.push('mode')
  if (!row.country_iso2) missing.push('country')
  if (!positive(row.employees)) missing.push('employees')
  const km = storedKm(row)
  if (km === 'missing') missing.push('distance')
  if (!positive(row.days_per_week)) missing.push('days per week')
  if (!positive(row.weeks_per_year)) missing.push('weeks per year')
  const perVehicle = row.mode === 'car' || row.mode === 'motorbike'
  if (perVehicle && !positive(row.occupancy)) missing.push('occupancy')
  // The fields a factor needs are the same in every edition, so a missing edition still lists them; the newest
  // edition's tables stand in for that check only, and price nothing (the edition check below returns first).
  const f = row.mode ? factorsFor(row, T ?? FIELD_CHECK_TABLES) : null
  if (f && 'missing' in f) missing.push(...f.missing.filter(m => !missing.includes(m)))
  if (missing.length > 0 || km === 'missing') return { status: 'incomplete', missing }
  if (km === 'mismatch') return { status: 'distance_mismatch' }
  if ('status' in t) return t
  if (row.days_per_week! > LIMITS.days_per_week) return { status: 'invalid', field: 'days per week', limit: `at most ${LIMITS.days_per_week}` }
  if (row.weeks_per_year! > LIMITS.weeks_per_year) return { status: 'invalid', field: 'weeks per year', limit: `at most ${LIMITS.weeks_per_year}` }
  if (row.mode === 'car' && (row.occupancy! < LIMITS.car_occupancy_min || row.occupancy! > LIMITS.car_occupancy_max)) {
    return { status: 'invalid', field: 'occupancy', limit: `between ${LIMITS.car_occupancy_min} and ${LIMITS.car_occupancy_max}` }
  }
  if (row.mode === 'motorbike' && (row.occupancy! < LIMITS.motorbike_occupancy_min || row.occupancy! > LIMITS.motorbike_occupancy_max)) {
    return { status: 'invalid', field: 'occupancy', limit: `between ${LIMITS.motorbike_occupancy_min} and ${LIMITS.motorbike_occupancy_max}` }
  }
  if (!f || 'no_factor' in f) return { status: 'no_factor' }
  const fx = f as Factors
  const annual = km * 2 * row.days_per_week! * row.weeks_per_year!
  const pkm = row.employees! * annual
  const vkm = fx.basis === 'vehicle_km' ? pkm / row.occupancy! : null
  const distance = fx.basis === 'vehicle_km' ? vkm! : pkm
  const combustion = fx.combustion.kg_co2e * distance
  const wtt = fx.wtt * distance
  return {
    status: 'priced',
    km,
    annual_km_per_commuter: annual,
    passenger_km: pkm,
    vehicle_km: vkm,
    occupancy: perVehicle ? row.occupancy! : null,
    basis: fx.basis,
    factor: { combustion: fx.combustion, wtt: fx.wtt },
    kg: { combustion, wtt, total: combustion + wtt },
    uk_stand_in: fx.basis !== 'none' && !isUkIso2(row.country_iso2),
    uk_electricity: fx.uk_electricity,
    cells: fx.cells,
    edition: t.edition,
  }
}

// ── PRICING ONE HOMEWORKING ROW ──────────────────────────────────────────────────────────────────

export type HomeworkingMissing = 'country' | 'employees' | 'homeworking days per week' | 'weeks per year' | 'hours per day'

export interface PricedHomeworking {
  status: 'priced'
  /** employees x days per week x weeks per year x hours per day. */
  hours: number
  factor: number
  kg: number
  cell: string
  /** T3e: the DEFRA edition the window selected. */
  edition: DefraEditionCell
}

export type HomeworkingPricing =
  | PricedHomeworking
  | { status: 'incomplete'; missing: HomeworkingMissing[] }
  | { status: 'invalid'; field: 'homeworking days per week' | 'weeks per year' | 'hours per day'; limit: string }
  /** Outside the UK: DEFRA's factor is a UK average, mostly heating, with no cooling. Not priced. */
  | { status: 'not_uk'; country_iso2: string }
  | TravelEditionMissing

/** Price one row on the DEFRA travel edition the window selected (T3e). */
export function priceHomeworking(row: HomeworkingRow, ed: DefraEdition): HomeworkingPricing {
  // ⚠️ THE COUNTRY FIRST. A row outside the UK can never be priced, whatever else is entered, so it says so
  // the moment the country is chosen, rather than asking for employees, days and hours it will not use.
  if (row.country_iso2 && !isUkIso2(row.country_iso2)) return { status: 'not_uk', country_iso2: row.country_iso2 }
  const missing: HomeworkingMissing[] = []
  if (!row.country_iso2) missing.push('country')
  if (!positive(row.employees)) missing.push('employees')
  if (!positive(row.days_per_week)) missing.push('homeworking days per week')
  if (!positive(row.weeks_per_year)) missing.push('weeks per year')
  if (!positive(row.hours_per_day)) missing.push('hours per day')
  if (missing.length > 0) return { status: 'incomplete', missing }
  if (row.days_per_week! > LIMITS.days_per_week) return { status: 'invalid', field: 'homeworking days per week', limit: `at most ${LIMITS.days_per_week}` }
  if (row.weeks_per_year! > LIMITS.weeks_per_year) return { status: 'invalid', field: 'weeks per year', limit: `at most ${LIMITS.weeks_per_year}` }
  if (row.hours_per_day! > LIMITS.hours_per_day) return { status: 'invalid', field: 'hours per day', limit: `at most ${LIMITS.hours_per_day}` }
  const t = travelTables(ed)
  if ('status' in t) return t
  const rec = t.tables.homeworkingRecord('combined')!
  const factor = rec.kg_co2e
  const hours = row.employees! * row.days_per_week! * row.weeks_per_year! * row.hours_per_day!
  return { status: 'priced', hours, factor, kg: hours * factor, cell: `${rec.sheet}!${rec.cells.value}`, edition: t.edition }
}

// ── THE WHOLE RECORD ─────────────────────────────────────────────────────────────────────────────

export interface EvaluatedCommute { n: number; row: CommuteRow; pricing: CommutePricing }
export interface EvaluatedHomeworking { n: number; row: HomeworkingRow; pricing: HomeworkingPricing }

export interface CommutingEvaluation {
  commutes: EvaluatedCommute[]
  homeworking: EvaluatedHomeworking[]
  pricedCommutes: (EvaluatedCommute & { pricing: PricedCommute })[]
  pricedHomeworking: (EvaluatedHomeworking & { pricing: PricedHomeworking })[]
  kg: { combustion: number; wtt: number; homeworking: number; total: number }
  mt: number
  /** At least one commuting or homeworking row priced. An entered figure never makes it so. */
  calculated: boolean
  /** T3e: the DEFRA travel edition the window selected, or why it is missing. Every row was priced on it. */
  edition: DefraEdition
}

/** Price the record on the DEFRA travel edition the window selected (T3e). */
export function evaluateCommuting(d: CommutingData | undefined, ed: DefraEdition): CommutingEvaluation {
  const commutes = (d?.commute_rows ?? []).map((row, i) => ({ n: i + 1, row, pricing: priceCommute(row, ed) }))
  const homeworking = (d?.homeworking_rows ?? []).map((row, i) => ({ n: i + 1, row, pricing: priceHomeworking(row, ed) }))
  const pricedCommutes = commutes.filter((e): e is EvaluatedCommute & { pricing: PricedCommute } => e.pricing.status === 'priced')
  const pricedHomeworking = homeworking.filter((e): e is EvaluatedHomeworking & { pricing: PricedHomeworking } => e.pricing.status === 'priced')
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const combustion = sum(pricedCommutes.map(e => e.pricing.kg.combustion))
  const wtt = sum(pricedCommutes.map(e => e.pricing.kg.wtt))
  const home = sum(pricedHomeworking.map(e => e.pricing.kg))
  const total = combustion + wtt + home
  return {
    commutes, homeworking, pricedCommutes, pricedHomeworking,
    kg: { combustion, wtt, homeworking: home, total },
    mt: total / 1000,
    calculated: pricedCommutes.length + pricedHomeworking.length > 0,
    edition: ed,
  }
}

// ── THE PREVIOUS FORM ────────────────────────────────────────────────────────────────────────────

/** The fields the previous Cat 7 form stored. Read only to say they are there and not priced. */
export interface LegacyCommutingData {
  employee_count?: number
  avg_commute_km?: number
  commute_mode?: string
  wfh_days?: number
}

/** Whether a record carries any field of the previous form, including a stored 0. */
export const hasLegacyCommuting = (d: LegacyCommutingData | undefined): boolean =>
  !!d && (['employee_count', 'avg_commute_km', 'commute_mode', 'wfh_days'] as const).some(k => d[k] !== undefined && d[k] !== null)
