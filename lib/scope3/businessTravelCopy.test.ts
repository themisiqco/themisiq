import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFRA_TRAVEL_META } from '../emissionFactors/defraTravel'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { evaluateBusinessTravel, withDistance } from './businessTravel'
import {
  CAT6_SOURCE_SENTENCE, CAT6_CATEGORY_RULE_SENTENCE, CAT6_CLASS_SENTENCE, CAT6_UPLIFT_SENTENCE, CAT6_WTT_SENTENCE,
  CAT6_RAIL_SENTENCE, CAT6_HOTEL_SENTENCE, CAT6_DISTANCE_HELP, CAT6_TAKES, CAT6_ASSISTANT_PHRASE,
  cat6RfSentence, cat6RfHeader, cat6MethodDescription, cat6Sentences, cat6Basis, RF_CO2_MULTIPLIER, CAT6_RF_FACTORS_PHRASE,
} from './businessTravelCopy'
import { publisherGwpSentence } from './gwpSentence'

const ROOT = join(__dirname, '..', '..')
const name = (iso2: string) => iso2
const sample = evaluateBusinessTravel({
  flights: [
    { id: 'a', origin_iso2: 'GB', destination_iso2: 'US', cabin_class: 'economy', count: 1, ...withDistance(5570, 'km') },
    { id: 'b', origin_iso2: 'GB', destination_iso2: 'MC', cabin_class: 'unknown', count: 1, ...withDistance(1000, 'km') },
  ],
  rail_journeys: [{ id: 'r', country_iso2: 'FR', rail_type: 'National rail', passengers: 1, ...withDistance(100, 'km') }],
})
const ALL = [
  CAT6_SOURCE_SENTENCE, CAT6_CATEGORY_RULE_SENTENCE, CAT6_CLASS_SENTENCE, CAT6_UPLIFT_SENTENCE, CAT6_WTT_SENTENCE,
  CAT6_RAIL_SENTENCE, CAT6_HOTEL_SENTENCE, CAT6_DISTANCE_HELP, CAT6_TAKES, CAT6_ASSISTANT_PHRASE,
  cat6RfSentence(true), cat6RfSentence(false), cat6RfHeader(true), cat6RfHeader(false), cat6MethodDescription(),
  ...cat6Sentences(sample, 'GWP.', name), cat6Basis(sample, name).basis, cat6Basis(sample, name).detail,
]

