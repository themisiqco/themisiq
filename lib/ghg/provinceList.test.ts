import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CA_PROVINCES, GRID_REGIONS_CA, detectGridRegion } from './engine'

// ONE PROVINCE LIST, BECAUSE THE WIZARD SHOWS IT TWICE — AND IN ONE ORDER, BECAUSE THAT IS WHAT
// DISAGREED.
//
// The GHG wizard offers a Canadian province dropdown on step 1 (the locations table) and again on
// step 2 (the grid-region resolver). They were built from different lists:
//
//   step 1  ['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE','NT','NU','YT']   — a literal in page.tsx
//   step 2  GRID_REGIONS_CA, derived from CA_PROVINCES in engine.ts
//           ['BC','AB','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU']   — StatCan west-to-east
//
// SAME THIRTEEN CODES, DIFFERENT ORDER, and no comment on either claiming a reason. One customer,
// one flow, the same question asked twice with the options shuffled between asks.
//
// ⚠️ SO MEMBERSHIP ALONE IS NOT ENOUGH TO ASSERT HERE. Both lists always held the same thirteen
// codes; a membership test would have passed throughout the entire period the two screens disagreed
// and would pass again the moment someone re-sorts one of them. ORDER IS THE PROPERTY, so P1 and P2
// pin the exact sequence.
//
// CA_PROVINCES now carries the step-1 ON-first order, chosen for the customer-facing dropdown rather
// than for any published standard — see the comment on the constant itself, which records that the
// StatCan order was replaced deliberately and must not be "restored".
//
// THE ORDER WAS STILL THE SMALL HALF OF THE PROBLEM. detectGridRegion() decides whether a code
// resolves to a grid region by testing CA_PROVINCES.includes(c). A code offered by the step-1 literal
// and absent from CA_PROVINCES would have been selectable, stored, and then silently unresolvable —
// the wizard would accept a province and then report no grid factor for it, which is the shape of the
// blank the unpriceable-location path exists to catch and would not have caught here. The two lists
// agreed on membership, so that was latent rather than live; one constant removes the possibility.

const ROOT = process.cwd()
const PAGE = 'app/dashboard/ghg/page.tsx'
const src = readFileSync(join(ROOT, PAGE), 'utf8')

describe('the two Canadian province dropdowns are one list, in one order', () => {
  // The order both dropdowns must open in, written out rather than derived, because deriving it from
  // CA_PROVINCES would assert only that the constant equals itself.
  const ON_FIRST = ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT']

  it('P1 CA_PROVINCES is the ON-first order, exactly', () => {
    // ⚠️ NOT A MEMBERSHIP CHECK. A re-sort back to StatCan west-to-east would leave every other
    // assertion in this file green while changing what both dropdowns show. The constant's own
    // comment records that the ON-first order was chosen deliberately; this is what enforces it.
    expect([...CA_PROVINCES]).toEqual(ON_FIRST)
  })

  it('P2 step 2 offers exactly that sequence, in that order', () => {
    // GRID_REGIONS_CA is CA_PROVINCES.map, so this is near-tautological TODAY — pinned because it is
    // the premise P3 rests on. If step 2 is ever rebuilt from something else, P3 stops meaning what
    // it says and this fails first.
    expect(GRID_REGIONS_CA.map(r => r.value)).toEqual(ON_FIRST)
  })

  it('P3 step 1 renders CA_PROVINCES rather than a literal of its own', () => {
    // With P1 and P2 above, this is what makes the two screens provably identical: step 2 maps the
    // constant, step 1 maps the constant, and the constant is pinned to one sequence.
    const hits = src.split('\n').filter(l => l.includes('CA_PROVINCES.map(p =>'))
    expect(hits, `the step-1 province <select> must map CA_PROVINCES — not found in ${PAGE}`).toHaveLength(1)
  })

  it('P4 NO province literal survives anywhere in the wizard', () => {
    // The regression is not "the list is wrong", it is "a second list appeared". Any array literal
    // holding three or more province codes is one, whatever its order or its variable name.
    const CODES = new Set(CA_PROVINCES)
    const offences: string[] = []
    for (const [i, ln] of src.split('\n').entries()) {
      for (const literal of ln.match(/\[[^[\]]*\]/g) ?? []) {
        const items = literal.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''))
        const provinces = items.filter(s => CODES.has(s))
        if (provinces.length >= 3 && provinces.length === items.length) {
          offences.push(`${PAGE}:${i + 1} — ${literal.slice(0, 80)}`)
        }
      }
    }
    expect(offences, offences.length === 0 ? '' :
      `A SECOND PROVINCE LIST IS BACK:\n\n${offences.join('\n')}\n\n` +
      `Import CA_PROVINCES from lib/ghg/engine. detectGridRegion() validates against it, so a code in ` +
      `one list and not the other is selectable and then unresolvable.\n`).toEqual([])
  })

  it('P5 every code the dropdowns offer resolves to a grid region', () => {
    // The property the single list exists to guarantee, asserted end to end rather than structurally.
    for (const p of CA_PROVINCES) {
      expect(detectGridRegion(p, 'CA'), `${p} must resolve`).toBe(p)
    }
  })

  it('P6 thirteen provinces and territories, no duplicates', () => {
    expect(CA_PROVINCES).toHaveLength(13)
    expect(new Set(CA_PROVINCES).size, 'a duplicate would render two identical <option>s').toBe(13)
  })
})
