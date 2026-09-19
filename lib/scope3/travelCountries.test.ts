import { describe, it, expect } from 'vitest'
import { COUNTRY_OPTIONS, foldForMatch } from '../emissionFactors/countryOptions'
import { HAUL_RECORDS } from '../emissionFactors/defraTravel'
import { haulIso3ForIso2, haulForIso2, isUkIso2, DEFRA_HAUL_UNLISTED_ISO2, HAUL_ISO3_OVERRIDES } from './travelCountries'

describe('picker countries to the Haul definition sheet', () => {
  it('TC1 199 of the 212 picker countries map; the thirteen the sheet does not list are named', () => {
    expect(COUNTRY_OPTIONS).toHaveLength(212)
    expect(COUNTRY_OPTIONS.filter(o => haulIso3ForIso2(o.iso2) !== null)).toHaveLength(199)
    expect([...DEFRA_HAUL_UNLISTED_ISO2].sort()).toEqual(['AD', 'BT', 'FM', 'KI', 'LI', 'MC', 'MS', 'NR', 'PS', 'SM', 'SX', 'TV', 'WS'])
  })

  it('TC2 spot checks against ISO 3166-1, not against the matcher', () => {
    const known: Record<string, string> = {
      GB: 'GBR', US: 'USA', CA: 'CAN', FR: 'FRA', DE: 'DEU', JP: 'JPN', IN: 'IND', AU: 'AUS', CN: 'CHN', ZA: 'ZAF',
      BR: 'BRA', MX: 'MEX', IE: 'IRL', CH: 'CHE', AE: 'ARE', SG: 'SGP', KR: 'KOR', CD: 'COD', CG: 'COG', CI: 'CIV',
    }
    for (const [iso2, iso3] of Object.entries(known)) expect(haulIso3ForIso2(iso2), iso2).toBe(iso3)
  })

  it('TC3 every override lands on a row the sheet has, and is needed because the names differ', () => {
    const iso3s = new Set(HAUL_RECORDS.map(r => r.iso3))
    const sheetNames = new Set(HAUL_RECORDS.map(r => foldForMatch(r.territory)))
    for (const [iso2, iso3] of Object.entries(HAUL_ISO3_OVERRIDES)) {
      expect(iso3s.has(iso3), `${iso2} -> ${iso3}`).toBe(true)
      const o = COUNTRY_OPTIONS.find(x => x.iso2 === iso2)!
      expect(sheetNames.has(foldForMatch(o.source_name)), `${iso2} would match by name`).toBe(false)
    }
  })

  it('TC4 no two picker countries share an ISO3, and only the United Kingdom is UK among them', () => {
    const mapped = COUNTRY_OPTIONS.map(o => haulIso3ForIso2(o.iso2)).filter((x): x is string => x !== null)
    expect(new Set(mapped).size).toBe(mapped.length)
    expect(COUNTRY_OPTIONS.filter(o => isUkIso2(o.iso2)).map(o => o.iso2)).toEqual(['GB'])
    expect(haulForIso2('US')).toBe('long_haul')
    expect(haulForIso2('FR')).toBe('short_haul')
    expect(haulForIso2('MC')).toBeNull()
    expect(haulForIso2('')).toBeNull()
  })
})
