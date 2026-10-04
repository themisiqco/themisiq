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
import type { GhgDraft } from './draftParse'

export type RouteResult = { status: number; body: Record<string, unknown> }

export type PendingRow = {
  id: string; email: string; email_key: string; full_name: string | null; company: string | null
  payload: unknown; created_at: string; expires_at: string
}

// ── /pending ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type HoldDeps = {
  ip: string | null
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

  const saved = await deps.insertPending({
    email: v.value.email,
    email_key: v.value.emailKey,
    full_name: v.value.fullName,
    company: v.value.company,
    payload: v.value.draft,
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
  upsertProfile(p: { id: string; email: string; fullName: string | null; company: string | null; country: string | null }): Promise<void>
}

const PLAN_CODES = new Set(['PT402', 'PT410'])
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : '')

export async function claimFreeCalc(body: unknown, deps: ClaimDeps): Promise<RouteResult> {
  const o = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const emailKey = recipientKey(deps.user.email)
  const pendingId = typeof o.pendingId === 'string' ? o.pendingId : null

  // 1. The calculation: in hand (same tab), or the pending record for THIS verified email (another device).
  let fullName = text(o.fullName) || null
  let company = text(o.company) || null
  let fromPending: PendingRow | null = null
  if (pendingId || o.inventory === undefined) {
    fromPending = pendingId ? await deps.getPendingById(pendingId) : await deps.latestPending(emailKey)
    if (!fromPending) return fail(404, 'nothing_to_claim', FREE_CALC_MESSAGES.nothingToClaim)
    if (fromPending.email_key !== emailKey) return fail(403, 'email_mismatch', FREE_CALC_MESSAGES.emailMismatch)
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
  const row = inventoryRow(inv, deps.user.id, co.id, !active, deps.now)
  let savedId: string
  if (decision.action === 'replace_free') {
    const r = await deps.replaceFreeInventory(decision.id, row)
    if ('error' in r) return dbFail(r.error)
    if (r.updated !== 1) return fail(409, 'changed', 'Your saved calculation changed while you were working. Nothing was saved; reload the page and try again.')
    savedId = decision.id
  } else {
    const r = await deps.insertInventory(row)
    if ('error' in r) return dbFail(r.error)
    savedId = r.id
  }

  // 5. Housekeeping that must not undo a save that succeeded: the held copies go, the profile is filled in.
  try { await deps.deletePendingForEmail(emailKey) } catch (err) { console.error('[free-calc/claim] pending delete failed:', err) }
  try {
    await deps.upsertProfile({ id: deps.user.id, email: deps.user.email, fullName, company, country: firstCountry(inv) })
  } catch (err) { console.error('[free-calc/claim] profile upsert failed:', err) }

  return { status: 200, body: { ok: true, id: savedId, freeTier: !active } }
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
