// ── THE SCOPE 3 CATEGORIES GROUPED BY THE METHOD THAT PRICES EACH, FOR EVERY SURFACE THAT SAYS SO ──
//
// Two surfaces describe which Scope 3 category rests on which method: the "Calculation hierarchy" on the
// public methodology page, and the GHG assistant's system prompt. Both were written by hand, one category
// at a time, and both drifted the day Categories 2 and 4 moved from the flat spend factor to EXIOBASE:
//   · the methodology page named Category 1 on its EXIOBASE line and derived only the flat line from the
//     map, so Categories 2 and 4 appeared on NO line at all;
//   · the assistant prompt still said "the remaining ten categories" used the flat factor, and named
//     Category 1 alone as EXIOBASE — eight was already the true count.
//
// ⚠️ BOTH ARE NOW BUILT FROM scope3MethodFor, the map the calculator dispatches on (categoryMethods.ts).
// A category is described under the method that actually prices it because it is PLACED by the same
// function that prices it. Moving a category between methods moves it on both surfaces with no edit here,
// and methodSummary.test.ts fails if any category 1–15 is described zero times or twice.
//
// CLIENT-SAFE: imports categoryMethods.ts and the two factor records it already reads.

import { scope3MethodFor, scope3MethodDescription, METHOD_TAKES_ENTERED_FIGURE, type Scope3Method } from './categoryMethods'
import { SPEND_EF_SOURCES } from '../emissionFactors/spend'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { DEFRA_ENERGY_META } from '../emissionFactors/defraEnergy'
import { CAT15_GWP_TAIL } from './cat15'
import { CAT6_ASSISTANT_PHRASE } from './businessTravelCopy'
import { CAT7_ASSISTANT_PHRASE } from './commutingCopy'
import { DEFRA_TRAVEL_META } from '../emissionFactors/defraTravel'

/**
 * The fifteen categories by their GHG Protocol Scope 3 Standard titles, in prose case.
 *
 * ⚠️ NO DIGITS IN ANY NAME. Category 3's full title ends "(not included in scope 1 or scope 2)"; it is
 * shortened here because the guard test reads each line's category numbers from its heading, and a digit
 * inside a name would read as a category the line does not describe.
 */
export const SCOPE3_CATEGORY_NAMES: Readonly<Record<number, string>> = {
  1: 'purchased goods and services',
  2: 'capital goods',
  3: 'fuel- and energy-related activities',
  4: 'upstream transportation and distribution',
  5: 'waste generated in operations',
  6: 'business travel',
  7: 'employee commuting',
  8: 'upstream leased assets',
  9: 'downstream transportation and distribution',
  10: 'processing of sold products',
  11: 'use of sold products',
  12: 'end-of-life treatment of sold products',
  13: 'downstream leased assets',
  14: 'franchises',
  15: 'investments',
}

export const SCOPE3_CATEGORY_NUMBERS: readonly number[] = Array.from({ length: 15 }, (_, i) => i + 1)

/**
 * The order the methods are described in: strongest source first, the flat residual last.
 *
 * ⚠️ A Record, not an array, so that adding a member to Scope3Method fails tsc HERE until it is placed.
 * An array of methods would compile with the new one missing, and the categories it prices would then
 * appear on no line — exactly the Cat 2 and Cat 4 defect, one level up.
 */
const METHOD_RANK: Readonly<Record<Scope3Method, number>> = {
  exiobase_spend: 1,
  // Placed among the published-factor activity methods rather than at the head of the list: its inputs
  // are metered consumption from another module, which is the strongest data the platform holds, but the
  // order here is a reading order for the methodology page and Category 3's line belongs beside the
  // other DEFRA/DESNZ ones. The ranks below moved by one; no method changed its relative position.
  fuel_and_energy_upstream: 2,
  waste_factors: 3,
  end_of_life_factors: 4,
  business_travel_factors: 5,
  employee_commuting_factors: 6,
  pcaf: 7,
  // ⚠️ LAST, AND IT IS NOT A METHOD RANKING. The list is a reading order, strongest source first, and a
  // category the platform does not calculate belongs at the end of it because there is nothing to read.
  no_method: 8,
}

export interface Scope3MethodGroup {
  method: Scope3Method
  categories: number[]
}

/** Every category 1–15 under the method scope3MethodFor gives it, in METHOD_RANK order. A method no
 *  category uses today has no group. */
