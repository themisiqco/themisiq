// ── DATE RENDERING FOR REPORT SURFACES — ONE OWNER ──────────────────────────────────────────────
//
// Created 21 Aug 2026. Before it, three dialects rendered dates in this codebase and none matched
// what the board report's own type documents:
//
//   lib/ghg/engine.ts:1422          en-US long     "Jan 1, 2026 – Dec 31, 2026"
//   materiality/survey/[id]:231     en-GB short    "1 Jan"
//   materiality/survey/page.tsx:339 en-GB medium   "1 Jan 2026"
//   lib/materiality/boardReport.ts  documented     "1 January – 31 December 2026"   <- nothing produced it
//
// This module produces the fourth, because the fourth is the one a verifier-facing document was
// always specified to print. It does NOT replace the other three: the GHG engine's span is internal
// to coverage analysis and the survey ones are dense list UI. If those are ever unified, unify them
// onto this — do not fork this to suit them.
//
// ⚠️ NULL, NEVER ''. The four HTML report sites use `||` and lib/pdf/layout.ts uses `??`. An empty
// string falls back in the first and prints an EMPTY ROW in the second — the same value rendering
// two different ways on two surfaces of one report. Every function here returns null for absence.
//
// ⚠️ MONTH NAMES ARE HARDCODED, NOT Intl. Intl.DateTimeFormat depends on the runtime's ICU build,
// so the same assessment could render differently in the browser and in the Node process that makes
// the PDF. A compliance document must read identically wherever it is produced.
//
// ⚠️ UTC THROUGHOUT. A bare date has no timezone; reading a local one into it is how a year
// beginning 1 January renders as 31 December west of UTC.

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export type IsoDateParts = { y: number; m: number; d: number }

/**
 * A calendar date in the one form a Postgres `date` renders, or null.
 *
 * The round-trip through Date.UTC REFUSES an impossible day rather than rolling it forward:
 * `new Date("2026-02-30")` yields 2 March in some engines, which would print a day the undertaking
 * never stated.
 *
 * ⚠️ THIS IS THE ONE STRICT ISO PARSER. lib/materiality.ts periodStartYear calls it rather than
 * carrying its own — same contract, so one definition, per the exclusiveEnd() rule in CLAUDE.md.
 * Note the direction of the dependency: the legal module imports from here, not the reverse, and
 * this module must therefore stay free of anything ESRS-specific.
 */
export function parseIsoDateUTC(v: string | null | undefined): IsoDateParts | null {
  if (typeof v !== 'string') return null
  const m = ISO_DATE_RE.exec(v.trim())
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return { y, m: mo, d }
}

const dayMonth = (p: IsoDateParts) => `${p.d} ${MONTHS[p.m - 1]}`
const dayMonthYear = (p: IsoDateParts) => `${p.d} ${MONTHS[p.m - 1]} ${p.y}`

/**
 * Two dates as one span — "1 January – 31 December 2026".
 *
 * Three forms, in order of specificity:
 *   SAME DAY        "4 July 2026"                     — a span of one day is a date, not a range.
 *   SAME YEAR       "1 January – 31 December 2026"    — the year is stated once.
 *   CROSSING YEARS  "1 April 2026 – 31 March 2027"    — stated twice, and that is not decoration.
 *
 * The third form is the case the whole reporting-period rewrite exists for: a reader who cannot see
 * both years cannot tell which year the financial year began in, and that is what Articles 2 and 3
 * of C(2026) 5010 key on.
 *
 * The first form guards a state materiality_assessments cannot hold — its ..._order constraint
 * requires end > start — but this is a pure function in lib/ and a future caller is not bound by
 * that table's constraints. "4 July – 4 July 2026" would be this module's own defect, not the
 * caller's.
 *
 * NULL when either date is absent or unreadable — never a half-span, never ''.
 * En dash (U+2013), matching the format BoardReportInput documents.
 */
export function formatPeriodSpan(start: string | null, end: string | null): string | null {
  const s = parseIsoDateUTC(start)
  const e = parseIsoDateUTC(end)
  if (!s || !e) return null
  if (s.y === e.y && s.m === e.m && s.d === e.d) return dayMonthYear(s)
  return s.y === e.y ? `${dayMonth(s)} – ${dayMonthYear(e)}` : `${dayMonthYear(s)} – ${dayMonthYear(e)}`
}

/**
 * What a report PRINTS for the reporting period. Always a string.
 *
 * Three sources, in order:
 *   1. the two date columns, as a span;
 *   2. `legacyLabel` — workings.disclosure.reportingPeriod, the FY string every record written
 *      before 21 Aug 2026 carries. Printed AS STORED, never converted: "FY2027" cannot say which
 *      calendar year the year began in, and inventing 2027-01-01 from it is the exact inference the
 *      rewrite removed;
 *   3. 'Not stated'.
 *
 * ⚠️ 'Not stated', not 'Not specified'. The ESRS-version row sits directly beneath this one on the
 * same cover and already says 'Not stated' (materiality/report/page.tsx:541, lib/pdf/layout.ts:347).
 * Two adjacent rows wording the same kind of absence differently is a seam a reader will notice.
 */
export function reportingPeriodText(
  start: string | null,
  end: string | null,
  legacyLabel: string | null,
): string {
  const span = formatPeriodSpan(start, end)
  if (span !== null) return span
  const legacy = typeof legacyLabel === 'string' && legacyLabel.trim() !== '' ? legacyLabel.trim() : null
  return legacy ?? 'Not stated'
}

/**
 * One date, for a stored timestamp — "20 August 2026". Null when absent or unreadable.
 * Accepts a bare date or a full ISO timestamp, and reads the timestamp in UTC.
 */
export function formatReportDate(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  const bare = parseIsoDateUTC(v)
  if (bare) return dayMonthYear(bare)
  const t = Date.parse(v)
  if (Number.isNaN(t)) return null
  const dt = new Date(t)
  return dayMonthYear({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() })
}
