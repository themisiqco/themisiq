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

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../../lib/supabase'
import { useEntitlement } from '../../../../lib/useEntitlement'
import { cbamInputStyle, CbamField } from '../components/DisclosureQuestion'
import { massBalance } from '../../../../lib/cbam/engine'
import { assessCnCategory, suggestCategory, normalizeCn } from '../../../../lib/cbam/cn'
import { buildBoundaryGuidanceView } from '../../../../lib/cbam/boundaryGuidanceView'
import { routeLabel, calcModeLabel, steelGradeLabel, ccModeLabel, streamKindLabel } from '../../../../lib/cbam/labels'
import type { SourceStream } from '../../../../lib/cbam/types'
import type { CnMapRow } from '../../../../lib/cbam/cn'
import { itemHead, sectionHeadFixed as sectionHead } from '@/app/components/headingStyles'

// ── House style, matching app/dashboard/cbam/page.tsx ──
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 400, lineHeight: 1.7, marginBottom: '2rem' }

/**
 * Bring a just-opened add/edit form into view.
 *
 * The process form renders BELOW the entire process list, so with several processes it opens
 * off-screen: the operator clicks Edit, nothing visibly happens, and the button reads as broken.
 * The two sub-forms have the same problem inside a long expanded panel.
 *
 * KEYED ON WHICH RECORD IS OPEN, never on the form's contents. The key changes when a form opens,
 * and when the operator clicks Edit on a DIFFERENT record while one is already open — but a
 * keystroke does not change it, so the page never yanks itself around while someone is typing.
 * A closed form passes null and scrolls nothing.
 */
