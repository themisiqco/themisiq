// lib/ghg/documentActions.test.ts
//
// T18 diff 2: withdraw, restore, delete permanently and delete unused, the document log they write, and the save
// guard that keeps that log append-only.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  documentActionsFor, documentActionProblem, withdrawDocument, restoreDocument, deleteDocument, readingActedOn,
  WITHDRAW_PROMPT, RESTORE_PROMPT, DELETE_PERMANENTLY_PROMPT, DELETE_UNUSED_PROMPT,
} from './documentActions'
import { flagProposal, confirmProposal } from './proposalEdits'
import {
  emptyLocation, deriveLocations, billContributions, notCountedLines, findUnresolvedCoverage, buildWorkings, periodFromYearAndEnd,
  documentEventSentence, EARLIER_VERSIONS_SENTENCE, type Location, type SourceDoc, type ExtractedProposal, type DocumentEvent,
} from './engine'
import { documentLogBaseline, documentLogProblem } from './savePayload'
import { workingsFactorSourceCell, DOCUMENT_EVENT_ROW_BASIS } from './workingsCells'

const AT = '2026-10-02T09:00:00.000Z'
const LATER = '2026-10-04T09:00:00.000Z'
const BY = { userId: 'u-1', email: 'jo@acme.example' }
const BY2 = { userId: 'u-2', email: 'sam@acme.example' }
const W = periodFromYearAndEnd(2025, 12)
const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'Gas used 100 MCF', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, ps: ExtractedProposal[], o: Partial<SourceDoc> = {}): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01T10:00:00.000Z', file_path: `/${id}.pdf`, extracted: ps, ...o })
const site = (docs: SourceDoc[], o: Partial<Location> = {}): Location =>
  ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs, ...o })
const FEB = { periodStart: '2025-02-01', periodEnd: '2025-02-28' }
const twoBills = (feb: Partial<ExtractedProposal> = {}) => site([gdoc('jan', [prop({})]), gdoc('feb', [prop({ ...FEB, ...feb })])])
const applyPatch = (l: Location, patch: Partial<Location>): Location => ({ ...l, ...patch })
const gas = (l: Location) => deriveLocations({ locations: [l], reporting_year: 2025 })[0].natural_gas_amount
const statuses = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)
const docAt = (l: Location, id: string) => l.source_docs.find(d => d.id === id)

describe('which actions a document offers', () => {
  it('a confirmed or rejected reading: Withdraw and Delete permanently, never Delete', () => {
    expect(documentActionsFor(gdoc('a', [prop({})]))).toEqual(['withdraw', 'delete_permanently'])
    expect(documentActionsFor(gdoc('a', [prop({ status: 'rejected' })]))).toEqual(['withdraw', 'delete_permanently'])
    expect(documentActionsFor(gdoc('a', [prop({ status: 'extracted' }), prop({ status: 'confirmed' })]))).toEqual(['withdraw', 'delete_permanently'])
  })
  it('only pending, unread or flagged readings: Delete (unused) and Delete permanently (ruling, 9 Oct 2026: flagging is not acting)', () => {
    expect(documentActionsFor(gdoc('a', [prop({ status: 'extracted' })]))).toEqual(['delete_unused', 'delete_permanently'])
    expect(documentActionsFor(gdoc('a', [], { read_outcome: 'failed' }))).toEqual(['delete_unused', 'delete_permanently'])
    const p = prop({ status: 'extracted' })
    const flagged = { ...p, ...flagProposal(p, { by: BY, at: AT }) }
    expect(flagged.status).toBe('needs_manual_review')
    expect(readingActedOn(flagged)).toBe(false)
    expect(documentActionsFor(gdoc('a', [flagged]))).toEqual(['delete_unused', 'delete_permanently'])
  })
  it('a reading confirmed once and flagged since was acted on', () => {
    const p = prop({ status: 'extracted' })
    const confirmed = { ...p, ...confirmProposal(p, { by: BY, at: AT }) }
    const flagged = { ...confirmed, ...flagProposal(confirmed, { by: BY, at: LATER }) }
    expect(documentActionsFor(gdoc('a', [flagged]))).toEqual(['withdraw', 'delete_permanently'])
  })
  it('a withdrawn document: Restore and Delete permanently', () => {
    expect(documentActionsFor(gdoc('a', [prop({ status: 'rejected' })], { withdrawn: { at: AT, by: BY, reason: 'r' } }))).toEqual(['restore', 'delete_permanently'])
  })
  it('each action needs who, and every one but Delete (unused) needs a reason', () => {
    const d = gdoc('a', [prop({})])
    expect(documentActionProblem(d, 'withdraw', { by: null, reason: 'x' })).toBe('Sign in to change documents, so the record shows who did it.')
    expect(documentActionProblem(d, 'withdraw', { by: BY, reason: '  ' })).toBe('Give a reason.')
    expect(documentActionProblem(d, 'delete_permanently', { by: BY })).toBe('Give a reason.')
    expect(documentActionProblem(d, 'delete_unused', { by: BY })).toBe('A reading from this document has been confirmed or rejected, so it can be withdrawn or deleted permanently, not deleted as unused.')
    expect(documentActionProblem(gdoc('b', [prop({ status: 'extracted' })]), 'delete_unused', { by: BY })).toBeNull()
    expect(() => withdrawDocument(twoBills(), 'feb', { by: BY, at: AT, reason: '' })).toThrow('Give a reason.')
    expect(() => deleteDocument(twoBills(), 'feb', { by: BY, at: AT, mode: 'unused' })).toThrow(/not deleted as unused/)
  })
})

