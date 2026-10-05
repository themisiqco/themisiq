// lib/consent/consentService.ts
//
// SERVER-ONLY LOGIC for marketing consent (LEAD1 L6, Oct 2026; design section 5, table M5), with every database step
// passed in, so the routes are thin and the tests drive the real logic with fakes.
//
//   recordConsentChoice    one row per choice, ticked or not (the claim route, the dashboard setting)
//   unsubscribe            POST /api/unsubscribe: a signed token withdraws at once; nothing is deleted
//   setAccountConsent      POST /api/account/marketing-consent: the dashboard's "Email updates" choice
//   unsubscribeFor         the link and headers for an email, only while consent is active
//
// ⚠️ NOTHING HERE DELETES A ROW, AND NOTHING CAN: the service role holds no DELETE on marketing_consents (M5). A
// withdrawal sets withdrawn_at. A "no" is a row too, so the decision is provable either way.

import {
  MARKETING_PURPOSE, MARKETING_CONSENT, consentWordingFor, activeConsent, CONSENT_COPY, DASHBOARD_SOURCE, maskEmail,
  type ConsentChoice, type ConsentRow,
} from './marketing'
import { signUnsubscribeToken, verifyUnsubscribeToken, unsubscribeUrls } from './unsubscribeToken'

export type ConsentInsert = {
  user_id: string | null; email: string; purpose: typeof MARKETING_PURPOSE; granted: boolean
  wording: string; wording_version: string; source_page: string; ip: string | null; user_agent: string | null
}

export type RecordDeps = { insertConsent(row: ConsentInsert): Promise<{ id: string } | { error: string }> }

/**
 * Records one choice. The wording is the server's own for the version the client named (consentWordingFor): an unknown
 * version records nothing and says so in the log, rather than storing words nobody can show were displayed.
 * Returns the row id, or null when nothing was recorded. Never throws: the caller's save must not depend on it.
 */
export async function recordConsentChoice(
  choice: ConsentChoice,
  who: { userId: string | null; email: string; ip: string | null; userAgent: string | null },
  deps: RecordDeps,
): Promise<{ id: string; granted: boolean } | null> {
  const wording = consentWordingFor(choice.version)
  if (!wording) {
    console.error('[consent] unknown wording version; nothing recorded:', JSON.stringify(choice.version))
    return null
  }
  try {
    const r = await deps.insertConsent({
      user_id: who.userId, email: who.email, purpose: MARKETING_PURPOSE, granted: choice.granted,
      wording, wording_version: choice.version, source_page: choice.sourcePage,
      ip: who.ip, user_agent: who.userAgent ? who.userAgent.slice(0, 500) : null,
    })
    if ('error' in r) { console.error('[consent] marketing consent not recorded:', r.error); return null }
    return { id: r.id, granted: choice.granted }
  } catch (err) {
    console.error('[consent] marketing consent not recorded:', err)
    return null
  }
}

/** The link and headers for an email to someone whose consent is active, or null (no consent, or no secret). */
export function unsubscribeFor(consentId: string | null, siteUrl: string, sign: (id: string) => string | null = signUnsubscribeToken) {
  if (!consentId) return null
  const token = sign(consentId)
  if (!token) { console.error('[consent] UNSUBSCRIBE_TOKEN_SECRET is not set: the email goes without an unsubscribe link.'); return null }
  return unsubscribeUrls(siteUrl, token)
}

export type RouteResult = { status: number; body: Record<string, unknown> }

export type UnsubscribeDeps = {
  verify(token: unknown): ReturnType<typeof verifyUnsubscribeToken>
  getConsent(id: string): Promise<{ id: string; email: string } | null>
  /** Sets withdrawn_at = now on every granted, not-yet-withdrawn row for this address. Returns how many changed. */
  withdrawForEmail(email: string): Promise<{ updated: number } | { error: string }>
}

