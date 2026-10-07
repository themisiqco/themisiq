// app/dashboard/ghg/yearLabels.test.ts
//
// T3b diff a: the GHG surfaces label the reporting year from reportingYearLabel. The page builds its labels inline,
// so the wiring is read as source (as runthroughUx.test.ts does) and the values come from the helper itself.
// December reads as before; a March year end reads "Apr 2024 to Mar 2025" (headings), "2024–25" (axes),
// "2024-04_to_2025-03" (filenames) and "the year ending 31 March 2025" (running text).

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))
vi.mock('../../../lib/supabase', () => ({ supabase: {} }))

import { yearLabel, periodWords } from '../../../lib/ghg/engine'
import { describeYearStatus, describeScope3Basis, type SeriesYear } from '../../../lib/ghg/series'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')
const PAGE = read('app/dashboard/ghg/page.tsx')
const TRENDS = read('app/dashboard/ghg/trends/page.tsx')
const VERIFY = read('app/verify/[token]/page.tsx')

describe('GHG wizard labels (T3b)', () => {
  it('one label, one prior-year label and one window for the page, all from the helper', () => {
    expect(PAGE).toContain('const yl = yearLabel(inventory.reporting_year, inventory.fiscal_year_end_month)')
    expect(PAGE).toContain('const priorYl = yearLabel(inventory.reporting_year - 1, inventory.fiscal_year_end_month)')
    expect(PAGE).toContain('const windowWords = periodWords(inventory.reporting_year, inventory.fiscal_year_end_month)')
  })

  it('March year end: the values each surface prints', () => {
    const yl = yearLabel(2025, 3), prior = yearLabel(2024, 3), w = periodWords(2025, 3)
    expect([yl.heading, yl.axis, yl.fileTag, yl.inText]).toEqual(['Apr 2024 to Mar 2025', '2024–25', '2024-04_to_2025-03', 'the year ending 31 March 2025'])
    expect(prior.heading, 'prior year: the year ending March 2024').toBe('Apr 2023 to Mar 2024')
    expect(`Sum of the bills covering ${w.period}`).toBe('Sum of the bills covering 1 April 2024 to 31 March 2025')
    expect(w.yearEnd).toBe('31 March')
  })

  it('December year end: unchanged on every surface ("2025", "reporting year 2025")', () => {
    const yl = yearLabel(2025, 12)
    expect([yl.heading, yl.axis, yl.fileTag, yl.inText]).toEqual(['2025', '2025', '2025', 'reporting year 2025'])
    expect(yearLabel(2024, 12).heading).toBe('2024')
  })

  it('duplicate alert, dropdown, prior-year fields, activity fields and hint, subtitle, preview tile', () => {
    expect(PAGE).toContain('You already have an inventory for ${yl.inText} for "${inventory.company_name}".')
    // The dropdown shows the heading form only: no second date range, no second date style.
    expect(PAGE).toContain('<option key={yr} value={yr}>{yearLabel(yr, inventory.fiscal_year_end_month).heading}</option>')
    expect(PAGE).not.toMatch(/periodFromYearAndEnd\(yr, inventory\.fiscal_year_end_month\)\.label/)
    expect(PAGE).not.toMatch(/FY\$\{yr\}/)
    expect(PAGE.match(/Prior year Scope [12] \(\$\{priorYl\.heading\}\) tCO₂e/g)).toHaveLength(4)    // two fields, two CDP rows
    expect(PAGE.match(/>Prior year Scope [12] \(\{priorYl\.heading\}\)</g)).toHaveLength(2)          // two review tiles
    for (const f of ['Total natural gas: ', 'Total propane purchased: ', 'Total diesel in stationary equipment: ', 'Total heating oil purchased: ',
      'Total heavy fuel oil purchased: ', 'Total electricity: ', 'Total purchased steam: ']) expect(PAGE, f).toContain('label={`' + f + '${yl.heading}')
    expect(PAGE.match(/hint=\{`Sum of the bills covering \$\{windowWords\.period\}`\}/g)).toHaveLength(2)
    expect(PAGE).toContain("`Your complete GHG inventory for ${inventory.company_name || 'your company'}, ${yl.heading}.`")
    expect(PAGE).toContain("['Reporting year', yl.heading],")
  })

  it('the framework CSV keeps "Reporting year" and adds "Reporting period" and "Year end"; CDP rows and the filename use the labels', () => {
    expect(PAGE).toContain(`      ['Reporting year', inventory.reporting_year],
      // T3b: the window, so the year above is never read as a calendar year it is not.
      ['Reporting period', windowWords.period],
      ['Year end', windowWords.yearEnd],`)
    // One header builds every framework's file, CDP included.
    expect(PAGE.match(/\['Reporting period', windowWords\.period\]/g)).toHaveLength(1)
    expect(PAGE).toContain("[`Prior year Scope 1 (${priorYl.heading}) tCO₂e`, inventory.prior_year_s1],")
    expect(PAGE).toContain("_${yl.fileTag}.csv`")
  })

  it('the inventory list loads each year end and labels by it', () => {
    expect(PAGE).toContain(".select('id, company_name, reporting_year, fiscal_year_end_month, updated_at')")
    expect(PAGE).toContain('>Reporting year {yearLabel(inv.reporting_year, inv.fiscal_year_end_month).heading} · Updated')
  })
})

describe('Trends labels (T3b)', () => {
  const y = (fiscal: number, o: Partial<SeriesYear> = {}) =>
    ({ year: 2025, label: yearLabel(2025, fiscal), yearEndMonth: fiscal, dataStatus: 'unverifiable', unverifiableReason: null, exclusions: [], ...o }) as unknown as SeriesYear

  it('headings and callouts read the year\'s label; both chart axes use the axis form', () => {
    expect(TRENDS).toContain("const labelFor = (y: number) => selected?.years.find((r) => r.year === y)?.label ?? yearLabel(y)")
    expect(TRENDS).toContain('Baseline year {labelFor(selected.baselineYear).heading}')
    expect(TRENDS).toContain(": `tCO₂e · Scope 1+2 · ${latest.label.heading}`}")
    expect(TRENDS.match(/tickFormatter=\{\(y: number\) => labelFor\(y\)\.axis\}/g)).toHaveLength(2)
    expect(TRENDS).toContain("<option key={y.year} value={y.year}>{y.label.heading}</option>")
    expect(TRENDS).toContain("y.scope3Basis === 'absent').map((y) => y.label.heading)")
  })

  it('series sentences: March reads the window, December reads as before', () => {
    expect(describeYearStatus(y(3))).toMatch(/^Apr 2024 to Mar 2025 isn't shown: /)
    expect(describeYearStatus(y(12))).toMatch(/^2025 isn't shown: /)
    expect(describeScope3Basis(y(3, { dataStatus: 'ok', scope3Basis: 'not_recorded' }))).toMatch(/^Apr 2024 to Mar 2025's Scope 3 figure/)
  })
})

describe('verifier header (T3b)', () => {
  it('shows the heading and the window dates', () => {
    expect(VERIFY).toContain('Reporting year {yearLabel(inv.reporting_year, inv.fiscal_year_end_month).heading} ({periodWords(inv.reporting_year, inv.fiscal_year_end_month).period}) · {frameworks')
    const header = (m: number | null) => `Reporting year ${yearLabel(2025, m).heading} (${periodWords(2025, m).period})`
    expect(header(3)).toBe('Reporting year Apr 2024 to Mar 2025 (1 April 2024 to 31 March 2025)')
    expect(header(null)).toBe('Reporting year 2025 (1 January 2025 to 31 December 2025)')
  })
})
