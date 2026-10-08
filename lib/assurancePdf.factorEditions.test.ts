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
  generateAssurancePDF(inv as never, totals as never, fw as never, { ok: true, rows: [] } as never, srcs as never, [])
  return autoTable.mock.calls.map(c => c[1] as { head?: string[][]; body?: string[][] })
}

describe('assurance PDF: factor editions (T3c diff 3)', () => {
  // First saved on 1 June 2026, so the ECCC grid edition frozen is Table 5.3 (Table 5.4 was published 9 Sep 2026).
  const frozen = figuresForSave(base as never, 'AR6', { preparedOn: new Date(2026, 5, 1) }).factor_selection

  it('a Factor Editions table names the frozen edition, its rule, basis, dates and the day it was selected', () => {
    const t = tablesOf({ ...base, factor_selection: frozen }).find(x => x.head?.[0]?.[0] === 'Edition')!
    expect(t.head).toEqual([['Edition', 'Rule', 'Basis', 'Published', 'Corrected', 'Selected on']])
    const grid = t.body!.find(r => r[0] === 'ECCC Table 5.3 (NIR 1990-2023)')!
    expect([grid[1], grid[3], grid[5]]).toEqual(['Kept as selected when the inventory was first prepared', '24 October 2025', '1 June 2026'])
    expect(grid[2]).toContain('selected on 1 June 2026')
    // One row per edition, however many rows it priced.
    expect(new Set(t.body!.map(r => r.join('|'))).size).toBe(t.body!.length)
  })

  it('with nothing frozen, the edition is the one selected today, never the frozen one', () => {
    const t = tablesOf(base).find(x => x.head?.[0]?.[0] === 'Edition')!
    expect(t.body!.map(r => r[0])).toContain('ECCC Table 5.4 (NIR 1990-2024)')
    expect(t.body!.map(r => r[0])).not.toContain('ECCC Table 5.3 (NIR 1990-2023)')
  })

  it('the methods table carries the window and the factor-year rule, in the methodology page\'s words', () => {
    const rows = tablesOf({ ...base, factor_selection: frozen }).flatMap(x => x.body ?? [])
    const rule = rows.find(r => r[0] === 'Factor-year rule')!
    expect(rule[1]).toContain('the reporting window, 1 January 2026 to 31 December 2026')
    expect(rule[1]).toContain(FACTOR_YEAR_RULE_CLASS_B)
    expect(rule[1]).toContain(FACTOR_YEAR_NO_SUBSTITUTION)
    expect(rule[1]).not.toContain('\u2014')
  })
})
