// lib/billReview/billState.ts
//
// BR4: a bill with the Bill Review team, as the wizard and BR8 see it. Pure.
//
// The team's record (public.bill_review_documents) says whether a bill is waiting, read or unreadable, and when it is
// expected. What the CUSTOMER did to it (withdraw, restore, delete) is T18's record on the saved inventory, and is read
// from there (ruling, 10 Oct 2026): no status is written onto the team's row for it.

import { DOC_TYPE_FIELDS, type Location, type LocationEvent, type SourceDoc } from '../ghg/engine'

export type BillReviewRow = {
  id: string; source_doc_id: string; file_path: string; location_id: string | null
  status: 'waiting' | 'read' | 'unreadable'; expected_by: string | null; expected_by_refusal: string | null
  unreadable_note: string | null; read_at: string | null
}

/** Uploaded while human-read, still on the inventory, not withdrawn, nothing read into it, and not yet read by the team. */
export function isWaiting(doc: SourceDoc, row: BillReviewRow | undefined): boolean {
  return doc.bill_review?.reading === 'human' && !doc.withdrawn && (doc.extracted?.length ?? 0) === 0 && (!row || row.status === 'waiting')
}

/**
 * Q12: the bill(s) with the team that a field is waiting on, at this location, and the date to show: the latest
 * expected date among them, or null when any has none (never a guessed date). Null when nothing waits on the field.
 */
export function withTeamFor(loc: Location, field: keyof Location, rows: Record<string, BillReviewRow>): { expectedBy: string | null } | null {
  const waiting = loc.source_docs.filter(d => (DOC_TYPE_FIELDS[d.document_type] ?? []).includes(field) && isWaiting(d, rows[d.file_path]))
  if (waiting.length === 0) return null
  const dates = waiting.map(d => rows[d.file_path]?.expected_by ?? null)
  return { expectedBy: dates.some(x => x == null) ? null : (dates as string[]).sort().pop()! }
}

export type CustomerBillState = 'on_inventory' | 'withdrawn' | 'deleted' | 'not_on_inventory'

/**
 * For BR8: what the customer has done to a submitted bill, from the SAVED inventory. On it (as a document of some
 * location), withdrawn, deleted (a tombstone in a location's document_log, or in location_log when its location was
 * deleted), or not on it at all (uploaded and never saved, or saved before BR4 recorded it).
 */
export function customerBillState(locations: Location[], locationLog: LocationEvent[] | null | undefined, sourceDocId: string): CustomerBillState {
  for (const l of locations) {
    const d = l.source_docs.find(x => x.id === sourceDocId)
    if (d) return d.withdrawn ? 'withdrawn' : 'on_inventory'
  }
  const isTomb = (e: { kind?: string; docId?: string }) => (e.kind === 'deleted' || e.kind === 'deleted_unused') && e.docId === sourceDocId
  if (locations.some(l => (l.document_log ?? []).some(isTomb))) return 'deleted'
  if ((locationLog ?? []).some(e => (e.documents ?? []).some(isTomb))) return 'deleted'
  return 'not_on_inventory'
}
