// ── MOBILE (VEHICLE) COMBUSTION FACTORS: THE SHAPE EVERY PUBLISHER'S FILE USES ─────────────────────
//
// FI9 diff 1. One file per publisher in this folder (epa2025, eccc2025, defra2026, nga2025, mfe2026,
// ipcc2006), each transcribed from ~/themisiq-sources and nothing else, in the publisher's own unit (R5),
// keyed by edition for T3c. NOTHING READS THESE YET: FI9 diff 2 adds the fleet split by vehicle type
// (ruling R16) and diff 3 wires pricing. The research record is docs/review/mobile-factors.md.
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

/** Where a value is printed. `row` and `column` are as the publisher prints them. */
export interface MobileCite {
  table: string
  row: string
  column?: string
  /** Printed page, where the source is a PDF. */
  page?: string
  /** Sheet and cell, where the source is a workbook. */
  cell?: string
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
}

/**
 * Ruling R16: where the publisher splits a type further and the customer has not said which applies, the row with
 * the highest combined CH4 and N2O within that type is used. Combined means CO2-e, because that is the quantity that
 * reaches the total: a row the publisher prints in CO2-e is summed as printed, and a row in gas mass is weighted by
 * `gwp`. Ties go to the first row in the publisher's own order. Null where the publisher prints no row for the type.
 */
export function r16Highest(
  rows: readonly MobileGasRow[], type: FleetType, fuel: MobileFuel, gwp: { ch4: number; n2o: number },
): MobileGasRow | null {
  let best: MobileGasRow | null = null
  let bestScore = -Infinity
  for (const r of rows) {
    if (r.type !== type || r.fuel !== fuel) continue
    const score = r.gas === 'co2e_ar5' ? r.ch4 + r.n2o : r.ch4 * gwp.ch4 + r.n2o * gwp.n2o
    if (score > bestScore) { best = r; bestScore = score }
  }
  return best
}
