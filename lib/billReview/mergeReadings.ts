// lib/billReview/mergeReadings.ts
//
// BR4: A SPECIALIST'S READING COMES BACK AS A PROPOSAL THE CUSTOMER CONFIRMS, EXACTLY LIKE AN AI READING. Pure: the
// wizard reads the team's records and readings (its own rows, RLS; read_by is never among the columns it can read)
// on load and when the page becomes visible again, and passes them here.
//
//   - Same shape as the AI reading's proposal (app/dashboard/ghg/page.tsx, handleFileUpload): the value through
//     convertToCanonical, status 'extracted', or 'needs_manual_review' when the unit cannot be converted; plus
//     readBy { method: 'human', readingId, at }, and no staff user id.
//   - Idempotent: a reading already on a proposal (by readingId) is skipped.
//   - A correction (a reading that supersedes another) replaces the proposal of the reading it corrects, unless the
//     customer has acted on that proposal (confirmed or rejected it: readingActedOn). Then it is NOT merged: it is
//     held on the document as correctionsPending, and the page shows a notice (ruling 5, 10 Oct 2026).
//   - A withdrawn bill is skipped until it is restored. A bill no longer on the inventory is not found, so nothing of
//     it is merged.
//   - A bill the team could not read gets the plain note, and stays a bill with nothing read from it.
//   - Once a reading is merged, the bill's note and read outcome are cleared: it is no longer "with our team".

import type { ExtractedProposal, Location, SourceDoc } from '../ghg/engine'
import { convertToCanonical, type FuelType } from '../unitConversions'
import { readingActedOn } from '../ghg/documentActions'
import type { BillReviewRow } from './billState'
import { unreadableNote } from './waitingWords'

export type ReadingRow = {
  id: string; bill_review_document_id: string; fuel_type: string; raw_value: number | string; raw_unit: string
  period_start: string | null; period_end: string | null; delivery_date: string | null
  source_quote: string | null; notes: string | null; supersedes: string | null; read_at: string
}

export function readingToProposal(r: ReadingRow): ExtractedProposal {
  const raw = Number(r.raw_value)
  const conv = convertToCanonical(r.fuel_type as FuelType, raw, r.raw_unit)
  const dated = !!r.period_start && !!r.period_end
  const delivery = !r.period_start && !r.period_end && r.delivery_date ? r.delivery_date : null
  return {
    fuelType: r.fuel_type as ExtractedProposal['fuelType'],
    rawValue: raw,
    rawUnit: r.raw_unit ?? null,
    value: conv.value,
    unit: conv.unit,
    conversionNote: conv.conversionNote,
    periodStart: r.period_start ?? null,
    periodEnd: r.period_end ?? null,
    deliveryDate: delivery,
    // A specialist reads the dates printed on the bill, or the delivery date: never a billing month.
    periodConfidence: dated ? 'high' : null,
    periodOrigin: delivery ? 'delivery' : dated ? 'printed' : null,
    confidence: 'high',
    sourceQuote: r.source_quote ?? null,
    notes: r.notes ?? null,
    status: conv.tier === 3 ? 'needs_manual_review' : 'extracted',
    readBy: { method: 'human', readingId: r.id, at: r.read_at },
  }
}

/** The readings of one bill not corrected by a later one, oldest first. */
function currentReadings(rs: ReadingRow[]): ReadingRow[] {
  return rs.filter(r => !rs.some(x => x.supersedes === r.id)).sort((a, b) => a.read_at.localeCompare(b.read_at))
}
/** Every reading a reading corrects, directly or through earlier corrections. */
function ancestors(r: ReadingRow, byId: Map<string, ReadingRow>): Set<string> {
  const out = new Set<string>()
  for (let s = r.supersedes; s && !out.has(s); s = byId.get(s)?.supersedes ?? null) out.add(s)
  return out
}

function mergeDoc(doc: SourceDoc, row: BillReviewRow, readings: ReadingRow[]): SourceDoc {
  if (row.status === 'unreadable') {
    if ((doc.extracted?.length ?? 0) > 0) return doc
    const note = unreadableNote(doc.file_name, row.unreadable_note)
    if (doc.read_outcome === 'abstained' && doc.read_note === note && doc.bill_review?.unreadableNote === (row.unreadable_note ?? null)) return doc
    // BR7: the team's note is kept on the bill, so the export block can quote it (COVERAGE_MESSAGE.reading_unreadable).
    return { ...doc, read_outcome: 'abstained', read_note: note, bill_review: { ...doc.bill_review!, unreadableNote: row.unreadable_note ?? null } }
  }
  if (row.status !== 'read') return doc
  const rs = readings.filter(r => r.bill_review_document_id === row.id)
  const byId = new Map(rs.map(r => [r.id, r]))
  const proposals = [...(doc.extracted ?? [])]
  const pending = [...(doc.bill_review?.correctionsPending ?? [])]
  let changed = false
  for (const r of currentReadings(rs)) {
    if (proposals.some(p => p.readBy?.readingId === r.id) || pending.some(c => c.readingId === r.id)) continue
    const corrects = ancestors(r, byId)
    const i = corrects.size ? proposals.findIndex(p => p.readBy && corrects.has(p.readBy.readingId)) : -1
    if (i >= 0 && readingActedOn(proposals[i])) {
      pending.push({ readingId: r.id, supersedes: r.supersedes!, fuelType: r.fuel_type, rawValue: Number(r.raw_value), rawUnit: r.raw_unit, at: r.read_at })
      changed = true
      continue
    }
    if (i >= 0) proposals[i] = readingToProposal(r)
    else proposals.push(readingToProposal(r))
    changed = true
  }
  if (!changed) return doc
  const mark: NonNullable<SourceDoc['bill_review']> = { ...(doc.bill_review ?? { reading: 'human' }) }
  delete mark.correctionsPending
  const next: SourceDoc = { ...doc, extracted: proposals, bill_review: { ...mark, reading: 'human', ...(pending.length ? { correctionsPending: pending } : {}) } }
  if (proposals.length > 0) { delete next.read_note; delete next.read_outcome }
  return next
}

/** The inventory's locations with every finished reading merged. `changed` is false when nothing new arrived. */
export function mergeReadings(locations: Location[], rows: BillReviewRow[], readings: ReadingRow[]): { locations: Location[]; changed: boolean } {
  let changed = false
  const out = locations.map(loc => {
    let locChanged = false
    const docs = loc.source_docs.map(doc => {
      if (doc.bill_review?.reading !== 'human' || doc.withdrawn) return doc
      const row = rows.find(r => r.source_doc_id === doc.id && r.file_path === doc.file_path)
      if (!row) return doc
      const next = mergeDoc(doc, row, readings)
      if (next !== doc) locChanged = true
      return next
    })
    if (!locChanged) return loc
    changed = true
    return { ...loc, source_docs: docs }
  })
  return { locations: changed ? out : locations, changed }
}
