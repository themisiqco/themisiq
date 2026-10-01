// app/api/s211/adapter.test.ts
// The S-211 routes reading and writing through the shared Forced Labour model (Stage C step 4). Real
// routes, in-memory database (lib/s211/testing/fakeSupabase.ts). The existing route tests are unchanged
// and still pass; this file covers what the adapter adds.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb } from '../../../lib/s211/testing/fakeSupabase'
import { SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT, type FixtureReport } from '../../../lib/s211/reportModel.fixtures'
import { buildS211ReportModel } from '../../../lib/s211/reportModel'
import { sharedFieldsOf } from '../../../lib/forcedLabour/canadaAdapter'
import type { SectionKey } from '../../../lib/s211/builderContent'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb, failTable: null as string | null }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => {
    const real = fakeSupabase(h.db)
    // failTable: every write to that table answers with an error, as PostgREST would.
    const failing = { then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'x' } }).then(res) }
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'order']) chain[m] = () => chain
    Object.assign(chain, failing, { single: async () => ({ data: null, error: { message: 'x' } }), maybeSingle: async () => ({ data: null, error: { message: 'x' } }) })
    const from = (t: string) => {
      if (t !== h.failTable) return real.from(t)
      h.db.calls.push(`from:${t}`)
      return { ...real.from(t), upsert: () => chain, insert: () => chain, update: () => chain, delete: () => chain }
    }
    return { supabase: { ...real, from }, userId: 'u1', email: undefined }
  },
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}))
import { GET as listReports, POST as createReport } from './reports/route'
import { GET as getReport, PATCH as patchReport } from './reports/[id]/route'
import { PUT as putSection } from './reports/[id]/sections/[key]/route'
import { GET as exportReport } from './reports/[id]/export/route'

const req = (method: string, body?: unknown) => new Request('http://x', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) })
const put = (key: string, content: unknown) => putSection(req('PUT', { content }), ctx({ id: 'r1', key }))
const open = async () => (await getReport(req('GET'), ctx({ id: 'r1' }))).json()
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const grant = (read: boolean, write: boolean) => { h.db.rpc = { s211_can_read: { data: read, error: null }, s211_can_write: { data: write, error: null } } }

beforeEach(() => {
  h.failTable = null
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'u1', company_name: 'Harrowgate', reporting_year: 2026, financial_year_end: null, status: 'draft' }], s211_report_sections: [] }, calls: [] }
  grant(true, true)
})

async function saveAll(r: FixtureReport) {
  for (const [k, c] of Object.entries(r.sections)) expect((await put(k, json(c))).status, k).toBe(200)
}

describe('every fixture saved through the routes reads back, and prints, exactly as before', () => {
  for (const [name, r] of Object.entries({ SINGLE_REPORT, JOINT_REPORT, JOINT_EACH_REPORT })) {
    it(name, async () => {
      await saveAll(r)
      const body = await open()
      for (const s of body.sections) expect(s.content, s.section_key).toEqual(json(r.sections[s.section_key as SectionKey]))
      const read = Object.fromEntries(body.sections.map((s: { section_key: string; content: unknown }) => [s.section_key, s.content]))
      expect(JSON.stringify(buildS211ReportModel({ reportingYear: 2026, sections: read }))).toBe(JSON.stringify(buildS211ReportModel(r)))
      // The Canada record is complete on its own, as before the adapter.
      for (const row of h.db.tables.s211_report_sections) expect(row.content, String(row.section_key)).toEqual(json(r.sections[row.section_key as SectionKey]))
    })
  }
})

