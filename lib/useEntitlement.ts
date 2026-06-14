import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import type { ModuleKey } from './pricing'

export function useEntitlement(moduleKey: ModuleKey): boolean {
  const [isPaid, setIsPaid] = useState(false)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        if (!cancelled) setIsPaid(false)
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
        return
      }
      setIsPaid(!!data)
    })

    return () => {
      cancelled = true
    }
  }, [moduleKey])

  return isPaid
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
