// lib/pricing.ts
// ─────────────────────────────────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for ThemisIQ pricing.
//
// Imported by BOTH the pricing page (browser) and the checkout/webhook (server).
// The server ALWAYS recomputes the price from this file — it never trusts a price
// sent by the browser. That's what stops someone paying $1 for everything.
//
// Currency: USD (the site prices in USD). All numbers below are whole US dollars.
// Function/field names are currency-neutral on purpose — change CURRENCY in one
// place if that ever moves.
//
// Pure data + functions only: no React, no secrets, no server-only imports, so it
// is safe to import anywhere.
// ─────────────────────────────────────────────────────────────────────────────

// Type-only import (erased at runtime — keeps this module free of any server/runtime coupling,
// safe to import in the browser bundle). Used to type the shared priceLine() helper below.
import type Stripe from 'stripe'

export const CURRENCY = 'usd'

// ── Canonical module keys ────────────────────────────────────────────────────
// These MUST match the entitlement `module_key` values written to Supabase AND
// the dashboard folder names under app/dashboard/. This is the canonical list.
export type ModuleKey =
  | 'ghg'
  | 'cbam'           // CBAM exporter-side SEE module (standalone, sibling to ghg)
  | 'climate-risk'   // includes the materiality wizard + report
  // ⚠️ SOLD SEPARATELY FROM climate-risk, AND THE TWO ARE NOT THE SAME WORK. climate-risk SCREENS:
  // a wizard scoring ten ESRS topics from industry baselines and scenario multipliers, producing a
  // matrix. This module ASSESSES: a stakeholder survey with tokens and an anonymity floor,
  // delegation to named contributors, 37 sub-topics x 2 directions x 4 ESRS 1 §6.2 dimensions of
  // recorded judgement, a divergence register, versioned finalisation and a frozen disclosure
  // roadmap. Pricing them alike would assert they are comparable work.
  //
  // ⚠️ NO MIGRATION PATH WAS NEEDED, AND THAT IS A FACT ABOUT 22 AUG 2026, NOT A DESIGN CLAIM.
  // Nobody held any entitlement when this split happened — no customer had 'climate-risk', so no
  // customer lost worksheet access by it moving. Had one existed, this would have required a
  // backfill granting 'double-materiality' to every 'climate-risk' holder. It did not, and the
  // absence of that migration is recorded here so a future reader does not go looking for one.
  | 'double-materiality'
  | 'supply-chain'   // Supplier Portal (data collection)
  | 'people'
  | 'deals'
  | 'ai-governance'
  | 'cyber'
  // Forced Labour Reporting (Stage 5a, 30 Sep 2026). The first country is Canada's S-211 Act; its tables,
  // lib/s211 and /api/s211 keep the s211 names as the Canadian layer. The key is country-neutral because
  // the webhook writes it into entitlements for good.
  | 'forced-labour'

export const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'ghg',           name: 'GHG Inventory (Scope 1, 2 & 3)' },
  { key: 'cbam',          name: 'CBAM (Carbon Border Adjustment Mechanism)' },
  { key: 'climate-risk',  name: 'Climate Risk' },
  { key: 'double-materiality', name: 'Materiality Assessment' },
  { key: 'supply-chain',  name: 'Supply Chain' },
  { key: 'people',        name: 'People & Workforce' },
  { key: 'deals',         name: 'Deals & Investment' },
  { key: 'ai-governance', name: 'AI Governance' },
  { key: 'cyber',         name: 'Cyber Governance' },
  { key: 'forced-labour', name: 'Forced Labour Reporting' },
]

export const ALL_MODULE_KEYS = MODULES.map((m) => m.key)

