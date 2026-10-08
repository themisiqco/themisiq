// lib/ghg/savePath.test.ts
//
// T7: the save writes figures derived from the documents, and never stores a document-backed figure.
// docs/review/design-derived-figures.md section 11 T7 and the T7 rulings in section 10.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { figuresForSave, DERIVATION_VERSION } from './savePayload'
import {
  emptyLocation, deriveLocations, pctEstimated, buildWorkings, calcInventory,
  type Location, type Inventory, type SourceDoc, type ExtractedProposal, type CoverageResolution,
} from './engine'
import { stripTsComments } from '../testing/stripComments'

const ROOT = process.cwd()
const pageSrc = readFileSync(join(ROOT, 'app/dashboard/ghg/page.tsx'), 'utf8')
const pageCode = stripTsComments(pageSrc)

const prop = (o: Partial<ExtractedProposal>): ExtractedProposal => ({
  fuelType: 'natural_gas', rawValue: null, rawUnit: null, value: 100, unit: 'mcf', periodStart: '2025-01-01',
  periodEnd: '2025-01-31', confidence: 'high', sourceQuote: 'q', notes: null, status: 'confirmed', ...o,
})
const doc = (document_type: string, p: ExtractedProposal, id: string): SourceDoc =>
  ({ id, file_name: `${id}.pdf`, document_type, uploaded_at: '2025-06-01', file_path: `/${id}.pdf`, extracted: [p] })
const loc = (o: Partial<Location>): Location => ({ ...emptyLocation('L1', 'Site A'), ...o })
const inv = (locations: Location[], o: Partial<Inventory> = {}): Inventory => ({
  company_name: 'Acme', reporting_year: 2025, revenue_millions: 0, fiscal_year_end_month: 12, locations,
  coverage_resolutions: [], ...o,
} as unknown as Inventory)

