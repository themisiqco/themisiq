// lib/staff/billReviewQueue.test.ts
//
// BR8: the staff routes, end to end with an in-memory database (lib/testing/fakeAdmin.ts). The role check, the log
// rule, the path rule, the reading check and the order of every write are real.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeAdmin, type FakeAdmin } from '../testing/fakeAdmin'

const h = vi.hoisted(() => ({ db: null as unknown, notify: [] as string[] }))
vi.mock('../supabaseAuthed', () => {
  class AuthError extends Error {}
  const users: Record<string, string> = { 'reader-token': 'staff-1', 'lead-token': 'lead-1', 'cust-token': 'cust-1' }
  return {
    AuthError,
    bearerFrom: (req: Request) => req.headers.get('authorization')?.replace('Bearer ', '') ?? null,
    getAuthedClient: async (t: string | null) => { if (!t || !users[t]) throw new AuthError('Invalid or expired session'); return { userId: users[t], supabase: {}, email: undefined } },
  }
})
vi.mock('../supabase', () => ({ createServerClient: () => h.db }))
vi.mock('../billReview/notices', () => ({ notifyIfBatchComplete: async (_a: unknown, inv: string) => { h.notify.push(inv); (h.db as FakeAdmin).calls.push('notify'); return 'not_complete' } }))

import { GET as queue } from '../../app/api/staff/bill-review/queue/route'
import { POST as open } from '../../app/api/staff/bill-review/open/route'
import { POST as read } from '../../app/api/staff/bill-review/read/route'
import { POST as unreadable } from '../../app/api/staff/bill-review/unreadable/route'
import { GET as switchView, POST as switchSet } from '../../app/api/staff/bill-review/reading-switch/route'
import { STAFF_ONLY } from './access'

const OWNER = 'cust-1'
const PATH = `${OWNER}/inv-1/2026/Leeds/1_jan.pdf`
const doc = (id: string, o: Record<string, unknown> = {}) => ({ id, file_name: `${id}.pdf`, document_type: 'utility_electricity', uploaded_at: '', file_path: PATH, bill_review: { reading: 'human' }, ...o })
let db: FakeAdmin
function seed(o: { docOnInventory?: Record<string, unknown> | null; status?: string; rowPath?: string; failLog?: boolean; tomb?: boolean } = {}) {
  const docs = o.docOnInventory === null ? [] : [doc('d1', o.docOnInventory ?? {})]
  db = fakeAdmin({
    staff_roles: [
      { id: 'r1', user_id: 'staff-1', role: 'bill_reader', revoked_at: null },
      { id: 'r2', user_id: 'lead-1', role: 'bill_reader', revoked_at: null },
      { id: 'r3', user_id: 'lead-1', role: 'bill_review_lead', revoked_at: null },
      { id: 'r4', user_id: 'gone-1', role: 'bill_reader', revoked_at: '2026-10-01T00:00:00Z' },
    ],
    staff_access_log: [],
    bill_review_documents: [
      { id: 'b1', inventory_id: 'inv-1', user_id: OWNER, source_doc_id: 'd1', file_path: o.rowPath ?? PATH, file_name: 'jan.pdf', document_type: 'utility_electricity',
        location_name: 'Leeds', status: o.status ?? 'waiting', submitted_at: '2026-10-19T14:00:00Z', expected_by: '2026-10-21', expected_by_refusal: null, read_at: null, unreadable_note: null },
      { id: 'b2', inventory_id: 'inv-1', user_id: OWNER, source_doc_id: 'd2', file_path: `${OWNER}/inv-1/2026/Leeds/2_feb.pdf`, file_name: 'feb.pdf', document_type: 'utility_electricity',
        location_name: 'Leeds', status: 'waiting', submitted_at: '2026-10-01T14:00:00Z', expected_by: '2026-10-05', expected_by_refusal: null, read_at: null, unreadable_note: null },
    ],
    ghg_inventories: [{ id: 'inv-1', user_id: OWNER, company_name: 'Acme Ltd', reporting_year: 2025, fiscal_year_end_month: 9, bill_review_reading: 'human',
      locations_data: [{ id: 'L1', name: 'Leeds', source_docs: docs, ...(o.tomb ? { document_log: [{ kind: 'deleted', docId: 'd1', at: '2026-10-20T00:00:00Z' }] } : {}) }], location_log: [] }],
    bill_review_readings: [],
    bill_review_notices: [{ id: 'n1', kind: 'ready', inventory_id: 'inv-1', status: 'failed', attempts: 5, last_error: 'resend_500', last_attempt_at: '2026-10-21T13:00:00Z' }],
  }, { failInsertInto: o.failLog ? new Set(['staff_access_log']) : undefined,
       rpc: (fn) => fn === 'staff_set_bill_review_reading' ? { data: '2026-10-22T10:00:00Z', error: null } : { data: null, error: null } })
  h.db = db
  h.notify = []
}
const req = (token: string | null, body?: unknown, url = 'http://x/api') => new Request(url, {
  method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) }) as never
