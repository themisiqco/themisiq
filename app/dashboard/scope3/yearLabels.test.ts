// app/dashboard/scope3/yearLabels.test.ts
//
// T3b diff b: Scope 3 takes the year end from the bound GHG inventory (scope3_inventories has no year columns) and
// labels the year from reportingYearLabel, as the GHG surfaces do. Read as source; values from the helpers.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { yearLabel, periodWords, reportingWindowIso } from '../../../lib/ghg/engine'

const PAGE = readFileSync(join(process.cwd(), 'app/dashboard/scope3/page.tsx'), 'utf8')

describe('Scope 3 year end and labels (T3b)', () => {
  it('a bound inventory with a March year end gets that year end; unbound is December', () => {
    expect(PAGE).toContain('const [yearEndMonth, setYearEndMonth] = useState(12)')
    expect(PAGE).toContain('setYearEndMonth(row.fiscal_year_end_month ?? 12)')
    // The bind reads the whole inventory row, so the year end is in it.
    expect(PAGE).toMatch(/\.from\('ghg_inventories'\)\s*\.select\('\*'\)\s*\.eq\('id', id\)/)
    expect(yearLabel(2025, 3).heading).toBe('Apr 2024 to Mar 2025')
  })

  it('the picker loads each inventory\'s year end and labels by it', () => {
    expect(PAGE).toContain(".select('id, company_name, reporting_year, fiscal_year_end_month, updated_at')")
    expect(PAGE).toContain("{(inv.company_name || 'Untitled')}, {yearLabel(inv.reporting_year, inv.fiscal_year_end_month).heading}</option>")
  })

  it('the CSV keeps "Reporting year" and adds "Reporting period" and "Year end"; the filename uses the fileTag', () => {
    expect(PAGE).toContain(`      ['Reporting year', reportingYear],
      // T3b: the window, so the year above is never read as a calendar year it is not.
      ['Reporting period', windowWords.period],
      ['Year end', windowWords.yearEnd],`)
    expect(PAGE).toContain('a.download = `${company}_Scope3_${yl.fileTag}.csv`')
    expect(periodWords(2025, 3)).toEqual({ period: '1 April 2024 to 31 March 2025', yearEnd: '31 March' })
    expect(`Acme_Scope3_${yearLabel(2025, 3).fileTag}.csv`).toBe('Acme_Scope3_2024-04_to_2025-03.csv')
    expect(`Acme_Scope3_${yearLabel(2025, 12).fileTag}.csv`, 'December unchanged').toBe('Acme_Scope3_2025.csv')
  })

  it('headings read the label; the spend request sends the window', () => {
    expect(PAGE).toContain("🔗 Linked to your {company || 'GHG'} {yl.heading} GHG inventory.")
    expect(PAGE).toContain('<div className="tq-summary-sub">{company} · {yl.heading} · GHG Protocol Scope 3 Standard</div>')
    expect(PAGE).toContain("{ label: 'Reporting year', val: yl.heading },")
    expect(PAGE).toContain('window_start: reportingWindowIso(reportingYear, yearEndMonth).start,')
    expect(PAGE).toContain('window_end: reportingWindowIso(reportingYear, yearEndMonth).end,')
    expect(reportingWindowIso(2025, 3)).toEqual({ start: '2024-04-01', end: '2025-03-31' })
    expect(reportingWindowIso(2024, 2)).toEqual({ start: '2023-03-01', end: '2024-02-29' })
  })
})