describe('Withdraw: kept as evidence, no longer counted', () => {
  const l = twoBills()
  const w = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'Duplicate upload of the January bill' }))

  it('every reading is set to rejected, its status before kept; the document records who, when and why', () => {
    expect(docAt(w, 'feb')?.withdrawn).toEqual({ at: AT, by: BY, reason: 'Duplicate upload of the January bill' })
    expect(docAt(w, 'feb')?.extracted?.[0]).toMatchObject({ status: 'rejected', statusLog: [{ action: 'withdrawn', at: AT, by: BY, statusBefore: 'confirmed' }] })
    expect(docAt(w, 'feb')?.file_path, 'the file stays').toBe('/feb.pdf')
    expect(w.document_log).toEqual([{ kind: 'withdrawn', docId: 'feb', file: 'feb.pdf', at: AT, by: BY, reason: 'Duplicate upload of the January bill' }])
  })
  it('its readings contribute with reason withdrawn, carrying the withdrawal; the figure drops to the other bill', () => {
    expect(gas(l)).toBe(200)
    expect(gas(w)).toBe(100)
    const c = billContributions(w, [], W).find(x => x.docId === 'feb')!
    expect(c).toMatchObject({ counted: false, reason: 'withdrawn', withdrawal: { at: AT, by: BY, reason: 'Duplicate upload of the January bill' } })
    expect(notCountedLines(w, [], W).get('feb:0')).toBe('Not counted: this document was withdrawn by jo@acme.example on 2 October 2026.')
  })
  it('no silent zero: a field whose documents are all withdrawn or rejected, with no figure, blocks export and says so', () => {
    const only = site([gdoc('feb', [prop({ ...FEB })])])
    const gone = applyPatch(only, withdrawDocument(only, 'feb', { by: BY, at: AT, reason: 'Wrong site' }))
    expect(gas(gone)).toBe(0)
    const issue = findUnresolvedCoverage([gone], 2025, 12, []).find(i => i.status === 'all_rejected')
    expect(issue?.message).toBe('Every natural gas document for Site A was rejected or withdrawn and no figure has been entered. Enter the figure manually, or confirm this site used no natural gas.')
    expect(statuses(applyPatch(gone, { natural_gas_amount: 50 }))).not.toContain('all_rejected')
  })
})

