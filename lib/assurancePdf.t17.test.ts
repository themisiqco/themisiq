import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

// T17: the assurance package prints the inventory as saved: the stored workings, worded as the verifier page words
// them, the document index with each document's status, and the residual table from the stored market-based rows.
// Nothing is recomputed at export.

const text = vi.fn()
const addPage = vi.fn()
const autoTable = vi.fn()
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 792, getHeight: () => 612 } }
    lastAutoTable = { finalY: 200 }
    text = text; save = vi.fn(); addPage = addPage
    splitTextToSize = (s: string) => [s]
    setFontSize = vi.fn(); setTextColor = vi.fn(); setFont = vi.fn(); setFillColor = vi.fn()
    setDrawColor = vi.fn(); setLineWidth = vi.fn(); rect = vi.fn(); line = vi.fn()
    addImage = vi.fn(); roundedRect = vi.fn(); getNumberOfPages = () => 1; setPage = vi.fn()
  },
}))
vi.mock('jspdf-autotable', () => ({ default: (...a: unknown[]) => autoTable(...a) }))

import { generateAssurancePDF } from './assurancePdf'
import { EF_SOURCES } from './ghg/engine'
import { t17Fixture } from './testing/t17Fixture'
import { storedRows, derivationsFromRows, residualRowsFromRows, WORKINGS_NOT_KEPT } from './ghg/storedWorkings'
import { workingsSourceParts, sourcePartsLines, workingsGwpBasisCell } from './ghg/workingsCells'
import { WorkingsSourceCell } from '../app/verify/[token]/_components/WorkingsSourceCell'
import { verifierVersionLines } from './ghg/versionWords'

type Table = { head?: string[][]; body?: string[][]; showHead?: string; rowPageBreak?: string }
const fw = (ids: string[]) => ids.map(id => ({ id, name: id.toUpperCase(), full: id, gwp: 'AR6', deadline: '2026' }))
const srcs = { combustion: EF_SOURCES.combustion, electricity: EF_SOURCES.electricity_us, gwp_ar6: EF_SOURCES.gwp_ar6 }
const fx = t17Fixture()
const saved = (o: object = {}) => ({
  company_name: 'Acme', reporting_year: 2025, fiscal_year_end_month: 12, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', selected_frameworks: ['sb253', 'esrs'], locations: [fx.location], location_log: [],
  workings: fx.workings, gwp_version: 'AR6', updated_at: '2026-10-09T14:32:05.000Z', ...o,
})
const run = (inv: object, frameworks = ['sb253', 'esrs']) => {
  text.mockClear(); addPage.mockClear(); autoTable.mockClear()
  generateAssurancePDF(inv as never, { s1_total: 1, s2_location: 2, s2_market: 3 }, fw(frameworks) as never, { ok: true, rows: [] }, srcs)
  const tables = autoTable.mock.calls.map(c => c[1] as Table)
  const texts = text.mock.calls.map(c => (Array.isArray(c[0]) ? c[0].join(' ') : String(c[0])))
  return { tables, texts, all: [...texts, ...tables.flatMap(t => [...(t.head ?? []).flat(), ...(t.body ?? []).flat()])].join('\n') }
}
const table = (tables: Table[], firstHead: string) => tables.find(t => t.head?.[0]?.[0] === firstHead && (firstHead !== 'Location' || t.head?.[0]?.[1] === 'Source'))
const rows = storedRows(fx.workings)
const docs = Object.fromEntries(fx.location.source_docs.map(d => [d.id, d]))
const fileOf = (id: string) => docs[id]?.file_name ?? 'A document no longer on this inventory'
const quoteOf = (id: string, pi: number | undefined) => (pi == null ? null : docs[id]?.extracted?.[pi]?.sourceQuote?.trim() || null)
const Y = 'reporting year 2025'

