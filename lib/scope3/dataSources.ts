// ── THE FIFTEEN "WHERE TO FIND IT" TEXTS ─────────────────────────────────────────────────────────
//
// One home for the fifteen strings the Calculate step shows under "Where to find it", here rather than
// in app/dashboard/scope3/page.tsx for the reason lib/scope3/cat15.ts gives: a claim about method
// belongs beside the method, where a guard can read it. lib/scope3/cat3.ts held Category 3 alone from
// 4b9c239 until 20 Sep 2026; it was folded in here when the other fourteen followed, and its note on
// what Category 3 used to claim is kept below, unchanged.
//
// ⚠️ SEVEN OF THE FIFTEEN DESCRIBED A METHOD THE PLATFORM DOES NOT USE. Category 4 named tonne-km and
// mode/distance that nothing collects; Categories 8, 10, 11, 13 and 14 said "Activity-based;
// spend-based is not appropriate here" of a category priced from spend alone; Category 9 named
// modelled tonne-km. Each now says what its form asks for and embeds the description of the method the
// map actually dispatches to. categoryMethods.test.ts M9 holds the line for all fifteen.
//
// ⚠️ IT DESCRIBED A METHOD THE PLATFORM HAS NEVER USED. Until 20 Sep 2026 it read "Your Scope 1 & 2
// energy consumption data (kWh, fuel volumes), with well-to-tank and T&D-loss factors applied. Source
// the consumption from utility bills / the GHG module." None of that happens. Category 3 is not in
// METHOD_BY_CATEGORY (lib/scope3/categoryMethods.ts), so scope3MethodFor returns 'flat_spend', and the
// figure is annual spend times one flat 0.5 kg CO2e per unit of currency with no source, year or
// region. The form asks for a spend figure and an optional known total; it asks for no kWh, no fuel
// volume and nothing from the GHG module. The text a customer reads under "Where to find it" was
// telling them to collect data the form cannot take, for a calculation that does not exist.
//
// ⚠️ THE FLAT CLAIM IS EMBEDDED, NOT RETYPED. scope3MethodDescription('flat_spend') is the same
// sentence the public methodology page and the CSV's Method cell carry, with the 0.5 and the
// provenance gap read from the factor record. Copying its words here would have made a fourth
// phrasing of one claim; categoryMethods.test.ts M9 fails if this stops embedding it.
//
// The Category 1 warning is not a style note: totalScope3 (page.tsx) sums every relevant, calculated
// category with no deduplication between them, so a fuel invoice entered in both categories is added
// twice to the same total.

import { scope3MethodDescription } from './categoryMethods'

/** Shared closings: the same sentence on every category whose method takes an entered figure. */
const KNOWN_FIGURE = 'If you already hold a figure for this category, enter it as known emissions and that figure is used instead of the estimate.'
/** The generic panel's only inputs, named as its labels name them (app/dashboard/scope3/page.tsx). */
const ONE_FIELD = 'The estimate uses one field: Annual spend / value, in the inventory\'s currency.'
/** For the categories where the spending is someone else's: Cats 9, 10, 11, 13 and 14. */
const NO_INVOICE_OF_YOURS = 'so there is no invoice of yours behind the figure, and ThemisIQ does not define what it should represent.'

/**
 * ⚠️ NOTHING TO COLLECT, WHICH IS THE POINT OF THE SENTENCE. Every other category's text names a
 * document to go and find. Category 3's inputs are already in the platform: the bound GHG inventory's
 * own fuel, electricity and heat. So this says where the figures come FROM rather than what to fetch,
 * and it says plainly that no spend figure is asked for, because until 20 Sep 2026 one was.
 *
 * ⚠️ THE CATEGORY 1 DOUBLE-COUNT SENTENCE IS GONE, AND ITS ABSENCE IS DELIBERATE. It read "Leave out
 * any spend already entered under Category 1, or it will be counted twice", which was a true warning
 * about a spend figure this category no longer takes. The underlying hazard it named still exists for
 * the categories that DO take spend (totalScope3 sums with no deduplication), which is why the sentence
 * survives on theirs; here it would warn about an input the panel does not have.
 */
const CAT3_DATA_SOURCE =
  'Nothing to collect for this one: the figures come from the GHG inventory this Scope 3 record is ' +
  'bound to, location by location, and no spend figure is asked for. To change what Category 3 covers, ' +
  `change the energy in that inventory. ${scope3MethodDescription('fuel_and_energy_upstream')} ${KNOWN_FIGURE}`

