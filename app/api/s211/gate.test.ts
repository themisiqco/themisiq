// app/api/s211/gate.test.ts
// Every S-211 route in each of the four states: signed out, never bought (preview), expired (read-only)
// and active (full), plus access that cannot be checked. Supabase is replaced by an in-memory fake that
// records every call, so a refusal can be shown to have touched no table, and a write refused for want of
// write access can be shown never to have reached one.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'
import { SIGNED_OUT_MESSAGE, PREVIEW_MESSAGE, READ_ONLY_MESSAGE, UNKNOWN_MESSAGE } from '../../../lib/s211/builderAccess'
import { SINGLE_REPORT } from '../../../lib/s211/reportModel.fixtures'

// auth: 'ok' signs in as h.userId; 'missing' is a request with no token; 'junk' a token Supabase rejects.
const h = vi.hoisted(() => ({ userId: 'u1', auth: 'ok' as 'ok' | 'missing' | 'junk', db: null as unknown as FakeDb }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => {
    if (h.auth === 'missing') throw new Error('Missing access token')
    if (h.auth === 'junk') throw new Error('Invalid or expired session')
    return { supabase: fakeSupabase(h.db), userId: h.userId, email: undefined }
  },
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}))

import { GET as access } from './access/route'
import { GET as listReports, POST as createReport } from './reports/route'
import { GET as getReport, PATCH as patchReport } from './reports/[id]/route'
import { PUT as putSection } from './reports/[id]/sections/[key]/route'
import { GET as exportReport } from './reports/[id]/export/route'

const req = (body?: unknown) => new Request('http://x/api/s211', { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) })
type State = 'full' | 'read-only' | 'preview'
const grant = (read: boolean, write: boolean) => { h.db.rpc = { s211_can_read: { data: read, error: null }, s211_can_write: { data: write, error: null } } }
const as = (s: State) => grant(s !== 'preview', s === 'full')

const READS = () => [
  ['list', listReports(req())], ['open', getReport(req(), ctx({ id: 'r1' }))], ['export', exportReport(req(), ctx({ id: 'r1' }))],
] as const
const WRITES = () => [
  ['create', createReport(req({ company_name: 'X', reporting_year: 2026 }))],
  ['patch', patchReport(req({ listed_in_canada: true }), ctx({ id: 'r1' }))],
  ['save a section', putSection(req({ content: { legal_name: 'X' } }), ctx({ id: 'r1', key: 'report_details' }))],
] as const
const tables = () => h.db.calls.filter(c => c.startsWith('from:'))

beforeEach(() => {
  h.userId = 'u1'
  h.auth = 'ok'
  const sections = Object.entries(SINGLE_REPORT.sections).map(([section_key, content]) => ({ report_id: 'r1', section_key, content: structuredClone(content), status: 'complete' }))
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'u1', company_name: 'Harrowgate', reporting_year: 2026 }], s211_report_sections: sections }, calls: [] }
  as('full')
})

describe('signed out, or a token Supabase rejects: 401 on every route, and the database is not asked anything', () => {
  for (const auth of ['missing', 'junk'] as const) {
    it(auth, async () => {
      h.auth = auth
      for (const [name, p] of [...READS(), ...WRITES(), ['access', access(req())] as const]) {
        const r = await p
        expect(r.status, name).toBe(401)
        expect(await r.json(), name).toEqual({ error: SIGNED_OUT_MESSAGE, state: 'signed-out' })
      }
      expect(h.db.calls).toEqual([])
    })
  }
})

describe('never bought (preview): 403 naming the state, and no table is touched', () => {
  it('reads and writes are refused', async () => {
    as('preview')
    for (const [name, p] of [...READS(), ...WRITES()]) {
      const r = await p
      expect(r.status, name).toBe(403)
      expect(await r.json(), name).toEqual({ error: PREVIEW_MESSAGE, state: 'preview' })
    }
    expect(tables()).toEqual([])
  })
  it('the access route answers 200 with the state, so the page can show the preview', async () => {
    as('preview')
    const r = await access(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ state: 'preview' })
  })
})