describe('T17: the Workings page prints every stored row, worded as the verifier page words it', () => {
  const { tables } = run(saved())
  const w = table(tables, 'Location')!
  it('one table row per stored calculation row, with the header repeated on every page and no row split', () => {
    expect(w.head).toEqual([['Location', 'Source', 'Activity data', 'Emission factor', 'Factor source', 'Factor vintage', 'Scope 2 method', 'GWP basis', 'Result (tCO2e)']])
    expect(w.body).toHaveLength(rows.filter(r => r.gwp_basis !== 'document_event' && r.gwp_basis !== 'location_event').length)
    expect([w.showHead, w.rowPageBreak]).toEqual(['everyPage', 'avoid'])
    expect(addPage).toHaveBeenCalledWith('letter', 'landscape')
  })
  it('the PDF and the verifier page give the same sentences for each row', () => {
    for (const r of rows.filter(x => x.gwp_basis !== 'document_event' && x.gwp_basis !== 'location_event')) {
      const pdf = sourcePartsLines(workingsSourceParts(r as never, fileOf, quoteOf, Y)).join(' ').replace(/ · /g, ' ')
      const html = renderToStaticMarkup(createElement(WorkingsSourceCell, { w: r as never, fileOf, quoteOf, yearText: Y,
        renderQuote: (q: string) => `"${q}"`, legacyDocIdOfPath: () => undefined }))
      const verifier = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
      expect(verifier, r.source).toBe(pdf.replace(/\s+/g, ' ').trim())
      const cell = w.body!.find(b => b[1].startsWith(sourcePartsLines(workingsSourceParts(r as never, fileOf, quoteOf, Y))[0]))
      expect(cell, r.source).toBeDefined()
    }
  })
  it('every bill, every reason, the hand-entry reason and each factor vintage print verbatim', () => {
    const all = w.body!.flat().join('\n')
    for (const s of ['gas-jan.pdf: counted. Confirmed by jo@acme.example on 2 October 2026.',
      'gas-dec24.pdf: not counted. Billed outside reporting year 2025.',
      'gas-feb-copy.pdf: not counted. The same bill as gas-feb.pdf, which is counted.',
      'gas-feb.pdf: counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time.',
      'gas-mar.pdf: not counted. Withdrawn by jo@acme.example on 5 October 2026. Reason: Uploaded to the wrong site. Read: "March: 70 MCF"',
      'elec-q1.pdf: not counted. The figure was entered by hand instead.',
      'Entered by hand by jo@acme.example on 3 October 2026, instead of from the bills. Reason: Bill covers two tenants; our share is 40%.',
      'Electricity (California) · Entered by hand']) expect(all, s).toContain(s)
    for (const r of rows) if (r.factor_vintage) expect(all, r.source).toContain(r.factor_vintage)
  })
})

describe('T17: the document index has a Status column, from the stored record', () => {
  const idx = table(run(saved()).tables, 'Location')
  const index = run(saved()).tables.find(t => t.head?.[0]?.[4] === 'Status')!
  const status = (file: string) => index.body!.find(r => r[2] === file)?.[4]
  it('each contribution reason, a withdrawal and a tombstone', () => {
    expect(idx).toBeDefined()
    expect(index.head).toEqual([['Location', 'Document type', 'File name', 'Uploaded', 'Status']])
    expect(status('gas-jan.pdf')).toBe('Counted. Confirmed by jo@acme.example on 2 October 2026.')
    expect(status('gas-dec24.pdf')).toBe('Not counted. Billed outside reporting year 2025. Confirmed; who and when were not recorded at the time.')
    expect(status('elec-q1.pdf')).toBe('Not counted. The figure was entered by hand instead. Confirmed; who and when were not recorded at the time.')
    expect(status('gas-mar.pdf')).toBe('Withdrawn by jo@acme.example on 5 October 2026. Reason: Uploaded to the wrong site. Kept as evidence and not counted.')
    expect(status('gas-apr.pdf')).toContain('Deleted by jo@acme.example on 6 October 2026. Reason: Holds another tenant\'s account number. SHA-256 af3d25816e311a34a769d51ed0dc1f59b091d135040628b5ecb5cf13a12bccbc.')
    expect([index.showHead, index.rowPageBreak]).toEqual(['everyPage', 'avoid'])
  })
})

