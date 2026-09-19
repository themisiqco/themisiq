import { describe, it, expect } from 'vitest'
import { rowPricedResult, type RowPricedData } from './rowPriced'
import { evaluateWasteRows } from './wasteRows'
import { evaluateEolMaterials } from './endOfLife'
import { coverageEntry, scope3Status } from './categoryStatus'
import { evaluateBusinessTravel, withDistance } from './businessTravel'

const cat5Rows = [
  { id: 'r1', activity: 'Metal', waste_type: 'Metal: scrap metal', route: 'Closed-loop', tonnes: 5 },
  { id: 'r2', activity: 'Refuse', waste_type: 'Household residual waste', route: 'Landfill', tonnes: 2 },
]
const cat12Materials = [
  { id: 'm1', activity: 'Paper', waste_type: 'Paper and board: paper', tonnes: 10, shares: { Landfill: 70, 'Closed-loop': 30 } },
]
const cat6Flights = [
  { id: 'f1', origin_iso2: 'GB', destination_iso2: 'US', cabin_class: 'economy' as const, count: 2, ...withDistance(5570, 'km') },
]
const cat6Rail = [{ id: 'r1', country_iso2: 'FR', rail_type: 'International rail', passengers: 1, ...withDistance(300, 'km') }]
const coverageOf = (data: Record<string, RowPricedData>, id: string) => {
  const r = rowPricedResult(data, id)!
  return coverageEntry(scope3Status(true, r.calculated), { mt: r.calculated ? Number(r.mt.toFixed(4)) : null, unpriced: false, reason: null })
}

