'use client'

// app/dashboard/cbam/disclosures/page.tsx
// CBAM installation disclosures — Annex IV §1.2 items (7)-(11) plus the
// processes_complete attestation. First CBAM UI surface.
//
// Moved here 29 Jul 2026 from /dashboard/cbam, which becomes the CBAM readiness hub — a
// first-time customer was landing on this form as their first screen, with no orientation
// and no route to the setup that must happen first.
//
// THREE-STATE, NOT TWO. Every disclosure boolean initialises to null and a
// question never touched saves as null, never false. This is load-bearing:
//   false = the operator DECLARED this does not occur (an affirmative negative)
//   null  = nobody has answered yet (no declaration)
// lib/cbam/report/build.ts reports null as `missing` (correct and honest) and a
// `not null default false` — or a two-state checkbox — would fabricate eleven
// declarations the operator never made on a verifier-facing artifact. The
// three-state DisclosureQuestion control is the whole point; do not collapse it.
//
// DB constraint cbam_disclosures_elec_gate (20260719_cbam_disclosures.sql):
//   CHECK (electricity_produced_onsite IS NOT FALSE
//          OR (all five (11)(a)-(d) sub-flags IS NULL))
// So when the (11) gate is set to false we clear the five sub-flags to null in
// state IMMEDIATELY (and say so visibly), or the INSERT would be rejected.
// Setting the gate to null must NOT clear them — null permits sub-flags.
//
// processes_complete is an ATTESTATION of legal weight, not a factual
// disclosure — its own bordered block, never pre-set, never inferred, null
// until the operator acts. processes_complete_declared_at is stamped by a DB
// trigger; we never send a client value for it.

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import DisclosureQuestion, { cbamInputStyle, CbamField } from '../components/DisclosureQuestion'
import { itemHead, sectionHeadFixed as sectionHead } from '@/app/components/headingStyles'

// ── House style, matching app/dashboard/ghg/page.tsx (sectionHead/sectionSub) ──
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }

type Installation = { id: string; company_id: string; name: string; country: string }

// Mirrors the writable columns of cbam_installation_disclosures. processes_complete
// lives here so it upserts with the rest; processes_complete_declared_at does NOT —
// the DB trigger owns it.
type Disclosures = {
  heat_imported: boolean | null
  heat_exported: boolean | null
  zero_rated_fuels_used: boolean | null
  zero_rated_fuels_demonstration: string | null
  waste_gases_produced_used: boolean | null
  waste_gases_imported: boolean | null
  waste_gases_exported: boolean | null
  co2_capture_used: boolean | null
  co2_capture_transferred_to: string | null
  electricity_produced_onsite: boolean | null
  elec_cogeneration: boolean | null
  elec_separate_generation: boolean | null
  elec_source_fossil: boolean | null
  elec_source_renewable: boolean | null
  elec_exported_from_process: boolean | null
  processes_complete: boolean | null
}

// Every field null: unanswered is the default. An untouched question MUST save
// as null, never false.
const EMPTY_DISCLOSURES: Disclosures = {
  heat_imported: null,
  heat_exported: null,
  zero_rated_fuels_used: null,
  zero_rated_fuels_demonstration: null,
  waste_gases_produced_used: null,
  waste_gases_imported: null,
  waste_gases_exported: null,
  co2_capture_used: null,
  co2_capture_transferred_to: null,
  electricity_produced_onsite: null,
  elec_cogeneration: null,
  elec_separate_generation: null,
  elec_source_fossil: null,
  elec_source_renewable: null,
  elec_exported_from_process: null,
  processes_complete: null,
}

// The five (11)(a)-(d) sub-flags — the ones the DB gate constraint requires to
// be null when the gate is false.
const ELEC_SUBFLAGS: (keyof Disclosures)[] = [
  'elec_cogeneration', 'elec_separate_generation', 'elec_source_fossil', 'elec_source_renewable', 'elec_exported_from_process',
]

function pickDisclosures(row: Record<string, unknown>): Disclosures {
  const out = { ...EMPTY_DISCLOSURES }
  ;(Object.keys(EMPTY_DISCLOSURES) as (keyof Disclosures)[]).forEach((k) => {
    const v = row[k]
    // @ts-expect-error — narrowed by the key set; DB returns boolean|string|null per column
    out[k] = v === undefined ? null : v
  })
  return out
}

