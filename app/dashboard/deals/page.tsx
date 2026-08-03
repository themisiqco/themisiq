'use client'

import { useState, useEffect } from 'react'
import Nav from '../../components/Nav'
import { useEntitlement } from '../../../lib/useEntitlement'
import { supabase } from '../../../lib/supabase'
import { filenameDate, filenameSafe } from '../../../lib/filename'
import {
  getObligations, getApplicableFrameworks, getFrameworkApplicability, getComplianceCost,
  SECTOR_RISKS, DEFAULT_PIPELINE_TARGETS, DEAL_CURRENCIES,
  FX_SOURCE, FX_AS_OF, THRESHOLD_TESTS, isTestActive,
  isRevenueDeclared, assessmentView, notAssessedRevenueNote, partiallyAssessedNote,
  nearThresholdNoneNote, obligationPriceLabel, resolveFieldsPrompt,
  type FrameworkApplicability,
} from '../../../lib/deals/assessment'
// Presentation model shared with app/dashboard/deals/report/page.tsx. The CSV and the printed
// report render the SAME rows; neither re-derives them, so they cannot state different figures or
// cite different regimes for one deal.
import {
  DEAL_TYPES, spellMagnitude, NEAR_PCT, nearSentence,
  limbValueDisplay, limbThresholdDisplay, buildLimbRows, limbRowsToCsv, buildFxBasisRows,
  resolveCs3d, makeMapFramework, themisIqFigure as themisIqFigureOf,
} from '../../../lib/deals/reportModel'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

const JURISDICTIONS = ['USA', 'European Union', 'UK', 'Canada', 'Australia', 'Global', 'Other']

// Sector-based ESG risk flags
// Assessment logic (SECTOR_RISKS, getComplianceCost, getObligations, getApplicableFrameworks)
// extracted to lib/deals/assessment.ts — imported above, shared with the public route.

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: 'clamp(1.4rem, 2.5vw, 1.8rem)', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 13, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.5rem' }

