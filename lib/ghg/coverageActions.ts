// lib/ghg/coverageActions.ts
//
// THE RESOLUTIONS THE COVERAGE STRIP WRITES, AND HOW THEY ARE KEPT (T8). Pure: no React, no clock (the
// caller passes the time), no Supabase.
//
// Each builder returns a resolution in the shape validateResolution accepts (lib/ghg/engine.ts), so a
// control can only write something the engine will act on. The `note` is stored with the resolution and
// reprinted to verifiers, so it is plain language with no em dash.
//
// KEYED SO NO RESOLUTION OVERWRITES ANOTHER (T8, and the ruling in section 10 of the design doc).
// The page used to replace any resolution with the same location, fuel and kind, so two overlaps on one
// fuel, or estimates for two meters, overwrote each other. Now:
//   - same_bill:         the SET of documents it names (counted plus excluded, order ignored), so choosing
//                        again for the same pair replaces the earlier choice instead of keeping both, which
//                        would exclude both bills and drop the figure;
//   - different_meters:  its document;
//   - extrapolate:       (document type, fuel, meter);
//   - used_none:         (location, fuel, field).
// Legacy duplicate and straddle keep the old (location, fuel, kind) key; nothing writes them any more.

import type { CoverageResolution } from './engine'

export function resolutionKey(r: CoverageResolution): string {
  switch (r.kind) {
    case 'same_bill':
      return `same_bill|${r.locId}|${r.fuelType}|${[r.countedDocId ?? '', ...(r.excludedDocIds ?? [])].sort().join(',')}`
    case 'different_meters':
      return `different_meters|${r.locId}|${r.docId ?? ''}`
    case 'extrapolate':
      return `extrapolate|${r.locId}|${r.documentType ?? ''}|${r.fuelType}|${r.meterLabel ?? ''}`
    case 'used_none':
      return `used_none|${r.locId}|${r.fuelType}|${r.field ?? ''}`
    default:
      return `${r.kind}|${r.locId}|${r.fuelType}`
  }
}

/** Store `res`, replacing only a resolution with the same key. */
export function upsertResolution(list: readonly CoverageResolution[], res: CoverageResolution): CoverageResolution[] {
  const key = resolutionKey(res)
  return [...list.filter(r => resolutionKey(r) !== key), res]
}

/** "Same bill, count it once": `counted` is kept, `excluded` is retained as evidence but not counted. */
export function sameBillResolution(a: {
  locId: string; fuelType: string; counted: { id: string; file: string }; excluded: { id: string; file: string }; at: string
}): CoverageResolution {
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'same_bill',
    countedDocId: a.counted.id, excludedDocIds: [a.excluded.id],
    note: `${a.counted.file} and ${a.excluded.file} are the same bill, so it is counted once, from ${a.counted.file}.`,
    acknowledgedAt: a.at,
  }
}

/** "Different meters or accounts": the second document's own meter label, which must match (T3 ruling). */
export function differentMetersResolution(a: {
  locId: string; fuelType: string; doc: { id: string; file: string }; meterLabel: string; at: string
}): CoverageResolution {
  const label = a.meterLabel.trim()
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'different_meters', docId: a.doc.id, meterLabel: label,
    note: `${a.doc.file} is for a different meter or account: ${label}.`,
    acknowledgedAt: a.at,
  }
}

/** A gap estimate for one meter of one document type: that meter's bills grossed up by its own coverage. */
export function estimateResolution(a: {
  locId: string; fuelType: string; documentType: string; meterLabel: string | null
  monthsCovered: number; pctEstimated: number; at: string
}): CoverageResolution {
  const m = a.monthsCovered
  const meter = a.meterLabel ? `Meter ${a.meterLabel}: ` : ''
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'extrapolate', documentType: a.documentType,
    ...(a.meterLabel ? { meterLabel: a.meterLabel } : {}),
    monthsCovered: m, pctEstimated: a.pctEstimated,
    note: `${meter}${m} of 12 months evidenced by bills; remaining ${12 - m} month(s) estimated by scaling metered data ×12/${m} (${a.pctEstimated}% estimated).`,
    acknowledgedAt: a.at,
  }
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** A plain date for a note, "2 October 2026": the calendar day, where the confirmation was made, of a recorded time. */
export function plainDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Confirm this site used no {fuel}": a recorded figure of zero, with who confirmed it and when (T3 ruling). */
export function usedNoneResolution(a: {
  locId: string; fuelType: string; field: string; fuelName: string; by: { userId: string; email: string }; at: string
}): CoverageResolution {
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'used_none', field: a.field, by: a.by,
    note: `${a.by.email} confirmed on ${plainDate(a.at)} that this site used no ${a.fuelName}.`,
    acknowledgedAt: a.at,
  }
}