describe('T17: the other pages read the stored row', () => {
  it('the residual table is the stored market-based rows, when a market-based framework is in scope', () => {
    const t = run(saved()).tables.find(x => x.head?.[0]?.[1] === 'Residual factor source')!
    expect(t.body).toEqual(residualRowsFromRows(rows))
    expect(run(saved(), ['sb253']).tables.find(x => x.head?.[0]?.[1] === 'Residual factor source')).toBeUndefined()
  })
  it('the Methodology derivations are the distinct stored conversion notes and factors', () => {
    const conv = { location: 'Plant', stream: 'diesel_stationary', source: 'Diesel (stationary)', scope: 1, result_tco2e: 1, gwp_basis: 'AR6',
      conversion_note: '100 US gallons converted to 378.54 litres (1 US gallon = 3.785411784 litres, exact).', conversion_factor: 3.785411784, factor_key: 'diesel_litre', activity_unit: 'gallons' }
    const ws = [...rows, conv, conv]
    const methods = run(saved({ workings: ws })).tables.find(t => t.head?.[0]?.[0] === 'Element')!
    expect(methods.body!.filter(r => r[0].startsWith('Factor derivation: ')).map(r => [r[0].slice('Factor derivation: '.length), r[1]])).toEqual(derivationsFromRows(storedRows(ws)))
    const diesel = derivationsFromRows(storedRows(ws)).filter(([s]) => s === 'Diesel (stationary)').map(([, t]) => t)
    expect(diesel, 'each distinct line once, however many rows carry it').toEqual([conv.conversion_note, 'Conversion factor: 1 US gallon = 3.785411784 litres'])
  })
  it('the cover prints the stored save time, never the export time; the GWP column is the stored GWP set', () => {
    const { texts, tables } = run(saved())
    expect(texts).toContain('Prints this inventory as saved on 9 October 2026 at 14:32 UTC.')
    expect(tables.find(t => t.head?.[0]?.[1] === 'GWP')!.body![0][1]).toBe('IPCC AR6')
  })
  it('T16: the cover prints the version line, then the save it prints; with no version, the save line alone', () => {
    const { texts } = run(saved({ version_no: 3, version_saved_at: '2026-10-09T14:32:05.123Z' }))
    const v = texts.indexOf('Version 3, saved on 9 October 2026 at 14:32 UTC.')
    expect(v).toBeGreaterThan(-1)
    expect(texts[v + 1]).toBe('Prints this inventory as saved on 9 October 2026 at 14:32 UTC.')
    expect(run(saved()).texts.some(t => typeof t === 'string' && t.startsWith('Version '))).toBe(false)
  })
  it('T16: the PDF and the verifier page give the same version line for one version, a reused one included', () => {
    // A reused version: snapshotted on 1 October, the inventory re-saved on 9 October with nothing a verifier sees changed.
    const version = { version_no: 3, saved_at: '2026-10-01T08:15:42Z', shared_at: '2026-10-02T09:00:00Z', shared_by_customer: true }
    const { texts } = run(saved({ version_no: 3, version_saved_at: version.saved_at }))
    const [pageLine] = verifierVersionLines(version)
    expect(pageLine).toBe('Version 3, saved on 1 October 2026 at 08:15 UTC.')
    expect(texts).toContain(pageLine)
    // The save printed is the later one, on its own line; the version line never takes updated_at.
    expect(texts[texts.indexOf(pageLine) + 1]).toBe('Prints this inventory as saved on 9 October 2026 at 14:32 UTC.')
    expect(texts).not.toContain('Version 3, saved on 9 October 2026 at 14:32 UTC.')
  })
  it('the old GWP basis token prints the current wording, as the verifier page shows it', () => {
    const old = `as-published ${String.fromCharCode(0x2014)} see factor source`
    const ws = rows.map(r => r.gwp_basis === 'AR6' ? { ...r, gwp_basis: old } : r)
    const w = table(run(saved({ workings: ws })).tables, 'Location')!
    expect(w.body!.flat().join('\n')).not.toContain(old)
    expect(workingsGwpBasisCell({ gwp_basis: old })).toBe('as published: see factor source')
  })
  it('an inventory saved before its workings were kept prints the agreed line and no rebuilt figure', () => {
    const { texts, tables } = run(saved({ workings: null }))
    expect(texts.join('\n')).toContain(WORKINGS_NOT_KEPT)
    expect(table(tables, 'Location')).toBeUndefined()
    expect(tables.find(t => t.head?.[0]?.[0] === 'Edition')).toBeUndefined()
    expect(tables.find(t => t.head?.[0]?.[1] === 'Residual factor source')).toBeUndefined()
  })
})

