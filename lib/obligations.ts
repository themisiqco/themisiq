// lib/obligations.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE mapping a regulatory obligation → the ThemisIQ modules that answer it.
//
// WHY. /assess, /materiality and /pricing each held their own hand-written cards saying which
// modules answer which rule, with their own module lists, their own descriptions and their own
// prices. Three copies of one fact drift: /assess routed CSRD on a 500-employee threshold the
// engine had already moved to 1,000 with a turnover limb, and /materiality priced two
// "Compliance Packs" against a pack model removed in July 2026. This file is the fact; the
// surfaces render it.
//
// NO DATES IN THIS FILE. Application dates live in lib/aiAct.ts, lib/cs3d.ts and lib/sb253.ts,
// and lib/aiAct.test.ts / lib/cs3d.test.ts / lib/sb253.test.ts scan app/ and lib/ for literals —
// so a date written here fails the build. That is deliberate: an obligation's date and the
// modules that answer it change on different schedules and for different reasons.
//
// NO THRESHOLDS EITHER. Whether an obligation APPLIES to a given company is decided by
// THRESHOLD_TESTS in lib/deals/assessment.ts, which carries per-limb figures, comparisons and
// citations. This file answers a different question: given that it applies, what do you buy.
// ─────────────────────────────────────────────────────────────────────────────

import {
  FLAT_MODULE_PRICES,
  GHG_TIERS,
  LEGACY_PRICING_PAGE_ID,
  cartQuote,
  type GhgTier,
  type ModuleKey,
} from './pricing'

// The shorthand vocabulary /order and /pricing accept ('risk', 'supply', 'ai', …) is DERIVED by
// inverting LEGACY_PRICING_PAGE_ID, never restated. That map's own comment records the hazard:
// consumers `.filter(Boolean)` on it, so an unmapped id is silently dropped from the cart and a
// customer could select a module, pay, and not receive it. Restating the vocabulary here would
// create a second list to keep in step; inverting it means an unmapped ModuleKey is a type error
// at the point of use rather than a missing module in a paid cart.
const SHORTHAND: Record<ModuleKey, string> = Object.fromEntries(
  Object.entries(LEGACY_PRICING_PAGE_ID).map(([shorthand, key]) => [key, shorthand]),
) as Record<ModuleKey, string>

export type ObligationId =
  | 'sb253'
  | 'sb261'
  | 'ifrs-s2'
  | 'cbam'
  | 'cs3d'
  | 'eu-ai-act'
  | 'nis2'
  | 'dora'
  | 'sec-cyber'
  | 'eu-pay-transparency'
  | 'ca-pay-data'
  | 'sec-item-101'
  | 'modern-slavery'
  | 'cdp'
  | 'ecovadis'
  | 'lp-lender-esg'

export interface Obligation {
  id: ObligationId
  name: string
  // The modules that answer it, IN THE ORDER A BUYER SHOULD TAKE THEM — first entry first. Where
  // one module produces the input another consumes, the producer comes first.
  modules: ModuleKey[]
  // One plain-language line per module, saying what that module does FOR THIS OBLIGATION — not what
  // the module is in general. Keyed by ModuleKey so a line cannot drift onto the wrong module, and
  // partial so a surface can render a module with no line rather than an empty string.
  does: Partial<Record<ModuleKey, string>>
}

