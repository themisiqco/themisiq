import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every colour pairing app/styles/themisiq-tokens.css makes possible has to be legible. This file
 * measures the layer against itself: text colours on the grounds they land on, washes as grounds.
 *
 * ⚠️ WRITTEN AGAINST THE VALUES OF 25 SEP 2026, AND IT PASSED ON ARRIVAL. That is the point. A
 * contrast test written alongside the values it guards encodes what its author hoped; one written
 * first, against values already in the file, has to measure the same thing the browser does or it
 * fails immediately. Every ratio quoted in this file was computed, not carried over from a comment —
 * three of the four --color-state-* comments were wrong when this was written, so the comments are
 * not a source.
 *
 * ⚠️ THE WCAG ARITHMETIC BELOW IS A DELIBERATE SECOND COPY. lib/pdf/palette.test.ts has the same
 * eight lines. They are not shared, and should not be: the formula is fixed by the WCAG 2.x spec so
 * the copies cannot drift in substance, while a single shared helper carrying one typo would make
 * BOTH files green and wrong at once. Two copies mean the error has to be made twice.
 *
 * ⚠️ WHAT THIS CANNOT PROVE, AND IT IS THE LARGER HALF. Every assertion reads the TOKEN LAYER. It
 * verifies that each value clears AA against the grounds its NAME says it belongs to. It cannot see
 * a --color-state-error chip rendered on --color-module-ghg-wash, a wash used as text, or a colour
 * set on an element whose parent supplies a different background. lib/pdf/palette.test.ts has the
 * identical limit from the other side, for the same reason.
 *
 * NOT COVERED, each for a stated reason:
 *   --color-on-dark, --color-on-dark-muted   reversed surfaces, read against --color-ink rather than
 *                                            a wash (14.90 and 9.14 today). A different contract.
 *   --color-band, --color-band-line          chart bands and rules: neither text nor a background.
 *   --color-line, --color-line-strong        borders. WCAG's 3:1 non-text rule, not the 4.5:1 here.
 */

const ROOT = process.cwd()
const CSS_PATH = 'app/styles/themisiq-tokens.css'

/** WCAG relative luminance. Second copy on purpose — see the header. */
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
const r2 = (n: number) => n.toFixed(2)

