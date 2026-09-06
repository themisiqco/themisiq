'use client'

// app/dashboard/cbam/report/page.tsx
// Renders the §1.2 SUMMARY emissions report from GET /api/cbam/report — the
// surface a customer reads before handing figures to an EU importer. How this
// renders ABSENCE matters as much as how it renders values.
//
// THREE STATUSES, NEVER COLLAPSED (lib/cbam/report/types.ts ReportField<T>):
//   'value'          — the figure/text, rendered plainly and prominently.
//   'not_applicable' — a legitimate answer with a REASON (e.g. 'Annex II good —
//                      direct emissions only'). Neutral/muted. Nothing is wrong.
//   'missing'        — a genuine gap. An actionable to-do, visually distinct
//                      from not_applicable. A reader must never confuse "does
//                      not apply" with "not yet supplied".
// A missing/not_applicable field is NEVER shown as 0, blank, or '—' alone.
//
// The `missing` array is a PRIMARY FEATURE, not an error list: rendered as a
// prominent checklist near the top, never filtered or truncated.
//
// AUTH differs from the disclosures sibling: this route needs a BEARER TOKEN.
// We read the session and send Authorization: Bearer <access_token>. Without
// it the route returns 401.
//
// 409 stale_record is the important error: a recomputation disagreed with a
// stored figure. We render the full message verbatim and show NO report
// alongside it — never present figures that disagree with what was stored.

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import { cbamInputStyle, CbamField } from '../components/DisclosureQuestion'
import { exportReportXlsx } from './exportXlsx'
import type {
  Report12, ReportField, MissingField, CompletenessResult, Coordinates, ProcessSummary,
  Item4Good, Item5TotalDirect,
} from '../../../../lib/cbam/report/types'
import type { SefaBenchmarkWorkings } from '../../../../lib/cbam/sefaCompute'
import { itemHeadTight as itemHead, sectionHeadFixed as sectionHead } from '@/app/components/headingStyles'

// ── House style, matching app/dashboard/cbam/page.tsx ──
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }

type AnyField = ReportField<unknown>

interface ReportResponse {
  report: Report12
  missing: MissingField[]
  completeness: CompletenessResult
  processesWithoutRecord: string[]
  processesCompleteDeclaredAt: string | null
}

interface ErrState {
  status: number
  message: string
  // Discriminator from the response body, where the route sends one. Status alone is not enough:
  // two different failures share 409 and need opposite remedies, so ErrorPanel branches on this
  // first. Absent for every response that carries no code.
  code?: string
}

// ── Value formatters (only ever called on status 'value') ──
function fmtNum(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 })
}
function fmtBool(b: boolean): string {
  return b ? 'Yes' : 'No'
}
function fmtCoords(c: Coordinates): string {
  return `${c.latitude}, ${c.longitude}`
}
function fmtBenchmark(b: SefaBenchmarkWorkings): string {
  return `value ${fmtNum(b.value)} · column ${b.column} · CBAM factor ${fmtNum(b.cbamFactor)} · CSCF ${fmtNum(b.cscf)} · period band ${b.periodBand}${b.indicator ? ` · ${b.indicator}` : ''}`
}

// ── The three-status renderer — the core of this page ──
function FieldValue({ field, render }: { field: AnyField; render?: (v: never) => React.ReactNode }) {
  if (field.status === 'value') {
    return (
      <span style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>
        {render ? render(field.value as never) : String(field.value)}
      </span>
    )
  }
  if (field.status === 'not_applicable') {
    // Neutral/muted. A legitimate answer — nothing is wrong. Reason ALWAYS shown.
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#888784', background: '#f1f0ee', border: '0.5px solid #e8e7e4', borderRadius: 5, padding: '1px 7px' }}>Not applicable</span>
        <span style={{ fontSize: 12, color: '#888784', fontStyle: 'italic', fontWeight: 400 }}>{field.reason}</span>
      </span>
    )
  }
  // missing — an actionable gap, distinct from not_applicable.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#92400e', background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 5, padding: '1px 7px' }}>To supply</span>
      <span style={{ fontSize: 12, color: '#92400e', fontWeight: 400 }}>Not yet supplied</span>
    </span>
  )
}

// A labelled field row: label on the left, three-status value on the right.
function Field({ label, field, render }: { label: string; field: AnyField; render?: (v: never) => React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '9px 0', borderBottom: '0.5px solid #f1f0ee', alignItems: 'baseline' }}>
      <div style={{ width: 260, flexShrink: 0, fontSize: 12, color: '#555553', fontWeight: 400 }}>{label}</div>
      <div style={{ flex: 1 }}><FieldValue field={field} render={render} /></div>
    </div>
  )
}

function ItemSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '2rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#7425e3', flexShrink: 0 }}>{n}</span>
        <span style={itemHead}>{title}</span>
      </div>
      {children}
    </div>
  )
}

// A muted note used where an optional Part-2 item is absent from the response.
function AbsentPart2({ what }: { what: string }) {
  return <div style={{ fontSize: 12, color: '#888784', fontWeight: 400, fontStyle: 'italic' }}>{what} are not present in this report slice (no per-good computations returned).</div>
}

export default function CbamReportPage() {
  const isPaid = useEntitlement('cbam')

  const [loadingInstallations, setLoadingInstallations] = useState(true)
  const [installations, setInstallations] = useState<{ id: string; name: string; country: string; company_id: string }[]>([])
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState<number>(2026)

  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<ReportResponse | null>(null)
  const [err, setErr] = useState<ErrState | null>(null)
  const [exporting, setExporting] = useState(false)

  const selectedInstallation = installations.find((i) => i.id === selectedInstallationId) ?? null

  // ── Load the owner's installations (RLS scopes to owner) ──
  useEffect(() => {
    if (!isPaid) return
    let cancelled = false
    setLoadingInstallations(true)
    supabase
      .from('cbam_installations')
      .select('id, name, country, company_id')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setErr({ status: 0, message: error.message })
          setLoadingInstallations(false)
          return
        }
        const rows = (data ?? []) as { id: string; name: string; country: string; company_id: string }[]
        setInstallations(rows)
        setSelectedInstallationId((prev) => prev ?? rows[0]?.id ?? null)
        setLoadingInstallations(false)
      })
    return () => { cancelled = true }
  }, [isPaid])

  // Fetch ON DEMAND (button), not on every keystroke. Sends the bearer token.
  async function loadReport() {
    if (!selectedInstallationId) return
    setLoading(true)
    setErr(null)
    setData(null)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setErr({ status: 401, message: 'Your session has expired. Please sign in again to generate the report.' })
      setLoading(false)
      return
    }
    try {
      const url = `/api/cbam/report?installation_id=${encodeURIComponent(selectedInstallationId)}&reporting_period=${reportingPeriod}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const json = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        // ANY non-OK response clears the report — `data` is left null and the panel renders alone.
        // That now covers two distinct 409s, the stale-record conflict and the precursor
        // declaration gate, and figures must never appear alongside either.
        setErr({
          status: res.status,
          message: (json as { error?: string }).error ?? `Request failed (${res.status})`,
          code: (json as { code?: string }).code,
        })
        setLoading(false)
        return
      }
      setData(json as ReportResponse)
      setLoading(false)
    } catch (e) {
      setErr({ status: 0, message: e instanceof Error ? e.message : 'Network error' })
      setLoading(false)
    }
  }

  // Download the .xlsx from the SAME response object on screen — no refetch, no
  // second data path. Gated on `data` below, so it can never run (nor render)
  // while a 409 stale-record panel is showing: the file must never carry a
  // figure the screen does not. The busy state covers the dynamic xlsx import.
  async function downloadXlsx() {
    if (!data || !selectedInstallation) return
    setExporting(true)
    try {
      await exportReportXlsx({
        report: data.report,
        completeness: data.completeness,
        processesWithoutRecord: data.processesWithoutRecord,
        processesCompleteDeclaredAt: data.processesCompleteDeclaredAt,
        installationName: selectedInstallation.name,
        reportingPeriod,
      })
    } finally {
      setExporting(false)
    }
  }

  // ── Unpaid → paywall (same treatment as the disclosures page) ──
  if (!isPaid) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={{ position: 'relative', minHeight: 320 }}>
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
            <div style={sectionHead}>CBAM §1.2 summary report</div>
            <div style={sectionSub}>The Annex IV §1.2 emissions summary your customer needs, for one installation and reporting period.</div>
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>CBAM is a paid module.</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 400 }}>Generate the verifier-ready Annex IV §1.2 summary emissions report — with every field shown as a value, a reasoned N/A, or an outstanding to-do. Unlock the CBAM module to begin.</div>
              <button onClick={() => (window.location.href = '/pricing')} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d' }}>
                Unlock CBAM →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state: no installations → no report to generate ──
  if (!loadingInstallations && installations.length === 0) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={sectionHead}>CBAM §1.2 summary report</div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', marginTop: '1rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>No installations yet</div>
          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>
            A report covers one installation and reporting period, so you&rsquo;ll need to add an installation and its production processes first. You can do that in{' '}
            <a href="/dashboard/cbam/setup" style={{ color: '#7425e3', textDecoration: 'underline' }}>setup</a>, then come back here.
          </div>
        </div>
      </div>
    )
  }

  const report = data?.report

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '3rem 2rem' }}>
      <div style={sectionHead}>CBAM §1.2 summary report</div>
      <div style={sectionSub}>
        The Annex IV §1.2 emissions summary your customer needs, for one installation and reporting period. Every figure here is either supplied or explained: a field carries a <strong style={{ color: '#0d0d0d' }}>value</strong>, a <span style={{ color: '#888784' }}>Not applicable</span>{' '}with the reason it doesn&apos;t apply, or a <span style={{ color: '#92400e' }}>To supply</span>{' '}naming what&apos;s outstanding. A gap is always shown as a gap, never as a zero or a blank.
      </div>

      {/* ── Installation + reporting-period selectors + on-demand fetch ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '1rem' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <CbamField label="Installation">
            <select
              value={selectedInstallationId ?? ''}
              onChange={(e) => setSelectedInstallationId(e.target.value || null)}
              disabled={loadingInstallations || loading}
              style={cbamInputStyle}
            >
              {installations.map((i) => (
                <option key={i.id} value={i.id}>{i.name} — {i.country}</option>
              ))}
            </select>
          </CbamField>
        </div>
        <div style={{ width: 180 }}>
          <CbamField label="Reporting period" hint="Calendar year, 2026 or later.">
            <input
              type="number"
              min={2026}
              step={1}
              value={reportingPeriod}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isNaN(n)) setReportingPeriod(n)
              }}
              style={cbamInputStyle}
            />
          </CbamField>
        </div>
        <button
          type="button"
          onClick={loadReport}
          disabled={loading || !selectedInstallationId}
          style={{ fontSize: 14, fontWeight: 600, padding: '11px 24px', borderRadius: 10, border: 'none', cursor: loading || !selectedInstallationId ? 'not-allowed' : 'pointer', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', opacity: loading || !selectedInstallationId ? 0.6 : 1 }}
        >
          {loading ? 'Generating…' : 'Generate report'}
        </button>
      </div>

      {/* ── Errors — surfaced distinctly by status code ── */}
      {err && <ErrorPanel err={err} />}

      {/* A 409 (stale_record) shows NO report. Any other error may coexist with an
          earlier report only if data survived — but we clear data on every fetch,
          so err and report are mutually exclusive here. */}
      {report && data && (
        <>
          {/* Download .xlsx — only rendered with a successful report (data is
              cleared on every fetch, so this is never shown during a 409). */}
          <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={downloadXlsx}
              disabled={exporting}
              style={{ fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: '0.5px solid #7425e3', background: '#fff', color: '#7425e3', cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1 }}
            >
              {exporting ? 'Preparing .xlsx…' : 'Download .xlsx'}
            </button>
          </div>

          {/* processesWithoutRecord — the report is not fully backed by computed figures. */}
          {data.processesWithoutRecord.length > 0 && (
            <div style={{ marginTop: '1rem', background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                {data.processesWithoutRecord.length} process{data.processesWithoutRecord.length === 1 ? '' : 'es'} not backed by a computed record
              </div>
              <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, fontWeight: 400 }}>
                This report is not fully backed by computed figures. Run compute for these processes so their emissions are calculated: {data.processesWithoutRecord.join(', ')}.
              </div>
            </div>
          )}

          {/* Attestation timestamp (items 5 & 6 gate). */}
          <AttestationBanner declaredAt={data.processesCompleteDeclaredAt} />

          {/* THE missing CHECKLIST — a primary feature, near the top, never suppressed. */}
          <MissingChecklist completeness={data.completeness} />

          {/* ── All 16 items in Annex IV order ── */}
          <ItemSection n="(1)" title="Identification of the operator">
            <Field label="(1)(a) Operator name" field={report.item1_operator.name} />
            <Field label="(1)(b) Registration number" field={report.item1_operator.registrationNo} />
            <Field label="(1)(c) Full address (English)" field={report.item1_operator.address} />
          </ItemSection>

          <ItemSection n="(2)" title="The installation">
            <Field label="(2)(a) Installation name" field={report.item2_installation.name} />
            <Field label="(2)(b) CBAM Registry ID" field={report.item2_installation.cbamRegistryId} />
            <Field label="(2)(c) UN/LOCODE" field={report.item2_installation.unLocode} />
            <Field label="(2)(d) Full address (English)" field={report.item2_installation.address} />
            <Field label="(2)(e) Main-source coordinates" field={report.item2_installation.coordinates} render={(v: Coordinates) => fmtCoords(v)} />
          </ItemSection>

          <ItemSection n="(3)" title="Production processes and routes">
            <FieldValue
              field={report.item3_processes}
              render={(procs: ProcessSummary[]) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {procs.map((p) => (
                    <div key={p.processId} style={{ fontSize: 13, color: '#0d0d0d' }}>
                      <span style={{ fontWeight: 500 }}>{p.processId}</span>
                      <span style={{ color: '#555553' }}> — route {p.route ?? '(none)'} · goods {p.goods.length ? p.goods.join(', ') : '(none)'}</span>
                    </div>
                  ))}
                </div>
              )}
            />
          </ItemSection>

          <ItemSection n="(4)" title="Per-good specific embedded emissions">
            {report.item4_perGood
              ? report.item4_perGood.map((g, i) => <Item4View key={g.processId + i} g={g} />)
              : <AbsentPart2 what="Per-good emissions (item 4)" />}
          </ItemSection>

          <ItemSection n="(5)" title="Total direct emissions">
            {report.item5_totalDirect
              ? <Item5View item5={report.item5_totalDirect} />
              : <AbsentPart2 what="Total direct emissions (item 5)" />}
          </ItemSection>

          <ItemSection n="(6)" title="Installation-level indirect emissions">
            {report.item6_indirect
              ? <Field label="(6) Installation indirect emissions" field={report.item6_indirect} render={(v: number) => fmtNum(v)} />
              : <AbsentPart2 what="Installation indirect emissions (item 6)" />}
          </ItemSection>

          <ItemSection n="(7)" title="Measurable heat imported / exported">
            <Field label="(7) Heat imported from other installations" field={report.item7_heat.imported} render={(v: boolean) => fmtBool(v)} />
            <Field label="(7) Heat exported to other installations" field={report.item7_heat.exported} render={(v: boolean) => fmtBool(v)} />
          </ItemSection>

          <ItemSection n="(8)" title="Zero-rated fuels">
            <Field label="(8) Zero-rated fuels used" field={report.item8_zeroRatedFuels.used} render={(v: boolean) => fmtBool(v)} />
            <Field label="(8) Demonstration of applicability" field={report.item8_zeroRatedFuels.demonstration} />
          </ItemSection>

          <ItemSection n="(9)" title="Waste gases">
            <Field label="(9) Produced and used in the installation" field={report.item9_wasteGases.producedUsed} render={(v: boolean) => fmtBool(v)} />
            <Field label="(9) Imported from other installations" field={report.item9_wasteGases.imported} render={(v: boolean) => fmtBool(v)} />
            <Field label="(9) Exported to other installations" field={report.item9_wasteGases.exported} render={(v: boolean) => fmtBool(v)} />
          </ItemSection>

          <ItemSection n="(10)" title="CO₂ capture">
            <Field label="(10) CO₂ capture used" field={report.item10_co2Capture.used} render={(v: boolean) => fmtBool(v)} />
            <Field label="(10) Transferred to" field={report.item10_co2Capture.transferredTo} />
          </ItemSection>

          <ItemSection n="(11)" title="On-site electricity (indirect emissions)">
            <Field label="(11) Electricity produced on site" field={report.item11_onsiteElectricity.producedOnsite} render={(v: boolean) => fmtBool(v)} />
            <Field label="(11)(a) By co-generation" field={report.item11_onsiteElectricity.cogeneration} render={(v: boolean) => fmtBool(v)} />
            <Field label="(11)(b) By separate generation" field={report.item11_onsiteElectricity.separateGeneration} render={(v: boolean) => fmtBool(v)} />
            <Field label="(11)(c) From fossil sources" field={report.item11_onsiteElectricity.sourceFossil} render={(v: boolean) => fmtBool(v)} />
            <Field label="(11)(c) From renewable sources" field={report.item11_onsiteElectricity.sourceRenewable} render={(v: boolean) => fmtBool(v)} />
            <Field label="(11)(d) Exported from a production process" field={report.item11_onsiteElectricity.exportedFromProcess} render={(v: boolean) => fmtBool(v)} />
          </ItemSection>

          <ItemSection n="(12)" title="Precursors — default values used">
            {report.item12_defaultPrecursors
              ? (report.item12_defaultPrecursors.length === 0
                  ? <div style={{ fontSize: 12, color: '#888784', fontWeight: 400 }}>No default-value precursors.</div>
                  : report.item12_defaultPrecursors.map((p, i) => (
                      <div key={p.cnCode + i} style={{ padding: '10px 0', borderBottom: '0.5px solid #f1f0ee' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>(12)(a) CN {p.cnCode}</div>
                        <Field label="(12)(b) Name of the good" field={p.name} />
                        <Field label="(12)(c) Country of origin" field={p.originCountry} />
                        <Field label="(12)(d) Applicable default value" field={p.defaultValue} render={(v: number) => fmtNum(v)} />
                      </div>
                    )))
              : <AbsentPart2 what="Default-value precursors (item 12)" />}
          </ItemSection>

          <ItemSection n="(13)" title="Precursors — actual values used">
            {report.item13_actualPrecursors
              ? (report.item13_actualPrecursors.length === 0
                  ? <div style={{ fontSize: 12, color: '#888784', fontWeight: 400 }}>No actual-value precursors.</div>
                  : report.item13_actualPrecursors.map((p, i) => (
                      <div key={p.cnCode + i} style={{ padding: '10px 0', borderBottom: '0.5px solid #f1f0ee' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>(13)(a) CN {p.cnCode}</div>
                        <Field label="(13)(b) Name of the good" field={p.name} />
                        <Field label="(13)(c) Country of origin" field={p.originCountry} />
                        <Field label="(13)(d) Reporting period" field={p.reportingPeriod} render={(v: number) => String(v)} />
                        <Field label="(13)(e) Specific embedded direct" field={p.specificDirect} render={(v: number) => fmtNum(v)} />
                        <Field label="(13)(e) Specific embedded indirect" field={p.specificIndirect} render={(v: number) => fmtNum(v)} />
                      </div>
                    )))
              : <AbsentPart2 what="Actual-value precursors (item 13)" />}
          </ItemSection>

          <ItemSection n="(14)" title="Multi-period precursor averaging (Article 14(1))">
            {report.item14_multiPeriodPrecursor
              ? <Field label="(14) Multi-period averaging" field={report.item14_multiPeriodPrecursor} />
              : <AbsentPart2 what="Multi-period averaging (item 14)" />}
          </ItemSection>

          <ItemSection n="(15)" title="Multi-installation precursor averaging (Article 14)">
            {report.item15_multiInstallationPrecursor
              ? <Field label="(15) Multi-installation averaging" field={report.item15_multiInstallationPrecursor} />
              : <AbsentPart2 what="Multi-installation averaging (item 15)" />}
          </ItemSection>

          <ItemSection n="(16)" title="Precursor origin (traceability)">
            {report.item16_precursorOrigin
              ? (report.item16_precursorOrigin.length === 0
                  ? <div style={{ fontSize: 12, color: '#888784', fontWeight: 400 }}>No precursors to trace.</div>
                  : report.item16_precursorOrigin.map((p, i) => (
                      <div key={p.cnCode + i} style={{ padding: '10px 0', borderBottom: '0.5px solid #f1f0ee' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>CN {p.cnCode}</div>
                        <Field label="(16) Operator of origin" field={p.operatorName} />
                        <Field label="(16) Installation of origin" field={p.installationName} />
                        <Field label="(16) CBAM Registry ID of origin" field={p.cbamRegistryId} />
                        <Field label="(16) Reporting period of origin" field={p.reportingPeriod} render={(v: number) => String(v)} />
                      </div>
                    )))
              : <AbsentPart2 what="Precursor origin (item 16)" />}
          </ItemSection>
        </>
      )}

      {/* Invite a verifier — copy-link parity with GHG. Self-guards on
          installationId, so it appears whenever an installation is selected,
          independent of whether a report has been generated. */}
      <CbamVerifierInvite
        installationId={selectedInstallationId}
        companyId={selectedInstallation?.company_id ?? null}
        reportingPeriod={reportingPeriod}
      />
    </div>
  )
}

// ── Verifier invite — copy-link parity with the GHG VerifierInvite
// (app/dashboard/ghg/page.tsx). Copy-link only, no email. The grant grain is the
// TUPLE (installation_id, company_id, reporting_period), not a single id;
// company_id is read off the SELECTED installation so the composite FK to
// cbam_installations(id, company_id) holds. The link points at
// /verify-cbam/{token} — NOT the GHG /verify/{token}. All of id/token/status/
// expires_at/consent columns are DB-defaulted and never sent.
interface CbamVerifierGrant {
  id: string
  token: string
  verifier_name: string | null
  verifier_email: string | null
  status: string
  expires_at: string
  created_at: string
}

function CbamVerifierInvite({ installationId, companyId, reportingPeriod }: { installationId: string | null; companyId: string | null; reportingPeriod: number }) {
  const [grants, setGrants] = useState<CbamVerifierGrant[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    if (!installationId || !companyId) return
    supabase
      .from('cbam_verifier_access')
      .select('*')
      .eq('installation_id', installationId)
      .eq('company_id', companyId)
      .eq('reporting_period', reportingPeriod)
      .order('created_at', { ascending: false })
      .then((res: { data: CbamVerifierGrant[] | null }) => setGrants(res.data || []))
  }

  useEffect(() => { load() }, [installationId, companyId, reportingPeriod])

  const createInvite = async () => {
    if (!installationId || !companyId) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please sign in to invite a verifier.'); setCreating(false); return }
    const { error } = await supabase.from('cbam_verifier_access').insert({
      installation_id: installationId,
      company_id: companyId,
      reporting_period: reportingPeriod,
      customer_user_id: session.user.id,
      verifier_name: name || null,
      verifier_email: email || null,
    })
    setCreating(false)
    if (error) { alert('Could not create invitation: ' + error.message); return }
    setName(''); setEmail(''); load()
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.from('cbam_verifier_access')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Could not revoke: ' + error.message); return }
    load()
  }

  const linkFor = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/verify-cbam/${token}`

  const copy = (token: string, id: string) => {
    navigator.clipboard.writeText(linkFor(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!installationId) return null

  const active = grants.filter((g) => g.status === 'active')

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '0.5px solid #e8e7e4', paddingTop: '2rem' }}>
      <h3 style={itemHead}>Invite a verifier</h3>
      {/* WHY THE SECOND PARAGRAPH. This block used to promise a "secure" link you could "revoke
          access" to at any time. Both overstated. A verifier link is a bearer credential — whoever
          holds it can open it — and revoking closes the PAGE, not anything the verifier has already
          downloaded. A customer reading the old sentence would reasonably conclude otherwise.
          The limit is stated together with the reason it is correct: a verifier keeping the
          evidence behind their report is a working-paper obligation, not a leak in this product.
          "Revoke one" rather than "revoke access", because access is the thing that does not fully
          revoke.

          DELIBERATELY NOT IDENTICAL to the GHG copy at app/dashboard/ghg/page.tsx. That surface
          says "assurance provider" and "their opinion"; a CBAM verifier is accredited under
          IR (EU) 2025/2547 and issues a verification REPORT, not an assurance opinion. Same
          argument, different profession — keep the wording matched to each. (The claim about the
          document LINKS themselves is shared and does live in one place: lib/verifierDocNotice.ts.) */}
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '0.75rem' }}>
        Generate a read-only link for your independent verifier. They&apos;ll see this installation&apos;s Annex IV &sect;1.2 summary and source documents for {reportingPeriod}, with no ability to edit. Links expire in 90 days, and you can revoke one at any time.
      </p>
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '1.25rem' }}>
        Revoking closes the link: the page stops loading and no further documents can be opened. It does not reach anything already downloaded. That is normal and expected &mdash; an accredited CBAM verifier is required to keep the evidence behind their report in their own working papers.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Verifier name (optional)" style={{ ...cbamInputStyle, flex: 1, minWidth: 160 }} />
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="Verifier email (optional)" style={{ ...cbamInputStyle, flex: 1, minWidth: 160 }} />
        <button onClick={createInvite} disabled={creating} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: creating ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{creating ? 'Generating…' : 'Generate verifier link'}</button>
      </div>

      {active.length === 0 && (
        <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>No active verifier links yet.</div>
      )}

      {active.map((g) => (
        <div key={g.id} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{g.verifier_name || 'Verifier'}{g.verifier_email ? ` · ${g.verifier_email}` : ''}</div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>Expires {new Date(g.expires_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => copy(g.token, g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>{copiedId === g.id ? '✓ Copied' : 'Copy link'}</button>
              <button onClick={() => revoke(g.id)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, background: 'none', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#B91C1C' }}>Revoke</button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#888784', wordBreak: 'break-all', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>{linkFor(g.token)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Item (4) — one good, its (a)-(f) sub-fields ──
function Item4View({ g }: { g: Item4Good }) {
  return (
    <div style={{ padding: '12px 0', borderBottom: '0.5px solid #f1f0ee' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 6 }}>
        Process {g.processId}{g.cnCode ? ` · CN ${g.cnCode}` : ''}
      </div>
      <Field label="(4)(a) Specific direct" field={g.specificDirect} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(b) Default-value share (direct)" field={g.defaultShareDirect} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(c) Indirect — actual-value share" field={g.indirect.actualShare} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(c) Indirect — default-value share" field={g.indirect.defaultShare} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(c) Actual-value criteria confirmed" field={g.indirect.criteriaConfirmation} render={(v: boolean) => fmtBool(v)} />
      <Field label="(4)(c) Specific indirect" field={g.indirect.specificIndirect} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(d) Imported electricity" field={g.importedElectricity} />
      <Field label="(4)(e) Specific embedded free allocation (SEFA)" field={g.sefa} render={(v: number) => fmtNum(v)} />
      <Field label="(4)(f) Benchmark used + method" field={g.benchmarkConfirmation} render={(v: SefaBenchmarkWorkings) => fmtBenchmark(v)} />
    </div>
  )
}

// ── Item (5) — per-process direct totals + installation total ──
function Item5View({ item5 }: { item5: Item5TotalDirect }) {
  return (
    <div>
      {item5.perProcess.map((p, i) => (
        <Field key={p.processId + i} label={`(5) Process ${p.processId} — total direct`} field={p.totalDirect} render={(v: number) => fmtNum(v)} />
      ))}
      <Field label="(5) Installation-level total direct" field={item5.installationTotal} render={(v: number) => fmtNum(v)} />
    </div>
  )
}

// ── The completeness checklist — a primary feature ──
// Renders THREE things, and the distinction between them is the point:
//   1. the supplied/required COUNT — the denominator that turns a defect list into progress.
//      Eleven flags read as failure when they appear with no total; against one they read as
//      remaining work. Same information, opposite affect, nothing softened.
//   2. OPERATOR gaps — items the customer clears by supplying data. Amber: action needed.
//   3. LIMITATIONS — items NO customer action can clear, because ThemisIQ has not built the
//      input or the regulation does not resolve the question. EXCLUDED from the denominator:
//      counting them would make the finish line permanently unreachable. Neutral, never amber
//      — this is a disclosure, not homework.
function MissingChecklist({ completeness }: { completeness: CompletenessResult }) {
  const { requiredCount, suppliedCount, outstandingCount, limitations } = completeness
  const operatorGaps = completeness.items.filter(
    (i) => i.responsibility === 'operator' && i.state === 'outstanding',
  )
  const platformLimits = limitations.filter((i) => i.responsibility === 'platform')
  const regulatorLimits = limitations.filter((i) => i.responsibility === 'regulator')

  const limitRow = (m: { item: string; field: string; hint?: string }, i: number) => (
    <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '0.5px solid #e8e7e4' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#888784', flexShrink: 0, minWidth: 40 }}>{m.item}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 400, color: '#555553' }}>{m.field}</div>
        {m.hint && <div style={{ fontSize: 12, color: '#888784', fontWeight: 400, lineHeight: 1.5, marginTop: 2 }}>{m.hint}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {outstandingCount === 0 ? (
        <div style={{ background: '#E1F5EE', border: '0.5px solid #b8e6d5', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0F6E56' }}>✓ {suppliedCount} of {requiredCount} supplied — nothing outstanding.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1.5px solid #f5d9ad', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#92400e', marginBottom: 4 }}>Before this report is complete</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 4 }}>{suppliedCount} of {requiredCount} supplied · {outstandingCount} to supply</div>
          <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1rem' }}>Each is a required field with no answer yet. Supply it where the hint points, then regenerate.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {operatorGaps.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 12px' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', flexShrink: 0, minWidth: 40 }}>{m.item}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{m.field}</div>
                  {m.hint && <div style={{ fontSize: 12, color: '#888784', fontWeight: 400, lineHeight: 1.5, marginTop: 2 }}>{m.hint}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {limitations.length > 0 && (
        <div style={{ marginTop: '1rem', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
          {platformLimits.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555553', marginBottom: 4 }}>Not captured by this report</div>
              <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '0.75rem' }}>These items are part of §1.2 but ThemisIQ cannot currently produce them. They are not gaps in your data, and no action from you will clear them.</div>
              <div style={{ marginBottom: regulatorLimits.length > 0 ? '1.5rem' : 0 }}>{platformLimits.map(limitRow)}</div>
            </>
          )}
          {regulatorLimits.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555553', marginBottom: 4 }}>Unresolved in the regulation</div>
              <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '0.75rem' }}>The instrument does not settle these. They are recorded rather than assumed — no classification or value has been inferred.</div>
              <div>{regulatorLimits.map(limitRow)}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Attestation timestamp / items 5 & 6 gate ──
function AttestationBanner({ declaredAt }: { declaredAt: string | null }) {
  if (declaredAt) {
    return (
      <div style={{ marginTop: '1rem', fontSize: 12, color: '#0F6E56', background: '#E1F5EE', border: '0.5px solid #b8e6d5', borderRadius: 8, padding: '10px 14px' }}>
        Process-completeness attested at {new Date(declaredAt).toLocaleString()} (server timestamp). Installation-level totals (items 5 and 6) may be reported.
      </div>
    )
  }
  return (
    <div style={{ marginTop: '1rem', fontSize: 12, color: '#555553', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '10px 14px', lineHeight: 1.6 }}>
      Installation-level totals (items 5 and 6) cannot be reported until you attest that the process set is complete. Make the attestation on the{' '}
      <a href="/dashboard/cbam/disclosures" style={{ color: '#7425e3', textDecoration: 'underline' }}>disclosures page</a>, then regenerate this report.
    </div>
  )
}

// ── Errors, surfaced distinctly by status code ──
function ErrorPanel({ err }: { err: ErrState }) {
  // FIRST, before the status check below. This shares status 409 with the stale-record conflict
  // but is a different kind of thing entirely: nothing is in conflict, nothing was computed
  // wrongly, and re-running compute would change nothing. It is an unanswered question, so it
  // reads as one — no "conflict", no status code in the heading, and prose rather than the
  // diagnostic monospace the stale-record panel uses to show stored-vs-recomputed figures.
  if (err.code === 'precursor_declaration_required') {
    return (
      <div style={{ marginTop: '1.5rem', background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>One more thing to confirm before the report</div>
        <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.7, fontWeight: 400 }}>{err.message}</div>
        {/* The message names the goods by CN code; setup is where they are declared. NOT
            deep-linked to the specific process — that needs useSearchParams, which needs a
            Suspense split on the setup page, plus sequencing against its installation load
            and seeding its step state. Worth doing on its own terms, not for a convenience
            link. The reader matches the CN codes to the process list themselves. */}
        <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.7, fontWeight: 400, marginTop: 8 }}>
          Go to{' '}
          <a href="/dashboard/cbam/setup" style={{ color: '#7425e3', textDecoration: 'underline' }}>setup</a> to declare them.
        </div>
      </div>
    )
  }
  // 409 stale_record — the important one. Full message verbatim, no report shown.
  if (err.status === 409) {
    return (
      <div style={{ marginTop: '1.5rem', background: '#FEE2E2', border: '1.5px solid #ef4444', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#991b1b', marginBottom: 6 }}>Stale record — conflict (409)</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>A stored figure disagrees with a fresh recomputation</div>
        <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.6, marginBottom: 10, whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{err.message}</div>
        <div style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.6, fontWeight: 500 }}>
          No report is shown, because these figures would contradict what was stored. Re-run compute for the affected process to produce a new record, then generate the report again.
        </div>
      </div>
    )
  }
  if (err.status === 401) {
    return (
      <div style={{ marginTop: '1.5rem', background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Session expired (401)</div>
        <div style={{ fontSize: 13, color: '#92400e', lineHeight: 1.6, fontWeight: 400 }}>{err.message} <a href="/login" style={{ color: '#7425e3', textDecoration: 'underline' }}>Sign in again</a>.</div>
      </div>
    )
  }
  // 404 (installation / processes not found), 400, 500, and client/network (status 0).
  const label = err.status === 404 ? 'Not found (404)' : err.status ? `Error (${err.status})` : 'Request error'
  return (
    <div style={{ marginTop: '1.5rem', background: '#FEE2E2', border: '0.5px solid #fca5a5', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{err.message}</div>
    </div>
  )
}
