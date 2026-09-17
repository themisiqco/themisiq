'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Nav from '../../components/Nav'
import Papa from 'papaparse'
import { supabase } from '../../../lib/supabase'
import { useEntitlementAccess } from '../../../lib/useEntitlement'
import { DRAFT_KEYS, readDraft, useDraftAutosave, clearDraft } from '../../../lib/drafts'
import { CS3D_APPLIES_FROM } from '../../../lib/cs3d'
import { INDUSTRY_CODES, INDUSTRY_OPTION_GROUPS, industryName } from '../../../lib/emissionFactors/industryOptions'
import { sectionHead } from '@/app/components/headingStyles'
import { btnPrimary, btnStep, btnStepDisabled, btnStepPrimary, btnStepPrimaryDisabled, toggleOff, toggleOn } from '@/app/components/buttonStyles'
import { reportingYearOptions, defaultReportingYear } from '../../../lib/reportingYears'

// Floor 2023, preserving the window this module already offered. There is no factor-table reason
// here — SECTOR_RISK carries a flat spend factor with no year dimension — so this is a product
// choice about how far back a supplier register is worth keeping, not a limit of the data.
const YEAR_FLOOR = 2023

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'medium' | 'low'
type Framework = 'cs3d' | 'ecovadis' | 'modern_slavery' | 'cdp_c12' | 'esrs_s2' | 'scope3'

interface Supplier {
  id: string
  name: string
  country: string
  sector: string
  annual_spend: number
  currency: string
  tier: '1' | '2' | '3'
  has_assessment: boolean
  risk_level: RiskLevel
  risk_score: number
  risk_factors: string[]
  /** null when no spend factor is available for the selected sector. NOT zero: see scoreSupplier. */
  scope3_emissions: number | null
}

interface SupplyChainInventory {
  company: string
  reporting_year: number
  frameworks: Framework[]
  currency: string
  suppliers: Supplier[]
}

// ─── Risk Engine ──────────────────────────────────────────────────────────────

const COUNTRY_RISK: Record<string, { risk: number; label: string }> = {
  // Critical risk
  'Bangladesh': { risk: 4, label: 'Critical — labour rights, safety' },
  'Myanmar': { risk: 4, label: 'Critical — conflict, forced labour' },
  'North Korea': { risk: 4, label: 'Critical — forced labour' },
  'Eritrea': { risk: 4, label: 'Critical — forced labour' },
  'Uzbekistan': { risk: 3, label: 'High — cotton forced labour risk' },
  'China': { risk: 3, label: 'High — Xinjiang forced labour risk' },
  'Pakistan': { risk: 3, label: 'High — labour rights gaps' },
  'Cambodia': { risk: 3, label: 'High — garment sector risks' },
  'Vietnam': { risk: 2, label: 'Medium — improving but gaps remain' },
  'India': { risk: 2, label: 'Medium — sector-dependent risk' },
  'Brazil': { risk: 2, label: 'Medium — deforestation, labour risk' },
  'Mexico': { risk: 2, label: 'Medium — labour rights, security' },
  'Turkey': { risk: 2, label: 'Medium — labour rights concerns' },
  'Indonesia': { risk: 2, label: 'Medium — palm oil, deforestation' },
  'Thailand': { risk: 2, label: 'Medium — migrant labour risk' },
  // Low risk
  'Germany': { risk: 1, label: 'Low — strong regulatory framework' },
  'France': { risk: 1, label: 'Low — strong regulatory framework' },
  'UK': { risk: 1, label: 'Low — Modern Slavery Act compliance' },
  'Netherlands': { risk: 1, label: 'Low — strong regulatory framework' },
  'Sweden': { risk: 1, label: 'Low — strong regulatory framework' },
  'Denmark': { risk: 1, label: 'Low — strong regulatory framework' },
  'USA': { risk: 1, label: 'Low — regulated market' },
  'Canada': { risk: 1, label: 'Low — regulated market' },
  'Australia': { risk: 1, label: 'Low — Modern Slavery Act' },
  'Japan': { risk: 1, label: 'Low — regulated market' },
  'South Korea': { risk: 1, label: 'Low — regulated market' },
}

const SECTOR_RISK: Record<string, { risk: number; label: string; ef: number }> = {
  'Agriculture & Food': { risk: 3, label: 'High — land use, labour, water', ef: 2.8 },
  'Garments & Textiles': { risk: 4, label: 'Critical — labour, chemicals', ef: 1.2 },
  'Electronics & Technology': { risk: 3, label: 'High — minerals, e-waste', ef: 0.4 },
  'Construction & Materials': { risk: 3, label: 'High — safety, environment', ef: 3.1 },
  'Chemicals': { risk: 3, label: 'High — environmental, safety', ef: 1.8 },
  'Mining & Metals': { risk: 4, label: 'Critical — environment, safety', ef: 4.2 },
  'Transport & Logistics': { risk: 2, label: 'Medium — safety, emissions', ef: 0.9 },
  'Professional Services': { risk: 1, label: 'Low — standard risks only', ef: 0.1 },
  'IT & Software': { risk: 1, label: 'Low — data privacy focus', ef: 0.05 },
  'Financial Services': { risk: 1, label: 'Low — regulated sector', ef: 0.08 },
  'Healthcare & Pharma': { risk: 2, label: 'Medium — quality, safety', ef: 0.3 },
  'Energy & Utilities': { risk: 3, label: 'High — environmental impact', ef: 2.1 },
  'Retail & Distribution': { risk: 2, label: 'Medium — labour, packaging', ef: 0.4 },
  'Other Manufacturing': { risk: 2, label: 'Medium — sector-dependent', ef: 1.1 },
}

const COUNTRIES = Object.keys(COUNTRY_RISK).sort()
const SECTORS = Object.keys(SECTOR_RISK).sort()

