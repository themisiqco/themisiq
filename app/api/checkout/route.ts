// app/api/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe Checkout Session for a logged-in customer.
//
// SECURITY SPINE: the browser tells us WHAT the customer wants to buy (a pack, a
// tier + modules, and/or the verification add-on). It does NOT get to tell us the
// price. We recompute every price here, server-side, from lib/pricing.ts. So even
// if someone tampers with the browser to claim "price = $1", we ignore it.
//
// The session is tagged with the user's id and the entitlement keys being bought,
// so the webhook (next step) knows whose account to unlock and what to unlock.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '../../../lib/stripe'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'
import {
  ALL_MODULE_KEYS,
  TIER_PRICING,
  locationAllowanceForTier,
  PACKS,
  ADDONS,
  addOnRequirementsMet,
  configuratorPrice,
  cartQuote,
  NEW_PRICING_ACTIVE,
  priceLine,
  type ModuleKey,
  type Tier,
  type GhgTier,
  type PackId,
  type AddOnKey,
} from '../../../lib/pricing'

// Stripe needs the Node.js runtime (not edge).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shape of the request body the browser sends. All fields optional; we validate
// that at least one purchasable thing is present.
interface CheckoutBody {
  packId?: PackId
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
  business?: { name?: string; regNumber?: string }
  purchaser?: { name?: string }
  consent?: { businessCapacity?: boolean; digitalAccess?: boolean; dataAuthority?: boolean; atISO?: string; version?: string }
}