export function scope3MethodGroups(): Scope3MethodGroup[] {
  const groups = new Map<Scope3Method, number[]>()
  for (const n of SCOPE3_CATEGORY_NUMBERS) {
    const m = scope3MethodFor(`cat${n}`)
    groups.set(m, [...(groups.get(m) ?? []), n])
  }
  return [...groups.entries()]
    .map(([method, categories]) => ({ method, categories }))
    .sort((a, b) => METHOD_RANK[a.method] - METHOD_RANK[b.method])
}

/** "1", "1 and 2", "1, 2 and 4". */
export const listNumbers = (ns: readonly number[]): string =>
  ns.length <= 1 ? ns.join('') : `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`

/** "Category 5 (waste generated in operations)" or "Categories 1, 2 and 4 (purchased goods and services;
 *  capital goods; upstream transportation and distribution)". One form for one category or many, so the
 *  guard test reads every heading the same way. Semicolons between titles, because several titles contain
 *  "and" and a comma-and list of them would not parse for a reader. */
export function categoryHeading(ns: readonly number[]): string {
  return `${ns.length === 1 ? 'Category' : 'Categories'} ${listNumbers(ns)} (${ns.map(n => SCOPE3_CATEGORY_NAMES[n]).join('; ')})`
}

/**
 * What a method adds for SOME of its categories only. The EXIOBASE description covers every category it
 * prices; supplier-specific figures exist for Category 1 alone, so that sentence names Category 1 rather
 * than implying all three accept them.
 */
const METHOD_SUFFIX: Partial<Record<Scope3Method, (ns: readonly number[]) => string>> = {
  exiobase_spend: ns => (ns.includes(1) ? ' For Category 1, supplier-specific figures, where entered, are used instead.' : ''),
}

/**
 * Which categories accept a figure entered directly in place of their estimate, and which do not, read
 * from METHOD_TAKES_ENTERED_FIGURE through the same method map the calculator dispatches on.
 *
 * ⚠️ IT REPLACED "WHERE A FIGURE IS ENTERED DIRECTLY, IT IS USED INSTEAD OF ANY ESTIMATE", which said it of
 * every category. It stopped being true of Category 5 on 18 Sep 2026, when row-priced categories stopped
 * taking an entered figure, and it had never been true of Categories 6 and 7, whose calculators ignore one.
 */
export function enteredFigureSentence(): string {
  const takes = SCOPE3_CATEGORY_NUMBERS.filter(n => METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(`cat${n}`)])
  const not = SCOPE3_CATEGORY_NUMBERS.filter(n => !METHOD_TAKES_ENTERED_FIGURE[scope3MethodFor(`cat${n}`)])
  const word = (ns: readonly number[]) => (ns.length === 1 ? 'Category' : 'Categories')
  return [
    takes.length > 0 && `For ${word(takes)} ${listNumbers(takes)}, a figure entered directly is used instead of any estimate.`,
    not.length > 0 && `${word(not)} ${listNumbers(not)} ${not.length === 1 ? 'takes' : 'take'} no entered figure: ${not.length === 1 ? 'it is' : 'they are'} calculated only from the data ${not.length === 1 ? 'its' : 'their'} method asks for.`,
  ].filter(Boolean).join(' ')
}

/** The methodology page's "Calculation hierarchy": the opening sentence, then one line per method. */
export function methodologyHierarchyLines(): string[] {
  return [
    `Each Scope 3 category is calculated by one of the methods below, and every export names the method used for each category in that inventory. ${enteredFigureSentence()}`,
    ...scope3MethodGroups().map(g =>
      `${categoryHeading(g.categories)}: ${scope3MethodDescription(g.method)}${METHOD_SUFFIX[g.method]?.(g.categories) ?? ''}`,
    ),
  ]
}

// ── THE ASSISTANT PROMPT'S SCOPE 3 CLAUSE ─────────────────────────────────────────────────────────

/**
 * Short, spoken-register wording per method for the assistant. The long descriptions above are for a
 * reader of the methodology page; the assistant needs the claim, not the licence text.
 *
 * ⚠️ WORDED AS THE PROMPT ALREADY WORDED THEM, except where a category joining a method made the old
 * words false: EXIOBASE now prices Category 2 by PRODUCT, so "by sector and country" became "by sector or
 * product and country", and supplier-specific figures are named as Category 1's alone. Every figure is
 * READ from its record — the EXIOBASE version, the DEFRA year, the flat factor.
 */
