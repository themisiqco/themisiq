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

export const CURRENCY = 'usd'

// ── Canonical module keys ────────────────────────────────────────────────────
// These MUST match the entitlement `module_key` values written to Supabase AND
// the dashboard folder names under app/dashboard/. This is the canonical list.
export type ModuleKey =
  | 'ghg'
  | 'climate-risk'   // includes the materiality wizard + report
  | 'supply-chain'   // Supplier Portal (data collection)
  | 'people'
  | 'deals'
  | 'ai-governance'
  | 'cyber'

export const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'ghg',           name: 'GHG Inventory (Scope 1, 2 & 3)' },
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
export const LEGACY_PRICING_PAGE_ID: Record<string, ModuleKey> = {
  ghg: 'ghg',
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

// GHG location allowance per tier (spec: Model A hard enforcement, Starter 3 / Pro 10 / Advisory 20).
// Single source of truth — checkout writes this onto the ghg entitlement row; the GHG
// wizard and server enforce against it. Packs (no tier) default to the Starter floor (3).
export function locationAllowanceForTier(tier: Tier): number {
  return ({ starter: 3, professional: 10, advisory: 20 } as Record<Tier, number>)[tier]
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
// NEW PRICING MODEL (June 2026 rescope) — ADDITIVE. Nothing above is changed yet.
// These exports are INERT until consumers are cut over in later steps:
//   (2) display pages → (3) PACKS rework → (4) checkout cutover (cart math + caps).
// Until then the live site keeps charging via the OLD model above. Do NOT wire
// locationAllowanceForTier() to GHG_TIERS yet — that moves in Step 4 alongside the
// (value-agnostic, NULL=uncapped) DB trigger already confirmed compatible.
// ─────────────────────────────────────────────────────────────────────────────

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
  'climate-risk':  4900,
  'deals':         4900,
  'supply-chain':  2900,
  'cyber':         2900,
  'ai-governance': 2900,
  'people':        1499,
}

// All-7 hero bundle (priced at GHG Professional). The all-7 cart will use
// min(discounted sum, FULL_PLATFORM_PRICE) — wired in the Step 4 checkout cutover.
export const FULL_PLATFORM_PRICE = 24900

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
// Verification Readiness ($499/yr) layers on top of GHG: it requires the `ghg`
// module, and can be bought either on its own (if GHG is already owned) or
// bundled with a fresh GHG purchase in the same checkout.
//
// Design decisions (confirmed with Lisa):
//  - Flat $499 — does NOT follow the founding-offer switch.
//  - Does NOT count toward the 2-/3-module volume discount.
//  - Its own entitlement key `verification`, gated separately from `ghg`.
export type AddOnKey = 'verification' | 'concierge-basic' | 'concierge-standard' | 'concierge-enterprise'

export const ADDONS: Record<
  AddOnKey,
{ key: AddOnKey; label: string; price: number; requires: ModuleKey[]; requiresAddOnAnyOf?: AddOnKey[] }
> = {
verification: {
    key: 'verification',
    label: 'Verification Readiness',
    price: 499,
    requires: ['ghg'],
    requiresAddOnAnyOf: ['concierge-basic', 'concierge-standard', 'concierge-enterprise'],
  },
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
    price: 0,
    requires: ['ghg'],
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
// `requiresAddOnAnyOf` lists prerequisite add-ons (at least one must be present).
// Returns ok=false with a human-readable reason the routes surface verbatim.
export function addOnRequirementsMet(
  addOn: AddOnKey,
  modulesOwnedOrInCart: ModuleKey[],
  addOnsOwnedOrInCart: AddOnKey[] = [],
): { ok: boolean; reason?: string } {
  const def = ADDONS[addOn]
  const missingModule = def.requires.find((m) => !modulesOwnedOrInCart.includes(m))
  if (missingModule) {
    return {
      ok: false,
      reason: `${def.label} requires ${def.requires.join(', ')}. Add it to your cart or purchase it first.`,
    }
  }
  if (def.requiresAddOnAnyOf && def.requiresAddOnAnyOf.length > 0) {
    const hasOne = def.requiresAddOnAnyOf.some((a) => addOnsOwnedOrInCart.includes(a))
    if (!hasOne) {
      const names = def.requiresAddOnAnyOf.map((a) => ADDONS[a].label).join(' or ')
      return {
        ok: false,
        reason: `${def.label} requires ${names}. Add Concierge to your cart or purchase it first.`,
      }
    }
  }
  return { ok: true }
}

// ── Stripe helper ────────────────────────────────────────────────────────────
// Stripe expects amounts in the smallest currency unit (cents for USD).
export function toStripeAmount(dollars: number): number {
  return Math.round(dollars * 100)
}

// Access term: one-time charge grants one year of access (renewal handled
// manually for now). The webhook stamps this onto each entitlement row.
export const ACCESS_TERM_DAYS = 365
