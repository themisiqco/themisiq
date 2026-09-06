'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlement } from '../../../lib/useEntitlement'
import PaywallCard from '../../components/PaywallCard'
import { categorize, validateTargetConfig, acaSuggestedReductionPct, computeTrajectory, progressForTarget, scopeActualField, resolveCommittedBaseline, baseYearDriftForSeries, type CategoryResult, type Scope, type TargetConfig, type TargetProgress, type Point } from '../../../lib/sbti'
import { loadCompanySeries } from '../../../lib/ghg/loadSeries'
import type { CompanySeries, SeriesYear } from '../../../lib/ghg/series'
import { describeYearStatus } from '../../../lib/ghg/series'
import { VERSION_DATES, NET_ZERO } from '../../../lib/sbti/params'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import { sectionHead } from '@/app/components/headingStyles'
import { btnStep, btnStepDisabled } from '@/app/components/buttonStyles'

// ─── Design tokens (mirroring the climate-risk dashboard) ─────────────────────
const GRAD = 'var(--color-brand)'
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const eyebrow: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 8 }

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
// storedBaseEmissions: the FROZEN base_year_emissions_tco2e loaded from a committed target.
// undefined/null for a brand-new (not-yet-saved) draft — such a draft grades against the live
// series until it is committed. A committed target's baseline never re-anchors to the inventory.
type Draft = { baseYear: number; targetYear: number; reductionPct: number; storedBaseEmissions?: number | null }
const round1 = (n: number): number => Math.round(n * 10) / 10
// ACA rate bucket: S1 and S2 both use 's1s2' (shared RATE only — never merges emissions); S3 uses 's3'.
const bucketFor = (sc: Scope): 's1s2' | 's3' => (sc === 's3' ? 's3' : 's1s2')
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e8e7e4', borderRadius: 14, padding: '1.4rem 1.6rem' }

// ─── Progress-summary helpers (pure, module-level) ────────────────────────────
function scopeLabel(sc: Scope): string {
  switch (sc) {
    case 's1': return 'Scope 1'
    case 's2_location': return 'Scope 2 (location-based)'
    case 's3': return 'Scope 3'
    case 's1s2_combined': return 'Scope 1 + 2'
  }
}

// Merge the required trajectory with per-year actuals for the chart. required comes from the
// trajectory (base→target inclusive); actual is the scope's value in the matching SeriesYear
// (null when that year has no inventory, or the scope's field is null — e.g. S3 in an S3-less year).
function buildChartData(
  traj: Point[],
  years: SeriesYear[],
  sc: Scope,
): Array<{ year: number; required: number; actual: number | null }> {
  const field = scopeActualField(sc)
  return traj.map(p => {
    const yr = years.find(y => y.year === p.year)
    const actual = yr ? (yr[field] ?? null) : null
    return { year: p.year, required: p.emissions, actual }
  })
}

// The most recent reporting year with a non-null actual for this scope — the year the badge
// grades against. null when the scope has no actual in any year (e.g. S3 never reported).
function latestActualYear(years: SeriesYear[], sc: Scope): number | null {
  const field = scopeActualField(sc)
  let latest: number | null = null
  for (const y of years) {
    if (y[field] != null && (latest === null || y.year > latest)) latest = y.year
  }
  return latest
}

// Progress / long-term badge palette (matches the existing token set).
const PILL: Record<'on_track' | 'off_track' | 'best_efforts' | 'no_actual' | 'baseline_review' | 'long_term', { label: string; color: string; bg: string }> = {
  on_track:        { label: 'On track',         color: '#0F6E56', bg: '#ECFDF5' },
  off_track:       { label: 'Off track',        color: '#B91C1C', bg: '#FEF2F2' },
  best_efforts:    { label: 'Best efforts',     color: 'var(--color-module-climate)', bg: '#FEF3C7' },
  no_actual:       { label: 'No actuals yet',   color: '#555553', bg: '#f8f7f5' },
  // Base year materially changed since commitment — neither pass nor fail; the grade cannot be
  // computed until the user assesses recalculation. Amber, tied to the drift note beneath it.
  baseline_review: { label: 'Review baseline',  color: 'var(--color-module-climate)', bg: '#FDF6EC' },
  long_term:       { label: 'Long-term target', color: '#555553', bg: '#f3f0ff' },
}
const pillStyle = (k: keyof typeof PILL): React.CSSProperties => ({
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: PILL[k].color, background: PILL[k].bg, borderRadius: 99, padding: '2px 8px',
})

