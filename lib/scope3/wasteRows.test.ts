import { describe, it, expect } from 'vitest'
import { evaluateWasteRows, wasteRowNotPricedReason, type WasteRow } from './wasteRows'

const row = (id: string, activity: string, waste_type: string, route: string, tonnes: number): WasteRow =>
  ({ id, activity, waste_type, route, tonnes })

describe('evaluateWasteRows', () => {
  it('WR1 takes rows as its only input and reads no page state', () => {
    expect(evaluateWasteRows.length).toBe(1)
    const empty = evaluateWasteRows(undefined)
    expect(empty).toEqual({ evaluated: [], priced: [], notPriced: [], kg: 0, mt: 0 })
    expect(evaluateWasteRows([])).toEqual(empty)
  })

  it('WR2 numbers rows from 1 in entry order and partitions them into priced and not priced', () => {
    const r = evaluateWasteRows([
      row('a', 'Metal', 'Metal: scrap metal', 'Closed-loop', 5),
      row('b', 'Construction', 'Wood', '', 3),
      row('c', 'Construction', 'Asbestos', 'Open-loop', 1),
      row('d', 'Paper', 'Paper and board: board', 'Composting', 0),
    ])
    expect(r.evaluated.map(e => [e.row.id, e.n, e.pricing.status])).toEqual([
      ['a', 1, 'priced'], ['b', 2, 'incomplete'], ['c', 3, 'no_factor'], ['d', 4, 'incomplete'],
    ])
    expect(r.priced.map(e => e.n)).toEqual([1])
    expect(r.notPriced.map(e => e.n)).toEqual([2, 3, 4])
  })

  it('WR3 ⚠️ a row that cannot be priced is not in the figure, and is not counted as zero', () => {
    const one = evaluateWasteRows([row('a', 'Metal', 'Metal: scrap metal', 'Closed-loop', 5)])
    const withJunk = evaluateWasteRows([
      row('a', 'Metal', 'Metal: scrap metal', 'Closed-loop', 5),
      row('b', 'Construction', 'Asbestos', 'Open-loop', 1000),
    ])
    expect(withJunk.kg).toBe(one.kg)
    expect(withJunk.notPriced).toHaveLength(1)
    expect(wasteRowNotPricedReason(withJunk.notPriced[0].row, withJunk.notPriced[0].pricing))
      .toBe('the sheet publishes no Open-loop factor for Asbestos (Construction), so it is not counted, and not counted as zero')
  })

  it('WR4 kg is the sum of the priced rows, and mt is kg / 1000', () => {
    const r = evaluateWasteRows([
      row('a', 'Paper', 'Paper and board: paper', 'Landfill', 10),
      row('b', 'Plastic', 'Plastics: average plastics', 'Combustion', 2),
    ])
    expect(r.kg).toBe(r.priced[0].pricing.kg_co2e + r.priced[1].pricing.kg_co2e)
    expect(r.mt).toBe(r.kg / 1000)
  })

  it('WR5 ⚠️ MAGNITUDE, FROM OUTSIDE THE READER: 10 t of paper to landfill is between 3.4 and 83 t CO2e', () => {
    // The bounds come from chemistry and IPCC defaults, not from the DEFRA sheet or the code under test.
    //   CEILING, 8.31 t CO2e per tonne, physically unreachable. Cellulose (C6H10O5) is 72.06 / 162.14 =
    //   44.4% carbon. Complete anaerobic decay splits that carbon at most 50/50 between CH4 and CO2
    //   (C6H10O5 + H2O -> 3 CH4 + 3 CO2), so at most 0.4444 x 0.5 x 16.04 / 12.01 = 0.297 t CH4 per
    //   tonne; at the AR5 GWP100 of 28 (the sheet's own basis) that is 8.31 t CO2e, with no capture and no
    //   oxidation at all. x 10 t = 83.1.
    //   FLOOR, 0.336 t CO2e per tonne. IPCC 2006 (Vol 5 Ch 3) defaults for paper: DOC 0.40, DOCf 0.5,
    //   MCF 1.0, F 0.5 -> 0.40 x 0.5 x 1.0 x 0.5 x 16/12 = 0.133 t CH4 generated = 3.73 t CO2e; even with
    //   90% of the gas captured and 10% of the rest oxidised, 0.336 t remains. x 10 t = 3.36.
    // What it catches: a kg/t slip either way (x1000 -> ~11,645 t; /1000 -> ~0.012 t), and a route read
    // from the wrong column (paper's combustion and closed-loop factors are ~4.7 kg/t -> ~0.047 t).
    const r = evaluateWasteRows([row('a', 'Paper', 'Paper and board: paper', 'Landfill', 10)])
    expect(r.mt).toBeGreaterThan(3.36)
    expect(r.mt).toBeLessThan(83.1)
  })
})
