// app/api/s211/gate.test.ts
// The S-211 routes, gated: signed out, a junk token, signed in and refused by public.s211_has_access(),
// the function failing, and allowed. Supabase is replaced by an in-memory fake that records every call,
// so a refused request can be shown to have touched no table.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'

// auth: 'ok' signs in as h.userId; 'missing' is a request with no token; 'junk' a token Supabase rejects.
const h = vi.hoisted(() => ({ userId: 'user-allowed', auth: 'ok' as 'ok' | 'missing' | 'junk', db: null as unknown as FakeDb }))
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

const req = (body?: unknown) => new Request('http://x/api/s211', { method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) })
const setAccess = (reply: NonNullable<FakeDb['rpc']>[string] | undefined) => {
  h.db.rpc = reply === undefined ? {} : { s211_has_access: reply }
}

beforeEach(() => {
  h.userId = 'user-allowed'
  h.auth = 'ok'
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'user-allowed', company_name: 'Harrowgate', reporting_year: 2026 }], s211_report_sections: [] }, calls: [] }
  setAccess({ data: true, error: null })
})

describe('refused: the same 404 every time, and no s211 table is touched', () => {
  const cases: [string, () => void, string[]][] = [
    // Not signed in, or a token Supabase rejects: refused before the database is asked anything.
    ['signed out', () => { h.auth = 'missing' }, []],
    ['a junk token', () => { h.auth = 'junk' }, []],
    // Signed in: the function is asked, and only the function.
    ['the function answers false', () => setAccess({ data: false, error: null }), ['rpc:s211_has_access']],
    ['the function answers null', () => setAccess({ data: null, error: null }), ['rpc:s211_has_access']],
    ['the function answers something that is not true', () => setAccess({ data: 'true', error: null }), ['rpc:s211_has_access']],
    ['the function returns an error', () => setAccess({ data: true, error: { message: 'permission denied for function s211_has_access' } }), ['rpc:s211_has_access']],
    ['the function is missing', () => setAccess(undefined), ['rpc:s211_has_access']],
    ['the call throws', () => setAccess('throw'), ['rpc:s211_has_access']],
  ]
  for (const [name, setup, calls] of cases) {
    it(name, async () => {
      setup()
      const responses = await Promise.all([
        access(req()), listReports(req()), createReport(req({ company_name: 'X', reporting_year: 2026 })),
        getReport(req(), ctx({ id: 'r1' })), patchReport(req({ listed_in_canada: true }), ctx({ id: 'r1' })),
        putSection(req({ content: { legal_name: 'X' } }), ctx({ id: 'r1', key: 'report_details' })),
      ])
      for (const r of responses) {
        expect(r.status).toBe(404)
        expect(await r.json()).toEqual({ error: 'Not found' })
      }
      // One call per route at most, and never a table.
      expect(h.db.calls.filter(c => c.startsWith('from:'))).toEqual([])
      expect([...new Set(h.db.calls)]).toEqual(calls)
    })
  }

  it('a refusal is indistinguishable from signed out: same status, same body, same headers that matter', async () => {
    h.auth = 'missing'
    const out = await access(req())
    h.auth = 'ok'; setAccess({ data: false, error: null })
    const refused = await access(req())
    expect(refused.status).toBe(out.status)
    expect(await refused.text()).toBe(await out.text())
    expect(refused.headers.get('content-type')).toBe(out.headers.get('content-type'))
  })
})

describe('allowed', () => {
  it('access answers 200', async () => {
    const r = await access(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ allowed: true })
  })

  it('asks the function as the user, then reaches the tables', async () => {
    await listReports(req())
    expect(h.db.calls).toEqual(['rpc:s211_has_access', 'from:s211_reports'])
  })

  it('creates a report, refusing a blank name or a year before the Act\'s first reports', async () => {
    expect((await createReport(req({ company_name: '  ', reporting_year: 2026 }))).status).toBe(400)
    expect((await createReport(req({ company_name: 'X', reporting_year: 2023 }))).status).toBe(400)
    const ok = await createReport(req({ company_name: ' Harrowgate Retail ', reporting_year: 2026 }))
    expect(ok.status).toBe(201)
    expect(h.db.tables.s211_reports.at(-1)).toMatchObject({ user_id: 'user-allowed', company_name: 'Harrowgate Retail', reporting_year: 2026 })
  })

  it('a report that is not the user\'s (no row under RLS) is a 404', async () => {
    expect((await getReport(req(), ctx({ id: 'nope' }))).status).toBe(404)
    expect((await putSection(req({ content: {} }), ctx({ id: 'nope', key: 'risks' }))).status).toBe(404)
  })

  it('an unknown section key is a 404', async () => {
    expect((await putSection(req({ content: {} }), ctx({ id: 'r1', key: 'not_a_section' }))).status).toBe(404)
  })

  it('the report PATCH accepts only its own columns, checked', async () => {
    expect((await patchReport(req({ recent_fy_currency: 'dollars' }), ctx({ id: 'r1' }))).status).toBe(400)
    const r = await patchReport(req({ listed_in_canada: false, recent_fy_revenue: 45e6, recent_fy_currency: 'usd', user_id: 'attacker', status: 'final' }), ctx({ id: 'r1' }))
    expect(r.status).toBe(200)
    expect(h.db.tables.s211_reports[0]).toMatchObject({ user_id: 'user-allowed', listed_in_canada: false, recent_fy_revenue: 45e6, recent_fy_currency: 'USD' })
    expect(h.db.tables.s211_reports[0].status).toBeUndefined()
  })
})
