// lib/ghg/overrides.test.ts
//
// T10: a document-backed figure entered by hand instead, with a required reason (section 3.3, ruling Q1),
// and switched back ("Use the bills instead", T10 ruling).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addOverride, removeOverride } from './overrides'
import {
  emptyLocation, deriveLocations, calcInventory, buildWorkings, billContributions, findUnresolvedCoverage,
  periodFromYearAndEnd, overrideProblem, activeOverride, pctEstimated,
  type Location, type SourceDoc, type ExtractedProposal, type CoverageResolution,
} from './engine'
import { buildMonthlyEmissions, reconcile } from './monthlyEmissions'
import { calcGas, pickEF, getGridFactor, isResolvedGridRegion } from './engine'

const AT = '2026-10-02T09:00:00.000Z'
const BY = { userId: 'u-1', email: 'jo@acme.example' }
const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: 100, rawUnit: 'mcf', value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const gdoc = (id: string, p: ExtractedProposal): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type: 'utility_bill_gas', uploaded_at: '2025-06-01', file_path: `/${id}.pdf`, extracted: [p] })
const site = (docs: SourceDoc[], o: Partial<Location> = {}): Location =>
  ({ ...emptyLocation('L1', 'Site A'), has_natural_gas: true, natural_gas_unit: 'mcf', source_docs: docs, ...o })
const inv = (l: Location, r: CoverageResolution[] = []) => ({ locations: [l], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: r })
const derived = (l: Location) => deriveLocations(inv(l))[0]
// Apply a patch, then the customer types `typed` into the now-editable field.
const overridden = (l: Location, reason: string, typed?: number) => {
  const next = { ...l, ...addOverride(l, { field: 'natural_gas_amount', reason, by: BY, at: AT, startFrom: derived(l).natural_gas_amount }) }
  return typed == null ? next : { ...next, natural_gas_amount: typed }
}
const statuses = (l: Location) => findUnresolvedCoverage([l], 2025, 12, []).map(i => i.status)

describe('switching to manual needs a reason', () => {
  it('an empty or blank reason is refused, and so is a missing who', () => {
    expect(overrideProblem({ reason: '', by: BY })).toBe('Give a reason for entering this figure manually.')
    expect(overrideProblem({ reason: '   ', by: BY })).toBe('Give a reason for entering this figure manually.')
    expect(overrideProblem({ reason: 'ok', by: null })).toBe('An override must record who made it.')
    expect(() => addOverride(site([]), { field: 'natural_gas_amount', reason: ' ', by: BY, at: AT, startFrom: 0 })).toThrow('Give a reason')
  })
  it('records the field, the reason (trimmed), who and when', () => {
    const l = overridden(site([gdoc('a', prop({}))]), '  Bill is for the landlord meter  ')
    expect(l.manual_overrides).toEqual([{ field: 'natural_gas_amount', reason: 'Bill is for the landlord meter', at: AT, by: BY }])
  })
})

describe('an overridden field uses the typed figure', () => {
  it('the typed value is the figure, in totals too; the bill is not counted', () => {
    const l = overridden(site([gdoc('a', prop({}))]), 'Bill covers two sites', 250)
    expect(derived(l).natural_gas_amount).toBe(250)
    const alone = calcInventory([site([], { natural_gas_amount: 250 })], 'AR6', 2025).s1_total
    expect(calcInventory(deriveLocations(inv(l)), 'AR6', 2025).s1_total).toBeCloseTo(alone, 12)
  })
  it('switching starts from the figure the bills gave, so it never drops to zero on its own', () => {
    expect(derived(overridden(site([gdoc('a', prop({}))]), 'r')).natural_gas_amount).toBe(100)
  })
  it('contributions read manual_override, not counted, and the document stays', () => {
    const l = overridden(site([gdoc('a', prop({}))]), 'r', 250)
    expect(billContributions(l, [], periodFromYearAndEnd(2025, 12))).toMatchObject([{ docId: 'a', counted: false, reason: 'manual_override' }])
    expect(l.source_docs.map(d => d.id)).toEqual(['a'])
  })
  it('the workings row is manual and carries the reason, who and when, with the uncounted bill', () => {
    const l = overridden(site([gdoc('a', prop({}))]), 'Bill covers two sites', 250)
    const rows = buildWorkings([l], 'AR6', 2025, [], 12) as { stream?: string; entry_method?: string; activity_data?: number; manual_override?: unknown; contributions?: { reason: string }[] }[]
    const r = rows.find(x => x.stream === 'natural_gas')!
    expect(r).toMatchObject({ entry_method: 'manual', activity_data: 250, manual_override: { reason: 'Bill covers two sites', at: AT, by: BY } })
    expect(r.contributions?.map(c => c.reason)).toEqual(['manual_override'])
  })
})