describe('T17: nothing internal reaches the package', () => {
  it('no reason key, fuel key, GWP token, factor key or grid region code in any printed text', () => {
    const { all } = run(saved())
    // hk2: nor an older stored refusal's factor key, stored unit or country code.
    const old = { location: 'Paris', stream: 'natural_gas', source: 'Natural gas', scope: 1, gwp_basis: 'unpriced', result_tco2e: null, factor_key: 'natural_gas_kwh',
      note: 'NOT PRICED: No published emission factor for natural gas measured in kwh in FR (factor key "natural_gas_kwh"). This figure cannot be priced.' }
    const withOld = run(saved({ workings: [...fx.workings, old] })).all
    expect(withOld).toContain('No published emission factor for natural gas measured in kWh in France. This figure cannot be priced.')
    for (const k of ['factor key', 'natural_gas_kwh', ' in FR ']) expect(withOld, k).not.toContain(k)
    expect(withOld).not.toMatch(/\bkwh\b/)
    const keys = ['outside_year', 'same_bill_as', 'exact_duplicate_of', 'manual_override', 'not_confirmed', 'invalid_period', 'mixed_units', 'billing_month',
      'customer_confirmed', 'natural_gas', 'coverage_resolution', 'document_event', 'location_event', 'all_bills_excluded', 'scope3-cat3', 'US_CA', 'utility_bill_gas']
    for (const k of keys) expect(all, k).not.toContain(k)
    for (const r of rows) if (r.factor_key) expect(all, String(r.factor_key)).not.toContain(String(r.factor_key))
    expect(all).not.toMatch(/\bchase\b/i)
    // What T17 composes carries no em dash: each row's Source cell and each document's Status. (The engine's stored
    // declaration notes, "NOT DECLARED" and "DECLARED, NOT QUANTIFIED", still carry one, on both surfaces alike; they
    // are the engine's wording, stored with the row, and are left for an engine change.)
    const { tables } = run(saved())
    const composed = [...table(tables, 'Location')!.body!.map(r => r[1]), ...tables.find(t => t.head?.[0]?.[4] === 'Status')!.body!.map(r => r[4])].join('\n')
    expect(composed).not.toContain(String.fromCharCode(0x2014))
  })
})