describe('Restore: the readings return to the statuses they had', () => {
  it('confirmed, pending and rejected readings return as they were; the restoration is logged', () => {
    const l = site([gdoc('jan', [prop({}), prop({ status: 'extracted', fuelType: 'natural_gas' }), prop({ status: 'rejected' })])])
    const w = applyPatch(l, withdrawDocument(l, 'jan', { by: BY, at: AT, reason: 'Checking with the supplier' }))
    const r = applyPatch(w, restoreDocument(w, 'jan', { by: BY2, at: LATER, reason: 'Supplier confirmed the bill' }))
    expect(docAt(r, 'jan')?.extracted?.map(p => p.status)).toEqual(['confirmed', 'extracted', 'rejected'])
    expect(docAt(r, 'jan')?.withdrawn).toBeUndefined()
    expect(docAt(r, 'jan')?.extracted?.[0].statusLog?.map(e => [e.action, e.by.email])).toEqual([['withdrawn', 'jo@acme.example'], ['restored', 'sam@acme.example']])
    expect(r.document_log?.map(e => e.kind)).toEqual(['withdrawn', 'restored'])
    expect(gas(r)).toBe(100)
  })
  it('R5 and T10a, as Undo: confirmed on month-only dates never confirmed goes to To confirm; confirmed with no figure to Needs review', () => {
    const l = site([gdoc('a', [prop({ periodConfidence: 'medium' }), prop({ value: null, unit: null })])])
    const w = applyPatch(l, withdrawDocument(l, 'a', { by: BY, at: AT, reason: 'r' }))
    const r = applyPatch(w, restoreDocument(w, 'a', { by: BY, at: LATER, reason: 'r' }))
    expect(docAt(r, 'a')?.extracted?.map(p => p.status)).toEqual(['extracted', 'needs_manual_review'])
  })
  it('only a withdrawn document can be restored, and a reason is required', () => {
    expect(() => restoreDocument(twoBills(), 'feb', { by: BY, at: AT, reason: 'r' })).toThrow('This document is not withdrawn.')
    const l = twoBills()
    const w = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'r' }))
    expect(() => restoreDocument(w, 'feb', { by: BY, at: AT, reason: '' })).toThrow('Give a reason.')
  })
})

describe('Delete permanently: a tombstone, with no reading and no source quote', () => {
  const l = twoBills()
  const withHash = applyPatch(l, { source_docs: l.source_docs.map(d => d.id === 'feb' ? { ...d, sha256: 'ab12' } : d) })
  const del = applyPatch(withHash, deleteDocument(withHash, 'feb', { by: BY, at: AT, mode: 'permanently', reason: 'Holds another tenant\'s account details' }))

  it('the document and its readings are gone; the tombstone names the file, its hash, who, when and why', () => {
    expect(docAt(del, 'feb')).toBeUndefined()
    expect(del.document_log).toEqual([{ kind: 'deleted', docId: 'feb', file: 'feb.pdf', documentType: 'utility_bill_gas', uploadedAt: '2025-06-01T10:00:00.000Z',
      sha256: 'ab12', at: AT, by: BY, reason: 'Holds another tenant\'s account details' }])
    expect(JSON.stringify(del.document_log)).not.toMatch(/Gas used|sourceQuote|"value"/)
    expect(gas(del)).toBe(100)
  })
  it('the hash is null when it was never recorded', () => {
    const plain = applyPatch(l, deleteDocument(l, 'feb', { by: BY, at: AT, mode: 'permanently', reason: 'r' }))
    expect(plain.document_log?.[0]).toMatchObject({ kind: 'deleted', sha256: null })
  })
  it('available on any document, including a withdrawn one', () => {
    const w = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'r' }))
    const d = applyPatch(w, deleteDocument(w, 'feb', { by: BY, at: LATER, mode: 'permanently', reason: 'r2' }))
    expect(d.document_log?.map(e => e.kind)).toEqual(['withdrawn', 'deleted'])
  })
  it('the confirmation and the tombstone say earlier saved versions still hold what was read, never naming one store', () => {
    expect(DELETE_PERMANENTLY_PROMPT('feb.pdf')).toBe('Delete feb.pdf permanently? The file and what was read from it are removed from this inventory. A record that it existed, who deleted it, when and why is kept. Earlier saved versions of this inventory still contain what was read from it. Give a reason.')
    expect(documentEventSentence(del.document_log![0])).toBe('feb.pdf was deleted by jo@acme.example on 2 October 2026: Holds another tenant\'s account details. The file and what was read from it were removed. Earlier saved versions of this inventory still contain what was read from it.')
    for (const t of [DELETE_PERMANENTLY_PROMPT('f'), documentEventSentence(del.document_log![0]), EARLIER_VERSIONS_SENTENCE]) expect(t).not.toMatch(/audit log|audit_log/i)
  })
})

describe('Delete (unused): logged and shown like every other entry', () => {
  it('a document with nothing acted on leaves an entry with who and when, and no reason is asked', () => {
    const l = site([gdoc('jan', [prop({})]), gdoc('scan', [prop({ ...FEB, status: 'extracted' })])])
    const d = applyPatch(l, deleteDocument(l, 'scan', { by: BY, at: AT, mode: 'unused' }))
    expect(docAt(d, 'scan')).toBeUndefined()
    expect(d.document_log).toEqual([{ kind: 'deleted_unused', docId: 'scan', file: 'scan.pdf', documentType: 'utility_bill_gas', uploadedAt: '2025-06-01T10:00:00.000Z', sha256: null, at: AT, by: BY }])
    expect(documentEventSentence(d.document_log![0])).toBe('scan.pdf was deleted by jo@acme.example on 2 October 2026. Nothing from it had been used.')
  })
})

