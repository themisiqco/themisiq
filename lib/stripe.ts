// lib/stripe.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Stripe client. Import this from API routes (checkout, webhook).
//
// SECURITY: this reads STRIPE_SECRET_KEY, so it must NEVER be imported into
// browser/client code. Keep it out of any file that runs in the browser. The
// secret key lives only in .env.local (git-ignored) and only on the server.
// ─────────────────────────────────────────────────────────────────────────────

import Stripe from 'stripe'

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  // Fail loudly at startup rather than silently at checkout time.
  throw new Error(
    'STRIPE_SECRET_KEY is not set. Add it to .env.local and restart `npm run dev`.',
  )
}

// A single shared Stripe instance for the whole server.
export const stripe = new Stripe(secretKey, {
  // Pin the API version so Stripe-side changes can't silently alter behaviour.
  // If Stripe later asks for a newer version string, we'll bump it deliberately.
  apiVersion: '2026-05-27.dahlia',
  typescript: true,
})