describe('a customer with an unusable document can finish', () => {
  for (const [label, docs, issue] of [
    ['undated', [gdoc('u', prop({ periodStart: null, periodEnd: null }))], 'undated'],
    ['mixed units', [gdoc('a', prop({})), gdoc('b', prop({ unit: 'therms', rawUnit: 'therms', periodStart: '2025-02-01', periodEnd: '2025-02-28' }))], 'mixed_units'],
    ['a gap', [gdoc('a', prop({}))], 'gap'],
  ] as const) {
    it(`${label}: the issue clears once the figure is entered by hand`, () => {
      const l = site([...docs])
      expect(statuses(l)).toContain(issue)
      expect(statuses(overridden(l, 'Unusable bill', 1200))).not.toContain(issue)
    })
  }
  it('the overridden field is not estimated, and monthly writes nothing for it: reconcile is zero', () => {
    const l = overridden(site([gdoc('a', prop({}))]), 'r', 1200)
    expect(pctEstimated(inv(l), 'AR6')).toBe(0)
    const deps = { calcGas, pickEF, getGridFactor, isResolvedGridRegion }
    const m = buildMonthlyEmissions(inv(l), deps, 'AR6')
    expect(m.slices).toEqual([])
    expect(m.skipped.map(s => s.reason)).toEqual(['not counted: manual_override'])
    expect(reconcile(m.slices, inv(l), 'AR6').reconciles).toBe(true)
  })
})

describe('"Use the bills instead" (T10 ruling)', () => {
  it('the bills count again, and the removal is kept with who and when', () => {
    const on = overridden(site([gdoc('a', prop({}))]), 'Bill covers two sites', 250)
    const off = { ...on, ...removeOverride(on, { field: 'natural_gas_amount', by: { userId: 'u-2', email: 'sam@acme.example' }, at: '2026-10-03T10:00:00.000Z' }) }
    expect(activeOverride(off, 'natural_gas_amount')).toBeUndefined()
    expect(derived(off).natural_gas_amount, 'from the bill again; the typed 250 is ignored').toBe(100)
    expect(off.manual_overrides_removed).toEqual([{ field: 'natural_gas_amount', reason: 'Bill covers two sites', at: AT, by: BY,
      removedAt: '2026-10-03T10:00:00.000Z', removedBy: { userId: 'u-2', email: 'sam@acme.example' } }])
    expect(removeOverride(off, { field: 'natural_gas_amount', by: BY, at: AT }), 'nothing to remove: no change').toEqual({})
  })
})

describe('the page: unread uploads and the export summary (T10 ruling)', () => {
  const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
  it('no bare status codes in the export summary', () => {
    expect(page).not.toContain("unresolvedCoverage.map(u => u.status)")
    expect(page).toContain('resolving. Each one is explained under its upload.')
  })
  it('an unread upload that does not block is labelled as evidence', () => {
    expect(page).toContain('Uploaded as evidence. No figure was read from it.')
    expect(page).toContain("(doc.extracted?.length ?? 0) === 0 && !unreadBlocking.has(doc.id)")
  })
  it('every field an unread upload can name has an input "Enter the figure manually" can reach', () => {
    for (const f of ['natural_gas_amount', 'propane_amount', 'diesel_stationary_amount', 'gasoline_amount', 'diesel_mobile_amount', 'electricity_kwh', 'renewable_electricity_kwh']) {
      expect(page, f).toContain(`<FigureInput loc={loc} field="${f}"`)
    }
    for (const f of ['fuel_oil_distillate_amount', 'fuel_oil_residual_amount', 'refrigerant_purchased_kg', 'purchased_steam_mmbtu', 'biogenic_co2_mt']) {
      expect(page, f).toContain(`<input id={\`figure-\${loc.id}-${f}\`}`)
    }
  })
})
