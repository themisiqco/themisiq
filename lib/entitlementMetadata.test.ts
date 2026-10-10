import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripTsComments } from './testing/stripComments'
import { GHG_TIERS, isFirstConciergePurchase, ghgTierMetaValue, GHG_TIER_KEYS, TIER_PRICING, LEGACY_CONCIERGE_KEYS, CONCIERGE_KEY, type Tier } from './pricing'

// THE TWO WRITERS AND THE ONE READER MUST AGREE ON EVERY KEY.
//
// Two routes write Stripe metadata that grantFromMetadata reads: app/api/checkout/route.ts (card) and
// app/api/admin/create-invoice/route.ts (manual invoice). A key one writer sends and the other omits is a
// grant that differs by payment path, silently: the history is create-invoice omitting the location
// allowance, so every invoiced customer got a different entitlement from a card customer.
//
// FI0 (docs/review/design-derived-figures.md section 11): LOCATIONS ARE UNLIMITED ON EVERY PLAN, so
// ghg_location_allowance is gone from the contract. Neither writer sends it, the webhook neither reads it
// nor writes entitlements.location_allowance, and the database gate checks only the entitlement. These
// tests now pin that it stays gone, as firmly as they once pinned that it was present.
//
// ⚠️ WHAT THIS TEST CAN AND CANNOT DO. Neither route exports its metadata object — both are built
// inline inside an `export async function POST`, and grantFromMetadata is a module-private async
// function that calls Stripe and the Supabase admin client. So this cannot invoke the real writers or
// the real reader. It asserts the contract textually instead. See the note at the bottom for what would
// need to change to test this properly.

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const CHECKOUT = 'app/api/checkout/route.ts'
const INVOICE = 'app/api/admin/create-invoice/route.ts'
const WEBHOOK = 'app/api/webhooks/stripe/route.ts'

// The keys grantFromMetadata's contract depends on. `source` is informational; no user_id or
// entitlements → nothing granted; ghg_tier records the band that was sold.
const REQUIRED_KEYS = ['user_id', 'entitlements', 'source', 'ghg_tier']

// The Concierge keys, added Sep 2026 with the source-based model. Both writers spread a
// conciergeMeta object rather than listing these inline, so the assertion is on the spread plus the
// keys being present in the file that builds it.
//
// ⚠️ A writer that omits concierge_source_allowance does not fail: it grants Concierge with no recorded
// source count, and whatever Batch 3 enforces against that count silently has nothing to enforce.
// concierge_onboarding_usd is the exception: it is RECORDED and must never become an entitlement.
const CONCIERGE_META_KEYS = [
  'concierge_uploaded_sources',
  'concierge_connected_sources',
  'concierge_source_allowance',
  'concierge_onboarding_usd',
]

// Pull out just the `const metadata = { … }` literal, so a key name appearing elsewhere in a 200-line
// route cannot satisfy the assertion. Brace-counted rather than regex-terminated, because the value
// expressions contain braces of their own.
const metadataLiteral = (src: string): string => {
  const start = src.indexOf('const metadata = {')
  if (start === -1) throw new Error('no `const metadata = {` found — the writers must build one object')
  let depth = 0
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error('unbalanced braces in the metadata literal')
}

// A key is present whether written longhand (`user_id: userId`) or as an ES6 SHORTHAND
// (`entitlements,` — checkout assigns a local of that name first, so no colon appears). Requiring a
// colon is what made the first run of this test fail on a route that was correct.
const hasKey = (literal: string, key: string): boolean =>
  new RegExp(`(^|[{,\\s])${key}\\s*[:,}]`).test(literal)

