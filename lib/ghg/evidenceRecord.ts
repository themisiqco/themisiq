// lib/ghg/evidenceRecord.ts
//
// T18 diff 4: THE EVIDENCE RECORD, IN PLAIN LANGUAGE. Pure: no React, no Supabase.
//
// What happened to each document (withdrawn, restored, deleted, deleted unused), who typed each figure and when, and
// which locations were deleted with their documents. One list, read by every surface that shows it:
//   - the evidence list on each location in the wizard (app/dashboard/ghg/_components/EvidenceRecord.tsx);
//   - the assurance PDF's record table (lib/assurancePdf.ts), document events and deleted locations only;
//   - the verifier page, which reads the same sentences from the saved workings rows (eventRowsOf, workingsCells.ts),
//     because it receives the workings and not the inventory's location_log column.
// The sentences are the engine's (documentEventSentence, locationEventSentence) and typedEntrySentence, so the list,
// the saved workings and the PDF cannot word one event two ways.

import { documentEventSentence, locationEventSentence, type DocumentEvent, type LocationEvent, type TypedEntry } from './engine'
import { typedEntrySentence } from './typedEntries'

export type EvidenceLine = { at: string; kind: 'document' | 'typed' | 'location'; sentence: string }

/** One location's record: its document events and typed entries, oldest first. */
export function locationEvidenceLines(loc: { document_log?: DocumentEvent[]; typed_entries?: TypedEntry[] }): EvidenceLine[] {
  const lines: EvidenceLine[] = [
    ...(loc.document_log ?? []).map(e => ({ at: e.at, kind: 'document' as const, sentence: documentEventSentence(e) })),
    ...(loc.typed_entries ?? []).map(e => ({ at: e.at, kind: 'typed' as const, sentence: typedEntrySentence(e) })),
  ]
  // A stable sort by time: entries made at one save keep the order they were written in.
  return lines.map((l, i) => ({ l, i })).sort((a, b) => a.l.at.localeCompare(b.l.at) || a.i - b.i).map(x => x.l)
}

/** The inventory's deleted locations, oldest first. */
export const locationLogLines = (log: readonly LocationEvent[] | null | undefined): EvidenceLine[] =>
  (log ?? []).map(e => ({ at: e.at, kind: 'location' as const, sentence: locationEventSentence(e) }))

/**
 * The document and location record for the PDF, as the verifier page shows it: every document event, by location,
 * then every deleted location, as [location, sentence]. Typed entries are not in it; they are on the workings rows.
 */
export function evidenceRecordRows(inv: { locations: { name?: string; document_log?: DocumentEvent[] }[]; location_log?: LocationEvent[] | null }): [string, string][] {
  return [
    ...inv.locations.flatMap(l => (l.document_log ?? []).map(e => [l.name || 'Location', documentEventSentence(e)] as [string, string])),
    ...(inv.location_log ?? []).map(e => [`${e.name || 'Location'} (deleted)`, locationEventSentence(e)] as [string, string]),
  ]
}

// The verifier page's reader of the same record lives in workingsCells.ts (eventRowsOf), which imports nothing from
// the engine, so the page an assurance provider opens does not load the calculation engine to list a few rows.
export { eventRowsOf } from './workingsCells'