// ⚠️ SECTOR_RISK IS KEYED ON THE RETIRED INTERNAL VOCABULARY AND THE DROPDOWN NOW EMITS EXIOBASE
// CODES, SO EVERY LOOKUP MISSES. That is deliberate and the miss is surfaced rather than absorbed.
// The table stays because its RISK ratings are a separate piece of work from its `ef` column and
// come out separately; what must not happen is `ef` quietly becoming 0.5 for every supplier, which
// is what the old `|| { ..., ef: 0.5 }` fallback did. A factor of 0.5 against a range running to
// 4.2 is a wrong number that renders identically to a right one.
//   The RISK half keeps its 2-out-of-5 default so the score does not silently drop five points for
// every supplier at once, but the default is now NAMED in risk_factors instead of being invisible
// below the `>= 3` threshold that used to hide it.
//   scope3 becomes null. Null is not zero and is not rendered as a figure.
const scoreSupplier = (supplier: Supplier): { risk: RiskLevel; score: number; factors: string[]; scope3: number | null } => {
  const countryData = COUNTRY_RISK[supplier.country] || { risk: 2, label: 'Unknown — assess manually' }
  const sectorData = SECTOR_RISK[supplier.sector]

  const factors: string[] = []
  let score = 0

  // Country risk (40%)
  score += countryData.risk * 2.5
  if (countryData.risk >= 3) factors.push(`Country risk: ${countryData.label}`)

  // Sector risk (40%)
  score += (sectorData?.risk ?? 2) * 2.5
  if (!sectorData) factors.push('Sector risk not rated — no risk profile held for this sector yet')
  else if (sectorData.risk >= 3) factors.push(`Sector risk: ${sectorData.label}`)

  // Spend concentration (10%)
  if (supplier.annual_spend > 1000000) { score += 1; factors.push('High spend concentration — strategic dependency') }
  if (supplier.annual_spend > 5000000) { score += 1; factors.push('Very high spend — enhanced due diligence required') }

  // Tier risk (10%)
  if (supplier.tier === '2') { score += 0.5; factors.push('Tier 2 supplier — limited visibility') }
  if (supplier.tier === '3') { score += 1; factors.push('Tier 3 supplier — very limited visibility') }

  // No assessment
  if (!supplier.has_assessment) { score += 0.5; factors.push('No sustainability assessment on file') }

  const risk: RiskLevel = score >= 7 ? 'critical' : score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low'

  // Scope 3 Cat.1 spend-based estimate (kg CO2e per $ spend × annual spend / 1000 = mt).
  // null when no factor is held for this sector — see the header. Zero spend is still zero.
  const scope3 = sectorData === undefined
    ? null
    : supplier.annual_spend > 0 ? (supplier.annual_spend * sectorData.ef) / 1000 : 0

  return { risk, score: Math.round(score * 10) / 10, factors, scope3 }
}

const newSupplier = (): Supplier => ({
  id: Math.random().toString(36).slice(2),
  name: '', country: 'Germany', sector: 'Professional Services',
  annual_spend: 0, currency: 'USD', tier: '1',
  has_assessment: false, risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
})

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRAD = 'var(--color-brand)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: 'CRITICAL', color: '#fff', bg: '#B91C1C', border: '#B91C1C' },
  high:     { label: 'HIGH', color: '#B91C1C', bg: '#FCEBEB', border: '#B91C1C' },
  medium:   { label: 'MEDIUM', color: 'var(--color-module-climate)', bg: '#FEF3E2', border: 'var(--color-module-climate)' },
  low:      { label: 'LOW', color: '#0F6E56', bg: '#E1F5EE', border: '#0F6E56' },
}

const FRAMEWORK_CONFIG: Record<Framework, { label: string; desc: string }> = {
  cs3d:          { label: 'EU CS3D', desc: `Human rights & environmental due diligence · ${CS3D_APPLIES_FROM}` },
  ecovadis:      { label: 'EcoVadis', desc: 'Supplier sustainability ratings · customer-requested' },
  modern_slavery:{ label: 'Modern Slavery Act', desc: 'UK & Australia transparency statement · annual' },
  cdp_c12:       { label: 'CDP supplier engagement', desc: 'Supplier engagement programme · annual · July' },
  esrs_s2:       { label: 'ESRS S2', desc: 'Value chain workers disclosure · FY2024 active' },
  scope3:        { label: 'Scope 3 Cat.1', desc: 'GHG Protocol purchased goods & services' },
}

const STEP_NAMES = ['Setup', 'Suppliers', 'Risk Scoring', 'Scope 3', 'Export']

// ─── Component ────────────────────────────────────────────────────────────────

// ── DRAFT VALIDATION ──────────────────────────────────────────────────────────
// A draft is untrusted input even though this tab wrote it: it survives a full page load, an
// older deploy may have written it, and localStorage is editable. Field by field, by type.
//
// ⚠️ THE FOUR DERIVED FIELDS ARE RECOMPUTED, NOT READ. risk_level, risk_score, risk_factors and
// scope3_emissions all come out of scoreSupplier(), and that function's thresholds and country
// table change. Trusting the stored copy would show a visitor a score this build would not
// produce, next to inputs that say otherwise — and the export would carry it.
function parseSupplyChainDraft(u: unknown): SupplyChainInventory | null {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null
  const o = u as Record<string, unknown>
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb)
  const num = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb)

  const suppliers: Supplier[] = Array.isArray(o.suppliers)
    ? o.suppliers.flatMap((raw): Supplier[] => {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return []
        const r = raw as Record<string, unknown>
        const tier = r.tier === '1' || r.tier === '2' || r.tier === '3' ? r.tier : '1'
        const base: Supplier = {
          id: str(r.id, Math.random().toString(36).slice(2)),
          name: str(r.name, ''), country: str(r.country, ''), sector: str(r.sector, ''),
          annual_spend: num(r.annual_spend, 0), currency: str(r.currency, 'USD'), tier,
          has_assessment: typeof r.has_assessment === 'boolean' ? r.has_assessment : false,
          risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
        }
        const scored = scoreSupplier(base)
        return [{ ...base, risk_level: scored.risk, risk_score: scored.score, risk_factors: scored.factors, scope3_emissions: scored.scope3 }]
      })
    : []

  const frameworks = Array.isArray(o.frameworks) ? (o.frameworks.filter(f => typeof f === 'string') as Framework[]) : []
  const inv: SupplyChainInventory = {
    company: str(o.company, ''),
    reporting_year: num(o.reporting_year, defaultReportingYear(new Date(), YEAR_FLOOR)),
    frameworks: frameworks.length ? frameworks : ['cs3d', 'scope3', 'esrs_s2'],
    currency: str(o.currency, 'USD'),
    suppliers,
  }
  // Nothing worth restoring is nothing to restore. An empty company and no suppliers is the
  // default form, and announcing a recovery of it would be a lie about what came back.
  return inv.company.trim() === '' && inv.suppliers.length === 0 ? null : inv
}

