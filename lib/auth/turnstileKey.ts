// lib/auth/turnstileKey.ts
//
// Which Turnstile site key a deployment uses (LEAD1 L2, Oct 2026). The real widget allows only themisiq.co and
// www.themisiq.co (set up by Lisa on 4 Oct 2026), so Vercel previews and local development would get an error from it.
// They use Cloudflare's documented always-pass TEST site key instead, chosen here by environment, so nobody has to
// remember to set a different value per environment.
//   production  (NEXT_PUBLIC_VERCEL_ENV === 'production')  NEXT_PUBLIC_TURNSTILE_SITE_KEY; if it is unset, no widget
//   preview, development, or not on Vercel                 the test key
//
// The test key is PUBLIC, published by Cloudflare for exactly this
// (https://developers.cloudflare.com/turnstile/troubleshooting/testing/): it always passes and protects nothing. It is
// not a secret and is not the real key. The real site key is public too (it ships to every browser), but it lives in
// Vercel, not in the repo. No SECRET key is ever read in the browser.

/** Cloudflare's always-pass test site key (visible widget). Public; see the link above. */
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'

export function turnstileSiteKey(vercelEnv: string | undefined, productionKey: string | undefined): string {
  if (vercelEnv === 'production') return productionKey ?? ''
  return TURNSTILE_TEST_SITE_KEY
}
