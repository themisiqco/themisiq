import { describe, it, expect } from 'vitest'
import { cartQuote, ADDONS, addOnRequirementsMet, priceLine, FLAT_MODULE_PRICES, GHG_TIERS, volumeDiscount, CARD_THRESHOLD_USD, MODULES, LEGACY_PRICING_PAGE_ID, conciergeQuote, priceLineQty, CONCIERGE_SOURCE_USD, CONCIERGE_ONBOARDING_USD, CONCIERGE_MAX_SELF_SERVE_SOURCES, UTILITY_CONNECT_ENABLED, sourceKindSellable, type ModuleKey, type GhgTier } from './pricing'

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

// ── Concierge, source-based model ──────────────────────────────────────
describe('conciergeQuote', () => {
  it('C1 first purchase charges onboarding for the GHG tier, plus every uploaded source', () => {
    const q = conciergeQuote({ ghgTier: 'starter', uploadedSources: 4, isFirstPurchase: true })
    expect(q.onboardingUSD).toBe(1250)
    expect(q.sourcesUSD).toBe(360)          // 4 x 90
    expect(q.totalUSD).toBe(1610)
    expect(q.lines.map(l => l.quantity)).toEqual([1, 4])
  })

  it('C2 renewal charges sources only: onboarding is once per customer, never on renewal', () => {
    const q = conciergeQuote({ ghgTier: 'advisory', uploadedSources: 4, isFirstPurchase: false })
    expect(q.onboardingUSD).toBe(0)
    expect(q.totalUSD).toBe(360)
    expect(q.lines).toHaveLength(1)
  })

  it('C3 onboarding follows the GHG tier, and a tier change does not re-trigger it', () => {
    expect(conciergeQuote({ ghgTier: 'starter',      uploadedSources: 1, isFirstPurchase: true }).onboardingUSD).toBe(1250)
    expect(conciergeQuote({ ghgTier: 'professional', uploadedSources: 1, isFirstPurchase: true }).onboardingUSD).toBe(1750)
    expect(conciergeQuote({ ghgTier: 'advisory',     uploadedSources: 1, isFirstPurchase: true }).onboardingUSD).toBe(2500)
    // Moving up a tier is a renewal for Concierge purposes: isFirstPurchase is false, so nothing.
    expect(conciergeQuote({ ghgTier: 'advisory', uploadedSources: 1, isFirstPurchase: false }).onboardingUSD).toBe(0)
    expect(CONCIERGE_ONBOARDING_USD.starter).toBe(1250)
  })

  // ⚠️ THE FLAG IS A SALES GATE, NOT A DISPLAY TWEAK. Pricing a connected source while the
  // connection does not exist would sell a service we cannot deliver.
  it('C4 connected sources are refused while UTILITY_CONNECT_ENABLED is false', () => {
    expect(UTILITY_CONNECT_ENABLED).toBe(false)
    expect(sourceKindSellable('uploaded')).toBe(true)
    expect(sourceKindSellable('connected')).toBe(false)
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: 2, connectedSources: 1, isFirstPurchase: true }))
      .toThrow(/connected sources cannot be sold yet/i)
  })

  it('C5 the connected rate is still published, so the page can show it as coming soon', () => {
    expect(CONCIERGE_SOURCE_USD.connected).toBe(60)
    expect(CONCIERGE_SOURCE_USD.uploaded).toBe(90)
  })

  it('C6 zero or negative sources is refused: Concierge with nothing to read is not a purchase', () => {
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: 0, isFirstPurchase: true }))
      .toThrow(/at least one data source/i)
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: -1, isFirstPurchase: true }))
      .toThrow(/cannot be negative/i)
  })

  // ⚠️ THESE THREE ARE WHY THE GUARDS THROW RATHER THAN COERCE. Under the Math.trunc draft, NaN
  // passed both range checks and produced a NaN quote, and 2.5 became 2 here while priceLineQty
  // rejected 2.5 downstream: two functions disagreeing about the same number.
  it('C7 NaN and Infinity are refused, not treated as a count', () => {
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: NaN, isFirstPurchase: true }))
      .toThrow(/whole number/i)
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: Infinity, isFirstPurchase: true }))
      .toThrow(/whole number/i)
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: 2, connectedSources: NaN, isFirstPurchase: true }))
      .toThrow(/whole number/i)
  })

  it('C8 a fractional count is refused rather than truncated', () => {
    expect(() => conciergeQuote({ ghgTier: 'starter', uploadedSources: 2.5, isFirstPurchase: true }))
      .toThrow(/whole number/i)
  })

  it('C9 an absent connectedSources is zero, not a validation failure', () => {
    const omitted = conciergeQuote({ ghgTier: 'starter', uploadedSources: 3, isFirstPurchase: false })
    const explicit = conciergeQuote({ ghgTier: 'starter', uploadedSources: 3, connectedSources: 0, isFirstPurchase: false })
    const undef = conciergeQuote({ ghgTier: 'starter', uploadedSources: 3, connectedSources: undefined, isFirstPurchase: false })
    expect(omitted.totalUSD).toBe(270)
    expect(explicit).toEqual(omitted)
    expect(undef).toEqual(omitted)
  })

  it('C10 the self-serve ceiling holds at 60 and refuses 61', () => {
    expect(CONCIERGE_MAX_SELF_SERVE_SOURCES).toBe(60)
    const at = conciergeQuote({ ghgTier: 'advisory', uploadedSources: 60, isFirstPurchase: false })
    expect(at.totalUSD).toBe(5400)          // 60 x 90
    expect(() => conciergeQuote({ ghgTier: 'advisory', uploadedSources: 61, isFirstPurchase: false }))
      .toThrow(/contact us for a quote/i)
  })

  // The ceiling counts the ORDER, not one kind. Uploaded plus connected is what a specialist would
  // have to set up, so it is the total that decides whether this is still self-serve.
  it('C11 the ceiling counts uploaded and connected together', () => {
    expect(() => conciergeQuote({ ghgTier: 'advisory', uploadedSources: 60, connectedSources: 1, isFirstPurchase: false }))
      .toThrow(/contact us for a quote/i)
  })
})

describe('priceLineQty', () => {
  it('C12 multiplies by quantity at the UNIT price, and keeps priceLine zero-price backstop', () => {
    const l = priceLineQty('GHG Concierge data source, uploaded (1 year)', 90, 7)
    expect(l.price_data?.unit_amount).toBe(9000)   // the UNIT, not the total
    expect(l.quantity).toBe(7)
    expect(() => priceLineQty('x', 0, 3)).toThrow(/zero price is not a price/i)
  })

  it('C13 quantity 0 throws: the absence of a line is not a line with no quantity', () => {
    expect(() => priceLineQty('x', 90, 0)).toThrow(/at least 1/i)
    expect(() => priceLineQty('x', 90, 2.5)).toThrow(/whole quantity/i)
    expect(() => priceLineQty('x', 90, NaN)).toThrow(/whole quantity/i)
  })
})
