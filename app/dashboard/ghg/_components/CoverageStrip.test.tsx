// app/dashboard/ghg/_components/CoverageStrip.test.tsx
//
// T8: the coverage strip renders the engine's issues and the controls that answer them, and none of the
// controls the engine ignored.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { CoverageStrip, type CoverageStripProps } from './CoverageStrip'
import { emptyLocation, deriveLocations, type Location, type SourceDoc, type ExtractedProposal } from '@/lib/ghg/engine'
import { stripTsComments } from '@/lib/testing/stripComments'

const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: null, rawUnit: null, value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, o: Partial<ExtractedProposal> = {}, meter?: string): SourceDoc => ({
  id, file_name: `${id}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: `/${id}.pdf`,
  extracted: [prop(o)], ...(meter ? { meter_label: meter } : {}),
})
const site = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs })
const draw = (location: Location, o: Partial<CoverageStripProps> = {}) => renderToStaticMarkup(
  <CoverageStrip location={location} docType="utility_bill_gas" reportingYear={2025} fiscalYearEndMonth={12} resolutions={[]}
    currentUser={{ userId: 'u-1', email: 'jo@acme.example' }} onAdd={() => {}} onLabelMeter={() => {}} onEnterManually={() => {}} {...o} />)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const month = (k: number) => {
  const m = String(k).padStart(2, '0')
  return { periodStart: `2025-${m}-01`, periodEnd: `2025-${m}-${new Date(2025, k, 0).getDate()}` }
}

describe('coverage strip', () => {
  it('an overlap shows the engine message and both resolutions', () => {
    const t = text(draw(site([gdoc('a'), gdoc('b')])))
    expect(t).toContain('a.pdf and b.pdf cover the same days (1 January 2025 to 31 January 2025). Choose Same bill, count it once, or Different meters or accounts.')
    expect(t).toContain('If these are the same bill, count it once:')
    expect(t).toContain('Count a.pdf')
    expect(t).toContain('Count b.pdf')
    expect(t).toContain("If they're for different meters or accounts, name the second one:")
    expect(draw(site([gdoc('a'), gdoc('b')]))).toContain('placeholder="Meter or account for b.pdf"')
    expect(draw(site([gdoc('a'), gdoc('b')]))).toMatch(/>Save<\/button>/)
  })

  it('no control the engine ignores is offered', () => {
    const t = text(draw(site([gdoc('a'), gdoc('b'), gdoc('s', { periodStart: '2024-12-20', periodEnd: '2025-01-19' })])))
    for (const gone of ['Confirm not a duplicate', 'Count in this year', 'Count in next year', 'Prorate by days', 'How should the overlapping portion be counted?']) {
      expect(t, gone).not.toContain(gone)
    }
  })

  it('a straddling bill is disclosed with its prorated share, not offered as a choice', () => {
    const t = text(draw(site([gdoc('s', { value: 310, periodStart: '2024-12-20', periodEnd: '2025-01-19' })])))
    expect(t).toContain('s.pdf crosses into another year: 19 of its 31 days are in reporting year 2025, so 61.3% of the bill is counted.')
  })

  it('a non-December year names the year by its end', () => {
    const t = text(draw(site([gdoc('s', { periodStart: '2025-03-15', periodEnd: '2025-04-14' })]), { fiscalYearEndMonth: 3 }))
    expect(t).toContain('days are in the year ending 31 March 2025')
  })

  it('gaps are shown and estimated per meter', () => {
    const docs = [...[1, 2, 3, 4, 5, 6].map(k => gdoc(`a${k}`, month(k))), ...[1, 2, 3].map(k => gdoc(`b${k}`, month(k), 'B'))]
    const t = text(draw(site(docs)))
    expect(t).toContain('natural gas: 6 of 12 months covered by bills. Missing: Jul 2025, Aug 2025, Sep 2025, Oct 2025, Nov 2025, Dec 2025.')
    expect(t).toContain('natural gas, meter B: 3 of 12 months covered by bills.')
    expect((t.match(/Estimate the missing months/g) ?? []).length, 'one estimate control per meter').toBe(2)
  })

  it('an estimated gap says how many months are estimated and their share', () => {
    const docs = [1, 2, 3, 4, 5, 6].map(k => gdoc(`a${k}`, month(k)))
    const est = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate' as const, documentType: 'utility_bill_gas', monthsCovered: 6, pctEstimated: 50,
      note: 'n', acknowledgedAt: '2026-10-02T09:00:00.000Z' }
    const t = text(draw(site(docs), { resolutions: [est] }))
    expect(t).toContain('6 of 12 months from bills; the other 6 are estimated (50% of the total).')
    expect(t).not.toContain('Estimate the missing months')
  })

  it('a full year reads as covered, with no control', () => {
    const t = text(draw(site(Array.from({ length: 12 }, (_, k) => gdoc(`m${k}`, month(k + 1))))))
    expect(t).toContain('All 12 months covered by bills.')
    expect(t).not.toContain('Estimate the missing months')
  })

  it('every bill rejected: the message and both answers; "used none" needs a signed-in user', () => {
    const l = site([gdoc('r', { status: 'rejected' })])
    const t = text(draw(l))
    expect(t).toContain('Every natural gas document for Site A was rejected and no figure has been entered. Enter the figure manually, or confirm this site used no natural gas.')
    expect(t).toContain('Enter the figure manually')
    expect(t).toContain('Confirm this site used no natural gas')
    expect(draw(l, { currentUser: null })).toMatch(/<button[^>]*disabled=""[^>]*>Confirm this site used no natural gas<\/button>/)
    expect(draw(l)).not.toMatch(/<button[^>]*disabled=""[^>]*>Confirm this site used no natural gas<\/button>/)
  })

  it('bills that are not counted show their plain-language reason', () => {
    const t = text(draw(site([gdoc('u', { periodStart: null, periodEnd: null })])))
    expect(t).toContain('u.pdf has no billing period, so it is not counted. Enter the dates as they appear on the bill.')
  })

  it('bills outside the year: plain wording, singular and plural, no emoji', () => {
    const one = text(draw(site([gdoc('in', month(1)), gdoc('old', { periodStart: '2024-03-01', periodEnd: '2024-03-31' })])))
    expect(one).toContain('1 bill falls outside reporting year 2025 and is not counted: Mar 2024.')
    const two = text(draw(site([gdoc('in', month(1)), gdoc('o1', { periodStart: '2024-03-01', periodEnd: '2024-03-31' }), gdoc('o2', { periodStart: '2024-04-01', periodEnd: '2024-04-30' })])))
    expect(two).toContain('2 bills fall outside reporting year 2025 and are not counted: Mar 2024, Apr 2024.')
    expect(one + two).not.toContain('ℹ')
    const march = text(draw(site([gdoc('in', { periodStart: '2024-05-01', periodEnd: '2024-05-31' }), gdoc('old', { periodStart: '2023-03-01', periodEnd: '2023-03-31' })]), { fiscalYearEndMonth: 3 }))
    expect(march).toContain('1 bill falls outside the year ending 31 March 2025 and is not counted: Mar 2023.')
  })

  it('an unread upload with no figure: the message and both actions; with a figure: nothing to resolve', () => {
    const unread: SourceDoc = { id: 'scan', file_name: 'scan.pdf', document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: '/scan.pdf', extracted: [] }
    const t = text(draw(site([unread])))
    expect(t).toContain('scan.pdf is uploaded for natural gas at Site A, but no figure has been read from it or entered. Enter the figure from the bill, or confirm this site used no natural gas.')
    expect(t).toContain('Enter the figure manually')
    expect(t).toContain('Confirm this site used no natural gas')
    expect(draw({ ...site([unread]), natural_gas_amount: 400 })).toBe('')
  })

  it('nothing to say: no strip', () => {
    expect(draw(site([]))).toBe('')
  })

  it('no em dash anywhere it renders', () => {
    const docs = [gdoc('a'), gdoc('b'), gdoc('s', { periodStart: '2024-12-20', periodEnd: '2025-01-19' }), gdoc('r', { status: 'rejected', fuelType: 'natural_gas' })]
    expect(draw(site(docs))).not.toContain('—')
  })
})

describe('the page wires the strip and writes no ignored resolution', () => {
  const page = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8'))
  const strip = stripTsComments(readFileSync(join(process.cwd(), 'app/dashboard/ghg/_components/CoverageStrip.tsx'), 'utf8'))
  it('no duplicate or straddle resolution is written anywhere', () => {
    for (const src of [page, strip]) {
      expect(src).not.toMatch(/kind:\s*'duplicate'/)
      expect(src).not.toMatch(/kind:\s*'straddle'/)
    }
  })
  it('resolutions are stored by key, and the meter label and its resolution in one update', () => {
    expect(page).toContain('upsertResolution(inv.coverage_resolutions ?? [], res)')
    expect(page).not.toMatch(/r\.kind === res\.kind/)
    expect(page).toContain("source_docs: l.source_docs.map(d => d.id === docId ? { ...d, meter_label: label } : d)")
  })
  it('the strip builds every resolution through lib/ghg/coverageActions', () => {
    for (const b of ['sameBillResolution(', 'differentMetersResolution(', 'estimateResolution(', 'usedNoneResolution(']) expect(strip).toContain(b)
  })
})

describe('coverage strip: deliveries and the 0-months guard (T10b)', () => {
  const lpg = (id: string, date: string): SourceDoc => ({
    id, file_name: `${id}.pdf`, document_type: 'fuel_propane', uploaded_at: '2025-06-01', file_path: `/${id}.pdf`,
    extracted: [prop({ fuelType: 'propane', value: 180, unit: 'litres', periodStart: date, periodEnd: date })],
  })
  const melbourne = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Melbourne'), country: 'AU', has_propane: true, propane_unit: 'litres', source_docs: docs })
  const drawLpg = (l: Location, o: Partial<CoverageStripProps> = {}) => draw(l, { docType: 'fuel_propane', ...o })
  const STATEMENT = 'These are all the propane deliveries for Melbourne between 1 January 2025 and 31 December 2025.'

  it('deliveries are listed by date with no month count and no estimate, and the confirmation names fuel, site and window', () => {
    const l = melbourne([lpg('lpg2', '2025-06-23'), lpg('lpg1', '2025-03-14')])
    const t = text(drawLpg(l))
    expect(t).toContain('Confirm these are all the propane deliveries for Melbourne between 1 January 2025 and 31 December 2025. Export is blocked until you confirm.')
    expect(t).toContain('Deliveries are counted in full in the year they were delivered, not spread over months.')
    expect(t.indexOf('lpg1.pdf: 180 litres, delivered 14 March 2025.')).toBeLessThan(t.indexOf('lpg2.pdf: 180 litres, delivered 23 June 2025.'))
    expect(t).toContain(STATEMENT)
    expect(t).not.toContain('months covered')
    expect(t).not.toContain('Estimate the missing months')
    // T10c: the statement is a checkbox label, and "Confirm deliveries" stays disabled until it is ticked.
    expect(drawLpg(l)).toMatch(/<input type="checkbox"[^>]*>/)
    expect(drawLpg(l)).toMatch(/<button disabled=""[^>]*>Confirm deliveries<\/button>/)
    expect(drawLpg(l, { currentUser: null })).toMatch(/<input type="checkbox"[^>]*disabled=""/)
  })

  it('once confirmed, the strip shows who confirmed and when', () => {
    const l = melbourne([lpg('lpg1', '2025-03-14')])
    const conf = { locId: 'L1', fuelType: 'propane', kind: 'deliveries_complete' as const, documentType: 'fuel_propane', docIds: ['lpg1'],
      by: { userId: 'u-1', email: 'jo@acme.example' }, note: `jo@acme.example confirmed on 2 January 2026: ${STATEMENT}`, acknowledgedAt: '2026-01-02T09:00:00.000Z' }
    const t = text(drawLpg(l, { resolutions: [conf] }))
    expect(t).toContain(`✓ jo@acme.example confirmed on 2 January 2026: ${STATEMENT}`)
    expect(t).not.toContain('Export is blocked')
  })

  it('a gap with no month covered offers no estimate and says why', () => {
    const t = text(draw(site([gdoc('a', { periodStart: '2025-03-10', periodEnd: '2025-03-20' })])))
    expect(t).toContain('0 of 12 months covered by bills.')
    expect(t).not.toContain('Estimate the missing months')
    expect(t).toContain('No month is fully covered by these bills, so the missing months cannot be estimated from them. Upload the missing bills, or enter the figure yourself.')
  })

  it('an estimate the engine refuses is shown with its reason, and can be removed', () => {
    const zero = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate' as const, documentType: 'utility_bill_gas', monthsCovered: 0, pctEstimated: 100,
      note: 'n', acknowledgedAt: '2026-01-02T09:00:00.000Z' }
    const l = site([gdoc('a', { periodStart: '2025-03-10', periodEnd: '2025-03-20' })])
    const t = text(draw(l, { resolutions: [zero], onRemove: () => {} }))
    expect(t).toContain('An estimate was recorded but cannot be used: An estimate needs the number of months covered by bills.')
    expect(t).toContain('Remove it')
    expect(text(draw(l, { resolutions: [zero] }))).not.toContain('Remove it')
  })
})

describe('coverage strip: fix bills before estimating (T10c)', () => {
  const months = (n: number, o: Partial<ExtractedProposal> = {}) => Array.from({ length: n }, (_, k) => gdoc(`m${k}`, { ...month(k + 1), ...o }))
  it('says to fix bills marked above when the field has bills still needing attention', () => {
    const t = text(draw(site([...months(6), gdoc('pending', { ...month(8), status: 'extracted' })])))
    expect(t).toContain('Estimate the missing months')
    expect(t).toContain('Fix any bills marked above before estimating.')
  })
  it('says nothing more when every bill is settled', () => {
    const t = text(draw(site(months(6))))
    expect(t).toContain('Estimate the missing months')
    expect(t).not.toContain('Fix any bills marked above before estimating.')
  })
})

describe('coverage strip: what it says is not counted is not in the figure (T13, F-09)', () => {
  it('a bill wholly outside the year is listed as not counted and adds 0 to the annual figure', () => {
    const l = site([gdoc('jan', month(1)), gdoc('feb', { ...month(2), value: 50 }), gdoc('old', { value: 999, periodStart: '2024-03-01', periodEnd: '2024-03-31' })])
    const t = text(draw(l))
    expect(t).toContain('1 bill falls outside reporting year 2025 and is not counted:')
    // The figure the totals read is the two in-year bills only. On the old code it was 1149.
    expect(deriveLocations({ locations: [l], reporting_year: 2025 })[0].natural_gas_amount).toBe(150)
    // Remove the bill the strip calls not counted, and the figure does not move.
    const without = { ...l, source_docs: l.source_docs.filter(d => d.id !== 'old') }
    expect(deriveLocations({ locations: [without], reporting_year: 2025 })[0].natural_gas_amount).toBe(150)
    expect(text(draw(without))).not.toContain('not counted')
  })
})
