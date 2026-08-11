// lib/deals/reportModel.ts
// ThemisIQ — Deals: the presentation model shared by every rendering of a deal assessment.
//
// WHY THIS EXISTS. lib/deals/assessment.ts decides WHAT IS TRUE (which frameworks apply, which
// limbs are met, what it costs). This module decides HOW THAT IS SAID — the labels, the sentences,
// and the row models the surfaces render. It is deliberately pure: no React, no Supabase, no I/O.
//
// It exists because one assessment is rendered in more than one place — the wizard screens a user
// works through, and the printed report they hand to an investment committee — and those must not
// be able to disagree. Re-deriving any of this per surface is the regression: `mapFramework` in
// particular decides which STATUTE a risk finding is allowed to cite, so two copies could cite
// different regimes for the same deal. Same rule the GHG engine states for buildWorkings, and the
// same reason the CBAM .xlsx is built from the response already on screen rather than a refetch.
//
// It was extracted when a per-deal CSV export was the second rendering. That CSV has since been
// retired — it was a document flattened into a spreadsheet, and the printed report carries the same
// content properly — so the second consumer is now the report itself. The reason for sharing did
// not change with it: two renderings, one derivation.
//
// Consumers: app/dashboard/deals/page.tsx (wizard screens)
//            app/dashboard/deals/report/page.tsx (printed report)

import {
  NEAR_BAND_PCT, UNITS_PER_EUR, isDealCurrency, resolveFieldsPrompt,
  FIELD_LABELS, FIELD_FORM_LABELS,
  type FrameworkApplicability, type LimbResult, type DealCurrency, type Obligations,
} from './assessment'

// ─── Deal types ───────────────────────────────────────────────────────────────
export const DEAL_TYPES = [
  { id: 'ma', label: 'M&A — Acquisition', desc: 'Full acquisition of target company' },
  { id: 'pe', label: 'PE / Growth Equity', desc: 'Majority or minority stake investment' },
  { id: 'vc', label: 'Venture Capital', desc: 'Early or growth stage investment' },
  { id: 'lending', label: 'Lending / Credit', desc: 'Debt financing or credit facility' },
  { id: 'lp', label: 'LP / Fund Investment', desc: 'Investment into a fund or GP' },
]
export const dealTypeLabel = (id: string): string => DEAL_TYPES.find(d => d.id === id)?.label || '—'

// ─── Revenue magnitude echo ───────────────────────────────────────────────────
// Revenue is stored in WHOLE currency units, but it is entered in a bare number field with no unit
// affordance, so "2000" meaning $2m is silently 1000x low and the only visible symptom is a shorter
// frameworks list. Spelling the magnitude out makes that misreading self-evident — on the form
// before a report is generated, and in the report so a reader can catch what the preparer missed.
// Display only — never parsed back.
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const spellUnder1000 = (n: number): string => {
  if (n < 20) return ONES[n]
  if (n < 100) { const r = n % 10; return r ? `${TENS[Math.floor(n / 10)]}-${ONES[r]}` : TENS[Math.floor(n / 10)] }
  const r = n % 100
  return r ? `${ONES[Math.floor(n / 100)]} hundred ${spellUnder1000(r)}` : `${ONES[Math.floor(n / 100)]} hundred`
}
const SCALES: [number, string][] = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']]
export const spellMagnitude = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return ''
  for (const [size, name] of SCALES) {
    if (n >= size) {
      const v = n / size
      // 2dp, trailing zeros trimmed: 1,050,000,000 must echo "1.05 billion", not "1.1 billion" —
      // a rounded echo would defeat the point of echoing the figure back for checking.
      return Number.isInteger(v) && v < 1000 ? `${spellUnder1000(v)} ${name}` : `${Number(v.toFixed(2))} ${name}`
    }
  }
  return Number.isInteger(n) && n < 1000 ? spellUnder1000(n) : String(n)
}

// ─── Limb rendering ───────────────────────────────────────────────────────────
// One limb, rendered with the MEASURE it applied — never a bare "MET" against an unnamed measure.
export const limbValueDisplay = (l: LimbResult): string =>
  l.valueApplied == null ? 'not provided'
  : l.limb.unit.unit === 'count' ? l.valueApplied.toLocaleString()
  : `${l.limb.unit.currency} ${Math.round(l.valueApplied).toLocaleString()}`
