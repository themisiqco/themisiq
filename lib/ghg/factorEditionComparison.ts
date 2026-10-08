// lib/ghg/factorEditionComparison.ts
//
// F-06 (T3c diff 4): which emission-factor editions changed between the compared years, and what the change alone
// does to this year's figures. Design: docs/review/design-derived-figures.md, T3c, "F-06"; finding F-06 in
// docs/review/ghg-findings.md; ISO 14064-3:2019 cl. 6.3.1.5 as cited in the ruling of 2 Oct 2026.
//
// THE PRIOR YEAR'S EDITIONS ARE THE ONES THAT PRICED IT. Its own calculation is rerun on its own locations, its own
// window, its frozen class (b) choices (factor_selection, diff 3) and the day it was last saved, and the editions that
// calculation selects are recorded. Never today's selection for that year: an inventory first prepared before a newer
// eGRID or ECCC edition was published was priced on the older one, and that is the edition it is compared on.
//
// THE EFFECT is this year's activity priced at the prior year's edition, minus the same activity at this year's
// edition, for one dataset at a time with every other factor unchanged, summed by scope. It isolates the part of the
// year-on-year change that comes from that dataset's factors alone. It is computed only from held editions: when
// the prior edition is not held, or does not price every line this year prices, the effect is null and the reason
// is stated. The change itself is still named.
//
// Only datasets BOTH years used are compared: a dataset only one year used is a change of what was reported (a
// site or fuel added or removed), which the structural lines already state, not a change of edition.
import {
  buildWorkings, calcInventory, selectionFor, unpricedLines,
  type CoverageResolution, type EditionUse, type Location, type SelectionContext, type StoredFactorSelection,
} from './engine'
import { DATASETS, type DatasetId } from './factorEditionRegistry'
import { frozenFor } from './factorSelection'
import { anyPublishedFactorApplied, FACTOR_EDITION_DISCLOSURE, type FactorEditions, type PricedRowProbe } from './factorEditions'
import { yearLabel } from './reportingYear'
import type { EditionEffectScope, FactorEditionChange, FactorEditionComparison } from './comparability'

/** The prior year as stored: what its comparison needs to rerun the calculation that priced it. */
export interface PriorYearPricing {
  /** Derived locations (deriveStoredLocations), as every reader of a stored inventory takes them. */
  locations: Location[]
  reporting_year: number
  fiscal_year_end_month: number | null
  coverage_resolutions: CoverageResolution[]
  factor_selection: StoredFactorSelection | null
  factor_editions: FactorEditions | null
  workings: unknown
  /** The prior year's last save (ISO), the day its editions were selected on. Null: not known, today is used. */
  updated_at: string | null
}

/** The year being reported, as the page or a test holds it. Locations derived. */
export interface CurrentYearPricing {
  locations: Location[]
  reporting_year: number
  fiscal_year_end_month: number | null
  coverage_resolutions: CoverageResolution[]
}

/**
 * The publisher in the words a customer reads. The registry's `publisher` is a short internal name in places ("NGA",
 * "MfE"); a sentence about a change of factors names the organisation.
 */
const PUBLISHER_WORDS: Record<string, string> = {
  DESNZ: 'UK DESNZ',
  'US EPA': 'US EPA',
  eGRID: 'US EPA eGRID',
  'Green-e': 'Green-e',
  NGA: 'Australian DCCEEW (NGA)',
  MfE: 'New Zealand Ministry for the Environment',
  ECCC: 'Environment and Climate Change Canada',
  AIB: 'AIB',
  EEA: 'European Environment Agency',
}

const SCOPES: readonly EditionEffectScope[] = ['scope1', 'scope2_location', 'scope2_market', 'scope3_cat3']
/** Below a microtonne the difference is floating-point noise, not an effect. */
const NOISE = 1e-9

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const UNRECORDED = (priorLabel: string, currentLabel: string) =>
  `Whether emission factors changed between ${priorLabel} and ${currentLabel} could not be checked: last year's ` +
  'inventory was saved before the factor editions that priced it were recorded.'

/** The editions a calculation selected, and the ones it needed and did not hold, by dataset. */
function editionsUsed(locations: Location[], year: number, fy: number | null, res: CoverageResolution[], ctx: SelectionContext) {
  const record = new Map<DatasetId, EditionUse>()
  const recordMissing = new Map<DatasetId, string>()
  buildWorkings(locations, 'AR6', year, res, fy ?? 12, { ...ctx, record, recordMissing })
  return { record, recordMissing }
}

