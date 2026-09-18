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
// PCAF score 4 estimates an investee from `revenue × a sector factor`, and lib/pcaf will do it for any
// sector string. The page used to offer revenue and a sector on each holding and then HIDE the resulting
// figure when the sector was not in the spend table — which is every sector it offered. The hiding was
// display-only: assessPortfolio still estimated the row at the 0.12 fallback and the portfolio total still
// contained it, so the panel's total disagreed with the row above it by a number the row refused to show.
// A holding of $100m revenue in EXIOBASE i66 contributed 1,200 tCO2e that way.
//
// So `assessableEmissions` DROPS revenue and sector before anything is assessed. A holding that carries
// only those is INCOMPLETE — which is true, and says so — rather than silently estimated. This also
// covers rows already saved with revenue on them.

import { assessAsset, assessPortfolio } from '../pcaf/engine'
import type { PcafPortfolioAsset, PortfolioResult, EmissionInputs } from '../pcaf/types'

export interface Cat15Data {
  emissions_override?: number
  pcafAssets?: PcafPortfolioAsset[]
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

/** The sentence a customer reads where the withdrawn proxy used to put a number. */
export const CAT15_NO_BASIS =
  'A portfolio value cannot be turned into financed emissions on its own: it is a balance at a date, and a ' +
  'spend factor is an intensity per year of activity, so multiplying them prices a year of purchasing that ' +
  'nobody made. No emission factor fixes that, so nothing is estimated rather than a figure that looks ' +
  'sourced. Itemise the holdings — PCAF attributes each investee\'s own emissions by your share of it — or ' +
  'enter a figure you already hold.'

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

/** The holdings as they will be ASSESSED, which is not always as they were stored. */
export function assessableAssets(d: Cat15Data | undefined): PcafPortfolioAsset[] {
  return (d?.pcafAssets ?? []).map(a => ({ ...a, emissions: assessableEmissions(a.emissions) }))
}

/** Whether one holding computes, asked of the library rather than re-derived: assessAsset throws by
 *  contract on a denominator of 0, a negative amount or emissions inputs it cannot use. */
export function holdingComputes(asset: PcafPortfolioAsset): boolean {
  try {
    assessAsset({ ...asset, emissions: assessableEmissions(asset.emissions) })
    return true
  } catch {
    return false
  }
}

const listHoldings = (ns: number[]): string =>
  ns.length === 1 ? `Holding ${ns[0]}` : `Holdings ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`

/**
 * Category 15's figure, and where there is none, why.
 *
 * ⚠️ AN ENTERED FIGURE WINS, INCLUDING ZERO. `Number.isFinite`, not truthiness: a customer with no
 * portfolio must be able to say so, and 0 is an answer while blank is not. lib/pcaf/estimate.ts made the
 * same correction, and its test now asserts the corrected behaviour.
 *
 * ⚠️ AND NO PARTIAL PORTFOLIO. One holding that cannot compute means no figure at all, with the holding
 * named — not a total of the rows that happened to work. resolvePcafResult would quietly substitute the
 * lumped proxy for the whole portfolio in that case, which is how a decomposed assessment became a 0.12
 * lump without anything on screen changing but one small line.
 */
export function cat15Figure(d: Cat15Data | undefined): Cat15Figure {
  const none = (reason: string, incomplete: number[] = []): Cat15Figure =>
    ({ mt: null, dqScore: null, basis: null, assessment: null, incomplete, reason })

  const override = d?.emissions_override
  if (Number.isFinite(override)) {
    if ((override as number) < 0) {
      return none('A negative figure for financed emissions cannot be used. Enter 0 if this portfolio finances no emissions.')
    }
    // PCAF scores a figure reported to you but not independently assured at 2.
    return { mt: override as number, dqScore: 2, basis: 'override', assessment: null, incomplete: [], reason: '' }
  }

  const assets = assessableAssets(d)
  if (assets.length === 0) return none(CAT15_NO_BASIS)

  const incomplete = assets.map((a, i) => (holdingComputes(a) ? 0 : i + 1)).filter(n => n > 0)
  if (incomplete.length > 0) {
    return none(
      `${listHoldings(incomplete)} ${incomplete.length === 1 ? 'cannot' : 'cannot'} be computed yet, so no figure ` +
      `is shown rather than a total of the rest. Each holding needs an outstanding amount, the value the ` +
      `attribution divides by, and the investee's reported emissions.`,
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
