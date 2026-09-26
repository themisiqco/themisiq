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
 * Modules that need a companion and do not have one yet. This is the swap's remaining work, written as
 * an assertion so it cannot be quietly forgotten: when a companion is declared, its key moves from
 * here to HAS_INK, and the partition check below fails until it does.
 *
 * ⚠️ FIVE, NOT SIX. `climate` was listed here and should not have been: its target value #004AAD
 * measures 8.13:1 on paper, so it needs no companion and is in NEEDS_NO_INK below. Counted from the
 * measurements in docs/colourway-2026.md on 25 Sep 2026.
 */
const PENDING_STEP_6 = new Set(['cbam', 'cyber', 'deals', 'ghg', 'supply'])

/**
 * Modules whose own value clears body AA, so a companion would be a second name for a colour that
 * already works. Distinct from IDENTITY_ONLY: these modules DO carry text, in their own value.
 * Asserted both ways below — a companion declared for one of these fails, and so does a value here
 * that stops clearing 4.5:1.
 */
const NEEDS_NO_INK = new Set(['climate'])

/**
 * What each `[data-module="k"]` block sets `--tq-mod` to, as { ghg: '--color-module-ghg', … }.
 * A module absent from the result sets no --tq-mod, which is a meaningful state — see the test.
 */
function tqMod(): Record<string, string> {
  const src = readFileSync(join(ROOT, CSS_PATH), 'utf8')
  const out: Record<string, string> = {}
  for (const m of src.matchAll(/\[data-module="([a-z0-9]+)"\]\s*\{([^}]*)\}/g)) {
    const set = /--tq-mod\s*:\s*var\((--color-[a-z0-9-]+)\)/.exec(m[2])
    if (set) out[m[1]] = set[1]
  }
  return out
}

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

    const wronglyNoInk = [...NEEDS_NO_INK].filter(k => declared.has(k)).sort()
    expect(wronglyNoInk, wronglyNoInk.length === 0 ? '' :
      `${wronglyNoInk.join(', ')} is in NEEDS_NO_INK because its own value already clears body AA, so a ` +
      'companion would be a second name for a colour that works. Either remove the companion, or move ' +
      'the key to HAS_INK because the value changed and no longer clears 4.5:1.').toEqual([])

    const unclassified = keys.filter(k =>
      !HAS_INK.has(k) && !IDENTITY_ONLY.has(k) && !PENDING_STEP_6.has(k) && !NEEDS_NO_INK.has(k))
    expect(unclassified, unclassified.length === 0 ? '' :
      `module(s) ${unclassified.join(', ')} are in none of HAS_INK, IDENTITY_ONLY, PENDING_STEP_6 or ` +
      'NEEDS_NO_INK. A new module needs a decision about whether its identity colour is ever set on text.').toEqual([])

    const ghosts = [...HAS_INK, ...IDENTITY_ONLY, ...PENDING_STEP_6, ...NEEDS_NO_INK].filter(k => !keys.includes(k)).sort()
    expect(ghosts, ghosts.length === 0 ? '' :
      `${ghosts.join(', ')} are listed in this file but no --color-module-* token declares them.`).toEqual([])
  })

  it('whatever --tq-mod resolves to can carry the text AND the bar it feeds', () => {
    // ⚠️ WHAT --tq-mod IS WIRED TO, so the two thresholds below are not arbitrary. Setting
    // data-module on a container makes --tq-mod the colour of:
    //   .tq-summary-label    11px / 700  TEXT          -> 4.5:1
    //   .tq-summary-figure   --text-3xl  TEXT          -> 4.5:1 (large-text 3.0 would also apply,
    //                                                    but the label shares the value and is small)
    //   .tq-summary          6px LEFT bar              -> 3.0:1, WCAG 1.4.11: it is the platform's
    //                                                    only module-identity mark, so it carries
    //                                                    meaning and is not decorative
    //   .tq-nav-active       nav label   TEXT          -> 4.5:1
    //   .tq-callout          4px TOP rule              -> 3.0:1
    // plus app/dashboard/deals/page.tsx:949, a 1.9rem figure reading var(--tq-mod) directly.
    //
    // ⚠️ THE DEFECT THIS EXISTS TO PREVENT IS LATENT, NOT LIVE, AND THAT IS WHY IT IS A TEST AND NOT
    // A FIX. On 25 Sep 2026 this was reported as a live defect on the People and AI Governance
    // summaries and it was not: --color-module-people #7B630D measures 5.78:1 and
    // --color-module-ai #136C3D 6.48:1, so both render correctly. The 1.33:1 and 2.85:1 figures that
    // prompted the report were the INCOMING colourway values applied to today's code path. Stripping
    // --tq-mod from those two blocks now would have removed a working identity colour from three
    // summary blocks for no present benefit.
    //
    // ⚠️ THE DEFECT IS THE COMBINATION, WHICH IS WHY IT IS ASSERTED RATHER THAN PRE-EMPTED. A module
    // may set --tq-mod, or may have a value that cannot carry text — not both. Today every module
    // satisfies it on the second arm. The instant a colourway value lands in the token layer without
    // its companion, this fires and names the block to change. It covers ALL EIGHT modules, not only
    // the two identity-only ones: cbam, cyber, supply and deals all set --tq-mod and all fall below
    // 3.0:1 under the 2026 colourway too. See docs/colourway-2026.md.
    const wired = tqMod()
    const bad: string[] = []
    for (const [k, token] of Object.entries(wired)) {
      if (!T[token]) { bad.push(`[data-module="${k}"] sets --tq-mod to ${token}, which is not declared`); continue }
      const v = T[token]
      const onPaper = contrast(v, T[PAPER])
      if (onPaper < AA) bad.push(
        `[data-module="${k}"] -> ${token} ${v}: ${r2(onPaper)}:1 on ${PAPER}, below ${AA} for ` +
        '.tq-summary-label and .tq-summary-figure')
      if (onPaper < 3) bad.push(
        `[data-module="${k}"] -> ${token} ${v}: ${r2(onPaper)}:1 on ${PAPER}, below 3.0 for the 6px identity bar`)
    }
    expect(bad, bad.length === 0 ? '' :
      `--tq-mod resolves to a value that cannot carry what it feeds:\n  ${bad.join('\n  ')}\n\n` +
      'TWO REMEDIES, and which one applies is a decision already recorded. If the module has an -ink ' +
      'companion, point its [data-module] block at the companion instead of the fill — that is what a ' +
      'companion is for. If the module is in IDENTITY_ONLY and therefore has none, REMOVE the --tq-mod ' +
      'declaration from its block entirely so the var(--tq-mod, var(--color-brand)) fallback fires and ' +
      'the surface renders in brand teal. What must not happen is leaving the declaration in place ' +
      'pointing at a value nobody can read: that renders invisible text while appearing to work.').toEqual([])
  })

  it('every module whose own value cannot carry text has a companion, and --tq-mod uses it', () => {
    // Three assertions, all vacuous today because all eight values clear 4.5:1, and all three fire
    // during the swap. They are what makes a HALF-DONE swap fail rather than ship: values moved but no
    // companions declared; companions declared but [data-module] still pointing at the fill; a
    // companion declined for a module that is not identity-only.
    const keys = moduleKeys()
    const wired = tqMod()
    const bad: string[] = []
    for (const k of keys) {
      const fill = T[`--color-module-${k}`]
      if (!fill) continue
      const ink = T[`--color-module-${k}-ink`]
      const fillCarriesText = contrast(fill, T[PAPER]) >= AA

      if (!fillCarriesText && !ink && !IDENTITY_ONLY.has(k)) bad.push(
        `${k}: fill ${fill} is ${r2(contrast(fill, T[PAPER]))}:1 on paper and there is no ` +
        `--color-module-${k}-ink. It is not in IDENTITY_ONLY, so it needs one.`)

      if (ink && wired[k] === `--color-module-${k}`) bad.push(
        `${k}: --color-module-${k}-ink ${ink} exists, but [data-module="${k}"] still points --tq-mod at ` +
        `the FILL ${fill}. The companion is declared and unused, which is the shape of a half-done swap.`)

      if (!fillCarriesText && IDENTITY_ONLY.has(k) && wired[k]) bad.push(
        `${k}: fill ${fill} is ${r2(contrast(fill, T[PAPER]))}:1 on paper and ${k} is IDENTITY_ONLY with ` +
        `no companion, but [data-module="${k}"] still sets --tq-mod. Remove that declaration.`)
    }
    expect(bad, bad.length === 0 ? '' :
      `the companion scheme is incomplete:\n  ${bad.join('\n  ')}\n\n` +
      'docs/colourway-2026.md has the measured companion values and the reason the swap cannot be ' +
      'landed in pieces: the bar inversion and the companions are BOTH wrong against the current ' +
      'values and only become right when the values move.').toEqual([])
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
