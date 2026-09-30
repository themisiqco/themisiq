// app/api/s211/export.test.ts
// The export route: the same access gate as every S-211 route, then the export gate, then the PDF.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'
import { SINGLE_REPORT } from '../../../lib/s211/reportModel.fixtures'
import { fillAttestation } from '../../../lib/s211/attestation'

const h = vi.hoisted(() => ({ signedIn: true, db: null as unknown as FakeDb }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => {
    if (!h.signedIn) throw new Error('Missing access token')
    return { supabase: fakeSupabase(h.db), userId: 'u1', email: undefined }
  },
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}))
import { GET } from './reports/[id]/export/route'

const get = (id = 'r1') => GET(new Request('http://x'), { params: Promise.resolve({ id }) })
const complete = () => Object.entries(SINGLE_REPORT.sections).map(([section_key, content]) => ({ report_id: 'r1', section_key, content: structuredClone(content), status: 'complete' }))

beforeEach(() => {
  h.signedIn = true
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'u1', reporting_year: 2026 }], s211_report_sections: complete() }, calls: [], rpc: { s211_has_access: { data: true, error: null } } }
})

describe('GET /api/s211/reports/[id]/export', () => {
  it('refused by the access gate: the same 404, and no table is read', async () => {
    h.db.rpc = { s211_has_access: { data: false, error: null } }
    const r = await get()
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'Not found' })
    expect(h.db.calls.filter(c => c.startsWith('from:'))).toEqual([])
    h.signedIn = false
    expect((await get()).status).toBe(404)
  })

  it('a report that is not the user\'s is a 404', async () => {
    expect((await get('nope')).status).toBe(404)
  })

  it('an incomplete section: 409 naming it, and no PDF', async () => {
    h.db.tables.s211_report_sections.find(s => s.section_key === 'training')!.status = 'in_progress'
    const r = await get()
    expect(r.status).toBe(409)
    const body = await r.json()
    expect(body.blockers.map((b: { section: string }) => b.section)).toEqual(['training'])
    expect(r.headers.get('Content-Type')).not.toBe('application/pdf')
  })

  it('a placeholder left in the attestation: 409', async () => {
    const s11 = h.db.tables.s211_report_sections.find(s => s.section_key === 'approval_attestation')!
    ;(s11.content as Record<string, unknown>).attestation_text = fillAttestation({ reportType: 'single' })
    const r = await get()
    expect(r.status).toBe(409)
    expect((await r.json()).blockers[0].message).toContain('[title]')
  })

  it('ready: a PDF, as an attachment named for the entity and year, never cached', async () => {
    const r = await get()
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('application/pdf')
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="Harrowgate-Outdoor-Equipment-Inc-S-211-report-2026.pdf"')
    expect(r.headers.get('Cache-Control')).toBe('no-store')
    expect(r.headers.get('X-Report-Substituted-Characters')).toBe('0')
    const bytes = new Uint8Array(await r.arrayBuffer())
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-')
  })
})
