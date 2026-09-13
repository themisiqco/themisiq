// lib/drafts.ts
//
// ── KEEPING A CALCULATOR'S WORK ACROSS A SIGNUP ─────────────────────────────────────────────────
//
// Four dashboard tools — supply chain, people, AI governance, cyber — are pure client-side
// calculators. They read nothing and write nothing: no Supabase call, no fetch, no load effect.
// Everything a visitor types lives in React state until the tab closes, and the entitlement gates
// only the CSV download at the end. A signed-out visitor can therefore do the whole job, be shown
// a real result, click through to pricing, sign up, come back, and find an empty form.
//
// This module is the storage those four never had. It is deliberately NOT a general persistence
// layer: it holds one unsaved draft per tool, briefly, so the signup round trip does not cost the
// visitor their work.
//
// ⚠️ localStorage, NOT sessionStorage, AND THAT IS THE WHOLE REASON THIS FILE EXISTS SEPARATELY
// FROM lib/deals/draft.ts. Signup requires clicking a confirmation link in an email, which opens a
// NEW TAB. sessionStorage is per-tab, so it would be empty on exactly the journey this supports.
// lib/deals/draft.ts chose sessionStorage for a different flow (a /login bounce in the same tab)
// and for a payload — a buyer's financial view of an acquisition target — that should not outlive
// the tab. That file stays as it is; this one is not a refactor of it.
//
// ⚠️ THE PRICE OF localStorage IS THAT A DRAFT OUTLIVES THE TAB, so it is time-limited on READ.
// Two of these tools hold material a browser should not sit on: salary by gender and headcount by
// band, and named suppliers with risk scores and spend. The expiry below is sized for a signup
// round trip and nothing longer.

import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

/** Bump when an envelope field changes meaning. A draft written by an older build is discarded. */
export const DRAFT_VERSION = 1

/** How long an ANONYMOUS draft lives. See shouldExpire() for why a signed-in draft does not. */
export const ANON_TTL_MS = 2 * 60 * 60 * 1000

export const DRAFT_KEYS = {
  supplyChain:  'themisiq:draft:supply-chain',
  people:       'themisiq:draft:people',
  aiGovernance: 'themisiq:draft:ai-governance',
  cyber:        'themisiq:draft:cyber',
} as const

// The envelope. `payload` is the tool's own inventory; everything beside it exists so a reader can
// decide whether to trust the payload without parsing it first.
//
// `anon` IS RECORDED AT WRITE TIME, AND THAT IS WHAT KEEPS THE READ SYNCHRONOUS. The restore runs
// inside a useState lazy initialiser, which cannot await; supabase.auth.getSession() is async, so
// asking "is this visitor signed in?" during a restore is not possible without blocking. Asking it
// at SAVE time is trivial — the answer is stamped into the draft and the reader just reads it.
// So the restore path needs no session check at all.
type Envelope<T> = { v: number; savedAt: number; anon: boolean; payload: T }

function isEnvelope(u: unknown): u is Envelope<unknown> {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return false
  const o = u as Record<string, unknown>
  return o.v === DRAFT_VERSION
    && typeof o.savedAt === 'number' && Number.isFinite(o.savedAt)
    && typeof o.anon === 'boolean'
    && o.payload !== undefined
}

// EXPIRY IS A PROPERTY OF THE DRAFT, NOT OF THE READER. A draft written while signed out expires
// two hours later whoever opens it — including the same person one minute after they signed up,
// because the two-hour window is sized for that exact round trip and a longer life for sensitive
// content is what it is guarding against. A draft written while signed in does not expire here;
// that is a customer's own working state and its lifetime is a separate product decision.
//
// A clock that moves backwards produces a negative age, which is not expiry. Only a positive age
// past the limit counts, so a timezone change or an NTP correction cannot resurrect a stale draft
// OR discard a fresh one.
function shouldExpire(env: Envelope<unknown>, now: number): boolean {
  if (!env.anon) return false
  const age = now - env.savedAt
  return age > ANON_TTL_MS
}

