import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportingYearOptions, defaultReportingYear, REPORTING_YEAR_FLOOR } from './reportingYears'

// THE LITERAL THAT COULD NOT REACH THE CURRENT YEAR.
//
// The wizard offered `[2023, 2024, 2025]` and defaulted new inventories to `2024`, both hardcoded.
// By August 2026 a customer could not create an inventory for the year they were reporting, and the
// engine held ECCC 2026 grid factors nothing could be built to use. Three facts about "now", frozen
// at the moment someone typed them.
//
// ⚠️ THE ROLLOVER TEST IS THE POINT OF THIS FILE. Everything else here would also pass against a
// cleverly-written constant. Only T5, which moves the system clock into the next year and asserts the
// range and the default BOTH follow, distinguishes "computed from the clock" from "computed once".
// If you are deleting or skipping a test in this file, do not make it that one.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

// Same contract as gridDisplay.test.ts: absent anchor throws, ambiguous anchor throws. A guard that
// silently picks the first of several matches reports on code nobody asked about.
const lineContaining = (anchor: string): string => {
  const hits = src.split('\n').filter(l => l.includes(anchor))
  if (hits.length === 0) throw new Error(`no line containing '${anchor}' in ${PAGE} — the call site moved or was renamed`)
  if (hits.length > 1) throw new Error(`'${anchor}' matches ${hits.length} lines in ${PAGE} — anchor is ambiguous`)
  return hits[0]
}

// Fixed dates rather than the real clock, so these assert the RULE and cannot themselves go stale.
const jan = (y: number) => new Date(y, 0, 1, 12)
const dec = (y: number) => new Date(y, 11, 31, 12)

afterEach(() => { vi.useRealTimers() })

describe('reporting years are computed from the clock, never hardcoded', () => {
  it('T1 the range includes the current year and excludes the next one', () => {
    for (const y of [2025, 2026, 2027, 2031]) {
      const opts = reportingYearOptions(jan(y))
      expect(opts, `${y}: current year must be selectable`).toContain(y)
      expect(opts, `${y}: a year that has not finished cannot be reported`).not.toContain(y + 1)
      expect(opts[0], `${y}: newest first`).toBe(y)
    }
  })

  it('T2 the floor is 2023 whatever the date', () => {
    for (const d of [jan(2023), dec(2024), jan(2030), dec(2099)]) {
      const opts = reportingYearOptions(d)
      expect(Math.min(...opts), `${d.getFullYear()}`).toBe(2023)
      expect(opts.at(-1)).toBe(REPORTING_YEAR_FLOOR)
      expect(opts).not.toContain(2022)
    }
    expect(REPORTING_YEAR_FLOOR, 'raise this only when the factor tables gain earlier rows').toBe(2023)
  })

  it('T3 the default is the last COMPLETE year, and is always selectable', () => {
    for (const y of [2025, 2026, 2027, 2040]) {
      const d = jan(y)
      expect(defaultReportingYear(d), `${y}`).toBe(y - 1)
      expect(reportingYearOptions(d), `${y}: default must be in the list`).toContain(defaultReportingYear(d))
    }
  })

  it('T4 in the floor year the default clamps up rather than falling off the list', () => {
    // Current year 2023 → last complete year is 2022, which is below the floor. The default must not
    // be a value the select cannot show; deriving it from the options list makes that impossible.
    const d = jan(2023)
    expect(reportingYearOptions(d)).toEqual([2023])
    expect(defaultReportingYear(d)).toBe(2023)
    expect(reportingYearOptions(d)).toContain(defaultReportingYear(d))
  })

  it('T5 ROLLOVER — on 1 Jan the range and the default both move, with no code change', () => {
    // THE GUARD THAT MATTERS. Both callers in page.tsx invoke these with no argument, so this asserts
    // the no-arg path reads the system clock rather than anything captured at import.
    const WHY =
      'REPORTING YEARS DID NOT FOLLOW THE CLOCK. This is the defect the hardcoded [2023, 2024, 2025] ' +
      'had: a list that was correct when written and silently wrong a year later, so customers could ' +
      'not create an inventory for the year they were reporting. If this fails, something has been ' +
      'frozen at import time again — check for a module-level const in lib/ghg/reportingYears.ts.'

    vi.useFakeTimers()

    vi.setSystemTime(new Date(2026, 5, 15, 12))     // mid-2026
    expect(reportingYearOptions(), WHY).toEqual([2026, 2025, 2024, 2023])
    expect(defaultReportingYear(), WHY).toBe(2025)

    vi.setSystemTime(new Date(2027, 0, 1, 0, 30))   // 1 Jan 2027, half an hour in
    expect(reportingYearOptions(), WHY).toEqual([2027, 2026, 2025, 2024, 2023])
    expect(defaultReportingYear(), WHY).toBe(2026)

    // And once more, to show it is not a one-step trick.
    vi.setSystemTime(new Date(2028, 0, 1, 0, 30))
    expect(reportingYearOptions()[0], WHY).toBe(2028)
    expect(defaultReportingYear(), WHY).toBe(2027)
  })

  it('T6 descending, contiguous, no duplicates', () => {
    const opts = reportingYearOptions(jan(2030))
    expect(opts).toEqual([...opts].sort((a, b) => b - a))
    expect(new Set(opts).size).toBe(opts.length)
    for (let i = 1; i < opts.length; i++) expect(opts[i - 1] - opts[i]).toBe(1)
  })

  // ── THE CALL SITES ────────────────────────────────────────────────────────────────────────────
  it('T7 the wizard select maps the computed range, not a literal', () => {
    expect(lineContaining('.map(yr => (')).toContain('reportingYearOptions()')
    expect(src, 'the retired literal must not come back').not.toContain('[2023, 2024, 2025]')
  })

  it('T8 both new-inventory defaults call the helper', () => {
    const defaults = src.split('\n').filter(l => l.includes("company_name: '', company_id: null, reporting_year:"))
    expect(defaults, 'expected exactly two new-inventory initialisers').toHaveLength(2)
    for (const l of defaults) {
      expect(l).toContain('reporting_year: defaultReportingYear()')
      expect(l, 'a hardcoded default is what put new inventories two years behind').not.toMatch(/reporting_year: \d{4}/)
    }
  })

  it('T9 scans a real file — a moved call site fails loudly instead of passing vacuously', () => {
    expect(src.length, `${PAGE} looks empty`).toBeGreaterThan(10_000)
    expect(src).toContain("from '../../../lib/ghg/reportingYears'")
    expect(() => lineContaining('.map(yr => (')).not.toThrow()
  })
})
