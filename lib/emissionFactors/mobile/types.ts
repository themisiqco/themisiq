// ── MOBILE (VEHICLE) COMBUSTION FACTORS: THE SHAPE EVERY PUBLISHER'S FILE USES ─────────────────────
//
// FI9 diff 1. One file per publisher in this folder (epa2025, eccc2025, defra2026, nga2025, mfe2026,
// ipcc2006), each transcribed from ~/themisiq-sources and nothing else, in the publisher's own unit (R5),
// keyed by edition for T3c. The engine prices every fleet line from them (lib/ghg/engine.ts pickFleet, FI9 diff 2b).
// The research record is docs/review/mobile-factors.md. Which row applies to a site is decided in select.ts (R16 as
// refined on 7 Oct 2026).
//
// WHY A NEW FOLDER AND NOT lib/ghg/mobile.ts. That file mixes two publishers in one module, carries its
// own shape, and cites an ECCC edition the local sources do not hold (NIR 2026, p. 541; the local copy is
// the 2025 edition, where the same values are on p. 253). Per-publisher files keyed by edition are the
// shape lib/emissionFactors/ngaScope3_2025.ts set for FI6, and the shape T3c re-keys.

/** Ruling R16: fleet fuel is entered per location, split by these vehicle types. */
export type FleetType = 'light' | 'heavy' | 'non_road'
export const FLEET_TYPE_LABEL: Readonly<Record<FleetType, string>> = {
  light: 'Light (cars, vans, utes)',
  heavy: 'Heavy (trucks, buses)',
  non_road: 'Non-road (forklifts, plant, machinery)',
}

export type MobileFuel = 'diesel' | 'petrol'

/** R16 (refined 7 Oct 2026): the non-road equipment type the customer chooses. */
export type EquipmentType = 'industrial_commercial' | 'construction_mining' | 'agriculture' | 'forestry' | 'lawn_garden'
export const EQUIPMENT_TYPE_LABEL: Readonly<Record<EquipmentType, string>> = {
  industrial_commercial: 'Industrial and commercial (including forklifts)',
  construction_mining: 'Construction and mining',
  agriculture: 'Agriculture',
  forestry: 'Forestry',
  lawn_garden: 'Lawn and garden',
}

/** A model-year range a publisher ties a row to; null is open-ended. */
export interface YearRange { from: number | null; to: number | null }

/** Where a value is printed. `row` and `column` are as the publisher prints them. */
export interface MobileCite {
  /** The document, where it is not the publisher file's own `document` (FI9 diff 1b: the NGER Determination). */
  document?: string
  table: string
  row: string
  column?: string
  /** Printed page, where the source is a PDF. */
  page?: string
  /** Sheet and cell, where the source is a workbook. */
  cell?: string
  /** Why this row applies to this vehicle type, where the table alone does not say (a definition or an instruction
   *  elsewhere in the publisher's documents), quoted with its place. */
  basis?: string
}

/** CO2 per unit of fuel (or per unit of energy, with the energy content beside it). */
export interface MobileCo2 {
  fuel: MobileFuel
  value: number
  unit: string
  cite: MobileCite
}

/** One published CH4 and N2O row. */
export interface MobileGasRow {
  fuel: MobileFuel
  type: FleetType
  /** The publisher's vehicle or equipment class, as printed. */
  vehicle: string
  /** The publisher's finer split (model year, tier, Euro standard, technology, sector), or null where the
   *  publisher prints one row for the class. */
  detail: string | null
  ch4: number
  n2o: number
  unit: string
  /** 'mass': grams or kilograms of the gas itself. 'co2e_ar5': the publisher prints CO2-e on AR5 GWPs. */
  gas: 'mass' | 'co2e_ar5'
  cite: MobileCite
  /** The model years the publisher ties this row to, where it does (R16: "typical model year"). */
  years?: YearRange
  /** Non-road only: the equipment types this row is for. Absent where the publisher has no sector split, so the row
   *  serves every equipment type; an empty list where the row is for equipment no R16 type covers. */
  equipment?: EquipmentType[]
}

/** A type and fuel the publisher prints no mobile row for, with what it says instead (quoted), if anything. */
export interface MobileAbsent {
  type: FleetType
  fuel: MobileFuel
  said: string | null
}

export interface MobilePublisher {
  publisher: string
  edition: string
  document: string
  co2: MobileCo2[]
  rows: MobileGasRow[]
  absent: MobileAbsent[]
  /** What the publisher splits a type and fuel by, for the row note ("{splitBy} not given, ..."), keyed
   *  `${type}:${fuel}`. Only where it prints more than one row. */
  splitBy: Partial<Record<`${FleetType}:${MobileFuel}`, string>>
}
