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
  ADDONS,
  addOnRequirementsMet,
  configuratorPrice,
  cartQuote,
  NEW_PRICING_ACTIVE,
  priceLine,
  priceLineQty,
  conciergeQuote,
  isFirstConciergePurchase,
  CONCIERGE_KEY,
  LEGACY_CONCIERGE_KEYS,
  UTILITY_CONNECT_ENABLED,
  ghgTierMetaValue,
  isGhgTier,
  isLegacyTier,
  type ModuleKey,
  type Tier,
  type GhgTier,
  type AddOnKey,
} from '../../../lib/pricing'

// Stripe needs the Node.js runtime (not edge).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Shape of the request body the browser sends. All fields optional; we validate
// that at least one purchasable thing is present.
interface CheckoutBody {
  tier?: Tier
  moduleKeys?: ModuleKey[]
  addOns?: AddOnKey[]
  concierge?: { uploadedSources?: unknown; connectedSources?: unknown }
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
    let ownedRows: { module_key: string }[] = []
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
        if (q.requiresInvoice) {
          return NextResponse.json({ error: 'Orders over $10,000 are completed by invoice. Please request an invoice.', requiresInvoice: true }, { status: 400 })
        }
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

    // 2c) Add-ons (Verification Readiness + the Concierge tiers). Each is validated generically
    // against ADDONS via addOnRequirementsMet, which also rejects quote-only tiers (Enterprise).
    // What does the customer already hold? RLS scopes this to them. Read ONCE: the add-on branch
    // needs it for prerequisites and the Concierge branch needs it for isFirstPurchase.
    //
    // ⚠️ THE READ FAILS LOUDLY. It used to discard its error and treat the result as "owns nothing",
    // which was harmless while it only fed a prerequisite check. It is not harmless now: reading
    // nothing makes isFirstConciergePurchase true, and an existing Concierge customer would be
    // charged the onboarding fee a second time on renewal.
    let ownedKeys = new Set<string>()
    if ((body.addOns && body.addOns.length > 0) || body.concierge) {
      const { data: owned, error: ownedErr } = await supabase
        .from('entitlements')
        .select('module_key')
      if (ownedErr) {
        console.error('[checkout] entitlement read failed:', ownedErr.message)
        return NextResponse.json(
          { error: 'We could not confirm what you already own. Please try again in a moment.' },
          { status: 503 },
        )
      }
      ownedRows = owned ?? []
      ownedKeys = new Set<string>(ownedRows.map((r) => r.module_key))
    }

    if (body.addOns && body.addOns.length > 0) {
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

    // 2d) Concierge on the source-based model. The old concierge-* keys above still work until the
    // configurator moves in Batch 4; this is the path everything new uses.
    if (body.concierge) {
      const legacyInCart = (body.addOns ?? []).some((k) => (LEGACY_CONCIERGE_KEYS as readonly string[]).includes(k))
      if (legacyInCart) {
        return NextResponse.json(
          { error: 'Concierge was selected twice, on both the old and the new model. Please start the order again.' },
          { status: 400 },
        )
      }

      // Counts pass through unchanged. conciergeQuote validates them and throws rather than
      // coercing, so the error names the real fault instead of a rounded number.
      const uploadedSources = body.concierge.uploadedSources as number
      const connectedSources = body.concierge.connectedSources as number | undefined

      // ⚠️ THE FLAG IS ENFORCED AT THE SERVER BOUNDARY TOO, not only inside conciergeQuote. The
      // client cannot be the thing that decides what is sellable.
      if (!UTILITY_CONNECT_ENABLED && typeof connectedSources === 'number' && connectedSources > 0) {
        return NextResponse.json(
          { error: 'Connected utility sources are not available yet. Please order uploaded sources only.' },
          { status: 400 },
        )
      }

      // Concierge requires GHG, the same rule addOnRequirementsMet applies to the old keys.
      const ghgInCart = modulesInCart.has('ghg')
      if (!ghgInCart && !ownedKeys.has('ghg')) {
        return NextResponse.json(
          { error: 'Concierge requires the GHG module. Add it to your cart or purchase it first.' },
          { status: 400 },
        )
      }

      // ⚠️ NO TIER IS NEEDED HERE ANY MORE, AND THAT IS WHY A WHOLE BRANCH IS GONE. Onboarding was
      // priced by GHG tier, so this had to work out the customer's band: from the cart when GHG was
      // in it, and otherwise from their stored location allowance. That second path went inert when
      // locations became unlimited, and it would have refused every customer adding Concierge on
      // its own with a 400 about a plan level nobody could determine. The fee is flat now. The
      // question is not asked, so it cannot be answered wrongly.
      const isFirstPurchase = isFirstConciergePurchase([...ownedKeys])

      let quote
      try {
        quote = conciergeQuote({ uploadedSources, connectedSources, isFirstPurchase })
      } catch (e) {
        // conciergeQuote's messages are written for a person and name the actual fault.
        return NextResponse.json({ error: (e as Error).message.replace(/^conciergeQuote: /, '') }, { status: 400 })
      }

      for (const line of quote.lines) {
        lineItems.push(priceLineQty(line.label, line.unitUSD, line.quantity))
      }
      entitlementsToGrant.add(CONCIERGE_KEY)
      conciergeMeta = {
        concierge_uploaded_sources: String(uploadedSources),
        concierge_connected_sources: String(connectedSources ?? 0),
        concierge_source_allowance: String(uploadedSources + (connectedSources ?? 0)),
        // Recorded, never granted. The onboarding fee buys setup work, not access, so the webhook
        // must not turn this into an entitlement row or stamp a term on it.
        concierge_onboarding_usd: String(quote.onboardingUSD),
      }
      sources.push(`concierge:${uploadedSources}u+${connectedSources ?? 0}c${isFirstPurchase ? '+onboarding' : ''}`)
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
