// lib/stripe.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Stripe client. Import { getStripe } from here in API routes.
//
// SECURITY: reads STRIPE_SECRET_KEY — never import into browser/client code.
// The client is created LAZILY (on first use) and cached, so a build that merely
// loads this file (e.g. Vercel collecting page data) won't fail when the key is
// absent in that environment. It only throws if a real request needs it.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is not set. Add it to .env.local (or your host env vars) and restart.',
    )
  }

  _stripe = new Stripe(secretKey, {
    // Pin the API version so Stripe-side changes can't silently alter behaviour.
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
  })
  return _stripe
}