describe('the entitlement metadata contract', () => {
  it('both writers carry every key in the contract, and the same set', () => {
    const checkout = metadataLiteral(read(CHECKOUT))
    const invoice = metadataLiteral(read(INVOICE))
    for (const key of REQUIRED_KEYS) {
      expect(hasKey(checkout, key), `${CHECKOUT} metadata must write ${key}`).toBe(true)
      expect(hasKey(invoice, key), `${INVOICE} metadata must write ${key}`).toBe(true)
    }
  })

  it('FI0: no writer sends a location allowance, and nothing derives one', () => {
    // Code only: the route comments explain the removal, and may name what was removed.
    for (const [file, src] of [[CHECKOUT, stripTsComments(read(CHECKOUT))], [INVOICE, stripTsComments(read(INVOICE))]] as const) {
      expect(hasKey(metadataLiteral(src), 'ghg_location_allowance'), `${file} must not send ghg_location_allowance`).toBe(false)
      expect(src, `${file} must not derive an allowance`).not.toContain('locationAllowanceForTier')
      expect(src, `${file} must not read location_allowance`).not.toContain('location_allowance')
      expect(src, `${file} must not hold an allowance`).not.toMatch(/ghgAllowance/)
    }
  })

  it('FI0: the webhook neither reads the allowance key nor writes entitlements.location_allowance', () => {
    const src = stripTsComments(read(WEBHOOK))
    expect(src).not.toContain('ghgAllowanceRaw')
    expect(src).not.toMatch(/location_allowance\s*:/)
  })

  it('FI0: no GHG tier carries a location field; every tier is an employee band', () => {
    for (const tier of GHG_TIER_KEYS) {
      expect(Object.keys(GHG_TIERS[tier]).sort(), tier).toEqual(['employees', 'priceUSD'])
    }
    expect(Object.keys(GHG_TIERS).length).toBe(GHG_TIER_KEYS.length)
    // The guard both writers use, so a cart without GHG records no tier.
    expect(read(CHECKOUT)).toContain("moduleKeys.includes('ghg')")
    expect(read(INVOICE)).toContain("moduleKeys.includes('ghg')")
  })
})

// ── TO TEST THIS PROPERLY ─────────────────────────────────────────────────────────────────────────
// The textual assertions above exist because nothing is extractable. What would need to change:
//   1. Extract the metadata builder into lib/ — e.g. buildEntitlementMetadata({ userId, entitlements,
//      source, ghgTier }): Record<string, string> — and have BOTH routes call it. One writer
//      instead of two, and the key cannot go missing from one of them.
//   2. Export the read side as a pure function — e.g. parseGhgTier(raw) — and have
//      grantFromMetadata call it. Then the round-trip is a real unit test, not a mirrored copy.
// Neither is done here: restructuring two live payment routes is not this test's job, and both routes
// are on the money path where CLAUDE.md requires the change be proposed and reviewed, not assumed.
// ── Concierge metadata, Sep 2026 source-based model ─────────────────────────
describe('Concierge purchase metadata', () => {
  it('M10 both writers spread conciergeMeta into the metadata literal', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      expect(metadataLiteral(read(rel)), `${rel} must spread conciergeMeta`).toContain('...conciergeMeta')
    }
  })

  // Oct 2026: both writers spread the metadata lib/billReviewOrder.ts builds, so the keys live there once.
  it('M11 both writers build every Bill Review (Concierge) key, through the shared order', () => {
    const order = read('lib/billReviewOrder.ts')
    for (const key of CONCIERGE_META_KEYS) expect(order, `lib/billReviewOrder.ts is missing ${key}`).toContain(key)
    for (const rel of [CHECKOUT, INVOICE]) expect(read(rel), rel).toContain('conciergeMeta = order.meta')
  })

  it('M12 both writers carry ghg_tier, with the empty-string convention', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      expect(metadataLiteral(read(rel)), `${rel} must write ghg_tier through the guard`).toContain('ghg_tier: ghgTierMetaValue(ghgTierForMeta)')
    }
  })

  // ⚠️ THE ONBOARDING FEE IS NOT ACCESS. It buys setup work once. If it ever reached the
  // entitlements string it would become a row with a 365-day term, and would then expire, which is
  // meaningless for work already done and billed.
  it('M13 neither writer adds the onboarding fee to the entitlements being granted', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      expect(src, `${rel} must not grant onboarding`).not.toMatch(/add\(\s*['"]concierge[_-]onboarding/i)
    }
  })
})

