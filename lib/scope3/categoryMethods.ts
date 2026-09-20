// ── WHICH CALCULATION EACH SCOPE 3 CATEGORY USES, AND HOW TO DESCRIBE IT ─────────────────────────
//
// ONE map from category to method, read by the Scope 3 calculator's dispatch (getCatEmissions in
// app/dashboard/scope3/page.tsx) AND by every description of a figure's basis. Because the dispatch
// reads this map, a description cannot say one method while the calculation runs another.
//
// ⚠️ THIS REPLACED "DEFRA/Exiobase", WHICH WAS FALSE IN EVERY COPY. When it was written, no DEFRA spend
// or activity factor fed any Scope 3 figure. On 17 Sep 2026 the claim appeared five times: the CSV methodology
// note, the saved factor_basis column, the supply-chain register, and twice on the public methodology
// page. What is actually true differs by category, and a single sentence cannot say it:
//   Cat 1                     EXIOBASE 3.8.2, through a named factor edition
//   Cat 5                     (since 17 Sep 2026) DEFRA/DESNZ 2026 waste factors, per material and route
//   Cat 12                    (since 18 Sep 2026) the same DEFRA factors, per material, on the customer's
//                             split of end-of-life tonnes across routes
//   Cat 6                     (since 19 Sep 2026) DEFRA/DESNZ 2026 business travel factors, per flight
//                             leg and rail journey, with well-to-tank added (businessTravel.ts)
//   Cat 7                     (since 19 Sep 2026) DEFRA/DESNZ 2026 land travel factors per group of
//                             commuters, with well-to-tank added, and UK homeworking (commuting.ts)
//   Cat 15                    the PCAF-aligned path in lib/pcaf
//   the other seven           one flat spend factor, with no source, no year and no region
//
// CLIENT-SAFE: imports spend.ts (types and the source catalogue) and lib/emissionFactors.ts, neither
// of which pulls in a factor file, and defraWaste.ts, which pulls in the ~30 KB waste artefact the
// Scope 3 page already ships.

import { SPEND_EF_SOURCES } from '../emissionFactors/spend'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { GENERIC_SPEND_FACTOR } from '../emissionFactors'
import { cat15MethodDescription } from './cat15'
import { cat6MethodDescription } from './businessTravelCopy'
import { cat7MethodDescription } from './commutingCopy'

export type Scope3Method =
  | 'exiobase_spend'
  | 'flat_spend'
  | 'waste_factors'
  | 'business_travel_factors'
  | 'employee_commuting_factors'
  | 'pcaf'
  | 'end_of_life_factors'

const METHOD_BY_CATEGORY: Readonly<Record<string, Scope3Method>> = {
  cat1: 'exiobase_spend',
  // ⚠️ CAT 2 AND CAT 4 JOINED CAT 1 ON 17 SEP 2026, AND THE OTHER SEVEN DID NOT. These three are the
  // categories a customer BUYS — purchased goods and services, capital goods, inbound freight — so a
  // spend figure has something to multiply. Cats 9, 11, 13 and 14 price what the company SOLD or LEASED
  // OUT, where there is no purchase; Cat 3 is derived from energy already in Scopes 1 and 2; Cat 12 is
  // tonnes by material; Cat 8's own guidance says spend is not appropriate. Those eight kept flat_spend
  // deliberately; see SPEND_PRICED_CATEGORIES in app/dashboard/scope3/page.tsx.
  //   ⚠️ CAT 12 LEFT THE FLAT GROUP ON 18 SEP 2026 for end_of_life_factors, so flat_spend has SEVEN
  // members: 3, 8, 9, 10, 11, 13 and 14. Whether it survives is a later question.
  cat2: 'exiobase_spend',
  cat4: 'exiobase_spend',
  cat5: 'waste_factors',
  // ⚠️ 'travel_factors' IS GONE, NOT RENAMED. It priced flight COUNTS at an assumed 800 or 5,000 km from
  // EMISSION_FACTORS values with no recorded source; no category uses it now, and no saved Cat 6 data in
  // its shape exists. Cat 7 never used it.
  cat6: 'business_travel_factors',
  // ⚠️ 'commuting_factors' IS GONE, NOT RENAMED. It priced one mode for every employee from fixed values in
  // EMISSION_FACTORS with no recorded source, a blank distance at 15 km, a missing mode as a petrol car and
  // 235 working days. The one saved record in the old shape is shown as not priced (cat7LegacyNotice).
  cat7: 'employee_commuting_factors',
  cat12: 'end_of_life_factors',
  cat15: 'pcaf',
}