const withUrl = (r: Request) => Object.assign(r, { nextUrl: new URL(r.url) }) as never
const reading = { fuelType: 'electricity', value: 4210, unit: 'kwh', periodStart: '2026-01-01', periodEnd: '2026-01-31', sourceQuote: 'Total usage 4,210 kWh' }
const logged = () => db.tables.staff_access_log.map(r => r.action)

beforeEach(() => { seed(); vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}) })

describe('BR8: non-staff are refused, server side', () => {
  it('no session 401; a customer, and a revoked role, 403 with the one sentence; nothing logged or read', async () => {
    expect((await queue(withUrl(req(null)))).status).toBe(401)
    for (const t of ['cust-token']) {
      const res = await queue(withUrl(req(t)))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'staff_only', message: STAFF_ONLY })
    }
    expect(logged()).toEqual([])
    expect(db.calls).toEqual([])
  })
  it('the reading switch is for a lead only: a bill reader gets 403', async () => {
    expect((await switchView(withUrl(req('reader-token', undefined, 'http://x/api?inventoryId=inv-1'))))).toMatchObject({ status: 403 })
    expect((await switchSet(withUrl(req('reader-token', { inventoryId: 'inv-1', reading: 'ai' }))))).toMatchObject({ status: 403 })
    expect(db.calls.filter(c => c.startsWith('rpc'))).toEqual([])
  })
})

describe('BR8: the queue', () => {
  it('overdue first, then oldest first; logged; failed emails shown', async () => {
    const res = await queue(withUrl(req('reader-token')))
    expect(res.status).toBe(200)
    const q = await res.json()
    // b2 was due 5 Oct, so it is overdue whatever today is; it leads, though it is not on the saved inventory.
    expect(q.waiting.map((x: { id: string }) => x.id)).toEqual(['b2', 'b1'])
    expect(q.waiting[0]).toMatchObject({ id: 'b2', overdue: true, readable: false, customerState: 'not_on_inventory' })
    expect(q.waiting[1]).toMatchObject({ id: 'b1', company: 'Acme Ltd', year: 'the year ending 30 September 2025', site: 'Leeds', readable: true })
    expect(q.failedEmails).toEqual([expect.objectContaining({ kind: 'ready', attempts: 5, last_error: 'resend_500', company: 'Acme Ltd' })])
    expect(logged()).toEqual(['view_queue'])
  })
  it('a bill the customer deleted is shown, not readable', async () => {
    seed({ docOnInventory: null, tomb: true })
    const q = await (await queue(withUrl(req('reader-token')))).json()
    expect(q.waiting.find((x: { id: string }) => x.id === 'b1')).toMatchObject({ customerState: 'deleted', readable: false, stateWords: 'Deleted by the customer. It cannot be read.' })
  })
})

describe('BR8: opening a bill', () => {
  it('the view is logged before the signed URL, which lives 300 s, by the row’s path; a browser-sent path is never signed', async () => {
    const res = await open(withUrl(req('reader-token', { documentId: 'b1', filePath: 'someone-else/secret.pdf', path: 'x' })))
    expect(res.status).toBe(200)
    expect(db.calls.slice(0, 2)).toEqual(['insert:staff_access_log', `sign:${PATH}:300`])
    expect(db.calls.join()).not.toContain('secret.pdf')
    expect(logged()).toEqual(['view_document'])
  })
  it('a path outside the owner’s folder, or not the saved bill’s path, is refused and nothing is signed (SEC-01)', async () => {
    seed({ rowPath: 'other-user/inv-1/2026/Leeds/1_jan.pdf' })
    expect((await open(withUrl(req('reader-token', { documentId: 'b1' })))).status).toBe(409)
    seed({ docOnInventory: { file_path: `${OWNER}/inv-1/2026/Leeds/9_other.pdf` } })
    expect((await open(withUrl(req('reader-token', { documentId: 'b1' })))).status).toBe(409)
    expect(db.calls.filter(c => c.startsWith('sign'))).toEqual([])
  })
  it('a withdrawn or deleted bill cannot be opened or read', async () => {
    seed({ docOnInventory: { withdrawn: { at: '', by: { userId: OWNER, email: '' }, reason: 'dup' } } })
    expect((await open(withUrl(req('reader-token', { documentId: 'b1' })))).status).toBe(409)
    expect((await read(withUrl(req('reader-token', { documentId: 'b1', readings: [reading] })))).status).toBe(409)
    seed({ docOnInventory: null, tomb: true })
    const res = await read(withUrl(req('reader-token', { documentId: 'b1', readings: [reading] })))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Deleted by the customer. It cannot be read.')
    expect(db.calls.filter(c => c.startsWith('insert:bill_review'))).toEqual([])
  })
  it('a failed log write fails the request: nothing signed', async () => {
    seed({ failLog: true })
    expect((await open(withUrl(req('reader-token', { documentId: 'b1' })))).status).toBe(503)
    expect(db.calls.filter(c => c.startsWith('sign'))).toEqual([])
  })
})

