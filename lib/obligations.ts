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
  | 'modern-slavery'
  | 'cdp'

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

  'modern-slavery': {
    id: 'modern-slavery',
    name: 'Modern Slavery Act — UK and Australia',
    modules: ['supply-chain'],
    does: {
      'supply-chain': 'Sends the modern-slavery questionnaire — policy, risk assessment, recruitment fees, ILO 138 minimum age, grievance mechanism, training — and risk-scores which suppliers to send it to first by country, sector and spend.',
    },
  },

  'cdp': {
    id: 'cdp',
    name: 'CDP Climate — annual disclosure',
    modules: ['ghg'],
    does: {
      ghg: 'Feeds the C6, C7 and C11 emissions sections directly from your inventory, on the CDP-required GWP basis.',
    },
  },
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
