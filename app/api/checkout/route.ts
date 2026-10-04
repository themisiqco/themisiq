// app/api/checkout/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Creates a Stripe Checkout Session for a logged-in customer.
//
// SECURITY SPINE: the browser tells us WHAT the customer wants to buy (a pack, a
// tier + modules, and/or the Concierge add-on). It does NOT get to tell us the
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
  configuratorPrice,
  cartQuote,
  NEW_PRICING_ACTIVE,
  priceLine,
  priceLineQty,
  ghgTierMetaValue,
  isGhgTier,
  isLegacyTier,
  type ModuleKey,
  type Tier,
  type GhgTier,
} from '../../../lib/pricing'
import { billReviewOrder, type OwnedRow } from '../../../lib/billReviewOrder'

// Stripe needs the Node.js runtime (not edge).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shape of the request body the browser sends. All fields optional; we validate
// that at least one purchasable thing is present.
interface CheckoutBody {
  tier?: Tier
  moduleKeys?: ModuleKey[]
  // Refused since Oct 2026: the location-band Concierge add-ons are no longer sold.
  addOns?: unknown[]
  // Bill Review (internal name: concierge). `reading` 'human' is refused until it can be sold.
  concierge?: { uploadedSources?: unknown; connectedSources?: unknown; reading?: unknown }
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
    let ghgTierForMeta: GhgTier | null = null // GHG tier, recorded so the webhook can write entitlements.ghg_tier
    let conciergeMeta: Record<string, string> = {}
    let ownedRows: OwnedRow[] = []
    const sources: string[] = []

    // 2b) Build-your-own (tier + modules)
    if (body.tier || body.moduleKeys) {
      const tier = body.tier
      const moduleKeys = body.moduleKeys ?? []
      if (!isGhgTier(tier)) {
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
          return NextResponse.json({ error: 'GHG Enterprise is quote-only: please contact us.', requiresQuote: true }, { status: 400 })
        }
        // No card ceiling (card-any-amount, Oct 2026): this route used to refuse large orders here.
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''}`
        lineItems.push(priceLine(label, q.totalUSD))
      } else {
        // ⚠️ THE OLD MODEL HAS NO PRICE FOR THE NEW TIERS, so this arm refuses rather than casting.
        // It is unreachable while NEW_PRICING_ACTIVE is true; if the flag ever moved, a Business or
        // Enterprise selection would otherwise index TIER_PRICING and come back undefined.
        if (!isLegacyTier(tier)) {
          return NextResponse.json({ error: 'That plan is not available on this pricing model.' }, { status: 400 })
        }
        const price = configuratorPrice(tier, moduleKeys)
        const label = `ThemisIQ: ${moduleKeys.length} module${moduleKeys.length > 1 ? 's' : ''} (${tier})`
        lineItems.push(priceLine(label, price))
      }
      moduleKeys.forEach((m) => {
        modulesInCart.add(m)
        entitlementsToGrant.add(m)
      })
      sources.push('configurator')
      if (moduleKeys.includes('ghg') && tier) {
        // The tier itself, recorded for the webhook. Locations are unlimited on every plan (FI0), so no
        // location allowance is written: the tier is what identifies the plan.
        ghgTierForMeta = tier as GhgTier
      }
    }

    // 2c) The location-band Concierge add-ons were removed in Oct 2026 (pricing-2026-10). An order that still
    // names one is refused rather than ignored, so nothing is charged for a product that no longer exists.
    if (body.addOns && body.addOns.length > 0) {
      return NextResponse.json({ error: 'That add-on is no longer sold. Bill Review is ordered with its number of data sources.' }, { status: 400 })
    }

    // 2d) Bill Review (internal name: concierge). lib/billReviewOrder.ts decides what may be sold and prices it
    // with billReviewQuote, the same function /pricing displays from.
    //
    // ⚠️ THE ENTITLEMENT READ FAILS LOUDLY. Reading nothing would make isFirstConciergePurchase true and charge
    // an existing Bill Review customer onboarding a second time. RLS scopes the read to this customer.
    if (body.concierge) {
      const { data: owned, error: ownedErr } = await supabase
        .from('entitlements')
        .select('module_key, ghg_tier, term_end')
      if (ownedErr) {
        console.error('[checkout] entitlement read failed:', ownedErr.message)
        return NextResponse.json(
          { error: 'We could not confirm what you already own. Please try again in a moment.' },
          { status: 503 },
        )
      }
      ownedRows = (owned ?? []) as OwnedRow[]
      const cartTier = modulesInCart.has('ghg') ? ghgTierForMeta : null
      const order = billReviewOrder(body.concierge, cartTier, ownedRows, new Date())
      if (!order.ok) return NextResponse.json({ error: order.error }, { status: order.status })
      for (const line of order.quote.lines) {
        lineItems.push(priceLineQty(line.label, line.unitUSD, line.quantity))
      }
      entitlementsToGrant.add(order.grant)
      conciergeMeta = order.meta
      sources.push(order.source)
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
      entitlements, // e.g. "ghg,supply-chain,concierge"
      source: sources.join(' | '),
      // The GHG tier. Written whenever GHG is in the cart, and empty otherwise,
      // following the same empty-string convention: Stripe metadata values are strings and the
      // webhook reads '' as absent. Batch 3 writes it to entitlements.ghg_tier.
      ghg_tier: ghgTierMetaValue(ghgTierForMeta),
      // Empty when Concierge is not in this order, same convention again.
      ...conciergeMeta,
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
