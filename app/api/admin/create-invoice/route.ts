// app/api/admin/create-invoice/route.ts
// ────────────────────────────────────────────────────────────────────────
// ADMIN-ONLY. Creates a DRAFT Stripe invoice for an enterprise customer.
//
// Security: caller must be logged in AND their email must match ADMIN_EMAIL.
// The invoice carries the SAME metadata shape as checkout, so when it is marked paid, the
// existing `invoice.paid` webhook branch grants the modules automatically — whether the
// customer paid by card through Stripe, or by wire to our bank and we marked it paid manually.
//
// THE FULL SHAPE IS FOUR KEYS: { user_id, entitlements, source, ghg_location_allowance }.
// This comment previously named only the first two, and that is how the omission survived: this
// route sent no ghg_location_allowance at all. grantFromMetadata reads it as
// `raw ? Number(raw) : null` and writes that to entitlements.location_allowance, where the
// enforce_ghg_location_allowance() trigger treats NULL as UNCAPPED — so A WRITER THAT OMITS THE
// KEY GRANTS UNLIMITED LOCATIONS. It fails open, silently, on the paid path. Every writer must
// satisfy the whole contract, including the empty-string convention for a null allowance.
// (Consequence while it was missing: GHG Professional is $11,900, above CARD_THRESHOLD_USD, so
// every self-serve Professional purchase routes HERE — none of them was ever capped at 15.)
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
  ADDONS,
  addOnRequirementsMet,
  configuratorPrice,
  locationAllowanceForTier,
  cartQuote,
  NEW_PRICING_ACTIVE,
  conciergeQuote,
  isFirstConciergePurchase,
  ghgTierFromAllowance,
  CONCIERGE_KEY,
  LEGACY_CONCIERGE_KEYS,
  UTILITY_CONNECT_ENABLED,
  type Tier,
  type GhgTier,
  type ModuleKey,
  type AddOnKey,
} from '../../../../lib/pricing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreateInvoiceBody {
  customerEmail?: string
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
  concierge?: { uploadedSources?: unknown; connectedSources?: unknown }
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
    // GHG location ceiling for the ghg entitlement row. Mirrors app/api/checkout/route.ts:67 —
    // null means the metadata key is written EMPTY, which the webhook reads as uncapped.
    let ghgAllowance: number | null = null
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
        if (!TIER_PRICING[tier]) {
          return NextResponse.json({ error: 'Invalid tier.' }, { status: 400 })
        }
        const q = cartQuote({ modules: moduleKeys, ghgTier: tier as GhgTier })
        if (q.requiresQuote) {
          return NextResponse.json({ error: 'GHG Advisory is a custom quote — add a manual line item in Stripe instead.' }, { status: 400 })
        }
        // This route IS the invoice path, so requiresInvoice (>$10k) does NOT block here.
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''}`
        lines.push({ label, amount: q.totalUSD })
      } else {
        const price = configuratorPrice(tier, moduleKeys)
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''} (${tier})`
        lines.push({ label, amount: price })
      }
      moduleKeys.forEach((m) => entitlements.add(m))
      sources.push('configurator')
      // Same derivation as app/api/checkout/route.ts:124 — one helper, one source of truth.
      // Omitting this is what made every manually-invoiced GHG customer uncapped.
      if (moduleKeys.includes('ghg')) {
        ghgAllowance = locationAllowanceForTier(tier)
        ghgTierForMeta = tier as GhgTier // see the note on the same capture in the checkout route
      }
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

    // Concierge on the source-based model. Mirrors section 2d of app/api/checkout/route.ts,
    // including the connected-source refusal, the tier validation and the fee derivation.
    // ⚠️ TWO DELIBERATE DIFFERENCES FROM THAT ROUTE. The read filters by user_id explicitly, because
    // this runs as admin for someone else and there is no RLS scoping to rely on. And there is no
    // >$10k block: this route IS the invoice path, so a large Concierge order belongs here.
    if (body.concierge) {
      const legacyInCart = (body.addOns ?? []).some((k) => (LEGACY_CONCIERGE_KEYS as readonly string[]).includes(k))
      if (legacyInCart) {
        return NextResponse.json(
          { error: 'Concierge was selected twice, on both the old and the new model.' },
          { status: 400 },
        )
      }

      const uploadedSources = body.concierge.uploadedSources as number
      const connectedSources = body.concierge.connectedSources as number | undefined

      if (!UTILITY_CONNECT_ENABLED && typeof connectedSources === 'number' && connectedSources > 0) {
        return NextResponse.json(
          { error: 'Connected utility sources are not available yet. Invoice uploaded sources only.' },
          { status: 400 },
        )
      }

      const { data: ownedRows, error: ownedErr } = await supabaseAdmin
        .from('entitlements')
        .select('module_key, location_allowance')
        .eq('user_id', userId)
      if (ownedErr) {
        console.error('[admin-invoice] entitlement read failed:', ownedErr.message)
        return NextResponse.json({ error: 'Could not read the customer entitlements.' }, { status: 503 })
      }
      const ownedKeys = (ownedRows ?? []).map((r) => r.module_key)

      const ghgInCart = entitlements.has('ghg')
      if (!ghgInCart && !ownedKeys.includes('ghg')) {
        return NextResponse.json(
          { error: 'Concierge requires the GHG module. Add it to this invoice or grant it first.' },
          { status: 400 },
        )
      }

      // The tier is validated here rather than inherited: the guard above runs only inside the
      // NEW_PRICING_ACTIVE arm, and this fee's amount must not depend on a branch two levels away.
      let conciergeTier: GhgTier | null = null
      if (ghgInCart) {
        if (!body.tier || !TIER_PRICING[body.tier]) {
          return NextResponse.json({ error: 'Invalid or missing tier.' }, { status: 400 })
        }
        conciergeTier = body.tier as GhgTier
      } else {
        const ghgRow = (ownedRows ?? []).find((r) => r.module_key === 'ghg')
        conciergeTier = ghgTierFromAllowance(ghgRow?.location_allowance ?? null)
      }
      if (!conciergeTier) {
        return NextResponse.json(
          { error: 'Could not determine the customer GHG plan level, which sets the Concierge onboarding fee. Add a manual line item instead.' },
          { status: 400 },
        )
      }

      const isFirstPurchase = isFirstConciergePurchase(ownedKeys)

      let quote
      try {
        quote = conciergeQuote({ ghgTier: conciergeTier, uploadedSources, connectedSources, isFirstPurchase })
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message.replace(/^conciergeQuote: /, '') }, { status: 400 })
      }

      for (const line of quote.lines) {
        // ⚠️ QUANTITY IS FLATTENED INTO THE AMOUNT AND NAMED IN THE LABEL. stripe.invoiceItems.create
        // below takes a single `amount`, not a unit price and a count, so the multiplication happens
        // here. The label carries the count so the customer can check the arithmetic on the invoice.
        const label = line.quantity > 1 ? `${line.label} x ${line.quantity}` : line.label
        lines.push({ label, amount: line.unitUSD * line.quantity })
      }
      entitlements.add(CONCIERGE_KEY)
      conciergeMeta = {
        concierge_uploaded_sources: String(uploadedSources),
        concierge_connected_sources: String(connectedSources ?? 0),
        concierge_source_allowance: String(uploadedSources + (connectedSources ?? 0)),
        concierge_onboarding_usd: String(quote.onboardingUSD),
        concierge_ghg_tier: conciergeTier,
      }
      sources.push(`concierge:${uploadedSources}u+${connectedSources ?? 0}c${isFirstPurchase ? '+onboarding' : ''}`)
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
      // Stringified EXACTLY as app/api/checkout/route.ts:202 does, empty-string convention included:
      // Stripe metadata values are strings, and the webhook's `raw ? Number(raw) : null` reads '' as
      // null → uncapped. Deviating in either direction here silently changes what the customer gets.
      ghg_location_allowance: ghgAllowance != null ? String(ghgAllowance) : '',
      // Same key, same empty-string convention, as app/api/checkout/route.ts. Both writers feed one
      // reader, so a key present in only one of them is the defect lib/entitlementMetadata.test.ts
      // exists to catch.
      ghg_tier: ghgTierForMeta ?? '',
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
