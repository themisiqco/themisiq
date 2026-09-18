import { describe, it, expect } from 'vitest'
import data from './defraWaste2026.json'
import {
  WASTE_MATERIAL_GROUPS, wasteRoutesFor, wasteFactor, wasteMethodFor, wasteMaterialKey, parseWasteMaterialKey,
  withoutListMarker, UNSORTED_STREAM_NAMES, DEFRA_WASTE_META, NOT_A_DISPOSAL_ROUTE, priceWasteRow,
} from './defraWaste'

const factors = data.factors as { activity: string; waste_type: string; route: string; value: number }[]

describe('defraWaste reader', () => {
  it('D1 42 materials under the seven activity blocks, in sheet order', () => {
    expect(WASTE_MATERIAL_GROUPS.map(g => [g.activity, g.materials.length])).toEqual([
      ['Construction', 13], ['Other', 3], ['Refuse', 5], ['Electrical items', 5], ['Metal', 4], ['Plastic', 9], ['Paper', 3],
    ])
    expect(WASTE_MATERIAL_GROUPS.flatMap(g => g.materials)).toHaveLength(42)
  })

  it('D2 every material offers exactly the routes it publishes, never Re-use, and each has a factor', () => {
    for (const g of WASTE_MATERIAL_GROUPS) {
      for (const m of g.materials) {
        const published = factors.filter(f => f.activity === g.activity && f.waste_type === m).map(f => f.route)
        const offered = wasteRoutesFor(g.activity, m)
        expect(offered, m).toEqual(DEFRA_WASTE_META.routes.filter(r => published.includes(r)))
        expect(offered, m).not.toContain(NOT_A_DISPOSAL_ROUTE)
        expect(offered.length, `${m} offers no route`).toBeGreaterThan(0)
        for (const r of offered) expect(wasteFactor(g.activity, m, r), `${m} / ${r}`).toBeGreaterThan(0)
      }
    }
  })

  it('D3 an unpublished route has no factor, not a zero', () => {
    expect(wasteRoutesFor('Construction', 'Tyres')).toEqual(['Closed-loop'])
    expect(wasteFactor('Construction', 'Tyres', 'Landfill')).toBeNull()
    expect(wasteFactor('Refuse', 'Commercial and industrial waste', 'Re-use')).toBeNull()
    expect(wasteFactor('Refuse', 'Commercial and industrial waste', 'Landfill')).toBe(520.58023)
    // The activity is part of the identity: a material under the wrong block has no factor.
    expect(wasteFactor('Other', 'Commercial and industrial waste', 'Landfill')).toBeNull()
    expect(wasteRoutesFor('Refuse', 'Nonexistent')).toEqual([])
  })

  it('D4 the method classification of all 42 materials is pinned', () => {
    const average = WASTE_MATERIAL_GROUPS.flatMap(g => g.materials).filter(m => wasteMethodFor(m).method === 'average_data')
    expect(average).toEqual([
      'Average construction',
      'Household residual waste',
      'Organic: mixed food and garden waste',
      'Commercial and industrial waste',
      'WEEE - mixed',
      'Metal: mixed cans',
      'Plastics: average plastics',
      'Plastics: average plastic film',
      'Plastics: average plastic rigid',
      'Paper and board: mixed',
    ])
  })

  it('D5 the named unsorted streams still exist in the artefact', () => {
    const names = new Set(factors.map(f => f.waste_type))
    for (const s of UNSORTED_STREAM_NAMES) expect(names.has(s), `${s} is no longer in defraWaste2026.json`).toBe(true)
  })

  it('D6 material keys round-trip and reject anything else', () => {
    const k = wasteMaterialKey('Metal', 'Metal: aluminium cans and foil (excl. forming)')
    expect(parseWasteMaterialKey(k)).toEqual({ activity: 'Metal', waste_type: 'Metal: aluminium cans and foil (excl. forming)' })
    expect(parseWasteMaterialKey('')).toBeNull()
    expect(parseWasteMaterialKey('["a"]')).toBeNull()
  })

  it('D7 the guidance lines lose only their list marker', () => {
    expect(DEFRA_WASTE_META.lifecycle_guidance.startsWith('●')).toBe(true)
    expect(withoutListMarker(DEFRA_WASTE_META.lifecycle_guidance)).toBe(DEFRA_WASTE_META.lifecycle_guidance.replace(/^●\s+/, ''))
    expect(withoutListMarker(DEFRA_WASTE_META.lifecycle_guidance)).toMatch(/^These factors cannot be used to determine the relative lifecycle merit/)
    expect(withoutListMarker(DEFRA_WASTE_META.scope_guidance)).toMatch(/^For landfill, the factors in the tables include/)
  })

  it('D8 a row is priced only when complete and published: tonnes x factor in kg', () => {
    expect(priceWasteRow({ activity: 'Refuse', waste_type: 'Commercial and industrial waste', route: 'Landfill', tonnes: 2 }))
      .toEqual({ status: 'priced', factor_kg_per_tonne: 520.58023, kg_co2e: 1041.16046, method: 'average_data' })
    expect(priceWasteRow({ activity: 'Plastic', waste_type: 'Plastics: PET (incl. forming)', route: 'Combustion', tonnes: 1 }))
      .toEqual({ status: 'priced', factor_kg_per_tonne: 4.65358, kg_co2e: 4.65358, method: 'waste_type_specific' })
    expect(priceWasteRow({ activity: '', waste_type: '', route: '', tonnes: 0 })).toEqual({ status: 'incomplete', missing: ['material', 'treatment route', 'tonnes'] })
    expect(priceWasteRow({ activity: 'Construction', waste_type: 'Tyres', route: '', tonnes: 5 })).toEqual({ status: 'incomplete', missing: ['treatment route'] })
    expect(priceWasteRow({ activity: 'Construction', waste_type: 'Tyres', route: 'Closed-loop', tonnes: -1 })).toEqual({ status: 'incomplete', missing: ['tonnes'] })
    expect(priceWasteRow({ activity: 'Construction', waste_type: 'Tyres', route: 'Closed-loop', tonnes: NaN })).toEqual({ status: 'incomplete', missing: ['tonnes'] })
    expect(priceWasteRow({ activity: 'Construction', waste_type: 'Tyres', route: 'Landfill', tonnes: 5 })).toEqual({ status: 'no_factor' })
    expect(priceWasteRow({ activity: 'Construction', waste_type: 'Tyres', route: 'Re-use', tonnes: 5 })).toEqual({ status: 'no_factor' })
  })
})