// ── Concierge route logic ────────────────────────────────────────
describe('isFirstConciergePurchase', () => {
  it('M14 true only when no Concierge row of any generation exists', () => {
    expect(isFirstConciergePurchase([])).toBe(true)
    expect(isFirstConciergePurchase(['ghg', 'cbam'])).toBe(true)
    expect(isFirstConciergePurchase(['ghg', 'concierge'])).toBe(false)
    for (const legacy of LEGACY_CONCIERGE_KEYS) {
      expect(isFirstConciergePurchase(['ghg', legacy]), `${legacy} is still a prior purchase`).toBe(false)
    }
  })

  // The rule Lisa set: Concierge rows only. A source-based test would match a hand-written GHG row
  // for a pilot customer and wrongly skip their onboarding fee.
  it('M15 a manual grant on another module is not a prior Concierge purchase', () => {
    expect(isFirstConciergePurchase(['ghg'])).toBe(true)
  })
})

// ⚠️ ghgTierFromAllowance AND ITS TESTS (M16, M17) WERE DELETED ON 28 Sep 2026, and the reason is
// worth keeping. It derived a GHG tier from a stored location_allowance so the Concierge onboarding
// fee could be priced by band for a customer who was not buying GHG in the same cart. Two things
// killed it on the same day: locations became unlimited, so every allowance is null and it could
// only ever return null; and the onboarding fee became flat, so nothing needs a tier to price
// Concierge at all. Both purchase routes lost the derivation and the 400 that went with it.
//
// If a Concierge price is ever banded again, do not revive this. Read entitlements.ghg_tier, which
// records the band that was actually sold.

describe('Concierge route guards', () => {
  it('M18 both routes price Bill Review through billReviewOrder and billReviewQuote, never a literal', () => {
    expect(read('lib/billReviewOrder.ts')).toContain('billReviewQuote(')
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      expect(src, `${rel} must call billReviewOrder`).toContain('billReviewOrder(body.concierge')
      expect(src, `${rel} must not compute a source price itself`).not.toMatch(/BILL_REVIEW_SOURCE_USD|BILL_REVIEW_ONBOARDING_USD/)
    }
  })

  it('M19 a connected quantity is refused at the server boundary, in the order both routes call', () => {
    const order = read('lib/billReviewOrder.ts')
    expect(order).toContain('UTILITY_CONNECT_ENABLED')
    expect(order).toMatch(/not available yet/i)
    for (const rel of [CHECKOUT, INVOICE]) expect(read(rel), rel).toContain('billReviewOrder(body.concierge')
  })

  // ⚠️ TIERED AGAIN SINCE OCT 2026 (pricing-2026-10), AND THE SOURCE OF THE TIER IS THE POINT. Bill Review
  // onboarding is priced by GHG tier. The tier comes from this cart's validated GHG tier, or else from the
  // ghg_tier recorded on the customer's ACTIVE GHG entitlement, which the webhook writes. It never comes from
  // a stored location allowance (that derivation is gone) and never from an unvalidated client value.
  it('M20 both routes take the onboarding tier from the cart or the held GHG plan', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      const branch = src.slice(src.indexOf('if (body.concierge)'))
      expect(branch, rel).toContain("select('module_key, ghg_tier, term_end')")
      expect(branch, rel).toMatch(/const cartTier = [^\n]*\? ghgTierForMeta : null/)
      expect(branch, `${rel}: the tier derivation was deleted with the banded fee`).not.toMatch(/ghgTierFromAllowance/)
    }
  })

  it('M21 both routes fail loudly when the entitlement read errors', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      expect(read(rel), `${rel} must not treat a failed read as owning nothing`).toMatch(/ownedErr/)
    }
  })
})

