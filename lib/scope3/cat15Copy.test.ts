import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scope3MethodDescription } from './categoryMethods'
import { methodologyHierarchyLines } from './methodSummary'
import {
  CAT15_FIGURE_SOURCE, CAT15_HOLDING_FIGURE, CAT15_SENTENCES, CAT15_NO_BASIS, CAT15_ASSESSMENT_FAILED,
  CAT15_GUIDANCE, CAT15_PANEL_METHOD, CAT15_PANEL_NO_PROXY, CAT15_RECORDED_NOT_USED,
  cat15MethodDescription, cat15MethodologyPassage, cat15DecomposedBasisDetail, cat15Figure,
} from './cat15'

// ── GUARD: EVERY CATEGORY 15 CLAIM COMES FROM lib/scope3/cat15.ts, AND THE OLD WORDINGS STAY GONE ─────
//
// Until 18 Sep 2026 this file compared two copies of the Category 15 method, the methodology passage and
// scope3MethodDescription('pcaf'), point by point. Five other surfaces made the same claims in their own
// words and the comparison could not see them. The sentences now live once in cat15.ts and every surface
// renders them, so agreement comes from a single source. What is left to guard is (1) that the superseded
// phrasings do not return anywhere, and (2) that each surface still reads from the constants.

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Comments stripped (JSX brace comments, block and line comments), so a comment recording an old wording
 *  cannot fail a guard on the copy. `https://` is protected by requiring no ':' before the '//'. */
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Customer-facing code: every .ts and .tsx under app/ and lib/ except tests, which quote the old
 *  wordings in order to ban them. */
function customerFacingFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(path)
    }
  }
  walk(join(ROOT, 'app'))
  walk(join(ROOT, 'lib'))
  return out
}

/** The apostrophe as it can appear in source: straight, typographic, its \u escape, or JSX's &apos;. */
const APOS = "(?:'|’|\\\\u2019|&apos;)"

const SUPERSEDED: readonly { was: string; re: RegExp }[] = [
  { was: '"own reported emissions" (the figure is as entered by the customer)', re: /own reported emissions/i },
  // Not on the list originally agreed, and added deliberately: the panel box and the CSV methodology note
  // said "each investee's own emissions", the same claim one word shorter, which the line above cannot see.
  // The holding-row help ("The investee's own reported figure…") is an instruction about what to enter and
  // is untouched by both patterns: it says "figure", not "emissions".
  { was: '"the investee\'s own emissions"', re: new RegExp(`investee${APOS}s own emissions`, 'i') },
  { was: '"multiply into a quantity"', re: /multiply into a quantity/i },
  { was: '"not a quantity"', re: /\bnot a quantity\b/i },
  { was: '"prices a year of purchasing"', re: /prices a year of purchasing/i },
  { was: 'the old withholding list naming the outstanding amount', re: /missing its emissions, outstanding amount or attribution value/i },
  { was: 'the old known-total phrasing', re: /known financed emissions where entered, otherwise/i },
]

