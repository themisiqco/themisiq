import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportingYearOptions, defaultReportingYear, REPORTING_YEAR_FLOOR } from './reportingYears'

// THE LITERAL THAT COULD NOT REACH THE CURRENT YEAR.
//
// The GHG wizard offered `[2023, 2024, 2025]` and defaulted new inventories to `2024`, both hardcoded.
// By August 2026 a customer could not create an inventory for the year they were reporting, and the
// engine held ECCC 2026 grid factors nothing could be built to use. Three facts about "now", frozen
// at the moment someone typed them.
//
// The same defect was live in six other modules until September 2026 — supply chain, the supplier
// portal, people, cyber, AI governance and scope 3 each carried their own literal list and their own
// literal default, written at different times and wrong by different amounts. They now all call this
// module, each passing the floor its own subject matter justifies, and the scans at the bottom of
// this file assert that for every one of them by reading the actual source.
//
// ⚠️ THE ROLLOVER TEST IS THE POINT OF THIS FILE. Everything else here would also pass against a
// cleverly-written constant. Only T5, which moves the system clock into the next year and asserts the
// range and the default BOTH follow, distinguishes "computed from the clock" from "computed once".
// If you are deleting or skipping a test in this file, do not make it that one.

const ROOT = process.cwd()

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

  it('T2 the default floor is 2023 whatever the date', () => {
    for (const d of [jan(2023), dec(2024), jan(2030), dec(2099)]) {
      const opts = reportingYearOptions(d)
      expect(Math.min(...opts), `${d.getFullYear()}`).toBe(2023)
      expect(opts.at(-1)).toBe(REPORTING_YEAR_FLOOR)
      expect(opts).not.toContain(2022)
    }
    expect(REPORTING_YEAR_FLOOR, 'raise this only when the factor tables gain earlier rows').toBe(2023)
  })

  it('T2b an explicit floor replaces the default, in both directions', () => {
    // The floor argument exists because REPORTING_YEAR_FLOOR is a fact about GHG EMISSION FACTORS and
    // about nothing else. A module with no factor tables has no business inheriting it, in either
    // direction: 2022 is legitimate for a pay-gap history, 2024 is legitimate for the EU AI Act.
    for (const d of [jan(2026), dec(2027), jan(2031)]) {
      for (const floor of [2020, 2022, 2023, 2024]) {
        const opts = reportingYearOptions(d, floor)
        expect(opts.at(-1), `${d.getFullYear()} floor ${floor}`).toBe(floor)
        expect(opts, `${d.getFullYear()} floor ${floor}: nothing below the floor`).not.toContain(floor - 1)
        expect(opts[0], `${d.getFullYear()} floor ${floor}: top still follows the clock`).toBe(d.getFullYear())
        expect(opts, 'the default must be selectable under any floor').toContain(defaultReportingYear(d, floor))
      }
    }
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

  it('T4b the clamp holds for an explicit floor too', () => {
    // The AI-governance case, concretely: in calendar 2024 the last complete year is 2023, which is
    // below that module's floor of 2024. A default the select cannot show is the same bug as before,
    // reintroduced one argument later.
    expect(reportingYearOptions(jan(2024), 2024)).toEqual([2024])
    expect(defaultReportingYear(jan(2024), 2024)).toBe(2024)
    for (const floor of [2022, 2023, 2024]) {
      const d = jan(floor)
      expect(reportingYearOptions(d, floor), `floor ${floor}`).toEqual([floor])
      expect(defaultReportingYear(d, floor), `floor ${floor}`).toBe(floor)
    }
  })

  it('T5 ROLLOVER — on 1 Jan the range and the default both move, with no code change', () => {
    // THE GUARD THAT MATTERS. GHG's two callers invoke these with no argument, so this asserts the
    // no-arg path reads the system clock rather than anything captured at import.
    const WHY =
      'REPORTING YEARS DID NOT FOLLOW THE CLOCK. This is the defect the hardcoded [2023, 2024, 2025] ' +
      'had: a list that was correct when written and silently wrong a year later, so customers could ' +
      'not create an inventory for the year they were reporting. If this fails, something has been ' +
      'frozen at import time again — check for a module-level const in lib/reportingYears.ts.'

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

    // A floored caller must roll over too. Passing an argument is exactly the kind of change that
    // quietly reintroduces a captured value, so assert the floored path against the same clock.
    expect(reportingYearOptions(new Date(), 2024), WHY).toEqual([2028, 2027, 2026, 2025, 2024])
    expect(defaultReportingYear(new Date(), 2024), WHY).toBe(2027)
  })

  it('T6 descending, contiguous, no duplicates, under any floor', () => {
    for (const floor of [undefined, 2022, 2024]) {
      const opts = reportingYearOptions(jan(2030), floor)
      expect(opts).toEqual([...opts].sort((a, b) => b - a))
      expect(new Set(opts).size).toBe(opts.length)
      for (let i = 1; i < opts.length; i++) expect(opts[i - 1] - opts[i]).toBe(1)
    }
  })
})

// ── THE CALL SITES ──────────────────────────────────────────────────────────────────────────────
//
// Seven pages, scanned as source. This is the half of the file that makes the fix durable: the unit
// tests above prove the helper is correct, and prove nothing at all about whether anyone calls it.
// Every module that offers a reporting year belongs in this table. Adding one without adding it here
// is how the next literal gets in.

