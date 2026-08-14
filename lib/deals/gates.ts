// lib/deals/gates.ts
//
// ── THE DEALS ACCESS GATES, AS PURE FUNCTIONS. THE PAGES RENDER THIS OUTPUT AND HOLD NO SECOND
//    COPY OF THE RULE. ───────────────────────────────────────────────────────────────────────────
//
// Three surfaces gate on the same two facts — does this user hold a live Deals entitlement, and is
// this the one deal their free tier covers — and until now each decided it inline, in a component,
// in a repo with no DOM harness. That combination is why the rules drifted: nothing could test them,
// so the only way to know what a page did was to read it, and two of the three had already stopped
// agreeing (see the stale claim in app/dashboard/deals/page.tsx that the report is "FULLY WALLED",
// which report/page.tsx contradicts by design). Extracting the decision is what makes the five gate
// states assertable at all.
//
// ⚠️ PURE. No React, no Supabase, no clock, no sessionStorage. Every input is passed in, including
// the entitlement access token, so a test can drive all five states directly. The pages fetch; this
// decides; the pages render. A page that re-derives any branch below has reintroduced the drift.
//
// ⚠️ ADVISORY, NOT ENFORCEMENT — the same standing caveat lib/useEntitlement.ts carries. The
// authority for the one-free-deal rule is enforce_deals_free_tier_cap(), a SECURITY DEFINER trigger
// comparing against the DATABASE's now(); everything here runs on the customer's own clock and can
// be skewed by them. This exists to EXPLAIN a refusal before they hit it, never to be the refusal.
// Nothing below may become the only thing standing between a user and a second saved deal.

import type { EntitlementAccess } from '../useEntitlement'

// ── THE SESSION FACT, SEPARATE FROM THE ENTITLEMENT FACT ────────────────────────────────────────
//
// THEY LOOK THE SAME AND ARE NOT. useEntitlementAccess resolves a signed-out visitor to 'none' —
// deliberately, through one derivation, because signed out IS "no entitlement". But it is NOT "no
// session", and the results gate turns on the second question, not the first: a signed-out visitor
// and a signed-in customer who has never purchased both read 'none', and only one of them should be
// asked to sign in.
//
// 'loading' IS NOT 'anon'. The wizard tracked the session as `userId: string | null` with no third
// state, so `!userId` was true on first paint for a signed-in user too — gating results on it would
// flash "sign in to see your results" at every returning customer before their session resolved.
// That is the same defect useEntitlementState's `loading` arm exists to prevent, one fact along.
export type SessionState = 'loading' | 'anon' | 'authed'

// ── DOES THIS USER ALREADY HOLD A SAVED DEAL ────────────────────────────────────────────────────
//
// Moved here from app/dashboard/deals/page.tsx so the wizard and this resolver cannot describe the
// same lookup two ways. Its reasoning is unchanged and still applies: a nullable row would carry
// THREE meanings in two states (not loaded, loaded-and-absent, loaded-and-present), and the 'saved'
// arm has to carry the id and name because the wall's only job is to hand the user back the deal
// they already own.
//
// ⚠️ THE 'none' ARM COVERS A SIGNED-OUT VISITOR, AND THAT IS CORRECT. It answers "has this visitor
// saved a deal we can see" — no — which is why the load effect resolves it rather than leaving it on
// 'loading' and hanging the page on a spinner forever. Do not add an 'anon' arm here; that is what
// SessionState above is for, and conflating them is what this split exists to prevent.
export type FreeTierDeal =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'saved'; id: string; name: string }

// ── WHY THE WALL IS UP ──────────────────────────────────────────────────────────────────────────
//
// THREE REASONS, BECAUSE THE CUSTOMER CAN ACT ON EACH DIFFERENTLY — and because the trigger already
// makes exactly this distinction in its two RAISE EXCEPTION messages. Telling a lapsed customer to
// "unlock the Deals module" invites them to buy something they already own; telling a free user to
// "renew" names a term they never had. The client said one of those two things to both populations
// for as long as its gate was term-blind.
//
//   'free-deal-used'  — no entitlement row ever. The original free-tier cap.
//   'expired'         — a row whose term has run out. They bought this; not recently enough.
//   'unknown'         — the entitlement read FAILED. Fails closed like every other consumer, but it
//                       must render NEITHER of the above: both assert a fact about their account
//                       that was not established. An error message that guesses at a cause it cannot
//                       verify eventually names the wrong one.
export type WallReason = 'free-deal-used' | 'expired' | 'unknown'

// ── THE WIZARD GATE ─────────────────────────────────────────────────────────────────────────────
//
// `results` IS A SEPARATE AXIS FROM `walled`, not a third wall state. A signed-out visitor may open
// the wizard and fill it in — the screening engine is pure and client-side and always has been — but
// must not READ the frameworks table, the near-threshold table, the threshold-limb table, the cost
// estimate or the data-room gaps until there is a session. The form is not the deliverable; those
// five blocks are.
export type WizardGate =
  | { kind: 'loading' }
  | { kind: 'walled'; reason: WallReason; dealId: string; dealName: string }
  | { kind: 'open'; results: 'shown' | 'hidden' }

export type WizardGateInput = {
  access: EntitlementAccess
  session: SessionState
  savedDeal: FreeTierDeal
  /** The ?id= on the URL, NOT the loaded deal's id. See the edit-exemption note below. */
  dealIdParam: string | null
}

/**
 * ENTITLED MEANS ACTIVE, NOT PRESENT.
 *
 * This is the whole of change 2. The trigger's first test is `e.term_end > now()`, so an expired row
 * grants nothing server-side; the client asked only whether a row EXISTED, so an expired customer
 * saw an unlocked screen and met the cap only when a save failed. `useEntitlementAccess` has
 * compared the term since it was written — with the same STRICT `>` — and it is
 * `useEntitlementState`'s `isPaid` projection that discards it, deliberately and by contract with
 * seventeen callers. So the fix is for Deals to read the richer hook, not for the projection to
 * change under the other fourteen surfaces.
 */