// ── Batch 3: the columns, the guard, and the two term checks ─────────────────
const MIGRATION = 'supabase/migrations/20260928_concierge_source_model.sql'
const HOOKS = 'lib/useEntitlement.ts'
// BR4 (10 Oct 2026): the server's read moved from the extract route into lib/ghg/billReviewGuard.ts
// (billReviewEntitlement), shared by the extract and submit routes. M33 holds both routes to it.
const EXTRACT = 'lib/ghg/billReviewGuard.ts'

/**
 * The tier keys the live ghg_tier CHECK permits, read from whichever migration last defines it.
 *
 * ⚠️ READ, NOT HARDCODED, BECAUSE THE DATABASE IS DELIBERATELY AHEAD OF THE CODE. The constraint
 * is widened by a migration that runs BEFORE the deployment using the new keys, so between the two
 * there are values Postgres accepts and TypeScript does not. An assertion matching the constraint
 * text verbatim forbids that window, which is the safe ordering and the one CLAUDE.md requires.
 *
 * Migrations are applied in filename order, so the last file defining the constraint is the one in
 * force. Rollback files are excluded: they define the OLD constraint and would otherwise win the
 * sort on any date where both exist.
 */
const ghgTierCheckKeys = (): string[] => {
  const defining = readdirSync(join(ROOT, 'supabase/migrations'))
    .filter(f => f.endsWith('.sql') && !f.includes('rollback'))
    .sort()
    .filter(f => /add constraint entitlements_ghg_tier_check/i.test(read(`supabase/migrations/${f}`)))
  if (defining.length === 0) {
    throw new Error('no migration defines entitlements_ghg_tier_check: this test cannot assert anything')
  }
  const sql = read(`supabase/migrations/${defining[defining.length - 1]}`)
  const m = /ghg_tier in \(([^)]*)\)/i.exec(sql)
  if (!m) throw new Error('the ghg_tier CHECK has no parseable value list')
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

describe('ghg_tier can never be a value the CHECK constraint rejects', () => {
  // ⚠️ THIS IS THE ONE THAT FAILS AFTER PAYMENT. The webhook writes ghg_tier into a column
  // constrained to three values. A fourth tier, or an unvalidated body.tier reaching metadata,
  // makes the grant throw, and throwing is Stripe's retry signal, so it retries a write that can
  // never succeed while the customer waits for access they have paid for.
  it('M22 GHG_TIER_KEYS matches the Tier union everywhere it is expressed', () => {
    expect([...GHG_TIER_KEYS].sort()).toEqual(Object.keys(GHG_TIERS).sort())
    // ⚠️ TIER_PRICING IS NOT IN THIS ASSERTION ANY MORE. It described the retired per-module
    // ladder and is pinned to the three keys that model had. The two coincided until Business and
    // Enterprise arrived on 28 Sep 2026; comparing them now would force prices into a dead model.
  })

  // ⚠️ SUBSET, NOT EQUALITY, AND THE DIRECTION IS THE WHOLE POINT. The constraint must permit
  // every key the code can write, and may permit more. The unsafe direction, a key in
  // GHG_TIER_KEYS that the constraint rejects, fails here: that is the one that takes a customer's
  // payment and then cannot grant them anything. The safe direction, a value the database allows
  // and TypeScript does not, is the migration running ahead of the deployment, exactly as intended.
  it('M23 the SQL CHECK permits every key the code can write', () => {
    const permitted = ghgTierCheckKeys()
    for (const k of GHG_TIER_KEYS) {
      expect(permitted, `the ghg_tier CHECK must permit ${k}, or a purchase on it fails after payment`)
        .toContain(k)
    }
  })

  // And the constraint is genuinely read: a parse returning an empty list would make M23 vacuous
  // while looking green.
  it('M23b the constraint parses and still names the three original keys', () => {
    const permitted = ghgTierCheckKeys()
    expect(permitted.length).toBeGreaterThanOrEqual(3)
    for (const k of ['starter', 'professional', 'advisory']) {
      expect(permitted, `${k} has existed since the column did and cannot be dropped silently`).toContain(k)
    }
  })

  it('M24 the guard passes the three through and flattens everything else to empty', () => {
    for (const k of GHG_TIER_KEYS) expect(ghgTierMetaValue(k)).toBe(k)
    for (const bad of ['platinum', 'STARTER', '', 'ghg', null, undefined, 3, {}, ['starter']]) {
      expect(ghgTierMetaValue(bad), `${String(bad)} must not reach metadata`).toBe('')
    }
  })

  it('M25 both writers put ghg_tier through the guard, never a raw value', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const lit = metadataLiteral(read(rel))
      expect(lit, `${rel} must call the guard`).toContain('ghgTierMetaValue(')
      expect(lit, `${rel} must not write a raw tier`).not.toMatch(/ghg_tier:\s*(body\.)?tier\b/)
    }
  })
})