export const limbThresholdDisplay = (l: LimbResult): string =>
  l.limb.unit.unit === 'count' ? l.limb.amount.toLocaleString() : `${l.limb.unit.currency} ${l.limb.amount.toLocaleString()}`
export const LIMB_STATE_LABEL: Record<LimbResult['state'], string> = {
  'met': 'MET', 'not-met': 'NOT MET', 'not-assessed': 'NOT ASSESSED',
}

// ─── Near-threshold presentation ──────────────────────────────────────────────
// A framework inside the band is NOT a changed legal answer — `applies` already settled that in the
// engine. The marker says VERIFY, never "maybe". An applying framework is still introduced as
// applying; a non-applying one is still introduced as not applying on the figures entered.
export const NEAR_PCT = NEAR_BAND_PCT   // from the engine, so band copy cannot drift from the band

// The marker fires only when a marginal limb is decisive (outcome flip), so the wording names that
// limb rather than implying the whole test is soft.
export const nearSentence = (f: FrameworkApplicability): string => {
  const t = f.test
  if (!t) return ''
  const decisive = t.limbs.filter(l => l.near && l.state !== 'not-assessed')
  const which = decisive.map(l => `${l.limb.measure.replace(/_/g, ' ')} (${limbValueDisplay(l)} vs ${limbThresholdDisplay(l)})`).join('; ')
  const test = `${t.metCount} of ${t.requires} limb${t.requires === 1 ? '' : 's'} met`
  return f.applies
    ? `Applies — ${test}. Decisive limb is marginal: ${which}, inside the ${NEAR_PCT} band. If that limb moved, the test would no longer be met. Verify the measure and reporting-entity scope; this does not weaken the obligation.`
    : `Does not apply on the figures entered — ${test}. A marginal limb could change that: ${which}, inside the ${NEAR_PCT} band. Verify before ruling it out.`
}

// ─── Threshold limb rows ──────────────────────────────────────────────────────
// One row per limb of every size test actually run. `exactMeasure: false` must surface — where one
// collected figure stands in for a differently-defined statutory measure, the report says so rather
// than implying the instrument's own definition was applied.
// Structured, not pre-joined: the report renders each part into its own table cell, styled
// independently — the measure plain, the proxy caveat marked. Keeping the parts separate also
// leaves the row usable by any future rendering without this model having to know about it.
export type LimbRow = {
  framework: string
  measure: string          // the limb's measure, humanised
  basis: string            // verbatim statutory basis
  valueApplied: string
  threshold: string
  result: string           // MET / NOT MET / NOT ASSESSED, with a marginal marker
  marginal: boolean
  state: LimbResult['state']
  basisOfValue: string     // which collected field supplied it, and whether it is a proxy
  isProxy: boolean
}

export const buildLimbRows = (applicability: FrameworkApplicability[]): LimbRow[] =>
  applicability
    .filter(f => f.test)
    .flatMap(f => f.test!.limbs.map((l): LimbRow => {
      const marginal = l.near && l.state !== 'not-assessed'
      return {
        framework: f.framework,
        measure: l.limb.measure.replace(/_/g, ' '),
        basis: l.limb.basis,
        valueApplied: limbValueDisplay(l),
        threshold: limbThresholdDisplay(l),
        result: LIMB_STATE_LABEL[l.state] + (marginal ? ' (marginal)' : ''),
        marginal,
        state: l.state,
        basisOfValue: l.state === 'not-assessed'
          ? `Not provided — enter ${FIELD_LABELS[l.limb.source]}`
          : `${FIELD_FORM_LABELS[l.limb.source]}${l.limb.exactMeasure ? '' : ` — PROXY. ${l.limb.measureNote ?? ''}`}`,
        isProxy: l.state !== 'not-assessed' && !l.limb.exactMeasure,
      }
    }))

// ─── FX basis ─────────────────────────────────────────────────────────────────
// The rate table is stored EUR-base (UNITS_PER_EUR) precisely so a reviewer can compare it digit
// for digit against the published ECB document. Printing only the derived cross-rate defeats that:
// it is a computed number that appears nowhere in the source. So every surface shows the
// transcribed figures, the derivation, and the result — labelled, so a reader can tell which
// numbers came from the document and which this system computed.
//
// Only currencies this deal actually exercised are described. `applicability` carries a `test` only
// for frameworks with an ACTIVE size test, so a pending or jurisdiction-only framework contributes
// nothing here and no conversion is claimed that did not happen.
//
// 6 dp for the derived cross-rate: the published figures carry at most 5 significant figures
// (GBP 0.85973) and every pair lands between 0.5 and 1.5, so 6 dp preserve every digit the source
// can support while cutting the float tail. Display only — the comparison uses full precision.
export const FX_DISPLAY_DP = 6

