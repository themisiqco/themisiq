// ── CATEGORY 12: END-OF-LIFE TREATMENT OF SOLD PRODUCTS, PER MATERIAL ─────────────────────────────
//
// The customer enters, per material, the tonnes of sold products and packaging that reach end of life,
// and a percentage split of that mass across the treatment routes the DEFRA/DESNZ sheet publishes for the
// material. Tonnes per route are DERIVED from the two, then priced exactly as Category 5 prices a waste
// row: through evaluateWasteRows and the DEFRA reader. Nothing here has a factor of its own.
//
// ⚠️ WHY A SPLIT, NOT TONNES PER ROUTE. The GHG Protocol's Technical Guidance for Calculating Scope 3
// Emissions (v1.0, 2013) lists the activity data for Category 12 as "Total mass of sold products and
// packaging" and "Proportion of this waste being treated by different methods (e.g., percent landfilled,
// incinerated, recycled)" (p. 126), and the Scope 3 Standard asks companies to report "underlying
// assumptions related to … waste treatment methods" for this category (p. 121). A split is that
// assumption, stated; tonnes per route would have multiplied it in and hidden it.
//
// ⚠️ FINER THAN FORMULA [12.1], AND DESCRIBED THAT WAY. The Guidance's formula applies one average
// factor per treatment method. This applies DEFRA's factor for the material AND the route, per material,
// which the Guidance's own data-collection note ("collect data on the waste type(s) and amounts", p. 126)
// points towards but its formula does not. scope3MethodDescription('end_of_life_factors') says so rather
// than calling this [12.1].
//
// ⚠️ NO RE-USE SHARE. The sheet publishes no Re-use factor and its FAQ says re-use "is not a waste
// disposal method". Category 12 counts the TOTAL EXPECTED end-of-life emissions of the products sold in
// the reporting year (Scope 3 Standard p. 49), and a re-used product still reaches end of life, later. So
// the split must account for where the mass is eventually treated, across the routes the sheet
// publishes. A re-use share is never offered; one arriving from saved data leaves the material unpriced,
// with that reason, rather than counting the re-used mass as zero emissions.

import { wasteRoutesFor } from '../emissionFactors/defraWaste'
import { evaluateWasteRows, type EvaluatedWasteRow, type WasteRow } from './wasteRows'

export interface EolMaterial {
  id: string
  /** The DEFRA activity block and waste type, as a Category 5 row stores them. '' = not chosen. */
  activity: string
  waste_type: string
  /** Tonnes of sold product and packaging reaching end of life. 0 = not entered. */
  tonnes: number
  /** Percent of those tonnes per treatment route, keyed by the sheet's route name. Absent = 0. */
  shares: Record<string, number>
}

/**
 * How far a material's shares may be from 100% and still price, in percentage points.
 *
 * ⚠️ 0.1 PERCENTAGE POINTS, AND THE SHARES ARE THEN USED AS ENTERED, NOT RESCALED. A three-way even split
 * typed to one decimal place (33.3 + 33.3 + 33.3 = 99.9) must price: the customer meant thirds and wrote
 * what the field allows. Anything further from 100 is a real gap or overlap in the assumption, and pricing
 * it would count part of the mass twice or not at all without saying so. Rescaling to 100 would change a
 * number the customer typed, so a split that passes is priced as entered; at worst 0.1% of the material's
 * mass is left out, and the CSV prints the sum.
 */
export const EOL_SPLIT_TOLERANCE_PP = 0.1

export type EolMaterialOutcome =
  | { status: 'priced' }
  /** Something not entered yet, named in form order. */
  | { status: 'incomplete'; missing: ('material' | 'tonnes' | 'split')[] }
  /** Every field entered, but the shares do not sum to 100 (within tolerance), or one is negative. */
  | { status: 'split_invalid'; sum: number }
  /** A share on a route the sheet publishes no factor for, for this material. Only saved data can do this. */
  | { status: 'no_factor'; routes: string[] }

export interface EvaluatedEolMaterial {
  material: EolMaterial
  /** 1-based, in entry order: the number the panel and the CSV print. */
  n: number
  outcome: EolMaterialOutcome
  /** Sum of the entered shares, in percent. */
  shareSum: number
  /** The derived route rows, priced. Empty unless the material is priced. */
  routes: EvaluatedWasteRow<WasteRow>[]
  kg: number
}

