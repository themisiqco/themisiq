'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlement } from '../../../lib/useEntitlement'
import PaywallCard from '../../components/PaywallCard'
import { categorize, validateTargetConfig, acaSuggestedReductionPct, type CategoryResult, type Scope, type TargetConfig } from '../../../lib/sbti'
import { loadCompanySeries } from '../../../lib/ghg/loadSeries'
import { VERSION_DATES } from '../../../lib/sbti/params'

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

// Scope display labels. s1s2_combined is V1.3.1-only (the engine rejects it for v2_0).
const SCOPE_LABEL: Record<Scope, string> = {
  s1: 'Scope 1',
  s2_location: 'Scope 2 (location-based)',
  s3: 'Scope 3',
  s1s2_combined: 'Scope 1+2 combined (V1.3.1 only)',
}
const SCOPE_ORDER: Scope[] = ['s1', 's2_location', 's3']

// Step 3 (near-term target cards) helpers.
type Draft = { baseYear: number; targetYear: number; reductionPct: number }
const round1 = (n: number): number => Math.round(n * 10) / 10
// ACA rate bucket: S1 and S2 both use 's1s2' (shared RATE only — never merges emissions); S3 uses 's3'.
const bucketFor = (sc: Scope): 's1s2' | 's3' => (sc === 's3' ? 's3' : 's1s2')
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.4rem 1.6rem' }