describe('BR8: saving readings and marking unreadable', () => {
  it('logged first; readings saved by the session’s reader; the bill moved to read; then notifyIfBatchComplete', async () => {
    const res = await read(withUrl(req('reader-token', { documentId: 'b1', readings: [reading, { ...reading, read_by: 'someone-else' }] })))
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['insert:staff_access_log', 'insert:bill_review_readings', 'update:bill_review_documents', 'notify'])
    expect(db.tables.bill_review_readings.map(r => r.read_by)).toEqual(['staff-1', 'staff-1'])
    expect(db.tables.bill_review_documents[0]).toMatchObject({ status: 'read', read_by: 'staff-1' })
    expect(h.notify).toEqual(['inv-1'])
    expect(logged()).toEqual(['save_reading'])
  })
  it('a reading that fails the server’s check is refused with its reason, nothing written', async () => {
    const res = await read(withUrl(req('reader-token', { documentId: 'b1', readings: [{ ...reading, sourceQuote: '' }] })))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Copy the figure and its unit exactly as printed on the bill.')
    expect(db.calls).toEqual([])
  })
  it('can’t read: the note required; logged first; the bill moved to unreadable with it; then notifyIfBatchComplete', async () => {
    expect((await unreadable(withUrl(req('reader-token', { documentId: 'b1', note: ' ' })))).status).toBe(400)
    const res = await unreadable(withUrl(req('reader-token', { documentId: 'b1', note: 'The meter section is torn off.' })))
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['insert:staff_access_log', 'update:bill_review_documents', 'notify'])
    expect(db.tables.bill_review_documents[0]).toMatchObject({ status: 'unreadable', read_by: 'staff-1', unreadable_note: 'The meter section is torn off.' })
    expect(logged()).toEqual(['mark_unreadable'])
  })
  it('a bill already read cannot be marked unreadable; one marked unreadable cannot be read', async () => {
    seed({ status: 'read' })
    expect((await unreadable(withUrl(req('reader-token', { documentId: 'b1', note: 'x' })))).status).toBe(409)
    seed({ status: 'unreadable' })
    expect((await read(withUrl(req('reader-token', { documentId: 'b1', readings: [reading] })))).status).toBe(409)
  })
})

describe('BR8: the reading switch (Q1)', () => {
  it('the confirmation screen: logged, the sentence and the count of bills read by the AI', async () => {
    db.tables.ghg_inventories[0].bill_review_reading = 'ai'
    ;(db.tables.ghg_inventories[0].locations_data as { source_docs: unknown[] }[])[0].source_docs.push({ id: 'ai-1', extracted: [{}] }, { id: 'ai-2', extracted: [{}] })
    const v = await (await switchView(withUrl(req('lead-token', undefined, 'http://x/api?inventoryId=inv-1')))).json()
    expect(v).toMatchObject({ reading: 'ai', to: 'human', readByAi: 2 })
    expect(v.sentence).toContain('2 bills were already read by the AI.')
    expect(logged()).toEqual(['view_reading_switch'])
  })
  it('the change: logged first, then the function, with the session’s lead as the staff user (set_by)', async () => {
    let args: Record<string, unknown> = {}
    db = fakeAdmin(db.tables, { rpc: (fn, a) => { args = a; return { data: '2026-10-22T10:00:00Z', error: null } } }); h.db = db
    const res = await switchSet(withUrl(req('lead-token', { inventoryId: 'inv-1', reading: 'ai', staffUserId: 'someone-else' })))
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['insert:staff_access_log', 'rpc:staff_set_bill_review_reading'])
    expect(args).toEqual({ p_inventory_id: 'inv-1', p_reading: 'ai', p_staff_user_id: 'lead-1' })
  })
})