// ── SAVE REFUSAL COPY ─────────────────────────────────────────────────────────
// The calculator is never gated. Anyone — logged out, unentitled, expired — runs it and sees real
// supplier scores; the gates are on OUTPUT, which is the CSV export and now saving a register.
//
// These sentences are deliberately identical to what enforce_supply_chain_entitlement() raises for
// the same two conditions. The check in handleSave saves a round trip; the trigger is the actual
// enforcement. Two wordings for one refusal would be two things to keep in step, and the customer
// would get different text depending on which layer caught it.
const SAVE_REFUSAL: Record<'expired' | 'none' | 'unknown', string> = {
  expired: 'Your Supply Chain access has expired. Renew to save a new register. Your existing registers are still here and still readable.',
  none: 'Saving a register requires the Supply Chain module. Your suppliers are still on screen — purchase to save them.',
  // States what was observed, not a guess at why. The read failed; naming a cause we cannot verify
  // is how a wrong one ends up on screen for months.
  unknown: 'We could not check your Supply Chain access, so nothing was saved. This is usually temporary — try again in a moment.',
}

function SupplyChainDashboardInner() {
  // ONE entitlement read, two questions. `access === 'active'` gates creating a register, because
  // that is what the database trigger requires; `isPaid` keeps its existing meaning for the export
  // gate further down, which an expired customer still passes.
  const access = useEntitlementAccess('supply-chain')
  const entLoading = access === 'loading'
  const isPaid = access === 'active' || access === 'expired'

  const searchParams = useSearchParams()
  const loadId = searchParams.get('id')

  const [mode, setMode] = useState<'loading' | 'list' | 'wizard'>('loading')
  const [registerId, setRegisterId] = useState<string | null>(null)
  const [registerList, setRegisterList] = useState<Array<{ id: string; name: string; reporting_year: number; supplier_count: number; updated_at: string }>>([])
  const [registerName, setRegisterName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  // Restored in the LAZY INITIALISER, never a useEffect: an effect would paint the empty form,
  // let the visitor start typing, and then overwrite what they typed.
  //
  // A ?id= load skips the draft entirely. The row is the record once one exists, and restoring a
  // draft over it would show the customer work they did somewhere else on top of a register they
  // asked to open.
  const [inventory, setInventory] = useState<SupplyChainInventory>(() =>
    (loadId ? null : readDraft(DRAFT_KEYS.supplyChain, parseSupplyChainDraft)) ?? {
      company: '', reporting_year: defaultReportingYear(new Date(), YEAR_FLOOR),
      frameworks: ['cs3d', 'scope3', 'esrs_s2'],
      currency: 'USD', suppliers: [],
    })
  const [activeSupplier, setActiveSupplier] = useState(0)
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [sortBy, setSortBy] = useState<'risk' | 'spend' | 'name'>('risk')
  const fileRef = useRef<HTMLInputElement>(null)

  // Autosave stops the moment a row exists. From then on the register is the record and the save
  // button is how it changes; a draft written alongside it could later be restored over an edit
  // made in another browser.
  useDraftAutosave(DRAFT_KEYS.supplyChain, inventory, { enabled: !registerId })

  // Decide the initial view: ?id -> wizard (the load effect fetches it); signed out -> wizard;
  // rows exist -> list; none -> blank wizard.
  useEffect(() => {
    if (loadId) { setMode('wizard'); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setMode('wizard'); return }
      const { data } = await supabase
        .from('supply_chain_registers')
        .select('id, name, reporting_year, supplier_count, updated_at')
        .order('updated_at', { ascending: false })
      if (data && data.length > 0) { setRegisterList(data); setMode('list') } else { setMode('wizard') }
    })
  }, [loadId])

  // Load one register. Suppliers are stored as INPUTS ONLY, so every row is put back through
  // scoreSupplier() here — the same rule parseSupplyChainDraft() applies to a draft. Trusting a
  // stored score would show a figure this build would not produce.
  useEffect(() => {
    if (!loadId) return
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data, error } = await supabase
        .from('supply_chain_registers').select('*').eq('id', loadId).maybeSingle()
      if (error) { console.error('Register load failed:', error); return }
      if (!data) return
      const suppliers: Supplier[] = (Array.isArray(data.suppliers) ? data.suppliers : []).map((raw: any) => {
        const base: Supplier = {
          id: String(raw?.id ?? Math.random().toString(36).slice(2)),
          name: String(raw?.name ?? ''), country: String(raw?.country ?? ''), sector: String(raw?.sector ?? ''),
          annual_spend: Number(raw?.annual_spend) || 0, currency: String(raw?.currency ?? data.currency ?? 'USD'),
          tier: (raw?.tier === '2' || raw?.tier === '3') ? raw.tier : '1',
          has_assessment: raw?.has_assessment === true,
          risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
        }
        const scored = scoreSupplier(base)
        return { ...base, risk_level: scored.risk, risk_score: scored.score, risk_factors: scored.factors, scope3_emissions: scored.scope3 }
      })
      setRegisterId(data.id)
      setRegisterName(data.name || '')
      setInventory({
        company: data.company_name || '',
        reporting_year: data.reporting_year ?? defaultReportingYear(new Date(), YEAR_FLOOR),
        frameworks: Array.isArray(data.frameworks) && data.frameworks.length ? data.frameworks : ['cs3d', 'scope3', 'esrs_s2'],
        currency: data.currency || 'USD',
        suppliers,
      })
    })
  }, [loadId])

  const startNewRegister = () => {
    // No navigation: this button only renders in list mode, where there is no ?id to clear, and
    // routing would re-fire the mode effect and land back on the list.
    setRegisterId(null); setRegisterName(''); setSavedAt(null); setSaveError(null); setStep(0)
    setInventory({ company: '', reporting_year: defaultReportingYear(new Date(), YEAR_FLOOR), frameworks: ['cs3d', 'scope3', 'esrs_s2'], currency: 'USD', suppliers: [] })
    setMode('wizard')
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true); setSaveError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setSaveError('Sign in to save this register. Your work is kept in this browser for two hours, so you will not lose it.')
        return
      }

      // The gate is here, on the action, not on the wizard. A refusal leaves every score on screen
      // and the draft intact; the customer loses a click, not their work.
      //
      // `&& !registerId` IS THE EDIT EXEMPTION, and it is what keeps this in step with the database.
      // enforce_supply_chain_entitlement() is BEFORE INSERT only, so an unentitled — including an
      // EXPIRED — customer's UPDATEs are permitted server-side. Refusing them here would have the
      // client enforce a stricter rule than the thing that actually enforces, and would make the
      // expired message a lie: it promises the existing registers are still readable and editable.
      // Same shape as resolveWizardGate()'s `!dealIdParam` exemption in lib/deals/gates.ts.
      if (access !== 'active' && !registerId) {
        setSaveError(access === 'loading'
          ? 'Still checking your access — try again in a moment.'
          : SAVE_REFUSAL[access])
        return
      }
      const trimmed = registerName.trim()
      if (!trimmed) { setSaveError('Give this register a name so you can tell it from the others.'); return }

      const payload = {
        user_id: session.user.id,
        name: trimmed,
        company_name: inventory.company.trim() || null,
        reporting_year: inventory.reporting_year,
        currency: inventory.currency,
        frameworks: inventory.frameworks,
        // INPUTS ONLY. The four derived fields are recomputed on load; storing them would let a
        // saved register assert a score this build would not produce.
        suppliers: inventory.suppliers.map(s => ({
          id: s.id, name: s.name, country: s.country, sector: s.sector,
          annual_spend: s.annual_spend, currency: s.currency, tier: s.tier,
          has_assessment: s.has_assessment,
        })),
        supplier_count: inventory.suppliers.length,
        total_spend: totalSpend,
        updated_at: new Date().toISOString(),
      }

      // No duplicate check. Several registers per reporting year is the design, which is why the
      // table carries no unique constraint and why `name` is required above.
      const { data, error } = registerId
        ? await supabase.from('supply_chain_registers').update(payload).eq('id', registerId).select('id').single()
        : await supabase.from('supply_chain_registers').insert(payload).select('id').single()

      if (error) {
        console.error('Register save failed:', error)
        // PT402 is the entitlement trigger's own refusal. Its sentence is written to be read on
        // its own, so it is surfaced unprefixed — 'Save failed:' in front of copy explaining that
        // saving is unavailable reads as two messages disagreeing. Everything else stays generic:
        // a Postgres error is not customer copy, and an RLS denial in particular must not be shown.
        setSaveError(error.code === 'PT402' ? error.message : 'Could not save this register. Please try again.')
        return
      }
      if (data) setRegisterId(data.id)
      // The draft has been superseded by a row. Clearing it here is what stops a later mount
      // restoring pre-save work over the register that replaced it.
      clearDraft(DRAFT_KEYS.supplyChain)
      setSavedAt(new Date().toLocaleTimeString())
    } finally {
      setSaving(false)
    }
  }

  const update = (field: keyof SupplyChainInventory, value: any) =>
    setInventory(prev => ({ ...prev, [field]: value }))

  const toggleFramework = (fw: Framework) =>
    setInventory(prev => ({
      ...prev,
      frameworks: prev.frameworks.includes(fw)
        ? prev.frameworks.filter(f => f !== fw)
        : [...prev.frameworks, fw],
    }))

  const addSupplier = () => {
    const s = newSupplier()
    setInventory(prev => ({ ...prev, suppliers: [...prev.suppliers, s] }))
    setActiveSupplier(inventory.suppliers.length)
  }

  const updateSupplier = (idx: number, field: keyof Supplier, value: any) => {
    setInventory(prev => {
      const suppliers = [...prev.suppliers]
      suppliers[idx] = { ...suppliers[idx], [field]: value }
      // Auto score
      const result = scoreSupplier(suppliers[idx])
      suppliers[idx] = { ...suppliers[idx], risk_level: result.risk, risk_score: result.score, risk_factors: result.factors, scope3_emissions: result.scope3 }
      return { ...prev, suppliers }
    })
  }

  const removeSupplier = (idx: number) => {
    setInventory(prev => ({ ...prev, suppliers: prev.suppliers.filter((_, i) => i !== idx) }))
    setActiveSupplier(Math.max(0, idx - 1))
  }

  // CSV Import
  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[]
        const suppliers: Supplier[] = []
        const rejected: string[] = []

        rows.forEach((row, i) => {
          // header: true, so data index 0 is the SECOND line of the file. Report the number the
          // customer sees in their spreadsheet, not the array index.
          const line = i + 2
          const sector = String(row['Sector'] || row['sector'] || row['Category'] || '').trim()

          // ⚠️ NO DEFAULT SECTOR, AND THAT IS THE WHOLE POINT OF THIS CHECK. A file with no sector
          // column used to make every row 'Professional Services' — the lowest factor in
          // SECTOR_RISK, against a range topping out 40x higher — producing a complete,
          // confident-looking register priced at the bottom of the scale with nothing on screen
          // saying a substitution had happened. An unrecognised string was quieter still: it reached
          // scoreSupplier's 'Unknown — assess manually' fallback, which prices at 0.5 and does say
          // so, but only in a per-supplier risk-factor list the customer has no reason to re-read
          // after an import they were told nothing about.
          // Object.hasOwn, not `in`: 'constructor' and 'toString' are `in` every object literal.
          if (!sector) {
            rejected.push(`row ${line}: no sector`)
            return
          }
          if (!INDUSTRY_CODES.has(sector)) {
            rejected.push(`row ${line}: "${sector}"`)
            return
          }

          const base: Supplier = {
            id: Math.random().toString(36).slice(2),
            name: row['Supplier'] || row['supplier'] || row['Name'] || row['name'] || '',
            country: row['Country'] || row['country'] || 'Germany',
            sector,
            annual_spend: Number(row['Annual Spend'] || row['annual_spend'] || row['Spend'] || 0),
            currency: row['Currency'] || row['currency'] || 'USD',
            tier: (row['Tier'] || row['tier'] || '1') as '1' | '2' | '3',
            has_assessment: (row['Has Assessment'] || row['has_assessment'] || 'false').toLowerCase() === 'true',
            risk_level: 'low', risk_score: 0, risk_factors: [], scope3_emissions: 0,
          }
          const result = scoreSupplier(base)
          suppliers.push({ ...base, risk_level: result.risk, risk_score: result.score, risk_factors: result.factors, scope3_emissions: result.scope3 })
        })

        if (rejected.length > 0) {
          // Reuses the save banner — the one error surface this page has. Capped at five rows named:
          // a file with no sector column rejects every row, and a 200-line banner is not read.
          const shown = rejected.slice(0, 5).join('; ')
          const more = rejected.length > 5 ? ` and ${rejected.length - 5} more` : ''
          setSaveError(
            `Imported ${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'}. ` +
            `Skipped ${rejected.length} with a sector that is not on the list — ${shown}${more}. ` +
            'Sectors are EXIOBASE industry codes now, such as i01.b for wheat. Pick them from the ' +
            'dropdown, or put the code in the Sector column and upload again.'
          )
        } else {
          setSaveError(null)
        }

        if (suppliers.length > 0) {
          setInventory(prev => ({ ...prev, suppliers }))
          setActiveSupplier(0)
        }
      },
    })
  }

  // Sorted suppliers
  const sortedSuppliers = [...inventory.suppliers].sort((a, b) => {
    if (sortBy === 'risk') return b.risk_score - a.risk_score
    if (sortBy === 'spend') return b.annual_spend - a.annual_spend
    return a.name.localeCompare(b.name)
  })

  // Summary stats
  const critical = inventory.suppliers.filter(s => s.risk_level === 'critical').length
  const high = inventory.suppliers.filter(s => s.risk_level === 'high').length
  // ⚠️ A TOTAL OVER A PARTLY UNPRICED REGISTER IS NOT A TOTAL, AND SUMMING PAST THE NULLS WOULD
  // MAKE IT LOOK LIKE ONE. Same rule the GHG engine already applies to an unpriceable location: it
  // is left out and SAID to be left out, never counted as zero. Until the EXIOBASE resolver is
  // wired in, no supplier has a factor, so unpricedCount is every supplier and totalScope3 is null.
  const unpricedCount = inventory.suppliers.filter(s => s.scope3_emissions === null).length
  const totalScope3 = unpricedCount > 0
    ? null
    : inventory.suppliers.reduce((sum, s) => sum + (s.scope3_emissions ?? 0), 0)
  const totalSpend = inventory.suppliers.reduce((sum, s) => sum + s.annual_spend, 0)
  const needsAssessment = inventory.suppliers.filter(s => !s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high')).length

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Supply Chain Risk & Scope 3 Assessment'],
      ['Company', inventory.company],
      ['Reporting Year', inventory.reporting_year],
      ['Total Suppliers', inventory.suppliers.length],
      ['Total Annual Spend', `${inventory.currency} ${totalSpend.toLocaleString()}`],
      ['Total Scope 3 Cat.1 (estimated)', totalScope3 === null
        ? `Not available — ${unpricedCount} of ${inventory.suppliers.length} suppliers have no spend factor for their sector`
        : `${totalScope3.toFixed(2)} mt CO2e`],
      [''],
      ['SUPPLIER RISK REGISTER'],
      ['Supplier', 'Country', 'Sector', 'Tier', 'Annual Spend', 'Risk Level', 'Risk Score', 'Scope 3 (mt CO2e)', 'Risk Factors', 'Assessment Required'],
      ...inventory.suppliers.map(s => [
        s.name, s.country, `${industryName(s.sector)} (${s.sector})`, s.tier,
        `${s.currency} ${s.annual_spend.toLocaleString()}`,
        RISK_CONFIG[s.risk_level].label, s.risk_score,
        s.scope3_emissions === null ? 'not available' : s.scope3_emissions.toFixed(2),
        s.risk_factors.join(' | '),
        !s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high') ? 'YES' : 'No',
      ]),
      [''],
      ['Generated by ThemisIQ · www.themisiq.co · EU CS3D · ESRS S2 · Scope 3 Cat.1 · EcoVadis · Modern Slavery Act'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${inventory.company}_SupplyChainRisk_${inventory.reporting_year}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation and which supply chain frameworks you need to comply with.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={inputStyle} value={inventory.company} onChange={e => update('company', e.target.value)} placeholder="Acme Corporation" />
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={inputStyle} value={inventory.reporting_year} onChange={e => update('reporting_year', Number(e.target.value))}>
            {reportingYearOptions(new Date(), YEAR_FLOOR).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={inventory.currency} onChange={e => update('currency', e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <label style={labelStyle}>Frameworks to assess against</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(Object.entries(FRAMEWORK_CONFIG) as [Framework, typeof FRAMEWORK_CONFIG[Framework]][]).map(([fw, cfg]) => {
          const selected = inventory.frameworks.includes(fw)
          return (
            <div key={fw} onClick={() => toggleFramework(fw)} style={{ border: `1.5px solid ${selected ? 'var(--color-brand)' : '#e8e7e4'}`, borderRadius: 10, padding: '0.75rem', cursor: 'pointer', background: selected ? '#fff' : '#f8f7f5', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selected ? 'var(--color-brand)' : '#e8e7e4'}`, background: selected ? 'var(--color-brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: selected ? 'var(--color-brand)' : 'var(--color-ink-muted)' }}>{cfg.label}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.4 }}>{cfg.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Supplier list</h2>
      <p style={sectionSub}>Add your suppliers. Upload a CSV from your procurement system or add them manually.</p>

      {/* CSV Import */}
      <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d', marginBottom: 4 }}>Import from procurement system</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>CSV columns: Supplier, Country, Sector, Annual Spend, Currency, Tier (1/2/3), Has Assessment (true/false)</div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} style={{ ...btnPrimary, fontSize: 12, padding: '8px 16px', whiteSpace: 'nowrap' }}>Upload CSV →</button>
        </div>
      </div>

      {/* Supplier tabs */}
      {inventory.suppliers.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
          {inventory.suppliers.map((s, i) => {
            const cfg = RISK_CONFIG[s.risk_level]
            return (
              <button key={s.id} onClick={() => setActiveSupplier(i)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, ...(activeSupplier === i ? toggleOn : toggleOff), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {s.name || `Supplier ${i + 1}`}
                {s.risk_level && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>}
              </button>
            )
          })}
          <button onClick={addSupplier} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer' }}>+ Add supplier</button>
        </div>
      )}

      {/* Supplier form */}
      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', border: '1px dashed #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--color-ink-muted)', marginBottom: 12 }}>No suppliers added yet</div>
          <button onClick={addSupplier} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>+ Add your first supplier</button>
        </div>
      ) : inventory.suppliers[activeSupplier] && (
        <div style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ background: 'var(--color-sunken)', color: 'var(--color-ink)', borderBottom: '2px solid var(--color-ink)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{inventory.suppliers[activeSupplier].name || `Supplier ${activeSupplier + 1}`}</div>
            {inventory.suppliers[activeSupplier].risk_level && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].bg, color: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].color }}>
                {RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].label} RISK
              </span>
            )}
          </div>
          <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Supplier name</label>
              <input style={inputStyle} value={inventory.suppliers[activeSupplier].name} onChange={e => updateSupplier(activeSupplier, 'name', e.target.value)} placeholder="Supplier name" />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].country} onChange={e => updateSupplier(activeSupplier, 'country', e.target.value)}>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Sector</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].sector} onChange={e => updateSupplier(activeSupplier, 'sector', e.target.value)}>
                <option value="">Select sector</option>
                {/* 163 EXIOBASE industries under our 20 display headings. The headings are ours and
                    carry no methodological claim; the names and codes beneath them are EXIOBASE's. */}
                {INDUSTRY_OPTION_GROUPS.map(g => (
                  <optgroup key={g.heading} label={g.heading}>
                    {g.industries.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Annual spend ({inventory.currency})</label>
              <input style={inputStyle} type="number" value={inventory.suppliers[activeSupplier].annual_spend || ''} onChange={e => updateSupplier(activeSupplier, 'annual_spend', Number(e.target.value))} placeholder="0" />
            </div>
            <div>
              <label style={labelStyle}>Supplier tier</label>
              <select style={inputStyle} value={inventory.suppliers[activeSupplier].tier} onChange={e => updateSupplier(activeSupplier, 'tier', e.target.value as '1' | '2' | '3')}>
                <option value="1">Tier 1 — direct supplier</option>
                <option value="2">Tier 2 — supplier's supplier</option>
                <option value="3">Tier 3+ — deeper supply chain</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Sustainability assessment on file?</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ label: 'Yes — EcoVadis, audit, or questionnaire', val: true }, { label: 'No assessment', val: false }].map(opt => (
                  <button key={String(opt.val)} onClick={() => updateSupplier(activeSupplier, 'has_assessment', opt.val)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, ...(inventory.suppliers[activeSupplier].has_assessment === opt.val ? toggleOn : toggleOff), cursor: 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Live risk preview */}
            {inventory.suppliers[activeSupplier].risk_factors.length > 0 && (
              <div style={{ gridColumn: '1 / -1', background: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].bg, border: `1px solid ${RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].border}`, borderRadius: 10, padding: '1rem' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].color, marginBottom: 6 }}>
                  ⚡ Risk score: {inventory.suppliers[activeSupplier].risk_score}/10 — {RISK_CONFIG[inventory.suppliers[activeSupplier].risk_level].label}
                </div>
                {inventory.suppliers[activeSupplier].risk_factors.map((f, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#555553', marginBottom: 3 }}>• {f}</div>
                ))}
                {inventory.suppliers[activeSupplier].scope3_emissions === null ? (
                  <div style={{ fontSize: 11, color: '#92400e', marginTop: 6, lineHeight: 1.6 }}>
                    No spend factor is held for this sector yet, so no Scope 3 Cat.1 estimate is shown.
                    It is not counted as zero, and nothing else you have entered is affected.
                  </div>
                ) : inventory.suppliers[activeSupplier].scope3_emissions > 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--color-brand)', marginTop: 6, fontWeight: 500 }}>Estimated Scope 3 Cat.1: {inventory.suppliers[activeSupplier].scope3_emissions.toFixed(2)} mt CO₂e</div>
                ) : null}
              </div>
            )}
          </div>
          {inventory.suppliers.length > 1 && (
            <div style={{ padding: '0 1.5rem 1rem' }}>
              <button onClick={() => removeSupplier(activeSupplier)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove this supplier</button>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Risk heat map</h2>
      <p style={sectionSub}>Every supplier risk-scored by country, sector, spend concentration and tier. Sorted by priority.</p>

      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No suppliers added — go back to Step 2 to add your suppliers.</div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Critical risk', count: critical, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'High risk', count: high, color: '#B91C1C', bg: '#FCEBEB' },
              { label: 'Need assessment', count: needsAssessment, color: 'var(--color-module-climate)', bg: '#FEF3E2' },
              { label: 'Total suppliers', count: inventory.suppliers.length, color: '#0d0d0d', bg: '#f8f7f5' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} style={{ background: bg, borderRadius: 10, padding: '0.75rem', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 400, color }}>{count}</div>
                <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Sort */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Sort by:</span>
            {[{ val: 'risk', label: 'Risk level' }, { val: 'spend', label: 'Spend' }, { val: 'name', label: 'Name' }].map(s => (
              <button key={s.val} onClick={() => setSortBy(s.val as any)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 99, ...(sortBy === s.val ? toggleOn : toggleOff), cursor: 'pointer' }}>{s.label}</button>
            ))}
          </div>

          {/* Supplier risk table */}
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              {['Supplier', 'Country', 'Sector', 'Risk', 'Spend'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {sortedSuppliers.map((s, i) => {
              const cfg = RISK_CONFIG[s.risk_level]
              return (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < sortedSuppliers.length - 1 ? '0.5px solid #e8e7e4' : 'none', alignItems: 'center', background: s.risk_level === 'critical' ? '#fff5f5' : '#fff' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{s.name || `Supplier ${i + 1}`}</div>
                    {s.risk_factors.length > 0 && <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 2 }}>Tier {s.tier} · {s.risk_factors.length} risk factor{s.risk_factors.length > 1 ? 's' : ''}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: '#555553' }}>{s.country}</div>
                  <div style={{ fontSize: 11, color: '#555553' }}>{industryName(s.sector)}</div>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: cfg.bg, color: cfg.color, border: `0.5px solid ${cfg.border}` }}>{cfg.label}</span>
                    {!s.has_assessment && (s.risk_level === 'critical' || s.risk_level === 'high') && (
                      <div style={{ fontSize: 9, color: '#B91C1C', marginTop: 3, fontWeight: 600 }}>Assessment needed</div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#0d0d0d', fontWeight: 500 }}>{s.annual_spend > 0 ? `${s.currency} ${(s.annual_spend / 1000).toFixed(0)}k` : '—'}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>Scope 3 Cat.1 estimate</h2>
      <p style={sectionSub}>Spend-based Scope 3 Category 1 emissions estimate per supplier using GHG Protocol emission factors by sector.</p>

      {inventory.suppliers.length === 0 ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No suppliers added yet.</div>
      ) : (
        <>
          {/* Total */}
          <div className="tq-summary" data-module="supply" style={{ marginBottom: 20 }}>
            <div className="tq-summary-body">
            <div>
              <div className="tq-summary-label" style={{ marginBottom: 8 }}>Total Scope 3 Category 1 (spend-based estimate)</div>
              <div style={{ fontSize: 11, color: 'var(--color-ink-2)', lineHeight: 1.6 }}>
                GHG Protocol spend-based method · DEFRA/Exiobase sector emission factors<br />
                This is an estimate only — primary data collection from suppliers is the gold standard
              </div>
            </div>
            {totalScope3 === null ? (
              // Same treatment the GHG wizard gives an unpriceable location: the figure is withheld
              // and the withholding is explained, rather than a number appearing that nothing
              // supports. See app/dashboard/ghg/page.tsx, "We can't work out this location's
              // emissions yet".
              <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-module-climate)', marginBottom: 4 }}>⚠ No Scope 3 estimate yet</div>
                <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
                  {unpricedCount === inventory.suppliers.length
                    ? 'No spend factors are held for the sectors in this register yet, so no Scope 3 Cat.1 estimate is shown.'
                    : `${unpricedCount} of ${inventory.suppliers.length} suppliers have no spend factor for their sector, so no register total is shown.`}
                </div>
                <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 4 }}>
                  Nothing is counted as zero, and every supplier, spend figure and risk rating you have entered is unaffected.
                </div>
              </div>
            ) : (
              <div className="tq-summary-figure">{totalScope3.toFixed(1)}<small>mt CO₂e</small></div>
            )}
            </div>
          </div>

          {/* Per supplier */}
          <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
              {['Supplier', 'Sector', 'Annual Spend', 'Scope 3 Est.'].map(h => (
                <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
              ))}
            </div>
            {[...inventory.suppliers].sort((a, b) => (b.scope3_emissions ?? -1) - (a.scope3_emissions ?? -1)).map((s, i) => (
              <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', padding: '12px 16px', borderBottom: i < inventory.suppliers.length - 1 ? '0.5px solid #e8e7e4' : 'none', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{s.name || `Supplier ${i + 1}`}</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{industryName(s.sector)}</div>
                <div style={{ fontSize: 12, color: '#555553' }}>{s.annual_spend > 0 ? `${s.currency} ${s.annual_spend.toLocaleString()}` : '—'}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.scope3_emissions === null ? '#92400e' : s.scope3_emissions > 100 ? '#B91C1C' : s.scope3_emissions > 10 ? 'var(--color-module-climate)' : '#0F6E56' }}>
                  {s.scope3_emissions === null ? 'not available' : s.scope3_emissions > 0 ? `${s.scope3_emissions.toFixed(2)} mt` : '—'}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 4 }}>Next step: primary data collection</div>
            <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>For high-emission suppliers, switch from spend-based to primary data — request actual activity data via the ThemisIQ supplier portal. This improves accuracy and satisfies SB 253, CDP supplier engagement and ESRS E1-6 requirements.</div>
          </div>
        </>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export your assessment</h2>
      <p style={sectionSub}>Download your supplier risk register and spend-based Scope 3 Category 1 estimate.</p>

      <div className="tq-summary" data-module="supply" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1, padding: '20px 24px' }}>
        <div className="tq-summary-label" style={{ marginBottom: 12 }}>Programme summary — {inventory.company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Suppliers', val: inventory.suppliers.length },
            { label: 'Critical/High', val: critical + high, urgent: (critical + high) > 0 },
            { label: 'Scope 3 Cat.1', val: totalScope3 === null ? 'not available' : `${totalScope3.toFixed(1)} mt` },
            { label: 'Need assessment', val: needsAssessment, urgent: needsAssessment > 0 },
          ].map(({ label, val, urgent }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.6rem' : '1rem', fontFamily: typeof val === 'number' ? 'var(--font-display)' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: urgent ? 'var(--color-module-climate)' : 'var(--color-ink)', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {entLoading ? (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: 13 }}>
          Supplier risk register...
        </div>
      ) : isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the supplier data entered is accurate to the best of my knowledge. I understand that ThemisIQ's Scope 3 estimates are spend-based and should be verified with primary data from suppliers.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && generateExport()} style={{ ...(dataConfirmed ? btnStepPrimary : btnStepPrimaryDisabled) }}>
            ⬇ Download Supplier Risk Register (CSV)
          </button>
        </div>
      ) : (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Unlock your full supply chain programme</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 20, lineHeight: 1.6 }}>Download your full supplier risk register — every supplier scored by country, sector and spend — and pull supplier-reported data into your Scope 3 Category 1 calculation.</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing →</a>
        </div>
      )}
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]

  // ── LIST ──────────────────────────────────────────────────────────────────────────────────
  if (mode === 'loading') {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
        <Nav />
        <div style={{ padding: '5rem 2rem', textAlign: 'center' as const, color: 'var(--color-ink-muted)', fontSize: 14 }}>Loading…</div>
      </div>
    )
  }

  if (mode === 'list') {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
        <Nav />
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap' as const, gap: 12 }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', margin: 0 }}>Your registers</h1>
            <button onClick={startNewRegister} style={{ ...btnPrimary, fontSize: 13, padding: '10px 20px' }}>+ New register</button>
          </div>
          {registerList.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '3rem', color: 'var(--color-ink-muted)', fontSize: 14 }}>No registers yet. Click &ldquo;New register&rdquo; to begin.</div>
          ) : (
            registerList.map(r => (
              <a key={r.id} href={`/dashboard/supply-chain?id=${r.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', flexWrap: 'wrap' as const }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d' }}>{r.name || 'Untitled register'}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', marginTop: 3 }}>
                      Reporting year {r.reporting_year} · {r.supplier_count} {r.supplier_count === 1 ? 'supplier' : 'suppliers'} · Updated {new Date(r.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-brand)' }}>Open →</span>
                </div>
              </a>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: 'var(--color-module-supply)', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>EU CS3D applies from {CS3D_APPLIES_FROM} · ESRS S2 active now · SB 253 Scope 3 deadline 2027. Map your supply chain today.</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Supply Chain & Scope 3</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Supplier Risk Register & Scope 3 Assessment</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' as const }}>
            {inventory.suppliers.length > 0 && (
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 2 }}>Suppliers assessed</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d' }}>{inventory.suppliers.length}</div>
              </div>
            )}
            {/* The name is required by the table and is what tells two registers for the same year
                apart, so it sits beside the button rather than buried in step 1. */}
            <input
              value={registerName}
              onChange={e => setRegisterName(e.target.value)}
              placeholder="Register name"
              style={{ ...inputStyle, width: 180, padding: '8px 10px', fontSize: 12 }}
            />
            <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, fontSize: 13, padding: '9px 18px', opacity: saving ? 0.6 : 1, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving…' : registerId ? 'Save changes' : 'Save register'}
            </button>
          </div>
        </div>
      </div>
      {(saveError || savedAt) && (
        <div style={{ background: saveError ? '#FCEBEB' : '#E1F5EE', borderBottom: '0.5px solid #e8e7e4', padding: '10px 2.5rem' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', fontSize: 13, color: saveError ? '#501313' : '#0F6E56', lineHeight: 1.6 }}>
            {saveError ?? `Saved at ${savedAt}.`}
          </div>
        </div>
      )}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2.5rem', overflowX: 'auto' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex' }}>
          {STEP_NAMES.map((name, i) => (
            <button key={i} onClick={() => setStep(i)} style={{ padding: '14px 16px', fontSize: 12, fontWeight: step === i ? 600 : 400, color: step === i ? '#0d0d0d' : 'var(--color-ink-muted)', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#0F6E56' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
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
              <button onClick={() => setStep(s => Math.max(0, s - 1))} style={{ ...(step === 0 ? btnStepDisabled : btnStep) }}>← Back</button>
              {step < STEP_NAMES.length - 1 && <button onClick={() => setStep(s => Math.min(STEP_NAMES.length - 1, s + 1))} style={{ fontSize: 13, fontWeight: 500, padding: '9px 20px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer' }}>Next →</button>}
            </div>
          </div>
          {step < 4 && (
            <div style={{ position: 'sticky', top: 80 }}>
              <div className="tq-summary" data-module="supply" style={{ marginBottom: 12 }}>
                <div style={{ flex: 1, padding: '20px 24px' }}>
                <div className="tq-summary-label" style={{ marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Suppliers', val: inventory.suppliers.length },
                    { label: 'Critical/High risk', val: critical + high, urgent: (critical + high) > 0 },
                    { label: 'Need assessment', val: needsAssessment, urgent: needsAssessment > 0 },
                    { label: 'Scope 3 Cat.1', val: totalScope3 === null ? 'not available' : `${totalScope3.toFixed(1)} mt` },
                    { label: 'Total spend', val: totalSpend > 0 ? `${inventory.currency} ${(totalSpend / 1000000).toFixed(1)}M` : '—' },
                  ].map(({ label, val, urgent }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: urgent && val ? 'var(--color-module-climate)' : 'var(--color-ink)', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
                </div>
              </div>
              {(critical + high) > 0 && (
                <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 12, padding: '1rem', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Priority suppliers</div>
                  <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.6 }}>{critical + high} supplier{critical + high > 1 ? 's' : ''} require enhanced due diligence under CS3D</div>
                </div>
              )}
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}>
                  <strong>EU CS3D · {CS3D_APPLIES_FROM}</strong><br />
                  Risk-based HRDD across your full value chain
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}

// useSearchParams suspends on first paint, so the component that reads it sits inside a boundary.
// Same shape as app/pricing/page.tsx.
export default function SupplyChainDashboard() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Loading…</div>}>
      <SupplyChainDashboardInner />
    </Suspense>
  )
}