export const buildFxBasisRows = (currency: string, applicability: FrameworkApplicability[]): string[][] => {
  const thresholdCurrencyUse = new Map<DealCurrency, string[]>()
  for (const f of applicability)
    for (const l of f.test?.limbs ?? [])
      if (l.limb.unit.unit === 'currency') {
        const names = thresholdCurrencyUse.get(l.limb.unit.currency) ?? []
        if (!names.includes(f.framework)) names.push(f.framework)
        thresholdCurrencyUse.set(l.limb.unit.currency, names)
      }

  const dealCur = currency
  if (!isDealCurrency(dealCur))
    return [['Rate applied', `UNAVAILABLE — no published rate is held for ${dealCur}. Money limbs were not evaluated, so no framework was asserted or ruled out on a converted figure.`]]
  const uses = [...thresholdCurrencyUse.entries()]
  if (uses.length === 0)
    return [['Conversion applied', 'None — no size-gated framework with a money limb is in scope for this jurisdiction.']]

  // EUR has NO transcribed figure. It is the base the source quotes everything against, and
  // UNITS_PER_EUR.EUR is 1 by definition — calling that "transcribed verbatim" would attribute a
  // number to the source document that does not appear in it, which is the exact failure this
  // block exists to prevent. So EUR never gets a published-rate row.
  const published = (c: DealCurrency): string[][] =>
    c === 'EUR' ? []
      : [[`Published rate — ${c}`, `${c} ${UNITS_PER_EUR[c]} per EUR — transcribed verbatim from the source above`]]

  const rows: string[][] = []
  const shown = new Set<DealCurrency>()
  // The deal-currency figure is printed once, and only if some conversion actually used it.
  if (uses.some(([tc]) => tc !== dealCur)) { rows.push(...published(dealCur)); shown.add(dealCur) }

  for (const [tc, frameworks] of uses) {
    const scope = frameworks.join(', ')
    if (tc === dealCur) {
      // No rate is applied at all here, so stating one — even 1.000000 — would assert a conversion
      // step that never ran.
      rows.push([`Conversion ${dealCur} → ${tc} (${scope})`,
        `None. The threshold is denominated in ${tc} and the deal is entered in ${tc}, so the figure is compared exactly as entered. No rate is applied and no FX error can enter this comparison.`])
      continue
    }
    if (!shown.has(tc)) { rows.push(...published(tc)); shown.add(tc) }
    const rate = (UNITS_PER_EUR[tc] / UNITS_PER_EUR[dealCur]).toFixed(FX_DISPLAY_DP)
    // Which numbers are transcribed and which computed depends on whether EUR is one end of the
    // pair. Saying "DERIVED from the two figures above" when one of them is the base would name a
    // source figure that was never printed because it does not exist.
    const how =
      dealCur === 'EUR'
        ? `this IS the published ${tc} figure above, applied directly — the source quotes every rate as units per 1 EUR, so a EUR-denominated deal needs no derivation`
      : tc === 'EUR'
        ? `DERIVED, not published: 1 ÷ ${UNITS_PER_EUR[dealCur]} — EUR is the base the source quotes against, so it carries no figure of its own`
        : `DERIVED, not published: ${UNITS_PER_EUR[tc]} ÷ ${UNITS_PER_EUR[dealCur]}, computed from the two transcribed figures above`
    rows.push([`Conversion ${dealCur} → ${tc} (${scope})`,
      `1 ${dealCur} = ${rate} ${tc} — ${how}. Shown to ${FX_DISPLAY_DP} dp; the comparison itself uses full precision.`])
  }
  return rows
}

