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
//   Cat 3                     (since 20 Sep 2026) DEFRA/DESNZ 2026 upstream energy factors, applied to the
//                             bound GHG inventory's own fuel, electricity and heat (cat3Energy.ts,
//                             cat3Inputs.ts, cat3Copy.ts)
//   Cat 15                    the PCAF-aligned path in lib/pcaf
//   the other six             NOT CALCULATED. Until 25 Sep 2026 they took one flat factor of 0.5 kg CO2e
//                             per unit of currency, with no source, no year and no region, and that figure
//                             was summed into the inventory total a verifier reads. GHG Protocol chapter
//                             11.1 requires a description of the methodology and the emission factor
//                             source for each category; an estimate with nothing citable behind it cannot
//                             satisfy that, so the honest answer is that the platform does not calculate
//                             them and says so. An entered figure is still accepted and is primary data.
//
// CLIENT-SAFE: imports spend.ts (types and the source catalogue) and lib/emissionFactors.ts, neither
// of which pulls in a factor file, and defraWaste.ts, which pulls in the ~30 KB waste artefact the
// Scope 3 page already ships.

import { SPEND_EF_SOURCES } from '../emissionFactors/spend'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { DEFRA_ENERGY_META } from '../emissionFactors/defraEnergy'
import { cat15MethodDescription } from './cat15'
import { cat6MethodDescription } from './businessTravelCopy'
import { cat7MethodDescription } from './commutingCopy'

/**
 * The fifteen GHG Protocol Scope 3 categories, as a union.
 *
 * ⚠️ THIS IS WHAT MAKES METHOD_BY_CATEGORY EXHAUSTIVE. The map is a Record over it, so a sixteenth
 * category cannot be added to this union without tsc demanding a method for it. Before 25 Sep 2026 the
 * map was Record<string, …> with a `?? 'flat_spend'` fallback, so an unnamed category silently inherited
 * a flat 0.5 kg factor and its figure went into the total. The fallback was the defect, not the six
 * categories that used it: whatever the default is, a default means a category can acquire a calculation
 * nobody chose for it.
 */
export const SCOPE3_CATEGORY_IDS = [
  'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'cat7', 'cat8',
  'cat9', 'cat10', 'cat11', 'cat12', 'cat13', 'cat14', 'cat15',
] as const
export type Scope3CategoryId = typeof SCOPE3_CATEGORY_IDS[number]

export type Scope3Method =
  | 'exiobase_spend'
  /**
   * ⚠️ THE PLATFORM HAS NO METHOD FOR THIS CATEGORY. It is not a calculation and it produces no figure.
   * It replaced 'flat_spend' on 25 Sep 2026, which multiplied annual spend by one flat 0.5 kg CO2e factor
   * carrying no source, no year and no region, and summed the result into the total.
   *   A method rather than an absence, deliberately: the dispatch switches on this, so "we do not
   * calculate this" has to be a value the switch can hold. It also keeps METHOD_TAKES_ENTERED_FIGURE
   * meaningful, which is true here: a customer's own Category 11 figure is primary data and is used.
   */
  | 'no_method'
  | 'waste_factors'
  | 'business_travel_factors'
  | 'employee_commuting_factors'
  | 'pcaf'
  | 'end_of_life_factors'
  | 'fuel_and_energy_upstream'

