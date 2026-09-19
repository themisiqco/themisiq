import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { priceCommute, priceHomeworking, evaluateCommuting, withDistance, type CommuteRow, type HomeworkingRow, type PricedCommute } from './commuting'

// ⚠️ SEVERAL OF THESE DO NOT COME FROM THE READER'S OWN LOGIC: CC1 is worked by hand from two published
// cells; CC4's band is the fuel-chemistry band of defraTravel2026.commuting.test.ts CT4, and its
// well-to-tank bounds are DEFRA's own fuel-sheet ratios from CT8.

const car = (over: Partial<CommuteRow> = {}): CommuteRow => ({
  id: 'r', mode: 'car', car_size: 'average', car_fuel: 'unknown', country_iso2: 'GB', employees: 1, occupancy: 1,
  days_per_week: 5, weeks_per_year: 46, ...withDistance(20, 'km'), ...over,
})
const priced = (row: CommuteRow): PricedCommute => {
  const p = priceCommute(row)
  if (p.status !== 'priced') throw new Error(`not priced: ${JSON.stringify(p)}`)
  return p
}

describe('Cat 7 commuting', () => {
  it('CC1 one row by hand: the x 2 for the return trip and the division by occupancy', () => {
    // 3 employees in medium diesel cars, 2 to a car, 12 km one way, 4 days a week, 45 weeks.
    //   per commuter: 12 x 2 x 4 x 45 = 4,320 km; passenger-km 3 x 4,320 = 12,960; vehicle-km 12,960 / 2 = 6,480
    //   combustion 6,480 x 0.17209 (Business travel- land D49) = 1,115.1432 kg
    //   well-to-tank 6,480 x 0.04103 (WTT- pass vehs & travel- land D46) = 265.8744 kg
    const p = priced(car({ car_size: 'medium', car_fuel: 'diesel', employees: 3, occupancy: 2, days_per_week: 4, weeks_per_year: 45, ...withDistance(12, 'km') }))
    expect(p.annual_km_per_commuter).toBe(4320)
    expect(p.passenger_km).toBe(12960)
    expect(p.vehicle_km).toBe(6480)
    expect(p.kg.combustion).toBeCloseTo(1115.1432, 6)
    expect(p.kg.wtt).toBeCloseTo(265.8744, 6)
    expect(p.kg.total).toBeCloseTo(1381.0176, 6)
    expect(p.cells).toEqual({ factor: 'Business travel- land!D49:G49', wtt: 'WTT- pass vehs & travel- land!D46' })
    // A per-passenger mode is not divided: 3 bus commuters on the same trip, average local bus 0.10151 (D81).
    const bus = priced(car({ mode: 'bus', bus_type: 'average_local', employees: 3, occupancy: undefined, days_per_week: 4, weeks_per_year: 45, ...withDistance(12, 'km') }))
    expect(bus.vehicle_km).toBeNull()
    expect(bus.kg.combustion).toBeCloseTo(12960 * 0.10151, 6)
  })

  it('CC2 the same distance in miles and in km prices the same', () => {
    const km = priced(car(withDistance(19.312128, 'km')))
    const mi = priced(car(withDistance(12, 'mi')))
    expect(mi.km).toBeCloseTo(km.km, 9)
    expect(mi.kg.total).toBeCloseTo(km.kg.total, 9)
  })

  it('CC3 each missing field unprices the row and names itself', () => {
    const cases: [Partial<CommuteRow>, string][] = [
      [{ mode: '' }, 'mode'],
      [{ country_iso2: '' }, 'country'],
      [{ employees: undefined }, 'employees'],
      [{ employees: 0 }, 'employees'],
      [withDistance(undefined, 'km'), 'distance'],
      [{ days_per_week: undefined }, 'days per week'],
      [{ weeks_per_year: undefined }, 'weeks per year'],
      [{ occupancy: undefined }, 'occupancy'],
      [{ car_size: '' }, 'car size'],
      [{ car_fuel: '' }, 'car fuel'],
    ]
    for (const [over, name] of cases) {
      const p = priceCommute(car(over))
      expect(p.status, name).toBe('incomplete')
      expect(p.status === 'incomplete' && p.missing, name).toContain(name)
    }
    // Nothing is defaulted: no 15 km, no petrol car, no 235 days.
    const blank: CommuteRow = { id: 'b', mode: '', country_iso2: '', employees: undefined, days_per_week: undefined, weeks_per_year: undefined, ...withDistance(undefined, 'km') }
    expect(priceCommute(blank)).toEqual({ status: 'incomplete', missing: ['mode', 'country', 'employees', 'distance', 'days per week', 'weeks per year'] })
    expect(evaluateCommuting({ commute_rows: [blank] })).toMatchObject({ calculated: false, mt: 0 })
    // Occupancy is needed for cars and motorbikes only.
    expect(priced(car({ mode: 'taxi', taxi_type: 'regular', occupancy: undefined })).vehicle_km).toBeNull()
    expect(priceCommute(car({ mode: 'motorbike', motorbike_size: 'average', occupancy: undefined }))).toMatchObject({ status: 'incomplete', missing: ['occupancy'] })
  })

  it('CC3c occupancy may be a decimal average, for cars and motorbikes', () => {
    const c = priced(car({ occupancy: 1.3 }))
    expect(c.occupancy).toBe(1.3)
    expect(c.vehicle_km).toBeCloseTo(9200 / 1.3, 9)
    expect(priced(car({ mode: 'motorbike', motorbike_size: 'average', occupancy: 1.5 })).vehicle_km).toBeCloseTo(9200 / 1.5, 9)
    // The input accepts it: a number input with step="any", not the browser default of 1.
    expect(readFileSync(join(__dirname, '../../app/dashboard/scope3/page.tsx'), 'utf8')).toContain('type="number" min={0} step="any"')
  })

  it('CC3b figures outside what their label can mean are not priced, and say which', () => {
    expect(priceCommute(car({ days_per_week: 8 }))).toEqual({ status: 'invalid', field: 'days per week', limit: 'at most 7' })
    expect(priceCommute(car({ weeks_per_year: 235 }))).toEqual({ status: 'invalid', field: 'weeks per year', limit: 'at most 53' })
    expect(priceCommute(car({ occupancy: 0.5 }))).toEqual({ status: 'invalid', field: 'occupancy', limit: 'between 1 and 7' })
    // The click test's typo: 10 people per car is not a car.
    expect(priceCommute(car({ occupancy: 10 }))).toEqual({ status: 'invalid', field: 'occupancy', limit: 'between 1 and 7' })
    expect(priceCommute(car({ occupancy: 7.1 }))).toEqual({ status: 'invalid', field: 'occupancy', limit: 'between 1 and 7' })
    expect(priceCommute(car({ occupancy: 7 })).status).toBe('priced')
    expect(priceCommute(car({ occupancy: 6.5 })).status).toBe('priced')
    expect(priceCommute(car({ mode: 'motorbike', motorbike_size: 'small', occupancy: 3 }))).toEqual({ status: 'invalid', field: 'occupancy', limit: 'between 1 and 2' })
    expect(priceCommute(car({ distance_km: 99 }))).toEqual({ status: 'distance_mismatch' })
  })

  it('CC4 magnitude: one employee, average car of unknown fuel, alone, 20 km, 5 days, 46 weeks', () => {
    // 20 x 2 x 5 x 46 = 9,200 km. The band is CT4's, per km: fuel of unknown type, so the petrol floor and
    // the diesel ceiling. Petrol floor 3.5 L/100 km x 0.720 x 0.84 x 3.664 kg CO2/L x 0.93 (biofuel blend);
    // diesel ceiling 14 L/100 km x 0.845 x 0.87 x 3.664 x 1.03 (CH4 and N2O).
    const CO2_PER_C = 44.01 / 12.011
    const floor = (3.5 / 100) * (0.720 * 0.84 * CO2_PER_C) * 0.93 * 9200
    const ceiling = (14 / 100) * (0.845 * 0.87 * CO2_PER_C) * 1.03 * 9200
    const p = priced(car())
    expect(p.annual_km_per_commuter).toBe(9200)
    expect(p.kg.combustion).toBeGreaterThanOrEqual(floor)
    expect(p.kg.combustion).toBeLessThanOrEqual(ceiling)
    // Well-to-tank against DEFRA's own fuel sheets (CT8): unknown fuel lies between the diesel and petrol
    // ratios, 0.61101 / 2.58354 and 0.58094 / 2.075, within CT8's 5%.
    const ratio = p.kg.wtt / p.kg.combustion
    expect(ratio).toBeGreaterThan((0.61101 / 2.58354) * 0.95)
    expect(ratio).toBeLessThan((0.58094 / 2.075) * 1.05)
  })

  it('CC5 outside the UK a row is priced and flagged; electric cars and rail say they carry UK electricity', () => {
    const us = priced(car({ country_iso2: 'US' }))
    expect(us.uk_stand_in).toBe(true)
    expect(us.uk_electricity).toBe(false)
    expect(priced(car({ car_fuel: 'battery_electric' }))).toMatchObject({ uk_stand_in: false, uk_electricity: true })
    expect(priced(car({ car_fuel: 'plug_in_hybrid', country_iso2: 'CA' }))).toMatchObject({ uk_stand_in: true, uk_electricity: true })
    expect(priced(car({ mode: 'rail', rail_type: 'National rail', occupancy: undefined, country_iso2: 'US' }))).toMatchObject({ uk_stand_in: true, uk_electricity: true })
    // Walking and cycling use no factor, so nothing stands in.
    expect(priced(car({ mode: 'walk_cycle', occupancy: undefined, country_iso2: 'US' }))).toMatchObject({ kg: { total: 0 }, uk_stand_in: false, cells: null })
  })

  it('CC6 homeworking: a UK row is the combined factor times hours; a row outside the UK is not priced', () => {
    const row: HomeworkingRow = { id: 'h', country_iso2: 'GB', employees: 10, days_per_week: 2, weeks_per_year: 46, hours_per_day: 7.5 }
    const uk = priceHomeworking(row)
    // 10 x 2 x 46 x 7.5 = 6,900 FTE hours x 0.32393 (Homeworking C24) = 2,235.117 kg
    expect(uk).toMatchObject({ status: 'priced', hours: 6900, factor: 0.32393, cell: 'Homeworking!C24' })
    expect(uk.status === 'priced' && uk.kg).toBeCloseTo(2235.117, 6)
    expect(priceHomeworking({ ...row, country_iso2: 'US' })).toEqual({ status: 'not_uk', country_iso2: 'US' })
    // The country reason comes first: a non-UK row says so before anything else is entered, and whatever
    // else is missing or out of range.
    const bareUs: HomeworkingRow = { id: 'b', country_iso2: 'US', employees: undefined, days_per_week: undefined, weeks_per_year: undefined, hours_per_day: undefined }
    expect(priceHomeworking(bareUs)).toEqual({ status: 'not_uk', country_iso2: 'US' })
    expect(priceHomeworking({ ...row, country_iso2: 'CA', hours_per_day: 30 })).toEqual({ status: 'not_uk', country_iso2: 'CA' })
    // With no country yet, the row still lists what is missing, country first.
    expect(priceHomeworking({ ...bareUs, country_iso2: '' })).toEqual({ status: 'incomplete', missing: ['country', 'employees', 'homeworking days per week', 'weeks per year', 'hours per day'] })
    expect(priceHomeworking({ ...row, hours_per_day: undefined })).toEqual({ status: 'incomplete', missing: ['hours per day'] })
    expect(priceHomeworking({ ...row, hours_per_day: 30 })).toMatchObject({ status: 'invalid', field: 'hours per day' })
    // Only a US homeworking row: nothing is priced, so the category is not calculated.
    expect(evaluateCommuting({ homeworking_rows: [{ ...row, country_iso2: 'US' }] })).toMatchObject({ calculated: false, mt: 0 })
    const both = evaluateCommuting({ commute_rows: [car()], homeworking_rows: [row] })
    expect(both.kg.total).toBeCloseTo(both.kg.combustion + both.kg.wtt + both.kg.homeworking, 9)
    expect(both.mt).toBeCloseTo(both.kg.total / 1000, 12)
  })
})
