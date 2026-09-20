// ── WHAT PRODUCES A CATEGORY 15 FIGURE, AND WHAT DOES NOT ───────────────────────────────────────
//
// One pure function over the stored category data. It exists for the reason lib/scope3/spendSector.ts
// exists: the rule it enforces was a closure in app/dashboard/scope3/page.tsx, and a rule that lives in a
// closure is a rule a comment has to defend.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE LUMPED SPEND PROXY IS WITHDRAWN, AND NO FACTOR WOULD HAVE FIXED IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Until 17 Sep 2026 Cat 15 was estimated as `portfolio value × a sector spend factor`. That multiplies a
// BALANCE AT A DATE by an INTENSITY PER YEAR OF ACTIVITY: a $10m loan book is not $10m of annual
// purchasing, and the product of the two is a year of buying nobody did. The defect is in the equation,
// not in the factor — pricing it from EXIOBASE through the spend-factor route was designed and then
// abandoned precisely because a better-sourced factor on a wrong equation is worse than a crude one. It
// stops looking wrong: the figure would have arrived with a region, an edition id and eight disclosure
// sentences.
//
// PCAF's own method has no such mismatch, because its ratio is dimensionless — outstanding amount over the
// asset's total value, a stock over a stock — applied to the investee's own annual emissions, a flow. That
// method is implemented and tested in lib/pcaf/attribution.ts. It is the answer, and it is already built.
//
// ⚠️ NO SAVED TOTAL CHANGES BECAUSE OF THIS. `sectorPriced` — the check that decided whether Cat 15
// counted — tests EMISSION_FACTORS.spend, a thirteen-entry table keyed on a retired vocabulary, while the
// portfolio-sector select emits EXIOBASE industry codes. The overlap is ZERO, so every proxy figure was
// already excluded from every saved total. Withdrawing the proxy makes the code say what the product
// already does; it does not restate a number anyone has reported.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE REVENUE TIER IS CLOSED HERE, IN THE CALCULATION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// PCAF score 4 estimates an investee from `revenue × a sector factor`, and lib/pcaf did it for any sector
// string until that path was removed on 19 Sep 2026 (lib/pcaf/estimate.ts). The page used to offer revenue and a sector on each holding and then HIDE the resulting
// figure when the sector was not in the spend table — which is every sector it offered. The hiding was
// display-only: assessPortfolio still estimated the row at the 0.12 fallback and the portfolio total still
// contained it, so the panel's total disagreed with the row above it by a number the row refused to show.
// A holding of $100m revenue in EXIOBASE i66 contributed 1,200 tCO2e that way.
//
// So `assessableEmissions` DROPS revenue and sector before anything is assessed. A holding that carries
// only those is INCOMPLETE — which is true, and says so — rather than silently estimated. This also
// covers rows already saved with revenue on them. It stays after the library's tier 4 was removed: it is
// the explicit list of what may price an investee, and it keeps a saved row's fields out of the library.

import { assessAsset, assessPortfolio } from '../pcaf/engine'
import type { PcafPortfolioAsset, PortfolioResult, EmissionInputs, AssetAssessment } from '../pcaf/types'
import { notEnteredReason } from './notEntered'

/**
 * One holding AS STORED. The only difference from the library's PcafPortfolioAsset is that the outstanding
 * amount may be absent.
 *
 * ⚠️ A BLANK OUTSTANDING AMOUNT IS MISSING, NOT ZERO, SINCE 19 SEP 2026. The input wrote Number('') = 0 for a
 * cleared field and the library accepted 0, so a holding the customer never finished computed to zero
 * financed emissions and the category figure went out without it. The input now writes undefined for an
 * empty field, as the investee-emissions input already did, and such a holding withholds the figure and
 * names the field. An entered 0 is still an answer (a closed position). Holdings saved before this hold 0
 * for "blank" and cannot be told apart from a real 0, so they read as 0, as they always have.
 */
export type StoredHolding = Omit<PcafPortfolioAsset, 'outstandingAmount'> & { outstandingAmount?: number }

export interface Cat15Data {
  emissions_override?: number
  pcafAssets?: StoredHolding[]
  /** Read only to report it as recorded-and-unused; see the proxy note above. */
  portfolio_value?: number
  portfolio_sector?: string
}

