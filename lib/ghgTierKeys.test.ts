import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { GHG_TIERS, GHG_TIER_KEYS, GHG_TIER_LABELS, isGhgTier } from './pricing'

// ── ONE LIST OF TIER KEYS, AND THIS IS WHAT KEEPS IT ONE ─────────────────────
//
// ⚠️ THE KEYS WERE NAMED AS A SET IN SIX PLACES AND THE FAILURE MODE WAS SILENT. Three pages
// inlined `['starter', 'professional', 'advisory']` to build their tier pickers, app/order/page.tsx
// validated a URL parameter with a three-way disjunction, and two of those pages carried their own
// label map on top. Adding a tier meant finding all six. A page that was missed did not break: it
// simply did not offer the new tier, and /order priced an unknown tier as the entry band, showing a
// customer a number nobody meant.
//
// Nothing outside lib/pricing.ts may name the keys as a set again. Use GHG_TIER_KEYS to iterate,
// GHG_TIER_LABELS to label, and isGhgTier to validate.
//
// ⚠️ THIS IS NOT THE SAME GUARD AS M22 IN lib/entitlementMetadata.test.ts. That one ties
// GHG_TIER_KEYS to the SQL CHECK on entitlements.ghg_tier, so a tier added in TypeScript without
// the migration fails there. This one ties the rest of the app to GHG_TIER_KEYS. Both are needed:
// the first stops a purchase failing after payment, the second stops a tier being invisible.

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** Every .ts and .tsx under app/ and lib/, excluding tests and the authority itself. */
const sourceFiles = (): string[] => {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = join(dir, e.name)
      if (e.isDirectory()) { walk(rel); continue }
      if (!/\.tsx?$/.test(e.name)) continue
      if (e.name.includes('.test.')) continue
      if (relative(ROOT, join(ROOT, rel)) === 'lib/pricing.ts') continue
      out.push(rel)
    }
  }
  walk('app'); walk('lib')
  return out
}

/**
 * The one file still allowed to name the keys, with the reason and the batch that removes it.
 *
 * ⚠️ AN ALLOW-LIST, NOT AN EXEMPTION. app/deals/[token]/page.tsx maps a deal's location_count
 * onto a tier: `lc <= starter.locationAllowance ? 'starter' : lc <= professional... `. The three
 * literals are OUTPUTS of a threshold ladder rather than a membership test, but the effect is the
 * same, and adding a tier means adding a branch here or the ladder silently skips it.
 *
 * It is not fixed here because it is not a rename. Under employee-band pricing a deal cannot infer
 * headcount, so the recommendation is being REMOVED rather than widened, and that is a change to
 * what the page shows. Batch 1 changes no behaviour. Phase 1 batch 5 deletes this entry with the
 * code it covers; if the entry is still here when the ladder is gone, T5 below fails.
 */
const ALLOWED_TO_NAME_THE_KEYS = ['app/deals/[token]/page.tsx']

describe('the GHG tier keys are named in one place', () => {
  // The array-literal shape: any quoting, any spacing, across line breaks.
  const AS_ARRAY = /\[\s*['"]starter['"]\s*,\s*['"]professional['"]\s*,\s*['"]advisory['"]/

  it('T1 no file builds the key list as an array literal', () => {
    const offenders = sourceFiles().filter(f => AS_ARRAY.test(read(f)))
    expect(offenders,
      'iterate GHG_TIER_KEYS instead: an inlined list does not gain a new tier and fails silently').toEqual([])
  })

  // The disjunction shape, within one statement. Bounded so it cannot span an unrelated file.
  const AS_DISJUNCTION = /['"]starter['"][\s\S]{0,90}['"]professional['"][\s\S]{0,90}['"]advisory['"]/

  it('T2 no file tests membership by naming all three keys', () => {
    const offenders = sourceFiles().filter(f => {
      if (ALLOWED_TO_NAME_THE_KEYS.includes(f)) return false
      const src = read(f)
      return AS_DISJUNCTION.test(src) && !AS_ARRAY.test(src)
    })
    expect(offenders,
      'validate with isGhgTier and label with GHG_TIER_LABELS: three names in one expression is the same list again').toEqual([])
  })

  // ⚠️ WITHOUT THESE THE GUARD ABOVE PASSES BY SCANNING NOTHING. A walk that returns an empty list,
  // or a constant that has lost a member, would satisfy T1 and T2 in silence.
  it('T3 the walk actually reads files, and the constants agree with GHG_TIERS', () => {
    expect(sourceFiles().length).toBeGreaterThan(50)
    expect([...GHG_TIER_KEYS].sort()).toEqual(Object.keys(GHG_TIERS).sort())
    for (const k of GHG_TIER_KEYS) {
      expect(GHG_TIER_LABELS[k], `${k} has no label`).toBeTruthy()
    }
  })

  // ⚠️ ASSERTED BOTH WAYS, so the allow-list cannot outlive what it covers. An entry that no
  // longer names the keys is an entry nobody removed, and the next reader has to work out whether
  // it is load-bearing.
  it('T5 every allow-listed file still names the keys, or its entry should be gone', () => {
    for (const f of ALLOWED_TO_NAME_THE_KEYS) {
      expect(AS_DISJUNCTION.test(read(f)), `${f} no longer names the keys: remove it from the list`).toBe(true)
    }
  })

  it('T4 isGhgTier accepts every key and rejects everything else', () => {
    for (const k of GHG_TIER_KEYS) expect(isGhgTier(k)).toBe(true)
    for (const bad of ['platinum', 'Starter', '', 'ghg', null, undefined, 1, {}, ['starter']]) {
      expect(isGhgTier(bad), `${String(bad)} is not a tier key`).toBe(false)
    }
  })
})
