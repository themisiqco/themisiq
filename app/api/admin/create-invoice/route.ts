// app/api/admin/create-invoice/route.ts
// ────────────────────────────────────────────────────────────────────────
// ADMIN-ONLY. Creates a DRAFT Stripe invoice for an enterprise customer.
//
// Security: caller must be logged in AND their email must match ADMIN_EMAIL.
// The invoice carries the SAME metadata shape as checkout
// ({ user_id, entitlements }), so when it is marked paid, the existing
// `invoice.paid` webhook branch grants the modules automatically — whether the
// customer paid by card through Stripe, or by wire to our bank and we marked it
// paid manually.
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
  PACKS,
  ADDONS,
  addOnRequirementsMet,
  configuratorPrice,
  cartQuote,
  NEW_PRICING_ACTIVE,
  type Tier,
  type GhgTier,
  type ModuleKey,
  type PackId,
  type AddOnKey,
} from '../../../../lib/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateInvoiceBody {
  customerEmail?: string
  packId?: PackId
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
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

    if (body.packId) {
      if (NEW_PRICING_ACTIVE) {
        return NextResponse.json({ error: 'Packs are no longer sold directly — invoice the modules individually.' }, { status: 400 })
      }
      const pack = PACKS[body.packId]
      if (!pack) return NextResponse.json({ error: 'Unknown pack.' }, { status: 400 })
      lines.push({ label: pack.label, amount: pack.price })
      pack.modules.forEach((m) => entitlements.add(m))
      sources.push(`pack:${body.packId}`)
    }

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
        if (!TIER_PRICING[tier]) {
          return NextResponse.json({ error: 'Invalid tier.' }, { status: 400 })
        }
        const q = cartQuote({ modules: moduleKeys, ghgTier: tier as GhgTier })
        if (q.requiresQuote) {
          return NextResponse.json({ error: 'GHG Advisory is a custom quote — add a manual line item in Stripe instead.' }, { status: 400 })
        }
        // This route IS the invoice path, so requiresInvoice (>$10k) does NOT block here.
        const label = `ThemisIQ — ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''}`
        lines.push({ label, amount: q.totalUSD })
      } else {
        const price = configuratorPrice(tier, moduleKeys)
        const label = `ThemisIQ — ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''} (${tier})`
        lines.push({ label, amount: price })
      }
      moduleKeys.forEach((m) => entitlements.add(m))
      sources.push('configurator')
    }

    if (body.addOns && body.addOns.length > 0) {
      for (const addOnKey of body.addOns) {
        const addOn = ADDONS[addOnKey]
        if (!addOn) {
          return NextResponse.json({ error: `Unknown add-on: ${addOnKey}` }, { status: 400 })
        }
       // Requirement check (modules + add-on prerequisites) via single authority.
        // `entitlements` holds both modules and add-on keys; split via ADDONS lookup.
        const entArr = [...entitlements]
        const moduleEnts = entArr.filter((k) => !(k in ADDONS)) as ModuleKey[]
        const addOnEnts = [
          ...entArr.filter((k) => k in ADDONS),
          ...(body.addOns ?? []),
        ] as AddOnKey[]
        const check = addOnRequirementsMet(addOnKey, moduleEnts, addOnEnts)
        if (!check.ok) {
          return NextResponse.json({ error: check.reason }, { status: 400 })
        }
        lines.push({ label: addOn.label, amount: addOn.price })
        entitlements.add(addOn.key)
        sources.push(`addon:${addOnKey}`)
      }
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
