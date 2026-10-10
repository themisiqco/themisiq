// lib/billReview/businessDays.test.ts
//
// BR5: the expected date. Instants are written in UTC with the Toronto time they are, so each case states which side
// of daylight saving it is on (EST is UTC-5, EDT is UTC-4).

import { describe, it, expect, afterEach } from 'vitest'
import { expectedBy, torontoParts } from './businessDays'

const by = (utc: string, days?: number) => { const r = expectedBy(utc, days); if (!r.ok) throw new Error(JSON.stringify(r)); return r.date }
const ORIGINAL_TZ = process.env.TZ
afterEach(() => { if (ORIGINAL_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIGINAL_TZ })

describe('BR5: two business days, day 0 being the submission day', () => {
  it('Monday gives Wednesday; Thursday gives Monday; Friday gives Tuesday', () => {
    expect(by('2026-10-19T14:00:00Z')).toBe('2026-10-21')   // Mon 10:00 EDT
    expect(by('2026-10-15T14:00:00Z')).toBe('2026-10-19')   // Thu 10:00 EDT
    expect(by('2026-10-16T14:00:00Z')).toBe('2026-10-20')   // Fri 10:00 EDT
  })
  it('a holiday inside the window pushes the date by one day (Thanksgiving, Mon 12 Oct 2026)', () => {
    expect(by('2026-10-08T14:00:00Z')).toBe('2026-10-13')   // Thu: Fri, (Mon holiday), Tue
  })
  it('Christmas and Boxing Day with a weekend between, and the substitute Monday (2026)', () => {
    expect(by('2026-12-24T15:00:00Z')).toBe('2026-12-30')   // Thu 10:00 EST: (Fri 25, Sat, Sun, Mon 28 substitute) Tue 29, Wed 30
  })
  it('both 2027 substitutes, Mon 27 and Tue 28 Dec', () => {
    expect(by('2027-12-23T15:00:00Z')).toBe('2027-12-29')   // Thu: Fri 24, (Sat, Sun, Mon 27, Tue 28) Wed 29
  })
  it('the year boundary, with New Year’s Day', () => {
    expect(by('2026-12-30T15:00:00Z')).toBe('2027-01-04')   // Wed: Thu 31, (Fri 1 Jan, weekend) Mon 4
    expect(by('2027-12-30T15:00:00Z')).toBe('2028-01-04')   // Thu: Fri 31, (Sat 1 Jan, Sun, Mon 3 substitute) Tue 4
  })
  it('a holiday on the submission day: the next business day is day 0', () => {
    expect(by('2026-10-12T13:00:00Z')).toBe('2026-10-15')   // Thanksgiving 09:00 EDT: day 0 Tue 13, so Thu 15
  })
  it('Easter Monday and the Civic Holiday are skipped, as ruled', () => {
    expect(by('2026-04-02T14:00:00Z')).toBe('2026-04-08')   // Thu: (Good Friday, weekend, Easter Monday) Tue 7, Wed 8
    expect(by('2026-07-31T14:00:00Z')).toBe('2026-08-05')   // Fri: (weekend, Civic Holiday Mon 3) Tue 4, Wed 5
  })
  it('a weekend submission counts from Monday', () => {
    expect(by('2026-10-17T16:00:00Z')).toBe('2026-10-21')   // Sat noon: day 0 Mon 19, so Wed 21
  })
})

describe('BR5: the 15:00 cut-off, in Toronto time, across both daylight-saving changes', () => {
  // 2026: clocks go forward Sun 8 Mar, back Sun 1 Nov.
  it('before the March change (EST, UTC-5): 14:59:59 is the same day, 15:00:00 exactly is after', () => {
    expect(by('2026-03-06T19:59:59Z')).toBe('2026-03-10')   // Fri 14:59:59 EST: day 0 Fri
    expect(by('2026-03-06T20:00:00Z')).toBe('2026-03-11')   // Fri 15:00:00 EST: day 0 Mon 9
  })
  it('after the March change (EDT, UTC-4)', () => {
    expect(by('2026-03-09T18:59:59Z')).toBe('2026-03-11')   // Mon 14:59:59 EDT
    expect(by('2026-03-09T19:00:00Z')).toBe('2026-03-12')   // Mon 15:00:00 EDT
  })
  it('one UTC clock time falls either side of the cut-off, depending on the side of the change', () => {
    expect(torontoParts(new Date('2026-03-06T19:30:00Z')).hour).toBe(14)   // EST
    expect(torontoParts(new Date('2026-03-09T19:30:00Z')).hour).toBe(15)   // EDT
  })
  it('before the November change (EDT) and after it (EST)', () => {
    expect(by('2026-10-30T18:59:59Z')).toBe('2026-11-03')   // Fri 14:59:59 EDT
    expect(by('2026-10-30T19:00:00Z')).toBe('2026-11-04')   // Fri 15:00:00 EDT
    expect(by('2026-11-02T19:59:59Z')).toBe('2026-11-04')   // Mon 14:59:59 EST
    expect(by('2026-11-02T20:00:00Z')).toBe('2026-11-05')   // Mon 15:00:00 EST
  })
  it('the date is Toronto’s, not UTC’s: 23:30 Toronto on Monday is Tuesday 03:30 UTC', () => {
    expect(torontoParts(new Date('2026-10-20T03:30:00Z'))).toEqual({ date: '2026-10-19', hour: 23 })
    expect(by('2026-10-20T03:30:00Z')).toBe('2026-10-22')   // after 15:00 Monday: day 0 Tue 20
  })
  it('the same answers whatever the server’s zone', () => {
    const cases = ['2026-03-06T19:59:59Z', '2026-03-06T20:00:00Z', '2026-11-02T20:00:00Z', '2026-10-20T03:30:00Z', '2026-12-24T15:00:00Z']
    const expected = cases.map(c => by(c))
    for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
      process.env.TZ = tz
      expect(cases.map(c => by(c)), tz).toEqual(expected)
    }
  })
})

describe('BR5: a year with no holiday list is refused, never guessed', () => {
  it('a submission in an unlisted year', () => {
    expect(expectedBy('2029-03-01T15:00:00Z')).toEqual({ ok: false, reason: 'no_holiday_list', year: 2029 })
    expect(expectedBy('2025-12-01T15:00:00Z')).toEqual({ ok: false, reason: 'no_holiday_list', year: 2025 })
  })
  it('a window that runs into an unlisted year', () => {
    expect(expectedBy('2028-12-28T15:00:00Z')).toEqual({ ok: false, reason: 'no_holiday_list', year: 2029 })   // Thu: Fri 29, then 2029
  })
  it('an invalid time is refused', () => {
    expect(expectedBy('not a date')).toEqual({ ok: false, reason: 'invalid_time' })
  })
})