describe('Category 15 copy: one source, and the superseded wordings nowhere', () => {
  it('C15C1 ⚠️ no superseded phrasing appears in any customer-facing file', () => {
    const found: string[] = []
    for (const file of customerFacingFiles()) {
      const text = stripComments(readFileSync(file, 'utf8'))
      for (const { was, re } of SUPERSEDED) if (re.test(text)) found.push(`${relative(ROOT, file)}: ${was}`)
    }
    expect(found).toEqual([])
  })

  it('C15C2 the method description and the methodology passage are built from the shared sentences', () => {
    const s = CAT15_SENTENCES
    expect(scope3MethodDescription('pcaf')).toBe(cat15MethodDescription())
    for (const part of [s.knownTotalShort, CAT15_HOLDING_FIGURE, s.withholdsShort, s.noPortfolioProxyShort]) {
      expect(cat15MethodDescription()).toContain(part)
    }
    for (const part of [CAT15_FIGURE_SOURCE, s.withholdsLong, s.knownTotalLong, s.noPortfolioProxyLong]) {
      expect(cat15MethodologyPassage()).toContain(part)
    }
    // The hierarchy line IS the description, so guarding the description guards the line.
    expect(methodologyHierarchyLines().find(l => l.startsWith('Category 15 '))).toBe(`Category 15 (investments): ${cat15MethodDescription()}`)
    // And the methodology page renders the builder rather than a literal of its own.
    expect(stripComments(read('app/methodology/page.tsx'))).toContain('content: cat15MethodologyPassage()')
  })

  it('C15C3 each Scope 3 page surface reads its sentence from cat15.ts', () => {
    const page = stripComments(read('app/dashboard/scope3/page.tsx'))
    const cat15Line = page.split('\n').find(l => l.includes("id: 'cat15'"))!
    expect(cat15Line, 'CATEGORIES.cat15.guidance').toContain('guidance: CAT15_GUIDANCE')
    expect(page, 'categoryBasis, decomposed branch').toContain('detail: cat15DecomposedBasisDetail(')
    expect(page, 'the Cat 15 panel box').toContain('{CAT15_PANEL_METHOD}')
    expect(page, 'the Cat 15 panel box').toContain('{CAT15_PANEL_NO_PROXY}')
    expect(page, 'the CSV recorded-and-not-used row').toContain('CAT15_RECORDED_NOT_USED])')
    // And each of those constants carries the shared sentence it stands for.
    expect(CAT15_GUIDANCE).toContain(CAT15_FIGURE_SOURCE)
    expect(CAT15_GUIDANCE).toContain(CAT15_SENTENCES.noPortfolioProxyShort)
    expect(cat15DecomposedBasisDetail(2, 1.5)).toContain(CAT15_HOLDING_FIGURE.slice(1))
    expect(CAT15_PANEL_METHOD).toContain(CAT15_HOLDING_FIGURE)
    expect(CAT15_PANEL_NO_PROXY).toBe(CAT15_SENTENCES.noPortfolioProxyShort)
    expect(CAT15_RECORDED_NOT_USED).toContain(CAT15_SENTENCES.noPortfolioProxyShort)
  })

  it('C15C4 the reasons shown when there is no figure use the shared sentences', () => {
    // CAT15_NO_BASIS: the amber box, the CSV "Excluded from total" line and the "Not calculated" basis row.
    expect(CAT15_NO_BASIS).toContain(CAT15_SENTENCES.noPortfolioProxyLong)
    expect(cat15Figure({}).reason).toBe(CAT15_NO_BASIS)
    // The incomplete-holdings reason: the same surfaces, when a holding cannot compute.
    const bad = { id: 'x', assetClass: 'mortgages' as const, outstandingAmount: 1, denominator: 0, emissions: { reportedEmissions: 1 } }
    expect(cat15Figure({ pcafAssets: [bad] }).reason).toContain(CAT15_SENTENCES.withholdsShort)
  })

  it('C15C5 no em-dash in any string the constants produce', () => {
    const produced: Record<string, string> = {
      CAT15_FIGURE_SOURCE, CAT15_HOLDING_FIGURE, CAT15_NO_BASIS, CAT15_ASSESSMENT_FAILED, CAT15_GUIDANCE,
      CAT15_PANEL_METHOD, CAT15_PANEL_NO_PROXY, CAT15_RECORDED_NOT_USED,
      ...Object.fromEntries(Object.entries(CAT15_SENTENCES).map(([k, v]) => [`CAT15_SENTENCES.${k}`, v])),
      'cat15MethodDescription()': cat15MethodDescription(),
      'cat15MethodologyPassage()': cat15MethodologyPassage(),
      'cat15DecomposedBasisDetail(1, 1)': cat15DecomposedBasisDetail(1, 1),
      'cat15DecomposedBasisDetail(3, 1.6)': cat15DecomposedBasisDetail(3, 1.6),
      'incomplete-holdings reason': cat15Figure({ pcafAssets: [{ id: 'x', assetClass: 'mortgages', outstandingAmount: 1, denominator: 0, emissions: {} }] }).reason,
    }
    const dashed = Object.entries(produced).filter(([, v]) => /[—–]/.test(v)).map(([k]) => k)
    expect(dashed).toEqual([])
  })
})
