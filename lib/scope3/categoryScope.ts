// ── WHICH EXIOBASE ROWS BELONG TO WHICH SPEND-PRICED CATEGORY ───────────────────────────────────
//
// The Scope 3 categories have boundaries, and EXIOBASE's classification does not know about them. Every
// row in both tables is a real, priceable row; the question this module answers is which of them a
// customer pricing a PARTICULAR category should be offered first. Read by the Cat 1, Cat 2 and Cat 4
// pickers in app/dashboard/scope3/page.tsx.
//
// ⚠️ THIS IS A STEER, NOT A FILTER, AND THAT DISTINCTION IS THE WHOLE DESIGN. The picker shows the
// in-scope rows by default and every other row behind "show all", each carrying the reason it is unusual
// here. Choosing one is allowed and disclosed — in the panel and in the export — never blocked, and a
// value already stored stays visible whatever the rules later say. The precedent is the transport-margin
// finding of 17 Sep 2026: filtering EXIOBASE's `type` would have hidden air, sea and rail freight
// services, which are exactly what Cat 4 buys. A hidden row is a customer's judgement overruled silently;
// a labelled row is a customer's judgement informed.
//
// ⚠️ PREFIX FAMILIES, NOT A LIST OF CODES. A hand list of 200 products × 3 categories drifts the moment
// EXIOBASE renumbers, and a reader cannot tell a deliberate exclusion from an omission. Families are
// matched on the code with its leading letter dropped, so one rule serves both tables: products are
// p60.1, p90.1.a … and industries i60.1, i90.1.a … with the same numbering. categoryScope.test.ts fails
// if a family stops matching anything, so a classification change is loud rather than silent.
//
// ⚠️ THE FALLBACK DIFFERS BY CATEGORY, BECAUSE THE CATEGORIES ARE DEFINED DIFFERENTLY. Cat 1 is the
// RESIDUAL category — everything bought that is not another category's — so a row no family names is in
// scope for it. Cat 2 and Cat 4 are defined by what they cover (capitalised assets; transport and
// warehousing of purchased goods), so a row no family names is OUT for them. That asymmetry is in the
// GHG Protocol, not a convenience.

export type SpendCategoryId = 'cat1' | 'cat2' | 'cat4'

export interface ScopeFamily {
  /** Stable id, for tests and for the reason shown beside a row. */
  id: string
  /** What this family is, in a customer's words. */
  label: string
  /**
   * Code prefixes with the leading p/i dropped: '90' matches p90, p90.1.a and i90.1.a. '55' matches p55
   * and nothing else, because the matcher requires the prefix to END the code or be followed by '.' —
   * ⚠️ so a prefix never carries its own trailing dot: '90.' would match p90..x and therefore nothing.
   */
  prefixes: readonly string[]
  /** The categories this family is offered in by default. Empty = offered in none of the three. */
  categories: readonly SpendCategoryId[]
  /** Why, for a reader of the picker. Names the category that DOES own it wherever one does. */
  reason: string
  /**
   * ⚠️ SET WHERE EXIOBASE PUTS TWO THINGS IN ONE ROW, so exclusion cannot separate them and a label has
   * to do the work instead. Shown beside the row in every category that offers it.
   */
  jointNote?: string
}

/**
 * ⚠️ ORDER MATTERS: the first family whose prefix matches wins. Secondary materials are first because
 * they share numbering with the commodities they are re-processed from — p27.a.w sits under p27.a — and
 * the specific families ('45') precede nothing that would swallow them.
 */
