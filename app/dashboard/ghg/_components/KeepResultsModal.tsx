'use client'

// app/dashboard/ghg/_components/KeepResultsModal.tsx
//
// "KEEP MY RESULTS" (LEAD1 L4, Oct 2026; design in docs/review/design-lead1.md sections 1.2 to 1.6). A modal over the
// wizard, so nothing on screen is lost. The states and the claim reading are pure, in lib/ghg/keepResults.ts.
//
// SIGNED OUT, the whole round trip happens here:
//   1. the form: full name, work email, company (prefilled from the calculation), Turnstile, the honeypot;
//   2. on submit the calculation is written to this browser's draft (lib/ghg/draft.ts) and held on the server
//      (POST /api/ghg/free-calc/pending), THEN the code is asked for (signInWithOtp, shouldCreateUser: true), so a
//      refused hold sends no email;
//   3. the 6-digit code is typed here (verifyOtp, type 'email'); "Send a new code" and "Use a different email";
//   4. the calculation in memory is claimed (POST /api/ghg/free-calc/claim), and the page reloads on the saved
//      calculation, which refreshes the session and the plan the page read at mount.
// SIGNED IN with no plan, Save opens this straight at the claim (decideSave in lib/ghg/keepResults.ts).
//
// TWO TURNSTILE TOKENS, BECAUSE A TOKEN IS SINGLE-USE. /pending verifies one server side (lib/turnstileVerify.ts) and
// Supabase Auth's CAPTCHA protection verifies another on signInWithOtp. The widget is reset after each is taken and
// the next call waits for the fresh one. With no site key (production, NEXT_PUBLIC_TURNSTILE_SITE_KEY unset) there is
// no widget and no wait, as on the other auth forms (app/components/Turnstile.tsx).
//
// ESCAPE CLOSES IT, and so does the close button: the calculation stays on screen and in the draft. Focus moves into
// the modal on open, stays inside it on Tab, and returns to the button that opened it on close.

import { useEffect, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { supabase } from '../../../../lib/supabase'
import Turnstile, { TURNSTILE_SITE_KEY } from '../../../components/Turnstile'
import { authErrorText } from '../../../../lib/auth/authErrors'
import { HONEYPOT_FIELD } from '../../../../lib/assessmentSubmitGuard'
import { isPlausibleEmail, FREE_CALC_MESSAGES } from '../../../../lib/ghg/freeCalc'
import { saveGhgDraft, clearGhgDraft } from '../../../../lib/ghg/draft'
import { reportingYearOptions } from '../../../../lib/reportingYears'
import {
  KEEP_COPY, keepReducer, initialKeepState, claimOutcome, savedHref, inventoryHref, normaliseCode,
  writePendingMarker, clearPendingMarker, type PendingMarker,
} from '../../../../lib/ghg/keepResults'
import type { Inventory } from '../../../../lib/ghg/engine'

const TOKEN_WAIT_MS = 15_000

export type KeepResultsModalProps = {
  start: 'form' | 'claim' | 'code'
  inventory: Inventory
  /** A code already sent (a reload while it was pending): prefills the form and opens at the code step. */
  pending?: PendingMarker | null
  onClose(): void
  /** "Keep both with a GHG plan": the page's stashDraftAndGoToPricing. */
  onKeepBoth(): void
  /** The conflict choice changed the company or year: the page shows the same values. */
  onCompanyYearChange(company: string, year: number): void
  /** Called just before this modal navigates away, so the page's unsaved-changes prompt does not stop it. */
  onLeaving(): void
  /** The code was accepted: the visitor is signed in now, whatever the claim then says. */
  onSignedIn(): void
}

/** Drops ?start=new from the address, so a reload restores the draft instead of opening a blank calculator. */
function dropStartNew() {
  try {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('start')) return
    url.searchParams.delete('start')
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  } catch { /* the address stays as it is; the draft is still in storage */ }
}

