import { describe, it, expect } from 'vitest'
import { evaluateEolMaterials, eolMaterialNotPricedReason, EOL_SPLIT_TOLERANCE_PP, type EolMaterial } from './endOfLife'
import { evaluateWasteRows } from './wasteRows'

const mat = (id: string, activity: string, waste_type: string, tonnes: number, shares: Record<string, number>): EolMaterial =>
  ({ id, activity, waste_type, tonnes, shares })
const PAPER = ['Paper', 'Paper and board: paper'] as const

describe('Category 12: end-of-life materials, split across routes', () => {
  it('E1 ⚠️ shares summing to 100% price; tonnes per route are derived and priced as Category 5 rows', () => {
    const r = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 60, Combustion: 40 })])
    expect(r.priced).toHaveLength(1)
    expect(r.priced[0].routes.map(x => [x.row.route, x.row.tonnes])).toEqual([['Combustion', 4], ['Landfill', 6]])
    // Identical to Category 5 given the same derived rows: no second pricing path exists.
    const asRows = evaluateWasteRows([
      { id: 'x', activity: PAPER[0], waste_type: PAPER[1], route: 'Combustion', tonnes: 4 },
      { id: 'y', activity: PAPER[0], waste_type: PAPER[1], route: 'Landfill', tonnes: 6 },
    ])
    expect(r.kg).toBe(asRows.kg)
    expect(r.mt).toBe(r.kg / 1000)
  })

  it('E2 ⚠️ shares that do not sum to 100% are not priced, and say why', () => {
    const r = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 60, Combustion: 30 })])
    expect(r.priced).toHaveLength(0)
    expect(r.mt).toBe(0)
    expect(r.notPriced[0].outcome).toEqual({ status: 'split_invalid', sum: 90 })
    expect(eolMaterialNotPricedReason(r.notPriced[0])).toBe(
      'its treatment shares sum to 90%, not 100%, so it is not priced rather than priced on part of its mass')
    // Over 100 is as wrong as under.
    expect(evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 70, Combustion: 40 })]).priced).toHaveLength(0)
    // A negative share never prices, even if the sum comes out at 100.
    expect(evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 110, Combustion: -10 })]).notPriced[0].outcome.status).toBe('split_invalid')
  })

  it(`E3 the tolerance is ${EOL_SPLIT_TOLERANCE_PP} percentage points, and passing shares are used as entered, not rescaled`, () => {
    const thirds = evaluateEolMaterials([mat('a', ...PAPER, 30, { Landfill: 33.3, Combustion: 33.3, 'Closed-loop': 33.3 })])
    expect(thirds.priced).toHaveLength(1)
    // 99.9% of 30 t is priced, not 100%: the customer's shares, exactly as typed.
    expect(thirds.priced[0].routes.reduce((t, x) => t + x.row.tonnes, 0)).toBeCloseTo(29.97, 10)
    expect(evaluateEolMaterials([mat('a', ...PAPER, 30, { Landfill: 33.3, Combustion: 33.3, 'Closed-loop': 33.2 })]).priced).toHaveLength(0)
  })

  it('E4 incomplete materials name what is missing, in form order', () => {
    const r = evaluateEolMaterials([mat('a', '', '', 0, {})])
    expect(r.notPriced[0].outcome).toEqual({ status: 'incomplete', missing: ['material', 'tonnes', 'split'] })
    expect(eolMaterialNotPricedReason(r.notPriced[0])).toBe('material, tonnes, treatment split not entered')
    expect(evaluateEolMaterials(undefined)).toEqual({ evaluated: [], priced: [], notPriced: [], kg: 0, mt: 0 })
  })

  it('E5 ⚠️ a re-use share, or any route the sheet does not publish, leaves the material unpriced; never zero', () => {
    // Re-use is not a disposal route (the sheet's FAQ) and has no factor. The editor never offers it; saved
    // data could still carry one, and it must not count the re-used mass as emitting nothing.
    const reuse = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 80, 'Re-use': 20 })])
    expect(reuse.priced).toHaveLength(0)
    expect(reuse.notPriced[0].outcome).toEqual({ status: 'no_factor', routes: ['Re-use'] })
    expect(eolMaterialNotPricedReason(reuse.notPriced[0])).toContain('publishes no Re-use factor')
    // Paper has no Open-loop factor.
    expect(evaluateEolMaterials([mat('a', ...PAPER, 10, { 'Open-loop': 100 })]).notPriced[0].outcome.status).toBe('no_factor')
  })

  it('E6 one bad material does not stop another from pricing, and is not counted', () => {
    const good = mat('a', ...PAPER, 10, { Landfill: 100 })
    const r = evaluateEolMaterials([good, mat('b', ...PAPER, 99, { Landfill: 50 })])
    expect(r.priced.map(e => e.n)).toEqual([1])
    expect(r.notPriced.map(e => e.n)).toEqual([2])
    expect(r.kg).toBe(evaluateEolMaterials([good]).kg)
  })

  it('E7 ⚠️ MAGNITUDE, FROM OUTSIDE THE READER: 10 t of paper, 100% to landfill, is between 3.36 and 83.1 t CO2e', () => {
    // The same band as WR5, derived from chemistry and IPCC defaults, not from the sheet:
    //   ceiling 8.31 t CO2e per tonne: cellulose is 44.4% carbon, at most half of it can leave as CH4 (0.297 t
    //   CH4 per tonne), at the AR5 GWP100 of 28 with no capture and no oxidation. x 10 t = 83.1.
    //   floor 0.336 t CO2e per tonne: IPCC 2006 defaults for paper (DOC 0.40, DOCf 0.5, MCF 1.0, F 0.5) give
    //   3.73 t CO2e generated; 90% captured and 10% of the rest oxidised leaves 0.336 t. x 10 t = 3.36.
    const r = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 100 })])
    expect(r.mt).toBeGreaterThan(3.36)
    expect(r.mt).toBeLessThan(83.1)
  })

  it('E8 a 50/50 split between landfill and closed-loop recycling lands between the two single-route results', () => {
    const landfill = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 100 })]).mt
    const recycling = evaluateEolMaterials([mat('a', ...PAPER, 10, { 'Closed-loop': 100 })]).mt
    const split = evaluateEolMaterials([mat('a', ...PAPER, 10, { Landfill: 50, 'Closed-loop': 50 })]).mt
    expect(recycling).toBeLessThan(landfill)
    expect(split).toBeGreaterThan(recycling)
    expect(split).toBeLessThan(landfill)
    // And exactly halfway: the split is linear in the shares.
    expect(split).toBeCloseTo((landfill + recycling) / 2, 12)
  })
})
