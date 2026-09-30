// lib/s211/financialYear.ts
// Which financial year an S-211 report covers, from the entity's year end and the reporting year.
//
// Public Safety Canada's questionnaire asks for the "Financial reporting year: Identify the financial
// year for which the report is being submitted, which should be the entity's previous financial year
// ending before May 31" (S211_GUIDANCE_FINANCIAL_YEAR). So: the most recent financial year that ends
// BEFORE May 31 of the reporting year, where the reporting year is the year the report is due by May 31.
//   A March 31 year end, reporting in 2026: the year ending March 31, 2026.
//   A December 31 year end, reporting in 2026: the year ending December 31, 2025.
//
// ⚠️ A MAY 31 YEAR END IS NOT ASSUMED. "Ending before May 31" excludes a year ending ON May 31 of the
// reporting year, so the rule gives the year ending May 31 of the year before. That reading is shown to
// the user as a question, with the reason, and the user confirms or corrects it. `askUser` says so.

export type DerivedFinancialYear = {
  /** ISO dates, inclusive. */
  start: string
  end: string
  /** True for a May 31 year end: show the result as a question, not as settled. */
  askUser: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/**
 * @param yearEndMonth 1 to 12
 * @param yearEndDay   1 to 31. A day past the end of the month (February 29 in a common year) is read
 *                     as the month's last day.
 * @param reportingYear the year the report is due, by May 31
 * Returns null for input that is not a date.
 */
export function deriveFinancialYear(yearEndMonth: number, yearEndDay: number, reportingYear: number): DerivedFinancialYear | null {
  if (![yearEndMonth, yearEndDay, reportingYear].every(Number.isInteger)) return null
  if (yearEndMonth < 1 || yearEndMonth > 12 || yearEndDay < 1 || yearEndDay > 31 || reportingYear < 1900) return null
  // Ends before May 31 of the reporting year: in that year. Otherwise: the year before.
  const beforeMay31 = yearEndMonth < 5 || (yearEndMonth === 5 && yearEndDay < 31)
  const endYear = beforeMay31 ? reportingYear : reportingYear - 1
  const endDay = Math.min(yearEndDay, lastDayOf(endYear, yearEndMonth))
  // The year starts the day after the previous year end.
  const prevEndDay = Math.min(yearEndDay, lastDayOf(endYear - 1, yearEndMonth))
  const start = new Date(Date.UTC(endYear - 1, yearEndMonth - 1, prevEndDay + 1))
  return {
    start: iso(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
    end: iso(endYear, yearEndMonth, endDay),
    askUser: yearEndMonth === 5 && yearEndDay === 31,
  }
}

export const MAY_31_QUESTION =
  'Your financial year ends on May 31. The guidance describes the reporting year as the previous financial year "ending before May 31", which would mean the year ending May 31 of last year, not this year. Please confirm which financial year this report covers.'
