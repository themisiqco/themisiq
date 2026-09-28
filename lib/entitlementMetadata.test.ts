import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { GHG_TIERS, locationAllowanceForTier, isFirstConciergePurchase, ghgTierFromAllowance, ghgTierMetaValue, GHG_TIER_KEYS, TIER_PRICING, LEGACY_CONCIERGE_KEYS, CONCIERGE_KEY, type Tier } from './pricing'

// A WRITER OMITTING THE KEY GRANTS UNLIMITED LOCATIONS.
//
// Two routes write Stripe metadata that grantFromMetadata reads: app/api/checkout/route.ts (card) and
// app/api/admin/create-invoice/route.ts (manual invoice). The webhook reads
// `ghg_location_allowance` as `raw ? Number(raw) : null` and writes that to
// entitlements.location_allowance, where enforce_ghg_location_allowance() treats NULL as UNCAPPED.
//
// So a writer that omits the key does not fail — it grants unlimited locations, silently, on the paid
// path. That is exactly what happened: create-invoice sent { user_id, entitlements, source } and no
// allowance, and because GHG Professional ($11,900) exceeds CARD_THRESHOLD_USD ($10,000), EVERY
// self-serve Professional purchase routes through that path. None was ever capped at 15.
//
// ⚠️ WHAT THIS TEST CAN AND CANNOT DO. Neither route exports its metadata object — both are built
// inline inside an `export async function POST`, and grantFromMetadata is a module-private async
// function that calls Stripe and the Supabase admin client. So this cannot invoke the real writers or
// the real reader. It asserts two things instead:
//   1. THE DERIVATION, for real, against GHG_TIERS — locationAllowanceForTier is imported and called.
//   2. THE CONTRACT, textually — that both route files still contain the key, the same stringify
//      expression, and the same helper call; and that the webhook still contains the read expression.
// Textual assertions are weaker than invoking the code, but they catch the actual defect class here,
// which is a key going MISSING from one writer. See the note at the bottom for what would need to
// change to test this properly.

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const CHECKOUT = 'app/api/checkout/route.ts'
const INVOICE = 'app/api/admin/create-invoice/route.ts'
const WEBHOOK = 'app/api/webhooks/stripe/route.ts'

// The four keys grantFromMetadata's contract depends on. `source` is informational, the other three
// are load-bearing: no user_id or entitlements → nothing granted; no ghg_location_allowance →
// uncapped.
const REQUIRED_KEYS = ['user_id', 'entitlements', 'source', 'ghg_location_allowance', 'ghg_tier']

// The Concierge keys, added Sep 2026 with the source-based model. Both writers spread a
// conciergeMeta object rather than listing these inline, so the assertion is on the spread plus the
// keys being present in the file that builds it.
//
// ⚠️ SAME DEFECT CLASS AS ghg_location_allowance, WHICH IS WHY THEY ARE PINNED HERE. A writer that
// omits concierge_source_allowance does not fail: it grants Concierge with no recorded source count,
// and whatever Batch 3 enforces against that count silently has nothing to enforce.
// concierge_onboarding_usd is the exception: it is RECORDED and must never become an entitlement.
const CONCIERGE_META_KEYS = [
  'concierge_uploaded_sources',
  'concierge_connected_sources',
  'concierge_source_allowance',
  'concierge_onboarding_usd',
  'concierge_ghg_tier',
]

// The stringify expression both writers must use, verbatim. The empty-string convention is not
// cosmetic: '' is what the webhook's truthiness check reads as null → uncapped.
const STRINGIFY = `ghg_location_allowance: ghgAllowance != null ? String(ghgAllowance) : ''`