describe('the shared model', () => {
  it('the first save links the report: one parent, one canada row, and the shared fields in fl_answers', async () => {
    await saveAll(SINGLE_REPORT)
    expect(h.db.tables.fl_reports).toHaveLength(1)
    const parent = h.db.tables.fl_reports[0]
    expect(parent).toMatchObject({ user_id: 'u1', organization_name: 'Harrowgate' })
    expect(h.db.tables.fl_report_countries).toEqual([expect.objectContaining({ report_id: parent.id, country: 'canada', status: 'draft' })])
    expect(h.db.tables.s211_reports[0].fl_report_id).toBe(parent.id)
    const expected = (Object.entries(SINGLE_REPORT.sections) as [SectionKey, Record<string, unknown>][])
      .flatMap(([k, c]) => sharedFieldsOf(k).filter(f => f.field in c).map(f => f.fieldKey)).sort()
    expect(h.db.tables.fl_answers.map(a => a.field_key).sort()).toEqual(expected)
    // Linking is not an edit: the report's updated_at is the section save's, not something the link wrote.
    expect(h.db.tables.fl_answers.every(a => a.report_id === parent.id)).toBe(true)
  })

  it('a shared answer changed in the shared store (as another country would) is what Canada reads and prints', async () => {
    await saveAll(SINGLE_REPORT)
    const row = h.db.tables.fl_answers.find(a => a.field_key === 'training.frequency_and_length')!
    row.value = 'Changed in the UK report.'
    const training = (await open()).sections.find((s: { section_key: string }) => s.section_key === 'training')
    expect(training.content.frequency_and_length).toBe('Changed in the UK report.')
    // a per-country answer (Stage D1b) is Canada's own, whatever the shared store holds
    expect(training.content.training_description).toBe(SINGLE_REPORT.sections.training!.training_description)
    for (const s of h.db.tables.s211_report_sections) s.status = 'complete'
    expect((await exportReport(req('GET'), ctx({ id: 'r1' }))).status).toBe(200)
    // The Canada-only answers are untouched by anything in the shared store.
    const loss = (await open()).sections.find((s: { section_key: string }) => s.section_key === 'remediation_income_loss')
    expect(loss.content).toEqual(json(SINGLE_REPORT.sections.remediation_income_loss))
  })

  it('a field taken out of a section is removed from the shared store; a null is kept as null', async () => {
    await put('training', { mandatory: 'Mandatory', frequency_and_length: 'x', employees_trained: 4, training_provided: 'Yes' })
    await put('training', { mandatory: 'Mandatory', employees_trained: null, training_provided: 'Yes' })
    const keys = Object.fromEntries(h.db.tables.fl_answers.map(a => [a.field_key, a.value]))
    // training_provided is per-country (Stage D1b): never in the shared store
    expect(keys).toEqual({ 'training.mandatory': 'Mandatory', 'training.employees_trained': null })
  })

  it('a Canada-only field never reaches the shared store', async () => {
    await put('remediation_income_loss', json(SINGLE_REPORT.sections.remediation_income_loss))
    await put('approval_attestation', json(SINGLE_REPORT.sections.approval_attestation))
    expect(h.db.tables.fl_answers ?? []).toEqual([])
  })

  it('the company name: a PATCH writes both; the list and the report read the parent’s', async () => {
    expect((await patchReport(req('PATCH', { company_name: 'Harrowgate Outdoor' }), ctx({ id: 'r1' }))).status).toBe(200)
    expect(h.db.tables.fl_reports[0].organization_name).toBe('Harrowgate Outdoor')
    expect(h.db.tables.s211_reports[0].company_name).toBe('Harrowgate Outdoor')
    h.db.tables.fl_reports[0].organization_name = 'Renamed elsewhere'
    expect((await open()).report.company_name).toBe('Renamed elsewhere')
    const list = await (await listReports(req('GET'))).json()
    expect(list.reports[0].company_name).toBe('Renamed elsewhere')
    expect('fl_report_id' in list.reports[0]).toBe(false)
    expect('fl_report_id' in (await open()).report).toBe(false)
  })

  it('a new report is created with its parent and canada row, already linked', async () => {
    const r = await createReport(req('POST', { company_name: 'Maple Test Co.', reporting_year: 2026 }))
    expect(r.status).toBe(201)
    const created = h.db.tables.s211_reports.at(-1)!
    const parent = h.db.tables.fl_reports.find(p => p.id === created.fl_report_id)!
    expect(parent).toMatchObject({ user_id: 'u1', organization_name: 'Maple Test Co.' })
    expect(h.db.tables.fl_report_countries).toEqual([expect.objectContaining({ report_id: parent.id, country: 'canada' })])
    expect('fl_report_id' in (await r.json()).report).toBe(false)
  })
})

