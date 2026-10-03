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
// ⚠️ FIVE TIERS SINCE 28 Sep 2026, AND THE ORDER IS THE BAND ORDER. 'business' and 'enterprise'
// are new. 'advisory' CHANGED MEANING: it was the quote-only tier and is now the 250 to 499 band at
// a published price, and 'enterprise' is the quote path. The database constraint permitting these
// five is in supabase/migrations/20260928_ghg_employee_bands.sql, and M23 ties the two together.
export type Tier = 'starter' | 'professional' | 'business' | 'advisory' | 'enterprise'

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
export const GHG_TIERS: Record<GhgTier, {
  priceUSD: number | null
  employees: { min: number; max: number | null }
}> = {
  starter:      { priceUSD:  475, employees: { min:   1, max:  19 } },
  professional: { priceUSD: 1425, employees: { min:  20, max:  99 } },
  business:     { priceUSD: 2850, employees: { min: 100, max: 249 } },
  advisory:     { priceUSD: 4550, employees: { min: 250, max: 499 } },
  enterprise:   { priceUSD: null, employees: { min: 500, max: null } },
}

/** FI0: a tier's employee band in words, for copy: "1 to 19 employees", "500 employees or more". */
export function ghgEmployeeBandLabel(tier: GhgTier): string {
  const { min, max } = GHG_TIERS[tier].employees
  return max == null ? `${min.toLocaleString('en-US')} employees or more` : `${min.toLocaleString('en-US')} to ${max.toLocaleString('en-US')} employees`
}

