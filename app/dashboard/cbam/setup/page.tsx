'use client'

// app/dashboard/cbam/setup/page.tsx
// CBAM intake wizard. THIS INCREMENT builds steps 1 and 2 only — operator
// profile and installations. Steps 3 (processes / source streams / charge mix)
// and 4 (precursors) are marked placeholders, not built here.
//
// Together steps 1 and 2 close 7 of the report's outstanding items:
//   (1)(a)(b)(c) operator identity, and (2)(b)(c)(d)(e) installation identity.
//
// EVERY FIELD IS NULLABLE IN THE DB BY DESIGN (see 20260719_cbam_identity.sql):
// intake is progressive, so an incomplete profile/installation MUST save and
// the report builder reports the gaps at report time. We therefore do NOT
// require fields client-side beyond the two genuine NOT NULL columns on
// cbam_installations (name, country). A blocked save is not honest; an absence
// reported as `missing` is.
//
// DB errors are surfaced VERBATIM — the operator needs to see exactly which
// CHECK/constraint rejected a save (e.g. the latitude/longitude range checks).

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import { cbamInputStyle, CbamField } from '../components/DisclosureQuestion'

// ── House style, matching app/dashboard/cbam/page.tsx ──
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }
const itemHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.15rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 10, marginTop: '2rem' }

type Step = 1 | 2 | 3 | 4
type Company = { id: string; name: string }

type OperatorProfile = {
  operator_name: string
  registration_no: string
  address_line1: string
  address_line2: string
  city: string
  postcode: string
  country: string
}
const EMPTY_OPERATOR: OperatorProfile = { operator_name: '', registration_no: '', address_line1: '', address_line2: '', city: '', postcode: '', country: '' }

// Form shape for an installation. latitude/longitude are kept as strings for the
// inputs ('' = null on save); id null = an unsaved new draft.
type InstallationForm = {
  id: string | null
  name: string
  country: string
  cbam_registry_id: string
  un_locode: string
  address_line1: string
  address_line2: string
  city: string
  postcode: string
  latitude: string
  longitude: string
}
const EMPTY_INSTALLATION: InstallationForm = { id: null, name: '', country: '', cbam_registry_id: '', un_locode: '', address_line1: '', address_line2: '', city: '', postcode: '', latitude: '', longitude: '' }

// A saved installation row as displayed in the list.
type InstallationRow = InstallationForm & { id: string }

