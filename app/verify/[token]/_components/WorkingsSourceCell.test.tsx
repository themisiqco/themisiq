// app/verify/[token]/_components/WorkingsSourceCell.test.tsx
//
// T11: the design's page fixture. An inventory with an excluded document, a manual override and a month-only bill:
// the verifier's Source cell names every bill behind each figure, says which counted and which did not, and why, in
// words. The rows are built by the engine here, in the test; the page itself only renders stored rows.

import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkingsSourceCell, type SourceCellRow } from './WorkingsSourceCell'
import { buildWorkings, deriveLocations, emptyLocation, type Location, type ExtractedProposal, type SourceDoc, type CoverageResolution } from '@/lib/ghg/engine'
import { addOverride } from '@/lib/ghg/overrides'
import { TEST_PREPARED_ON } from '@/lib/testing/heldSelection'
import { workingsGwpBasisCell, workingsConversionFactorLine, workingsSourceCell } from '@/lib/ghg/workingsCells'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const p = (o: Partial<ExtractedProposal>): ExtractedProposal => ({ fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf',
  periodStart: '2025-01-01', periodEnd: '2025-01-31', confidence: 'high', periodConfidence: 'high', sourceQuote: 'January: 100 MCF', notes: null, status: 'confirmed', ...o })
const d = (id: string, type: string, ps: ExtractedProposal[]): SourceDoc => ({ id, file_name: `${id}.pdf`, document_type: type, uploaded_at: '2025-06-01', file_path: `/${id}.pdf`, extracted: ps })
const confirmedBy = (o: Partial<ExtractedProposal>) => ({ confirmations: [{ at: '2026-10-02T09:00:00.000Z', by: BY, reading: { value: 100, unit: 'mcf', rawValue: 100, rawUnit: 'mcf',
  periodStart: '2025-01-01', periodEnd: '2025-01-31', sourceQuote: 'January: 100 MCF' } }], ...o })

