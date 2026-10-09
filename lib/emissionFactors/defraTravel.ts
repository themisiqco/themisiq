// ── DEFRA/DESNZ 2026 BUSINESS TRAVEL FACTORS: TYPED LOOKUPS OVER defraTravel2026.json ────────────
//
// ONE reader over the artefact scripts/generate-defra-travel.py writes from the committed workbook: air
// factors by category, cabin class and radiative-forcing setting; WTT air by category and class; the
// haul DEFRA assigns a territory; hotel factors by country; rail and WTT rail by type.
//
// NOTHING PRICES FROM THIS YET. It is task A of the Cat 6 rebuild; the calculation that reads it, and the
// rules that choose a category for a flight (the UK-end haul, the distance bands for everything else),
// belong to task B and are deliberately not here.
//
// CLIENT-SAFE: imports only the JSON (about 129 KB since Category 7's tables were added on 19 Sep 2026; the
// 215-territory haul table is still the largest part).
//
// ⚠️ EVERY LOOKUP RETURNS null FOR A COMBINATION THE WORKBOOK DOES NOT PUBLISH, NEVER ZERO. The sheet
// publishes no economy factor for domestic flights, no premium economy or first for short-haul, and no
// factor at all for 16 of the 55 hotel countries it lists. Those return null. So does anything this
// artefact does not hold: an unknown ISO3 code, country name or rail type. The class fallback to
// 'Average passenger' that the sheet describes (guidance.class_unknown_use_average) is the caller's
// decision to make and disclose, not something a lookup does silently.
//
// ⚠️ LOOKUPS GO THROUGH Maps, NOT OBJECT KEYS, so a string such as 'constructor' or '__proto__' finds
// nothing rather than something from Object.prototype.

import data2023 from './defraTravel2023.json'
import data2024 from './defraTravel2024.json'
import data2025 from './defraTravel2025.json'
import data2026 from './defraTravel2026.json'

export type AirCategory = 'domestic' | 'short_haul' | 'long_haul' | 'international_non_uk'
export type CabinClass = 'average_passenger' | 'economy' | 'premium_economy' | 'business' | 'first'
/** The three hauls of the Haul definition sheet: each territory's haul relative to the UK. */
export type Haul = 'domestic' | 'short_haul' | 'long_haul'
export type RailType = 'National rail' | 'International rail' | 'Light rail and tram' | 'London Underground'

/** kg CO2e per passenger.km as published, with the sheet's CO2 / CH4 / N2O split (each already in CO2e, AR5). */
export interface GasSplit {
  kg_co2e: number
  co2: number
  ch4: number
  n2o: number
}

export interface AirRecord {
  category: AirCategory
  cabin_class: CabinClass
  haul_as_published: string
  class_as_published: string
  unit: string
  with_rf: GasSplit
  without_rf: GasSplit
  sheet: string
  row: number
  cells: { haul: string; class: string; unit: string; with_rf: string; without_rf: string }
}

export interface WttAirRecord {
  category: AirCategory
  cabin_class: CabinClass
  haul_as_published: string
  class_as_published: string
  unit: string
  with_rf: number
  without_rf: number
  sheet: string
  row: number
  cells: { haul: string; class: string; unit: string; with_rf: string; without_rf: string }
}

export interface HaulRecord {
  territory: string
  iso3: string
  haul: Haul
  haul_as_published: string
  sheet: string
  row: number
  cells: string
}

export interface HotelRecord {
  country: string
  /** null where the sheet lists the country with an empty value cell: no factor, not zero. */
  kg_co2e_per_room_night: number | null
  sheet: string
  row: number
  cells: { country: string; value: string }
}

export interface RailRecord extends GasSplit {
  type: RailType
  unit: string
  sheet: string
  row: number
  cells: { type: string; values: string }
}

export interface WttRailRecord {
  type: RailType
  unit: string
  kg_co2e: number
  sheet: string
  row: number
  cells: { type: string; value: string }
}

export interface GuidanceQuote {
  sheet: string
  cell: string
  text: string
}


