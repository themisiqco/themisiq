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
//   - used_none:         (location, fuel, field);
//   - deliveries_complete (T10b): (location, document type, fuel), so confirming again replaces the earlier
//                        confirmation rather than keeping both.
//   - exact_duplicate (T15): (location, fuel, the SET of documents), whichever choice, so changing the answer
//                        for the same documents replaces the earlier one.
// Legacy duplicate and straddle keep the old (location, fuel, kind) key; nothing writes them any more.

import type { FleetType } from '../emissionFactors/mobile/types'
import { twoCopies, type CoverageResolution, type DocCopy } from './engine'
import { docTypeLabel } from './conciergeDocTypes'

export function resolutionKey(r: CoverageResolution): string {
  switch (r.kind) {
    case 'same_bill':
      return `same_bill|${r.locId}|${r.fuelType}|${[r.countedDocId ?? '', ...(r.excludedDocIds ?? [])].sort().join(',')}`
    case 'different_meters':
      return `different_meters|${r.locId}|${r.docId ?? ''}`
    case 'extrapolate':
      return `extrapolate|${r.locId}|${r.documentType ?? ''}|${r.fuelType}|${r.meterLabel ?? ''}${r.fleetType ? `|${r.fleetType}` : ''}`
    case 'used_none':
      return `used_none|${r.locId}|${r.fuelType}|${r.field ?? ''}`
    case 'deliveries_complete':
      return `deliveries_complete|${r.locId}|${r.documentType ?? ''}|${r.fuelType}`
    case 'exact_duplicate': {
      const ids = r.choice === 'count_once' ? [r.countedDocId ?? '', ...(r.excludedDocIds ?? [])] : [...(r.docIds ?? [])]
      return `exact_duplicate|${r.locId}|${r.fuelType}|${ids.sort().join(',')}`
    }
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

/** Why no estimate can be built from zero covered months (T10b ruling). Shown by the strip in place of the control. */
export const NO_MONTHS_TO_ESTIMATE =
  'No month is fully covered by these bills, so the missing months cannot be estimated from them. Upload the missing bills, or enter the figure yourself.'

/**
 * A gap estimate for one meter of one document type: that meter's bills grossed up by its own coverage.
 * T10b: refuses to build one from fewer than 1 covered month. Scaling ×12/0 is not an estimate, and the
 * engine refuses such a resolution anyway (validateResolution), so building one only stored a record that
 * changed nothing and told the customer nothing. The strip never offers the control at 0.
 */
export function estimateResolution(a: {
  locId: string; fuelType: string; documentType: string; meterLabel: string | null
  monthsCovered: number; pctEstimated: number; at: string
  /** FI9 diff 4: a fleet-fuel gap's vehicle type. */
  fleetType?: FleetType
}): CoverageResolution {
  if (!(a.monthsCovered >= 1)) throw new Error(NO_MONTHS_TO_ESTIMATE)
  const m = a.monthsCovered
  const meter = a.meterLabel ? `Meter ${a.meterLabel}: ` : ''
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'extrapolate', documentType: a.documentType,
    ...(a.meterLabel ? { meterLabel: a.meterLabel } : {}),
    ...(a.fleetType ? { fleetType: a.fleetType } : {}),
    monthsCovered: m, pctEstimated: a.pctEstimated,
    note: `${meter}${m} of 12 months evidenced by bills; remaining ${12 - m} month${12 - m === 1 ? '' : 's'} estimated by scaling metered data ×12/${m} (${a.pctEstimated}% estimated).`,
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

/**
 * T10b: "These are all the deliveries for this year", for one (document type, fuel) at one site. It records who
 * and when, and the documents it covers: if those change, the confirmation no longer applies (ruling). The note
 * repeats the statement the customer clicked, which names the fuel, the site and the window.
 */
export function deliveriesCompleteResolution(a: {
  locId: string; fuelType: string; documentType: string; docIds: string[]; statement: string
  by: { userId: string; email: string }; at: string
}): CoverageResolution {
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'deliveries_complete', documentType: a.documentType,
    docIds: [...a.docIds], by: a.by,
    note: `${a.by.email} confirmed on ${plainDate(a.at)}: ${a.statement}`,
    acknowledgedAt: a.at,
  }
}

/**
 * T15 (rule R6), "Same document, count once": the same file or reading uploaded as two kinds of document.
 * `counted` counts; `excluded` is retained as evidence, not counted. Records who chose it and when.
 * T15-fix1: each copy is named by its document type, so the note says which copy counts even when both
 * copies have the same file name.
 */
type Copy = DocCopy & { id: string }
export function exactDuplicateCountOnce(a: {
  locId: string; fuelType: string; counted: Copy; excluded: Copy
  by: { userId: string; email: string }; at: string
}): CoverageResolution {
  const pair = twoCopies(a.counted, a.excluded)
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'exact_duplicate', choice: 'count_once',
    countedDocId: a.counted.id, excludedDocIds: [a.excluded.id], by: a.by,
    note: `${a.by.email} confirmed on ${plainDate(a.at)} that ${pair} ${a.counted.file === a.excluded.file ? 'is one document' : 'are the same document'}, so it is counted once, as the ${docTypeLabel(a.counted.documentType)}.`,
    acknowledgedAt: a.at,
  }
}

/** T15 (rule R6), "Not the same": both documents count. Records who chose it and when. */
export function exactDuplicateNotSame(a: {
  locId: string; fuelType: string; docs: [Copy, Copy]
  by: { userId: string; email: string }; at: string
}): CoverageResolution {
  const [x, y] = a.docs
  return {
    locId: a.locId, fuelType: a.fuelType, kind: 'exact_duplicate', choice: 'not_same',
    docIds: a.docs.map(d => d.id), by: a.by,
    note: `${a.by.email} confirmed on ${plainDate(a.at)} that ${twoCopies(x, y)} ${x.file === y.file ? 'are two different documents' : 'are not the same document'}, so both are counted.`,
    acknowledgedAt: a.at,
  }
}
