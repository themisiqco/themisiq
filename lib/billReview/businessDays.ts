// lib/billReview/businessDays.ts
//
// BR5: "With our team, expected by {date}". Pure. Counts business days in Toronto, whatever the server's zone.
//
// Ruled 10 Oct 2026 (Q5, docs/review/design-derived-figures.md section 10):
//   - business days skip weekends and the listed holidays (lib/billReview/holidays.ts);
//   - day 0 is the day the bill was submitted, if that is a business day and the time in Toronto is before 15:00;
//     at or after 15:00:00, or on a weekend or holiday, day 0 is the next business day;
//   - a bill is expected by day 0 plus `days` business days (2 by default): Monday before 15:00 gives Wednesday.
// A day in a year with no holiday list is refused, never guessed.

import { HOLIDAYS, type Holiday } from './holidays'

export const TORONTO = 'America/Toronto'
/** The hour, Toronto time, from which a submission counts from the next business day. 15:00:00 exactly is after. */
export const CUTOFF_HOUR = 15

export type ExpectedBy =
  | { ok: true; date: string; day0: string }
  | { ok: false; reason: 'no_holiday_list'; year: number }
  | { ok: false; reason: 'invalid_time' }

const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: TORONTO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

/** The calendar date (yyyy-mm-dd) and hour in Toronto at an instant. Daylight saving is the time zone database's. */
export function torontoParts(at: Date): { date: string; hour: number } {
  const p = Object.fromEntries(PARTS.formatToParts(at).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

/** A calendar date moved by whole days. Calendar arithmetic only, in UTC, so no zone or clock change can shift it. */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const weekday = (date: string) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay() }

export function expectedBy(
  submittedAt: Date | string,
  days = 2,
  holidays: Readonly<Record<number, readonly Holiday[]>> = HOLIDAYS,
): ExpectedBy {
  const at = submittedAt instanceof Date ? submittedAt : new Date(submittedAt)
  if (Number.isNaN(at.getTime())) return { ok: false, reason: 'invalid_time' }
  const held = new Map<number, Set<string>>()
  let missing: number | null = null
  const isBusinessDay = (date: string): boolean => {
    const year = Number(date.slice(0, 4))
    if (!(year in holidays)) { missing ??= year; return false }
    if (!held.has(year)) held.set(year, new Set(holidays[year].map(h => h.date)))
    const wd = weekday(date)
    return wd !== 0 && wd !== 6 && !held.get(year)!.has(date)
  }
  const nextBusinessDay = (date: string): string => {
    let d = addDays(date, 1)
    while (!isBusinessDay(d)) { if (missing !== null) return d; d = addDays(d, 1) }
    return d
  }

  const { date, hour } = torontoParts(at)
  let day0 = date
  const sameDay = isBusinessDay(date) && hour < CUTOFF_HOUR
  if (missing !== null) return { ok: false, reason: 'no_holiday_list', year: missing }
  if (!sameDay) day0 = nextBusinessDay(date)
  let d = day0
  for (let i = 0; i < days && missing === null; i++) d = nextBusinessDay(d)
  if (missing !== null) return { ok: false, reason: 'no_holiday_list', year: missing }
  return { ok: true, date: d, day0 }
}