describe('the saved workings: one row per document event', () => {
  it('every kind is a row with its sentence as the note, no factor, and the event itself', () => {
    let l = site([gdoc('jan', [prop({})]), gdoc('feb', [prop({ ...FEB })]), gdoc('scan', [prop({ ...FEB, status: 'extracted' })])])
    l = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'r1' }))
    l = applyPatch(l, restoreDocument(l, 'feb', { by: BY, at: AT, reason: 'r2' }))
    l = applyPatch(l, deleteDocument(l, 'feb', { by: BY, at: AT, mode: 'permanently', reason: 'r3' }))
    l = applyPatch(l, deleteDocument(l, 'scan', { by: BY, at: AT, mode: 'unused' }))
    const rows = (buildWorkings([deriveLocations({ locations: [l], reporting_year: 2025 })[0]], 'AR6', 2025, [], 12) as
      { source: string; gwp_basis: string; note?: string; result_tco2e: number | null; ef_source: string; document_event?: DocumentEvent }[]).filter(r => r.gwp_basis === DOCUMENT_EVENT_ROW_BASIS)
    expect(rows.map(r => r.source)).toEqual(['Document withdrawn: feb.pdf', 'Document restored: feb.pdf', 'Document deleted: feb.pdf', 'Document deleted, unused: scan.pdf'])
    expect(rows.map(r => r.document_event?.kind)).toEqual(['withdrawn', 'restored', 'deleted', 'deleted_unused'])
    expect(rows.every(r => r.result_tco2e === null && r.note === documentEventSentence(r.document_event!))).toBe(true)
    expect(rows.map(r => workingsFactorSourceCell(r))).toEqual(['Not applicable', 'Not applicable', 'Not applicable', 'Not applicable'])
  })
  it('no message here has an em dash', () => {
    const e = { docId: 'a', file: 'a.pdf', at: AT, by: BY }
    const all = [WITHDRAW_PROMPT('a'), RESTORE_PROMPT('a'), DELETE_PERMANENTLY_PROMPT('a'), DELETE_UNUSED_PROMPT('a'),
      documentEventSentence({ ...e, kind: 'withdrawn', reason: 'r' }), documentEventSentence({ ...e, kind: 'restored', reason: 'r' }),
      documentEventSentence({ ...e, kind: 'deleted', documentType: 'x', uploadedAt: AT, sha256: null, reason: 'r' }),
      documentEventSentence({ ...e, kind: 'deleted_unused', documentType: 'x', uploadedAt: AT, sha256: null })]
    for (const t of all) expect(t).not.toContain('—')
  })
})

describe('the document log is append-only on save', () => {
  const l = twoBills()
  const w = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'r' }))
  const baseline = documentLogBaseline([w])

  it('a payload missing an entry the loaded record had is refused', () => {
    expect(documentLogProblem(baseline, [{ ...w, document_log: [] }])).toBe('This save would remove the record of a document withdrawn, restored or deleted at Site A. That record is kept permanently, so nothing was saved. Reload the inventory and try again.')
    expect(documentLogProblem(baseline, [{ ...w, document_log: undefined }])).not.toBeNull()
  })
  it('an entry edited in place counts as missing', () => {
    expect(documentLogProblem(baseline, [{ ...w, document_log: [{ ...w.document_log![0], reason: 'changed' } as DocumentEvent] }])).not.toBeNull()
  })
  it('appending is allowed, and so is saving it unchanged', () => {
    expect(documentLogProblem(baseline, [w])).toBeNull()
    const r = applyPatch(w, restoreDocument(w, 'feb', { by: BY, at: LATER, reason: 'r' }))
    expect(documentLogProblem(baseline, [r])).toBeNull()
  })
  it('a location no longer in the payload is not checked (location delete: see the note in savePayload.ts)', () => {
    expect(documentLogProblem(baseline, [])).toBeNull()
  })
  it('the page keeps the loaded log per inventory and refuses before writing', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).toContain('loadedDocumentLog.current = { inventoryId: data.id, log: documentLogBaseline(data.locations_data) }')
    expect(page).toContain('documentLogProblem(loadedDocumentLog.current.log, saved.locations_data)')
    expect(page).toContain('if (logProblem) { lastSaveError.current = logProblem; alert(logProblem); return }')
    expect(page.indexOf('if (logProblem)'), 'refused before the payload is written').toBeLessThan(page.indexOf(".from('ghg_inventories').update(payload)"))
  })
})

