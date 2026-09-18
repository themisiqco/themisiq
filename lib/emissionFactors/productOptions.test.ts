import { describe, it, expect } from 'vitest'
import sectors from './exiobaseSectors.json'
import { PRODUCT_OPTION_GROUPS, PRODUCT_CODES, productName } from './productOptions'

describe('EXIOBASE product options', () => {
  it('PO1 every one of the 200 products appears exactly once', () => {
    const codes = PRODUCT_OPTION_GROUPS.flatMap(g => g.products.map(p => p.code))
    expect(codes).toHaveLength(200)
    expect(new Set(codes).size).toBe(200)
    expect(PRODUCT_CODES.size).toBe(200)
  })

  it('PO2 the groups are EXIOBASE\'s own consumption categories, not ours', () => {
    const published = new Set((sectors.products as { consumption_category: string }[])
      .map(p => p.consumption_category.replace(/_/g, ' ')))
    expect(new Set(PRODUCT_OPTION_GROUPS.map(g => g.heading))).toEqual(published)
    expect(PRODUCT_OPTION_GROUPS).toHaveLength(8)
  })

  it('PO3 products keep EXIOBASE numbering within a group, and its names verbatim', () => {
    for (const g of PRODUCT_OPTION_GROUPS) {
      expect(g.products.map(p => p.number), g.heading).toEqual([...g.products.map(p => p.number)].sort((a, b) => a - b))
    }
    expect(productName('p01.a')).toBe('Paddy rice')
  })

  it('PO4 an unknown code renders as itself rather than blank', () => {
    expect(productName('p99.zzz')).toBe('p99.zzz')
    expect(productName('')).toBe('')
  })

  it('PO5 ⚠️ nothing is filtered: the transport and trade services EXIOBASE types as margins are offered', () => {
    const byCode = new Map(PRODUCT_OPTION_GROUPS.flatMap(g => g.products).map(p => [p.code, p]))
    // Excluding non-Commodity rows would have hidden every one of these, and p62 is the natural product
    // for inbound air freight.
    for (const code of ['p60.1', 'p61.1', 'p62', 'p63', 'p50.a', 'p51', 'p52']) {
      expect(byCode.has(code), code).toBe(true)
    }
    expect(byCode.get('p62')?.note).toBe('transport service / margin sector')
    expect(byCode.get('p52')?.note).toBe('trade service / margin sector')
  })

  it('PO6 the 14 waste rows are offered with a note saying they cannot be priced', () => {
    const waste = PRODUCT_OPTION_GROUPS.flatMap(g => g.products).filter(p => p.type === 'Waste')
    expect(waste).toHaveLength(14)
    for (const p of waste) expect(p.note, p.code).toContain('cannot be priced')
    // A plain commodity carries no note at all.
    const commodity = PRODUCT_OPTION_GROUPS.flatMap(g => g.products).filter(p => p.type === 'Commodity')
    expect(commodity).toHaveLength(173)
    expect(commodity.every(p => p.note === null)).toBe(true)
  })
})
