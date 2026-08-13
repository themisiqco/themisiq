// ── WHICH REPORTING YEARS A GHG INVENTORY MAY USE ────────────────────────────────────────────────
//
// The wizard's year selector was the literal `[2023, 2024, 2025]`, and the new-inventory default was
// the literal `2024`, written twice. Three hardcoded facts about "now", none of which moved when now
// did: by August 2026 the selector could not offer the current year, and a new inventory opened two
// years behind. The engine had ECCC 2026 grid factors seeded that no inventory could be created to use.
//
// A LITERAL CANNOT GO STALE IF IT IS NOT A LITERAL. Both rules are computed from the clock here, in
// one place, so there is nothing to remember to bump. reportingYears.test.ts fakes the system date
// forward to prove they actually move — that test is the thing standing between this file and a
// second generation of the same defect.
//
// TAKES `now` AS A PARAMETER, defaulting to new Date(). Two reasons, both load-bearing:
//   - a module-level `const` would freeze at import and be immune to a faked clock, so the rollover
//     test could not test anything;
//   - callers that need a specific date (a backfill, a test) can pass one without stubbing globals.

// FLOOR — the earliest year the factor tables can price without resolving forward.
// 2023 is the earliest ECCC applicability set seeded in EF_CA, and the US (eGRID2023) and EU (EEA
// 2023) grid tables key on 2023 with no earlier row. Below 2023 every lookup hits the `years[0]`
// initialiser in getGridFactor and resolves FORWARD — applying a later factor to an earlier year.
// That is disclosed on the row ("earliest vintage held") rather than silent, but disclosure is not a
// reason to offer a year we cannot price properly. Raise this only when the tables gain earlier rows.
export const REPORTING_YEAR_FLOOR = 2023

/**
 * Selectable reporting years, NEWEST FIRST — floor 2023 through the current calendar year.
 *
 * The ceiling is the CURRENT year, not the next one: an inventory for a year that has not finished
 * cannot be complete, and the wizard has no concept of a partial year. A customer reporting FY2026 in
 * January 2027 selects 2026, which is `defaultReportingYear` anyway.
 */
export function reportingYearOptions(now: Date = new Date()): number[] {
  const top = Math.max(now.getFullYear(), REPORTING_YEAR_FLOOR)
  const out: number[] = []
  for (let y = top; y >= REPORTING_YEAR_FLOOR; y--) out.push(y)
  return out
}

/**
 * The year a NEW inventory starts on: the last COMPLETE year.
 *
 * Derived from reportingYearOptions rather than computed independently, so "the default is always
 * selectable" is true by construction instead of by two functions agreeing. In the floor year itself
 * (current year 2023, so `current - 1` is 2022) it clamps up to the only option there is.
 */
export function defaultReportingYear(now: Date = new Date()): number {
  const options = reportingYearOptions(now)
  const lastComplete = now.getFullYear() - 1
  return options.includes(lastComplete) ? lastComplete : options[0]
}