// ── The map ──────────────────────────────────────────────────────────────────
//
// ⚠️ CSRD IS DELIBERATELY ABSENT. CSRD requires ESRS G1 business conduct, and NO MODULE COVERS G1 —
// see docs/people-governance-module-roadmap.md. An entry mapping CSRD to the modules that answer
// its climate and workforce standards would sell a partial answer as a whole one, on the surface a
// buyer uses to decide what to buy. THE ENTRY LANDS WHEN G1 SHIPS, NOT BEFORE. Do not add it to
// make the table look complete.
//
// ⚠️ `cs3d` COVERS THE CHAIN OF ACTIVITIES ONLY. The Directive's duty also reaches the company's OWN
// OPERATIONS AND SUBSIDIARIES, and nothing in the platform addresses that half — same roadmap. The
// entry is honest about what it answers, not about the whole statute, and its `does` line says so.
// This is the same discipline THRESHOLD_TESTS['CS3D'] applies with `exhaustive: false`: modelling
// one route is not modelling the instrument.
export const OBLIGATIONS: Record<ObligationId, Obligation> = {
  'sb253': {
    id: 'sb253',
    name: 'California SB 253 — Climate Corporate Data Accountability Act',
    modules: ['ghg'],
    does: {
      ghg: 'Builds the Scope 1 and 2 inventory and exports it on the CARB template, with every figure traceable to a source document.',
    },
  },

  'sb261': {
    id: 'sb261',
    name: 'California SB 261 — Climate-Related Financial Risk Act',
    modules: ['climate-risk'],
    does: {
      'climate-risk': 'Produces the TCFD-aligned climate financial-risk report across three IPCC scenarios.',
    },
  },

  'ifrs-s2': {
    id: 'ifrs-s2',
    name: 'IFRS S2 — Climate-related Disclosures',
    // GHG first: the inventory is the metrics half, and the risk assessment cites it.
    modules: ['ghg', 'climate-risk'],
    does: {
      ghg: 'Supplies the Scope 1, 2 and 3 figures IFRS S2 requires as metrics and targets.',
      'climate-risk': 'Covers governance, strategy and risk management, including single materiality and scenario analysis.',
    },
  },

  'cbam': {
    id: 'cbam',
    name: 'EU CBAM — Carbon Border Adjustment Mechanism',
    modules: ['cbam'],
    does: {
      cbam: 'Computes specific embedded emissions per good from installation-level actuals, and builds the summary your EU customer carries into their declaration.',
    },
  },

  'cs3d': {
    id: 'cs3d',
    name: 'EU CS3D — Corporate Sustainability Due Diligence',
    modules: ['supply-chain'],
    does: {
      // States the boundary IN THE CUSTOMER-FACING LINE, not only in a comment: a buyer reading
      // this must not infer that buying Supply Chain discharges the whole duty.
      'supply-chain': 'Runs human-rights and environmental due diligence across your chain of activities — supplier risk scoring, questionnaires and remediation tracking. Does not cover the duty over your own operations and subsidiaries.',
    },
  },

  'eu-ai-act': {
    id: 'eu-ai-act',
    name: 'EU AI Act — Artificial Intelligence Regulation',
    modules: ['ai-governance'],
    does: {
      'ai-governance': 'Inventories your AI systems, classifies them against the high-risk criteria, and prepares Article 11 technical documentation and registration.',
    },
  },

  // THE THREE CYBER OBLIGATIONS SHARE ONE CONTROL SET AND DIFFER BY COVERAGE, NOT BY MECHANISM.
  // app/dashboard/cyber/page.tsx holds 25 controls, each tagged per framework, and `calcScore`
  // filters to the ones the selected frameworks reach: NIS2 19, DORA 21, SEC 5. Only 2 / 4 / 1 are
  // unique to each. So the `does` lines below name the COUNT and the UNIQUE controls — that is the
  // honest difference. Saying "runs the gap assessment" three times described the module, not the
  // obligation, and a buyer comparing the three learned nothing from it.
  'nis2': {
    id: 'nis2',
    name: 'EU NIS2 — Network and Information Security Directive',
    modules: ['cyber'],
    does: {
      cyber: 'Scores you against the 19 controls NIS2 reaches, including the two it alone requires — a maintained asset inventory and a documented notification procedure for the 24-hour early warning and 72-hour full report.',
    },
  },

  'dora': {
    id: 'dora',
    name: 'DORA — Digital Operational Resilience Act',
    modules: ['cyber'],
    does: {
      cyber: 'Scores you against the 21 controls DORA reaches — the widest of the three cyber regimes — including its four unique ones: incident classification, resilience testing, an access-review process, and the critical third-party provider register.',
    },
  },

  'sec-cyber': {
    id: 'sec-cyber',
    name: 'SEC Cybersecurity Disclosure Rules',
    modules: ['cyber'],
    does: {
      cyber: 'Scores you against the 5 controls the SEC rules reach — the narrowest of the three — of which four are shared with NIS2 and DORA. The one it alone requires is the 8-K materiality assessment for deciding whether an incident is disclosable.',
    },
  },

  'eu-pay-transparency': {
    id: 'eu-pay-transparency',
    name: 'EU Pay Transparency Directive',
    modules: ['people'],
    does: {
      people: 'Calculates the gender pay gap by job band and flags where a gap triggers a joint pay assessment.',
    },
  },

  'ca-pay-data': {
    id: 'ca-pay-data',
    name: 'California Pay Data Reporting',
    modules: ['people'],
    does: {
      people: 'Assembles pay data by race, ethnicity, sex and job category for the annual state submission.',
    },
  },

  // MAPPED TO `people` ON THE MODULE'S OWN CLAIM, NOT ON THE NAME MATCHING. The People dashboard
  // already lists SEC Item 101 in its framework picker, and its inputs were checked one by one
  // against what /assess says the disclosure covers — workforce size, turnover, safety, training.
  // Three of the four are collected; TURNOVER IS NOT, anywhere in the module. The `does` line says
  // so, on the same reasoning as `cs3d`: a buyer reading this must not infer that buying People
  // fills the whole 10-K section. It is also HOURS the module records, not spend — a near-miss that
  // would have been easy to write as "training investment" because /assess uses that phrase.
  'sec-item-101': {
    id: 'sec-item-101',
    name: 'SEC Item 101 — Human Capital Disclosure',
    modules: ['people'],
    does: {
      people: 'Supplies three of the four figures the 10-K human capital section reports: global headcount and headcount by job band, LTIFR and TRIR for safety, and average training hours by gender — hours, not spend. Turnover is not collected and has to come from your HR system.',
    },
  },

  'modern-slavery': {
    id: 'modern-slavery',
    name: 'Modern Slavery Act — UK and Australia',
    modules: ['supply-chain'],
    does: {
      'supply-chain': 'Sends the modern-slavery questionnaire — policy, risk assessment, recruitment fees, ILO 138 minimum age, grievance mechanism, training — and risk-scores which suppliers to send it to first by country, sector and spend.',
    },
  },

  // CDP AND ECOVADIS ARE BOTH REQUEST-DRIVEN AND ANSWER TO DIFFERENT MODULES. Neither has a size
  // test — a customer or investor asks, and that is the whole trigger — so a buyer meets them
  // together and needs to know they are not one purchase. CDP's scored sections are emissions, so it
  // is GHG; EcoVadis's are procurement practice, so it is Supply Chain. Each `does` line names the
  // SECTIONS OR THEMES the module actually fills, because "supports EcoVadis" told a buyer nothing
  // about which of the four scored themes they would still be answering by hand.
  'cdp': {
    id: 'cdp',
    name: 'CDP Climate — annual disclosure',
    modules: ['ghg'],
    does: {
      ghg: 'Feeds the C6, C7 and C11 emissions sections directly from your inventory, on the CDP-required GWP basis.',
    },
  },

  // GHG FIRST: the inventory is the input, and the Environment theme is scored on it. Supply Chain
  // alone left one of the four scored themes unanswerable, which is a gap a buyer would only find
  // after paying — so it is closed by the mapping rather than disclosed in the copy.
  'ecovadis': {
    id: 'ecovadis',
    name: 'EcoVadis Sustainability Rating',
    modules: ['ghg', 'supply-chain'],
    does: {
      ghg: 'Produces the Scope 1, 2 and 3 figures the Environment theme is scored on, as a dated inventory traceable to source documents rather than a self-declared number.',
      'supply-chain': 'Answers the Sustainable Procurement theme with documents rather than assertions — a supplier risk register, the questionnaires you issued and the responses returned — and gap-analyses the scorecard to show which criteria you hold no evidence for.',
    },
  },

  // TWO HALVES OF ONE ASK, and an LP wants both: diligence at the point of capital deployment, and
  // emissions across what is already held. Deals leads because it is the artefact the LP asks for by
  // name; GHG carries the portfolio half — financed emissions live behind the GHG entitlement.
  'lp-lender-esg': {
    id: 'lp-lender-esg',
    name: 'LP and lender ESG requirements',
    modules: ['deals', 'ghg'],
    does: {
      deals: 'Turns "we diligence ESG" into a file an LP can audit: per-target screening, material findings by sector and jurisdiction, and a remediation cost estimate carried as a percentage of deal value into the IC memo.',
      ghg: 'Covers the portfolio half — financed emissions by PCAF asset class, on the denominator each class requires, so climate exposure is reported across holdings and not only at the point of investment.',
    },
  },
}

