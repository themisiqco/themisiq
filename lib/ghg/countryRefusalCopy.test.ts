import { describe, it, expect } from 'vitest'
import { countryRefusalText, countryRefusalLabel, countryNameEn, type RefusalSurface } from './countryRefusalCopy'
import type { CountryRefusal } from './engine'

// THE CONSTRAINTS ON THIS COPY ARE CHECKED, NOT TRUSTED.
//
// Four surfaces render these sentences and all four read them from one module, so a constraint
// broken here is broken everywhere at once: in the wizard, in the CSV, on the verifier page and in
// the multi-year series. Each rule below exists because breaking it has cost something before.

const ALL: CountryRefusal[] = [
  { state: 'country_not_set' },
  { state: 'country_not_listed', value: 'OTHER' },
  { state: 'country_not_listed', value: 'Japan?' },
  { state: 'country_not_supported', iso2: 'PH' },
  { state: 'country_not_supported', iso2: 'JP' },
]
const SURFACES: RefusalSurface[] = ['review', 'verifier']
const every = (): string[] =>
  ALL.flatMap(r => SURFACES.flatMap(s => [countryRefusalText(r, s, true), countryRefusalText(r, s, false)]))

describe('the country refusal sentences', () => {
  it('never use an em dash', () => {
    for (const t of every()) expect(t, t).not.toContain('—')
  })

  it('never use a positional word', () => {
    // A sentence that says "below" is true on one surface and false on the next. The same string is
    // rendered in a wizard panel, a CSV cell, a verifier table and a trends note, and nothing keeps
    // them in the same order or on the same screen.
    for (const t of every()) expect(t, t).not.toMatch(/\b(below|above|to the right|to the left|overleaf)\b/i)
  })

  it('names steps, never numbers them', () => {
    // The wizard's tab bar renders "2. Company setup". The number moves when a step is inserted and
    // the name does not, so copy that cites a number goes stale silently.
    for (const t of every()) expect(t, t).not.toMatch(/\bstep\s*\d/i)
  })

  it('makes no absolute claim about what exists', () => {
    // "We do not hold factors for X" is checkable and true. "No factors exist for X" is neither:
    // DEFRA, ECCC and others publish for countries this platform does not carry.
    for (const t of every()) expect(t, t).not.toMatch(/no emission factors? exists?|there (are|is) no .*factors?/i)
  })

  it('says a location is left out of every total, on the customer-facing surface', () => {
    for (const r of ALL) {
      expect(countryRefusalText(r, 'review', true), r.state).toContain('left out of every total')
    }
  })

  it('keeps the figures clause only when there are figures', () => {
    for (const r of ALL) {
      for (const s of SURFACES) {
        const withFigures = countryRefusalText(r, s, true)
        const without = countryRefusalText(r, s, false)
        if (s === 'review') {
          expect(withFigures, r.state).toContain('Its figures are kept as entered.')
          expect(without, r.state).not.toContain('kept as entered')
        }
      }
    }
  })

  it('offers a remedy exactly where one exists', () => {
    const where = 'Choose the country in "List your locations" on the Company setup step.'
    // Fixable: nobody answered, or the stored value names no country.
    expect(countryRefusalText({ state: 'country_not_set' }, 'review', false)).toContain(where)
    expect(countryRefusalText({ state: 'country_not_listed', value: 'xx' }, 'review', false)).toContain(where)
    // ⚠️ NOT FIXABLE, AND THE COPY MUST NOT PRETEND OTHERWISE. "Not listed" was an honest answer and
    // an unsupported country is a limit of this platform. Telling either customer to go and choose
    // again sends them back to a control that will not help them.
    expect(countryRefusalText({ state: 'country_not_listed', value: 'OTHER' }, 'review', false)).not.toContain(where)
    expect(countryRefusalText({ state: 'country_not_supported', iso2: 'JP' }, 'review', false)).not.toContain(where)
  })

  it('puts the country name in brackets, so no name ever needs an article', () => {
    // "for Philippines" is wrong and "for the Philippines" is right; "for Gambia" divides opinion.
    // A generated sentence cannot know which, so it never has to.
    for (const iso2 of ['PH', 'NL', 'US', 'GM', 'CZ']) {
      const t = countryRefusalText({ state: 'country_not_supported', iso2 }, 'verifier', false)
      expect(t, iso2).toContain(`(${countryNameEn(iso2)})`)
      expect(t, iso2).not.toMatch(/ for (the )?[A-Z]/)
    }
  })

  it('quotes a stored value verbatim rather than paraphrasing it', () => {
    const t = countryRefusalText({ state: 'country_not_listed', value: 'Japn' }, 'review', false)
    expect(t).toContain('"Japn"')
  })

  it('names countries in English whatever the runtime locale is', () => {
    // These strings reach a workings row, an export and the verifier page. One reader must not see
    // "Japan" where another sees a name in their own locale for the same stored figure.
    expect(countryNameEn('JP')).toBe('Japan')
    expect(countryNameEn('PH')).toBe('Philippines')
    // A code no name is held for falls back to the code, never to an empty string.
    expect(countryNameEn('ZZ')).toBeTruthy()
  })

  it('gives every state a short label that is not a sentence', () => {
    for (const r of ALL) {
      const l = countryRefusalLabel(r)
      expect(l.length, l).toBeLessThan(40)
      expect(l, l).not.toContain('.')
    }
  })
})