// Mirrors of the two conventions, for asserting SEMANTICS. Labelled as mirrors because they are
// copies — if the real expressions change, the textual assertions above fail, not these.
const writeConvention = (allowance: number | null): string => (allowance != null ? String(allowance) : '')
const readConvention = (raw: string | undefined): number | null => (raw ? Number(raw) : null)

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
  it('a writer omitting the key grants unlimited locations', () => {
    const checkout = metadataLiteral(read(CHECKOUT))
    const invoice = metadataLiteral(read(INVOICE))

    // Both writers carry every key in the contract — this is the assertion that would have failed
    // while create-invoice was silently omitting the allowance.
    for (const key of REQUIRED_KEYS) {
      expect(hasKey(checkout, key), `${CHECKOUT} metadata must write ${key}`).toBe(true)
      expect(hasKey(invoice, key), `${INVOICE} metadata must write ${key}`).toBe(true)
    }

    // THE SAME KEY SET, not merely a superset each. A key on one writer and not the other is the
    // defect; checkout may also carry consent keys via spread, which are not part of this contract.
    for (const key of REQUIRED_KEYS) {
      expect(hasKey(checkout, key)).toBe(hasKey(invoice, key))
    }

    // And write it the SAME way. Two writers, one reader, one convention.
    expect(checkout, `${CHECKOUT} must use the shared stringify convention`).toContain(STRINGIFY)
    expect(invoice, `${INVOICE} must use the shared stringify convention`).toContain(STRINGIFY)
  })

  it('both writers derive the allowance from GHG_TIERS, never a literal', () => {
    for (const [file, src] of [[CHECKOUT, read(CHECKOUT)], [INVOICE, read(INVOICE)]] as const) {
      expect(src, `${file} must derive via locationAllowanceForTier`).toContain('locationAllowanceForTier')
      // The literal this replaced. `ghgAllowance = 3` was the pack path in checkout; a bare integer
      // assignment anywhere means a second source of truth for what a tier includes.
      expect(src, `${file} must not assign a literal allowance`).not.toMatch(/ghgAllowance = \d/)
    }
  })

  it('the webhook still reads the empty-string convention as null', () => {
    // If this expression changes, '' stops meaning uncapped and every advisory/pack purchase changes
    // silently. Asserted textually because grantFromMetadata is not exported.
    expect(read(WEBHOOK)).toContain('ghgAllowanceRaw ? Number(ghgAllowanceRaw) : null')
    expect(read(WEBHOOK)).toContain("location_allowance: module_key === 'ghg' ? ghgAllowance : null")
  })

  it('a GHG cart writes the tier ceiling — 3 at starter, 15 at professional — from GHG_TIERS', () => {
    // Derived, not compared to literals: these read the same table checkout reads, so a tier change
    // moves the expectation with the product rather than failing on a stale number.
    for (const tier of ['starter', 'professional'] as Tier[]) {
      const allowance = locationAllowanceForTier(tier)
      expect(allowance).toBe(GHG_TIERS[tier].locationAllowance)
      expect(allowance).not.toBeNull()
      expect(writeConvention(allowance)).toBe(String(GHG_TIERS[tier].locationAllowance))
      // Round-trip: what the writer sends, the reader turns back into the same integer.
      expect(readConvention(writeConvention(allowance))).toBe(GHG_TIERS[tier].locationAllowance)
    }
    // Sanity on the shape of the table itself, so the test above cannot pass vacuously.
    expect(GHG_TIERS.starter.locationAllowance).toBeTypeOf('number')
    expect(GHG_TIERS.professional.locationAllowance).toBeTypeOf('number')
  })

  it("a non-GHG cart writes '' and round-trips to null — uncapped, which is why the key must be sent", () => {
    // No GHG in the cart ⇒ ghgAllowance stays null ⇒ '' ⇒ null. Identical to the advisory tier, whose
    // locationAllowance IS null by design.
    expect(writeConvention(null)).toBe('')
    expect(readConvention('')).toBeNull()
    expect(readConvention(undefined)).toBeNull()   // the omitted-key case — indistinguishable from ''
    expect(locationAllowanceForTier('advisory')).toBeNull()
    expect(readConvention(writeConvention(locationAllowanceForTier('advisory')))).toBeNull()
    // The guard both writers use, so a cart without GHG never sets an allowance.
    expect(read(CHECKOUT)).toContain("moduleKeys.includes('ghg')")
    expect(read(INVOICE)).toContain("moduleKeys.includes('ghg')")
  })
})

