import { describe, it, expect } from 'vitest'
import {
  evaluateBusinessTravel, priceFlight, priceRail, flightCategory, resolveClass, withDistance,
  KM_PER_MILE, NON_UK_SHORT_HAUL_FROM_KM, NON_UK_LONG_HAUL_FROM_KM,
  type FlightRow, type RailJourney, type PricedFlight,
} from './businessTravel'
import { RF_CO2_MULTIPLIER } from './businessTravelCopy'

// ⚠️ SEVERAL OF THESE DO NOT COME FROM THE READER'S OWN LOGIC: the boundaries are the EPA Hub's 300 and
// 2,300 miles at the international mile, the radiative forcing multiplier is the sheet's own "increase of
// 70%", and the magnitude band is derived from burning jet fuel, as in defraTravel2026.test.ts T7.

const flight = (o: string, d: string, km: number, cabin: FlightRow['cabin_class'] = 'economy', count = 1): FlightRow =>
  ({ id: `${o}-${d}-${km}`, origin_iso2: o, destination_iso2: d, cabin_class: cabin, count, ...withDistance(km, 'km') })
const priced = (row: FlightRow, rf = true): PricedFlight => {
  const p = priceFlight(row, rf)
  if (p.status !== 'priced') throw new Error(`not priced: ${JSON.stringify(p)}`)
  return p
}