// ── ONE READER PER EDITION (T3e, 8 Oct 2026) ───────────────────────────────────────────────────────
// The editions the registry holds for desnz_travel, each generated from its own workbook by
// scripts/generate-defra-travel.py --year. Pricing takes the edition selectEdition chose for the window
// (lib/scope3/defraEditions.ts) and reads it through defraTravelFor(year); nothing prices on another edition.
// The top-level exports below are the NEWEST edition's, for building selects and lists, whose rows are the same in
// every edition held (T3e Step 1: every label, unit and row count matches 2023 to 2026). A lookup a figure is priced
// from always goes through defraTravelFor.
//   Hotel stay is in 2026 only (Lisa's ruling, 8 Oct 2026): nothing prices hotels.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Artefact = any
const ARTEFACTS: Readonly<Record<number, Artefact>> = { 2023: data2023, 2024: data2024, 2025: data2025, 2026: data2026 }
/** The DEFRA travel editions held, oldest first. */
export const DEFRA_TRAVEL_YEARS: readonly number[] = Object.keys(ARTEFACTS).map(Number).sort((a, b) => a - b)
export const DEFRA_TRAVEL_NEWEST = DEFRA_TRAVEL_YEARS[DEFRA_TRAVEL_YEARS.length - 1]

/** The artefact's own statements, for disclosure. The guidance texts are quoted from the workbook by the
 *  generator, with the cell each was found in. */
export interface DefraTravelMeta {
  source: string
  title_as_published: string
  edition: string
  factor_set: string
  file_version: string
  year: string
  sheets: string[]
  scope: string
  gwp_basis: string
  gwp_basis_note: string
  unit_note: string
  rf_note: string
  absent_hotel_note: string
  rail_scope_note: string
  licence: string
  licence_url: string
  licence_basis: string
  /** ⚠️ VERBATIM, WHEREVER A FIGURE FROM THESE FACTORS IS SHOWN. Read this field; never type it out. */
  attribution_required: string
  /** null where this edition prints no such cell (T3e): an Index or What's new note 2023 or 2024 lacks, or a hotel quote before 2026. */
  guidance: Record<string, GuidanceQuote | null>
  air_categories: AirCategory[]
  cabin_classes: CabinClass[]
  counts: Record<string, unknown>
  hotel_countries_without_factor: string[]
  /** Covers air, wtt_air, haul_definition, hotel_stay, rail and wtt_rail, as it did before Category 7. */
  fingerprint_sha256: string
  /** Covers the Category 7 tables: cars, motorbikes, taxis, buses, their WTT rows, and homeworking. */
  commuting_fingerprint_sha256: string
  market_segment_note: string
  commuting_units_note: string
  miles_check_note: string
  absent_car_note: string
  electric_car_note: string
  homeworking_note: string
  fingerprint_scope_note: string
}

// ── CATEGORY 7: EMPLOYEE COMMUTING (added 19 Sep 2026) ──────────────────────────────────────────────
//
// Cars by size and fuel, motorbikes, taxis, buses and the coach from 'Business travel- land', with their
// well-to-tank rows, and the Homeworking sheet. Rail is the table above, shared with Category 6.
//
// ⚠️ UNITS DIFFER BY MODE, AND THE CALLER MUST KNOW WHICH IT HAS. Cars and motorbikes are per VEHICLE-km:
// a whole vehicle, so a car shared by commuters is divided by its occupancy by the caller. Buses and the
// coach are per PASSENGER-km. Taxis come both ways and the lookup takes the basis. Homeworking is per FTE
// working hour. Each record's `unit` says which.
//
// ⚠️ NULL FOR ANYTHING THE SHEET DOES NOT PUBLISH, NEVER ZERO AND NEVER A NEIGHBOUR. A small CNG or LPG car
// has no factor, and the lookup says so rather than returning the medium one.

export type CarSize = 'small' | 'medium' | 'large' | 'average'
export type CarFuel = 'diesel' | 'petrol' | 'hybrid' | 'cng' | 'lpg' | 'unknown' | 'plug_in_hybrid' | 'battery_electric'
export type MotorbikeSize = 'small' | 'medium' | 'large' | 'average'
export type TaxiType = 'regular' | 'black_cab'
export type TaxiBasis = 'passenger_km' | 'vehicle_km'
export type BusType = 'local_not_london' | 'local_london' | 'average_local' | 'coach'
export type HomeworkingComponent = 'office_equipment' | 'heating' | 'combined'

interface Cells { [k: string]: string }