describe('row-priced categories: each figure moves only with its own data', () => {
  it('R1 ⚠️ ISOLATION: Cat 5 and Cat 12 with different data each report only their own', () => {
    const both: Record<string, RowPricedData> = { cat5: { wasteRows: cat5Rows }, cat12: { eolMaterials: cat12Materials } }
    expect(rowPricedResult(both, 'cat5')!.mt).toBe(evaluateWasteRows(cat5Rows).mt)
    expect(rowPricedResult(both, 'cat12')!.mt).toBe(evaluateEolMaterials(cat12Materials).mt)
    expect(rowPricedResult(both, 'cat5')!.mt).not.toBe(rowPricedResult(both, 'cat12')!.mt)
  })

  it('R2 ⚠️ removing one category\'s data changes nothing about the other: figure, calculated, coverage', () => {
    const both: Record<string, RowPricedData> = { cat5: { wasteRows: cat5Rows }, cat12: { eolMaterials: cat12Materials } }
    const only5: Record<string, RowPricedData> = { cat5: { wasteRows: cat5Rows } }
    const only12: Record<string, RowPricedData> = { cat12: { eolMaterials: cat12Materials } }
    expect(rowPricedResult(only5, 'cat5')).toEqual(rowPricedResult(both, 'cat5'))
    expect(rowPricedResult(only12, 'cat12')).toEqual(rowPricedResult(both, 'cat12'))
    expect(coverageOf(only5, 'cat5')).toEqual(coverageOf(both, 'cat5'))
    expect(coverageOf(only12, 'cat12')).toEqual(coverageOf(both, 'cat12'))
    // And the absent one is not calculated, with no figure: Cat 5's rows do not make Cat 12 "calculated".
    expect(rowPricedResult(only5, 'cat12')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult(only12, 'cat5')).toEqual({ mt: 0, calculated: false })
    expect(coverageOf(only5, 'cat12')).toMatchObject({ status: 'relevant_not_calculated', mt: null, in_total: false })
  })

  it('R3 ⚠️ each category reads only its own FIELD: Cat 5 rows stored under Cat 12, or the reverse, price nothing', () => {
    const crossed = { cat5: { eolMaterials: cat12Materials }, cat12: { wasteRows: cat5Rows } } as Record<string, RowPricedData>
    expect(rowPricedResult(crossed, 'cat5')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult(crossed, 'cat12')).toEqual({ mt: 0, calculated: false })
  })

  it('R5 ⚠️ ISOLATION: Cat 6 reports only its own flights and rail, beside Cat 5 and Cat 12 data', () => {
    const all: Record<string, RowPricedData> = {
      cat5: { wasteRows: cat5Rows }, cat6: { flights: cat6Flights, rail_journeys: cat6Rail }, cat12: { eolMaterials: cat12Materials },
    }
    const only6: Record<string, RowPricedData> = { cat6: { flights: cat6Flights, rail_journeys: cat6Rail } }
    expect(rowPricedResult(all, 'cat6')!.mt).toBe(evaluateBusinessTravel({ flights: cat6Flights, rail_journeys: cat6Rail }).mt)
    expect(rowPricedResult(only6, 'cat6')).toEqual(rowPricedResult(all, 'cat6'))
    expect(coverageOf(only6, 'cat6')).toEqual(coverageOf(all, 'cat6'))
    // Cat 6's rows do not make Cat 5 or Cat 12 calculated, and theirs do not make Cat 6 calculated.
    expect(rowPricedResult(only6, 'cat5')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult(only6, 'cat12')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult({ cat5: { wasteRows: cat5Rows }, cat12: { eolMaterials: cat12Materials } }, 'cat6')).toEqual({ mt: 0, calculated: false })
    // Cat 6's fields stored under another category price nothing there.
    expect(rowPricedResult({ cat5: { flights: cat6Flights } }, 'cat5')).toEqual({ mt: 0, calculated: false })
    // The radiative forcing setting is Cat 6's own.
    const off: Record<string, RowPricedData> = { cat6: { flights: cat6Flights, include_rf: false }, cat5: { include_rf: true } }
    expect(rowPricedResult(off, 'cat6')!.mt).toBe(evaluateBusinessTravel({ flights: cat6Flights, include_rf: false }).mt)
  })

  it('R6 ⚠️ ISOLATION: Cat 6 and Cat 7 each report only their own data', () => {
    const cat7 = { commute_rows: [{ id: 'c', mode: 'car' as const, car_size: 'average' as const, car_fuel: 'unknown' as const, country_iso2: 'GB',
      employees: 2, occupancy: 1, days_per_week: 5, weeks_per_year: 46, ...withDistance(20, 'km') }] }
    const both: Record<string, RowPricedData> = { cat6: { flights: cat6Flights, rail_journeys: cat6Rail }, cat7 }
    const only6: Record<string, RowPricedData> = { cat6: { flights: cat6Flights, rail_journeys: cat6Rail } }
    const only7: Record<string, RowPricedData> = { cat7 }
    expect(rowPricedResult(only6, 'cat6')).toEqual(rowPricedResult(both, 'cat6'))
    expect(rowPricedResult(only7, 'cat7')).toEqual(rowPricedResult(both, 'cat7'))
    expect(coverageOf(only6, 'cat6')).toEqual(coverageOf(both, 'cat6'))
    expect(coverageOf(only7, 'cat7')).toEqual(coverageOf(both, 'cat7'))
    expect(rowPricedResult(only6, 'cat7')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult(only7, 'cat6')).toEqual({ mt: 0, calculated: false })
    // Each category's fields stored under the other price nothing there.
    expect(rowPricedResult({ cat6: cat7, cat7: { flights: cat6Flights } } as Record<string, RowPricedData>, 'cat6')).toEqual({ mt: 0, calculated: false })
    expect(rowPricedResult({ cat6: cat7, cat7: { flights: cat6Flights } } as Record<string, RowPricedData>, 'cat7')).toEqual({ mt: 0, calculated: false })
  })

  it('R4 categories priced another way are not row-priced', () => {
    for (const id of ['cat1', 'cat3', 'cat8', 'cat15']) expect(rowPricedResult({}, id), id).toBeNull()
  })
})
