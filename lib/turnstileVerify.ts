// lib/turnstileVerify.ts
//
// SERVER-ONLY. Checks a Turnstile token with Cloudflare (LEAD1 L3, Oct 2026), for /api/ghg/free-calc/pending. Supabase
// Auth checks its own tokens once CAPTCHA protection is on; this route writes to our database, so it checks its own.
//
// TURNSTILE_SECRET_KEY is set for Production only (design section 10.3). Where it is absent (Vercel previews, local
// development, which use Cloudflare's public test site key in the browser) the check is SKIPPED, with one clear log
// line saying so, rather than refusing every request there. A missing secret in production is visible in the same
// line in the logs.
//
// No secret is ever logged. Only the outcome and Cloudflare's error codes are.

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = { ok: true; skipped: boolean } | { ok: false; codes: string[] }

export async function verifyTurnstile(
  token: unknown,
  ip: string | null,
  opts: { secret?: string; fetchImpl?: typeof fetch; where?: string } = {},
): Promise<TurnstileResult> {
  const secret = opts.secret ?? process.env.TURNSTILE_SECRET_KEY
  const where = opts.where ?? 'turnstile'
  if (!secret) {
    console.warn(`[${where}] TURNSTILE_SECRET_KEY is not set: Turnstile was NOT verified (expected on previews and local development only)`)
    return { ok: true, skipped: true }
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) return { ok: false, codes: ['missing-input-response'] }
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip) body.set('remoteip', ip)
    const res = await (opts.fetchImpl ?? fetch)(SITEVERIFY, { method: 'POST', body })
    const json = (await res.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[] } | null
    if (json?.success === true) return { ok: true, skipped: false }
    return { ok: false, codes: json?.['error-codes'] ?? [`http-${res.status}`] }
  } catch (err) {
    // Fails CLOSED: a check that could not be made is not a pass.
    console.error(`[${where}] Turnstile siteverify failed:`, err instanceof Error ? err.message : err)
    return { ok: false, codes: ['siteverify-unreachable'] }
  }
}