export interface EolEvaluation {
  evaluated: EvaluatedEolMaterial[]
  priced: EvaluatedEolMaterial[]
  notPriced: EvaluatedEolMaterial[]
  kg: number
  mt: number
}

const enteredShares = (m: EolMaterial): [string, number][] =>
  Object.entries(m.shares ?? {}).filter(([, v]) => v !== 0 && v !== undefined && v !== null) as [string, number][]

function evaluateOne(m: EolMaterial, n: number): EvaluatedEolMaterial {
  const shares = enteredShares(m)
  const shareSum = shares.reduce((s, [, v]) => s + (Number.isFinite(v) ? v : NaN), 0)
  const none = (outcome: EolMaterialOutcome): EvaluatedEolMaterial => ({ material: m, n, outcome, shareSum, routes: [], kg: 0 })

  const missing: ('material' | 'tonnes' | 'split')[] = []
  if (!m.activity || !m.waste_type) missing.push('material')
  if (!(Number.isFinite(m.tonnes) && m.tonnes > 0)) missing.push('tonnes')
  if (shares.length === 0) missing.push('split')
  if (missing.length > 0) return none({ status: 'incomplete', missing })

  const published = wasteRoutesFor(m.activity, m.waste_type)
  const unpublished = shares.map(([r]) => r).filter(r => !published.includes(r))
  if (unpublished.length > 0) return none({ status: 'no_factor', routes: unpublished })

  // ⚠️ THE SUM IS ROUNDED BEFORE IT IS COMPARED. In floating point 33.3 + 33.3 + 33.3 is 99.89999999999999,
  // a hair OUTSIDE 0.1 of 100, so the exact case the tolerance exists for was rejected until a test caught
  // it. Six decimal places is far below anything a customer can type and far above float noise.
  const roundedSum = Math.round(shareSum * 1e6) / 1e6
  if (shares.some(([, v]) => !Number.isFinite(v) || v < 0) || !(Math.abs(roundedSum - 100) <= EOL_SPLIT_TOLERANCE_PP)) {
    return none({ status: 'split_invalid', sum: shareSum })
  }

  // Derived rows, in the sheet's route order, priced exactly as a Category 5 row.
  const rows: WasteRow[] = published
    .filter(route => shares.some(([r]) => r === route))
    .map(route => ({
      id: `${m.id}:${route}`,
      activity: m.activity,
      waste_type: m.waste_type,
      route,
      tonnes: (m.tonnes * (m.shares[route] as number)) / 100,
    }))
  const e = evaluateWasteRows(rows)
  if (e.notPriced.length > 0) return none({ status: 'no_factor', routes: e.notPriced.map(r => r.row.route) })
  return { material: m, n, outcome: { status: 'priced' }, shareSum, routes: e.evaluated, kg: e.kg }
}

/** Price one category's end-of-life materials. `undefined` is an empty list. */
export function evaluateEolMaterials(materials: readonly EolMaterial[] | undefined): EolEvaluation {
  const evaluated = (materials ?? []).map((m, i) => evaluateOne(m, i + 1))
  const priced = evaluated.filter(e => e.outcome.status === 'priced')
  const notPriced = evaluated.filter(e => e.outcome.status !== 'priced')
  const kg = priced.reduce((sum, e) => sum + e.kg, 0)
  return { evaluated, priced, notPriced, kg, mt: kg / 1000 }
}

/** "33.3", "100", "99.9": a share or a sum as the customer would write it. */
export const formatShare = (v: number): string => (Math.round(v * 100) / 100).toString()

/** Why a material adds nothing to the figure, from what was observed. null for a priced material. */
export function eolMaterialNotPricedReason(e: EvaluatedEolMaterial): string | null {
  const m = e.material
  const o = e.outcome
  switch (o.status) {
    case 'priced': return null
    case 'incomplete': return `${o.missing.map(x => (x === 'split' ? 'treatment split' : x)).join(', ')} not entered`
    case 'split_invalid':
      return Number.isFinite(o.sum)
        ? `its treatment shares sum to ${formatShare(o.sum)}%, not 100%, so it is not priced rather than priced on part of its mass`
        : 'one of its treatment shares is not a number, so it is not priced'
    case 'no_factor':
      return `the sheet publishes no ${o.routes.join(' or ')} factor for ${m.waste_type} (${m.activity}), so it is not counted, and not counted as zero`
  }
}