const isEntitled = (access: EntitlementAccess): boolean => access === 'active'

// Only reached once `access` is known not to be 'loading' or 'active'.
const wallReasonFor = (access: EntitlementAccess): WallReason =>
  access === 'expired' ? 'expired' : access === 'unknown' ? 'unknown' : 'free-deal-used'

export function resolveWizardGate(input: WizardGateInput): WizardGate {
  const { access, session, savedDeal, dealIdParam } = input

  // DECIDE NOTHING UNTIL EVERY FACT IS IN. Each of the three starts unresolved, so any branch that
  // reads one early is reading a default rather than an answer. Rendering the wizard and replacing
  // it with the wall is the worse failure — they may have typed into a form that then vanishes —
  // and rendering the wall first tells a paying customer they have lost access they have not.
  if (access === 'loading' || session === 'loading' || savedDeal.state === 'loading') {
    return { kind: 'loading' }
  }

  // ⚠️ THE ENTITLED CHECK COMES BEFORE THE SESSION CHECK, AND IT CANNOT MATTER — but the order is
  // stated rather than left to luck. 'active' is unreachable while signed out: useEntitlementAccess
  // routes a session-less read through accessFromRow({ ok: true, row: null }), which returns 'none'.
  // If that ever changes, an entitled-but-anonymous user should see results, not a sign-in prompt.
  if (isEntitled(access)) return { kind: 'open', results: 'shown' }

  // ── SIGNED OUT: THE FORM IS OPEN, THE RESULTS ARE NOT ────────────────────────────────────────
  // Checked BEFORE the wall, because a signed-out visitor has no saved deal for the wall to hand
  // back — `savedDeal` resolves to 'none' for them — so the wall could not fire here anyway. Stated
  // as its own branch so the reason is legible rather than emergent.
  if (session === 'anon') return { kind: 'open', results: 'hidden' }

  // ── THE FREE-TIER WALL ───────────────────────────────────────────────────────────────────────
  // `!dealIdParam` IS THE EDIT EXEMPTION, and it is what keeps the client agreeing with the
  // database. The trigger is BEFORE INSERT only, so an unentitled — including an EXPIRED — user's
  // UPDATEs are permitted server-side; walling the edit path would have the client enforce a
  // stricter rule than the thing that actually enforces. They saved it while it was allowed, and
  // they can still open and edit it. Keyed on the URL PARAM rather than the loaded deal's id so the
  // decision does not wait on a third async fact.
  if (savedDeal.state === 'saved' && !dealIdParam) {
    return { kind: 'walled', reason: wallReasonFor(access), dealId: savedDeal.id, dealName: savedDeal.name }
  }

  // Signed in, no live entitlement, and nothing saved yet — or editing what they already own. The
  // free deal is the point of the free tier: full results, full report, no wall.
  return { kind: 'open', results: 'shown' }
}

// ── THE REPORT GATE ─────────────────────────────────────────────────────────────────────────────
//
// `upsell` IS NOT A WALL. The free deal gets the COMPLETE report — that is what the free tier
// exists to demonstrate, and gating any part of it would make a screened deal produce nothing to
// take away. The upsell is appended at the foot of a report the reader is already reading.
//
// THREE VALUES, MATCHING WallReason's logic and for the same reason. 'none' covers both an entitled
// reader (nothing to sell) and an UNKNOWN one (we could not read whether they own it, so we must not
// ask them to buy it).
export type ReportUpsell = 'none' | 'expired' | 'never-purchased'

export type ReportGate =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'paywalled' }
  | { kind: 'open'; upsell: ReportUpsell }

export type ReportGateInput = {
  access: EntitlementAccess
  session: SessionState
  /** The id of the deal this user's free tier covers — newest by updated_at — or null if none. */
  freeTierDealId: string | null
  /** Null while the scope lookup is in flight. Distinct from a resolved `freeTierDealId: null`. */
  freeTierResolved: boolean
  /** The ?id= being requested. */
  requestedId: string | null
}

export function resolveReportGate(input: ReportGateInput): ReportGate {
  const { access, session, freeTierDealId, freeTierResolved, requestedId } = input

  // Same ordering rule as the wizard, and it matters more here: this page is PRINTED, so a paywall
  // flashing into a print preview is worse than one flashing on screen.
  if (access === 'loading' || session === 'loading' || !freeTierResolved) return { kind: 'loading' }
  if (session === 'anon') return { kind: 'signed-out' }

  if (isEntitled(access)) return { kind: 'open', upsell: 'none' }

  // THE FREE DEAL OPENS ITS REPORT — identity, not count. The reader may open THIS deal because it
  // is the one their free tier covers, not because they happen to have exactly one. That also
  // settles the lapsed case: a customer who saved several and then lapsed keeps the most recently
  // worked on. A deal that is not theirs cannot satisfy this — `freeTierDealId` is selected under
  // the owner filter AND under RLS, so a foreign id can never equal it.
  const freeDealAllowed = requestedId !== null && freeTierDealId !== null && freeTierDealId === requestedId
  if (!freeDealAllowed) return { kind: 'paywalled' }

  // An UNKNOWN read reaches here only if the id matches, so the reader demonstrably owns the deal.
  // They still get no upsell: 'unknown' means we do not know what they hold, and both other messages
  // assert something about their account that was never established.
  return { kind: 'open', upsell: access === 'expired' ? 'expired' : access === 'none' ? 'never-purchased' : 'none' }
}
