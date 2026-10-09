import { describe, it, expect, vi } from 'vitest'

// T3c diff 3: the assurance package names each edition the inventory was priced with, the rule that chose it and
// why, its dates, and the day a class (b) edition was selected; the methods table gains the window and the rule.

const text = vi.fn()
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } }
    lastAutoTable = { finalY: 200 }
    text = text
    save = vi.fn()
    splitTextToSize = (s: string) => [s]
    setFontSize = vi.fn(); setTextColor = vi.fn(); setFont = vi.fn(); setFillColor = vi.fn()
    setDrawColor = vi.fn(); setLineWidth = vi.fn(); rect = vi.fn(); line = vi.fn()
    addPage = vi.fn(); addImage = vi.fn(); roundedRect = vi.fn()
    getNumberOfPages = () => 1; setPage = vi.fn()
  },
}))
const autoTable = vi.fn()
vi.mock('jspdf-autotable', () => ({ default: (...a: unknown[]) => autoTable(...a) }))

import { generateAssurancePDF } from './assurancePdf'
import { EF_SOURCES, emptyLocation, type Location } from './ghg/engine'
import { figuresForSave } from './ghg/savePayload'
import { FACTOR_YEAR_NO_SUBSTITUTION, FACTOR_YEAR_RULE_CLASS_B } from './ghg/factorEditionRegistry'
import { FACTOR_EDITION_DISCLOSURE } from './ghg/factorEditions'
import { buildComparabilityDisclosure, buildComparabilityRecord, FACTOR_EDITION_SCOPE_NOTE } from './ghg/comparability'
import { compareFactorEditions } from './ghg/factorEditionComparison'
import { selectionContextFor } from './ghg/factorSelection'

const ON = { ...emptyLocation('on', 'Toronto'), country: 'CA', province: 'ON', grid_region: 'ON', electricity_kwh: 10000 } as Location
const base = {
  company_name: 'Acme', company_id: null, reporting_year: 2026, fiscal_year_end_month: 12, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', california_nexus: false, coverage_resolutions: [], prior_year_s1: 0, prior_year_s2: 0,
  selected_frameworks: ['sb253'], locations: [ON],
}
const totals = { s1_total: 1, s2_location: 1, s2_market: 1, co2: 0, ch4: 0, n2o: 0, biogenic: 0 }
const fw = [{ id: 'sb253', name: 'SB 253', full: 'SB 253', gwp: 'AR6', deadline: '2026' }]
const srcs = { combustion: EF_SOURCES.combustion, electricity: EF_SOURCES.electricity_us, gwp_ar6: EF_SOURCES.gwp_ar6 }
const tablesOf = (inv: object) => {
  autoTable.mockClear()
  generateAssurancePDF(inv as never, totals as never, fw as never, { ok: true, rows: [] } as never, srcs as never)
  return autoTable.mock.calls.map(c => c[1] as { head?: string[][]; body?: string[][] })
}

