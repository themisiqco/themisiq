// lib/billReviewOrder.test.ts
//
// The Bill Review part of an order, shared by /api/checkout and /api/admin/create-invoice (pricing-2026-10).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { billReviewOrder, type OwnedRow } from './billReviewOrder'
import { stripTsComments } from './testing/stripComments'

const NOW = new Date('2026-10-03T12:00:00Z')
const activeGhg = (tier: string | null): OwnedRow => ({ module_key: 'ghg', ghg_tier: tier, term_end: '2027-06-01T00:00:00Z' })
const expiredGhg: OwnedRow = { module_key: 'ghg', ghg_tier: 'starter', term_end: '2026-01-01T00:00:00Z' }

describe('billReviewOrder', () => {
  it('B1 with GHG in the cart, a first order is priced on the cart tier', () => {
    const o = billReviewOrder({ uploadedSources: 12 }, 'starter', [], NOW)
    expect(o.ok).toBe(true)
    if (!o.ok) return
    expect(o.quote.totalUSD).toBe(900 + 2 * 45)
    expect(o.meta).toEqual({ concierge_uploaded_sources: '12', concierge_connected_sources: '0', concierge_source_allowance: '12', concierge_onboarding_usd: '900' })
    expect(o.grant).toBe('concierge')
    expect(o.source).toBe('concierge:12u+onboarding')
  })

  it('B2 added later to an active GHG plan, onboarding is priced on the plan held', () => {
    const o = billReviewOrder({ uploadedSources: 30 }, null, [activeGhg('professional')], NOW)
    expect(o.ok && o.quote.onboardingUSD).toBe(1800)
  })

  it('B3 an expired GHG plan does not qualify', () => {
    const o = billReviewOrder({ uploadedSources: 5 }, null, [expiredGhg], NOW)
    expect(o).toEqual({ ok: false, status: 400, error: 'Bill Review requires an active GHG plan. Add GHG to your order, or renew it first.' })
  })

  it('B4 a held plan with no recorded tier cannot price a first onboarding', () => {
    const o = billReviewOrder({ uploadedSources: 5 }, null, [activeGhg(null)], NOW)
    expect(o.ok).toBe(false)
    if (!o.ok) expect(o.error).toMatch(/could not tell which GHG plan/)
  })

  it('B5 a returning customer pays $45 a source, whatever the plan', () => {
    const o = billReviewOrder({ uploadedSources: 8 }, null, [activeGhg(null), { module_key: 'concierge' }], NOW)
    expect(o.ok && o.quote.totalUSD).toBe(8 * 45)
    expect(o.ok && o.source).toBe('concierge:8u')
  })

  it('B6 Enterprise, human reading and connected sources are refused', () => {
    expect(billReviewOrder({ uploadedSources: 5 }, 'enterprise', [], NOW)).toMatchObject({ ok: false, error: 'Bill Review for the Enterprise plan is quoted. Please contact us.' })
    expect(billReviewOrder({ uploadedSources: 5, reading: 'human' }, 'starter', [], NOW)).toMatchObject({ ok: false, error: 'Human reading cannot be ordered online yet. Please contact us to arrange it.' })
    expect(billReviewOrder({ uploadedSources: 5, connectedSources: 1 }, 'starter', [], NOW)).toMatchObject({ ok: false, status: 400 })
  })

  it('B7 both purchase routes use it, and both refuse the removed add-ons', () => {
    for (const rel of ['app/api/checkout/route.ts', 'app/api/admin/create-invoice/route.ts']) {
      const code = stripTsComments(readFileSync(join(process.cwd(), rel), 'utf8'))
      expect(code, rel).toContain('billReviewOrder(body.concierge')
      expect(code, rel).toMatch(/That add-on is no longer sold/)
      expect(code, rel).not.toMatch(/ADDONS|addOnRequirementsMet|conciergeQuote/)
    }
  })
})
