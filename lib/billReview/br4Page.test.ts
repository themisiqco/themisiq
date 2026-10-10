// lib/billReview/br4Page.test.ts
//
// BR4: the wizard's side, read as source (a client page with no harness here).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
const upload = PAGE.slice(PAGE.indexOf('const handleFileUpload'), PAGE.indexOf('* Detach a source document'))

describe('BR4 wizard: a human-read upload', () => {
  it('is marked, kept back from the per-file append, sent to the team, then appended and saved at once (ruling 3; BR7: sent first)', () => {
    expect(upload).toContain("if (reading === 'human') doc.bill_review = { reading: 'human' }")
    expect(upload).toContain("if (doc.bill_review?.reading === 'human') { humanDocs.push(doc); continue }")
    const after = upload.slice(upload.indexOf('if (humanDocs.length > 0) {'))
    const send = after.indexOf('await submitBill(session.access_token, invId, inventoryRef.current.locations[locIdx], d)')
    const date = after.indexOf("else d.bill_review = { reading: 'human', expectedBy: sent.expectedBy }")
    const ref = after.indexOf('inventoryRef.current = next')
    const save = after.indexOf('await handleSave()')
    expect(send).toBeGreaterThan(-1)
    expect(send).toBeLessThan(date)
    expect(date).toBeLessThan(ref)
    expect(ref).toBeLessThan(save)
  })
  it('never reaches the extract call', () => {
    expect(upload.indexOf("if (CONCIERGE_DEV && reading !== 'ai') {")).toBeLessThan(upload.indexOf("fetch('/api/concierge/extract'"))
    expect(upload).toContain("} else if (CONCIERGE_DEV && reading === 'ai' && !CONCIERGE_UNREAD_DOC_TYPES.has(docType)) {")
  })
  it('the submission sends the stored path and the inventory, never a date', () => {
    const fn = PAGE.slice(PAGE.indexOf('const submitBill = async'), PAGE.indexOf('const refreshBillReview = async'))
    expect(fn).toContain("fetch('/api/bill-review/submit'")
    expect(fn).toContain('filePath: doc.file_path, inventoryId: invId, sourceDocId: doc.id')
    // The request names no date: the route computes it. BR7: the page reads the date back from the response only.
    const body = fn.slice(fn.indexOf('body: JSON.stringify({'), fn.indexOf('}),', fn.indexOf('body: JSON.stringify({')))
    expect(body).not.toMatch(/expected/i)
    expect(fn).toContain("return { ok: true, expectedBy: typeof body?.expectedBy === 'string' ? body.expectedBy : null }")
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
    expect(PAGE).toContain("{doc.read_note && !billReviewLine(doc, billReview) && !(doc.bill_review && doc.read_outcome === 'abstained' && unreadBlocking.has(doc.id)) && (")
    expect(PAGE).toContain('<BillReviewContext.Provider value={billReview}>')
  })
  it('every figure on step 2 knows whether it waits on the team (Q12)', () => {
    const sites = [...PAGE.matchAll(/<FigureInput [^\n]*/g)].map(m => m[0])
    expect(sites.length).toBe(6)
    for (const s of sites) expect(s).toMatch(/withTeam=\{withTeamFor\(loc, [^)]+, billReview\.rows\)\}/)
  })
})
