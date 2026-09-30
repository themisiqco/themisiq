// app/api/s211/gate.test.ts
// The S-211 routes, gated: signed out, signed in but not listed, and listed. Supabase is replaced by an
// in-memory fake that records every call, so a refused request can be shown to have touched nothing.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'

const h = vi.hoisted(() => ({ userId: 'user-listed' as string | null, db: null as unknown as FakeDb }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => {
    if (!h.userId) throw new Error('Missing access token')
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
const ENV = 'S211_PREVIEW_USER_IDS'
let saved: string | undefined

beforeEach(() => {
  saved = process.env[ENV]
  process.env[ENV] = 'user-listed, other-listed'
  h.userId = 'user-listed'
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'user-listed', company_name: 'Harrowgate', reporting_year: 2026 }], s211_report_sections: [] }, calls: [] }
})
afterEach(() => { if (saved === undefined) delete process.env[ENV]; else process.env[ENV] = saved })

describe('refused: a 404, and the database is not touched', () => {
  const cases: [string, () => void][] = [
    ['signed out', () => { h.userId = null }],
    ['signed in, not on the list', () => { h.userId = 'someone-else' }],
    ['the variable unset', () => { delete process.env[ENV] }],
    ['the variable empty', () => { process.env[ENV] = '' }],
  ]
  for (const [name, setup] of cases) {
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
      expect(h.db.calls).toEqual([])
    })
  }
})

describe('allowed', () => {
  it('access answers 200', async () => {
    const r = await access(req())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ allowed: true })
  })

  it('another listed user is let in too', async () => {
    h.userId = 'other-listed'
    expect((await access(req())).status).toBe(200)
  })

  it('creates a report, refusing a blank name or a year before the Act\'s first reports', async () => {
    expect((await createReport(req({ company_name: '  ', reporting_year: 2026 }))).status).toBe(400)
    expect((await createReport(req({ company_name: 'X', reporting_year: 2023 }))).status).toBe(400)
    const ok = await createReport(req({ company_name: ' Harrowgate Retail ', reporting_year: 2026 }))
    expect(ok.status).toBe(201)
    expect(h.db.tables.s211_reports.at(-1)).toMatchObject({ user_id: 'user-listed', company_name: 'Harrowgate Retail', reporting_year: 2026 })
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
    expect(h.db.tables.s211_reports[0]).toMatchObject({ user_id: 'user-listed', listed_in_canada: false, recent_fy_revenue: 45e6, recent_fy_currency: 'USD' })
    expect(h.db.tables.s211_reports[0].status).toBeUndefined()
  })
})
