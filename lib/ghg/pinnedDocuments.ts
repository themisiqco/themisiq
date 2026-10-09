// lib/ghg/pinnedDocuments.ts
//
// T16: THE DOCUMENTS A PINNED VERIFIER LINK SHOWS. Pure: no Supabase, no engine.
//
// A verifier link shows a saved version (ghg_inventory_versions), so the documents it lists are the ones that version
// names, not today's. Each is checked against the live inventory:
//   - still on file (withdrawn included: a withdrawn file is kept as evidence): available, and it opens;
//   - deleted since, with its tombstone in a location's document_log or in the inventory's location_log: listed, with
//     who deleted it, when and why, and no link, because the file is no longer held;
//   - gone with no tombstone (a deletion made before T18 kept records): listed, said so, and no link.
// Never a broken link and never a silent omission. /api/verifier-documents lists these; /sign signs only an available
// document of the pinned version, by the path the version names.

import { flattenSourceDocs, type StoredLocation } from './verifierGrant'
import { isoDateInWords } from './dateWords'

type Who = { email?: string }
type Tombstone = { kind?: string; docId?: string; file?: string; at?: string; by?: Who; reason?: string }
type LiveLocation = StoredLocation & { document_log?: Tombstone[] }
type LiveLocationEvent = { documents?: Tombstone[]; document_log?: Tombstone[] }

export type PinnedDocument = {
  id: string | null
  file_name: string
  document_type: string
  location: string
  /** The storage path the pinned version names. Server side only: the routes never send it to the browser. */
  file_path: string | null
  status: 'available' | 'deleted'
  /** For a deleted document, what the verifier reads in place of a link. */
  deleted_note?: string
}

const on = (at?: string) => (at ? isoDateInWords(at.slice(0, 10)) : 'a date not recorded')

/** What a verifier reads for a document the pinned version names that is no longer held. Plain, no em dash. */
export function deletedDocumentNote(file: string, t: Tombstone | null): string {
  if (!t) return `${file} is no longer held, so it cannot be opened. No record of its deletion was kept.`
  const why = t.kind === 'deleted_unused' ? 'Nothing from it had been used.' : `Reason: ${t.reason || 'not recorded'}.`
  return `${file} was deleted from the inventory by ${t.by?.email || 'someone not recorded'} on ${on(t.at)}, after this version was saved. ${why} The file is no longer held, so it cannot be opened.`
}

export function pinnedDocuments(pinnedLocations: unknown, liveLocations: unknown, liveLocationLog: unknown): PinnedDocument[] {
  const liveIds = new Set(flattenSourceDocs(liveLocations).map(d => d.doc.id).filter(Boolean) as string[])
  const tombstones = new Map<string, Tombstone>()
  const addTomb = (t: Tombstone) => { if (t?.docId && (t.kind === 'deleted' || t.kind === 'deleted_unused')) tombstones.set(t.docId, t) }
  for (const l of (Array.isArray(liveLocations) ? liveLocations : []) as LiveLocation[]) for (const t of l?.document_log ?? []) addTomb(t)
  for (const e of (Array.isArray(liveLocationLog) ? liveLocationLog : []) as LiveLocationEvent[]) {
    for (const t of e?.documents ?? []) addTomb(t)
    for (const t of e?.document_log ?? []) addTomb(t)
  }
  return flattenSourceDocs(pinnedLocations).map(({ doc, location }) => {
    const base = { id: doc.id ?? null, file_name: doc.file_name || 'document', document_type: doc.document_type || 'document', location, file_path: doc.file_path ?? null }
    // A document stored before uploads carried an id cannot be checked; the page already says it cannot be served.
    if (!doc.id || liveIds.has(doc.id)) return { ...base, status: 'available' as const }
    return { ...base, status: 'deleted' as const, deleted_note: deletedDocumentNote(base.file_name, tombstones.get(doc.id) ?? null) }
  })
}
