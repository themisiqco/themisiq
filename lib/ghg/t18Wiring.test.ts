// lib/ghg/t18Wiring.test.ts
//
// T18 diff 4: the page and the verifier page wire the T18 records (source). The behaviour behind each line is tested
// where it lives: lib/ghg/documentActions.test.ts, savePayload's guards, evidenceRecord, workingsCells.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from '../testing/stripComments'

const PAGE = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
const VERIFY = readFileSync(join(process.cwd(), 'app/verify/[token]/page.tsx'), 'utf8')
const body = (fn: string, n = 4000) => { const i = PAGE.indexOf(fn); expect(i, fn).toBeGreaterThan(-1); return PAGE.slice(i, i + n) }

describe('document actions replace Remove', () => {
  it('each button is one documentActionsFor offers, and needs a signed-in person', () => {
    expect(PAGE).toContain('documentActionsFor(doc).map(a => (')
    expect(PAGE).toContain('<button key={a} disabled={!currentUser} onClick={() => onDocumentAction(locId, doc.id, a, `${locIdx}:${docType}`)}')
    expect(PAGE).not.toContain('onRemove={removeDoc}')
  })
  it('each action asks with the design\'s message, and a reason where one is required', () => {
    const b = body('const documentAction = async')
    expect(b).toContain('if (!window.confirm(DELETE_UNUSED_PROMPT(doc.file_name))) return')
    expect(b).toContain("const prompt = action === 'withdraw' ? WITHDRAW_PROMPT : action === 'restore' ? RESTORE_PROMPT : DELETE_PERMANENTLY_PROMPT")
    expect(b).toContain('const problem = documentActionProblem(doc, action, { by: currentUser, reason })')
    expect(b).toContain("await removeDoc(locId, docId, doc.file_path, errorKey, { mode: 'permanently', reason, by: currentUser })")
    expect(b).toContain("patch: loc => action === 'withdraw' ? withdrawDocument(loc, docId, { by, at, reason }) : restoreDocument(loc, docId, { by, at, reason }),")
  })
  it('a delete builds its tombstone before storage is asked, and saves it once the file is gone', () => {
    const b = body('const removeDoc = async', 5000)
    expect(b.indexOf('tombstone = deleteDocument(before, docId')).toBeLessThan(b.indexOf('await removeStored('))
    expect(b).toContain('document_log: [...(loc.document_log ?? []), tombstone]')
    expect(b).toContain("if (outcome === 'removed') {")
    expect(b).toContain('await handleSave()')
  })
  it('a withdrawn document says so, and its readings offer no Undo', () => {
    expect(PAGE).toContain("p.status === 'rejected' && doc.withdrawn ? (")
    expect(PAGE).toContain('Withdrawn by {doc.withdrawn.by.email} on {plainDate(doc.withdrawn.at)}: {doc.withdrawn.reason}. Kept as evidence and not counted.')
  })
})

describe('location deletion (section D)', () => {
  const b = body('const removeLocationOnce = async', 6000)
  it('a location with documents asks for a reason; the record is written for anyone signed in', () => {
    expect(b).toContain('const given = window.prompt(LOCATION_DELETE_REASON_PROMPT(loc.name, docCount))')
    expect(b).toContain('const record = currentUser ? locationDeleteRecord(loc, { by: currentUser, at: new Date().toISOString(), reason }) : null')
    expect(b).toContain('...(record ? { location_log: [...(inv.location_log ?? []), record] } : {}),')
  })
  it('the save that follows sees the change: the ref is set first, and handleSave reads the ref', () => {
    expect(b.indexOf('inventoryRef.current = next')).toBeLessThan(b.indexOf('await handleSave()'))
    expect(body('const handleSave = async', 1200)).toContain('const inventory = inventoryRef.current')
  })
  it('the record is loaded, saved and guarded', () => {
    expect(PAGE).toContain('location_log: Array.isArray(data.location_log) ? data.location_log : [],')
    expect(PAGE).toContain('location_log: inventory.location_log ?? [],')
    expect(PAGE).toContain('locationLogProblem(loadedLocationLog.current.log, inventory.location_log)')
    expect(PAGE.indexOf('if (locationLogIssue)')).toBeLessThan(PAGE.indexOf(".from('ghg_inventories').update(payload)"))
  })
})

describe('the evidence list, the on-screen workings and the unsaved wording', () => {
  it('the location step shows the evidence list and the deleted locations', () => {
    expect(PAGE).toContain('<LocationEvidenceRecord location={inventory.locations[activeLocation]} />')
    expect(PAGE).toContain('<DeletedLocationsRecord log={inventory.location_log} />')
  })
  it('event rows read as the record, and every priced or unpriced row shows its who and when', () => {
    expect(PAGE).toContain('if (r.gwp_basis === DOCUMENT_EVENT_ROW_BASIS) {')
    expect(PAGE.split('{whoWhen(r)}').length - 1).toBe(2)
  })
  it('only an inventory with no id is unsaved', () => {
    expect(PAGE).toContain('const factorCtx = { ...selectionContextFor(inventory), ...(inventoryId ? {} : { unsaved: true as const }) }')
  })
})

describe('the verifier page', () => {
  it('lists the document and location record from the saved workings, only when there is one', () => {
    expect(VERIFY).toContain('{eventRowsOf(inv.workings).length > 0 && (')
    expect(VERIFY).toContain('<SectionHead>Document and location record</SectionHead>')
    expect(VERIFY).toContain("import { workingsActivityCell")
    expect(VERIFY).not.toContain("from '../../../lib/ghg/evidenceRecord'")
  })
})
