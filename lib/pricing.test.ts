import { describe, it, expect } from 'vitest'
import { cartQuote, type ModuleKey } from './pricing'

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