describe('the webhook writes the Batch 3 columns', () => {
  it('M26 it reads both new metadata keys with the empty-string convention', () => {
    const src = read(WEBHOOK)
    expect(src).toContain('metadata?.ghg_tier')
    expect(src).toContain('metadata?.concierge_source_allowance')
  })

  it('M27 it writes ghg_tier on the ghg row and source_allowance on the concierge row', () => {
    const src = read(WEBHOOK)
    expect(src).toMatch(/ghg_tier:\s*module_key === 'ghg'/)
    expect(src).toMatch(/source_allowance:\s*module_key === CONCIERGE_KEY/)
    expect(CONCIERGE_KEY).toBe('concierge')
  })

  // The fallback is meaningless without the columns in the prior read: priorByKey would hold
  // undefined for both, and every in-flight old session would blank them.
  it('M28 the prior-terms read selects the two columns the fallback depends on', () => {
    expect(read(WEBHOOK)).toContain("select('module_key, term_start, term_end, ghg_tier, source_allowance')")
  })

  // ⚠️ THE ONBOARDING FEE IS NOT ACCESS. As a row it would take a 365-day term and then expire,
  // which is meaningless for work done and billed once.
  it('M29 the onboarding fee never becomes an entitlement row', () => {
    const src = read(WEBHOOK)
    expect(src).not.toMatch(/module_key\s*===\s*['"]concierge[_-]onboarding/i)
    expect(src).not.toMatch(/keys\.push\(\s*['"]concierge[_-]onboarding/i)
  })
})

describe('Concierge access checks respect the term', () => {
  // ⚠️ THE DEFECT THIS PINS PRODUCED NO ERROR AND NO SYMPTOM. useHasConcierge() selected the
  // Concierge rows and never looked at term_end, so an expired customer kept bill extraction,
  // which is the more expensive of the two model endpoints. Both readers now compare the term.
  it('M30 both readers filter on term_end', () => {
    for (const rel of [HOOKS, EXTRACT]) {
      expect(read(rel), `${rel} must compare term_end, or an expired customer keeps access`)
        .toMatch(/\.gt\(\s*'term_end'/)
    }
  })

  it('M31 neither reader hardcodes the key list any more', () => {
    for (const rel of [HOOKS, EXTRACT]) {
      const src = read(rel)
      expect(src, `${rel} must read the shared list`).toContain('CONCIERGE_ENTITLEMENT_KEYS')
      expect(src, `${rel} must not inline the old keys`).not.toContain("'concierge-basic', 'concierge-standard'")
    }
  })

  it('M33 both Bill Review routes read the plan through the shared check, and neither queries entitlements itself', () => {
    for (const rel of ['app/api/concierge/extract/route.ts', 'app/api/bill-review/submit/route.ts']) {
      const src = read(rel)
      expect(src, rel).toContain('await billReviewEntitlement(supabase)')
      expect(src, rel).not.toContain(".from('entitlements')")
    }
  })

  // isFirstConciergePurchase is the opposite question and must stay term-blind: an expired customer
  // has no access, but the setup work was done and billed once.
  it('M32 the onboarding check is still not term-aware', () => {
    for (const legacy of LEGACY_CONCIERGE_KEYS) {
      expect(isFirstConciergePurchase([legacy])).toBe(false)
    }
    expect(isFirstConciergePurchase(['concierge'])).toBe(false)
  })
})
