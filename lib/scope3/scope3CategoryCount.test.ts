import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  scope3CategoryCounts, scope3MethodFamilies, scope3ScopeClaim, scope3ShortClaim,
  SCOPE3_METHOD_FAMILY,
} from './methodSummary'
import { scope3MethodFor, SCOPE3_CATEGORY_IDS } from './categoryMethods'

// A COUNT THAT LIVES IN ONE PLACE CANNOT GO STALE IN NINE.
//
// ⚠️ THE SAME GUARD lib/cs3d.test.ts AND lib/sb253.test.ts APPLY TO DATES, APPLIED TO A COUNT, AND FOR THE
// SAME REASON: the number moved twice in eight days. Ten categories took the flat factor on 17 Sep 2026,
// then eight, then six; on 25 Sep the factor was deleted and the split became nine calculated of fifteen.
// It will move again when Category 8 or 11 gains a method. Nine surfaces stated it in their own words, and
// two of them also claimed method families the product has never had ("hybrid", and "supplier-specific
// methods" of all fifteen rather than Category 1's entered figure).
//
// ⚠️ WHAT THIS CANNOT SEE: whether a derived sentence READS well. It asserts the numbers are not typed.
// A surface that derives the count and then describes it wrongly passes here.

const ROOT = join(__dirname, '..', '..')
const SCAN_DIRS = ['app']

/**
 * ⚠️ THREE SITES MAY SAY "all 15" AS A LITERAL, AND EACH IS A DECISION RATHER THAN AN OVERSIGHT.
 *
 * Matched on FILE AND CONTENT, not on line number, so the allowance survives the line moving and fails if
 * the wording changes — which is the right bias: a reworded claim is a new claim and deserves the decision
 * to be made again.
 */
const ALLOWED: { file: string; contains: string; why: string }[] = [
  {
    file: 'app/dashboard/ghg/page.tsx',
    contains: 'Use the Scope 3 Complete Calculator for all 15 categories',
    why: 'A pointer to the calculator. It does cover all fifteen: it asks about each, records a relevance ' +
      'decision for each, and reports each in the export. The claim is the scope of enquiry.',
  },
  {
    file: 'app/dashboard/scope3/page.tsx',
    contains: 'GHG Protocol Scope 3 Standard · All 15 categories · CSRD ESRS E1-6',
    why: 'An in-product banner above the calculator. The customer is looking at all fifteen rows with ' +
      'their own statuses, so the per-category truth is on the screen beneath the claim.',
  },
  {
    file: 'app/api/ghg-bot/route.ts',
    contains: 'separate Scope 3 module that binds to this inventory and has all 15 categories',
    why: 'THE MODEL FOR ALL OF THIS. The next clause is "WHAT IT RESTS ON DIFFERS SHARPLY BY CATEGORY, ' +
      'and you must say so", followed by assistantScope3Basis(). It corrected itself through two changes ' +
      'to the method map with no copy edit.',
  },
]

/**
 * A literal claim about how many categories are calculated, or how many there are.
 *
 * ⚠️ EVERY PATTERN IS SCOPE-3 QUALIFIED OR SHAPED SO IT CANNOT MATCH ANOTHER SUBJECT. lib/cs3d.test.ts
 * records what an unqualified pattern costs: a bare `unit: '2027'` sat in its list for one run, caught two
 * unrelated regimes, and a guard that cries wolf gets deleted. A bare "15" would match a location
 * allowance, a page size and an ESRS datapoint count.
 */
const FORBIDDEN: RegExp[] = [
  /\ball 15 (Scope 3 )?categories\b/i,
  /\ball fifteen categories\b/i,
  /\b15 Scope 3 categories\b/i,
  /\b(9|nine) (of 15|of the 15|calculated by a named method)\b/i,
  /\b(6|six) (reported from your own|not calculated)\b/i,
  // The two families the product has never had, claimed as methods.
  /\bhybrid\b(?=[^\n]*\bmethod)/i,
  /\bsupplier-specific methods\b/i,
]

