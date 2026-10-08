// lib/ghg/reportingYear.ts
//
// THE REPORTING WINDOW AND ITS LABELS (T3a, T3b), moved out of lib/ghg/engine.ts in T3c diff 2 so the factor edition
// registry can use them without importing the engine (which imports the registry). engine.ts re-exports every name
// here, so existing imports keep working. Pure; imports only the date words.

import { dateInWords } from './dateWords'

// Derive the reporting period from a reporting year + fiscal year-end MONTH (1-12).
// 12 (December) -> Jan 1 – Dec 31 of the reporting year (calendar year, the default).
// Any other month -> the 12 months ENDING on the last day of that month in the reporting year.
// The last day is computed leap-year-aware (e.g. a February end resolves to 28 or 29 correctly).
export function periodFromYearAndEnd(reportingYear: number, fiscalYearEndMonth: number = 12): { start: Date; end: Date; label: string } {
  const m = (fiscalYearEndMonth >= 1 && fiscalYearEndMonth <= 12) ? fiscalYearEndMonth : 12
  const end = new Date(reportingYear, m, 0) // day 0 of the next month = last day of month m (leap-aware)
  const start = new Date(end)
  start.setDate(start.getDate() + 1)
  start.setFullYear(start.getFullYear() - 1)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  return { start, end, label: `${fmt(start)} – ${fmt(end)}` }
}
// The reporting year as a customer reads it, built from the window periodFromYearAndEnd returns (`end` is the
// last day IN the year), never from reporting_year and a month. THE ONE PLACE THIS LABEL IS BUILT (T3a, T3b).
// "FY2024" was ambiguous for a non-December year end (the year ending in 2024, or the one starting in it), so
// a non-December year is named by its window. No form uses "FY" or "YE".
//   heading (menus, tiles, headings): December '2025'; otherwise 'Apr 2024 to Mar 2025', the first and last months.
//   axis (chart axes only):           December '2025'; otherwise '2024–25' (an en dash, axes only).
//   fileTag (filenames):              December '2025'; otherwise '2024-04_to_2025-03'.
//   inText (running text):            December 'reporting year 2025'; otherwise 'the year ending 31 March 2025'.
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export interface ReportingYearLabel { heading: string; axis: string; fileTag: string; inText: string }
export function reportingYearLabel(win: { start: Date; end: Date }): ReportingYearLabel {
  const s = win.start, e = win.end
  if (e.getMonth() === 11 && e.getDate() === 31) {
    const y = String(e.getFullYear())
    return { heading: y, axis: y, fileTag: y, inText: `reporting year ${y}` }
  }
  const mon = (d: Date) => MONTH_NAMES[d.getMonth()].slice(0, 3)
  const mm = (d: Date) => String(d.getMonth() + 1).padStart(2, '0')
  return {
    heading: `${mon(s)} ${s.getFullYear()} to ${mon(e)} ${e.getFullYear()}`,
    axis: `${s.getFullYear()}\u2013${String(e.getFullYear()).slice(-2)}`,
    fileTag: `${s.getFullYear()}-${mm(s)}_to_${e.getFullYear()}-${mm(e)}`,
    inText: `the year ending ${e.getDate()} ${MONTH_NAMES[e.getMonth()]} ${e.getFullYear()}`,
  }
}
/** T3b: the window in words, for the "Reporting period" and "Year end" rows and the field hint:
 *  period '1 April 2024 to 31 March 2025', yearEnd '31 March'. Dates in words, as everywhere a date is shown (T10c). */
export function reportingPeriodWords(win: { start: Date; end: Date }): { period: string; yearEnd: string } {
  return { period: `${dateInWords(win.start)} to ${dateInWords(win.end)}`, yearEnd: `${win.end.getDate()} ${MONTH_NAMES[win.end.getMonth()]}` }
}
/** T3b diff b: the window as inclusive yyyy-mm-dd dates, in local time, for a request that carries it (the Scope 3
 *  spend-factor route). Built from periodFromYearAndEnd, so the window has one definition. */
export function reportingWindowIso(reportingYear: number, fiscalYearEndMonth?: number | null): { start: string; end: string } {
  const w = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth ?? 12)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { start: iso(w.start), end: iso(w.end) }
}
/** T3b: the window in words for a stored reporting_year and fiscal_year_end_month (null or missing is December). */
export const periodWords = (reportingYear: number, fiscalYearEndMonth?: number | null) =>
  reportingPeriodWords(periodFromYearAndEnd(reportingYear, fiscalYearEndMonth ?? 12))
/** T3b: the label for a stored reporting_year and fiscal_year_end_month (null or missing is December). */
export const yearLabel = (reportingYear: number, fiscalYearEndMonth?: number | null): ReportingYearLabel =>
  reportingYearLabel(periodFromYearAndEnd(reportingYear, fiscalYearEndMonth ?? 12))
