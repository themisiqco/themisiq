// app/api/forced-labour/forcedLabour.test.ts
// The /api/forced-labour routes (Stage D1): preview visibility, adding the UK, shared answers flowing between
// Canada and the UK in both directions, the UK applicability and section saves, and the one-transaction save.
// Real routes, in-memory database (lib/s211/testing/fakeSupabase.ts).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase, type FakeDb, type RpcReply } from '../../../lib/s211/testing/fakeSupabase'

const h = vi.hoisted(() => ({ db: null as unknown as FakeDb }))
vi.mock('../../../lib/supabaseAuthed', () => ({
  getAuthedClient: async () => ({ supabase: fakeSupabase(h.db), userId: 'u1', email: undefined }),
  bearerFrom: () => 'tok',
  AuthError: class AuthError extends Error {},
}))
import { GET as countries } from './countries/route'
import { GET as overview } from './reports/[id]/route'
import { POST as addCountry } from './reports/[id]/countries/route'
import { GET as getCountry } from './reports/[id]/countries/[country]/route'
import { PUT as putApplicability } from './reports/[id]/countries/[country]/applicability/route'
import { PUT as putSection } from './reports/[id]/countries/[country]/sections/[key]/route'
import { PUT as putShared } from './reports/[id]/shared/route'
import { PUT as putEntities } from './reports/[id]/countries/[country]/entities/route'
import { GET as listReports, POST as createReport } from './reports/route'
import { GET as exportUk } from './reports/[id]/countries/[country]/export/route'
import { UK_SINGLE_COMPANY } from '../../../lib/forcedLabour/uk/statementModel.fixtures'
import { PUT as putCanadaSection } from '../s211/reports/[id]/sections/[key]/route'
import { GET as getCanadaReport } from '../s211/reports/[id]/route'

