import { describe, it, expect } from 'vitest'
import {
  parseIsoDateUTC, formatPeriodSpan, reportingPeriodText, formatReportDate,
} from './reportDates'

// ------------------------------------------------------------------------------------------------
// The one owner of date rendering for report surfaces. These tests exist for two reasons beyond the
// obvious:
//
//   1. NULL IS A CONTRACT, NOT A DETAIL. The four HTML report sites use `||` and lib/pdf/layout.ts
//      uses `??`, so a returned '' would fall back on one surface and print an empty row on the
//      other -- the same assessment rendering two different ways on two pages of one report. A1x
//      asserts no path returns ''.
//   2. THE EXACT DOCUMENTED STRING. lib/materiality/boardReport.ts has said
//      `e.g. "1 January - 31 December 2026"` since before anything produced it. A1 pins that string
//      character for character, en dash included, because the type comment is the specification.
// ------------------------------------------------------------------------------------------------

describe('GROUP A -- formatPeriodSpan', () => {
  it('A1 same year -> the year is stated ONCE, exactly as BoardReportInput documents it', () => {
    expect(formatPeriodSpan('2026-01-01', '2026-12-31')).toBe('1 January – 31 December 2026')
  })

  it('A2 crossing years -> the year is stated TWICE. The UK April year, and the reason for all of this', () => {
    // A reader who cannot see both years cannot tell which year the financial year BEGAN in, and
    // that is what Articles 2 and 3 of C(2026) 5010 key on.
    expect(formatPeriodSpan('2026-04-01', '2027-03-31')).toBe('1 April 2026 – 31 March 2027')
  })

  it('A3 same day -> a single date, NOT a span of one day', () => {
    // materiality_assessments cannot hold this -- its ..._order constraint requires end > start --
    // but this is a pure function and a future caller is not bound by that table.
    expect(formatPeriodSpan('2026-07-04', '2026-07-04')).toBe('4 July 2026')
  })

  it('A4 the year collapses on the START only, never on the end', () => {
    const s = formatPeriodSpan('2026-01-01', '2026-12-31')
    expect(s).toContain('2026')
    expect(s!.match(/2026/g)).toHaveLength(1)
  })

  it('A5 a leap day survives both sides', () => {
    expect(formatPeriodSpan('2028-02-29', '2029-02-28')).toBe('29 February 2028 – 28 February 2029')
  })

  it('A6 end missing -> null, never a half-span', () => {
    expect(formatPeriodSpan('2026-01-01', null)).toBeNull()
  })

  it('A7 start missing -> null', () => {
    expect(formatPeriodSpan(null, '2026-12-31')).toBeNull()
  })

  it('A8 both missing -> null', () => {
    expect(formatPeriodSpan(null, null)).toBeNull()
  })

  it('A9 blank and whitespace-only -> null, not an empty span', () => {
    expect(formatPeriodSpan('', '')).toBeNull()
    expect(formatPeriodSpan('  ', '  ')).toBeNull()
  })

  it('A10 an impossible day -> null, NOT rolled forward to 2 March', () => {
    expect(formatPeriodSpan('2026-02-30', '2026-12-31')).toBeNull()
  })

  it('A11 an FY label -> null. The old input form is not silently accepted', () => {
    expect(formatPeriodSpan('FY2026', 'FY2026')).toBeNull()
  })

  it('A12 NO PATH RETURNS AN EMPTY STRING -- the `||` vs `??` hazard', () => {
    const paths = [
      formatPeriodSpan('', ''),
      formatPeriodSpan(null, null),
      formatPeriodSpan('nonsense', 'nonsense'),
      formatPeriodSpan('2026-01-01', null),
    ]
    for (const p of paths) expect(p).toBeNull()
    expect(paths.some(p => p === '')).toBe(false)
  })
})