/** The method a category is calculated with. Anything not named above takes the flat spend factor,
 *  exactly as the calculator's default branch does. */
export function scope3MethodFor(categoryId: string): Scope3Method {
  return METHOD_BY_CATEGORY[categoryId] ?? 'flat_spend'
}

/**
 * Whether a method uses a figure the customer enters directly IN PLACE OF its own estimate.
 *
 * ⚠️ WHAT THE CALCULATOR DOES, NOT WHAT THE STORED DATA HAPPENS TO HOLD. EXIOBASE-priced and flat-spend
 * categories return an entered `emissions_override` (and Category 1 its supplier-specific figure), and PCAF
 * returns an entered known total. The waste rows, business travel and commuting calculators never read an
 * entered figure, and their panels offer none.
 *
 * ⚠️ ONE RECORD, THREE READERS, SO THEY CANNOT DISAGREE. The methodology page states which categories
 * accept an entered figure from it; isCalculated and getConfidence honour a stored `emissions_override`
 * only where it is true (takesEnteredFigure). Until 18 Sep 2026 those two honoured one for EVERY category,
 * while the Cat 5, 6 and 7 calculators ignored it: a Cat 5 record with a stored override and no priced row
 * was reported "Relevant, calculated", in the total at 0.00 and labelled "Primary data", while the same
 * CSV's methodology note said nothing had been calculated. Cats 6 and 7 carried the same mismatch.
 *
 * A Record, so a new method fails tsc here until someone decides.
 */
export const METHOD_TAKES_ENTERED_FIGURE: Readonly<Record<Scope3Method, boolean>> = {
  exiobase_spend: true,
  flat_spend: true,
  pcaf: true,
  waste_factors: false,
  // Category 6 takes no entered total: its figure is the customer's flight legs and rail journeys, priced.
  business_travel_factors: false,
  // Category 7 takes no entered total: its figure is the customer's commuting and homeworking groups, priced.
  employee_commuting_factors: false,
  // Category 12 takes no entered total: its figure is the customer's materials and split, priced.
  end_of_life_factors: false,
}

/** Does this category's calculator use a figure entered in place of its estimate? Read by the page's
 *  isCalculated and getConfidence before they honour a stored `emissions_override`. */
export const takesEnteredFigure = (categoryId: string): boolean =>
  METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(categoryId)]

/**
 * "no published source, no year and no region" — built from which provenance fields are null, so it
 * shrinks the moment a real source is recorded. null when nothing is missing.
 */