const req = (method: string, body?: unknown) => new Request('http://x', { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
const ctx = <T,>(p: T) => ({ params: Promise.resolve(p) })
const json = async (r: Response | Promise<Response>) => (await r).json()
const preview = (on: boolean | RpcReply) => {
  h.db.rpc = { s211_can_read: { data: true, error: null }, s211_can_write: { data: true, error: null },
    s211_has_access: typeof on === 'boolean' ? { data: on, error: null } : on }
}
const add = (country: string) => addCountry(req('POST', { country }), ctx({ id: 'r1' }))
const uk = () => json(getCountry(req('GET'), ctx({ id: 'r1', country: 'uk' })))
const saveUk = (key: string, content: unknown, action?: string) => putSection(req('PUT', { content, action }), ctx({ id: 'r1', country: 'uk', key }))
const saveCanada = (key: string, content: unknown) => putCanadaSection(req('PUT', { content }), ctx({ id: 'r1', key }))
const saveCanadaVia = (id: string, key: string, content: unknown) => putCanadaSection(req('PUT', { content }), ctx({ id, key }))

beforeEach(() => {
  h.db = { tables: { s211_reports: [{ id: 'r1', user_id: 'u1', company_name: 'Harrowgate', reporting_year: 2026, financial_year_end: null, status: 'draft',
    recent_fy_revenue: 50_000_000, recent_fy_currency: 'CAD' }], s211_report_sections: [] }, calls: [] }
  preview(true)
})

describe('a country in preview is invisible outside the preview list', () => {
  beforeEach(() => preview(false))

  it('the country list has Canada only', async () => {
    expect((await json(countries(req('GET')))).countries.map((c: { key: string }) => c.key)).toEqual(['canada'])
  })

  it('adding the UK is a 404, and nothing is written', async () => {
    const r = await add('uk')
    expect(r.status).toBe(404)
    expect(await r.json()).toEqual({ error: 'Not found' })
    expect(h.db.tables.fl_report_countries ?? []).toEqual([])
  })

  it('a UK row already on the report (added from a preview account) leaves no trace', async () => {
    preview(true); await add('uk'); await saveUk('training', { training_provided: 'Yes', training_description: 'From the UK.' }); await saveCanada('training', { training_provided: 'Yes' })
    preview(false)
    const o = await json(overview(req('GET'), ctx({ id: 'r1' })))
    expect(o.countries.map((c: { country: string }) => c.country)).toEqual(['canada'])
    expect(JSON.stringify(o)).not.toMatch(/"uk"|United Kingdom/)
    for (const r of [
      await getCountry(req('GET'), ctx({ id: 'r1', country: 'uk' })),
      await saveUk('training', { training_provided: 'No' }),
      await putApplicability(req('PUT', { applicability: { org_form: 'partnership' } }), ctx({ id: 'r1', country: 'uk' })),
    ]) {
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual({ error: 'Not found' })
    }
  })

  it('if the preview check itself fails, the answer is still a 404', async () => {
    preview({ data: null, error: { message: 'x' } })
    expect((await add('uk')).status).toBe(404)
    preview('throw')
    expect((await add('uk')).status).toBe(404)
  })

  it('a country not yet available is a 404 for everyone, preview list included', async () => {
    preview(true)
    expect((await add('australia')).status).toBe(404)
    expect((await add('canada')).status).toBe(404)
  })
})

describe('adding the UK, and shared answers in both directions', () => {
  it('adding creates the country row, once', async () => {
    expect((await add('uk')).status).toBe(201)
    expect(h.db.tables.fl_report_countries.filter(r => r.country === 'uk')).toHaveLength(1)
    expect(await json(add('uk'))).toEqual({ country: 'uk', added: false })
    const o = await json(overview(req('GET'), ctx({ id: 'r1' })))
    expect(o.countries.map((c: { country: string }) => c.country)).toEqual(['canada', 'uk'])
  })

  it('Canada to the UK: a shared answer appears at once; a per-country one starts as a marked draft', async () => {
    await saveCanada('training', { training_provided: 'Yes', training_description: 'A course for buyers.', employees_trained: 14 })
    await add('uk')
    const t = (await uk()).sections.find((s: { section_key: string }) => s.section_key === 'training')
    expect(t.content.employees_trained).toBe(14)
    expect(t.provenance.employees_trained).toEqual({ from: 'elsewhere', countries: ['canada'] })
    expect(t.content).toMatchObject({ training_provided: 'Yes', training_description: 'A course for buyers.', _offered: { training_provided: 'canada', training_description: 'canada' } })
    expect(t.content._drafts).toBeUndefined()
    // offered, not saved: the UK record holds nothing until the user saves
    expect((h.db.tables.fl_report_countries.find(r => r.country === 'uk')!.content as Record<string, unknown> | undefined)?.training).toBeUndefined()
  })

  it('a draft is never offered over an answer the country has; once saved it stays marked until edited', async () => {
    await saveCanada('training', { training_description: 'Canada\u2019s course.' })
    await add('uk')
    await saveUk('training', { training_description: 'The UK\u2019s own course.' })
    let t = (await uk()).sections.find((s: { section_key: string }) => s.section_key === 'training')
    expect(t.content.training_description).toBe('The UK\u2019s own course.')
    expect(t.content._drafts).toBeUndefined()
    // saving with an offered draft kept stores it as a saved draft, still marked; the offered mark is not stored
    await saveUk('training', { training_description: 'Draft text', _offered: { training_description: 'canada' } })
    const stored = (h.db.tables.fl_report_countries.find(r => r.country === 'uk')!.content as Record<string, Record<string, unknown>>).training
    expect(stored).toEqual({ training_description: 'Draft text', _drafts: { training_description: 'canada' } })
    t = (await uk()).sections.find((s: { section_key: string }) => s.section_key === 'training')
    expect(t.content._drafts).toEqual({ training_description: 'canada' })
  })

  it('the UK to Canada: a shared answer is what Canada reads; a per-country one is a draft only where Canada has none', async () => {
    await saveCanada('training', { training_provided: 'Yes', training_description: 'Canada\u2019s own.', frequency_and_length: 'Old.' })
    await add('uk')
    expect((await saveUk('training', { training_provided: 'Yes', training_description: 'The UK\u2019s own.', frequency_and_length: 'Once a year.', covers_slavery_trafficking: 'Yes' })).status).toBe(200)
    expect((await saveUk('effectiveness', { assesses_effectiveness: 'Yes', effectiveness_description: 'Quarterly review.', methods: ['Other'] })).status).toBe(200)
    const c = await json(getCanadaReport(req('GET'), ctx({ id: 'r1' })))
    const byKey = Object.fromEntries(c.sections.map((s: { section_key: string; content: unknown }) => [s.section_key, s.content]))
    expect(byKey.training.frequency_and_length).toBe('Once a year.')                   // shared
    expect(byKey.training.training_description).toBe('Canada\u2019s own.')            // Canada's own, untouched
    expect(byKey.training._drafts).toBeUndefined()
    expect(byKey.training._offered).toBeUndefined()
    expect(byKey.training.covers_slavery_trafficking).toBeUndefined()                  // UK-only: never shared
    // effectiveness, never saved in Canada: the shared answer, and the UK's narrative as a marked draft
    expect(byKey.effectiveness).toEqual({ methods: ['Other'], assesses_effectiveness: 'Yes', effectiveness_description: 'Quarterly review.',
      _offered: { assesses_effectiveness: 'uk', effectiveness_description: 'uk' } })
    const t = (await uk()).sections.find((s: { section_key: string }) => s.section_key === 'training')
    expect(t.provenance.frequency_and_length).toEqual({ from: 'here' })
  })

  it('a hidden country is never a draft source', async () => {
    await add('uk')
    await saveUk('training', { training_description: 'UK text.' })
    preview(false)
    const c = await json(getCanadaReport(req('GET'), ctx({ id: 'r1' })))
    expect(JSON.stringify(c)).not.toContain('UK text.')
  })
})

describe('the UK sections', () => {
  beforeEach(async () => { await add('uk') })

  it('steps taken: complete needs the choice; "no steps" needs nothing more', async () => {
    const r = await saveUk('steps_taken', {}, 'complete')
    expect(r.status).toBe(422)
    expect((await r.json()).missing).toEqual(['What will the statement say?'])
    expect((await saveUk('steps_taken', { statement_kind: 'steps' }, 'complete')).status).toBe(422)
    expect((await saveUk('steps_taken', { statement_kind: 'no_steps' }, 'complete')).status).toBe(200)
    expect(h.db.tables.fl_report_countries.find(r => r.country === 'uk')!.section_status).toEqual({ steps_taken: 'complete' })
  })

  it('a topic section can be marked complete with nothing required', async () => {
    expect((await saveUk('training', { training_provided: 'No' }, 'complete')).status).toBe(200)
  })

  it('an unknown section is a 404', async () => {
    expect((await saveUk('approval_attestation', {})).status).toBe(404)
  })

  for (const failInSave of ['answers', 'section'] as const) {
    it(`a failure in the ${failInSave === 'answers' ? 'first' : 'second'} write leaves both tables unchanged`, async () => {
      await saveUk('training', { training_provided: 'Yes', training_description: 'first' })
      const before = structuredClone({ a: h.db.tables.fl_answers, k: h.db.tables.fl_report_countries })
      h.db.failInSave = failInSave
      const r = await saveUk('training', { training_provided: 'No', training_description: 'second' })
      expect(r.status).toBe(500)
      expect({ a: h.db.tables.fl_answers, k: h.db.tables.fl_report_countries }).toEqual(before)
    })
  }
})

describe('UK applicability and the organisation figure', () => {
  beforeEach(async () => { await add('uk') })

  it('the answers are checked, and stored as given', async () => {
    const bad = await putApplicability(req('PUT', { applicability: { org_form: 'company' } }), ctx({ id: 'r1', country: 'uk' }))
    expect(bad.status).toBe(400)
    const good = { org_form: 'partnership', uk_business: 'yes', supplies: 'yes', turnover_gbp: '36000000', turnover_basis: 'confirmed' }
    expect((await putApplicability(req('PUT', { applicability: good }), ctx({ id: 'r1', country: 'uk' }))).status).toBe(200)
    expect((await uk()).country.applicability).toEqual(good)
  })

  it('an estimate can start from the organisation’s revenue, else Canada’s own figure', async () => {
    expect((await uk()).figures).toEqual({ organization: null, canada: { amount: 50_000_000, currency: 'CAD' } })
    expect((await putShared(req('PUT', { revenue_amount: '60000000', revenue_currency: 'usd' }), ctx({ id: 'r1' }))).status).toBe(200)
    expect((await uk()).figures.organization).toEqual({ amount: 60_000_000, currency: 'USD' })
    expect((await putShared(req('PUT', { revenue_amount: '5', revenue_currency: 'ZZZ' }), ctx({ id: 'r1' }))).status).toBe(400)
  })
})

describe('entities, per country (Stage D1b)', () => {
  beforeEach(async () => { await add('uk') })
  const ents = (body: unknown) => putEntities(req('PUT', body), ctx({ id: 'r1', country: 'uk' }))

  it('the UK statement can be given by a subsidiary while the organisation is the default', async () => {
    expect((await uk()).entities).toEqual({ giving: null, covered: [], known: ['Harrowgate'], defaultGiving: 'Harrowgate' })
    expect((await ents({ giving: 'Harrowgate UK Ltd', covered: ['Harrowgate UK Ltd', 'Harrowgate Retail Ltd'] })).status).toBe(200)
    const e = (await uk()).entities
    expect(e.giving).toBe('Harrowgate UK Ltd')
    expect(e.covered).toEqual(['Harrowgate UK Ltd', 'Harrowgate Retail Ltd'])
    // Canada's own legal name is untouched: it is Canada's section 1
    await saveCanada('report_details', { legal_name: 'Harrowgate Inc.' })
    expect((await uk()).entities.giving).toBe('Harrowgate UK Ltd')
    expect((await uk()).entities.known).toContain('Harrowgate Inc.')
  })
  it('setting them again moves the UK; nothing is left behind', async () => {
    await ents({ giving: 'A Ltd', covered: ['A Ltd', 'B Ltd'] })
    await ents({ giving: 'B Ltd', covered: ['B Ltd'] })
    const rows = h.db.tables.fl_report_entities.map(e => [e.legal_name, e.reporting_in, e.giving_in])
    expect(rows).toEqual([['A Ltd', [], []], ['B Ltd', ['uk'], ['uk']]])
  })
  it('a blank or repeated name is refused, and Canada has no entities route', async () => {
    expect((await ents({ giving: ' ', covered: [] })).status).toBe(400)
    expect((await ents({ giving: 'A', covered: ['B', 'B'] })).status).toBe(400)
    expect((await putEntities(req('PUT', { giving: 'A', covered: [] }), ctx({ id: 'r1', country: 'canada' }))).status).toBe(404)
  })
})

describe('starting a report from any country (Stage D1b)', () => {
  it('a preview account starts a UK report: no Canada report behind it, and the report id is its own', async () => {
    const r = await createReport(req('POST', { organization_name: 'Harrowgate UK Ltd', country: 'uk' }))
    expect(r.status).toBe(201)
    const id = (await r.json()).report.id as string
    expect(h.db.tables.s211_reports.some(x => x.fl_report_id === id)).toBe(false)
    const o = await json(overview(req('GET'), ctx({ id })))
    expect(o.report).toMatchObject({ id, canadaReportId: null, organizationName: 'Harrowgate UK Ltd' })
    expect(o.countries.map((c: { country: string }) => c.country)).toEqual(['uk'])
    const list = (await json(listReports(req('GET')))).reports
    expect(list.find((x: { id: string }) => x.id === id)).toMatchObject({ name: 'Harrowgate UK Ltd', countries: ['uk'], canadaReportingYear: null })
  })
  it('a Canada report is reached by its parent’s id as well as its own', async () => {
    await saveCanada('training', { training_provided: 'Yes' })   // links r1 to a parent
    const parent = h.db.tables.s211_reports[0].fl_report_id as string
    const byParent = await getCanadaReport(req('GET'), ctx({ id: parent }))
    expect(byParent.status).toBe(200)
    expect((await byParent.json()).report.id).toBe('r1')
    expect((await saveCanadaVia(parent, 'training', { training_provided: 'No' })).status).toBe(200)
    expect(h.db.tables.s211_report_sections.find(x => x.section_key === 'training')!.content).toEqual({ training_provided: 'No' })
    expect((await listReports(req('GET'))).status).toBe(200)
  })
  it('outside the preview list: no UK report can be started, and a UK-only report is not listed or opened', async () => {
    const created = await json(createReport(req('POST', { organization_name: 'UK only', country: 'uk' })))
    preview(false)
    expect((await createReport(req('POST', { organization_name: 'X', country: 'uk' }))).status).toBe(404)
    expect((await json(listReports(req('GET')))).reports.some((x: { id: string }) => x.id === created.report.id)).toBe(false)
    const o = await overview(req('GET'), ctx({ id: created.report.id }))
    expect(o.status).toBe(404)
    expect(await o.json()).toEqual({ error: 'Not found' })
  })
  it('Canada is started from its own route, not this one', async () => {
    expect((await createReport(req('POST', { organization_name: 'X', country: 'canada' }))).status).toBe(404)
  })
})

describe('the UK statement export (Stage D2)', () => {
  beforeEach(async () => { await add('uk') })
  const exp = () => exportUk(req('GET'), ctx({ id: 'r1', country: 'uk' }))

  it('is refused with each blocker while the statement is not finished, and nothing is drawn', async () => {
    const r = await exp()
    expect(r.status).toBe(409)
    const body = await r.json()
    expect(body.error).toBe('The statement is not ready to export.')
    expect(body.blockers.map((b: { message: string }) => b.message)).toEqual(expect.arrayContaining(['Choose the organisation giving the statement.', '2. Steps taken is not marked complete.']))
  })

  it('a finished statement exports as an A4 PDF', async () => {
    for (const [k, c] of Object.entries(UK_SINGLE_COMPANY.sections)) expect((await saveUk(k, c, ['statement_details', 'steps_taken', 'approval'].includes(k) ? 'complete' : undefined)).status, k).toBe(200)
    await putEntities(req('PUT', { giving: UK_SINGLE_COMPANY.giving, covered: UK_SINGLE_COMPANY.covered }), ctx({ id: 'r1', country: 'uk' }))
    const r = await exp()
    expect(r.status).toBe(200)
    expect(r.headers.get('Content-Type')).toBe('application/pdf')
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="Fellside-Outdoor-Clothing-Ltd-modern-slavery-statement-2025.pdf"')
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('a saved, unconfirmed draft blocks it', async () => {
    for (const [k, c] of Object.entries(UK_SINGLE_COMPANY.sections)) await saveUk(k, c, ['statement_details', 'steps_taken', 'approval'].includes(k) ? 'complete' : undefined)
    await putEntities(req('PUT', { giving: UK_SINGLE_COMPANY.giving, covered: UK_SINGLE_COMPANY.covered }), ctx({ id: 'r1', country: 'uk' }))
    await saveUk('training', { ...UK_SINGLE_COMPANY.sections.training, _offered: { training_description: 'canada' } })
    const r = await exp()
    expect(r.status).toBe(409)
    expect((await r.json()).blockers[0].message).toContain('started from another country\u2019s report is not confirmed')
  })

  it('outside the preview list it does not exist', async () => {
    preview(false)
    expect((await exp()).status).toBe(404)
  })
})

