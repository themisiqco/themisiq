import { describe, it, expect } from 'vitest'
import { rowPricedResult, type RowPricedData } from './rowPriced'
import { evaluateWasteRows } from './wasteRows'
import { evaluateEolMaterials } from './endOfLife'
import { coverageEntry, scope3Status } from './categoryStatus'

const cat5Rows = [
  { id: 'r1', activity: 'Metal', waste_type: 'Metal: scrap metal', route: 'Closed-loop', tonnes: 5 },
  { id: 'r2', activity: 'Refuse', waste_type: 'Household residual waste', route: 'Landfill', tonnes: 2 },
]
const cat12Materials = [
  { id: 'm1', activity: 'Paper', waste_type: 'Paper and board: paper', tonnes: 10, shares: { Landfill: 70, 'Closed-loop': 30 } },
]
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

  it('R4 categories priced another way are not row-priced', () => {
    for (const id of ['cat1', 'cat3', 'cat6', 'cat15']) expect(rowPricedResult({}, id), id).toBeNull()
  })
})