// ─── Regime tokens on a risk finding ──────────────────────────────────────────
// A regime token names a rule on a risk finding. It carries DISPLAY TEXT and, separately, the
// FrameworkApplicability IDENTITY whose status it inherits — the two are not the same string, and
// collapsing them into one joined label is what forced consumers to re-parse the output to recover
// the identity. 'ESRS E1' is the case that proves it: text 'ESRS E1', identity 'CSRD'.
//   framework  absent ⇒ DISPLAY-ONLY. No row's status governs it, so no surface can look it up:
//              'GHG Protocol', 'ESRS S2', 'Modern Slavery', 'EU AI Act' and every other
//              pass-through token from a SECTOR_RISKS template.
//   qualified  the text carries a caveat, so a surface may owe the reader an explanation of it.
//              A FLAG rather than a re-reading of `text`, because deciding "is this qualified" by
//              matching the display string is the coupling this shape removes.
//
// REGIME_CANDIDATES.licensedBy below answers TWO questions at once: what PERMITS emitting a token,
// and whose status it INHERITS. Those coincide for all five rows today — four are self-licensing and
// ESRS E1's licensor is also the row whose near-ness it shares. A token licensed by X but describing
// framework Y would need the two separated into distinct fields; nothing needs that yet.
export type RegimeToken = {
  text: string
  framework?: string
  qualified?: true
}

// Regime tokens a risk finding's Framework column may name, in display order, each paired with the
// framework-list entry that LICENSES it. A token is emitted ONLY when its licensing entry is present
// in the DETECTED `frameworks` array, so a finding can never name a statute the APPLICABLE
// FRAMEWORKS section of the same report withheld on a size test — SB 253 (turnover over USD 1bn)
// or SECR (2 of 3 over turnover, balance-sheet total and headcount) — or could not evaluate at all.
// Jurisdiction is deliberately NOT consulted here — `frameworks` already encodes it, and that is
// what makes Global resolve correctly (CSRD IS detected for Global, so it must not be erased).
export const REGIME_CANDIDATES: { token: string; licensedBy: string }[] = [
  { token: 'SB 253',         licensedBy: 'SB 253' },
  { token: 'CSRD',           licensedBy: 'CSRD' },
  { token: 'ESRS E1',        licensedBy: 'CSRD' },          // climate standard under CSRD
  { token: 'UK SRS (S1/S2)', licensedBy: 'UK SRS (S1/S2)' },
  { token: 'SECR',           licensedBy: 'SECR' },
]
// Used when NO candidate is licensed (sub-threshold USA, Canada/Australia/Other, or frameworks not
// yet computed). Names a methodology and the investor-baseline standard that getApplicableFrameworks
// emits unconditionally — never a statute.
// 'IFRS S2' IS a framework name the engine emits, so it carries identity; 'GHG Protocol' is a
// methodology with no row behind it, so it is display-only. That asymmetry is the point of the
// optional field: a fallback label must not imply a row exists to check.
export const REGIME_FALLBACK: RegimeToken[] = [
  { text: 'GHG Protocol' },
  { text: 'IFRS S2', framework: 'IFRS S2' },
]

// CS3D is an activity-triggered instrument, so it gets FOUR states, not the binary the regime
// tokens use. It reaches non-EU companies through EU-facing activity, which this assessment cannot
// determine (no market multi-select yet), so "not in the resolved list" is not the same as "does
// not apply".
//   applies        → cite plainly
//   near-threshold → the test RAN and was not met, with a marginal limb decisive
//   conditional    → cite as CS3D_NOT_ASSESSED_LABEL, NEVER suppress (size undeclared, or non-EU)
//   not-applicable → relabel, i.e. drop the token — same treatment as SB 253
//
// The internal state is 'conditional'; the PRINTED label is "not assessed". They differ on purpose:
// "conditional" describes a status without explaining it, and reads as "applies conditionally",
// which is the opposite of what is true. The label states what happened — the test was not run.
//
// 'near-threshold' is SEPARATE FROM 'conditional' because the two make opposite claims about
// whether anything was evaluated, and the old three-state form asserted the wrong one: a row the
// engine had fully evaluated printed "CS3D not assessed" beneath a panel showing its limbs, its
// values and "0 of 2 limbs met". Its `reason` is `string | null`, not optional, because the two
// sub-cases are both real and a consumer must handle each: a non-exhaustive route that was
// evaluated and not met carries the engine's own reason, while an ordinary marginal-limb flip
// carries none — and there, silence is the honest answer, since the near-threshold panel already
// states the arithmetic. `null` means "nothing further to say", not "not yet looked up".
export type Cs3dState =
  | { state: 'applies' }
  | { state: 'near-threshold'; reason: string | null }
  | { state: 'conditional'; reason: string }
  | { state: 'not-applicable' }