export interface Cat15Figure {
  /** tCO2e, or null for no figure. ⚠️ NEVER 0 STANDING IN FOR NULL: an entered zero is a real answer. */
  mt: number | null
  /** The portfolio's emissions-weighted PCAF data-quality score, fractional. null without a figure. */
  dqScore: number | null
  basis: 'override' | 'decomposed' | null
  /** The full PCAF result for the panel and the export. null unless a decomposed assessment computed. */
  assessment: PortfolioResult | null
  /** 1-based holding numbers that cannot compute, numbered as the panel numbers them. */
  incomplete: number[]
  /** Why there is no figure, as a sentence. '' when there is one. */
  reason: string
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE CATEGORY 15 SENTENCES, ONCE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Every customer surface that says who supplied the investee figure, why a portfolio value times a spend
// factor does not measure emissions, what withholds the figure, or what a known total does, builds that
// sentence from here. Until 18 Sep 2026 the same four claims were written out on seven surfaces in three
// phrasings each ("own reported" / "as entered by the customer"; "does not measure emissions" / "prices a
// year of purchasing nobody made" / "not a quantity"), and correcting one left the rest stale.
//
// ⚠️ NO NEW WORDING. Each sentence below is already approved and live: the methodology page's Category 15
// passage (the LONG forms) or scope3MethodDescription('pcaf') (the SHORT forms). They were written for
// different places — a paragraph on a public page, and a hierarchy line that is also a CSV cell — and both
// are kept verbatim, so they render byte-identical to what was live when this module took them over.
//
// ⚠️ APOSTROPHES DIFFER BETWEEN THE TWO, AND THAT IS INHERITED, NOT CHOSEN. The long passage uses the
// typographic ’ (the methodology page writes \u2019); the short description uses a straight '. Sharing a
// sentence across the two would have changed one of them visibly, so the only text they share literally is
// the apostrophe-free CAT15_FIGURE_SOURCE. Unifying the apostrophes is a deliberate visible change for
// another day.
//
// cat15Copy.test.ts bans the superseded phrasings everywhere and checks each surface reads from here.

/** Who supplied the investee's emissions: the customer typed them in. The code cannot tell an investee's
 *  published figure from the customer's own estimate, so no surface may call it "reported". */
export const CAT15_FIGURE_SOURCE = 'emissions as entered by the customer'

/** One holding's figure, as the short description states it. Starts lower-case: it follows "Otherwise". */
export const CAT15_HOLDING_FIGURE =
  `each holding's figure is the investee's ${CAT15_FIGURE_SOURCE}, multiplied by the outstanding amount ` +
  `over the value its PCAF asset class attributes on, capped at 100%`

/**
 * What GWP basis the investee figures are on: each investee's own, and ThemisIQ neither re-bases nor records
 * it. ONE SENTENCE, said once wherever it appears: its own sentence after the formula in the methodology
 * passage and the method description, the whole of the CSV GWP row and the panel line (gwpAsReported), and,
 * from CAT15_GWP_TAIL, the assistant prompt's Cat 15 clause in the same words.
 *
 * ⚠️ WHY "NOT RECORDED" AND NOT A BASIS. Until 18 Sep 2026 lib/pcaf stamped 'AR6' on every holding and the
 * CSV said the figures were "on the AR6 basis the investee figures are reported on". Nothing ever asked the
 * customer which basis an investee used. And an investee's CO2e total cannot be converted between AR5 and
 * AR6 without its split by gas, which the holding form does not collect, so recording the basis would change
 * what can be disclosed, never the figure. Apostrophe-free, so the passage (’) and the description (') can
 * carry it byte for byte.
 */
export const CAT15_GWP_TAIL =
  'on whatever GWP basis each investee reported, not re-based, and ThemisIQ does not record which basis that was'
export const CAT15_GWP_SENTENCE = `Investee emissions are used ${CAT15_GWP_TAIL}.`

export const CAT15_SENTENCES = {
  /** What withholds the figure. SHORT: the hierarchy line and CSV cell. */
  withholdsShort: 'A holding missing its emissions, outstanding amount or attribution value withholds the category figure.',
  /** LONG: the methodology passage, where the status the category is then reported with is named. */
  withholdsLong:
    'If any holding is missing its emissions, outstanding amount or attribution value, the category produces ' +
    'no figure and is reported as not yet calculated.',
  /** What a known total does. SHORT. */
  knownTotalShort: 'A known total, where entered, replaces the holding-level figures.',
  /** LONG: adds the PCAF score it carries, which the passage's data-quality sentence sets up. */
  knownTotalLong: 'A known total may be entered instead; it is scored 2 and replaces the holding-level figures entirely.',
  /** Why a portfolio value times a spend factor is not used. SHORT: the claim and the consequence. */
  noPortfolioProxyShort:
    'A portfolio value multiplied by a spend factor does not measure emissions, so ThemisIQ does not ' +
    'estimate this category that way.',
  /** LONG: the reason as well — a stock at a date against a flow per year. Used where the sentence has to
   *  stand alone as the explanation (the passage, and the reason shown when there is no figure). */
  noPortfolioProxyLong:
    'ThemisIQ does not estimate this category from a portfolio\u2019s total value multiplied by a sector spend ' +
    'factor: a balance is a position at a date and a spend factor is an intensity per year of activity, so ' +
    'their product does not measure emissions.',
  /** The GWP disclosure: CAT15_GWP_SENTENCE itself, so the CSV row and the panel line say it once. */
  gwpAsReported: CAT15_GWP_SENTENCE,
} as const

/**
 * The Cat 15 GWP sentence, checked against the bound GHG inventory's basis the way wasteGwpSentence is for
 * Cat 5 and Cat 12.
 *
 * ⚠️ NO "MATCH" BRANCH, AND THAT IS THE POINT. The waste sentence can say the inventory and the factors share
 * a basis because the factor record states one (AR5). The investee basis is never recorded, so whatever the
 * inventory records, whether the two agree is not known, and this never says otherwise.
 */
export function cat15GwpSentence(bound: boolean, ghgGwpVersion: string | null): string {
  const base = CAT15_SENTENCES.gwpAsReported
  if (!bound) return base
  return ghgGwpVersion
    ? `${base} The linked GHG inventory records ${ghgGwpVersion}. Whether the investee figures share that basis is not known.`
    : `${base} The linked GHG inventory records no GWP basis either.`
}

/** scope3MethodDescription('pcaf'): the Category 15 line of the methodology hierarchy, and the Method cell
 *  of the CSV's per-category table. */
export function cat15MethodDescription(): string {
  const s = CAT15_SENTENCES
  // The GWP sentence follows the formula sentence it qualifies, as its own sentence; the formula is unchanged.
  return `PCAF-aligned financed emissions. ${s.knownTotalShort} Otherwise ${CAT15_HOLDING_FIGURE}. ` +
    `${CAT15_GWP_SENTENCE} ${s.withholdsShort} ${s.noPortfolioProxyShort}`
}

/** The methodology page's Category 15 passage. The page renders this; it is not typed there any more. */
export function cat15MethodologyPassage(): string {
  const s = CAT15_SENTENCES
  return 'Category 15 financed emissions are calculated with a PCAF-aligned method (Partnership for Carbon ' +
    'Accounting Financials) for six asset classes: listed equity and corporate bonds, business loans and ' +
    'unlisted equity, project finance, commercial real estate, mortgages, and motor vehicle loans. Sovereign ' +
    `debt is not supported. For each holding, the investee\u2019s ${CAT15_FIGURE_SOURCE} are multiplied by the ` +
    'outstanding amount over the value PCAF attributes on for that asset class: enterprise value including ' +
    // The GWP sentence after the formula and its cap, before the data-quality sentence: the formula and the
    // 100% cap describe one calculation and stay together.
    `cash, total equity plus debt, or property or vehicle value at origination. Attribution is capped at 100%. ${CAT15_GWP_SENTENCE} ` +
    'Each holding is scored on PCAF\u2019s data-quality scale, 1 where the customer marks the investee\u2019s ' +
    'figure as verified and 2 otherwise, and the portfolio score is weighted by emissions. ' +
    `${s.withholdsLong} ${s.knownTotalLong} ${s.noPortfolioProxyLong} ` +
    'ThemisIQ is not a PCAF signatory and is not accredited by PCAF.'
}

/** The Calculate step's info box for Category 15 (CATEGORIES.cat15.guidance). */
export const CAT15_GUIDANCE =
  'Emissions associated with your investments and lending (financed emissions), for investors, banks and ' +
  `asset owners. ThemisIQ assesses this holding by holding on PCAF\u2019s method: each investee\u2019s ` +
  `${CAT15_FIGURE_SOURCE}, multiplied by your share of that investee. ` +
  `${CAT15_SENTENCES.noPortfolioProxyShort} ThemisIQ is not PCAF-certified or a PCAF signatory.`

/** The Category 15 panel's opening box: the method in one line, then why a portfolio value is not used. */
// ⚠️ NO "ONLY WAY THIS FIGURE CAN BE CHECKED". It said so until 19 Sep 2026; a known total from an audited
// source can be checked too, and the panel offers one directly above the holdings.
export const CAT15_PANEL_METHOD =
  `Financed emissions are worked out holding by holding: ${CAT15_HOLDING_FIGURE}. That is PCAF's method.`
export const CAT15_PANEL_NO_PROXY = CAT15_SENTENCES.noPortfolioProxyShort

/**
 * Above the holdings while a known total is entered: they are not in the figure. Opens with the shared
 * known-total sentence, so the panel says what the method description and the export say.
 * ⚠️ UNTIL 19 SEP 2026 THE PANEL SAID NOTHING. Each holding kept its own "Financed: X tCO2e" line under an
 * entered total that had replaced them, and a figure shown beside a total reads as part of it.
 */
export const CAT15_HOLDINGS_SUPERSEDED =
  `${CAT15_SENTENCES.knownTotalShort} While it is entered, the holdings below are not in the Category 15 ` +
  'figure. Clear the known total to use them.'
/** Appended to each holding's figure while a known total is entered. */
export const CAT15_HOLDING_NOT_USED = 'not used: the known total above replaces it'

/** The CSV note on a record that still carries a portfolio value or sector from before 17 Sep 2026. */
export const CAT15_RECORDED_NOT_USED = `Recorded, and NOT used to produce any figure. ${CAT15_SENTENCES.noPortfolioProxyShort}`

/** The CSV methodology note and factor_basis for a decomposed assessment. */
export function cat15DecomposedBasisDetail(holdings: number, weightedDq: number): string {
  const first = CAT15_HOLDING_FIGURE.charAt(0).toUpperCase() + CAT15_HOLDING_FIGURE.slice(1)
  return `Assessed asset by asset across ${holdings} ${holdings === 1 ? 'holding' : 'holdings'}, with an ` +
    `emissions-weighted PCAF data quality score of ${weightedDq.toFixed(1)} of 5. ${first}.`
}

/**
 * Whether a record still carries a portfolio value or sector, which nothing has used since 17 Sep 2026. The
 * CSV's recorded-and-not-used row and the choice of reason below ask the same question, so they cannot
 * disagree about what is "on the record".
 */
export const cat15HasPortfolioFields = (d: Cat15Data | undefined): boolean => !!(d?.portfolio_value || d?.portfolio_sector)

/**
 * The reason when a relevant Category 15 has nothing entered: no holdings, no known total, and no portfolio
 * value or sector on the record. The same form Categories 1, 2 and 4 use (notEntered.ts), naming what is
 * missing rather than explaining a method the customer never tried.
 */
export const CAT15_NOT_ENTERED = notEnteredReason(['the holdings to assess, or a known total of financed emissions'])

/** The sentence a customer reads where the withdrawn proxy used to put a number: the amber box, the CSV's
 *  "Excluded from total" line and its Category 15 "Not calculated" row. The long form, because here the
 *  sentence stands alone as the reason there is no figure.
 *  ⚠️ ONLY WHEN A PORTFOLIO VALUE OR SECTOR IS ON THE RECORD (cat15HasPortfolioFields). Until 19 Sep 2026 it
 *  was the reason for every empty Category 15, which explained a method to a customer who had entered
 *  nothing at all. */
export const CAT15_NO_BASIS =
  `${CAT15_SENTENCES.noPortfolioProxyLong} Itemise the holdings, or enter a figure you already hold.`

/** A decomposed assessment that threw after every row computed on its own: a platform failure, not a gap
 *  in what the customer supplied, and the only Cat 15 state that belongs in scope3_categories_unpriced. */
export const CAT15_ASSESSMENT_FAILED =
  'The holdings could not be assessed together, although each one computes on its own. Nothing is ' +
  'estimated. This is a fault on our side, not missing data.'

/**
 * ⚠️ WHAT MAY BE USED TO ESTIMATE AN INVESTEE. Reported emissions (PCAF 1–2) and physical activity (3).
 * Revenue and sector are dropped — see the header. Written as an explicit pick rather than a delete so a
 * field added to EmissionInputs has to be considered here before it can price anything.
 */
export function assessableEmissions(e: EmissionInputs | undefined): EmissionInputs {
  return {
    reportedEmissions: e?.reportedEmissions,
    verified: e?.verified,
    physicalActivity: e?.physicalActivity,
    physicalEmissionFactor: e?.physicalEmissionFactor,
  }
}

/** One holding as it will be ASSESSED, which is not always as it was stored: revenue and sector dropped. */
function assessable(h: StoredHolding): PcafPortfolioAsset {
  // The cast is sound because the library checks it: attributionFactor throws on a non-finite amount.
  return { ...h, outstandingAmount: h.outstandingAmount as number, emissions: assessableEmissions(h.emissions) }
}

/** The holdings as they will be ASSESSED. */
export function assessableAssets(d: Cat15Data | undefined): PcafPortfolioAsset[] {
  return (d?.pcafAssets ?? []).map(assessable)
}

/**
 * One holding's assessment, or null when it cannot compute: asked of the library rather than re-derived.
 * assessAsset throws by contract on a missing or negative amount, a denominator of 0 or emissions inputs it
 * cannot use. The panel's per-holding line reads THIS, so a row that shows a figure is a row the total uses.
 */
export function assessHolding(h: StoredHolding): AssetAssessment | null {
  try {
    return assessAsset(assessable(h))
  } catch {
    return null
  }
}

export const holdingComputes = (h: StoredHolding): boolean => assessHolding(h) !== null

/** The three things a holding needs, named as the withholding sentences name them. */
export const CAT15_HOLDING_FIELDS = {
  emissions: "the investee's emissions",
  outstanding: 'the outstanding amount',
  attribution: 'the attribution value',
} as const

/**
 * What a holding that cannot compute has no value for, for the panel's per-holding line. Each test mirrors
 * the library's own check (estimateInvesteeEmissions for the emissions, attributionFactor for the two
 * amounts); cat15.test.ts asserts over a grid that holdingMissing and holdingUnusable are empty together
 * exactly when holdingComputes is true, so the line cannot name a field the calculation does not need, or
 * miss one it does.
 */
export function holdingMissing(h: StoredHolding): string[] {
  const out: string[] = []
  const e = assessableEmissions(h.emissions)
  const anyEmissions = Number.isFinite(e.reportedEmissions) ||
    (Number.isFinite(e.physicalActivity) && Number.isFinite(e.physicalEmissionFactor))
  if (!anyEmissions) out.push(CAT15_HOLDING_FIELDS.emissions)
  if (!Number.isFinite(h.outstandingAmount)) out.push(CAT15_HOLDING_FIELDS.outstanding)
  // A denominator of 0 is the blank field: the input still writes Number('') = 0 for it.
  if (!(Number.isFinite(h.denominator) && h.denominator !== 0)) out.push(CAT15_HOLDING_FIELDS.attribution)
  return out
}

/**
 * What a holding HAS but the calculation cannot use, as a clause naming the field.
 * ⚠️ A NEGATIVE IS NOT A BLANK, AND SAYING "IT NEEDS" OF ONE IS WRONG: the field is filled in, and the
 * customer would read a request for something already on screen. Each clause names the field and what is
 * wrong with it, as the negative known-total message does ("A negative figure ... cannot be used").
 */
export function holdingUnusable(h: StoredHolding): string[] {
  const out: string[] = []
  const e = assessableEmissions(h.emissions)
  const negative = Number.isFinite(e.reportedEmissions)
    ? (e.reportedEmissions as number) < 0
    : (e.physicalActivity as number) < 0 || (e.physicalEmissionFactor as number) < 0
  if (negative) out.push(`${CAT15_HOLDING_FIELDS.emissions} cannot be negative`)
  if (Number.isFinite(h.outstandingAmount) && (h.outstandingAmount as number) < 0) {
    out.push(`${CAT15_HOLDING_FIELDS.outstanding} cannot be negative`)
  }
  if (Number.isFinite(h.denominator) && h.denominator < 0) out.push(`${CAT15_HOLDING_FIELDS.attribution} cannot be negative`)
  return out
}

const listFields = (fs: string[]): string =>
  fs.length === 1 ? fs[0] : `${fs.slice(0, -1).join(', ')} and ${fs[fs.length - 1]}`

/** The panel's line under a holding that cannot compute: what it lacks, what it cannot use, or both. */
export function cat15HoldingIncomplete(h: StoredHolding): string {
  const missing = holdingMissing(h)
  const unusable = holdingUnusable(h)
  if (unusable.length === 0) return `Complete this holding to compute: it needs ${listFields(missing)}.`
  const cannot = `This holding cannot be computed: ${listFields(unusable)}.`
  return missing.length === 0 ? cannot : `${cannot} It also needs ${listFields(missing)}.`
}

/** Whether a known total is entered. The figure and the panel's superseded note ask this one question. */
export const cat15OverrideEntered = (d: Cat15Data | undefined): boolean => Number.isFinite(d?.emissions_override)

const listHoldings = (ns: number[]): string =>
  ns.length === 1 ? `Holding ${ns[0]}` : `Holdings ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`

/**
 * Category 15's figure, and where there is none, why.
 *
 * ⚠️ AN ENTERED FIGURE WINS, INCLUDING ZERO. `Number.isFinite`, not truthiness: a customer with no
 * portfolio must be able to say so, and 0 is an answer while blank is not.
 *
 * ⚠️ AND NO PARTIAL PORTFOLIO. One holding that cannot compute means no figure at all, with the holding
 * named — not a total of the rows that happened to work. resolvePcafResult (removed from lib/pcaf on
 * 19 Sep 2026) quietly substituted the lumped proxy for the whole portfolio in that case, which is how a decomposed assessment became a 0.12
 * lump without anything on screen changing but one small line.
 */
export function cat15Figure(d: Cat15Data | undefined): Cat15Figure {
  const none = (reason: string, incomplete: number[] = []): Cat15Figure =>
    ({ mt: null, dqScore: null, basis: null, assessment: null, incomplete, reason })

  const override = d?.emissions_override
  if (cat15OverrideEntered(d)) {
    if ((override as number) < 0) {
      return none('A negative figure for financed emissions cannot be used. Enter 0 if this portfolio finances no emissions.')
    }
    // PCAF scores a figure reported to you but not independently assured at 2.
    return { mt: override as number, dqScore: 2, basis: 'override', assessment: null, incomplete: [], reason: '' }
  }

  const assets = assessableAssets(d)
  if (assets.length === 0) return none(cat15HasPortfolioFields(d) ? CAT15_NO_BASIS : CAT15_NOT_ENTERED)

  const incomplete = (d?.pcafAssets ?? []).map((a, i) => (holdingComputes(a) ? 0 : i + 1)).filter(n => n > 0)
  if (incomplete.length > 0) {
    return none(
      // ⚠️ THE SHARED WITHHOLDING SENTENCE, NOT A LOCAL ONE. This ended "Each holding needs an outstanding
      // amount, the value the attribution divides by, and the investee's reported emissions": the investee
      // figure is whatever the customer entered, not a report. (From 18 to 19 Sep 2026 the shared sentence
      // said a blank outstanding amount was read as zero, which was then true; it now withholds.)
      `${listHoldings(incomplete)} cannot be computed yet, so no figure is shown rather than a total of the ` +
      `rest. ${CAT15_SENTENCES.withholdsShort}`,
      incomplete,
    )
  }

  try {
    const assessment = assessPortfolio(assets)
    return {
      mt: assessment.totalFinancedEmissions,
      dqScore: assessment.weightedDataQualityScore,
      basis: 'decomposed',
      assessment,
      incomplete: [],
      reason: '',
    }
  } catch {
    return none(CAT15_ASSESSMENT_FAILED)
  }
}