const METHOD_BY_CATEGORY: Readonly<Record<Scope3CategoryId, Scope3Method>> = {
  cat1: 'exiobase_spend',
  // ⚠️ CAT 2 AND CAT 4 JOINED CAT 1 ON 17 SEP 2026, AND THE OTHER SEVEN DID NOT. These three are the
  // categories a customer BUYS — purchased goods and services, capital goods, inbound freight — so a
  // spend figure has something to multiply. Cats 9, 11, 13 and 14 price what the company SOLD or LEASED
  // OUT, where there is no purchase; Cat 3 is derived from energy already in Scopes 1 and 2; Cat 12 is
  // tonnes by material; Cat 8's own guidance says spend is not appropriate. Those eight kept flat_spend
  // deliberately; see SPEND_PRICED_CATEGORIES in app/dashboard/scope3/page.tsx.
  //   ⚠️ CAT 12 LEFT ON 18 SEP 2026 for end_of_life_factors and CAT 3 ON 20 SEP 2026 for
  // fuel_and_energy_upstream, so flat_spend has SIX members: 8, 9, 10, 11, 13 and 14. Whether it
  // survives is a later question.
  cat2: 'exiobase_spend',
  // ⚠️ CAT 3 JOINED ON 20 SEP 2026 (Task 5), WITH ITS PANEL AND ITS CALCULATOR IN THE SAME CHANGE, so
  // flat_spend has SIX members: 8, 9, 10, 11, 13 and 14. It is the first category priced from data the
  // customer entered in ANOTHER module: the bound GHG inventory's own energy, re-priced on upstream
  // factors. Nothing about it is spend, and a spend figure saved under its old method prices nothing.
  //   This map is what the calculator DISPATCHES on, which is why the assignment, the panel, the
  // calculator and SCOPE3_DATA_SOURCE.cat3 are one change: categoryMethods.test.ts M11 fails if an
  // assignment arrives without them.
  cat3: 'fuel_and_energy_upstream',
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
  // ⚠️ THE SIX ARE NAMED NOW, NOT DEFAULTED. They reached 'flat_spend' by omission until 25 Sep 2026,
  // through a `?? 'flat_spend'` in scope3MethodFor, so nothing in this file said what they were priced
  // with and nothing failed when a category joined them. Written out so the map is the whole answer and
  // the Record type above can hold it to fifteen.
  //   Cat 8 upstream leased assets, Cat 9 downstream transportation, Cat 10 processing of sold products,
  // Cat 11 use of sold products, Cat 13 downstream leased assets, Cat 14 franchises. Five of the six price
  // what a CUSTOMER, TENANT or FRANCHISEE did, where the company made no purchase for a spend figure to
  // stand for, and Cat 8's own guidance says spend is not appropriate. So the flat factor was not merely
  // unsourced for these: there was no spend of the company's for it to multiply.
  cat8: 'no_method',
  cat9: 'no_method',
  cat10: 'no_method',
  cat11: 'no_method',
  cat12: 'end_of_life_factors',
  cat13: 'no_method',
  cat14: 'no_method',
  cat15: 'pcaf',
}

/**
 * The method a category is calculated with. Every one of the fifteen is named in the map above.
 *
 * ⚠️ THE `?? 'flat_spend'` FALLBACK IS GONE. The old default answered an unnamed category with a
 * CALCULATION: 0.5 kg CO2e per unit of currency, unsourced, summed into the total. The gate that replaced
 * it is the RECORD TYPE, not anything in this function: METHOD_BY_CATEGORY is
 * Record<Scope3CategoryId, …>, so a sixteenth category fails tsc until someone decides what prices it.
 *
 * ⚠️ AND AN UNKNOWN ID IS REPORTED, NOT ANSWERED. Returning 'no_method' quietly was the wrong shape for a
 * second time, in a subtler way than the flat factor was. 'no_method' is a MEANINGFUL PRODUCT STATE: the
 * category reads "Not calculated" on the pill, is counted in the not-calculated badge, joins
 * unpricedCatIds, and writes `unpriced: true` with a reason into scope3_coverage, which reaches a verifier
 * through get_verifier_scope3. So a typo'd id would have been rendered to a customer, and disclosed to a
 * verifier, as a deliberate statement that ThemisIQ does not calculate that category. A bug would have
 * arrived dressed as a decision.
 *   ⚠️ THE RETURN VALUE IS STILL 'no_method', BECAUSE THERE IS NO SAFER FIGURE THAN NO FIGURE. What changes
 * is that the condition is announced: logged at error level always, and thrown outside production so it
 * fails in a test run or a dev session rather than reaching a customer.
 *
 * ⚠️ PRODUCTION DOES NOT THROW, AND THE REASON IS THE ABSENCE OF AN ERROR BOUNDARY, NOT A GRACEFUL
 * DEGRADATION. This platform has no error boundary of any kind: no React boundary anywhere
 * (componentDidCatch, getDerivedStateFromError, ErrorBoundary and react-error-boundary return nothing
 * across app/ and lib/), and no Next.js route-segment boundary either, since there is no error.tsx at any
 * level and no global-error.tsx. app/dashboard/scope3/ contains page.tsx alone.
 *   scope3MethodFor is called during render in ELEVEN places in app/dashboard/scope3/page.tsx
 * (getCatEmissions, isCalculated, unpricedCatIds, couldNotPriceCatIds, unpricedReason, getConfidence four
 * times, categoryBasis and the CSV builder), plus once in lib/scope3/rowPriced.ts, which that render
 * reaches. With nothing to catch it, a throw here would WHITE-SCREEN THE ENTIRE SCOPE 3 PAGE rather than
 * degrade one category row. That is the whole argument for the guard, and it is an argument about this
 * repo's structure rather than about what is kind to a customer.
 *   ⚠️ SO REVISIT THIS IF A BOUNDARY IS EVER ADDED. With a boundary in place, throwing in production
 * becomes the better option for the same reason it is better in dev, and the eleven call sites should be
 * reconsidered together rather than one at a time. docs/backlog.md carries that as an entry.
 */