export interface CarRecord extends GasSplit {
  size: CarSize
  fuel: CarFuel
  size_as_published: string
  fuel_as_published: string
  unit: string
  sheet: string
  row: number
  cells: Cells
}
export interface WttCarRecord {
  size: CarSize
  fuel: CarFuel
  size_as_published: string
  fuel_as_published: string
  unit: string
  kg_co2e: number
  sheet: string
  row: number
  cells: Cells
}
export interface MotorbikeRecord extends GasSplit { size: MotorbikeSize; size_as_published: string; basis: 'vehicle_km'; unit: string; sheet: string; row: number; cells: Cells }
export interface WttMotorbikeRecord { size: MotorbikeSize; size_as_published: string; basis: 'vehicle_km'; unit: string; kg_co2e: number; sheet: string; row: number; cells: Cells }
export interface TaxiRecord extends GasSplit { type: TaxiType; type_as_published: string; basis: TaxiBasis; unit: string; sheet: string; row: number; cells: Cells }
export interface WttTaxiRecord { type: TaxiType; type_as_published: string; basis: TaxiBasis; unit: string; kg_co2e: number; sheet: string; row: number; cells: Cells }
export interface BusRecord extends GasSplit { type: BusType; type_as_published: string; basis: 'passenger_km'; unit: string; sheet: string; row: number; cells: Cells }
export interface WttBusRecord { type: BusType; type_as_published: string; basis: 'passenger_km'; unit: string; kg_co2e: number; sheet: string; row: number; cells: Cells }
export interface HomeworkingRecord { component: HomeworkingComponent; activity_as_published: string; unit: string; kg_co2e: number; sheet: string; row: number; cells: Cells }


const k2 = (a: string, b: string) => `${a}\u0000${b}`
const split = (r: GasSplit): GasSplit => ({ kg_co2e: r.kg_co2e, co2: r.co2, ch4: r.ch4, n2o: r.n2o })
/** Column number of a cell reference's letters ("AF53" -> 32), to order fuels as the sheet's columns do. */
const colOf = (ref: string): number => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)

