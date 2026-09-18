import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── GUARD: SCOPE 3 RELEVANCE IS THE CUSTOMER'S DECISION, AND NO SURFACE MAY SAY OTHERWISE ──────────
//
// Until 18 Sep 2026 the methodology page said ThemisIQ "applies sector-based materiality screening" and
// "automatically identifies" the Scope 3 categories likely to be material for a sector, and the relevance
// step said ThemisIQ "has identified" them. The table behind both was keyed on a retired sector vocabulary
// that the sector select no longer offered, so it identified nothing for any sector a customer could
// choose. The feature was removed and the copy rewritten; this keeps both from coming back.
//
// ⚠️ THE RELEVANCE SENSE OF "MATERIAL", NOT THE PHYSICAL ONE. Category 5 prices tonnes "by material and
// treatment route", which is the DEFRA/DESNZ sheet's own word for what a waste stream is made of, and
// it appears in the panel, the CSV and the method description. A blanket ban on the word would force that
// wording out, so the patterns below target the relevance sense: materiality, material categories, likely
// / not / immaterial, and a category judged or deemed material.

const ROOT = join(__dirname, '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// Source with comments removed (JSX brace comments, block comments and line comments), so a comment
// recording why the copy changed cannot fail a guard on the copy. `https://` is protected by requiring no
// ':' immediately before '//'.
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The Scope 3 module's own sections on the methodology page. The page also carries the Climate Risk &
 *  Materiality module, where "materiality" is the right word and must not be caught. */
function methodologyScope3Section(): string {
  const src = stripComments(read('app/methodology/page.tsx'))
  const start = src.indexOf("standard: 'GHG Protocol Corporate Value Chain (Scope 3) Standard'")
  expect(start, 'the Scope 3 module on the methodology page').toBeGreaterThan(-1)
  const end = src.indexOf('module:', start)
  return src.slice(start, end === -1 ? undefined : end)
}

const RELEVANCE_SENSE: readonly RegExp[] = [
  /\bmateriality\b/i,
  /\bmaterial\s+categor/i,
  /\blikely\s+material\b/i,
  /\bnot\s+material\b/i,
  /\bimmaterial\b/i,
  /\b(?:judge|judged|deem|deemed|considered?|is|are)\s+material\b/i,
  /\bauto-?detect/i,
]

const hits = (text: string): string[] =>
  RELEVANCE_SENSE.flatMap(re => {
    const m = text.match(re)
    return m ? [`${re} → "${text.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + 40).replace(/\s+/g, ' ')}"`] : []
  })

describe('Scope 3 relevance copy', () => {
  it('RC1 ⚠️ no relevance-sense "material", "materiality" or "auto-detect" in the Scope 3 page copy', () => {
    expect(hits(stripComments(read('app/dashboard/scope3/page.tsx')))).toEqual([])
  })

  it('RC2 ⚠️ … nor in the Scope 3 sections of the methodology page', () => {
    expect(hits(methodologyScope3Section())).toEqual([])
  })

  it('RC3 … nor in the GHG assistant prompt, which describes the Scope 3 module', () => {
    expect(hits(stripComments(read('app/api/ghg-bot/route.ts')))).toEqual([])
  })

  it('RC4 ⚠️ the methodology page does not claim ThemisIQ identifies, detects, suggests or flags categories', () => {
    const section = methodologyScope3Section()
    const claims = section.split(/(?<=\.)\s+/).filter(sentence =>
      /\bThemisIQ\b/.test(sentence)
      && /\b(?:identif(?:y|ies|ying)|detect(?:s|ing)?|suggest(?:s|ing)?|flag(?:s|ging)?|screen(?:s|ing)?)\b/i.test(sentence)
      && /\bcategor/i.test(sentence))
    expect(claims).toEqual([])
    // And it says whose decision it is.
    expect(section).toMatch(/relevant is the customer.{1,8}s decision/)
  })

  it('RC5 the removed feature is gone from the code, not only from the copy', () => {
    const page = stripComments(read('app/dashboard/scope3/page.tsx'))
    for (const name of ['SECTOR_MATERIAL', 'materialSectors', 'autoDetect', 'isMaterial']) {
      expect(page, name).not.toContain(name)
    }
  })
})