describe('assurance PDF: factor editions (T3c diff 3)', () => {
  // First saved on 1 June 2026, so the ECCC grid edition frozen is Table 5.3 (Table 5.4 was published 9 Sep 2026).
  const frozen = figuresForSave(base as never, 'AR6', { preparedOn: new Date(2026, 5, 1) }).factor_selection

  // T17: the package prints the editions the STORED workings record, as a save writes them; it selects nothing itself.
  const stored = (inv: object) => ({ ...inv, workings: figuresForSave(inv as never, 'AR6').workings })

  it('a Factor Editions table names the frozen edition, its rule, basis, dates and the day it was selected', () => {
    const t = tablesOf(stored({ ...base, factor_selection: frozen })).find(x => x.head?.[0]?.[0] === 'Edition')!
    expect(t.head).toEqual([['Edition', 'Rule', 'Basis', 'Published', 'Corrected', 'Selected on']])
    const grid = t.body!.find(r => r[0] === 'ECCC Table 5.3 (NIR 1990-2023)')!
    expect([grid[1], grid[3], grid[5]]).toEqual(['Kept as selected when the inventory was first prepared', '24 October 2025', '1 June 2026'])
    expect(grid[2]).toContain('selected on 1 June 2026')
    // One row per edition, however many rows it priced.
    expect(new Set(t.body!.map(r => r.join('|'))).size).toBe(t.body!.length)
  })

  it('with nothing frozen, the edition is the one the save selected, never the frozen one', () => {
    const t = tablesOf(stored(base)).find(x => x.head?.[0]?.[0] === 'Edition')!
    expect(t.body!.map(r => r[0])).toContain('ECCC Table 5.4 (NIR 1990-2024)')
    expect(t.body!.map(r => r[0])).not.toContain('ECCC Table 5.3 (NIR 1990-2023)')
  })

  it('the methods table carries the window and the factor-year rule, in the methodology page\'s words', () => {
    const rows = tablesOf(stored({ ...base, factor_selection: frozen })).flatMap(x => x.body ?? [])
    const rule = rows.find(r => r[0] === 'Factor-year rule')!
    expect(rule[1]).toContain('the reporting window, 1 January 2026 to 31 December 2026')
    expect(rule[1]).toContain(FACTOR_YEAR_RULE_CLASS_B)
    expect(rule[1]).toContain(FACTOR_YEAR_NO_SUBSTITUTION)
    expect(rule[1]).not.toContain('\u2014')
  })

  // F-06: the comparability section, from the saved record, with the factor editions that changed.
  it('a Comparability section prints the record\'s lines, the edition change and FACTOR_EDITION_DISCLOSURE; none without a record', () => {
    const UK = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', electricity_kwh: 10000 } as Location
    const p = figuresForSave({ ...base, reporting_year: 2025, locations: [UK] } as never, 'AR6', { preparedOn: new Date(2026, 5, 1) })
    const cur = { ...base, locations: [UK] }
    const fe = compareFactorEditions({ locations: [UK], reporting_year: 2026, fiscal_year_end_month: 12, coverage_resolutions: [] },
      selectionContextFor(cur as never, new Date(2026, 9, 8)),
      { locations: [UK], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [], factor_selection: p.factor_selection,
        factor_editions: p.factor_editions, workings: p.workings, updated_at: '2026-06-01T12:00:00Z' })
    const sum = { locationCount: 1, fuelTypes: ['electricity'], jurisdictions: ['GB'], boundaryApproach: 'operational_control' }
    const d = buildComparabilityDisclosure({ priorScope1: null, priorScope2: null, thisScope1: 0, thisScope2: 1, priorYearState: 'clean',
      priorSummary: sum, thisSummary: sum, factorEditions: fe })!
    const rec = buildComparabilityRecord({ capture: { observations: d.observations.map(o => o.text), question: d.question, answer: 'nothing_changed',
      basis: d.basis, answeredAt: '2026-10-08T00:00:00Z' }, note: '', priorYearLookupFailed: false, current: d, checkedAt: '2026-10-08T00:00:00Z' })
    text.mockClear()
    const t = tablesOf({ ...cur, comparability_disclosure: rec }).find(x => x.head?.[0]?.[0]?.startsWith('Year-on-year comparability'))!
    const rows = t.body!.map(r => r[0])
    expect(rows.some(r => r.startsWith('Emission factors changed between reporting year 2025 and reporting year 2026: UK DESNZ grid electricity factors, DEFRA 2025 to DEFRA 2026.'))).toBe(true)
    expect(rows.slice(-2)).toEqual([FACTOR_EDITION_DISCLOSURE.changed!.detail, FACTOR_EDITION_SCOPE_NOTE])
    expect(rows.join(' ')).not.toContain('₂')
    expect(text.mock.calls.map(c => String(c[0]))).toContain('Comparability with 2025')
    expect(tablesOf(cur).some(x => x.head?.[0]?.[0]?.startsWith('Year-on-year comparability'))).toBe(false)
  })

  // F-06, unanswered (Lisa, 8 Oct 2026): the edition change is the platform's finding, so it prints without an answer.
  it('unanswered: the edition lines and FACTOR_EDITION_DISCLOSURE still print, and no company answer is invented', () => {
    const UK = { ...emptyLocation('uk', 'Leeds'), country: 'GB', grid_region: 'UK', electricity_kwh: 10000 } as Location
    const p = figuresForSave({ ...base, reporting_year: 2025, locations: [UK] } as never, 'AR6', { preparedOn: new Date(2026, 5, 1) })
    const cur = { ...base, locations: [UK] }
    const cmp = compareFactorEditions({ locations: [UK], reporting_year: 2026, fiscal_year_end_month: 12, coverage_resolutions: [] },
      selectionContextFor(cur as never, new Date(2026, 9, 8)),
      { locations: [UK], reporting_year: 2025, fiscal_year_end_month: 12, coverage_resolutions: [], factor_selection: p.factor_selection,
        factor_editions: p.factor_editions, workings: p.workings, updated_at: '2026-06-01T12:00:00Z' })
    text.mockClear()
    const tables = tablesOf({ ...cur, comparability_disclosure: null, factor_edition_comparison: cmp })
    const t = tables.find(x => x.head?.[0]?.[0]?.startsWith('Emission factor editions, compared by the platform'))!
    const rows = t.body!.map(r => r[0])
    expect(rows).toEqual([
      'Emission factors changed between reporting year 2025 and reporting year 2026: UK DESNZ grid electricity factors, DEFRA 2025 to DEFRA 2026. ' +
        `Pricing this year's activity at last year's factors would give ${rows[0].match(/give ([\d.]+) tCO2e/)![1]} tCO2e more in Scope 2 (location-based) and ${rows[0].match(/and ([\d.]+) tCO2e/)![1]} tCO2e more in Scope 2 (market-based).`,
      FACTOR_EDITION_DISCLOSURE.changed!.detail,
      FACTOR_EDITION_SCOPE_NOTE,
    ])
    expect(rows.join(' ')).not.toMatch(/The company states|has not been answered/)
    expect(tables.some(x => x.head?.[0]?.[0]?.startsWith('Year-on-year comparability'))).toBe(false)
    expect(text.mock.calls.map(c => String(c[0]))).toContain('Comparability with 2025')
    // A comparison that found nothing (consistent) prints no section.
    expect(tablesOf({ ...cur, factor_edition_comparison: { ...cmp, changes: [], state: 'consistent', disclosure: null } })
      .some(x => x.head?.[0]?.[0]?.startsWith('Emission factor editions, compared'))).toBe(false)
  })
})
