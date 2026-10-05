// lib/ghg/keepResults.ts
//
// "KEEP MY RESULTS", THE WIZARD SIDE, PURE (LEAD1 L4, Oct 2026; design in docs/review/design-lead1.md sections 1.1 to
// 1.6). No React, no Supabase: the page (app/dashboard/ghg/page.tsx), the modal
// (app/dashboard/ghg/_components/KeepResultsModal.tsx) and /auth/confirm call these, and the tests call them directly.
//
//   decideSave        what Save does, the four outcomes of design 1.1 (it replaced saveGoesToPricing)
//   keepPromptShown   whether the four "Keep my results" placements appear
//   unsavedNudgeArm   which unsaved-changes banner a visitor sees
//   keepReducer       the modal's states: form, sending, code, verifying, claiming, the two choices, done, error
//   claimOutcome      a /api/ghg/free-calc/claim response, read once for the modal and for /auth/confirm
//   pending marker    "a code was sent to this address": kept with the draft so a reload can still take the code

import type { EntitlementAccess } from '../useEntitlement'

// ── Save routing (design 1.1) ───────────────────────────────────────────────────────────────────────────────────

export type SaveOutcome = 'keep_form' | 'claim_free' | 'one_free_choice' | 'save'

export type VisitorState = {
  /** Whether a session exists. null: NOT READ YET, which is not the same as signed out (fix1, below). */
  signedIn: boolean | null
  access: EntitlementAccess
  /** An inventory is open by id (the wizard's inventoryId). */
  hasInventoryId: boolean
  /** The open inventory is this account's free calculation (ghg_inventories.free_tier). */
  editingFree: boolean
  /** This account already has a free calculation saved. null: NOT KNOWN, because the lookup is still in flight or
   *  failed; never read as "none" (fix1, below). */
  hasFreeCalc: boolean | null
}

// ⚠️ LEAD1 L4 FIX1 (5 Oct 2026). signedIn and hasFreeCalc were plain booleans, and the page passed `signedIn === true`
// and a hasFreeCalc that started false. So a signed-in account with a free calculation read as SIGNED OUT until the
// session read landed, and as having NO free calculation until the lookup landed, and FOR GOOD if the lookup failed:
// its error was read as "no rows". The plan read ('none') can land before either, so "Keep my results" showed to the
// one visitor it must never show to. Unknown is now its own value, and no prompt shows on an unknown.

/**
 * What Save does.
 * - signed out: the "Keep my results" form ('keep_form'). Nothing is written before the email is confirmed.
 * - active plan: save as always ('save').
 * - a free account working in its own free calculation: save as always; the database allows it (M2).
 * - signed in with no plan (never bought, or expired), on a NEW calculation:
 *   - no free calculation yet: saved as the free calculation, through the claim route ('claim_free');
 *   - one already saved: the one-free choice ('one_free_choice'). The claim route states it, with its own wording.
 * - signed in with no plan, on a saved inventory that is not the free one (an expired plan's real inventory): save as
 *   before, and the trigger refuses with its renew message. A claim would only report a conflict with itself.
 * - 'loading' and 'unknown': save as before; the trigger decides and says why.
 */
export function decideSave(v: VisitorState): SaveOutcome {
  // handleSave reads the session itself, so signedIn is never null here; null is treated as signed out only because
  // there is no session to claim with.
  if (!v.signedIn) return 'keep_form'
  if (v.access !== 'none' && v.access !== 'expired') return 'save'
  if (v.editingFree || v.hasInventoryId) return 'save'
  // An unknown free calculation goes to the claim route, which reads the account itself and states the one-free
  // choice if there is one. Both outcomes open the modal at the claim.
  return v.hasFreeCalc === true ? 'one_free_choice' : 'claim_free'
}

/**
 * Whether the "Keep my results" placements appear (step 4 card, banner button, export overlay link). Not for an
 * active plan, not while the plan is being read, not for a free account (or anyone) with an inventory open by id,
 * and not for an account whose free calculation is already used.
 */
export function keepPromptShown(v: VisitorState): boolean {
  if (v.access === 'active' || v.access === 'loading') return false
  if (v.signedIn === null) return false
  if (!v.signedIn) return true
  if (v.access === 'unknown' || v.hasInventoryId) return false
  return v.hasFreeCalc === false
}

/**
 * The unsaved-changes banner.
 * - 'keep': signed out. "Create a free account to keep this calculation." with "Keep my results".
 * - 'one_free': signed in with no plan, a free calculation already saved, and this is a new one. "Your free account
 *   keeps one calculation." with the pricing button.
 * - 'save': everyone else, "save your draft" with Save, which decideSave routes.
 */