/** The refusal for a token that does not check out, shared by the check and the withdrawal. */
function refuseToken(reason: 'invalid' | 'expired' | 'not_configured'): RouteResult {
  if (reason === 'expired') return { status: 410, body: { ok: false, code: 'expired', message: CONSENT_COPY.linkExpired } }
  if (reason === 'not_configured') {
    console.error('[unsubscribe] UNSUBSCRIBE_TOKEN_SECRET is not set: no token can be checked.')
    return { status: 503, body: { ok: false, code: 'not_configured', message: CONSENT_COPY.failed } }
  }
  return { status: 400, body: { ok: false, code: 'invalid', message: CONSENT_COPY.linkInvalid } }
}

/**
 * ⚠️ READ ONLY. What the /unsubscribe page shows on load: whether the link is good, and the address it is for, masked.
 * It never withdraws, by construction: it takes no withdraw function. Security scanners that open links in a browser
 * run the page's script, so a withdrawal on load would unsubscribe people who never clicked (L6 amendment, 5 Oct 2026).
 */
export async function checkUnsubscribe(token: unknown, deps: Pick<UnsubscribeDeps, 'verify' | 'getConsent'>): Promise<RouteResult> {
  const check = deps.verify(token)
  if (!check.ok) return refuseToken(check.reason)
  const row = await deps.getConsent(check.consentId)
  if (!row) return { status: 404, body: { ok: false, code: 'invalid', message: CONSENT_COPY.linkInvalid } }
  return { status: 200, body: { ok: true, maskedEmail: maskEmail(row.email) } }
}

/**
 * The withdrawal: the button on /unsubscribe, and a mail client's one-click POST. Withdraws AT ONCE (CASL allows 10 business days; design 5 does it immediately), for the whole
 * address the signed consent belongs to, so a second "yes" given elsewhere is ended by the same click. Doing it twice
 * is fine: the second time changes nothing and says the same.
 */
export async function unsubscribe(token: unknown, deps: UnsubscribeDeps): Promise<RouteResult> {
  const check = deps.verify(token)
  if (!check.ok) return refuseToken(check.reason)
  const row = await deps.getConsent(check.consentId)
  if (!row) return { status: 404, body: { ok: false, code: 'invalid', message: CONSENT_COPY.linkInvalid } }
  const r = await deps.withdrawForEmail(row.email)
  if ('error' in r) {
    console.error('[unsubscribe] withdrawal failed:', r.error)
    return { status: 500, body: { ok: false, code: 'failed', message: CONSENT_COPY.failed } }
  }
  return { status: 200, body: { ok: true, withdrawn: r.updated, message: CONSENT_COPY.unsubscribed } }
}

export type AccountConsentDeps = RecordDeps & {
  user: { id: string; email: string }
  ip: string | null
  userAgent: string | null
  listOwn(): Promise<ConsentRow[]>
  withdrawForUser(): Promise<{ updated: number } | { error: string }>
}

/**
 * The dashboard's "Email updates" choice. Ticking records a new granted row with the wording shown there; unticking
 * withdraws the active grant. Choosing what is already the case records nothing new.
 */
export async function setAccountConsent(body: unknown, deps: AccountConsentDeps): Promise<RouteResult> {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (typeof o.granted !== 'boolean') return { status: 400, body: { ok: false, code: 'bad_request', message: CONSENT_COPY.failed } }
  const active = activeConsent(await deps.listOwn())
  if (o.granted && !active) {
    const rec = await recordConsentChoice(
      { granted: true, version: typeof o.version === 'string' ? o.version : MARKETING_CONSENT.version, sourcePage: DASHBOARD_SOURCE },
      { userId: deps.user.id, email: deps.user.email, ip: deps.ip, userAgent: deps.userAgent }, deps)
    if (!rec) return { status: 500, body: { ok: false, code: 'failed', message: CONSENT_COPY.failed } }
  } else if (!o.granted && active) {
    const r = await deps.withdrawForUser()
    if ('error' in r) return { status: 500, body: { ok: false, code: 'failed', message: CONSENT_COPY.failed } }
  }
  return { status: 200, body: { ok: true, granted: o.granted, message: CONSENT_COPY.settingsSaved } }
}
