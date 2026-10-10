// lib/testing/clearedEnv.ts
//
// THE ENVIRONMENT A TEST STARTS WITH (Oct 2026): none of the app's secrets or deployment flags. vitest.setup.ts deletes
// every name in CLEARED_ENV from process.env before each test file, so a test sees only what it sets itself (vi.stubEnv,
// restored by vi.unstubAllEnvs). A test that passes locally then passes on a Vercel Preview or Production build too,
// where these are set.
//
// WHY: twice in one week a test passed locally and failed the Preview build because Vercel had a real value the code
// falls back to (RESEND_API_KEY, lead1-L5-fix1; UNSUBSCRIBE_TOKEN_SECRET, lead1-L6-fix1). `npm run build` runs the
// suite, so on main the same thing would block a production deploy.
//
// ⚠️ EVERY process.env NAME READ IN app/ OR lib/ MUST BE IN ONE OF THE TWO LISTS. lib/testing/clearedEnv.test.ts scans
// for them, including a read through a constant holding the name (as lib/consent/unsubscribeToken.ts does), and fails on a
// name in neither list. A new secret is added here in the same change that reads it.

/** Deleted before every test file. */
export const CLEARED_ENV = [
  // Email (Resend)
  'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_MONITOR_EMAIL',
  // Unsubscribe links (L6)
  'UNSUBSCRIBE_TOKEN_SECRET',
  // Turnstile
  'TURNSTILE_SECRET_KEY', 'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  // Vercel deployment flags and the site address
  'VERCEL_ENV', 'NEXT_PUBLIC_VERCEL_ENV', 'NEXT_PUBLIC_SITE_URL',
  // Supabase
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  // Stripe
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  // Admin, the guide's model key, invoice text
  'ADMIN_EMAIL', 'ANTHROPIC_API_KEY', 'INVOICE_WIRE_FOOTER',
  // BR7: the daily Bill Review email job's bearer secret (Vercel Cron)
  'CRON_SECRET',
] as const

/**
 * Read in app/ or lib/ and deliberately NOT cleared:
 *   NODE_ENV                 Vitest sets it to 'test'; lib/scope3/categoryMethods.test.ts changes and restores it itself.
 *   SCOPE3_SNAPSHOT_UPDATE   a switch a developer sets by hand to rewrite lib/scope3's snapshot; read only by that test.
 *   TZ                       the process time zone. lib/billReview/businessDays.test.ts sets it and restores it, to prove
 *                            the expected date is Toronto's whatever the server's zone; no app code reads it.
 */
export const KEPT_ENV = ['NODE_ENV', 'SCOPE3_SNAPSHOT_UPDATE', 'TZ'] as const