describe('Cat 6 business travel pricing', () => {
  it('BT1 the non-UK bands are 300 and 2,300 international miles, exactly', () => {
    expect(KM_PER_MILE).toBe(1.609344)
    expect(NON_UK_SHORT_HAUL_FROM_KM).toBeCloseTo(300 * 1.609344, 9)
    expect(NON_UK_LONG_HAUL_FROM_KM).toBeCloseTo(2300 * 1.609344, 9)
  })

  it('BT2 the category rule at each boundary, for a flight with neither end in the UK', () => {
    const band = (km: number) => (flightCategory('US', 'CA', km) as { category: string }).category
    expect(band(482.8031)).toBe('domestic')
    expect(band(482.8032)).toBe('short_haul')
    expect(band(3701.4911)).toBe('short_haul')
    expect(band(3701.4912)).toBe('long_haul')
    expect(flightCategory('US', 'CA', 482.8032)).toMatchObject({ ok: true, rule: 'distance_band' })
  })

  it('BT3 a UK to US flight takes the Haul definition sheet\'s haul for the US, whatever the distance', () => {
    expect(flightCategory('GB', 'US', 5570)).toMatchObject({ ok: true, category: 'long_haul', rule: 'uk_end', haul: { iso3: 'USA', haul: 'long_haul' } })
    expect(flightCategory('US', 'GB', 100)).toMatchObject({ ok: true, category: 'long_haul', rule: 'uk_end' })
    // A UK to France flight is short-haul by the sheet, also regardless of distance.
    expect(flightCategory('GB', 'FR', 5000)).toMatchObject({ ok: true, category: 'short_haul', rule: 'uk_end' })
    // The factor read is the sheet's Long-haul, to/from UK row.
    expect(priced(flight('GB', 'US', 5570)).cells.air_without_rf).toBe('Business travel- air!I28:L28')
  })

  it('BT4 a UK domestic flight is domestic, and a UK-end flight to a country the sheet does not list is not priced', () => {
    expect(flightCategory('GB', 'GB', 600)).toEqual({ ok: true, category: 'domestic', rule: 'both_uk' })
    expect(priced(flight('GB', 'GB', 600, 'unknown')).cells.air_with_rf).toBe('Business travel- air!E23:H23')
    // Monaco is in the country picker but not on the Haul definition sheet.
    expect(priceFlight(flight('GB', 'MC', 1000), true)).toEqual({ status: 'no_haul', unlisted_iso2: 'MC' })
    // Without a UK end the sheet is not needed, so the same country prices by distance.
    expect(priced(flight('FR', 'MC', 700)).category).toBe('short_haul')
  })

  it('BT5 Toronto to Vancouver, about 3,358 km, is short-haul; New York to Los Angeles, about 3,944 km, long-haul', () => {
    expect(priced(flight('CA', 'CA', 3358)).category).toBe('short_haul')
    expect(priced(flight('US', 'US', 3944)).category).toBe('long_haul')
  })

  it('BT6 the same distance entered in miles and in km prices identically', () => {
    const inKm = { ...flight('US', 'CA', 0), ...withDistance(1609.344, 'km') }
    const inMi = { ...flight('US', 'CA', 0), ...withDistance(1000, 'mi') }
    expect(inMi.distance).toBe(1000)
    expect(inMi.distance_unit).toBe('mi')
    expect(inMi.distance_km!).toBeCloseTo(1609.344, 9)
    const a = priced(inKm), b = priced(inMi)
    expect(b.category).toBe(a.category)
    expect(b.kg.total).toBeCloseTo(a.kg.total, 9)
    expect(b.kg.with_rf.co2).toBeCloseTo(a.kg.with_rf.co2, 9)
    // A distance that is not a positive number has no km figure, so the row is not priced.
    expect(withDistance(undefined, 'mi').distance_km).toBeUndefined()
    expect(withDistance(0, 'km').distance_km).toBeUndefined()
    expect(withDistance(-5, 'km').distance_km).toBeUndefined()
  })

  it('BT7 radiative forcing changes only the CO2 component, by the sheet\'s 1.70', () => {
    expect(RF_CO2_MULTIPLIER).toBe(1.7)
    for (const row of [flight('GB', 'US', 5570), flight('US', 'CA', 400, 'unknown'), flight('US', 'JP', 9000, 'first')]) {
      const p = priced(row)
      expect(p.kg.with_rf.ch4).toBe(p.kg.without_rf.ch4)
      expect(p.kg.with_rf.n2o).toBe(p.kg.without_rf.n2o)
      // The published components are 5 d.p., so the ratio is 1.70 to within their rounding (see T6).
      expect(p.factor.with_rf.co2 / p.factor.without_rf.co2).toBeCloseTo(1.7, 3)
      expect(p.kg.with_rf.co2 / p.kg.without_rf.co2).toBeCloseTo(1.7, 3)
      // The setting chooses which enters the figure; both are always computed.
      expect(priced(row, true).kg.combustion).toBe(p.kg.with_rf.kg_co2e)
      expect(priced(row, false).kg.combustion).toBe(p.kg.without_rf.kg_co2e)
      expect(priced(row, false).kg.with_rf).toEqual(p.kg.with_rf)
      // Well-to-tank does not move with the setting (WTT- business travel- air A12).
      expect(priced(row, false).kg.wtt).toBe(p.kg.wtt)
    }
  })

  it('BT8 magnitude: one economy passenger, 5,000 km, neither end UK, without RF, lies in the jet-fuel band', () => {
    // Derived as in defraTravel2026.test.ts T7, not from the reader. Jet fuel ~C12H23: carbon fraction
    // 144.13 / 167.31, so 3.15 kg CO2 per kg; 0.8 kg per litre. Economy seat: 1.6 to 6 litres per 100
    // passenger-km; the ceiling raised by the sheet's 8% uplift and 3% for CH4 and N2O.
    const kgCo2PerLitre = 0.8 * ((12 * 12.011) / (12 * 12.011 + 23 * 1.008)) * (44.01 / 12.011)
    const floor = (1.6 / 100) * kgCo2PerLitre * 5000
    const ceiling = (6.0 / 100) * kgCo2PerLitre * 1.08 * 1.03 * 5000
    const p = priced(flight('US', 'JP', 5000, 'economy'), false)
    expect(p.category).toBe('long_haul')
    expect(p.kg.combustion).toBeGreaterThanOrEqual(floor)
    expect(p.kg.combustion).toBeLessThanOrEqual(ceiling)
    // Well-to-tank: extracting, refining and moving jet fuel is a fraction of burning it. Kerosene's own
    // ratio on the Fuels sheets is about 0.21; the band is wide because the published air ratios run to 0.36.
    expect(p.kg.wtt / p.kg.combustion).toBeGreaterThanOrEqual(0.15)
    expect(p.kg.wtt / p.kg.combustion).toBeLessThanOrEqual(0.4)
  })

  it('BT9 cabin class: used where published for the category, otherwise average passenger, and why', () => {
    expect(resolveClass('long_haul', 'premium_economy')).toEqual({ used: 'premium_economy', note: 'as_entered' })
    expect(resolveClass('short_haul', 'premium_economy')).toEqual({ used: 'average_passenger', note: 'not_published' })
    expect(resolveClass('short_haul', 'first')).toEqual({ used: 'average_passenger', note: 'not_published' })
    expect(resolveClass('domestic', 'economy')).toEqual({ used: 'average_passenger', note: 'not_published' })
    expect(resolveClass('long_haul', 'unknown')).toEqual({ used: 'average_passenger', note: 'unknown' })
  })

  it('BT10 a row missing a country, a distance, a count or a class is not priced, and names what is missing', () => {
    expect(priceFlight({ ...flight('', 'US', 1000), cabin_class: '' }, true)).toEqual({ status: 'incomplete', missing: ['origin', 'cabin class'] })
    expect(priceFlight({ ...flight('GB', 'US', 1000), count: 0 }, true)).toEqual({ status: 'incomplete', missing: ['passengers or trips'] })
    expect(priceFlight({ ...flight('GB', 'US', 1000), ...withDistance(undefined, 'km') }, true)).toEqual({ status: 'incomplete', missing: ['distance'] })
    const e = evaluateBusinessTravel({ flights: [{ ...flight('GB', '', 1000) }] })
    expect(e.calculated).toBe(false)
    expect(e.mt).toBe(0)
  })

  it('BT13 a stored km figure that is missing or does not match the entered distance is not priced, and says so', () => {
    const base = flight('US', 'CA', 1000)
    expect(priceFlight({ ...base, distance_km: undefined }, true)).toEqual({ status: 'distance_mismatch' })
    expect(priceFlight({ ...base, distance: 1000, distance_unit: 'mi', distance_km: 1000 }, true)).toEqual({ status: 'distance_mismatch' })
    expect(priceFlight({ ...base, ...withDistance(1000, 'mi') }, true).status).toBe('priced')
    const rail: RailJourney = { id: 'r', country_iso2: 'GB', rail_type: 'National rail', passengers: 1, distance: 50, distance_unit: 'km', distance_km: undefined }
    expect(priceRail(rail)).toEqual({ status: 'distance_mismatch' })
  })

  it('BT11 rail: UK factors everywhere, flagged as a stand-in outside the UK, with well-to-tank added', () => {
    const rail = (c: string, type: string): RailJourney => ({ id: c, country_iso2: c, rail_type: type, passengers: 2, ...withDistance(100, 'km') })
    const fr = priceRail(rail('FR', 'National rail'))
    const gb = priceRail(rail('GB', 'National rail'))
    if (fr.status !== 'priced' || gb.status !== 'priced') throw new Error('rail not priced')
    expect(fr.uk_stand_in).toBe(true)
    expect(gb.uk_stand_in).toBe(false)
    expect(fr.kg.combustion).toBeCloseTo(0.03092 * 200, 9)
    expect(fr.kg.wtt).toBeCloseTo(0.00897 * 200, 9)
    expect(fr.cells).toEqual({ rail: 'Business travel- land!D87:G87', wtt: 'WTT- pass vehs & travel- land!D84' })
    expect(priceRail({ ...rail('GB', 'Maglev') })).toEqual({ status: 'no_factor' })
    expect(priceRail({ ...rail('GB', '') })).toEqual({ status: 'incomplete', missing: ['rail type'] })
  })

  it('BT12 the record: RF is included by default, the setting chooses the total, both air figures are kept', () => {
    const flights = [flight('GB', 'US', 5570, 'economy', 2), flight('US', 'CA', 400, 'business')]
    const rail_journeys = [{ id: 'r', country_iso2: 'FR', rail_type: 'International rail', passengers: 1, ...withDistance(300, 'km') }]
    const on = evaluateBusinessTravel({ flights, rail_journeys })
    const off = evaluateBusinessTravel({ flights, rail_journeys, include_rf: false })
    expect(on.includeRf).toBe(true)
    expect(off.includeRf).toBe(false)
    expect(on.kg.air_with_rf).toBe(off.kg.air_with_rf)
    expect(on.kg.air_without_rf).toBe(off.kg.air_without_rf)
    expect(on.kg.combustion - off.kg.combustion).toBeCloseTo(on.kg.air_with_rf - on.kg.air_without_rf, 9)
    expect(on.kg.wtt).toBe(off.kg.wtt)
    expect(on.mt).toBeCloseTo(on.kg.total / 1000, 12)
    expect(on.calculated).toBe(true)
    expect(on.pricedFlights).toHaveLength(2)
    expect(on.pricedRail).toHaveLength(1)
  })
})