describe('expired (read-only): reads work, writes are refused before any table', () => {
  beforeEach(() => as('read-only'))
  it('list, open and export succeed', async () => {
    const [list, open, pdf] = await Promise.all(READS().map(([, p]) => p))
    expect(list.status).toBe(200)
    expect(open.status).toBe(200)
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf')
  })
  it('create, patch and saving a section are refused with the expired message, and no write reaches a table', async () => {
    const before = structuredClone(h.db.tables)
    for (const [name, p] of WRITES()) {
      const r = await p
      expect(r.status, name).toBe(403)
      expect(await r.json(), name).toEqual({ error: READ_ONLY_MESSAGE, state: 'read-only' })
    }
    expect(tables()).toEqual([])
    expect(h.db.tables).toEqual(before)
  })
  it('the access route says read-only', async () => {
    expect(await (await access(req())).json()).toEqual({ state: 'read-only' })
  })
})

describe('active term, or a row in s211_access (full): every route works', () => {
  // Both grant the same thing: s211_can_write() is true for either (the migration's two branches).
  it('reads, writes and export succeed', async () => {
    const [list, open, pdf] = await Promise.all(READS().map(([, p]) => p))
    expect([list.status, open.status, pdf.status]).toEqual([200, 200, 200])
    expect((await createReport(req({ company_name: ' Harrowgate Retail ', reporting_year: 2026 }))).status).toBe(201)
    expect(h.db.tables.s211_reports.at(-1)).toMatchObject({ user_id: 'u1', company_name: 'Harrowgate Retail', reporting_year: 2026 })
    expect((await patchReport(req({ listed_in_canada: false }), ctx({ id: 'r1' }))).status).toBe(200)
    expect((await putSection(req({ content: { legal_name: 'X' } }), ctx({ id: 'r1', key: 'report_details' }))).status).toBe(200)
    expect(await (await access(req())).json()).toEqual({ state: 'full' })
  })
  it('asks both functions as the user before the first table', async () => {
    await listReports(req())
    expect(h.db.calls.slice(0, 2).sort()).toEqual(['rpc:s211_can_read', 'rpc:s211_can_write'])
    expect(h.db.calls[2]).toBe('from:s211_reports')
  })
  it('creates a report, refusing a blank name or a year before the Act\'s first reports', async () => {
    expect((await createReport(req({ company_name: '  ', reporting_year: 2026 }))).status).toBe(400)
    expect((await createReport(req({ company_name: 'X', reporting_year: 2023 }))).status).toBe(400)
  })
  it('a report that is not the user\'s (no row under RLS) is a 404; so is an unknown section key', async () => {
    expect((await getReport(req(), ctx({ id: 'nope' }))).status).toBe(404)
    expect((await putSection(req({ content: {} }), ctx({ id: 'nope', key: 'risks' }))).status).toBe(404)
    expect((await putSection(req({ content: {} }), ctx({ id: 'r1', key: 'not_a_section' }))).status).toBe(404)
  })
  it('the report PATCH accepts only its own columns, checked', async () => {
    expect((await patchReport(req({ recent_fy_currency: 'dollars' }), ctx({ id: 'r1' }))).status).toBe(400)
    const r = await patchReport(req({ listed_in_canada: false, recent_fy_revenue: 45e6, recent_fy_currency: 'usd', user_id: 'attacker', status: 'final' }), ctx({ id: 'r1' }))
    expect(r.status).toBe(200)
    expect(h.db.tables.s211_reports[0]).toMatchObject({ user_id: 'u1', listed_in_canada: false, recent_fy_revenue: 45e6, recent_fy_currency: 'USD' })
    expect(h.db.tables.s211_reports[0].status).toBeUndefined()
  })
})

describe('access that cannot be checked: 503 on every route, never read as "no access"', () => {
  for (const [name, setup] of [
    ['a function returns an error', () => { h.db.rpc = { s211_can_read: { data: true, error: { message: 'permission denied' } }, s211_can_write: { data: true, error: null } } }],
    ['a function is missing', () => { h.db.rpc = { s211_can_read: { data: true, error: null } } }],
    ['the call throws', () => { h.db.rpc = { s211_can_read: 'throw', s211_can_write: 'throw' } }],
  ] as const) {
    it(name, async () => {
      setup()
      for (const [route, p] of [...READS(), ...WRITES(), ['access', access(req())] as const]) {
        const r = await p
        expect(r.status, route).toBe(503)
        expect(await r.json(), route).toEqual({ error: UNKNOWN_MESSAGE, state: 'unknown' })
      }
      expect(tables()).toEqual([])
    })
  }
})
