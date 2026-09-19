import { describe, it, expect } from 'vitest'
import {
  airFactor, airRecord, wttAirFactor, haulForIso3, hotelFactor, hotelRecord, railFactor, wttRailFactor,
  RAIL_TYPES, DEFRA_TRAVEL_META,
} from './defraTravel'

// The reader's contract: typed lookups that return the published figure, or null — never zero — for
// anything the workbook does not publish.

describe('defraTravel reader', () => {
  it('DT1 air factor by category, class and RF setting, with its cells', () => {
    expect(airFactor('domestic', 'average_passenger', true)).toEqual({ kg_co2e: 0.22928, co2: 0.22771, ch4: 0.00022, n2o: 0.00134 })
    expect(airFactor('domestic', 'average_passenger', false)).toEqual({ kg_co2e: 0.13552, co2: 0.13395, ch4: 0.00022, n2o: 0.00134 })
    expect(airFactor('long_haul', 'first', false)?.kg_co2e).toBe(0.27701)
    expect(airRecord('long_haul', 'business')).toMatchObject({ sheet: 'Business travel- air', row: 30, cells: { with_rf: 'E30:H30', without_rf: 'I30:L30' } })
  })

  it('DT2 a class the sheet does not publish for a haul is null, not zero and not a fallback', () => {
    expect(airFactor('domestic', 'economy', false)).toBeNull()
    expect(airFactor('domestic', 'business', true)).toBeNull()
    expect(airFactor('short_haul', 'premium_economy', false)).toBeNull()
    expect(airFactor('short_haul', 'first', true)).toBeNull()
    expect(wttAirFactor('domestic', 'first')).toBeNull()
  })

  it('DT3 WTT air by category and class', () => {
    expect(wttAirFactor('domestic', 'average_passenger')).toBe(0.0335)
    expect(wttAirFactor('long_haul', 'economy')).toBe(0.02461)
    expect(wttAirFactor('international_non_uk', 'first')).toBe(0.06623)
  })

  it('DT4 haul for an ISO3 code; unknown codes are null', () => {
    expect(haulForIso3('GBR')).toBe('domestic')
    expect(haulForIso3('jey')).toBe('domestic')
    expect(haulForIso3(' FRA ')).toBe('short_haul')
    expect(haulForIso3('USA')).toBe('long_haul')
    expect(haulForIso3('CAN')).toBe('long_haul')
    expect(haulForIso3('ZZZ')).toBeNull()
    expect(haulForIso3('')).toBeNull()
    expect(haulForIso3('constructor')).toBeNull()
  })

  it('DT5 hotel factor by country; a listed country without a factor is null, and so is an unlisted one', () => {
    expect(hotelFactor('United States')).toBe(16.1)
    expect(hotelFactor('UK')).toBe(10.4)
    expect(hotelFactor('UK (London)')).toBe(11.5)
    expect(hotelFactor('Ireland')).toBeNull()
    expect(hotelRecord('Ireland')).toMatchObject({ country: 'Ireland', kg_co2e_per_room_night: null, cells: { value: 'D48' } })
    expect(hotelFactor('Atlantis')).toBeNull()
    expect(hotelRecord('Atlantis')).toBeNull()
    expect(hotelFactor('__proto__')).toBeNull()
    expect(DEFRA_TRAVEL_META.hotel_countries_without_factor).toContain('Ireland')
  })

  it('DT6 rail and WTT rail by type; an unknown type is null', () => {
    expect(RAIL_TYPES).toEqual(['National rail', 'International rail', 'Light rail and tram', 'London Underground'])
    expect(railFactor('National rail')).toEqual({ kg_co2e: 0.03092, co2: 0.03056, ch4: 0.00008, n2o: 0.00028 })
    expect(wttRailFactor('National rail')).toBe(0.00897)
    expect(wttRailFactor('International rail')).toBe(0.00117)
    expect(railFactor('Maglev')).toBeNull()
    expect(wttRailFactor('Maglev')).toBeNull()
  })
})