// ── T18 section D: deleting a location ───────────────────────────────────────────────────────────────────────────
import { locationDeleteRecord, locationDeleteProblem, LOCATION_DELETE_REASON_PROMPT } from './documentActions'
import { locationLogBaseline, locationLogProblem } from './savePayload'

describe('the record a deleted location leaves', () => {
  const l = applyPatch(twoBills(), { name: 'Leeds', country: 'GB' })
  const withHistory = applyPatch(l, withdrawDocument(l, 'feb', { by: BY, at: AT, reason: 'Duplicate' }))

  it('a location with documents needs who and a reason, and leaves a tombstone per document with no reading', () => {
    expect(locationDeleteProblem(l, { by: BY, reason: ' ' })).toBe('Give a reason.')
    expect(locationDeleteProblem(l, { by: null, reason: 'x' })).toBe('Sign in to delete a location, so the record shows who did it.')
    const r = locationDeleteRecord(withHistory, { by: BY2, at: LATER, reason: 'Site closed in 2024' })
    expect(r).toMatchObject({ kind: 'location_deleted', locationId: 'L1', name: 'Leeds', country: 'GB', at: LATER, by: BY2, reason: 'Site closed in 2024' })
    expect(r.documents).toEqual(['jan', 'feb'].map(id => ({ kind: 'deleted', docId: id, file: `${id}.pdf`, documentType: 'utility_bill_gas',
      uploadedAt: '2025-06-01T10:00:00.000Z', sha256: null, at: LATER, by: BY2, reason: 'Site closed in 2024' })))
    expect(JSON.stringify(r.documents)).not.toMatch(/Gas used|sourceQuote|"value"/)
    expect(r.document_log, 'the location\'s earlier tombstones and withdrawals go with it').toEqual(withHistory.document_log)
  })
  it('a location with no documents leaves the lighter record: who, when, name and country', () => {
    const empty = { ...emptyLocation('L9', 'Annex'), country: 'US', source_docs: [] }
    expect(locationDeleteRecord(empty, { by: BY, at: AT })).toEqual({ kind: 'location_deleted', locationId: 'L9', name: 'Annex', country: 'US', at: AT, by: BY, documents: [] })
    expect(() => locationDeleteRecord(empty, { by: null as never, at: AT })).toThrow('Sign in to delete a location')
  })
  it('the reason prompt uses the earlier saved versions wording, singular and plural', () => {
    expect(LOCATION_DELETE_REASON_PROMPT('Leeds', 2)).toBe('Give a reason for deleting Leeds. Its 2 documents and what was read from them are removed. A record that they existed, who deleted them, when and why is kept. Earlier saved versions of this inventory still contain what was read from them.')
    expect(LOCATION_DELETE_REASON_PROMPT('Leeds', 1)).toContain('Its document and what was read from it are removed.')
    expect(LOCATION_DELETE_REASON_PROMPT('Leeds', 2)).not.toMatch(/audit log|—/i)
  })
})

describe('the deleted-location record is append-only on save', () => {
  const r1 = locationDeleteRecord(twoBills(), { by: BY, at: AT, reason: 'Closed' })
  const r2 = locationDeleteRecord({ ...emptyLocation('L9', 'Annex'), source_docs: [] }, { by: BY2, at: LATER })
  const baseline = locationLogBaseline([r1])
  const MSG = 'This save would remove or change the record of a location deleted from this inventory. That record is kept permanently, so nothing was saved. Reload the inventory and try again.'
  it('dropping or editing an entry is refused; appending passes; key order does not matter', () => {
    expect(locationLogProblem(baseline, [])).toBe(MSG)
    expect(locationLogProblem(baseline, undefined)).toBe(MSG)
    expect(locationLogProblem(baseline, [{ ...r1, reason: 'Changed' }])).toBe(MSG)
    expect(locationLogProblem(baseline, [{ ...r1, by: BY2 }])).toBe(MSG)
    expect(locationLogProblem(baseline, [r1, r2])).toBeNull()
    expect(locationLogProblem(baseline, [Object.fromEntries(Object.entries(r1).reverse()) as typeof r1])).toBeNull()
    expect(locationLogProblem([], undefined)).toBeNull()
  })
})