// The pricing page currently uses shorthand ids. This maps them to the canonical
// keys above so we can wire the configurator without rewriting that page yet.
// NOTE: consumers .filter(Boolean) on lookups here, so an unmapped shorthand
// id is silently dropped from the cart rather than erroring. Every module
// that appears on the pricing page MUST have an entry.
export const LEGACY_PRICING_PAGE_ID: Record<string, ModuleKey> = {
  ghg: 'ghg',
  cbam: 'cbam',
  risk: 'climate-risk',
  // ⚠️ REQUIRED, NOT OPTIONAL, AND NOT TYPE-CHECKED. This map is Record<string, ModuleKey>, so a
  // missing entry compiles cleanly — and consumers .filter(Boolean) the lookup, so an unmapped
  // shorthand is SILENTLY DROPPED from the cart. A customer could select this module, pay, and not
  // receive it. pricing.test.ts derives both sides from MODULES, so omitting this fails a test
  // rather than a customer; removing it and watching that test go red is how it was checked.
  impact: 'double-materiality',
  supply: 'supply-chain',
  people: 'people',
  deals: 'deals',
  ai: 'ai-governance',
  cyber: 'cyber',
  // Same spelling as the key: /order?modules=forced-labour.
  'forced-labour': 'forced-labour',
}

// ── Tiers + founding offer ───────────────────────────────────────────────────
// ⚠️ THE ORDER IS THE BAND ORDER. 'advisory' is a published-price band (Large since Oct 2026) and 'enterprise' is
// the quote path. The database constraint permitting these keys (plus the retired 'business') is in
// supabase/migrations/20260928_ghg_employee_bands.sql, and M23 requires every key here to be permitted there.
// Oct 2026 (pricing-2026-10): four tiers, Small / Medium / Large / Enterprise. The internal keys stay
// (starter, professional, advisory, enterprise) because they are stored in entitlements.ghg_tier, carried in
// Stripe metadata and in ?tier= links already sent; only the labels, bands and prices changed. 'business' was
// the fifth key and is no longer sold. The database CHECK still permits it, which is harmless: a CHECK that
// allows more than the code writes refuses nothing the code sends. Narrowing it is a separate migration.
export type Tier = 'starter' | 'professional' | 'advisory' | 'enterprise'

// THE SWITCH. While true, customers pay the `early` price below. Flip to false
// (one line) to move the whole site to full pricing — nothing else needs editing.
export const FOUNDING_OFFER_ACTIVE = true

// Each tier has a full price and an early-access (founding) price, per module/yr
// in USD. To discount a tier during the founding period, set its `early` BELOW
// its `full`. To leave a tier undiscounted, set early === full.
//
// TODO(Lisa): confirm the `early` numbers for professional & advisory. Right now
// only Starter is discounted (full 1499 -> early 799), matching your pricing page;
// pro & advisory are set to no discount (early === full). Change if you want them
// discounted too.
// ⚠️ THE RETIRED PER-MODULE LADDER, AND IT IS NOT THE TIER LIST. Pinned to the three keys the old
// model had, deliberately: adding Business and Enterprise here would mint prices for a model that
// cannot render, since the !NEW_PRICING_ACTIVE branch is unreachable. Anything asking "is this a
// tier?" wants isGhgTier, not a lookup in this object.
export type LegacyTier = 'starter' | 'professional' | 'advisory'
export const TIER_PRICING: Record<LegacyTier, { full: number; early: number }> = {
  starter:      { full: 1499, early: 999 },
  professional: { full: 2499, early: 2499 },
  advisory:     { full: 4999, early: 4999 },
}

// The price actually charged right now for a given tier (respects the switch).
export function tierPrice(tier: LegacyTier): number {
  const p = TIER_PRICING[tier]
  return FOUNDING_OFFER_ACTIVE ? p.early : p.full
}

