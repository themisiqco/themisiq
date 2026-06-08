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
  | 'supply-chain'   // includes the scope3 page
  | 'people'
  | 'deals'
  | 'ai-governance'
  | 'cyber'

export const MODULES: { key: ModuleKey; name: string }[] = [
  { key: 'ghg',           name: 'GHG Inventory (Scope 1 & 2)' },
  { key: 'climate-risk',  name: 'Climate Risk' },
  { key: 'supply-chain',  name: 'Supply Chain & Scope 3' },
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
export type AddOnKey = 'verification'

export const ADDONS: Record<
  AddOnKey,
  { key: AddOnKey; label: string; price: number; requires: ModuleKey[] }
> = {
  verification: {
    key: 'verification',
    label: 'Verification Readiness',
    price: 499,
    requires: ['ghg'],
  },
}

// True when the customer's owned + in-cart modules satisfy an add-on's `requires`.
export function addOnRequirementsMet(
  addOn: AddOnKey,
  modulesOwnedOrInCart: ModuleKey[],
): boolean {
  return ADDONS[addOn].requires.every((m) => modulesOwnedOrInCart.includes(m))
}

// ── Stripe helper ────────────────────────────────────────────────────────────
// Stripe expects amounts in the smallest currency unit (cents for USD).
export function toStripeAmount(dollars: number): number {
  return Math.round(dollars * 100)
}

// Access term: one-time charge grants one year of access (renewal handled
// manually for now). The webhook stamps this onto each entitlement row.
export const ACCESS_TERM_DAYS = 365
