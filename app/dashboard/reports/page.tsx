'use client'

// app/dashboard/reports/page.tsx
// ThemisIQ — Saved reports / assessment history.
//
// Lists the signed-in user's saved assessments (read-only) and links each back
// to its report. Closes the "view-once" gap for EVERY module: a generated
// report row in materiality_assessments is now reachable again after the tab
// is closed, not only in the moment right after generation.
//
// Routes each row to the right report renderer by analysisType:
//   resilience -> /dashboard/climate-risk/report   (the climate-risk module report)
//   otherwise  -> /dashboard/materiality/report     (the CSRD / IFRS S2 report)
//
// Additive new file. Reaches /api/materiality/list (a new GET). Styled to match
// the existing dashboard tokens. Reachable at /dashboard/reports; a visible
// link from the dashboard home / nav can be wired separately.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import Nav from '../../components/Nav'

const GRAD = 'var(--color-brand)'

const SECTOR_LABEL: Record<string, string> = {
  energy: 'Energy & Utilities', finance: 'Financial Services', realestate: 'Real Estate',
  tech: 'Technology', health: 'Healthcare & Pharma', manuf: 'Industrials & Manufacturing',
  retail: 'Consumer & Retail', agri: 'Agriculture & Food', transport: 'Transport & Logistics',
  extract: 'Mining & Metals', construction: 'Construction & Materials',
  profservices: 'Professional Services', other: 'Other',
}

type Row = {
  id: string
  createdAt: string
  mode: 's2' | 'csrd'
  industryCode: string
  regionCount: number
  jurisdictionCount: number
  horizon: string
  scenarioCode: string
  modelVersion: string | null
  status: string
  companyName: string | null
  analysisType: string
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) { setError('Please sign in to view your reports.'); setLoading(false); return }
        const res = await fetch('/api/materiality/list', {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error || 'Failed to load reports.'); setLoading(false); return }
        setRows(json.assessments || []); setLoading(false)
      } catch (e: any) {
        setError(e?.message || 'Something went wrong.'); setLoading(false)
      }
    })()
  }, [])

  const reportHref = (r: Row) =>
    r.analysisType === 'resilience'
      ? `/dashboard/climate-risk/report?id=${r.id}`
      : `/dashboard/materiality/report?id=${r.id}`

  const modeLabel = (m: string) => m === 'csrd' ? 'CSRD / ESRS' : 'IFRS S2'
  const kindLabel = (r: Row) =>
    r.analysisType === 'resilience' ? 'Climate resilience'
      : r.mode === 'csrd' ? 'Double materiality' : 'Climate risk'
  const kindColor = (r: Row) =>
    r.analysisType === 'resilience' ? { bg: '#EDE9FE', color: '#7425e3' }
      : r.mode === 'csrd' ? { bg: '#E6F1FB', color: '#0C447C' } : { bg: '#E1F5EE', color: '#0F6E56' }
  const fmtDate = (s: string) => {
    try { return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return s }
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Your account</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Saved reports</div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {loading && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#888784', fontSize: 13 }}>
            Loading your reports…
          </div>
        )}

        {!loading && error && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1.25rem', fontSize: 13, color: '#B91C1C' }}>
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>No saved reports yet</div>
            <p style={{ fontSize: 13, color: '#888784', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 20px' }}>
              Run an assessment to generate your first report. Once generated, it will appear here so you can reopen or re-download it any time.
            </p>
            <a href="/dashboard/materiality" style={{ display: 'inline-block', fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', textDecoration: 'none' }}>
              Run an assessment →
            </a>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            <p style={{ fontSize: 13, color: '#888784', lineHeight: 1.6, marginBottom: 16 }}>
              {rows.length} saved {rows.length === 1 ? 'report' : 'reports'}. These reopen the full report exactly as generated — reopen to view or re-download as PDF.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(r => {
                const kc = kindColor(r)
                const title = r.companyName || SECTOR_LABEL[r.industryCode] || r.industryCode || 'Assessment'
                return (
                  <div key={r.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d' }}>{title}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: kc.bg, color: kc.color }}>{kindLabel(r)}</span>
                        {r.status && r.status !== 'complete' && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: '#FEF3E2', color: 'var(--color-module-climate)' }}>{String(r.status).toUpperCase()}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888784' }}>
                        {modeLabel(r.mode)} · {r.regionCount} region{r.regionCount === 1 ? '' : 's'} · {r.jurisdictionCount} jurisdiction{r.jurisdictionCount === 1 ? '' : 's'} · {r.horizon} term · {fmtDate(r.createdAt)}
                      </div>
                    </div>
                    <a href={reportHref(r)} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      View report →
                    </a>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