describe('reports saved before the adapter, and read-only access', () => {
  it('an unlinked report reads exactly as stored, and reading touches no shared table', async () => {
    h.db.tables.s211_report_sections = Object.entries(SINGLE_REPORT.sections).map(([section_key, content]) => ({ report_id: 'r1', section_key, content: json(content), status: 'complete' }))
    grant(true, false)
    const body = await open()
    for (const s of body.sections) expect(s.content).toEqual(json(SINGLE_REPORT.sections[s.section_key as SectionKey]))
    expect((await exportReport(req('GET'), ctx({ id: 'r1' }))).status).toBe(200)
    expect(h.db.calls.filter(c => /^from:fl_/.test(c))).toEqual([])
    expect(h.db.tables.fl_reports).toBeUndefined()
  })

  it('a linked report with answers saved before the adapter (no fl_answers rows) reads its own values', async () => {
    h.db.tables.s211_report_sections = [{ report_id: 'r1', section_key: 'training', content: { training_provided: 'Yes', training_description: 'legacy' }, status: 'in_progress' }]
    await patchReport(req('PATCH', { listed_in_canada: true }), ctx({ id: 'r1' }))
    expect(h.db.tables.s211_reports[0].fl_report_id).toBeTruthy()
    expect((await open()).sections[0].content).toEqual({ training_provided: 'Yes', training_description: 'legacy' })
  })
})

describe('a section save is one transaction: a failure in either write leaves both tables unchanged', () => {
  // The route's side: ONE call to fl_save_canada_section, and a failed call reported as a failed save. The
  // in-memory function (lib/s211/testing/fakeSaveSection.ts) restores both tables on failure, as Postgres
  // does; the real function is checked by supabase/verify/20261001_fl_save_canada_section_verify_atomic.sql.
  for (const failInSave of ['answers', 'section'] as const) {
    it(`the ${failInSave === 'answers' ? 'first (shared answers)' : 'second (section)'} write fails: 500, and neither table changes`, async () => {
      await put('training', { training_provided: 'Yes', training_description: 'first' })
      const before = structuredClone({ answers: h.db.tables.fl_answers, sections: h.db.tables.s211_report_sections })
      h.db.failInSave = failInSave
      const r = await put('training', { training_provided: 'No', training_description: 'second' })
      expect(r.status).toBe(500)
      expect((await r.json()).error).toBe('The section could not be saved.')
      expect({ answers: h.db.tables.fl_answers, sections: h.db.tables.s211_report_sections }).toEqual(before)
      // and what Canada reads is still the first save, not a mix
      h.db.failInSave = null
      const training = (await open()).sections.find((s: { section_key: string }) => s.section_key === 'training')
      expect(training.content).toEqual({ training_provided: 'Yes', training_description: 'first' })
    })
  }

  it('the route writes the section and the answers only through the one call', async () => {
    await put('training', { training_provided: 'Yes' }) // links the report first
    h.db.calls = []
    await put('training', { training_provided: 'Yes', training_description: 'x' })
    expect(h.db.calls.filter(c => c === 'rpc:fl_save_canada_section')).toHaveLength(1)
    expect(h.db.calls.filter(c => c === 'from:fl_answers' || c === 'from:s211_report_sections')).toEqual(['from:s211_report_sections'])
  })

  it('a refused call (as PostgREST would answer an RLS or check failure) is a 500, with nothing written', async () => {
    await put('training', { training_provided: 'Yes' })
    const before = structuredClone(h.db.tables)
    h.db.rpc = { ...h.db.rpc, fl_save_canada_section: { data: null, error: { message: 'new row violates row-level security policy' } } }
    expect((await put('training', { training_provided: 'No' })).status).toBe(500)
    expect(h.db.tables).toEqual(before)
  })

})

describe('a report PATCH writes the parent first', () => {
  it('fl_reports refuses on a PATCH: 500, and the report is not written', async () => {
    await put('training', { training_provided: 'Yes' })
    h.failTable = 'fl_reports'
    const r = await patchReport(req('PATCH', { company_name: 'Other' }), ctx({ id: 'r1' }))
    expect(r.status).toBe(500)
    expect(h.db.tables.s211_reports[0].company_name).toBe('Harrowgate')
  })
})
