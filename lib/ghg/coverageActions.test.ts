// lib/ghg/coverageActions.test.ts
//
// T8: what the coverage strip's controls write, and that no resolution overwrites another.

import { describe, it, expect } from 'vitest'
import {
  resolutionKey, upsertResolution, sameBillResolution, differentMetersResolution, estimateResolution, usedNoneResolution, plainDate,
  deliveriesCompleteResolution, NO_MONTHS_TO_ESTIMATE,
} from './coverageActions'
import {
  emptyLocation, validateResolution, findUnresolvedCoverage, deriveLocations,
  type Location, type SourceDoc, type ExtractedProposal, type CoverageResolution,
} from './engine'

const AT = '2026-10-02T09:00:00.000Z'
const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: null, rawUnit: null, value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, o: Partial<ExtractedProposal> = {}, meter?: string): SourceDoc => ({
  id, file_name: `${id}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: `/${id}.pdf`,
  extracted: [prop(o)], ...(meter ? { meter_label: meter } : {}),
})
const loc = (docs: SourceDoc[]): Location => ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs })
const issues = (l: Location, r: CoverageResolution[]) => findUnresolvedCoverage([l], 2025, 12, r)
const gas = (l: Location, r: CoverageResolution[]) => deriveLocations({ locations: [l], reporting_year: 2025, coverage_resolutions: r })[0].natural_gas_amount
const file = (id: string) => ({ id, file: `${id}.pdf` })

describe('every builder writes a resolution the engine accepts', () => {
  const pair = loc([gdoc('a'), gdoc('b', { value: 120 })])
  it('same bill', () => {
    const r = sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('a'), excluded: file('b'), at: AT })
    expect(validateResolution(r, pair)).toBeNull()
    expect(r).toMatchObject({ kind: 'same_bill', countedDocId: 'a', excludedDocIds: ['b'], acknowledgedAt: AT })
    expect(r.note).toBe('a.pdf and b.pdf are the same bill, so it is counted once, from a.pdf.')
  })
  it('different meters, once the document carries the label', () => {
    const r = differentMetersResolution({ locId: 'L1', fuelType: 'natural_gas', doc: file('b'), meterLabel: '  Meter 2 ', at: AT })
    expect(r.meterLabel).toBe('Meter 2')
    expect(validateResolution(r, pair), 'the label must be on the document first').not.toBeNull()
    expect(validateResolution(r, loc([gdoc('a'), gdoc('b', {}, 'Meter 2')]))).toBeNull()
    expect(r.note).toBe('b.pdf is for a different meter or account: Meter 2.')
  })
  it('estimate, per meter and document type', () => {
    const r = estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: 'B', monthsCovered: 6, pctEstimated: 50, at: AT })
    expect(validateResolution(r, pair)).toBeNull()
    expect(r).toMatchObject({ kind: 'extrapolate', documentType: 'utility_bill_gas', meterLabel: 'B', monthsCovered: 6 })
    expect(r.note).toBe('Meter B: 6 of 12 months evidenced by bills; remaining 6 months estimated by scaling metered data ×12/6 (50% estimated).')
    const eleven = estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null, monthsCovered: 11, pctEstimated: 8.3, at: AT })
    expect(eleven.note, 'singular').toBe('11 of 12 months evidenced by bills; remaining 1 month estimated by scaling metered data ×12/11 (8.3% estimated).')
    const plain = estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null, monthsCovered: 9, pctEstimated: 25, at: AT })
    expect('meterLabel' in plain, 'the default meter carries no label').toBe(false)
  })
  it('used none records who confirmed it and when', () => {
    const r = usedNoneResolution({ locId: 'L1', fuelType: 'natural_gas', field: 'natural_gas_amount', fuelName: 'natural gas',
      by: { userId: 'u-1', email: 'jo@acme.example' }, at: AT })
    expect(validateResolution(r, pair)).toBeNull()
    expect(r).toMatchObject({ kind: 'used_none', field: 'natural_gas_amount', by: { userId: 'u-1', email: 'jo@acme.example' }, acknowledgedAt: AT })
    expect(r.note).toBe(`jo@acme.example confirmed on ${plainDate(AT)} that this site used no natural gas.`)
    expect(plainDate('2026-10-02T12:00:00.000Z'), 'a plain date: day, month name, year').toBe('2 October 2026')
  })
  it('no note carries an em dash', () => {
    const notes = [
      sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('a'), excluded: file('b'), at: AT }).note,
      differentMetersResolution({ locId: 'L1', fuelType: 'natural_gas', doc: file('b'), meterLabel: 'M', at: AT }).note,
      estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: 'B', monthsCovered: 6, pctEstimated: 50, at: AT }).note,
      usedNoneResolution({ locId: 'L1', fuelType: 'natural_gas', field: 'natural_gas_amount', fuelName: 'natural gas', by: { userId: 'u', email: 'e@x.example' }, at: AT }).note,
    ]
    for (const n of notes) expect(n).not.toContain('—')
  })
})

describe('keyed storage: no resolution overwrites another', () => {
  it('two overlaps on one fuel are both kept', () => {
    let list: CoverageResolution[] = []
    list = upsertResolution(list, sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('a'), excluded: file('b'), at: AT }))
    list = upsertResolution(list, sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('c'), excluded: file('d'), at: AT }))
    expect(list).toHaveLength(2)
  })
  it('choosing again for the same pair replaces the earlier choice, so the figure never drops to zero (ruling)', () => {
    const l = loc([gdoc('a'), gdoc('b', { value: 120 })])
    let list: CoverageResolution[] = []
    list = upsertResolution(list, sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('a'), excluded: file('b'), at: AT }))
    expect(gas(l, list)).toBe(100)
    list = upsertResolution(list, sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('b'), excluded: file('a'), at: AT }))
    expect(list).toHaveLength(1)
    expect(gas(l, list), 'b counted once, not both excluded').toBe(120)
    expect(issues(l, list).filter(i => i.status === 'overlap')).toEqual([])
  })
  it('gap estimates on two meters are both kept; a second estimate for the same meter replaces the first', () => {
    const est = (meter: string | null, m: number) => estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: meter, monthsCovered: m, pctEstimated: 0, at: AT })
    let list: CoverageResolution[] = []
    list = upsertResolution(list, est(null, 6))
    list = upsertResolution(list, est('B', 3))
    expect(list).toHaveLength(2)
    list = upsertResolution(list, est('B', 4))
    expect(list.map(r => [r.meterLabel ?? null, r.monthsCovered])).toEqual([[null, 6], ['B', 4]])
  })
  it('an estimate for stationary diesel and one for fleet diesel are both kept', () => {
    const est = (documentType: string) => estimateResolution({ locId: 'L1', fuelType: 'diesel', documentType, meterLabel: null, monthsCovered: 6, pctEstimated: 50, at: AT })
    expect(upsertResolution([est('fuel_diesel')], est('fleet_fuel'))).toHaveLength(2)
  })
  it('used none is kept per field; different meters per document', () => {
    const un = (field: string) => usedNoneResolution({ locId: 'L1', fuelType: 'diesel', field, fuelName: 'diesel', by: { userId: 'u', email: 'e@x.example' }, at: AT })
    expect(upsertResolution([un('diesel_stationary_amount')], un('diesel_mobile_amount'))).toHaveLength(2)
    const dm = (doc: string) => differentMetersResolution({ locId: 'L1', fuelType: 'natural_gas', doc: file(doc), meterLabel: 'M', at: AT })
    expect(upsertResolution([dm('b')], dm('c'))).toHaveLength(2)
    expect(upsertResolution([dm('b')], { ...dm('b'), meterLabel: 'N' })).toHaveLength(1)
  })
  it('the same-bill key ignores order', () => {
    const r1 = sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('a'), excluded: file('b'), at: AT })
    const r2 = sameBillResolution({ locId: 'L1', fuelType: 'natural_gas', counted: file('b'), excluded: file('a'), at: AT })
    expect(resolutionKey(r1)).toBe(resolutionKey(r2))
  })
})

describe('the controls resolve the issue they answer', () => {
  it('different meters splits the groups: the overlap clears and both bills count', () => {
    const withLabel = loc([gdoc('a'), gdoc('b', { value: 120 }, 'Meter 2')])
    const r = differentMetersResolution({ locId: 'L1', fuelType: 'natural_gas', doc: file('b'), meterLabel: 'Meter 2', at: AT })
    expect(issues(withLabel, [r]).filter(i => i.status === 'overlap')).toEqual([])
    expect(gas(withLabel, [r])).toBe(220)
  })
  it('an estimate on meter B clears only meter B\'s gap', () => {
    const months = (n: number, meter?: string, p = 'a') => Array.from({ length: n }, (_, k) => {
      const m = String(k + 1).padStart(2, '0')
      return gdoc(`${p}${k}`, { periodStart: `2025-${m}-01`, periodEnd: `2025-${m}-${new Date(2025, k + 1, 0).getDate()}` }, meter)
    })
    const l = loc([...months(6), ...months(6, 'B', 'b')])
    const gaps = (r: CoverageResolution[]) => issues(l, r).filter(i => i.status === 'gap').map(i => i.meterLabel)
    expect(gaps([])).toEqual([null, 'B'])
    const est = estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: 'B', monthsCovered: 6, pctEstimated: 50, at: AT })
    expect(gaps([est])).toEqual([null])
  })
  it('used none clears the all-rejected issue', () => {
    const l = loc([gdoc('a', { status: 'rejected' })])
    expect(issues(l, []).some(i => i.status === 'all_rejected')).toBe(true)
    const r = usedNoneResolution({ locId: 'L1', fuelType: 'natural_gas', field: 'natural_gas_amount', fuelName: 'natural gas', by: { userId: 'u', email: 'e@x.example' }, at: AT })
    expect(issues(l, [r]).some(i => i.status === 'all_rejected')).toBe(false)
  })
})

describe('T10b: deliveries confirmation and the 0-months guard', () => {
  it('confirming again replaces the earlier confirmation for the same documents type and fuel', () => {
    const by = { userId: 'u', email: 'e@x.example' }
    const a = deliveriesCompleteResolution({ locId: 'L1', fuelType: 'propane', documentType: 'fuel_propane', docIds: ['x'], statement: 'S.', by, at: AT })
    const b = deliveriesCompleteResolution({ locId: 'L1', fuelType: 'propane', documentType: 'fuel_propane', docIds: ['x', 'y'], statement: 'S.', by, at: AT })
    expect(upsertResolution([a], b)).toEqual([b])
    expect(a.note).toMatch(/^e@x\.example confirmed on \d{1,2} [A-Z][a-z]+ \d{4}: S\.$/)
  })
  it('no estimate below one covered month', () => {
    expect(() => estimateResolution({ locId: 'L1', fuelType: 'natural_gas', documentType: 'utility_bill_gas', meterLabel: null, monthsCovered: 0, pctEstimated: 100, at: AT }))
      .toThrow(NO_MONTHS_TO_ESTIMATE)
  })
})
