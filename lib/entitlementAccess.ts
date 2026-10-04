// lib/entitlementAccess.ts
//
// THE TERM DERIVATION, WITH NO IMPORTS (L0, Oct 2026). Moved here from lib/useEntitlement.ts, which re-exports it
// unchanged, so a server route can decide 'active' versus 'expired' by the same rule without loading React or the
// browser Supabase client. /api/ghg-bot is the first server reader (ENF2). One copy still: the hook and the route
// both call accessFromRow.

// WHAT THE ROW ACTUALLY SAYS, in the states a surface has to tell apart.
//
//   'loading'  — not answered yet. Say nothing.
//   'active'   — a row, and its term has not run out.
//   'expired'  — a row, and its term HAS run out. The customer bought this; they did not buy it
//                recently enough. Telling them to purchase it would be wrong.
//   'none'     — no row. Never purchased.
//   'unknown'  — the read failed. NOT a synonym for 'none': we do not know, and a surface must
//                say so rather than name a cause it cannot verify. Treated as no-access
//                everywhere, so it fails closed, but it must never render "purchase this module".
//
// Three of these are entitlement facts; 'loading' and 'unknown' are facts about the read. Both
// are here rather than collapsed because collapsing them is how a paying customer gets shown a
// paywall — first on every load ('loading' read as false), then on every hiccup ('unknown' read
// as 'none').
export type EntitlementAccess = 'loading' | 'active' | 'expired' | 'none' | 'unknown'

// Everything the derivation can be told, and no more. `loading` is absent by construction: it is
// a fact about the component, not about the read, so it cannot be an OUTPUT here.
export type ResolvedAccess = Exclude<EntitlementAccess, 'loading'>

// Only the column the derivation reads. Deliberately not the whole row — nothing else about an
// entitlement decides whether it is live, and accepting more would invite something else to.
export type EntitlementTermRow = { term_end?: string | null } | null | undefined

// A completed read: either it came back (with a row or without one), or it failed. The failure is
// part of the INPUT rather than handled at the call site, because 'unknown' has to be produced by
// the same function as the rest — split them and one caller eventually maps its error to 'none'.
export type EntitlementRead =
  | { ok: true; row: EntitlementTermRow }
  | { ok: false }

// THE DERIVATION, AND THE ONLY COPY OF IT. Pure, and takes `now` rather than reaching for
// Date.now(), so a test can pin the clock and so the caller has to be explicit about which clock
// it is using — which matters, because it is the wrong one (see the ⚠️ below).
//
//   read failed            → 'unknown'   we do not know; say so, never guess a cause
//   no row                 → 'none'      never purchased
//   term_end missing/junk  → 'unknown'   a row exists but cannot be read. NOT 'active' — absence
//                                        must never grant, which is the polarity trap that let
//                                        unpaid users save unlimited GHG locations. NOT 'expired'
//                                        either: that asserts a term ran out, and none was read.
//   term_end > now         → 'active'
//   otherwise              → 'expired'
//
// STRICTLY GREATER, MATCHING THE TRIGGERS. Both enforce_ghg_location_allowance() and
// enforce_deals_free_tier_cap() test `e.term_end > now()`, so a term ending exactly now is OVER
// on the server. `>=` here would call that instant 'active' and disagree with the database about
// a boundary the customer is standing on.
export function accessFromRow(read: EntitlementRead, now: Date): ResolvedAccess {
  if (!read.ok) return 'unknown'
  if (!read.row) return 'none'
  const raw = read.row.term_end
  if (raw == null) return 'unknown'
  const end = new Date(raw)
  if (Number.isNaN(end.getTime())) return 'unknown'
  return end.getTime() > now.getTime() ? 'active' : 'expired'
}
