import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scope3MethodDescription } from './categoryMethods'
import { methodologyHierarchyLines } from './methodSummary'

// ── GUARD: THE TWO DESCRIPTIONS OF THE CATEGORY 15 METHOD SAY THE SAME FOUR THINGS ─────────────────
//
// Category 15 is described twice for customers: at length on the methodology page ("Category 15 financed
// emissions are calculated with a PCAF-aligned method…"), and in short by scope3MethodDescription('pcaf'),
// which is the Category 15 line of that page's calculation hierarchy and the Method cell of the CSV. On
// 18 Sep 2026 the long passage was corrected and the short one was not, so the same page said the
// investee's emissions were "as entered by the customer" in one paragraph and "own reported" in another.
//
// These are the four points the correction turned on. Each is a phrase BOTH texts must contain, and each
// has the superseded wording neither may contain. When the blank-outstanding-amount defect is fixed
// (memory: cat15-blank-outstanding-is-zero), POINTS changes here and both texts change with it.

const ROOT = join(__dirname, '..', '..')

const POINTS: readonly { point: string; must: RegExp; mustNot: RegExp }[] = [
  {
    point: 'the investee figure is what the customer entered, not a verified report',
    must: /emissions as entered by the customer/,
    mustNot: /\bown reported\b/,
  },
  {
    point: 'a portfolio value times a spend factor does not measure emissions',
    must: /does not measure emissions/,
    mustNot: /multiply into a quantity|\bnot a quantity\b/,
  },
  {
    point: 'what withholds the figure, and what a blank outstanding amount does',
    must: /missing its emissions or its attribution value[\s\S]{0,120}outstanding amount left blank is read as zero/,
    mustNot: /missing its emissions, outstanding amount or attribution value/,
  },
  {
    point: 'a known total replaces the holding-level figures',
    must: /replaces the holding-level figures/,
    mustNot: /known financed emissions where entered, otherwise/,
  },
]

/** The methodology page's Category 15 passage as a reader sees it: the string literal, with the page's
 *  \\u2019 escapes turned back into apostrophes. */
function longPassage(): string {
  const src = readFileSync(join(ROOT, 'app/methodology/page.tsx'), 'utf8')
  const m = src.match(/content: '(Category 15 financed emissions [^\n]*)',\n/)
  expect(m, 'the Category 15 passage on the methodology page').not.toBeNull()
  return m![1].replace(/\\u2019/g, '’')
}

const shortLine = (): string => scope3MethodDescription('pcaf')

describe('Category 15: the hierarchy line and the long passage agree', () => {
  for (const { point, must, mustNot } of POINTS) {
    it(`C15C ${point}`, () => {
      expect(shortLine(), 'scope3MethodDescription(pcaf)').toMatch(must)
      expect(longPassage(), 'methodology page passage').toMatch(must)
      expect(shortLine()).not.toMatch(mustNot)
      expect(longPassage()).not.toMatch(mustNot)
    })
  }

  it('C15C the hierarchy line IS the description, so guarding the description guards the line', () => {
    const line = methodologyHierarchyLines().find(l => l.startsWith('Category 15 '))
    expect(line).toBe(`Category 15 (investments): ${shortLine()}`)
  })

  it('C15C no em-dashes in the short form, which sits after a colon and in a CSV cell', () => {
    expect(shortLine()).not.toMatch(/—/)
  })
})
