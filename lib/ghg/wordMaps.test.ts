import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COUNTRY_WORDS, UNIT_WORDS, FUEL_WORDS } from './series'

// ── THREE SIBLING WORD MAPS, ONE DECLARATION EACH ────────────────────────────────────────────────
//
// COUNTRY_WORDS, UNIT_WORDS and FUEL_WORDS turn the engine's tokens into customer prose. They existed
// TWICE — exported from lib/ghg/series.ts (read by the trends surface and lib/ghg/comparability.ts)
// and again as local consts in app/dashboard/ghg/page.tsx for the unpriceable-location message.
// Collapsed onto the exported ones on 14 Aug 2026, verified identical first: 33 / 9 / 7 keys, same
// values, same key order in both files. A drift would have been a finding, not a merge.
//
// ⚠️ WHAT THIS GUARDS IS NOT "THE WORDS ARE RIGHT", IT IS "THERE IS ONE PLACE TO GET THEM WRONG."
// A second copy costs nothing on the day it is made — it is correct by construction, being a copy.
// It costs on the day someone adds a fuel, a unit or a country to one map. Then the wizard says
// "this location's fuel_oil_residual figure is in mmbtu" while the trends surface, describing the
// same inventory to the same verifier, says "heavy fuel oil" and "MMBtu". Nothing throws, no test
// fails, and the two sentences disagree about what the customer told us. That is the whole defect,
// and no assertion about the CONTENT of either map can catch it — only an assertion that there is
// one map.
//
// ⚠️ AND THE TEST MUST NOT BE SATISFIABLE BY DELETION. "page.tsx contains no COUNTRY_WORDS
// declaration" is trivially true of a page.tsx that no longer words the message at all, or of one
// where a rename left the import dangling. So every case below pairs the absence with proof that the
// import exists AND that the map is still called at the site that needed it.
//
// FUEL_WORDS is also guarded at V6/V7 in lib/vsme/fuelOilGrades.test.ts, which owns the separate
// question of whether the retired 'fuel_oil' token is gone from it. Deliberate overlap: that file
// collapsed FUEL_WORDS alongside the fuel-oil grade split and its guard is anchored on the grade
// tokens. W3 below is the general form, and it is the one a fourth map would be added to.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const pageSrc = readFileSync(join(ROOT, PAGE), 'utf8')

// Each map, with the call site in page.tsx that would have to disappear for a deletion to fool the
// absence assertion, and one key whose word is distinctive enough to anchor on.
const MAPS: { name: string; map: Record<string, string>; callSite: string; keys: number }[] = [
  { name: 'COUNTRY_WORDS', map: COUNTRY_WORDS, callSite: 'COUNTRY_WORDS[u.country]', keys: 33 },
  { name: 'UNIT_WORDS', map: UNIT_WORDS, callSite: 'UNIT_WORDS[u.unit]', keys: 9 },
  { name: 'FUEL_WORDS', map: FUEL_WORDS, callSite: 'FUEL_WORDS[u.fuel]', keys: 7 },
]

describe('the wizard imports the display vocabulary rather than copying it', () => {
  it('W1 all three are exported from series.ts and carry the counts that were merged', () => {
    // Pinned so a map that quietly loses entries — the shape a bad merge takes — fails here and not
    // in a sentence with a raw token in it. The counts are the ones verified identical before merging.
    for (const { name, map, keys } of MAPS) {
      expect(Object.keys(map), `${name}`).toHaveLength(keys)
    }
    // Spot values across all three, so an empty-but-present export cannot pass W1 on count alone.
    expect(COUNTRY_WORDS.EL, 'EL is Greece per EEA/EU convention, not GR').toBe('Greece')
    expect(COUNTRY_WORDS.NL).toBe('the Netherlands')
    expect(UNIT_WORDS.mmbtu, 'cased as the unit is written, not lowercased').toBe('MMBtu')
    expect(UNIT_WORDS.gallons, 'US gallons — the engine prices fuel oil per US gallon').toBe('US gallons')
    expect(FUEL_WORDS.gasoline, 'the customer-facing word, not the token').toBe('petrol')
  })

  it('W2 page.tsx declares NONE of them locally', () => {
    for (const { name } of MAPS) {
      const declarations = pageSrc.split('\n').filter(l => new RegExp(`const ${name}\\s*[:=]`).test(l))
      expect(declarations, `a local ${name} has come back — collapse it onto lib/ghg/series.ts`).toHaveLength(0)
    }
  })

  it('W3 ...and imports all three from series.ts, in one statement', () => {
    // THE ANTI-DELETION HALF OF W2. Anchored on the import line itself so "no local declaration"
    // cannot be satisfied by the vocabulary having been dropped instead of shared.
    const imports = pageSrc.split('\n').filter(l => l.includes("from '../../../lib/ghg/series'") && !l.startsWith('import type'))
    expect(imports, 'exactly one value import from series.ts').toHaveLength(1)
    for (const { name } of MAPS) {
      expect(imports[0], `${name} must be imported`).toContain(name)
    }
  })

  it('W4 ...and still uses all three to word the unpriceable-location message', () => {
    // THE SECOND ANTI-DELETION GUARD. An import with no call site is dead code that a linter will
    // eventually remove, taking W3 with it and leaving W2 passing over a page that says nothing.
    for (const { name, callSite } of MAPS) {
      expect(pageSrc, `${name} is imported but no longer read — the message lost its ${name} lookup`)
        .toContain(callSite)
    }
  })

  it('W5 every map falls back to the raw token rather than a blank', () => {
    // The property the message depends on and the reason `?? raw` appears at each call site: an
    // unfamiliar word the customer can still search for beats a sentence with a hole in it.
    for (const { name, map } of MAPS) {
      expect(map['definitely_not_a_key'], `${name} must not resolve an unknown token`).toBeUndefined()
    }
    expect(pageSrc).toContain('COUNTRY_WORDS[u.country] ??')
    expect(pageSrc).toContain('UNIT_WORDS[u.unit] ??')
    expect(pageSrc).toContain('FUEL_WORDS[u.fuel] ??')
  })
})
