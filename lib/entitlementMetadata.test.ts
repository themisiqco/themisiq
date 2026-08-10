import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GHG_TIERS, locationAllowanceForTier, type Tier } from './pricing'

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
const REQUIRED_KEYS = ['user_id', 'entitlements', 'source', 'ghg_location_allowance']

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