/**
 * The band an employee count falls in. The single authority, the way conciergeTierForLocations was
 * for the retired location bands.
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

// The customer-facing tier names. `starter` has been labelled "Essentials" on every surface since
// the rescope, recorded until now only in a comment above. It is here because the Concierge
// onboarding line carries the tier name onto a Stripe invoice, where a key name would be wrong.
export const GHG_TIER_LABELS: Record<GhgTier, string> = {
  starter:      'Essentials',
  professional: 'Professional',
  business:     'Business',
  advisory:     'Advisory',
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
  // AND BOTH MODULES TOGETHER STAY SELF-SERVE, WHICH 9,900 DID NOT.
  //   4900 + 4900 = 9800 gross, less the 2-module volume discount (10%) = $8,820 — under
  //   CARD_THRESHOLD_USD (10000), so requiresInvoice() is false and screen-then-assess checks out
  //   by card.
  //   At 9900 the same pair was 14800 gross, 13320 net — over the threshold, so the natural
  //   two-module path would have routed every customer to request-an-invoice. That is a sales
  //   decision, and it was not one anybody had made.
  // (Arithmetic verified against cartQuote, not computed by hand. Recompute rather than trusting
  // these figures if FLAT_MODULE_PRICES or volumeDiscount moves.)
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

// Self-serve card is disabled ABOVE this; larger orders route to request-an-invoice
// (admin-invoice draft: card or manual wire — Canadian account has no Stripe ACH).
export const CARD_THRESHOLD_USD = 10000

// ⚠️ NOT A PLAN INCLUSION AND NOT A CHECKOUT PATH. Advisory support is not included in any plan
// and is not sold self-serve: this is the rate quoted on /pricing beside a contact link, with no
// flow behind it. It lives here because it is a price a customer reads, and no price a customer
// reads is typed into a page.
export const ADVISORY_HOURLY_USD = 175

export function requiresInvoice(orderTotalUSD: number): boolean {
  return orderTotalUSD > CARD_THRESHOLD_USD
}

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
//   - totalUSD > CARD_THRESHOLD_USD → requiresInvoice=true (self-serve card off).
export interface CartSelection {
  modules: ModuleKey[]
  ghgTier?: GhgTier // only consulted when 'ghg' is in modules; defaults to Essentials
}
export interface CartQuote {
  totalUSD: number          // 0 when requiresQuote (no self-serve total)
  requiresQuote: boolean    // GHG Advisory in cart → contact/quote path
  requiresInvoice: boolean  // total over the card threshold → invoice/wire
}
export function cartQuote(sel: CartSelection): CartQuote {
  const modules = sel.modules
  if (modules.length === 0) {
    return { totalUSD: 0, requiresQuote: false, requiresInvoice: false }
  }
  const ghgTier: GhgTier = sel.ghgTier ?? 'starter'
  // GHG Advisory has no self-serve price → the whole selection goes to quote.
  if (modules.includes('ghg') && GHG_TIERS[ghgTier].priceUSD == null) {
    return { totalUSD: 0, requiresQuote: true, requiresInvoice: false }
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
  return { totalUSD, requiresQuote: false, requiresInvoice: requiresInvoice(totalUSD) }
}

// ── Add-ons ──────────────────────────────────────────────────────────────────
// Add-ons are extras that attach to a module — they are NOT modules themselves.
// Concierge is the only add-on: it requires the `ghg` module, is priced on actual
// location count (Basic ≤5 / Standard 6–15 / Enterprise 16+ custom quote), and does
// NOT count toward the 2-/3-module volume discount.
//
// RETIRED 10 Aug 2026 — Verification Readiness ($1,499/yr, key `verification`). Its entitlement
// was written by the webhook and never read by anything, and half its claims duplicated what GHG
// Essentials already includes. It was also the ONLY user of `requiresAddOnAnyOf`, which went with
// it. The six claims that were genuinely its own are recorded in
// docs/ghg-verifier-grade-roadmap.md — read that before reviving any of this.
export type AddOnKey = 'concierge-basic' | 'concierge-standard' | 'concierge-enterprise'

export const ADDONS: Record<
  AddOnKey,
{ key: AddOnKey; label: string; short: string; price: number; requires: ModuleKey[]; isCustomQuote?: boolean }
> = {
  'concierge-basic': {
    key: 'concierge-basic',
    label: 'Concierge · Basic (up to 5 locations)',
    // ⚠️ `short` EXISTS SO NOTHING PARSES `label` ON ITS PUNCTUATION. app/pricing/page.tsx read
    // `label.replace('Concierge — ', '')` to get this, which made the em dash load-bearing: the
    // em-dash sweep would have silently started printing the full label in a cell sized for the tier.
    // Same fix as DEAL_TYPES.short in lib/deals/reportModel.ts, and for the same reason.
    // ⚠️ THE LABEL IS PAYMENT-FACING AND WAS CHANGED ANYWAY, ON EVIDENCE. It reaches Stripe through
    // priceLine -> price_data.product_data.name (app/api/checkout/route.ts:133) and invoice lines through
    // app/api/admin/create-invoice/route.ts:160, so it appears on a customer's checkout page and invoice.
    // Checked 27 Sep 2026 before touching it: NOTHING matches it by text. The Stripe webhook decides what
    // was bought from `metadata` (user_id plus comma-separated entitlement keys), never from a line-item
    // name; there is no price or product lookup by name, no lookup_key, and no reconciliation comparing
    // description text. So the label is a DISPLAY string on Stripe's side, and the change is cosmetic
    // there. If a future flow ever matches on it, this is the note that says it used to be safe.
    short: 'Basic (up to 5 locations)',
    price: 799,
    requires: ['ghg'],
  },
  'concierge-standard': {
    key: 'concierge-standard',
    label: 'Concierge · Standard (6–15 locations)',
    short: 'Standard (6–15 locations)',
    price: 1499,
    requires: ['ghg'],
  },
  'concierge-enterprise': {
    key: 'concierge-enterprise',
    label: 'Concierge · Enterprise (16+ locations)',
    short: 'Enterprise (16+ locations)',
    // price 0 is a PLACEHOLDER, not a sellable price. isCustomQuote is the signal — never the 0.
    // (Inferring "custom quote" from price===0 is the absence-vs-zero confusion: 0 is a claim
    // (it's free), a flag is the absence of a self-serve price.) Enforced in addOnRequirementsMet.
    price: 0,
    requires: ['ghg'],
    isCustomQuote: true,
  },
}
// Resolve the Concierge tier from a location count. Single source of truth for the
// location→tier bands (Basic ≤5, Standard 6–15, Enterprise 16+). Enterprise is a
// custom quote (price 0 placeholder) — callers should route 16+ to a contact path.
export function conciergeTierForLocations(locations: number): {
  key: Extract<AddOnKey, 'concierge-basic' | 'concierge-standard' | 'concierge-enterprise'>
  isCustomQuote: boolean
} {
  if (locations <= 5) return { key: 'concierge-basic', isCustomQuote: false }
  if (locations <= 15) return { key: 'concierge-standard', isCustomQuote: false }
  return { key: 'concierge-enterprise', isCustomQuote: true }
}
// Single authority on whether an add-on is allowed in a given cart/account.
// `requires` lists prerequisite modules (ALL must be present).
// Returns ok=false with a human-readable reason the routes surface verbatim.
//
// The `requiresAddOnAnyOf` branch was removed with Verification Readiness on 10 Aug 2026 — that
// add-on was its only user, so the mechanism had no remaining caller. `addOnsOwnedOrInCart` is kept
// in the signature: both routes pass it, and an add-on-depends-on-add-on rule is plausible again.
export function addOnRequirementsMet(
  addOn: AddOnKey,
  modulesOwnedOrInCart: ModuleKey[],
  addOnsOwnedOrInCart: AddOnKey[] = [],
): { ok: boolean; reason?: string } {
  const def = ADDONS[addOn]
  // Quote-only add-ons (e.g. Concierge Enterprise) have NO self-serve price and must never be
  // purchasable through checkout or invoice — the $0 placeholder is not a price. Reject FIRST,
  // before prerequisites: owning GHG is not enough. This is the single authority /api/checkout and
  // /api/admin/create-invoice both defer to, so one guard closes both against a direct-API mint.
  if (def.isCustomQuote) {
    return { ok: false, reason: `${def.label} is quote-only and cannot be purchased through checkout. Contact sales.` }
  }
  const missingModule = def.requires.find((m) => !modulesOwnedOrInCart.includes(m))
  if (missingModule) {
    return {
      ok: false,
      reason: `${def.label} requires ${def.requires.join(', ')}. Add it to your cart or purchase it first.`,
    }
  }
  return { ok: true }
}

// ── Concierge, Sep 2026 rescope ───────────────────────────────────────────
// Priced on DATA SOURCES, not on locations. A data source is one utility account or meter billed
// on a recurring basis: an electricity account, a gas meter. A location with electricity and gas
// is usually two.
//
// ⚠️ THE OLD LOCATION BANDS ABOVE ARE SUPERSEDED AND ARE KEPT ONLY UNTIL THEIR CALLERS MOVE.
// conciergeTierForLocations, the three concierge-* keys and ADDONS[key].price are read by
// /api/checkout, /api/admin/create-invoice and app/pricing/page.tsx. They come out in the final
// cleanup batch, once those three have moved. Nothing new may read them.
// docs/pricing-and-concierge-spec-v5.md is the current model; v4's Concierge section is superseded.

// ⚠️ UTILITY CONNECTION IS NOT BUILT. While this is false the connected rate is display only: it
// shows as "Coming soon" and checkout sells uploaded sources only. conciergeQuote REFUSES a
// connected quantity rather than quietly pricing it. Falling back to the uploaded rate, or to
// zero, would sell a service that does not exist yet.
export const UTILITY_CONNECT_ENABLED = false

// One-time, charged on a customer's FIRST Concierge purchase only. Not an entitlement and it
// writes no term: it buys the specialist's setup work, not access.
//
// ⚠️ FLAT SINCE 28 Sep 2026, AND THAT REMOVED A WHOLE CLASS OF PROBLEM. It was keyed on the GHG
// tier, so the fee had to know which band a customer was on, so a customer adding Concierge WITHOUT
// buying GHG in the same cart had to have their tier derived from their stored location allowance.
// That derivation went inert the moment locations became unlimited on every plan, and it would have
// refused exactly those customers. A flat fee does not ask the question, and ghgTierFromAllowance
// was deleted with it.
export const CONCIERGE_ONBOARDING_USD = 1395

export type SourceKind = 'uploaded' | 'connected'

// Annual, per source. A one-time charge each year that grants the usual 365-day term, the same
// shape as every other line in this file. There are no subscriptions in this platform.
export const CONCIERGE_SOURCE_USD: Record<SourceKind, number> = {
  uploaded:  90,   // customer uploads bills, Concierge extracts
  connected: 60,   // pulled directly from the utility
}

// ⚠️ A SELF-SERVE CEILING, NOT A TIER CAP. 60 is 20 locations at 3 sources each, 20 being the
// Advisory location ceiling under the old model. GHG_TIERS.advisory.locationAllowance is null
// (uncapped) today, so nothing else in this file bounds a Concierge order: without this, a typo in
// a quantity field becomes a five-figure card charge. Above it the order is a conversation, which
// is the same posture GHG Advisory and Concierge Enterprise already take.
export const CONCIERGE_MAX_SELF_SERVE_SOURCES = 60

/** Whether a source kind can be SOLD today. Connected is priced but not sellable yet. */
export function sourceKindSellable(kind: SourceKind): boolean {
  return kind === 'uploaded' || UTILITY_CONNECT_ENABLED
}