export default function KeepResultsModal(props: KeepResultsModalProps) {
  const { inventory, pending, onClose, onKeepBoth, onCompanyYearChange, onLeaving, onSignedIn } = props
  const [state, dispatch] = useReducer(keepReducer, initialKeepState(props.start, pending?.email ?? ''))
  const [fullName, setFullName] = useState(pending?.fullName ?? '')
  const [email, setEmail] = useState(pending?.email ?? '')
  const [company, setCompany] = useState(pending?.company || inventory.company_name || '')
  const [honeypot, setHoneypot] = useState('')
  const [code, setCode] = useState('')
  const [altCompany, setAltCompany] = useState(inventory.company_name || '')
  const [altYear, setAltYear] = useState(inventory.reporting_year)
  // The calculation the claim sends: the one on screen, or the one with the company or year changed (1.5b).
  const claimInventory = useRef<Inventory>(inventory)
  useEffect(() => { claimInventory.current = inventory }, [inventory])

  // ── Turnstile: take a token, or wait for the next one ───────────────────────────────────────────────────────
  const token = useRef<string | null>(null)
  const waiters = useRef<Array<(t: string | null) => void>>([])
  const [captchaReset, setCaptchaReset] = useState(0)
  const onToken = (t: string | null) => {
    token.current = t
    if (t) { const w = waiters.current; waiters.current = []; w.forEach(f => f(t)) }
  }
  const nextToken = async (): Promise<string | undefined> => {
    if (!TURNSTILE_SITE_KEY) return undefined
    let t = token.current
    if (!t) {
      t = await new Promise<string | null>(resolve => {
        const timer = setTimeout(() => { waiters.current = waiters.current.filter(f => f !== done); resolve(null) }, TOKEN_WAIT_MS)
        const done = (v: string | null) => { clearTimeout(timer); resolve(v) }
        waiters.current.push(done)
      })
    }
    token.current = null
    setCaptchaReset(n => n + 1)
    // No token in time: the call goes without one. While Supabase's CAPTCHA protection is off that changes nothing;
    // once it is on, the refusal is shown as "The security check didn't complete".
    return t ?? undefined
  }

  // ── Focus: in on open, kept inside on Tab, back on close; Escape closes ─────────────────────────────────────
  const panel = useRef<HTMLDivElement>(null)
  // The step's first field, else its first button; never the close button, which is last in the tab order's sense.
  const firstField = () => panel.current?.querySelector<HTMLElement>('input:not([tabindex="-1"]):not([disabled]), select:not([disabled])')
    ?? panel.current?.querySelector<HTMLElement>('button:not([disabled]):not([data-close])')
    ?? panel.current
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    return () => { opener?.focus?.() }
  }, [])
  // Each new step moves focus to its first field, so a keyboard user is never left on a control that has gone.
  const focusKey = state.step === 'conflict' && state.editing ? 'conflict-edit' : state.step
  useEffect(() => { firstField()?.focus() }, [focusKey])
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab' || !panel.current) return
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>('input:not([tabindex="-1"]):not([disabled]), button:not([disabled]), a[href], select:not([disabled])'))
    if (items.length === 0) return
    const firstEl = items[0], lastEl = items[items.length - 1]
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
  }

  // ── The calls ───────────────────────────────────────────────────────────────────────────────────────────────
  const leaveTo = (href: string) => { onLeaving(); window.location.replace(href) }

  const askForCode = async (addr: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: {
        shouldCreateUser: true,
        captchaToken: await nextToken(),
        data: { full_name: fullName.trim(), company: company.trim(), signup_source: 'free_calc' },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })
    return error ? authErrorText(error) || FREE_CALC_MESSAGES.captchaFailed : null
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (state.step !== 'form') return
    const addr = email.trim()
    const problem = !fullName.trim() ? FREE_CALC_MESSAGES.missingName
      : !isPlausibleEmail(addr) ? FREE_CALC_MESSAGES.invalidEmail
      : !company.trim() ? FREE_CALC_MESSAGES.missingCompany : null
    if (problem) { dispatch({ type: 'submit' }); dispatch({ type: 'send_failed', message: problem }); return }
    dispatch({ type: 'submit' })
    // The calculation goes to this browser first (design 1.6): a reload or a closed tab before the code is typed
    // finds it again. Signed out, so the draft's 2-hour lifetime applies.
    saveGhgDraft(inventory, { anon: true })
    dropStartNew()
    let held: Response
    try {
      held = await fetch('/api/ghg/free-calc/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, fullName: fullName.trim(), company: company.trim(), inventory, turnstileToken: await nextToken(), [HONEYPOT_FIELD]: honeypot }),
      })
    } catch {
      dispatch({ type: 'send_failed', message: 'Your calculation could not be sent. Check your connection and try again. Nothing was saved.' })
      return
    }
    const body = await held.json().catch(() => ({})) as { ok?: boolean; message?: string }
    if (!held.ok || body.ok !== true) {
      dispatch({ type: 'send_failed', message: body.message || `Your calculation could not be kept just now (${held.status}). Nothing was saved; try again in a moment.` })
      return
    }
    const failed = await askForCode(addr)
    if (failed) { dispatch({ type: 'send_failed', message: failed }); return }
    writePendingMarker({ email: addr, fullName: fullName.trim(), company: company.trim(), sentAt: Date.now() })
    dispatch({ type: 'code_sent', email: addr })
  }

  const resend = async () => {
    if (state.step !== 'code') return
    const failed = await askForCode(state.email)
    if (failed) { dispatch({ type: 'resend_failed', message: failed }); return }
    writePendingMarker({ email: state.email, fullName: fullName.trim(), company: company.trim(), sentAt: Date.now() })
    dispatch({ type: 'code_sent', email: state.email, resent: true })
  }

  const changeEmail = () => {
    clearPendingMarker()
    setCode('')
    dispatch({ type: 'change_email' })
  }

  const claim = async (opts: { replaceFreeId?: string } = {}) => {
    dispatch({ type: 'claim' })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { dispatch({ type: 'claimed', outcome: { kind: 'failed', message: KEEP_COPY.noSession } }); return }
    let outcome
    try {
      const res = await fetch('/api/ghg/free-calc/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          inventory: claimInventory.current,
          ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
          company: (claimInventory.current.company_name || company).trim(),
          ...(opts.replaceFreeId ? { replaceFreeId: opts.replaceFreeId } : {}),
        }),
      })
      outcome = claimOutcome(res.status, await res.json().catch(() => ({})))
    } catch {
      outcome = claimOutcome(0, {})
    }
    dispatch({ type: 'claimed', outcome })
    if (outcome.kind === 'saved') {
      // Saved: the draft and the marker have done their job, and the page reopens on the saved calculation.
      clearGhgDraft()
      clearPendingMarker()
      leaveTo(savedHref(outcome.id, outcome.freeTier))
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (state.step !== 'code') return
    const c = normaliseCode(code)
    if (!c) { dispatch({ type: 'resend_failed', message: KEEP_COPY.codeInvalid }); return }
    dispatch({ type: 'verify' })
    const { error } = await supabase.auth.verifyOtp({ email: state.email, token: c, type: 'email' })
    if (error) { dispatch({ type: 'verify_failed', message: authErrorText(error) || KEEP_COPY.codeInvalid }); return }
    // The code is spent. The draft stays until the claim saves (a choice may still be open), the marker does not:
    // a reload now must not ask for a code again.
    clearPendingMarker()
    onSignedIn()
    await claim()
  }

  // Signed in with no plan: Save opened this at the claim, so it starts at once. Once only (a ref, so React's
  // development double-mount does not send two claims).
  const started = useRef(false)
  useEffect(() => {
    if (props.start !== 'claim' || started.current) return
    started.current = true
    void claim()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 1.5: "Open my saved calculation" discards this one, after a confirm.
  const openSaved = (id: string) => {
    if (!window.confirm(KEEP_COPY.openSavedConfirm)) return
    clearGhgDraft()
    clearPendingMarker()
    leaveTo(inventoryHref(id))
  }
  // 1.5b: "Open that inventory" keeps this calculation in the browser draft (signed in now, so no 2-hour limit).
  const openExisting = (id: string) => {
    saveGhgDraft(claimInventory.current, { anon: false })
    clearPendingMarker()
    leaveTo(inventoryHref(id))
  }
  const saveUnder = async (e: FormEvent) => {
    e.preventDefault()
    const name = altCompany.trim()
    if (!name) return
    claimInventory.current = { ...claimInventory.current, company_name: name, company_id: null, reporting_year: altYear }
    onCompanyYearChange(name, altYear)
    await claim()
  }

  // ── Render ──────────────────────────────────────────────────────────────────────────────────────────────────
  const busy = state.step === 'sending' || state.step === 'verifying' || state.step === 'claiming'
  const showWidget = state.step === 'form' || state.step === 'sending' || state.step === 'code' || state.step === 'verifying'

  return (
    <div onKeyDown={onKeyDown} onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(13,13,13,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="keep-results-title" tabIndex={-1}
        style={{ width: '100%', maxWidth: 440, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxSizing: 'border-box', background: 'var(--color-surface, #fff)', borderRadius: 14, padding: '20px 20px 18px', boxShadow: '0 8px 40px rgba(0,0,0,0.18)', border: '0.5px solid #e8e7e4', position: 'relative' }}>
        <button type="button" data-close onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, width: 36, height: 36, border: 'none', background: 'none', fontSize: 20, lineHeight: 1, color: '#555553', cursor: 'pointer' }}>×</button>
        <h2 id="keep-results-title" style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', color: '#0d0d0d', margin: '0 32px 6px 0', fontWeight: 400 }}>{KEEP_COPY.modalTitle}</h2>

        {(state.step === 'form' || state.step === 'sending') && (
          <form onSubmit={submit} noValidate>
            <p style={para}>{KEEP_COPY.line}</p>
            <label htmlFor="keep-name" style={label}>Full name</label>
            <input id="keep-name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} disabled={busy} style={input} />
            <label htmlFor="keep-email" style={label}>Work email</label>
            <input id="keep-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} style={input} />
            <label htmlFor="keep-company" style={label}>Company</label>
            <input id="keep-company" autoComplete="organization" value={company} onChange={e => setCompany(e.target.value)} disabled={busy} style={input} />
            {/* ⚠️ L6: THE MARKETING CONSENT BOX GOES HERE (design section 5): unticked, optional, worded separately from
                the Terms sentence, and recorded with its wording, version, IP and user agent. Not before L6. */}
            {/* The honeypot (lib/assessmentSubmitGuard.ts): out of the layout, the tab order and the accessibility
                tree, so a person never fills it; see the note in app/assess/page.tsx. */}
            <input value={honeypot} onChange={e => setHoneypot(e.target.value)} name={HONEYPOT_FIELD} tabIndex={-1} aria-hidden="true" autoComplete="off"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }} />
            {state.step === 'form' && state.error && <p role="alert" style={errorText}>{state.error}</p>}
            <button type="submit" disabled={busy} style={{ ...primary, opacity: busy ? 0.7 : 1, cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Sending…' : 'Email me a code'}</button>
            <p style={small}>By creating a free account you agree to the <Link href="/terms" target="_blank" style={link}>Terms</Link> and the <Link href="/privacy" target="_blank" style={link}>Privacy Policy</Link>.</p>
          </form>
        )}

        {(state.step === 'code' || state.step === 'verifying') && (
          <form onSubmit={verify} noValidate>
            <p style={para} role="status">{KEEP_COPY.codeSent(state.email)}</p>
            <p style={{ ...small, marginTop: 0 }}>{KEEP_COPY.codeHelp}</p>
            <label htmlFor="keep-code" style={label}>6-digit code</label>
            <input id="keep-code" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7}
              disabled={state.step === 'verifying'} style={{ ...input, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }} />
            {state.step === 'code' && state.error && <p role="alert" style={errorText}>{state.error}</p>}
            {state.step === 'code' && state.notice && <p role="status" style={small}>{state.notice}</p>}
            <button type="submit" disabled={state.step === 'verifying'} style={{ ...primary, opacity: state.step === 'verifying' ? 0.7 : 1 }}>{state.step === 'verifying' ? 'Checking…' : KEEP_COPY.button}</button>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' as const, marginTop: 12 }}>
              <button type="button" onClick={() => { void resend() }} disabled={state.step === 'verifying'} style={textButton}>Send a new code</button>
              <button type="button" onClick={changeEmail} disabled={state.step === 'verifying'} style={textButton}>Use a different email</button>
            </div>
          </form>
        )}

        {state.step === 'claiming' && <p role="status" style={para}>Saving your calculation…</p>}

        {state.step === 'one_free' && (
          <div>
            <p style={para}>{state.message}</p>
            <div style={choices}>
              {state.free && <button type="button" onClick={() => { void claim({ replaceFreeId: state.free!.id }) }} style={primary}>{KEEP_COPY.replace}</button>}
              {state.free && <button type="button" onClick={() => openSaved(state.free!.id)} style={secondary}>{KEEP_COPY.openSaved}</button>}
              <button type="button" onClick={onKeepBoth} style={secondary}>{KEEP_COPY.keepBoth}</button>
            </div>
          </div>
        )}

        {state.step === 'conflict' && (
          <div>
            <p style={para}>{state.message}</p>
            {!state.editing ? (
              <div style={choices}>
                {state.existing && <button type="button" onClick={() => openExisting(state.existing!.id)} style={primary}>{KEEP_COPY.openExisting}</button>}
                <button type="button" onClick={() => dispatch({ type: 'edit_company_year' })} style={secondary}>{KEEP_COPY.changeCompanyYear}</button>
              </div>
            ) : (
              <form onSubmit={saveUnder}>
                <label htmlFor="keep-alt-company" style={label}>Company</label>
                <input id="keep-alt-company" value={altCompany} onChange={e => setAltCompany(e.target.value)} style={input} />
                <label htmlFor="keep-alt-year" style={label}>Reporting year</label>
                <select id="keep-alt-year" value={altYear} onChange={e => setAltYear(Number(e.target.value))} style={input}>
                  {reportingYearOptions().map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button type="submit" disabled={!altCompany.trim()} style={primary}>Save</button>
              </form>
            )}
          </div>
        )}

        {state.step === 'done' && <p role="status" style={para}>{state.freeTier ? KEEP_COPY.savedFree : KEEP_COPY.savedPlan}</p>}

        {state.step === 'error' && (
          <div>
            <p role="alert" style={errorText}>{state.message}</p>
            <button type="button" onClick={() => { void claim() }} style={primary}>Try again</button>
          </div>
        )}

        {/* Mounted for the form and the code steps alike: "Send a new code" needs a fresh token too. */}
        {showWidget && <div style={{ marginTop: 12 }}><Turnstile onToken={onToken} resetKey={captchaReset} /></div>}
      </div>
    </div>
  )
}