export function provenanceGap(p: { source: string | null; year: number | null; region: string | null }): string | null {
  const missing = [
    p.source === null && 'no published source',
    p.year === null && 'no year',
    p.region === null && 'no region',
  ].filter((x): x is string => typeof x === 'string')
  if (missing.length === 0) return null
  return missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`
}

/**
 * What the flat factor is indifferent to, in one clause, because three surfaces say it and they said it
 * three ways.
 *
 * ⚠️ IT SAID "THE SAME WHATEVER WAS BOUGHT" UNTIL 20 SEP 2026, AND FIVE OF THE SEVEN FLAT CATEGORIES BUY
 * NOTHING. Categories 9, 10, 11, 13 and 14 price what a customer, tenant or franchisee did: the company
 * is not the buyer, there is no purchase behind the figure, and the old wording told the customer there
 * was. The claim that is actually true of the factor is that it does not vary: not by category, and not
 * by what the number in the box is meant to represent.
 *
 * Shared rather than repeated because the description below, the assistant prompt's clause
 * (lib/scope3/methodSummary.ts) and the panel's basis detail (app/dashboard/scope3/page.tsx) all carry
 * it, and the first two embed THIS constant. categoryMethods.test.ts fails if any of them stops.
 */
export const FLAT_FACTOR_SAMENESS =
  'the same for every category priced this way, whatever the figure represents'

const gapSentence = (p: Parameters<typeof provenanceGap>[0], subject: string): string => {
  const gap = provenanceGap(p)
  return gap ? ` ${subject} recorded with ${gap}.` : ''
}

/**
 * What a method IS, independent of any one inventory: for the public methodology page, and as the
 * detail line for a category whose data was used as the method describes. Every number and source is
 * read from the factor tables and the source catalogue, not typed here.
 */
export function scope3MethodDescription(method: Scope3Method): string {
  switch (method) {
    case 'exiobase_spend': {
      const src = SPEND_EF_SOURCES.exiobase_38
      // ⚠️ WORDED FOR THREE CATEGORIES, NOT ONE. It read "the factor for the supplier's sector", which was
      // Cat 1's question. Cat 2 prices a PRODUCT (what was bought) and Cat 4 an INDUSTRY (who carried the
      // freight), each with its own recorded code — so the sentence names the category's own selection
      // rather than one category's vocabulary.
      return (
        `Spend-based, priced from ${src.dataset} version ${src.version} (${src.publisher}, licensed ` +
        `${src.licence}) through the active factor edition, using the factor recorded for that category (` +
        `an EXIOBASE industry or product, whichever the category is priced against) in the EXIOBASE ` +
        `region the inventory's country of supply belongs to.`
      )
    }
    case 'flat_spend':
      return (
        `A flat ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the inventory's ` +
        `currency entered, ${FLAT_FACTOR_SAMENESS}.` +
        gapSentence(GENERIC_SPEND_FACTOR, 'This factor is')
      )
    case 'waste_factors': {
      const w = DEFRA_WASTE_META
      return (
        `Activity-based: tonnes of waste by material and treatment route, each multiplied by the kg CO2e ` +
        `per tonne published for that pair in ${w.source} (${w.factor_set.toLowerCase()} v${w.file_version}, ` +
        `${w.sheet} sheet, ${w.gwp_basis} GWPs). Only the routes published for a material are offered; ` +
        `re-use is not a disposal route and has no factor. ${w.attribution_required}`
      )
    }
    case 'end_of_life_factors': {
      // ⚠️ NO EM-DASHES, AND NOT CALLED FORMULA [12.1]. The GHG Protocol's Technical Guidance formula
      // [12.1] applies one average factor per treatment method; this applies the sheet's factor for the
      // material AND the route, per material, which is finer, and the sentence says so. The time boundary,
      // the split as the customer's assumption and the UK scope of the factors are stated here because this
      // line is the hierarchy's Category 12 line and the CSV's Method cell, and a reader may see nothing else.
      const w = DEFRA_WASTE_META
      return (
        `Activity-based, per material: the tonnes of sold products and packaging reaching end of life, split ` +
        `by the customer across the treatment routes the sheet publishes for that material, each route's ` +
        `tonnes multiplied by the kg CO2e per tonne published for that material and route in ${w.source} ` +
        `(${w.factor_set.toLowerCase()} v${w.file_version}, ${w.sheet} sheet, ${w.gwp_basis} GWPs). This is ` +
        `finer than formula [12.1] of the GHG Protocol's Technical Guidance for Calculating Scope 3 ` +
        `Emissions, which applies one average factor per treatment method. The split and its source are the ` +
        `customer's assumption. The figure is the expected end-of-life emissions of all products sold in the ` +
        `reporting year, most of which have not yet occurred. These are UK factors, applied wherever the products are ` +
        `sold. Re-use is not a treatment route and has no factor. ${w.attribution_required}`
      )
    }
    case 'business_travel_factors':
      // Built in lib/scope3/businessTravelCopy.ts, from the same sentences the Cat 6 panel, workings and CSV
      // read. No em-dashes.
      return cat6MethodDescription()
    case 'employee_commuting_factors':
      // Built in lib/scope3/commutingCopy.ts, from the same sentences the Cat 7 panel, workings and CSV read.
      return cat7MethodDescription()
    case 'pcaf':
      // ⚠️ BUILT IN lib/scope3/cat15.ts, WHERE EVERY CATEGORY 15 SENTENCE NOW LIVES ONCE. This was a literal
      // here until 18 Sep 2026, kept in step with the methodology passage by a test comparing the two. Both
      // now read the same constants, and the test bans the superseded phrasings instead. The history of the
      // wording — the withdrawn proxy, "own reported", "do not multiply into a quantity" — is recorded there.
      return cat15MethodDescription()
  }
}
