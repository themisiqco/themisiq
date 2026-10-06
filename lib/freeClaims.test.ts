import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// lib/drafts.ts imports the browser Supabase client; the sentence needs none of it.
vi.mock('./supabase', () => ({ supabase: {} }))
import { draftKeptSentence } from './ghg/draft'
import { GHG_FREE_USE_SENTENCE, GHG_PLAN_USE_SENTENCE } from './pricingCopy'

// Free-use and payment claims, held against what the product does (docs/review/free-claims-audit.md).
// Each retired phrase below was on the site and was false: payment is needed for far more than downloads,
// Scope 3 and SBTi need a plan rather than a free account, there is no "Invoice me" at Stripe checkout, and
// a plan is 12 months of access rather than a one-time purchase.
const ROOT = join(__dirname, '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const CALC = 'app/calculate-emissions/page.tsx'
const GHG = 'app/dashboard/ghg/page.tsx'
const SCOPE3 = 'app/dashboard/scope3/page.tsx'
const SBTI = 'app/dashboard/sbti/page.tsx'
const DASH = 'app/dashboard/page.tsx'

describe('free-use claims', () => {
  it('FC1: the retired claims are gone', () => {
    const retired: Array<[string, string]> = [
      [CALC, 'only pay when'],
      [CALC, 'Invoice me'],
      [CALC, 'one-time purchase'],
      [CALC, 'not be charged again'],
      [CALC, '10,000'],
      [SCOPE3, 'needs a free account'],
      [SCOPE3, 'calculator stays free'],
      [SBTI, 'needs a free account'],
      [DASH, 'unlock to export'],
      [GHG, 'Your figures will be kept while you choose a plan'],
    ]
    for (const [file, phrase] of retired) expect(read(file), `${file}: "${phrase}"`).not.toContain(phrase)
  })

  it('FC2: free use is described with the shared sentences', () => {
    for (const file of [CALC, GHG]) {
      const src = read(file)
      expect(src, file).toContain('GHG_FREE_USE_SENTENCE')
      expect(src, file).toContain('GHG_PLAN_USE_SENTENCE')
    }
    expect(GHG_FREE_USE_SENTENCE).toContain('free')
    // L10 (design section 8): one calculation is kept free, so "Saving" left the list and "more than one inventory" joined it.
    for (const gated of ['Scope 3', 'uploads', 'guide', 'Trends', 'SBTi', 'verifier sharing', 'downloads', 'more than one inventory']) {
      expect(GHG_PLAN_USE_SENTENCE).toContain(gated)
    }
  })

  it('FC3: the draft sentence states the signed-out retention', () => {
    expect(draftKeptSentence(true)).toBe('Your figures are kept in this browser for 2 hours while you choose a plan.')
    expect(draftKeptSentence(false)).toBe('Your figures are kept in this browser while you choose a plan.')
  })

  it('FC4: the Scope 3 card does not offer a free preview', () => {
    const card = read(DASH).split("id: 'scope3'")[1].split("id: 'sbti'")[0]
    expect(card).toContain('previewable: false')
  })

  it('FC5: a visitor with no session is not told their session ended', () => {
    const src = read(GHG)
    expect(src).toContain('content: BOT_ERRORS.signed_out')
    const signedOut = src.split('signed_out:')[1].split('\n')[1]
    expect(signedOut).not.toContain('session')
  })
})