function fixture() {
  let l: Location = { ...emptyLocation('L1', 'Site A'), country: 'US', state: 'CA', grid_region: 'US_CA', has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: [
    d('gas-jan', 'utility_bill_gas', [p(confirmedBy({}))]),
    d('gas-dec24', 'utility_bill_gas', [p({ periodStart: '2024-12-01', periodEnd: '2024-12-31', value: 90, rawValue: 90, sourceQuote: 'December 2024: 90 MCF' })]),
    d('gas-feb', 'utility_bill_gas', [p({ periodStart: '2025-02-01', periodEnd: '2025-02-28', periodConfidence: 'medium', value: 80, rawValue: 80, sourceQuote: 'February: 80 MCF' })]),
    d('gas-feb-copy', 'utility_bill_gas', [p({ periodStart: '2025-02-01', periodEnd: '2025-02-28', periodConfidence: 'medium', value: 80, rawValue: 80, sourceQuote: 'February copy: 80 MCF' })]),
    d('elec-q1', 'utility_electricity', [p({ fuelType: 'electricity', rawUnit: 'kwh', unit: 'kwh', value: 5000, rawValue: 5000, periodEnd: '2025-03-31', sourceQuote: 'Q1: 5,000 kWh' })]),
  ] }
  l = { ...l, ...addOverride(l, { field: 'electricity_kwh', reason: 'Bill covers two tenants; our share is 40%', by: BY, at: '2026-10-03T09:00:00.000Z', startFrom: 5000 }), electricity_kwh: 2000 } as Location
  const res = [{ locId: 'L1', fuelType: 'natural_gas', kind: 'same_bill', countedDocId: 'gas-feb', excludedDocIds: ['gas-feb-copy'], by: BY,
    note: 'gas-feb.pdf and gas-feb-copy.pdf are the same bill, so it is counted once, from gas-feb.pdf.', acknowledgedAt: '2026-10-04T09:00:00.000Z' }] as CoverageResolution[]
  const rows = buildWorkings(deriveLocations({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: res }), 'AR6', 2025, res, 12, { preparedOn: TEST_PREPARED_ON }) as SourceCellRow[]
  const docs = Object.fromEntries(l.source_docs.map(x => [x.id, x]))
  return { rows, docs }
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const render = (w: SourceCellRow, docs: Record<string, SourceDoc>) => text(renderToStaticMarkup(
  <WorkingsSourceCell w={w} fileOf={id => docs[id]?.file_name ?? 'A document no longer on this inventory'}
    quoteOf={(id, pi) => (pi == null ? null : docs[id]?.extracted?.[pi]?.sourceQuote ?? null)} yearText="reporting year 2025"
    renderQuote={q => `"${q}"`} legacyDocIdOfPath={() => undefined} />))

// Every internal key a verifier must never read: contribution reasons, fuel keys, gwp_basis tokens, period origins.
const KEYS = ['outside_year', 'same_bill_as', 'exact_duplicate_of', 'manual_override', 'not_confirmed', 'invalid_period', 'mixed_units',
  'billing_month', 'customer_confirmed', 'natural_gas', 'coverage_resolution', 'document_event', 'location_event', 'all_bills_excluded', 'scope3-cat3']

describe('T11: per figure, the bills that counted and those that did not, and why', () => {
  const { rows, docs } = fixture()
  const gas = rows.find(r => r.stream === 'natural_gas')!
  const elec = rows.find(r => r.stream === 'electricity' && String(r.source).startsWith('Electricity (US'))!

  it('the gas figure: counted bills first, then each bill not counted with its reason, and the month-only dates said as such', () => {
    const t = render(gas, docs)
    expect(t).toBe([
      'Natural gas Bill-sourced Bills behind this figure',
      'gas-jan.pdf: counted. Confirmed by jo@acme.example on 2 October 2026. Read: "January: 100 MCF"',
      'gas-feb.pdf: counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time. Read: "February: 80 MCF"',
      'gas-dec24.pdf: not counted. Billed outside reporting year 2025. Confirmed; who and when were not recorded at the time. Read: "December 2024: 90 MCF"',
      'gas-feb-copy.pdf: not counted. The same bill as gas-feb.pdf, which is counted. Dates estimated from the billing month. Confirmed; who and when were not recorded at the time. Read: "February copy: 80 MCF"',
    ].join(' '))
    // T11 review: the confirmation is on the bill's own line, and not repeated below the bills.
    expect(t.split('Confirmed by jo@acme.example on 2 October 2026').length - 1).toBe(1)
  })
  it('the electricity figure: entered by hand, with the reason, who and when, and the bill it set aside', () => {
    const t = render(elec, docs)
    expect(t).toContain('Entered by hand')
    expect(t).toContain('elec-q1.pdf: not counted. The figure was entered by hand instead.')
    expect(t).toContain('Entered by hand by jo@acme.example on 3 October 2026, instead of from the bills. Reason: Bill covers two tenants; our share is 40%.')
    expect(t).not.toContain('Bill-sourced')
  })
  it('no internal key reaches the verifier, on any row of the fixture', () => {
    for (const w of rows) {
      const t = `${render(w, docs)} ${workingsGwpBasisCell(w as never)} ${workingsSourceCell(w as never)} ${workingsConversionFactorLine(w as never) ?? ''}`
      for (const k of KEYS) expect(t, `${String(w.source)}: ${k}`).not.toContain(k)
      if (w.factor_key) expect(t, String(w.source)).not.toContain(String(w.factor_key))
      expect(t).not.toContain('—')
      expect(t).not.toMatch(/\bchase\b/i)
    }
  })
})

describe('T11: the rest of what a row carries', () => {
  it('a withdrawal is said once, with its reason; the bill line and the record agree', () => {
    const w = { source: 'Natural gas', entry_method: 'concierge', contributions: [{ docId: 'a', proposalIndex: 0, counted: false, reason: 'withdrawn',
      statusLog: [{ action: 'withdrawn', at: '2026-10-05T09:00:00.000Z', by: BY }], withdrawal: { at: '2026-10-05T09:00:00.000Z', by: BY, reason: 'Duplicate upload' } }] } as unknown as SourceCellRow
    const t = render(w, {})
    // T17 review: on the bill's own line, once, with who, when and why; nothing repeated below.
    expect(t).toContain('A document no longer on this inventory: not counted. Withdrawn by jo@acme.example on 5 October 2026. Reason: Duplicate upload.')
    expect(t.match(/[Ww]ithdrawn by jo@acme\.example/g)).toHaveLength(1)
  })
  it('a row saved before per-bill contributions keeps "From source"', () => {
    const t = render({ source: 'Natural gas', entry_method: 'concierge', source_quotes: ['Total 120 therms'], source_file_paths: ['/a.pdf'] }, {})
    expect(t).toBe('Natural gas Bill-sourced From source: "Total 120 therms"')
  })
  it('an estimate says so with a comma, never an em dash', () => {
    expect(render({ source: 'Natural gas', entry_method: 'concierge-extrapolated', extrapolation_note: 'Scaled ×12/9' }, {})).toContain('Estimated, Scaled ×12/9')
  })
  it('FI9: the methane and nitrous oxide note on a US road line with no miles', () => {
    const l = { ...emptyLocation('L1', 'Depot'), country: 'US', state: 'CA', grid_region: 'US_CA', has_mobile: true, fleet_light: true,
      light_petrol_amount: 1000, light_petrol_unit: 'gallons', source_docs: [] } as unknown as Location
    const row = (buildWorkings([l], 'AR6', 2025, [], 12, { preparedOn: TEST_PREPARED_ON }) as SourceCellRow[]).find(r => r.ch4_n2o_note)!
    expect(row.ch4_n2o_note).toMatch(/^Methane and nitrous oxide for petrol in light vehicles at Depot are /)
    expect(render(row, {})).toContain(row.ch4_n2o_note as string)
  })
  it('a coverage row saved with its fuel key reads the fuel in words; a GWP basis token reads in words', () => {
    expect(workingsSourceCell({ source: 'Coverage resolution: natural_gas', gwp_basis: 'coverage_resolution' })).toBe('Coverage resolution: natural gas')
    expect(workingsGwpBasisCell({ gwp_basis: 'coverage_resolution' })).toBe('Not applicable: a coverage decision')
    expect(workingsGwpBasisCell({ gwp_basis: 'AR6' })).toBe('AR6')
  })
  it('the conversion factor in words, never the key', () => {
    expect(workingsConversionFactorLine({ conversion_factor: 3.785411784, factor_key: 'diesel_litre', activity_unit: 'gallons' })).toBe('Conversion factor: 1 US gallon = 3.785411784 litres')
    expect(workingsConversionFactorLine({ conversion_factor: 0.0283168, factor_key: 'fleet:light:petrol:xyz', activity_unit: 'm3' }))
      .toBe('Conversion factor: each m³ is 0.0283168 of the unit the factor is published in')
    expect(workingsConversionFactorLine({ activity_unit: 'kwh' })).toBeNull()
  })
})
