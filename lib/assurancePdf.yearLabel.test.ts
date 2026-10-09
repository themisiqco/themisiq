import { describe, it, expect, vi } from 'vitest'

// T3b diff a: the assurance package names the reporting year by its window. The cover and the methods table
// carry the label and a "Reporting period" row; the document ref and the filename use the label's fileTag, so a
// year ending in March 2025 is never filed as "2025". December reads as it did.

const text = vi.fn()
const save = vi.fn()
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } }
    lastAutoTable = { finalY: 200 }
    text = text
    save = save
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
import { EF_SOURCES } from './ghg/engine'

const inv = (fiscal_year_end_month: number) => ({
  company_name: 'Acme', reporting_year: 2025, fiscal_year_end_month, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', selected_frameworks: ['sb253'], locations: [{ name: 'Site', country: 'GB', source_docs: [] }],
})
const totals = { s1_total: 1, s2_location: 1, s2_market: 1, co2: 0, ch4: 0, n2o: 0, biogenic: 0 }
const fw = [{ id: 'sb253', name: 'SB 253', full: 'SB 253', gwp: 'AR6', deadline: '2026' }]
const srcs = { combustion: EF_SOURCES.combustion, electricity: EF_SOURCES.electricity_us, gwp_ar6: EF_SOURCES.gwp_ar6 }
const run = (m: number) => {
  text.mockClear(); save.mockClear(); autoTable.mockClear()
  generateAssurancePDF(inv(m) as never, totals as never, fw as never, { ok: true, rows: [] } as never, srcs as never)
  const cover = text.mock.calls.map(c => (Array.isArray(c[0]) ? c[0].join(' ') : String(c[0])))
  const tables = autoTable.mock.calls.flatMap(c => ((c[1] as { body?: unknown[][] }).body ?? []).map(r => r.map(String)))
  return { cover, tables, file: String(save.mock.calls[0]?.[0]) }
}

describe('assurance PDF: the reporting year by its window (T3b)', () => {
  it('March year end: the cover and methods table show the heading and the period; ref and filename use the fileTag', () => {
    const { cover, tables, file } = run(3)
    const i = cover.indexOf('REPORTING YEAR')
    expect(cover[i + 1]).toBe('Apr 2024 to Mar 2025')
    const j = cover.indexOf('REPORTING PERIOD')
    expect(cover[j + 1]).toBe('1 April 2024 to 31 March 2025')
    expect(cover.find(t => t.startsWith('TIQ-GHG-'))).toMatch(/^TIQ-GHG-2024-04_to_2025-03-\d{6}$/)
    expect(tables).toContainEqual(['Reporting year', 'Apr 2024 to Mar 2025'])
    expect(tables).toContainEqual(['Reporting period', '1 April 2024 to 31 March 2025'])
    expect(file).toBe('ThemisIQ_Assurance_Acme_2024-04_to_2025-03.pdf')
  })

  it('December year end reads as before, with the period added', () => {
    const { cover, tables, file } = run(12)
    expect(cover[cover.indexOf('REPORTING YEAR') + 1]).toBe('2025')
    expect(cover.find(t => t.startsWith('TIQ-GHG-'))).toMatch(/^TIQ-GHG-2025-\d{6}$/)
    expect(tables).toContainEqual(['Reporting year', '2025'])
    expect(tables).toContainEqual(['Reporting period', '1 January 2025 to 31 December 2025'])
    expect(file).toBe('ThemisIQ_Assurance_Acme_2025.pdf')
  })
})