export default function SbtiDashboard() {
  // Gated on the GHG entitlement — SBTi is part of the GHG module (same precedent
  // as the Scope 3 Calculator, which is also unlocked by 'ghg').
  const isPaid = useEntitlement('ghg')

  // ─── Wizard shell (GHG STEPS pattern) ───────────────────────────────────────
  const STEPS = ['Company profile', 'Standard & scope', 'Near-term targets', 'Net-zero targets']
  const [step, setStep] = useState(0)
  const [view, setView] = useState<'summary' | 'wizard'>('wizard')

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
  const [series, setSeries] = useState<CompanySeries | null>(null)   // retain full series (per-year actuals) for the progress view
  const [allSeries, setAllSeries] = useState<CompanySeries[]>([])    // every company; drives the picker (rendered when >1)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null) // which company this screen is bound to
  const [hasSavedTargets, setHasSavedTargets] = useState(false)      // load-time routing signal (true when saved rows existed)
  const [targetDrafts, setTargetDrafts] = useState<Partial<Record<Scope, Draft>>>({})

  // Step 4 (net-zero) state — SEPARATE from near-term targetDrafts (a scope has both targets).
  // The near-term scope SET that gates Step 4 is derived reactively below (nearTermTargetScopes),
  // not stored — so it stays in sync with in-session Step-3 saves/edits.
  const [netZeroDrafts, setNetZeroDrafts] = useState<Partial<Record<Scope, Draft>>>({})
  // SEPARATE from Step 3's savingTargets/savedTargets — net-zero persists independently.
  const [savingNetZero, setSavingNetZero] = useState(false)
  const [savedNetZero, setSavedNetZero] = useState(false)
  const [savingTargets, setSavingTargets] = useState(false)
  const [savedTargets, setSavedTargets] = useState(false)

  // Clear ALL per-company state so switching companies never bleeds company A's profile, scopes,
  // or target drafts into company B. Called at the start of every per-company (re)load.
  const resetPerCompanyState = () => {
    setNetTurnover(''); setEmployeeCount(''); setBalanceSheet(''); setTotalEmissions(''); setHighIncome(null)
    setStandardVersion('v2_0'); setSelectedScopes([])
    setTargetDrafts({}); setNetZeroDrafts({})
    setSavedTargets(false); setSavedNetZero(false); setSaved(false); setDirty(false)
    setHasSavedTargets(false); setGhgScope12(null)
    setStep(0); setView('wizard')
  }

  // Switch the active company. Guard unsaved target edits (same intent as the beforeunload guard).
  const onPickCompany = (cid: string) => {
    if (cid === selectedCompanyId) return
    if (dirty && !window.confirm('You have unsaved target edits. Switch company and discard them?')) return
    setSelectedCompanyId(cid)
  }

  // Load ALL companies once. The picker (rendered when there is more than one) chooses which one
  // this screen binds to; the default is the first (buildCompanySeries sorts by company name).
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
      setAllSeries(res.series)
      // Selection precedence: (1) a valid ?companyId= in the URL (the GHG→SBTi bridge — highest),
      // else (2) auto-select when there is exactly ONE company (no ambiguity), else (3) select
      // NOTHING. With 2+ companies and no param we must NOT guess — the UI shows a "select a
      // company" prompt. Auto-picking the alphabetical-first here is the original bug in a dropdown.
      const fromUrl = new URLSearchParams(window.location.search).get('companyId')
      const valid = !!fromUrl && res.series.some(s => s.companyId === fromUrl)
      const initialId = valid ? fromUrl : (res.series.length === 1 ? res.series[0].companyId : null)
      setSelectedCompanyId(prev => prev ?? initialId)
      // Nothing selected (0 companies, or 2+ with no param) → no per-company load to wait on, so
      // stop the spinner now. Effect B owns setLoading(false) when a company IS selected.
      if (initialId == null) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [isPaid])

  // Load the SELECTED company's baseline, profile, and saved targets. Re-runs on every switch;
  // resets first so nothing from the previously-selected company survives into this one.
  useEffect(() => {
    const series = allSeries.find(s => s.companyId === selectedCompanyId)
    if (!series) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      resetPerCompanyState()

      setCompanyId(series.companyId)
      setCompanyName(series.company)
      // ── An unplottable year must not anchor a published commitment ───────────────────────────
      // Stricter than the trend chart on purpose. A wrong trend line misinforms; a target anchored
      // to a partial baseline is a commitment made against a number that was never the company's
      // emissions, and every year of progress is then graded against it. Refuse both roles:
      //   - latest actual  → the headline "your current emissions" figure
      //   - baseline       → the base-year figure a target reduction is computed from
      // Left unset rather than substituted with the nearest usable year: silently grading against
      // a different year than the one named is the failure this is here to prevent.
      const latest = series.years[series.years.length - 1] // years ascending → last = latest
      if (latest && latest.dataStatus === 'ok' && latest.scope12Total != null) setGhgScope12(latest.scope12Total)

      // Baseline-year per-scope figures for Step 3 (reuse this series; no second fetch).
      setBaselineYear(series.baselineYear)
      const baseYr = series.years.find(y => y.year === series.baselineYear) ?? latest
      if (baseYr && baseYr.dataStatus === 'ok' && baseYr.scope1 != null && baseYr.scope2Location != null) {
        setBaselineByScope({ scope1: baseYr.scope1, scope2Location: baseYr.scope2Location, scope3: baseYr.scope3 })
      }
      setSeries(series) // persist the full series alongside the baseline figures

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

      // Load existing NEAR-TERM targets → seed cards. Reset cleared prior state, so seed = replace.
      const { data: targetRows } = await supabase
        .from('sbti_targets')
        .select('scope, base_year, target_year, reduction_pct, base_year_emissions_tco2e')
        .eq('company_id', series.companyId)
        .eq('target_type', 'near_term')
      if (cancelled) return
      if (targetRows && targetRows.length > 0) {
        const seeded: Partial<Record<Scope, Draft>> = {}
        const savedScopes: Scope[] = []
        for (const row of targetRows) {
          const sc = row.scope as Scope
          seeded[sc] = {
            baseYear: row.base_year ?? (series.baselineYear ?? 2022),
            targetYear: row.target_year ?? 2035,
            reductionPct: row.reduction_pct ?? 0,
            storedBaseEmissions: row.base_year_emissions_tco2e ?? null, // FROZEN baseline; grading reads this, not the live series
          }
          savedScopes.push(sc)
        }
        setTargetDrafts(prev => ({ ...prev, ...seeded })) // prev is {} after reset → replace
        setSelectedScopes(prev => Array.from(new Set([...prev, ...savedScopes])))
        // Step 4 reads saved near-term scopes via the nearTermTargetScopes memo (selectedScopes ∩ targetDrafts).
      }

      // Load existing NET-ZERO targets → seed netZeroDrafts. Saved values WIN over the 90/2050
      // defaults (the net-zero lazy-init effect only fills MISSING drafts, so these survive).
      const { data: nzRows } = await supabase
        .from('sbti_targets')
        .select('scope, base_year, target_year, reduction_pct, base_year_emissions_tco2e')
        .eq('company_id', series.companyId)
        .eq('target_type', 'net_zero')
      if (cancelled) return
      if (nzRows && nzRows.length > 0) {
        const seededNz: Partial<Record<Scope, Draft>> = {}
        for (const row of nzRows) {
          seededNz[row.scope as Scope] = {
            baseYear: row.base_year ?? (series.baselineYear ?? 2022),
            targetYear: row.target_year ?? NET_ZERO.latestNetZeroYear,
            reductionPct: row.reduction_pct ?? NET_ZERO.minAbsoluteReductionPct,
            storedBaseEmissions: row.base_year_emissions_tco2e ?? null, // FROZEN baseline (net-zero row's own frozen value)
          }
        }
        setNetZeroDrafts(prev => ({ ...prev, ...seededNz }))
      }
      const hasSaved = (targetRows?.length ?? 0) > 0 || (nzRows?.length ?? 0) > 0
      setHasSavedTargets(hasSaved)
      // A returning user with saved targets lands on the summary; otherwise the wizard (reset default).
      setView(hasSaved ? 'summary' : 'wizard')
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [selectedCompanyId, allSeries])

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

  // Baseline emissions for a scope — TWO sources, deliberately kept apart (S1/S2 separate;
  // combined = S1+S2 sum for V1.3.1). Collapsing them was the SEV-0 bug: a committed target
  // silently re-anchored to the live inventory whenever the inventory was edited.
  //
  //  - baselineForDrafting: the LIVE GHG series baseline. Correct while the user is CHOOSING a
  //    baseline for a new target (Step 3 / Step 4 drafting UI).
  //  - baselineForCommitted: the STORED, frozen base_year_emissions_tco2e of a committed target.
  //    Correct when GRADING against a commitment (progress view) and when persisting (freeze at
  //    commit). Falls back to the live baseline ONLY when nothing is stored yet (new draft).
  const baselineForDrafting = (sc: Scope): number | null => {
    if (!baselineByScope) return null
    switch (sc) {
      case 's1': return baselineByScope.scope1
      case 's2_location': return baselineByScope.scope2Location
      case 's3': return baselineByScope.scope3
      case 's1s2_combined': return baselineByScope.scope1 + baselineByScope.scope2Location
    }
  }
  const baselineForCommitted = (sc: Scope, draft: Draft | undefined): number | null =>
    resolveCommittedBaseline(draft?.storedBaseEmissions, baselineForDrafting(sc))

  // Drift is a LIKE-FOR-LIKE comparison: the target's frozen base-year figure vs what the live
  // inventory NOW reports for THAT SAME base year — never against a different year. Look up the
  // live row for the target's own baseYear:
  //   - row found   → compare stored vs that year's figure for this scope (real drift).
  //   - row MISSING → no inventory exists for the base year → NO comparison is possible → null.
  // The missing-row branch is load-bearing: absence of a comparison is not evidence of drift. A
  // decarbonising company (2022 base, 2024 series baseline) must NOT be told its 2022 baseline
  // "drifted" just because 2024 is lower — that would compare two different years' emissions.
  const driftFor = (sc: Scope, draft: Draft) => {
    const liveByYear = (series?.years ?? []).map(y => ({ year: y.year, emissions: y[scopeActualField(sc)] ?? null }))
    return baseYearDriftForSeries(draft.storedBaseEmissions, draft.baseYear, liveByYear)
  }

  // FIX 3 — drift disclosure. When the frozen baseline and the live base-year figure diverge
  // beyond 0.5%, tell the user (SBTi requires base-year recalculation to be assessed and
  // disclosed) — but DO NOT auto-update the target; the frozen number stays.
  const driftNote = (sc: Scope, draft: Draft) => {
    const drift = driftFor(sc, draft)
    if (!drift) return null
    const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 })
    return (
      <div style={{ background: '#FDF6EC', border: '0.5px solid #EAD9BE', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 12.5, color: 'var(--color-module-climate)', lineHeight: 1.6 }}>
        Your {draft.baseYear} inventory has changed since this target was set ({fmt(drift.stored)} → {fmt(drift.live)} tCO₂e, a {drift.pct > 0 ? '+' : ''}{drift.pct.toFixed(1)}% change). SBTi requires base-year recalculation to be assessed and disclosed. This target is still anchored to its original baseline.
      </div>
    )
  }
  const updateDraft = (sc: Scope, field: keyof Draft, value: number) => {
    setTargetDrafts(prev => {
      const cur = prev[sc] ?? { baseYear: baselineYear ?? 2022, targetYear: 2035, reductionPct: 0 }
      return { ...prev, [sc]: { ...cur, [field]: value } }
    })
    setDirty(true)
    setSavedTargets(false)
  }
  const resetToSuggested = (sc: Scope) => {
    const d = targetDrafts[sc]
    if (!d) return
    updateDraft(sc, 'reductionPct', round1(acaSuggestedReductionPct({ bucket: bucketFor(sc), baseYear: d.baseYear, targetYear: d.targetYear })))
  }

  // Scopes that ACTUALLY have a near-term target right now — the single source for Step 4.
  // Mirrors Step 3 saveTargets' `cards` filter (a usable draft AND not the null-S3 routing case),
  // derived REACTIVELY from current state. Reflects in-session Step-3 saves/edits without a reload,
  // and the DB-load path too (the load seeds both selectedScopes and targetDrafts).
  const nearTermTargetScopes = useMemo(
    () => selectedScopes.filter(sc => targetDrafts[sc] && !(sc === 's3' && baselineForCommitted(sc, targetDrafts[sc]) === null)),
    [selectedScopes, targetDrafts, baselineByScope],
  )

  // Step 4 — lazily seed a net-zero draft per near-term scope. Net-zero defaults to the
  // 90% floor by 2050 (NOT an ACA suggestion). Separate state from targetDrafts.
  useEffect(() => {
    setNetZeroDrafts(prev => {
      let changed = false
      const next: Partial<Record<Scope, Draft>> = { ...prev }
      for (const sc of nearTermTargetScopes) {
        if (!next[sc]) {
          next[sc] = { baseYear: baselineYear ?? 2022, targetYear: NET_ZERO.latestNetZeroYear, reductionPct: NET_ZERO.minAbsoluteReductionPct }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [nearTermTargetScopes, baselineYear])

  const updateNetZeroDraft = (sc: Scope, field: keyof Draft, value: number) => {
    setNetZeroDrafts(prev => {
      const cur = prev[sc] ?? { baseYear: baselineYear ?? 2022, targetYear: NET_ZERO.latestNetZeroYear, reductionPct: NET_ZERO.minAbsoluteReductionPct }
      return { ...prev, [sc]: { ...cur, [field]: value } }
    })
    setDirty(true)
    setSavedNetZero(false)
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

  // Persist near-term targets — one sbti_targets row per scope card with a usable draft.
  const saveTargets = async () => {
    if (!companyId || !userId) return

    // Cards to save: selected scopes WITH a draft, excluding the S3 routing card (no base data).
    const cards = selectedScopes
      .filter(sc => targetDrafts[sc] && !(sc === 's3' && baselineForCommitted(sc, targetDrafts[sc]) === null))
      .map(sc => ({ sc, d: targetDrafts[sc]! }))

    // Gate: every card must pass validation — name the invalid scope(s) and block.
    const invalid = cards.filter(({ sc, d }) =>
      !validateTargetConfig({ standardVersion, scope: sc, method: 'absolute_aca', baseYear: d.baseYear, targetYear: d.targetYear, reductionPct: d.reductionPct, isNetZero: false }, {}).ok)
    if (invalid.length > 0) {
      alert('Cannot save — fix the invalid target(s): ' + invalid.map(({ sc }) => SCOPE_LABEL[sc]).join(', '))
      return
    }
    if (cards.length === 0) { alert('No valid targets to save.'); return }

    setSavingTargets(true)
    try {
      // Atomic per-row upsert on the unique (company_id, scope, target_type) key
      // (migration 20260629_sbti_targets_unique_constraint.sql). Replaces the prior
      // non-atomic delete-then-insert, where a failed insert after a successful delete
      // would wipe the saved targets.
      // NOTE: upsert does NOT prune rows for scopes the user DE-SELECTED in Step 2 — an old
      // row for a removed scope survives. A "delete targets for de-selected scopes" refinement
      // is backlogged; not built here.
      const now = new Date().toISOString()
      const rows = cards.map(({ sc, d }) => ({
        company_id: companyId,
        user_id: userId, // denormalized for the RLS gate
        standard_version: standardVersion,
        target_type: 'near_term',
        scope: sc,
        s3_category: null, // total-S3 near-term target; no specific category in this step
        method: 'absolute_aca',
        base_year: d.baseYear,
        // Freeze at commit: preserve the stored baseline on re-save; capture the live one only
        // on first save (storedBaseEmissions still null then → falls back to live). An inventory
        // edit never restates a committed target here.
        base_year_emissions_tco2e: baselineForCommitted(sc, d),
        target_year: d.targetYear,
        reduction_pct: d.reductionPct,
        updated_at: now,
        // net-zero is encoded in target_type (no isNetZero column); ambition/status use column defaults.
      }))
      const { error } = await supabase.from('sbti_targets').upsert(rows, { onConflict: 'company_id,scope,target_type' })
      if (error) { console.error('SBTi targets save failed:', error); alert('Save failed: ' + error.message); return }
      setSavedTargets(true)
      setDirty(false)
    } finally { setSavingTargets(false) }
  }

  // Persist NET-ZERO targets — one sbti_targets row per net-zero card (target_type:'net_zero').
  // SEPARATE from saveTargets: net_zero rows coexist with near_term rows for the same scope, so
  // target_type:'net_zero' in BOTH the row AND the onConflict key means this CANNOT clobber the
  // near-term rows (the unique key is company_id+scope+target_type).
  const saveNetZero = async () => {
    if (!companyId || !userId) return

    // One card per near-term scope that has a net-zero draft.
    const cards = nearTermTargetScopes
      .filter(sc => netZeroDrafts[sc])
      .map(sc => ({ sc, d: netZeroDrafts[sc]! }))

    // Gate: every card must pass NET-ZERO validation (isNetZero:true ⇒ R5/R6/R9 fire). Name + block.
    const invalid = cards.filter(({ sc, d }) =>
      !validateTargetConfig({ standardVersion, scope: sc, method: 'absolute_aca', baseYear: d.baseYear, targetYear: d.targetYear, reductionPct: d.reductionPct, isNetZero: true }, {}).ok)
    if (invalid.length > 0) {
      alert('Cannot save — fix the invalid net-zero target(s): ' + invalid.map(({ sc }) => SCOPE_LABEL[sc]).join(', '))
      return
    }
    if (cards.length === 0) { alert('No valid net-zero targets to save.'); return }

    setSavingNetZero(true)
    try {
      const now = new Date().toISOString()
      const rows = cards.map(({ sc, d }) => ({
        company_id: companyId,
        user_id: userId, // denormalized for the RLS gate
        standard_version: standardVersion,
        target_type: 'net_zero', // ⚠️ net_zero — coexists with this scope's near_term row; must NOT be 'near_term'
        scope: sc,
        s3_category: null,
        method: 'absolute_aca',
        base_year: d.baseYear,
        base_year_emissions_tco2e: baselineForCommitted(sc, d), // freeze at commit (net-zero row's own frozen value)
        target_year: d.targetYear,
        reduction_pct: d.reductionPct,
        updated_at: now,
      }))
      const { error } = await supabase.from('sbti_targets').upsert(rows, { onConflict: 'company_id,scope,target_type' })
      if (error) { console.error('SBTi net-zero save failed:', error); alert('Save failed: ' + error.message); return }
      setSavedNetZero(true)
      setDirty(false)
    } finally { setSavingNetZero(false) }
  }

  // ─── Read-only progress summary (defined here so it closes over series / targetDrafts /
  // netZeroDrafts / baselineForCommitted / nearTermTargetScopes — avoids threading ~5 props;
  // it is stateless & read-only, so the define-inside render-identity concern is moot).
  // NOT rendered from the top-level return yet — 3d wires the summary-vs-wizard fork. ───
  function SbtiSummary({ onEdit }: { onEdit: () => void }) {
    const nearTerm = nearTermTargetScopes
    const netZero = (Object.keys(netZeroDrafts) as Scope[]).filter(sc => netZeroDrafts[sc])
    if (nearTerm.length === 0 && netZero.length === 0) return null   // defensive; 3d gates on hasSavedTargets
    const years = series?.years ?? []

    // The shared 160px required+actual chart (required = violet line, actual = sky dots).
    const chart = (data: Array<{ year: number; required: number; actual: number | null }>) => (
      <div style={{ marginTop: 14, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e7e4" />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} width={52} tickFormatter={(val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
            <Line type="monotone" dataKey="required" stroke="#7425e3" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="actual" stroke="#1fb1ff" strokeWidth={2} dot={true} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )

    const mutedCard = (sc: Scope, note: string) => (
      <div key={sc} style={cardStyle}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400, marginBottom: 6 }}>{scopeLabel(sc)}</div>
        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>{note}</div>
      </div>
    )

    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={eyebrow}>Your SBTi progress</div>
          <button onClick={onEdit} style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Edit targets →</button>
        </div>

        {/* NEAR-TERM — required + actual + progress badge */}
        {nearTerm.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: netZero.length > 0 ? 28 : 0 }}>
            {nearTerm.map(sc => {
              const d = targetDrafts[sc]
              if (!d) return null
              const base = baselineForCommitted(sc, d) // grade against the FROZEN baseline, not the live inventory
              if (base == null) return mutedCard(sc, 'No baseline emissions for this scope.')
              const traj = computeTrajectory({ baseYear: d.baseYear, baseEmissions: base, targetYear: d.targetYear, reductionPct: d.reductionPct, method: 'absolute_aca' })
              if (traj.length === 0) return mutedCard(sc, 'Trajectory unavailable for this target.')

              // BADGE: grade the latest actual against the required line — but ONLY when that actual year
              // falls within the target's [baseYear, targetYear] span (progressForTarget/trajectoryPointForYear
              // throw for an out-of-range year). Otherwise treat as no_actual — show the path, not a verdict.
              // A drifted baseline forces 'baseline_review' inside progressForTarget: we must NOT render a
              // green pass computed on a base year the note beneath this chip has flagged as changed.
              const drifted = driftFor(sc, d) != null
              const assessedYear = latestActualYear(years, sc)
              let status: TargetProgress['status'] = 'no_actual'
              if (assessedYear != null && assessedYear >= d.baseYear && assessedYear <= d.targetYear) {
                const yr = years.find(y => y.year === assessedYear)
                const actual = yr ? (yr[scopeActualField(sc)] ?? null) : null
                const prog: TargetProgress = progressForTarget({
                  baseYear: d.baseYear, baseEmissions: base, targetYear: d.targetYear, reductionPct: d.reductionPct,
                  method: 'absolute_aca', scope: sc, assessedYear, actual, effortEvidence: false, baselineDrifted: drifted,
                })
                status = prog.status
              }

              return (
                <div key={sc} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400 }}>{scopeLabel(sc)}</div>
                    <span style={pillStyle(status)}>{PILL[status].label}</span>
                  </div>
                  {driftNote(sc, d)}
                  {chart(buildChartData(traj, years, sc))}
                </div>
              )
            })}
          </div>
        )}

        {/* NET-ZERO — required + actual, "Long-term target" label, NO on/off-track badge */}
        {netZero.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {netZero.map(sc => {
              const d = netZeroDrafts[sc]
              if (!d) return null
              const base = baselineForCommitted(sc, d) // grade against the FROZEN baseline, not the live inventory
              if (base == null) return mutedCard(sc, 'No baseline emissions for this scope.')
              const traj = computeTrajectory({ baseYear: d.baseYear, baseEmissions: base, targetYear: d.targetYear, reductionPct: d.reductionPct, method: 'absolute_aca' })
              if (traj.length === 0) return mutedCard(sc, 'Trajectory unavailable for this target.')
              return (
                <div key={sc} style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400 }}>{scopeLabel(sc)}</div>
                    <span style={pillStyle('long_term')}>{PILL.long_term.label}</span>
                  </div>
                  {driftNote(sc, d)}
                  {chart(buildChartData(traj, years, sc))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  if (!isPaid) {
    return (
      <PaywallCard
        title="Unlock SBTi target-setting"
        body="SBTi target-setting and monitoring is part of the GHG module. Unlock GHG to set science-based targets under the Corporate Net-Zero Standard V2.0, track your trajectory, and monitor progress."
        href="/pricing?modules=ghg"
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

        {/* Company picker — shown only when the account has more than one company. Stays mounted
            during a switch (gated on allSeries, NOT loading) so it doesn't flicker; the content
            below swaps to "Loading…" while the selected company's targets load. */}
        {allSeries.length > 1 && (
          <div style={{ marginBottom: 20, maxWidth: 420 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Company
            </label>
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => onPickCompany(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
            >
              {selectedCompanyId == null && <option value="" disabled>Select a company…</option>}
              {allSeries.map((s) => (
                <option key={s.companyId} value={s.companyId}>
                  {s.company} ({s.years.length} year{s.years.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading + empty/select states live ABOVE the step shell — no steps until a company is
            actually chosen. Three distinct states: no companies at all → onboarding; companies
            exist but none selected (2+ and no ?companyId=) → "select a company"; else summary/wizard. */}
        {loading ? (
          <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Loading…</div>
        ) : allSeries.length === 0 ? (
          <div style={{ background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div style={eyebrow}>No inventory yet</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, marginBottom: 6 }}>Set up your GHG inventory first</div>
            <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 18px' }}>
              SBTi categorisation reads from your GHG company. Create a GHG inventory, then come back to set targets.
            </p>
            <a href="/dashboard/ghg" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: '#0d0d0d', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to GHG inventory →</a>
          </div>
        ) : !companyId ? (
          <div style={{ background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 400, color: '#0d0d0d' }}>Select a company to view or set its science-based targets.</div>
          </div>
        ) : view === 'summary' ? (
          <SbtiSummary onEdit={() => setView('wizard')} />
        ) : (
          <>
            {/* Step-tab header (mirrors the GHG wizard tab bar) */}
            <div style={{ display: 'flex', borderBottom: '0.5px solid #e8e7e4', marginBottom: 24, overflowX: 'auto' as const }}>
              {STEPS.map((s, i) => (
                <button
                  key={s}
                  onClick={() => setStep(i)}
                  style={{ fontSize: 12, padding: '12px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : 'var(--color-ink-muted)', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}
                >
                  {i + 1}. {s}
                </button>
              ))}
            </div>

            {/* ── Step 1 · Company profile (unchanged behaviour, now gated on step 0) ── */}
            {step === 0 && (
              <>
                <div style={eyebrow}>Step 1 · Company profile</div>
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }}>
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
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5, marginBottom: 8 }}>
                    Gates the high-income categorisation route (Route 2 — the emissions / two-of-three thresholds).
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setHighIncome(true); setDirty(true) }} style={toggleBtn(highIncome === true)}>Yes</button>
                    <button onClick={() => { setHighIncome(false); setDirty(true) }} style={toggleBtn(highIncome === false)}>No</button>
                  </div>
                </div>

                <div style={{ marginTop: 24, background: catBg, border: `1px solid color-mix(in srgb, ${catColor} 13%, transparent)`, borderRadius: 14, padding: '1.6rem 1.8rem' }}>
                  <div style={eyebrow}>Live categorisation</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 400, color: catColor, lineHeight: 1.1 }}>
                    Category {result.category}
                  </div>
                  <div style={{ fontSize: 13, color: '#555553', fontWeight: 400, marginTop: 6 }}>{basisLabel(result.matchedRoute)}</div>
                  {highIncome === null && (
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 10 }}>
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
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  Pick the standard version and the scopes <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>{companyName}</strong> will set targets for.
                </p>

                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Standard version</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
                    <button onClick={() => pickStandard('v2_0')} style={toggleBtn(standardVersion === 'v2_0')}>Corporate Net-Zero V2.0</button>
                    <button onClick={() => pickStandard('v1_3_1')} style={toggleBtn(standardVersion === 'v1_3_1')}>V1.3.1</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5 }}>
                    V2.0 is effective {VERSION_DATES.v2_0EffectiveDate}, mandatory {VERSION_DATES.v2_0MandatoryDate}; V1.3.1 accepted through {VERSION_DATES.v1_3_1AcceptedUntil}.
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={labelStyle}>Scopes to set targets for</label>
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5, marginBottom: 8 }}>
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
                        <span style={{ color: '#555553', fontWeight: 400 }}>
                          {SCOPE_LABEL[scope]}{!ok && reasons.length > 0 ? ` — ${reasons.join('; ')}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 18 }}>Targets are created in the next step.</div>
              </>
            )}

            {/* ── Step 3 · Near-term targets (cards + ACA-suggested + live validation; NO persist/trajectory) ── */}
            {step === 2 && (
              <>
                <div style={eyebrow}>Step 3 · Near-term targets</div>
                <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                  One near-term target per selected scope. The reduction % is pre-filled with the SBTi ACA-suggested rate; edit any field and it re-validates live.
                </p>

                {/* Estimation disclosure — SBTi permits estimation where it is DISCLOSED, so we
                    surface it (do NOT gate target-setting on it). Same amber treatment gwpConsistent
                    carries on the trends page. baselinePctEstimated: this baseline's estimated share;
                    estimationConsistent: whether the years being compared share one evidence basis. */}
                {series && series.baselinePctEstimated != null && series.baselinePctEstimated > 0 && (
                  <div style={{ background: '#FDF6EC', border: '0.5px solid #EAD9BE', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--color-module-climate)', lineHeight: 1.6 }}>
                    Baseline includes <strong>{series.baselinePctEstimated.toFixed(1)}%</strong> estimated data (extrapolated from partial bills). SBTi permits estimation where it is disclosed.
                  </div>
                )}
                {series && !series.estimationConsistent && (
                  <div style={{ background: '#FDF6EC', border: '0.5px solid #EAD9BE', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--color-module-climate)', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 600 }}>Evidence basis varies across years</span> — one or more reporting years include estimated data, so a year-over-year comparison may not be like-for-like.
                  </div>
                )}

                {/* REFUSAL, not a caution. A target is a published commitment: if the base year's
                    figures aren't whole, the reduction % is computed from a number that was never
                    the company's emissions, and every later year is graded against it. Red, and
                    the inputs below are absent because baselineByScope was never set. */}
                {series && !series.baselineUsable && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 16px', marginBottom: 12, fontSize: 12.5, color: '#991B1B', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>We can&rsquo;t set a target against {series.baselineYear} yet</div>
                    <div>{describeYearStatus(series.years.find(y => y.year === series.baselineYear)!) ?? `${series.baselineYear} can’t be used as a base year.`}</div>
                    <div style={{ marginTop: 4 }}>
                      A target says &ldquo;we will cut emissions by X% from this year&rdquo;, so the base year has to be a
                      complete figure. Fix that year in your inventory and it will appear here — we won&rsquo;t quietly
                      use a different year instead.
                    </div>
                  </div>
                )}

                {/* The current-emissions figure is a separate refusal from the baseline: the latest
                    year can be unusable while the base year is fine, and vice versa. */}
                {series && series.years.length > 0 && series.years[series.years.length - 1].dataStatus !== 'ok' && (
                  <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12.5, color: 'var(--color-module-climate)', lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 600 }}>Your most recent year isn&rsquo;t being used</span> — {describeYearStatus(series.years[series.years.length - 1])} Progress is graded against the most recent year we can stand behind, not that one.
                  </div>
                )}

                {selectedScopes.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400 }}>No scopes selected — go back to Step 2 to choose scopes.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {selectedScopes.map(sc => {
                      const base = baselineForDrafting(sc) // Step 3 drafting: the user is choosing a baseline → live series

                      // S3 with no Scope 3 inventory → routing empty-state (no editable inputs).
                      if (sc === 's3' && base === null) {
                        return (
                          <div key={sc} style={cardStyle}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400, marginBottom: 8 }}>{SCOPE_LABEL[sc]}</div>
                            <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: 12 }}>
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
                      // Live trajectory from the CURRENT draft (not the DB); empty for invalid configs.
                      const traj = (v.ok && base != null)
                        ? computeTrajectory({ baseYear: d.baseYear, baseEmissions: base, targetYear: d.targetYear, reductionPct: d.reductionPct, method: 'absolute_aca' })
                        : []

                      return (
                        <div key={sc} style={cardStyle}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400, marginBottom: 6 }}>{SCOPE_LABEL[sc]}</div>
                          {base != null && (
                            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: 14 }}>
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
                          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 8 }}>
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
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontWeight: 400, color: '#555553' }}>
                                  {v.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>

                          {/* Live trajectory preview (computeTrajectory) — base year → target year */}
                          <div style={{ marginTop: 14, height: 160 }}>
                            {v.ok && base != null && traj.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={traj} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e7e4" />
                                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} />
                                  <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} width={52} tickFormatter={(val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                                  <Line type="monotone" dataKey="emissions" stroke="#7425e3" strokeWidth={2} dot={false} />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, background: '#f8f7f5', borderRadius: 8 }}>
                                Fix the target to preview the trajectory.
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {selectedScopes.length > 0 && (
                  <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button
                      onClick={saveTargets}
                      disabled={savingTargets}
                      style={{ fontSize: 14, fontWeight: 600, padding: '11px 28px', borderRadius: 8, border: 'none', cursor: savingTargets ? 'not-allowed' : 'pointer', background: savedTargets ? '#E1F5EE' : GRAD, color: savedTargets ? '#0F6E56' : '#0d0d0d' }}
                    >
                      {savingTargets ? 'Saving…' : savedTargets ? '✓ Saved' : 'Save targets'}
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 12 }}>Targets save to your account here; the trajectory previews update live as you edit.</div>
              </>
            )}

            {/* ── Step 4 · Net-zero targets (cards + 90%/2050 defaults + isNetZero validation; NO persist/chart) ── */}
            {step === 3 && (
              <>
                <div style={eyebrow}>Step 4 · Net-zero targets</div>

                {nearTermTargetScopes.length === 0 ? (
                  <div style={{ background: '#f8f7f5', border: '1px solid #e8e7e4', borderRadius: 14, padding: '2.5rem 2rem', textAlign: 'center' }}>
                    <div style={eyebrow}>Near-term first</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 400, marginBottom: 6 }}>Set your near-term targets first</div>
                    <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, maxWidth: 460, margin: '0 auto 18px' }}>
                      Net-zero builds on your near-term targets. Save at least one near-term target, then come back.
                    </p>
                    <button onClick={() => setStep(2)} style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: '#0d0d0d', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}>← Back to near-term targets</button>
                  </div>
                ) : (
                  <>
                    <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }}>
                      A net-zero target per scope that has a near-term target. Defaults to the {NET_ZERO.minAbsoluteReductionPct}% floor by {NET_ZERO.latestNetZeroYear}; edit and it re-validates live.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {nearTermTargetScopes.map(sc => {
                        const base = baselineForDrafting(sc) // Step 4 drafting: choosing a net-zero baseline → live series
                        const d = netZeroDrafts[sc]
                        if (!d) return null // seeded by the net-zero lazy-init effect

                        // isNetZero: true ⇒ R5 (≥90%) / R6 (≤2050) / R9 (absolute) fire.
                        const v = validateTargetConfig({ standardVersion, scope: sc, method: 'absolute_aca', baseYear: d.baseYear, targetYear: d.targetYear, reductionPct: d.reductionPct, isNetZero: true }, {})
                        // Live net-zero trajectory from the CURRENT draft; net-zero year defaults to 2050 if unset.
                        const nzTargetYear = d.targetYear || NET_ZERO.latestNetZeroYear
                        const traj = (v.ok && base != null)
                          ? computeTrajectory({ baseYear: d.baseYear, baseEmissions: base, targetYear: nzTargetYear, reductionPct: d.reductionPct, method: 'absolute_aca' })
                          : []

                        return (
                          <div key={sc} style={cardStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 400 }}>{SCOPE_LABEL[sc]}</div>
                              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7425e3', background: '#EDE9FE', borderRadius: 99, padding: '2px 8px' }}>Net-zero</span>
                            </div>
                            {base != null && (
                              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: 14 }}>
                                Base: {base.toLocaleString(undefined, { maximumFractionDigits: 1 })} tCO₂e{baselineYear != null ? ` (${baselineYear})` : ''}
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                              <div>
                                <label style={labelStyle}>Base year</label>
                                <input style={inputStyle} type="number" value={d.baseYear} onChange={e => updateNetZeroDraft(sc, 'baseYear', Number(e.target.value))} />
                              </div>
                              <div>
                                <label style={labelStyle}>Target year</label>
                                <input style={inputStyle} type="number" value={d.targetYear} onChange={e => updateNetZeroDraft(sc, 'targetYear', Number(e.target.value))} />
                              </div>
                              <div>
                                <label style={labelStyle}>Reduction %</label>
                                <input style={inputStyle} type="number" value={d.reductionPct} onChange={e => updateNetZeroDraft(sc, 'reductionPct', Number(e.target.value))} />
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 8 }}>
                              Net-zero requires ≥{NET_ZERO.minAbsoluteReductionPct}% reduction by ≤{NET_ZERO.latestNetZeroYear}, absolute method.
                            </div>
                            <div style={{ marginTop: 12, fontSize: 13 }}>
                              {v.ok ? (
                                <span style={{ color: '#0F6E56', fontWeight: 600 }}>✓ Valid net-zero target</span>
                              ) : (
                                <div style={{ color: '#B91C1C' }}>
                                  <span style={{ fontWeight: 600 }}>✗ Invalid</span>
                                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontWeight: 400, color: '#555553' }}>
                                    {v.reasons.map((r, i) => <li key={i}>{r}</li>)}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Live trajectory preview (computeTrajectory) — base year → net-zero year */}
                            <div style={{ marginTop: 14, height: 160 }}>
                              {v.ok && base != null && traj.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={traj} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e7e4" />
                                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} />
                                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-muted)' }} width={52} tickFormatter={(val) => Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })} />
                                    <Line type="monotone" dataKey="emissions" stroke="#7425e3" strokeWidth={2} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, background: '#f8f7f5', borderRadius: 8 }}>
                                  Fix the target to preview the trajectory.
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Honest-scoping note — a per-target ✓ is NOT full net-zero compliance. */}
                    <div style={{ marginTop: 20, background: '#FEF3E2', border: '1px solid var(--color-module-climate)33', borderRadius: 12, padding: '1rem 1.2rem' }}>
                      <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.65 }}>
                        <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>These checks are per-target only.</strong> A ✓ confirms this scope&rsquo;s net-zero rules (≥{NET_ZERO.minAbsoluteReductionPct}% reduction, ≤{NET_ZERO.latestNetZeroYear}, absolute method). It does <strong style={{ fontWeight: 600 }}>not</strong> confirm full net-zero compliance, which also requires aggregate coverage of ≥90% of total emissions across all scopes, ≥90% Scope 3 coverage, and neutralisation of residual emissions via permanent removals — all assessed separately in a later step.
                      </div>
                    </div>

                    <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
                      <button
                        onClick={saveNetZero}
                        disabled={savingNetZero}
                        style={{ fontSize: 14, fontWeight: 600, padding: '11px 28px', borderRadius: 8, border: 'none', cursor: savingNetZero ? 'not-allowed' : 'pointer', background: savedNetZero ? '#E1F5EE' : GRAD, color: savedNetZero ? '#0F6E56' : '#0d0d0d' }}
                      >
                        {savingNetZero ? 'Saving…' : savedNetZero ? '✓ Saved' : 'Save net-zero targets'}
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginTop: 12 }}>Net-zero targets save to your account here, alongside your near-term targets.</div>
                  </>
                )}
              </>
            )}

            {/* Back / Continue nav (mirrors the GHG wizard) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={step === 0}
                style={{ ...(step === 0 ? btnStepDisabled : btnStep) }}
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
