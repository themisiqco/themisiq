'use client'

// app/dashboard/deals/list/page.tsx
// ThemisIQ — Deals: your saved targets.
//
// A standalone list route, NOT a mode inside the wizard. Following
// app/dashboard/reports/page.tsx: own chrome, own entitlement gate, own fetch.
//
// WHY A SEPARATE ROUTE. Opening a deal from here is a full page load, so the wizard
// re-mounts and every piece of its state is rebuilt from the URL. That matters most for the
// share link: the wizard holds dealToken and shareEnabled in component state, and a stale
// pair would let someone publish — or revoke — one target's findings from another target's
// screen. A re-mount makes that impossible structurally, rather than relying on a reset
// function staying correct as fields are added.
//
// This route also closes the gap where /dashboard/deals/report existed but nothing linked
// to it, so a generated report was unreachable once the tab was closed.

import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import Nav from '../../../components/Nav'
import PaywallCard from '../../../components/PaywallCard'
// useEntitlementAccess, NOT useEntitlementState: `isPaid` is TRUE for an expired customer by
// contract, so this list stayed open to someone whose term had run out while the trigger refused
// their next insert. The pipeline export below is a paid deliverable and must follow the term.
import { useEntitlementAccess } from '../../../../lib/useEntitlement'
import { exportPipelineXlsx, PIPELINE_SELECT, type PipelineDealRow } from '../../../../lib/deals/exportPipelineXlsx'

const GRAD = 'var(--color-brand)'

// Only the columns this list renders. Deliberately not select('*') — the wizard does that
// because it hydrates a whole form; a list has no use for notes, deal_value or the share token.
type DealRow = {
  id: string
  target_name: string | null
  sector: string | null
  jurisdiction: string | null
  frameworks: string[] | null
  updated_at: string
}

