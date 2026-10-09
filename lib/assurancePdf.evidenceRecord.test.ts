import { describe, it, expect, vi } from 'vitest'

// T18 diff 4 (pulled forward from T17, as ruled 9 Oct 2026): the assurance package prints the document and location
// record after the source document index: every document withdrawn, restored, deleted or deleted unused, and every
// location deleted from the inventory, with the sentences the saved workings and the verifier page carry. Nothing is
// printed when there is no record.

const autoTable = vi.fn()
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } }
    lastAutoTable = { finalY: 200 }
    text = vi.fn(); save = vi.fn()
    splitTextToSize = (s: string) => [s]
    setFontSize = vi.fn(); setTextColor = vi.fn(); setFont = vi.fn(); setFillColor = vi.fn()
    setDrawColor = vi.fn(); setLineWidth = vi.fn(); rect = vi.fn(); line = vi.fn()
    addPage = vi.fn(); addImage = vi.fn(); roundedRect = vi.fn()
    getNumberOfPages = () => 1; setPage = vi.fn()
  },
}))
vi.mock('jspdf-autotable', () => ({ default: (...a: unknown[]) => autoTable(...a) }))

import { generateAssurancePDF } from './assurancePdf'
import { EF_SOURCES, type DocumentEvent, type LocationEvent } from './ghg/engine'

const BY = { userId: 'u-1', email: 'jo@acme.example' }
const AT = '2026-10-09T10:00:00.000Z'
const withdrawn: DocumentEvent = { kind: 'withdrawn', docId: 'd1', file: 'gas-jan.pdf', at: AT, by: BY, reason: 'Duplicate upload' }
const unused: DocumentEvent = { kind: 'deleted_unused', docId: 'd2', file: 'scan.pdf', documentType: 'utility_bill_gas', uploadedAt: AT, sha256: null, at: AT, by: BY }
const leeds: LocationEvent = { kind: 'location_deleted', locationId: 'L2', name: 'Leeds', country: 'GB', at: AT, by: BY, documents: [] }
const inv = (o: object = {}) => ({
  company_name: 'Acme', reporting_year: 2025, fiscal_year_end_month: 12, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', selected_frameworks: ['sb253'], locations: [{ name: 'Site A', country: 'GB', source_docs: [] }], ...o,
})
const totals = { s1_total: 1, s2_location: 1, s2_market: 1, co2: 0, ch4: 0, n2o: 0, biogenic: 0 }
const fw = [{ id: 'sb253', name: 'SB 253', full: 'SB 253', gwp: 'AR6', deadline: '2026' }]
const srcs = { combustion: EF_SOURCES.combustion, electricity: EF_SOURCES.electricity_us, gwp_ar6: EF_SOURCES.gwp_ar6 }
const recordTable = (i: object) => {
  autoTable.mockClear()
  generateAssurancePDF(i as never, totals as never, fw as never, { ok: true, rows: [] } as never, srcs as never)
  return autoTable.mock.calls.map(c => c[1] as { head?: string[][]; body?: string[][] }).find(t => t.head?.[0]?.[1] === 'Document and location record')
}

describe('assurance PDF: the document and location record (T18)', () => {
  it('each document event by its location, then each deleted location, in the engine\'s words', () => {
    const t = recordTable(inv({ locations: [{ name: 'Site A', country: 'GB', source_docs: [], document_log: [withdrawn, unused] }], location_log: [leeds] }))
    expect(t?.body).toEqual([
      ['Site A', 'gas-jan.pdf was withdrawn by jo@acme.example on 9 October 2026: Duplicate upload. It is kept as evidence and not counted.'],
      ['Site A', 'scan.pdf was deleted by jo@acme.example on 9 October 2026. Nothing from it had been used.'],
      ['Leeds (deleted)', 'Leeds (United Kingdom) was deleted by jo@acme.example on 9 October 2026. It held no documents.'],
    ])
  })
  it('no record, no table', () => {
    expect(recordTable(inv())).toBeUndefined()
  })
})
