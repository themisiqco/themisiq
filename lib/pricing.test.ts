import { describe, it, expect } from 'vitest'
import { cartQuote, priceLine, FLAT_MODULE_PRICES, GHG_TIERS, volumeDiscount, MODULES, LEGACY_PRICING_PAGE_ID, priceLineQty, UTILITY_CONNECT_ENABLED, sourceKindSellable, ghgTierForEmployees, ghgEmployeeBandLabel, GHG_TIER_KEYS, GHG_TIER_LABELS, GHG_SIZE_BASIS_NOTE, billReviewQuote, BILL_REVIEW_ONBOARDING_USD, BILL_REVIEW_INCLUDED_SOURCES, BILL_REVIEW_SOURCE_USD, BILL_REVIEW_MAX_SELF_SERVE_SOURCES, BILL_REVIEW_HUMAN_READING_SELLABLE, type ModuleKey, type GhgTier } from './pricing'

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
      totalUSD: 1499, requiresQuote: false,
    })
  })

  it('single flat module (CBAM) = $1,499, card OK', () => {
    expect(cartQuote({ modules: ['cbam'] })).toEqual({
      totalUSD: 1499, requiresQuote: false,
    })
  })

  it('two flat modules apply the -10% volume discount: (4900 + 1499) * 0.9 = 5759', () => {
    const q = cartQuote({ modules: ['climate-risk', 'people'] })
    expect(q.totalUSD).toBe(5759)
    expect(q.requiresQuote).toBe(false)
  })

  it('GHG Professional alone is the band price', () => {
    const q = cartQuote({ modules: ['ghg'], ghgTier: 'professional' })
    expect(q.totalUSD).toBe(GHG_TIERS.professional.priceUSD)
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

  // card-any-amount (Oct 2026): a cart over $10,000 used to come back requiresInvoice and was refused at
  // card checkout. No total decides how a customer pays now, so the quote carries no such flag.
  it('CA1: a full cart over $10,000 is priced with no invoice flag', () => {
    const q = cartQuote({ modules: ALL, ghgTier: 'professional' })
    expect(q.totalUSD).toBeGreaterThan(10_000)
    expect(q).toEqual({ totalUSD: q.totalUSD, requiresQuote: false })
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
describe('priceLine backstop', () => {
  it('N4 priceLine refuses a $0 line item (fail-loud backstop; a zero price is not a price)', () => {
    expect(() => priceLine('Anything', 0)).toThrow(/zero price is not a price/)
  })
})

// ── Bill Review (formerly Concierge), Oct 2026 ───────────────────────────────
describe('billReviewQuote', () => {
  const PRICED = ['starter', 'professional', 'advisory'] as const

  it('P1 the published prices: onboarding per plan and reading, included sources, $45 a source', () => {
    expect(BILL_REVIEW_ONBOARDING_USD.ai).toEqual({ starter: 900, professional: 1800, advisory: 3500, enterprise: null })
    expect(BILL_REVIEW_ONBOARDING_USD.human).toEqual({ starter: 1200, professional: 2200, advisory: 4200, enterprise: null })
    expect(BILL_REVIEW_INCLUDED_SOURCES).toEqual({ starter: 10, professional: 30, advisory: 80, enterprise: null })
    expect(BILL_REVIEW_SOURCE_USD).toBe(45)
  })

  it('P2 a first purchase within the included sources is onboarding alone', () => {
    for (const tier of PRICED) {
      const q = billReviewQuote({ tier, reading: 'ai', sources: BILL_REVIEW_INCLUDED_SOURCES[tier] as number, isFirstPurchase: true })
      expect(q.totalUSD, tier).toBe(BILL_REVIEW_ONBOARDING_USD.ai[tier])
      expect(q.lines).toHaveLength(1)
      expect(q.lines[0].label).toBe(`Bill Review onboarding, ${GHG_TIER_LABELS[tier]} plan (includes the first year for ${BILL_REVIEW_INCLUDED_SOURCES[tier]} data sources)`)
    }
  })

  it('P3 each source above the included count is $45 in the first year', () => {
    const q = billReviewQuote({ tier: 'starter', reading: 'ai', sources: 14, isFirstPurchase: true })
    expect(q.extraSources).toBe(4)
    expect(q.totalUSD).toBe(900 + 4 * 45)
    expect(q.lines[1]).toEqual({ label: 'Bill Review data source, first year', unitUSD: 45, quantity: 4 })
    expect(q.sourceAllowance).toBe(14)
  })

  it('P4 fewer sources than included still pays onboarding, and the allowance is the included count', () => {
    const q = billReviewQuote({ tier: 'professional', reading: 'ai', sources: 3, isFirstPurchase: true })
    expect(q.totalUSD).toBe(1800)
    expect(q.sourceAllowance).toBe(30)
  })

  it('P5 human reading uses the human onboarding column and the same $45 a source', () => {
    const q = billReviewQuote({ tier: 'advisory', reading: 'human', sources: 82, isFirstPurchase: true })
    expect(q.onboardingUSD).toBe(4200)
    expect(q.sourcesUSD).toBe(2 * 45)
    expect(q.lines[0].label).toContain('human reading')
  })

  it('P6 a later purchase or renewal is $45 for every source, with no onboarding and no tier needed', () => {
    const q = billReviewQuote({ tier: null, reading: 'ai', sources: 12, isFirstPurchase: false })
    expect(q.totalUSD).toBe(12 * 45)
    expect(q.onboardingUSD).toBe(0)
    expect(q.lines).toEqual([{ label: 'Bill Review data source (1 year)', unitUSD: 45, quantity: 12 }])
  })

  it('P7 Enterprise is a quote, not a figure', () => {
    expect(billReviewQuote({ tier: 'enterprise', reading: 'ai', sources: 5, isFirstPurchase: true }).requiresQuote).toBe(true)
  })

  it('P8 a first purchase needs the plan, and bad counts throw rather than coerce', () => {
    expect(() => billReviewQuote({ tier: null, reading: 'ai', sources: 5, isFirstPurchase: true })).toThrow(/GHG plan is needed/)
    for (const bad of [0, -1, 2.5, NaN, Infinity]) {
      expect(() => billReviewQuote({ tier: 'starter', reading: 'ai', sources: bad, isFirstPurchase: true }), String(bad)).toThrow()
    }
    expect(() => billReviewQuote({ tier: 'starter', reading: 'ai', sources: BILL_REVIEW_MAX_SELF_SERVE_SOURCES + 1, isFirstPurchase: true })).toThrow(/contact us/)
  })

  it('P9 connected sources and human reading cannot be sold yet', () => {
    expect(UTILITY_CONNECT_ENABLED).toBe(false)
    expect(sourceKindSellable('connected')).toBe(false)
    expect(sourceKindSellable('uploaded')).toBe(true)
    expect(BILL_REVIEW_HUMAN_READING_SELLABLE).toBe(false)
  })
})

describe('priceLineQty', () => {
  it('C12 multiplies by quantity at the UNIT price, and keeps priceLine zero-price backstop', () => {
    const l = priceLineQty('Bill Review data source (1 year)', 45, 7)
    expect(l.price_data?.unit_amount).toBe(4500)   // the UNIT, not the total
    expect(l.quantity).toBe(7)
    expect(() => priceLineQty('x', 0, 3)).toThrow(/zero price is not a price/i)
  })

  it('C13 quantity 0 throws: the absence of a line is not a line with no quantity', () => {
    expect(() => priceLineQty('x', 45, 0)).toThrow(/at least 1/i)
    expect(() => priceLineQty('x', 45, 2.5)).toThrow(/whole quantity/i)
    expect(() => priceLineQty('x', 45, NaN)).toThrow(/whole quantity/i)
  })
})

// ── Employee bands, 28 Sep 2026 ──────────────────────────────────────────────
describe('ghgTierForEmployees', () => {
  it('E1 every band resolves at both of its edges', () => {
    const edges: [number, string][] = [
      [1, 'starter'], [49, 'starter'],
      [50, 'professional'], [249, 'professional'],
      [250, 'advisory'], [999, 'advisory'],
      [1000, 'enterprise'], [10_000, 'enterprise'],
    ]
    for (const [n, tier] of edges) {
      expect(ghgTierForEmployees(n), `${n} employees`).toBe(tier)
    }
  })

  // ⚠️ A GAP OR AN OVERLAP IS A PRICING FAULT, NOT A COSMETIC ONE. A gap throws at checkout for a
  // real company size; an overlap makes the answer depend on iteration order. Walking the range is
  // the only way to prove neither, because reading the table cannot show what falls between rows.
  it('E2 the bands are contiguous and exclusive from 1 to 1,200', () => {
    for (let n = 1; n <= 1200; n++) {
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

  it('E5 locations are unlimited on every plan: no tier carries a location field (FI0)', () => {
    for (const k of GHG_TIER_KEYS) {
      expect('locationAllowance' in GHG_TIERS[k], `${k} must not describe a location allowance`).toBe(false)
    }
  })

  it('E6 each tier is worded by its employee band', () => {
    expect(ghgEmployeeBandLabel('starter')).toBe('1 to 49 employees')
    expect(ghgEmployeeBandLabel('professional')).toBe('50 to 249 employees')
    expect(ghgEmployeeBandLabel('advisory')).toBe('250 to 999 employees')
    expect(ghgEmployeeBandLabel('enterprise')).toBe('1,000 employees or more')
  })

  it('E6b the tiers are the EU company size categories, named and priced from one place (Oct 2026)', () => {
    expect(GHG_TIER_KEYS).toEqual(['starter', 'professional', 'advisory', 'enterprise'])
    expect(GHG_TIER_KEYS.map(k => GHG_TIER_LABELS[k])).toEqual(['Small', 'Medium', 'Large', 'Enterprise'])
    expect(GHG_TIER_KEYS.map(k => GHG_TIERS[k].priceUSD)).toEqual([550, 1750, 4550, null])
    expect(GHG_SIZE_BASIS_NOTE).toBe('Plans are sized using EU company size categories.')
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
    expect(q.totalUSD).toBe(1899)
  })

  it('E8 GHG plus two modules reaches the 3-module band, and GHG is still full price', () => {
    const q = cartQuote({ modules: ['ghg', 'cbam', 'supply-chain'], ghgTier: 'starter' })
    expect(q.totalUSD).toBe(Math.round((cbam + supply) * 0.8) + ghg)
    expect(q.totalUSD).toBe(4069)
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