// ── Drivers ──────────────────────────────────────────────────────────────────
//
// A SEPARATE MAP WITH ITS OWN TYPE, AND DELIBERATELY NOT PART OF `OBLIGATIONS`.
//
// /assess asks what is prompting the visitor. An obligation has an identity independent of the
// company — SB 253 is SB 253 for every reader — whereas a driver is a fact ABOUT the visitor, and
// "our board wants it" names no instrument. They are circumstances, not rules.
//
// KEEPING THEM OUT OF `OBLIGATIONS` IS WHAT STOPS `obligationsForModule` RETURNING A CIRCUMSTANCE AS
// COVERAGE. That accessor exists so a module page can list what the module answers; add a driver as
// an obligation row and it returns 'Board ESG Governance Programme' among the things GHG covers,
// which then renders on a module page as a coverage claim about the product. A distinct type makes
// that unrepresentable rather than merely discouraged.
//
// SAME FILE, though, because the module vocabulary, the SHORTHAND inversion and the price helpers
// all live here. Rebuilding any of them in /assess is exactly the three-copies drift this file was
// created to end — the reason it exists is that /assess, /materiality and /pricing each kept their
// own module lists.
export type DriverId = 'regulatory' | 'customer' | 'investor' | 'bank' | 'board' | 'ahead'