export default function CbamDisclosuresPage() {
  const isPaid = useEntitlement('cbam')

  const [loadingInstallations, setLoadingInstallations] = useState(true)
  const [installations, setInstallations] = useState<Installation[]>([])
  const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null)
  const [reportingPeriod, setReportingPeriod] = useState<number>(2026)

  const [loadingRow, setLoadingRow] = useState(false)
  const [disc, setDisc] = useState<Disclosures>(EMPTY_DISCLOSURES)
  const [declaredAt, setDeclaredAt] = useState<string | null>(null)
  const [subFlagsCleared, setSubFlagsCleared] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedInstallation = installations.find((i) => i.id === selectedInstallationId) ?? null

  // ── Load the owner's installations (RLS scopes to owner; no API route) ──
  useEffect(() => {
    if (!isPaid) return
    let cancelled = false
    setLoadingInstallations(true)
    supabase
      .from('cbam_installations')
      .select('id, company_id, name, country')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setLoadingInstallations(false)
          return
        }
        const rows = (data ?? []) as Installation[]
        setInstallations(rows)
        setSelectedInstallationId((prev) => prev ?? rows[0]?.id ?? null)
        setLoadingInstallations(false)
      })
    return () => { cancelled = true }
  }, [isPaid])

  // ── Load the disclosure row for the selected (installation, period) ──
  useEffect(() => {
    if (!selectedInstallationId) return
    let cancelled = false
    setLoadingRow(true)
    setError(null)
    setSaved(false)
    setSubFlagsCleared(false)
    supabase
      .from('cbam_installation_disclosures')
      .select('*')
      .eq('installation_id', selectedInstallationId)
      .eq('reporting_period', reportingPeriod)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setError(error.message)
          setLoadingRow(false)
          return
        }
        if (data) {
          setDisc(pickDisclosures(data as Record<string, unknown>))
          setDeclaredAt((data as Record<string, unknown>).processes_complete_declared_at as string | null ?? null)
        } else {
          setDisc(EMPTY_DISCLOSURES)
          setDeclaredAt(null)
        }
        setLoadingRow(false)
      })
    return () => { cancelled = true }
  }, [selectedInstallationId, reportingPeriod])

  function setField<K extends keyof Disclosures>(k: K, v: Disclosures[K]) {
    setSaved(false)
    setDisc((d) => ({ ...d, [k]: v }))
  }

  // (11) gate. On a change to FALSE, clear the five sub-flags to null in the
  // SAME update — otherwise cbam_disclosures_elec_gate rejects the save — and
  // surface a visible note that they were cleared. null/true never clear.
  function setElecGate(v: boolean | null) {
    setSaved(false)
    if (v === false) {
      setDisc((d) => {
        const anySub = ELEC_SUBFLAGS.some((k) => d[k] !== null)
        if (anySub) setSubFlagsCleared(true)
        return {
          ...d,
          electricity_produced_onsite: false,
          elec_cogeneration: null,
          elec_separate_generation: null,
          elec_source_fossil: null,
          elec_source_renewable: null,
          elec_exported_from_process: null,
        }
      })
    } else {
      setSubFlagsCleared(false)
      setDisc((d) => ({ ...d, electricity_produced_onsite: v }))
    }
  }

  // Attestation. Explicit operator action only — never pre-set, never inferred.
  function setProcessesComplete(v: boolean | null) {
    setSaved(false)
    setDisc((d) => ({ ...d, processes_complete: v }))
  }

  async function save() {
    if (!selectedInstallation) return
    setSaving(true)
    setError(null)
    setSaved(false)
    // company_id comes from the selected installation. processes_complete_declared_at
    // is deliberately NOT sent — the DB trigger stamps it server-side.
    const payload = {
      installation_id: selectedInstallation.id,
      company_id: selectedInstallation.company_id,
      reporting_period: reportingPeriod,
      ...disc,
    }
    const { data, error } = await supabase
      .from('cbam_installation_disclosures')
      .upsert(payload, { onConflict: 'installation_id,reporting_period' })
      .select()
      .single()
    if (error) {
      // Surface the DB error verbatim: the operator must be able to tell
      // cbam_disclosures_elec_gate apart from the trigger's
      // 'processes_complete cannot be true: no processes exist...' rejection.
      setError(error.message)
      setSaving(false)
      return
    }
    setDeclaredAt((data as Record<string, unknown>)?.processes_complete_declared_at as string | null ?? null)
    setSubFlagsCleared(false)
    setSaved(true)
    setSaving(false)
  }

  // ── Unpaid → paywall (same treatment as other dashboard pages) ──
  if (!isPaid) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={{ position: 'relative', minHeight: 320 }}>
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
            <div style={sectionHead}>CBAM installation disclosures</div>
            <div style={sectionSub}>Annex IV §1.2 items (7)–(11) plus the process-completeness attestation.</div>
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>CBAM is a paid module.</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 400 }}>Build your verifier-ready Carbon Border Adjustment Mechanism report — installation disclosures, embedded-emissions calculations, and Annex IV §1.2 output. Unlock the CBAM module to begin.</div>
              <button onClick={() => (window.location.href = '/pricing')} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-brand)', color: '#0d0d0d' }}>
                Unlock CBAM →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Empty state: no installations → do NOT render the form ──
  // There is no installation-creation UI yet; say so honestly rather than
  // rendering a form that cannot save (every disclosure row needs an
  // installation_id + company_id).
  if (!loadingInstallations && installations.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={sectionHead}>CBAM installation disclosures</div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', marginTop: '1rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>No installations yet</div>
          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>
            Disclosures are recorded for each installation and reporting period, so you&rsquo;ll need to add an installation first. You can do that in{' '}
            <a href="/dashboard/cbam/setup" style={{ color: 'var(--color-brand)', textDecoration: 'underline' }}>setup</a>, then come back here.
          </div>
        </div>
      </div>
    )
  }

  const disabled = loadingRow || saving

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
      <div style={sectionHead}>CBAM installation disclosures</div>
      <div style={sectionSub}>
        Annex IV §1.2 items (7)–(11) — the plant-characteristic disclosures — plus the process-completeness attestation. Every question has three states: Yes, No, and unanswered. Leave a question unanswered until you can answer it truthfully; an unanswered question is reported as <em>missing</em>, never as a declared “No”.
      </div>

      {/* ── Installation + reporting-period selectors ── */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <CbamField label="Installation">
            <select
              value={selectedInstallationId ?? ''}
              onChange={(e) => setSelectedInstallationId(e.target.value || null)}
              disabled={loadingInstallations}
              style={cbamInputStyle}
            >
              {installations.map((i) => (
                <option key={i.id} value={i.id}>{i.name} — {i.country}</option>
              ))}
            </select>
          </CbamField>
        </div>
        <div style={{ width: 200 }}>
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
      </div>

      {loadingRow && <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>Loading disclosures…</div>}

      {/* ── (7) heat ── */}
      <div style={itemHead}>(7) Whether measurable heat is imported from or exported to other installations.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DisclosureQuestion
          question="Measurable heat is imported from other installations"
          hint="Annex IV §1.2 (7). Independent of export below. Leave unanswered if not yet determined."
          value={disc.heat_imported}
          onChange={(v) => setField('heat_imported', v)}
          disabled={disabled}
        />
        <DisclosureQuestion
          question="Measurable heat is exported to other installations"
          hint="Annex IV §1.2 (7). Independent of import above. Leave unanswered if not yet determined."
          value={disc.heat_exported}
          onChange={(v) => setField('heat_exported', v)}
          disabled={disabled}
        />
      </div>

      {/* ── (8) zero-rated fuels ── */}
      <div style={itemHead}>(8) Whether any zero-rated fuels are used and how the operator demonstrates the applicability of zero-rating of the fuels.</div>
      <DisclosureQuestion
        question="Zero-rated fuels are used"
        hint="Annex IV §1.2 (8). If yes, describe how zero-rating applicability is demonstrated."
        value={disc.zero_rated_fuels_used}
        onChange={(v) => setField('zero_rated_fuels_used', v)}
        disabled={disabled}
      >
        <CbamField label="How the operator demonstrates the applicability of zero-rating of the fuels">
          <textarea
            value={disc.zero_rated_fuels_demonstration ?? ''}
            onChange={(e) => setField('zero_rated_fuels_demonstration', e.target.value || null)}
            placeholder="Describe the evidence and basis for zero-rating…"
            rows={3}
            style={{ ...cbamInputStyle, resize: 'vertical' }}
            disabled={disabled}
          />
        </CbamField>
      </DisclosureQuestion>

      {/* ── (9) waste gases ── */}
      <div style={itemHead}>(9) Whether waste gases are produced and used in the installation, or imported from or exported to other installations.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <DisclosureQuestion
          question="Waste gases are produced and used in the installation"
          hint="Annex IV §1.2 (9). Independent of import/export below."
          value={disc.waste_gases_produced_used}
          onChange={(v) => setField('waste_gases_produced_used', v)}
          disabled={disabled}
        />
        <DisclosureQuestion
          question="Waste gases are imported from other installations"
          hint="Annex IV §1.2 (9)."
          value={disc.waste_gases_imported}
          onChange={(v) => setField('waste_gases_imported', v)}
          disabled={disabled}
        />
        <DisclosureQuestion
          question="Waste gases are exported to other installations"
          hint="Annex IV §1.2 (9)."
          value={disc.waste_gases_exported}
          onChange={(v) => setField('waste_gases_exported', v)}
          disabled={disabled}
        />
      </div>

      {/* ── (10) CO₂ capture ── */}
      <div style={itemHead}>(10) Whether CO₂ capture is used, and an identification of the installation or transport infrastructure to which it is transferred.</div>
      <DisclosureQuestion
        question="CO₂ capture is used"
        hint="Annex IV §1.2 (10). If yes, identify where the captured CO₂ is transferred."
        value={disc.co2_capture_used}
        onChange={(v) => setField('co2_capture_used', v)}
        disabled={disabled}
      >
        <CbamField label="Identification of the installation or transport infrastructure to which it is transferred">
          <input
            value={disc.co2_capture_transferred_to ?? ''}
            onChange={(e) => setField('co2_capture_transferred_to', e.target.value || null)}
            placeholder="e.g. transport pipeline / storage site identifier…"
            style={cbamInputStyle}
            disabled={disabled}
          />
        </CbamField>
      </DisclosureQuestion>

      {/* ── (11) on-site electricity — the gate ── */}
      <div style={itemHead}>(11) For indirect emissions, where electricity is produced inside the installation, whether electricity is: (a) produced by co-generation; (b) produced by separate generation; (c) produced from fossil or renewable sources; (d) exported from the system boundaries of a production process.</div>
      <DisclosureQuestion
        question="Electricity is produced inside the installation"
        hint="Annex IV §1.2 (11). The (a)–(d) sub-answers below apply only when this is Yes. Answering No clears them (they cannot apply); leaving this unanswered keeps any sub-answers."
        value={disc.electricity_produced_onsite}
        onChange={setElecGate}
        disabled={disabled}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DisclosureQuestion
            question="produced by co-generation"
            hint="Annex IV §1.2 (11)(a)."
            value={disc.elec_cogeneration}
            onChange={(v) => setField('elec_cogeneration', v)}
            disabled={disabled}
          />
          <DisclosureQuestion
            question="produced by separate generation"
            hint="Annex IV §1.2 (11)(b)."
            value={disc.elec_separate_generation}
            onChange={(v) => setField('elec_separate_generation', v)}
            disabled={disabled}
          />
          <DisclosureQuestion
            question="produced from fossil sources"
            hint="Annex IV §1.2 (11)(c). Both fossil and renewable may be Yes — a plant can generate from both."
            value={disc.elec_source_fossil}
            onChange={(v) => setField('elec_source_fossil', v)}
            disabled={disabled}
          />
          <DisclosureQuestion
            question="produced from renewable sources"
            hint="Annex IV §1.2 (11)(c). Both fossil and renewable may be Yes — a plant can generate from both."
            value={disc.elec_source_renewable}
            onChange={(v) => setField('elec_source_renewable', v)}
            disabled={disabled}
          />
          <DisclosureQuestion
            question="exported from the system boundaries of a production process"
            hint="Annex IV §1.2 (11)(d)."
            value={disc.elec_exported_from_process}
            onChange={(v) => setField('elec_exported_from_process', v)}
            disabled={disabled}
          />
        </div>
      </DisclosureQuestion>
      {subFlagsCleared && disc.electricity_produced_onsite === false && (
        <div style={{ marginTop: 10, background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
          The (11)(a)–(d) sub-answers were cleared because you answered “No” to on-site electricity generation — they no longer apply, and the database rejects a saved “No” that still carries them. Answer “Yes” again to re-enter them.
        </div>
      )}

      {/* ── The attestation — visually distinct, NOT a DisclosureQuestion ── */}
      <div style={{ marginTop: '2.5rem', border: '1.5px solid var(--color-brand)', borderRadius: 12, padding: '1.5rem', background: 'var(--color-brand-wash)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-brand)', marginBottom: 8 }}>Declaration — legal weight</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 10 }}>Process-set completeness attestation</div>
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400, marginBottom: '1rem' }}>
          This is a declaration, not a factual disclosure. Attesting that the process set is complete is an assertion — under the reasonable-assurance standard — that the production processes recorded for <strong>this installation and reporting period</strong> are the complete set. It gates §1.2 items 5 and 6 (installation-level total direct and indirect emissions): <strong>those totals cannot be reported without this attestation</strong>, because a partial sum must never be presented as an installation-level total. It is unset until you act — never pre-selected.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setProcessesComplete(true)}
            disabled={disabled}
            style={attestBtn(disc.processes_complete === true, disabled)}
          >
            I attest: the process set is complete
          </button>
          <button
            type="button"
            onClick={() => setProcessesComplete(false)}
            disabled={disabled}
            style={attestBtn(disc.processes_complete === false, disabled)}
          >
            Declare incomplete
          </button>
          {disc.processes_complete !== null && (
            <button
              type="button"
              onClick={() => setProcessesComplete(null)}
              disabled={disabled}
              style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--color-ink-muted)', border: '0.5px solid #e8e7e4', cursor: disabled ? 'not-allowed' : 'pointer' }}
              title="Retract to unanswered — the declaration timestamp is cleared server-side on save"
            >
              Clear
            </button>
          )}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-ink-muted)' }}>
          {disc.processes_complete === null && 'Not yet declared.'}
          {disc.processes_complete === false && 'Declared incomplete — installation-level totals (items 5 and 6) will not be reported.'}
          {disc.processes_complete === true && (
            declaredAt
              ? `Declared complete. Attested at ${new Date(declaredAt).toLocaleString()} (server timestamp).`
              : 'Declared complete — the attestation timestamp is stamped by the server when you save.'
          )}
        </div>
      </div>

      {/* ── Errors (verbatim) + save ── */}
      {error && (
        <div style={{ marginTop: '1.5rem', background: '#FEE2E2', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#991b1b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          <strong>Could not save:</strong> {error}
        </div>
      )}

      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={save}
          disabled={disabled || !selectedInstallation}
          style={{ fontSize: 14, fontWeight: 600, padding: '12px 28px', borderRadius: 10, border: 'none', cursor: disabled || !selectedInstallation ? 'not-allowed' : 'pointer', background: 'var(--color-brand)', color: '#0d0d0d', opacity: disabled || !selectedInstallation ? 0.6 : 1 }}
        >
          {saving ? 'Saving…' : 'Save disclosures'}
        </button>
        {saved && <span style={{ fontSize: 13, color: '#0F6E56' }}>✓ Saved</span>}
      </div>
    </div>
  )
}

