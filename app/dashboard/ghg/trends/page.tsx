'use client'

/**
 * GHG multi-year trends — Phase 2 (chart view).
 * Calls loadCompanySeries() and renders an emissions-over-time stacked bar chart
 * per company (Scope 1 / 2 location-based / 3). Scope 3 is shown as a true gap
 * (no segment) for years with no Scope 3 record — never a zero bar.
 *
 * 'use client' is required: the loader uses the browser supabase singleton and
 * relies on the user's auth session for RLS. A server component would see no
 * session and RLS would filter everything out.
 *
 * This is the real route (/dashboard/ghg/trends), gated on the ghg entitlement.
 * Trend view only — no target/pathway line (SBTi pathway is a later phase).
 */

import { useEffect, useState } from 'react'
import { BarChart, ComposedChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, ReferenceLine, LineChart, Line } from 'recharts'
import { loadCompanySeries, type LoadSeriesResult } from '../../../../lib/ghg/loadSeries'
import { supabase } from '../../../../lib/supabase'
import { computeTrajectory } from '../../../../lib/sbti'
import { loadMonthly, type LoadMonthlyResult } from '../../../../lib/ghg/loadMonthly'
import { useEntitlement } from '../../../../lib/useEntitlement'

// Brand palette for the three scopes.
const COLORS = { scope1: '#7425e3', scope2: '#22ACFE', scope3: '#64FE3E' }

const NET_ZERO_END_YEAR = 2050

// An sbti_targets row as read for the trends overlay (S1 / S2 only). Fields nullable to match the DB.
type TargetRow = {
  scope: string
  target_type: string
  base_year: number | null
  base_year_emissions_tco2e: number | null
  target_year: number | null
  reduction_pct: number | null
  method: 'absolute_aca' | 'intensity'
}

// Combined Scope 1 + Scope 2 SBTi target pathway. For each scope, the binding obligation at each
// year is the LOWER (more ambitious) of its near-term path (base_year → target_year) and its
// net-zero path (base_year → 2050) — min-of-trajectories, NOT concatenation at the handover. Then
// SUM the two scopes by year. The min draws the true binding constraint and never ascends: the
// net-zero path only governs once it has descended below the near-term path (so no 2035 seam bump).
// Each scope's path is computed INDEPENDENTLY from its own saved row — base emissions are never
// merged; only the resulting per-year emissions are added. So the combined value at the base year
// equals (S1 saved base emissions + S2 saved base emissions), which is intended to sit at the GHG
// baselineScope12Total level. We do NOT rescale to force that match — real differences stay visible.
// Intensity rows contribute no points (computeTrajectory returns [] for them). Years where only one
// scope has a point use that scope's value alone (per the agreed construction rule).
function buildCombinedTargetSeries(rows: TargetRow[]): { year: number; target: number }[] {
  const traj = (r: TargetRow | undefined) =>
    r && r.base_year != null && r.base_year_emissions_tco2e != null && r.target_year != null && r.reduction_pct != null
      ? computeTrajectory({ baseYear: r.base_year, baseEmissions: r.base_year_emissions_tco2e, targetYear: r.target_year, reductionPct: r.reduction_pct, method: r.method })
      : []
  const byYear = new Map<number, number>()
  for (const sc of ['s1', 's2_location'] as const) {
    const near = rows.find((r) => r.scope === sc && r.target_type === 'near_term')
    const nz = rows.find((r) => r.scope === sc && r.target_type === 'net_zero')
    // Binding obligation per year = the LOWER of whichever trajectory defines it (min, not concat).
    const nearMap = new Map(traj(near).map((p) => [p.year, p.emissions]))
    const nzMap = new Map(traj(nz).map((p) => [p.year, p.emissions]))
    for (const y of new Set<number>([...nearMap.keys(), ...nzMap.keys()])) {
      const a = nearMap.get(y)
      const b = nzMap.get(y)
      const v = a != null && b != null ? Math.min(a, b) : (a ?? b!) // only one defined ⇒ use it
      byYear.set(y, (byYear.get(y) ?? 0) + v)
    }
  }
  return Array.from(byYear.entries())
    .map(([year, target]) => ({ year, target }))
    .sort((a, b) => a.year - b.year)
}