export const resolveCs3d = (frameworks: string[], applicability: FrameworkApplicability[]): Cs3dState => {
  if (frameworks.includes('CS3D')) return { state: 'applies' }
  const row = applicability.find(f => f.framework === 'CS3D')
  // ABOVE the reason branch, and that placement is the whole fix. A near-threshold row carrying a
  // routeNotMet reason satisfies BOTH conditions, so whichever branch comes first decides what the
  // report claims — and with the reason branch first the answer was 'conditional', i.e. "not
  // assessed", about a row whose limbs the very next panel printed. Ordering by the more specific
  // condition is what keeps the two surfaces telling one story.
  //
  // Only reachable for a row that does NOT apply: an applying near-threshold row (a marginal limb
  // ABOVE its figure, still met) is in `frameworks` and already returned 'applies' above. Near-ness
  // never softens the legal answer, so that ordering must not be disturbed either.
  if (row?.status === 'near-threshold') {
    // Same trailing-period strip as the branch below, for the same reason: the render site appends
    // one. Absent reason ⇒ null rather than a manufactured sentence — the engine evaluated the test
    // and withheld nothing, so there is no fact here this function knows and the row does not.
    return { state: 'near-threshold', reason: row.reason ? row.reason.replace(/\.$/, '') : null }
  }
  // The row's OWN reason wins WHEREVER IT EXISTS. Deriving a second, vaguer one here would let the
  // engine and the report state the same fact differently — and the status gate this used to sit
  // behind is what stopped that being true: a near-threshold row (both limbs marginal and unmet, so
  // the route WAS evaluated and not met) carried a reason and still fell past every branch to the
  // non-EU sentence below, telling the reader of an EU target that the target was outside the EU.
  // That row is now caught above, so what reaches here is the 'not-assessed' population: a genuine
  // abstention, with or without a reason of its own. The rule is unchanged — this branch must stay
  // ungated on status, because status is not what makes a reason worth printing.
  // Trailing period stripped because the render site appends one.
  if (row?.reason) return { state: 'conditional', reason: row.reason.replace(/\.$/, '') }
  if (row?.status === 'not-assessed') {
    // Withheld with no reason of its own ⇒ name the field(s) that would settle it, where any would.
    const prompt = resolveFieldsPrompt(row.test?.fieldsToResolve ?? [], ['CS3D'])
    return { state: 'conditional', reason: `size test incomplete${prompt ? ` — ${prompt}` : ''}` }
  }
  if (row?.status === 'not-applicable') return { state: 'not-applicable' }
  // No row at all ⇒ CS3D was never in scope for this jurisdiction. CHECKED rather than assumed: this
  // sentence asserts facts about the target (formed outside the EU, markets not captured), so it must
  // not be the fall-through for a row that merely matched no branch above.
  if (!row) return { state: 'conditional', reason: 'CS3D reaches non-EU companies through EU-facing activity; this assessment does not capture the target’s markets, so applicability cannot be resolved here' }
  // A row that matched nothing above. States ONLY what is known — no claim about jurisdiction, about
  // markets, or about a missing field, because none of those has been established here. An honest
  // non-answer, because an error message that guesses at a cause it cannot verify eventually names
  // the wrong one; the branch above is what that looked like.
  return { state: 'conditional', reason: 'CS3D applicability was not resolved by this assessment' }
}

