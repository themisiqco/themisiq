// lib/consent/unsubscribeToken.ts
//
// SERVER ONLY. The one-click unsubscribe token (LEAD1 L6, design section 5): HMAC-SHA256 of the consent id and an
// expiry, keyed by UNSUBSCRIBE_TOKEN_SECRET (Vercel; its value never appears in code or logs).
//
//   token = base64url("<consent id>.<expires, unix seconds>") + "." + base64url(HMAC(secret, "unsubscribe:" + that))
//
// THE ID IS NOT A SECRET; THE SIGNATURE IS WHAT LETS A LINK ACT. Anyone could guess a uuid's shape, nobody can sign one.
// The comparison is constant-time. A token lasts UNSUBSCRIBE_TOKEN_TTL_DAYS: CASL requires an unsubscribe mechanism to
// work for at least 60 days after a message is sent; a year covers that with room, and an older link is refused with
// a sentence pointing to the dashboard setting and hello@themisiq.co.
//
// With no secret set, signing returns null: the email goes without the link or its headers (logged), and the account
// setting still works. Verification without a secret refuses everything.

import { createHmac, timingSafeEqual } from 'node:crypto'

export const UNSUBSCRIBE_SECRET_ENV = 'UNSUBSCRIBE_TOKEN_SECRET'
export const UNSUBSCRIBE_TOKEN_TTL_DAYS = 365
const DAY = 24 * 60 * 60

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mac(secret: string, body: string): Buffer {
  return createHmac('sha256', secret).update(`unsubscribe:${body}`).digest()
}

export function signUnsubscribeToken(consentId: string, secret: string | undefined = process.env[UNSUBSCRIBE_SECRET_ENV], now = new Date()): string | null {
  if (!secret || !UUID.test(consentId)) return null
  const body = `${consentId}.${Math.floor(now.getTime() / 1000) + UNSUBSCRIBE_TOKEN_TTL_DAYS * DAY}`
  return `${b64url(Buffer.from(body))}.${b64url(mac(secret, body))}`
}

export type TokenCheck = { ok: true; consentId: string } | { ok: false; reason: 'invalid' | 'expired' | 'not_configured' }

export function verifyUnsubscribeToken(token: unknown, secret: string | undefined = process.env[UNSUBSCRIBE_SECRET_ENV], now = new Date()): TokenCheck {
  if (!secret) return { ok: false, reason: 'not_configured' }
  if (typeof token !== 'string' || token.length > 400) return { ok: false, reason: 'invalid' }
  const [bodyPart, sigPart, extra] = token.split('.')
  if (!bodyPart || !sigPart || extra !== undefined) return { ok: false, reason: 'invalid' }
  const body = fromB64url(bodyPart).toString('utf8')
  const given = fromB64url(sigPart)
  const want = mac(secret, body)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return { ok: false, reason: 'invalid' }
  const [consentId, expRaw] = body.split('.')
  const exp = Number(expRaw)
  if (!UUID.test(consentId ?? '') || !Number.isInteger(exp)) return { ok: false, reason: 'invalid' }
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: 'expired' }
  return { ok: true, consentId }
}

/** The page a link in an email opens, and the URL mail clients POST to for one-click (RFC 8058). */
export function unsubscribeUrls(siteUrl: string, token: string): { page: string; oneClick: string } {
  const base = siteUrl.replace(/\/+$/, '')
  const t = encodeURIComponent(token)
  return { page: `${base}/unsubscribe?token=${t}`, oneClick: `${base}/api/unsubscribe?token=${t}` }
}

/** The headers any email carrying the unsubscribe link sends (RFC 2369 and RFC 8058). */
export function unsubscribeHeaders(oneClickUrl: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${oneClickUrl}>, <mailto:hello@themisiq.co?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}