function build(data: Artefact) {
  const AIR_RECORDS = data.air as AirRecord[]
  const WTT_AIR_RECORDS = data.wtt_air as WttAirRecord[]
  const HAUL_RECORDS = data.haul_definition as HaulRecord[]
  const HOTEL_RECORDS = data.hotel_stay as HotelRecord[]
  const RAIL_RECORDS = data.rail as RailRecord[]
  const WTT_RAIL_RECORDS = data.wtt_rail as WttRailRecord[]
  const CAR_RECORDS = data.cars as CarRecord[]
  const WTT_CAR_RECORDS = data.wtt_cars as WttCarRecord[]
  const MOTORBIKE_RECORDS = data.motorbikes as MotorbikeRecord[]
  const WTT_MOTORBIKE_RECORDS = data.wtt_motorbikes as WttMotorbikeRecord[]
  const TAXI_RECORDS = data.taxis as TaxiRecord[]
  const WTT_TAXI_RECORDS = data.wtt_taxis as WttTaxiRecord[]
  const BUS_RECORDS = data.buses as BusRecord[]
  const WTT_BUS_RECORDS = data.wtt_buses as WttBusRecord[]
  const HOMEWORKING_RECORDS = data.homeworking as HomeworkingRecord[]
  const META = data.metadata as DefraTravelMeta

  const AIR_BY_KEY = new Map(AIR_RECORDS.map(r => [k2(r.category, r.cabin_class), r]))
  const WTT_AIR_BY_KEY = new Map(WTT_AIR_RECORDS.map(r => [k2(r.category, r.cabin_class), r]))
  const HAUL_BY_ISO3 = new Map(HAUL_RECORDS.map(r => [r.iso3, r]))
  const HOTEL_BY_COUNTRY = new Map(HOTEL_RECORDS.map(r => [r.country, r]))
  const RAIL_BY_TYPE = new Map(RAIL_RECORDS.map(r => [r.type as string, r]))
  const WTT_RAIL_BY_TYPE = new Map(WTT_RAIL_RECORDS.map(r => [r.type as string, r]))
  const CAR_BY_KEY = new Map(CAR_RECORDS.map(r => [k2(r.size, r.fuel), r]))
  const WTT_CAR_BY_KEY = new Map(WTT_CAR_RECORDS.map(r => [k2(r.size, r.fuel), r]))
  const MOTORBIKE_BY_SIZE = new Map(MOTORBIKE_RECORDS.map(r => [r.size as string, r]))
  const WTT_MOTORBIKE_BY_SIZE = new Map(WTT_MOTORBIKE_RECORDS.map(r => [r.size as string, r]))
  const TAXI_BY_KEY = new Map(TAXI_RECORDS.map(r => [k2(r.type, r.basis), r]))
  const WTT_TAXI_BY_KEY = new Map(WTT_TAXI_RECORDS.map(r => [k2(r.type, r.basis), r]))
  const BUS_BY_TYPE = new Map(BUS_RECORDS.map(r => [r.type as string, r]))
  const WTT_BUS_BY_TYPE = new Map(WTT_BUS_RECORDS.map(r => [r.type as string, r]))
  const HOMEWORKING_BY_COMPONENT = new Map(HOMEWORKING_RECORDS.map(r => [r.component as string, r]))

  const airRecord = (category: AirCategory, cabinClass: CabinClass): AirRecord | null => AIR_BY_KEY.get(k2(category, cabinClass)) ?? null
  const wttAirRecord = (category: AirCategory, cabinClass: CabinClass): WttAirRecord | null => WTT_AIR_BY_KEY.get(k2(category, cabinClass)) ?? null
  const hotelRecord = (country: string): HotelRecord | null => HOTEL_BY_COUNTRY.get(country) ?? null
  const carRecord = (size: string, fuel: string): CarRecord | null => CAR_BY_KEY.get(k2(size, fuel)) ?? null
  return {
    META, AIR_RECORDS, WTT_AIR_RECORDS, HAUL_RECORDS, HOTEL_RECORDS, RAIL_RECORDS, WTT_RAIL_RECORDS,
    CAR_RECORDS, WTT_CAR_RECORDS, MOTORBIKE_RECORDS, WTT_MOTORBIKE_RECORDS, TAXI_RECORDS, WTT_TAXI_RECORDS,
    BUS_RECORDS, WTT_BUS_RECORDS, HOMEWORKING_RECORDS,
    /** The air record for a category and class, or null where the sheet publishes none. */
    airRecord,
    /** kg CO2e per passenger.km with its gas split, for the RF setting asked for, or null where the sheet publishes none. */
    airFactor: (category: AirCategory, cabinClass: CabinClass, includeRf: boolean): GasSplit | null => {
      const r = airRecord(category, cabinClass)
      return r ? (includeRf ? r.with_rf : r.without_rf) : null
    },
    wttAirRecord,
    /** Well-to-tank kg CO2e per passenger.km, or null. The sheet publishes the two RF columns identically
     *  (guidance.wtt_air_rf_identical); this returns the Without RF column. */
    wttAirFactor: (category: AirCategory, cabinClass: CabinClass): number | null => wttAirRecord(category, cabinClass)?.without_rf ?? null,
    /** The Haul definition sheet's haul for an ISO3 code (case and surrounding space ignored), or null. */
    haulForIso3: (iso3: string): Haul | null => HAUL_BY_ISO3.get(iso3.trim().toUpperCase())?.haul ?? null,
    /** The hotel record for a country exactly as the sheet names it, or null. 2026 only. */
    hotelRecord,
    hotelFactor: (country: string): number | null => hotelRecord(country)?.kg_co2e_per_room_night ?? null,
    /** kg CO2e per passenger.km with its gas split for a rail type, or null. UK factors (rail_scope_note). */
    railFactor: (type: string): GasSplit | null => { const r = RAIL_BY_TYPE.get(type); return r ? split(r) : null },
    railRecord: (type: string): RailRecord | null => RAIL_BY_TYPE.get(type) ?? null,
    wttRailFactor: (type: string): number | null => WTT_RAIL_BY_TYPE.get(type)?.kg_co2e ?? null,
    wttRailRecord: (type: string): WttRailRecord | null => WTT_RAIL_BY_TYPE.get(type) ?? null,
    /** The car record for a size and fuel, or null where the sheet publishes none (e.g. small CNG). */
    carRecord,
    /** kg CO2e per VEHICLE-km with its gas split, or null. Electric and plug-in hybrid include UK electricity. */
    carFactor: (size: string, fuel: string): GasSplit | null => { const r = carRecord(size, fuel); return r ? split(r) : null },
    wttCarFactor: (size: string, fuel: string): number | null => WTT_CAR_BY_KEY.get(k2(size, fuel))?.kg_co2e ?? null,
    wttCarRecord: (size: string, fuel: string): WttCarRecord | null => WTT_CAR_BY_KEY.get(k2(size, fuel)) ?? null,
    motorbikeFactor: (size: string): GasSplit | null => { const r = MOTORBIKE_BY_SIZE.get(size); return r ? split(r) : null },
    motorbikeRecord: (size: string): MotorbikeRecord | null => MOTORBIKE_BY_SIZE.get(size) ?? null,
    wttMotorbikeFactor: (size: string): number | null => WTT_MOTORBIKE_BY_SIZE.get(size)?.kg_co2e ?? null,
    taxiFactor: (type: string, basis: TaxiBasis): GasSplit | null => { const r = TAXI_BY_KEY.get(k2(type, basis)); return r ? split(r) : null },
    taxiRecord: (type: string, basis: TaxiBasis): TaxiRecord | null => TAXI_BY_KEY.get(k2(type, basis)) ?? null,
    wttTaxiFactor: (type: string, basis: TaxiBasis): number | null => WTT_TAXI_BY_KEY.get(k2(type, basis))?.kg_co2e ?? null,
    busFactor: (type: string): GasSplit | null => { const r = BUS_BY_TYPE.get(type); return r ? split(r) : null },
    busRecord: (type: string): BusRecord | null => BUS_BY_TYPE.get(type) ?? null,
    wttBusFactor: (type: string): number | null => WTT_BUS_BY_TYPE.get(type)?.kg_co2e ?? null,
    /** kg CO2e per FTE working hour for a homeworking component, or null. A UK average (homeworking_note). */
    homeworkingFactor: (component: string): number | null => HOMEWORKING_BY_COMPONENT.get(component)?.kg_co2e ?? null,
    homeworkingRecord: (component: string): HomeworkingRecord | null => HOMEWORKING_BY_COMPONENT.get(component) ?? null,
    RAIL_TYPES: RAIL_RECORDS.map(r => r.type) as readonly RailType[],
    CAR_SIZES: [...new Set(CAR_RECORDS.map(r => r.size))] as readonly CarSize[],
    /** In the sheet's column order: CNG and LPG are not published for every size, so first appearance would put them last. */
    CAR_FUELS: [...new Map(CAR_RECORDS.map(r => [r.fuel, colOf(r.cells.fuel)] as const))].sort((x, y) => x[1] - y[1]).map(([f]) => f) as readonly CarFuel[],
    MOTORBIKE_SIZES: MOTORBIKE_RECORDS.map(r => r.size) as readonly MotorbikeSize[],
    TAXI_TYPES: [...new Set(TAXI_RECORDS.map(r => r.type))] as readonly TaxiType[],
    BUS_TYPES: BUS_RECORDS.map(r => r.type) as readonly BusType[],
  }
}
export type DefraTravelTables = ReturnType<typeof build>