// Rewrite generic disclosure-regime labels (SB 253, bare CSRD) on a static sector risk template to
// the regime the DETECTED frameworks actually support. Resolving against `frameworks` rather than
// jurisdiction is load-bearing: jurisdiction alone stamped "SB 253" on every USA deal, so a
// sub-threshold target was cited against a statute the APPLICABLE FRAMEWORKS section of the same
// report correctly omitted. A token here can now only name a regime that section also asserts.
// Activity-triggered EU instruments (CBAM, EUDR, AI Act, SFDR, CS3D, ETS) are left intact — they
// apply to UK/non-EU companies through EU-facing activity and have no domestic equivalent.
// The DISPLAY TEXT for an unresolved CS3D. It is no longer what a surface matches on — that is now
// `RegimeToken.qualified` plus `framework === 'CS3D'`, so the decision is made on structure rather
// than by re-reading a rendered string. Both stay named constants because they are verifier-facing
// copy that appears in a Framework column AND, now, as the heading of the sentence printed beneath a
// finding. Two surfaces, one spelling each: the report's near-threshold heading MUST read the same
// as the token in the Framework column beside it, or the page names the same row two ways. That is
// the drift three separate literals once produced, so neither string is ever written inline again.
export const CS3D_NOT_ASSESSED_LABEL = 'CS3D (not assessed)'
export const CS3D_NEAR_THRESHOLD_LABEL = 'CS3D (near threshold)'
// The abstention HEADING is not the abstention LABEL, and the difference is not an oversight. The
// label is a cell in a Framework column, where the parentheses separate the caveat from the
// instrument's name; the heading opens a sentence, where they would read as an aside. Near-threshold
// needs no second spelling — its heading IS its label, so the parenthesised form appears there.
export const CS3D_NOT_ASSESSED_HEADING = 'CS3D not assessed'

// Exhaustiveness guard. Every `switch` over a discriminated union ends in `default: assertNever(x)`,
// so ADDING A MEMBER BREAKS THE BUILD AT EVERY CONSUMER rather than silently falling to an else-arm.
// This exists because the opposite happened: both deal surfaces narrowed `Cs3dState` with
// `state === 'conditional' ? … : null`, so widening the union to four states type-checked cleanly
// and shipped a heading with no sentence under it. A ternary cannot be exhaustive; only this can.
export const assertNever = (x: never): never => {
  throw new Error(`Unhandled discriminated union member: ${JSON.stringify(x)}`)
}

// The CS3D sentence printed beneath a finding, as DATA. `body: null` ⇒ render the heading alone;
// the whole note null ⇒ render nothing at all. Both are outcomes, not absences to paper over.
export type Cs3dNote = { heading: string; body: string | null } | null

// TWO SURFACES, TWO FUNCTIONS, AND THEY DISAGREE ON EXACTLY ONE STATE. Not an inconsistency: the
// wizard prints `citedNear` beneath the same finding — the row's limbs, its figures and its side —
// so a near-threshold note there would describe the row twice, once redundantly. The report has no
// such line, so the same silence would delete the fact instead of deferring it. What differs is
// what surrounds the note, not what either surface believes about the row.
//
// They live HERE, not in the two components, for the reason `buildWorkings` does: a component that
// derives its own display content grows a second copy of the rule and then drifts from it. These
// are pure, so both are tested directly — a page cannot be, this repo has no DOM harness.
//
// Each switch is exhaustive over `Cs3dState` and ends in assertNever, so a FIFTH member breaks the
// build in both, and neither page can quietly fall through to an else-arm the way both once did.
// Return type is NARROWER than Cs3dNote — `body` is a plain string, never null. That is what lets
// the wizard's render site append its full stop unconditionally: this surface either has a sentence
// or prints nothing, so there is no heading-only case for punctuation to dangle off.
export const cs3dNoteWizard = (cs3d: Cs3dState): { heading: string; body: string } | null => {
  switch (cs3d.state) {
    case 'applies':
    case 'not-applicable':
    case 'near-threshold':
      return null
    case 'conditional': {
      // An empty reason suppresses the line outright. A heading with nothing after it is not a
      // shorter finding, it is a finding that lost its content and still looks authoritative.
      const body = cs3d.reason.trim()
      return body ? { heading: CS3D_NOT_ASSESSED_HEADING, body } : null
    }
    default:
      return assertNever(cs3d)
  }
}

export const cs3dNoteReport = (cs3d: Cs3dState): Cs3dNote => {
  switch (cs3d.state) {
    case 'applies':
    case 'not-applicable':
      return null
    case 'near-threshold': {
      // Heading ALONE where the engine attached no reason. It states what is true — the target sits
      // near the limits — and claims nothing about a test that was not run, which is the specific
      // false sentence this whole change exists to stop. The limbs, the figures and the side are in
      // the near-threshold section of the same document; inventing a sentence to fill the space here
      // is what would lose them. Heading text is the TOKEN'S OWN CONSTANT, so the Framework column
      // and this sentence cannot word one row two ways.
      const body = cs3d.reason?.trim()
      return { heading: CS3D_NEAR_THRESHOLD_LABEL, body: body || null }
    }
    case 'conditional': {
      const body = cs3d.reason.trim()
      return body ? { heading: CS3D_NOT_ASSESSED_HEADING, body } : null
    }
    default:
      return assertNever(cs3d)
  }
}