// ── TO TEST THIS PROPERLY ─────────────────────────────────────────────────────────────────────────
// The textual assertions above exist because nothing is extractable. What would need to change:
//   1. Extract the metadata builder into lib/ — e.g. buildEntitlementMetadata({ userId, entitlements,
//      source, ghgAllowance }): Record<string, string> — and have BOTH routes call it. One writer
//      instead of two, and the key cannot go missing from one of them.
//   2. Export the read side as a pure function — e.g. parseGhgAllowance(raw): number | null — and have
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

  it('M11 both writers build every Concierge key', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      for (const key of CONCIERGE_META_KEYS) {
        expect(src, `${rel} is missing ${key}`).toContain(key)
      }
    }
  })

  it('M12 both writers carry ghg_tier beside the allowance, same empty-string convention', () => {
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

describe('ghgTierFromAllowance', () => {
  it('M16 identifies the two capped tiers from GHG_TIERS, not from literals', () => {
    expect(ghgTierFromAllowance(GHG_TIERS.starter.locationAllowance)).toBe('starter')
    expect(ghgTierFromAllowance(GHG_TIERS.professional.locationAllowance)).toBe('professional')
  })

  // ⚠️ NULL MUST NOT RESOLVE. It is Advisory under the current model and an uncapped pre-rescope
  // row under the old one. 10 and 20 are pre-rescope values with no current equivalent. Each of
  // these returning a tier would pick between a 1250 and a 2500 charge for a real customer.
  it('M17 returns null for every ambiguous stored value', () => {
    expect(ghgTierFromAllowance(null)).toBeNull()
    expect(ghgTierFromAllowance(10)).toBeNull()
    expect(ghgTierFromAllowance(20)).toBeNull()
    expect(ghgTierFromAllowance(0)).toBeNull()
  })
})

describe('Concierge route guards', () => {
  it('M18 both routes price through conciergeQuote and the pricing constants, never a literal', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      expect(src, `${rel} must call conciergeQuote`).toContain('conciergeQuote(')
      expect(src, `${rel} must not compute a source price itself`).not.toMatch(/CONCIERGE_SOURCE_USD\s*\./)
    }
  })

  it('M19 both routes refuse a connected quantity at the server boundary', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      expect(src, `${rel} must check the flag itself`).toContain('UTILITY_CONNECT_ENABLED')
      expect(src, `${rel} must reject connected sources`).toMatch(/not available yet/i)
    }
  })

  it('M20 both routes validate the tier where the onboarding fee uses it', () => {
    for (const rel of [CHECKOUT, INVOICE]) {
      const src = read(rel)
      const branch = src.slice(src.indexOf('body.concierge'))
      expect(branch, `${rel} must validate body.tier inside the Concierge branch`).toMatch(/TIER_PRICING(_FOR_VALIDATION)?\[body\.tier\]/)
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
const EXTRACT = 'app/api/concierge/extract/route.ts'

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
    expect([...GHG_TIER_KEYS].sort()).toEqual(Object.keys(TIER_PRICING).sort())
    expect([...GHG_TIER_KEYS].sort()).toEqual(Object.keys(GHG_TIERS).sort())
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
    for (const bad of ['enterprise', 'STARTER', '', 'ghg', null, undefined, 3, {}, ['starter']]) {
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

  // isFirstConciergePurchase is the opposite question and must stay term-blind: an expired customer
  // has no access, but the setup work was done and billed once.
  it('M32 the onboarding check is still not term-aware', () => {
    for (const legacy of LEGACY_CONCIERGE_KEYS) {
      expect(isFirstConciergePurchase([legacy])).toBe(false)
    }
    expect(isFirstConciergePurchase(['concierge'])).toBe(false)
  })
})
