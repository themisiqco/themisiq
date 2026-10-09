// lib/ghg/freeCalcService.ts
//
// SERVER-ONLY LOGIC for the two free-calculation routes (LEAD1 L3, Oct 2026), with every database and network step
// passed in, so the routes are thin and the tests drive the real logic with fakes. The rules themselves are pure, in
// lib/ghg/freeCalc.ts.
//
//   holdFreeCalc   POST /api/ghg/free-calc/pending   no session; keeps the calculation for 24 hours, by email
//   claimFreeCalc  POST /api/ghg/free-calc/claim     signed in; saves it to the account
//
// CROSS-DEVICE (design 1.6). The code email's link (/auth/confirm) carries no pending id: the Supabase "Magic Link"
// template is a fixed URL, and nothing needs to change in it. A claim with no calculation in hand takes the NEWEST
// pending record for the session's verified email. An id, when one is passed, must belong to that same email.

import {
  validateHold, checkDraft, inventoryFromDraft, inventoryRow, decideClaim, firstCountry,
  FREE_CALC_MESSAGES, PENDING_TTL_MS, MAX_TEXT, type OwnInventory,
} from './freeCalc'
import { isHoneypotTripped, HONEYPOT_FIELD, recipientKey } from '../assessmentSubmitGuard'
import { emailKey as normalisedEmailKey } from '../emailKey'
import type { GhgDraft } from './draftParse'
import { buildResultsEmail, type SavedInventoryRow } from './resultsEmail'
import type { SendResult } from './resultsEmailSend'
import { readConsentChoice, KEEP_RESULTS_SOURCE } from '../consent/marketing'
import { recordConsentChoice, unsubscribeFor, type ConsentInsert } from '../consent/consentService'
import { signUnsubscribeToken } from '../consent/unsubscribeToken'

export type RouteResult = { status: number; body: Record<string, unknown> }

export type PendingRow = {
  id: string; email: string; email_key: string; full_name: string | null; company: string | null
  payload: unknown; created_at: string; expires_at: string
}

// ── /pending ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type HoldDeps = {
  ip: string | null
  /** L6: kept with a marketing choice made on the form, as proof of where it came from. */
  userAgent?: string | null
  now: Date
  rateLimitOk(bucket: 'ip' | 'email', key: string | null): Promise<boolean>
  verifyCaptcha(token: unknown, ip: string | null): Promise<{ ok: boolean }>
  insertPending(row: Omit<PendingRow, 'id' | 'created_at'> & { ip: string | null }): Promise<{ id: string } | { error: string }>
  /** Deletes records past expires_at. Best effort, after each hold: there is no scheduled job, and a held email and IP
   *  should not outlive their 24 hours by much. */
  purgeExpired(): Promise<void>
}

export async function holdFreeCalc(body: unknown, deps: HoldDeps): Promise<RouteResult> {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  // A bot that fills the hidden field is told "ok" and nothing is stored (lib/assessmentSubmitGuard.ts).
  if (isHoneypotTripped(o[HONEYPOT_FIELD])) return { status: 200, body: { ok: true } }

  const v = validateHold(o)
  if (!v.ok) return { status: 400, body: { ok: false, code: v.code, message: v.message } }

  if (!(await deps.rateLimitOk('ip', deps.ip)) || !(await deps.rateLimitOk('email', v.value.emailKey))) {
    return { status: 429, body: { ok: false, code: 'rate_limited', message: FREE_CALC_MESSAGES.rateLimited } }
  }
  const captcha = await deps.verifyCaptcha(o.turnstileToken, deps.ip)
  if (!captcha.ok) return { status: 400, body: { ok: false, code: 'captcha_failed', message: FREE_CALC_MESSAGES.captchaFailed } }

  const holdChoice = readConsentChoice(o.marketingConsent, KEEP_RESULTS_SOURCE)
  const saved = await deps.insertPending({
    email: v.value.email,
    email_key: v.value.emailKey,
    full_name: v.value.fullName,
    company: v.value.company,
    // L6: the marketing choice made on the form travels with the hold, so a claim from another device (the email's
    // link, /auth/confirm) records the choice the visitor actually made, with the IP and user agent of that moment.
    // The draft parser ignores the extra key when the claim reads the calculation back.
    payload: holdChoice ? { ...v.value.draft, marketingConsent: { ...holdChoice, ip: deps.ip, userAgent: deps.userAgent ?? null } } : v.value.draft,
    ip: deps.ip,
    expires_at: new Date(deps.now.getTime() + PENDING_TTL_MS).toISOString(),
  })
  if ('error' in saved) {
    console.error('[free-calc/pending] insert failed:', saved.error)
    return { status: 500, body: { ok: false, code: 'store_failed', message: 'Your calculation could not be kept just now. Nothing was saved; try again in a moment.' } }
  }
  try { await deps.purgeExpired() } catch (err) { console.error('[free-calc/pending] purge of expired records failed:', err) }
  return { status: 200, body: { ok: true, id: saved.id } }
}