const CAT4_DATA_SOURCE =
  'Freight and logistics invoices: the annual spend on inbound transport, distribution and warehousing ' +
  `you paid for in the reporting year, and the EXIOBASE industry of the provider you paid. ${scope3MethodDescription('exiobase_spend')} ` +
  KNOWN_FIGURE

const CAT8_DATA_SOURCE =
  `${ONE_FIELD} For leased assets that is what you paid under those leases in the reporting year, from ` +
  `your lease schedule or accounts payable. ${scope3MethodDescription('flat_spend')} If you already hold an emissions figure for these ` +
  'assets, from the landlord or from your own metering, enter it as known emissions and that figure is ' +
  'used instead of the estimate.'

const CAT9_DATA_SOURCE =
  `${ONE_FIELD} The transport this category covers is paid for by your customers or distributors, ` +
  `${NO_INVOICE_OF_YOURS} ${scope3MethodDescription('flat_spend')} If a carrier or distributor has given you an emissions figure for ` +
  'moving your sold products, enter it as known emissions and that figure is used instead of the estimate.'

const CAT10_DATA_SOURCE =
  `${ONE_FIELD} The processing this category covers is done and paid for by your customers, ` +
  `${NO_INVOICE_OF_YOURS} ${scope3MethodDescription('flat_spend')} If a customer who processes your intermediate products has given you ` +
  'an emissions figure, enter it as known emissions and that figure is used instead of the estimate.'

const CAT11_DATA_SOURCE =
  `${ONE_FIELD} The emissions this category covers happen when your customers use what you sold, ` +
  `${NO_INVOICE_OF_YOURS} ${scope3MethodDescription('flat_spend')} If you have modelled the emissions of your products in use, or hold ` +
  'a figure from a product footprint study, enter it as known emissions and that figure is used instead ' +
  'of the estimate.'

const CAT13_DATA_SOURCE =
  `${ONE_FIELD} The energy use this category covers is your tenants', ` +
  `${NO_INVOICE_OF_YOURS} ${scope3MethodDescription('flat_spend')} If a tenant has given you an emissions figure for what they lease ` +
  'from you, enter it as known emissions and that figure is used instead of the estimate.'

const CAT14_DATA_SOURCE =
  `${ONE_FIELD} The operations this category covers are your franchisees', ` +
  `${NO_INVOICE_OF_YOURS} ${scope3MethodDescription('flat_spend')} If your franchisees report emissions to you, enter that figure as ` +
  'known emissions and it is used instead of the estimate.'

/**
 * CATEGORIES[].dataSource, keyed by category id: the text under "Where to find it:" on the Calculate
 * step (app/dashboard/scope3/page.tsx). The seven unchanged entries moved here verbatim on 20 Sep 2026.
 */
export const SCOPE3_DATA_SOURCE: Readonly<Record<string, string>> = {
  cat1: 'Procurement / AP ledger: annual spend by supplier or category. Best: supplier-specific emissions via the Supplier Portal. Spend-based estimation is permitted for this category.',
  cat2: 'Fixed-asset register / capital expenditure records for the reporting year. Spend-based estimation is permitted for this category.',
  cat3: CAT3_DATA_SOURCE,
  cat4: CAT4_DATA_SOURCE,
  cat5: 'Waste contractor invoices / facilities team: tonnes by material and treatment route. Activity data (tonnes) is needed; spend-based is not appropriate here.',
  cat6: 'Travel & expense system or travel agency reports: each flight leg (origin, destination, cabin class, distance, passengers) and each rail journey (country, type, distance, passengers). Hotel stays are not taken.',
  cat7: 'A commuting survey or HR records: for each group of employees who commute the same way, the mode, the country, the one-way distance, the days actually commuted per week and the weeks worked per year, and how many people share each car. Optionally, homeworking days and hours.',
  cat8: CAT8_DATA_SOURCE,
  cat9: CAT9_DATA_SOURCE,
  cat10: CAT10_DATA_SOURCE,
  cat11: CAT11_DATA_SOURCE,
  cat12: 'Per material: the tonnes of sold products and packaging that reach end of life, and how that mass splits across treatment routes. Enter the mass that reaches end of life, which can be less than the mass sold for products that are consumed, such as food and drink. For an intermediate product, enter the intermediate product you sold, not the final product it becomes part of. Include packaging, through to the point of retail.',
  cat13: CAT13_DATA_SOURCE,
  cat14: CAT14_DATA_SOURCE,
  cat15: 'Per holding: the asset class, the outstanding amount, the value that asset class attributes on (EVIC, equity plus debt, property value or vehicle value) and the investee\u2019s reported emissions. If you already hold a computed figure for the portfolio, enter known financed emissions directly instead.',
}