// PRIVATE, and keyed so that `regulatory` HAS NO ENTRY TO WRITE. It was `regulatory: []`, and that
// empty array meant "defer to the obligations" — a value that is PRESENT, VALID, AND MEANS SOMETHING
// OTHER THAN WHAT IT LOOKS LIKE. A comment asked readers not to render it as a list; a comment is not
// a type. That is the same shape as the `ghg_location_allowance` metadata key documented on
// `obligationPrice` below: the writer omitted it, the webhook read absence as null, the trigger read
// null as UNCAPPED, and every manually-invoiced GHG customer silently received unlimited locations.
// Nothing failed — a wrong value was simply available to anyone who read it without checking.
//
// So the deferral is REMOVED RATHER THAN ENCODED. There is no arm to misread, because the thing
// `regulatory` was deferring to is available at the call site: /assess runs computeObligations()
// before it renders anything, so the obligations that actually fired can be passed in and the answer
// computed instead of pointed at. Excluding the key here means the placeholder cannot be written back.
//
// The five fixed lists live on, in buyer order — same convention as `Obligation.modules`, producer
// module first — and each is non-empty by construction.
const FIXED_DRIVER_MODULES: Record<Exclude<DriverId, 'regulatory'>, ModuleKey[]> = {
  customer: ['ghg', 'supply-chain'],
  investor: ['deals', 'ghg'],
  bank: ['ghg', 'climate-risk'],
  board: ['ghg', 'supply-chain'],
  ahead: ['ghg'],
}

// The modules that answer a driver.
//
// `fired` is REQUIRED FOR EVERY id, not optional and not only for 'regulatory'. The five fixed
// drivers ignore it, but a caller that cannot supply it has not yet computed the obligations — and
// that caller must not be able to reach the 'regulatory' path and receive a plausible answer built
// on nothing. Requiring the argument everywhere is what makes the dependency visible at every call
// site rather than at one.
//
// ORDER: canonical — `ALL_OBLIGATION_IDS` (declaration order of OBLIGATIONS), then each obligation's
// own `modules` order, first occurrence wins. NOT the order of `fired`. /assess sorts its results by
// urgency, so passing that order through would make the module list depend on how severe a visitor's
// obligations happen to be: the same set of rules would yield a different buying order for two
// companies. Canonical order is a property of the set alone, so the same obligations always produce
// the same sequence, and it is already buyer-shaped — GHG leads, because the record opens with the
// GHG-bearing entries and GHG is the producer several other modules consume.
//
// AN EMPTY RETURN FROM 'regulatory' IS NOW A TRUE STATEMENT, not a placeholder: no obligation fired
// on the answers given. It is still not something to render as a heading with nothing under it —
// a caller must render NOTHING, the same rule /assess applies to an empty obligation group, because
// "we checked and found none" and "you have not answered enough for us to check" look identical once
// they are both an empty box. The five fixed drivers never return empty.
export function driverModules(id: DriverId, fired: ObligationId[]): ModuleKey[] {
  if (id !== 'regulatory') return FIXED_DRIVER_MODULES[id]
  const firedSet = new Set(fired)
  const out: ModuleKey[] = []
  for (const obligationId of ALL_OBLIGATION_IDS) {
    if (!firedSet.has(obligationId)) continue
    for (const m of OBLIGATIONS[obligationId].modules) {
      if (!out.includes(m)) out.push(m)
    }
  }
  return out
}

