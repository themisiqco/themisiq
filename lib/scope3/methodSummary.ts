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

import { scope3MethodFor, scope3MethodDescription, type Scope3Method } from './categoryMethods'
import { SPEND_EF_SOURCES } from '../emissionFactors/spend'
import { DEFRA_WASTE_META } from '../emissionFactors/defraWaste'
import { GENERIC_SPEND_FACTOR } from '../emissionFactors'

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
  waste_factors: 2,
  travel_factors: 3,
  commuting_factors: 4,
  pcaf: 5,
  flat_spend: 6,
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

/** The methodology page's "Calculation hierarchy": the opening sentence, then one line per method. */
export function methodologyHierarchyLines(): string[] {
  return [
    'Each Scope 3 category is calculated by one of the methods below, and every export names the method used for each category in that inventory. Where a figure is entered directly, it is used instead of any estimate.',
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
  travel_factors: () => 'priced from fixed factors that carry no recorded source, year or region',
  commuting_factors: () => 'priced from fixed factors that carry no recorded source, year or region',
  pcaf: () => 'assessed through a PCAF-aligned path',
  flat_spend: () =>
    `priced from ONE flat factor of ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e per unit of the inventory's currency, the same whatever was bought, with no source, year or region recorded`,
}

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen']

/**
 * The per-category clause of the assistant's Scope 3 bullet, then the sentence that warns about the flat
 * group — with the flat group's size COUNTED, never typed. "The remaining ten" was right once and wrong
 * for as long as nobody re-read the prompt.
 *
 * Groups whose phrase is identical are merged into one clause, so Categories 6 and 7 read as the prompt
 * always read them — one clause, "from fixed factors…" — although they are two methods in the map.
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
  const flat = scope3MethodGroups().find(g => g.method === 'flat_spend')
  const warning = !flat ? ''
    : flat.categories.length === 1 ? ' That one is a rough order-of-magnitude estimate, not a sourced figure,'
    : ` Those ${NUMBER_WORDS[flat.categories.length]} are a rough order-of-magnitude estimate, not a sourced figure,`
  return `${joined}.${warning}${warning ? ' and every' : ' Every'} export names the method used for each category`
}
