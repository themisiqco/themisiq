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
  getFrameworkApplicability, getObligations, getComplianceCost, sectorRisks,
  assessmentView, isRevenueDeclared, notAssessedNote as notAssessedNoteOf, partiallyAssessedNote,
  routeNotMetNote, partialHeadingPhrase, nearThresholdNoneNote, obligationPriceLabel,
  FX_SOURCE, FX_AS_OF, THRESHOLD_TESTS, isTestActive,
  showCanadaS211JurisdictionCaveat, canadaS211CaveatText,
  type FrameworkApplicability, type FrameworkGuidance, type LimbResult, type DealCurrency, type Obligations,
  type SectorRisk,
} from './assessment'
import { NOT_PROVIDED } from '../notProvided'
import { GHG_TIERS } from '../pricing'
import { canadaCaveatForMarkets, MARKETS_UNRECORDED_LINE, FRAMEWORK_CITATIONS } from './markets'
import { normalizeSector } from './sectors'
import { assessClaims, CLAIMS_DATA_ROOM_ITEM, type ClaimsLine } from './claimsRules'
import { filenameDate } from '../filename'
import { disclaimerParas } from '../disclaimer'

// ─── Deal types ───────────────────────────────────────────────────────────────
// ⚠️ `short` IS AN EXPLICIT FIELD, NOT A SUBSTRING OF `label`. The deal summary used to derive it with
// `label.split(' —')[0]`, which worked only because 'M&A — Acquisition' was the one label containing an
// em dash: every other label has no ' —' and so came back whole, which is the intended result by
// accident rather than by rule. That made the punctuation load-bearing — rewriting one dash would have
// silently started printing 'M&A: Acquisition' in a cell sized for 'M&A' — so the field is declared.
// Added 26 Sep 2026, immediately before the em-dash sweep that would have broken it.
export const DEAL_TYPES = [
  { id: 'ma', label: 'M&A: Acquisition', short: 'M&A', desc: 'Full acquisition of target company' },
  { id: 'pe', label: 'PE / Growth Equity', short: 'PE / Growth Equity', desc: 'Majority or minority stake investment' },
  { id: 'vc', label: 'Venture Capital', short: 'Venture Capital', desc: 'Early or growth stage investment' },
  { id: 'lending', label: 'Lending / Credit', short: 'Lending / Credit', desc: 'Debt financing or credit facility' },
  { id: 'lp', label: 'LP / Fund Investment', short: 'LP / Fund Investment', desc: 'Investment into a fund or GP' },
]
// ⚠️ 'Not provided', NOT '—'. Six of these were replaced across the Deals wizard and report on
// 26 Sep 2026. The string itself now lives in lib/notProvided.ts, because the GHG workings rows read it
// too; it is re-exported here so every importer of this module keeps working unchanged.
export { NOT_PROVIDED } from '../notProvided'
export const dealTypeLabel = (id: string): string => DEAL_TYPES.find(d => d.id === id)?.label || NOT_PROVIDED
export const dealTypeShort = (id: string): string => DEAL_TYPES.find(d => d.id === id)?.short || NOT_PROVIDED

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
    ? `Applies: ${test}. The deciding figure is borderline: ${which}, inside the ${NEAR_PCT} band. If that limb moved, the test would no longer be met. Verify the measure and reporting-entity scope; this does not weaken the obligation.`
    : `Does not apply on the figures entered: ${test}. A borderline figure could change that: ${which}, inside the ${NEAR_PCT} band. Verify before ruling it out.`
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

/** On every limb of a test run for a market the target is not established in (Canada S-211 via sales markets). */
export const GLOBAL_FIGURES_NOTE = 'The figures applied are the target’s global figures, not its Canadian business alone.'

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
          ? `Not provided. Enter ${FIELD_LABELS[l.limb.source]}`
          : `${FIELD_FORM_LABELS[l.limb.source]}${l.limb.exactMeasure && !f.globalFigures ? '' : `: PROXY. ${[l.limb.measureNote, f.globalFigures ? GLOBAL_FIGURES_NOTE : null].filter(Boolean).join(' ')}`}`,
        isProxy: l.state !== 'not-assessed' && (!l.limb.exactMeasure || !!f.globalFigures),
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
//
// ⚠️ ROWS DESCRIBE CONVERSIONS THAT RAN, AND NOTHING ELSE (29 Sep 2026). A threshold in the deal's own
// currency used to get a row labelled "Conversion GBP → GBP (SECR)" whose value said no conversion ran:
// the label claimed a step the value denied. Those rows are gone. Where no conversion ran anywhere,
// fxNoConversionSentence says so in one sentence and the report drops the rate-source rows, which
// would otherwise cite a source for a rate nothing used. In a MIXED deal (one threshold in the deal's
// currency, another converted) the same-currency frameworks are named once, under the table, by
// fxSameCurrencyNote: "Compared as entered, no conversion: SECR (GBP)".
//
// ⚠️ NO JURISDICTION PRODUCES A MIXED DEAL TODAY (checked 29 Sep 2026): every jurisdiction's money
// limbs share one currency (USA USD, European Union EUR, UK GBP, Canada CAD; the rest have none). The
// note exists so the first jurisdiction to test two currencies does not silently lose the statement.
export const FX_DISPLAY_DP = 6

/** Which threshold currencies this deal's active money limbs used, and by which frameworks. */
const thresholdCurrencyUse = (applicability: FrameworkApplicability[]): Map<DealCurrency, string[]> => {
  const use = new Map<DealCurrency, string[]>()
  for (const f of applicability)
    for (const l of f.test?.limbs ?? [])
      if (l.limb.unit.unit === 'currency') {
        const names = use.get(l.limb.unit.currency) ?? []
        if (!names.includes(f.framework)) names.push(f.framework)
        use.set(l.limb.unit.currency, names)
      }
  return use
}

/**
 * The plain sentence for a deal where no currency conversion ran at all, or null where one did (or
 * where the deal's currency has no published rate, which buildFxBasisRows reports as UNAVAILABLE).
 */
export const fxNoConversionSentence = (currency: string, applicability: FrameworkApplicability[]): string | null => {
  if (!isDealCurrency(currency)) return null
  const used = [...thresholdCurrencyUse(applicability).keys()]
  if (used.length === 0)
    return 'No currency conversion was needed: no size-gated framework with a money figure is in scope for this jurisdiction.'
  if (used.every(tc => tc === currency))
    return `No currency conversion was needed: all figures were tested in ${currency}, the currency they were entered in.`
  return null
}

/**
 * In a mixed deal only, the frameworks compared in the deal's own currency, named in one line. Null
 * where nothing was converted (fxNoConversionSentence covers that deal) and where nothing was compared
 * as entered.
 */