describe('T17: the builder and its caller calculate nothing at export', () => {
  const PDF = readFileSync(join(process.cwd(), 'lib/assurancePdf.ts'), 'utf8')
  const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
  it('the PDF builder imports no engine calculation; only types from the engine', () => {
    for (const name of ['buildWorkings', 'selectionFor', 'selectionContextFor', 'pickEF', 'factorDerivationsFor', 'combustionSourcesFor', 'gridSourcesFor',
      'sourceAttributionsForLocations', 'countryRefusal(', 'getResidualFactor', 'calcInventory', 'deriveLocations']) expect(PDF, name).not.toContain(name)
    const fromEngine = PDF.match(/^import [^\n]*from '\.\/ghg\/engine'/gm) ?? []
    expect(fromEngine.length).toBeGreaterThan(0)
    for (const m of fromEngine) expect(m).toMatch(/^import type /)
  })
  it('the caller refuses while the page is unsaved, before reading or printing anything, and passes only the stored row', () => {
    const i = PAGE.indexOf('const generateAssurance = async () => {')
    const body = PAGE.slice(i, PAGE.indexOf('const generateExport = async', i))
    const refuse = body.indexOf('if (!inventoryId || dirty || baseline === undefined) {')
    expect(refuse).toBeGreaterThan(-1)
    expect(refuse).toBeLessThan(body.indexOf("from('audit_log')"))
    expect(refuse).toBeLessThan(body.indexOf('generateAssurancePDF('))
    expect(body).toContain("alert('Save the inventory first. The assurance package prints the inventory as saved, and this page has changes that are not saved.')")
    expect(body).toContain(".from('ghg_inventories').select('*').eq('id', inventoryId).maybeSingle()")
    for (const live of ['residualShown', 'getResidualFactor', 'totals_ar6', 'derivedLocations', 'comparability?.factorEditions']) expect(body, live).not.toContain(live)
  })
  it('the stored totals reach the summary unchanged', () => {
    const t = run(saved()).tables.find(x => x.head?.[0]?.[1] === 'GWP')!
    expect(t.body![0].slice(2, 4)).toEqual(['1.000', '2.000'])
  })
})

// ── T17 review ─────────────────────────────────────────────────────────────────────────────────────────────────────
import { buildWorkings, emptyLocation, type Location as EngineLocation } from './ghg/engine'
import { GAS_APR_SHA256 } from './testing/t17Fixture'
import { workingsNoteCell, STORED_PHRASES, displayStoredText } from './ghg/workingsCells'
import { TEST_PREPARED_ON } from './testing/heldSelection'

describe('T17 review: each action on a bill is said once, on its own line, on both surfaces', () => {
  const J = { email: 'jo@acme.example' }, M = { email: 'sam@acme.example' }
  const row = { source: 'Natural gas', gwp_basis: 'AR6', entry_method: 'concierge', contributions: [{
    docId: 'gas-jan', proposalIndex: 0, counted: true, reason: 'counted', periodOrigin: 'customer_confirmed', value: 95, unit: 'mcf',
    periodConfirmedAt: '2026-10-01T09:00:00.000Z', periodConfirmedBy: J,
    asRead: { unit: 'mcf', rawValue: 100, value: 100 },
    corrections: [{ fields: ['value'], at: '2026-10-02T09:00:00.000Z', by: M }],
    statusLog: [{ action: 'flagged', at: '2026-10-03T09:00:00.000Z', by: M }, { action: 'rejected', at: '2026-10-04T09:00:00.000Z', by: J }, { action: 'undone', at: '2026-10-05T09:00:00.000Z', by: J }],
    confirmations: [{ at: '2026-10-06T09:00:00.000Z', by: J }],
  }] }
  const actions = ['Billing dates confirmed by jo@acme.example on 1 October 2026', 'Figure changed by sam@acme.example on 2 October 2026',
    'Flagged for review by sam@acme.example on 3 October 2026', 'Rejected by jo@acme.example on 4 October 2026',
    'Rejection undone by jo@acme.example on 5 October 2026', 'Confirmed by jo@acme.example on 6 October 2026']
  it('once in the PDF cell and once in the verifier cell, each on the bill line', () => {
    const lines = sourcePartsLines(workingsSourceParts(row as never, fileOf, quoteOf, Y))
    const pdf = lines.join('\n')
    const html = renderToStaticMarkup(createElement(WorkingsSourceCell, { w: row as never, fileOf, quoteOf, yearText: Y, renderQuote: (q: string) => `"${q}"`, legacyDocIdOfPath: () => undefined }))
    const verifier = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
    const billLine = lines.find(l => l.startsWith('gas-jan.pdf: counted.'))!
    for (const a of actions) {
      const n = (t: string) => t.toLowerCase().split(a.toLowerCase()).length - 1
      expect(n(pdf), `PDF: ${a}`).toBe(1)
      expect(n(verifier), `verifier: ${a}`).toBe(1)
      expect(billLine.toLowerCase(), `on the bill line: ${a}`).toContain(a.toLowerCase())
    }
    expect(lines.filter(l => l.startsWith('gas-jan.pdf')), 'one line for the bill').toHaveLength(1)
  })
})

