import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import type { ModuleKey } from './pricing'

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
export function useEntitlementState(moduleKey: ModuleKey): { isPaid: boolean; loading: boolean } {
  const [isPaid, setIsPaid] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // A module key change re-opens the question: the previous answer is about a different
    // module, so it must not be readable as this one's while the new read is in flight.
    setLoading(true)

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) { setIsPaid(false); setLoading(false) }
        return
      }

      const { data, error } = await supabase
        .from('entitlements')
        .select('module_key')
        .eq('module_key', moduleKey)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        console.error('[useEntitlement] read failed:', error.message)
        setIsPaid(false)
        setLoading(false)
        return
      }
      setIsPaid(!!data)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [moduleKey])

  return { isPaid, loading }
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
