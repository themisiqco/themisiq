import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scope3MethodFor } from './categoryMethods'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { DEFRA_TRAVEL_META } from '../emissionFactors/defraTravel'
import { CAT15_GWP_TAIL } from './cat15'
import {
  scope3MethodGroups, methodologyHierarchyLines, assistantScope3Basis, assistantScope3GwpClause, categoryHeading,
  SCOPE3_CATEGORY_NAMES, SCOPE3_CATEGORY_NUMBERS,
} from './methodSummary'

const ROOT = join(__dirname, '..', '..')

/** The category numbers a line's HEADING names: "Category 5 (…)" or "Categories 1, 2 and 4 (…)", read from
 *  the text before the first "(" — the part a reader scans. Names carry no digits (SC0), so every digit
 *  found there is a category the line claims to describe. */
function headingNumbers(line: string): number[] {
  const m = line.match(/^Categor(?:y|ies) ([^(]+)\(/)
  return m ? (m[1].match(/\d+/g) ?? []).map(Number) : []
}

/** Every category number named in a clause heading anywhere in a prompt clause. */
function promptNumbers(clause: string): number[] {
  return [...clause.matchAll(/Categor(?:y|ies) ([\d, and]+?) \(/g)].flatMap(m => (m[1].match(/\d+/g) ?? []).map(Number))
}

describe('Scope 3 method summary: every category, under the method that prices it', () => {
  it('SM0 no category name contains a digit, so a heading\'s digits are its categories', () => {
    for (const n of SCOPE3_CATEGORY_NUMBERS) expect(SCOPE3_CATEGORY_NAMES[n], `cat ${n}`).not.toMatch(/\d/)
    expect(Object.keys(SCOPE3_CATEGORY_NAMES).map(Number)).toEqual([...SCOPE3_CATEGORY_NUMBERS])
  })

  it('SM1 the groups partition categories 1 to 15, each under scope3MethodFor', () => {
    const seen = scope3MethodGroups().flatMap(g => g.categories.map(n => {
      expect(g.method, `cat ${n}`).toBe(scope3MethodFor(`cat${n}`))
      return n
    }))
    expect([...seen].sort((a, b) => a - b)).toEqual([...SCOPE3_CATEGORY_NUMBERS])
  })

  it('SM2 ⚠️ every category 1 to 15 appears in the methodology hierarchy EXACTLY ONCE', () => {
    // The regression this exists for: Categories 2 and 4 moved to EXIOBASE and appeared on no line, because
    // one line was hand-typed for Category 1 and only the flat line was derived.
    const [intro, ...lines] = methodologyHierarchyLines()
    expect(headingNumbers(intro)).toEqual([])
    const counts = new Map<number, number>()
    for (const line of lines) for (const n of headingNumbers(line)) counts.set(n, (counts.get(n) ?? 0) + 1)
    for (const n of SCOPE3_CATEGORY_NUMBERS) expect(counts.get(n) ?? 0, `category ${n}`).toBe(1)
    expect([...counts.keys()].every(n => n >= 1 && n <= 15)).toBe(true)
    // Every line after the intro has a heading; none is prose that escaped the grouping.
    for (const line of lines) expect(headingNumbers(line).length, line.slice(0, 60)).toBeGreaterThan(0)
  })

  it('SM3 Categories 2 and 4 are on the EXIOBASE line, beside Category 1', () => {
    const exiobase = methodologyHierarchyLines().find(l => l.includes('EXIOBASE'))!
    expect(headingNumbers(exiobase)).toEqual([1, 2, 4])
    // Supplier-specific figures are Category 1's alone, and the line says so rather than implying all three.
    expect(exiobase).toContain('For Category 1, supplier-specific figures')
  })

  it('SM4 ⚠️ every category 1 to 15 appears in the assistant\'s Scope 3 clause EXACTLY ONCE', () => {
    const clause = assistantScope3Basis()
    const counts = new Map<number, number>()
    for (const n of promptNumbers(clause)) counts.set(n, (counts.get(n) ?? 0) + 1)
    for (const n of SCOPE3_CATEGORY_NUMBERS) expect(counts.get(n) ?? 0, `category ${n}`).toBe(1)
  })

  it('SM5 ⚠️ the flat group\'s size is counted, not typed', () => {
    const flat = scope3MethodGroups().find(g => g.method === 'flat_spend')!
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']
    expect(assistantScope3Basis()).toContain(`Those ${words[flat.categories.length]} are a rough order-of-magnitude estimate`)
    expect(assistantScope3Basis()).not.toMatch(/remaining (ten|eight|seven)/)
    // The bullet it completes has always ended without a full stop; the next bullet follows on a new line.
    expect(assistantScope3Basis()).toMatch(/for each category$/)
  })

  it('SM6 headings read the same for one category or many', () => {
    expect(categoryHeading([5])).toBe('Category 5 (waste generated in operations)')
    expect(categoryHeading([6, 7])).toBe('Categories 6 and 7 (business travel; employee commuting)')
  })

  it('SM7 ⚠️ neither surface types the per-category list any more', () => {
    // Source guard, on the pattern of the publisher-claims tests: the two surfaces must CALL the builders,
    // and the hand-typed phrases that went stale must not come back.
    const page = readFileSync(join(ROOT, 'app/methodology/page.tsx'), 'utf8')
    const route = readFileSync(join(ROOT, 'app/api/ghg-bot/route.ts'), 'utf8')
    expect(page).toContain('content: methodologyHierarchyLines()')
    expect(page).not.toMatch(/`Category 1, purchased goods and services:/)
    expect(route).toContain('${assistantScope3Basis()}')
    expect(route).not.toMatch(/the remaining (ten|eight|seven) categories/)
    expect(route).not.toMatch(/Those (ten|eight|seven) are a rough/)
  })

  it('SM8 ⚠️ the assistant\'s Scope 3 GWP clause is derived: categories from the method map, bases from the records', () => {
    const clause = assistantScope3GwpClause()
    const waste = scope3MethodGroups().filter(g => g.method === 'waste_factors' || g.method === 'end_of_life_factors').flatMap(g => g.categories).sort((a, b) => a - b)
    expect(waste).toEqual([5, 12])
    expect(clause).toContain(`Categories 5 and 12 use the UK DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste factors, which their publisher combined on ${DEFRA_WASTE_META.gwp_basis}`)
    const pcaf = scope3MethodGroups().find(g => g.method === 'pcaf')!.categories
    expect(clause).toContain(`Category ${pcaf.join(', ')} uses investee emissions ${CAT15_GWP_TAIL}`)
    // Never a basis for the investee figures, and nothing said of the methods whose records carry none.
    expect(clause).not.toMatch(/Category 15[^;]*\bAR[456]\b/)
    expect(clause).not.toMatch(/EXIOBASE|Categor(y|ies) (1|2|4|7)\b/)
    // Cat 6 is on the DEFRA/DESNZ business travel record, which states AR5 as the waste record does.
    expect(clause).toContain(`Category 6 uses the UK DEFRA/DESNZ ${DEFRA_TRAVEL_META.year} business travel factors, which their publisher combined on ${DEFRA_TRAVEL_META.gwp_basis}`)
    const route = readFileSync(join(ROOT, 'app/api/ghg-bot/route.ts'), 'utf8')
    expect(route).toContain('${assistantScope3GwpClause()}')
  })
})
