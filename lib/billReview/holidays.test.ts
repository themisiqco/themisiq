// lib/billReview/holidays.test.ts
//
// BR5: every listed date, recomputed from its rule (Q5 ruling, 10 Oct 2026). A mistyped date, a missing holiday, an
// extra one or a wrong substitute fails here. A new year added to HOLIDAYS is checked the same way, automatically.

import { describe, it, expect } from 'vitest'
import { HOLIDAYS } from './holidays'

const iso = (d: Date) => d.toISOString().slice(0, 10)
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d))
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000)
/** Easter Sunday, by the anonymous Gregorian computus. */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451)
  return day(y, Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1)
}
const nthMonday = (y: number, m: number, n: number) => { const first = day(y, m, 1); return plus(first, ((8 - first.getUTCDay()) % 7) + 7 * (n - 1)) }
const mondayBefore = (y: number, m: number, d: number) => { let x = plus(day(y, m, d), -1); while (x.getUTCDay() !== 1) x = plus(x, -1); return x }

/** The ruled list for a year, from rules alone: ESA holidays, Easter Monday, the Civic Holiday, then weekend substitutes. */
function fromRules(y: number): { date: string; name: string }[] {
  const e = easter(y)
  const base = [
    ['New Year’s Day', day(y, 1, 1)], ['Family Day', nthMonday(y, 2, 3)], ['Good Friday', plus(e, -2)], ['Easter Monday', plus(e, 1)],
    ['Victoria Day', mondayBefore(y, 5, 25)], ['Canada Day', day(y, 7, 1)], ['Civic Holiday', nthMonday(y, 8, 1)], ['Labour Day', nthMonday(y, 9, 1)],
    ['Thanksgiving Day', nthMonday(y, 10, 2)], ['Christmas Day', day(y, 12, 25)], ['Boxing Day', day(y, 12, 26)],
  ] as [string, Date][]
  const taken = new Set(base.map(([, d]) => iso(d)))
  const subs: [string, Date][] = []
  for (const [name, d] of base) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) continue
    let s = plus(d, 1)
    while (s.getUTCDay() === 0 || s.getUTCDay() === 6 || taken.has(iso(s))) s = plus(s, 1)
    taken.add(iso(s))
    subs.push([`${name} (substitute)`, s])
  }
  return [...base, ...subs].map(([name, d]) => ({ name, date: iso(d) })).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
}

describe('BR5 holidays: each listed date is its rule', () => {
  for (const y of Object.keys(HOLIDAYS).map(Number)) {
    it(String(y), () => {
      const listed = HOLIDAYS[y].map(h => ({ name: h.name, date: h.date })).sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
      expect(listed).toEqual(fromRules(y))
      for (const h of HOLIDAYS[y]) { expect(h.date.startsWith(`${y}-`), h.date).toBe(true); expect(h.source.length, h.name).toBeGreaterThan(20) }
    })
  }
  it('2026, 2027 and 2028 are listed, with the ruled substitutes', () => {
    expect(Object.keys(HOLIDAYS)).toEqual(['2026', '2027', '2028'])
    const subs = Object.values(HOLIDAYS).flat().filter(h => h.name.endsWith('(substitute)')).map(h => h.date)
    expect(subs).toEqual(['2026-12-28', '2027-12-27', '2027-12-28', '2028-01-03', '2028-07-03'])
  })
  it('Easter Monday and the Civic Holiday cite the ruling, not the ESA; ESA holidays cite the Act', () => {
    for (const h of Object.values(HOLIDAYS).flat()) {
      if (h.name === 'Easter Monday' || h.name === 'Civic Holiday') expect(h.source).toContain('not a public holiday under the ESA')
      else if (!h.name.endsWith('(substitute)')) expect(h.source).toContain('Employment Standards Act, 2000 (Ontario), s. 1(1)')
    }
  })
})
