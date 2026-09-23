import { describe, it, expect } from 'vitest'
import {
  SUPPORTED_COUNTRY_OPTIONS, OTHER_COUNTRY_OPTIONS, NOT_LISTED_OPTION,
  COUNTRY_PICKER_OPTIONS, selectedCountryValue,
} from './countryPicker'
import { COUNTRY_OPTIONS } from '../emissionFactors/countryOptions'
import { countryRefusal, efJurisdiction, EU_COUNTRIES } from './engine'
import { countryRefusalText, storedCountryEchoLabel } from './countryRefusalCopy'

// ── WHAT THE COUNTRY CONTROL MAY OFFER, AND WHAT IT STORES ──────────────────────────────────────
//
// The control is the only writer of a location's country, and the country decides which publisher
// prices every figure at that location. So an option that stores the wrong spelling, or a country
// offered as supported that the engine refuses, is a wrong number with a publisher's name on it.
//
// ⚠️ THE EXPECTED SUPPORTED SET IS A LITERAL WRITTEN OUT BELOW, ON PURPOSE. The module derives its
// supported group by asking efRouting, which is right: a jurisdiction added to the engine should
// appear in the control without anyone editing a second list. But a test that asked efRouting the
// same question would agree with the module by construction and prove nothing. The literal is the
// independent side. When the engine gains a jurisdiction this test fails, and that failure is the
// prompt to check the control can express it.

const SUPPORTED_32 = [
  'US', 'CA', 'GB', 'AU', 'NZ',
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'EL', 'HU', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]

describe('the country control offers', () => {
  it('a canonical code for every option, never GR and never UK', () => {
    // ⚠️ GR AND UK ARE REAL SPELLINGS OF SUPPORTED COUNTRIES AND MUST NOT REACH THE RECORD. The
    // engine's factor keys are spelled EL and GB (GRID_EF.EU_EL, gridRegionForCountry('GB')), and a
    // location stored as GR loses its grid factor outright. canonicalCountryCode fronts the routers
    // so a stored GR still resolves, but nothing should be storing one in the first place.
    const values = COUNTRY_PICKER_OPTIONS.map(o => o.value)
    expect(values).not.toContain('GR')
    expect(values).not.toContain('UK')
    expect(values).toContain('EL')
    expect(values).toContain('GB')
    expect(new Set(values).size, 'no value is offered twice').toBe(values.length)
  })

  it('Greece exactly once, labelled Greece and stored as EL', () => {
    // ⚠️ THE ONE PLACE LABEL AND VALUE COME FROM DIFFERENT CODES. countryNameEn('EL') returns "EL",
    // because EL is a Eurostat convention and not an ISO region, so the option is named from the
    // list's own GR row and stores the canonical EL. It must not then also appear among the other
    // countries, which is what would happen if the partition ran on the raw code.
    // Found BY VALUE and asserted on the label, not filtered by label: a wrong label should fail
    // saying what it actually is, not "expected 0 to be 1".
    const greek = COUNTRY_PICKER_OPTIONS.filter(o => o.value === 'EL')
    expect(greek).toHaveLength(1)
    expect(greek[0].label).toBe('Greece')
    expect(OTHER_COUNTRY_OPTIONS.some(o => o.label === 'Greece' || o.value === 'EL')).toBe(false)
  })

  it('exactly the 32 supported jurisdictions, and every one of them routes without refusal', () => {
    expect([...SUPPORTED_COUNTRY_OPTIONS.map(o => o.value)].sort())
      .toEqual([...SUPPORTED_32].sort())
    for (const o of SUPPORTED_COUNTRY_OPTIONS) {
      expect(countryRefusal({ country: o.value }), o.label).toBeNull()
      expect(efJurisdiction({ country: o.value }), o.label).not.toBeNull()
    }
  })

  it('every jurisdiction the engine supports can actually be chosen', () => {
    // ⚠️ THE TEST ABOVE CANNOT CATCH A MISSING OPTION, AND THIS ONE IS WHY IT EXISTS.
    // Both sides of that comparison come from SUPPORTED_COUNTRY_OPTIONS and a literal kept beside
    // it, and SUPPORTED_COUNTRY_OPTIONS is COUNTRY_OPTIONS filtered through efRouting. A
    // jurisdiction added to the engine whose code has no row in the shared list never enters that
    // filter: the group stays at 32, the literal stays at 32, and the comparison passes while the
    // option silently does not exist. The only thing that would have failed is a developer
    // remembering to update the literal, which is what a guard is supposed to not depend on.
    //
    // So this side starts from the ENGINE's own set, with no COUNTRY_OPTIONS anywhere in it, and
    // asks whether each member reached the control. EU_COUNTRIES is the engine's list, read by
    // efRouting itself, so adding a member there is enough to fail this by name.
    const engineSupported = ['US', 'CA', 'GB', 'AU', 'NZ', ...EU_COUNTRIES]
    for (const code of engineSupported) {
      expect(
        SUPPORTED_COUNTRY_OPTIONS.some(o => o.value === code),
        `the engine prices ${code}, and the country control offers no option that stores it. ` +
        `A code with no row in COUNTRY_OPTIONS cannot reach the list, which is why Greece is named ` +
        `from its GR row and stored as EL. Add a row for ${code}, or give it an alias in ` +
        `canonicalCountryCode that maps it onto a code the list already holds.`,
      ).toBe(true)
    }
    // And nothing is offered as supported that the engine would refuse.
    for (const o of SUPPORTED_COUNTRY_OPTIONS) {
      expect(engineSupported, `${o.label} is offered as supported`).toContain(o.value)
    }
  })

  it('every other country, each refused as country_not_supported', () => {
    for (const o of OTHER_COUNTRY_OPTIONS) {
      expect(countryRefusal({ country: o.value }), o.label)
        .toEqual({ state: 'country_not_supported', iso2: o.value })
    }
  })

  it('Not listed last, storing OTHER, refused as country_not_listed', () => {
    expect(COUNTRY_PICKER_OPTIONS[COUNTRY_PICKER_OPTIONS.length - 1]).toBe(NOT_LISTED_OPTION)
    expect(NOT_LISTED_OPTION.value).toBe('OTHER')
    expect(NOT_LISTED_OPTION.label).toBe('Not listed')
    expect(countryRefusal({ country: 'OTHER' }))
      .toEqual({ state: 'country_not_listed', value: 'OTHER' })
  })

  it('counts that reconcile against the shared country list', () => {
    expect(SUPPORTED_COUNTRY_OPTIONS).toHaveLength(32)
    expect(OTHER_COUNTRY_OPTIONS).toHaveLength(180)
    expect(SUPPORTED_COUNTRY_OPTIONS.length + OTHER_COUNTRY_OPTIONS.length)
      .toBe(COUNTRY_OPTIONS.length)
    expect(COUNTRY_PICKER_OPTIONS).toHaveLength(213)
  })

  it('labels in English whatever the reader locale, with no flags', () => {
    // ⚠️ PROVES THE PINNING RATHER THAN THE AMBIENT LOCALE. Asserting "Japan" under a runtime that
    // is already English shows nothing. A French DisplayNames beside it does: if the label followed
    // the reader, this is what it would say.
    const fr = new Intl.DisplayNames(['fr'], { type: 'region' })
    expect(fr.of('JP')).toBe('Japon')
    expect(COUNTRY_PICKER_OPTIONS.find(o => o.value === 'JP')!.label).toBe('Japan')
    expect(COUNTRY_PICKER_OPTIONS.find(o => o.value === 'DE')!.label).toBe('Germany')
    // No regional indicator characters: the old control carried flag emoji, the shared list does not,
    // and half a list with flags reads as a rendering fault rather than a design.
    for (const o of COUNTRY_PICKER_OPTIONS) {
      expect(/\p{Regional_Indicator}/u.test(o.label), o.label).toBe(false)
    }
  })

  it('every option has a real name, never a bare code', () => {
    // ⚠️ THE LABEL CAN FALL BACK TO THE CODE, AND EL IS THE PROOF THAT SUPPORTED CODES CAN SIT
    // OUTSIDE THE SHARED LIST. countryNameEn tries Intl.DisplayNames, then the concordance's own
    // spelling, then hands the code straight back: countryNameEn('EL') is the string "EL". Greece
    // works only because the option is named from the list's GR row. A future jurisdiction whose
    // code Intl does not know, or whose concordance row has no name, would render as two letters in
    // a list of country names, which reads as a rendering fault rather than as a country.
    for (const o of COUNTRY_PICKER_OPTIONS) {
      expect(o.label.trim().length, `${o.value} has an empty label`).toBeGreaterThan(0)
      expect(o.label, `${o.value} renders as its own code`).not.toBe(o.value)
    }
  })

  it('each group alphabetical by its English label', () => {
    for (const group of [SUPPORTED_COUNTRY_OPTIONS, OTHER_COUNTRY_OPTIONS]) {
      const labels = group.map(o => o.label)
      expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, 'en')))
    }
  })
})

