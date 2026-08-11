// lib/order/provision.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY foundation helpers for the automated-invoice path (Stage I1).
//
//   resolveOrCreateUser(email) → user_id : resolve, or create, a Supabase account.
//   priceOrder({ modules, tier }) → priced order : recompute price + entitlements.
//
// This stage creates NO invoice, sends NO email, and wires into NO route — I2 composes
// these two primitives. NO live money touched here.
//
// SECURITY: imports the SERVICE-ROLE admin client (getSupabaseAdmin, which reads
// SUPABASE_SERVICE_ROLE_KEY). Same convention as lib/stripe.ts / lib/supabaseAdmin.ts:
// NEVER import this module into browser/client code. It is inert client-side anyway —
// the service-role key is absent there, so getSupabaseAdmin() throws.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '../supabaseAdmin'
import { cartQuote, LEGACY_PRICING_PAGE_ID, type ModuleKey, type Tier, type GhgTier } from '../pricing'

// ── Account provisioning (the net-new "or-create" primitive) ──────────────────

// Paginated, case-insensitive email → user_id lookup. Mirrors findUserIdByEmail in
// app/api/admin/create-invoice/route.ts (kept private there; replicated here).
async function findUserIdByEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<string | null> {
  const perPage = 200
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < perPage) break
  }
  return null
}

// Resolve a Supabase user_id for an email, creating the account if none exists.
// email_confirm: true → the account is immediately usable and no confirmation email is
// sent (matches the app's confirmation-off signup behaviour). Service-role only.
// Handles the create-race (a concurrent request created the user first) by re-looking up.
export async function resolveOrCreateUser(email: string): Promise<string> {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) {
    throw new Error('A valid email is required to provision an account.')
  }
  const admin = getSupabaseAdmin()

  // 1) Existing account?
  const existing = await findUserIdByEmail(admin, normalized)
  if (existing) return existing

  // 2) Create it.
  const { data, error } = await admin.auth.admin.createUser({ email: normalized, email_confirm: true })
  if (error) {
    // Likely race: the user now exists (created between our lookup and this create) →
    // re-lookup and use it. Only if that also fails do we surface the error.
    const afterRace = await findUserIdByEmail(admin, normalized)
    if (afterRace) return afterRace
    throw new Error(`Could not provision an account for ${normalized}: ${error.message}`)
  }
  if (!data.user?.id) {
    // Defensive: no error but no id — re-lookup once, else fail loudly.
    const afterCreate = await findUserIdByEmail(admin, normalized)
    if (afterCreate) return afterCreate
    throw new Error(`Account creation returned no id for ${normalized}.`)
  }
  return data.user.id
}

// ── Server-side price recompute (never trust a client-supplied amount) ────────

// ⚠️ NO LICENCE TERM IS SET HERE, AND NONE SHOULD BE. This module prices an order and produces
// the metadata string; it never touches the `entitlements` table. The invoice path grants through
// Stripe's invoice.paid → grantFromMetadata in app/api/webhooks/stripe/route.ts, which is the same
// and only writer the card path uses, so both get term_start/term_end from ONE call to
// lib/entitlementTerm.ts. Adding a term here would create the second +365 this codebase keeps
// getting bitten by, and it would be the one that silently disagrees — invoice customers are the
// path nobody exercises by accident.
export interface PricedOrder {
  keys: ModuleKey[]         // canonical module keys (pricing-page ids resolved)
  totalUSD: number          // recomputed via cartQuote; 0 when requiresQuote
  entitlements: string      // comma-joined keys — the exact grantFromMetadata format
  requiresQuote: boolean    // GHG Advisory in cart → custom quote (no self-serve total)
  requiresInvoice: boolean  // total over the card threshold ($10k) → invoice/wire
}

// Convert pricing-page ids (ghg / supply / risk) → canonical keys, then recompute the
// price + entitlements string from lib/pricing.ts. THE authority — any client-supplied
// amount is ignored; only the modules + tier are consulted.
export function priceOrder(input: { modules: string[]; tier?: Tier }): PricedOrder {
  const keys = Array.from(new Set(
    (input.modules ?? [])
      .map((id) => LEGACY_PRICING_PAGE_ID[String(id).trim()])
      .filter(Boolean),
  )) as ModuleKey[]

  // Validate the tier (default to Essentials, as the checkout/order surfaces do).
  const tier: Tier = (input.tier === 'starter' || input.tier === 'professional' || input.tier === 'advisory')
    ? input.tier
    : 'starter'

  const q = cartQuote({ modules: keys, ghgTier: tier as GhgTier })
  return {
    keys,
    totalUSD: q.totalUSD,
    // grantFromMetadata does entitlements.split(',').map(trim).filter(Boolean) → this matches.
    entitlements: keys.join(','),
    requiresQuote: q.requiresQuote,
    requiresInvoice: q.requiresInvoice,
  }
}