/** Comment SPANS removed, then whole-line // — a {/* *\/} block's continuation lines carry no marker. */
const stripComments = (src: string): string =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, m => '\n'.repeat(m.split('\n').length - 1))
    .replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat(m.split('\n').length - 1))
    .split('\n').map(l => (l.trim().startsWith('//') ? '' : l)).join('\n')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('Scope 3 category counts live in exactly one place', () => {
  it('SCC-1 no surface under app/ states a category count as a literal', () => {
    const offences: string[] = []
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split('\\').join('/')
        const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
        lines.forEach((line, i) => {
          for (const pattern of FORBIDDEN) {
            if (!pattern.test(line)) continue
            if (ALLOWED.some(a => a.file === rel && line.includes(a.contains))) continue
            offences.push(`${rel}:${i + 1} — ${String(pattern)}\n      ${line.trim().slice(0, 130)}`)
          }
        })
      }
    }
    expect(offences, offences.length === 0 ? '' :
      `\n\nHardcoded Scope 3 category count or method family:\n\n  ${offences.join('\n\n  ')}\n\n` +
      'TO FIX: import from lib/scope3/methodSummary.ts — scope3ScopeClaim() where there is room for a\n' +
      'sentence, scope3ShortClaim() where there is not, scope3MethodFamilies() for a list of method kinds,\n' +
      'scope3CategoryCounts() for the raw numbers. Do not retype the count, even the CURRENT one: nine of\n' +
      'fifteen is correct today, ten of fifteen was correct on 17 Sep 2026, and that is exactly how a\n' +
      'number comes to sit in nine surfaces in four wordings.\n' +
      'If the claim is genuinely about the SCOPE OF ENQUIRY rather than a count of calculations, add it to\n' +
      'ALLOWED in this file with the reason, the way the three existing entries do.\n',
    ).toEqual([])
  })

  it('SCC-2 scans a plausible number of files — a broken walk would pass vacuously', () => {
    // Without this, a walk that silently returned nothing would make the test above green forever. The
    // classic way a source-text guard rots; lib/cs3d.test.ts carries the same companion assertion.
    const count = SCAN_DIRS.reduce((n, d) => n + walk(join(ROOT, d)).length, 0)
    expect(count).toBeGreaterThan(50)
  })

  it('SCC-3 the three allowed literals still exist, so the allowance cannot rot into a blanket', () => {
    // ⚠️ AN ALLOWANCE FOR A LINE THAT NO LONGER EXISTS IS A HOLE NOBODY CAN SEE. If one of these three is
    // reworded or deleted, this fails and the entry is removed deliberately rather than left standing as a
    // permission for whatever text later happens to match it.
    for (const a of ALLOWED) {
      const src = readFileSync(join(ROOT, a.file), 'utf8')
      expect(src, `${a.file} no longer contains its allowed claim: ${a.contains}`).toContain(a.contains)
      expect(a.why.length, `${a.file}'s allowance must carry a reason`).toBeGreaterThan(60)
    }
  })

  it('SCC-4 the count is derived from the method map, so it cannot disagree with the calculator', () => {
    const c = scope3CategoryCounts()
    const notCalculated = SCOPE3_CATEGORY_IDS.filter(id => scope3MethodFor(id) === 'no_method')
    expect(c.total).toBe(SCOPE3_CATEGORY_IDS.length)
    expect(c.notCalculated).toBe(notCalculated.length)
    expect(c.calculated + c.notCalculated, 'the two halves must sum to the total').toBe(c.total)
    // The figures as they stand, so a change to the map is noticed here as well as in categoryMethods.test.
    expect(c).toEqual({ total: 15, calculated: 9, notCalculated: 6 })
    expect(scope3ScopeClaim()).toBe(
      'All 15 categories recorded and reported. 9 calculated by a named method, 6 reported from your own figures.',
    )
    expect(scope3ShortClaim()).toBe('all 15 recorded, 9 calculated')
  })

  it('SCC-5 ⚠️ "hybrid" is untypable: every family comes from a Record over Scope3Method', () => {
    // ⚠️ THE OVER-CLAIM THIS WHOLE CHANGE EXISTS FOR. app/climate-ghg/page.tsx said "primary data
    // collection, spend-based, hybrid and supplier-specific methods" in two places. No method in
    // Scope3Method has ever been hybrid, and supplier-specific is Category 1's ENTERED FIGURE rather than
    // a method the platform runs. A hand-written list could name a family the product has never had; a
    // list built from this Record cannot, and tsc refuses a method without a family.
    const families = scope3MethodFamilies()
    expect(families.length).toBeGreaterThan(1)
    for (const f of families) {
      expect(Object.values(SCOPE3_METHOD_FAMILY), `${f} is not a family of any method`).toContain(f)
    }
    expect(families, 'hybrid is not a family of anything').not.toContain('hybrid')
    expect(families.join(' '), 'and cannot appear inside one either').not.toMatch(/hybrid/i)
    // Every ASSIGNED method's family appears, so no family can be silently dropped from a list of methods.
    for (const id of SCOPE3_CATEGORY_IDS) {
      expect(families, `${id}'s family is missing from the list`).toContain(SCOPE3_METHOD_FAMILY[scope3MethodFor(id)])
    }
    // Including the one it would be most tempting to omit.
    expect(families, 'the six with no method are a family and must be listed').toContain('not calculated')
  })
})
