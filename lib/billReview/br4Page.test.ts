// lib/billReview/br4Page.test.ts
//
// BR4: the wizard's side, read as source (a client page with no harness here).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
const upload = PAGE.slice(PAGE.indexOf('const handleFileUpload'), PAGE.indexOf('* Detach a source document'))

describe('BR4 wizard: a human-read upload', () => {
  it('is marked, kept back from the per-file append, then appended, sent to the team and saved at once (ruling 3)', () => {
    expect(upload).toContain("if (reading === 'human') doc.bill_review = { reading: 'human' }")
    expect(upload).toContain("if (doc.bill_review?.reading === 'human') { humanDocs.push(doc); continue }")
    const after = upload.slice(upload.indexOf('if (humanDocs.length > 0) {'))
    const ref = after.indexOf('inventoryRef.current = next')
    const send = after.indexOf('await submitBill(session.access_token, invId, locs[locIdx], d)')
    const save = after.indexOf('await handleSave()')
    expect(ref).toBeGreaterThan(-1)
    expect(ref).toBeLessThan(send)
    expect(send).toBeLessThan(save)
  })
  it('never reaches the extract call', () => {
    expect(upload.indexOf("if (CONCIERGE_DEV && reading !== 'ai') {")).toBeLessThan(upload.indexOf("fetch('/api/concierge/extract'"))
    expect(upload).toContain("} else if (CONCIERGE_DEV && reading === 'ai' && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)) {")
  })
  it('the submission sends the stored path and the inventory, never a date', () => {
    const fn = PAGE.slice(PAGE.indexOf('const submitBill = async'), PAGE.indexOf('const refreshBillReview = async'))
    expect(fn).toContain("fetch('/api/bill-review/submit'")
    expect(fn).toContain('filePath: doc.file_path, inventoryId: invId, sourceDocId: doc.id')
    expect(fn).not.toMatch(/expected/i)
  })
})

describe('BR4 wizard: the read-back', () => {
  const fn = PAGE.slice(PAGE.indexOf('const refreshBillReview = async'), PAGE.indexOf('const handleFileUpload'))
  it('reads the team’s records and readings with the customer’s own client, never read_by', () => {
    expect(fn).toContain("supabase.from('bill_review_documents')")
    expect(fn).toContain("supabase.from('bill_review_readings')")
    expect(fn).not.toContain('read_by')
    expect(fn).toContain("filter(r => r.status === 'read')")
  })
  it('merges through mergeReadings, and sends again any bill with no record', () => {
    expect(fn).toContain('mergeReadings(now.locations, rows as BillReviewRow[], readings)')
    expect(fn).toContain('const missing = humanDocs.filter(x => !byPath[x.d.file_path] && !x.d.withdrawn)')
  })
  it('on load and when the page becomes visible again', () => {
    expect(PAGE).toContain('useEffect(() => { if (inventoryId) refreshBillReviewRef.current(inventoryId) }, [inventoryId])')
    expect(PAGE).toContain("document.addEventListener('visibilitychange', onVisible)")
    expect(PAGE).toContain("document.removeEventListener('visibilitychange', onVisible)")
  })
})

describe('BR4 wizard: what the customer reads', () => {
  it('the document list shows the team’s line in place of the stored note', () => {
    expect(PAGE).toContain('<BillReviewDocNotes doc={doc} />')
    expect(PAGE).toContain('{doc.read_note && !billReviewLine(doc, billReview) && (')
    expect(PAGE).toContain('<BillReviewContext.Provider value={billReview}>')
  })
  it('every figure on step 2 knows whether it waits on the team (Q12)', () => {
    const sites = [...PAGE.matchAll(/<FigureInput [^\n]*/g)].map(m => m[0])
    expect(sites.length).toBe(6)
    for (const s of sites) expect(s).toMatch(/withTeam=\{withTeamFor\(loc, [^)]+, billReview\.rows\)\}/)
  })
})
