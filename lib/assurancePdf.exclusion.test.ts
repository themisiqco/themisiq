import { describe, it, expect, vi } from 'vitest'

// THE ASSURANCE PACKAGE MUST SAY WHAT ITS TOTALS LEAVE OUT.
//
// ⚠️ THIS TEST EXISTS BECAUSE TASK 2a REMOVED THE THING THAT USED TO MAKE IT UNNECESSARY. Until
// 21 Sep 2026 pricingReady blocked every export while any location was excluded, so the Emissions
// Summary table was always whole and needed no caveat. Now a refusal the customer cannot clear lets
// the package through, and a verifier reading a short Scope 1 with nothing to explain it has been
// misled by omission. The statement is the whole safety argument for not blocking.

const text = vi.fn()
const splitTextToSize = vi.fn((s: string) => [s])
vi.mock('jspdf', () => ({
  default: class {
    internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } }
    lastAutoTable = { finalY: 200 }
    text = text
    splitTextToSize = splitTextToSize
    setFontSize = vi.fn(); setTextColor = vi.fn(); setFont = vi.fn(); setFillColor = vi.fn()
    setDrawColor = vi.fn(); setLineWidth = vi.fn(); rect = vi.fn(); line = vi.fn()
    addPage = vi.fn(); addImage = vi.fn(); save = vi.fn(); roundedRect = vi.fn()
    getNumberOfPages = () => 1; setPage = vi.fn()
  },
}))
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }))

import { generateAssurancePDF } from './assurancePdf'
import { EF_SOURCES } from './ghg/engine'

const loc = (name: string, country: string) => ({ name, country, source_docs: [] })
const inv = (locs: ReturnType<typeof loc>[]) => ({
  company_name: 'EFJ Test', reporting_year: 2025, revenue_millions: 0, employee_count: 0,
  boundary_approach: 'operational_control', selected_frameworks: ['sb253'], locations: locs,
})
const totals = { s1_total: 1.8231, s2_location: 0.885, s2_market: 0.885, co2: 0, ch4: 0, n2o: 0, biogenic: 0 }
const fw = [{ id: 'sb253', name: 'SB 253', full: 'SB 253', gwp: 'AR6', deadline: '2026' }]
const srcs = { combustion: EF_SOURCES.combustion, electricity: EF_SOURCES.electricity_us, gwp_ar6: EF_SOURCES.gwp_ar6 }
const run = (locs: ReturnType<typeof loc>[]) => {
  text.mockClear()
  generateAssurancePDF(inv(locs) as never, totals as never, fw as never, { ok: true, rows: [] } as never, srcs as never, [])
  return text.mock.calls.map(c => (Array.isArray(c[0]) ? c[0].join(' ') : String(c[0]))).join('\n')
}

describe('the assurance package states what its totals exclude', () => {
  it('names each excluded location and why, when one is refused', () => {
    const out = run([loc('Location A', 'GB'), loc('Location B', 'JP')])
    expect(out).toContain('Excluded from every figure above: 1 location.')
    // ⚠️ A FULL STOP AFTER THE NAME, NOT A COLON OR AN ARROW. This is a sentence a verifier reads,
    // not a label on a machine record.
    expect(out).toContain('Location B. No emission factor set is held')
    expect(out, 'no arrows, bullets or dashes in a printed sentence').not.toMatch(/[\u2190-\u21FF\u2022\u2013\u2014\u2192]/)
    expect(out).toContain('Location B')
    expect(out).toContain('No emission factor set is held')
    expect(out).toContain('(Japan)')
  })

  it('says nothing when nothing is excluded', () => {
    // A caveat on a whole report is its own kind of wrong: it invites a verifier to look for a
    // missing site that is not there.
    const out = run([loc('Location A', 'GB')])
    expect(out).not.toContain('Excluded from every figure above')
  })

  it('counts more than one, and names all of them', () => {
    const out = run([loc('A', 'GB'), loc('B', 'JP'), loc('C', 'OTHER'), loc('D', '')])
    expect(out).toContain('Excluded from every figure above: 3 locations')
    for (const n of ['B', 'C', 'D']) expect(out, n).toContain(n)
  })

  it('cites no publisher for a refused location', () => {
    // ⚠️ THE METHODOLOGY PAGE IS WHERE A US EPA CLAIM WOULD HAVE SURVIVED. combustionSource and
    // gridSource both end with the US citation for a country they do not recognise, and this page
    // is built from those two lists.
    const out = run([loc('B', 'JP')])
    expect(out).not.toContain('US EPA')
    expect(out).not.toContain('eGRID')
  })
})