describe('a stored country the control cannot match', () => {
  it('selects the canonical option for a legacy UK or GR, writing nothing', () => {
    // Both are real spellings of supported countries that no option carries. Matching on the
    // canonical form shows the right country; the stored value is untouched until the user picks.
    expect(selectedCountryValue('UK')).toBe('GB')
    expect(selectedCountryValue('GR')).toBe('EL')
    expect(selectedCountryValue('gb')).toBe('GB')
    expect(selectedCountryValue('OTHER')).toBe('OTHER')
    expect(selectedCountryValue('')).toBe('')
    expect(selectedCountryValue(undefined)).toBe('')
  })

  it('selects the placeholder for an empty or whitespace country, with no echo entry', () => {
    // country_not_set is its own state with its own sentence ("This location has no country set").
    // If this returned null the control would render an echo reading: Recorded as ""
    // which names nothing, contradicts that sentence, and is the one case where an empty value is
    // the correct answer rather than a missing one.
    for (const empty of ['', '   ', '\t', undefined]) {
      expect(selectedCountryValue(empty), JSON.stringify(empty)).toBe('')
    }
    expect(countryRefusal({ country: '   ' })).toEqual({ state: 'country_not_set' })
  })

  it('reports no match for a value that names no country, so the control can echo it', () => {
    for (const junk of ['Japn', 'ZZ', 'Somewhere']) {
      expect(selectedCountryValue(junk), junk).toBeNull()
    }
  })

  it('the echo entry quotes the value exactly as the refusal sentence does', () => {
    // ⚠️ ONE VALUE, QUOTED IDENTICALLY IN BOTH, so a customer can see that the thing named in the
    // sentence is the thing sitting in the control. A control that showed nothing while the
    // sentence quoted "Japn" would have the screen and the record disagreeing about one location.
    const echo = storedCountryEchoLabel('Japn')
    const sentence = countryRefusalText({ state: 'country_not_listed', value: 'Japn' }, 'review', false)
    expect(echo).toBe('Recorded as "Japn"')
    expect(sentence).toContain('"Japn"')
    for (const t of [echo, sentence]) {
      expect(t, t).not.toContain('—')
      expect(t, t).not.toContain('’')
    }
  })
})