// ── /claim ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type DbError = { code?: string | null; message?: string | null }

export type ClaimDeps = {
  user: { id: string; email: string }
  now: Date
  /** The account's GHG access, by the shared rule (lib/entitlementAccess.ts). */
  getAccess(): Promise<'active' | 'expired' | 'none' | 'unknown'>
  listOwnInventories(): Promise<OwnInventory[]>
  resolveCompany(name: string): Promise<{ id: string } | { error: DbError }>
  insertInventory(row: Record<string, unknown>): Promise<{ id: string } | { error: DbError }>
  /** Updates ONLY the given id AND only while free_tier is true; returns how many rows changed. */
  replaceFreeInventory(id: string, row: Record<string, unknown>): Promise<{ updated: number } | { error: DbError }>
  getPendingById(id: string): Promise<PendingRow | null>
  latestPending(emailKey: string): Promise<PendingRow | null>
  deletePendingForEmail(emailKey: string): Promise<void>
  /** L7: the per-IP cap on new free calculations a day (bucket free-calc-claim-ip). Records a hit when allowed. */
  claimIpRateLimitOk?(): Promise<boolean>
  upsertProfile(p: { id: string; email: string; fullName: string | null; company: string | null; country: string | null }): Promise<void>
  /** L5: the row as saved, read back after the write, as the user. The results email is built from this alone. */
  readSavedRow(id: string): Promise<SavedInventoryRow | null>
  /** L5: the name on the profile, for a claim that carried none (a signed-in Save). */
  profileFullName(): Promise<string | null>
  sendResults(to: string, email: { subject: string; html: string; text: string; headers?: Record<string, string> }): Promise<SendResult>
  siteUrl: string
  /** L6: this request's IP and user agent, recorded with a marketing choice made in this tab. */
  requestMeta?: { ip: string | null; userAgent: string | null }
  /** L6: writes one marketing_consents row (service role). */
  insertConsent?(row: ConsentInsert): Promise<{ id: string } | { error: string }>
  /** L6: the id of this account's ACTIVE marketing consent (lib/consent/marketing.ts activeConsent), or null. */
  activeConsentId?(): Promise<string | null>
  /** L6: signs the unsubscribe token; the route leaves it to UNSUBSCRIBE_TOKEN_SECRET. */
  signUnsubscribe?(consentId: string): string | null
}

const PLAN_CODES = new Set(['PT402', 'PT410'])
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '')

