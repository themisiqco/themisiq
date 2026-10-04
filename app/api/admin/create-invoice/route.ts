// app/api/admin/create-invoice/route.ts
// ────────────────────────────────────────────────────────────────────────
// ADMIN-ONLY. Creates a DRAFT Stripe invoice for an enterprise customer.
//
// Security: caller must be logged in AND their email must match ADMIN_EMAIL.
// The invoice carries the SAME metadata shape as checkout, so when it is marked paid, the
// existing `invoice.paid` webhook branch grants the modules automatically — whether the
// customer paid by card through Stripe, or by wire to our bank and we marked it paid manually.
//
// THE SHAPE IS THE SAME KEYS AS CHECKOUT: user_id, entitlements, source, ghg_tier and the Concierge
// keys. lib/entitlementMetadata.test.ts pins both writers to one list, because a key present in only
// one of them is a grant that differs by payment path. FI0: ghg_location_allowance is no longer one of
// them; locations are unlimited on every plan, and the webhook no longer writes location_allowance.
//
// Pricing is computed server-side from lib/pricing.ts — identical source of
// truth as checkout, so the amount charged and the modules granted cannot drift.
//
// Payment: card only (Canadian accounts cannot use Stripe's bank-transfer
// payment method). Wire-transfer customers pay our bank directly using the
// instructions in the invoice footer (INVOICE_WIRE_FOOTER), and we mark the
// invoice paid manually.
//
// The invoice is created as a DRAFT. Review it in the Stripe Dashboard, then
// finalize/send manually.
// ─────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '../../../../lib/stripe'
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'
import {
  ALL_MODULE_KEYS,
  TIER_PRICING,
  configuratorPrice,
  cartQuote,
  NEW_PRICING_ACTIVE,
  ghgTierMetaValue,
  isGhgTier,
  isLegacyTier,
  type Tier,
  type GhgTier,
  type ModuleKey,
} from '../../../../lib/pricing'
import { billReviewOrder, type OwnedRow } from '../../../../lib/billReviewOrder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateInvoiceBody {
  customerEmail?: string
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: unknown[]   // refused since Oct 2026
  concierge?: { uploadedSources?: unknown; connectedSources?: unknown; reading?: unknown }   // Bill Review
  daysUntilDue?: number
}