// The "full" (pre-discount) price — useful for the struck-through price on the
// pricing page. Returns null when there's no active saving to show.
export function tierStrikethrough(tier: LegacyTier): number | null {
  const p = TIER_PRICING[tier]
  return FOUNDING_OFFER_ACTIVE && p.early < p.full ? p.full : null
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW PRICING MODEL (June 2026 rescope). Gated behind NEW_PRICING_ACTIVE (below):
// while false, every consumer keeps the OLD model and the live site is unchanged.
// Flip to true in the final cutover push — instant rollback = revert that one line.
// The shared cartQuote() below is consumed by BOTH the configurator (display) and the
// checkout/admin-invoice routes (charge), so displayed price == charged price by
// construction in both flag states.
// ─────────────────────────────────────────────────────────────────────────────

// THE CUTOVER SWITCH. false = live/old model everywhere; true = new model everywhere.
// (Build-time const, not an env var, so client + server read the identical value —
// no client/server drift that could let display and charge diverge.)
export const NEW_PRICING_ACTIVE = true

// Reuse the existing tier union under the name the rescope spec references.
export type GhgTier = Tier

// GHG is the only multi-tier module. priceUSD null = "Contact us" (quote path).
//
// ⚠️ SIZED BY EMPLOYEES, NOT LOCATIONS, SINCE 28 Sep 2026. The bands are contiguous and
// exhaustive from 1 upward, so ghgTierForEmployees always resolves. `employees.max` null means "and
// above", which only the top band carries.
//
// FI0: LOCATIONS ARE UNLIMITED ON EVERY PLAN, AND NOTHING HERE DESCRIBES A LOCATION ALLOWANCE ANY MORE.
// The per-tier locationAllowance (all null since 28 Sep 2026) and locationAllowanceForTier are removed;
// checkout, the admin invoice route and the webhook no longer write entitlements.location_allowance, and
// the database gate (enforce_ghg_location_allowance) keeps only the entitlement check
// (docs/review/patches/FI0-entitlement-gate-only.sql). The column is dropped later, separately, once
// no deployed code writes it.
//
// OCT 2026: THE BANDS ARE THE EU COMPANY SIZE CATEGORIES (Small 1-49, Medium 50-249, Large 250-999,
// Enterprise 1,000+). GHG_SIZE_BASIS_NOTE says so wherever the bands are shown.
export const GHG_TIERS: Record<GhgTier, {
  priceUSD: number | null
  employees: { min: number; max: number | null }
}> = {
  starter:      { priceUSD:  550, employees: { min:    1, max:  49 } },
  professional: { priceUSD: 1750, employees: { min:   50, max: 249 } },
  advisory:     { priceUSD: 4550, employees: { min:  250, max: 999 } },
  enterprise:   { priceUSD: null, employees: { min: 1000, max: null } },
}

/** The line shown wherever the employee bands are shown (pricing-2026-10). */
export const GHG_SIZE_BASIS_NOTE = 'Plans are sized using EU company size categories.'

/** FI0: a tier's employee band in words, for copy: "1 to 49 employees", "1,000 employees or more". */
export function ghgEmployeeBandLabel(tier: GhgTier): string {
  const { min, max } = GHG_TIERS[tier].employees
  return max == null ? `${min.toLocaleString('en-US')} employees or more` : `${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')} employees`
}

/**
 * The band an employee count falls in. The single authority for employee bands.
 *
 * ⚠️ THROWS ON A COUNT IT CANNOT BAND rather than defaulting to the entry tier. A count below 1
 * is not a small company, it is a bad input, and banding it as Essentials would sell a plan on a
 * number nobody checked. Callers validate first; this is the backstop.
 */
export function ghgTierForEmployees(employees: number): GhgTier {
  if (!Number.isInteger(employees) || employees < 1) {
    throw new Error('ghgTierForEmployees: an employee count must be a whole number of at least 1.')
  }
  for (const key of GHG_TIER_KEYS) {
    const { min, max } = GHG_TIERS[key].employees
    if (employees >= min && (max == null || employees <= max)) return key
  }
  // Unreachable while the bands stay contiguous and the top one is open-ended. A gap lands here
  // rather than silently picking a neighbour.
  throw new Error(`ghgTierForEmployees: ${employees} falls in no band. The bands are not contiguous.`)
}

// The customer-facing tier names (pricing-2026-10: EU company size categories). The keys are internal and do not
// match the labels; nothing customer-facing may print a key. The Bill Review onboarding line carries the label
// onto a Stripe invoice, where a key name would be wrong.
export const GHG_TIER_LABELS: Record<GhgTier, string> = {
  starter:      'Small',
  professional: 'Medium',
  advisory:     'Large',
  enterprise:   'Enterprise',
}

// Flat single-tier modules (USD / year). Keyed on every non-GHG module so the
// type fails to compile if a module is ever added without a price.
export const FLAT_MODULE_PRICES: Record<Exclude<ModuleKey, 'ghg'>, number> = {
  'cbam':          1499,
  'climate-risk':  4900,
  // ⚠️ $4,900 — DELIBERATE PARITY WITH climate-risk, AND PARITY IS NOT A CLAIM OF EQUIVALENCE.
  //
  // THE TWO ARE NOT COMPARABLE WORK, AND THAT IS THE POINT OF SAYING SO HERE. climate-risk screens:
  // a wizard scoring ten ESRS topics from industry baselines and scenario multipliers, producing a
  // matrix. This module runs a stakeholder survey with per-respondent tokens and an anonymity
  // floor, delegates sub-topics to named contributors, and records 296 judgements — 37 sub-topics
  // x 2 directions x 4 ESRS 1 §6.2 dimensions — with abstentions kept as abstentions, plus a
  // divergence register, an audited override path, versioned finalisation and a frozen disclosure
  // roadmap. A LATER PRICE RISE IS DEFENSIBLE ON EXACTLY THAT BASIS, and this paragraph is the
  // record of the argument for whoever makes it.
  //
  // SO WHY PARITY. Because this is a decision about ADOPTION, not about value. The first buyer
  // conversation is worth more than the margin on a sale that may not happen, and nothing in this
  // file has ever been tested against a buyer. A price set above the module a customer already
  // knows, for work that customer has not yet seen, buys nothing except a reason not to start.
  //
  // AND BOTH MODULES TOGETHER STAYED SELF-SERVE, WHICH 9,900 DID NOT, while card payment stopped at
  // $10,000: 4900 + 4900 less the 2-module discount is $8,820. That threshold was removed in Oct 2026
  // (card-any-amount): card is allowed at any amount and an invoice can be requested at any amount, so
  // no price here decides how a customer may pay any more.
  //
  // ⚠️ WHAT THIS PRICE IS NOT. It is not calibrated. The repo records no transaction, no price test
  // and no customer — the only pricing rationale written anywhere is CLAUDE.md's note that the Full
  // Platform headline caused sticker shock. This is a starting position, not a finding.
  // RAISING IT IS EXPECTED once a buyer has seen what the module actually does; the parity above is
  // an entry price for a module nobody has bought yet, not a statement that a stakeholder survey
  // and a wizard are worth the same.
  'double-materiality': 4900,
  'deals':         4900,
  'supply-chain':  2900,
  'cyber':         2900,
  'ai-governance': 2900,
  'people':        1499,
  // One-time, 365-day term, exactly like People (decided 30 Sep 2026).
  'forced-labour': 1499,
}

// ⚠️ NO CARD THRESHOLD (card-any-amount, Oct 2026). Until then CARD_THRESHOLD_USD = 10000 refused card
// checkout above $10,000 and sent the order to request-an-invoice. Card is now allowed at any amount, and
// an invoice is an option at any amount: /order?pay=invoice → /api/order/quote-request →
// lib/order/invoice.ts drafts it (card or manual wire; the Canadian account has no Stripe ACH).

// ⚠️ NOT A PLAN INCLUSION AND NOT A CHECKOUT PATH. Advisory support is not included in any plan
// and is not sold self-serve: this is the rate quoted on /pricing beside a contact link, with no
// flow behind it. It lives here because it is a price a customer reads, and no price a customer
// reads is typed into a page.
export const ADVISORY_HOURLY_USD = 175

// ── Volume discount (matches the pricing page exactly) ───────────────────────
//   1 module  → 0%
//   2 modules → 10%
//   3+ modules → 20%
export function volumeDiscount(moduleCount: number): number {
  if (moduleCount >= 3) return 0.2
  if (moduleCount >= 2) return 0.1
  return 0
}

// ── Configurator price (build-your-own) ──────────────────────────────────────
// Returns the final price in whole dollars, discount applied.
export function configuratorPrice(tier: LegacyTier, moduleKeys: ModuleKey[]): number {
  const count = moduleKeys.length
  if (count === 0) return 0
  const gross = tierPrice(tier) * count
  const net = gross * (1 - volumeDiscount(count))
  return Math.round(net)
}

// ── NEW-MODEL cart math (shared by display + charge) ─────────────────────────
// The single source of truth for the rescoped model. Both the configurator
// (price preview) and the server routes (actual charge) call this, so the number
// shown can never differ from the number charged.
//   - GHG priced by chosen tier (GHG_TIERS); every other module is flat (FLAT_MODULE_PRICES).
//   - Existing volume discount applies to multi-module carts (2 → −10%, 3+ → −20%).
//   - GHG Advisory (priceUSD null) has no self-serve price → requiresQuote=true,
//     totalUSD=0; the caller routes the whole selection to the contact/quote path
//     (never sum a null).
export interface CartSelection {
  modules: ModuleKey[]
  ghgTier?: GhgTier // only consulted when 'ghg' is in modules; defaults to Essentials
}
export interface CartQuote {
  totalUSD: number          // 0 when requiresQuote (no self-serve total)
  requiresQuote: boolean    // GHG Advisory in cart → contact/quote path
}
export function cartQuote(sel: CartSelection): CartQuote {
  const modules = sel.modules
  if (modules.length === 0) {
    return { totalUSD: 0, requiresQuote: false }
  }
  const ghgTier: GhgTier = sel.ghgTier ?? 'starter'
  // GHG Advisory has no self-serve price → the whole selection goes to quote.
  if (modules.includes('ghg') && GHG_TIERS[ghgTier].priceUSD == null) {
    return { totalUSD: 0, requiresQuote: true }
  }
  // ⚠️ GHG COUNTS TOWARD THE BAND BUT IS NEVER DISCOUNTED BY IT, and those are two separate
  // rules. The module tally that picks the discount band INCLUDES GHG, so buying GHG plus two
  // others still reaches the 3-module band. The discount is then applied to the other modules'
  // subtotal ONLY, and the GHG price is added at full. Decided 28 Sep 2026 with the employee-band
  // reprice: GHG is sized by the customer now, so discounting it by how much else they bought
  // prices the same company two ways.
  //
  // ⚠️ THE ROUNDING HAPPENS ON THE DISCOUNTED SUBTOTAL, BEFORE GHG IS ADDED. GHG is a whole
  // dollar figure from GHG_TIERS, so rounding after adding it would give the same answer today and
  // would start to differ the moment a tier carries cents. Rounding the only part that can be
  // fractional is the form that stays correct.
  const others = modules.filter(m => m !== 'ghg') as Exclude<ModuleKey, 'ghg'>[]
  const othersSum = others.reduce((n, m) => n + FLAT_MODULE_PRICES[m], 0)
  const ghgSum = modules.includes('ghg') ? (GHG_TIERS[ghgTier].priceUSD as number) : 0
  const totalUSD = Math.round(othersSum * (1 - volumeDiscount(modules.length))) + ghgSum
  return { totalUSD, requiresQuote: false }
}

// ── Bill Review (the add-on formerly called Concierge) ─────────────────────────────────────────
// Bill Review requires the `ghg` module and does NOT count toward the multi-module volume discount.
// Renamed from Concierge in Oct 2026 (pricing-2026-10) in customer-facing text. The internal names stay:
// entitlements.module_key 'concierge' (CONCIERGE_KEY), the `concierge` request body field, the concierge_*
// Stripe metadata keys and /api/concierge/extract. Verification Readiness is included in Bill Review and is
// not sold separately (it was retired as an add-on on 10 Aug 2026).
//
// REMOVED Oct 2026: the location-band Concierge add-ons (`ADDONS`, `AddOnKey`, `conciergeTierForLocations`,
// `addOnRequirementsMet`), the flat onboarding fee and the uploaded and connected per-source rates of the
// 28 Sep 2026 model. Both purchase routes refuse the old `addOns` body.

// ⚠️ UTILITY CONNECTION IS NOT BUILT. Connected sources cannot be sold, and no connected price is published.
export const UTILITY_CONNECT_ENABLED = false

export type SourceKind = 'uploaded' | 'connected'

/** Whether a source kind can be SOLD today. */
export function sourceKindSellable(kind: SourceKind): boolean {
  return kind === 'uploaded' || UTILITY_CONNECT_ENABLED
}

/** How a Bill Review inventory's bills are read (docs/review/design-derived-figures.md, BR). */
export type BillReviewReading = 'ai' | 'human'

/**
 * One-time onboarding per GHG tier and reading, USD. It includes the first year for the tier's included data
 * sources (BILL_REVIEW_INCLUDED_SOURCES). null = Enterprise, quoted.
 */
export const BILL_REVIEW_ONBOARDING_USD: Record<BillReviewReading, Record<GhgTier, number | null>> = {
  ai:    { starter:  900, professional: 1800, advisory: 3500, enterprise: null },
  human: { starter: 1200, professional: 2200, advisory: 4200, enterprise: null },
}

/** Data sources covered by onboarding for the first year, per GHG tier. */
export const BILL_REVIEW_INCLUDED_SOURCES: Record<GhgTier, number | null> = {
  starter: 10, professional: 30, advisory: 80, enterprise: null,
}

/**
 * Per data source a year, USD: each source above the included count in year 1, and every active source at
 * renewal. The same for AI-read and human-read.
 */
export const BILL_REVIEW_SOURCE_USD = 45

/**
 * ⚠️ HUMAN READING CANNOT BE BOUGHT YET. Its prices are published, but nothing records the reading choice on an
 * entitlement and nothing enforces it (BR1 to BR11 in docs/review/design-derived-figures.md). Both purchase routes
 * refuse a human-read order while this is false.
 */
export const BILL_REVIEW_HUMAN_READING_SELLABLE = false

/**
 * ⚠️ A SELF-SERVE CEILING ON THE TOTAL SOURCE COUNT, NOT A PLAN CAP. A typo in a quantity field must not become a
 * large card charge; above it the order is a conversation. Raised from 60 because Large onboarding includes 80.
 * ⚑ 150 is a placeholder pending Lisa's ruling.
 */
export const BILL_REVIEW_MAX_SELF_SERVE_SOURCES = 150

export interface BillReviewSelection {
  /** The GHG tier, from the cart or the customer's GHG entitlement. Needed only on a first purchase. */
  tier: GhgTier | null
  reading: BillReviewReading
  /** Total data sources the customer wants covered. */
  sources: number
  /**
   * True when the customer has never held Bill Review (Concierge). Decided server side, never by the client.
   * Look at Concierge rows only (isFirstConciergePurchase).
   */
  isFirstPurchase: boolean
}

export interface BillReviewQuote {
  /** Enterprise: no self-serve price. */
  requiresQuote: boolean
  onboardingUSD: number
  sourcesUSD: number
  totalUSD: number
  includedSources: number
  extraSources: number
  /** The source count the entitlement records (written to concierge_source_allowance). */
  sourceAllowance: number
  /** Ready for priceLineQty. Onboarding first, so it reads first on the invoice. */
  lines: { label: string; unitUSD: number; quantity: number }[]
}

/**
 * ⚠️ ONE FUNCTION FOR DISPLAY AND FOR CHARGE. /pricing, /api/checkout and /api/admin/create-invoice all call it, so
 * a displayed Bill Review price cannot differ from the charged one. Every guard throws; none coerces.
 *
 * First purchase: the tier's onboarding (which includes the first year for its included sources), plus $45 for
 * each source above that. Any later purchase: $45 for each source.
 */
export function billReviewQuote(sel: BillReviewSelection): BillReviewQuote {
  const n = sel.sources
  if (!Number.isInteger(n)) throw new Error('billReviewQuote: a source count must be a whole number.')
  if (n < 1) throw new Error('billReviewQuote: Bill Review needs at least one data source.')
  if (n > BILL_REVIEW_MAX_SELF_SERVE_SOURCES) {
    throw new Error(`billReviewQuote: above ${BILL_REVIEW_MAX_SELF_SERVE_SOURCES} data sources, contact us for a quote.`)
  }
  const empty = (requiresQuote: boolean, includedSources = 0): BillReviewQuote =>
    ({ requiresQuote, onboardingUSD: 0, sourcesUSD: 0, totalUSD: 0, includedSources, extraSources: 0, sourceAllowance: 0, lines: [] })
  if (sel.tier === 'enterprise') return empty(true)
  if (!sel.isFirstPurchase) {
    const sourcesUSD = n * BILL_REVIEW_SOURCE_USD
    return {
      requiresQuote: false, onboardingUSD: 0, sourcesUSD, totalUSD: sourcesUSD, includedSources: 0, extraSources: n,
      sourceAllowance: n,
      lines: [{ label: 'Bill Review data source (1 year)', unitUSD: BILL_REVIEW_SOURCE_USD, quantity: n }],
    }
  }
  if (sel.tier == null) throw new Error('billReviewQuote: the GHG plan is needed to price Bill Review onboarding.')
  const onboardingUSD = BILL_REVIEW_ONBOARDING_USD[sel.reading][sel.tier]
  const included = BILL_REVIEW_INCLUDED_SOURCES[sel.tier]
  if (onboardingUSD == null || included == null) return empty(true)
  const extra = Math.max(0, n - included)
  const sourcesUSD = extra * BILL_REVIEW_SOURCE_USD
  const lines: BillReviewQuote['lines'] = [{
    label: `Bill Review onboarding, ${GHG_TIER_LABELS[sel.tier]} plan${sel.reading === 'human' ? ', human reading' : ''} (includes the first year for ${included} data sources)`,
    unitUSD: onboardingUSD, quantity: 1,
  }]
  if (extra > 0) lines.push({ label: 'Bill Review data source, first year', unitUSD: BILL_REVIEW_SOURCE_USD, quantity: extra })
  return {
    requiresQuote: false, onboardingUSD, sourcesUSD, totalUSD: onboardingUSD + sourcesUSD,
    includedSources: included, extraSources: extra, sourceAllowance: Math.max(n, included), lines,
  }
}

// ── Concierge entitlement identity ─────────────────────────────────────
// ⚠️ ONE LIST, BECAUSE FIVE COPIES IS THE DRIFT. Both purchase routes, the webhook,
// useHasConcierge() and /api/concierge/extract all have to agree on what "holds Concierge" means.
// The old keys are here because a customer who bought under the band model still holds Concierge:
// dropping them from this list would charge them onboarding a second time on renewal.
export const CONCIERGE_KEY = 'concierge' as const
export const LEGACY_CONCIERGE_KEYS = ['concierge-basic', 'concierge-standard', 'concierge-enterprise'] as const
export const CONCIERGE_ENTITLEMENT_KEYS: readonly string[] = [CONCIERGE_KEY, ...LEGACY_CONCIERGE_KEYS]

/**
 * Has this customer ever held Concierge? Pass every module_key on their entitlements rows.
 * ⚠️ CONCIERGE ROWS ONLY. Not `source`, and not the GHG row. A `source` test such as 'manual-test'
 * would match a hand-written GHG row for a pilot customer and skip their onboarding fee.
 * ⚠️ NOT TERM-AWARE, DELIBERATELY, and this is the opposite of the access check. An EXPIRED
 * Concierge customer is still not a first purchase: the setup work was done and billed once.
 */
export function isFirstConciergePurchase(existingModuleKeys: readonly string[]): boolean {
  return !existingModuleKeys.some((k) => CONCIERGE_ENTITLEMENT_KEYS.includes(k))
}

/**
 * The tier keys, as a value rather than a type, because a database CHECK constraint cannot read a
 * TypeScript union. entitlements.ghg_tier is constrained to these keys (and the retired business) in
 * supabase/migrations/20260928_ghg_employee_bands.sql (which also still permits the retired 'business').
 *
 * ⚠️ A NEW TIER IS A TWO PART CHANGE. Adding one here without altering that constraint makes
 * every purchase on the new tier fail AFTER payment: the webhook writes the value, Postgres rejects
 * it, the grant throws, and Stripe retries a write that can never succeed. M23 in
 * lib/entitlementMetadata.test.ts reads the constraint and pins this list against it, so the
 * omission fails a test rather than a customer.
 */
export const GHG_TIER_KEYS = ['starter', 'professional', 'advisory', 'enterprise'] as const

/**
 * Is this a GHG tier key? For validating anything that arrives as text: a URL parameter, a request
 * body, a stored value.
 *
 * ⚠️ THE POINT IS THAT A NEW TIER REACHES EVERY VALIDATOR AT ONCE. app/order/page.tsx read
 * `raw === 'starter' || raw === 'professional' || raw === 'advisory'` and fell back to the entry
 * band for anything else, so a link carrying a tier that page had not been taught about would have
 * priced as Essentials and shown the customer a number nobody meant. A disjunction cannot be
 * widened from one place. This can.
 */
/**
 * Is this one of the three tiers the RETIRED per-module model priced?
 *
 * ⚠️ IT EXISTS ONLY TO KEEP THE DEAD ROLLBACK BRANCH HONEST. The !NEW_PRICING_ACTIVE arms in both
 * purchase routes call configuratorPrice, which prices from TIER_PRICING, and TIER_PRICING has no
 * Business or Enterprise entry because that model never had those tiers. Rather than cast a Tier
 * into a LegacyTier and let an unreachable branch pretend it can price one, those arms check this
 * and refuse. If the branch is ever deleted, this goes with it.
 */
export function isLegacyTier(value: unknown): value is LegacyTier {
  return value === 'starter' || value === 'professional' || value === 'advisory'
}

export function isGhgTier(value: unknown): value is GhgTier {
  return typeof value === 'string' && (GHG_TIER_KEYS as readonly string[]).includes(value)
}

/**
 * The value to put in the ghg_tier metadata key. Returns '' for anything that is not one of the
 * three, following the same empty-string convention as ghg_location_allowance.
 *
 * ⚠️ THIS EXISTS BECAUSE THE TYPE SYSTEM STOPS AT THE REQUEST BOUNDARY. body.tier arrives as JSON.
 * Both routes validate it before pricing anything, but create-invoice assigns the metadata value
 * outside its NEW_PRICING_ACTIVE arm, where the only check is truthiness. That path is unreachable
 * while the flag is true. It would not announce itself if the flag ever moved: the customer pays,
 * the CHECK rejects the write, and the grant fails on retry forever. An empty string degrades to
 * "tier not recorded", which the onboarding fee already knows how to handle.
 */
export function ghgTierMetaValue(tier: unknown): GhgTier | '' {
  return isGhgTier(tier) ? tier : ''
}

// ── Stripe helper ────────────────────────────────────────────────────────────
// Stripe expects amounts in the smallest currency unit (cents for USD).
export function toStripeAmount(dollars: number): number {
  return Math.round(dollars * 100)
}

// Build a one-off, dynamically-priced Stripe line item. Shared by /api/checkout so the fail-loud
// backstop below lives in one place.
//
// A $0 (or negative) line item must THROW, never silently create a free session. The quote-only
// gate in addOnRequirementsMet is the primary guard; this is belt-and-braces: if any future add-on
// or pack gets price 0 by accident, it breaks the request path loudly instead of minting a free
// entitlement. A zero price is not a price.
export function priceLine(name: string, dollars: number): Stripe.Checkout.SessionCreateParams.LineItem {
  if (dollars <= 0) {
    throw new Error(`priceLine: refusing a $0 line item for "${name}": a zero price is not a price.`)
  }
  return {
    quantity: 1,
    price_data: {
      currency: CURRENCY,
      product_data: { name },
      unit_amount: toStripeAmount(dollars),
    },
  }
}

// Quantity-aware sibling of priceLine, for per-unit lines such as Concierge data sources.
// Stripe multiplies unit_amount by quantity, so the UNIT price is what goes in price_data.
// Same fail-loud backstop, plus a quantity guard: quantity 0 is not a line item, it is the
// absence of one, and a caller that means "none" must not push a line at all.
export function priceLineQty(name: string, unitDollars: number, quantity: number): Stripe.Checkout.SessionCreateParams.LineItem {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error(`priceLineQty: refusing quantity ${quantity} for "${name}": a line item needs a whole quantity of at least 1.`)
  }
  const line = priceLine(name, unitDollars)
  return { ...line, quantity }
}

// Access term: one-time charge grants one year of access (renewal handled
// manually for now). The webhook stamps this onto each entitlement row.
export const ACCESS_TERM_DAYS = 365
