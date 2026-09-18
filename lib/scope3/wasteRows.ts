// ── ONE CATEGORY'S WASTE ROWS, PRICED ─────────────────────────────────────────────────────────────
//
// The evaluation Category 5 has always run, taken out of app/dashboard/scope3/page.tsx so a second
// row-priced category (Category 12, end-of-life treatment of sold products) can run the same thing over
// ITS OWN rows. It takes the rows as a parameter and reads no page state.
//
// ⚠️ WHY IT HAD TO LEAVE THE PAGE BEFORE CATEGORY 12 COULD ARRIVE. In the page, `calcCat5()` took no
// category id and read catData.cat5 directly, and isCalculated's waste branch read the same Cat 5 list.
// Mapping a second category onto the waste method there would have made that category report Category 5's
// figure and be "calculated" whenever Category 5 was — a silent double count. Each caller now passes its
// own rows.
//
// Behaviour is Category 5's exactly: each row priced by priceWasteRow from the DEFRA/DESNZ 2026 sheet,
// numbered from 1 in entry order, the figure the sum of the priced rows' kg divided by 1000 in that order
// (the same floating-point sum the page computed). A row that cannot be priced is not in the figure and
// is never counted as zero.

import { priceWasteRow, type WasteRowInput, type WasteRowPricing } from '../emissionFactors/defraWaste'

/**
 * One waste stream as stored in cat_data: the activity block beside the waste type, because the block is
 * part of the factor's identity in the sheet. '' means not chosen; tonnes 0 means not entered.
 */
export interface WasteRow extends WasteRowInput {
  id: string
}

type Priced = Extract<WasteRowPricing, { status: 'priced' }>

export interface EvaluatedWasteRow<R extends WasteRowInput = WasteRow> {
  row: R
  /** 1-based, in entry order: the number the panel and the CSV print. */
  n: number
  pricing: WasteRowPricing
}

export interface WasteRowsEvaluation<R extends WasteRowInput = WasteRow> {
  evaluated: EvaluatedWasteRow<R>[]
  priced: (EvaluatedWasteRow<R> & { pricing: Priced })[]
  notPriced: EvaluatedWasteRow<R>[]
  /** kg CO2e of the priced rows. 0 when none is priced; the caller decides whether that is "calculated". */
  kg: number
  mt: number
}

/** Price one category's rows. `undefined` is an empty list: a category with no rows has none to price. */
export function evaluateWasteRows<R extends WasteRowInput>(rows: readonly R[] | undefined): WasteRowsEvaluation<R> {
  const evaluated = (rows ?? []).map((row, i) => ({ row, n: i + 1, pricing: priceWasteRow(row) }))
  const priced = evaluated.flatMap(e => (e.pricing.status === 'priced' ? [{ ...e, pricing: e.pricing }] : []))
  const notPriced = evaluated.filter(e => e.pricing.status !== 'priced')
  const kg = priced.reduce((sum, e) => sum + e.pricing.kg_co2e, 0)
  return { evaluated, priced, notPriced, kg, mt: kg / 1000 }
}

/** Why a row adds nothing to the figure, from what was observed about it. null for a priced row. */
export const wasteRowNotPricedReason = (row: WasteRowInput, pricing: WasteRowPricing): string | null =>
  pricing.status === 'incomplete' ? `${pricing.missing.join(', ')} not entered`
    : pricing.status === 'no_factor' ? `the sheet publishes no ${row.route} factor for ${row.waste_type} (${row.activity}), so it is not counted, and not counted as zero`
    : null
