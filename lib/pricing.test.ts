import { describe, it, expect } from 'vitest'
import { cartQuote, ADDONS, addOnRequirementsMet, priceLine, FLAT_MODULE_PRICES, GHG_TIERS, volumeDiscount, CARD_THRESHOLD_USD, MODULES, LEGACY_PRICING_PAGE_ID, type ModuleKey, type GhgTier } from './pricing'

// Regression guard for the new-model cart math (June 2026 rescope). cartQuote is
// the single source of truth shared by the configurator (display) and the server
// routes (charge), so these assertions protect the actual charged amount once
// NEW_PRICING_ACTIVE is flipped on.
const ALL: ModuleKey[] = [
  'ghg', 'cbam', 'climate-risk', 'double-materiality', 'supply-chain', 'people', 'deals',
  'ai-governance', 'cyber',
]

// Pre-discount cart total, derived the same way cartQuote() does (GHG by tier,
// the rest flat). Computed from the source-of-truth tables — never a literal —
// so adding a module or repricing one keeps these tests honest instead of
// silently wrong. That drift is exactly what broke the old Full-Platform tests.
const grossCart = (ghgTier: GhgTier): number =>
  ALL.reduce(
    (sum, k) => sum + (k === 'ghg' ? (GHG_TIERS[ghgTier].priceUSD as number) : FLAT_MODULE_PRICES[k as Exclude<ModuleKey, 'ghg'>]),
    0,
  )

describe('cartQuote — new pricing model', () => {
  it('single flat module (People) = $1,499, card OK', () => {
    expect(cartQuote({ modules: ['people'] })).toEqual({
      totalUSD: 1499, requiresQuote: false, requiresInvoice: false,
    })
  })

  it('single flat module (CBAM) = $1,499, card OK', () => {
    expect(cartQuote({ modules: ['cbam'] })).toEqual({
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

  it('a full cart is the discounted sum — no bundle cap', () => {
    const ghgTier: GhgTier = 'professional'
    const expected = Math.round(grossCart(ghgTier) * (1 - volumeDiscount(ALL.length)))
    expect(cartQuote({ modules: ALL, ghgTier }).totalUSD).toBe(expected)
  })

  it('a large cart is discounted at the 3+ volume band (20%), not a literal', () => {
    const n = ALL.length
    expect(n).toBeGreaterThanOrEqual(3)
    // Assert against the 3+ band boundary, so the rate can't be a stale literal.
    expect(volumeDiscount(n)).toBe(volumeDiscount(3))
    // …and that same band factor is what cartQuote actually applies.
    const ghgTier: GhgTier = 'professional'
    const q = cartQuote({ modules: ALL, ghgTier })
    expect(q.totalUSD).toBe(Math.round(grossCart(ghgTier) * (1 - volumeDiscount(n))))
  })

  it('a full cart exceeds the card threshold → requiresInvoice (cap no longer holds it under $10k)', () => {
    const q = cartQuote({ modules: ALL, ghgTier: 'professional' })
    expect(q.totalUSD).toBeGreaterThan(CARD_THRESHOLD_USD)
    expect(q.requiresInvoice).toBe(true)
  })

  it('GHG Advisory -> requiresQuote, no self-serve total', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'advisory' })
    expect(q.requiresQuote).toBe(true)
    expect(q.totalUSD).toBe(0)
  })
})

// ── Cart reachability — the silent-drop failure mode ─────────────────────────
// LEGACY_PRICING_PAGE_ID maps the pricing page's shorthand ids to canonical
// ModuleKeys, and its consumers .filter(Boolean) the result. An unmapped id is
// therefore DROPPED from the cart silently — no throw, no log — so a customer
// could select a module, pay, and never receive it. Both sides are derived from
// the source-of-truth exports (never a literal list or count) so adding a module
// fails this test until it is mapped, instead of needing the test edited.
describe('LEGACY_PRICING_PAGE_ID — cart reachability', () => {
  it('every module key is reachable through LEGACY_PRICING_PAGE_ID (unmapped ids are silently dropped from the cart)', () => {
    const mapped = new Set<ModuleKey>(Object.values(LEGACY_PRICING_PAGE_ID))
    const unmapped = MODULES.map((m) => m.key).filter((k) => !mapped.has(k))
    expect(
      unmapped,
      `module key(s) have no shorthand id in LEGACY_PRICING_PAGE_ID and would be silently dropped from the cart: ${unmapped.join(', ')}`,
    ).toEqual([])
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
