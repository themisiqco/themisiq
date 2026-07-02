// lib/order/invoice.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY. Stage I2: create a Stripe invoice as a DRAFT for the >$10k quote path,
// composing the I1 provisioning helpers with the proven admin-invoice pattern.
//
// ⚠️ DRAFTS ONLY. auto_advance:false → the invoice stays a draft; nothing finalizes or
// sends this stage. NOT wired into /api/order/quote-request yet (that's I3). No live send.
//
// Safety spine (mirrors app/api/admin/create-invoice/route.ts):
//   • amount is SERVER-computed via priceOrder (never a client-supplied number),
//   • metadata carries { user_id, entitlements } exactly as the invoice.paid webhook reads,
//   • Advisory (requiresQuote) is NOT auto-priced — returned for manual handling,
//   • an idempotency key makes identical repeat submits return the SAME draft (no duplicates).
//
// SECURITY: imports the service-role provisioning helpers + server Stripe client. Never
// import into client code.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from 'stripe'
import { getStripe } from '../stripe'
import { resolveOrCreateUser, priceOrder } from './provision'
import type { Tier } from '../pricing'

export interface CreateDraftInvoiceInput {
  email: string
  modules: string[]     // pricing-page ids (ghg/supply/…); priceOrder resolves → canonical keys
  tier?: Tier
  ref?: string          // optional deal token, for attribution
}

export type DraftInvoiceResult =
  | { ok: true; invoiceId: string; status: 'draft'; amount: number; user_id: string; customerId: string }
  | { ok: false; reason: 'empty'; message: string }          // no valid modules
  | { ok: false; reason: 'requires_quote'; message: string } // Advisory — manual quote, not auto-priced
  | { ok: false; reason: 'card_eligible'; message: string; amount: number } // ≤$10k — belongs on card path
  | { ok: false; reason: 'error'; message: string }          // validation / Stripe / provisioning failure

// Replicated from the admin route (private there): reuse an existing Stripe customer by email,
// else create one. Invoices are addressed to a customer.
async function findOrCreateCustomer(stripe: Stripe, email: string): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 })
  if (existing.data.length > 0) return existing.data[0].id
  const created = await stripe.customers.create({ email })
  return created.id
}

export async function createDraftInvoiceForOrder(input: CreateDraftInvoiceInput): Promise<DraftInvoiceResult> {
  try {
    const email = (input.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return { ok: false, reason: 'error', message: 'A valid email is required.' }
    }

    // 1) Server-price (the ONLY authority — any client amount is irrelevant, none is accepted).
    const priced = priceOrder({ modules: input.modules, tier: input.tier })
    if (priced.keys.length === 0) {
      return { ok: false, reason: 'empty', message: 'No valid modules to invoice.' }
    }
    // Advisory → no self-serve price. Mirror the admin route: don't guess an amount.
    if (priced.requiresQuote) {
      return { ok: false, reason: 'requires_quote', message: 'GHG Advisory is a custom quote — a manual line item is required; not auto-invoiced.' }
    }
    // This path is for >$10k only. A card-eligible cart should NOT become an invoice.
    if (!priced.requiresInvoice) {
      return { ok: false, reason: 'card_eligible', message: 'Order is under the card threshold — use card checkout, not an invoice.', amount: priced.totalUSD }
    }

    // 2) Provision the account (resolve-or-create) → user_id for the webhook grant.
    const userId = await resolveOrCreateUser(email)

    // 3) Stripe customer for the email.
    const stripe = getStripe()
    const customerId = await findOrCreateCustomer(stripe, email)

    // 4) Metadata — the exact shape invoice.paid → grantFromMetadata reads (user_id + comma-joined
    //    canonical keys). ref rides along for attribution (ignored by the grant).
    const metadata: Record<string, string> = {
      user_id: userId,
      entitlements: priced.entitlements,
      source: 'order-quote-invoice',
      ...(input.ref ? { ref: input.ref } : {}),
    }

    // 5) Idempotency key: stable per (email, canonical keys, tier). An identical repeat submit
    //    replays the SAME invoice/item instead of creating duplicates. (Stripe idempotency keys
    //    live ~24h; after that a repeat would create a new draft — acceptable for this path.)
    //    The item uses a sibling key so a retry after a partial failure doesn't double-attach.
    const sig = `${email}:${priced.keys.join(',')}:${input.tier ?? 'starter'}`
    const invoiceIdemKey = `order-invoice:${sig}`
    const itemIdemKey = `order-invoice-item:${sig}`

    // 6) DRAFT invoice FIRST (auto_advance:false → nothing sends), then attach the priced item to it.
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        currency: 'usd', // MUST match the USD invoice items — the Stripe account default is CAD,
                         // and an unset invoice currency falls back to CAD → currency-conflict error.
        collection_method: 'send_invoice',
        days_until_due: 30,
        auto_advance: false, // DRAFT — review & finalize/send manually; does NOT send this stage
        metadata,
        footer: process.env.INVOICE_WIRE_FOOTER || undefined,
        payment_settings: { payment_method_types: ['card'] }, // Canadian account: card only via Stripe
      },
      { idempotencyKey: invoiceIdemKey },
    )

    if (!invoice.id) {
      return { ok: false, reason: 'error', message: 'Stripe returned an invoice without an id.' }
    }

    await stripe.invoiceItems.create(
      {
        customer: customerId,
        invoice: invoice.id, // attach to THIS invoice (or it won't be swept on → $0 invoice)
        currency: 'usd',
        amount: Math.round(priced.totalUSD * 100), // server-computed dollars → cents
        description: `ThemisIQ — ${priced.keys.length} module${priced.keys.length > 1 ? 's' : ''}`,
      },
      { idempotencyKey: itemIdemKey },
    )

    return { ok: true, invoiceId: invoice.id, status: 'draft', amount: priced.totalUSD, user_id: userId, customerId }
  } catch (err) {
    // Never throw uncaught — the caller (I3) gets a structured failure.
    console.error('[order-invoice] createDraftInvoiceForOrder error:', err)
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : 'Could not create draft invoice.' }
  }
}