/**
 * The two attestation buttons — "I attest: the process set is complete" and "Declare incomplete".
 *
 * ⚠️ THREE THINGS WERE WRONG HERE AT ONCE, and all three mattered because of what this control
 * asserts under the reasonable-assurance standard:
 *
 *  1. The fill was #7425e3, the retired brand violet.
 *  2. SELECTED was a saturated fill with a reversed label. Selection in this system is
 *     var(--color-brand-wash) with a var(--color-brand) border and an ink label — a marked row,
 *     not an inverted one.
 *  3. DISABLED was opacity: 0.6, which composited the selected face to 3.06:1. Group opacity
 *     fades the label with the fill, so the attestation the user had just made became hard to
 *     read the moment the row began saving. See the DISABLED AND INACTIVE STATE block in
 *     app/styles/themisiq-tokens.css.
 */
function attestBtn(selected: boolean, disabled: boolean): React.CSSProperties {
  if (disabled) {
    return {
      fontSize: 13,
      fontWeight: 600,
      padding: '9px 18px',
      borderRadius: 8,
      // The explicit disabled palette — .tq-disabled's values, inline because this is a style
      // object rather than an element. Never opacity.
      background: 'var(--color-sunken)',
      color: 'var(--color-ink-muted)',
      // ⚠️ THE SELECTION SURVIVES BEING DISABLED. A flat disabled face would render "attested"
      // and "not attested" identically while the row saves, hiding which declaration the user
      // just made at the one moment they might want to check it. The brand edge is kept; only
      // the fill and label recede.
      border: `1px solid ${selected ? 'var(--color-brand)' : 'var(--color-line)'}`,
      cursor: 'not-allowed',
    }
  }
  return {
    fontSize: 13,
    fontWeight: 600,
    padding: '9px 18px',
    borderRadius: 8,
    background: selected ? 'var(--color-brand-wash)' : '#fff',
    color: selected ? 'var(--color-ink)' : '#555553',
    border: `1px solid ${selected ? 'var(--color-brand)' : '#e8e7e4'}`,
    cursor: 'pointer',
  }
}