describe('GROUP B -- reportingPeriodText', () => {
  it('B1 the columns win over the legacy label when both exist', () => {
    expect(reportingPeriodText('2026-01-01', '2026-12-31', 'FY2026')).toBe('1 January – 31 December 2026')
  })

  it('B2 no columns -> the stored FY label, PRINTED AS STORED and never converted', () => {
    // "FY2027" cannot say which calendar year the year began in. Deriving 2027-01-01 from it is the
    // exact inference the reporting-period rewrite removed, so the label is reprinted verbatim.
    expect(reportingPeriodText(null, null, 'FY2025')).toBe('FY2025')
  })

  it('B3 a blank legacy label is absence, not a value', () => {
    expect(reportingPeriodText(null, null, '   ')).toBe('Not stated')
    expect(reportingPeriodText(null, null, '')).toBe('Not stated')
  })

  it('B4 nothing at all -> "Not stated", matching the ESRS-version row beneath it', () => {
    expect(reportingPeriodText(null, null, null)).toBe('Not stated')
  })

  it('B5 a half-filled pair falls through to the legacy label, never to a partial span', () => {
    expect(reportingPeriodText('2026-01-01', null, 'FY2026')).toBe('FY2026')
    expect(reportingPeriodText(null, '2026-12-31', null)).toBe('Not stated')
  })

  it('B6 ALWAYS a non-empty string -- this one is rendered directly, with no caller fallback', () => {
    const cases: Array<[string | null, string | null, string | null]> = [
      ['2026-01-01', '2026-12-31', 'FY2026'],
      [null, null, 'FY2025'],
      [null, null, null],
      ['', '', ''],
      ['nonsense', 'nonsense', '  '],
    ]
    for (const [s, e, l] of cases) {
      const out = reportingPeriodText(s, e, l)
      expect(typeof out).toBe('string')
      expect(out.length).toBeGreaterThan(0)
    }
  })
})

describe('GROUP C -- formatReportDate', () => {
  it('C1 a full ISO timestamp -- what frozen_at actually holds', () => {
    expect(formatReportDate('2026-08-20T14:33:12.123Z')).toBe('20 August 2026')
  })

  it('C2 a bare date', () => {
    expect(formatReportDate('2026-08-20')).toBe('20 August 2026')
  })

  it('C3 null and blank -> null', () => {
    expect(formatReportDate(null)).toBeNull()
    expect(formatReportDate(undefined)).toBeNull()
    expect(formatReportDate('')).toBeNull()
    expect(formatReportDate('   ')).toBeNull()
  })

  it('C4 unreadable -> null, never a partial or an Invalid Date string', () => {
    expect(formatReportDate('nope')).toBeNull()
  })

  it('C5 a timestamp is read in UTC, not in the local zone', () => {
    // 23:30 UTC is already the NEXT day east of UTC and still the same day west of it. Pinning UTC
    // is what stops the same record printing two different dates on two machines.
    expect(formatReportDate('2026-08-20T23:30:00.000Z')).toBe('20 August 2026')
    expect(formatReportDate('2026-08-20T00:30:00.000Z')).toBe('20 August 2026')
  })
})

describe('GROUP D -- parseIsoDateUTC, the one strict parser', () => {
  it('D1 a valid date yields its parts', () => {
    expect(parseIsoDateUTC('2026-04-01')).toEqual({ y: 2026, m: 4, d: 1 })
  })

  it('D2 an impossible day is REFUSED, not rolled forward', () => {
    expect(parseIsoDateUTC('2026-02-30')).toBeNull()
    expect(parseIsoDateUTC('2026-13-01')).toBeNull()
    expect(parseIsoDateUTC('2027-02-29')).toBeNull()
  })

  it('D3 non-string input is null, never a throw', () => {
    expect(parseIsoDateUTC(null)).toBeNull()
    expect(parseIsoDateUTC(undefined)).toBeNull()
    expect(parseIsoDateUTC(2026 as unknown as string)).toBeNull()
    expect(parseIsoDateUTC(new Date() as unknown as string)).toBeNull()
  })

  it('D4 surrounding whitespace is trimmed; unpadded components are not accepted', () => {
    expect(parseIsoDateUTC('  2026-04-01  ')).toEqual({ y: 2026, m: 4, d: 1 })
    expect(parseIsoDateUTC('2026-4-1')).toBeNull()
  })
})