export async function claimFreeCalc(body: unknown, deps: ClaimDeps): Promise<RouteResult> {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  // L7: the normalised key (lib/emailKey.ts), as /pending stored it. Holds written before L7 used the plain key (trim and
  // lower case); one is found under that key too, for the 24 hours such a hold can still exist.
  const emailKey = normalisedEmailKey(deps.user.email)
  const legacyKey = recipientKey(deps.user.email)
  const ownKey = (k: string) => k === emailKey || k === legacyKey
  const pendingId = typeof o.pendingId === 'string' ? o.pendingId : null

  // 1. The calculation: in hand (same tab), or the pending record for THIS verified email (another device).
  let fullName = text(o.fullName) || null
  let company = text(o.company) || null
  let fromPending: PendingRow | null = null
  if (pendingId || o.inventory === undefined) {
    fromPending = pendingId ? await deps.getPendingById(pendingId)
      : (await deps.latestPending(emailKey)) ?? (legacyKey !== emailKey ? await deps.latestPending(legacyKey) : null)
    if (!fromPending) return fail(404, 'nothing_to_claim', FREE_CALC_MESSAGES.nothingToClaim)
    if (!ownKey(fromPending.email_key)) return fail(403, 'email_mismatch', FREE_CALC_MESSAGES.emailMismatch)
    if (new Date(fromPending.expires_at).getTime() <= deps.now.getTime()) return fail(410, 'expired', FREE_CALC_MESSAGES.expired)
  }
  const checked = checkDraft(o.inventory !== undefined ? o.inventory : fromPending?.payload)
  if (!checked.ok) return fail(400, checked.code, checked.message)
  const draft: GhgDraft = checked.draft
  fullName = fullName ?? fromPending?.full_name ?? null
  company = company ?? fromPending?.company ?? null

  // 2. The plan decides free_tier. An unreadable plan is not a guess either way.
  const access = await deps.getAccess()
  if (access === 'unknown') {
    return fail(503, 'plan_check_failed', 'We couldn’t confirm your plan just now. Nothing was saved; try again in a moment.')
  }
  const active = access === 'active'

  // 3. What to do, against the account's inventories as they are. Never an update of a real inventory.
  const inv = inventoryFromDraft(draft, company ?? '')
  const rows = await deps.listOwnInventories()
  const decision = decideClaim({
    rows, target: { company_name: inv.company_name, reporting_year: inv.reporting_year }, active,
    replaceFreeId: typeof o.replaceFreeId === 'string' ? o.replaceFreeId : null,
  })
  if (decision.action === 'one_free') {
    const f = decision.free
    return { status: 409, body: { ok: false, code: 'one_free', message: FREE_CALC_MESSAGES.oneFree(f.company_name ?? '', f.reporting_year), free: { id: f.id, company: f.company_name, year: f.reporting_year } } }
  }
  if (decision.action === 'conflict') {
    const e = decision.existing
    return { status: 409, body: { ok: false, code: 'conflict', message: FREE_CALC_MESSAGES.conflict(e.company_name ?? '', e.reporting_year), existing: { id: e.id, company: e.company_name, year: e.reporting_year } } }
  }

  // 4. Write, as the user (RLS and the M2 trigger apply), with figures computed here.
  const co = await deps.resolveCompany(inv.company_name)
  if ('error' in co) return dbFail(co.error)
  // T18: the claiming person is who the figures typed before sign-in are attributed to.
  const row = inventoryRow(inv, deps.user.id, co.id, !active, deps.now, { userId: deps.user.id, email: deps.user.email })
  let savedId: string
  if (decision.action === 'replace_free') {
    const r = await deps.replaceFreeInventory(decision.id, row)
    if ('error' in r) return dbFail(r.error)
    if (r.updated !== 1) return fail(409, 'changed', 'Your saved calculation changed while you were working. Nothing was saved; reload the page and try again.')
    savedId = decision.id
  } else {
    // L7: a NEW free calculation counts against the per-IP daily cap; a paid save and a replacement do not.
    if (!active && deps.claimIpRateLimitOk && !(await deps.claimIpRateLimitOk())) {
      return fail(429, 'claim_rate_limited', FREE_CALC_MESSAGES.claimRateLimited)
    }
    const r = await deps.insertInventory(row)
    if ('error' in r) return dbFail(r.error)
    savedId = r.id
  }

  // 5. Housekeeping that must not undo a save that succeeded: the held copies go, the profile is filled in.
  try {
    await deps.deletePendingForEmail(emailKey)
    if (legacyKey !== emailKey) await deps.deletePendingForEmail(legacyKey)
  } catch (err) { console.error('[free-calc/claim] pending delete failed:', err) }
  try {
    await deps.upsertProfile({ id: deps.user.id, email: deps.user.email, fullName, company, country: firstCountry(inv) })
  } catch (err) { console.error('[free-calc/claim] profile upsert failed:', err) }

  // 5b. L6, the marketing choice (design 5), ticked or not: from this tab's form, or held with the calculation when the
  //     claim comes from another device. A failure to record is logged and never undoes the save. No box shown (a
  //     signed-in Save), no choice, no row.
  const sameTab = readConsentChoice(o.marketingConsent, KEEP_RESULTS_SOURCE)
  const heldRaw = (fromPending?.payload as { marketingConsent?: Record<string, unknown> } | null | undefined)?.marketingConsent
  const held = sameTab ? null : readConsentChoice(heldRaw, KEEP_RESULTS_SOURCE)
  const choice = sameTab ?? held
  let consentRecorded: boolean | null = null
  if (choice && deps.insertConsent) {
    const meta = sameTab
      ? deps.requestMeta ?? { ip: null, userAgent: null }
      : { ip: typeof heldRaw?.ip === 'string' ? heldRaw.ip : null, userAgent: typeof heldRaw?.userAgent === 'string' ? heldRaw.userAgent : null }
    const rec = await recordConsentChoice(choice, { userId: deps.user.id, email: deps.user.email, ...meta }, { insertConsent: deps.insertConsent })
    consentRecorded = rec !== null
  }

  // 6. L5, the results email (design 2): only here, after a save, so only to the address the code or link verified.
  //    Built from the row read back, never from what the client sent. A failure is reported, and never undoes the save.
  const emailed = await sendClaimEmail(deps, savedId, fullName)

  return { status: 200, body: { ok: true, id: savedId, freeTier: !active, emailed, ...(consentRecorded === null ? {} : { consentRecorded }) } }
}