export function scope3MethodFor(categoryId: string): Scope3Method {
  const method = (METHOD_BY_CATEGORY as Readonly<Record<string, Scope3Method | undefined>>)[categoryId]
  if (method) return method
  const message =
    `scope3MethodFor: "${categoryId}" is not one of the fifteen Scope 3 category ids. ` +
    'Falling back to no_method, which renders as "Not calculated" and is disclosed to a verifier as a ' +
    'deliberate statement that this category is not calculated. That is a bug, not a decision.'
  console.error(message)
  // Dev and test throw; production logs and carries on. process.env.NODE_ENV is inlined by Next at build.
  if (process.env.NODE_ENV !== 'production') throw new Error(message)
  return 'no_method'
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
  // ⚠️ TRUE, AND IT IS THE ONLY THING THIS METHOD DOES. A customer's own Category 11 figure is primary
  // data; the platform having no estimate of its own is no reason to refuse theirs.
  no_method: true,
  pcaf: true,
  waste_factors: false,
  // Category 6 takes no entered total: its figure is the customer's flight legs and rail journeys, priced.
  business_travel_factors: false,
  // Category 7 takes no entered total: its figure is the customer's commuting and homeworking groups, priced.
  employee_commuting_factors: false,
  // Category 12 takes no entered total: its figure is the customer's materials and split, priced.
  end_of_life_factors: false,
  // Category 3 DOES take one. Its estimate is derived from another module's data rather than from
  // anything typed on its own panel, so a customer who holds a better figure for
  // upstream fuel and energy has nowhere else to put it; the known-emissions field stays, as it does for
  // Cats 1, 2, 4 and 15. ~/themisiq-sources/findings/cat3-design.md, Q7.
  fuel_and_energy_upstream: true,
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

// ── FLAT_FACTOR_SAMENESS, RETIRED 25 SEP 2026 ───────────────────────────────────────────────────
//
// ⚠️ PLAIN COMMENT, NOT JSDOC, BECAUSE IT DESCRIBES NOTHING NOW. Left as a /** */ block it attached
// itself as documentation to listSheets below, which it has no connection to.
//
// It held one clause that three surfaces shared: the description, the assistant's prompt and the panel's
// basis detail. Two wordings of it were wrong before it was removed, and both are worth keeping on the
// record because the same mistake is available to the next person who describes an estimate.
//   It read "the same whatever was bought" until 20 Sep 2026, and five of the six categories buy nothing:
// Categories 9, 10, 11, 13 and 14 price what a customer, tenant or franchisee did, so the company is not
// the buyer, there is no purchase behind the figure, and the wording told the customer there was. It was
// changed to "the same for every category priced this way, whatever the figure represents", which was
// true of the factor.
//   Then the factor itself went. Nothing is priced that way now, so the sentence has no subject, and
// keeping it would leave three surfaces carrying a warning about a calculation the product does not
// perform. The same reasoning retired 'travel_factors' and 'commuting_factors' rather than renaming them.
//   The ban on "whatever was bought" across app/ and lib/ outlives all of it: categoryMethods.test.ts
// M10a still enforces it, because removing the factor did not make the sentence true.

/** The artefact's own sheet names, in one clause: "A, B and C". Read from the record, never typed. */
const listSheets = (sheets: readonly string[]): string =>
  sheets.length <= 1 ? (sheets[0] ?? '') : `${sheets.slice(0, -1).join(', ')} and ${sheets[sheets.length - 1]}`

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
    // ⚠️ A NOUN PHRASE, NOT A SENTENCE ABOUT "THIS CATEGORY", and the first draft got that wrong. Every
    // other description opens the same way ("Spend-based, priced from...", "Activity-based, per flight leg
    // and rail journey"), because the methodology page renders one description under a heading naming ALL
    // the categories on that method: "Categories 8, 9, 10, 11, 13 and 14 (...): ThemisIQ does not calculate
    // this category" read as a singular claim about six.
    // ⚠️ NO FACTOR IS NAMED HERE BECAUSE NONE IS APPLIED. This is the sentence a verifier reads in the CSV's
    // Method column and in the saved factor_basis, so it has to say that nothing was calculated rather than
    // describe a calculation. It also says what IS accepted, because an entered figure is used and is
    // primary data: a customer with their own Category 11 number is not blocked, they are just not
    // estimated for.
    case 'no_method':
      return (
        'Not calculated by ThemisIQ: no emission factor is applied and no estimate is produced. A figure ' +
        'entered directly is used as given, and is reported as primary data.'
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
    case 'fuel_and_energy_upstream': {
      // ⚠️ READ FROM THE ARTEFACT'S METADATA, LIKE THE WASTE LINE ABOVE, and no em-dashes. Every claim
      // here is one lib/scope3/cat3Energy.ts can be checked against: the three separate electricity and
      // heat lines are what priceCat3 emits (Cat3LineKind), the stand-in disclosure is the uk_stand_in
      // flag it attaches to every row at a non-UK location, and the location-based basis is what
      // lib/scope3/cat3Inputs.ts reads (it skips the market-based row).
      //   NOT CALLED A LIFE CYCLE FACTOR, although the sheets are life cycle work: these rows EXCLUDE
      // combustion (DEFRA_ENERGY_META.upstream_only_note), which is the whole reason Category 3 may use
      // them, and "life cycle" would invite the reading that combustion is in here twice.
      const e = DEFRA_ENERGY_META
      return (
        `Activity-based, and derived rather than entered: the fuel, electricity and purchased heat or ` +
        `steam already recorded for each location in the bound GHG inventory, re-priced on the upstream ` +
        `factor for that energy. Fuels take the well-to-tank (WTT) factor published for the fuel and the ` +
        `unit entered. Electricity and heat take three separate published rows, the WTT of generation, ` +
        `the transmission and distribution (T&D) loss, and the WTT of that loss, which is how the sheets ` +
        `direct they be reported. Every row excludes combustion, which stays in Scope 1 or Scope 2. ` +
        // ⚠️ THE SHEETS THAT DECLARE SCOPE 3, NOT metadata.sheets, WHICH INCLUDES Conversions. That fifth
        // sheet publishes unit conversions and no emission factor, so naming it here would say a factor
        // came from a sheet that has none. scope_cells holds the four that state "Scope 3" at B6.
        `Factors are ${e.source} (${e.factor_set.toLowerCase()} v${e.file_version}, the ` +
        `${listSheets(Object.keys(e.scope_cells))} sheets, ${e.gwp_basis} GWPs), published for the ` +
        `United Kingdom: a ` +
        `location in another country is priced from them as a stand-in and its line says so. Electricity ` +
        `is taken on the location-based Scope 2 figure, which the GHG Protocol Scope 2 Guidance ` +
        `(section 1.10, p. 10) requires a company to disclose. Where the GHG inventory already prices a ` +
        `location's transmission and distribution loss on its own national factor, that figure is used ` +
        `and its source is named on the line. ${e.attribution_required}`
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
