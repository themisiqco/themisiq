import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { scope3MethodDescription } from './categoryMethods'
import { methodologyHierarchyLines } from './methodSummary'
import {
  CAT15_FIGURE_SOURCE, CAT15_HOLDING_FIGURE, CAT15_SENTENCES, CAT15_NO_BASIS, CAT15_ASSESSMENT_FAILED,
  CAT15_GUIDANCE, CAT15_PANEL_METHOD, CAT15_PANEL_NO_PROXY, CAT15_RECORDED_NOT_USED,
  cat15MethodDescription, cat15MethodologyPassage, cat15DecomposedBasisDetail, cat15Figure,
  CAT15_GWP_SENTENCE, CAT15_GWP_TAIL, cat15GwpSentence, CAT15_NOT_ENTERED, cat15HasPortfolioFields,
  CAT15_HOLDINGS_SUPERSEDED, CAT15_HOLDING_NOT_USED, CAT15_HOLDING_FIELDS, cat15HoldingIncomplete,
} from './cat15'
import { notEnteredReason } from './notEntered'

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
  // 19 Sep 2026: a known total from an audited source can be checked as well, so the holdings are not the
  // "only way" the figure can be checked.
  { was: '"the only way this figure can be checked"', re: /only way this figure can be checked/i },
  { was: '"own reported emissions" (the figure is as entered by the customer)', re: /own reported emissions/i },
  // Not on the list originally agreed, and added deliberately: the panel box and the CSV methodology note
  // said "each investee's own emissions", the same claim one word shorter, which the line above cannot see.
  // The holding-row help ("The investee's own reported figure…") is an instruction about what to enter and
  // is untouched by both patterns: it says "figure", not "emissions".
  { was: '"the investee\'s own emissions"', re: new RegExp(`investee${APOS}s own emissions`, 'i') },
  { was: '"multiply into a quantity"', re: /multiply into a quantity/i },
  { was: '"not a quantity"', re: /\bnot a quantity\b/i },
  { was: '"prices a year of purchasing"', re: /prices a year of purchasing/i },
  // 19 Sep 2026: a blank outstanding amount withholds the figure. From 18 to 19 Sep the withholding sentences
  // said it was "read as zero", which was then true; the three-field list is the current wording again.
  { was: '"left blank is read as zero" (a blank outstanding amount now withholds)', re: /left blank is read as zero/i },
  { was: 'the old known-total phrasing', re: /known financed emissions where entered, otherwise/i },
  // 18 Sep 2026: the investee GWP basis is not recorded. lib/pcaf stamped 'AR6' and the CSV said the figures
  // were "on the AR6 basis the investee figures are reported on"; nothing had asked anyone which basis.
  { was: '"AR6 basis the investee"', re: /AR6 basis the investee/i },
  { was: '"on the AR6 basis"', re: /on the AR6 basis/i },
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
    // The GWP point is its own sentence after the formula, never spliced into it: the formula is verbatim.
    expect(cat15MethodDescription()).toContain(`${CAT15_HOLDING_FIGURE}. ${CAT15_GWP_SENTENCE} `)
    for (const part of [s.knownTotalShort, CAT15_HOLDING_FIGURE, s.withholdsShort, s.noPortfolioProxyShort, CAT15_GWP_SENTENCE]) {
      expect(cat15MethodDescription()).toContain(part)
    }
    expect(cat15MethodologyPassage()).toContain(`Attribution is capped at 100%. ${CAT15_GWP_SENTENCE} Each holding is scored`)
    // Said once in each text, and once in the CSV row / panel line.
    for (const text of [cat15MethodologyPassage(), cat15MethodDescription(), cat15GwpSentence(true, 'AR6')]) {
      expect(text.split(CAT15_GWP_TAIL).length - 1).toBe(1)
    }
    expect(CAT15_SENTENCES.gwpAsReported).toBe(CAT15_GWP_SENTENCE)
    for (const part of [CAT15_FIGURE_SOURCE, s.withholdsLong, s.knownTotalLong, s.noPortfolioProxyLong, CAT15_GWP_SENTENCE]) {
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
    expect(page, 'the superseded note above the holdings').toContain('{CAT15_HOLDINGS_SUPERSEDED}')
    expect(page, 'each holding\'s figure while a known total is entered').toContain('{CAT15_HOLDING_NOT_USED}')
    expect(page, 'the per-holding incomplete line').toContain('{cat15HoldingIncomplete(row)}')
    expect(page).not.toMatch(/Complete this holding to compute: it needs/)
    expect(CAT15_HOLDINGS_SUPERSEDED.startsWith(CAT15_SENTENCES.knownTotalShort)).toBe(true)
    // The per-holding line names its fields in the words the withholding sentences use.
    for (const f of ['emissions', 'outstanding amount', 'attribution value']) {
      expect(CAT15_SENTENCES.withholdsShort).toContain(f)
      expect(CAT15_SENTENCES.withholdsLong).toContain(f)
      expect(Object.values(CAT15_HOLDING_FIELDS).some(v => v.endsWith(f))).toBe(true)
    }
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
    // ⚠️ ONLY WHEN A PORTFOLIO VALUE OR SECTOR IS ON THE RECORD. With nothing entered, the reason names what
    // is missing, in the same form Categories 1, 2 and 4 use: the same builder, not a copy of its wording.
    expect(cat15Figure({}).reason).toBe(CAT15_NOT_ENTERED)
    expect(cat15Figure({ pcafAssets: [] }).reason).toBe(CAT15_NOT_ENTERED)
    expect(CAT15_NOT_ENTERED).toBe(notEnteredReason(['the holdings to assess, or a known total of financed emissions']))
    expect(CAT15_NOT_ENTERED).toMatch(/^Not estimated, because this has not been entered: .+\.$/)
    expect(CAT15_NOT_ENTERED).not.toMatch(/portfolio/i)
    expect(cat15Figure({ portfolio_value: 10_000_000 }).reason).toBe(CAT15_NO_BASIS)
    expect(cat15Figure({ portfolio_sector: 'i66' }).reason).toBe(CAT15_NO_BASIS)
    // The CSV's recorded-and-not-used row asks the same question through the same function.
    expect(read('app/dashboard/scope3/page.tsx')).toContain('if (cat15HasPortfolioFields(c15)) {')
    expect(cat15HasPortfolioFields({})).toBe(false)
    // And Categories 1, 2 and 4 use the builder rather than their own copy of the sentence.
    expect(read('app/dashboard/scope3/page.tsx')).toContain('return notEnteredReason(missing)')
    expect(read('app/dashboard/scope3/page.tsx')).not.toContain("'this has' : 'these have'")
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
      'cat15GwpSentence(unbound)': cat15GwpSentence(false, null),
      'cat15GwpSentence(bound, AR6)': cat15GwpSentence(true, 'AR6'),
      'cat15GwpSentence(bound, none)': cat15GwpSentence(true, null),
      CAT15_HOLDINGS_SUPERSEDED, CAT15_HOLDING_NOT_USED,
      'cat15HoldingIncomplete(all missing)': cat15HoldingIncomplete({ id: 'x', assetClass: 'mortgages', denominator: 0, emissions: {} }),
      'cat15HoldingIncomplete(negative)': cat15HoldingIncomplete({ id: 'x', assetClass: 'mortgages', outstandingAmount: -1, denominator: 10, emissions: { reportedEmissions: 1 } }),
      'incomplete-holdings reason': cat15Figure({ pcafAssets: [{ id: 'x', assetClass: 'mortgages', outstandingAmount: 1, denominator: 0, emissions: {} }] }).reason,
    }
    const dashed = Object.entries(produced).filter(([, v]) => /[—–]/.test(v)).map(([k]) => k)
    expect(dashed).toEqual([])
  })

  it('C15C6 ⚠️ cat15GwpSentence never claims the investee figures share the inventory\'s basis', () => {
    // The waste sentence can say "so the two share a GWP basis" because the DEFRA record states AR5. The
    // investee basis is never recorded, so no inventory basis may be said to match it.
    const MATCH = /as well|so the two share|share a GWP basis|the same (GWP )?basis|consistent|uniform|matches|on the (AR4|AR5|AR6) basis/i
    for (const bound of [true, false]) {
      for (const v of ['AR4', 'AR5', 'AR6', 'unknown', null]) {
        const text = cat15GwpSentence(bound, v)
        expect(text, `${bound} ${v}`).not.toMatch(MATCH)
        expect(text).toContain(CAT15_SENTENCES.gwpAsReported)
        if (bound && v) expect(text).toContain(`records ${v}. Whether the investee figures share that basis is not known.`)
        if (bound && !v) expect(text).toContain('records no GWP basis either')
        if (!bound) expect(text).toBe(CAT15_SENTENCES.gwpAsReported)
      }
    }
  })

  it('C15C7 the Scope 3 page and the CSV read the GWP sentence from cat15.ts', () => {
    const page = stripComments(read('app/dashboard/scope3/page.tsx'))
    expect(page.match(/cat15GwpSentence\(!!boundInventoryId, ghgGwpVersion\)/g)?.length ?? 0).toBe(2)
    expect(page).not.toMatch(/a\.gwpBasis/)
  })
})
