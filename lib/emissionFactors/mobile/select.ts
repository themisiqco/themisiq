// ── R16: WHICH PUBLISHED MOBILE ROW APPLIES TO A SITE'S FLEET FUEL ──────────────────────────────────
//
// FI9 diff 1b (ruling R16 as refined 7 Oct 2026). Pure selection over the transcribed tables; nothing reads it yet.
//
// - Road (Light, Heavy): an optional typical model year per vehicle type. Given, the publisher's row(s) for that
//   year; a year after the publisher's latest row, the latest row (said on the row); where the publisher ties no
//   row to it otherwise, the highest row. Not given, the highest row.
// - Non-road: the customer's equipment type. Rows for that type only; the highest within it where the publisher splits
//   further (engine size, stroke). A publisher with no sector split serves every type from the same rows.
// - "Highest" is the combined CH4 and N2O in CO2-e on AR5, fixed, so a site's row does not move when the reporting
//   framework changes. A row printed in CO2-e is summed as printed. Ties go to the first row in the publisher's order.
// - The fallback: where the publisher prints no row for the type and fuel at all, CH4 and N2O come from IPCC 2006
//   Vol. 2 Ch. 3 (Table 3.2.2 road, Table 3.3.1 off-road) and CO2 stays the country's own. As of FI9 diff 1b no
//   transcribed publisher needs it (docs/review/mobile-factors.md), but it is the rule.

import {
  EQUIPMENT_TYPE_LABEL,
  type EquipmentType, type FleetType, type MobileFuel, type MobileGasRow, type MobilePublisher,
} from './types'
import { IPCC_MOBILE_2006 } from './ipcc2006'

/** AR5 100-year GWPs (IPCC AR5 WG1 Ch. 8 Table 8.A.1, as the engine's GWP.AR5 holds them): fixed for ranking. */
export const R16_RANKING_GWP = { ch4: 28, n2o: 265 } as const

export interface MobileQuery {
  type: FleetType
  fuel: MobileFuel
  /** Road only: the typical model year for this vehicle type, where the customer gives one. */
  modelYear?: number
  /** Non-road only: the equipment type the customer chose. */
  equipmentType?: EquipmentType
}

export interface MobileSelection {
  row: MobileGasRow
  /** The sentence for the row note: why this row, in the customer's terms. */
  reason: string
  /** True where the row is IPCC's because the publisher prints none for this type and fuel. */
  fallback: boolean
}

const co2e = (r: MobileGasRow): number =>
  r.gas === 'co2e_ar5' ? r.ch4 + r.n2o : r.ch4 * R16_RANKING_GWP.ch4 + r.n2o * R16_RANKING_GWP.n2o

/** The highest row in CO2-e (AR5), first in the publisher's order on a tie. */
export function highestRow(rows: readonly MobileGasRow[]): MobileGasRow | null {
  let best: MobileGasRow | null = null
  for (const r of rows) if (!best || co2e(r) > co2e(best)) best = r
  return best
}

const inYears = (r: MobileGasRow, y: number): boolean =>
  !!r.years && (r.years.from === null || y >= r.years.from) && (r.years.to === null || y <= r.years.to)

const TYPE_TEXT: Readonly<Record<FleetType, string>> = { light: 'light vehicles', heavy: 'heavy vehicles', non_road: 'non-road equipment' }

function pick(pub: MobilePublisher, rows: MobileGasRow[], q: MobileQuery): { row: MobileGasRow; reason: string } | null {
  if (rows.length === 0) return null
  const what = q.type === 'non_road' && q.equipmentType
    ? `non-road ${EQUIPMENT_TYPE_LABEL[q.equipmentType].toLowerCase()} equipment` : TYPE_TEXT[q.type]
  const split = pub.splitBy[`${q.type}:${q.fuel}`] ?? 'The finer split'

  let pool = rows
  let lead = ''
  if (q.type === 'non_road' && q.equipmentType) {
    const eq = q.equipmentType
    const hasSplit = rows.some(r => r.equipment !== undefined)
    if (!hasSplit) {
      if (rows.length === 1) return { row: rows[0], reason: `${pub.publisher} prints one non-road row for ${q.fuel}, not split by equipment type.` }
      lead = `${pub.publisher} does not split non-road equipment by type. `
    } else {
      const forType = rows.filter(r => r.equipment === undefined || r.equipment.includes(eq))
      if (forType.length > 0) pool = forType
      else lead = `${pub.publisher} prints no row for ${EQUIPMENT_TYPE_LABEL[eq].toLowerCase()} equipment. `
    }
  }
  if (q.type !== 'non_road' && q.modelYear !== undefined) {
    const y = q.modelYear
    const tied = pool.filter(r => inYears(r, y))
    if (tied.length === 1) return { row: tied[0], reason: `${lead}Typical model year ${y}: ${pub.publisher}, ${tied[0].detail ?? tied[0].vehicle}.` }
    if (tied.length > 1) {
      const row = highestRow(tied)!
      return { row, reason: `${lead}Typical model year ${y}: ${pub.publisher} ties ${tied.length} rows to it, so the highest of them is used.` }
    }
    if (pool.length === 1) return { row: pool[0], reason: `${lead}${pub.publisher} prints one row for ${what}; it is not split by model year.` }
    // R16 (Lisa, 7 Oct 2026): a year after the publisher's latest row takes the latest row, and says so (EPA's
    // Tables 3 and 4 end at 2022). Only where every dated row ends before the year; an open-ended row would be tied.
    const dated = pool.filter(r => r.years)
    if (dated.length > 0 && dated.every(r => r.years!.to !== null && r.years!.to < y)) {
      const lastTo = Math.max(...dated.map(r => r.years!.to as number))
      const latest = dated.filter(r => r.years!.to === lastTo)
      const row = highestRow(latest)!
      const last = (row.detail ?? '').replace(/^Model year /, '') || String(lastTo)
      return { row, reason: `${lead}Model year ${y} is after the latest published row (${last}), so the ${last} row is used.` }
    }
    return { row: highestRow(pool)!, reason: `${lead}${pub.publisher} ties no row to model year ${y}, so the highest published row for ${what} is used.` }
  }
  if (pool.length === 1) return { row: pool[0], reason: `${lead}${pub.publisher} prints one row for ${what}.` }
  return { row: highestRow(pool)!, reason: `${lead}${split} not given, so the highest published row for ${what} is used.` }
}

/**
 * The row R16 applies for one site's fleet type and fuel, with the sentence that says why, or null where neither the
 * publisher nor the IPCC fallback has a row (nothing transcribed today).
 */
export function selectMobileRow(pub: MobilePublisher, q: MobileQuery): MobileSelection | null {
  const own = pick(pub, pub.rows.filter(r => r.type === q.type && r.fuel === q.fuel), q)
  if (own) return { ...own, fallback: false }
  const ipcc = pick(IPCC_MOBILE_2006, IPCC_MOBILE_2006.rows.filter(r => r.type === q.type && r.fuel === q.fuel), q)
  if (!ipcc) return null
  return {
    row: ipcc.row,
    reason: `IPCC 2006 default for CH4 and N2O; ${pub.publisher} publishes no ${q.type === 'non_road' ? 'off-road' : 'road'} ` +
      `factor for ${q.fuel}. ${ipcc.reason}`,
    fallback: true,
  }
}
