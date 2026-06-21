'use client'

/**
 * GHG multi-year trends — VERIFICATION SCAFFOLD (Phase 1 skeleton).
 * Calls loadCompanySeries() and dumps the assembled result as raw JSON so we can
 * confirm the data assembles correctly (grouping by company_id, year order,
 * baseline/YoY/vs-baseline, mixed Scope 3) BEFORE building charts on top.
 *
 * 'use client' is required: the loader uses the browser supabase singleton and
 * relies on the user's auth session for RLS. A server component would see no
 * session and RLS would filter everything out.
 *
 * This is the real route (/dashboard/ghg/trends), gated on the ghg entitlement.
 * Phase 2 replaces the <pre> JSON dump with actual trend visuals.
 */

import { useEffect, useState } from 'react'
import { loadCompanySeries, type LoadSeriesResult } from '../../../../lib/ghg/loadSeries'
import { useEntitlement } from '../../../../lib/useEntitlement'

export default function TrendsPage() {
  const isPaid = useEntitlement('ghg')
  const [result, setResult] = useState<LoadSeriesResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCompanySeries().then((r) => {
      setResult(r)
      setLoading(false)
    })
  }, [])

  if (!isPaid) {
    return (
      <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Georgia, serif' }}>GHG Trends</h1>
        <p>This view requires the GHG module. Visit Pricing to unlock it.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Georgia, serif', marginBottom: 4 }}>
        GHG Trends — verification
      </h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Raw assembled series (Phase 1 scaffold). Charts replace this next.
      </p>

      {loading && <p>Loading…</p>}

      {!loading && result?.error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '1rem', color: '#991B1B' }}>
          <strong>Load error:</strong> {result.error}
        </div>
      )}

      {!loading && result && !result.error && (
        <>
          <p style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>{result.series.length}</strong> compan
            {result.series.length === 1 ? 'y' : 'ies'} ·{' '}
            <strong>{result.skippedUnlinked}</strong> unlinked row(s) skipped
          </p>
          <pre
            style={{
              background: '#0f172a',
              color: '#e2e8f0',
              padding: '1rem',
              borderRadius: 8,
              fontSize: 12,
              overflow: 'auto',
              maxHeight: '70vh',
            }}
          >
            {JSON.stringify(result.series, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}
