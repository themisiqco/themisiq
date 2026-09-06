import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as brand from './brand'

/**
 * lib/brand.ts holds the palette as literal hex, because email HTML and jsPDF cannot read a CSS
 * custom property. app/styles/themisiq-tokens.css is the AUTHORITY for those values.
 *
 * ⚠️ THIS FILE IS WHAT MAKES THAT SYNC A RULE RATHER THAN A REQUEST. The header of lib/brand.ts
 * asks a future editor to change both files in one commit. Nothing enforced it: a mismatch
 * produced an email or a PDF in the previous palette while every screen was correct — a defect
 * visible only to someone holding both at once, which in practice is a customer.
 *
 * ⚠️ THE CSS IS READ AT TEST TIME AND NEVER SNAPSHOTTED. A copy of the expected values here would
 * be a THIRD statement of the palette, free to drift from both — and it would drift silently,
 * because a snapshot test passes by agreeing with itself.
 *
 * ⚠️ THE NAME MAPPING IS DERIVED, NOT TABULATED, for the same reason. A hand-written
 * { '--color-ink-2': 'INK_2' } table is another copy to maintain; a token added to the CSS with no
 * constant would be absent from the table and pass unnoticed. The rule below is total:
 *
 *     --color-module-<key>        ->  MODULE.<key>.color
 *     --color-module-<key>-wash   ->  MODULE.<key>.wash
 *     --color-<name>              ->  <NAME> with '-' replaced by '_', uppercased
 *
 * so ink-2 -> INK_2, on-dark-muted -> ON_DARK_MUTED, line-strong -> LINE_STRONG.
 */

const ROOT = process.cwd()
const CSS_PATH = 'app/styles/themisiq-tokens.css'

/** Every --color-* declaration in the token layer, as { 'ink-2': '#3B474D', … }. */
function cssTokens(): Record<string, string> {
  const src = readFileSync(join(ROOT, CSS_PATH), 'utf8')
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/--color-([a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})/g)) {
    out[m[1]] = m[2]
  }
  return out
}

/** Constant name for a plain (non-module) token. */
const constName = (token: string) => token.replace(/-/g, '_').toUpperCase()

/**
 * Every colour lib/brand.ts exports, keyed by the CSS token it claims to mirror.
 * MODULE is expanded to its two-per-key entries so both directions compare like with like.
 */
function brandColours(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(brand)) {
    if (typeof value === 'string') {
      // reverse of constName: INK_2 -> ink-2
      out[name.toLowerCase().replace(/_/g, '-')] = value
    }
  }
  for (const [key, hue] of Object.entries(brand.MODULE)) {
    out[`module-${key}`] = hue.color
    out[`module-${key}-wash`] = hue.wash
  }
  return out
}

// Case-insensitive: the CSS declares #095C6B and a hand edit may write #095c6b. Same colour, and
// failing on the letter case would train the next person to distrust this test.
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

describe('lib/brand.ts stays in sync with app/styles/themisiq-tokens.css', () => {
  it('the token file is readable and declares colours', () => {
    // Guards the whole suite: if the CSS moves or is renamed, every assertion below would pass
    // vacuously against an empty object and the sync check would silently stop checking.
    const tokens = cssTokens()
    expect(Object.keys(tokens).length).toBeGreaterThan(20)
  })

  it('every --color-* token has a matching constant, with the same value', () => {
    const tokens = cssTokens()
    const colours = brandColours()
    const missing: string[] = []
    const wrong: string[] = []

    for (const [token, cssValue] of Object.entries(tokens)) {
      const expectedName = token.startsWith('module-')
        ? `MODULE.${token.replace(/^module-/, '').replace(/-wash$/, '')}` +
          (token.endsWith('-wash') ? '.wash' : '.color')
        : constName(token)
      const tsValue = colours[token]
      if (tsValue === undefined) {
        missing.push(`--color-${token} (${cssValue}) has no ${expectedName} in lib/brand.ts`)
      } else if (!eq(tsValue, cssValue)) {
        wrong.push(`--color-${token}: CSS says ${cssValue}, ${expectedName} says ${tsValue}`)
      }
    }

    expect(missing, `token(s) in ${CSS_PATH} with no constant:\n  ${missing.join('\n  ')}`)
      .toEqual([])
    expect(wrong, `value mismatch between ${CSS_PATH} and lib/brand.ts:\n  ${wrong.join('\n  ')}`)
      .toEqual([])
  })

  it('every exported colour has a matching --color-* token', () => {
    // The other direction. Without it, a constant kept after its token was deleted — or invented
    // here and never added to the CSS — would sit in email and PDF output as a colour the design
    // system does not contain.
    const tokens = cssTokens()
    const orphans: string[] = []

    for (const [token, tsValue] of Object.entries(brandColours())) {
      if (!(token in tokens)) {
        const name = token.startsWith('module-')
          ? `MODULE.${token.replace(/^module-/, '').replace(/-wash$/, '')}`
          : constName(token)
        orphans.push(`${name} (${tsValue}) has no --color-${token} in ${CSS_PATH}`)
      }
    }

    expect(orphans, `constant(s) in lib/brand.ts with no token:\n  ${orphans.join('\n  ')}`)
      .toEqual([])
  })

  it('checks every colour in the palette, both directions', () => {
    // Reported so the count is visible in the run rather than assumed. If the palette grows and
    // this number does not, one of the two directions has stopped covering it.
    const tokens = Object.keys(cssTokens())
    const colours = Object.keys(brandColours())
    expect(colours.sort()).toEqual(tokens.sort())
  })
})