/** L6: the unsubscribe link and headers for this account, only while its marketing consent is active. Never throws. */
async function unsubscribeLinks(deps: Pick<ClaimDeps, 'activeConsentId' | 'signUnsubscribe' | 'siteUrl'>) {
  if (!deps.activeConsentId) return null
  try {
    return unsubscribeFor(await deps.activeConsentId(), deps.siteUrl, deps.signUnsubscribe ?? signUnsubscribeToken)
  } catch (err) {
    console.error('[results-email] consent lookup failed; sent without an unsubscribe link:', err)
    return null
  }
}

/** Reads the saved row back and sends it. True only when Resend accepted the email. Never throws. */
export async function sendClaimEmail(
  deps: Pick<ClaimDeps, 'user' | 'readSavedRow' | 'profileFullName' | 'sendResults' | 'siteUrl' | 'activeConsentId' | 'signUnsubscribe'>,
  savedId: string,
  fullName: string | null,
): Promise<boolean> {
  try {
    const row = await deps.readSavedRow(savedId)
    if (!row) { console.error('[free-calc/claim] saved row not readable for the results email:', savedId); return false }
    const name = fullName ?? await deps.profileFullName().catch(() => null)
    const unsubscribe = await unsubscribeLinks(deps)
    const sent = await deps.sendResults(deps.user.email, buildResultsEmail({ row, fullName: name, siteUrl: deps.siteUrl, unsubscribe }))
    return sent.ok
  } catch (err) {
    console.error('[free-calc/claim] results email failed:', err)
    return false
  }
}

function fail(status: number, code: string, message: string): RouteResult {
  return { status, body: { ok: false, code, message } }
}

/** A database refusal: the plan gates' own messages (PT402/PT410) as written, a lost race as the choice, else plain. */
function dbFail(error: DbError): RouteResult {
  const code = (error.code ?? '').trim()
  if (PLAN_CODES.has(code) && error.message) return fail(403, 'plan_required', error.message)
  if (code === '23505') {
    return /ghg_inventories_one_free_per_user/.test(error.message ?? '')
      ? fail(409, 'one_free', 'Your free account keeps one calculation.')
      : fail(409, 'conflict', 'You already have an inventory for that company and year.')
  }
  console.error('[free-calc/claim] database refused:', code, error.message)
  return fail(500, 'save_failed', `The calculation could not be saved${code ? ` (${code})` : ''}. Nothing was saved; try again in a moment.`)
}

// ── /email (L5, "Email me my results again") ─────────────────────────────────────────────────────────────────────

export const RESEND_RESULTS_LIMIT = 3

export const RESULTS_AGAIN_MESSAGES = {
  noId: 'There is no calculation to email.',
  notFound: 'This calculation is not in your account.',
  rateLimited: `Your results can be emailed ${RESEND_RESULTS_LIMIT} times an hour. Try again later.`,
  sendFailed: 'Your results could not be emailed just now. Nothing was sent; try again in a moment.',
  sent: (email: string) => `We've emailed your results to ${email}.`,
} as const

export type ResultsAgainDeps = Pick<ClaimDeps, 'user' | 'readSavedRow' | 'profileFullName' | 'sendResults' | 'siteUrl' | 'activeConsentId' | 'signUnsubscribe'> & {
  rateLimitOk(): Promise<boolean>
}

/**
 * Emails a saved calculation to the signed-in account's own verified address (design 2). Own calculation only: the row
 * is read AS THE USER, so RLS returns nothing for anyone else's id, and that reads as "not in your account". The
 * address is the session's, never one from the request.
 */
export async function emailResultsAgain(body: unknown, deps: ResultsAgainDeps): Promise<RouteResult> {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
  if (!id) return fail(400, 'no_id', RESULTS_AGAIN_MESSAGES.noId)
  if (!(await deps.rateLimitOk())) return fail(429, 'rate_limited', RESULTS_AGAIN_MESSAGES.rateLimited)
  const row = await deps.readSavedRow(id)
  if (!row) return fail(404, 'not_found', RESULTS_AGAIN_MESSAGES.notFound)
  const name = await deps.profileFullName().catch(() => null)
  const unsubscribe = await unsubscribeLinks(deps)
  const sent = await deps.sendResults(deps.user.email, buildResultsEmail({ row, fullName: name, siteUrl: deps.siteUrl, unsubscribe }))
  if (!sent.ok) return fail(502, 'send_failed', RESULTS_AGAIN_MESSAGES.sendFailed)
  return { status: 200, body: { ok: true, message: RESULTS_AGAIN_MESSAGES.sent(deps.user.email) } }
}