describe('T7 source guard: the page writes no document-backed figure', () => {
  it('applyResolutions is not called or imported by the page', () => {
    expect(pageCode).not.toMatch(/applyResolutions\s*\(/)
    expect(pageCode).not.toMatch(/\bapplyResolutions\b/)
  })
  it('no field is assigned from a computed figure', () => {
    expect(pageCode).not.toMatch(/\[a\.field\]\s*=/)
    expect(pageCode).not.toMatch(/\[a\.unitField\]\s*=/)
    expect(pageCode, 'the mixed-units flip to needs_manual_review is gone (the T3 issue replaces it)')
      .not.toMatch(/status:\s*'needs_manual_review'\s*as ConciergeStatus/)
  })
  it('the payload is built from figuresForSave, with raw locations and derivation_version', () => {
    expect(pageSrc).toContain('const saved = figuresForSave(inventory, \'AR6\')')
    for (const line of ['locations_data: saved.locations_data,', 'workings: saved.workings,', 'pct_estimated: saved.pct_estimated,',
      'scope1_total: saved.totals.s1_total,', 'factor_editions: saved.factor_editions,', 'derivation_version: saved.derivation_version,']) {
      expect(pageSrc, line).toContain(line)
    }
  })
  it('totals, gates and exports read the derived locations', () => {
    for (const s of ['calcInventory(derivedLocations,', 'findUndeclaredStreams(derivedLocations,', 'findUnpriceableLocations(derivedLocations,',
      'findSteamFactorGaps(derivedLocations, factorSel)', 'buildWorkings(derivedLocations,', 'const loc = derivedLocations[activeLocation]',
      'generateAssurancePDF({ ...inventory, locations: derivedLocations, factor_edition_comparison:']) {
      expect(pageSrc, s).toContain(s)
    }
  })
  it('every document-backed input goes through FigureInput', () => {
    for (const f of ['natural_gas_amount', 'propane_amount', 'diesel_stationary_amount', 'electricity_kwh', 'renewable_electricity_kwh']) {
      expect(pageSrc, f).toContain(`<FigureInput loc={loc} field="${f}"`)
      expect(pageCode, `${f}: no raw input left`).not.toMatch(new RegExp(`<input type="number" value=\\{loc\\.${f} \\|\\| ''\\}`))
    }
  })
  it('FI9 diff 3: the six fleet fields go through the same FigureInput, in the FleetBlock figure render', () => {
    expect(pageSrc).toContain('<FigureInput loc={loc} field={amount}')
    expect(readFileSync(join(process.cwd(), 'app/dashboard/ghg/_components/FleetBlock.tsx'), 'utf8')).toContain('{p.figure(f.amount, f.unit)}')
  })
  it('the prior-year summary derives the stored row before reading it', () => {
    // F-06: with factor_editions and updated_at, so the prior year's own calculation can be rerun.
    expect(pageSrc).toContain("boundary_approach, reporting_year, fiscal_year_end_month, coverage_resolutions, factor_selection, factor_editions, updated_at')")
    expect(pageSrc).toContain('const priorLocations = deriveStoredLocations(row)')
    expect(pageSrc).toContain('assessCompleteness(row.workings, priorLocations, row.reporting_year, row.fiscal_year_end_month, row.factor_selection)')
  })
  it('the trends completeness check derives the stored row before reading it', () => {
    const series = readFileSync(join(ROOT, 'lib/ghg/loadSeries.ts'), 'utf8')
    expect(series).toContain('"workings, locations_data, fiscal_year_end_month, coverage_resolutions, "')
    expect(series).toContain('assessCompleteness(r.workings, deriveStoredLocations(r), r.reporting_year, r.fiscal_year_end_month, r.factor_selection)')
  })
})

describe('T7 figuresForSave', () => {
  const extrap: CoverageResolution = { locId: 'L1', fuelType: 'natural_gas', kind: 'extrapolate', monthsCovered: 1, pctEstimated: 92,
    note: '1 of 12', acknowledgedAt: '2026-01-01T00:00:00Z' }
  const fixtures: [string, Inventory][] = [
    ['gas from one bill', inv([loc({ has_natural_gas: true, source_docs: [doc('utility_bill_gas', prop({}), 'g')] })])],
    ['gas grossed up, electricity typed', inv([loc({ has_natural_gas: true, grid_region: 'US_CA', electricity_kwh: 5000,
      source_docs: [doc('utility_bill_gas', prop({}), 'g')] })], { coverage_resolutions: [extrap] } as Partial<Inventory>)],
    ['stale stored figure, bill outside the year', inv([loc({ has_natural_gas: true, natural_gas_amount: 999,
      source_docs: [doc('utility_bill_gas', prop({ periodStart: '2024-01-01', periodEnd: '2024-01-31' }), 'g')] })])],
    ['two sites, March year end', inv([
      loc({ has_natural_gas: true, source_docs: [doc('utility_bill_gas', prop({ periodStart: '2024-06-01', periodEnd: '2024-06-30' }), 'g')] }),
      loc({ id: 'L2', name: 'Site B', grid_region: 'US_CA', source_docs: [doc('utility_electricity', prop({ fuelType: 'electricity', value: 9000, unit: 'kwh' }), 'e')] }),
    ], { fiscal_year_end_month: 3 } as Partial<Inventory>)],
  ]

  for (const [label, i] of fixtures) {
    it(`${label}: saved totals equal the sum of the saved workings rows`, () => {
      const f = figuresForSave(i, 'AR6')
      type Row = { scope?: number; scope2_method?: string; stream?: string; result_tco2e?: number | null }
      const rows = f.workings as Row[]
      const sum = (p: (r: Row) => boolean) => rows.filter(r => typeof r.result_tco2e === 'number' && p(r)).reduce((a, r) => a + (r.result_tco2e as number), 0)
      expect(sum(r => r.scope === 1)).toBeCloseTo(f.totals.s1_total, 9)
      expect(sum(r => r.scope === 2 && r.scope2_method !== 'market-based')).toBeCloseTo(f.totals.s2_location, 9)
      expect(sum(r => r.scope === 2 && (r.scope2_method === 'market-based' || r.stream === 'purchased_steam'))).toBeCloseTo(f.totals.s2_market, 9)
    })
  }

  it('locations_data is the raw locations: a document-backed figure is never stored', () => {
    const i = fixtures[0][1]
    const f = figuresForSave(i, 'AR6')
    expect(f.locations_data).toBe(i.locations)
    expect(f.locations_data[0].natural_gas_amount, 'stored as typed (0), not the derived 100').toBe(0)
    expect(deriveLocations(i)[0].natural_gas_amount).toBe(100)
    expect(f.totals.s1_total).toBeGreaterThan(0)
  })

  it('every figure comes from the same derivation as the screen', () => {
    const i = fixtures[1][1]
    const f = figuresForSave(i, 'AR6')
    expect(f.totals).toEqual(calcInventory(deriveLocations(i), 'AR6', 2025))
    expect(f.workings).toEqual(buildWorkings(deriveLocations(i), 'AR6', 2025, i.coverage_resolutions ?? [], 12))
    expect(f.pct_estimated).toBe(pctEstimated(i, 'AR6'))
    expect(f.derivation_version).toBe(DERIVATION_VERSION)
    expect(DERIVATION_VERSION).toBe(2)
  })

  it('a stale stored figure never reaches the saved totals', () => {
    const f = figuresForSave(fixtures[2][1], 'AR6')
    expect(f.totals.s1_total, 'the only bill is outside the year').toBe(0)
  })

  it('rejecting every bill after a save leaves no stale figure (the stored value was never the derived one)', () => {
    const confirmed = fixtures[0][1]
    const saved = figuresForSave(confirmed, 'AR6').locations_data
    const reopened = inv(saved.map(l => ({ ...l, source_docs: l.source_docs.map(d => ({ ...d, extracted: d.extracted!.map(p => ({ ...p, status: 'rejected' as const })) })) })))
    expect(figuresForSave(reopened, 'AR6').totals.s1_total).toBe(0)
  })
})
