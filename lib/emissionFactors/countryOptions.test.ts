import { describe, it, expect } from 'vitest'
import {
  COUNTRY_OPTIONS,
  SYNONYMS,
  matchCountries,
  countryByIso2,
  foldForMatch,
} from './countryOptions'
import mapping from './countryRegions.json'

// THE POINT OF THESE TESTS IS THAT A COUNTRY THE CUSTOMER CAN NAME IS A COUNTRY THEY CAN SELECT.
//
// The failure this module exists to prevent is silent: a supplier in Côte d'Ivoire, or Swaziland,
// or Holland, that the customer types correctly and the picker does not offer — so they pick
// something near it, or nothing, and a spend line resolves to the wrong region without anyone
// seeing a fault. Every case below is one spelling that would otherwise fall through.
//
// Two of them are about NOT choosing: 'Korea' must return KR and KP, and neither may be picked for
// the customer.

const CODES = (mapping as { mapping: Array<{ iso2: string }> }).mapping.map(r => r.iso2)

/** iso2 codes returned for a query, in rank order. */
function codes(query: string, limit?: number): string[] {
  return matchCountries(query, limit).map(o => o.iso2)
}

describe('COUNTRY_OPTIONS', () => {
  it('loads all 212 rows of the concordance', () => {
    expect(COUNTRY_OPTIONS).toHaveLength(212)
    expect(CODES).toHaveLength(212)
  })

  it('has a unique iso2 for every entry', () => {
    const seen = new Set(COUNTRY_OPTIONS.map(o => o.iso2))
    expect(seen.size).toBe(COUNTRY_OPTIONS.length)
  })

  it('carries the same set of codes as countryRegions.json', () => {
    expect([...COUNTRY_OPTIONS.map(o => o.iso2)].sort()).toEqual([...CODES].sort())
  })

  it('is sorted by display_name', () => {
    const names = COUNTRY_OPTIONS.map(o => o.display_name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })

  it('gives every entry a non-empty display_name and a region_code', () => {
    for (const o of COUNTRY_OPTIONS) {
      expect(o.display_name.trim(), `display_name for ${o.iso2}`).not.toBe('')
      expect(o.region_code, `region_code for ${o.iso2}`).toMatch(/^[A-Z]{2}$/)
      expect(o.source_name.trim(), `source_name for ${o.iso2}`).not.toBe('')
    }
  })
})

describe('SYNONYMS', () => {
  // This is the assertion the module makes at load time. It is repeated here so that a bad entry
  // names itself in a test report rather than only as an import-time throw somewhere downstream.
  it('every target exists in the 212', () => {
    const present = new Set(CODES)
    const missing = Object.entries(SYNONYMS).filter(([, iso2]) => !present.has(iso2))
    expect(missing).toEqual([])
  })

  it('every key is already in folded form, so it can be matched', () => {
    for (const key of Object.keys(SYNONYMS)) {
      expect(foldForMatch(key), `SYNONYMS key ${JSON.stringify(key)}`).toBe(key)
    }
  })

  it('does not map a bare "Congo" or "Korea", which are ambiguous', () => {
    expect(SYNONYMS['congo']).toBeUndefined()
    expect(SYNONYMS['korea']).toBeUndefined()
  })
})

describe('matchCountries', () => {
  it("resolves 'Germany', 'germany' and 'DE' to DE", () => {
    expect(codes('Germany')[0]).toBe('DE')
    expect(codes('germany')[0]).toBe('DE')
    expect(codes('DE')[0]).toBe('DE')
    expect(codes('de')[0]).toBe('DE')
  })

  it("resolves both 'Turkiye' and 'Turkey' to TR", () => {
    // Intl says "Türkiye"; the concordance says "Turkey". Both spellings have to land.
    expect(codes('Turkiye')[0]).toBe('TR')
    expect(codes('Türkiye')[0]).toBe('TR')
    expect(codes('Turkey')[0]).toBe('TR')
  })

  it("resolves every spelling of Côte d'Ivoire to CI", () => {
    // Three apostrophes' worth of the same country: none, straight (U+0027), curly (U+2019).
    expect(codes('Cote d Ivoire')[0]).toBe('CI')
    expect(codes("Cote d'Ivoire")[0]).toBe('CI')
    expect(codes('Côte d’Ivoire')[0]).toBe('CI')
    expect(codes("Côte d'Ivoire")[0]).toBe('CI')
    expect(codes('Ivory Coast')[0]).toBe('CI')
  })

  it("returns BOTH Koreas for 'Korea' and picks neither", () => {
    const hits = codes('Korea')
    expect(hits).toContain('KR')
    expect(hits).toContain('KP')
    // Ordering is stable by display_name: "North Korea" before "South Korea".
    expect(hits.slice(0, 2)).toEqual(['KP', 'KR'])
  })

  it("returns BOTH Congos for 'Congo' and picks neither", () => {
    const hits = codes('Congo')
    expect(hits).toContain('CD')
    expect(hits).toContain('CG')
  })

  it("resolves 'Holland' to NL", () => {
    expect(codes('Holland')[0]).toBe('NL')
    expect(codes('holland')[0]).toBe('NL')
  })

  it('resolves the other former and colloquial names', () => {
    expect(codes('Swaziland')[0]).toBe('SZ')
    expect(codes('Eswatini')[0]).toBe('SZ')
    expect(codes('Macedonia')[0]).toBe('MK')
    expect(codes('Burma')[0]).toBe('MM')
    expect(codes('Czech Republic')[0]).toBe('CZ')
    expect(codes('USA')[0]).toBe('US')
    expect(codes('UAE')[0]).toBe('AE')
    expect(codes('Cape Verde')[0]).toBe('CV')
    expect(codes('DRC')[0]).toBe('CD')
    expect(codes('Saint Lucia')[0]).toBe('LC')
    expect(codes('East Timor')[0]).toBe('TL')
  })

  it('returns an empty array for a query that matches nothing, rather than throwing', () => {
    expect(matchCountries('zzzzzzzz')).toEqual([])
    expect(matchCountries('')).toEqual([])
    expect(matchCountries('   ')).toEqual([])
    expect(matchCountries('!!!')).toEqual([])
  })

  it('respects limit, and defaults to 8', () => {
    expect(matchCountries('a').length).toBe(8)
    expect(matchCountries('a', 3).length).toBe(3)
    expect(matchCountries('a', 1).length).toBe(1)
    expect(matchCountries('a', 500).length).toBeGreaterThan(8)
  })

  it('matches iso2 only in full, so a single letter finds nothing by code', () => {
    // 'd' must not surface DE, DK, DO, DZ by code — only by name.
    for (const o of matchCountries('d', 50)) {
      expect(o.display_name.toLowerCase().startsWith('d') || o.source_name.toLowerCase().includes('d'))
        .toBe(true)
    }
  })

  it('ranks an exact code above a name that merely contains it', () => {
    // 'de' is India-adjacent noise in "Sweden", "Denmark"; the code wins.
    expect(codes('de', 10)[0]).toBe('DE')
  })

  // ── A SYNONYM OUTRANKS A PREFIX MATCH ──────────────────────────────────────────────────────
  //
  // 'uk' is the case that forced the ordering. "Ukraine" begins with those two letters, so under
  // a prefix-first ranking a customer typing "uk" was offered Ukraine at the top and the United
  // Kingdom underneath it. An exact hit on a name people are known to use is better evidence of
  // intent than a name that merely starts the same way. Ukraine is not dropped - it moves one
  // place down, which is the whole cost.

  it("returns GB first for 'uk', with Ukraine still present", () => {
    const hits = codes('uk', 10)
    expect(hits[0]).toBe('GB')
    expect(hits).toContain('UA')
  })

  it("returns US first for 'usa'", () => {
    expect(codes('usa')[0]).toBe('US')
  })

  it("returns NL first for 'holland'", () => {
    expect(codes('holland')[0]).toBe('NL')
  })

  it('puts every synonym target first for its own key', () => {
    // The general form of the three cases above, across the whole table. If a future key collides
    // with a country name, this is what says so - and names the key.
    const wrong: string[] = []
    for (const [key, iso2] of Object.entries(SYNONYMS)) {
      const first = codes(key, 1)[0]
      if (first !== iso2) wrong.push(`${JSON.stringify(key)} -> ${iso2}, but got ${first}`)
    }
    expect(wrong).toEqual([])
  })

  it('does not let a synonym displace a country whose FULL NAME the customer typed', () => {
    // The failure the swap could have introduced: a key that is some other country's whole name
    // would now outrank that country. None is today; this fails the moment one is added.
    const collisions: string[] = []
    for (const [key, iso2] of Object.entries(SYNONYMS)) {
      for (const o of COUNTRY_OPTIONS) {
        if (o.iso2 === iso2) continue
        if (foldForMatch(o.display_name) === key || foldForMatch(o.source_name) === key) {
          collisions.push(`${JSON.stringify(key)} -> ${iso2} is also the full name of ${o.iso2}`)
        }
      }
    }
    expect(collisions).toEqual([])
  })

  it('still returns the prefix match that a synonym outranks, one place lower', () => {
    // Nothing is hidden by the ordering - demotion only. Every country whose display name starts
    // with a synonym key must still appear in the results for that key.
    const lost: string[] = []
    for (const key of Object.keys(SYNONYMS)) {
      const hits = new Set(codes(key, 212))
      for (const o of COUNTRY_OPTIONS) {
        if (foldForMatch(o.display_name).startsWith(key) && !hits.has(o.iso2)) {
          lost.push(`${o.iso2} dropped from results for ${JSON.stringify(key)}`)
        }
      }
    }
    expect(lost).toEqual([])
  })

  it('is stable: the same query gives the same order twice', () => {
    expect(codes('an', 8)).toEqual(codes('an', 8))
  })
})

describe('countryByIso2', () => {
  it('returns the option for a known code', () => {
    const de = countryByIso2('DE')
    expect(de?.iso2).toBe('DE')
    expect(de?.region_code).toBe('DE')
    expect(de?.source_name).toBe('Germany')
  })

  it('returns undefined for an unknown code rather than throwing', () => {
    expect(countryByIso2('ZZ')).toBeUndefined()
    expect(countryByIso2('')).toBeUndefined()
    expect(countryByIso2('de')).toBeUndefined() // codes are stored uppercase
  })

  it('gives XK something displayable, not an empty string or a bare code', () => {
    // XK has no ISO 3166-1 assignment, so Intl is not obliged to name it. Whatever this runtime
    // does, the option must carry a name a person can read.
    const xk = countryByIso2('XK')
    expect(xk).toBeDefined()
    expect(xk!.display_name.trim()).not.toBe('')
    expect(xk!.display_name).not.toBe('XK')
    expect(xk!.region_code).toBe('WE')
    expect(xk!.basis).toBe('manual-resolution')
    expect(codes('Kosovo')[0]).toBe('XK')
  })

  it('round-trips every option in COUNTRY_OPTIONS', () => {
    for (const o of COUNTRY_OPTIONS) {
      expect(countryByIso2(o.iso2)).toEqual(o)
    }
  })
})

describe('every country is findable by typing its own names', () => {
  // The broad sweep behind the named cases above: no row may be unreachable by either of the two
  // spellings the module itself holds for it.
  it('matches each country by its display_name and by its source_name', () => {
    const unreachable: string[] = []
    for (const o of COUNTRY_OPTIONS) {
      if (!matchCountries(o.display_name, 212).some(h => h.iso2 === o.iso2)) {
        unreachable.push(`${o.iso2} by display_name ${JSON.stringify(o.display_name)}`)
      }
      if (!matchCountries(o.source_name, 212).some(h => h.iso2 === o.iso2)) {
        unreachable.push(`${o.iso2} by source_name ${JSON.stringify(o.source_name)}`)
      }
    }
    expect(unreachable).toEqual([])
  })

  it('matches each country by its own code', () => {
    for (const o of COUNTRY_OPTIONS) {
      expect(codes(o.iso2)[0], `code ${o.iso2}`).toBe(o.iso2)
    }
  })
})
