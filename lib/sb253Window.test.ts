// lib/sb253Window.test.ts
//
// T3b diff b: the SB 253 "Scope 3 not required" banner is decided from the reporting window's end date against
// section 96076(c), not from the year number. The old test, `year <= 2024`, showed the banner for 2024 and earlier
// and not for the 2025 inventory the first report actually covers.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  sb253FirstReportBanner, SB253_FIRST_REPORT_WINDOW_END_AFTER, SB253_FIRST_REPORT_WINDOW_END_ON_OR_BEFORE,
  SB253_FIRST_REPORT_WINDOW_STATUS, SB253_FIRST_REPORT_DATE, SB253_FIRST_REPORT_DATE_ISO, SB253_WINDOW_STATUS_WORDS,
  SB253_ELECTION_BANNER,
} from './sb253'
import { reportingWindowIso, isoDateInWords } from './ghg/engine'

const banner = (year: number, endMonth: number) => sb253FirstReportBanner(reportingWindowIso(year, endMonth).end)

describe('SB 253 first-report window (T3b)', () => {
  it('the two constants are the section 96076(c) cutoffs: after 1 February 2025, on or before 1 February 2026', () => {
    expect(SB253_FIRST_REPORT_WINDOW_END_AFTER).toBe('2025-02-01')
    expect(SB253_FIRST_REPORT_WINDOW_END_ON_OR_BEFORE).toBe('2026-02-01')
    const src = readFileSync(join(process.cwd(), 'lib/sb253.ts'), 'utf8')
    // The cited text sits beside them: the cutoff and both limbs of (c).
    expect(src).toContain('"If the reporting entity’s fiscal year ends on or before February 1"')
    expect(src).toContain('"the fiscal year ending in the previous calendar year"')
    expect(src).toContain('"their most recent preceding fiscal year" ... "where that data is available"')
    expect(src).toContain('Final%20Regulation%20Order_Final.pdf')
  })

  it('shows for reporting year 2025 at every year end from February to December, and for a January 2026 year end', () => {
    for (let m = 2; m <= 12; m++) expect(banner(2025, m), `2025, month ${m}`).toBe('first_report')
    expect(banner(2026, 1)).toBe('first_report')
  })

  it('does not show for reporting year 2024, nor for a January 2025 year end', () => {
    for (let m = 1; m <= 12; m++) expect(banner(2024, m), `2024, month ${m}`).toBeNull()
    expect(banner(2025, 1)).toBeNull()
  })

  it('the optional election, section 96076(c)(2): a window ending after 1 February 2026 and by the first-report date', () => {
    expect(banner(2026, 3)).toBe('election')
    expect(banner(2026, 10)).toBe('election')
    expect(banner(2026, 11), 'ends 30 November 2026, after the first-report date').toBeNull()
    expect(banner(2026, 12)).toBeNull()
    expect(SB253_ELECTION_BANNER).toBe("If you choose to file this year as your first SB 253 report, Scope 3 isn't required in it.")
  })

  it('names the proposed status, and the first-report date in both forms is the same day', () => {
    expect(SB253_FIRST_REPORT_WINDOW_STATUS).toBe('proposed')
    expect(SB253_WINDOW_STATUS_WORDS).toBe('(proposed regulation, not yet final)')
    expect(isoDateInWords(SB253_FIRST_REPORT_DATE_ISO)).toBe(SB253_FIRST_REPORT_DATE)
  })

  it('the GHG export page decides the banner from the window, and the old year test is gone', () => {
    const page = readFileSync(join(process.cwd(), 'app/dashboard/ghg/page.tsx'), 'utf8')
    expect(page).not.toContain('year <= 2024')
    expect(page).toContain('const sb253Banner = sb253Only ? sb253FirstReportBanner(reportingWindowIso(inventory.reporting_year, inventory.fiscal_year_end_month).end) : null')
    expect(page).toContain("{sb253Banner === 'first_report' ? 'SB 253: Scope 3 not required for your first reporting year' : SB253_ELECTION_BANNER} {SB253_WINDOW_STATUS_WORDS}")
    for (const s of [SB253_ELECTION_BANNER, SB253_WINDOW_STATUS_WORDS]) expect(s).not.toContain('\u2014')
  })
})