export function unsavedNudgeArm(v: VisitorState): 'keep' | 'one_free' | 'save' {
  if (v.access === 'active' || v.access === 'loading' || v.access === 'unknown') return 'save'
  // Not read yet: "save your draft", whose Save reads the session itself and routes correctly either way.
  if (v.signedIn === null) return 'save'
  if (!v.signedIn) return 'keep'
  if (v.hasInventoryId || v.editingFree) return 'save'
  return v.hasFreeCalc === true ? 'one_free' : 'save'
}

// ── Customer-facing words (L4) ──────────────────────────────────────────────────────────────────────────────────

export const KEEP_COPY = {
  button: 'Keep my results',
  // L5: the results email is sent on claim (lib/ghg/freeCalcService.ts), so design 1.1's line is now true.
  line: 'Create a free account and we\'ll email your results to you and keep this calculation.',
  overlayLink: 'Email me my results instead (free account)',
  oneFreeNudge: 'Your free account keeps one calculation.',
  modalTitle: 'Keep my results',
  terms: 'By creating a free account you agree to the Terms and the Privacy Policy.',
  codeSent: (email: string) => `We've sent a 6-digit code to ${email}.`,
  codeHelp: 'Type it here, or open the link in the same email on any device. The code works for 1 hour.',
  codeInvalid: 'Enter the 6-digit code from the email.',
  newCodeSent: 'A new code is on its way.',
  savedFree: 'Your calculation is saved to your free account.',
  savedPlan: 'Your calculation is saved to your account.',
  freeRowBanner: 'This is your free calculation. You can edit it and email it to yourself. Scope 3, uploads and downloads need a GHG plan.',
  emailAgain: 'Email me my results again',
  emailing: 'Sending…',
  emailed: (email: string | null) => (email ? `We've emailed your results to ${email}.` : 'We\'ve emailed your results to you.'),
  notEmailed: 'Your results email could not be sent just now. Nothing was sent; you can send it from this calculation with "Email me my results again".',
  emailAgainFailed: 'Your results could not be emailed just now. Nothing was sent; try again in a moment.',
  replace: 'Replace it with this one',
  openSaved: 'Open my saved calculation',
  keepBoth: 'Keep both with a GHG plan',
  openSavedConfirm: 'Open your saved calculation? The figures on this screen will not be kept.',
  openExisting: 'Open that inventory',
  changeCompanyYear: 'Save this calculation under a different year or company',
  noSession: 'The code was accepted but no session started. Try signing in again.',
  claimFailed: 'Your calculation could not be saved just now. Nothing was saved; try again in a moment.',
} as const

// ── The claim response ──────────────────────────────────────────────────────────────────────────────────────────

export type InventoryRef = { id: string; company: string | null; year: number }

export type ClaimOutcome =
  | { kind: 'saved'; id: string; freeTier: boolean; emailed: boolean }
  | { kind: 'one_free'; message: string; free: InventoryRef | null }
  | { kind: 'conflict'; message: string; existing: InventoryRef | null }
  | { kind: 'nothing'; message: string }
  | { kind: 'failed'; message: string }

function ref(v: unknown): InventoryRef | null {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  if (!o || typeof o.id !== 'string' || typeof o.year !== 'number') return null
  return { id: o.id, company: typeof o.company === 'string' ? o.company : null, year: o.year }
}

/**
 * One reading of a /claim response. The route's own message is shown as written (lib/ghg/freeCalc.ts
 * FREE_CALC_MESSAGES); a response with none says the save failed and nothing was saved, never a guess at why.
 * 'nothing' is 404 nothing_to_claim: no calculation was waiting for this email (an ordinary sign-in by link).
 */
export function claimOutcome(status: number, body: unknown): ClaimOutcome {
  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const message = typeof o.message === 'string' && o.message ? o.message : KEEP_COPY.claimFailed
  if (status === 200 && o.ok === true && typeof o.id === 'string') return { kind: 'saved', id: o.id, freeTier: o.freeTier !== false, emailed: o.emailed === true }
  if (o.code === 'one_free') return { kind: 'one_free', message, free: ref(o.free) }
  if (o.code === 'conflict') return { kind: 'conflict', message, existing: ref(o.existing) }
  if (status === 404 && o.code === 'nothing_to_claim') return { kind: 'nothing', message }
  return { kind: 'failed', message }
}