export default function TrendsPage() {
  const isPaid = useEntitlement('ghg')
  const [result, setResult] = useState<LoadSeriesResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [monthly, setMonthly] = useState<LoadMonthlyResult | null>(null)
  const [monthlyLoading, setMonthlyLoading] = useState(false)
  const [targetRows, setTargetRows] = useState<TargetRow[]>([]) // S1/S2 sbti_targets for the SBTi overlay

  useEffect(() => {
    loadCompanySeries().then((r) => {
      setResult(r)
      setSelectedCompanyId(r.series[0]?.companyId ?? null)
      setLoading(false)
    })
  }, [])

  // Resolve the in-scope company the same way the render does (find by id, else
  // first). Done here (not via the `selected` const) because that const lives
  // after the isPaid early-return, so an effect can't reference it (rules of hooks).
  const selectedSeries =
    result?.series.find((s) => s.companyId === selectedCompanyId) ?? result?.series[0] ?? null

  // Default / reset the year to the company's latest annual year on company change.
  useEffect(() => {
    if (selectedSeries) setSelectedYear(selectedSeries.years.at(-1)?.year ?? null)
  }, [selectedSeries?.companyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch monthly rows for the selected company + year.
  useEffect(() => {
    if (selectedSeries?.companyId && selectedYear != null) {
      setMonthlyLoading(true)
      loadMonthly(selectedSeries.companyId, selectedYear).then((r) => {
        setMonthly(r)
        setMonthlyLoading(false)
      })
    }
  }, [selectedSeries?.companyId, selectedYear])

  // Fetch S1/S2 sbti_targets (both near_term + net_zero) for the SBTi target overlay.
  // RLS scopes to the logged-in user. On error / no rows → empty → no overlay (chart = Move 1).
  useEffect(() => {
    const cid = selectedSeries?.companyId
    if (!cid) { setTargetRows([]); return }
    let cancelled = false
    supabase
      .from('sbti_targets')
      .select('scope, target_type, base_year, base_year_emissions_tco2e, target_year, reduction_pct, method')
      .eq('company_id', cid)
      .in('scope', ['s1', 's2_location']) // S1 + S2 only — never S3 in the target line
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('SBTi targets fetch (trends overlay) failed:', error); setTargetRows([]); return }
        setTargetRows((data as TargetRow[]) ?? [])
      })
    return () => { cancelled = true }
  }, [selectedSeries?.companyId])

  if (!isPaid) {
    return (
      <div style={{ padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Georgia, serif' }}>GHG Trends</h1>
        <p>This view requires the GHG module. Visit Pricing to unlock it.</p>
      </div>
    )
  }

  const selected =
    result?.series.find((s) => s.companyId === selectedCompanyId) ?? result?.series[0] ?? null

  // One row per year. scope3 stays null (NOT 0) when the year has no Scope 3
  // record, so recharts renders a true gap rather than a zero-height segment.
  const chartData = selected
    ? selected.years.map((y) => ({
        year: y.year,
        scope1: y.scope1,
        scope2: y.scope2Location,
        scope3: y.scope3,
      }))
    : []

  // ── SBTi target overlay (combined S1+S2 pathway, base→2035 near-term stitched into →2050 net-zero) ──
  const targetSeries = selected ? buildCombinedTargetSeries(targetRows) : []
  const hasTarget = targetSeries.length > 0

  // Merge actuals (bars) with the target pathway. Actual years keep their bar values + (if present)
  // the target value; future years (beyond the latest actual) carry the target only, bars null.
  type ChartRow = { year: number; scope1: number | null; scope2: number | null; scope3: number | null; target: number | null }
  const targetByYear = new Map(targetSeries.map((p) => [p.year, p.target]))
  const lastActualYear = chartData.length ? chartData[chartData.length - 1].year : null
  const mergedData: ChartRow[] = [
    ...chartData.map((d) => ({ year: d.year, scope1: d.scope1, scope2: d.scope2, scope3: d.scope3, target: targetByYear.get(d.year) ?? null })),
    ...targetSeries
      .filter((p) => lastActualYear == null || p.year > lastActualYear)
      .map((p) => ({ year: p.year, scope1: null, scope2: null, scope3: null, target: p.target })),
  ].sort((a, b) => a.year - b.year)

  // Widen the numeric x-axis to baseline→2050 ONLY when a target exists (else identical to Move 1).
  const xDomain: [number | string, number | string] =
    hasTarget && selected ? [selected.baselineYear, NET_ZERO_END_YEAR] : ['dataMin', 'dataMax']
  const xTicks =
    hasTarget && selected
      ? Array.from({ length: Math.floor((NET_ZERO_END_YEAR - selected.baselineYear) / 5) + 1 }, (_, i) => selected.baselineYear + i * 5)
          .concat(NET_ZERO_END_YEAR)
          .filter((v, i, a) => a.indexOf(v) === i)
      : undefined

  const missingS3Years = selected
    ? selected.years.filter((y) => y.scope3 === null).map((y) => y.year)
    : []

  const gwpVersion = selected?.years[0]?.gwpVersion ?? 'AR6'

  // Derived metrics for the cards / intensity strip (all from CompanySeries).
  const latest = selected?.years.at(-1) ?? null
  const baselineRow = selected?.years.find((y) => y.year === selected.baselineYear) ?? null
  const intensityDelta =
    latest?.perRevenue != null && baselineRow?.perRevenue != null
      ? latest.perRevenue - baselineRow.perRevenue
      : null
  const allHavePerRevenue = !!selected && selected.years.every((y) => y.perRevenue != null)

  return (
    <div style={{ padding: '2rem', maxWidth: 960, margin: '0 auto' }}>
      <a href="/dashboard/ghg?view=list" style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>← Back to GHG inventory</a>
      <h1 style={{ fontFamily: 'Georgia, serif', marginBottom: 4 }}>GHG Trends</h1>
      <p style={{ color: '#666', fontSize: 13, marginBottom: 20 }}>
        Emissions over time by scope. Location-based Scope 2.
      </p>

      {loading && <p>Loading…</p>}

      {!loading && result?.error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '1rem', color: '#991B1B' }}>
          <strong>Load error:</strong> {result.error}
        </div>
      )}

      {!loading && result && !result.error && result.series.length === 0 && (
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.5rem', color: '#555553', fontSize: 14 }}>
          No inventories yet — <a href="/dashboard/ghg?view=list" style={{ color: '#7425e3', fontWeight: 600, textDecoration: 'none' }}>create a GHG inventory</a> to see trends.
        </div>
      )}

      {!loading && result && !result.error && selected && (
        <>
          {/* Company selector */}
          <div style={{ marginBottom: 20, maxWidth: 420 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>
              Company
            </label>
            <select
              value={selected.companyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
            >
              {result.series.map((s) => (
                <option key={s.companyId} value={s.companyId}>
                  {s.company} ({s.years.length} year{s.years.length === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>

          {/* Header: company, baseline, GWP basis */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', color: '#0d0d0d' }}>{selected.company}</div>
            <div style={{ fontSize: 12, color: '#888784', marginTop: 4 }}>
              Baseline year {selected.baselineYear}
              {' · '}
              {selected.gwpConsistent ? (
                <span>GWP basis: {gwpVersion}</span>
              ) : (
                <span style={{ color: '#ba7517', fontWeight: 600 }}>Mixed GWP basis — comparison may not be valid</span>
              )}
            </div>
          </div>

          {/* Metric cards — all derived from CompanySeries */}
          {latest && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#0d0d0d' }}>{Math.round(latest.scope12Total).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>tCO₂e · Scope 1+2 · {latest.year}</div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: latest.vsBaselinePct == null ? '#888784' : latest.vsBaselinePct <= 0 ? '#0F6E56' : '#BA7517' }}>
                  {latest.vsBaselinePct == null ? '—' : `${latest.vsBaselinePct > 0 ? '+' : ''}${latest.vsBaselinePct}%`}
                </div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>vs {selected.baselineYear}</div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#0d0d0d' }}>{latest.perRevenue == null ? '—' : latest.perRevenue}</div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>
                  per $M revenue
                  {intensityDelta != null && (
                    <span style={{ color: intensityDelta <= 0 ? '#0F6E56' : '#BA7517', fontWeight: 600 }}>{' '}({intensityDelta > 0 ? '+' : ''}{intensityDelta.toFixed(2)})</span>
                  )}
                </div>
              </div>
              <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: '#0F6E56' }}>94%</div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>measured · limited assurance</div>
              </div>
            </div>
          )}

          {/* Stacked bar chart: Scope 1 / 2 (location) / 3 */}
          <div style={{ width: '100%', height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={mergedData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e7e4" />
                <XAxis dataKey="year" type="number" domain={xDomain} allowDecimals={false} ticks={xTicks} tickCount={chartData.length} tick={{ fontSize: 12, fill: '#555553' }} />
                <YAxis
                  tick={{ fontSize: 12, fill: '#555553' }}
                  label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#888784' } }}
                />
                <Tooltip />
                <Legend />
                <ReferenceLine y={selected.baselineScope12Total} stroke="#BA7517" strokeDasharray="4 4" label={{ value: 'baseline', position: 'insideTopRight', fontSize: 11, fill: '#854F0B' }} />
                <Bar dataKey="scope1" stackId="emissions" name="Scope 1" fill={COLORS.scope1} barSize={hasTarget ? 22 : undefined} />
                <Bar dataKey="scope2" stackId="emissions" name="Scope 2 (location)" fill={COLORS.scope2} barSize={hasTarget ? 22 : undefined} />
                <Bar dataKey="scope3" stackId="emissions" name="Scope 3" fill={COLORS.scope3} barSize={hasTarget ? 22 : undefined} />
                {hasTarget && (
                  <Line type="monotone" dataKey="target" name="SBTi target pathway" stroke="#0d0d0d" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Per-year delta callouts (vs baseline, on Scope 1+2) */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 8, paddingLeft: 8, fontSize: 12 }}>
            {selected.years.map((y) => (
              <span key={y.year} style={{ color: '#555553' }}>
                <strong style={{ color: '#0d0d0d' }}>{y.year}</strong>{' '}
                {y.year === selected.baselineYear || y.vsBaselinePct == null ? (
                  <span style={{ color: '#888784' }}>baseline</span>
                ) : (
                  <span style={{ color: y.vsBaselinePct <= 0 ? '#0F6E56' : '#BA7517', fontWeight: 600 }}>
                    {y.vsBaselinePct > 0 ? '+' : ''}{y.vsBaselinePct}%
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Intensity strip — only when every year has a revenue intensity */}
          {allHavePerRevenue && (
            <div style={{ marginTop: 20 }}>
              <div style={{ width: '100%', height: 96 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selected.years.map((y) => ({ year: y.year, perRevenue: y.perRevenue }))} margin={{ top: 18, right: 24, bottom: 4, left: 8 }}>
                    <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#888784' }} />
                    <YAxis hide domain={['dataMin', 'dataMax']} />
                    <Tooltip />
                    <Line type="monotone" dataKey="perRevenue" stroke="#7425e3" strokeWidth={2} dot={{ r: 3 }} label={{ position: 'top', fontSize: 11, fill: '#7425e3', formatter: (v) => (typeof v === 'number' ? v.toFixed(1) : v) }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p style={{ fontSize: 11, color: '#888784', marginTop: 4, lineHeight: 1.6 }}>
                Intensity — tCO₂e per $M revenue. Falling intensity with rising revenue shows real decoupling.
              </p>
            </div>
          )}

          {/* Scope 3 not reported marker */}
          {missingS3Years.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#ba7517', lineHeight: 1.6 }}>
              Scope 3 not reported for: {missingS3Years.join(', ')}.{' '}
              <a href="/dashboard/scope3" style={{ color: '#ba7517', fontWeight: 600 }}>Complete Scope 3</a> to include it.
            </div>
          )}

          {/* Monthly drill-down (concierge bill data) */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h3 style={{ fontFamily: 'Georgia, serif', fontSize: 18, margin: 0 }}>Monthly detail</h3>
              <select
                value={selectedYear ?? ''}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                style={{ fontSize: 13, padding: '8px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }}
              >
                {selected.years.map((y) => (
                  <option key={y.year} value={y.year}>{y.year}</option>
                ))}
              </select>
            </div>

            {monthlyLoading && <p style={{ color: '#888', fontSize: 13 }}>Loading monthly data…</p>}

            {!monthlyLoading && monthly && monthly.error && (
              <p style={{ color: '#b91c1c', fontSize: 13 }}>Couldn&apos;t load monthly data: {monthly.error}</p>
            )}

            {!monthlyLoading && monthly && !monthly.error && monthly.buckets.length === 0 && (
              <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '14px 16px', fontSize: 13, color: '#555' }}>
                No monthly (utility-bill) data for {selectedYear}. Monthly detail appears
                when you upload dated utility bills via the Concierge flow. Manually-entered
                annual figures show in the yearly chart above.
              </div>
            )}

            {!monthlyLoading && monthly && !monthly.error && monthly.buckets.length > 0 && (
              <>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <BarChart data={monthly.buckets} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e8e7e4" />
                      <XAxis dataKey="monthLabel" tick={{ fontSize: 12, fill: '#555' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#555' }} label={{ value: 'tCO₂e', angle: -90, position: 'insideLeft', style: { fontSize: 12, fill: '#888' } }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="scope1" stackId="m" name="Scope 1" fill={COLORS.scope1} />
                      <Bar dataKey="scope2" stackId="m" name="Scope 2 (location)" fill={COLORS.scope2} />
                      <Bar dataKey="scope3" stackId="m" name="Scope 3" fill={COLORS.scope3} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p style={{ marginTop: 8, fontSize: 11, color: '#888784', lineHeight: 1.6 }}>
                  {monthly.measuredMonths} month{monthly.measuredMonths === 1 ? '' : 's'} with utility-bill data ·{' '}
                  {monthly.totalTco2e.toLocaleString()} tCO₂e total. Months without dated bills are omitted —
                  this is a partial, concierge-sourced view; the yearly chart above is authoritative.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