const para = { fontSize: 14, color: '#0d0d0d', lineHeight: 1.6, margin: '0 0 12px' } as const
const small = { fontSize: 12, color: '#555553', lineHeight: 1.6, margin: '10px 0 0' } as const
const label = { display: 'block', fontSize: 12, fontWeight: 600, color: '#0d0d0d', margin: '10px 0 4px' } as const
// 16px text: iOS zooms the page into any field with smaller text, which would push the modal off a phone screen.
const input = { width: '100%', boxSizing: 'border-box', fontSize: 16, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #888784', background: '#fff', color: '#0d0d0d' } as const
const primary = { width: '100%', marginTop: 14, fontSize: 14, fontWeight: 600, padding: '12px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-brand)', color: 'var(--color-on-dark)' } as const
const secondary = { width: '100%', marginTop: 10, fontSize: 14, fontWeight: 600, padding: '11px 18px', borderRadius: 10, cursor: 'pointer', background: 'none', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)' } as const
const textButton = { fontSize: 13, fontWeight: 600, padding: '6px 0', background: 'none', border: 'none', color: 'var(--color-brand)', cursor: 'pointer', textDecoration: 'underline' } as const
const errorText = { fontSize: 13, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '8px 10px', margin: '12px 0 0', lineHeight: 1.5 } as const
const link = { color: 'var(--color-brand)' } as const
const choices = { display: 'flex', flexDirection: 'column' as const }
