import { describe, it, expect } from 'vitest'
import { cartQuote, ADDONS, addOnRequirementsMet, priceLine, FLAT_MODULE_PRICES, GHG_TIERS, volumeDiscount, CARD_THRESHOLD_USD, MODULES, LEGACY_PRICING_PAGE_ID, conciergeQuote, priceLineQty, CONCIERGE_SOURCE_USD, CONCIERGE_ONBOARDING_USD, CONCIERGE_MAX_SELF_SERVE_SOURCES, UTILITY_CONNECT_ENABLED, sourceKindSellable, ghgTierForEmployees, GHG_TIER_KEYS, type ModuleKey, type GhgTier } from './pricing'

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
// ⚠️ THE CART SPLITS IN TWO SINCE 28 Sep 2026, AND SO DOES THIS HELPER. GHG counts toward the
// module tally that picks the discount band, and its own price is never discounted, so a single
// gross-times-discount figure no longer describes any cart containing GHG. Modelled here the same
// way cartQuote models it, from the same tables, so a reprice moves both together.
const expectedCart = (modules: ModuleKey[], ghgTier: GhgTier): number => {
  const others = modules.filter(k => k !== 'ghg') as Exclude<ModuleKey, 'ghg'>[]
  const othersSum = others.reduce((sum, k) => sum + FLAT_MODULE_PRICES[k], 0)
  const ghgSum = modules.includes('ghg') ? (GHG_TIERS[ghgTier].priceUSD as number) : 0
  return Math.round(othersSum * (1 - volumeDiscount(modules.length))) + ghgSum
}

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

  // ⚠️ THIS ASSERTED $11,900 AND requiresInvoice UNTIL 28 Sep 2026. Professional is $1,425 under
  // the employee bands, which is far below CARD_THRESHOLD_USD, so the card path is now the normal
  // one for it. The threshold behaviour itself is asserted below on a cart that still exceeds it.
  it('GHG Professional alone is the band price and clears on card', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'professional' })
    expect(q.totalUSD).toBe(GHG_TIERS.professional.priceUSD)
    expect(q.totalUSD).toBeLessThan(CARD_THRESHOLD_USD)
    expect(q.requiresInvoice).toBe(false)
    expect(q.requiresQuote).toBe(false)
  })

  it('a full cart is the discounted others plus GHG at full price, with no bundle cap', () => {
    const ghgTier: GhgTier = 'professional'
    expect(cartQuote({ modules: ALL, ghgTier }).totalUSD).toBe(expectedCart(ALL, ghgTier))
  })

  it('a large cart is discounted at the 3+ volume band (20%), not a literal', () => {
    const n = ALL.length
    expect(n).toBeGreaterThanOrEqual(3)
    // Assert against the 3+ band boundary, so the rate can't be a stale literal.
    expect(volumeDiscount(n)).toBe(volumeDiscount(3))
    // …and that same band factor is what cartQuote actually applies.
    const ghgTier: GhgTier = 'professional'
    const q = cartQuote({ modules: ALL, ghgTier })
    expect(q.totalUSD).toBe(expectedCart(ALL, ghgTier))
    // And the band really is the one GHG helped reach: drop GHG and the tally falls by one.
    expect(volumeDiscount(ALL.length)).toBe(volumeDiscount(ALL.filter(k => k !== 'ghg').length + 1))
  })

  it('a full cart exceeds the card threshold → requiresInvoice (cap no longer holds it under $10k)', () => {
    const q = cartQuote({ modules: ALL, ghgTier: 'professional' })
    expect(q.totalUSD).toBeGreaterThan(CARD_THRESHOLD_USD)
    expect(q.requiresInvoice).toBe(true)
  })

  // ⚠️ THE QUOTE TIER MOVED ON 28 Sep 2026. Advisory was the quote path and is now the 250 to 499
  // band at a published price; Enterprise is the quote path. A test still naming Advisory here would
  // pass only while some tier happened to have a null price, which is not what it is checking.
  it('GHG Enterprise -> requiresQuote, no self-serve total', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'enterprise' })
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
    const q = conciergeQuote({ uploadedSources: 4, isFirstPurchase: true })
    expect(q.onboardingUSD).toBe(CONCIERGE_ONBOARDING_USD)
    expect(CONCIERGE_ONBOARDING_USD).toBe(1395)
    expect(q.sourcesUSD).toBe(360)          // 4 x 90
    expect(q.totalUSD).toBe(1395 + 360)
    expect(q.lines.map(l => l.quantity)).toEqual([1, 4])
  })

  it('C2 renewal charges sources only: onboarding is once per customer, never on renewal', () => {
    const q = conciergeQuote({ uploadedSources: 4, isFirstPurchase: false })
    expect(q.onboardingUSD).toBe(0)
    expect(q.totalUSD).toBe(360)
    expect(q.lines).toHaveLength(1)
  })

  // ⚠️ FLAT, AND THIS ASSERTED THE OPPOSITE UNTIL 28 Sep 2026. The fee was 1250 / 1750 / 2500 by
  // GHG tier, which is what forced both purchase routes to work out a customer's band before they
  // could price Concierge. conciergeQuote does not take a tier any more, so there is no tier for
  // this to vary by: the assertion is that the fee is the same number, once, for everyone.
  it('C3 onboarding does not vary by plan, and a tier change cannot re-trigger it', () => {
    const first = conciergeQuote({ uploadedSources: 1, isFirstPurchase: true })
    expect(first.onboardingUSD).toBe(CONCIERGE_ONBOARDING_USD)
    // Moving up a plan is a renewal for Concierge purposes: isFirstPurchase is false, so nothing.
    expect(conciergeQuote({ uploadedSources: 1, isFirstPurchase: false }).onboardingUSD).toBe(0)
  })

  // ⚠️ THE FLAG IS A SALES GATE, NOT A DISPLAY TWEAK. Pricing a connected source while the
  // connection does not exist would sell a service we cannot deliver.
  it('C4 connected sources are refused while UTILITY_CONNECT_ENABLED is false', () => {
    expect(UTILITY_CONNECT_ENABLED).toBe(false)
    expect(sourceKindSellable('uploaded')).toBe(true)
    expect(sourceKindSellable('connected')).toBe(false)
    expect(() => conciergeQuote({ uploadedSources: 2, connectedSources: 1, isFirstPurchase: true }))
      .toThrow(/connected sources cannot be sold yet/i)
  })

  it('C5 the connected rate is still published, so the page can show it as coming soon', () => {
    expect(CONCIERGE_SOURCE_USD.connected).toBe(60)
    expect(CONCIERGE_SOURCE_USD.uploaded).toBe(90)
  })

  it('C6 zero or negative sources is refused: Concierge with nothing to read is not a purchase', () => {
    expect(() => conciergeQuote({ uploadedSources: 0, isFirstPurchase: true }))
      .toThrow(/at least one data source/i)
    expect(() => conciergeQuote({ uploadedSources: -1, isFirstPurchase: true }))
      .toThrow(/cannot be negative/i)
  })

  // ⚠️ THESE THREE ARE WHY THE GUARDS THROW RATHER THAN COERCE. Under the Math.trunc draft, NaN
  // passed both range checks and produced a NaN quote, and 2.5 became 2 here while priceLineQty
  // rejected 2.5 downstream: two functions disagreeing about the same number.
  it('C7 NaN and Infinity are refused, not treated as a count', () => {
    expect(() => conciergeQuote({ uploadedSources: NaN, isFirstPurchase: true }))
      .toThrow(/whole number/i)
    expect(() => conciergeQuote({ uploadedSources: Infinity, isFirstPurchase: true }))
      .toThrow(/whole number/i)
    expect(() => conciergeQuote({ uploadedSources: 2, connectedSources: NaN, isFirstPurchase: true }))
      .toThrow(/whole number/i)
  })

  it('C8 a fractional count is refused rather than truncated', () => {
    expect(() => conciergeQuote({ uploadedSources: 2.5, isFirstPurchase: true }))
      .toThrow(/whole number/i)
  })

  it('C9 an absent connectedSources is zero, not a validation failure', () => {
    const omitted = conciergeQuote({ uploadedSources: 3, isFirstPurchase: false })
    const explicit = conciergeQuote({ uploadedSources: 3, connectedSources: 0, isFirstPurchase: false })
    const undef = conciergeQuote({ uploadedSources: 3, connectedSources: undefined, isFirstPurchase: false })
    expect(omitted.totalUSD).toBe(270)
    expect(explicit).toEqual(omitted)
    expect(undef).toEqual(omitted)
  })

  it('C10 the self-serve ceiling holds at 60 and refuses 61', () => {
    expect(CONCIERGE_MAX_SELF_SERVE_SOURCES).toBe(60)
    const at = conciergeQuote({ uploadedSources: 60, isFirstPurchase: false })
    expect(at.totalUSD).toBe(5400)          // 60 x 90
    expect(() => conciergeQuote({ uploadedSources: 61, isFirstPurchase: false }))
      .toThrow(/contact us for a quote/i)
  })

  // The ceiling counts the ORDER, not one kind. Uploaded plus connected is what a specialist would
  // have to set up, so it is the total that decides whether this is still self-serve.
  it('C11 the ceiling counts uploaded and connected together', () => {
    expect(() => conciergeQuote({ uploadedSources: 60, connectedSources: 1, isFirstPurchase: false }))
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

// ── Employee bands, 28 Sep 2026 ──────────────────────────────────────────────
describe('ghgTierForEmployees', () => {
  it('E1 every band resolves at both of its edges', () => {
    const edges: [number, string][] = [
      [1, 'starter'], [19, 'starter'],
      [20, 'professional'], [99, 'professional'],
      [100, 'business'], [249, 'business'],
      [250, 'advisory'], [499, 'advisory'],
      [500, 'enterprise'], [10_000, 'enterprise'],
    ]
    for (const [n, tier] of edges) {
      expect(ghgTierForEmployees(n), `${n} employees`).toBe(tier)
    }
  })

  // ⚠️ A GAP OR AN OVERLAP IS A PRICING FAULT, NOT A COSMETIC ONE. A gap throws at checkout for a
  // real company size; an overlap makes the answer depend on iteration order. Walking the range is
  // the only way to prove neither, because reading the table cannot show what falls between rows.
  it('E2 the bands are contiguous and exclusive from 1 to 600', () => {
    for (let n = 1; n <= 600; n++) {
      const matches = GHG_TIER_KEYS.filter(k => {
        const { min, max } = GHG_TIERS[k].employees
        return n >= min && (max == null || n <= max)
      })
      expect(matches.length, `${n} employees falls in ${matches.length} bands, not 1`).toBe(1)
      expect(ghgTierForEmployees(n)).toBe(matches[0])
    }
  })

  it('E3 a count that is not a whole number of at least 1 throws rather than banding', () => {
    for (const bad of [0, -1, 2.5, NaN, Infinity]) {
      expect(() => ghgTierForEmployees(bad), `${bad} must not resolve to a band`)
        .toThrow(/whole number of at least 1/i)
    }
  })

  it('E4 Enterprise is the only open-ended band and the only quote path', () => {
    const quoteOnly = GHG_TIER_KEYS.filter(k => GHG_TIERS[k].priceUSD == null)
    expect(quoteOnly).toEqual(['enterprise'])
    const openEnded = GHG_TIER_KEYS.filter(k => GHG_TIERS[k].employees.max == null)
    expect(openEnded).toEqual(['enterprise'])
  })

  it('E5 locations are unlimited on every plan', () => {
    for (const k of GHG_TIER_KEYS) {
      expect(GHG_TIERS[k].locationAllowance, `${k} must be uncapped`).toBeNull()
    }
  })
})

// ── GHG and the volume discount ──────────────────────────────────────────────
// ⚠️ TWO RULES, NOT ONE. GHG COUNTS toward the module tally that picks the discount band, and its
// own price is NEVER discounted. The worked cases below are the ones that distinguish that from
// both of the simpler rules it could be mistaken for.
describe('cartQuote keeps GHG out of the discount but not out of the count', () => {
  const ghg = GHG_TIERS.starter.priceUSD as number
  const cbam = FLAT_MODULE_PRICES.cbam
  const supply = FLAT_MODULE_PRICES['supply-chain']

  it('E6 GHG alone is the band price, undiscounted', () => {
    expect(cartQuote({ modules: ['ghg'], ghgTier: 'starter' }).totalUSD).toBe(ghg)
  })

  it('E7 GHG plus one module reaches the 2-module band, and only the other module is discounted', () => {
    const q = cartQuote({ modules: ['ghg', 'cbam'], ghgTier: 'starter' })
    expect(q.totalUSD).toBe(Math.round(cbam * 0.9) + ghg)
    expect(q.totalUSD).toBe(1824)
  })

  it('E8 GHG plus two modules reaches the 3-module band, and GHG is still full price', () => {
    const q = cartQuote({ modules: ['ghg', 'cbam', 'supply-chain'], ghgTier: 'starter' })
    expect(q.totalUSD).toBe(Math.round((cbam + supply) * 0.8) + ghg)
    expect(q.totalUSD).toBe(3994)
  })

  it('E9 a cart without GHG is unchanged by any of this', () => {
    expect(cartQuote({ modules: ['cbam', 'supply-chain'] }).totalUSD).toBe(3959)
  })

  it('E10 Enterprise sends the whole selection to quote, as Advisory used to', () => {
    const q = cartQuote({ modules: ['ghg', 'cbam'], ghgTier: 'enterprise' })
    expect(q.requiresQuote).toBe(true)
    expect(q.totalUSD).toBe(0)
    // And Advisory no longer does, because it has a price now.
    expect(cartQuote({ modules: ['ghg'], ghgTier: 'advisory' }).requiresQuote).toBe(false)
  })
})