describe('Category 6 sentences', () => {
  it('C6C1 no em-dashes in any Category 6 sentence', () => {
    for (const s of ALL) expect(s, s.slice(0, 60)).not.toMatch(/—/)
  })

  it('C6C2 the category rule states the departure from A56, and names EPA as precedent only', () => {
    expect(CAT6_CATEGORY_RULE_SENTENCE).toContain('482.8032 km')
    expect(CAT6_CATEGORY_RULE_SENTENCE).toContain('3,701.4912 km')
    expect(CAT6_CATEGORY_RULE_SENTENCE).toContain('departs from the sheet\'s guidance to use its international average for flights between non-UK countries (Business travel- air A56)')
    expect(CAT6_CATEGORY_RULE_SENTENCE).toContain('US EPA GHG Emission Factors Hub (2025), cited as the precedent for banding only, with no EPA figure used')
    // Exactly one sentence.
    expect(CAT6_CATEGORY_RULE_SENTENCE.match(/\.(\s|$)/g)).toHaveLength(1)
    // EPA appears nowhere else, so no other sentence can read as an EPA-sourced factor.
    for (const s of ALL.filter(x => !x.includes(CAT6_CATEGORY_RULE_SENTENCE))) expect(s, s.slice(0, 60)).not.toMatch(/\bEPA\b/)
  })

  it('C6C3 ⚠️ the radiative forcing increase is stated as DEFRA\'s, in ONE shared phrase, with the 70% read from A11', () => {
    expect(DEFRA_TRAVEL_META.guidance.rf_two_sets.text).toMatch(/causing an increase of 70%/)
    expect(RF_CO2_MULTIPLIER).toBe(1.7)
    expect(CAT6_RF_FACTORS_PHRASE).toBe("DEFRA's With RF flight factors, which increase the CO2 component by 70% to account for radiative forcing (Business travel- air A11)")
    expect(cat6RfHeader(true)).toBe(`Included: ${CAT6_RF_FACTORS_PHRASE}. Figures without it are in the Cat 6 rows.`)
    // Every surface that names the adjustment carries the shared phrase, and none words it as a multiplier
    // ThemisIQ applies.
    for (const s of [cat6RfSentence(true), cat6RfSentence(false), cat6RfHeader(true), cat6RfHeader(false), cat6MethodDescription()]) {
      expect(s).toContain(CAT6_RF_FACTORS_PHRASE)
      expect(s).not.toMatch(/1\.70|multiplier/)
    }
    expect(cat6RfSentence(true)).toMatch(/^Radiative forcing is included/)
    expect(cat6RfSentence(false)).toMatch(/^Radiative forcing is not included/)
    expect(cat6RfSentence(false)).toContain('Business travel- air A12')
  })

  it('C6C4 the cited cells are the workbook\'s, and the years and uplift are read from them', () => {
    expect(CAT6_UPLIFT_SENTENCE).toContain('a distance uplift of 8% for indirect routing (Business travel- air A49)')
    expect(CAT6_UPLIFT_SENTENCE).toContain('direct (non-stop) flights (Business travel- air A53)')
    expect(CAT6_WTT_SENTENCE).toContain('last updated in its 2023 publication and its flight factors in its 2025 publication (Index H41 and Index H40)')
    expect(CAT6_CLASS_SENTENCE).toContain('(Business travel- air A18)')
  })

  it('C6C5 the OGL attribution is carried verbatim, from the artefact', () => {
    expect(DEFRA_TRAVEL_META.attribution_required).toBe(DEFRA_WASTE_META.attribution_required)
    expect(cat6MethodDescription().endsWith(` ${DEFRA_TRAVEL_META.attribution_required}`)).toBe(true)
    expect(cat6Sentences(sample, 'GWP.', name)).toContain(DEFRA_TRAVEL_META.attribution_required)
  })

  it('C6C6 hotels are stated as not included, with both reasons, wherever Cat 6 is described', () => {
    expect(CAT6_HOTEL_SENTENCE).toBe('Hotel stays are not included: they are optional under the GHG Protocol Scope 3 Standard, and the licence for the published hotel factors has not been confirmed.')
    expect(cat6MethodDescription()).toContain(CAT6_HOTEL_SENTENCE)
    expect(cat6Sentences(sample, 'GWP.', name)).toContain(CAT6_HOTEL_SENTENCE)
    expect(CAT6_ASSISTANT_PHRASE).toContain('hotel stays not included')
    // No semicolon inside the phrase: the assistant clause joins categories with semicolons.
    expect(CAT6_ASSISTANT_PHRASE).not.toContain(';')
    expect(CAT6_TAKES).toContain('no hotel stays')
  })

  it('C6C7 unpriced rows are named with their reason; the UK stand-in and WTT are stated', () => {
    const list = cat6Sentences(sample, 'GWP.', name)
    expect(list).toContain('Flight leg 2 is not in this figure: it has a UK end, and the Haul definition sheet gives no haul for MC, so its category cannot be set.')
    expect(list).toContain(CAT6_RAIL_SENTENCE)
    expect(list).toContain(CAT6_WTT_SENTENCE)
    expect(cat6Basis(sample, name).basis).toContain('radiative forcing included')
  })

  it('C6C8 ⚠️ the shared GWP sentence is the waste wording, byte for byte, for every branch', () => {
    const m = DEFRA_WASTE_META
    expect(publisherGwpSentence(m, false, null)).toBe(`GWP basis: ${m.gwp_basis}. ${m.gwp_basis_note}`)
    expect(publisherGwpSentence(m, true, 'AR5')).toBe(`GWP basis: AR5. ${m.gwp_basis_note} The linked GHG inventory records AR5 as well, so the two share a GWP basis.`)
    expect(publisherGwpSentence(m, true, 'AR6')).toBe(`GWP basis: AR5. ${m.gwp_basis_note} The linked GHG inventory records AR6. These factors are not re-based to it, so the inventory combines AR6 and AR5 figures.`)
    expect(publisherGwpSentence(m, true, null)).toBe(`GWP basis: AR5. ${m.gwp_basis_note} The linked GHG inventory records no GWP basis, so whether it shares AR5 with these factors is not known.`)
    expect(publisherGwpSentence(DEFRA_TRAVEL_META, true, 'AR5')).toContain('GWP basis: AR5.')
  })

  it('C6C9 ⚠️ the old Cat 6 inputs are gone from every surface that described them', () => {
    const page = readFileSync(join(ROOT, 'app/dashboard/scope3/page.tsx'), 'utf8')
    const route = readFileSync(join(ROOT, 'app/api/ghg-bot/route.ts'), 'utf8')
    // Comment lines are skipped, as in categoryMethods M5: a comment has to be able to say what was removed.
    const code = (src: string) => src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n')
    for (const src of [page, route]) {
      expect(code(src)).not.toMatch(/hotel nights|Hotel nights|short_haul_flights|long_haul_flights|number of flights/)
    }
    expect(route).toContain('Note what that category takes today: ${CAT6_TAKES}')
  })
})