interface Caller {
  page: string
  /** Expected `const YEAR_FLOOR` in the page, or null for the module that uses the library default. */
  floor: number | null
  /** Relative specifier the page must import by — asserted so a file move fails here, loudly. */
  importPath: string
  /** How many times the two helpers are called in total. A dropped call site changes this. */
  calls: number
  /** Literals this page used to carry. They must not come back. */
  retired: string[]
}

const CALLERS: Caller[] = [
  { page: 'app/dashboard/ghg/page.tsx',                     floor: null, importPath: '../../../lib/reportingYears',    calls: 3, retired: ['[2023, 2024, 2025]'] },
  { page: 'app/dashboard/scope3/page.tsx',                   floor: 2023, importPath: '../../../lib/reportingYears',    calls: 2, retired: ['[2022, 2023, 2024, 2025]'] },
  { page: 'app/dashboard/supply-chain/page.tsx',             floor: 2023, importPath: '../../../lib/reportingYears',    calls: 5, retired: ['[2023, 2024, 2025]'] },
  { page: 'app/dashboard/supply-chain/portal/page.tsx',      floor: 2023, importPath: '../../../../lib/reportingYears', calls: 3, retired: ['[2023, 2024, 2025]'] },
  { page: 'app/dashboard/people/page.tsx',                   floor: 2022, importPath: '../../../lib/reportingYears',    calls: 3, retired: ['[2022, 2023, 2024, 2025]'] },
  { page: 'app/dashboard/cyber/page.tsx',                    floor: 2024, importPath: '../../../lib/reportingYears',    calls: 3, retired: ['[2024, 2025, 2026]'] },
  { page: 'app/dashboard/ai-governance/page.tsx',             floor: 2024, importPath: '../../../lib/reportingYears',    calls: 3, retired: ['[2024, 2025, 2026]'] },
]

// A year literal being ASSIGNED as a reporting year: `reporting_year: 2024`, `reportingYear = 2025`,
// `data.reporting_year || 2024`, `num(o.reporting_year, 2024)`. Deliberately narrow — the GHG page
// prints factor-edition labels such as "eGRID 2023" and "DCCEEW NGA 2025" on lines that also read
// `inventory.reporting_year`, and those are citations of a real published table, not defaults. A scan
// that flagged them would be turned off within the month, which is worse than a scan that is narrow.
const ASSIGNED_YEAR = /reporting_?[yY]ear[^,\n]{0,4}[:=][^,\n]*?\b(19|20)\d{2}\b/
const YEAR_ARRAY = /\[\s*(19|20)\d{2}\s*(,\s*(19|20)\d{2}\s*)+\]/
const HELPER_ARG = /reporting_?[yY]ear\s*,\s*(19|20)\d{2}\b/

describe('every module that offers a reporting year computes it', () => {
  for (const c of CALLERS) {
    describe(c.page, () => {
      const src = readFileSync(join(ROOT, c.page), 'utf8')
      const linesWith = (re: RegExp) =>
        src.split('\n').map((l, i) => `${i + 1}: ${l.trim()}`).filter((_, i) => re.test(src.split('\n')[i]))

      it('T7 the year select maps the computed range, not a literal', () => {
        // The option list is the surface a customer actually sees. One `<select>` per page, and the
        // mapped expression must be the helper call itself, not a variable that could hold anything.
        const all = src.split('\n')
        const at = all.map((l, i) => [l, i] as const).filter(([l]) => /reportingYearOptions\(/.test(l) && /\.map\(/.test(l))
        expect(at, `expected exactly one mapped year select in ${c.page}`).toHaveLength(1)
        const [line, i] = at[0]
        // GHG's map body spans several lines; every other module's is one. Look at the whole JSX block.
        expect(all.slice(i, i + 6).join('\n'), 'the mapped body must render the options').toContain('<option')
        if (c.floor !== null) expect(line, "the select must use this module's floor").toContain('YEAR_FLOOR')
      })

      it('T8 no hardcoded reporting year survives anywhere in the file', () => {
        expect(linesWith(ASSIGNED_YEAR), 'a year literal assigned as a reporting year').toEqual([])
        expect(linesWith(HELPER_ARG), 'a year literal passed as a reporting-year fallback').toEqual([])
        expect(linesWith(YEAR_ARRAY), 'a hardcoded list of years').toEqual([])
        for (const lit of c.retired) {
          expect(src, `the retired literal ${lit} must not come back`).not.toContain(lit)
        }
      })

      it('T9 scans a real file — a moved call site fails loudly instead of passing vacuously', () => {
        expect(src.length, `${c.page} looks empty — the path moved and this scan is testing nothing`).toBeGreaterThan(5_000)
        expect(src, 'import path — update this table if the file moves').toContain(`from '${c.importPath}'`)

        const calls = (src.match(/\b(reportingYearOptions|defaultReportingYear)\(/g) ?? []).length
        expect(calls, `expected ${c.calls} helper calls in ${c.page}; a dropped one means a year went back to a literal`).toBe(c.calls)

        if (c.floor === null) {
          expect(src, 'this module uses the library floor and must not declare its own').not.toContain('YEAR_FLOOR')
        } else {
          const decl = src.split('\n').filter(l => /^const YEAR_FLOOR\s*=/.test(l))
          expect(decl, `expected exactly one YEAR_FLOOR declaration in ${c.page}`).toHaveLength(1)
          expect(decl[0], 'the floor changed — the comment above it must still be the reason').toBe(`const YEAR_FLOOR = ${c.floor}`)
        }
      })
    })
  }
})