export async function POST(req: NextRequest) {
  try {
    // 0) Stripe client (created lazily).
    const stripe = getStripe()

    // 1) Who is this? Verify the token; never trust a client-sent user id.
    const token = bearerFrom(req)
    const { supabase, userId, email } = await getAuthedClient(token)

    // 2) What do they want to buy?
    const body = (await req.json()) as CheckoutBody

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    const modulesInCart = new Set<ModuleKey>()
    const entitlementsToGrant = new Set<string>() // module keys + add-on keys
    let ghgAllowance: number | null = null // GHG location ceiling to write onto the ghg entitlement row
    const sources: string[] = []

    // 2a) Fixed pack
    if (body.packId) {
      if (NEW_PRICING_ACTIVE) {
        return NextResponse.json({ error: 'Packs are no longer sold directly — configure your modules instead.' }, { status: 400 })
      }
      const pack = PACKS[body.packId]
      if (!pack) {
        return NextResponse.json({ error: 'Unknown pack.' }, { status: 400 })
      }
      lineItems.push(priceLine(pack.label, pack.price))
      pack.modules.forEach((m) => {
        modulesInCart.add(m)
        entitlementsToGrant.add(m)
      })
      sources.push(`pack:${body.packId}`)
      // Packs have no tier, so they take the Starter/Essentials floor — same figure, now read
      // through the same helper as the module path below rather than a literal 3, so both writers
      // derive from GHG_TIERS. What a pack grants is unchanged.
      if (pack.modules.includes('ghg')) ghgAllowance = locationAllowanceForTier('starter')
    }

    // 2b) Build-your-own (tier + modules)
    if (body.tier || body.moduleKeys) {
      const tier = body.tier
      const moduleKeys = body.moduleKeys ?? []
      if (!tier || !TIER_PRICING[tier]) {
        return NextResponse.json({ error: 'Invalid or missing tier.' }, { status: 400 })
      }
      if (moduleKeys.length === 0) {
        return NextResponse.json({ error: 'No modules selected.' }, { status: 400 })
      }
      const allValid = moduleKeys.every((m) => (ALL_MODULE_KEYS as string[]).includes(m))
      if (!allValid) {
        return NextResponse.json({ error: 'Unknown module in selection.' }, { status: 400 })
      }
      if (NEW_PRICING_ACTIVE) {
        // New model: GHG by tier, others flat (shared cartQuote — same number the
        // configurator previews). tier is validated by the guard above.
        const q = cartQuote({ modules: moduleKeys, ghgTier: tier as GhgTier })
        if (q.requiresQuote) {
          return NextResponse.json({ error: 'GHG Advisory is quote-only — please contact us.', requiresQuote: true }, { status: 400 })
        }
        if (q.requiresInvoice) {
          return NextResponse.json({ error: 'Orders over $10,000 are completed by invoice. Please request an invoice.', requiresInvoice: true }, { status: 400 })
        }
        const label = `ThemisIQ — ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''}`
        lineItems.push(priceLine(label, q.totalUSD))
      } else {
        const price = configuratorPrice(tier, moduleKeys)
        const label = `ThemisIQ — ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''} (${tier})`
        lineItems.push(priceLine(label, price))
      }
      moduleKeys.forEach((m) => {
        modulesInCart.add(m)
        entitlementsToGrant.add(m)
      })
      sources.push('configurator')
      if (moduleKeys.includes('ghg') && tier) ghgAllowance = locationAllowanceForTier(tier) // tier-based ceiling
    }

    // 2c) Add-ons (Verification Readiness + the Concierge tiers). Each is validated generically
    // against ADDONS via addOnRequirementsMet, which also rejects quote-only tiers (Enterprise).
    if (body.addOns && body.addOns.length > 0) {
      // What modules does the customer already own? (RLS scopes this to them.)
      const { data: owned } = await supabase
        .from('entitlements')
        .select('module_key')
      const ownedKeys = new Set<string>((owned ?? []).map((r) => r.module_key))

      for (const addOnKey of body.addOns) {
        const addOn = ADDONS[addOnKey]
        if (!addOn) {
          return NextResponse.json({ error: 'Unknown add-on.' }, { status: 400 })
        }
       // Requirement check (modules + add-on prerequisites) via single authority.
        // ownedKeys holds BOTH modules and add-ons (webhook writes all to module_key),
        // so derive each list by filtering against ADDONS.
        const ownedAndCart = [...ownedKeys, ...modulesInCart]
        const ownedModuleKeys = ownedAndCart.filter((k) => !(k in ADDONS)) as ModuleKey[]
        const ownedOrCartAddOns = [
          ...ownedAndCart.filter((k) => k in ADDONS),
          ...(body.addOns ?? []),
        ] as AddOnKey[]
        const check = addOnRequirementsMet(addOnKey, ownedModuleKeys, ownedOrCartAddOns)
        if (!check.ok) {
          return NextResponse.json({ error: check.reason }, { status: 400 })
        }
        lineItems.push(priceLine(addOn.label, addOn.price))
        entitlementsToGrant.add(addOn.key)
      }
      sources.push(`addons:${body.addOns.join('+')}`)
    }

    // 3) Must be buying something.
    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'Nothing to purchase.' }, { status: 400 })
    }

    // 4) Where Stripe sends the customer back to.
    const origin =
      req.headers.get('origin') ?? new URL(req.url).origin

    // 4.5) Consent + business-ID enforcement (NEW model only). Old path unaffected:
    // when the flag is off, consentMeta is {} and the metadata below is byte-identical.
    let consentMeta: Record<string, string> = {}
    if (NEW_PRICING_ACTIVE) {
      const b = body.business, p = body.purchaser, c = body.consent
      const ok =
        !!b?.name?.trim() && !!b?.regNumber?.trim() && !!p?.name?.trim() &&
        c?.businessCapacity === true && c?.digitalAccess === true && c?.dataAuthority === true
      if (!ok) {
        return NextResponse.json({ error: 'Business details and all required confirmations are needed before payment.' }, { status: 400 })
      }
      // Best-effort server captures (never block the consent record if absent).
      const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
      consentMeta = {
        business_name: b!.name!.trim(),
        business_reg_number: b!.regNumber!.trim(),
        purchaser_name: p!.name!.trim(),
        purchaser_email: email ?? '',
        ip_address: ip,
        consent_business_capacity: 'true',
        consent_digital_access: 'true',
        consent_data_authority: 'true',
        consent_at: c!.atISO ?? new Date().toISOString(),
        consent_version: c!.version ?? '2026-06-v2-final',
      }
    }

    // 5) Create the Checkout Session. Metadata travels to the webhook.
    const entitlements = Array.from(entitlementsToGrant).join(',')
    const metadata = {
      user_id: userId,
      entitlements, // e.g. "ghg,supply-chain,verification"
      source: sources.join(' | '),
      ghg_location_allowance: ghgAllowance != null ? String(ghgAllowance) : '',
      ...consentMeta,
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // one-time payment (not a subscription)
      allow_promotion_codes: true,
      line_items: lineItems,
      customer_email: email,
      client_reference_id: userId,
      metadata,
      // Mirror metadata onto the PaymentIntent too, so it's available whichever
      // event the webhook ends up keying off.
      payment_intent_data: { metadata, receipt_email: email },
      success_url: `${origin}/dashboard?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
    }
    console.error('[checkout] error:', err)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }
}