function totalsBy(cur: CurrentYearPricing, ctx: SelectionContext) {
  const sel = selectionFor(cur.reporting_year, cur.fiscal_year_end_month ?? 12, ctx)
  const t = calcInventory(cur.locations, 'AR6', cur.reporting_year, sel)
  const unpriced = cur.locations.flatMap(l => unpricedLines(l, 'AR6', sel)).length
  return { s: { scope1: t.s1_total, scope2_location: t.s2_location, scope2_market: t.s2_market, scope3_cat3: t.s3_td } as Record<EditionEffectScope, number>, unpriced }
}

/**
 * The comparison for this year against the stored prior year. `currentCtx` is the context this year's figures are
 * priced with (the page's factorCtx), so the "current edition" is the one that priced the figures on screen.
 */
export function compareFactorEditions(cur: CurrentYearPricing, currentCtx: SelectionContext, prior: PriorYearPricing): FactorEditionComparison {
  const priorL = yearLabel(prior.reporting_year, prior.fiscal_year_end_month)
  const priorLabel = priorL.inText
  const currentLabel = yearLabel(cur.reporting_year, cur.fiscal_year_end_month).inText
  const base = { priorLabel, currentLabel, priorHeading: priorL.heading }

  // A prior year that priced from a published table and recorded no editions: the comparison cannot be made. One that
  // priced nothing from a published table has no factor basis to compare, and says nothing (factorEditionState's rule).
  const recorded = !!prior.factor_editions && Object.keys(prior.factor_editions).length > 0
  if (!recorded) {
    if (anyPublishedFactorApplied(prior.workings as PricedRowProbe[])) {
      return { ...base, unrecordedBecause: UNRECORDED(priorLabel, currentLabel), changes: [], disclosure: FACTOR_EDITION_DISCLOSURE.unknown!.detail, state: 'unknown' }
    }
    return { ...base, unrecordedBecause: null, changes: [], disclosure: null, state: 'consistent' }
  }

  // The prior year's own calculation: its window, its frozen choices, the day it was last saved.
  const priorPrepared = prior.updated_at ? new Date(prior.updated_at) : new Date()
  const priorSel = selectionFor(prior.reporting_year, prior.fiscal_year_end_month ?? 12, { preparedOn: priorPrepared })
  const priorCtx: SelectionContext = { preparedOn: priorPrepared, frozen: frozenFor(prior.factor_selection, priorSel) }
  const was = editionsUsed(prior.locations, prior.reporting_year, prior.fiscal_year_end_month, prior.coverage_resolutions, priorCtx)
  const now = editionsUsed(cur.locations, cur.reporting_year, cur.fiscal_year_end_month, cur.coverage_resolutions, currentCtx)
  const atCurrent = totalsBy(cur, currentCtx)

  const changes: FactorEditionChange[] = []
  for (const [ds, use] of now.record) {
    if (DATASETS[ds].class === 'exempt') continue
    const priorUse = was.record.get(ds)
    const priorMissing = was.recordMissing.get(ds)
    if (!priorUse && !priorMissing) continue
    const priorEdition = priorUse?.label ?? priorMissing!
    if (priorEdition === use.label) continue
    const meta = DATASETS[ds]
    const publisher = PUBLISHER_WORDS[meta.publisher] ?? meta.publisher
    const words = { dataset: ds, publisher, family: meta.family, priorEdition, currentEdition: use.label }
    const withheld = (because: string): FactorEditionChange =>
      ({ ...words, effect_tco2e: null, effectWithheldBecause: because, effect_basis: `${capitalise(because)}, so the effect of the change could not be calculated.` })
    if (!priorUse) { changes.push(withheld(`the ${priorEdition} factors are not loaded`)); continue }

    const atPrior = totalsBy(cur, { ...currentCtx, override: { ...currentCtx.override, [ds]: priorUse } })
    if (atPrior.unpriced > atCurrent.unpriced) {
      changes.push(withheld(`the ${priorEdition} factors do not price every line priced this year`))
      continue
    }
    const effect: Partial<Record<EditionEffectScope, number>> = {}
    for (const k of SCOPES) { const d = atPrior.s[k] - atCurrent.s[k]; if (Math.abs(d) > NOISE) effect[k] = d }
    changes.push({ ...words, effect_tco2e: effect, effectWithheldBecause: null,
      effect_basis: `This year's activity priced at the ${priorEdition} factors, minus the same activity at the ${use.label} factors, with every other factor unchanged.` })
  }
  return { ...base, unrecordedBecause: null, changes, disclosure: changes.length > 0 ? FACTOR_EDITION_DISCLOSURE.changed!.detail : null,
    state: changes.length > 0 ? 'changed' : 'consistent' }
}