describe('T17 review: a tombstone prints its full SHA-256', () => {
  it('all 64 characters, never shortened', () => {
    expect(GAS_APR_SHA256).toMatch(/^[0-9a-f]{64}$/)
    const index = run(saved()).tables.find(t => t.head?.[0]?.[4] === 'Status')!
    const st = index.body!.find(r => r[2] === 'gas-apr.pdf')![4]
    expect(st).toContain(`SHA-256 ${GAS_APR_SHA256}.`)
  })
})

describe('T17 review: no em dash in any string the PDF prints', () => {
  const L = (o: Record<string, unknown>) => ({ ...emptyLocation(String(o.id), String(o.name)), ...o }) as unknown as EngineLocation
  // Sites whose stored citations and notes the engine writes with a dash (DCL-01): US steam, NZ (T&D and MfE), the EU
  // and Australian residual mixes, a declared stream with no figure, and the undeclared streams of the fixture.
  const sites = [
    L({ id: 's1', name: 'Boston', country: 'US', state: 'MA', grid_region: 'US_MA', electricity_kwh: 1000, has_purchased_steam: true, purchased_steam_mmbtu: 100, purchased_steam_unit: 'gj' }),
    L({ id: 's2', name: 'Auckland', country: 'NZ', grid_region: 'NZ', electricity_kwh: 1000, has_diesel_stationary: true, diesel_stationary_amount: 100, diesel_stationary_unit: 'litres', nz_use_class: 'industrial' }),
    L({ id: 's3', name: 'Berlin', country: 'DE', grid_region: 'EU_DE', electricity_kwh: 1000 }),
    L({ id: 's4', name: 'Sydney', country: 'AU', state: 'NSW', grid_region: 'AU_NSW', electricity_kwh: 1000, has_propane: true, propane_amount: 0 }),
  ]
  const extra = buildWorkings(sites, 'AR6', 2025, [], 12, { preparedOn: TEST_PREPARED_ON })
  it('every text call and every table cell, across those sites', () => {
    const before = JSON.stringify(extra).includes(String.fromCharCode(0x2014))
    expect(before, 'the stored rows do carry a dash, so this test means something').toBe(true)
    const { all } = run(saved({ workings: [...(fx.workings as unknown[]), ...extra], locations: [fx.location, ...sites] }))
    expect(all).not.toContain(String.fromCharCode(0x2014))
  })
  it('each stored phrase is mapped, on the note cell both surfaces read', () => {
    const d = String.fromCharCode(0x2014)
    expect(workingsNoteCell({ note: `NOT DECLARED ${d} completeness cannot be asserted for this stream.` })).toBe('NOT DECLARED: completeness cannot be asserted for this stream.')
    expect(workingsNoteCell({ note: `DECLARED, NOT QUANTIFIED ${d} this location uses natural gas, and no amount for it has been priced.` }))
      .toBe('DECLARED, NOT QUANTIFIED: this location uses natural gas, and no amount for it has been priced.')
    expect(displayStoredText(`Estimate method ${d} 9 of 12 months`)).toBe('Estimate method: 9 of 12 months')
    expect(displayStoredText(d)).toBe('Not provided')
    expect(STORED_PHRASES).toHaveLength(4)
    const verify = readFileSync(join(process.cwd(), 'app/verify/[token]/page.tsx'), 'utf8')
    expect(verify).toContain('const rowNoteOf = (w: WorkingRow): string | undefined => workingsNoteCell(w) || undefined')
    expect(verify).toContain('{workingsEmissionFactorCell(w)}')
  })
})
