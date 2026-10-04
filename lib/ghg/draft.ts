// lib/ghg/draft.ts
// ─────────────────────────────────────────────────────────────────────────────
// The signed-out GHG inventory draft: stash on Save, restore after sign-in.
//
// ⚠️ WHAT THIS FIXES. app/dashboard/ghg/page.tsx's handleSave read the session and returned SILENTLY
// when there was none — `if (!session) return`, with only setIsSaving(false) in its finally. A visitor
// who built a whole inventory and clicked Save saw the button flicker and nothing else: no prompt, no
// route to sign-in, and their work gone on the next navigation. Four other failure paths in that
// function alert; this one did not. Found on 26 Sep 2026 while checking whether a sentence promising
// "sign in when you save it" was true. It was not.
//
// ⚠️ localStorage, NOT sessionStorage, AND THAT IS A DELIBERATE DEPARTURE FROM lib/deals/draft.ts.
// That file chose sessionStorage because its payload is a named acquisition target with its financials
// — material that should not outlive the tab. An organisation's own emissions figures are not that
// case: they are the customer's own operating data, they are what the product exists to hold, and the
// sign-in round trip here may go through a NEW TAB (an email confirmation link) or take long enough
// that a tab gets closed. sessionStorage is per-tab and would be empty on exactly that journey, which
// is the same reasoning lib/drafts.ts gives for the four tools already using it. The 2-hour anonymous
// TTL in that module is what bounds the exposure.
//
// ⚠️ A WHITELIST MERGE, NOT A FIELD-BY-FIELD VALIDATOR, AND THE CHOICE IS ABOUT PROPORTION. `Inventory`
// in lib/ghg/engine.ts carries ~15 top-level fields plus a nested Location[] that is larger again, and
// enumerating every one here would be a second copy of that type — one that drifts the first time a
// field is added, and drifts SILENTLY because a missing branch drops data rather than erroring. So the
// shape is checked where the page indexes into it unconditionally, the recognised scalars are copied by
// type, and `locations` is carried only if it is a non-empty array of objects. Everything else falls
// back to the page's own defaults, because the caller merges this PARTIAL over them — never the
// reverse. Merging the other way would let a missing key blank a field the form had already defaulted.

import { DRAFT_KEYS, readDraft, saveDraft, clearDraft, ANON_TTL_MS } from '../drafts'

/** The fields a restore carries. All optional: the caller merges over its own defaults. */
export type GhgDraft = {
  company_name?: string
  company_id?: string | null
  reporting_year?: number
  revenue_millions?: number
  employee_count?: number
  boundary_approach?: string
  california_nexus?: boolean
  fiscal_year_end_month?: number
  prior_year_s1?: number
  prior_year_s2?: number
  selected_frameworks?: string[]
  // Typed as unknown[] on purpose: this module does not model a Location, and pretending to would be
  // the drifting second copy the note above rejects. The page spreads these over emptyLocation(), so a
  // location missing a field gets that field's default rather than undefined.
  locations?: unknown[]
}

/**
 * PURE, and exported separately from the storage calls so the parse is testable without a DOM.
 *
 * Returns null for anything that is not a usable draft, which the caller treats as "no draft".
 */
export function parseGhgDraft(u: unknown): GhgDraft | null {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const o = u as Record<string, unknown>

  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
  // Number(''), NaN and Infinity are rejected: the form coerces a blank to 0 and 0 is a real figure, so
  // a non-finite number here is corruption rather than emptiness.
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
  // NULL IS A VALUE HERE, NOT AN ABSENCE: company_id is nullable and "no company row yet" is a real
  // state the save path branches on. Collapsing it to undefined would let the merge restore a default.
  const nullableStr = (v: unknown): string | null | undefined =>
    v === null ? null : typeof v === 'string' ? v : undefined

  const draft: GhgDraft = {}
  const assign = <K extends keyof GhgDraft>(k: K, v: GhgDraft[K] | undefined) => {
    if (v !== undefined) draft[k] = v
  }

  assign('company_name', str(o.company_name))
  assign('company_id', nullableStr(o.company_id))
  assign('reporting_year', num(o.reporting_year))
  assign('revenue_millions', num(o.revenue_millions))
  assign('employee_count', num(o.employee_count))
  assign('boundary_approach', str(o.boundary_approach))
  assign('california_nexus', bool(o.california_nexus))
  assign('fiscal_year_end_month', num(o.fiscal_year_end_month))
  assign('prior_year_s1', num(o.prior_year_s1))
  assign('prior_year_s2', num(o.prior_year_s2))

  // Every member must be a string, or the row is dropped whole. A framework list with a number in it
  // would reach a `.includes()` on the wizard and silently fail to match rather than throw.
  if (Array.isArray(o.selected_frameworks) && o.selected_frameworks.every(f => typeof f === 'string')) {
    draft.selected_frameworks = o.selected_frameworks as string[]
  }

  // ⚠️ NON-EMPTY, AND EVERY MEMBER AN OBJECT. The page reads inventory.locations[activeLocation] and
  // indexes into the result on every render, so an empty array or an array of primitives is worse than
  // no draft at all: it would restore a wizard that throws on paint. An empty list is also never
  // something the form produces — it starts with one location and cannot delete the last.
  if (Array.isArray(o.locations) && o.locations.length > 0
      && o.locations.every(l => !!l && typeof l === 'object' && !Array.isArray(l))) {
    draft.locations = o.locations
  }

  // Nothing recognised ⇒ not a draft. Prevents an empty object restoring as "a draft with no fields",
  // which would clear the stash and report success while restoring nothing.
  return Object.keys(draft).length > 0 ? draft : null
}

/** Stash before bouncing to /login. Swallows a disabled localStorage, as lib/drafts.ts does. */
export function saveGhgDraft(inventory: unknown, opts: { anon: boolean }): void {
  saveDraft(DRAFT_KEYS.ghg, inventory, opts)
}

/** Read and validate. Returns null when absent, expired, from an older build, or unusable. */
export function readGhgDraft(): GhgDraft | null {
  return readDraft(DRAFT_KEYS.ghg, parseGhgDraft)
}

/**
 * ⚠️ CLEARED ON RESTORE, NOT ON SAVE. The draft's whole job is to survive the /login round trip; once
 * its contents are in React state it is redundant, and leaving it would restore stale figures over a
 * later edit on the next reload. Clearing it after a successful SAVE instead would leave it behind on
 * every journey where the save then failed.
 */
export function clearGhgDraft(): void {
  clearDraft(DRAFT_KEYS.ghg)
}

/**
 * What happens to the figures while a visitor goes to choose a plan, said as it actually is (free-claims,
 * Oct 2026). The draft lives in this browser's storage only; written signed out it expires after
 * ANON_TTL_MS, written signed in it does not expire here. "Kept while you choose a plan" alone promised
 * the signed-out visitor more than two hours in the same browser.
 */
export function draftKeptSentence(anon: boolean): string {
  const hours = ANON_TTL_MS / (60 * 60 * 1000)
  return anon
    ? `Your figures are kept in this browser for ${hours} hours while you choose a plan.`
    : 'Your figures are kept in this browser while you choose a plan.'
}