const SEVERITY_CONFIG = {
  critical: { label: 'CRITICAL', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#ba7517', bg: '#FEF3E2', border: '#ba7517' },
  medium:   { label: 'MEDIUM', color: '#0C447C', bg: '#E6F1FB', border: '#0C447C' },
}

const STEP_NAMES = ['Deal Setup', 'ESG Screening', 'Risk Findings', 'Cost Estimate', 'Export']

const verifyChip: React.CSSProperties = { fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#FEF3E2', color: '#ba7517', border: '0.5px solid rgba(186,117,23,0.35)' }


// ─── Component ────────────────────────────────────────────────────────────────

export default function DealsDashboard() {
  const isPaid = useEntitlement('deals')
  const [step, setStep] = useState(0)
  const [deal, setDeal] = useState({
    target_name: '',
    sector: '',
    revenue: 0,
    // NULL, not 0: these sit in nullable columns, so undeclared stays distinct from a declared
    // zero. A holding company with 0 employees definitively fails the employee limb; not knowing
    // the headcount makes the OUTCOME indeterminate. The form must preserve that difference.
    employee_count: null as number | null,
    total_assets: null as number | null,
    jurisdiction: 'USA',
    deal_type: 'ma',
    deal_value: 0,
    location_count: 0,
    currency: 'USD',
    has_ghg_data: false,
    has_esg_report: false,
    notes: '',
  })
  const [frameworks, setFrameworks] = useState<string[]>([])
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [dealId, setDealId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // Share-link state (C4) — kept SEPARATE from the deal object so they never enter handleSave's
  // row payload; token/share_enabled are DB-owned (token auto-generated, share_enabled toggled here).
  const [dealToken, setDealToken] = useState<string | null>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareSaving, setShareSaving] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)

  // Load the user's most recent saved deal on mount so a saved deal round-trips.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled || !session) return
      setUserId(session.user.id)
      const { data, error } = await supabase
        .from('deals')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cancelled || error || !data) return
      setDealId(data.id)
      setDealToken(data.token ?? null)      // token isn't secret to the owner; drives the share UI
      setShareEnabled(!!data.share_enabled)
      setDeal({
        target_name: data.target_name ?? '',
        sector: data.sector ?? '',
        revenue: Number(data.revenue) || 0,
        employee_count: data.employee_count == null ? null : Number(data.employee_count),
        total_assets: data.total_assets == null ? null : Number(data.total_assets),
        jurisdiction: data.jurisdiction ?? 'USA',
        deal_type: data.deal_type ?? 'ma',
        deal_value: Number(data.deal_value) || 0,
        location_count: Number(data.location_count) || 0,
        currency: data.currency ?? 'USD',
        has_ghg_data: !!data.has_ghg_data,
        has_esg_report: !!data.has_esg_report,
        notes: data.notes ?? '',
      })
      if (Array.isArray(data.frameworks)) setFrameworks(data.frameworks) // derive effect reconciles anyway
    })()
    return () => { cancelled = true }
  }, [])

  // Auto-detect frameworks when deal changes
  useEffect(() => {
    // NOT gated on revenue: only SB 253 and SECR consult it. The other thirteen frameworks resolve
    // from jurisdiction and sector alone, and withholding them because revenue is blank made an
    // undeclared field read as "no frameworks apply". The engine marks the two it cannot evaluate.
    if (deal.sector && deal.jurisdiction) {
      // deal.currency is load-bearing here: revenue is entered in it, and the SB 253 / SECR
      // triggers are denominated in USD / GBP respectively. Omitting it treats every deal as USD.
      const detected = getApplicableFrameworks(deal.jurisdiction, deal.revenue, deal.sector, deal.deal_type, deal.currency,
        { total_assets: deal.total_assets, employee_count: deal.employee_count })
      setFrameworks(detected)
    } else {
      setFrameworks([])
    }
  }, [deal.sector, deal.jurisdiction, deal.revenue, deal.deal_type, deal.currency, deal.total_assets, deal.employee_count])

  const update = (field: string, value: any) => { setDeal(prev => ({ ...prev, [field]: value })); setSaved(false) }

  // Persist the deal for this user. token/share_enabled are intentionally NOT written —
  // the DB defaults own them (Build-C shareable link; unused this build).
  const handleSave = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please log in to save your deal.'); return }
    setSaving(true)
    try {
      const row = {
        user_id: session.user.id,
        target_name: deal.target_name,
        sector: deal.sector,
        revenue: deal.revenue,
        employee_count: deal.employee_count,   // null when undeclared — never coerced to 0
        total_assets: deal.total_assets,
        jurisdiction: deal.jurisdiction,
        deal_type: deal.deal_type,
        deal_value: deal.deal_value,
        location_count: deal.location_count,
        currency: deal.currency,
        has_ghg_data: deal.has_ghg_data,
        has_esg_report: deal.has_esg_report,
        notes: deal.notes,
        frameworks, // derived list persisted as jsonb for the future shared view
        updated_at: new Date().toISOString(),
      }
      if (dealId) {
        const { error } = await supabase.from('deals').update(row).eq('id', dealId)
        if (error) { console.error('Deal save failed:', error); alert('Save failed: ' + error.message); return }
      } else {
        const { data, error } = await supabase.from('deals').insert(row).select('id, token, share_enabled').single()
        if (error) { console.error('Deal save failed:', error); alert('Save failed: ' + error.message); return }
        if (data) { setDealId(data.id); setDealToken(data.token ?? null); setShareEnabled(!!data.share_enabled) }
      }
      setSaved(true)
    } finally { setSaving(false) }
  }

  const risks = SECTOR_RISKS[deal.sector] || []
  // Rich applicability, computed from the SAME guard as the `frameworks` effect above so the two
  // views of the same deal cannot disagree. `frameworks` stays the persisted legal in/out; this adds
  // the near-threshold detail the flat string[] deliberately does not carry.
  const evaluated = !!(deal.sector && deal.jurisdiction)   // revenue is NOT part of this gate
  const applicability: FrameworkApplicability[] = evaluated
    ? getFrameworkApplicability(deal.jurisdiction, deal.revenue, deal.sector, deal.deal_type, deal.currency,
        { total_assets: deal.total_assets, employee_count: deal.employee_count })
    : []
  const nearThreshold = applicability.filter(f => f.status === 'near-threshold')
  const nearByFramework = new Map(nearThreshold.map(f => [f.framework, f]))
  // Near-but-below never reaches `frameworks` (it does not apply), so Step 1 has to list it
  // separately or the reader never learns the deal sits just under a trigger.
  const nearBelow = nearThreshold.filter(f => !f.applies)
  // Absence of data is not a value. `frameworks` / `nearThreshold` come back empty for TWO
  // different reasons — nothing was found, or nothing was evaluated — and the empty array cannot
  // tell them apart. These states carry that distinction to every surface, so a blank revenue
  // field can never render as "no frameworks apply" or "no threshold is nearby".
  const revenueDeclared = isRevenueDeclared(deal.revenue)
  const view = assessmentView(evaluated, applicability)
  const frameworksState = view.frameworks
  const nearState = view.nearThreshold
  // Only the triggers actually in scope for THIS deal — a USA deal names SB 253, never SECR.
  const notAssessedNote = notAssessedRevenueNote(
    view.notAssessed.length ? view.notAssessed : undefined,
    view.fieldsToResolve.length ? view.fieldsToResolve : undefined,
  )
  // One row per limb of every size test actually run — built by the shared model, so this CSV and
  // the printed report name the same limbs, measures and proxy caveats.
  const limbRows: string[][] = limbRowsToCsv(buildLimbRows(applicability))

  // FX basis rows — shared model. Shows the transcribed EUR-base figures, the derivation and the
  // result, so a reader can tell which numbers came from the ECB document and which we computed.
  const fxBasisRows: string[][] = buildFxBasisRows(deal.currency, applicability)
  // Rewrite generic disclosure-regime labels (SB 253, bare CSRD) on a static sector risk template to
  // the regime the DETECTED frameworks actually support. Resolving against `frameworks` rather than
  // deal.jurisdiction is load-bearing: jurisdiction alone stamped "SB 253" on every USA deal, so a
  // sub-threshold target was cited against a statute the APPLICABLE FRAMEWORKS section of the same
  // report correctly omitted. A token here can now only name a regime that section also asserts.
  // Activity-triggered EU instruments (CBAM, EUDR, AI Act, SFDR, CS3D, ETS) are still left intact —
  // they apply to UK/non-EU companies through EU-facing activity and have no domestic equivalent.
  // CS3D is an activity-triggered instrument, so it gets THREE states, not the binary the regime
  // tokens use. It reaches non-EU companies through EU-facing activity, which this screen cannot
  // determine (no market multi-select yet), so "not in the resolved list" is not the same as
  // "does not apply".
  //   applies        → cite plainly
  //   conditional    → cite as conditional, NEVER suppress (size undeclared, or non-EU)
  //   not-applicable → relabel, i.e. drop the token — same treatment as SB 253
  const cs3d = resolveCs3d(frameworks, applicability)
  const mapFramework = makeMapFramework(frameworks, cs3d)
  const criticalRisks = risks.filter(r => r.severity === 'critical')
  const highRisks = risks.filter(r => r.severity === 'high')
  const mediumRisks = risks.filter(r => r.severity === 'medium')
  const complianceCost = deal.deal_value > 0 ? getComplianceCost(deal.deal_value, deal.sector, frameworks) : null
  const obligations = getObligations(deal.location_count, frameworks, deal.sector)
  // Compact ThemisIQ summed figure (included tier only) — shared by the Cost Estimate card,
  // the Export "Report summary", and the sticky "Deal summary" so all three stay consistent.
  const themisIqFigure = themisIqFigureOf(obligations)

  // Absolute public URL for the target-facing route (matches the verifier linkFor pattern).
  const shareUrl = dealToken ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/deals/${dealToken}` : ''

  // Flip share_enabled — a normal owner-gated update (existing RLS covers it); no RPC, no policy change.
  const toggleShare = async (enabled: boolean) => {
    if (!dealId) return
    setShareSaving(true)
    try {
      const { error } = await supabase.from('deals').update({ share_enabled: enabled }).eq('id', dealId)
      if (error) { console.error('Share toggle failed:', error); alert('Could not update sharing: ' + error.message); return }
      setShareEnabled(enabled) // only reflect state on a successful write
    } finally { setShareSaving(false) }
  }

  const copyShareLink = () => {
    if (!shareUrl) return
    navigator.clipboard.writeText(shareUrl)
    setCopiedShare(true)
    setTimeout(() => setCopiedShare(false), 2000)
  }

  const generateExport = () => {
    // ONE instant for both the Generated row and the download filename. These were two separate
    // `new Date()` calls with two formatters — the row local, the filename UTC — so a CSV exported
    // after ~19:00 EDT was NAMED with tomorrow's date while saying today's inside.
    const generatedAt = new Date()
    const rows = [
      ['ThemisIQ — ESG Deal Due Diligence Report'],
      ['Target company', deal.target_name],
      ['Sector', deal.sector],
      // "USD 0" would assert a revenue figure we were never given. Say what is true instead.
      ['Revenue', revenueDeclared ? `${deal.currency} ${deal.revenue.toLocaleString()} (${spellMagnitude(deal.revenue)})` : 'Not provided'],
      ['Deal type', DEAL_TYPES.find(d => d.id === deal.deal_type)?.label || ''],
      ['Jurisdiction', deal.jurisdiction],
      ['Generated', generatedAt.toLocaleDateString()],
      [],
      ['APPLICABLE FRAMEWORKS'],
      // Three states, never two: an empty list under this heading previously read as "no
      // frameworks apply" whether or not anything had been evaluated.
      ...(frameworksState === 'not-assessed'
        ? [[notAssessedNote]]
        : frameworksState === 'assessed-none'
          ? [['None — no framework was triggered for this jurisdiction, sector and revenue.']]
          : [
              ...frameworks.map(f => [f, nearByFramework.has(f) ? 'APPLIES — near threshold, verify' : 'APPLIES']),
              // Partial assessment: the list above stands, but naming what was withheld stops a
              // reader inferring that the missing statutes were considered and excluded.
              ...(view.notAssessed.length ? [[partiallyAssessedNote(view.notAssessed, view.fieldsToResolve)]] : []),
            ]),
      [],
      // Near-threshold is reported as its own section rather than folded into the list above, so a
      // reader cannot mistake "within the band" for "applies". Both sides appear; the Status column
      // restates the legal answer verbatim so the marker never displaces it.
      ['NEAR-THRESHOLD FRAMEWORKS'],
      [`Raised only where a MARGINAL limb is decisive for the outcome — a limb within ${NEAR_PCT} of its figure that, if it moved, would change whether the test is met. The legal answer is unchanged: a framework that applies still applies.`],
      ...(nearState === 'not-assessed'
        ? [[notAssessedNote]]
        : nearState === 'assessed-none'
        ? [[nearThresholdNoneNote()]]
        : [
            ['Framework', 'Status', 'Limbs met', 'Decisive limb', 'Value applied', 'Threshold', 'Side'],
            ...nearThreshold.map(f => {
              const dec = f.test?.limbs.filter(l => l.near && l.state !== 'not-assessed') ?? []
              return [
                f.framework,
                f.applies ? 'Applies — verify' : 'Does not apply on the figures entered — verify',
                f.test ? `${f.test.metCount} of ${f.test.requires}` : '',
                dec.map(l => l.limb.measure.replace(/_/g, ' ')).join('; '),
                dec.map(limbValueDisplay).join('; '),
                dec.map(limbThresholdDisplay).join('; '),
                f.side === 'above' ? 'Above' : 'Below',
              ]
            }),
          ]),
      [],
      // Every limb of every size test that was actually run, with the MEASURE it applied. A limb
      // result without its measure is the same class of error as a framework label with no
      // threshold behind it — "MET" against an unnamed measure asserts nothing checkable.
      ['THRESHOLD LIMBS APPLIED'],
      ...(limbRows.length === 0
        ? [['No size-gated framework is in scope for this jurisdiction.']]
        : [
            ['Framework', 'Limb', 'Measure required', 'Value applied', 'Threshold', 'Result', 'Basis of value'],
            ...limbRows,
          ]),
      [],
      ['ESG RISK FINDINGS'],
      // The Framework column resolves against the detected list; with nothing detected it falls
      // back to a methodology label. Say so, rather than letting the fallback pass as a finding.
      ...(revenueDeclared ? [] : [['Framework column shows a methodology fallback — no disclosure regime was resolved because target revenue was not provided.']]),
      ['Risk', 'Severity', 'Framework', 'Detail'],
      ...risks.map(r => [r.risk, r.severity.toUpperCase(), mapFramework(r.framework), r.detail]),
      [],
      ['COMPLIANCE COST ESTIMATE'],
      ['ThemisIQ (scope-matched, included modules)', themisIqFigure],
      ['Traditional consultant (first-year)', `USD ${Math.round(obligations.consultantLow / 1000)}k–${Math.round(obligations.consultantHigh / 1000)}k`],
      ['Benchmark and ThemisIQ figures shown in USD.'],
      [],
      ['Included obligation', 'ThemisIQ', 'Consultant (reference)'],
      ...obligations.included.map(o => [
        o.scopeNote ? `${o.label} — ${o.scopeNote}` : o.label,
        obligationPriceLabel(o.pricing),
        `USD ${Math.round(o.consultantLow / 1000)}k–${Math.round(o.consultantHigh / 1000)}k`,
      ]),
      [],
      ['Also recommended (not in ThemisIQ total)', 'ThemisIQ', 'Consultant (reference)'],
      ...obligations.recommended.map(o => [o.label, obligationPriceLabel(o.pricing), `USD ${Math.round(o.consultantLow / 1000)}k–${Math.round(o.consultantHigh / 1000)}k`]),
      [],
      ['Flagged — separate specialist (in neither total)', 'ThemisIQ', 'Consultant (reference)'],
      ...obligations.flagged.map(o => [o.scopeNote ? `${o.label} — ${o.scopeNote}` : o.label, obligationPriceLabel(o.pricing), 'Not included']),
      ...(complianceCost ? [[`ESG value-at-risk exposure: ~${(complianceCost.pctLow * 100).toFixed(2)}%–${(complianceCost.pctHigh * 100).toFixed(2)}% of deal value (~USD ${Math.round(complianceCost.low).toLocaleString()}–${Math.round(complianceCost.high).toLocaleString()}) carries ESG-related risk to assess; indicative exposure, not a cost — requires specialist confirmation`]] : []),
      [],
      ['DATA ROOM GAPS'],
      ['Item', 'Status'],
      ['GHG inventory / emissions data', deal.has_ghg_data ? 'Available' : 'MISSING — request from target'],
      ['ESG report or sustainability disclosure', deal.has_esg_report ? 'Available' : 'MISSING — request from target'],
      [],
      // FX basis — every converted threshold call above has to be traceable to the PUBLISHED
      // figures that produced it, not merely to the cross-rate this system computed from them.
      ['FX BASIS FOR THRESHOLD TESTS'],
      ['Revenue and balance-sheet figures are converted into each threshold’s statutory currency for comparison. The statutory figure itself is never converted.'],
      ['Rates below marked "transcribed" are copied verbatim from the source document and can be checked against it digit for digit. Rates marked "DERIVED" are computed by ThemisIQ from those figures and appear nowhere in the source.'],
      ['Rate source', FX_SOURCE],
      ['Rates as of', FX_AS_OF],
      ['Deal currency', deal.currency],
      ...fxBasisRows,
      ['Size tests available', Object.values(THRESHOLD_TESTS).filter(isTestActive)
        .map(t => `${t.framework} (${t.requires} of ${t.limbs.length})`).join(' · ')],
      // A test whose lookback is not modelled UNDER-calls a target that dipped since the prior year;
      // the below-side marginal-limb flag is the mitigation. Say so in the report, not just in code.
      ...(Object.values(THRESHOLD_TESTS).filter(isTestActive).filter(t => !t.lookbackModelled)
        .map(t => [`Lookback NOT modelled — ${t.framework}`,
          `Statute measures over ${t.lookback === 'either-of-two-most-recent-fy' ? 'either of the two most recent financial years' : 'the most recent financial year'}; only the most recent year is held. A target that met a limb in the prior year and has since dipped is UNDER-called — such a target surfaces as a marginal below-side limb.`])),
      [],
      ['Generated by ThemisIQ · www.themisiq.co · ESG Deal Diligence Platform'],
    ]
    const esc = (v: string) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = rows.map(r => r.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // A target name is free text: "Smith / Jones Holdings" put a path separator in the download
    // name. Sanitising also makes the existing 'Target' fallback actually cover a whitespace-only
    // name, which is truthy and so slipped past `|| 'Target'` to produce a nameless file.
    const targetName = filenameSafe(deal.target_name || '') || 'Target'
    a.download = `${targetName}_ESGDiligence_${filenameDate(generatedAt)}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Deal setup</h2>
      <p style={sectionSub}>Tell us about the target company and deal structure so we can identify ESG risks and applicable frameworks.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Target company name</label>
          <input style={inputStyle} value={deal.target_name} onChange={e => update('target_name', e.target.value)} placeholder="Acme Corp" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Sector</label>
          <select style={inputStyle} value={deal.sector} onChange={e => update('sector', e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Target annual revenue ({deal.currency}, whole {deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.revenue || ''} onChange={e => update('revenue', Number(e.target.value))} placeholder="e.g. 2000000" />
          {/* Echo the entered figure back in words. The statutory triggers are USD 1bn / GBP 36m, so a
              1000x entry error changes which statutes are cited — it has to be visible at input time. */}
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: deal.revenue > 0 ? '#0d0d0d' : '#888784' }}>
            {deal.revenue > 0
              ? <>Reading this as <strong style={{ fontWeight: 600 }}>{deal.currency} {deal.revenue.toLocaleString()}</strong> — {spellMagnitude(deal.revenue)}.</>
              : <>Enter the full amount in whole {deal.currency} — 2000000 for two million, not 2 or 2000.</>}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={deal.currency} onChange={e => update('currency', e.target.value)}>
            {DEAL_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Deal / investment value ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.deal_value || ''} onChange={e => update('deal_value', Number(e.target.value))} placeholder="0" />
        </div>
        {/* Size limbs. Blank stays NULL — `?? ''` and the '' → null branch below are what keep an
            undeclared headcount distinct from a declared zero, which the N-of-M rule depends on. */}
        <div>
          <label style={labelStyle}>Employees (headcount)</label>
          <input style={inputStyle} type="number" value={deal.employee_count ?? ''} placeholder="Leave blank if unknown"
            onChange={e => update('employee_count', e.target.value === '' ? null : Number(e.target.value))} />
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: '#888784' }}>
            {deal.employee_count == null ? 'Undeclared — limbs needing headcount cannot be assessed.' : `Declared: ${deal.employee_count.toLocaleString()}.`}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Balance-sheet total ({deal.currency})</label>
          <input style={inputStyle} type="number" value={deal.total_assets ?? ''} placeholder="Leave blank if unknown"
            onChange={e => update('total_assets', e.target.value === '' ? null : Number(e.target.value))} />
          <div style={{ fontSize: 11, marginTop: 6, lineHeight: 1.5, color: '#888784' }}>
            {deal.total_assets == null ? 'Undeclared — limbs needing total assets cannot be assessed.' : `Declared: ${deal.currency} ${deal.total_assets.toLocaleString()} — ${spellMagnitude(deal.total_assets)}.`}
          </div>
        </div>
        <div>
          <label style={labelStyle}>Number of locations / sites</label>
          <input style={inputStyle} type="number" value={deal.location_count || ''} onChange={e => update('location_count', Number(e.target.value))} placeholder="0" />
        </div>
        <div>
          <label style={labelStyle}>Primary jurisdiction</label>
          <select style={inputStyle} value={deal.jurisdiction} onChange={e => update('jurisdiction', e.target.value)}>
            {JURISDICTIONS.map(j => <option key={j} value={j}>{j}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Deal type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {DEAL_TYPES.map(dt => (
              <div key={dt.id} onClick={() => update('deal_type', dt.id)} style={{ border: `1.5px solid ${deal.deal_type === dt.id ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: deal.deal_type === dt.id ? '#EDE9FE' : '#f8f7f5' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: deal.deal_type === dt.id ? '#7425e3' : '#0d0d0d', marginBottom: 3 }}>{dt.label}</div>
                <div style={{ fontSize: 11, color: '#888784' }}>{dt.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>ESG framework screening</h2>
      <p style={sectionSub}>ThemisIQ has identified the frameworks that apply to this deal based on sector, jurisdiction and deal size. Review and confirm.</p>

      {/* Same three states as the CSV — a blank revenue field must not render as a negative finding. */}
      {frameworksState === 'not-assessed' ? (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 12, padding: '1.25rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 6 }}>NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {view.evaluated
              ? <>Size test incomplete for {view.notAssessed.join(', ')} — <strong style={{ fontWeight: 600 }}>not evaluated</strong>, which is not a finding that none apply. {resolveFieldsPrompt(view.fieldsToResolve, view.notAssessed)}</>
              : <>Enter sector and jurisdiction in Deal setup. Nothing has been evaluated yet — an empty list here is not a finding that no frameworks apply.</>}
          </div>
        </div>
      ) : frameworksState === 'assessed-none' ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
          <strong style={{ fontWeight: 600 }}>None.</strong> Assessed against this jurisdiction, sector and revenue — no framework was triggered.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {frameworks.map(fw => {
            const near = nearByFramework.get(fw)
            return (
              <div key={fw} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: '#fff', border: `1px solid ${near ? 'rgba(186,117,23,0.35)' : '#e8e7e4'}`, borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw}</div>
                  {near && <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 5 }}>{nearSentence(near)}</div>}
                </div>
                {/* APPLIES is retained alongside VERIFY — near-ness annotates the finding, it does not soften it. */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {near && <span style={verifyChip}>VERIFY</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56' }}>APPLIES</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Partial assessment: the list above resolved from jurisdiction and sector, but a revenue
          trigger was withheld. Naming it stops the reader inferring it was considered and excluded. */}
      {frameworksState === 'assessed-findings' && view.notAssessed.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>PARTIAL — {view.notAssessed.join(', ')} NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{partiallyAssessedNote(view.notAssessed, view.fieldsToResolve)}</div>
        </div>
      )}

      {/* Near-threshold, not assessed. Silence here would read as "nothing is nearby" — the same
          false negative the CSV section carried. */}
      {nearState === 'not-assessed' && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>NEAR-THRESHOLD — NOT ASSESSED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {view.evaluated
              ? <>No proximity check was run — the {view.notAssessed.join(' / ')} size test{view.notAssessed.length === 1 ? '' : 's'} could not be completed. {resolveFieldsPrompt(view.fieldsToResolve, view.notAssessed)}</>
              : <>No proximity check was run — sector and jurisdiction are not set.</>}
          </div>
        </div>
      )}

      {/* Near-but-below: these are correctly absent from the list above. Surfaced so the reader
          learns the deal sits just under a trigger, without implying it has crossed it. */}
      {nearBelow.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 6 }}>Approaching a reporting threshold — verify</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 10 }}>
            The following do <strong style={{ fontWeight: 600 }}>not</strong> apply on the figures entered. Each has a limb within {NEAR_PCT} of its statutory trigger, so the answer turns on how that figure is measured and on reporting-entity scope — confirm before ruling them out.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearBelow.map(f => (
              <div key={f.framework} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: '#fff', borderRadius: 8, border: '0.5px solid rgba(186,117,23,0.2)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{f.framework}</div>
                  <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 5 }}>{nearSentence(f)}</div>
                </div>
                <span style={{ ...verifyChip, flexShrink: 0 }}>NEAR THRESHOLD</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ border: '1px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 12 }}>Data room status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { field: 'has_ghg_data', label: 'GHG inventory / emissions data available from target?' },
            { field: 'has_esg_report', label: 'ESG report or sustainability disclosure available from target?' },
          ].map(({ field, label }) => (
            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ fontSize: 13, color: '#555553' }}>{label}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => update(field, opt.val)} style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: (deal as any)[field] === opt.val ? '#0d0d0d' : '#f8f7f5', color: (deal as any)[field] === opt.val ? '#fff' : '#555553', border: `0.5px solid ${(deal as any)[field] === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {(!deal.has_ghg_data || !deal.has_esg_report) && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>⚠ Data room gaps identified</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            {!deal.has_ghg_data && '· Request verified GHG inventory (Scope 1, 2, 3) from target before closing\n'}
            {!deal.has_esg_report && '· Request latest ESG report or sustainability disclosure from target'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Material ESG findings</h2>
      <p style={sectionSub}>Based on {deal.target_name || 'the target company'}'s sector and jurisdiction, ThemisIQ has identified the following material ESG risks for your deal memo.</p>

      {risks.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Select a sector in Step 1 to see ESG risk findings.
        </div>
      ) : (
        <>
          {/* The Framework badge on each finding resolves against the detected list. With nothing
              detected it falls back to a methodology label — say so rather than let it read as a
              resolved regime. */}
          {view.notAssessed.length > 0 && (
            <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: 14, fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
              <strong style={{ fontWeight: 600, color: '#ba7517' }}>Framework column partially resolved.</strong> The {view.notAssessed.join(' / ')} size test could not be completed, so {view.notAssessed.length === 1 ? 'it does' : 'they do'} not appear in any label below. Labels reflect only the regimes determinable from the figures provided. {resolveFieldsPrompt(view.fieldsToResolve, view.notAssessed)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risks', count: criticalRisks.length, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risks', count: highRisks.length, color: '#ba7517', bg: '#FEF3E2' },
              { label: 'Medium risks', count: mediumRisks.length, color: '#0C447C', bg: '#E6F1FB' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {risks.map((risk, i) => {
              const cfg = SEVERITY_CONFIG[risk.severity]
              const label = mapFramework(risk.framework)
              // A finding inherits the marker when the regime it cites is itself near-threshold.
              const citedNear = label.split(' / ').map(t => nearByFramework.get(t)).filter(Boolean) as FrameworkApplicability[]
              return (
                <div key={i} style={{ border: `1px solid ${cfg.border}20`, borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ background: risk.severity === 'critical' ? cfg.bg : '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `0.5px solid ${cfg.border}20` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{risk.risk}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, color: '#888784' }}>{label}</span>
                      {citedNear.length > 0 && <span style={verifyChip}>VERIFY</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px', background: '#fff' }}>
                    <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{risk.detail}</div>
                    {label.includes('CS3D (conditional)') && cs3d.state === 'conditional' && (
                      <div style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 8 }}>
                        <strong style={{ fontWeight: 600 }}>CS3D conditional:</strong> {cs3d.reason}.
                      </div>
                    )}
                    {citedNear.map(f => (
                      <div key={f.framework} style={{ fontSize: 11, color: '#ba7517', lineHeight: 1.55, marginTop: 8 }}>
                        <strong style={{ fontWeight: 600 }}>{f.framework}:</strong> {nearSentence(f)}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => {
    const consultantRange = `USD ${Math.round(obligations.consultantLow / 1000)}k–${Math.round(obligations.consultantHigh / 1000)}k`
    const includedModulesLabel = obligations.included.map(o => o.short).join(' + ') + ' modules'
    return (
    <div>
      <h2 style={sectionHead}>Compliance cost estimate</h2>
      <p style={sectionSub}>Estimated cost to bring {deal.target_name || 'the target'} into ESG compliance — for your IC memo and deal valuation adjustment.</p>

      {!complianceCost ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888784' }}>
          Enter deal value in Step 1 to generate a compliance cost estimate.
        </div>
      ) : (
        <>
          {/* Black hero — consultant vs ThemisIQ, summed over the INCLUDED obligations only */}
          <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>Estimated ESG compliance cost — {deal.target_name || 'Target'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Traditional consultant</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#fff', lineHeight: 1.1 }}>{consultantRange}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>first-year, billed by the hour</div>
              </div>
              <div style={{ borderLeft: '0.5px solid rgba(255,255,255,0.12)', paddingLeft: 16 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>With ThemisIQ</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.9rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1.1 }}>{themisIqFigure}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{includedModulesLabel}</div>
              </div>
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid rgba(255,255,255,0.1)', fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>
              Priced like sustainability software, scoped like a consultant&rsquo;s engagement. The difference is automation, not depth: traditional fees are dominated by manual data-collection and review hours — the platform handles those directly, without cutting the deliverable.
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#888784', marginTop: -8, marginBottom: 16, lineHeight: 1.6 }}>Benchmark figures shown in USD. <strong style={{ fontWeight: 600 }}>How we benchmark:</strong> per-obligation market ranges for standalone ESG due-diligence workstreams, scaled by number of locations and sector intensity — indicative, not a quote.</div>

          {/* Pipeline-ROI scenario — DASHBOARD ONLY (not shared into the public /deals/[token] page:
              wrong audience). Reuses the already-computed consultant range × DEFAULT_PIPELINE_TARGETS
              and the annual themisIqFigure — no new numbers. */}
          <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#7425e3', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Across your pipeline</div>
            {obligations.locationUnset ? (
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6 }}>Enter a location count to see your annual ThemisIQ price — one subscription covers your whole screening pipeline, not one deal.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.6 }}>
                  Screen ~{DEFAULT_PIPELINE_TARGETS} targets/year. Traditional ESG due diligence: <strong>~USD {Math.round(obligations.consultantLow * DEFAULT_PIPELINE_TARGETS / 1000)}k–{Math.round(obligations.consultantHigh * DEFAULT_PIPELINE_TARGETS / 1000)}k</strong> in per-engagement fees. ThemisIQ: <strong style={{ color: '#0F6E56' }}>{themisIqFigure}</strong> per year, unlimited targets.
                </div>
                <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 6 }}>One subscription covers your whole screening pipeline, not one deal.</div>
              </>
            )}
          </div>

          {/* Included for this deal */}
          <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0F6E56', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Included for this deal</div>
            {obligations.included.map((o, i) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: '#0d0d0d' }}>✓ {o.label}</div>
                {o.scopeNote && (
                  <div style={{ fontSize: 11, color: '#888784', marginLeft: 18, marginTop: 1, lineHeight: 1.5 }}>{o.scopeNote}</div>
                )}
              </div>
            ))}
            <div style={{ fontSize: 13, color: '#0d0d0d', marginBottom: 6 }}>✓ Immutable audit trail</div>
            <div style={{ fontSize: 13, color: '#0d0d0d', marginBottom: 6 }}>✓ SBTi science-based target setting</div>
            <div style={{ fontSize: 13, color: '#0d0d0d', marginBottom: 10 }}>✓ Assurance-ready verification package</div>
            {frameworks.length > 0 && (
              <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6, borderTop: '0.5px solid rgba(15,110,86,0.15)', paddingTop: 8 }}>
                Frameworks detected for this deal: {frameworks.join(', ')}.
              </div>
            )}
          </div>

          {/* Also recommended — NOT summed into the headline */}
          {obligations.recommended.map((o, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Also recommended</div>
                <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0d0d0d' }}>{o.pricing.kind === 'priced' ? `+ ${obligationPriceLabel(o.pricing)}` : obligationPriceLabel(o.pricing)}</div>
                <div style={{ fontSize: 11, color: '#888784', marginTop: 2 }}>consultant USD {Math.round(o.consultantLow / 1000)}k–{Math.round(o.consultantHigh / 1000)}k</div>
              </div>
            </div>
          ))}

          {/* Flagged — honest caveat, summed into NEITHER figure */}
          {obligations.flagged.map((o, i) => (
            <div key={i} style={{ background: '#FBF3E2', border: '0.5px solid rgba(146,102,10,0.25)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#92660A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Covered via SBTi target-setting</div>
              <div style={{ fontSize: 13, color: '#555553' }}>{o.label}</div>
              {o.scopeNote && <div style={{ fontSize: 11, color: '#888784', marginTop: 3, lineHeight: 1.5 }}>{o.scopeNote}</div>}
            </div>
          ))}

          {/* ESG value-at-risk EXPOSURE — from getComplianceCost. A RISK metric the analyst diligences
              AGAINST, not a cost and NOT compared to the ThemisIQ price. Kept visually + semantically
              separate from the consultant-vs-ThemisIQ cost hero above (different concept). */}
          <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '0.85rem 1.25rem', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>ESG value-at-risk exposure</div>
            <div style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.6 }}>
              ~{(complianceCost.pctLow * 100).toFixed(2)}%–{(complianceCost.pctHigh * 100).toFixed(2)}% of deal value (~USD {Math.round(complianceCost.low).toLocaleString()}–{Math.round(complianceCost.high).toLocaleString()}) carries ESG-related risk to assess.
            </div>
            <div style={{ fontSize: 11, color: '#888784', lineHeight: 1.6, marginTop: 4 }}>
              {deal.sector || '—'}, {deal.jurisdiction}, {frameworks.length} applicable frameworks · indicative exposure, not a cost · requires specialist confirmation.
            </div>
          </div>

          <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>Deal structuring note</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
              Consider including ESG compliance costs in purchase price adjustment mechanics, or structuring an escrow/holdback for regulatory compliance. ThemisIQ Advisory can provide a detailed compliance roadmap for IC approval. If the deal proceeds, ThemisIQ can complete the target&rsquo;s compliance work directly — share this assessment with the target from the Export step.
            </div>
          </div>
        </>
      )}
    </div>
    )
  }

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export ESG diligence report</h2>
      <p style={sectionSub}>Download your ESG due diligence summary for the deal memo, IC pack, or LP reporting.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Report summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Target', val: deal.target_name || '—' },
            { label: 'ESG risks', val: risks.length, urgent: criticalRisks.length > 0 },
            // A bare "0" in 1.6rem Georgia reads as an assessed count. Only render a number
            // when something was actually assessed.
            { label: 'Frameworks', val: view.evaluated ? frameworks.length : 'Not assessed' },
            { label: 'ThemisIQ est.', val: themisIqFigure },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'Georgia, serif' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? '#64fe3e' : '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Export is reachable with revenue blank (the step tabs and Next are ungated, and the
          confirm checkbox is a liability disclaimer, not a completeness check). The report stays
          downloadable — it is still useful — but the reader is told what is missing from it. */}
      {view.notAssessed.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ba7517', letterSpacing: '0.04em', marginBottom: 4 }}>PARTIAL — REVENUE NOT PROVIDED</div>
          <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
            Frameworks determinable from jurisdiction and sector <strong style={{ fontWeight: 600 }}>have</strong> been assessed and appear in this report. {view.notAssessed.join(' and ')} {view.notAssessed.length === 1 ? 'is' : 'are'} marked <strong style={{ fontWeight: 600 }}>NOT ASSESSED</strong> — that is not a finding that {view.notAssessed.length === 1 ? 'it does' : 'they do'} not apply. {resolveFieldsPrompt(view.fieldsToResolve, view.notAssessed)}
          </div>
        </div>
      )}

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm this assessment is for planning purposes only and does not constitute legal, financial, or regulatory advice. Compliance costs are indicative estimates only.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: dataConfirmed ? 'pointer' : 'not-allowed', opacity: dataConfirmed ? 1 : 0.4 }}>
            ⬇ Download ESG Diligence Report (CSV)
          </button>

          {/* Share with target — public /deals/[token] link. Gated on a saved deal with a token. */}
          <div style={{ marginTop: 24, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 4 }}>Share with target company</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 14 }}>
              Share this assessment with the target company. They&rsquo;ll see the compliance findings and cost estimate — not your deal economics.
            </div>
            {!dealId || !dealToken ? (
              <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>Save the deal to generate a shareable link.</div>
            ) : shareEnabled ? (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56', marginBottom: 12 }}>🟢 Link active — anyone with this URL can view this assessment.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
                  <input readOnly value={shareUrl} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 220, fontSize: 12, padding: '9px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4', background: '#fff', color: '#555553' }} />
                  <button onClick={copyShareLink} style={{ fontSize: 12, fontWeight: 500, padding: '9px 16px', borderRadius: 8, background: copiedShare ? '#E1F5EE' : '#fff', border: `0.5px solid ${copiedShare ? '#0F6E56' : '#e8e7e4'}`, color: copiedShare ? '#0F6E56' : '#555553', cursor: 'pointer', whiteSpace: 'nowrap' }}>{copiedShare ? '✓ Copied!' : 'Copy link'}</button>
                </div>
                <button onClick={() => toggleShare(false)} disabled={shareSaving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 8, background: '#fff', border: '1px solid #B91C1C', color: '#B91C1C', cursor: shareSaving ? 'not-allowed' : 'pointer' }}>{shareSaving ? 'Updating…' : 'Revoke access'}</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: '#888784', marginBottom: 12 }}>🔒 Not shared — only you can see this assessment.</div>
                <button onClick={() => toggleShare(true)} disabled={shareSaving} style={{ fontSize: 13, fontWeight: 600, padding: '10px 22px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: shareSaving ? 'not-allowed' : 'pointer' }}>{shareSaving ? 'Generating…' : 'Generate share link'}</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Unlock your full ESG diligence programme</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 20, lineHeight: 1.6 }}>Download your ESG diligence report, generate IC-ready compliance cost analysis, and access ThemisIQ's deal-specific ESG advisory.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: '#0d0d0d', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: '#0C447C', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>UK SECR in force now · UK SRS (ISSB-aligned) proposed mandatory from 2027 · IFRS S2 effective · SB 253 first report 2026 · CSRD for large EU companies. ESG is a material deal risk.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888784', marginBottom: 4 }}>Deals & Investment</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>ESG Deal Due Diligence</div>
          </div>
          {deal.target_name && <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{deal.target_name}</div>}
        </div>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : '#888784', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0C447C' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {i + 1}. {name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: step === 4 ? '1fr' : '1fr 260px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
            {steps[step]()}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ fontSize: 13, padding: '9px 20px', borderRadius: 8, background: 'none', border: '1px solid #e8e7e4', color: '#555553', cursor: step === 0 ? 'not-allowed' : 'pointer', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
              <button onClick={handleSave} disabled={saving} style={{ fontSize: 13, fontWeight: saved ? 500 : 600, padding: '9px 20px', borderRadius: 8, background: saved ? '#E1F5EE' : GRAD, border: saved ? '1px solid #0F6E56' : 'none', color: saved ? '#0F6E56' : '#0d0d0d', cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save deal'}</button>
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Deal summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Target', val: deal.target_name || '—' },
                    { label: 'Sector', val: deal.sector || '—' },
                    { label: 'Deal type', val: DEAL_TYPES.find(d => d.id === deal.deal_type)?.label.split(' —')[0] || '—' },
                    { label: 'Critical risks', val: criticalRisks.length, urgent: criticalRisks.length > 0 },
                    { label: 'Frameworks', val: view.evaluated ? frameworks.length : 'Not assessed' },
                    { label: 'ThemisIQ est.', val: themisIqFigure },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? '#64fe3e' : '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              {criticalRisks.length > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ {criticalRisks.length} critical ESG risk{criticalRisks.length > 1 ? 's' : ''}</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>Material findings require specialist ESG diligence before IC approval</div>
                </div>
              )}
              <div style={{ marginTop: 10, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                {frameworks.length > 0 ? (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}><strong>{frameworks.join(' · ')}</strong><br />ESG is now a material deal risk</div>
                ) : (
                  <div style={{ fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>Enter sector, jurisdiction & target revenue in Step 1 to detect applicable frameworks</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
