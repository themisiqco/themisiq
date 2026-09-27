import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from './testing/stripComments'
import { PRICING_DRIVER_SENTENCE, PRICING_PUBLISHED_SENTENCE } from './pricingCopy'

// ─────────────────────────────────────────────────────────────────────────────
// ONE STRING PER SENTENCE, ACROSS EVERY SURFACE THAT CARRIES IT.
//
// The driver sentence appears on /pricing, the homepage pricing section and /signup. The published-prices
// sentence appears on the first two ONLY, deliberately: /signup is not a pricing surface, and the
// reassurance about knowing the cost before you start has no job on a page whose form is free to submit.
//
// The sentences ARE shared now; they were not before. /signup carried an older driver wording ("Whether
// your driver is a regulator, a board, an investor or a customer, ThemisIQ is your sustainability
// compliance reporting solution.") while the other two were rewritten, and nothing anywhere failed — a
// literal cannot notice that its twin has moved on.
//
// So this asserts three things a shared constant alone does not give:
//
//   · each surface renders the constants it is SUPPOSED to (it could import them and render its own text),
//   · /signup does not acquire the published-prices sentence by drift, which is the asymmetry above
//     written down rather than left to memory, and
//   · NO file in app/ or lib/ holds a competing literal of either sentence, so a fourth surface cannot be
//     added by paste. That is the check that would have caught the original drift, and the reason the
//     whole tree is scanned rather than just these three files.
//
// Comments are stripped before matching, so a note quoting the copy (including the one in pricingCopy.ts
// explaining the old wording) is not a competing literal.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, '..')

const DRIVER = 'PRICING_DRIVER_SENTENCE'
const PUBLISHED = 'PRICING_PUBLISHED_SENTENCE'

/**
 * Every surface that renders the pricing pitch, and WHICH sentences it carries.
 * `absent` is asserted, not merely omitted: adding a name to `renders` is a copy decision, and so is
 * leaving it out.
 */
const SURFACES: { rel: string; renders: string[]; absent: string[] }[] = [
  { rel: 'app/pricing/page.tsx', renders: [DRIVER, PUBLISHED], absent: [] },
  { rel: 'app/components/HomePricing.tsx', renders: [DRIVER, PUBLISHED], absent: [] },
  { rel: 'app/signup/page.tsx', renders: [DRIVER], absent: [PUBLISHED] },
]

const OWNER = 'lib/pricingCopy.ts'

/** Distinctive openings. Matched against comment-stripped source, so they find literals only. */
const FINGERPRINTS = [
  'Whether the request comes from a regulator',
  'Reporting rules keep multiplying',
  // The wording /signup used to carry. It must not come back on any surface.
  'Whether your driver is a regulator',
] as const

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(e.name)) out.push(rel)
  }
  return out
}

const code = (rel: string) => stripTsComments(readFileSync(join(ROOT, rel), 'utf8'))

describe('shared pricing copy', () => {
  it('holds the approved wording, with no em dash', () => {
    expect(PRICING_DRIVER_SENTENCE).toBe(
      'Whether the request comes from a regulator, a lender, your board or a customer, you pay only for the modules it calls for.',
    )
    expect(PRICING_PUBLISHED_SENTENCE).toBe(
      'Reporting rules keep multiplying, and so do the quotes from platforms and consultancies. Our prices are published, so you know the cost before you start.',
    )
    for (const s of [PRICING_DRIVER_SENTENCE, PRICING_PUBLISHED_SENTENCE]) {
      expect(s).not.toMatch(/—/)
      expect(s.trim()).toBe(s)
      expect(s.endsWith('.')).toBe(true)
    }
  })

  it.each(SURFACES)('$rel renders exactly the sentences it should', ({ rel, renders, absent }) => {
    const src = code(rel)
    // Imports only what it renders: an unused import is a half-finished copy change.
    const imported = new RegExp(`import \\{ ${renders.join(', ')} \\} from '[^']*lib/pricingCopy'`)
    expect(src).toMatch(imported)
    for (const name of renders) expect(src).toContain(`{${name}}`)
    // Not just unrendered — absent from the file, so an unused import fails too.
    for (const name of absent) expect(src).not.toContain(name)
  })

  it('the driver sentence is on all three surfaces, the published one on two', () => {
    expect(SURFACES.filter((s) => s.renders.includes(DRIVER)).map((s) => s.rel)).toEqual([
      'app/pricing/page.tsx',
      'app/components/HomePricing.tsx',
      'app/signup/page.tsx',
    ])
    expect(SURFACES.filter((s) => s.renders.includes(PUBLISHED)).map((s) => s.rel)).toEqual([
      'app/pricing/page.tsx',
      'app/components/HomePricing.tsx',
    ])
  })

  it('no file in app/ or lib/ holds a competing literal', () => {
    const offenders: string[] = []
    for (const rel of [...walk('app'), ...walk('lib')]) {
      if (rel === OWNER || rel === 'lib/pricingCopy.test.ts') continue
      const src = code(rel)
      for (const fp of FINGERPRINTS) {
        if (src.includes(fp)) offenders.push(`${rel}: ${fp}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the owner module is the only place the sentences are spelled out', () => {
    const owner = code(OWNER)
    for (const fp of FINGERPRINTS.slice(0, 2)) expect(owner).toContain(fp)
  })
})