function useScrollIntoViewOnOpen(key: string | null, ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (key === null) return
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // ref is stable; re-running on anything but `key` is exactly what this must not do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}

type Step = 1 | 2 | 3
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

// ── Step 3 form shapes ──
type CalcMode = 'actual' | 'default' | 'combined'
type ProcessForm = {
  id: string | null
  installation_id: string
  cn_code: string
  category_code: string
  route_code: string           // '' = null (correct for categories with no routes)
  activity_level: string
  reporting_period: string
  calc_mode: CalcMode
  steel_grade: string          // '' = null
  electricity_consumed: string // '' = null
}
type ProcessRow = ProcessForm & { id: string }
const EMPTY_PROCESS = (installationId: string): ProcessForm => ({
  id: null, installation_id: installationId, cn_code: '', category_code: '', route_code: '',
  activity_level: '', reporting_period: '2026', calc_mode: 'actual', steel_grade: '', electricity_consumed: '',
})

type StreamKind = 'fuel' | 'process_material' | 'output'
type StreamCcMode = 'direct' | 'ef_per_t' | 'ef_per_tj'
type StreamForm = {
  id: string | null
  name: string
  stream_kind: StreamKind
  activity_data: string
  cc_mode: StreamCcMode
  carbon_content: string
  emission_factor: string
  ncv: string
  biomass_fraction: string
  source_doc_id: string        // '' = none (unevidenced); else a cbam_source_documents id
}
type StreamRow = StreamForm & { id: string }
const EMPTY_STREAM: StreamForm = {
  id: null, name: '', stream_kind: 'fuel', activity_data: '', cc_mode: 'direct',
  carbon_content: '', emission_factor: '', ncv: '', biomass_fraction: '0', source_doc_id: '',
}

// ── Precursors ──────────────────────────────────────────────────────────────
type Boundary = 'external' | 'separate_internal' | 'joint'
type PrecursorForm = {
  id: string | null
  cn_code: string
  category_code: string
  mass_consumed: string
  boundary: Boundary
  origin_country: string
  reporting_period: string
  origin_operator_name: string
  origin_installation_name: string
  origin_cbam_registry_id: string
}
type PrecursorRow = PrecursorForm & { id: string }
const EMPTY_PRECURSOR = (reportingPeriod: string): PrecursorForm => ({
  id: null, cn_code: '', category_code: '', mass_consumed: '', boundary: 'external',
  origin_country: '', reporting_period: reportingPeriod,
  origin_operator_name: '', origin_installation_name: '', origin_cbam_registry_id: '',
})

// Plain-language labels for where a precursor came from. The stored value is never shown.
const BOUNDARY_OPTIONS: { value: Boundary; label: string }[] = [
  { value: 'external', label: 'Bought from another installation' },
  { value: 'separate_internal', label: 'Made here, in a separate production process' },
  { value: 'joint', label: "Made here, inside this process's boundary (joint production)" },
]

// Reasons a process can consume no CBAM precursors. Values match the CHECK constraint on
// cbam_production_processes; only the labels are ever rendered.
const DECLARATION_REASONS: { value: string; label: string }[] = [
  { value: 'joint_production', label: 'Made as one joint production process' },
  { value: 'scrap_only_charge', label: 'Charged with scrap only' },
  { value: 'no_cbam_precursors', label: 'Consumes no CBAM-listed inputs' },
  { value: 'other', label: 'Something else' },
]
const declarationReasonLabel = (v: string | null) =>
  DECLARATION_REASONS.find((r) => r.value === v)?.label ?? v ?? ''

// The labels above are sentence-case because the dropdown shows them as standalone options.
// Both other uses embed one MID-SENTENCE, where a leading capital reads oddly. Lowercase the
// FIRST CHARACTER ONLY — a blanket .toLowerCase() also flattens the acronym, turning
// 'Consumes no CBAM-listed inputs' into '…cbam-listed inputs' on the card while the dropdown
// that set it still reads CBAM. One label source, two renderings; never two sources.
const lowerFirst = (t: string) => (t === '' ? t : t[0].toLowerCase() + t.slice(1))

// Per-process precursor state for the card status line: how many rows, and what the process
// itself declares. Kept separate from ProcessForm so the process save payload is untouched.
type PrecursorMeta = { count: number; declaration: string; reason: string | null; note: string | null }

// ── Evidence documents (bucket 'cbam-source-documents') ──
// Limits mirror the DB bucket: 25 MB cap + MIME allowlist. Legacy .xls is NOT
// in the allowlist — only .xlsx.
const CBAM_BUCKET = 'cbam-source-documents'
const CBAM_MAX_BYTES = 26214400
const CBAM_MIME_ALLOW = [
  'application/pdf', 'image/png', 'image/jpeg', 'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]
const DOC_TYPE_SUGGESTIONS = ['weighbridge ticket', 'fuel delivery note', 'laboratory analysis', 'production log', 'electricity invoice', 'mass balance record']
// Categories that carry an alloy-grade dimension (steel_grade drives the §5.3 benchmark
// indicator). crude_steel and iron_steel_products have grade-bearing benchmark rows
// (C-J indicators); sintered_ore/pig_iron/dri/ferroalloy and non-steel sectors (aluminium)
// do not. The Steel-grade field renders ONLY for these. Add future graded sectors here.
const STEEL_GRADE_CATEGORIES = new Set(['crude_steel', 'iron_steel_products'])

// What POST /api/cbam/compute returns. Only the fields this page reads are declared — the
// response also carries the full saved record, which is not rendered here.
type ComputeResponse = {
  see_record: { see_direct: number; see_indirect: number; see_total: number }
  unresolved: { cnCode: string; reason: string }[]
  hasUnresolved: boolean
}

// Plain-language renderings of the reasons a precursor fell back to a published default.
// An UNMAPPED REASON MUST STILL RENDER, verbatim — see the fallback at the call site. Hiding a
// reason we do not recognise would silently drop the one thing telling the operator why a figure
// is not fully evidenced, and a new reason string is exactly when that matters most.
const UNRESOLVED_REASONS: Record<string, string> = {
  missing_or_invalid_verifier_report:
    "the supplier's verified report isn't on file, so a published default value was used instead",
  verified_but_no_see_value:
    "the supplier's report is on file but carries no emissions figure, so a published default value was used instead",
}
type CbamDocument = {
  id: string
  file_path: string
  file_name: string
  file_size_kb: number | null
  mime_type: string | null
  document_type: string | null
  uploaded_at: string
}

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

  // ── Step 3 reference data (world-readable) ──
  const [goodsCategories, setGoodsCategories] = useState<{ code: string; label: string }[]>([])
  const [routes, setRoutes] = useState<{ category_code: string; route_code: string }[]>([])
  // CN prefix -> goods category, the §10.7 longest-prefix map. 58 rows.
  const [cnMap, setCnMap] = useState<CnMapRow[]>([])
  // Collapsed by default, and deliberately NOT reset when the category or route changes: a
  // reader who opened the rules is comparing them against their selection, and slamming the
  // panel shut on every change would fight exactly that.
  const [boundaryOpen, setBoundaryOpen] = useState(false)
  // Every CN code that HAS a default row — the authoritative accept-set for the CN field
  // (exactly what the engine resolves against). Populated in the reference-data effect below.
  //
  // A MAP, NOT A SET, and the direction matters: normalised key -> THE SEEDED STRING VERBATIM.
  // The key exists so a customer typing '72061000' matches a good seeded as '7206 10 00'; the
  // value exists because the seeded form is what gets stored and what every downstream lookup
  // compares against by exact string equality. Never store the key.
  const [validCnCodes, setValidCnCodes] = useState<Map<string, string>>(new Map())

  // ── Step 3 processes (scoped to the viewed installation) ──
  const [procInstallationId, setProcInstallationId] = useState<string | null>(null)
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [editingProc, setEditingProc] = useState<ProcessForm | null>(null)
  const [proc3Saving, setProc3Saving] = useState(false)
  const [proc3Saved, setProc3Saved] = useState(false)
  const [proc3Error, setProc3Error] = useState<string | null>(null)

  // ── Step 3 source streams (nested under a saved process) ──
  const [streamsProcId, setStreamsProcId] = useState<string | null>(null)
  // Compute results, expanded in place under one process card at a time — same single-id toggle
  // as streamsProcId, and mutually exclusive with it so a card never has two panels open.
  const [computeProcId, setComputeProcId] = useState<string | null>(null)
  const [computeBusyId, setComputeBusyId] = useState<string | null>(null)
  const [computeResult, setComputeResult] = useState<ComputeResponse | null>(null)
  const [computeError, setComputeError] = useState<string | null>(null)
  // Set when a precursor or declaration change invalidates an open calculation result.
  const [computeStaleNote, setComputeStaleNote] = useState<string | null>(null)

  // ── Step 3 precursors (nested under a saved process) ──
  const [precursorProcId, setPrecursorProcId] = useState<string | null>(null)
  const [precursors, setPrecursors] = useState<PrecursorRow[]>([])
  const [editingPrecursor, setEditingPrecursor] = useState<PrecursorForm | null>(null)
  const [precursorSaving, setPrecursorSaving] = useState(false)
  const [precursorError, setPrecursorError] = useState<string | null>(null)
  const [precursorNotice, setPrecursorNotice] = useState<string | null>(null)
  const [precursorMeta, setPrecursorMeta] = useState<Record<string, PrecursorMeta>>({})
  // Declaration sub-form (only reachable when a process has no precursor rows).
  const [declReason, setDeclReason] = useState('')
  const [declNote, setDeclNote] = useState('')
  // Country codes seeded in the published default values, for the origin-country select.
  const [originCountries, setOriginCountries] = useState<string[]>([])
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [editingStream, setEditingStream] = useState<StreamForm | null>(null)
  const [streamSaving, setStreamSaving] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)

  // ── Step 3 evidence documents (scoped to the selected company) ──
  const [documents, setDocuments] = useState<CbamDocument[]>([])
  const [docType, setDocType] = useState('')
  const [docNotes, setDocNotes] = useState('')

  // ── Scroll a newly-opened form into view ──
  // The sub-form keys carry their panel's process id as well as the record id: without it,
  // opening a NEW stream on one process and then a NEW stream on another would produce the same
  // key twice running and the second one would not scroll.
  const procFormRef = useRef<HTMLDivElement | null>(null)
  const streamFormRef = useRef<HTMLDivElement | null>(null)
  const precursorFormRef = useRef<HTMLDivElement | null>(null)
  useScrollIntoViewOnOpen(editingProc ? (editingProc.id ?? 'new') : null, procFormRef)
  useScrollIntoViewOnOpen(editingStream ? `${streamsProcId}:${editingStream.id ?? 'new'}` : null, streamFormRef)
  useScrollIntoViewOnOpen(editingPrecursor ? `${precursorProcId}:${editingPrecursor.id ?? 'new'}` : null, precursorFormRef)
  const [docUploading, setDocUploading] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      setInst2Error('Enter a name for this installation.')
      return
    }
    const country = editing.country.trim().toUpperCase()
    if (country === '') {
      setInst2Error('Choose the country where this installation is located.')
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

  // ── Load reference data (categories + routes + valid CN codes; world-readable) ──
  useEffect(() => {
    if (!isPaid) return
    let cancelled = false
    ;(async () => {
      const [catRes, routeRes, mapRes] = await Promise.all([
        supabase.from('cbam_goods_categories').select('code, label').order('label'),
        supabase.from('cbam_production_routes').select('category_code, route_code').order('category_code'),
        supabase.from('cbam_cn_map').select('cn_prefix, category_code'),
      ])
      if (cancelled) return
      if (catRes.error) { setProc3Error(catRes.error.message); return }
      if (routeRes.error) { setProc3Error(routeRes.error.message); return }
      if (mapRes.error) { setProc3Error(mapRes.error.message); return }
      setGoodsCategories((catRes.data ?? []) as { code: string; label: string }[])
      setRoutes((routeRes.data ?? []) as { category_code: string; route_code: string }[])
      setCnMap((mapRes.data ?? []) as CnMapRow[])

      // The authoritative CN accept-set: every code with a default row in cbam_default_values,
      // at whatever granularity the annex seeds it (4-digit heading, 6- or 8-digit subheading) —
      // exactly what the engine resolves against (exact cn_code membership).
      //
      // Filter to country='other' so we get ONE row per distinct cn_code. cbam_default_values is
      // ~1828 rows (per-country duplication) — over PostgREST's hard 1000-row response cap, which
      // .limit() does NOT override. But every seeded good carries an 'other' fallback row (the
      // §10.17 seed invariant the engine relies on), so country='other' yields exactly the ~224
      // distinct codes in a single request, well under the cap. No pagination, no loop.
      const { data, error } = await supabase
        .from('cbam_default_values')
        .select('cn_code')
        .eq('country', 'other')
      if (cancelled) return
      if (error) { console.error('[CN] fetch error', error); setProc3Error(error.message); return }
      // Key on the normalised form so spacing differences between what a customer types and
      // what the annex seeds cannot cause a false rejection. The VALUE is the seeded string
      // untouched — that is what gets written and what the compute path matches on.
      //
      // A COLLISION CANNOT HAPPEN WITH CURRENT SEED DATA: two distinct seeded codes would have
      // to differ only in whitespace. If it ever does happen, silently keeping the last one
      // would drop a real good from the accept-set and reject a customer holding a valid code,
      // with nothing on screen to explain it. Fail loud instead.
      const byNormalised = new Map<string, string>()
      for (const row of data ?? []) {
        const seeded = row.cn_code as string
        let key: string
        try {
          key = normalizeCn(seeded)
        } catch (e) {
          console.error('[CN] seeded code did not parse', { seeded, error: e })
          setProc3Error('We could not load the reference data for CN codes. Please get in touch so we can look into it.')
          return
        }
        const existing = byNormalised.get(key)
        if (existing !== undefined && existing !== seeded) {
          console.error('[CN] two seeded codes collide once whitespace is removed', { key, first: existing, second: seeded })
          setProc3Error('We could not load the reference data for CN codes. Please get in touch so we can look into it.')
          return
        }
        byNormalised.set(key, seeded)
      }
      setValidCnCodes(byNormalised)

      // Countries a precursor can have been produced in. This comes from a view that returns ONE
      // ROW PER COUNTRY, so PostgREST's 1000-row response cap cannot truncate it. The view owns
      // both the DISTINCT and the exclusion of 'other' — do not re-add either here.
      //
      // Completeness is the point, not tidiness: the default value is looked up by
      // (cn_code, origin_country), so a country missing from this list would leave an operator
      // picking the nearest one available and silently resolving a DIFFERENT default.
      const { data: countryData, error: countryErr } = await supabase
        .from('cbam_origin_countries')
        .select('country')
      if (cancelled) return
      if (countryErr) { console.error('[CN] country fetch error', countryErr); setProc3Error(countryErr.message); return }
      setOriginCountries((countryData ?? []).map((r) => r.country as string).sort())
    })()
    return () => { cancelled = true }
  }, [isPaid])

  // Default the viewed installation once installations load.
  useEffect(() => {
    setProcInstallationId((prev) => prev ?? installations[0]?.id ?? null)
  }, [installations])

  // ── Load processes for the viewed installation ──
  const loadProcesses = (instId: string) => {
    setProc3Error(null)
    supabase
      .from('cbam_production_processes')
      .select('id, installation_id, cn_code, category_code, route_code, activity_level, reporting_period, calc_mode, steel_grade, electricity_consumed')
      .eq('installation_id', instId)
      .order('cn_code')
      .then(({ data, error }) => {
        if (error) { setProc3Error(error.message); return }
        const rows = (data ?? []) as Record<string, unknown>[]
        setProcesses(rows.map((r) => ({
          id: r.id as string,
          installation_id: r.installation_id as string,
          cn_code: (r.cn_code as string | null) ?? '',
          category_code: (r.category_code as string | null) ?? '',
          route_code: (r.route_code as string | null) ?? '',
          activity_level: r.activity_level == null ? '' : String(r.activity_level),
          reporting_period: r.reporting_period == null ? '' : String(r.reporting_period),
          calc_mode: ((r.calc_mode as string | null) ?? 'actual') as CalcMode,
          steel_grade: (r.steel_grade as string | null) ?? '',
          electricity_consumed: r.electricity_consumed == null ? '' : String(r.electricity_consumed),
        })))
        loadPrecursorMeta(rows.map((r) => r.id as string))
      })
  }
  useEffect(() => {
    if (!procInstallationId) return
    setEditingProc(null)
    setProc3Saved(false)
    setStreamsProcId(null)
    loadProcesses(procInstallationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [procInstallationId])

  // ── Calculate emissions for one process ──
  // COMPUTING WRITES A RECORD. Editing the process afterwards — its activity level, its source
  // streams, its precursors — leaves that record describing inputs that no longer exist. The
  // report route recomputes and compares, and REFUSES to serve a report whose stored figure
  // disagrees with a fresh recomputation, so a stale record surfaces as a conflict there rather
  // than as a wrong number. Recompute after any edit.
  async function runCompute(procId: string) {
    setComputeProcId(procId)
    setStreamsProcId(null)          // one panel per card
    setComputeResult(null)
    setComputeError(null)
    setComputeStaleNote(null)
    setComputeBusyId(procId)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setComputeError('Your session has expired. Please sign in again.')
      setComputeBusyId(null)
      return
    }
    try {
      const res = await fetch('/api/cbam/compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ process_id: procId }),
      })
      const json = await res.json().catch(() => ({} as Record<string, unknown>))
      if (!res.ok) {
        // Surface the server's own message — it names what actually failed. Never replace it
        // with a generic string.
        setComputeError((json as { error?: string }).error ?? `Request failed (${res.status})`)
        setComputeBusyId(null)
        return
      }
      setComputeResult(json as ComputeResponse)
      setComputeBusyId(null)
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : 'Network error')
      setComputeBusyId(null)
    }
  }

  // ── Precursor status for every process in the list ──────────────────────────
  // TWO SOURCES, because neither alone is the answer. Rows ARE the declaration — entering them
  // is the act of declaring — while the declaration column carries only the state rows cannot
  // express: that a process consumes none. Read both, decide in the status line.
  // A hoisted function declaration, not a const arrow: loadProcesses calls it, and loadProcesses
  // is defined above it. A const would be in its temporal dead zone at that point.
  async function loadPrecursorMeta(procIds: string[]) {
    if (procIds.length === 0) { setPrecursorMeta({}); return }
    const [rowsRes, procRes] = await Promise.all([
      supabase.from('cbam_precursor_inputs').select('process_id').in('process_id', procIds),
      supabase
        .from('cbam_production_processes')
        .select('id, precursor_declaration, precursor_declaration_reason, precursor_declaration_note')
        .in('id', procIds),
    ])
    if (rowsRes.error || procRes.error) {
      setProc3Error((rowsRes.error || procRes.error)!.message)
      return
    }
    const counts: Record<string, number> = {}
    for (const r of rowsRes.data ?? []) {
      const pid = r.process_id as string
      counts[pid] = (counts[pid] ?? 0) + 1
    }
    const meta: Record<string, PrecursorMeta> = {}
    for (const p of procRes.data ?? []) {
      const pid = p.id as string
      meta[pid] = {
        count: counts[pid] ?? 0,
        declaration: (p.precursor_declaration as string | null) ?? 'unknown',
        reason: (p.precursor_declaration_reason as string | null) ?? null,
        note: (p.precursor_declaration_note as string | null) ?? null,
      }
    }
    setPrecursorMeta(meta)
  }

  // ── Load precursor rows for the expanded process ──
  const loadPrecursors = (procId: string) => {
    setPrecursorError(null)
    supabase
      .from('cbam_precursor_inputs')
      .select('id, precursor_cn_code, precursor_category_code, mass_consumed, boundary, origin_country, reporting_period, origin_operator_name, origin_installation_name, origin_cbam_registry_id')
      .eq('process_id', procId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) { setPrecursorError(error.message); return }
        const rows = (data ?? []) as Record<string, unknown>[]
        setPrecursors(rows.map((r) => ({
          id: r.id as string,
          cn_code: (r.precursor_cn_code as string | null) ?? '',
          category_code: (r.precursor_category_code as string | null) ?? '',
          mass_consumed: r.mass_consumed == null ? '' : String(r.mass_consumed),
          boundary: (r.boundary as Boundary | null) ?? 'external',
          origin_country: (r.origin_country as string | null) ?? '',
          reporting_period: r.reporting_period == null ? '' : String(r.reporting_period),
          origin_operator_name: (r.origin_operator_name as string | null) ?? '',
          origin_installation_name: (r.origin_installation_name as string | null) ?? '',
          origin_cbam_registry_id: (r.origin_cbam_registry_id as string | null) ?? '',
        })))
      })
  }

  // Any precursor or declaration change invalidates an earlier calculation for that process:
  // the figure was computed from inputs that have since changed. Clear it rather than leave a
  // number on screen that no longer describes anything.
  const invalidateCompute = (procId: string) => {
    if (computeProcId !== procId) return
    setComputeResult(null)
    setComputeError(null)
    setComputeStaleNote('The precursors for this process have changed, so the earlier figure no longer applies. Calculate again.')
  }

  function setPrecF<K extends keyof PrecursorForm>(k: K, v: string) {
    setEditingPrecursor((p) => (p ? ({ ...p, [k]: v } as PrecursorForm) : p))
  }

  // ── Save one precursor ──
  // PROVENANCE IS ALWAYS 'default', and there is no picker, because the other two values cannot
  // currently produce a figure. 'actual_verified' would need a supplier's verification report:
  // hasValidVerifierReport in lib/cbam/resolver.ts is hardcoded false (no verifier-report store
  // exists), so every such row would fall back to the default anyway, and resolvePrecursorSefa
  // throws on it outright. 'computed_here' would need recursive child-SEE: computeChildSEE throws.
  // Offering either would let an operator record a claim the engine cannot honour.
  //
  // see_value and verifier_report_id are deliberately NOT written — both belong to provenance
  // values that are not offered, and a stored figure with no verification behind it is worse
  // than no figure.
  async function savePrecursor() {
    if (!companyId || !precursorProcId || !editingPrecursor) return
    setPrecursorError(null)
    setPrecursorNotice(null)
    const p = editingPrecursor

    const cn = p.cn_code.trim()
    if (cn === '') { setPrecursorError('Enter the CN code for this precursor, exactly as it appears on your customs paperwork.'); return }
    if (validCnCodes.size === 0) { setPrecursorError('Reference data is still loading — please try again in a moment.'); return }
    let cnKey: string
    try {
      cnKey = normalizeCn(cn)
    } catch {
      setPrecursorError('A CN code should be digits only — spaces are fine, but letters, dashes and dots are not. Copy it from your customs paperwork exactly as it appears there.')
      return
    }
    // Store the SEEDED form, never the keystrokes — same reason as the process CN code: every
    // downstream lookup matches by exact string equality.
    const cnSeeded = validCnCodes.get(cnKey)
    if (cnSeeded === undefined) {
      setPrecursorError(`CN code "${cn}" isn't a recognised CBAM good in this system. Enter the exact code as it appears for your product on the customs paperwork — it must match a default value we hold. (Some goods are listed at 4-digit heading level, others at 6- or 8-digit.)`)
      return
    }
    if (!p.category_code) { setPrecursorError('Choose a category for this precursor.'); return }
    const mass = Number(p.mass_consumed)
    if (p.mass_consumed.trim() === '' || Number.isNaN(mass) || mass < 0) {
      setPrecursorError('Enter how much of this precursor was consumed, in tonnes. It cannot be negative.'); return
    }
    if (!p.origin_country) { setPrecursorError('Choose the country where this precursor was produced.'); return }
    const period = Number(p.reporting_period)
    if (!Number.isInteger(period)) { setPrecursorError('Enter the reporting period as a whole year.'); return }

    setPrecursorSaving(true)
    const payload = {
      company_id: companyId,
      process_id: precursorProcId,
      precursor_cn_code: cnSeeded,
      precursor_category_code: p.category_code,
      mass_consumed: mass,
      boundary: p.boundary,
      provenance: 'default',
      origin_country: p.origin_country,
      reporting_period: period,
      origin_operator_name: nullify(p.origin_operator_name.trim()),
      origin_installation_name: nullify(p.origin_installation_name.trim()),
      origin_cbam_registry_id: nullify(p.origin_cbam_registry_id.trim()),
    }
    const query = p.id
      ? supabase.from('cbam_precursor_inputs').update(payload).eq('id', p.id)
      : supabase.from('cbam_precursor_inputs').insert(payload)
    const { error } = await query
    if (error) {
      console.error('[cbam] precursor save failed', error)
      setPrecursorError("We couldn't save this precursor. Please try again — if it keeps happening, get in touch and we'll look into it.")
      setPrecursorSaving(false)
      return
    }

    // CONTRADICTION GUARD. A process cannot both list precursors and state it consumes none.
    // Adding a row supersedes the earlier statement, so clear it in the same action and say so —
    // leaving both would make the record self-contradicting, and silently dropping the statement
    // would remove something the operator asserted without telling them.
    const meta = precursorMeta[precursorProcId]
    if (meta?.declaration === 'none') {
      const { error: clearErr } = await supabase
        .from('cbam_production_processes')
        .update({
          precursor_declaration: 'unknown',
          precursor_declaration_reason: null,
          precursor_declaration_note: null,
          precursor_declared_at: null,
        })
        .eq('id', precursorProcId)
      if (clearErr) {
        console.error('[cbam] could not clear superseded declaration', clearErr)
        setPrecursorError("The precursor was saved, but we couldn't update the earlier statement that this process consumes none. Please get in touch.")
        setPrecursorSaving(false)
        return
      }
      setPrecursorNotice('You had stated that this process consumes no precursors. That no longer applies now a precursor has been entered, so it has been withdrawn.')
    }

    setPrecursorSaving(false)
    setEditingPrecursor(null)
    invalidateCompute(precursorProcId)
    loadPrecursors(precursorProcId)
    loadPrecursorMeta(processes.map((x) => x.id))
  }

  async function removePrecursor(id: string) {
    if (!precursorProcId) return
    setPrecursorError(null)
    setPrecursorNotice(null)
    const { error } = await supabase.from('cbam_precursor_inputs').delete().eq('id', id)
    if (error) {
      console.error('[cbam] precursor delete failed', error)
      setPrecursorError("We couldn't remove this precursor. Please try again — if it keeps happening, get in touch.")
      return
    }
    invalidateCompute(precursorProcId)
    loadPrecursors(precursorProcId)
    loadPrecursorMeta(processes.map((x) => x.id))
  }

  // ── Declare that a process consumes no precursors, or withdraw that ──
  async function saveDeclaration() {
    if (!precursorProcId) return
    setPrecursorError(null)
    setPrecursorNotice(null)
    if (!declReason) { setPrecursorError('Choose a reason this process consumes no precursors.'); return }
    if (declReason === 'other' && declNote.trim() === '') {
      setPrecursorError('Tell us briefly why, so the statement stands on its own.'); return
    }
    setPrecursorSaving(true)
    const { error } = await supabase
      .from('cbam_production_processes')
      .update({
        precursor_declaration: 'none',
        precursor_declaration_reason: declReason,
        precursor_declaration_note: nullify(declNote.trim()),
        precursor_declared_at: new Date().toISOString(),
      })
      .eq('id', precursorProcId)
    setPrecursorSaving(false)
    if (error) {
      console.error('[cbam] declaration save failed', error)
      setPrecursorError("We couldn't record that statement. Please try again — if it keeps happening, get in touch.")
      return
    }
    setDeclReason('')
    setDeclNote('')
    invalidateCompute(precursorProcId)
    loadPrecursorMeta(processes.map((x) => x.id))
  }

  async function withdrawDeclaration() {
    if (!precursorProcId) return
    setPrecursorError(null)
    setPrecursorNotice(null)
    setPrecursorSaving(true)
    const { error } = await supabase
      .from('cbam_production_processes')
      .update({
        precursor_declaration: 'unknown',
        precursor_declaration_reason: null,
        precursor_declaration_note: null,
        precursor_declared_at: null,
      })
      .eq('id', precursorProcId)
    setPrecursorSaving(false)
    if (error) {
      console.error('[cbam] declaration withdraw failed', error)
      setPrecursorError("We couldn't withdraw that statement. Please try again — if it keeps happening, get in touch.")
      return
    }
    invalidateCompute(precursorProcId)
    loadPrecursorMeta(processes.map((x) => x.id))
  }

  // ── Load source streams for the expanded process ──
  const loadStreams = (procId: string) => {
    setStreamError(null)
    supabase
      .from('cbam_source_streams')
      .select('id, name, stream_kind, activity_data, cc_mode, carbon_content, emission_factor, ncv, biomass_fraction, source_doc_id')
      .eq('process_id', procId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) { setStreamError(error.message); return }
        const rows = (data ?? []) as Record<string, unknown>[]
        setStreams(rows.map((r) => ({
          id: r.id as string,
          name: (r.name as string | null) ?? '',
          stream_kind: r.stream_kind as StreamKind,
          activity_data: r.activity_data == null ? '' : String(r.activity_data),
          cc_mode: r.cc_mode as StreamCcMode,
          carbon_content: r.carbon_content == null ? '' : String(r.carbon_content),
          emission_factor: r.emission_factor == null ? '' : String(r.emission_factor),
          ncv: r.ncv == null ? '' : String(r.ncv),
          biomass_fraction: r.biomass_fraction == null ? '0' : String(r.biomass_fraction),
          source_doc_id: (r.source_doc_id as string | null) ?? '',
        })))
      })
  }
  useEffect(() => {
    if (!streamsProcId) { setStreams([]); return }
    setEditingStream(null)
    loadStreams(streamsProcId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamsProcId])

  const routesForCategory = (cat: string) => routes.filter((r) => r.category_code === cat)

  function setProc<K extends keyof ProcessForm>(k: K, v: string) {
    setProc3Saved(false)
    setEditingProc((p) => (p ? ({ ...p, [k]: v } as ProcessForm) : p))
  }

  // Choosing a category is never just one field: the route is scoped to the category by a
  // composite FK, and steel grade only exists for two categories. Hoisted out of the select's
  // onChange so the CN suggestion buttons take the SAME path — a second call site that set
  // category_code alone would leave a stale route pointing at the old category.
  function selectCategory(c: string) {
    setProc('category_code', c)
    setProc('route_code', '')
    if (!STEEL_GRADE_CATEGORIES.has(c)) setProc('steel_grade', '')
  }

  // ── Step 3 save (process) — insert (new) or update (existing) ──
  async function saveProcess() {
    if (!companyId || !editingProc) return
    setProc3Saved(false)
    setProc3Error(null)
    const p = editingProc
    if (!p.installation_id) { setProc3Error('Choose which installation this process belongs to.'); return }
    // CN code is the load-bearing field. Validate MEMBERSHIP against the seeded default values —
    // the exact set the engine resolves against — not a format shape. CBAM goods are seeded at
    // mixed granularity (4-digit headings, 6- and 8-digit subheadings), so a format rule mispredicts;
    // a code with no default row would dead-fall to 'other' (spec §10.7, via the correct mechanism).
    const cn = p.cn_code.trim()
    if (validCnCodes.size === 0) {
      setProc3Error('Reference data is still loading — please try again in a moment.')
      return
    }
    if (cn === '') {
      setProc3Error('Enter the CN code for this good, exactly as it appears on your customs paperwork.')
      return
    }
    // Match on the normalised form so '72061000' and '7206 10 00' are the same good, then keep
    // the SEEDED string. What the customer typed is not what gets stored: every downstream
    // lookup compares cn_code by exact string equality, so storing their spacing would produce
    // a row that validates here and finds nothing later.
    let cnKey: string
    try {
      cnKey = normalizeCn(cn)
    } catch {
      setProc3Error('A CN code should be digits only — spaces are fine, but letters, dashes and dots are not. Copy it from your customs paperwork exactly as it appears there.')
      return
    }
    const cnSeeded = validCnCodes.get(cnKey)
    if (cnSeeded === undefined) {
      setProc3Error(`CN code "${cn}" isn't a recognised CBAM good in this system. Enter the exact code as it appears for your product on the customs paperwork — it must match a default value we hold. (Some goods are listed at 4-digit heading level, others at 6- or 8-digit.)`)
      return
    }
    if (!p.category_code) { setProc3Error('Choose a category for this good.'); return }
    // Route: enforce the composite (category, route) pairing the DB FK enforces.
    const catRoutes = routesForCategory(p.category_code)
    if (catRoutes.length === 0) {
      if (p.route_code !== '') { setProc3Error('This category has no production routes — leave the route unset.'); return }
    } else if (p.route_code === '' || !catRoutes.some((r) => r.route_code === p.route_code)) {
      setProc3Error('Choose a production route that belongs to this category. The route and the category have to match.')
      return
    }
    const activity = Number(p.activity_level)
    if (p.activity_level.trim() === '' || Number.isNaN(activity) || activity <= 0) {
      setProc3Error('Enter how much of this good was produced. It has to be more than zero.'); return
    }
    const period = Number(p.reporting_period)
    if (!Number.isInteger(period) || period < 2026) {
      setProc3Error('Enter a reporting year of 2026 or later, as a whole number.'); return
    }
    let electricity: number | null = null
    if (p.electricity_consumed.trim() !== '') {
      const e = Number(p.electricity_consumed)
      if (Number.isNaN(e) || e < 0) { setProc3Error('Electricity consumed can be left blank, or entered as zero or more.'); return }
      electricity = e
    }
    setProc3Saving(true)
    const payload = {
      company_id: companyId,
      installation_id: p.installation_id,
      // The SEEDED string, not the keystrokes — see the resolution above.
      cn_code: cnSeeded,
      category_code: p.category_code,
      route_code: nullify(p.route_code),
      activity_level: activity,
      reporting_period: period,
      calc_mode: p.calc_mode,
      steel_grade: nullify(p.steel_grade),
      electricity_consumed: electricity,
    }
    const query = p.id
      ? supabase.from('cbam_production_processes').update(payload).eq('id', p.id)
      : supabase.from('cbam_production_processes').insert(payload)
    const { error } = await query
    // The raw DB message is kept in the console, not shown: a customer cannot act on a
    // constraint name, and the validation above already reports everything they CAN act on.
    // Anything reaching here is ours to diagnose, so it must not be swallowed.
    if (error) {
      console.error('[cbam] process save failed', error)
      // This table also carries a uniqueness rule on (id, company_id), which raises the SAME
      // error code but cannot realistically collide on this path — id is generated, not chosen.
      // If that ever changes, this message would have to distinguish the two, because it names
      // the good and the period and would then be telling the customer the wrong thing.
      if (error.code === '23505') {
        setProc3Error('You already have a process for this good and reporting period at this installation. Edit the existing one, or change the CN code or the reporting period.')
      } else {
        setProc3Error("We couldn't save this process. Please try again — if it keeps happening, get in touch and we'll look into it.")
      }
      setProc3Saving(false)
      return
    }
    setProc3Saving(false)
    setProc3Saved(true)
    setEditingProc(null)
    loadProcesses(p.installation_id)
  }

  function setStreamF<K extends keyof StreamForm>(k: K, v: string) {
    setEditingStream((s) => (s ? ({ ...s, [k]: v } as StreamForm) : s))
  }

  // ── Step 3 save (source stream). cc_mode drives which inputs are REQUIRED; the
  // engine fails loud on a missing input (never defaults to zero), so we enforce
  // the per-mode requirement here before the row can reach the compute route. ──
  async function saveStream() {
    if (!companyId || !streamsProcId || !editingStream) return
    setStreamError(null)
    const s = editingStream
    if (s.name.trim() === '') { setStreamError('Enter a name for this source stream.'); return }
    if (s.activity_data.trim() === '' || Number.isNaN(Number(s.activity_data))) {
      setStreamError('Enter the activity data as a number. For an output stream, enter it as a negative figure — carbon leaving in the product counts against the balance.'); return
    }
    const ad = Number(s.activity_data)
    let carbon: number | null = null
    let ef: number | null = null
    let ncv: number | null = null
    if (s.cc_mode === 'direct') {
      if (s.carbon_content.trim() === '' || Number.isNaN(Number(s.carbon_content))) {
        setStreamError('Enter the carbon content for this stream, as a number.'); return
      }
      carbon = Number(s.carbon_content)
    } else if (s.cc_mode === 'ef_per_t') {
      if (s.emission_factor.trim() === '' || Number.isNaN(Number(s.emission_factor))) {
        setStreamError('Enter the emission factor for this stream, as a number.'); return
      }
      ef = Number(s.emission_factor)
    } else {
      if (s.emission_factor.trim() === '' || Number.isNaN(Number(s.emission_factor)) || s.ncv.trim() === '' || Number.isNaN(Number(s.ncv))) {
        setStreamError('This mode needs both an emission factor and a net calorific value. Enter both as numbers.'); return
      }
      ef = Number(s.emission_factor); ncv = Number(s.ncv)
    }
    const bf = s.biomass_fraction.trim() === '' ? 0 : Number(s.biomass_fraction)
    if (Number.isNaN(bf) || bf < 0 || bf > 1) { setStreamError('Biomass fraction must be a number between 0 and 1. Leave it blank if none of this stream is biomass.'); return }
    setStreamSaving(true)
    const payload = {
      company_id: companyId,
      process_id: streamsProcId,
      name: s.name.trim(),
      stream_kind: s.stream_kind,
      activity_data: ad,
      cc_mode: s.cc_mode,
      carbon_content: carbon,
      emission_factor: ef,
      ncv,
      biomass_fraction: bf,
      source_doc_id: nullify(s.source_doc_id),
    }
    const query = s.id
      ? supabase.from('cbam_source_streams').update(payload).eq('id', s.id)
      : supabase.from('cbam_source_streams').insert(payload)
    const { error } = await query
    // The raw DB message stays in the console, not on screen — a customer cannot act on a
    // constraint name, and the validation above already reports everything they can act on.
    if (error) {
      console.error('[cbam] stream save failed', error)
      setStreamError("We couldn't save this stream. Please try again — if it keeps happening, get in touch and we'll look into it.")
      setStreamSaving(false)
      return
    }
    setStreamSaving(false)
    setEditingStream(null)
    loadStreams(streamsProcId)
  }

  async function removeStream(id: string) {
    if (!streamsProcId) return
    setStreamError(null)
    const { error } = await supabase.from('cbam_source_streams').delete().eq('id', id)
    if (error) {
      console.error('[cbam] stream delete failed', error)
      setStreamError("We couldn't remove this stream. Please try again — if it keeps happening, get in touch.")
      return
    }
    loadStreams(streamsProcId)
  }

  // Running mass balance (DirEm*) over the SAVED streams — the SAME reduce the
  // compute path uses (imported from the engine, not re-derived). Wrapped: a
  // saved stream missing a required input for its mode makes carbonContent throw,
  // so we surface that rather than crash.
  const massBalanceSum = (): { value: number | null; error: boolean } => {
    try {
      const mapped: SourceStream[] = streams.map((s) => ({
        kind: s.stream_kind,
        ad: Number(s.activity_data),
        ccMode: s.cc_mode,
        cc: s.carbon_content === '' ? undefined : Number(s.carbon_content),
        ef: s.emission_factor === '' ? undefined : Number(s.emission_factor),
        ncv: s.ncv === '' ? undefined : Number(s.ncv),
        bf: s.biomass_fraction === '' ? 0 : Number(s.biomass_fraction),
      }))
      return { value: massBalance(mapped), error: false }
    } catch {
      return { value: null, error: true }
    }
  }

  // ── EVIDENCE DOCUMENTS ───────────────────────────────────────────────────
  // CBAM documents are NOT parsed. Unlike GHG utility bills, CBAM evidence
  // (weighbridge tickets, fuel delivery notes, laboratory analyses, production
  // logs) has no standardised genre — often company-internal formats, often not
  // in English. An extracted figure would flow into a financial obligation and
  // be tested against the operator's own records on a mandatory site visit. The
  // operator tallies their own records and enters the figure; the document is
  // the provenance link a verifier follows from that number back to its evidence.
  const loadDocuments = (cid: string) => {
    setDocError(null)
    supabase
      .from('cbam_source_documents')
      .select('id, file_path, file_name, file_size_kb, mime_type, document_type, uploaded_at')
      .eq('company_id', cid)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setDocError(error.message); return }
        const rows = (data ?? []) as Record<string, unknown>[]
        setDocuments(rows.map((r) => ({
          id: r.id as string,
          file_path: r.file_path as string,
          file_name: (r.file_name as string | null) ?? '',
          file_size_kb: r.file_size_kb == null ? null : Number(r.file_size_kb),
          mime_type: (r.mime_type as string | null) ?? null,
          document_type: (r.document_type as string | null) ?? null,
          uploaded_at: r.uploaded_at as string,
        })))
      })
  }
  useEffect(() => {
    if (!companyId) { setDocuments([]); return }
    loadDocuments(companyId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  const documentName = (id: string): string | null => documents.find((d) => d.id === id)?.file_name ?? null

  // Upload to the bucket, then INSERT the metadata row (REQUIRED). The path MUST
  // begin with the user's uid — the bucket policy requires
  // (auth.uid())::text = (storage.foldername(name))[1]. Mirrors the GHG pattern.
  async function uploadDocument(file: File) {
    if (!companyId) return
    setDocError(null)
    // Validate the DB bucket limits client-side too (the DB is the backstop).
    if (file.size > CBAM_MAX_BYTES) {
      setDocError(`"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the 25 MB limit. Split or compress the file.`)
      return
    }
    if (!CBAM_MIME_ALLOW.includes(file.type)) {
      setDocError(`"${file.name}" has type "${file.type || 'unknown'}", which is not accepted. Allowed: PDF, PNG, JPEG, CSV, XLSX. Legacy .xls is not accepted — save as .xlsx.`)
      return
    }
    setDocUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setDocError('Your session has expired. Sign in again to upload.'); setDocUploading(false); return }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${session.user.id}/cbam/${Date.now()}_${safeName}`
    const { error: upErr } = await supabase.storage.from(CBAM_BUCKET).upload(path, file, { contentType: file.type })
    if (upErr) { setDocError(upErr.message); setDocUploading(false); return }
    // The metadata row is REQUIRED. If it fails, delete the just-uploaded object
    // so storage and metadata never drift out of sync (no orphan file).
    const { error: metaErr } = await supabase
      .from('cbam_source_documents')
      .insert({
        company_id: companyId,
        user_id: session.user.id,
        file_path: path,
        file_name: file.name,
        file_size_kb: Math.round(file.size / 1024),
        mime_type: file.type,
        document_type: nullify(docType),
        notes: nullify(docNotes),
      })
      .select('id')
      .single()
    if (metaErr) {
      await supabase.storage.from(CBAM_BUCKET).remove([path])
      setDocError(`The file uploaded but its metadata row failed to save, so the file was removed to avoid an orphan in storage. Nothing was kept. ${metaErr.message}`)
      setDocUploading(false)
      return
    }
    setDocType('')
    setDocNotes('')
    setDocUploading(false)
    loadDocuments(companyId)
  }

  // Delete BOTH the storage object and the metadata row. The FK is
  // ON DELETE SET NULL, so any stream citing this document keeps its activity
  // data and only loses source_doc_id — never a silent data deletion. Delete the
  // row first (which nulls the citing streams), then remove the object.
  async function deleteDocument(doc: CbamDocument) {
    const ok = window.confirm(
      `Delete "${doc.file_name}"?\n\nThis removes the file and its record. Any source stream that cites it keeps its figures but loses the link to this evidence, so a verifier won't be able to trace that figure back to a document.`,
    )
    if (!ok) return
    setDocError(null)
    const { error: metaErr } = await supabase.from('cbam_source_documents').delete().eq('id', doc.id)
    if (metaErr) { setDocError(metaErr.message); return }
    const { error: rmErr } = await supabase.storage.from(CBAM_BUCKET).remove([doc.file_path])
    if (rmErr) { setDocError(`The metadata row was deleted, but removing the file from storage failed: ${rmErr.message}`) }
    if (companyId) loadDocuments(companyId)
    if (streamsProcId) loadStreams(streamsProcId)   // refresh linked-document labels
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
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>CBAM is a paid module.</div>
              <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 400 }}>Set up your operator profile and installations, then record disclosures and generate your Annex IV §1.2 report. Unlock the CBAM module to begin.</div>
              <button onClick={() => (window.location.href = '/pricing')} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--color-brand)', color: '#0d0d0d' }}>
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
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#0d0d0d', marginBottom: 8 }}>No company on your account yet</div>
          <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, fontWeight: 400 }}>
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
        <div style={{ marginBottom: '1.5rem', fontSize: 12, color: 'var(--color-ink-muted)' }}>Company: <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{companies[0].name}</span></div>
      ) : null}

      {/* ── Step nav — dependency order explicit; Step 1 shown as prerequisite of
             Step 2 but navigation is NOT hard-blocked (a user may add an
             installation first). ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <StepTab n={1} label="Operator" sub="who you are" active={step === 1} onClick={() => setStep(1)} />
        <StepTab n={2} label="Installations" sub="where you produce" active={step === 2} onClick={() => setStep(2)} />
        <StepTab n={3} label="Processes & emissions" sub="goods & source streams" active={step === 3} onClick={() => setStep(3)} />
      </div>
      {step === 2 && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginBottom: '1rem' }}>Step 1 (Operator) is a prerequisite for a complete report, but you can add installations first.</div>
      )}

      {/* ── STEP 1: OPERATOR PROFILE ── */}
      {step === 1 && (
        <div>
          <div style={itemHead}>(1) Identification of the operator</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.25rem' }}>
            One profile per company. Any field may be left blank — the report marks blanks as outstanding rather than blocking the save.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            <CbamField label="(1)(a) Operator name">
              <input value={operator.operator_name} onChange={(e) => setOp('operator_name', e.target.value)} placeholder="Legal name of the operator" style={cbamInputStyle} />
            </CbamField>
            <CbamField label="(1)(b) Registration number" hint="Corporate or activity registration number of the operator.">
              <input value={operator.registration_no} onChange={(e) => setOp('registration_no', e.target.value)} style={cbamInputStyle} />
            </CbamField>
            <CbamField label="(1)(c) Full address — in English" hint="Annex IV requires the address in English (Article 10(4)). Enter as much as you have; blanks are reported, not blocked.">
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
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.25rem' }}>
            Add every installation you produce CBAM goods at. Only name and country are required; the rest may be filled in progressively.
          </div>

          {/* Existing installations */}
          {installations.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: '1rem' }}>No installations yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
              {installations.map((inst) => (
                <div key={inst.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{inst.name} <span style={{ color: 'var(--color-ink-muted)', fontWeight: 400 }}>· {inst.country}</span></div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>
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
              + New installation
            </button>
          )}

          {/* Add / edit form */}
          {editing && (
            <div style={{ marginTop: '1rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', maxWidth: 620 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#0d0d0d', marginBottom: '1rem' }}>
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
                <CbamField label="(2)(d) Full address — in English" hint="Annex IV requires the address in English (Article 10(4)).">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input value={editing.address_line1} onChange={(e) => setInst('address_line1', e.target.value)} placeholder="Address line 1" style={cbamInputStyle} />
                    <input value={editing.address_line2} onChange={(e) => setInst('address_line2', e.target.value)} placeholder="Address line 2" style={cbamInputStyle} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input value={editing.city} onChange={(e) => setInst('city', e.target.value)} placeholder="City" style={{ ...cbamInputStyle, flex: 1, minWidth: 160 }} />
                      <input value={editing.postcode} onChange={(e) => setInst('postcode', e.target.value)} placeholder="Postcode" style={{ ...cbamInputStyle, width: 140 }} />
                    </div>
                  </div>
                </CbamField>
                <CbamField label="(2)(e) Main emission source coordinates" hint="Coordinates of the main emission source, not the postal address. Latitude −90 to 90, longitude −180 to 180. Optional.">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input type="number" value={editing.latitude} onChange={(e) => setInst('latitude', e.target.value)} placeholder="Latitude" step="any" style={{ ...cbamInputStyle, width: 180 }} />
                    <input type="number" value={editing.longitude} onChange={(e) => setInst('longitude', e.target.value)} placeholder="Longitude" step="any" style={{ ...cbamInputStyle, width: 180 }} />
                  </div>
                </CbamField>
              </div>

              {inst2Error && <ErrorBox prefix="Could not save installation" message={inst2Error} />}

              <div style={{ marginTop: '1.25rem', display: 'flex', gap: 10, alignItems: 'center' }}>
                <button type="button" onClick={saveInstallation} disabled={inst2Saving} style={primaryBtn(inst2Saving)}>
                  {inst2Saving ? 'Saving…' : (editing.id ? 'Save changes' : 'Save installation')}
                </button>
                <button type="button" onClick={() => { setEditing(null); setInst2Error(null) }} style={ghostBtn}>Cancel</button>
              </div>
            </div>
          )}

          {inst2Saved && !editing && (
            <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#0F6E56' }}>✓ Saved</span>
              <button type="button" onClick={() => setStep(3)} style={linkBtn}>Next: Processes &amp; emissions →</button>
              <a href="/dashboard/cbam/disclosures" style={linkAnchor}>Record disclosures →</a>
              <a href="/dashboard/cbam/report" style={linkAnchor}>Generate report →</a>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: PROCESSES + SOURCE STREAMS ── */}
      {step === 3 && (
        <div>
          <div style={itemHead}>(3) Production processes and emissions</div>
          {installations.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6 }}>
              Add an installation in Step 2 first — every process belongs to an installation, so this step depends on it.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.25rem' }}>
                A process is one produced good at one installation, with the source streams (fuels, materials, outputs) whose carbon nets to its direct emissions. Nothing is computed here — computing is a separate, deliberate action.
              </div>

              {/* ── EVIDENCE DOCUMENTS (scoped to the selected company) ──
                  CBAM documents are NOT parsed. Unlike GHG utility bills, CBAM
                  evidence (weighbridge tickets, fuel delivery notes, laboratory
                  analyses, production logs) has no standardised genre — often
                  company-internal formats, often not in English. An extracted
                  figure would flow into a financial obligation and be tested
                  against the operator's own records on a mandatory site visit.
                  The operator tallies their own records and enters the figure;
                  the document is the provenance link a verifier follows from
                  that number back to its evidence. */}
              <div style={{ marginBottom: '1.5rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#0d0d0d', marginBottom: 4 }}>Evidence documents</div>
                <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1rem' }}>
                  Upload the records behind your figures — weighbridge tickets, fuel delivery notes, laboratory analyses, production logs. These are <strong>not read or parsed</strong>: you tally your own records and enter the figure, and the document is the provenance link a verifier follows back from a number to its evidence. Accepted: PDF, PNG, JPEG, CSV, XLSX (max 25 MB). Legacy .xls is not accepted — save as .xlsx.
                </div>

                {/* Uploaded documents */}
                {documents.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: '1rem' }}>No documents uploaded yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '1rem' }}>
                    {documents.map((doc) => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8f7f5', borderRadius: 8, padding: '8px 12px' }}>
                        <div style={{ fontSize: 12, color: '#0d0d0d' }}>
                          <span style={{ fontWeight: 500 }}>{doc.file_name}</span>
                          <span style={{ color: 'var(--color-ink-muted)' }}> · {doc.document_type ?? 'untyped'} · {formatKb(doc.file_size_kb)} · {new Date(doc.uploaded_at).toLocaleDateString()}</span>
                        </div>
                        <button type="button" onClick={() => deleteDocument(doc)} style={linkBtn}>Delete</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 520 }}>
                  <CbamField label="Document type" hint="Free text — CBAM evidence types vary by sector. Pick a suggestion or type your own.">
                    <input list="cbam-doctype-suggestions" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="e.g. weighbridge ticket" style={cbamInputStyle} />
                    <datalist id="cbam-doctype-suggestions">
                      {DOC_TYPE_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  </CbamField>
                  <CbamField label="Notes (optional)">
                    <input value={docNotes} onChange={(e) => setDocNotes(e.target.value)} style={cbamInputStyle} />
                  </CbamField>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.csv,.xlsx,application/pdf,image/png,image/jpeg,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={docUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) uploadDocument(f)
                      if (fileInputRef.current) fileInputRef.current.value = ''
                    }}
                    style={{ fontSize: 12 }}
                  />
                  {docUploading && <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>Uploading…</div>}
                </div>

                {docError && <ErrorBox prefix="Document error" message={docError} />}
              </div>

              {/* Which installation's processes */}
              <div style={{ marginBottom: '1.25rem', maxWidth: 420 }}>
                <CbamField label="Installation">
                  <select value={procInstallationId ?? ''} onChange={(e) => setProcInstallationId(e.target.value || null)} style={cbamInputStyle}>
                    {installations.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.country}</option>)}
                  </select>
                </CbamField>
              </div>

              {proc3Error && !editingProc && <ErrorBox prefix="Could not load / save process" message={proc3Error} />}

              {/* Existing processes */}
              {processes.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, marginBottom: '1rem' }}>No processes yet for this installation.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
                  {processes.map((proc) => (
                    <div key={proc.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>CN {proc.cn_code} <span style={{ color: 'var(--color-ink-muted)', fontWeight: 400 }}>· {categoryLabel(goodsCategories, proc.category_code)}{proc.route_code ? ` · ${routeLabel(proc.route_code)}` : ''}</span></div>
                          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Activity level {proc.activity_level} t · {proc.reporting_period} · {calcModeLabel(proc.calc_mode)}{proc.steel_grade ? ` · ${steelGradeLabel(proc.steel_grade)}` : ''}</div>
                          {/* Precursor status. Rows are the evidence of a declaration; the
                              declaration column only carries the state rows cannot express. */}
                          {(() => {
                            const m = precursorMeta[proc.id]
                            if (m && m.count > 0) {
                              return <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Precursors — {m.count} entered</div>
                            }
                            if (m && m.declaration === 'none') {
                              return <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400 }}>Precursors — none, {lowerFirst(declarationReasonLabel(m.reason))}</div>
                            }
                            return <div style={{ fontSize: 12, color: '#92400e', fontWeight: 400 }}>Precursors — not yet declared</div>
                          })()}
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" onClick={() => { setEditingProc(proc); setProc3Saved(false); setProc3Error(null) }} style={linkBtn}>Edit</button>
                          <button type="button" onClick={() => { setStreamsProcId(streamsProcId === proc.id ? null : proc.id); setPrecursorProcId(null); setComputeProcId(null) }} style={linkBtn}>{streamsProcId === proc.id ? 'Hide streams' : 'Streams'}</button>
                          <button
                            type="button"
                            onClick={() => {
                              const opening = precursorProcId !== proc.id
                              setPrecursorProcId(opening ? proc.id : null)
                              setStreamsProcId(null)
                              setComputeProcId(null)
                              setEditingPrecursor(null)
                              setPrecursorError(null)
                              setPrecursorNotice(null)
                              setDeclReason('')
                              setDeclNote('')
                              if (opening) loadPrecursors(proc.id)
                            }}
                            style={linkBtn}
                          >
                            {precursorProcId === proc.id ? 'Hide precursors' : 'Precursors'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { if (computeProcId === proc.id) { setComputeProcId(null) } else { setPrecursorProcId(null); runCompute(proc.id) } }}
                            disabled={computeBusyId === proc.id}
                            style={computeBusyId === proc.id
                                ? { ...linkBtn, background: 'var(--color-sunken)', color: 'var(--color-ink-muted)', border: '0.5px solid var(--color-line)', cursor: 'wait' }
                                : linkBtn}
                          >
                            {computeBusyId === proc.id ? 'Calculating…' : computeProcId === proc.id ? 'Hide result' : 'Calculate'}
                          </button>
                        </div>
                      </div>

                      {/* ── Precursors panel ── */}
                      {precursorProcId === proc.id && (() => {
                        const m = precursorMeta[proc.id]
                        return (
                          <div style={{ marginTop: 12, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 8 }}>Precursors</div>

                            {/* What a precursor figure currently rests on. Stated plainly rather
                                than offered as a choice — see the comment on savePrecursor. */}
                            <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: 10 }}>
                              Precursor figures currently use the published default values. Support for using a supplier&apos;s own verified figure is coming.
                            </div>

                            {precursorNotice && (
                              <div style={{ background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', lineHeight: 1.5, marginBottom: 10 }}>{precursorNotice}</div>
                            )}

                            {precursors.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 8 }}>No precursors entered.</div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                {precursors.map((pr) => (
                                  <div key={pr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8f7f5', borderRadius: 8, padding: '8px 12px' }}>
                                    <div style={{ fontSize: 12, color: '#0d0d0d' }}>
                                      <div><span style={{ fontWeight: 500 }}>CN {pr.cn_code}</span> <span style={{ color: 'var(--color-ink-muted)' }}>· {categoryLabel(goodsCategories, pr.category_code)} · {pr.mass_consumed} t · {countryName(pr.origin_country)} · {pr.reporting_period}</span></div>
                                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>{BOUNDARY_OPTIONS.find((b) => b.value === pr.boundary)?.label}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button type="button" onClick={() => { setEditingPrecursor(pr); setPrecursorError(null); setPrecursorNotice(null) }} style={linkBtn}>Edit</button>
                                      <button type="button" onClick={() => removePrecursor(pr.id)} style={linkBtn}>Remove</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {!editingPrecursor && (
                              <button type="button" onClick={() => { setEditingPrecursor(EMPTY_PRECURSOR(proc.reporting_period)); setPrecursorError(null); setPrecursorNotice(null) }} style={linkBtn}>+ New precursor</button>
                            )}

                            {editingPrecursor && (
                              <div ref={precursorFormRef} style={{ marginTop: 10, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                  <CbamField label="CN code — required (exactly as on your customs paperwork)">
                                    <input value={editingPrecursor.cn_code} onChange={(e) => setPrecF('cn_code', e.target.value)} placeholder="7203 00 00" style={cbamInputStyle} />
                                  </CbamField>
                                  <CbamField label="Category — required">
                                    <select value={editingPrecursor.category_code} onChange={(e) => setPrecF('category_code', e.target.value)} style={cbamInputStyle}>
                                      <option value="" disabled>Select a category…</option>
                                      {goodsCategories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                                    </select>
                                  </CbamField>
                                  <CbamField label="Mass consumed (tonnes) — required">
                                    <input type="number" step="any" min={0} value={editingPrecursor.mass_consumed} onChange={(e) => setPrecF('mass_consumed', e.target.value)} style={{ ...cbamInputStyle, width: 200 }} />
                                  </CbamField>
                                  <CbamField label="Where it came from — required">
                                    <select value={editingPrecursor.boundary} onChange={(e) => setPrecF('boundary', e.target.value)} style={cbamInputStyle}>
                                      {BOUNDARY_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                                    </select>
                                    {editingPrecursor.boundary === 'joint' && (
                                      // Neutral, not amber: this is how joint production is
                                      // supposed to work, not a problem to fix.
                                      <div style={{ marginTop: 4, fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.5 }}>
                                        The emissions of a precursor made inside this process&apos;s boundary are already counted in this process&apos;s own figure, so entering it here records it without adding it again.
                                      </div>
                                    )}
                                  </CbamField>
                                  <CbamField label="Country where it was produced — required" hint="Where the precursor was produced, not where it was bought.">
                                    <select value={editingPrecursor.origin_country} onChange={(e) => setPrecF('origin_country', e.target.value)} style={cbamInputStyle}>
                                      <option value="" disabled>Select a country…</option>
                                      {originCountries.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
                                    </select>
                                  </CbamField>
                                  <CbamField label="Reporting period — required" hint="The period the precursor's emissions figure covers, which may differ from this process's period.">
                                    <input type="number" step={1} value={editingPrecursor.reporting_period} onChange={(e) => setPrecF('reporting_period', e.target.value)} style={{ ...cbamInputStyle, width: 180 }} />
                                  </CbamField>

                                  <div style={{ borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 2 }}>Who produced it — all optional</div>
                                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5, marginBottom: 10 }}>Traceability only. These feed no calculation, and leaving them blank does not affect your figure.</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                      <CbamField label="Operator name">
                                        <input value={editingPrecursor.origin_operator_name} onChange={(e) => setPrecF('origin_operator_name', e.target.value)} style={cbamInputStyle} />
                                      </CbamField>
                                      <CbamField label="Installation name">
                                        <input value={editingPrecursor.origin_installation_name} onChange={(e) => setPrecF('origin_installation_name', e.target.value)} style={cbamInputStyle} />
                                      </CbamField>
                                      <CbamField label="CBAM Registry ID">
                                        <input value={editingPrecursor.origin_cbam_registry_id} onChange={(e) => setPrecF('origin_cbam_registry_id', e.target.value)} style={cbamInputStyle} />
                                      </CbamField>
                                    </div>
                                  </div>
                                </div>
                                {precursorError && <ErrorBox prefix="Could not save precursor" message={precursorError} />}
                                <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                                  <button type="button" onClick={savePrecursor} disabled={precursorSaving} style={primaryBtn(precursorSaving)}>{precursorSaving ? 'Saving…' : (editingPrecursor.id ? 'Save changes' : 'Save precursor')}</button>
                                  <button type="button" onClick={() => { setEditingPrecursor(null); setPrecursorError(null) }} style={ghostBtn}>Cancel</button>
                                </div>
                              </div>
                            )}

                            {precursorError && !editingPrecursor && <ErrorBox prefix="Could not update precursors" message={precursorError} />}

                            {/* ── Declaration ── */}
                            <div style={{ marginTop: 14, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                              {precursors.length > 0 ? (
                                <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6 }}>
                                  This process&apos;s precursors are declared by the entries above — nothing further is needed.
                                </div>
                              ) : m?.declaration === 'none' ? (
                                <div>
                                  <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: 8 }}>
                                    You have stated that this process consumes no CBAM precursors — {lowerFirst(declarationReasonLabel(m.reason))}.
                                    {m.note ? <> Your note: “{m.note}”</> : null}
                                  </div>
                                  <button type="button" onClick={withdrawDeclaration} disabled={precursorSaving} style={linkBtn}>Withdraw this statement</button>
                                </div>
                              ) : (
                                <div>
                                  <div style={{ fontSize: 12, color: '#555553', fontWeight: 400, lineHeight: 1.6, marginBottom: 10 }}>
                                    If this process consumes no CBAM precursors, say so here. A report cannot be generated until every process has either its precursors entered or this statement made.
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460 }}>
                                    <CbamField label="Why does this process consume none? — required">
                                      <select value={declReason} onChange={(e) => setDeclReason(e.target.value)} style={cbamInputStyle}>
                                        <option value="" disabled>Select a reason…</option>
                                        {DECLARATION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                                      </select>
                                    </CbamField>
                                    <CbamField label={declReason === 'other' ? 'Tell us briefly — required' : 'Anything to add? — optional'}>
                                      <input value={declNote} onChange={(e) => setDeclNote(e.target.value)} style={cbamInputStyle} />
                                    </CbamField>
                                  </div>
                                  <div style={{ marginTop: 12 }}>
                                    <button type="button" onClick={saveDeclaration} disabled={precursorSaving} style={primaryBtn(precursorSaving)}>{precursorSaving ? 'Saving…' : 'This process consumes no precursors'}</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {/* Compute result / error, expanded in place under this card. */}
                      {computeProcId === proc.id && (computeResult || computeError || computeStaleNote) && (
                        <div style={{ marginTop: 12, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                          {computeStaleNote && !computeResult && (
                            <div style={{ background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>{computeStaleNote}</div>
                          )}
                          {computeError && <ErrorBox prefix="Could not calculate emissions for this process" message={computeError} />}
                          {computeResult && (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 8 }}>Specific embedded emissions</div>
                              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 4 }}>
                                {([
                                  ['Direct', computeResult.see_record.see_direct],
                                  ['Indirect', computeResult.see_record.see_indirect],
                                  ['Total', computeResult.see_record.see_total],
                                ] as [string, number][]).map(([label, v]) => (
                                  <div key={label}>
                                    <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 400 }}>{label}</div>
                                    {/* Same formatting the report page uses for these figures
                                        (fmtNum): locale-grouped, up to 6 decimal places. */}
                                    <div style={{ fontSize: 14, color: '#0d0d0d', fontWeight: 500 }}>{v.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                                  </div>
                                ))}
                              </div>
                              {computeResult.hasUnresolved && (
                                // A WARNING, NOT AN ERROR: the figure is valid and defensible —
                                // it simply rests on a published default for these precursors
                                // rather than on a supplier's evidenced value. Amber, never red.
                                <div style={{ marginTop: 10, background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 12px' }}>
                                  <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600, marginBottom: 4 }}>Some precursors fell back to a published default</div>
                                  {computeResult.unresolved.map((u, i) => (
                                    <div key={`${u.cnCode}-${i}`} style={{ fontSize: 12, color: '#92400e', fontWeight: 400, lineHeight: 1.6 }}>
                                      {/* An UNRECOGNISED reason renders verbatim rather than
                                          being dropped — see UNRESOLVED_REASONS. */}
                                      CN {u.cnCode} — {UNRESOLVED_REASONS[u.reason] ?? u.reason}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* Nested source streams for this process */}
                      {streamsProcId === proc.id && (
                        <div style={{ marginTop: 12, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d', marginBottom: 8 }}>Source streams</div>

                          {/* Sign convention — surfaced prominently, it is not intuitive. */}
                          <div style={{ background: '#FEF3E2', border: '0.5px solid #f5d9ad', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', lineHeight: 1.5, marginBottom: 10 }}>
                            Sign convention: direct emissions are a single summed reduce with no subtraction, so an <strong>output</strong> stream must carry <strong>negative</strong> activity data — that is how the balance nets carbon in minus carbon out. A positive output value silently inflates the figure with nothing to catch it.
                          </div>

                          {streams.length === 0 ? (
                            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginBottom: 8 }}>No streams yet.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                              {streams.map((st) => (
                                <div key={st.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#f8f7f5', borderRadius: 8, padding: '8px 12px' }}>
                                  <div style={{ fontSize: 12, color: '#0d0d0d' }}>
                                    <div><span style={{ fontWeight: 500 }}>{st.name}</span> <span style={{ color: 'var(--color-ink-muted)' }}>· {streamKindLabel(st.stream_kind)} · Activity data {st.activity_data} · {ccModeLabel(st.cc_mode)}{Number(st.biomass_fraction) > 0 ? ` · Biomass ${st.biomass_fraction}` : ''}</span></div>
                                    {st.source_doc_id
                                      ? <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 2 }}>📎 {documentName(st.source_doc_id) ?? 'linked document'}</div>
                                      : <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>no source document — a verifier cannot trace this figure</div>}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button type="button" onClick={() => { setEditingStream(st); setStreamError(null) }} style={linkBtn}>Edit</button>
                                    <button type="button" onClick={() => removeStream(st.id)} style={linkBtn}>Remove</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Running mass balance + zero-floor note. */}
                          {streams.length > 0 && (() => {
                            const mb = massBalanceSum()
                            if (mb.error) {
                              return <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>One of the saved streams is missing a figure it needs, so the running total can&rsquo;t be shown yet.</div>
                            }
                            const v = mb.value as number
                            // TWO DIFFERENT DECISIONS ABOUT NOTATION HERE, deliberately. Do not
                            // make them consistent.
                            //
                            // The running line carries NO symbol. It once read '(DirEm*)', which
                            // appears nowhere a customer or verifier can follow it — not in the
                            // §1.2 report, the .xlsx export, the verifier view, or the workings
                            // jsonb. An operator who learned it here could not carry it anywhere,
                            // so it was notation for its own sake on a data-entry screen.
                            //
                            // The negative-balance note below KEEPS 'AttrEm_Dir' and its verbatim
                            // Annex III quote. That symbol names the quantity the regulation
                            // floors, and the quote is the operator's evidence that the flooring
                            // is the regulation's rule and not ours. Strip it and the note becomes
                            // an unsourced assertion about their number.
                            return (
                              <div style={{ fontSize: 12, color: v < 0 ? '#92400e' : '#555553', marginBottom: 8, lineHeight: 1.5 }}>
                                Running total from your streams: <strong>{v.toFixed(4)}</strong> t CO₂
                                {v < 0 && (
                                  <div style={{ marginTop: 4 }}>
                                    Negative net — AttrEm_Dir will be floored to zero per Annex III (“Where AttrEm_Dir is calculated to have a negative value, it shall be set to zero”). A negative net usually indicates a data-entry error, e.g. an output entered positive or an input entered negative.
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          {!editingStream && (
                            <button type="button" onClick={() => { setEditingStream(EMPTY_STREAM); setStreamError(null) }} style={linkBtn}>+ New stream</button>
                          )}

                          {/* Stream add / edit form — cc_mode drives which fields show. */}
                          {editingStream && (
                            <div ref={streamFormRef} style={{ marginTop: 10, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <CbamField label="Stream name — required">
                                  <input value={editingStream.name} onChange={(e) => setStreamF('name', e.target.value)} style={cbamInputStyle} />
                                </CbamField>
                                <CbamField label="Stream kind — required">
                                  <select value={editingStream.stream_kind} onChange={(e) => setStreamF('stream_kind', e.target.value)} style={cbamInputStyle}>
                                    <option value="fuel">{streamKindLabel('fuel')}</option>
                                    <option value="process_material">{streamKindLabel('process_material')}</option>
                                    <option value="output">{streamKindLabel('output')}</option>
                                  </select>
                                </CbamField>
                                <CbamField label="Activity data — required" hint={editingStream.stream_kind === 'output'
                                  ? <>An <strong>output</strong> stream must carry a <strong>negative</strong> value — outputs net carbon out of the balance.</>
                                  : 'Tonnes. Fuels and materials are positive.'}>
                                  <input type="number" step="any" value={editingStream.activity_data} onChange={(e) => setStreamF('activity_data', e.target.value)} style={cbamInputStyle} />
                                  {editingStream.stream_kind === 'output' && editingStream.activity_data.trim() !== '' && Number(editingStream.activity_data) > 0 && (
                                    <div style={{ marginTop: 4, fontSize: 11, color: '#92400e' }}>This is an output stream but the value is positive — outputs should be negative, a positive value inflates the emissions. (Not blocked, but check this.)</div>
                                  )}
                                </CbamField>
                                <CbamField label="Carbon-content mode — required">
                                  <select value={editingStream.cc_mode} onChange={(e) => setStreamF('cc_mode', e.target.value)} style={cbamInputStyle}>
                                    <option value="direct">{ccModeLabel('direct')}</option>
                                    <option value="ef_per_t">{ccModeLabel('ef_per_t')}</option>
                                    <option value="ef_per_tj">{ccModeLabel('ef_per_tj')}</option>
                                  </select>
                                </CbamField>
                                {editingStream.cc_mode === 'direct' && (
                                  <CbamField label="Carbon content — required for this mode" hint="Carbon fraction of this stream, as a number.">
                                    <input type="number" step="any" value={editingStream.carbon_content} onChange={(e) => setStreamF('carbon_content', e.target.value)} style={cbamInputStyle} />
                                  </CbamField>
                                )}
                                {editingStream.cc_mode === 'ef_per_t' && (
                                  <CbamField label="Emission factor — required for this mode" hint="t CO₂ / t.">
                                    <input type="number" step="any" value={editingStream.emission_factor} onChange={(e) => setStreamF('emission_factor', e.target.value)} style={cbamInputStyle} />
                                  </CbamField>
                                )}
                                {editingStream.cc_mode === 'ef_per_tj' && (
                                  <>
                                    <CbamField label="Emission factor — required for this mode" hint="t CO₂ / TJ.">
                                      <input type="number" step="any" value={editingStream.emission_factor} onChange={(e) => setStreamF('emission_factor', e.target.value)} style={cbamInputStyle} />
                                    </CbamField>
                                    <CbamField label="NCV — required for this mode" hint="Net calorific value (TJ / t).">
                                      <input type="number" step="any" value={editingStream.ncv} onChange={(e) => setStreamF('ncv', e.target.value)} style={cbamInputStyle} />
                                    </CbamField>
                                  </>
                                )}
                                <CbamField label="Biomass fraction" hint="0 to 1. The biomass share is subtracted from this stream&rsquo;s emissions. Leave blank if none.">
                                  <input type="number" step="any" value={editingStream.biomass_fraction} onChange={(e) => setStreamF('biomass_fraction', e.target.value)} style={{ ...cbamInputStyle, width: 160 }} />
                                </CbamField>
                                <CbamField label="Source document" hint="The evidence this activity data came from. Optional — a stream without a document is valid, just unevidenced (a verifier cannot trace it). Upload documents in the Evidence documents panel above.">
                                  <select value={editingStream.source_doc_id} onChange={(e) => setStreamF('source_doc_id', e.target.value)} style={cbamInputStyle}>
                                    <option value="">— none (unevidenced) —</option>
                                    {documents.map((d) => <option key={d.id} value={d.id}>{d.file_name}{d.document_type ? ` (${d.document_type})` : ''}</option>)}
                                  </select>
                                </CbamField>
                              </div>
                              {streamError && <ErrorBox prefix="Could not save stream" message={streamError} />}
                              <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
                                <button type="button" onClick={saveStream} disabled={streamSaving} style={primaryBtn(streamSaving)}>{streamSaving ? 'Saving…' : (editingStream.id ? 'Save changes' : 'Save stream')}</button>
                                <button type="button" onClick={() => { setEditingStream(null); setStreamError(null) }} style={ghostBtn}>Cancel</button>
                              </div>
                            </div>
                          )}
                          {streamError && !editingStream && <ErrorBox prefix="Stream error" message={streamError} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {!editingProc && procInstallationId && (
                <button type="button" onClick={() => { setEditingProc(EMPTY_PROCESS(procInstallationId)); setProc3Saved(false); setProc3Error(null) }} style={primaryBtn(false)}>
                  + New process
                </button>
              )}

              {/* Process add / edit form */}
              {editingProc && (
                <div ref={procFormRef} style={{ marginTop: '1rem', background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem', maxWidth: 640 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#0d0d0d', marginBottom: '1rem' }}>{editingProc.id ? 'Edit process' : 'New process'}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <CbamField label="Installation — required">
                      <select value={editingProc.installation_id} onChange={(e) => setProc('installation_id', e.target.value)} style={cbamInputStyle}>
                        {installations.map((i) => <option key={i.id} value={i.id}>{i.name} — {i.country}</option>)}
                      </select>
                    </CbamField>
                    <CbamField label="CN code — required (exactly as on your customs paperwork)" hint="e.g. '7206 10 00'. Granularity varies by good: some are listed at 4-digit heading level (7201, 7203), others at 6-digit (7202 11) or 8-digit spaced (7206 10 00). Enter the code exactly as it appears for your product on your customs paperwork — do not shorten, pad, or infer it. If it is rejected, we hold no published default value at that code: go back to the paperwork rather than trying a shorter or longer version, because a code that happens to be recognised but is not yours will produce a plausible and wrong result.">
                      <input value={editingProc.cn_code} onChange={(e) => setProc('cn_code', e.target.value)} placeholder="7206 10 00" style={cbamInputStyle} />
                    </CbamField>
                    <CbamField label="Category — required">
                      <select value={editingProc.category_code} onChange={(e) => selectCategory(e.target.value)} style={cbamInputStyle}>
                        <option value="" disabled>Select a category…</option>
                        {goodsCategories.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                      {/*
                        ADVISORY ONLY. This never blocks a save, never disables a control, and no
                        validation path consults it — cbam_cn_map is a HINT, NOT AN AUTHORITY.

                        Two known reasons the map can disagree with a correct entry. CN 7205 is
                        dual-listed and the operator resolves it between two categories; the map
                        holds one prefix and cannot. And §3.15.1's rolling split — primary
                        hot-rolling and rough forging yielding CN 7207, 7218 or 7224 stay in crude
                        steel, all other rolling and forging falls to iron or steel products —
                        turns on the ACTIVITY, which no CN prefix encodes.

                        So a disagreement means CHECK, not CORRECT. Never phrase it as an error,
                        and never let it gate the save handler.
                      */}
                      {(() => {
                        const a = assessCnCategory(editingProc.cn_code, editingProc.category_code, cnMap)
                        // The user has only ever seen labels — the select renders c.label. Falling
                        // back to the raw code is for a category the map names but goodsCategories
                        // has not loaded; showing a code beats showing nothing.
                        const labelFor = (code: string) => goodsCategories.find((c) => c.code === code)?.label ?? code
                        const line: React.CSSProperties = { marginTop: 4, fontSize: 12, fontWeight: 400, lineHeight: 1.5 }
                        if (a.kind === 'consistent') {
                          // Rendered, not silent: a passed check and a check that never ran must
                          // not look the same.
                          return <div style={{ ...line, color: '#555553' }}>Customs code and category agree — {a.matched_prefix} is {labelFor(a.category_code)}.</div>
                        }
                        if (a.kind === 'inconsistent') {
                          return <div style={{ ...line, color: '#92400e' }}>Worth checking — customs code {a.matched_prefix} usually means {labelFor(a.expected_category)}, but {labelFor(a.selected_category)} is selected. Nothing is blocked, and this may be right for your good — just confirm before saving.</div>
                        }
                        if (a.reason === 'no_prefix_match') {
                          return <div style={{ ...line, color: 'var(--color-ink-muted)' }}>Not checked — we don&apos;t hold a reference for this customs code, so we can&apos;t say either way. This is not a pass.</div>
                        }
                        if (a.reason === 'malformed_reference_row') {
                          return <div style={{ ...line, color: '#92400e' }}>Not checked — one of our reference records couldn&apos;t be read, so we can&apos;t say either way. This is a problem on our side, not with what you entered.</div>
                        }
                        if (a.reason === 'no_category_selected') {
                          // Nothing has been claimed yet, so there is nothing to check — but there
                          // may be something to OFFER.
                          //
                          // WE SUGGEST, WE DO NOT AUTO-FILL, and that is a methodology choice not a
                          // UX one. The operator makes the claim. If we pre-selected the category
                          // from the customs code, the consistency check above would be checking our
                          // own inference against itself and would agree every time — it would stop
                          // meaning anything. Worse, a dual-listed code like 7205 would be silently
                          // resolved on the operator's behalf, turning a judgement only they can
                          // make into a default they never saw.
                          const s = suggestCategory(editingProc.cn_code, cnMap)
                          // Light by design: an offer, not a call to action. The select remains the
                          // way to choose; these buttons are a shortcut to it, not a replacement.
                          const chip: React.CSSProperties = {
                            fontSize: 12, fontWeight: 400, lineHeight: 1.5, padding: '2px 10px',
                            background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4',
                            borderRadius: 999, cursor: 'pointer',
                          }
                          // Buttons live on their own row beneath the sentence, so two of them wrap
                          // together as a pair rather than the second one stranding below the text.
                          // Same container for one button and two, so the two shapes read alike.
                          const chipRow: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }
                          if (s.kind === 'single') {
                            return (
                              <div style={{ ...line, color: 'var(--color-ink-muted)' }}>
                                This customs code is usually {labelFor(s.category_code)}.
                                <div style={chipRow}>
                                  <button type="button" onClick={() => selectCategory(s.category_code)} style={chip}>Use {labelFor(s.category_code)}</button>
                                </div>
                              </div>
                            )
                          }
                          if (s.kind === 'choice') {
                            return (
                              <div style={{ ...line, color: 'var(--color-ink-muted)' }}>
                                This customs code can fall under either category, depending on what
                                the goods are. It counts as {labelFor(s.primary)} unless they are in
                                fact {labelFor(s.alternative)} — only you can say which.
                                <div style={chipRow}>
                                  <button type="button" onClick={() => selectCategory(s.primary)} style={chip}>Use {labelFor(s.primary)}</button>
                                  <button type="button" onClick={() => selectCategory(s.alternative)} style={chip}>Use {labelFor(s.alternative)}</button>
                                </div>
                              </div>
                            )
                          }
                          // 'none' and 'unavailable' alike: nothing typed, nothing covered, or the
                          // map could not be read. No suggestion exists to make, and this is not the
                          // surface on which to report a seed defect to a customer.
                          return null
                        }
                        // 'unparseable_cn': the user is mid-entry and has made no claim to
                        // contradict. Silence.
                        return null
                      })()}
                    </CbamField>
                    {editingProc.category_code && (
                      routesForCategory(editingProc.category_code).length > 0 ? (
                        <CbamField label="Production route — required for this category" hint="Only routes that belong to the category you chose are shown here.">
                          <select value={editingProc.route_code} onChange={(e) => setProc('route_code', e.target.value)} style={cbamInputStyle}>
                            <option value="" disabled>Select a route…</option>
                            {routesForCategory(editingProc.category_code).map((r) => <option key={r.route_code} value={r.route_code}>{routeLabel(r.route_code)}</option>)}
                          </select>
                        </CbamField>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.5 }}>This category has no production route — the route is left unset (correct for e.g. iron/steel products and sintered ore).</div>
                      )
                    )}
                    {/*
                      BOUNDARY GUIDANCE — ADVISORY ONLY. Reads nothing, writes nothing, gates
                      nothing. It is not consulted by saveProcess and holds no form state beyond
                      whether it is open.

                      Gated on the category being one the page actually LOADED, not on a list
                      written here. goodsCategories comes from cbam_goods_categories; if the
                      selected value is not in it, the reference data has not arrived or the
                      value is one we do not recognise, and quoting regulation text against a
                      category we cannot name would be worse than showing nothing.

                      Route is passed through when set and narrows the result; a category with
                      no routes still renders, because the view model treats an entry with no
                      routes as applying to the whole category.

                      Everything visible below the button comes from the view model — headings,
                      lead-ins, cites and provision text alike. Do not re-author copy here, and
                      do not trim, truncate or ellipsise a provision: the whole point of the
                      panel is that a reader can quote it against the Official Journal.
                    */}
                    {editingProc.category_code && goodsCategories.some((c) => c.code === editingProc.category_code) && (() => {
                      const view = buildBoundaryGuidanceView(editingProc.category_code, editingProc.route_code)
                      if (!view || view.groups.length === 0) return null
                      return (
                        <div>
                          <button
                            type="button"
                            aria-expanded={boundaryOpen}
                            aria-controls="cbam-boundary-guidance"
                            onClick={() => setBoundaryOpen((o) => !o)}
                            style={{
                              fontSize: 12, fontWeight: 400, lineHeight: 1.5, padding: '2px 10px',
                              background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4',
                              borderRadius: 999, cursor: 'pointer',
                            }}
                          >
                            {/* aria-hidden: aria-expanded on the button already carries the
                                state, so a screen reader announcing the glyph too would say it
                                twice. Purely visual affordance. */}
                            <span aria-hidden="true" style={{ display: 'inline-block', width: 10, marginRight: 4 }}>{boundaryOpen ? '▾' : '▸'}</span>
                            Rules that apply to this good ({view.totalProvisions})
                          </button>
                          {boundaryOpen && (
                            <div id="cbam-boundary-guidance" style={{ marginTop: 10, borderLeft: '0.5px solid #e8e7e4', paddingLeft: 12 }}>
                              {view.groups.map((g, gi) => (
                                // Rule between groups, not above the first: a rule at the top
                                // would read as separating the panel from the button rather than
                                // one group from the next. Padding above it keeps the rule off
                                // the heading it introduces.
                                <div key={g.key} style={gi === 0
                                  ? { marginBottom: 16 }
                                  : { marginBottom: 16, borderTop: '1px solid #e8e7e4', paddingTop: 16 }}>
                                  {/* Our framing. Kept visually distinct from the quoted text
                                      below so a reader can tell which words are whose. */}
                                  <div style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.5, color: '#555553' }}>{g.heading}</div>
                                  <div style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.5, color: 'var(--color-ink-muted)' }}>{g.leadIn}</div>
                                  {g.entries.map((e) => (
                                    <div key={e.cite} style={{ marginTop: 8 }}>
                                      {/* Darker than the heading and leadIn above it, and matching
                                          the provisions below it: the cite ATTRIBUTES the
                                          regulation's text, so it belongs with the quoted words
                                          rather than with our framing of them. */}
                                      <div style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.5, color: '#555553' }}>{e.cite}</div>
                                      <ul style={{ margin: '2px 0 0', paddingLeft: 16 }}>
                                        {e.provisions.map((p, i) => (
                                          // Verbatim. No slice, no ellipsis, no casing change.
                                          <li key={i} style={{ fontSize: 12, fontWeight: 400, lineHeight: 1.5, color: '#555553' }}>{p}</li>
                                        ))}
                                      </ul>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {/* The tonnes unit is HARDCODED, and correct for every sector live today —
                          iron & steel and aluminium are both measured in tonnes of goods. It would
                          be wrong for a good measured in anything else (e.g. electricity, in MWh),
                          so adding such a sector means the unit has to become derived, not just
                          this label edited. */}
                      <CbamField label="Activity level (tonnes) — required (> 0)" hint="How much of this good the installation produced during the reporting period.">
                        <input type="number" step="any" value={editingProc.activity_level} onChange={(e) => setProc('activity_level', e.target.value)} placeholder="tonnes" style={{ ...cbamInputStyle, width: 180 }} />
                      </CbamField>
                      <CbamField label="Reporting period — required (≥ 2026)">
                        <input type="number" step={1} min={2026} value={editingProc.reporting_period} onChange={(e) => setProc('reporting_period', e.target.value)} style={{ ...cbamInputStyle, width: 180 }} />
                      </CbamField>
                    </div>
                    <CbamField label="Calculation method — required">
                      {/* 360, not 220: the longest option is 'Combination of Actual and Default
                          Values' at 13px, which clipped. Same width as the steel-grade select
                          below so the two read as a pair. */}
                      <select value={editingProc.calc_mode} onChange={(e) => setProc('calc_mode', e.target.value)} style={{ ...cbamInputStyle, width: 360 }}>
                        <option value="actual">{calcModeLabel('actual')}</option>
                        <option value="default">{calcModeLabel('default')}</option>
                        <option value="combined">{calcModeLabel('combined')}</option>
                      </select>
                    </CbamField>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {STEEL_GRADE_CATEGORIES.has(editingProc.category_code) && (
                        <CbamField label="Steel grade" hint="Steel goods only; leave unset otherwise.">
                          <select value={editingProc.steel_grade} onChange={(e) => setProc('steel_grade', e.target.value)} style={{ ...cbamInputStyle, width: 400 }}>
                            <option value="">(none)</option>
                            <option value="carbon">{steelGradeLabel('carbon')}</option>
                            <option value="low_alloy">{steelGradeLabel('low_alloy')}</option>
                            <option value="high_alloy">{steelGradeLabel('high_alloy')}</option>
                          </select>
                        </CbamField>
                      )}
                      <CbamField label="Electricity consumed (MWh)" hint="For own-indirect on non-Annex-II goods. Leave blank, or ≥ 0.">
                        <input type="number" step="any" value={editingProc.electricity_consumed} onChange={(e) => setProc('electricity_consumed', e.target.value)} style={{ ...cbamInputStyle, width: 200 }} />
                      </CbamField>
                    </div>
                  </div>
                  {proc3Error && <ErrorBox prefix="Could not save process" message={proc3Error} />}
                  <div style={{ marginTop: '1.25rem', display: 'flex', gap: 10 }}>
                    <button type="button" onClick={saveProcess} disabled={proc3Saving} style={primaryBtn(proc3Saving)}>{proc3Saving ? 'Saving…' : (editingProc.id ? 'Save changes' : 'Save process')}</button>
                    <button type="button" onClick={() => { setEditingProc(null); setProc3Error(null) }} style={ghostBtn}>Cancel</button>
                  </div>
                </div>
              )}

              {proc3Saved && !editingProc && (
                <div style={{ marginTop: '1.25rem', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, color: '#0F6E56' }}>✓ Saved</span>
                  <a href="/dashboard/cbam/report" style={linkBtn}>Generate report →</a>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── STEP 4: PLACEHOLDER — not built this increment ── */}
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
        background: active ? 'var(--color-brand)' : '#fff',
        color: active ? '#fff' : (muted ? 'var(--color-ink-muted)' : '#0d0d0d'),
        border: `0.5px solid ${active ? 'var(--color-brand)' : '#e8e7e4'}`,
        borderRadius: 10,
        padding: '8px 14px',
        cursor: 'pointer',
        minWidth: 150,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{n}. {label}</div>
      <div style={{ fontSize: 11, fontWeight: 400, color: active ? 'rgba(255,255,255,0.75)' : 'var(--color-ink-muted)' }}>{sub}</div>
    </button>
  )
}

// ISO alpha-2 -> country name. Falls back to the bare code where the runtime has no name for it
// — showing the code beats showing nothing, and never a blank option.
const COUNTRY_NAMES = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(undefined, { type: 'region' })
  : null
function countryName(code: string): string {
  try {
    return COUNTRY_NAMES?.of(code) ?? code
  } catch {
    return code
  }
}

function categoryLabel(cats: { code: string; label: string }[], code: string): string {
  return cats.find((c) => c.code === code)?.label ?? code
}

function formatKb(kb: number | null): string {
  if (kb == null) return 'size unknown'
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`
  return `${Math.round(kb)} KB`
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
  background: 'var(--color-brand)', color: '#0d0d0d',
  opacity: disabled ? 0.6 : 1,
})
const ghostBtn: React.CSSProperties = { fontSize: 13, fontWeight: 500, padding: '11px 18px', borderRadius: 10, background: 'transparent', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }
const linkBtn: React.CSSProperties = { fontSize: 13, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: '#fff', color: 'var(--color-brand)', border: '0.5px solid var(--color-brand)', cursor: 'pointer' }
const linkAnchor: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--color-brand)', textDecoration: 'underline' }
