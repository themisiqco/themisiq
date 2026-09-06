import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as palette from './palette'

/**
 * The two PDF generators — lib/pdf/layout.ts (board reports) and lib/assurancePdf.ts (the
 * assurance package) — write documents a verifier receives. They kept SEPARATE PALETTES, and
 * that is what this file exists to prevent recurring.
 *
 * ⚠️ THE DEFECT THIS WOULD HAVE CAUGHT. assurancePdf.ts's muted grey was '#888784' — 3.36:1 on
 * the #f8f7f5 stock, below WCAG AA — and it rendered the page footer at 7pt, the cover metadata
 * labels, and the ISO 14064-3 / ISAE 3410 disclaimer. All the while layout.ts carried a comment
 * saying it had measured that exact value, rejected it, and chosen #6e6d6a instead. The rejection
 * was recorded in one module and never reached the other. A comment cannot enforce anything
 * across a file boundary; an assertion can.
 *
 * ⚠️ WHAT THIS FILE CANNOT PROVE, AND IT IS THE LARGER HALF.
 * Every assertion below reads SOURCE TEXT. It verifies that the constants are internally
 * consistent, correctly measured, and not duplicated. It does NOT verify that the right constant
 * reaches the right doc.text() call — nothing here would notice MUTED being passed where INK was
 * meant, a colour set and then overwritten before anything is drawn, or text drawn on a filled
 * rectangle whose colour makes it illegible. That would mean asserting on the generated PDF's
 * content stream.
 * lib/materiality/boardReport.test.ts has the same limit from the other side: it invokes
 * generateBoardReportPDF and asserts structure and ordering, so it proves the document builds —
 * not that anything in it is readable.
 */

const ROOT = process.cwd()
const LAYOUT = 'lib/pdf/layout.ts'
const ASSURANCE = 'lib/assurancePdf.ts'
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const AA = 4.5

/**
 * Values drawn on the INK cover block rather than on PAPER.
 *
 * ⚠️ THIS IS AN ALLOW-LIST OF SURFACE, NOT AN EXEMPTION FROM CONTRAST. The cover fills its top
 * 200pt with INK (`doc.setFillColor(INK); doc.rect(0, 0, W, 200)`), so these are light-on-dark and
 * PAPER is the wrong reference for them — against it they scan as 2.37:1 and 1.07:1 and look like
 * failures. They are still asserted, just against #0d0d0d. Anything added here must be genuinely
 * drawn on the cover block; the check below fails if a listed value would not clear AA there.
 */
const REVERSED: Record<string, string> = {
  ON_COVER_MUTED: palette.INK,
  ON_COVER: palette.INK,
}

/** Not type. A hairline rule has no contrast requirement. */
const NON_TEXT = new Set(['PAPER', 'HAIRLINE'])

describe('the PDF palette', () => {
  it('every colour clears AA against the surface it is actually drawn on', () => {
    const failures: string[] = []
    for (const [name, value] of Object.entries(palette)) {
      if (typeof value !== 'string' || !value.startsWith('#')) continue
      if (NON_TEXT.has(name)) continue
      const ground = REVERSED[name] ?? palette.PAPER
      const ratio = contrast(value, ground)
      if (ratio < AA) {
        failures.push(`${name} (${value}) is ${ratio.toFixed(2)}:1 on ${ground} — below ${AA}:1`)
      }
    }
    expect(failures, `PDF palette below AA:\n  ${failures.join('\n  ')}`).toEqual([])
  })

  it('the two generators agree on every shared role', () => {
    // Both import from ./palette, so agreement is structural rather than coincidental — this
    // asserts that neither has quietly reintroduced a local declaration that shadows it.
    const disagreements: string[] = []
    for (const [file, src] of [[LAYOUT, read(LAYOUT)], [ASSURANCE, read(ASSURANCE)]] as const) {
      for (const role of ['INK', 'PAPER', 'SECONDARY', 'MUTED', 'MUTE', 'TABLE_INK', 'HAIRLINE']) {
        const local = new RegExp(`^\\s*(?:export\\s+)?const\\s+${role}\\s*=\\s*'(#[0-9A-Fa-f]{3,8})'`, 'm')
        const m = src.match(local)
        if (m) disagreements.push(`${file} declares its own ${role} = '${m[1]}' instead of importing it`)
      }
      if (!/from '\.\/palette'|from '\.\/pdf\/palette'/.test(src)) {
        disagreements.push(`${file} does not import from the shared palette`)
      }
    }
    expect(disagreements, `palette drift:\n  ${disagreements.join('\n  ')}`).toEqual([])
  })

  it('no colour literal is repeated un-named in either generator', () => {
    // A value used twice as a literal is a value that can drift apart. '#333333' was six copies in
    // assurancePdf.ts and '#7425e3' was two, one of which was the local PURPLE constant and one an
    // inline duplicate 200 lines away.
    //
    // ⚠️ THRESHOLD IS >1, SO A SINGLE UN-NAMED LITERAL PASSES. Verified by mutation: replacing one
    // TABLE_INK with '#333333' does NOT fail this test; replacing two does. It catches drift
    // between copies, which is the defect that happened — not first use of a bare value.
    const offenders: string[] = []
    for (const file of [LAYOUT, ASSURANCE]) {
      const counts = new Map<string, number>()
      for (const line of read(file).split('\n')) {
        // Comments are where measurements are recorded — a ratio cited in prose is not a use.
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        for (const m of code.matchAll(/'(#[0-9A-Fa-f]{6})'/g)) {
          counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
        }
      }
      for (const [value, n] of counts) {
        if (n > 1) offenders.push(`${file} repeats the literal '${value}' ${n}× — bind it in ./palette`)
      }
    }
    expect(offenders, `un-named repeated literals:\n  ${offenders.join('\n  ')}`).toEqual([])
  })
})