// '' → null (a blank text box is not a value; store the absence).
function nullify(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

export default function CbamSetupPage() {
  const isPaid = useEntitlement('cbam')

  const [step, setStep] = useState<Step>(1)

  const [loadingCompanies, setLoadingCompanies] = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)

  // ── Step 1 state ──
  const [operator, setOperator] = useState<OperatorProfile>(EMPTY_OPERATOR)
  const [op1Saving, setOp1Saving] = useState(false)
  const [op1Saved, setOp1Saved] = useState(false)
  const [op1Error, setOp1Error] = useState<string | null>(null)

  // ── Step 2 state ──
  const [installations, setInstallations] = useState<InstallationRow[]>([])
  const [editing, setEditing] = useState<InstallationForm | null>(null)
  const [inst2Saving, setInst2Saving] = useState(false)
  const [inst2Saved, setInst2Saved] = useState(false)
  const [inst2Error, setInst2Error] = useState<string | null>(null)

  // ── Load the owner's companies (RLS scopes to user_id = auth.uid()) ──
  useEffect(() => {
    if (!isPaid) return
    let cancelled = false
    setLoadingCompanies(true)
    supabase
      .from('companies')
      .select('id, name')
      .order('name')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setOp1Error(error.message)
          setLoadingCompanies(false)
          return
        }
        const rows = (data ?? []) as Company[]
        setCompanies(rows)
        setCompanyId((prev) => prev ?? rows[0]?.id ?? null)
        setLoadingCompanies(false)
      })
    return () => { cancelled = true }
  }, [isPaid])

  // ── Load the operator profile for the selected company ──
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    setOp1Saved(false)
    setOp1Error(null)
    supabase
      .from('cbam_operator_profile')
      .select('operator_name, registration_no, address_line1, address_line2, city, postcode, country')
      .eq('company_id', companyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setOp1Error(error.message)
          return
        }
        if (data) {
          const d = data as Record<string, string | null>
          setOperator({
            operator_name: d.operator_name ?? '',
            registration_no: d.registration_no ?? '',
            address_line1: d.address_line1 ?? '',
            address_line2: d.address_line2 ?? '',
            city: d.city ?? '',
            postcode: d.postcode ?? '',
            country: d.country ?? '',
          })
        } else {
          setOperator(EMPTY_OPERATOR)
        }
      })
    return () => { cancelled = true }
  }, [companyId])

  // ── Load the installations for the selected company ──
  const loadInstallations = (cid: string) => {
    setInst2Error(null)
    supabase
      .from('cbam_installations')
      .select('id, name, country, cbam_registry_id, un_locode, address_line1, address_line2, city, postcode, latitude, longitude')
      .eq('company_id', cid)
      .order('name')
      .then(({ data, error }) => {
        if (error) {
          setInst2Error(error.message)
          return
        }
        const rows = (data ?? []) as Record<string, unknown>[]
        setInstallations(rows.map((r) => ({
          id: r.id as string,
          name: (r.name as string | null) ?? '',
          country: (r.country as string | null) ?? '',
          cbam_registry_id: (r.cbam_registry_id as string | null) ?? '',
          un_locode: (r.un_locode as string | null) ?? '',
          address_line1: (r.address_line1 as string | null) ?? '',
          address_line2: (r.address_line2 as string | null) ?? '',
          city: (r.city as string | null) ?? '',
          postcode: (r.postcode as string | null) ?? '',
          latitude: r.latitude == null ? '' : String(r.latitude),
          longitude: r.longitude == null ? '' : String(r.longitude),
        })))
      })
  }
  useEffect(() => {
    if (!companyId) return
    setEditing(null)
    setInst2Saved(false)
    loadInstallations(companyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  function setOp<K extends keyof OperatorProfile>(k: K, v: string) {
    setOp1Saved(false)
    setOperator((o) => ({ ...o, [k]: v }))
  }

  // ── Step 1 save — upsert on the (company_id) PK ──
  async function saveOperator() {
    if (!companyId) return
    setOp1Saving(true)
    setOp1Error(null)
    setOp1Saved(false)
    // updated_at is DB-defaulted — do not send it.
    const payload = {
      company_id: companyId,
      operator_name: nullify(operator.operator_name),
      registration_no: nullify(operator.registration_no),
      address_line1: nullify(operator.address_line1),
      address_line2: nullify(operator.address_line2),
      city: nullify(operator.city),
      postcode: nullify(operator.postcode),
      country: nullify(operator.country),
    }
    const { error } = await supabase
      .from('cbam_operator_profile')
      .upsert(payload, { onConflict: 'company_id' })
    if (error) {
      setOp1Error(error.message)
      setOp1Saving(false)
      return
    }
    setOp1Saved(true)
    setOp1Saving(false)
  }

  function setInst<K extends keyof InstallationForm>(k: K, v: string) {
    setInst2Saved(false)
    setEditing((e) => (e ? { ...e, [k]: v } : e))
  }

  // ── Step 2 save — insert (new) or update (existing) ──
  async function saveInstallation() {
    if (!companyId || !editing) return
    setInst2Saved(false)
    setInst2Error(null)

    // Only the two genuine NOT NULL columns are enforced client-side.
    if (editing.name.trim() === '') {
      setInst2Error('Installation name (2)(a) is required — it is a NOT NULL column.')
      return
    }
    const country = editing.country.trim().toUpperCase()
    if (country === '') {
      setInst2Error('Country (2)(d) is required — it is a NOT NULL column.')
      return
    }
    // Country keys the grid-factor lookup; a code that is not a two-letter ISO
    // code silently falls back to 'other', so we hold the line on the format.
    if (!/^[A-Z]{2}$/.test(country)) {
      setInst2Error(`Country must be a two-letter ISO code (e.g. DE, CN) — "${editing.country.trim()}" is not. It keys the grid-factor lookup; a mismatch silently falls back to 'other'. Use the code on the customer's customs paperwork.`)
      return
    }

    // Coordinate ranges — respected client-side; the DB CHECK is the backstop.
    let latitude: number | null = null
    if (editing.latitude.trim() !== '') {
      const n = Number(editing.latitude)
      if (Number.isNaN(n) || n < -90 || n > 90) {
        setInst2Error('Latitude (2)(e) must be a number between -90 and 90, or left blank.')
        return
      }
      latitude = n
    }
    let longitude: number | null = null
    if (editing.longitude.trim() !== '') {
      const n = Number(editing.longitude)
      if (Number.isNaN(n) || n < -180 || n > 180) {
        setInst2Error('Longitude (2)(e) must be a number between -180 and 180, or left blank.')
        return
      }
      longitude = n
    }

    setInst2Saving(true)
    const payload = {
      company_id: companyId,
      name: editing.name.trim(),
      country,
      cbam_registry_id: nullify(editing.cbam_registry_id),
      un_locode: nullify(editing.un_locode),
      address_line1: nullify(editing.address_line1),
      address_line2: nullify(editing.address_line2),
      city: nullify(editing.city),
      postcode: nullify(editing.postcode),
      latitude,
      longitude,
    }
    const query = editing.id
      ? supabase.from('cbam_installations').update(payload).eq('id', editing.id)
      : supabase.from('cbam_installations').insert(payload)
    const { error } = await query
    if (error) {
      // Verbatim — the operator must see e.g. the latitude/longitude CHECK message.
      setInst2Error(error.message)
      setInst2Saving(false)
      return
    }
    setInst2Saving(false)
    setInst2Saved(true)
    setEditing(null)
    loadInstallations(companyId)
  }

  // ── Unpaid → paywall (same treatment as the disclosures page) ──
  if (!isPaid) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={{ position: 'relative', minHeight: 320 }}>
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none' }}>
            <div style={sectionHead}>CBAM setup</div>
            <div style={sectionSub}>Operator profile and installations — the identity data behind the Annex IV §1.2 report.</div>
          </div>
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>CBAM is a paid module.</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 300 }}>Set up your operator profile and installations, then record disclosures and generate your Annex IV §1.2 report. Unlock the CBAM module to begin.</div>
              <button onClick={() => (window.location.href = '/pricing')} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d' }}>
                Unlock CBAM →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── No company → cannot proceed (company_id is required for every write) ──
  if (!loadingCompanies && companies.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
        <div style={sectionHead}>CBAM setup</div>
        <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', marginTop: '1rem' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>No company on your account yet</div>
          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 300 }}>
            Every CBAM record is owned by a company, so a company must exist first. Your account has none. Companies are created in the main product flow (e.g. the GHG module’s company step) — set one up there, then return here to continue CBAM setup.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '3rem 2rem' }}>
      <div style={sectionHead}>CBAM setup</div>
      <div style={sectionSub}>
        Enter the identity data behind your Annex IV §1.2 report. Steps run in dependency order — you cannot create a process without an installation. Everything saves incomplete; the report shows any gaps honestly rather than blocking you here.
      </div>

      {/* ── Company selector (only when there is more than one) ── */}
      {companies.length > 1 ? (
        <div style={{ marginBottom: '1.5rem', maxWidth: 420 }}>
          <CbamField label="Company" hint="You have more than one company. All CBAM records below are owned by the selected one.">
            <select value={companyId ?? ''} onChange={(e) => setCompanyId(e.target.value || null)} style={cbamInputStyle}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </CbamField>
        </div>
      ) : companies.length === 1 ? (
        <div style={{ marginBottom: '1.5rem', fontSize: 12, color: '#888784' }}>Company: <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{companies[0].name}</span></div>
      ) : null}

      {/* ── Step nav — dependency order explicit; Step 1 shown as prerequisite of
             Step 2 but navigation is NOT hard-blocked (a user may add an
             installation first). ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <StepTab n={1} label="Operator" sub="who you are" active={step === 1} onClick={() => setStep(1)} />
        <StepTab n={2} label="Installations" sub="where you produce" active={step === 2} onClick={() => setStep(2)} />
        <StepTab n={3} label="Processes & emissions" sub="coming next" active={step === 3} onClick={() => setStep(3)} muted />
        <StepTab n={4} label="Precursors" sub="coming next" active={step === 4} onClick={() => setStep(4)} muted />
      </div>
      {step === 2 && (
        <div style={{ fontSize: 11, color: '#888784', marginBottom: '1rem' }}>Step 1 (Operator) is a prerequisite for a complete report, but you can add installations first.</div>
      )}

      {/* ── STEP 1: OPERATOR PROFILE ── */}
      {step === 1 && (
        <div>
          <div style={itemHead}>(1) Identification of the operator</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.25rem' }}>
            One profile per company. Any field may be left blank — the report marks blanks as outstanding rather than blocking the save.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            <CbamField label="(1)(a) Operator name">
              <input value={operator.operator_name} onChange={(e) => setOp('operator_name', e.target.value)} placeholder="Legal name of the operator" style={cbamInputStyle} />
            </CbamField>
            <CbamField label="(1)(b) Registration number" hint="Corporate or activity registration number of the operator.">
              <input value={operator.registration_no} onChange={(e) => setOp('registration_no', e.target.value)} style={cbamInputStyle} />
            </CbamField>
            <CbamField label="(1)(c) Full address — in English" hint="Annex IV requires the address IN ENGLISH (Article 10(4)). Enter as much as you have; blanks are reported, not blocked.">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input value={operator.address_line1} onChange={(e) => setOp('address_line1', e.target.value)} placeholder="Address line 1" style={cbamInputStyle} />
                <input value={operator.address_line2} onChange={(e) => setOp('address_line2', e.target.value)} placeholder="Address line 2" style={cbamInputStyle} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={operator.city} onChange={(e) => setOp('city', e.target.value)} placeholder="City" style={{ ...cbamInputStyle, flex: 1, minWidth: 160 }} />
                  <input value={operator.postcode} onChange={(e) => setOp('postcode', e.target.value)} placeholder="Postcode" style={{ ...cbamInputStyle, width: 140 }} />
                  <input value={operator.country} onChange={(e) => setOp('country', e.target.value)} placeholder="Country" style={{ ...cbamInputStyle, width: 160 }} />
                </div>
              </div>
            </CbamField>
          </div>

          {op1Error && <ErrorBox prefix="Could not save operator profile" message={op1Error} />}

          <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <button type="button" onClick={saveOperator} disabled={op1Saving || !companyId} style={primaryBtn(op1Saving || !companyId)}>
              {op1Saving ? 'Saving…' : 'Save operator profile'}
            </button>
            {op1Saved && <span style={{ fontSize: 13, color: '#0F6E56' }}>✓ Saved</span>}
            {op1Saved && (
              <button type="button" onClick={() => setStep(2)} style={linkBtn}>Next: Installations →</button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 2: INSTALLATIONS ── */}
      {step === 2 && (
        <div>
          <div style={itemHead}>(2) The installation(s) under verification</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Add every installation you produce CBAM goods at. Only name and country are required; the rest may be filled in progressively.
          </div>

          {/* Existing installations */}
          {installations.length === 0 ? (
            <div style={{ fontSize: 13, color: '#888784', fontWeight: 300, marginBottom: '1rem' }}>No installations yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
              {installations.map((inst) => (
                <div key={inst.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{inst.name} <span style={{ color: '#888784', fontWeight: 300 }}>· {inst.country}</span></div>
                    <div style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>
                      {inst.cbam_registry_id ? `Registry ${inst.cbam_registry_id}` : 'No Registry ID'} · {inst.un_locode ? `UN/LOCODE ${inst.un_locode}` : 'No UN/LOCODE'} · {inst.latitude && inst.longitude ? `${inst.latitude}, ${inst.longitude}` : 'No coordinates'}
                    </div>
                  </div>
                  <button type="button" onClick={() => { setEditing(inst); setInst2Saved(false); setInst2Error(null) }} style={linkBtn}>Edit</button>
                </div>
              ))}
            </div>
          )}

          {!editing && (
            <button type="button" onClick={() => { setEditing(EMPTY_INSTALLATION); setInst2Saved(false); setInst2Error(null) }} style={primaryBtn(false)}>
              + Add installation
            </button>
          )}

          {/* Add / edit form */}
          {editing && (
            <div style={{ marginTop: '1rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', maxWidth: 620 }}>
              <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#0d0d0d', marginBottom: '1rem' }}>
                {editing.id ? 'Edit installation' : 'New installation'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <CbamField label="(2)(a) Installation name — required">
                  <input value={editing.name} onChange={(e) => setInst('name', e.target.value)} placeholder="e.g. Duisburg Works" style={cbamInputStyle} />
                </CbamField>
                <CbamField label="Country — required (two-letter ISO code)" hint="Two-letter ISO code (e.g. DE, CN). It keys the grid-factor lookup — a code that doesn’t match falls silently to 'other'. Use the code on the customer’s customs paperwork.">
                  <input value={editing.country} onChange={(e) => setInst('country', e.target.value)} placeholder="DE" maxLength={2} style={{ ...cbamInputStyle, width: 120, textTransform: 'uppercase' }} />
                </CbamField>
                <CbamField label="(2)(b) CBAM Registry installation ID">
                  <input value={editing.cbam_registry_id} onChange={(e) => setInst('cbam_registry_id', e.target.value)} style={cbamInputStyle} />
                </CbamField>
                <CbamField label="(2)(c) UN/LOCODE">
                  <input value={editing.un_locode} onChange={(e) => setInst('un_locode', e.target.value)} placeholder="e.g. DEDUI" style={cbamInputStyle} />
                </CbamField>
                <CbamField label="(2)(d) Full address — in English" hint="Annex IV requires the address IN ENGLISH (Article 10(4)).">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={editing.address_line1} onChange={(e) => setInst('address_line1', e.target.value)} placeholder="Address line 1" style={cbamInputStyle} />
                    <input value={editing.address_line2} onChange={(e) => setInst('address_line2', e.target.value)} placeholder="Address line 2" style={cbamInputStyle} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={editing.city} onChange={(e) => setInst('city', e.target.value)} placeholder="City" style={{ ...cbamInputStyle, flex: 1, minWidth: 160 }} />
                      <input value={editing.postcode} onChange={(e) => setInst('postcode', e.target.value)} placeholder="Postcode" style={{ ...cbamInputStyle, width: 140 }} />
                    </div>
                  </div>
                </CbamField>
                <CbamField label="(2)(e) Main emission source coordinates" hint="Coordinates of the MAIN emission source, not the postal address. Latitude −90 to 90, longitude −180 to 180. Optional.">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="number" value={editing.latitude} onChange={(e) => setInst('latitude', e.target.value)} placeholder="Latitude" step="any" style={{ ...cbamInputStyle, width: 180 }} />
                    <input type="number" value={editing.longitude} onChange={(e) => setInst('longitude', e.target.value)} placeholder="Longitude" step="any" style={{ ...cbamInputStyle, width: 180 }} />
                  </div>
                </CbamField>
              </div>

              {inst2Error && <ErrorBox prefix="Could not save installation" message={inst2Error} />}

              <div style={{ marginTop: '1.25rem', display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" onClick={saveInstallation} disabled={inst2Saving} style={primaryBtn(inst2Saving)}>
                  {inst2Saving ? 'Saving…' : (editing.id ? 'Save changes' : 'Add installation')}
                </button>
                <button type="button" onClick={() => { setEditing(null); setInst2Error(null) }} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          )}

          {inst2Saved && !editing && (
            <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#0F6E56' }}>✓ Saved</span>
              <a href="/dashboard/cbam" style={linkAnchor}>Record disclosures →</a>
              <a href="/dashboard/cbam/report" style={linkAnchor}>Generate report →</a>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: PLACEHOLDER — not built this increment ── */}
      {step === 3 && (
        <PlaceholderStep
          title="(3) Processes and emissions"
          body="Production processes, their routes and CN codes, source streams and charge mix are the next increment. Each process is created under an installation from Step 2 — that dependency is why this step comes after installations exist."
        />
      )}

      {/* ── STEP 4: PLACEHOLDER — not built this increment ── */}
      {step === 4 && (
        <PlaceholderStep
          title="(4) Precursors"
          body="Precursor inputs (goods consumed in a process, with their origin identity and default/actual values) come after processes exist. Building this next."
        />
      )}
    </div>
  )
}

// ── Small presentational helpers ──
function StepTab({ n, label, sub, active, onClick, muted }: { n: number; label: string; sub: string; active: boolean; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: active ? '#7425e3' : '#fff',
        color: active ? '#fff' : (muted ? '#888784' : '#0d0d0d'),
        border: `0.5px solid ${active ? '#7425e3' : '#e8e7e4'}`,
        borderRadius: 10,
        padding: '8px 14px',
        cursor: 'pointer',
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{n}. {label}</div>
      <div style={{ fontSize: 11, fontWeight: 300, color: active ? 'rgba(255,255,255,0.75)' : '#888784' }}>{sub}</div>
    </button>
  )
}

function PlaceholderStep({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: '1rem', background: '#f8f7f5', border: '0.5px dashed #d8d6d2', borderRadius: 12, padding: '2rem' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#888784', marginBottom: 6 }}>Coming next</div>
      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 300, maxWidth: 620 }}>{body}</div>
    </div>
  )
}

function ErrorBox({ prefix, message }: { prefix: string; message: string }) {
  return (
    <div style={{ marginTop: '1.25rem', background: '#FEE2E2', border: '0.5px solid #fca5a5', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#991b1b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
      <strong>{prefix}:</strong> {message}
    </div>
  )
}

const primaryBtn = (disabled: boolean): React.CSSProperties => ({
  fontSize: 14, fontWeight: 600, padding: '11px 24px', borderRadius: 10, border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d',
  opacity: disabled ? 0.6 : 1,
})
const ghostBtn: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '11px 18px', borderRadius: 10, background: 'transparent', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
const linkBtn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: '#fff', color: '#7425e3', border: '0.5px solid #7425e3', cursor: 'pointer' }
const linkAnchor: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#7425e3', textDecoration: 'underline' }