export const SCOPE_FAMILIES: readonly ScopeFamily[] = [
  {
    id: 'secondary_material',
    label: 'Secondary material for treatment',
    // The '.w' rows: EXIOBASE's waste-treatment flows for recycled content. A suffix rather than a
    // prefix, and the one family matched that way — p45.w must not fall into the construction family.
    prefixes: ['.w'],
    categories: [],
    reason: 'secondary material — EXIOBASE publishes no spend intensity for these in any region, so this cannot be priced. Ask the supplier for the emissions attributable to what you bought.',
  },
  {
    id: 'waste_treatment',
    label: 'Waste treatment services',
    prefixes: ['90'],
    categories: [],
    reason: 'waste treatment — Category 5 covers the waste your operations generate, and prices it per tonne from the DEFRA/DESNZ factors rather than from spend.',
  },
  {
    id: 'electricity',
    label: 'Electricity generation, transmission and distribution',
    prefixes: ['40.11', '40.12', '40.13'],
    categories: [],
    reason: 'electricity — purchased power is Scope 2, and its upstream and grid losses are Category 3. Pricing it here would count it twice.',
  },
  {
    id: 'fuels',
    label: 'Refined fuels and coke',
    prefixes: ['23'],
    categories: [],
    reason: 'fuel — fuel you buy and burn is Scope 1, and its upstream is Category 3. Pricing it here would count it twice.',
  },
  {
    id: 'renting',
    label: 'Renting of machinery and equipment',
    prefixes: ['71'],
    categories: [],
    reason: 'renting — an asset you rent or lease rather than own is Category 8 (upstream leased assets), not a capital purchase.',
  },
  {
    id: 'transport_services',
    label: 'Transport and warehousing services',
    prefixes: ['60.1', '60.2', '60.3', '61.1', '61.2', '62', '63'],
    categories: ['cat4'],
    reason: 'transport service — freight you pay for between your suppliers and you is Category 4.',
    jointNote: 'EXIOBASE does not separate freight from passenger transport: this one row covers both, so use it for freight here and keep business travel in Category 6.',
  },
  {
    id: 'construction',
    label: 'Construction work',
    prefixes: ['45'],
    categories: ['cat1', 'cat2'],
    // ⚠️ A SERVICE THAT IS A CAPITAL GOOD. "No services in Cat 2" would have excluded the largest
    // capital purchase most companies ever make, because a building arrives as construction work.
    reason: 'construction work — capitalised as a building or structure, so it belongs in Category 2 as well as in Category 1.',
  },
  {
    id: 'capital_equipment',
    label: 'Machinery, equipment, vehicles and furniture',
    prefixes: ['28', '29', '30', '31', '32', '33', '34', '35', '36'],
    categories: ['cat1', 'cat2'],
    // ⚠️ IN BOTH, DELIBERATELY. The Cat 1 / Cat 2 split is by ACCOUNTING TREATMENT, not product type: the
    // same laptop is Cat 1 expensed and Cat 2 capitalised. Offering these in Cat 1 too is what keeps the
    // customer's books, rather than this file, deciding which category a purchase lands in.
    reason: 'capital equipment — Category 2 when you capitalise it, Category 1 when you expense it. Your accounting treatment decides, not the product.',
  },
  {
    id: 'hotels_restaurants',
    label: 'Hotel and restaurant services',
    prefixes: ['55'],
    categories: ['cat1'],
    reason: 'hotels and restaurants — catering and hospitality you buy are Category 1.',
    jointNote: 'EXIOBASE puts hotels and restaurants in one row. Restaurant and catering spend belongs here; accommodation for business travel belongs in Category 6.',
  },
  {
    id: 'post_telecom',
    label: 'Post and telecommunication services',
    prefixes: ['64'],
    categories: ['cat1', 'cat4'],
    reason: 'post and telecommunications — telecoms is an ordinary Category 1 purchase; courier and parcel carriage of goods you bought is Category 4.',
    jointNote: 'EXIOBASE puts post and telecommunications in one row, so the same row serves a phone bill and a courier invoice. Put it where the spend actually went.',
  },
] as const

/**
 * What each category BUYS, for the sentence on its picker: "the products usual for capital goods".
 *
 * ⚠️ IT LIVES HERE, BESIDE THE RULES THAT DECIDE THE LIST. The control that opens a picker out to the full
 * table has to name the list it is currently showing — an action-only label ("Show every EXIOBASE
 * product") leaves a customer unable to tell a scoped list from a full one without pressing it, which is
 * exactly how the scoped default was mistaken for no default at all on 17 Sep 2026.
 */
export const CATEGORY_SCOPE_LABEL: Readonly<Record<SpendCategoryId, string>> = {
  cat1: 'purchased goods and services',
  cat2: 'capital goods',
  cat4: 'transport and distribution',
}

/** Cat 1 is the residual category: a row no family names belongs to it. Cat 2 and Cat 4 are defined by
 *  what they cover, so an unnamed row is out of scope for them. */
const DEFAULT_IN_SCOPE: Readonly<Record<SpendCategoryId, boolean>> = { cat1: true, cat2: false, cat4: false }

/** The code without its table letter: 'p60.1' and 'i60.1' both give '60.1'. */
const bareCode = (code: string): string => code.replace(/^[pi]/, '')

const matchesPrefix = (bare: string, prefix: string): boolean => {
  if (prefix.startsWith('.')) return bare.endsWith(prefix) || bare.includes(`${prefix}.`)
  return bare === prefix || bare.startsWith(`${prefix}.`)
}

/** The family a code belongs to, or null when no family names it. First match wins; see SCOPE_FAMILIES. */
export function familyFor(code: string): ScopeFamily | null {
  const bare = bareCode(code)
  return SCOPE_FAMILIES.find(f => f.prefixes.some(p => matchesPrefix(bare, p))) ?? null
}

/** Is this row offered by default when pricing this category? */
export function inScopeFor(catId: SpendCategoryId, code: string): boolean {
  const family = familyFor(code)
  return family ? family.categories.includes(catId) : DEFAULT_IN_SCOPE[catId]
}

/**
 * What to show beside a row: the family's joint note where it has one and the row IS offered here, or the
 * reason it is unusual here where it is not. Null for an ordinary in-scope row.
 *
 * ⚠️ THE OUT-OF-SCOPE REASON IS SHOWN, NOT ENFORCED. It is the sentence a customer reads before choosing,
 * and the sentence the export carries if they choose it anyway.
 */
export function scopeNote(catId: SpendCategoryId, code: string): string | null {
  const family = familyFor(code)
  if (!family) return null
  if (family.categories.includes(catId)) return family.jointNote ?? null
  return family.reason
}

/** For the panel and the CSV: what to say about a figure priced from a row outside this category's
 *  boundary. Null when the row is in scope, which is the ordinary case. */
export function outOfScopeDisclosure(catId: SpendCategoryId, code: string): string | null {
  if (!code || inScopeFor(catId, code)) return null
  const family = familyFor(code)
  return `This figure is priced from ${family ? `a row this module treats as ${family.label.toLowerCase()}` : 'a row outside this category\'s usual boundary'}: ${family?.reason ?? 'it is not one of the rows normally offered here.'} It is included as entered.`
}