export interface ConciergeSelection {
  uploadedSources: number
  /** Rejected while UTILITY_CONNECT_ENABLED is false. Omit, or 0, until then. */
  connectedSources?: number
  /**
   * True when the customer has never held Concierge. Decided server side, never by the client.
   * ⚠️ FOR THE ROUTE THAT COMPUTES IT: look at CONCIERGE ROWS ONLY. True means the user has no
   * entitlements row with module_key 'concierge' and none under any of the old concierge-* keys.
   * Do NOT widen it to a `source` value such as 'manual-test': that matches manual grants on other
   * modules, so a pilot customer given a hand-written GHG row would skip their onboarding fee.
   * Onboarding is once per customer, so a false positive here charges someone twice for setup work.
   */
  isFirstPurchase: boolean
}

export interface ConciergeQuote {
  onboardingUSD: number
  sourcesUSD: number
  totalUSD: number
  /** Ready for priceLineQty. Onboarding first, so it reads first on the invoice. */
  lines: { label: string; unitUSD: number; quantity: number }[]
}

// ⚠️ ONE FUNCTION FOR DISPLAY AND FOR CHARGE, which is the rule cartQuote follows for modules.
// The configurator and /api/checkout both call this, so a displayed Concierge price cannot differ
// from the charged one. Note that add-ons do NOT flow through cartQuote today: app/pricing/page.tsx
// sums them separately. This function is what closes that gap for Concierge.
//
// ⚠️ EVERY GUARD THROWS. NONE OF THEM COERCES. An earlier draft ran the counts through Math.trunc,
// which let 2.5 become 2 silently while priceLineQty rejected 2.5 outright, and let NaN through both
// range checks (NaN < 0 and NaN < 1 are each false) to return a NaN quote that would have rendered
// as "$NaN" and reached Stripe as a bad amount. A count that is not a whole number is a caller bug,
// and the loud failure is the cheap one.
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
 * TypeScript union. entitlements.ghg_tier is constrained to exactly these five in
 * supabase/migrations/20260928_ghg_employee_bands.sql.
 *
 * ⚠️ A SIXTH TIER IS A TWO PART CHANGE. Adding one here without altering that constraint makes
 * every purchase on the new tier fail AFTER payment: the webhook writes the value, Postgres rejects
 * it, the grant throws, and Stripe retries a write that can never succeed. M23 in
 * lib/entitlementMetadata.test.ts reads the constraint and pins this list against it, so the
 * omission fails a test rather than a customer.
 */
