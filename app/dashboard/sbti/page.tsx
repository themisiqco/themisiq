'use client'

import { useState, useEffect, useMemo } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlement } from '../../../lib/useEntitlement'
import PaywallCard from '../../components/PaywallCard'
import { categorize, type CategoryResult } from '../../../lib/sbti'
import { loadCompanySeries } from '../../../lib/ghg/loadSeries'

// ─── Design tokens (mirroring the climate-risk dashboard) ─────────────────────
const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 8 }

// ─── Input parsing: empty string → undefined (categorize treats missing as not-met) ──
const numOrU = (s: string): number | undefined => {
  const t = s.trim()
  if (t === '') return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}
const intOrU = (s: string): number | undefined => {
  const n = numOrU(s)
  return n === undefined ? undefined : Math.trunc(n)
}

// Human-readable basis derived from the engine's matchedRoute (render-only; never persisted).
const basisLabel = (r: CategoryResult['matchedRoute']): string => {
  switch (r) {
    case 'route1': return 'Meets Route 1 (≥€450M net turnover or ≥1,000 FTE)'
    case 'route2_emissions': return 'Meets Route 2 (≥10,000 tCO₂e Scope 1+2, high-income country)'
    case 'route2_twoOfThree': return 'Meets Route 2 (≥2 of: €25M balance sheet, €50M turnover, 250 FTE; high-income country)'
    default: return 'Below all Category A thresholds'
  }
}

