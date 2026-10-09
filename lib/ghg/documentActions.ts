// lib/ghg/documentActions.ts
//
// T18: WHAT HAPPENS TO A DOCUMENT: WITHDRAW, RESTORE, DELETE PERMANENTLY, DELETE UNUSED. Pure: no React, no clock
// (the caller passes the time), no Supabase. Each function returns the patch for ONE location: its documents and
// its document log. Deleting the stored file is the page's work; these say what the record keeps.
//
// Rulings (docs/review/design-derived-figures.md section 10, "T18: document removal", and Lisa, 9 Oct 2026):
//   - A document with any reading acted on (confirmed or rejected, or ever confirmed) cannot be deleted from the
//     inventory as unused. It is WITHDRAWN: kept as evidence, its readings no longer counted. A reading the
//     customer only flagged counts as not acted on, so its document is offered "Delete".
//   - "Delete permanently" is offered on any document, behind a required reason. It removes the document and its
//     readings and leaves a tombstone: the file, its type, when it was uploaded, its SHA-256 where known, who, when
//     and why. The tombstone holds no reading and no source quote.
//   - "Delete (unused)" leaves an entry too, shown wherever the other entries are, so a verifier sees every upload
//     that existed.
//   - Option (a) for what a deletion cannot reach: the confirmation and the tombstone say that earlier saved
//     versions still contain what was read. A purge of that history is handled outside the app (docs/review/ghg-register.md, DOC-01).
//   - Every action records who and when in the location's document_log, which a save may only append to.

import { acceptanceProblem, valueProblem, type DocumentEvent, type ExtractedProposal, type Location, type SourceDoc, EARLIER_VERSIONS_SENTENCE } from './engine'

type Who = { userId: string; email: string }
type Patch = Pick<Location, 'source_docs' | 'document_log'>

export type DocumentAction = 'withdraw' | 'restore' | 'delete_permanently' | 'delete_unused'

/** A reading the customer acted on: confirmed or rejected now, or confirmed at some point. Flagging is not acting. */
export const readingActedOn = (p: ExtractedProposal): boolean =>
  p.status === 'confirmed' || p.status === 'rejected' || (p.confirmations?.length ?? 0) > 0

/** The actions a document offers, in the order the page shows them. */
export function documentActionsFor(d: SourceDoc): DocumentAction[] {
  if (d.withdrawn) return ['restore', 'delete_permanently']
  return (d.extracted ?? []).some(readingActedOn) ? ['withdraw', 'delete_permanently'] : ['delete_unused', 'delete_permanently']
}

// ── The questions the page asks before each action (plain, no em dash). ─────────────────────────────────────────
export const WITHDRAW_PROMPT = (file: string) =>
  `Withdraw ${file}? It stays on file as evidence but is no longer counted. Give a reason.`
export const RESTORE_PROMPT = (file: string) =>
  `Restore ${file}? Its readings go back to the statuses they had when it was withdrawn. Give a reason.`
export const DELETE_PERMANENTLY_PROMPT = (file: string) =>
  `Delete ${file} permanently? The file and what was read from it are removed from this inventory. A record that it existed, who deleted it, when and why is kept. ${EARLIER_VERSIONS_SENTENCE} Give a reason.`
export const DELETE_UNUSED_PROMPT = (file: string) =>
  `Delete ${file}? Nothing from it has been used.`

/** Why an action cannot be taken as asked, or null. The page shows it; the builders below throw it. */
export function documentActionProblem(d: SourceDoc | undefined, action: DocumentAction, a: { by?: Who | null; reason?: string }): string | null {
  if (!d) return 'That document is no longer on this location.'
  if (!a.by?.userId || !a.by?.email) return 'Sign in to change documents, so the record shows who did it.'
  if (!documentActionsFor(d).includes(action)) {
    return action === 'delete_unused' ? 'A reading from this document has been confirmed or rejected, so it can be withdrawn or deleted permanently, not deleted as unused.'
      : action === 'withdraw' ? (d.withdrawn ? 'This document is already withdrawn.' : 'Nothing from this document has been used, so it can be deleted instead.')
      : 'This document is not withdrawn.'
  }
  if (action !== 'delete_unused' && !(a.reason ?? '').trim()) return 'Give a reason.'
  return null
}