export async function POST(req: NextRequest) {
  try {
    // 1) AuthN: must be a valid logged-in session.
    const token = bearerFrom(req)
    const { email: callerEmail } = await getAuthedClient(token)

    // 2) AuthZ: must be the admin.
    const adminEmail = process.env.ADMIN_EMAIL
    if (!adminEmail) {
      console.error('[admin-invoice] ADMIN_EMAIL is not set')
      return NextResponse.json({ error: 'Admin not configured.' }, { status: 500 })
    }
    if (!callerEmail || callerEmail.toLowerCase() !== adminEmail.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
    }

    // 3) Parse + validate input.
    const body = (await req.json()) as CreateInvoiceBody
    const customerEmail = body.customerEmail?.trim().toLowerCase()
    if (!customerEmail) {
      return NextResponse.json({ error: 'customerEmail is required.' }, { status: 400 })
    }

    // 4) Resolve the target user's Supabase id from their email.
    const supabaseAdmin = getSupabaseAdmin()
    const userId = await findUserIdByEmail(supabaseAdmin, customerEmail)
    if (!userId) {
      return NextResponse.json(
        { error: `No ThemisIQ account found for ${customerEmail}. Have them sign up first.` },
        { status: 404 },
      )
    }

    // 5) Build priced line items + the entitlement key set from ONE source.
    const lines: { label: string; amount: number }[] = []
    const entitlements = new Set<string>()
    const sources: string[] = []
    // The GHG tier on this invoice, recorded so the webhook can write entitlements.ghg_tier; it also prices
    // Bill Review onboarding. Mirrors app/api/checkout/route.ts.
    let ghgTierForMeta: GhgTier | null = null
    let conciergeMeta: Record<string, string> = {}

    if (body.tier || body.moduleKeys) {
      const tier = body.tier
      const moduleKeys = body.moduleKeys ?? []
      if (!tier) {
        return NextResponse.json({ error: 'tier is required with moduleKeys.' }, { status: 400 })
      }
      if (moduleKeys.length === 0) {
        return NextResponse.json({ error: 'No modules selected.' }, { status: 400 })
      }
      const allValid = moduleKeys.every((m) => (ALL_MODULE_KEYS as string[]).includes(m))
      if (!allValid) {
        return NextResponse.json({ error: 'Unknown module in selection.' }, { status: 400 })
      }
      if (NEW_PRICING_ACTIVE) {
        // admin guard above is `!tier` only — validate the tier here (inside the
        // flag-on branch, so the old path stays byte-unchanged) before cartQuote.
        if (!isGhgTier(tier)) {
          return NextResponse.json({ error: 'Invalid tier.' }, { status: 400 })
        }
        const q = cartQuote({ modules: moduleKeys, ghgTier: tier as GhgTier })
        if (q.requiresQuote) {
          return NextResponse.json({ error: 'GHG Enterprise is a custom quote: add a manual line item in Stripe instead.' }, { status: 400 })
        }
        // Any amount may be invoiced (card-any-amount, Oct 2026), so the total does not block here.
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''}`
        lines.push({ label, amount: q.totalUSD })
      } else {
        // ⚠️ THE OLD MODEL HAS NO PRICE FOR THE NEW TIERS, so this arm refuses rather than casting.
        // It is unreachable while NEW_PRICING_ACTIVE is true; if the flag ever moved, a Business or
        // Enterprise selection would otherwise index TIER_PRICING and come back undefined.
        if (!isLegacyTier(tier)) {
          return NextResponse.json({ error: 'That plan is not available on this pricing model.' }, { status: 400 })
        }
        const price = configuratorPrice(tier, moduleKeys)
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''} (${tier})`
        lines.push({ label, amount: price })
      }
      moduleKeys.forEach((m) => entitlements.add(m))
      sources.push('configurator')
      // The GHG tier, recorded the same way as app/api/checkout/route.ts, so both writers feed the
      // webhook the same keys.
      if (moduleKeys.includes('ghg')) {
        ghgTierForMeta = tier as GhgTier // see the note on the same capture in the checkout route
      }
    }

    // The location-band Concierge add-ons were removed in Oct 2026 (pricing-2026-10).
    if (body.addOns && body.addOns.length > 0) {
      return NextResponse.json({ error: 'That add-on is no longer sold. Bill Review is invoiced with its number of data sources.' }, { status: 400 })
    }

    // Bill Review (internal name: concierge), through lib/billReviewOrder.ts exactly as checkout.
    // ⚠️ TWO DELIBERATE DIFFERENCES FROM THAT ROUTE. The read filters by user_id explicitly, because this runs as
    // admin for someone else and there is no RLS scoping to rely on. And no amount blocks: an invoice may be
    // requested at any amount, as card may be used at any amount.
    if (body.concierge) {
      const { data: ownedRows, error: ownedErr } = await supabaseAdmin
        .from('entitlements')
        .select('module_key, ghg_tier, term_end')
        .eq('user_id', userId)
      if (ownedErr) {
        console.error('[admin-invoice] entitlement read failed:', ownedErr.message)
        return NextResponse.json({ error: 'Could not read the customer entitlements.' }, { status: 503 })
      }
      const cartTier = entitlements.has('ghg') ? ghgTierForMeta : null
      const order = billReviewOrder(body.concierge, cartTier, (ownedRows ?? []) as OwnedRow[], new Date())
      if (!order.ok) return NextResponse.json({ error: order.error }, { status: order.status })
      for (const line of order.quote.lines) {
        // ⚠️ QUANTITY IS FLATTENED INTO THE AMOUNT AND NAMED IN THE LABEL. stripe.invoiceItems.create takes a
        // single `amount`, so the multiplication happens here and the label carries the count.
        const label = line.quantity > 1 ? `${line.label} x ${line.quantity}` : line.label
        lines.push({ label, amount: line.unitUSD * line.quantity })
      }
      entitlements.add(order.grant)
      conciergeMeta = order.meta
      sources.push(order.source)
    }

    if (lines.length === 0) {
      return NextResponse.json({ error: 'Nothing to invoice.' }, { status: 400 })
    }

    // 6) Find or create the Stripe customer for this email.
    const stripe = getStripe()
    const customerId = await findOrCreateCustomer(stripe, customerEmail)

    // 7) Metadata — identical shape the webhook expects.
    const metadata = {
      user_id: userId,
      entitlements: Array.from(entitlements).join(','),
      source: 'admin-invoice' + (sources.length ? ` | ${sources.join(' | ')}` : ''),
      // Same key, same empty-string convention, as app/api/checkout/route.ts. Both writers feed one
      // reader, so a key present in only one of them is the defect lib/entitlementMetadata.test.ts
      // exists to catch.
      ghg_tier: ghgTierMetaValue(ghgTierForMeta),
      ...conciergeMeta,
    }

    // 8) Create the DRAFT invoice FIRST, then attach each line item to it.
    //    (Invoice items must reference the invoice id explicitly, or they
    //    won't be swept onto it — which would leave a $0 invoice.)
    const invoice = await stripe.invoices.create({
      customer: customerId,
      currency: 'usd', // MUST match the USD invoice items — the Stripe account default is CAD,
                       // and an unset invoice currency falls back to CAD → currency-conflict error.
      collection_method: 'send_invoice',
      days_until_due: body.daysUntilDue ?? 30,
      auto_advance: false, // stays a DRAFT — review & send manually
      metadata,
      footer: process.env.INVOICE_WIRE_FOOTER || undefined,
      payment_settings: {
        payment_method_types: ['card'], // Canadian account: card only via Stripe
      },
    })

    for (const line of lines) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id, // attach to THIS invoice
        currency: 'usd',
        amount: Math.round(line.amount * 100), // dollars -> cents
        description: line.label,
      })
    }

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      status: invoice.status, // 'draft'
      customerId,
      userId,
      entitlements: metadata.entitlements,
      total: lines.reduce((a, l) => a + l.amount, 0),
      dashboardHint:
        'Draft created. Review in Stripe Dashboard → Invoices, then finalize & send.',
    })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }
    console.error('[admin-invoice] error:', err)
    return NextResponse.json({ error: 'Could not create invoice.' }, { status: 500 })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

async function findUserIdByEmail(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  email: string,
): Promise<string | null> {
  const perPage = 200
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const match = data.users.find((u) => (u.email || '').toLowerCase() === email)
    if (match) return match.id
    if (data.users.length < perPage) break
  }
  return null
}

async function findOrCreateCustomer(stripe: Stripe, email: string): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 })
  if (existing.data.length > 0) return existing.data[0].id
  const created = await stripe.customers.create({ email })
  return created.id
}