/**
 * Where a saved claim opens: the saved calculation, with the confirmation line (?kept=free or ?kept=plan) and whether
 * the results email went (?emailed=1 or 0, L5).
 */
export function savedHref(id: string, freeTier: boolean, emailed = false): string {
  return `/dashboard/ghg?id=${encodeURIComponent(id)}&kept=${freeTier ? 'free' : 'plan'}&emailed=${emailed ? 1 : 0}`
}

export function inventoryHref(id: string): string {
  return `/dashboard/ghg?id=${encodeURIComponent(id)}`
}

/** The sentence after the confirmation line, from ?emailed= (L5): sent, not sent, or nothing when absent. */
export function emailedLine(param: string | null, email: string | null): string | null {
  if (param === '1') return KEEP_COPY.emailed(email)
  if (param === '0') return KEEP_COPY.notEmailed
  return null
}

/** The confirmation line for ?kept=, or null. */
export function keptLine(param: string | null): string | null {
  if (param === 'free') return KEEP_COPY.savedFree
  if (param === 'plan') return KEEP_COPY.savedPlan
  return null
}

// ── The modal's states (design 1.2 to 1.5b) ─────────────────────────────────────────────────────────────────────

export type KeepState =
  | { step: 'form'; error: string | null }
  | { step: 'sending' }
  | { step: 'code'; email: string; error: string | null; notice: string | null }
  | { step: 'verifying'; email: string }
  | { step: 'claiming' }
  | { step: 'one_free'; message: string; free: InventoryRef | null; error: string | null }
  | { step: 'conflict'; message: string; existing: InventoryRef | null; editing: boolean }
  | { step: 'done'; id: string; freeTier: boolean }
  | { step: 'error'; message: string }

export type KeepEvent =
  | { type: 'submit' }
  | { type: 'send_failed'; message: string }
  | { type: 'code_sent'; email: string; resent?: boolean }
  | { type: 'resend_failed'; message: string }
  | { type: 'verify' }
  | { type: 'verify_failed'; message: string }
  | { type: 'claim' }
  | { type: 'claimed'; outcome: ClaimOutcome }
  | { type: 'change_email' }
  | { type: 'edit_company_year' }

/** The first state: the form for a signed-out visitor; straight to the claim for a signed-in one. */
export function initialKeepState(start: 'form' | 'claim' | 'code', email = ''): KeepState {
  if (start === 'claim') return { step: 'claiming' }
  if (start === 'code') return { step: 'code', email, error: null, notice: null }
  return { step: 'form', error: null }
}

/**
 * The transitions. Anything not listed leaves the state as it is, so a late reply cannot move a modal that has
 * already moved on (a resend landing after the code was verified, a double click).
 */
export function keepReducer(s: KeepState, e: KeepEvent): KeepState {
  switch (e.type) {
    case 'submit':
      return s.step === 'form' ? { step: 'sending' } : s
    case 'send_failed':
      return s.step === 'sending' ? { step: 'form', error: e.message } : s
    case 'code_sent':
      if (s.step === 'sending') return { step: 'code', email: e.email, error: null, notice: null }
      if (s.step === 'code' && e.resent) return { ...s, error: null, notice: KEEP_COPY.newCodeSent }
      return s
    case 'resend_failed':
      return s.step === 'code' ? { ...s, error: e.message, notice: null } : s
    case 'verify':
      return s.step === 'code' ? { step: 'verifying', email: s.email } : s
    case 'verify_failed':
      return s.step === 'verifying' ? { step: 'code', email: s.email, error: e.message, notice: null } : s
    case 'claim':
      return s.step === 'verifying' || s.step === 'one_free' || s.step === 'conflict' || s.step === 'error' || s.step === 'claiming'
        ? { step: 'claiming' } : s
    case 'claimed': {
      if (s.step !== 'claiming') return s
      const o = e.outcome
      if (o.kind === 'saved') return { step: 'done', id: o.id, freeTier: o.freeTier }
      if (o.kind === 'one_free') return { step: 'one_free', message: o.message, free: o.free, error: null }
      if (o.kind === 'conflict') return { step: 'conflict', message: o.message, existing: o.existing, editing: false }
      return { step: 'error', message: o.message }
    }
    case 'change_email':
      return s.step === 'code' ? { step: 'form', error: null } : s
    case 'edit_company_year':
      return s.step === 'conflict' ? { ...s, editing: true } : s
  }
}

/** The 6-digit code as typed, or null: spaces are dropped, anything else that is not six digits is refused. */
export function normaliseCode(raw: string): string | null {
  const c = raw.replace(/\s+/g, '')
  return /^\d{6}$/.test(c) ? c : null
}