const toggleBtn = (active: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 500, padding: '8px 22px', borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${active ? '#0F6E56' : '#e8e7e4'}`,
  background: active ? '#E1F5EE' : '#fff', color: active ? '#0F6E56' : '#555553',
})

export default function SbtiDashboard() {
  // Gated on the GHG entitlement — SBTi is part of the GHG module (same precedent
  // as the Scope 3 Calculator, which is also unlocked by 'ghg').
  const isPaid = useEntitlement('ghg')

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [ghgScope12, setGhgScope12] = useState<number | null>(null) // latest-year Scope 1+2 prefill

  // Form state (strings for inputs; high-income tri-state: null = undeclared).
  const [netTurnover, setNetTurnover] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [balanceSheet, setBalanceSheet] = useState('')
  const [totalEmissions, setTotalEmissions] = useState('')
  const [highIncome, setHighIncome] = useState<boolean | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Resolve the active company (via the GHG series) + prefill any existing profile.
  useEffect(() => {
    if (!isPaid) return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { setLoading(false); return }
      setUserId(session.user.id)

      const res = await loadCompanySeries()
      if (cancelled) return
      // NOTE: single-company assumption — pins to the first series. Multi-company accounts
      // need a company picker here (backlogged) before this screen is safe for >1 company.
      const series = res.series[0] ?? null   // first / most-recent company series
      if (!series) { setLoading(false); return } // no inventory → empty state below

      setCompanyId(series.companyId)
      setCompanyName(series.company)
      const latest = series.years[series.years.length - 1] // years ascending → last = latest
      if (latest && Number.isFinite(latest.scope12Total)) setGhgScope12(latest.scope12Total)

      const { data: profile } = await supabase
        .from('sbti_company_profile')
        .select('*')
        .eq('company_id', series.companyId)
        .maybeSingle()
      if (cancelled) return
      if (profile) {
        if (profile.net_turnover_eur != null) setNetTurnover(String(profile.net_turnover_eur))
        if (profile.employee_count != null) setEmployeeCount(String(profile.employee_count))
        if (profile.balance_sheet_eur != null) setBalanceSheet(String(profile.balance_sheet_eur))
        if (profile.total_emissions_tco2e != null) setTotalEmissions(String(profile.total_emissions_tco2e))
        setHighIncome(profile.high_income_country ?? null)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [isPaid])

  // Live categorisation — undeclared high-income (null) → false, so Route 2 stays dormant.
  const result = useMemo(() => categorize({
    highIncomeCountry: highIncome === true,
    netTurnoverEur: numOrU(netTurnover),
    fte: intOrU(employeeCount),
    balanceSheetEur: numOrU(balanceSheet),
    scope12EmissionsTco2e: numOrU(totalEmissions),
  }), [highIncome, netTurnover, employeeCount, balanceSheet, totalEmissions])

  // Any field edit clears the saved badge.
  useEffect(() => { setSaved(false) }, [netTurnover, employeeCount, balanceSheet, totalEmissions, highIncome])

  const save = async () => {
    if (!companyId || !userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('sbti_company_profile').upsert({
        company_id: companyId,
        user_id: userId, // denormalized for the RLS gate
        net_turnover_eur: numOrU(netTurnover) ?? null,
        employee_count: intOrU(employeeCount) ?? null,
        balance_sheet_eur: numOrU(balanceSheet) ?? null,
        total_emissions_tco2e: numOrU(totalEmissions) ?? null,
        high_income_country: highIncome, // boolean | null (null = undeclared)
        category: result.category,
        category_basis: result.matchedRoute, // raw matchedRoute verbatim; label is render-only
        updated_at: new Date().toISOString(),
        // annual_revenue intentionally NOT written (retired — superseded by net_turnover_eur)
      }, { onConflict: 'company_id' })
      if (error) { console.error('SBTi profile save failed:', error); alert('Save failed: ' + error.message); return }
      setSaved(true)
    } finally { setSaving(false) }
  }

  if (!isPaid) {
    return (
      <PaywallCard
        title="Unlock SBTi target-setting"
        body="SBTi target-setting and monitoring is part of the GHG module. Unlock GHG to set science-based targets under the Corporate Net-Zero Standard V2.0, track your trajectory, and monitor progress."
      />
    )
  }

  const catColor = result.category === 'A' ? '#0F6E56' : '#0d0d0d'
  const catBg = result.category === 'A' ? '#E1F5EE' : '#f8f7f5'

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', minHeight: '100vh', color: '#0d0d0d' }}>
      <Nav />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '2.5rem 2rem 6rem' }}>
        <div style={{ width: 40, height: 3, background: GRAD, borderRadius: 2, marginBottom: 18 }} />
        <h1 style={sectionHead}>SBTi Targets</h1>
        <p style={sectionSub}>Set and monitor your science-based targets under the Corporate Net-Zero Standard V2.0.</p>

        {loading ? (
          <div style={{ fontSize: 13, color: '#888784', fontWeight: 300 }}>Loading…</div>
        ) : !companyId ? (
          <div style={{ background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div style={eyebrow}>No inventory yet</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.2rem', fontWeight: 400, marginBottom: 6 }}>Set up your GHG inventory first</div>
            <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 18px' }}>
              SBTi categorisation reads from your GHG company. Create a GHG inventory, then come back to set targets.
            </p>
            <a href="/dashboard/ghg" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: '#0d0d0d', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to GHG inventory →</a>
          </div>
        ) : (
          <>
            <div style={eyebrow}>Step 1 · Company profile</div>
            <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Categorising <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>{companyName}</strong> under the Corporate Net-Zero Standard V2.0 (Category A vs B).
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Net turnover (EUR)</label>
                <input style={inputStyle} type="number" min={0} value={netTurnover} onChange={e => setNetTurnover(e.target.value)} placeholder="e.g. 500000000" />
              </div>
              <div>
                <label style={labelStyle}>Full-time employees (FTE)</label>
                <input style={inputStyle} type="number" min={0} value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} placeholder="e.g. 1200" />
              </div>
              <div>
                <label style={labelStyle}>Balance-sheet total (EUR)</label>
                <input style={inputStyle} type="number" min={0} value={balanceSheet} onChange={e => setBalanceSheet(e.target.value)} placeholder="e.g. 30000000" />
              </div>
              <div>
                <label style={labelStyle}>Scope 1+2 emissions (tCO₂e)</label>
                <input style={inputStyle} type="number" min={0} value={totalEmissions} onChange={e => setTotalEmissions(e.target.value)} placeholder="e.g. 12000" />
                {ghgScope12 != null && (
                  <button
                    onClick={() => setTotalEmissions(String(Math.round(ghgScope12 * 100) / 100))}
                    style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: '#7425e3', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                  >
                    Use GHG figure ({ghgScope12.toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e)
                  </button>
                )}
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              <label style={labelStyle}>Is your ultimate-parent company headquartered in a World Bank high-income country?</label>
              <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5, marginBottom: 8 }}>
                Gates the high-income categorisation route (Route 2 — the emissions / two-of-three thresholds).
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setHighIncome(true)} style={toggleBtn(highIncome === true)}>Yes</button>
                <button onClick={() => setHighIncome(false)} style={toggleBtn(highIncome === false)}>No</button>
              </div>
            </div>

            <div style={{ marginTop: 24, background: catBg, border: `1px solid ${catColor}22`, borderRadius: 14, padding: '1.6rem 1.8rem' }}>
              <div style={eyebrow}>Live categorisation</div>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '2rem', fontWeight: 400, color: catColor, lineHeight: 1.1 }}>
                Category {result.category}
              </div>
              <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, marginTop: 6 }}>{basisLabel(result.matchedRoute)}</div>
              {highIncome === null && (
                <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginTop: 10 }}>
                  Declare high-income status to evaluate the high-income route.
                </div>
              )}
            </div>

            <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
              <button
                onClick={save}
                disabled={saving}
                style={{ fontSize: 14, fontWeight: 600, padding: '11px 28px', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer', background: saved ? '#E1F5EE' : GRAD, color: saved ? '#0F6E56' : '#0d0d0d' }}
              >
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save profile'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