export const fxSameCurrencyNote = (currency: string, applicability: FrameworkApplicability[]): string | null => {
  if (!isDealCurrency(currency) || fxNoConversionSentence(currency, applicability) !== null) return null
  const same = thresholdCurrencyUse(applicability).get(currency)
  return same?.length ? `Compared as entered, no conversion: ${same.map(f => `${f} (${currency})`).join(', ')}` : null
}

export const buildFxBasisRows = (currency: string, applicability: FrameworkApplicability[]): string[][] => {
  const dealCur = currency
  if (!isDealCurrency(dealCur))
    return [['Rate applied', `UNAVAILABLE: no published rate is held for ${dealCur}. Money limbs were not evaluated, so no framework was asserted or ruled out on a converted figure.`]]
  // Same-currency uses are dropped here: no rate is applied to them, so they are not conversions.
  const uses = [...thresholdCurrencyUse(applicability).entries()].filter(([tc]) => tc !== dealCur)
  if (uses.length === 0) return []

  // EUR has NO transcribed figure. It is the base the source quotes everything against, and
  // UNITS_PER_EUR.EUR is 1 by definition — calling that "transcribed verbatim" would attribute a
  // number to the source document that does not appear in it, which is the exact failure this
  // block exists to prevent. So EUR never gets a published-rate row.
  const published = (c: DealCurrency): string[][] =>
    c === 'EUR' ? []
      : [[`Published rate: ${c}`, `${c} ${UNITS_PER_EUR[c]} per EUR, transcribed verbatim from the source above`]]

  const rows: string[][] = []
  const shown = new Set<DealCurrency>()
  // The deal-currency figure is printed once; every use left here is a real conversion that used it.
  rows.push(...published(dealCur)); shown.add(dealCur)

  for (const [tc, frameworks] of uses) {
    const scope = frameworks.join(', ')
    if (!shown.has(tc)) { rows.push(...published(tc)); shown.add(tc) }
    const rate = (UNITS_PER_EUR[tc] / UNITS_PER_EUR[dealCur]).toFixed(FX_DISPLAY_DP)
    // Which numbers are transcribed and which computed depends on whether EUR is one end of the
    // pair. Saying "DERIVED from the two figures above" when one of them is the base would name a
    // source figure that was never printed because it does not exist.
    const how =
      dealCur === 'EUR'
        ? `this IS the published ${tc} figure above, applied directly, because the source quotes every rate as units per 1 EUR, so a EUR-denominated deal needs no derivation`
      : tc === 'EUR'
        ? `DERIVED, not published: 1 ÷ ${UNITS_PER_EUR[dealCur]}. EUR is the base the source quotes against, so it carries no figure of its own`
        : `DERIVED, not published: ${UNITS_PER_EUR[tc]} ÷ ${UNITS_PER_EUR[dealCur]}, computed from the two transcribed figures above`
    rows.push([`Conversion ${dealCur} → ${tc} (${scope})`,
      `1 ${dealCur} = ${rate} ${tc}. ${how}. Shown to ${FX_DISPLAY_DP} dp; the comparison itself uses full precision.`])
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
  // 'UK SRS (S1/S2)' was a candidate here, licensed by itself. It became a market expectation on
  // 29 Sep 2026 and so can never be in the APPLIES list that licenses a token; the candidate was dead.
  { token: 'SECR',           licensedBy: 'SECR' },
]
// Used when NO candidate is licensed (sub-threshold USA, Canada/Australia/Other, or frameworks not
// yet computed). Names a methodology only: never a statute, and never a claim that one applies.
// Display-only, with no `framework`, because no row stands behind a methodology.
// ⚠️ WAS 'GHG Protocol / IFRS S2' UNTIL 29 Sep 2026. IFRS S2 is a market expectation now, never an
// APPLIES row, and a risk finding's Framework column naming it beside a methodology read as a
// regulatory citation. It is listed where it belongs, under "Investor and market expectations".
export const REGIME_FALLBACK: RegimeToken[] = [
  { text: 'GHG Protocol' },
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

export const resolveRegime = (
  labels: RegimeLabels, frameworks: string[], applicability: FrameworkApplicability[],
): Cs3dState => {
  const fw = labels.framework
  if (frameworks.includes(fw)) return { state: 'applies' }
  const row = applicability.find(f => f.framework === fw)
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
    const prompt = resolveFieldsPrompt(row.test?.fieldsToResolve ?? [], [fw])
    return { state: 'conditional', reason: `size test incomplete${prompt ? `: ${prompt}` : ''}` }
  }
  if (row?.status === 'not-applicable') return { state: 'not-applicable' }
  // No row at all ⇒ CS3D was never in scope for this jurisdiction. CHECKED rather than assumed: this
  // sentence asserts facts about the target (formed outside the EU, markets not captured), so it must
  // not be the fall-through for a row that merely matched no branch above.
  // ⚠️ PER REGIME, AND AN ABSENT `noRowReason` MEANS "SAY NOTHING" RATHER THAN "SAY SOMETHING GENERIC".
  // CS3D supplies a sentence because it genuinely reaches non-EU companies, so a missing row is a fact
  // worth stating. Canada S-211 supplies NONE, deliberately: s.2(a) does reach a company listed on a
  // Canadian exchange wherever it is established, but the jurisdiction gate in getFrameworkApplicability
  // only creates the row for jurisdiction === 'Canada', so there is nothing this function can say that
  // the engine has established. Falling through to 'not-applicable' keeps today's behaviour, which is
  // silence. THAT IS THE OPEN GAP, NOT A DESIGN: see the report of 26 Sep 2026. Giving S-211 a sentence
  // here would announce a limitation on every non-Canadian deal without fixing it.
  if (!row) return labels.noRowReason
    ? { state: 'conditional', reason: labels.noRowReason }
    : { state: 'not-applicable' }
  // A row that matched nothing above. States ONLY what is known — no claim about jurisdiction, about
  // markets, or about a missing field, because none of those has been established here. An honest
  // non-answer, because an error message that guesses at a cause it cannot verify eventually names
  // the wrong one; the branch above is what that looked like.
  return { state: 'conditional', reason: labels.unresolvedReason }
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
// ⚠️ A LABEL SET PER REGIME, AND CS3D'S ARE STILL ITS OWN LITERALS. Generalised on 26 Sep 2026 when
// Canada S-211 became the second non-exhaustive test. The generic functions below take one of these
// rather than deriving text from the framework name: derivation would have produced the same four
// strings for CS3D today and made any future casing or wording difference in one regime impossible to
// express. The wrappers pass CS3D's existing constants unchanged, so its output is byte-identical.
export type RegimeLabels = {
  framework: string
  notAssessedLabel: string    // Framework-column cell
  nearThresholdLabel: string  // Framework-column cell, and the near-threshold note heading
  notAssessedHeading: string  // the note heading, which is NOT the cell label — see below
  // The sentence for "no row at all". OPTIONAL, and its absence is meaningful: omit it where the engine
  // creates no row and nothing has been established about why, and the regime falls through to
  // 'not-applicable' (silence) instead of asserting a cause it cannot verify.
  noRowReason?: string
  // The honest non-answer for a row that matched no branch. States only that the assessment did not
  // resolve it; claims nothing about jurisdiction, markets or missing fields.
  unresolvedReason: string
}

export const CS3D_NOT_ASSESSED_LABEL = 'CS3D (not assessed)'
export const CS3D_NEAR_THRESHOLD_LABEL = 'CS3D (near threshold)'
// The abstention HEADING is not the abstention LABEL, and the difference is not an oversight. The
// label is a cell in a Framework column, where the parentheses separate the caveat from the
// instrument's name; the heading opens a sentence, where they would read as an aside. Near-threshold
// needs no second spelling — its heading IS its label, so the parenthesised form appears there.
export const CS3D_NOT_ASSESSED_HEADING = 'CS3D not assessed'

export const CS3D_LABELS: RegimeLabels = {
  framework: 'CS3D',
  notAssessedLabel: CS3D_NOT_ASSESSED_LABEL,
  nearThresholdLabel: CS3D_NEAR_THRESHOLD_LABEL,
  notAssessedHeading: CS3D_NOT_ASSESSED_HEADING,
  noRowReason: 'CS3D reaches non-EU companies through net turnover generated in the EU; this assessment does not collect that figure, so applicability cannot be resolved here',
  unresolvedReason: 'CS3D applicability was not resolved by this assessment',
}

// Canada S-211's set, added with the s.2(a) listing route. Same four shapes as CS3D's, which is what
// makes the report word two regimes one way rather than two.
export const CANADA_S211_NOT_ASSESSED_LABEL = 'Canada S-211 (not assessed)'
export const CANADA_S211_NEAR_THRESHOLD_LABEL = 'Canada S-211 (near threshold)'
export const CANADA_S211_NOT_ASSESSED_HEADING = 'Canada S-211 not assessed'

export const CANADA_S211_LABELS: RegimeLabels = {
  framework: 'Canada S-211',
  notAssessedLabel: CANADA_S211_NOT_ASSESSED_LABEL,
  nearThresholdLabel: CANADA_S211_NEAR_THRESHOLD_LABEL,
  notAssessedHeading: CANADA_S211_NOT_ASSESSED_HEADING,
  // NO noRowReason — see the note at the !row branch in resolveRegime.
  unresolvedReason: 'Canada S-211 applicability was not resolved by this assessment',
}

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
export const regimeNoteWizard = (labels: RegimeLabels, cs3d: Cs3dState): { heading: string; body: string } | null => {
  switch (cs3d.state) {
    case 'applies':
    case 'not-applicable':
    case 'near-threshold':
      return null
    case 'conditional': {
      // An empty reason suppresses the line outright. A heading with nothing after it is not a
      // shorter finding, it is a finding that lost its content and still looks authoritative.
      const body = cs3d.reason.trim()
      return body ? { heading: labels.notAssessedHeading, body } : null
    }
    default:
      return assertNever(cs3d)
  }
}

export const regimeNoteReport = (labels: RegimeLabels, cs3d: Cs3dState): Cs3dNote => {
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
      return { heading: labels.nearThresholdLabel, body: body || null }
    }
    case 'conditional': {
      const body = cs3d.reason.trim()
      return body ? { heading: labels.notAssessedHeading, body } : null
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
export const regimeTokenFor = (labels: RegimeLabels, row: FrameworkApplicability | undefined): RegimeToken | null => {
  const fw = labels.framework
  if (!row) return { text: labels.notAssessedLabel, framework: fw, qualified: true }
  if (row.applies) return { text: fw, framework: fw }
  if (row.status === 'not-applicable') return null
  if (row.status === 'near-threshold') return { text: labels.nearThresholdLabel, framework: fw, qualified: true }
  return { text: labels.notAssessedLabel, framework: fw, qualified: true }
}

// Joins tokens for display. THE ONLY PLACE ' / ' IS WRITTEN ON THE OUTPUT SIDE — the separator used
// to appear three times: here, in the input split below, and in a consumer re-splitting this
// function's own result to recover identities. That round-trip is what RegimeToken removes.
/** The guidance paragraph as one line of text, for the PDF: the source, then each quotation in quotes. */
export const guidanceParagraph = (g: FrameworkGuidance): string =>
  `${g.source}: ${g.quotes.map(q => `"${q}"`).join(' ')}`

export const regimeLabel = (tokens: RegimeToken[]): string => tokens.map(t => t.text).join(' / ')

export const makeMapFramework = (frameworks: string[], cs3dRow: FrameworkApplicability | undefined) => (fw: string): RegimeToken[] => {
  const licensed: RegimeToken[] = REGIME_CANDIDATES
    .filter(c => frameworks.includes(c.licensedBy))
    .map(c => ({ text: c.token, framework: c.licensedBy }))
  const regime = licensed.length ? licensed : REGIME_FALLBACK
  const cs3d = cs3dToken(cs3dRow)
  const out = fw
    // The INPUT side: SECTOR_RISKS templates still hold ' / '-joined strings, so this split stays.
    // OUTSIDE BRACKETS ONLY: 'Investor expectation (IFRS S2 / TCFD)' is one label, and splitting
    // inside it would print "Investor expectation (IFRS S2" and "TCFD)" as two.
    .split(/ \/ (?![^()]*\))/)
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
// NOTHING INCLUDED comes first: with no applying regime that needs a priced module, there is no
// ThemisIQ total to state, and "~USD 0" would read as "free" while a headcount prompt would ask for a
// figure that prices nothing. The recommended modules carry their own prices.
/**
 * A money range to 2 significant figures, both ends in the unit the higher one needs: "USD 0.6M–1.2M",
 * "GBP 240k–480k". The value-at-risk band is an indicative exposure, and eight digits of precision
 * on it claimed an accuracy the estimate does not have (29 Sep 2026).
 */
export const compactMoneyRange = (currency: string, low: number, high: number): string => {
  const [div, unit] = high >= 1e6 ? [1e6, 'M'] : high >= 1e3 ? [1e3, 'k'] : [1, '']
  const sig = (n: number) => String(Number((n / div).toPrecision(2)))
  return `${currency} ${sig(low)}${unit}–${sig(high)}${unit}`
}

// The headline alone: the ThemisIQ card's note already says the recommended modules are priced
// below, so saying it twice was one sentence printed two ways (29 Sep 2026).
export const NO_PRICED_OBLIGATION = 'No priced obligation'

// A GHG row priced on neither headcount nor sites still has a floor: the cheapest band, from
// GHG_TIERS. "Custom quote" there read as though the price were above the list rather than unknown.
const GHG_FLOOR = Math.min(...Object.values(GHG_TIERS).map(t => t.priceUSD).filter((p): p is number => p != null))
/** The price an obligation row shows, in the report, the PDF and the wizard alike. */
export const obligationRowPrice = (o: Obligations['included'][number], obligations: Obligations): string =>
  o.short === 'GHG' && obligations.ghgBasis.kind === 'none' ? `From USD ${GHG_FLOOR.toLocaleString('en-US')}` : obligationPriceLabel(o.pricing)
export const themisIqFigure = (o: Obligations, unsetLabel = 'Enter locations →'): string =>
  o.included.length === 0 ? NO_PRICED_OBLIGATION
  : o.locationUnset ? unsetLabel
    : o.themisIqHasCustom
      ? (o.themisIqTotal != null ? `~USD ${o.themisIqTotal.toLocaleString()} + custom` : 'Custom quote')
      : `~USD ${(o.themisIqTotal ?? 0).toLocaleString()}`


/* ── CS3D's wrappers ─────────────────────────────────────────────────────────────────────────────────
 * ⚠️ THIN BY DESIGN, AND THE REASON IS EVIDENCE RATHER THAN TIDINESS. The five functions above were
 * CS3D-only until 26 Sep 2026, when Canada S-211 became the second non-exhaustive test and its withheld
 * rows were reaching the report with no heading and no reason at all. Generalising them risked changing
 * CS3D's output, which is the one thing that could not happen: those strings are pinned by test and read
 * by an external deal team. Keeping CS3D's entry points as wrappers that pass CS3D_LABELS means every
 * existing call site, test and snapshot goes through the same code path it did before, with the same
 * literals, so "unchanged" is structural rather than asserted.
 * A before-and-after snapshot across all six CS3D states was taken and compared; see the commit report.
 */
export const resolveCs3d = (frameworks: string[], applicability: FrameworkApplicability[]): Cs3dState =>
  resolveRegime(CS3D_LABELS, frameworks, applicability)

export const cs3dNoteWizard = (cs3d: Cs3dState): { heading: string; body: string } | null =>
  regimeNoteWizard(CS3D_LABELS, cs3d)

export const cs3dNoteReport = (cs3d: Cs3dState): Cs3dNote =>
  regimeNoteReport(CS3D_LABELS, cs3d)

export const cs3dToken = (row: FrameworkApplicability | undefined): RegimeToken | null =>
  regimeTokenFor(CS3D_LABELS, row)

/* ── Canada S-211's, the second consumer ─────────────────────────────────────────────────────────── */
export const resolveCanadaS211 = (frameworks: string[], applicability: FrameworkApplicability[]): Cs3dState =>
  resolveRegime(CANADA_S211_LABELS, frameworks, applicability)

export const canadaS211NoteWizard = (s: Cs3dState): { heading: string; body: string } | null =>
  regimeNoteWizard(CANADA_S211_LABELS, s)

export const canadaS211NoteReport = (s: Cs3dState): Cs3dNote =>
  regimeNoteReport(CANADA_S211_LABELS, s)

export const canadaS211Token = (row: FrameworkApplicability | undefined): RegimeToken | null =>
  regimeTokenFor(CANADA_S211_LABELS, row)

// ─── The report model ─────────────────────────────────────────────────────────
//
// EVERYTHING THE PRINTED REPORT SAYS, DERIVED ONCE. app/dashboard/deals/report/page.tsx renders it
// on screen and lib/deals/reportPdf.ts draws it into a PDF; neither computes a figure or composes a
// sentence of its own. Moved here from the report page on 29 Sep 2026, when the PDF became a second
// renderer: the same reason this module exists at all, one level up.
//
// PLAIN DATA ONLY. No functions, no Maps, no React: strings, numbers, booleans and arrays of them, so
// a renderer can walk it without importing the engine. Where the screen sets part of a sentence in
// bold, the sentence is a Rich (plain runs and { strong } runs, in order), which a renderer can set
// in any medium without re-splitting prose.
//
// STATIC COPY IS HERE TOO, not only the computed sentences. A heading or a table column written
// separately in each renderer is two copies of the report's wording, which is the drift this model
// exists to prevent.

/** The deal columns the report reads. The page's row type carries more; these are all it needs. */
export type DealReportDeal = {
  id: string
  target_name: string | null
  sector: string | null
  jurisdiction: string | null
  deal_type: string | null
  revenue: number | null
  currency: string | null
  deal_value: number | null
  location_count: number | null
  employee_count?: number | null
  total_assets?: number | null
  listed_ca_exchange?: boolean | null
  // NULL or absent = never asked (every deal saved before 29 Sep 2026).
  sales_markets?: string[] | null
  sales_markets_not_sure?: boolean | null
  env_claims?: string | null
  has_ghg_data: boolean | null
  has_esg_report: boolean | null
}

/** A sentence with bold runs: plain strings and { strong } runs, concatenated in order. */
export type Rich = (string | { strong: string })[]

/** An amber "we did not evaluate this" panel: a heading line and a body. */
export type ReportPanel = { title: string; body: Rich }

/** Chip keys. The renderer owns the colours; the model says which state applies. */
export type StatusChip = 'applies' | 'verify' | 'nearBelow' | 'market'
export type SeverityChip = SectorRisk['severity']

/**
 * What each chip SAYS. The colour is the renderer's; the words are the report's, so they live here
 * where the screen and the PDF both read them. The label always carries the meaning on its own:
 * a chip must survive a greyscale print.
 */
export const CHIP_LABELS: Record<StatusChip | SeverityChip, string> = {
  applies: 'APPLIES',
  verify: 'APPLIES: VERIFY',
  nearBelow: 'NEAR THRESHOLD: VERIFY',
  market: 'MARKET EXPECTATION',
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
}

export type DealReportModel = {
  reference: string
  reportDate: string
  cover: {
    eyebrow: string
    title: string
    intro: string
    rows: [string, string][]
    derivedNote: Rich
  }
  applicable: {
    title: string
    s211Panel: ReportPanel | null
    kind: 'not-evaluated' | 'none' | 'table'
    notEvaluatedPanel: ReportPanel
    noneSentence: string
    intro: string
    columns: [string, string]
    // `citation` names the instrument (a statute, or a directive); `basis` says why it applies to this
    // deal, for a row that applies on a stated rule rather than a size test. Either, both, or neither.
    // `guidance`: verbatim guidance behind a `verify` note, printed as its own cited paragraph after it.
    rows: { framework: string; citation: string | null; basis: string | null; near: string | null; verify: string | null; guidance: FrameworkGuidance | null; chip: StatusChip }[]
    partialPanel: ReportPanel | null
  }
  /** Expected by investors, lenders or customers; not required by law for this target. */
  market: {
    title: string
    intro: string
    rows: { framework: string; note: string | null; chip: 'market' }[]
  }
  nearThreshold: {
    title: string
    intro: Rich
    kind: 'not-assessed' | 'none' | 'table'
    notAssessedPanel: ReportPanel
    noneSentence: string
    columns: string[]
    rows: { framework: string; chip: StatusChip; testsMet: string; decidingFigure: string; valueApplied: string; threshold: string; side: string }[]
    belowNotes: { framework: string; sentence: string }[]
  }
  sizeTests: {
    title: string
    kind: 'none' | 'table'
    noneSentence: string
    intro: Rich
    columns: string[]
    rows: LimbRow[]
    panels: ReportPanel[]
    /** In place of the S-211 caveat on a deal whose sales markets were never recorded. */
    marketsNote: string | null
  }
  risks: {
    title: string
    kind: 'none' | 'table'
    noneSentence: string
    intro: string
    unresolvedPanel: ReportPanel | null
    /** Environmental claims liability, when the claims and markets answers raise it. */
    claims: {
      title: string
      chip: 'applies' | 'verify'
      severity: SeverityChip
      lines: ClaimsLine[]
      fallback: string | null
      notConfirmed: string | null
    } | null
    /** When there is no claims finding, the one line saying why (never silence). */
    claimsNote: string | null
    columns: [string, string, string]
    rows: { severity: SeverityChip; risk: string; detail: string; condition: string | null; cs3dLine: Rich | null; framework: string }[]
  }
  cost: {
    title: string
    intro: string
    consultant: { label: string; figure: string; note: string }
    themisIq: { label: string; figure: string; note: string }
    disclosure: Rich
    included: { columns: [string, string, string]; rows: { label: string; scopeNote: string | null; themisIq: string; consultant: string }[] }
    recommended: { columns: [string, string, string]; rows: { label: string; scopeNote: string | null; themisIq: string; consultant: string }[] }
    flagged: { columns: [string, string, string]; rows: { label: string; scopeNote: string | null; themisIq: string; consultant: string }[] }
    scopeNote: string
    exposure: Rich | null
  }
  dataRoom: {
    title: string
    columns: [string, string]
    rows: { item: string; status: string; available: boolean }[]
  }
  fx: {
    title: string
    paras: Rich[]
    rows: [string, string][]
    /** Mixed deals only: the frameworks compared in the deal's own currency, printed under the table. */
    sameCurrencyNote: string | null
  }
  notice: { title: string; paras: string[] }
  footer: { line: string; note: string }
}

/** The first letter upper-cased, for text cut from mid-sentence that now opens a paragraph. */
export const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const consultantBand = (low: number, high: number) => `USD ${Math.round(low / 1000)}k–${Math.round(high / 1000)}k`

/**
 * The whole report for one deal, as of `generatedAt`. Pure: the same deal and instant give the same
 * model, which is what lets the screen and the PDF be tested against each other.
 */
export function buildDealReportModel(deal: DealReportDeal, generatedAt: Date): DealReportModel {
  // Blank or whitespace-only is no sector, exactly like NULL (three production deals carry '').
  const sector = normalizeSector(deal.sector) ?? ''
  const jurisdiction = deal.jurisdiction ?? ''
  const currency = deal.currency ?? 'USD'
  const revenue = Number(deal.revenue) || 0
  const dealValue = Number(deal.deal_value) || 0
  const locationCount = Number(deal.location_count) || 0

  const reportDate = generatedAt.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
  // A reference for THIS DOCUMENT, not for the deal record. The deal id alone names a row that
  // outlives any one report: because this report is derived at generation, the same id names a
  // different document tomorrow. Pairing the id prefix with the generation date makes the reference
  // identify what the reader is holding. Eight characters matches the climate-risk and materiality
  // reports; the date comes from the same instant as the footer date and the PDF filename.
  const reference = `${String(deal.id).slice(0, 8)}-${filenameDate(generatedAt)}`

  // The same gate the wizard uses: revenue is NOT part of it. Only two frameworks consult
  // revenue; the rest resolve from jurisdiction and sector alone, and withholding them because
  // revenue is blank would render an undeclared field as "no frameworks apply".
  const evaluated = !!(sector && jurisdiction)
  const applicability: FrameworkApplicability[] = evaluated
    ? getFrameworkApplicability(jurisdiction, revenue, sector, deal.deal_type ?? 'ma', currency,
        { total_assets: deal.total_assets ?? null, employee_count: deal.employee_count ?? null,
          listed_ca_exchange: deal.listed_ca_exchange ?? null,
          sales_markets: deal.sales_markets ?? null, sales_markets_not_sure: deal.sales_markets_not_sure ?? null,
          env_claims: deal.env_claims ?? null })
    : []

  // The flat legal in/out. Derived from `applicability` rather than by a second engine call: a
  // test in assessment.test.ts pins these two as equal, so this cannot drift from the wizard.
  const frameworks = applicability.filter(f => f.applies).map(f => f.framework)

  const view = assessmentView(evaluated, applicability)
  const revenueDeclared = isRevenueDeclared(revenue)
  const nearThreshold = applicability.filter(f => f.status === 'near-threshold')
  const nearByFramework = new Map(nearThreshold.map(f => [f.framework, f]))
  const nearBelow = nearThreshold.filter(f => !f.applies)
  // The UNEVALUATED population, not the union: this note says "size test incomplete", which is false
  // of a routeNotMet row (its test completed). Its render gate, view.nearThreshold, already means
  // "a limb went unevaluated", so passing the union let the names and the claim describe different rows.
  const notAssessedNote = notAssessedNoteOf(
    view.unevaluated.length ? view.unevaluated : undefined,
    view.fieldsToResolve,
  )

  const limbRows = buildLimbRows(applicability)
  const fxBasisRows = buildFxBasisRows(currency, applicability)
  const fxNone = fxNoConversionSentence(currency, applicability)
  const fxSame = fxSameCurrencyNote(currency, applicability)
  // `cs3d` supplies the SENTENCE printed beneath a finding; the ROW supplies the token's text and
  // caveat flag. Both carry the same four outcomes since 11 Aug 2026, and they must not disagree.
  // DIFFERS FROM THE WIZARD ON ONE STATE, deliberately: this document has no `citedNear` line, so
  // 'near-threshold' gets its own note here rather than being deferred to one that does not exist.
  // Its `body` may be null, meaning heading only; cs3dLine below owns that punctuation.
  const cs3dNote = cs3dNoteReport(resolveCs3d(frameworks, applicability))
  // Sales markets and claims (29 Sep 2026). The caveat state is 'hide' outright where the old
  // jurisdiction rule already hid it (a Canadian target, or a listed Yes).
  const s211Caveat = showCanadaS211JurisdictionCaveat(deal.jurisdiction ?? '', deal.listed_ca_exchange)
    ? canadaCaveatForMarkets(deal) : 'hide'
  const claims = assessClaims(deal)
  // Canada S-211, the second non-exhaustive regime, through the same functions with its own labels.
  // Added 26 Sep 2026: without it a withheld S-211 row reached this document silently, which for a
  // report an external deal team reads is the worst place for an unexplained absence.
  const s211Note = canadaS211NoteReport(resolveCanadaS211(frameworks, applicability))
  const mapFramework = makeMapFramework(frameworks, applicability.find(f => f.framework === 'CS3D'))

  // Resolved against the deal's jurisdiction: a finding whose instrument is not established for
  // this target carries the nexus that would bring it into scope, rather than asserting it.
  // With the sales markets, so a ticked EU market settles an EU-market condition (see sectorRisks).
  const risks = sectorRisks(sector, jurisdiction, deal)
  const obligations = getObligations(locationCount, frameworks, sector, deal.employee_count ?? null)
  const complianceCost = dealValue > 0 ? getComplianceCost(dealValue, sector, frameworks) : null
  const activeTests = Object.values(THRESHOLD_TESTS).filter(isTestActive)
  // A statutory citation belongs with the framework it justifies, not in a footnote pile.
  const citationFor = (fw: string) => (isTestActive(THRESHOLD_TESTS[fw]) ? THRESHOLD_TESTS[fw].citation : null)

  const obligationColumns = (first: string): [string, string, string] => [first, 'ThemisIQ', 'Consultant (reference)']

  return {
    reference,
    reportDate,

    cover: {
      eyebrow: 'Prepared by ThemisIQ Compliance Inc.',
      title: 'ESG Deal Due Diligence Report',
      intro: `Sustainability-regulation screening of ${deal.target_name || 'the target company'} for deal, investment-committee and LP reporting: which disclosure regimes reach the target, which statutory size tests were applied, and what compliance is estimated to cost.`,
      rows: [
        ['Target company', deal.target_name || 'Not specified'],
        ['Sector', sector || 'Not specified'],
        ['Jurisdiction', jurisdiction || 'Not specified'],
        ['Deal type', dealTypeLabel(deal.deal_type ?? '')],
        // "USD 0" would assert a revenue figure we were never given. Say what is true instead.
        // The magnitude is spelled out so a 1000x entry error is legible in the document.
        ['Target annual revenue', revenueDeclared ? `${currency} ${revenue.toLocaleString()} (${spellMagnitude(revenue)})` : 'Not provided'],
        // Spelled out for the same reason as revenue: it is typically the larger figure and
        // carries the same 1000x entry risk, which is otherwise invisible in a bare numeral.
        ['Deal / investment value', dealValue > 0 ? `${currency} ${dealValue.toLocaleString()} (${spellMagnitude(dealValue)})` : 'Not provided'],
        ['Locations / sites', locationCount > 0 ? String(locationCount) : 'Not provided'],
        ['Report generated', reportDate],
      ],
      derivedNote: [
        { strong: 'This report is derived, not stored.' },
        ` Every finding below is computed at the moment of generation from the deal record as it stood on ${reportDate}. It is not a snapshot of a past assessment: if the deal record changes, a report generated afterwards will differ.`,
      ],
    },

    applicable: {
      title: 'Applicable frameworks',
      s211Panel: s211Note ? { title: s211Note.heading, body: s211Note.body ? [s211Note.body] : [] } : null,
      kind: !evaluated ? 'not-evaluated' : view.frameworks === 'assessed-none' ? 'none' : 'table',
      notEvaluatedPanel: {
        title: 'NOT ASSESSED',
        body: [
          'Sector and jurisdiction are not both set on this deal, so nothing has been evaluated. An empty list here is ',
          { strong: 'not' },
          ' a finding that no framework applies.',
        ],
      },
      noneSentence: 'None. No framework was triggered for this jurisdiction, sector and size.',
      intro: 'Determined from the target’s jurisdiction, sector and, where a statute imposes one, its statutory size test. A framework listed here applies on the figures provided.',
      columns: ['Framework', 'Status'],
      rows: frameworks.map(fw => {
        const near = nearByFramework.get(fw)
        // A ROW THAT APPLIES AND STILL NEEDS CHECKING. `verify` is set where the engine settled
        // applicability on one route while a condition it never asked about remains open: today,
        // Canada S-211 reached by a stock-exchange listing, where the reporting duty also turns on
        // goods. Same amber treatment a near-threshold row gets, because the reader's job is the same.
        const verify = applicability.find(f => f.framework === fw)?.verify ?? null
        const guidance = applicability.find(f => f.framework === fw)?.guidance ?? null
        return {
          framework: fw,
          // A size-tested row cites its statute; a rule-based row cites its instrument where one is
          // stated (EU ECGT: Directive (EU) 2024/825) and prints its basis (EU Taxonomy, via CSRD), so
          // no APPLIES row is printed without a reason.
          citation: citationFor(fw) ?? FRAMEWORK_CITATIONS[fw] ?? null,
          basis: applicability.find(f => f.framework === fw)?.rule ?? null,
          near: near ? nearSentence(near) : null,
          verify: verify || null,
          guidance,
          chip: near || verify ? 'verify' : 'applies',
        }
      }),
      // Partial assessment: the list stands, but naming what was withheld stops a reader inferring
      // that the missing statutes were considered and excluded. The title keeps the UNION; the body
      // explains WHY, which differs per population and cannot be said of both.
      partialPanel: view.notAssessed.length > 0
        ? {
            title: `PARTIAL: ${view.notAssessed.join(', ')} ${partialHeadingPhrase(view)}`,
            body: [
              ...(view.unevaluated.length > 0 ? [partiallyAssessedNote(view.unevaluated, view.fieldsToResolve)] : []),
              ...(view.routeNotMet.length > 0 ? [routeNotMetNote(view.routeNotMet)] : []),
            ],
          }
        : null,
    },

    // Investor and market expectations: after Applicable frameworks, never mixed into it. A market
    // row applies to nobody by law, so it prices nothing and cites nothing; it is listed so a reader
    // knows what investors, lenders and customers will ask for anyway.
    market: {
      title: 'Investor and market expectations',
      intro: 'Not legal requirements for this target on the information provided. Investors, lenders and customers increasingly expect them.',
      rows: applicability.filter(f => f.status === 'market').map(f => ({ framework: f.framework, note: f.note ?? null, chip: 'market' as const })),
    },

    nearThreshold: {
      title: 'Near-threshold frameworks',
      intro: [
        'Raised only where a ',
        { strong: 'borderline figure decides the outcome' },
        `: a figure within ${NEAR_PCT} of the trigger that, if it moved, would change whether the test is met. The legal answer is unchanged: a framework that applies still applies, and one that does not still does not.`,
      ],
      kind: view.nearThreshold === 'not-assessed' ? 'not-assessed' : view.nearThreshold === 'assessed-none' ? 'none' : 'table',
      notAssessedPanel: { title: 'NEAR-THRESHOLD: NOT ASSESSED', body: [notAssessedNote] },
      noneSentence: nearThresholdNoneNote(),
      columns: ['Framework', 'Tests met', 'Deciding figure', 'Value applied', 'Threshold', 'Side'],
      rows: nearThreshold.map(f => {
        const dec = f.test?.limbs.filter(l => l.near && l.state !== 'not-assessed') ?? []
        return {
          framework: f.framework,
          chip: f.applies ? 'verify' : 'nearBelow',
          testsMet: f.test ? `${f.test.metCount} of ${f.test.requires}` : NOT_PROVIDED,
          decidingFigure: dec.map(l => l.limb.measure.replace(/_/g, ' ')).join('; '),
          valueApplied: dec.map(limbValueDisplay).join('; '),
          threshold: dec.map(limbThresholdDisplay).join('; '),
          side: f.side === 'above' ? 'Above' : 'Below',
        }
      }),
      // Near-but-below never reaches the applicable list (it does not apply), so it is stated here
      // or the reader never learns the target sits just under a trigger.
      belowNotes: nearBelow.map(f => ({ framework: f.framework, sentence: nearSentence(f) })),
    },

    sizeTests: {
      title: 'Size tests applied',
      kind: limbRows.length === 0 ? 'none' : 'table',
      noneSentence: 'No size-gated framework is in scope for this jurisdiction.',
      intro: [
        'Every limb of every statutory size test that was run, with the measure it applied. A result without its measure asserts nothing a reviewer can check. Where the figure collected stands in for a differently-defined statutory measure it is marked ',
        { strong: 'PROXY' },
        '.',
      ],
      columns: ['Framework', 'Figure tested', 'Measure required', 'Value applied', 'Threshold', 'Result'],
      rows: limbRows,
      panels: [
        // A STANDING LIMITATION, in the same register as the two-year checks, and not a framework
        // row: that version was measured and withdrawn on 26 Sep 2026 because it landed on every
        // deal. Gated so it appears only where it is true and unresolved: not for a Canadian target,
        // whose size test DID run, and not for a listed Yes, which settles applicability and carries
        // its own VERIFY note. The heading is inside the constant, so its title is split from its body.
        // ⚠️ AND ONLY WHERE CANADA IS IN PLAY (29 Sep 2026): Canada among the target's markets, or its
        // markets not confirmed. On a deal whose markets were never recorded, marketsNote says so in
        // its place. See canadaCaveatForMarkets in ./markets.
        ...(s211Caveat === 'show'
          ? [{
              title: canadaS211CaveatText().heading.toUpperCase(),
              // The constant is one sentence with its heading before the colon, so the cut body
              // starts mid-sentence in lower case; it opens a panel here, so it is capitalised.
              // Market-aware since 29 Sep 2026: with Canada ticked, the body says so. See canadaS211CaveatText.
              body: [canadaS211CaveatText().body],
            }]
          : []),
        // ONLY THE TESTS THIS DEAL RAN (29 Sep 2026). This read every active test in THRESHOLD_TESTS, so
        // a UK deal, which runs SECR alone, was told the S-211 and CS3D two-year checks were not run for
        // it. A row carries `test` exactly when its size test was evaluated for this deal, and the
        // outcome records whether that test's lookback is modelled.
        ...applicability
          .filter(f => f.test && !f.test.lookbackModelled)
          .map(f => THRESHOLD_TESTS[f.framework])
          .map(t => ({
          title: `TWO-YEAR CHECK NOT RUN: ${t.framework}`,
          body: [
            `The statute measures over ${t.lookback === 'either-of-two-most-recent-fy' ? 'either of the two most recent financial years' : 'the most recent financial year'}; only the most recent year is held. A target that met a test in the prior year and has since dipped is `,
            { strong: 'under-called' },
            '. Such a target surfaces above as a borderline figure just below the trigger.',
          ],
        })),
      ],
      marketsNote: s211Caveat === 'quiet' ? MARKETS_UNRECORDED_LINE : null,
    },

    risks: {
      title: 'ESG risk findings',
      kind: risks.length === 0 ? 'none' : 'table',
      noneSentence: sector ? 'No sector-specific ESG risk template is held for this sector.' : 'No sector is set on this deal, so no sector risk findings were produced.',
      intro: `Sector-specific risks for ${sector}. The framework named on each finding resolves against the frameworks actually detected above, so a finding can never cite a statute this report withheld.`,
      // UNEVALUATED only. A routeNotMet framework was fully evaluated AND still appears in the
      // labels (its token is emitted, qualified), so both of this banner's claims would be false of
      // it. Silence on a routeNotMet-only deal is correct: nothing vanished from the Framework column.
      unresolvedPanel: view.unevaluated.length > 0
        ? {
            title: 'FRAMEWORK COLUMN PARTIALLY RESOLVED',
            body: [`The ${view.unevaluated.join(' / ')} size test could not be completed, so ${view.unevaluated.length === 1 ? 'it does' : 'they do'} not appear in any label below. ${resolveFieldsPrompt(view.fieldsToResolve, view.unevaluated)}`],
          }
        : null,
      // Environmental claims liability is a finding of its own, not a SECTOR_RISKS template row: it
      // turns on the target's markets and claims, not its sector, and it carries one line per market.
      claims: claims.kind === 'finding'
        ? { title: claims.title, chip: claims.status, severity: claims.severity, lines: claims.lines, fallback: claims.fallback, notConfirmed: claims.notConfirmed }
        : null,
      claimsNote: claims.kind === 'note' ? claims.text : null,
      columns: ['Severity', 'Risk', 'Framework'],
      rows: risks.map(r => {
        const tokens = mapFramework(r.framework)
        // Per-finding token check AND per-deal note: see the wizard's note on why both. The colon
        // and full stop belong to the BODY, not the heading: a heading-only line must not trail
        // punctuation introducing nothing.
        const cs3dLine: Rich | null = cs3dNote && tokens.some(t => t.framework === 'CS3D' && t.qualified)
          ? [{ strong: `${cs3dNote.heading}${cs3dNote.body ? ':' : ''}` }, cs3dNote.body ? ` ${cs3dNote.body}.` : '']
          : null
        return {
          severity: r.severity,
          risk: r.risk,
          detail: r.detail,
          condition: r.scope === 'conditional' ? r.condition : null,
          cs3dLine,
          framework: regimeLabel(tokens),
        }
      }),
    },

    cost: {
      title: 'Compliance cost estimate',
      // The analyst's question is what remediation costs and whether it moves the model: a
      // diligence finding. Leading with ThemisIQ's own price made a finding read as a quote, so the
      // market reference comes first and larger, and the ThemisIQ figure follows as one route.
      // NOTHING INCLUDED is its own wording, not a zero: no regime found to apply carries a priced
      // obligation, so there is no compliance cost to estimate, and "USD 0k–0k" beside "~USD 0" would
      // read as a finding that compliance is free rather than that nothing was found to require it.
      intro: obligations.included.length === 0
        ? `No regime found to apply to ${deal.target_name || 'the target'} carries a priced obligation, so there is no compliance cost to estimate. The modules below are recommended, not required.`
        : `An estimate of what it would cost to bring ${deal.target_name || 'the target'} into compliance with the regimes identified above, given as a market reference range with one priced alternative. Both figures are first-year, in USD, and neither is a quotation.`,
      consultant: {
        label: 'Traditional consultant, first year',
        figure: obligations.included.length === 0 ? 'No included obligation' : consultantBand(obligations.consultantLow, obligations.consultantHigh),
        note: obligations.included.length === 0
          ? 'Nothing found to apply needs a consultant workstream. Recommended modules show their consultant reference below.'
          : 'Indicative market range, scaled per obligation for this target’s sector and site count.',
      },
      themisIq: {
        label: 'ThemisIQ, scope-matched modules',
        // In a printed document "Enter locations →" would instruct a reader who has nothing to click.
        figure: themisIqFigure(obligations, 'Custom quote: headcount and location count not provided'),
        note: obligations.included.length === 0
          ? 'Recommended modules are priced individually below.'
          : 'One available route, priced for the modules this scope requires.',
      },
      // Inferable from the cover, but stating it where the price appears makes the report harder to
      // fault. The consultant figures are benchmarks, NOT citations: the source note on
      // CONSULTANT_RANGES says "Indicative benchmarks, not quotes", so this must not claim otherwise.
      disclosure: [
        { strong: 'Disclosure:' },
        ' ThemisIQ Compliance Inc. prepared this report and also supplies the software priced in the second figure. The consultant range is an indicative benchmark drawn from market analysis, not a quotation obtained from any firm.',
      ],
      included: {
        columns: obligationColumns('Included obligation'),
        rows: obligations.included.map(o => ({
          label: o.label,
          scopeNote: o.scopeNote || null,
          themisIq: obligationRowPrice(o, obligations),
          consultant: consultantBand(o.consultantLow, o.consultantHigh),
        })),
      },
      recommended: {
        columns: obligationColumns('Also recommended, not in the ThemisIQ total'),
        rows: obligations.recommended.map(o => ({
          label: o.label,
          scopeNote: o.scopeNote || null,
          themisIq: obligationRowPrice(o, obligations),
          consultant: consultantBand(o.consultantLow, o.consultantHigh),
        })),
      },
      flagged: {
        columns: obligationColumns('Flagged: separate specialist, in neither total'),
        rows: obligations.flagged.map(o => ({
          label: o.label,
          scopeNote: o.scopeNote || null,
          themisIq: obligationRowPrice(o, obligations),
          consultant: 'Not included',
        })),
      },
      // The cost table is driven by the APPLIES-filtered framework list, so a regime that abstains
      // prices nothing. Stated because the omission is otherwise invisible: the reader sees a total,
      // not the module that is missing from it.
      scopeNote: 'This estimate covers only the regimes established as applying above. Where a framework is shown as not assessed, no module is priced for it.',
      exposure: complianceCost
        ? [
            { strong: 'ESG value-at-risk exposure:' },
            ` approximately ${(complianceCost.pctLow * 100).toFixed(2)}%–${(complianceCost.pctHigh * 100).toFixed(2)}% of deal value (${compactMoneyRange(currency, complianceCost.low, complianceCost.high)}) carries ESG-related risk to assess. This is an indicative exposure, not a cost, and requires specialist confirmation.`,
          ]
        : null,
    },

    dataRoom: {
      title: 'Data-room gaps',
      columns: ['Item', 'Status'],
      rows: [
        { item: 'GHG inventory / emissions data', available: !!deal.has_ghg_data },
        { item: 'ESG report or sustainability disclosure', available: !!deal.has_esg_report },
        // Whenever the claims finding shows: the claims themselves and their evidence are what a
        // regulator in any of those markets would ask for first. No column records it, so it is
        // always a request.
        ...(claims.kind === 'finding' ? [{ item: CLAIMS_DATA_ROOM_ITEM, available: false }] : []),
      ].map(r => ({ ...r, status: r.available ? 'Available' : 'MISSING: request from target' })),
    },

    // Where no conversion ran, the section says that plainly. The two paragraphs describing how
    // figures are converted, and the rate-source rows, would each describe a step that did not happen.
    fx: {
      title: 'FX basis for threshold tests',
      paras: fxNone ? [[fxNone]] : [
        [
          'Revenue and balance-sheet figures are converted into each threshold’s statutory currency for comparison. ',
          { strong: 'The statutory figure itself is never converted' },
          ', so every citation above can be checked against the legislation verbatim.',
        ],
        [
          'Rates marked ',
          { strong: 'transcribed' },
          ' are copied verbatim from the source document and can be checked against it digit for digit. Rates marked ',
          { strong: 'DERIVED' },
          ' are computed by ThemisIQ from those figures and appear nowhere in the source.',
        ],
      ],
      rows: [
        ...(fxNone ? [] : [['Rate source', FX_SOURCE], ['Rates as of', FX_AS_OF]] as [string, string][]),
        ['Deal currency', currency],
        ...fxBasisRows.map(r => [r[0], r[1]] as [string, string]),
        ['Size tests available', activeTests.map(t => `${t.framework} (${t.requires} of ${t.limbs.length})`).join(' · ') || 'None'],
      ],
      sameCurrencyNote: fxSame,
    },

    notice: { title: 'Important Notice', paras: [...disclaimerParas('screening')] },

    footer: {
      line: `ThemisIQ Compliance Inc. · www.themisiq.co · Reference ${reference} · Generated ${reportDate}`,
      note: `This assessment reflects the figures held for this deal on ${reportDate}. It is derived at generation, not stored, so a report generated on another date may differ.`,
    },
  }
}
