// app/api/webhooks/stripe/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Stripe calls this route after a payment. It is the ONLY thing that unlocks
// modules — never the browser, never the success page (which can be faked).
//
// Flow:
//   1. Verify the request is genuinely from Stripe (signature check).
//   2. On a successful payment, read the metadata we attached at checkout
//      (user_id + comma-separated entitlement keys).
//   3. Write those unlocks into the `entitlements` table via the admin client.
//
// Handles both Checkout payments (checkout.session.completed) and, for the future
// invoice flow, invoice.paid — both carry the same metadata shape.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe } from '../../../../lib/stripe'
import { supabaseAdmin } from '../../../../lib/supabaseAdmin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  if (!webhookSecret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }

  // Signature verification needs the RAW body, not parsed JSON.
  const signature = req.headers.get('stripe-signature')
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? '', webhookSecret)
  } catch (err) {
    console.error('[webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        // Only act on actually-paid sessions.
        if (session.payment_status === 'paid') {
          await grantFromMetadata(session.metadata, 'stripe:checkout')
        }
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await grantFromMetadata(invoice.metadata, 'stripe:invoice')
        break
      }
      // Other event types are acknowledged but ignored.
      default:
        break
    }
  } catch (err) {
    // Returning 500 tells Stripe to retry later, so a transient DB hiccup
    // doesn't silently lose a paid customer's unlock.
    console.error('[webhook] handler error:', err)
    return NextResponse.json({ error: 'Handler error.' }, { status: 500 })
  }

  // Always 200 once handled, so Stripe stops retrying.
  return NextResponse.json({ received: true })
}

// Write the purchased entitlement keys for a user. Idempotent: re-delivery of the
// same event just re-upserts the same rows (the unique user_id+module_key
// constraint makes this safe).
async function grantFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
  source: string,
) {
  const userId = metadata?.user_id
  const entitlements = metadata?.entitlements

  if (!userId || !entitlements) {
    console.warn('[webhook] missing user_id/entitlements in metadata; nothing to grant')
    return
  }

  const keys = entitlements
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)

  if (keys.length === 0) return

  const rows = keys.map((module_key) => ({
    user_id: userId,
    module_key,
    source,
  }))

  const { error } = await supabaseAdmin
    .from('entitlements')
    .upsert(rows, { onConflict: 'user_id,module_key' })

  if (error) {
    console.error('[webhook] failed to write entitlements:', error)
    throw error
  }

  console.log(`[webhook] granted [${keys.join(', ')}] to user ${userId}`)
}