// ── The pending marker (design 1.6) ─────────────────────────────────────────────────────────────────────────────
//
// While a code is pending, the calculation is in localStorage (the wizard draft, lib/ghg/draft.ts) and on the server
// (free_calc_pending). The marker records that a code was sent, to which address, so that a reload (1) keeps the draft
// in localStorage instead of clearing it on restore, and (2) reopens the modal at the code step. It lives as long as a
// code does (1 hour, the Supabase OTP expiry), and goes on a successful claim or when the visitor changes the email.

export const KEEP_PENDING_KEY = 'themisiq.ghg.keep-pending'
export const CODE_TTL_MS = 60 * 60 * 1000

/** marketingConsent (L6): the box's state when the code was sent, so a reload before the code is typed claims with the
 *  choice the visitor made. Absent on markers written before L6: no choice is recorded for those. */
export type PendingMarker = { email: string; fullName: string; company: string; sentAt: number; marketingConsent?: boolean }

export function parsePendingMarker(raw: string | null, now: number): PendingMarker | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    if (typeof o.email !== 'string' || !o.email || typeof o.sentAt !== 'number') return null
    if (now - o.sentAt >= CODE_TTL_MS || o.sentAt > now + 60_000) return null
    return {
      email: o.email,
      fullName: typeof o.fullName === 'string' ? o.fullName : '',
      company: typeof o.company === 'string' ? o.company : '',
      sentAt: o.sentAt,
      ...(typeof o.marketingConsent === 'boolean' ? { marketingConsent: o.marketingConsent } : {}),
    }
  } catch {
    return null
  }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const store = (): StorageLike | null => {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function readPendingMarker(now = Date.now(), s: StorageLike | null = store()): PendingMarker | null {
  try { return parsePendingMarker(s?.getItem(KEEP_PENDING_KEY) ?? null, now) } catch { return null }
}

export function writePendingMarker(m: PendingMarker, s: StorageLike | null = store()): void {
  try { s?.setItem(KEEP_PENDING_KEY, JSON.stringify(m)) } catch { /* storage off: the code can still be typed in this tab */ }
}

export function clearPendingMarker(s: StorageLike | null = store()): void {
  try { s?.removeItem(KEEP_PENDING_KEY) } catch { /* nothing to clear */ }
}

/**
 * Whether the draft restore should clear the draft. It always did ("cleared on restore", lib/ghg/draft.ts), and still
 * does, EXCEPT while a code is pending: then the draft stays in localStorage until the claim succeeds, so a second
 * reload before the code is typed still finds the calculation.
 */
export function clearDraftOnRestore(marker: PendingMarker | null): boolean {
  return marker === null
}

// ── /auth/confirm (design 1.6, the link instead of the code) ────────────────────────────────────────────────────

export type ConfirmAction = { label: string; href: string } | { label: string; replaceFreeId: string }
export type ConfirmStep = { go: string } | { message: string; actions: ConfirmAction[] }

/**
 * What /auth/confirm does after the link has signed the visitor in and the claim has answered (with no calculation in
 * hand, so the claim took the newest held one for the verified email). `landing` is CONFIRM_LANDING.
 * - saved: open the saved calculation, with the confirmation line.
 * - nothing waiting (an ordinary sign-in by link, from /login): the calculator, as before L4.
 * - the one-free choice and the conflict: the route's own sentence, with the choices this page can offer. "Save under
 *   a different year or company" needs the calculation on screen, so it is in the wizard's modal, not here.
 * - anything else: the route's sentence, and the way on to the calculator. The visitor is signed in either way.
 */
export function confirmStep(outcome: ClaimOutcome, landing: string): ConfirmStep {
  const back = { label: 'Go to the calculator', href: landing }
  switch (outcome.kind) {
    case 'saved': return { go: savedHref(outcome.id, outcome.freeTier, outcome.emailed) }
    case 'nothing': return { go: landing }
    case 'one_free':
      return { message: outcome.message, actions: outcome.free
        ? [{ label: KEEP_COPY.replace, replaceFreeId: outcome.free.id }, { label: KEEP_COPY.openSaved, href: inventoryHref(outcome.free.id) }]
        : [back] }
    case 'conflict':
      return { message: outcome.message, actions: outcome.existing ? [{ label: KEEP_COPY.openExisting, href: inventoryHref(outcome.existing.id) }, back] : [back] }
    case 'failed':
      return { message: outcome.message, actions: [back] }
  }
}