const docOf = (loc: Location, docId: string) => loc.source_docs.find(d => d.id === docId)
const must = (loc: Location, docId: string, action: DocumentAction, a: { by: Who; reason?: string }): SourceDoc => {
  const d = docOf(loc, docId)
  const problem = documentActionProblem(d, action, a)
  if (problem) throw new Error(problem)
  return d as SourceDoc
}
const withEvent = (loc: Location, e: DocumentEvent) => [...(loc.document_log ?? []), e]

/**
 * Withdraw: the file and readings stay. Every reading is set to rejected, with its status before kept as a
 * `withdrawn` entry in its statusLog, so it is not counted by any path and Restore can put it back. The document
 * records who withdrew it, when and why, and its readings contribute with reason `withdrawn`.
 */
export function withdrawDocument(loc: Location, docId: string, a: { by: Who; at: string; reason: string }): Patch {
  const d = must(loc, docId, 'withdraw', a)
  const reason = a.reason.trim()
  const withdrawn = { at: a.at, by: a.by, reason }
  return {
    source_docs: loc.source_docs.map(x => x.id !== docId ? x : {
      ...x, withdrawn,
      extracted: x.extracted?.map(p => ({
        ...p, status: 'rejected' as const,
        statusLog: [...(p.statusLog ?? []), { action: 'withdrawn' as const, at: a.at, by: a.by, statusBefore: p.status }],
      })),
    }),
    document_log: withEvent(loc, { kind: 'withdrawn', docId, file: d.file_name, at: a.at, by: a.by, reason }),
  }
}

/**
 * Restore: each reading returns to the status it had when the document was withdrawn, as Undo does (T9): a bill
 * confirmed with no figure goes to Needs review (T10a), and one confirmed on month-only dates never confirmed goes
 * back to To confirm (R5). The restoration is recorded the same way.
 */
export function restoreDocument(loc: Location, docId: string, a: { by: Who; at: string; reason: string }): Patch {
  const d = must(loc, docId, 'restore', a)
  const reason = a.reason.trim()
  const restoreReading = (p: ExtractedProposal): ExtractedProposal => {
    const before = [...(p.statusLog ?? [])].reverse().find(e => e.action === 'withdrawn')?.statusBefore ?? p.status
    const status = before === 'confirmed' && valueProblem(p) !== null ? 'needs_manual_review'
      : before === 'confirmed' && acceptanceProblem(p) !== null ? 'extracted' : before
    return { ...p, status, statusLog: [...(p.statusLog ?? []), { action: 'restored', at: a.at, by: a.by, statusBefore: p.status }] }
  }
  return {
    source_docs: loc.source_docs.map(x => {
      if (x.id !== docId) return x
      const rest = { ...x }
      delete rest.withdrawn
      return { ...rest, extracted: x.extracted?.map(restoreReading) }
    }),
    document_log: withEvent(loc, { kind: 'restored', docId, file: d.file_name, at: a.at, by: a.by, reason }),
  }
}

/**
 * Delete permanently (a reason is required) or Delete unused (only a document with nothing acted on). The document
 * and its readings leave the location; the log keeps a tombstone with no reading and no source quote.
 */
export function deleteDocument(loc: Location, docId: string, a: { by: Who; at: string; mode: 'permanently' | 'unused'; reason?: string }): Patch {
  const d = must(loc, docId, a.mode === 'unused' ? 'delete_unused' : 'delete_permanently', a)
  const base = { docId, file: d.file_name, documentType: d.document_type, uploadedAt: d.uploaded_at, sha256: d.sha256 ?? null, at: a.at, by: a.by }
  const e: DocumentEvent = a.mode === 'unused'
    ? { kind: 'deleted_unused', ...base }
    : { kind: 'deleted', ...base, reason: (a.reason ?? '').trim() }
  return { source_docs: loc.source_docs.filter(x => x.id !== docId), document_log: withEvent(loc, e) }
}