const ASSISTANT_METHOD_PHRASE: Readonly<Record<Scope3Method, (ns: readonly number[]) => string>> = {
  exiobase_spend: ns =>
    `priced from EXIOBASE ${SPEND_EF_SOURCES.exiobase_38.version} through a named factor edition, by sector or product and country` +
    (ns.includes(1) ? ', and for Category 1 also from supplier-specific figures where the customer enters them' : ''),
  waste_factors: () =>
    `priced from the UK DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste factors, per material and treatment route`,
  end_of_life_factors: () =>
    `priced from the same UK DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste factors, per material and treatment route, applied to the tonnes of sold products reaching end of life as the customer splits them across routes`,
  // Lowercase predicate fragment, like the rest: assistantScope3Basis joins these with semicolons. The
  // year is READ from the record, as the waste and travel phrases read theirs.
  fuel_and_energy_upstream: () =>
    `derived from the energy already recorded in the bound GHG inventory and priced on the UK DEFRA/DESNZ ` +
    `${DEFRA_ENERGY_META.year} upstream factors, well-to-tank for fuels and generation, transmission and ` +
    `distribution for electricity and heat, excluding the combustion already counted in Scope 1 and Scope 2`,
  business_travel_factors: () => CAT6_ASSISTANT_PHRASE,
  employee_commuting_factors: () => CAT7_ASSISTANT_PHRASE,
  pcaf: () => 'assessed through a PCAF-aligned path',
  // A lowercase predicate fragment, like the others: assistantScope3Basis joins these with semicolons.
  // ⚠️ IT DESCRIBES AN ABSENCE, SO IT MUST NOT READ AS A WEAK METHOD. "estimated roughly" or "priced from a
  // generic factor" would both be false; nothing is priced. It also says what is accepted, because the
  // assistant is asked "can I do Category 11" and the answer is yes if you have the number.
  no_method: () =>
    'not calculated by ThemisIQ: no emission factor is applied and no estimate is produced, though a figure you enter yourself is used as given',
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']

/**
 * The per-category clause of the assistant's Scope 3 bullet, then the sentence that warns about the flat
 * group — with the flat group's size COUNTED, never typed. "The remaining ten" was right once and wrong
 * for as long as nobody re-read the prompt.
 *
 * Groups whose phrase is identical are merged into one clause. Categories 6 and 7 were merged that way while
 * both rested on fixed factors; since 19 Sep 2026 Category 6 has its own phrase, so each has its own clause.
 *
 * ⚠️ NO TRAILING FULL STOP. The bullet this completes has always ended "…for each category" with the next
 * bullet on the following line; the text around it is unchanged.
 */
export function assistantScope3Basis(): string {
  const merged: { categories: number[]; phrase: string }[] = []
  for (const g of scope3MethodGroups()) {
    const phrase = ASSISTANT_METHOD_PHRASE[g.method](g.categories)
    const same = merged.find(m => m.phrase === phrase)
    if (same) same.categories = [...same.categories, ...g.categories].sort((a, b) => a - b)
    else merged.push({ categories: [...g.categories], phrase })
  }
  // Every clause carries its own verb. The hand-typed text let the first clause's "is priced" carry the
  // rest by ellipsis, which only reads while the EXIOBASE clause happens to come first.
  const clauses = merged.map(m => `${categoryHeading(m.categories)} ${m.categories.length === 1 ? 'is' : 'are'} ${m.phrase}`)
  const joined = clauses.length <= 1 ? clauses.join('') : `${clauses.slice(0, -1).join('; ')}; and ${clauses[clauses.length - 1]}`
  // ⚠️ THE FLAT-FACTOR WARNING IS GONE BECAUSE THE FLAT FACTOR IS (25 Sep 2026). It read "Those six are a
  // rough order-of-magnitude estimate, not a sourced figure", which was the right thing to say while an
  // unsourced figure was being summed into the total. The clause for those six now says they are not
  // calculated at all, so a warning about the quality of their estimate would describe something that does
  // not happen, and a reader would take "rough estimate" to mean a figure exists.
  //   ⚠️ NO PLACEHOLDER IS LEFT BEHIND FOR IT. A lookup that can never match is worse than nothing: it
  // reads as live machinery and the comment beside it goes stale unnoticed. If a future method produces an
  // unsourced figure, the warning is written then, against that method.
  return `${joined}. Every export names the method used for each category`
}

// ── THE GWP BASIS OF SCOPE 3 FIGURES, FOR THE ASSISTANT ───────────────────────────────────────────

/**
 * What each Scope 3 method's figures are on, as far as a RECORD states it.
 *
 * ⚠️ READ FROM THE RECORDS, NOT TYPED, WHERE A RECORD CARRIES A BASIS. Only the DEFRA/DESNZ waste record
 * (DEFRA_WASTE_META.gwp_basis, 'AR5') and, since 19 Sep 2026, the business travel record
 * (DEFRA_TRAVEL_META.gwp_basis, 'AR5') do, and Category 7 reads the same record. The EXIOBASE source record
 * carries no GWP field, and the flat-spend factor has no recorded source at all, so those methods are
 * 'not_recorded' and the assistant is told nothing about them rather than something invented. Category 15
 * is 'investee': each investee's own basis, which ThemisIQ neither re-bases nor records.
 *
 * A Record, so a new method fails tsc here until someone decides what its figures are on.
 */
type Scope3GwpSource =
  | { kind: 'publisher'; basis: string; publisher: string }
  | { kind: 'investee' }
  | { kind: 'not_recorded' }

const DEFRA_WASTE_GWP: Scope3GwpSource = {
  kind: 'publisher',
  basis: DEFRA_WASTE_META.gwp_basis,
  publisher: `UK DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste factors`,
}

const METHOD_GWP: Readonly<Record<Scope3Method, Scope3GwpSource>> = {
  exiobase_spend: { kind: 'not_recorded' },
  waste_factors: DEFRA_WASTE_GWP,
  end_of_life_factors: DEFRA_WASTE_GWP,
  // The business travel record states its basis (DEFRA_TRAVEL_META.gwp_basis, 'AR5'), as the waste one does.
  business_travel_factors: {
    kind: 'publisher',
    basis: DEFRA_TRAVEL_META.gwp_basis,
    publisher: `UK DEFRA/DESNZ ${DEFRA_TRAVEL_META.year} business travel factors`,
  },
  // The same DEFRA/DESNZ record as Category 6, named for the sheets Category 7 reads, so the two categories
  // keep their own clauses in the assistant's GWP rule.
  employee_commuting_factors: {
    kind: 'publisher',
    basis: DEFRA_TRAVEL_META.gwp_basis,
    publisher: `UK DEFRA/DESNZ ${DEFRA_TRAVEL_META.year} land travel and homeworking factors`,
  },
  // 'not_recorded' still, and for a stronger reason than before: there is no figure whose GWP basis could
  // be recorded. An entered figure's basis is whatever the customer's own reporting used, which this
  // platform does not know and must not assert.
  no_method: { kind: 'not_recorded' },
  // The energy artefact states its basis in its own metadata (DEFRA_ENERGY_META.gwp_basis, 'AR5'), the
  // way the waste and travel records do. Named for the sheets Category 3 reads, so it keeps its own
  // clause rather than merging into the waste one.
  fuel_and_energy_upstream: {
    kind: 'publisher',
    basis: DEFRA_ENERGY_META.gwp_basis,
    publisher: `UK DEFRA/DESNZ ${DEFRA_ENERGY_META.year} upstream energy factors`,
  },
  pcaf: { kind: 'investee' },
}

/**
 * The Scope 3 part of the assistant's GWP-uniformity rule: which categories rest on a publisher's combined
 * basis, and which on each investee's own. Categories come from the method map, bases from the records.
 */
export function assistantScope3GwpClause(): string {
  const publisherGroups = new Map<string, { basis: string; publisher: string; categories: number[] }>()
  const investee: number[] = []
  for (const g of scope3MethodGroups()) {
    const src = METHOD_GWP[g.method]
    if (src.kind === 'publisher') {
      const key = `${src.publisher}|${src.basis}`
      const e = publisherGroups.get(key) ?? { basis: src.basis, publisher: src.publisher, categories: [] }
      e.categories.push(...g.categories)
      publisherGroups.set(key, e)
    } else if (src.kind === 'investee') {
      investee.push(...g.categories)
    }
  }
  const word = (ns: readonly number[]) => (ns.length === 1 ? 'Category' : 'Categories')
  const parts = [
    ...[...publisherGroups.values()].map(e => {
      const ns = [...e.categories].sort((x, y) => x - y)
      return `${word(ns)} ${listNumbers(ns)} ${ns.length === 1 ? 'uses' : 'use'} the ${e.publisher}, which their publisher combined on ${e.basis}`
    }),
    investee.length > 0 &&
      // The shared sentence's own words after the subject: CAT15_GWP_TAIL, verbatim.
      `${word(investee)} ${listNumbers(investee)} ${investee.length === 1 ? 'uses' : 'use'} investee emissions ${CAT15_GWP_TAIL}`,
  ].filter((x): x is string => typeof x === 'string' && x.length > 0)
  return parts.length > 0 ? `In the Scope 3 module, ${parts.join('; ')}.` : ''
}
