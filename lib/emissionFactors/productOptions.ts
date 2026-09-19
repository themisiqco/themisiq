// ── THE PRODUCT DROPDOWN ────────────────────────────────────────────────────────────────────────
//
// EXIOBASE's 200 PRODUCTS, grouped for a select, beside industryOptions.ts and its 163 INDUSTRIES.
// Both read lib/emissionFactors/exiobaseSectors.json; the factor files stay server-side.
//
// ⚠️ WHY TWO LISTS AT ALL. EXIOBASE publishes two tables and the spend-factor route takes one per line:
// `industry` (ixi) prices WHO PRODUCED something, `product` (pxp) prices WHAT WAS BOUGHT. For a service
// you buy — freight, say — the industry is the natural answer. For capital goods, the customer is buying
// identifiable things (a machine, a vehicle, a building), and the product table is the closer match.
//
// ⚠️ THE GROUPING HERE IS EXIOBASE'S OWN, UNLIKE THE INDUSTRY DROPDOWN'S. industryOptions.ts groups under
// 20 headings that are ThemisIQ's, seeded by supabase/migrations/20260914_exiobase_sectors.sql, and its
// comment is careful to say a reader cannot tell ours from theirs. Products carry no such column: the JSON
// has no display_group for them. What they DO carry is `consumption_category`, one of eight values
// published with the classification, so this list groups by that and invents nothing.
//
// ⚠️ EVERY ROW IS OFFERED, AND THE UNUSUAL ONES SAY SO. Of the 200, 173 are Commodity, 14 Waste, 8
// TransportMargin and 5 TradeMargin. FILTERING ON `type` WOULD HIDE LEGITIMATE PURCHASES, which is why
// this list carries a note instead of a filter — checked against the file rather than assumed:
//   · TransportMargin holds p60.1 Railway, p60.2 Other land, p60.3 Pipeline, p61.1 Sea and coastal,
//     p61.2 Inland water, p62 Air transport and p63 Supporting transport services. Those are the transport
//     SERVICES a company buys — on the product side they are the natural Cat 4 choice, not a curiosity.
//   · TradeMargin holds p50.a Sale, maintenance and repair of motor vehicles, p50.b Retail of motor fuel,
//     p51 Wholesale trade, p52 Retail trade and p40.2.1 Distribution of gaseous fuels. All purchasable.
//   · The type is EXIOBASE's marking of which products CARRY margins, not a warning that they cannot be
//     bought, and it is not perfectly clean: p45.w ("Secondary construction material for treatment") is
//     typed TransportMargin though it reads as waste — a quirk lib/emissionFactors/spendResolver.server.ts
//     documents at SECONDARY_MATERIAL_CODES, and deliberately does not paper over.
//
// ⚠️ THE 14 WASTE ROWS CAN NEVER PRICE, AND THAT IS HANDLED, NOT HIDDEN. They are zero in all 49 regions,
// and the resolver returns kind 'absent' with prose explaining that EXIOBASE models secondary materials as
// waste treatment flows rather than priced commodities. A customer who picks one gets that explanation
// rather than a confident zero — the resolver refuses a zero factor before anything else. The note below
// says so at the point of choosing, so the answer is not a surprise arriving after the click.

import sectors from './exiobaseSectors.json'

export interface ProductOption {
  /** An EXIOBASE pxp ExioCode, e.g. 'p01.a'. */
  code: string
  /** EXIOBASE's own name, unaltered. */
  name: string
  number: number
  /** EXIOBASE's own product type: Commodity, Waste, TransportMargin or TradeMargin. */
  type: string
  /** What to show after the name for a row that is not a plain commodity. null for the 173 that are. */
  note: string | null
}

/** One short clause per non-commodity type, so a customer can see what they are choosing before they
 *  choose it. Nothing is hidden and nothing is reworded: the type is EXIOBASE's. */
const TYPE_NOTE: Readonly<Record<string, string>> = {
  Waste: 'secondary material: EXIOBASE publishes no spend intensity for these, so this cannot be priced',
  TransportMargin: 'transport service / margin sector',
  TradeMargin: 'trade service / margin sector',
}

export interface ProductOptionGroup {
  heading: string
  products: ProductOption[]
}

type RawProduct = { exio_code: string; exio_name: string; exio_number: number; consumption_category: string; type: string }

const RAW = sectors.products as RawProduct[]

/** The eight consumption categories, in first-appearance order, each holding its products in EXIOBASE's
 *  own numbering. Underscores in the published value are shown as spaces; nothing else is reworded. */
export const PRODUCT_OPTION_GROUPS: readonly ProductOptionGroup[] = (() => {
  const byCategory = new Map<string, ProductOption[]>()
  for (const r of [...RAW].sort((a, b) => a.exio_number - b.exio_number)) {
    const list = byCategory.get(r.consumption_category) ?? []
    list.push({ code: r.exio_code, name: r.exio_name, number: r.exio_number, type: r.type, note: TYPE_NOTE[r.type] ?? null })
    byCategory.set(r.consumption_category, list)
  }
  return [...byCategory.entries()].map(([heading, products]) => ({ heading: heading.replace(/_/g, ' '), products }))
})()

/** Every valid pxp code. */
export const PRODUCT_CODES: ReadonlySet<string> = new Set(RAW.map(r => r.exio_code))

const NAME_BY_CODE = new Map(RAW.map(r => [r.exio_code, r.exio_name]))

/** EXIOBASE's name for a pxp code, or the code itself when it is not one of the 200 — a stored value we
 *  no longer recognise must stay visible rather than render blank. Mirrors industryName. */
export function productName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code
}