/** Every --color-* declaration, keyed by FULL token name: { '--color-ink-2': '#3B474D', … }. */
function tokens(): Record<string, string> {
  const src = readFileSync(join(ROOT, CSS_PATH), 'utf8')
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/(--color-[a-z0-9-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2]
  return out
}

const AA = 4.5               // WCAG AA, body text
const TINT_CEILING = 1.25    // a wash is a tint, not a fill — see the wash test for the derivation
const T = tokens()
const PAPER = '--color-paper'
const INK = '--color-ink'
const washNames = () => Object.keys(T).filter(k => k.endsWith('-wash')).sort()

/**
 * ⚠️ TWO FAMILIES SHARE THE WORD "INK", AND THEY ARE DIFFERENT IDEAS. Know this before adding a token.
 *
 *   --color-ink, --color-ink-2, --color-ink-muted   BODY TEXT. The prefix form. These land on many
 *                                                   grounds, so they are asserted against ALL of them.
 *   --color-<x>-ink                                 THIS COLOUR'S TEXT COMPANION: the value to set
 *                                                   when <x>'s identity colour is too light to read.
 *                                                   The suffix form. One ground: --color-<x>-wash.
 *
 * The collision is real and it is why the two regexes below are written the way they are.
 * --color-ink ITSELF ends in "-ink", so a naive /-ink$/ would sweep the primary text colour into the
 * companion family and assert it against a --color--wash that does not exist. COMPANION requires a
 * non-empty prefix; TEXT_FAMILY anchors on the prefix. Neither matches --color-ink-2 or
 * --color-ink-muted as companions, because those do not end in "-ink".
 */
const COMPANION = /^--color-(.+)-ink$/
const TEXT_FAMILY = /^--color-ink(-[a-z0-9-]+)?$/

/**
 * Modules whose identity colour is NEVER set on text, and which therefore have NO -ink companion.
 *
 * ⚠️ BOTH OF THESE CLEAR AA TODAY. This is not a contrast failure dressed up as a decision:
 * measured 25 Sep 2026, --color-module-ai #136C3D is 6.48:1 on white and 5.42:1 on its own wash, and
 * --color-module-people #7B630D is 5.78:1 and 4.84:1. Either could carry text tomorrow and pass.
 *
 * ⚠️ THEY ARE OFF TEXT FOR A LEGIBILITY REASON THAT CONTRAST DOES NOT MEASURE. Under the incoming
 * colourway, People's yellow darkened to an AA-passing companion is OLIVE, and AI Governance's coral
 * darkened to an AA-passing companion is indistinguishable from --color-state-error's red. In both
 * cases the compliant text would no longer READ AS THE MODULE — one looks like a different colour,
 * the other looks like an error — so the companion would pass this test and fail the reader. Adding
 * an -ink token for either does not fix that; it hides it.
 *
 * ⚠️ WHICH IS WHY MEMBERSHIP HERE IS ASSERTED, NOT MERELY TOLERATED. Declaring
 * --color-module-ai-ink FAILS the test below. This is the opposite of an allow-list: adding the
 * thing does not make the test happy, it makes it fail with this paragraph's reason. Removing a
 * module from this set is a decision, and it has to be made here, in a diff someone reads.
 */
const IDENTITY_ONLY = new Set(['ai', 'people'])

/** Modules that HAVE an -ink companion. Grows as step 6 declares them; must match the layer exactly. */
const HAS_INK = new Set<string>([])

/**
 * Modules that need a companion and do not have one yet. This is step 6's remaining work, written as
 * an assertion so it cannot be quietly forgotten: when a companion is declared, its key moves from
 * here to HAS_INK, and the partition check below fails until it does.
 */
const PENDING_STEP_6 = new Set(['cbam', 'climate', 'cyber', 'deals', 'ghg', 'supply'])

const moduleKeys = () => [...new Set(
  Object.keys(T).flatMap(k => { const m = /^--color-module-([a-z0-9]+)(?:-wash|-ink)?$/.exec(k); return m ? [m[1]] : [] })
)].sort()

describe('app/styles/themisiq-tokens.css is legible against itself', () => {
  it('the token layer is readable and declares the colours these tests reference', () => {
    expect(Object.keys(T).length).toBeGreaterThan(40)
    for (const k of [PAPER, INK, '--color-ink-2', '--color-ink-muted', '--color-scale-mid']) {
      expect(T[k], `${k} is missing from ${CSS_PATH}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
    expect(T[PAPER].toUpperCase()).toBe('#FFFFFF')
    expect(washNames().length).toBeGreaterThan(15)
  })

  it('every BODY TEXT colour clears AA on paper and on every wash it can land on', () => {
    // The prefix family has no "own" wash: --color-ink-muted is set on labels over paper, over a
    // module wash, over a state wash. So the assertion is the worst case across all of them, which
    // is strictly stronger than checking one ground and is what will catch a wash being darkened.
    const names = Object.keys(T).filter(k => TEXT_FAMILY.test(k)).sort()
    expect(names, 'the body text family vanished from the token layer').toEqual(
      ['--color-ink', '--color-ink-2', '--color-ink-muted'],
    )
    const bad: string[] = []
    for (const name of names) {
      const onPaper = contrast(T[name], T[PAPER])
      if (onPaper < AA) bad.push(`${name} ${T[name]} on ${PAPER} ${T[PAPER]}: ${r2(onPaper)}:1`)
      for (const w of washNames()) {
        const c = contrast(T[name], T[w])
        if (c < AA) bad.push(`${name} ${T[name]} on ${w} ${T[w]}: ${r2(c)}:1`)
      }
    }
    expect(bad, bad.length === 0 ? '' :
      `body text below WCAG AA ${AA}:1 on a ground it lands on:\n  ${bad.join('\n  ')}\n\n` +
      'Either the text colour darkens or the wash lightens. The tightest pairing in the layer is ' +
      '--color-ink-muted on --color-module-ai-wash (4.82:1 on 25 Sep 2026, 0.32 of headroom), so a ' +
      'wash darkened even slightly is the likely cause.').toEqual([])
  })

  it('every -ink COMPANION clears AA on paper and on its own wash', () => {
    // Zero companions exist today, so this loop is structurally empty rather than skipped: the moment
    // step 6 declares --color-module-cbam-ink it is covered, with no edit here.
    const bad: string[] = []
    for (const name of Object.keys(T).sort()) {
      const m = COMPANION.exec(name)
      if (!m) continue
      const own = `--color-${m[1]}-wash`
      const onPaper = contrast(T[name], T[PAPER])
      if (onPaper < AA) bad.push(`${name} ${T[name]} on ${PAPER}: ${r2(onPaper)}:1`)
      if (!T[own]) { bad.push(`${name} has no companion wash ${own} to be measured against`); continue }
      const onOwn = contrast(T[name], T[own])
      if (onOwn < AA) bad.push(`${name} ${T[name]} on ${own} ${T[own]}: ${r2(onOwn)}:1`)
    }
    expect(bad, bad.length === 0 ? '' :
      `an -ink companion is below WCAG AA ${AA}:1:\n  ${bad.join('\n  ')}\n\n` +
      'A companion exists precisely so its identity colour can stay off text. If the companion ' +
      'itself fails, darkening it further is the fix only while it still reads as the module — see ' +
      'IDENTITY_ONLY in this file for the two cases where it does not.').toEqual([])
  })

  it('every module is classified: has a companion, identity-only by decision, or pending', () => {
    // The partition is what keeps the three sets honest. A ninth module belongs to none of them until
    // someone classifies it, and that is a failure rather than a silent pass.
    const keys = moduleKeys()
    const declared = new Set(keys.filter(k => T[`--color-module-${k}-ink`]))

    // ⚠️ THE IDENTITY-ONLY CHECK RUNS FIRST, AND THE ORDER IS LOAD-BEARING. It was written second and
    // that was a defect: declaring --color-module-ai-ink failed on the HAS_INK equality below, whose
    // message reads "HAS_INK does not match the companions actually declared" — for which the obvious
    // fix is to add 'ai' to HAS_INK. That passes the test and silently reverses the decision, which is
    // the precise failure this set exists to prevent. The reason has to be the FIRST thing read.
    // Adding the key to HAS_INK does not rescue it either way: this check reads the token layer, not
    // HAS_INK.
    const wrongly = [...IDENTITY_ONLY].filter(k => declared.has(k)).sort()
    expect(wrongly, wrongly.length === 0 ? '' :
      `--color-module-${wrongly.join('-ink, --color-module-')}-ink was declared, but ` +
      `${wrongly.join(' and ')} is identity-only BY DECISION and must not carry text.\n\n` +
      'This is not a contrast problem — both identity-only modules clear AA. Read the IDENTITY_ONLY ' +
      'comment in this file before removing a key from that set: the AA-passing companion for one ' +
      'reads as olive and for the other as the error red, so a compliant companion would stop the ' +
      'text reading as the module. If that decision has genuinely been revisited, move the key out ' +
      'of IDENTITY_ONLY in the same commit as the token.').toEqual([])

    // Identity-only keys are excluded so this cannot double-report the case above with a message that
    // points at the wrong fix.
    const shouldHaveInk = [...declared].filter(k => !IDENTITY_ONLY.has(k)).sort()
    expect(shouldHaveInk, 'HAS_INK does not match the -ink companions the token layer actually declares')
      .toEqual([...HAS_INK].filter(k => !IDENTITY_ONLY.has(k)).sort())

    const unclassified = keys.filter(k => !HAS_INK.has(k) && !IDENTITY_ONLY.has(k) && !PENDING_STEP_6.has(k))
    expect(unclassified, unclassified.length === 0 ? '' :
      `module(s) ${unclassified.join(', ')} are in none of HAS_INK, IDENTITY_ONLY or PENDING_STEP_6. ` +
      'A new module needs a decision about whether its identity colour is ever set on text.').toEqual([])

    const ghosts = [...HAS_INK, ...IDENTITY_ONLY, ...PENDING_STEP_6].filter(k => !keys.includes(k)).sort()
    expect(ghosts, ghosts.length === 0 ? '' :
      `${ghosts.join(', ')} are listed in this file but no --color-module-* token declares them.`).toEqual([])
  })

  it('every -wash is light enough to be a background', () => {
    // Two bounds, and they do different jobs.
    //  · INK on it >= AA is the functional contract. Its worst case today is 14.67:1, so it has
    //    enormous margin and will effectively never fire. It is stated because the contract should be
    //    written down, not because it guards anything.
    //  · <= TINT_CEILING against paper is the bound that would actually catch something: a mid-tone
    //    dropped into a -wash slot. 1.25 is derived from the neighbours rather than picked round. On
    //    25 Sep 2026 the darkest wash was 1.196:1 (--color-module-ai-wash / the two #FEE5E6 washes),
    //    --color-sunken was 1.153, and the first NON-background surfaces are --color-band at 1.293
    //    and --color-line at 1.373. 1.25 sits in that gap with 0.054 of headroom, deliberately tight.
    const bad: string[] = []
    for (const w of washNames()) {
      const legible = contrast(T[w], T[INK])
      if (legible < AA) bad.push(`${w} ${T[w]}: body text ${T[INK]} reads at only ${r2(legible)}:1 on it`)
      const vsPaper = contrast(T[w], T[PAPER])
      if (vsPaper > TINT_CEILING) bad.push(`${w} ${T[w]}: ${r2(vsPaper)}:1 against paper, above the ${TINT_CEILING} tint ceiling`)
    }
    expect(bad, bad.length === 0 ? '' :
      `a -wash is not usable as a background:\n  ${bad.join('\n  ')}\n\n` +
      'A wash is a tint behind text, not a fill. If a darker surface is genuinely wanted, it is not ' +
      'a wash: --color-sunken, --color-band and --color-line already occupy that range and are ' +
      'exempt from this test by name.').toEqual([])
  })

  it('--color-scale-mid clears AA on all four grounds it actually lands on', () => {
    // Named by TOKEN, not by value: the SCALE comment in the CSS quotes the same four, and this is
    // what keeps the two from drifting. Measured 25 Sep 2026: 5.55 / 5.22 / 5.06 / 5.17.
    const grounds = [PAPER, '--color-ground', '--color-scale-mid-wash', '--color-scale-gap-wash']
    const mid = T['--color-scale-mid']
    const bad: string[] = []
    for (const g of grounds) {
      if (!T[g]) { bad.push(`ground ${g} is not declared`); continue }
      const c = contrast(mid, T[g])
      if (c < AA) bad.push(`${mid} on ${g} ${T[g]}: ${r2(c)}:1`)
    }
    expect(bad, bad.length === 0 ? '' :
      `--color-scale-mid is below WCAG AA ${AA}:1 on a ground it is set on:\n  ${bad.join('\n  ')}\n\n` +
      'The scale has ONE mid value serving four grounds, which is only sound while the tightest of ' +
      'them clears AA. If it no longer does, the choice is a darker mid or a per-ground pair — see ' +
      'the SCALE block in ' + CSS_PATH + '.').toEqual([])

    // The two washes carry different CLAIMS and must stay distinguishable; swapping them would make a
    // data gap read as a medium finding. Values, not just names — see docs/backlog.md.
    expect(T['--color-scale-mid-wash'].toUpperCase(),
      'the mid wash and the gap wash hold the same value: a data gap is no longer distinguishable ' +
      'from a middling finding').not.toBe(T['--color-scale-gap-wash'].toUpperCase())
  })

  it('every --color-state-* colour clears AA on paper and on its own wash', () => {
    // Measured 25 Sep 2026: warn 5.55/4.65, error 6.47/5.41, info 9.84/8.60, ok 6.20/5.46.
    // ⚠️ THE RATIO COMMENTS BESIDE THESE TOKENS ARE NOT A SOURCE AND ARE NOT ASSERTED HERE. Three of
    // the four were wrong when this file was written, and state-info's "8.6" is its ratio on its own
    // WASH rather than on white — so those comments do not all quote the same ground. docs/backlog.md
    // carries that for step 7.
    const keys = [...new Set(Object.keys(T).flatMap(k => {
      const m = /^--color-state-([a-z0-9]+)$/.exec(k); return m ? [m[1]] : []
    }))].sort()
    expect(keys, 'the state family vanished from the token layer').toEqual(['error', 'info', 'ok', 'warn'])

    const bad: string[] = []
    for (const k of keys) {
      const c = T[`--color-state-${k}`]
      const own = `--color-state-${k}-wash`
      const onPaper = contrast(c, T[PAPER])
      if (onPaper < AA) bad.push(`state-${k} ${c} on ${PAPER}: ${r2(onPaper)}:1`)
      if (!T[own]) { bad.push(`state-${k} has no wash ${own}`); continue }
      const onOwn = contrast(c, T[own])
      if (onOwn < AA) bad.push(`state-${k} ${c} on ${own} ${T[own]}: ${r2(onOwn)}:1`)
    }
    expect(bad, bad.length === 0 ? '' :
      `a state colour is below WCAG AA ${AA}:1:\n  ${bad.join('\n  ')}\n\n` +
      'State colours carry compliance meaning — failed, invalid, refused, not yet priced — and are ' +
      'read as text on their own wash in chips and inline notices. A state a customer cannot read is ' +
      'a state that was not communicated.').toEqual([])
  })
})
