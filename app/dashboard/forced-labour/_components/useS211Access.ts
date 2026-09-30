'use client'

// app/dashboard/forced-labour/_components/useS211Access.ts
// The one read of /api/s211/access a builder page makes. In its own module so a test can stand in for it
// and render each of the four states without a network (app/dashboard/forced-labour/pageStates.test.tsx).

import { useEffect, useState } from 'react'
import { s211Api } from '../../../../lib/s211/client'
import { stateFromAccessReply, type BuilderState } from '../../../../lib/s211/builderAccess'

export function useS211Access(): BuilderState {
  const [a, setA] = useState<BuilderState>('loading')
  useEffect(() => {
    let live = true
    void s211Api<{ state: string }>('/access').then(r => {
      if (live) setA(stateFromAccessReply(r.status, r.data ?? (r.state ? { state: r.state } : null)))
    })
    return () => { live = false }
  }, [])
  return a
}
