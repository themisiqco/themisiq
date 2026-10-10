// lib/staff/spotChecks.test.ts
//
// BR8b: the spot-check routes, end to end with an in-memory database. The role check, the log rule, the sample and the
// path rule are real.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeAdmin, type FakeAdmin } from '../testing/fakeAdmin'
import { inSample, sampleKey } from '../billReview/spotCheckSample'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../supabaseAuthed', () => {
  class AuthError extends Error {}
  const users: Record<string, string> = { 'reader-token': 'staff-1', 'cust-token': 'cust-1' }
  return {
    AuthError,
    bearerFrom: (req: Request) => req.headers.get('authorization')?.replace('Bearer ', '') ?? null,
    getAuthedClient: async (t: string | null) => { if (!t || !users[t]) throw new AuthError('x'); return { userId: users[t], supabase: {}, email: undefined } },
  }
})
vi.mock('../supabase', () => ({ createServerClient: () => h.db }))

import { GET as list } from '../../app/api/staff/bill-review/spot-checks/route'
import { POST as openOne } from '../../app/api/staff/bill-review/spot-check/open/route'
import { POST as record } from '../../app/api/staff/bill-review/spot-check/route'

const pick = (want: boolean) => { for (let i = 0; ; i++) if (inSample(sampleKey('inv-1', `d${i}`, 'electricity', 0)) === want) return `d${i}` }
const IN = pick(true), OUT = pick(false)
const proposal = { fuelType: 'electricity', rawValue: 4210, rawUnit: 'kWh', value: 4210, unit: 'kwh', periodStart: '2026-01-01', periodEnd: '2026-01-31', sourceQuote: 'Total 4,210 kWh', status: 'confirmed',
  confirmations: [{ at: '2026-10-01T09:00:00Z', by: { userId: 'cust-1', email: 'jo@acme.example' }, reading: {} }] }
const doc = (id: string, o: Record<string, unknown> = {}) => ({ id, file_name: `${id}.pdf`, document_type: 'utility_electricity', file_path: `cust-1/inv-1/2026/Leeds/${id}.pdf`, extracted: [proposal], ...o })
let db: FakeAdmin
function seed(docs: Record<string, unknown>[], o: { failLog?: boolean } = {}) {
  db = fakeAdmin({
    staff_roles: [{ id: 'r1', user_id: 'staff-1', role: 'bill_reader', revoked_at: null }],
    staff_access_log: [],
    ghg_inventories: [{ id: 'inv-1', user_id: 'cust-1', company_name: 'Acme Ltd', reporting_year: 2026, fiscal_year_end_month: 12, locations_data: [{ id: 'L1', name: 'Leeds', source_docs: docs }] }],
    bill_review_spot_checks: [],
  }, { failInsertInto: o.failLog ? new Set(['staff_access_log']) : undefined })
  h.db = db
}
const req = (token: string, body?: unknown) => Object.assign(new Request('http://x/api', { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${token}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), { nextUrl: new URL('http://x/api') }) as never
const ident = (docId: string) => ({ inventoryId: 'inv-1', sourceDocId: docId, fuelType: 'electricity', proposalIndex: 0 })
const logged = () => db.tables.staff_access_log.map(r => r.action)

beforeEach(() => { seed([doc(IN), doc(OUT)]); vi.spyOn(console, 'warn').mockImplementation(() => {}) })

describe('BR8b spot-check routes', () => {
  it('non-staff are refused, nothing logged', async () => {
    expect((await list(req('cust-token'))).status).toBe(403)
    expect(logged()).toEqual([])
  })
  it('the sample lists the in-sample reading only; logged', async () => {
    const r = await (await list(req('reader-token'))).json()
    expect(r.items.map((i: { sourceDocId: string }) => i.sourceDocId)).toEqual([IN])
    expect(logged()).toEqual(['view_spot_checks'])
  })
  it('opening: the AI reading view, then the document view, logged before the 300 s URL, by the saved path', async () => {
    const res = await openOne(req('reader-token', { ...ident(IN), filePath: 'someone/else.pdf' }))
    expect(res.status).toBe(200)
    expect(logged()).toEqual(['view_ai_reading', 'view_document'])
    expect(db.calls).toEqual(['insert:staff_access_log', 'insert:staff_access_log', `sign:cust-1/inv-1/2026/Leeds/${IN}.pdf:300`])
  })
  it('a reading outside the sample, a human-read bill, or a path outside the owner’s folder is refused, nothing signed', async () => {
    expect((await openOne(req('reader-token', ident(OUT)))).status).toBe(409)
    seed([doc(IN, { bill_review: { reading: 'human' } })])
    expect((await openOne(req('reader-token', ident(IN)))).status).toBe(409)
    seed([doc(IN, { file_path: `other-user/inv-1/2026/Leeds/${IN}.pdf` })])
    expect((await openOne(req('reader-token', ident(IN)))).status).toBe(409)
    expect(db.calls.filter(c => c.startsWith('sign'))).toEqual([])
  })
  it('recording: a difference needs a note; logged first; who from the session; the reading as seen; once only', async () => {
    expect((await record(req('reader-token', { ...ident(IN), result: 'disagrees', note: '' }))).status).toBe(400)
    const res = await record(req('reader-token', { ...ident(IN), result: 'disagrees', note: 'The bill shows 4,120 kWh.', checkedBy: 'someone-else' }))
    expect(res.status).toBe(200)
    expect(db.calls).toEqual(['insert:staff_access_log', 'insert:bill_review_spot_checks'])
    expect(db.tables.bill_review_spot_checks[0]).toMatchObject({ inventory_id: 'inv-1', source_doc_id: IN, fuel_type: 'electricity', proposal_index: 0,
      result: 'disagrees', note: 'The bill shows 4,120 kWh.', checked_by: 'staff-1', reading: expect.objectContaining({ rawValue: 4210, sourceQuote: 'Total 4,210 kWh' }) })
    expect((await record(req('reader-token', { ...ident(IN), result: 'agrees' }))).status).toBe(409)
  })
  it('a failed log write fails the request: nothing recorded', async () => {
    seed([doc(IN)], { failLog: true })
    expect((await record(req('reader-token', { ...ident(IN), result: 'agrees' }))).status).toBe(503)
    expect(db.tables.bill_review_spot_checks).toEqual([])
  })
})
