import { describe, it, expect } from 'vitest'
import { cartQuote, ADDONS, addOnRequirementsMet, priceLine, type ModuleKey } from './pricing'

// Regression guard for the new-model cart math (June 2026 rescope). cartQuote is
// the single source of truth shared by the configurator (display) and the server
// routes (charge), so these assertions protect the actual charged amount once
// NEW_PRICING_ACTIVE is flipped on.
const ALL: ModuleKey[] = [
  'ghg', 'climate-risk', 'supply-chain', 'people', 'deals', 'ai-governance', 'cyber',
]

describe('cartQuote — new pricing model', () => {
  it('single flat module (People) = $1,499, card OK', () => {
    expect(cartQuote({ modules: ['people'] })).toEqual({
      totalUSD: 1499, requiresQuote: false, requiresInvoice: false,
    })
  })

  it('two flat modules apply the -10% volume discount: (4900 + 1499) * 0.9 = 5759', () => {
    const q = cartQuote({ modules: ['climate-risk', 'people'] })
    expect(q.totalUSD).toBe(5759)
    expect(q.requiresInvoice).toBe(false)
    expect(q.requiresQuote).toBe(false)
  })

  it('GHG Professional alone = $11,900 and requiresInvoice (> $10k)', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'professional' })
    expect(q.totalUSD).toBe(11900)
    expect(q.requiresInvoice).toBe(true)
    expect(q.requiresQuote).toBe(false)
  })

  it('all 7 with GHG Professional = $24,900 (Full Platform cap wins)', () => {
    expect(cartQuote({ modules: ALL, ghgTier: 'professional' }).totalUSD).toBe(24900)
  })

  it('all 7 with GHG Essentials = $19,919 (intended; below Full Platform)', () => {
    expect(cartQuote({ modules: ALL, ghgTier: 'starter' }).totalUSD).toBe(19919)
  })

  it('GHG Advisory -> requiresQuote, no self-serve total', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'advisory' })
    expect(q.requiresQuote).toBe(true)
    expect(q.totalUSD).toBe(0)
  })
})

describe('add-on pricing', () => {
  // Locks the Verification Readiness add-on price at the source of truth. ADDONS
  // .verification.price is charged directly by /api/checkout + /api/admin/create-invoice
  // (it does NOT flow through cartQuote), so this guards what customers actually pay.
  it('Verification Readiness add-on = $1,499', () => {
    expect(ADDONS.verification.price).toBe(1499)
  })
})

// ── SECURITY — quote-only add-ons must never be purchasable through checkout ──
// Concierge Enterprise has price 0 (a custom-quote placeholder). Without a server-side guard,
// POST /api/checkout { addOns:['concierge-enterprise'] } with GHG owned would mint a real
// entitlement for free. addOnRequirementsMet (the single authority BOTH routes defer to) and
// priceLine (fail-loud backstop) close that hole. These pin it shut.
describe('add-on purchasability — quote-only guard', () => {
  it('N1 concierge-enterprise is rejected even when GHG is owned (quote-only, not just a prereq gap)', () => {
    const r = addOnRequirementsMet('concierge-enterprise', ['ghg'])
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/quote-only/i)
    // The point: owning GHG is NOT enough — the enterprise tier is unsellable via checkout.
    expect(ADDONS['concierge-enterprise'].isCustomQuote).toBe(true)
  })

  it('N2 concierge-basic with GHG owned → ok (the guard must not over-block sellable tiers)', () => {
    expect(addOnRequirementsMet('concierge-basic', ['ghg']).ok).toBe(true)
    expect(ADDONS['concierge-basic'].isCustomQuote).toBeUndefined()
  })

  it('N3 concierge-basic without GHG → rejected (existing ghg→concierge dependency still holds)', () => {
    const r = addOnRequirementsMet('concierge-basic', [])
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/ghg/i)
  })

  it('N4 priceLine refuses a $0 line item (fail-loud backstop; a zero price is not a price)', () => {
    expect(() => priceLine('Concierge — Enterprise (16+ locations)', 0)).toThrow(/zero price is not a price/i)
    expect(() => priceLine('anything', -5)).toThrow() // negative also rejected
    // sanity: a real price builds a normal line item (cents)
    expect(priceLine('Concierge — Basic', 799).price_data?.unit_amount).toBe(79900)
  })
})
