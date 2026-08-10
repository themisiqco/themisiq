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
  | 'supply-chain'   // Supplier Portal (data collection)
  | 'people'
  | 'deals'
  | 'ai-governance'
  | 'cyber'

export const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'ghg',           name: 'GHG Inventory (Scope 1, 2 & 3)' },
  { key: 'cbam',          name: 'CBAM (Carbon Border Adjustment Mechanism)' },
  { key: 'climate-risk',  name: 'Climate Risk' },
  { key: 'supply-chain',  name: 'Supply Chain' },
  { key: 'people',        name: 'People & Workforce' },
  { key: 'deals',         name: 'Deals & Investment' },
  { key: 'ai-governance', name: 'AI Governance' },
  { key: 'cyber',         name: 'Cyber Governance' },
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
  supply: 'supply-chain',
  people: 'people',
  deals: 'deals',
  ai: 'ai-governance',
  cyber: 'cyber',
}

// ── Tiers + founding offer ───────────────────────────────────────────────────
export type Tier = 'starter' | 'professional' | 'advisory'

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
export const TIER_PRICING: Record<Tier, { full: number; early: number }> = {
  starter:      { full: 1499, early: 999 },
  professional: { full: 2499, early: 2499 },
  advisory:     { full: 4999, early: 4999 },
}

// GHG location allowance per tier. Single source of truth — checkout writes this onto
// the ghg entitlement row; the GHG wizard + server (NULL = uncapped trigger) enforce it.
// Behind NEW_PRICING_ACTIVE: live/old model = Starter 3 / Pro 10 / Advisory 20; new model =
// Essentials 3 / Pro 15 / Advisory null (uncapped), sourced from GHG_TIERS. While the flag
// is false this is byte-for-byte the old behaviour. Packs (no tier) still default to the
// Starter/Essentials floor (3) at their call sites.
export function locationAllowanceForTier(tier: Tier): number | null {
  return NEW_PRICING_ACTIVE
    ? GHG_TIERS[tier].locationAllowance
    : ({ starter: 3, professional: 10, advisory: 20 } as Record<Tier, number>)[tier]
}

// The price actually charged right now for a given tier (respects the switch).
export function tierPrice(tier: Tier): number {
  const p = TIER_PRICING[tier]
  return FOUNDING_OFFER_ACTIVE ? p.early : p.full
}

// The "full" (pre-discount) price — useful for the struck-through price on the
// pricing page. Returns null when there's no active saving to show.
export function tierStrikethrough(tier: Tier): number | null {
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

// GHG is the only multi-tier module. priceUSD null = "Contact us" (quote path);
// locationAllowance null = uncapped (matches the trigger's NULL = uncapped rule).
export const GHG_TIERS: Record<GhgTier, { priceUSD: number | null; locationAllowance: number | null }> = {
  starter:      { priceUSD: 4900,  locationAllowance: 3 },    // UI label: "Essentials"
  professional: { priceUSD: 11900, locationAllowance: 15 },
  advisory:     { priceUSD: null,  locationAllowance: null }, // Contact us / uncapped
}

// Flat single-tier modules (USD / year). Keyed on every non-GHG module so the
// type fails to compile if a module is ever added without a price.
export const FLAT_MODULE_PRICES: Record<Exclude<ModuleKey, 'ghg'>, number> = {
  'cbam':          1499,
  'climate-risk':  4900,
  'deals':         4900,
  'supply-chain':  2900,
  'cyber':         2900,
  'ai-governance': 2900,
  'people':        1499,
}

// Self-serve card is disabled ABOVE this; larger orders route to request-an-invoice
// (admin-invoice draft: card or manual wire — Canadian account has no Stripe ACH).
export const CARD_THRESHOLD_USD = 10000

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
export function configuratorPrice(tier: Tier, moduleKeys: ModuleKey[]): number {
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
  let sum = 0
  for (const m of modules) {
    if (m === 'ghg') {
      sum += GHG_TIERS[ghgTier].priceUSD as number // non-null guaranteed above
    } else {
      sum += FLAT_MODULE_PRICES[m as Exclude<ModuleKey, 'ghg'>]
    }
  }
  const discounted = Math.round(sum * (1 - volumeDiscount(modules.length)))
  const totalUSD = discounted
  return { totalUSD, requiresQuote: false, requiresInvoice: requiresInvoice(totalUSD) }
}

// ── Fixed packs (homepage entry points) ──────────────────────────────────────
// NOTE: these prices are set independently of the configurator formula, so they
// do not necessarily equal configuratorPrice() for the same modules. That's a
// pricing/business decision for you to reconcile — the code charges whatever is
// set here. Confirm each pack's price and module list against your live site.
export type PackId =
  | 'supplier-readiness'
  | 'climate-readiness'
  | 'esg-foundation'
  | 'investor-esg'
  | 'ifrs-s2-compliance'
  | 'csrd-compliance'

export const PACKS: Record<
  PackId,
  { label: string; price: number; modules: ModuleKey[] }
> = {
  'supplier-readiness': {
    label: 'Supplier Readiness',
    price: 1999,
    modules: ['ghg', 'supply-chain'],
  },
  'climate-readiness': {
    label: 'Climate Readiness',
    price: 1999,
    modules: ['ghg', 'climate-risk'],
  },
  'esg-foundation': {
    label: 'ESG Foundation',
    price: 2999,
    modules: ['ghg', 'people', 'climate-risk'],
  },
  'investor-esg': {
    label: 'Investor ESG',
    price: 3999,
    modules: ['ghg', 'climate-risk', 'supply-chain', 'deals'],
  },
  'ifrs-s2-compliance': {
    label: 'IFRS S2 Compliance Pack',
    price: 4999,
    modules: ['ghg', 'climate-risk'],
  },
  'csrd-compliance': {
    label: 'CSRD Compliance Pack',
    price: 5999,
    modules: ['ghg', 'climate-risk', 'supply-chain', 'people'],
  },
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
{ key: AddOnKey; label: string; price: number; requires: ModuleKey[]; isCustomQuote?: boolean }
> = {
  'concierge-basic': {
    key: 'concierge-basic',
    label: 'Concierge — Basic (up to 5 locations)',
    price: 799,
    requires: ['ghg'],
  },
  'concierge-standard': {
    key: 'concierge-standard',
    label: 'Concierge — Standard (6–15 locations)',
    price: 1499,
    requires: ['ghg'],
  },
  'concierge-enterprise': {
    key: 'concierge-enterprise',
    label: 'Concierge — Enterprise (16+ locations)',
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
    throw new Error(`priceLine: refusing a $0 line item for "${name}" — a zero price is not a price.`)
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

// Access term: one-time charge grants one year of access (renewal handled
// manually for now). The webhook stamps this onto each entitlement row.
export const ACCESS_TERM_DAYS = 365
