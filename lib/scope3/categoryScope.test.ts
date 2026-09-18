import { describe, it, expect } from 'vitest'
import sectors from '../emissionFactors/exiobaseSectors.json'
import { SCOPE_FAMILIES, familyFor, inScopeFor, scopeNote, outOfScopeDisclosure, CATEGORY_SCOPE_LABEL, type SpendCategoryId } from './categoryScope'

const PRODUCTS = (sectors.products as { exio_code: string; exio_name: string }[]).map(p => p.exio_code)
const INDUSTRIES = (sectors.industries as { exio_code: string; exio_name: string }[]).map(i => i.exio_code)
const inScope = (cat: SpendCategoryId, codes: string[]) => codes.filter(c => inScopeFor(cat, c))

describe('Scope 3 category scoping of the EXIOBASE lists', () => {
  it('SC1 every family still matches rows in the artefact, in both tables', () => {
    // ⚠️ THE POINT OF PREFIX FAMILIES: an EXIOBASE renumbering that orphans a rule fails here rather
    // than silently excluding nothing and quietly widening a picker.
    for (const f of SCOPE_FAMILIES) {
      expect(PRODUCTS.filter(c => familyFor(c)?.id === f.id).length, `${f.id} matches no product`).toBeGreaterThan(0)
      expect(INDUSTRIES.filter(c => familyFor(c)?.id === f.id).length, `${f.id} matches no industry`).toBeGreaterThan(0)
    }
  })

  it('SC2 the counts per category, in the table each picker actually reads', () => {
    // Recorded so a change to a family is visible as a number and not only as prose. Cat 1 and Cat 4 price
    // from the 163 INDUSTRIES, Cat 2 from the 200 PRODUCTS; both tables are counted because one rule serves
    // both and a family that drifts in one would otherwise hide in the other.
    expect({
      cat1: inScope('cat1', INDUSTRIES).length,
      cat2: inScope('cat2', PRODUCTS).length,
      cat4: inScope('cat4', INDUSTRIES).length,
    }).toEqual({ cat1: 103, cat2: 10, cat4: 8 })
    expect({ industries: INDUSTRIES.length, products: PRODUCTS.length }).toEqual({ industries: 163, products: 200 })
    // ⚠️ THE OUT-OF-SCOPE ROWS ARE REACHABLE, NOT GONE: "show all" offers the full table in every category.
    expect(inScope('cat2', PRODUCTS).length).toBeLessThan(PRODUCTS.length)
  })

  it('SC3 ⚠️ capital equipment stays in Cat 1: the split is by accounting treatment, not product', () => {
    for (const code of ['p29', 'p30', 'p34', 'p36']) {
      expect(inScopeFor('cat1', code), `${code} in Cat 1`).toBe(true)
      expect(inScopeFor('cat2', code), `${code} in Cat 2`).toBe(true)
    }
    expect(scopeNote('cat1', 'p30')).toBeNull()
  })

  it('SC4 construction work is a Cat 2 capital good, and renting is Cat 8', () => {
    expect(inScopeFor('cat2', 'p45')).toBe(true)
    expect(inScopeFor('cat1', 'p45')).toBe(true)
    // p45.w reads as construction but is a secondary material; the suffix family claims it first.
    expect(familyFor('p45.w')?.id).toBe('secondary_material')
    expect(inScopeFor('cat2', 'p45.w')).toBe(false)
    for (const cat of ['cat1', 'cat2', 'cat4'] as SpendCategoryId[]) expect(inScopeFor(cat, 'p71'), `p71 in ${cat}`).toBe(false)
    expect(scopeNote('cat2', 'p71')).toContain('Category 8')
  })

  it('SC5 the boundaries that belong to other categories are out of all three, each naming its owner', () => {
    const owners: [string, string][] = [
      ['p90.1.d', 'Category 5'],    // the waste treatment row that priced as capital goods
      ['p40.11.a', 'Scope 2'],      // electricity generation
      ['p40.13', 'Scope 2'],        // distribution and trade of electricity
      ['p23.20.a', 'Scope 1'],      // motor gasoline
      ['p27.a.w', 'cannot be priced'],
    ]
    for (const [code, owner] of owners) {
      for (const cat of ['cat1', 'cat2', 'cat4'] as SpendCategoryId[]) expect(inScopeFor(cat, code), `${code} in ${cat}`).toBe(false)
      expect(scopeNote('cat1', code), code).toContain(owner)
    }
  })

  it('SC6 ⚠️ the joint rows are labelled, never removed', () => {
    // Exclusion cannot separate what EXIOBASE puts in one row, so these carry a note in the category
    // that DOES offer them — and are still offered.
    expect(inScopeFor('cat4', 'p62')).toBe(true)
    expect(scopeNote('cat4', 'p62')).toContain('does not separate freight from passenger')
    expect(inScopeFor('cat1', 'p55')).toBe(true)
    expect(scopeNote('cat1', 'p55')).toContain('accommodation for business travel belongs in Category 6')
    expect(inScopeFor('cat1', 'p64')).toBe(true)
    expect(inScopeFor('cat4', 'p64')).toBe(true)
    expect(scopeNote('cat4', 'p64')).toContain('phone bill and a courier invoice')
  })

  it('SC7 transport services are Cat 4 only, and Cat 4 is only transport services', () => {
    expect(inScope('cat4', PRODUCTS).sort()).toEqual(['p60.1', 'p60.2', 'p60.3', 'p61.1', 'p61.2', 'p62', 'p63', 'p64'].sort())
    // Seven transport rows plus the joint post-and-telecom row. Small enough that the customer whose
    // carrier is not one of them WILL reach for "show all" — which is why it is a control, not a hidden path.
    for (const code of ['p60.1', 'p62']) expect(inScopeFor('cat1', code), code).toBe(false)
    expect(scopeNote('cat1', 'p62')).toContain('Category 4')
  })

  it('SC8 one rule serves both tables: the industry twin of every scoped product scopes the same', () => {
    for (const code of ['p90.1.d', 'p40.11.a', 'p62', 'p45', 'p29', 'p71']) {
      const twin = `i${code.slice(1)}`
      if (!INDUSTRIES.includes(twin)) continue
      for (const cat of ['cat1', 'cat2', 'cat4'] as SpendCategoryId[]) {
        expect(inScopeFor(cat, twin), `${twin} in ${cat}`).toBe(inScopeFor(cat, code))
      }
    }
  })

  it('SC9 every scoped category names what it buys, for the label on its picker', () => {
    // ⚠️ THE TOGGLE'S LABEL HAS TO STATE WHICH LIST IS ON SCREEN, so every category that scopes a picker
    // needs the phrase. A category added to SpendCategoryId without one fails tsc on the Record; this
    // checks the phrases read as the sentence the button composes.
    for (const cat of ['cat1', 'cat2', 'cat4'] as SpendCategoryId[]) {
      expect(`Showing the products usual for ${CATEGORY_SCOPE_LABEL[cat]} — show every EXIOBASE product`)
        .toMatch(/^Showing the products usual for \S.*— show every EXIOBASE product$/)
    }
    expect(CATEGORY_SCOPE_LABEL.cat2).toBe('capital goods')
  })

  it('SC10 ⚠️ an out-of-scope choice is disclosed, not blocked, and an in-scope one says nothing', () => {
    const d = outOfScopeDisclosure('cat2', 'p90.1.d')!
    expect(d).toContain('waste treatment')
    expect(d).toContain('Category 5')
    expect(d).toContain('included as entered')
    expect(outOfScopeDisclosure('cat2', 'p29')).toBeNull()
    expect(outOfScopeDisclosure('cat2', '')).toBeNull()
  })
})