/**
 * Read, validate and return a draft. Does NOT remove it — see the note on clearDraft.
 * `validate` is the tool's own parser: it receives whatever was stored and returns either a value
 * this build can use or null. It must not trust its input.
 */
export function readDraft<T>(key: string, validate: (u: unknown) => T | null, now = Date.now()): T | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return null // storage disabled or blocked; the form comes back empty, which is recoverable
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isEnvelope(parsed)) return null
  if (shouldExpire(parsed, now)) return null
  return validate(parsed.payload)
}

/** Write a draft, stamped with the version, the time, and whether the writer was signed out. */
export function saveDraft<T>(key: string, payload: T, opts: { anon: boolean }, now = Date.now()): void {
  if (typeof window === 'undefined') return
  const env: Envelope<T> = { v: DRAFT_VERSION, savedAt: now, anon: opts.anon, payload }
  try {
    localStorage.setItem(key, JSON.stringify(env))
  } catch {
    // Quota exceeded, or storage disabled. Losing a draft is recoverable and silent is the right
    // failure here: there is nothing the visitor could do about it mid-form, and an alert over a
    // calculator they are still filling in would be worse than the loss.
  }
}

export function clearDraft(key: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(key)
  } catch {
    /* nothing to do */
  }
}

// ── THE STRICTMODE TRAP, AND WHY READ AND REMOVE ARE SEPARATE HERE ──────────────────────────────
//
// lib/deals/draft.ts reads and removes in ONE call, so no path can restore a draft and leave it
// behind. That is right for its caller, which reads from an event handler. It is wrong for a
// useState LAZY INITIALISER, which is where these four must restore — a useEffect would paint the
// empty form first, let the visitor start typing, and then overwrite what they typed.
//
// React StrictMode invokes a lazy initialiser TWICE in development to surface impure ones. A
// read-and-remove initialiser is impure by construction: the first call consumes the draft, the
// second finds nothing. Which return value React keeps is an implementation detail nobody should
// be depending on, so the fix is not to find out — it is to make the read idempotent.
//
// So: readDraft() is pure and repeatable, and removal happens once, in a mount effect. Both
// invocations see the same draft; removal is idempotent; a later mount finds storage already
// empty and restores nothing. The read-and-remove GUARANTEE survives — a draft is consumed exactly
// once — it is just spread across the render and the commit rather than crammed into the render.
//
// `enabled` exists for the moment a tool gains server-side persistence. Once work is saved to a
// row the draft is no longer the record of it, and continuing to autosave would leave a stale copy
// in localStorage that could later be restored over a register the customer has since edited
// elsewhere. Pass false from the point the row exists; the clear-on-mount below still runs, so a
// draft that was restored is still consumed exactly once.
export function useDraftAutosave<T>(key: string, value: T, opts?: { enabled?: boolean }): void {
  const enabled = opts?.enabled ?? true
  const anonRef = useRef(true)   // assume signed out until told otherwise: the shorter life is the safe default
  const firstRun = useRef(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Consume the restored draft. Declared BEFORE the autosave effect so it runs first on mount;
  // the autosave effect skips its own first run, so this removal is not immediately undone.
  useEffect(() => {
    clearDraft(key)
  }, [key])

  // Resolve the session once. Nothing awaits this — until it lands, writes are stamped anonymous,
  // which only ever shortens a draft's life.
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) anonRef.current = !session
    }).catch(() => { /* treat an unreadable session as signed out */ })
    return () => { cancelled = true }
  }, [])

  // Autosave, debounced. The largest realistic payload here is a few hundred KB of suppliers, and
  // serialising that on every keystroke is waste nobody asked for.
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    if (!enabled) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => saveDraft(key, value, { anon: anonRef.current }), 400)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [key, value, enabled])
}
