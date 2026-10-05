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

import { DRAFT_KEYS, readDraft, readDraftWithOwner, saveDraft, clearDraft, ANON_TTL_MS } from '../drafts'

// The draft's shape and parser live in ./draftParse (no imports, so server routes can parse a draft too) and are
// re-exported here unchanged for every existing caller.
import { parseGhgDraft, type GhgDraft } from './draftParse'
export { parseGhgDraft }
export type { GhgDraft }

/** Stash before bouncing to /login. Swallows a disabled localStorage, as lib/drafts.ts does. */
export function saveGhgDraft(inventory: unknown, opts: { anon: boolean; owner?: string | null }): void {
  saveDraft(DRAFT_KEYS.ghg, inventory, opts)
}

/** The draft and who wrote it (lib/drafts.ts readDraftWithOwner), or null. */
export function readGhgDraftOwned(): { draft: GhgDraft; owner: string | null | undefined } | null {
  const r = readDraftWithOwner(DRAFT_KEYS.ghg, parseGhgDraft)
  return r ? { draft: r.value, owner: r.owner } : null
}

/**
 * ⚠️ A DRAFT WRITTEN BY ONE ACCOUNT IS NOT RESTORED UNDER ANOTHER (5 Oct 2026). A browser used for several accounts
 * (testing, or a shared computer) kept one account's figures and restored them into the next one's form. A draft that
 * names its writer is restored only for that same user. Written signed out (null), or before owners were kept
 * (undefined): restored as before; such a draft carries no company_id (lib/ghg/draftParse.ts), so nothing in it is
 * tied to an account.
 */
export function draftBelongsTo(owner: string | null | undefined, sessionUserId: string | null): boolean {
  if (owner === null || owner === undefined) return true
  return owner === sessionUserId
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