const BY_YEAR = new Map(DEFRA_TRAVEL_YEARS.map(y => [y, build(ARTEFACTS[y])]))
/** The travel tables of one held edition (its year), or null for an edition not held. Pricing reads only this. */
export function defraTravelFor(year: number): DefraTravelTables | null {
  return BY_YEAR.get(year) ?? null
}

// ── THE NEWEST EDITION, FOR SELECTS AND LISTS ──────────────────────────────────────────────────────
const NEWEST = BY_YEAR.get(DEFRA_TRAVEL_NEWEST)!
export const DEFRA_TRAVEL_META = NEWEST.META
export const AIR_RECORDS = NEWEST.AIR_RECORDS
export const WTT_AIR_RECORDS = NEWEST.WTT_AIR_RECORDS
export const HAUL_RECORDS = NEWEST.HAUL_RECORDS
export const HOTEL_RECORDS = NEWEST.HOTEL_RECORDS
export const RAIL_RECORDS = NEWEST.RAIL_RECORDS
export const WTT_RAIL_RECORDS = NEWEST.WTT_RAIL_RECORDS
export const CAR_RECORDS = NEWEST.CAR_RECORDS
export const WTT_CAR_RECORDS = NEWEST.WTT_CAR_RECORDS
export const MOTORBIKE_RECORDS = NEWEST.MOTORBIKE_RECORDS
export const WTT_MOTORBIKE_RECORDS = NEWEST.WTT_MOTORBIKE_RECORDS
export const TAXI_RECORDS = NEWEST.TAXI_RECORDS
export const WTT_TAXI_RECORDS = NEWEST.WTT_TAXI_RECORDS
export const BUS_RECORDS = NEWEST.BUS_RECORDS
export const WTT_BUS_RECORDS = NEWEST.WTT_BUS_RECORDS
export const HOMEWORKING_RECORDS = NEWEST.HOMEWORKING_RECORDS
export const { airRecord, airFactor, wttAirRecord, wttAirFactor, haulForIso3, hotelRecord, hotelFactor, railFactor, wttRailFactor,
  carRecord, carFactor, wttCarFactor, motorbikeFactor, wttMotorbikeFactor, taxiFactor, wttTaxiFactor, busFactor, wttBusFactor,
  homeworkingFactor, RAIL_TYPES, CAR_SIZES, CAR_FUELS, MOTORBIKE_SIZES, TAXI_TYPES, BUS_TYPES } = NEWEST