export default function SbtiDashboard() {
  // Gated on the GHG entitlement — SBTi is part of the GHG module (same precedent
  // as the Scope 3 Calculator, which is also unlocked by 'ghg').
  const isPaid = useEntitlement('ghg')

  // ─── Wizard shell (GHG STEPS pattern) ───────────────────────────────────────
  const STEPS = ['Company profile', 'Standard & scope', 'Near-term targets']
  const [step, setStep] = useState(0)

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [ghgScope12, setGhgScope12] = useState<number | null>(null) // latest-year Scope 1+2 prefill

  // Step 1 form state (strings for inputs; high-income tri-state: null = undeclared).
  const [netTurnover, setNetTurnover] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [balanceSheet, setBalanceSheet] = useState('')
  const [totalEmissions, setTotalEmissions] = useState('')
  const [highIncome, setHighIncome] = useState<boolean | null>(null)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false) // unsaved edits → beforeunload guard
  const navIntentRef = useRef(false) // set true on a deliberate in-app navigation so the guard doesn't fire

  // Step 2 state (held in wizard state only — NOT persisted here; Step 3 creates targets).
  const [standardVersion, setStandardVersion] = useState<'v1_3_1' | 'v2_0'>('v2_0')
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([])

  // Step 3 state — baseline figures (captured from the same series) + per-scope target drafts.
  const [baselineYear, setBaselineYear] = useState<number | null>(null)
  const [baselineByScope, setBaselineByScope] = useState<{ scope1: number; scope2Location: number; scope3: number | null } | null>(null)
  const [targetDrafts, setTargetDrafts] = useState<Partial<Record<Scope, Draft>>>({})

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

      // Baseline-year per-scope figures for Step 3 (reuse this series; no second fetch).
      setBaselineYear(series.baselineYear)
      const baseYr = series.years.find(y => y.year === series.baselineYear) ?? latest
      if (baseYr) setBaselineByScope({ scope1: baseYr.scope1, scope2Location: baseYr.scope2Location, scope3: baseYr.scope3 })

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

  // Warn on unload while there are unsaved edits (mirrors the GHG wizard guard).
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      if (navIntentRef.current) return // deliberate in-app navigation → don't warn
      e.preventDefault(); e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Offered scopes: s1s2_combined only under V1.3.1 (engine rejects it for v2_0).
  const scopeOptions: Scope[] = standardVersion === 'v1_3_1' ? [...SCOPE_ORDER, 's1s2_combined'] : SCOPE_ORDER

  const pickStandard = (v: 'v1_3_1' | 'v2_0') => {
    setStandardVersion(v)
    if (v === 'v2_0') setSelectedScopes(prev => prev.filter(s => s !== 's1s2_combined')) // drop combined on V2.0
    setDirty(true)
  }
  const toggleScope = (sc: Scope) => {
    setSelectedScopes(prev => prev.includes(sc) ? prev.filter(x => x !== sc) : [...prev, sc])
    setDirty(true)
  }

  // Legality PREVIEW per selected scope — a minimal probe config (passes R2/R3) so the
  // only thing that can flag is the version/scope rule (e.g. s1s2_combined under v2_0).
  // Real per-target validation happens in Step 3.
  const scopeLegality = useMemo(() => selectedScopes.map(sc => {
    const probe: TargetConfig = { standardVersion, scope: sc, method: 'absolute_aca', baseYear: 2022, targetYear: 2030, reductionPct: 1 }
    return { scope: sc, ...validateTargetConfig(probe, {}) }
  }), [selectedScopes, standardVersion])

  // Lazily create a default draft per selected scope (fires as scopes are toggled in Step 2,
  // so drafts exist by the time Step 3 renders). Default reductionPct = the ACA suggestion.
  useEffect(() => {
    setTargetDrafts(prev => {
      let changed = false
      const next: Partial<Record<Scope, Draft>> = { ...prev }
      for (const sc of selectedScopes) {
        if (!next[sc]) {
          const by = baselineYear ?? 2022
          const ty = 2035
          next[sc] = { baseYear: by, targetYear: ty, reductionPct: round1(acaSuggestedReductionPct({ bucket: bucketFor(sc), baseYear: by, targetYear: ty })) }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [selectedScopes, baselineYear])

  // Baseline emissions for a scope (S1/S2 separate; combined = S1+S2 sum for V1.3.1).
  const baseEmissionsFor = (sc: Scope): number | null => {
    if (!baselineByScope) return null
    switch (sc) {
      case 's1': return baselineByScope.scope1
      case 's2_location': return baselineByScope.scope2Location
      case 's3': return baselineByScope.scope3
      case 's1s2_combined': return baselineByScope.scope1 + baselineByScope.scope2Location
    }
  }
  const updateDraft = (sc: Scope, field: keyof Draft, value: number) => {
    setTargetDrafts(prev => {
      const cur = prev[sc] ?? { baseYear: baselineYear ?? 2022, targetYear: 2035, reductionPct: 0 }
      return { ...prev, [sc]: { ...cur, [field]: value } }
    })
    setDirty(true)
  }
  const resetToSuggested = (sc: Scope) => {
    const d = targetDrafts[sc]
    if (!d) return
    updateDraft(sc, 'reductionPct', round1(acaSuggestedReductionPct({ bucket: bucketFor(sc), baseYear: d.baseYear, targetYear: d.targetYear })))
  }

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
      setDirty(false)
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

        {/* Loading + empty-state live ABOVE the step shell — no steps until a company exists. */}
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
            {/* Step-tab header (mirrors the GHG wizard tab bar) */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid #e8e7e4', marginBottom: 24, overflowX: 'auto' as const }}>
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setStep(i)}
                  style={{ fontSize: 12, padding: '12px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}
                >
                  {i + 1}. {s}
                </button>
              ))}
            </div>

            {/* ── Step 1 · Company profile (unchanged behaviour, now gated on step 0) ── */}
            {step === 0 && (
              <>
                <div style={eyebrow}>Step 1 · Company profile</div>
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Categorising <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>{companyName}</strong> under the Corporate Net-Zero Standard V2.0 (Category A vs B).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Net turnover (EUR)</label>
                    <input style={inputStyle} type="number" min={0} value={netTurnover} onChange={e => { setNetTurnover(e.target.value); setDirty(true) }} placeholder="e.g. 500000000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Full-time employees (FTE)</label>
                    <input style={inputStyle} type="number" min={0} value={employeeCount} onChange={e => { setEmployeeCount(e.target.value); setDirty(true) }} placeholder="e.g. 1200" />
                  </div>
                  <div>
                    <label style={labelStyle}>Balance-sheet total (EUR)</label>
                    <input style={inputStyle} type="number" min={0} value={balanceSheet} onChange={e => { setBalanceSheet(e.target.value); setDirty(true) }} placeholder="e.g. 30000000" />
                  </div>
                  <div>
                    <label style={labelStyle}>Scope 1+2 emissions (tCO₂e)</label>
                    <input style={inputStyle} type="number" min={0} value={totalEmissions} onChange={e => { setTotalEmissions(e.target.value); setDirty(true) }} placeholder="e.g. 12000" />
                    {ghgScope12 != null && (
                      <button
                        onClick={() => { setTotalEmissions(String(Math.round(ghgScope12 * 100) / 100)); setDirty(true) }}
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
                    <button onClick={() => { setHighIncome(true); setDirty(true) }} style={toggleBtn(highIncome === true)}>Yes</button>
                    <button onClick={() => { setHighIncome(false); setDirty(true) }} style={toggleBtn(highIncome === false)}>No</button>
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

            {/* ── Step 2 · Standard & scope (selection only — no DB write) ── */}
            {step === 1 && (
              <>
                <div style={eyebrow}>Step 2 · Standard &amp; scope</div>
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Pick the standard version and the scopes <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>{companyName}</strong> will set targets for.
                </p>

                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Standard version</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
                    <button onClick={() => pickStandard('v2_0')} style={toggleBtn(standardVersion === 'v2_0')}>Corporate Net-Zero V2.0</button>
                    <button onClick={() => pickStandard('v1_3_1')} style={toggleBtn(standardVersion === 'v1_3_1')}>V1.3.1</button>
                  </div>
                  <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>
                    V2.0 is effective {VERSION_DATES.v2_0EffectiveDate}, mandatory {VERSION_DATES.v2_0MandatoryDate}; V1.3.1 accepted through {VERSION_DATES.v1_3_1AcceptedUntil}.
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Scopes to set targets for</label>
                  <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5, marginBottom: 8 }}>
                    Under V2.0, Scope 1 and Scope 2 are set as separate targets.
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
                    {scopeOptions.map(sc => (
                      <button key={sc} onClick={() => toggleScope(sc)} style={toggleBtn(selectedScopes.includes(sc))}>{SCOPE_LABEL[sc]}</button>
                    ))}
                  </div>
                </div>

                {selectedScopes.length > 0 && (
                  <div style={{ marginTop: 8, background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.2rem 1.4rem' }}>
                    <div style={eyebrow}>Legality check</div>
                    {scopeLegality.map(({ scope, ok, reasons }) => (
                      <div key={scope} style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 6, alignItems: 'baseline' }}>
                        <span style={{ color: ok ? '#0F6E56' : '#B91C1C', fontWeight: 700, flexShrink: 0 }}>{ok ? '✓' : '✗'}</span>
                        <span style={{ color: '#555553', fontWeight: 300 }}>
                          {SCOPE_LABEL[scope]}{!ok && reasons.length > 0 ? ` — ${reasons.join('; ')}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginTop: 18 }}>Targets are created in the next step.</div>
              </>
            )}

            {/* ── Step 3 · Near-term targets (cards + ACA-suggested + live validation; NO persist/trajectory) ── */}
            {step === 2 && (
              <>
                <div style={eyebrow}>Step 3 · Near-term targets</div>
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  One near-term target per selected scope. The reduction % is pre-filled with the SBTi ACA-suggested rate; edit any field and it re-validates live.
                </p>

                {selectedScopes.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#888784', fontWeight: 300 }}>No scopes selected — go back to Step 2 to choose scopes.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {selectedScopes.map(sc => {
                      const base = baseEmissionsFor(sc)

                      // S3 with no Scope 3 inventory → routing empty-state (no editable inputs).
                      if (sc === 's3' && base === null) {
                        return (
                          <div key={sc} style={cardStyle}>
                            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 400, marginBottom: 8 }}>{SCOPE_LABEL[sc]}</div>
                            <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: 12 }}>
                              To set a Scope 3 target, complete your Scope 3 inventory first. Your near-term submission can proceed on Scope 1 + 2 alone.
                            </p>
                            <a href="/dashboard/scope3" onClick={() => { navIntentRef.current = true }} style={{ display: 'inline-block', padding: '9px 18px', borderRadius: 8, background: '#0d0d0d', color: '#fff', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>Go to Scope 3 Calculator →</a>
                          </div>
                        )
                      }

                      const d = targetDrafts[sc]
                      if (!d) return null // draft is created by the lazy-init effect

                      const suggested = round1(acaSuggestedReductionPct({ bucket: bucketFor(sc), baseYear: d.baseYear, targetYear: d.targetYear }))
                      const v = validateTargetConfig({ standardVersion, scope: sc, method: 'absolute_aca', baseYear: d.baseYear, targetYear: d.targetYear, reductionPct: d.reductionPct, isNetZero: false }, {})

                      return (
                        <div key={sc} style={cardStyle}>
                          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', fontWeight: 400, marginBottom: 6 }}>{SCOPE_LABEL[sc]}</div>
                          {base != null && (
                            <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginBottom: 14 }}>
                              Base: {base.toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e{baselineYear != null ? ` (${baselineYear})` : ''}
                            </div>
                          )}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={labelStyle}>Base year</label>
                              <input style={inputStyle} type="number" value={d.baseYear} onChange={e => updateDraft(sc, 'baseYear', Number(e.target.value))} />
                            </div>
                            <div>
                              <label style={labelStyle}>Target year</label>
                              <input style={inputStyle} type="number" value={d.targetYear} onChange={e => updateDraft(sc, 'targetYear', Number(e.target.value))} />
                            </div>
                            <div>
                              <label style={labelStyle}>Reduction %</label>
                              <input style={inputStyle} type="number" value={d.reductionPct} onChange={e => updateDraft(sc, 'reductionPct', Number(e.target.value))} />
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginTop: 8 }}>
                            ACA-suggested: {suggested}%
                            {Math.abs(d.reductionPct - suggested) > 0.05 && (
                              <button onClick={() => resetToSuggested(sc)} style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#7425e3', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>reset to suggested</button>
                            )}
                          </div>
                          <div style={{ marginTop: 12, fontSize: 13 }}>
                            {v.ok ? (
                              <span style={{ color: '#0F6E56', fontWeight: 600 }}>✓ Valid target</span>
                            ) : (
                              <div style={{ color: '#B91C1C' }}>
                                <span style={{ fontWeight: 600 }}>✗ Invalid</span>
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontWeight: 300, color: '#555553' }}>
                                  {v.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginTop: 18 }}>Trajectory preview and saving come next.</div>
              </>
            )}

            {/* Back / Continue nav (mirrors the GHG wizard) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}
              >← Back</button>
              {step < STEPS.length - 1 && (
                <button
                  onClick={() => setStep(s => s + 1)}
                  style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none' }}
                >Continue →</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