// Date AND time. Two unnamed deals edited the same afternoon are otherwise identical rows,
// and the timestamp is what tells them apart.
const fmtWhen = (s: string) => {
  try {
    return new Date(s).toLocaleString('en-CA', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return s }
}

// A nameless row is harder to identify than a nameless tile: the wizard's summary shows '—'
// because there is only one deal on screen, but a list of dashes tells you nothing. Name it
// honestly instead, and let the sector / jurisdiction / timestamp line do the identifying.
const displayName = (d: DealRow) => (d.target_name || '').trim() || 'Untitled deal'

// Show the count, then a few names. A UK financial-services target resolves eight frameworks,
// including "FCA climate disclosure (TCFD)" — the full list does not fit on a row, and a bare
// number does not help anyone find the target they mean.
const NAMES_SHOWN = 3
function frameworkSummary(frameworks: string[] | null): { count: number; text: string } {
  const list = Array.isArray(frameworks) ? frameworks.filter(Boolean) : []
  if (list.length === 0) return { count: 0, text: '' }
  const shown = list.slice(0, NAMES_SHOWN).join(', ')
  const rest = list.length - NAMES_SHOWN
  return { count: list.length, text: rest > 0 ? `${shown} +${rest} more` : shown }
}

export default function DealsListPage() {
  // The 'loading' arm is why this reads the access form rather than a bare boolean: `isPaid` starts
  // false, so rendering the paywall from it showed the wall to EVERY paying customer on EVERY load
  // and then removed it. The wall still fires on a resolved answer — only the flash is gone.
  //
  // ⚠️ ONLY 'active' OPENS THIS PAGE. 'expired', 'none' and 'unknown' all wall: the first because
  // the term ran out, the second because it was never bought, the third because a failed read must
  // fail closed. They share one wall here — this page has no per-population copy and inventing some
  // was not in scope — but the CAP wall in the wizard does distinguish them, which is where a
  // lapsed customer is told what actually happened.
  const access = useEntitlementAccess('deals')
  const entLoading = access === 'loading'
  const isPaid = access === 'active'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<DealRow[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setError('Please sign in to see your deals.'); setLoading(false); return }
      // Owner-scoped explicitly as well as by RLS, matching the wizard's load: another user's
      // deal resolves to no row rather than to a forbidden error.
      const { data, error: err } = await supabase
        .from('deals')
        .select('id, target_name, sector, jurisdiction, frameworks, updated_at')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
      if (cancelled) return
      if (err) { setError(err.message || 'Could not load your deals.'); setLoading(false); return }
      setRows((data ?? []) as DealRow[])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Fetches its OWN wider row set rather than widening the list's select: the export needs every
  // figure the derivation consumes, and most page views never export. The busy state covers the
  // dynamic xlsx import as well as the query.
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  async function downloadPipeline() {
    setExporting(true)
    setExportError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setExportError('Please sign in to export.'); return }
      const { data, error: err } = await supabase
        .from('deals')
        .select(PIPELINE_SELECT)
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
      if (err) { setExportError(err.message || 'Could not build the spreadsheet.'); return }
      const deals = (data ?? []) as unknown as PipelineDealRow[]
      if (deals.length === 0) { setExportError('There are no targets to export yet.'); return }
      // ONE instant, shared by the filename and the date inside the file.
      await exportPipelineXlsx({ deals, generatedAt: new Date() })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Could not build the spreadsheet.')
    } finally {
      setExporting(false)
    }
  }

  // Ordered before the paywall: an unresolved entitlement is not a refusal. The page's own
  // "Loading your deals…" state is already the right shape for waiting, so nothing new appears.
  if (entLoading) return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#888784', fontSize: 13 }}>
          Loading your deals…
        </div>
      </div>
    </div>
  )
  if (!isPaid) return (
    <PaywallCard
      title="Unlock the Deals module"
      body="Screen a target's ESG risk, work out which reporting rules apply to it, and produce a diligence report for your investment committee."
      href="/pricing?modules=deals"
    />
  )

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Deals &amp; Investment</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Your targets</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Hidden until there is something to export — an export button on an empty list
                promises a file it cannot produce. */}
            {rows.length > 0 && (
              <button onClick={downloadPipeline} disabled={exporting} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#fff', border: '1px solid #e8e7e4', color: exporting ? '#888784' : '#0d0d0d', cursor: exporting ? 'wait' : 'pointer' }}>
                {exporting ? 'Building spreadsheet…' : '↓ Export all targets (Excel)'}
              </button>
            )}
            {/* A plain link, not a button that resets state. Loading /dashboard/deals with no id
                starts a blank deal, and the page load is what clears the previous one. */}
            <a href="/dashboard/deals" style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', textDecoration: 'none' }}>
              + New deal
            </a>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>

        {exportError && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem 1.25rem', fontSize: 13, color: '#B91C1C', marginBottom: 16 }}>
            {exportError}
          </div>
        )}

        {loading && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '3rem', textAlign: 'center', color: '#888784', fontSize: 13 }}>
            Loading your deals…
          </div>
        )}

        {!loading && error && (
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1.25rem', fontSize: 13, color: '#B91C1C' }}>
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '3rem 2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.1rem', color: '#0d0d0d', marginBottom: 8 }}>No deals yet</div>
            <p style={{ fontSize: 13, color: '#888784', lineHeight: 1.6, maxWidth: 460, margin: '0 auto 20px' }}>
              Start a deal to screen a target company: tell us its sector, where it operates and how big it is,
              and you&rsquo;ll get the ESG risks to raise, the reporting rules that apply to it, and an estimate
              of what compliance would cost. Each target you screen is saved here so you can come back to it.
            </p>
            <a href="/dashboard/deals" style={{ display: 'inline-block', fontSize: 13, fontWeight: 500, padding: '11px 24px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', textDecoration: 'none' }}>
              Screen your first target →
            </a>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <>
            {/* The two links do different things, so say which is which once, here, rather than
                loading the distinction into a link label. */}
            <p style={{ fontSize: 13, color: '#888784', lineHeight: 1.6, marginBottom: 16 }}>
              {rows.length} {rows.length === 1 ? 'target' : 'targets'}. Open a target by name to keep working on it.
              View report opens the finished document, ready to print or save as a PDF.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rows.map(d => {
                const fw = frameworkSummary(d.frameworks)
                const meta = [d.sector, d.jurisdiction].filter(Boolean).join(' · ')
                return (
                  <div key={d.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 14, padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={`/dashboard/deals?id=${d.id}`} style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d', textDecoration: 'none' }}>
                        {displayName(d)}
                      </a>
                      <div style={{ fontSize: 12, color: '#888784', marginTop: 4 }}>
                        {meta && <>{meta} · </>}
                        {fw.count > 0
                          ? <>{fw.count} {fw.count === 1 ? 'rule applies' : 'rules apply'} · </>
                          : <>No reporting rules worked out yet · </>}
                        Updated {fmtWhen(d.updated_at)}
                      </div>
                      {fw.text && (
                        <div style={{ fontSize: 11, color: '#555553', marginTop: 4, lineHeight: 1.5 }}>{fw.text}</div>
                      )}
                    </div>
                    {/* New tab: the report is a document to read or print, not the next step in
                        the wizard, and opening it should not lose the list. */}
                    <a href={`/dashboard/deals/report?id=${d.id}`} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      View report →
                    </a>
                  </div>
                )
              })}
            </div>
            {/* The rules shown per row are the ones saved with the deal. Opening a target
                re-works them out from the figures, so a row can lag the deal it points at. */}
            <p style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 16 }}>
              The rules listed against each target are the ones saved when you last worked on it.
              Opening a target works them out again from its current figures.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
