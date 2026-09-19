import { describe, it, expect } from 'vitest'
import {
  carFactor, carRecord, wttCarFactor, motorbikeFactor, wttMotorbikeFactor, taxiFactor, wttTaxiFactor,
  busFactor, wttBusFactor, homeworkingFactor, railFactor,
  CAR_SIZES, CAR_FUELS, MOTORBIKE_SIZES, TAXI_TYPES, BUS_TYPES,
} from './defraTravel'

// The reader's Category 7 contract: the published figure, or null (never zero, never a neighbour) for
// anything the sheets do not publish.

describe('defraTravel reader, Category 7', () => {
  it('DC1 cars by size and fuel, per vehicle-km, with the cells they came from', () => {
    expect(carFactor('average', 'unknown')).toEqual({ kg_co2e: 0.16591, co2: 0.16474, ch4: 0.00019, n2o: 0.00098 })
    expect(carFactor('small', 'battery_electric')?.kg_co2e).toBe(0.02712)
    expect(carRecord('large', 'petrol')).toMatchObject({ sheet: 'Business travel- land', row: 51, cells: { values: 'H51:K51' } })
    expect(wttCarFactor('average', 'unknown')).toBe(0.04399)
    expect(wttCarFactor('medium', 'diesel')).toBe(0.04103)
  })

  it('DC2 a size and fuel the sheet does not publish is null, not zero and not the next size', () => {
    expect(carFactor('small', 'cng')).toBeNull()
    expect(carFactor('small', 'lpg')).toBeNull()
    expect(wttCarFactor('small', 'cng')).toBeNull()
    expect(carFactor('tiny', 'petrol')).toBeNull()
    expect(carFactor('average', 'hydrogen')).toBeNull()
    expect(carFactor('__proto__', 'constructor')).toBeNull()
  })

  it('DC3 motorbikes, taxis (both bases), buses and the coach', () => {
    expect(motorbikeFactor('average')?.kg_co2e).toBe(0.11367)
    expect(wttMotorbikeFactor('average')).toBe(0.02956)
    expect(taxiFactor('regular', 'passenger_km')?.kg_co2e).toBe(0.14861)
    expect(taxiFactor('regular', 'vehicle_km')?.kg_co2e).toBe(0.20806)
    expect(wttTaxiFactor('black_cab', 'vehicle_km')).toBe(0.07634)
    expect(busFactor('average_local')?.kg_co2e).toBe(0.10151)
    expect(busFactor('coach')?.kg_co2e).toBe(0.03948)
    expect(wttBusFactor('coach')).toBe(0.00656)
    expect(motorbikeFactor('huge')).toBeNull()
    expect(busFactor('tram')).toBeNull()
  })

  it('DC4 homeworking per FTE working hour, and rail is unchanged', () => {
    expect(homeworkingFactor('office_equipment')).toBe(0.02159)
    expect(homeworkingFactor('heating')).toBe(0.30234)
    expect(homeworkingFactor('combined')).toBe(0.32393)
    expect(homeworkingFactor('cooling')).toBeNull()
    expect(railFactor('National rail')?.kg_co2e).toBe(0.03092)
  })

  it('DC5 the option lists, in the sheet\'s order', () => {
    expect(CAR_SIZES).toEqual(['small', 'medium', 'large', 'average'])
    expect(CAR_FUELS).toEqual(['diesel', 'petrol', 'hybrid', 'cng', 'lpg', 'unknown', 'plug_in_hybrid', 'battery_electric'])
    expect(MOTORBIKE_SIZES).toEqual(['small', 'medium', 'large', 'average'])
    expect(TAXI_TYPES).toEqual(['regular', 'black_cab'])
    expect(BUS_TYPES).toEqual(['local_not_london', 'local_london', 'average_local', 'coach'])
  })
})
