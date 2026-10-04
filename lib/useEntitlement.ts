import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { CONCIERGE_ENTITLEMENT_KEYS, type ModuleKey } from './pricing'

// ONE READ, THREE SHAPES. useEntitlementAccess is the implementation; useEntitlementState and
// useEntitlement below are projections of it, progressively lossier. Reach for the least lossy
// form a surface can use — every one of the defects recorded in this file came from a surface
// being handed less than it needed to say the right thing.

// The access states and their derivation live in ./entitlementAccess (no imports, so server routes can use the same
// rule) and are re-exported here unchanged for every existing caller.
import { accessFromRow, type EntitlementAccess } from './entitlementAccess'
export { accessFromRow }
export type { EntitlementAccess, ResolvedAccess, EntitlementTermRow, EntitlementRead } from './entitlementAccess'

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
// exists" and that is what every caller of this projection is written against. Changing it to
// mean "active" would silently start walling lapsed customers across every surface that reads it,
// with copy written for people who never purchased. REACH FOR useEntitlementAccess IN ANYTHING THAT
// NEEDS TO TELL EXPIRED FROM NEVER-BOUGHT; migrating the existing callers is its own task.
export function useEntitlementState(moduleKey: ModuleKey): { isPaid: boolean; loading: boolean } {
  const access = useEntitlementAccess(moduleKey)
  return {
    isPaid: access === 'active' || access === 'expired',
    loading: access === 'loading',
  }
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
        .in('module_key', CONCIERGE_ENTITLEMENT_KEYS)
        // ⚠️ TERM-AWARE SINCE 28 Sep 2026, AND IT WAS NOT BEFORE. This returned true for an
        // EXPIRED Concierge row, so a customer whose term had ended kept bill extraction
        // indefinitely: no error, no symptom, just access that outlived the payment. The GHG check
        // has always compared term_end. This one simply never did.
        // Same comparison enforce_ghg_location_allowance() makes in Postgres, and the same one the
        // server route makes in app/api/concierge/extract/route.ts.
        // ⚠️ NOT THE SAME QUESTION AS isFirstConciergePurchase, which is deliberately NOT term-aware:
        // an expired customer has no access, but has still been billed for onboarding once.
        .gt('term_end', new Date().toISOString())
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

// FI0: useGhgLocationAllowance is removed. Locations are unlimited on every plan, so there is no ceiling
// for the wizard to read.
