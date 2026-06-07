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