export const GHG_TIER_KEYS = ['starter', 'professional', 'business', 'advisory', 'enterprise'] as const

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

export function conciergeQuote(sel: ConciergeSelection): ConciergeQuote {
  const uploaded = sel.uploadedSources
  const connected = sel.connectedSources ?? 0
  // Number.isInteger is false for NaN, Infinity and any fraction, so this one test covers all
  // three. connectedSources is checked only when supplied: absent means zero, which is valid.
  if (!Number.isInteger(uploaded) || (sel.connectedSources != null && !Number.isInteger(sel.connectedSources))) {
    throw new Error('conciergeQuote: a source count must be a whole number.')
  }
  if (uploaded < 0 || connected < 0) {
    throw new Error('conciergeQuote: a source count cannot be negative.')
  }
  const total = uploaded + connected
  if (total < 1) {
    throw new Error('conciergeQuote: Concierge needs at least one data source.')
  }
  if (total > CONCIERGE_MAX_SELF_SERVE_SOURCES) {
    throw new Error(`conciergeQuote: above ${CONCIERGE_MAX_SELF_SERVE_SOURCES} data sources, contact us for a quote.`)
  }
  if (connected > 0 && !UTILITY_CONNECT_ENABLED) {
    throw new Error(
      'conciergeQuote: connected sources cannot be sold yet. Utility connection is not built, ' +
      'and the connected rate is display only until UTILITY_CONNECT_ENABLED is true.',
    )
  }
  const onboardingUSD = sel.isFirstPurchase ? CONCIERGE_ONBOARDING_USD : 0
  const sourcesUSD =
    uploaded * CONCIERGE_SOURCE_USD.uploaded + connected * CONCIERGE_SOURCE_USD.connected
  const lines: ConciergeQuote['lines'] = []
  if (onboardingUSD > 0) {
    // No tier in the label: the fee is the same whichever plan the customer is on.
    lines.push({ label: 'GHG Concierge onboarding', unitUSD: onboardingUSD, quantity: 1 })
  }
  if (uploaded > 0) {
    lines.push({ label: 'GHG Concierge data source, uploaded (1 year)', unitUSD: CONCIERGE_SOURCE_USD.uploaded, quantity: uploaded })
  }
  if (connected > 0) {
    lines.push({ label: 'GHG Concierge data source, connected (1 year)', unitUSD: CONCIERGE_SOURCE_USD.connected, quantity: connected })
  }
  return { onboardingUSD, sourcesUSD, totalUSD: onboardingUSD + sourcesUSD, lines }
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