// All four CS3D outcomes and BOTH display strings, from the ROW. `Cs3dState` now carries the same
// four and can tell an abstention from an evaluated row sitting just below its limbs, so the two
// no longer disagree — this reads the row directly because it is handed one (`makeMapFramework`
// closes over `cs3dRow`) and has no `frameworks` list to resolve 'applies' from, not because the
// state is lossy. THEY MUST AGREE, and the pairing is fixed: 'applies' → plain token,
// 'near-threshold' → the near-threshold text, 'conditional' → CS3D_NOT_ASSESSED_LABEL,
// 'not-applicable' → null. Change a branch here and the matching branch there moves with it.
// The identity is 'CS3D' in every case; only the text and the caveat flag move.
// null ⇒ emit no token at all, the 'not-applicable' relabel.
//   applies (incl. a marginal limb ABOVE, which still applies) → plain, no caveat
//   near-threshold, not applying                               → evaluated, just under its limbs
//   not-assessed                                              → withheld
//   no row at all                                             → CS3D not in scope for this
//                                                               jurisdiction; still not a negative
export const cs3dToken = (row: FrameworkApplicability | undefined): RegimeToken | null => {
  if (!row) return { text: CS3D_NOT_ASSESSED_LABEL, framework: 'CS3D', qualified: true }
  if (row.applies) return { text: 'CS3D', framework: 'CS3D' }
  if (row.status === 'not-applicable') return null
  if (row.status === 'near-threshold') return { text: CS3D_NEAR_THRESHOLD_LABEL, framework: 'CS3D', qualified: true }
  return { text: CS3D_NOT_ASSESSED_LABEL, framework: 'CS3D', qualified: true }
}

// Joins tokens for display. THE ONLY PLACE ' / ' IS WRITTEN ON THE OUTPUT SIDE — the separator used
// to appear three times: here, in the input split below, and in a consumer re-splitting this
// function's own result to recover identities. That round-trip is what RegimeToken removes.
export const regimeLabel = (tokens: RegimeToken[]): string => tokens.map(t => t.text).join(' / ')

export const makeMapFramework = (frameworks: string[], cs3dRow: FrameworkApplicability | undefined) => (fw: string): RegimeToken[] => {
  const licensed: RegimeToken[] = REGIME_CANDIDATES
    .filter(c => frameworks.includes(c.licensedBy))
    .map(c => ({ text: c.token, framework: c.licensedBy }))
  const regime = licensed.length ? licensed : REGIME_FALLBACK
  const cs3d = cs3dToken(cs3dRow)
  const out = fw
    // The INPUT side: SECTOR_RISKS templates still hold ' / '-joined strings, so this split stays.
    .split(' / ')
    .flatMap((tok): RegimeToken[] =>
      (tok === 'SB 253' || tok === 'SB253' || tok === 'CSRD') ? regime
      : tok === 'CS3D' ? (cs3d ? [cs3d] : [])
      // Pass-through: no row governs it, so no identity. A token that happens to share a framework's
      // name is NOT given one — inferring identity by name is the string matching being removed.
      : [{ text: tok }])
    // Dedupe on TEXT, post-expansion. NOT arr.indexOf(t): these are freshly built objects, so
    // indexOf compares references, never matches, and would silently keep every duplicate — the
    // string version of this line worked only because strings compare by value.
    .filter((t, i, arr) => arr.findIndex(o => o.text === t.text) === i)
  // Dropping the only token would leave an empty label; fall back rather than render nothing.
  return out.length ? out : REGIME_FALLBACK
}

// ─── Headline ThemisIQ figure ─────────────────────────────────────────────────
// Shared by the cost card, the export summary, the sticky deal summary and the printed report, so
// all four state the same number. `locationUnset` is a prompt on screen; in a printed document
// there is nothing to click, so the caller supplies what an unset count should read as.
export const themisIqFigure = (o: Obligations, unsetLabel = 'Enter locations →'): string =>
  o.locationUnset ? unsetLabel
    : o.themisIqHasCustom
      ? (o.themisIqTotal != null ? `~USD ${o.themisIqTotal.toLocaleString()} + custom` : 'Custom quote')
      : `~USD ${(o.themisIqTotal ?? 0).toLocaleString()}`