// ── Derived accessors ────────────────────────────────────────────────────────

export const ALL_OBLIGATION_IDS = Object.keys(OBLIGATIONS) as ObligationId[]

// The `?modules=` value for a /order or /pricing link. Shorthand comes from SHORTHAND above, which
// inverts LEGACY_PRICING_PAGE_ID — so this cannot name a module the cart would silently drop.
// Order is preserved from `modules`, which is buyer order, so the link and the copy agree.
export function obligationModulesParam(id: ObligationId): string {
  return OBLIGATIONS[id].modules.map((m) => SHORTHAND[m]).join(',')
}

// /pricing lands five sections above the tier picker without the anchor, so a link built for a
// GHG-bearing obligation must carry it. app/climate-ghg/page.tsx documents the same hazard.
export function obligationPricingHref(id: ObligationId): string {
  return `/pricing?modules=${obligationModulesParam(id)}#build-your-stack`
}

// Price for the modules that answer an obligation.
//
// A DISCRIMINATED UNION, not `{ totalUSD, requiresQuote }`. Where the selection cannot be
// self-served — today only a GHG Advisory tier, whose `priceUSD` is null — `cartQuote` returns
// `totalUSD: 0`, and a caller that reads the number and ignores the flag prints "from $0".
//
// A VALUE PRESENT AND WRONG IS WORSE THAN ABSENT. This is the same shape as the
// `ghg_location_allowance` metadata key that app/api/admin/create-invoice omitted: the webhook read
// the absence as null, the trigger read null as UNCAPPED, and every manually-invoiced GHG customer
// silently received unlimited locations. Nothing failed — a wrong value was simply available to
// anyone who read it without checking. The fix there was to make the writer satisfy the whole
// contract; the fix here is to make the wrong value UNREPRESENTABLE: on the `quote` arm there is no
// `totalUSD` to read, so a caller cannot render a figure without narrowing first, and TypeScript
// enforces that rather than a comment asking for it.
//
// `isFrom` lives on the priced arm only, because it is meaningless on a quote — "from" qualifies a
// number, and the quote arm has none.
export type ObligationPrice =
  | { kind: 'priced'; totalUSD: number; isFrom: boolean }
  | { kind: 'quote' }

export function obligationPrice(id: ObligationId, ghgTier: GhgTier = 'starter'): ObligationPrice {
  const { modules } = OBLIGATIONS[id]
  const bearsGhg = modules.includes('ghg')
  // Single flat module: read FLAT_MODULE_PRICES directly — cartQuote would apply no discount to one
  // module anyway, and going through it would imply a cart where there is only a module. Cannot be a
  // quote: every non-GHG module has a real flat price.
  if (modules.length === 1 && !bearsGhg) {
    const only = modules[0] as Exclude<ModuleKey, 'ghg'>
    return { kind: 'priced', totalUSD: FLAT_MODULE_PRICES[only], isFrom: false }
  }
  // Anything else — multi-module, or GHG at a tier — goes through cartQuote, which is the same
  // function /api/checkout charges from, so a quoted figure and a charged figure cannot disagree.
  const q = cartQuote({ modules, ghgTier })
  if (q.requiresQuote) return { kind: 'quote' }
  // isFrom on every GHG-bearing entry: GHG is the only tiered module, so a single figure would state
  // the entry tier as if it were the price.
  return { kind: 'priced', totalUSD: q.totalUSD, isFrom: bearsGhg }
}

// Every obligation a given module answers — the inverse view, for a module page that wants to list
// what it covers. Derived, so it cannot fall out of step with the map above.
export function obligationsForModule(key: ModuleKey): Obligation[] {
  return ALL_OBLIGATION_IDS.map((id) => OBLIGATIONS[id]).filter((o) => o.modules.includes(key))
}

// Sanity: GHG_TIERS is referenced so the tier vocabulary this file's `isFrom` rule depends on is
// imported, not assumed. If GHG ever stops being tiered, this and `isFrom` are the two places to
// revisit together.
export const GHG_IS_TIERED = Object.keys(GHG_TIERS).length > 1
