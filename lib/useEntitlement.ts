import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import type { ModuleKey } from './pricing'

// ONE READ, THREE SHAPES. useEntitlementAccess is the implementation; useEntitlementState and
// useEntitlement below are projections of it, progressively lossier. Reach for the least lossy
// form a surface can use — every one of the defects recorded in this file came from a surface
// being handed less than it needed to say the right thing.

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

// ⚠️ ADVISORY, NOT ENFORCEMENT, AND THE COMPARISON IS THE CLIENT'S CLOCK. The `now` handed to
// accessFromRow below is the browser's, and the customer controls it. The authority is
// enforce_ghg_location_allowance() / enforce_deals_free_tier_cap(), which compare against the
// database's now() inside a SECURITY DEFINER trigger. This hook exists to EXPLAIN the refusal
// early, never to be the thing that refuses. A skewed clock changes what someone is told, not
// what they can do.
//
// It is also a SNAPSHOT: the read happens once per mount, so a term that lapses while the tab is
// open goes on reading 'active' until something remounts. Same conclusion — the trigger is what
// actually decides, and it re-decides on every write.
export function useEntitlementAccess(moduleKey: ModuleKey): EntitlementAccess {
  const [access, setAccess] = useState<EntitlementAccess>('loading')

  useEffect(() => {
    let cancelled = false
    // A module key change re-opens the question: the previous answer is about a different
    // module, so it must not be readable as this one's while the new read is in flight.
    setAccess('loading')

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        // Signed out is genuinely "no entitlement", not a failed read — so it goes through the
        // same derivation as a signed-in user with no row, rather than short-circuiting to a
        // literal here. One definition, including for the trivial cases.
        if (!cancelled) setAccess(accessFromRow({ ok: true, row: null }, new Date()))
        return
      }

      const { data, error } = await supabase
        .from('entitlements')
        .select('module_key, term_end')
        .eq('module_key', moduleKey)
        .maybeSingle()

      if (cancelled) return
      if (error) console.error('[useEntitlementAccess] read failed:', error.message)
      const next = accessFromRow(error ? { ok: false } : { ok: true, row: data }, new Date())
      // term_end is NOT NULL in the schema, so 'unknown' from a row that came back means the
      // column arrived missing or unparseable — worth a line in the console, since the schema
      // says it cannot happen.
      if (!error && data && next === 'unknown') {
        console.error('[useEntitlementAccess] unreadable term_end for', moduleKey)
      }
      setAccess(next)
    })

    return () => {
      cancelled = true
    }
  }, [moduleKey])

  return access
}

// Entitlement WITH its resolution state, shaped like useGhgLocationAllowance below — same
// { value, loading } contract, same reason for it.
//
// WHY `loading` EXISTS. `isPaid` starts false and resolves asynchronously, so a caller that
// renders a paywall from the bare boolean SHOWS THE PAYWALL TO A PAYING CUSTOMER ON EVERY LOAD
// and then removes it. /dashboard/deals/list did exactly that. A wall that appears and then
// disappears is worse than a late wall: it tells a customer they have lost access they have not
// lost, and it is indistinguishable from a real entitlement failure.
//
// FAILS CLOSED, DELIBERATELY, AND `loading` DOES NOT CHANGE THAT. On a read error the hook
// still resolves to `isPaid: false` with `loading: false` — a caller must not treat "we could
// not read your entitlement" as access. What `loading` buys is the right to say nothing YET,
// not the right to assume yes.
//
// A PROJECTION OF useEntitlementAccess, not a second query — same reason useEntitlement is a
// projection of this: two implementations of "does this customer hold X" will eventually answer
// differently.
//
// ⚠️ TERM-BLIND BY CONTRACT. `isPaid` is TRUE for an expired customer, because it means "a row
// exists" and that is exactly what its seventeen callers were written against. Changing it to
// mean "active" would silently start walling lapsed customers on seventeen surfaces at once, with
// copy written for people who never purchased. REACH FOR useEntitlementAccess IN ANYTHING THAT
// NEEDS TO TELL EXPIRED FROM NEVER-BOUGHT; migrating the existing callers is its own task.
export function useEntitlementState(moduleKey: ModuleKey): { isPaid: boolean; loading: boolean } {
  const access = useEntitlementAccess(moduleKey)
  return {
    isPaid: access === 'active' || access === 'expired',
    loading: access === 'loading',
  }
}

// Boolean form. ONE fetch implementation — this is a projection of the hook above, not a second
// copy of the query, so the two can never answer differently.
//
// ⚠️ THIS FORM CANNOT TELL "not entitled" FROM "not yet known", and every caller that renders a
// wall from it will flash that wall at a paying customer. It is kept because seventeen callers
// read it and changing their behaviour is not in scope here. REACH FOR useEntitlementState IN
// ANYTHING THAT GATES A RENDER.
export function useEntitlement(moduleKey: ModuleKey): boolean {
  return useEntitlementState(moduleKey).isPaid
}
// Concierge is sold as three tier-specific add-on entitlements
// (concierge-basic / -standard / -enterprise). The wizard only needs to know
// whether the customer holds ANY of them, so this checks for any matching row.
export function useHasConcierge(): boolean {
  const [hasConcierge, setHasConcierge] = useState(false)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) setHasConcierge(false)
        return
      }
      const { data, error } = await supabase
        .from('entitlements')
        .select('module_key')
        .in('module_key', ['concierge-basic', 'concierge-standard', 'concierge-enterprise'])
        .limit(1)
      if (cancelled) return
      if (error) {
        console.error('[useHasConcierge] read failed:', error.message)
        setHasConcierge(false)
        return
      }
      setHasConcierge(!!data && data.length > 0)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return hasConcierge
}

// GHG location allowance (spec: Model A hard enforcement). Reads the integer
// ceiling written onto the customer's ghg entitlement row at checkout.
// null = uncapped (pre-migration customers or sales-managed 20+ "contact us").
// `loading` lets the wall avoid blocking while the value is still being fetched.
export function useGhgLocationAllowance(): { allowance: number | null; loading: boolean } {
  const [allowance, setAllowance] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) { setAllowance(null); setLoading(false) }
        return
      }
      const { data, error } = await supabase
        .from('entitlements')
        .select('location_allowance')
        .eq('module_key', 'ghg')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (cancelled) return
      if (error) {
        console.error('[useGhgLocationAllowance] read failed:', error.message)
        setAllowance(null); setLoading(false)
        return
      }
      setAllowance(data?.location_allowance ?? null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])
  return { allowance, loading }
}
