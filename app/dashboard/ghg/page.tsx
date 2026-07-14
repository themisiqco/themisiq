'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'
import { buildMonthlyEmissions } from '../../../lib/ghg/monthlyEmissions'
import { useEntitlement, useHasConcierge, useGhgLocationAllowance } from '../../../lib/useEntitlement'
import { generateAssurancePDF } from '../../../lib/assurancePdf'
import { useSearchParams, useRouter } from 'next/navigation'

import {
  EF_SOURCES,
  US_STATES, US_SUBREGIONS, AU_STATES, EU_COUNTRIES, EU_COUNTRY_OPTIONS,
  GRID_REGIONS_CA, GRID_REGIONS_US, FRAMEWORKS,
  isResolvedGridRegion, getGridFactor, getResidualFactor,
  detectGridRegion, gridRegionForCountry, pickEF, combustionSource,
  calcGas, calcLocation, calcInventory, buildWorkings, emptyLocation,
  applyResolutions, findUnresolvedCoverage, findUndeclaredStreams, STREAM_META,
  ngUnitOptions, normalizeNgUnit, liquidUnitOptions, propaneUnitOptions,
  validateElectricity, validateNaturalGas, validateCompleteness,
  parseLocalDate, periodFromYearAndEnd, analyzeCoverage,
} from '../../../lib/ghg/engine'
import type {
  GwpVersion, Location, Inventory, SourceDoc, ExtractedProposal,
  ConciergeStatus, CoveragePeriod, CoverageResolution, DeclarableStream,
} from '../../../lib/ghg/engine'


interface BotMessage { role: 'user' | 'assistant'; content: string }

function GHGBot({ currentStep }: { currentStep: number }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<BotMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const stepNames = ['framework selection', 'company setup', 'energy & fuel data', 'additional data', 'review & workings', 'export']

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: `Hi! I'm your GHG inventory guide. You're on step ${currentStep + 1}: ${stepNames[currentStep]}. Ask me anything — "What is an Mcf?", "Where do I find my kWh?", "What's Scope 2?"` }])
    }
  }, [open])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages(m => [...m, { role: 'user', content: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/ghg-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a friendly, expert GHG inventory guide built into the ThemisIQ platform. The user is on step ${currentStep + 1} of 6: ${stepNames[currentStep]}. Your job is to help them complete their GHG inventory with confidence, answer questions clearly, and guide them toward completing the assessment if they haven't already.

ABOUT THEMISIQ: ThemisIQ is a compliance platform that helps companies complete GHG inventories for multiple frameworks at once — enter data once, get all reports automatically. The assessment at www.themisiq.co/assess helps companies determine which frameworks apply to them.

FRAMEWORK GUIDANCE:
- SB 253 (CARB): Required for companies with $1B+ global annual revenue AND California nexus (operations, employees, or sales in California). Deadline: November 10, 2026. If unsure whether they qualify, direct them to www.themisiq.co/assess.
- CDP: Voluntary but widely requested by investors and large customers. If a customer or investor has asked them to complete CDP, they need this. Direct undecided users to www.themisiq.co/assess.
- ESRS E1: Mandatory for large EU-incorporated companies under EU CSRD. Deadline was FY2024 for the largest companies. If they have EU operations or are incorporated in the EU, they likely need this.
- GRI 305: Most widely used voluntary emissions standard globally. Used for sustainability reports, supply chain questionnaires, and stakeholder communications. Not mandatory but widely expected by customers and ESG raters.
- EcoVadis: Required when a corporate customer has requested an EcoVadis supplier assessment. If a customer asked them to complete EcoVadis, they need this module.
- IFRS S2: Emerging global standard for climate financial disclosures. Being adopted in Canada, UK, Australia, Singapore, and others. If they file financial statements in these jurisdictions, IFRS S2 may apply.
- Not sure which frameworks apply? Always direct them to: www.themisiq.co/assess — the free 2-minute eligibility assessment.

KEY TECHNICAL FACTS:
- Scope 1 = direct emissions from owned/controlled sources (natural gas, propane, diesel, gasoline, refrigerants)
- Scope 2 = indirect emissions from purchased electricity and steam
- Scope 3 = all other indirect emissions (supply chain, business travel, employee commuting) — not covered in this tool
- Mcf = thousand cubic feet of natural gas (common US utility billing unit)
- Therms = unit of natural gas energy (1 therm = 100,000 BTU)
- MMBtu = million British thermal units of natural gas
- kWh = kilowatt hours of electricity (always shown on utility bills)
- eGRID = US EPA electricity grid regions with different emission factors
- AR4 GWP = IPCC 4th Assessment Report global warming potentials (selectable alternate; not the default basis)
- AR5 GWP = IPCC 5th Assessment Report (selectable alternate; not the default basis)
- AR6 GWP = IPCC 6th Assessment Report global warming potentials (ThemisIQ's default basis, applied across all frameworks)
- Location-based Scope 2 = uses grid average emission factors
- Market-based Scope 2 = accounts for renewable energy certificates (RECs) and PPAs
- PPA = Power Purchase Agreement (contract for renewable electricity)
- REC = Renewable Energy Certificate (proves renewable electricity was generated)
- Organizational boundary = which entities/facilities are included (operational control is most common)

COMMON QUESTIONS AND ANSWERS:
- "What's California nexus?" = Having operations, employees, customers, or sales in California. Even one employee working remotely in California can create nexus.
- "Our revenue is just under $1B" = SB 253 threshold is $1B+ global revenue. If under, you likely don't need to file but should monitor as thresholds may change.
- "What if I miss the November 10 deadline?" = CARB can impose penalties. ThemisIQ can help you file on time — the wizard takes about 20 minutes with bills in hand.
- "Operational vs financial control?" = Operational control means you include facilities where you control operations. Financial control means you include entities where you have financial control. Most companies use operational control.
- "Do I include subsidiaries?" = Under operational control, yes — include any facility your company operates. Under equity share, include proportional to ownership.
- "What if our landlord pays electricity?" = If you don't pay the utility bill directly, you may not have access to the data. Request consumption data from your landlord or property manager — this is increasingly common and often required.
- "Do leased vehicles count?" = Yes, if your company pays for the fuel and controls the vehicle operations, include them in Scope 1 mobile combustion.
- "What about employee personal vehicles?" = Personal vehicles used for business travel are Scope 3, not covered in this tool.
- "We have rooftop solar — how do I handle it?" = Electricity you generate and consume on-site is not Scope 2 (it's not purchased). Only purchased grid electricity goes in Scope 2.
- "What if I don't have 12 months of bills?" = Use what you have and annualize (e.g. 9 months of data × 12/9). Note this in your workings.
- "Multiple meters at one location?" = Add them all together for that location's total.
- "What's the difference between stationary and mobile diesel?" = Stationary = diesel in generators, boilers, heating equipment that doesn't move. Mobile = diesel in vehicles and mobile equipment.
- "Which GWP basis does ThemisIQ use?" = ThemisIQ applies IPCC AR6 (2021) global warming potentials by default across all frameworks; AR4 and AR5 remain available as selectable alternates. The IPCC revises these values between assessments — methane's 100-year GWP is 25 under AR4 and roughly 28-30 under AR5 and AR6 — but for most companies the difference is small.
- "What's an intensity ratio?" = Emissions per unit of economic output (e.g. mtCO2e per $million revenue). Allows comparison across companies of different sizes.
- "Do I need a third-party verifier?" = SB 253 requires limited assurance from an accredited verifier. ThemisIQ's assurance-ready export is designed to make that process faster and cheaper.
- "Can I submit the CSV directly to CARB?" = The CSV is your working document. CARB will have a specific submission portal — ThemisIQ's export gives you all the data you need to complete that submission.
- "What does assurance-ready mean?" = Your inventory includes cited emission factors, documented calculation workings, and source document uploads — everything a third-party verifier needs to review your numbers.

Always be encouraging, concise, and jargon-free. If someone seems confused about which frameworks they need, always suggest www.themisiq.co/assess. Never make up regulatory deadlines or requirements you're not sure about.
`,
          messages: [...messages, { role: 'user', content: userMsg }].map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const reply = data.content?.map((c: any) => c.text || '').join('') || 'Sorry, try again.'
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 1000, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(116,37,227,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
        {open ? '✕' : '💬'}
      </button>
      {open && (
        <div style={{ position: 'fixed', bottom: 92, right: 24, zIndex: 1000, width: 360, height: 480, background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', border: '0.5px solid #e8e7e4', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '0.5px solid #e8e7e4', background: 'linear-gradient(135deg,#7425e3,#1fb1ff)', borderRadius: '16px 16px 0 0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>ThemisIQ Guide</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>Step {currentStep + 1}: {stepNames[currentStep]}</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%', background: msg.role === 'user' ? '#7425e3' : '#f8f7f5', color: msg.role === 'user' ? '#fff' : '#0d0d0d', borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' as const }}>
                {msg.content}
              </div>
            ))}
            {loading && <div style={{ alignSelf: 'flex-start', background: '#f8f7f5', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', fontSize: 12, color: '#888784' }}>Thinking...</div>}
            <div ref={messagesEndRef} />
          </div>
          <div style={{ padding: '0.75rem', borderTop: '0.5px solid #e8e7e4', display: 'flex', gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Ask anything about your GHG inventory..." style={{ flex: 1, fontSize: 12, padding: '8px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none' }} />
            <button onClick={sendMessage} disabled={loading || !input.trim()} style={{ fontSize: 12, padding: '8px 14px', borderRadius: 8, background: '#7425e3', color: '#fff', border: 'none', cursor: 'pointer', opacity: loading || !input.trim() ? 0.5 : 1 }}>→</button>
          </div>
        </div>
      )}
    </>
  )
}

function PaywallOverlay({ frameworks }: { frameworks: string[] }) {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 10, backdropFilter: 'blur(8px)', background: 'rgba(248,247,245,0.85)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '2.5rem', boxShadow: '0 8px 40px rgba(0,0,0,0.12)', border: '0.5px solid #e8e7e4', maxWidth: 480, textAlign: 'center' as const }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>Your GHG inventory is complete.</div>
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 300 }}>Your Scope 1 and Scope 2 emissions have been calculated to {frameworks.join(', ')} standards, with full calculation workings ready for third-party assurance. Unlock your submission-ready reports with one click.</div>
        <div style={{ background: '#f8f7f5', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' as const }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What you unlock</div>
          {[
            'Submission-ready reports for all selected frameworks',
            'Assurance-ready evidence uploads per emission source',
            'Full calculation workings export (ISO 14064-3)',
            'Unlimited updates throughout your reporting year',
            'Priority support through your filing deadline',
          ].map(text => (
            <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#7425e3', flexShrink: 0, marginTop: 6 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = '/signup?upgrade=true'} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 10, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d' }}>
          Unlock My Reports →
        </button>
        <div style={{ fontSize: 11, color: '#888784', marginBottom: 12 }}>Secure payment · Instant access · Cancel anytime</div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' as const, borderTop: '0.5px solid #e8e7e4', paddingTop: 12 }}>
          {['Your data is encrypted', 'Never sold or shared', 'PIPEDA compliant', 'Not used to train AI'].map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#64fe3e', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#888784' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 

function LockedDocUpload({ label }: { label: string }) {
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '10px 14px', opacity: 0.7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
        <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', color: '#888784' }}>🔒 Paid plan</span>
      </div>
      <div style={{ fontSize: 11, color: '#888784', marginTop: 6, fontWeight: 300 }}>Evidence uploads are available on paid plans — keeping your inventory assurance-ready for third-party verification.</div>
    </div>
  )
}
function GHGPage() {
  const [step, setStep] = useState(0)
const searchParams = useSearchParams()
  const router = useRouter()
  const pack = searchParams.get('pack')
  const packFrameworks: Record<string, string[]> = {
    supplier: ['gri', 'ecovadis'],
    climate: ['ifrs', 'cdp'],
    foundation: ['gri', 'esrs'],
    investor: ['cdp', 'ifrs'],
  }
  const packNames: Record<string, string> = {
    supplier: 'Supplier Readiness',
    climate: 'Climate Readiness',
    foundation: 'ESG Foundation',
    investor: 'Investor ESG',
  }
  const defaultFrameworks = pack && packFrameworks[pack] ? packFrameworks[pack] : ['sb253']
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '', company_id: null, reporting_year: 2024, revenue_millions: 0, employee_count: 0,
    boundary_approach: 'operational_control', california_nexus: false,
    fiscal_year_end_month: 12,
    coverage_resolutions: [],
    prior_year_s1: 0, prior_year_s2: 0,
    selected_frameworks: defaultFrameworks,
    locations: [emptyLocation('1', 'Location 1')],
  })
  const [activeLocation, setActiveLocation] = useState(0)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const skipSavedReset = useRef(true)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showWorkings, setShowWorkings] = useState<Record<string, boolean>>({})
  const [activeExport, setActiveExport] = useState('sb253')
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [mode, setMode] = useState<'loading' | 'list' | 'wizard'>('loading')
  const [inventoryList, setInventoryList] = useState<Array<{ id: string; company_name: string; reporting_year: number; updated_at: string }>>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [addingNewCompany, setAddingNewCompany] = useState(false)
  const isPaid = useEntitlement('ghg')
  const CONCIERGE_DEV = useHasConcierge()   // concierge gate: true when the customer holds any concierge tier entitlement
  const { allowance: locationAllowance, loading: allowanceLoading } = useGhgLocationAllowance()
  const [showLocationWall, setShowLocationWall] = useState(false)

  // Decide initial view: ?id -> wizard (loads that one); else if user has inventories -> list; else -> blank wizard
  useEffect(() => {
    const loadId = searchParams.get('id')
    const viewParam = searchParams.get('view')
    if (loadId) { setMode('wizard'); return }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { setMode('wizard'); return }
      const { data } = await supabase
        .from('ghg_inventories')
        .select('id, company_name, reporting_year, updated_at')
        .order('updated_at', { ascending: false })
      if (data && data.length > 0) {
        // Trends-first: existing inventories land on trends, UNLESS ?view=list
        // (the explicit "manage inventories" escape hatch — avoids a redirect
        // loop with the trends page's back-to-inventory link).
        if (viewParam === 'list') {
          setInventoryList(data)
          setMode('list')
        } else {
          router.replace('/dashboard/ghg/trends')
          return
        }
      } else {
        setMode('wizard')
      }
    })
  }, [searchParams])

  // Load the user's companies for the select-or-create company field.
  const loadCompanies = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('companies').select('id, name').order('name')
    setCompanies(data ?? [])
  }
  useEffect(() => { loadCompanies() }, [])

  const startNewInventory = () => {
    // Do NOT navigate here. router.replace('/dashboard/ghg') would strip ?view=list, re-firing the
    // [searchParams] mode effect, which redirects existing-inventory users to /trends and clobbers the
    // setMode('wizard') below (the "button does nothing" bug). This button only renders in list mode,
    // where no ?id is present, so there's no stale ?id to clear — switching mode in state is enough.
    setInventoryId(null)
    setSaved(false)
    setDirty(false) // fresh inventory is pristine until the user types
    setStep(0)
    setInventory({
      company_name: '', company_id: null, reporting_year: 2024, revenue_millions: 0, employee_count: 0,
      boundary_approach: 'operational_control', california_nexus: false,
      fiscal_year_end_month: 12,
      coverage_resolutions: [],
      prior_year_s1: 0, prior_year_s2: 0,
      selected_frameworks: defaultFrameworks,
      locations: [emptyLocation('1', 'Location 1')],
    })
    setMode('wizard')
  }

  useEffect(() => {
    if (skipSavedReset.current) { skipSavedReset.current = false; return }
    setSaved(false)
    setDirty(true)
  }, [inventory])
  useEffect(() => {
    if (mode !== 'wizard' || !dirty) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, mode])
  useEffect(() => {
    const loadId = searchParams.get('id')
    if (!loadId) return  // no id -> start clean (no auto-load of a random inventory)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { return }
      const { data, error } = await supabase
        .from('ghg_inventories')
        .select('*')
        .eq('id', loadId)
        .maybeSingle()
      if (error) { console.error('Load failed:', error); return }
      if (data) {
       skipSavedReset.current = true 
        setInventoryId(data.id)
        setInventory(inv => ({
          ...inv,
          company_name: data.company_name || '',
          company_id: data.company_id || null,
          reporting_year: data.reporting_year || inv.reporting_year,
          fiscal_year_end_month: data.fiscal_year_end_month || 12,
          coverage_resolutions: data.coverage_resolutions || [],
          revenue_millions: data.revenue_millions || 0,
          employee_count: data.employee_count || 0,
          boundary_approach: data.boundary_approach || 'operational_control',
          california_nexus: data.california_nexus || false,
          prior_year_s1: data.prior_year_s1 || 0,
          prior_year_s2: data.prior_year_s2 || 0,
          selected_frameworks: data.selected_frameworks || ['sb253'],
          locations: data.locations_data || inv.locations,
        }))
        setSaved(true)
        setDirty(false)
      }
    })
  }, [searchParams])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      locs[idx] = { ...locs[idx], [field]: value }
     if (field === 'state') locs[idx].grid_region = detectGridRegion(value, locs[idx].country) // US states → US_<ST>; AU states → AU_<region>
if (field === 'province') locs[idx].grid_region = value // Canadian provinces map directly
      if (field === 'country') {
        locs[idx].natural_gas_unit = normalizeNgUnit(value, locs[idx].natural_gas_unit) as any
        // UK, EU and NZ grids are national — set grid_region directly from the country.
        // (AU returns '' here and resolves on the state pick; US resolves on the state pick.)
        const gr = gridRegionForCountry(value)
        // UK/EU/NZ resolve immediately; US/CA/AU/OTHER need a state/province pick — CLEAR any prior
        // region so a country switch can't leave a stale wrong-country factor (e.g. US_CA on an AU loc).
        if (gr) locs[idx].grid_region = gr
        else locs[idx].grid_region = ''
        // Metric countries (CA, UK, EU, AU, NZ) default liquid fuels to litres; US/other keep gallons.
        // NZ LPG is the exception — MfE publishes it per kg, so propane defaults to kg for NZ.
        const ctryUp = (value || '').toUpperCase().trim()
        const metric = ctryUp === 'CA' || ctryUp === 'GB' || ctryUp === 'UK' || ctryUp === 'AU' || ctryUp === 'NZ' || EU_COUNTRIES.includes(ctryUp)
        if (metric) {
          locs[idx].propane_unit = ctryUp === 'NZ' ? 'kg' : 'litres'
          locs[idx].diesel_stationary_unit = 'litres'
          locs[idx].gasoline_unit = 'litres'
          locs[idx].diesel_mobile_unit = 'litres'
        }
      }
      return { ...inv, locations: locs }
    })
  }

  const addLocation = () => {
    if (locationAllowance != null && !allowanceLoading && inventory.locations.length >= locationAllowance) { setShowLocationWall(true); return }
    const id = String(inventory.locations.length + 1)
    setInventory(inv => ({ ...inv, locations: [...inv.locations, emptyLocation(id, `Location ${id}`)] }))
    setActiveLocation(inventory.locations.length)
  }

  const toggleFramework = (id: string) => {
    setInventory(inv => ({
      ...inv,
      selected_frameworks: inv.selected_frameworks.includes(id)
        ? inv.selected_frameworks.filter(f => f !== id)
        : [...inv.selected_frameworks, id]
    }))
  }

  const handleFileUpload = async (files: FileList, locIdx: number, docType: string) => {
    if (!files.length) return
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }
    for (const file of Array.from(files)) {
      const path = `${session.user.id}/${inventory.reporting_year}/${inventory.locations[locIdx].name.replace(/\s+/g, '_')}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('source-documents').upload(path, file)
      if (!error) {
        const doc: SourceDoc = { id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, file_name: file.name, document_type: docType, uploaded_at: new Date().toISOString(), file_path: path }

        // ── Concierge step 5: read bill, convert via lib (single source of truth), attach proposals to the doc. No field write yet. ──
        // Refrigerant service records are deliberately NOT concierge-read (judgment, Tier-2/3).
        if (CONCIERGE_DEV && docType !== 'service_record') {
          try {
  const res = await fetch('/api/concierge/extract', {
              method: 'POST',
              headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
              body: JSON.stringify({ filePath: doc.file_path, mediaType: file.type, locationName: inventory.locations[locIdx].name }),
            })
            const json = await res.json()
            if (json?.success && Array.isArray(json.fields)) {
              const { convertToCanonical } = await import('../../../lib/unitConversions')
              const knownFuels = ['electricity', 'natural_gas', 'propane', 'diesel', 'gasoline']
              doc.extracted = json.fields
                .filter((f: any) => f && f.value != null && knownFuels.includes(f.fuelType))
                .map((f: any): ExtractedProposal => {
                  const conv = convertToCanonical(f.fuelType, f.value, f.unit)
                  const needsReview = conv.tier === 3 || f.confidence === 'low'
                  return {
                    fuelType: f.fuelType,
                    rawValue: f.value,
                    rawUnit: f.unit ?? null,
                    value: conv.value,
                    unit: conv.unit,
                    conversionNote: conv.conversionNote,
                    periodStart: f.periodStart ?? null,
                    periodEnd: f.periodEnd ?? null,
                    periodConfidence: f.periodConfidence ?? null,
                    confidence: f.confidence,
                    sourceQuote: f.sourceQuote ?? null,
                    notes: f.notes ?? null,
                    status: needsReview ? 'needs_manual_review' : 'extracted',
                  }
                })
              console.log('[concierge step5] proposals on doc:', doc.extracted)
            }
          } catch (e) {
            console.error('[concierge extract] failed', e)
          }
        }

        // Store the doc (with any proposals) in one functional update — avoids stale-closure append bug on multi-file upload.
        setInventory(inv => {
          const locs = [...inv.locations]
          locs[locIdx] = { ...locs[locIdx], source_docs: [...locs[locIdx].source_docs, doc] }
          return { ...inv, locations: locs }
        })
      }
    }
    setUploading(false)
  }

  const removeDoc = async (locIdx: number, docId: string, filePath: string) => {
    await supabase.storage.from('source-documents').remove([filePath])
    updateLocation(locIdx, 'source_docs', inventory.locations[locIdx].source_docs.filter(d => d.id !== docId))
  }

  // Concierge: update one proposal, then recompute mapped inventory fields from ALL confirmed proposals at this location.
  // fuelType + docType -> field(s). Write = SUM of confirmed proposals mapping to that field.
  // Mixed units for one field are NOT summed (would be wrong) -> those proposals flip to needs_manual_review.
  const updateProposal = (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => {
    setInventory(inv => {
      const locs = [...inv.locations]

      // 1. Apply the patch to the target proposal.
      let docs = locs[locIdx].source_docs.map(d => {
        if (d.id !== docId || !d.extracted) return d
        return { ...d, extracted: d.extracted.map((p, i) => i === propIdx ? { ...p, ...patch } : p) }
      })

      // 2. applyResolutions is the ONE implementation of what each field's figure is (shared with
      //    buildWorkings). It gathers confirmed proposals, sums, and applies any coverage resolution.
      const loc: any = { ...locs[locIdx], source_docs: docs }
      const win = periodFromYearAndEnd(inv.reporting_year, inv.fiscal_year_end_month)
      const applied = applyResolutions(loc, inv.coverage_resolutions ?? [], win.start, win.end)

      // 3. Write each field. Mixed units -> don't write; flag those proposals for review.
      const flagged: { docId: string; pi: number }[] = []
      Object.values(applied).forEach(a => {
        if (a.mixedUnits) { flagged.push(...a.refs); return }
        loc[a.field] = a.value
        if (a.unitField && a.unit != null) loc[a.unitField] = a.unit
      })

      // 4. If any field had mixed units, flip those proposals to needs_manual_review.
      if (flagged.length) {
        docs = docs.map(d => {
          if (!d.extracted) return d
          return { ...d, extracted: d.extracted.map((p, pi) => flagged.some(f => f.docId === d.id && f.pi === pi) ? { ...p, status: 'needs_manual_review' as ConciergeStatus } : p) }
        })
      }

      loc.source_docs = docs
      locs[locIdx] = loc
      return { ...inv, locations: locs }
    })
    }
    // Write a coverage resolution (gap/overlap/straddle) onto the inventory. Re-resolving the
  // same fuel+location+kind overwrites the prior one. The extrapolation gross-up is applied
  // in updateProposal's field-write step; here we also nudge a re-derivation by re-confirming
  // an existing confirmed proposal so totals refresh immediately.
  const addCoverageResolution = (res: CoverageResolution) => {
    setInventory(inv => {
      const existing = (inv.coverage_resolutions ?? []).filter(
        r => !(r.locId === res.locId && r.fuelType === res.fuelType && r.kind === res.kind))
      // Re-derive affected fields so an extrapolation applies right away. We recompute the
      // same byField sum used in updateProposal, now that the resolution is present.
      const resolutions = [...existing, res]
      const win = periodFromYearAndEnd(inv.reporting_year, inv.fiscal_year_end_month)
      const locs = inv.locations.map(loc => {
        if (loc.id !== res.locId) return loc
        const next: any = { ...loc }
        // Same single implementation as updateProposal — no copy-pasted gross-up logic.
        Object.values(applyResolutions(loc, resolutions, win.start, win.end)).forEach(a => {
          if (a.mixedUnits) return
          next[a.field] = a.value
          if (a.unitField && a.unit != null) next[a.unitField] = a.unit
        })
        return next
      })
      return { ...inv, coverage_resolutions: resolutions, locations: locs }
    })
  }
  const needsMarketBased = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')
  // Concierge export gate: block export while any proposal is unconfirmed ('extracted') or flagged ('needs_manual_review').
  // No proposals (manual-entry users) -> trivially ready. Coverage-completeness is a separate check (step 9b).
  const conciergePending = inventory.locations.flatMap(l => l.source_docs).flatMap(d => d.extracted ?? []).filter(p => p.status === 'extracted' || p.status === 'needs_manual_review')
  // Coverage gate (step 9b) — pure engine function. Per location × document_type, run analyzeCoverage
  // and flag any gap/overlap/straddle lacking a matching resolution. conciergeReady composes over it.
  const coverageResolutions = inventory.coverage_resolutions ?? []
  const unresolvedCoverage = findUnresolvedCoverage(inventory.locations, inventory.reporting_year, inventory.fiscal_year_end_month, coverageResolutions)
  const conciergeReady = conciergePending.length === 0 && unresolvedCoverage.length === 0
  // Grid-region gate: locations whose grid_region isn't a real GRID_EF key (us_average default, '',
  // or an unmapped country) — these silently fall back to US_AVG in getGridFactor. Consumed by the
  // step-2 advance + export gates and the UI prompt (sub-steps D/E). Pure derivation, no behaviour here.
  const unresolvedGridLocations = inventory.locations
    .map((l, i) => ({ i, name: l.name || `Location ${i + 1}`, region: l.grid_region }))
    .filter(l => !isResolvedGridRegion(l.region))
  const gridReady = unresolvedGridLocations.length === 0
  // Completeness gate (COMPOSED with, never folded into, the coverage gate). A stream with neither data
  // nor an explicit attestation is UNDECLARED — absence must not export as an attested zero. Remedy is
  // data or attestation, NOT acknowledgement (unlike a coverage gap). Gated at the same four sites as
  // gridReady, with its own amber message; deliberately NOT gating the step-2 Continue.
  const undeclaredStreams = findUndeclaredStreams(inventory.locations)
  const declarationsReady = undeclaredStreams.length === 0
  const needsPriorYear = inventory.selected_frameworks.includes('cdp')
  const needsEmployees = inventory.selected_frameworks.includes('ecovadis')
  const needsBiogenic = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')

  const totals_ar4 = calcInventory(inventory.locations, 'AR4', inventory.reporting_year)
  const totals_ar5 = calcInventory(inventory.locations, 'AR5', inventory.reporting_year)
  const totals_ar6 = calcInventory(inventory.locations, 'AR6', inventory.reporting_year)
  const totalsByGwp: Record<GwpVersion, typeof totals_ar4> = { AR4: totals_ar4, AR5: totals_ar5, AR6: totals_ar6 }

  const STEPS = ['Reporting frameworks', 'Company setup', 'Energy & fuel data', 'Additional data', 'Review & workings', 'Export reports', 'Audit trail']
  const activeFrameworks = FRAMEWORKS.filter(f => inventory.selected_frameworks.includes(f.id))
  // Lock the company field once an inventory is saved AND linked to a company.
  const companyLocked = !!inventoryId && !!inventory.company_id

  const handleSave = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // Resolve the company_id for this inventory's company_name.
    let resolvedCompanyId = inventory.company_id || null
    const trimmedName = (inventory.company_name || '').trim()
    if (!resolvedCompanyId && trimmedName) {
      // look up an existing company by (user_id, name); reuse if present
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('name', trimmedName)
        .maybeSingle()
      if (existing) {
        resolvedCompanyId = existing.id
      } else {
        const { data: created, error: cErr } = await supabase
          .from('companies')
          .insert({ user_id: session.user.id, name: trimmedName })
          .select('id')
          .single()
        if (cErr) { alert('Could not save company: ' + cErr.message); return }
        resolvedCompanyId = created.id
      }
    }
    const payload = {
      user_id: session.user.id,
      reporting_year: inventory.reporting_year,
      fiscal_year_end_month: inventory.fiscal_year_end_month,
      company_name: inventory.company_name,
      company_id: resolvedCompanyId,
      revenue_millions: inventory.revenue_millions,
      employee_count: inventory.employee_count,
      boundary_approach: inventory.boundary_approach,
      california_nexus: inventory.california_nexus,
      prior_year_s1: inventory.prior_year_s1,
      prior_year_s2: inventory.prior_year_s2,
      selected_frameworks: inventory.selected_frameworks,
      locations_data: inventory.locations,
      scope1_total: totals_ar6.s1_total,
      scope2_location_total: totals_ar6.s2_location,
      scope2_market_total: totals_ar6.s2_market,
      scope1_intensity: inventory.revenue_millions > 0 ? totals_ar6.s1_total / inventory.revenue_millions : 0,
      scope2_intensity: inventory.revenue_millions > 0 ? totals_ar6.s2_location / inventory.revenue_millions : 0,
      gwp_version: 'AR6',
      status: 'draft',
workings: buildWorkings(inventory.locations, 'AR6', inventory.reporting_year, coverageResolutions, inventory.fiscal_year_end_month),
      updated_at: new Date().toISOString(),
    }
    let savedId: string | null = inventoryId
    if (inventoryId) {
      const { error } = await supabase.from('ghg_inventories').update(payload).eq('id', inventoryId)
      if (error) { alert('Save failed: ' + error.message); console.error(error); return }
    } else {
      const dupQuery = supabase.from('ghg_inventories').select('id').eq('reporting_year', inventory.reporting_year)
      const { data: dup } = await (resolvedCompanyId ? dupQuery.eq('company_id', resolvedCompanyId) : dupQuery.eq('company_name', inventory.company_name)).maybeSingle()
      if (dup) { alert(`You already have a ${inventory.reporting_year} inventory for "${inventory.company_name}". Open it from "Your inventories" instead of creating a duplicate.`); return }
      const { data, error } = await supabase.from('ghg_inventories').insert(payload).select().single()
      if (error) { alert('Save failed: ' + error.message); console.error(error); return }
      if (data) { savedId = data.id; setInventoryId(data.id) }
      loadCompanies() // refresh dropdown in case resolve-or-create added a new company
    }
    // Additive monthly-emissions write. Annual save above is already committed and
    // authoritative; a monthly failure here must NOT escape or skip setSaved(true).
    try {
      if (savedId) {
        const { slices } = buildMonthlyEmissions(
          inventory.locations as any,   // source_docs[].extracted[] live on these
          inventory.reporting_year,
          { calcGas, pickEF, getGridFactor, isResolvedGridRegion },
          'AR6'
        )
        // idempotent: replace this inventory's monthly rows
        const del = await supabase.from('ghg_monthly_emissions').delete().eq('inventory_id', savedId)
        if (del.error) throw del.error
        if (slices.length > 0) {
          const rows = slices.map(s => ({
            user_id: session.user.id,
            inventory_id: savedId,
            company_id: resolvedCompanyId,
            reporting_year: s.reporting_year,
            period_month: s.period_month,
            scope: s.scope,
            location_name: s.location_name,
            fuel_type: s.fuel_type,
            activity_value: s.activity_value,
            activity_unit: s.activity_unit,
            tco2e: s.tco2e,
            gwp_version: s.gwp_version,
            ef_source: s.ef_source,
            source_doc_id: null,
            period_start: s.period_start,
            period_end: s.period_end,
            pct_in_month: s.pct_in_month,
          }))
          const ins = await supabase.from('ghg_monthly_emissions').insert(rows)
          if (ins.error) throw ins.error
        }
      }
    } catch (e) {
      console.error('Monthly emissions write failed (annual save committed, unaffected):', e)
    }
    setSaved(true)
    setDirty(false)
    } finally { setIsSaving(false) }
  }

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Which reporting frameworks do you need?</h2>
      {pack && packNames[pack] ? (
        <p style={sectionSub}>Based on your <strong style={{ color: '#0F6E56', fontWeight: 600 }}>{packNames[pack]}</strong> selection, these are the reports you need — the highlighted frameworks below are included in your package. You can add others any time.</p>
      ) : (
        <p style={sectionSub}>Select all that apply. ThemisIQ collects your data once and generates each report automatically — no duplicate entry required.</p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        {FRAMEWORKS.map(fw => {
          const selected = inventory.selected_frameworks.includes(fw.id)
          return (
            <div key={fw.id} onClick={() => toggleFramework(fw.id)} style={{ background: selected ? fw.bg : '#fff', border: selected ? '3px solid #0F6E56' : '1.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s', opacity: selected ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, border: `0.5px solid ${fw.color}33`, borderRadius: 6, padding: '2px 8px', marginBottom: 6 }}>{fw.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw.full}</div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${selected ? '#0F6E56' : '#e8e7e4'}`, background: selected ? '#0F6E56' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, fontWeight: 300, marginBottom: 8 }}>{fw.desc}</div>
              <div style={{ fontSize: 11, color: fw.color, fontWeight: 500 }}>Deadline: {fw.deadline} · GWP: {fw.gwp}</div>
            </div>
          )
        })}
      </div>
      {inventory.selected_frameworks.length > 0 && (
        <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Selected: {activeFrameworks.map(f => f.name).join(' · ')}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 300, lineHeight: 1.6 }}>
            ThemisIQ will collect your data once and produce {inventory.selected_frameworks.length} report{inventory.selected_frameworks.length > 1 ? 's' : ''}.
            {needsMarketBased && ' ESRS/GRI requires market-based Scope 2 — we\'ll ask about renewable energy contracts.'}
            {needsPriorYear && ' CDP requires prior year comparison figures.'}
            {needsBiogenic && ' ESRS/GRI requires biogenic CO₂ to be reported separately.'}
          </div>
        </div>
      )}
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Company & inventory setup</h2>
      <p style={sectionSub}>This information appears across all your selected reports. Enter it once here.</p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 560 }}>
        <Field label="Company legal name" hint="Appears on all report submissions">
          {companyLocked ? (
            <>
              <input value={inventory.company_name} readOnly style={{ ...inputStyle, background: '#f8f7f5', color: '#888784', cursor: 'not-allowed' }} />
              <div style={{ fontSize: 11, color: '#888784', marginTop: 6 }}>Linked company — set when this inventory was created.</div>
            </>
          ) : (addingNewCompany || companies.length === 0) ? (
            <>
              <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value, company_id: null}))} placeholder="e.g. Acme Industries Inc." style={inputStyle} />
              {companies.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  <button
            type="button"
            onClick={() => setAddingNewCompany(false)}
            style={{ background: 'none', border: 'none', padding: 0, color: '#0F6E56', cursor: 'pointer', fontSize: 11, font: 'inherit' }}
          >← choose an existing company</button>
                </div>
              )}
            </>
          ) : (
            <select
              value={inventory.company_id ?? ''}
              onChange={e => {
                const v = e.target.value
                if (v === '__new__') { setAddingNewCompany(true); setInventory(i => ({...i, company_id: null, company_name: ''})) }
                else if (v) { const c = companies.find(c => c.id === v); if (c) setInventory(i => ({...i, company_id: c.id, company_name: c.name})) }
              }}
              style={inputStyle}
            >
              <option value="">Select a company…</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new__">+ Add a new company</option>
            </select>
          )}
        </Field>
        <Field label="Reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            {[2023, 2024, 2025].map(yr => (
              <option key={yr} value={yr}>{`FY${yr} · ${periodFromYearAndEnd(yr, inventory.fiscal_year_end_month).label}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Fiscal year-end" hint="Most organizations report on the calendar year. Change this only if your reporting year ends in a month other than December.">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555553', cursor: 'pointer' }}>
              <input type="checkbox" checked={inventory.fiscal_year_end_month === 12} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: e.target.checked ? 12 : 3}))} />
              Calendar year (Jan–Dec)
            </label>
            {inventory.fiscal_year_end_month !== 12 && (
              <select value={inventory.fiscal_year_end_month} onChange={e => setInventory(i => ({...i, fiscal_year_end_month: Number(e.target.value)}))} style={{ ...inputStyle, maxWidth: 260 }}>
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((mn, idx) => (
                  <option key={idx + 1} value={idx + 1}>{`Fiscal year ends in ${mn}`}</option>
                ))}
              </select>
            )}
          </div>
        </Field>
        <Field label="Global annual revenue (USD)" hint="Required by CARB SB 253, CDP, ESRS E1, EcoVadis, and IFRS S2 for emission intensity calculations">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            {/* User types RAW dollars; we store millions (revenue_millions stays millions for all consumers). Round the display to kill float artifacts on sub-million values (e.g. 0.4 * 1e6). */}
            <input type="number" value={inventory.revenue_millions ? Math.round(inventory.revenue_millions * 1_000_000) : ''} onChange={e => { const raw = Number(e.target.value); setInventory(i => ({...i, revenue_millions: isNaN(raw) ? 0 : raw / 1_000_000})) }} placeholder="1000000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 13, color: '#555553', whiteSpace: 'nowrap' }}>USD</span>
          </div>
        </Field>
        {needsEmployees && (
          <Field label="Total number of employees (FTE)" hint="Required by EcoVadis for per-employee intensity calculation">
            <input type="number" value={inventory.employee_count || ''} onChange={e => setInventory(i => ({...i, employee_count: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
          </Field>
        )}
        <Field label="Organizational boundary approach">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control (most common)</option>
            <option value="financial_control">Financial Control</option>
            <option value="equity_share">Equity Share</option>
          </select>
        </Field>
        {inventory.selected_frameworks.includes('sb253') && (
          <Field label="Does your company have California nexus?" hint="California operations, employees, or sales — determines SB 253 applicability">
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setInventory(i => ({...i, california_nexus: true}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: inventory.california_nexus ? '#B91C1C' : '#f8f7f5', color: inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${inventory.california_nexus ? '#B91C1C' : '#e8e7e4'}`, }}>Yes</button>
              <button onClick={() => setInventory(i => ({...i, california_nexus: false}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: !inventory.california_nexus ? '#0d0d0d' : '#f8f7f5', color: !inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${!inventory.california_nexus ? '#0d0d0d' : '#e8e7e4'}`, }}>No</button>
            </div>
          </Field>
        )}
        {needsPriorYear && (
          <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#0C447C', marginBottom: 10 }}>CDP requires prior year comparison figures</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label={`Prior year Scope 1 (${inventory.reporting_year - 1}) mtCO₂e`}>
                <input type="number" value={inventory.prior_year_s1 || ''} onChange={e => setInventory(i => ({...i, prior_year_s1: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
              <Field label={`Prior year Scope 2 (${inventory.reporting_year - 1}) mtCO₂e`}>
                <input type="number" value={inventory.prior_year_s2 || ''} onChange={e => setInventory(i => ({...i, prior_year_s2: Number(e.target.value)}))} placeholder="0" style={inputStyle} />
              </Field>
            </div>
          </div>
        )}
        <Field label="List your facilities" hint="Enter name and state — we'll collect energy data for each one">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {inventory.locations.map((loc, i) => (
              <div key={loc.id} style={{ display: 'flex', gap: 8 }}>
               <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder="e.g. Chicago Warehouse" style={{ ...inputStyle, flex: 1 }} />
<select value={loc.country} onChange={e => updateLocation(i, 'country', e.target.value)} style={{ ...inputStyle, width: 110 }}>
  <option value="">Country…</option>
  <option value="US">🇺🇸 USA</option>
  <option value="CA">🇨🇦 Canada</option>
  <option value="GB">🇬🇧 UK</option>
  <optgroup label="European Union">
    {EU_COUNTRY_OPTIONS.map(([code, label]) => (
      <option key={code} value={code}>{label}</option>
    ))}
  </optgroup>
  <option value="AU">🇦🇺 Australia</option>
  <option value="NZ">🇳🇿 New Zealand</option>
  <option value="OTHER">Other…</option>
</select>
{loc.country === 'US' && (
  <select value={loc.state || ''} onChange={e => updateLocation(i, 'state', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">State…</option>
    {US_STATES.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
{loc.country === 'CA' && (
  <select value={loc.province || ''} onChange={e => updateLocation(i, 'province', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">Province…</option>
    {['ON','BC','AB','QC','MB','SK','NS','NB','NL','PE','NT','NU','YT'].map(p => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
)}
{loc.country === 'AU' && (
  <select value={loc.state || ''} onChange={e => updateLocation(i, 'state', e.target.value)} style={{ ...inputStyle, width: 130 }}>
    <option value="">State…</option>
    {AU_STATES.map(s => (
      <option key={s} value={s}>{s}</option>
    ))}
  </select>
)}
{loc.country && loc.country !== 'US' && loc.country !== 'CA' && loc.country !== 'AU' && gridRegionForCountry(loc.country) && (
  <span style={{ fontSize: 12, color: '#0F6E56', alignSelf: 'center', whiteSpace: 'nowrap' }}>
    Grid: {gridRegionForCountry(loc.country)} ({getGridFactor(gridRegionForCountry(loc.country), inventory.reporting_year).ef} kg/kWh)
  </span>
)}
{loc.country && loc.country !== 'US' && loc.country !== 'CA' && loc.country !== 'AU' && !gridRegionForCountry(loc.country) && (
  <input value={loc.region || ''} onChange={e => updateLocation(i, 'region', e.target.value)} placeholder="State/Region" style={{ ...inputStyle, width: 120 }} />
)}
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add location</button>
            {showLocationWall && (
              <div style={{ marginTop: 12, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.3)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', marginBottom: 3 }}>You&apos;ve reached your plan&apos;s location limit ({locationAllowance})</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>Your current plan covers up to {locationAllowance} location{locationAllowance === 1 ? '' : 's'}. Upgrade to add more — your existing data stays exactly as it is.</div>
                  <a href="/pricing" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>See plans &amp; upgrade →</a>
                </div>
                <button onClick={() => setShowLocationWall(false)} style={{ background: 'none', border: 'none', color: '#888784', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
            )}
          </div>
        </Field>
      </div>
    </div>
  )

  const renderStep2 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc, 'AR6', inventory.reporting_year)
    const detectedRegion = [...GRID_REGIONS_CA, ...GRID_REGIONS_US].find(r => r.value === loc.grid_region)
    // The question a user is asked and the absence they later attest MUST be the same words (STEP 3):
    // both derive from STREAM_META. See the attestation block below and the workings declaration rows.
    const streamQuestion = (s: DeclarableStream) => `Does this location ${STREAM_META[s].verb} ${STREAM_META[s].name}?`
    return (
      <div>
        <h2 style={sectionHead}>Energy & fuel data</h2>
        <p style={sectionSub}>Enter what appears on your utility bills and fuel records. All calculations happen automatically — you never need to look up emission factors.</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
          {inventory.locations.map((l, i) => (
            <button key={l.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeLocation === i ? '#0d0d0d' : '#f8f7f5', color: activeLocation === i ? '#fff' : '#555553', border: `0.5px solid ${activeLocation === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeLocation === i ? 500 : 400 }}>
              {l.name || `Location ${i+1}`}
            </button>
          ))}
          <button onClick={addLocation} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', }}>+ Add location</button>
          {showLocationWall && (
            <div style={{ width: '100%', marginTop: 8, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.3)', borderRadius: 10, padding: '0.9rem 1rem', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', marginBottom: 3 }}>You&apos;ve reached your plan&apos;s location limit ({locationAllowance})</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>Your current plan covers up to {locationAllowance} location{locationAllowance === 1 ? '' : 's'}. Upgrade to add more — your existing data stays exactly as it is.</div>
                <a href="/pricing" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 600, color: '#7425e3', textDecoration: 'none' }}>See plans &amp; upgrade →</a>
              </div>
              <button onClick={() => setShowLocationWall(false)} style={{ background: 'none', border: 'none', color: '#888784', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
            <QuestionCard question={streamQuestion('natural_gas')} hint="For heating, boilers, furnaces — check your gas utility bills" checked={loc.has_natural_gas} onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}>
              {loc.has_natural_gas && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <p style={qHint}>What unit does your gas supplier show on bills?</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {ngUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={unitBtn(loc.natural_gas_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total natural gas — ${inventory.reporting_year} (${loc.natural_gas_unit})`} hint="Sum of all 12 monthly bills for this location">
                    <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                    {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit) && (
                      <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                        {validateNaturalGas(loc.natural_gas_amount, loc.natural_gas_unit)}
                      </div>
                    )}
                  </Field>
                  {isPaid ? <DocUpload label="Upload gas bills" locIdx={activeLocation} docType="utility_bill_gas" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_gas')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload gas bills" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('propane')} hint="For forklifts and heating — check delivery records" checked={loc.has_propane} onToggle={v => updateLocation(activeLocation, 'has_propane', v)}>
              {loc.has_propane && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {propaneUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={unitBtn(loc.propane_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased — ${inventory.reporting_year} (${loc.propane_unit})`}>
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload propane delivery records" locIdx={activeLocation} docType="fuel_propane" docs={loc.source_docs.filter(d => d.document_type === 'fuel_propane')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload propane delivery records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('diesel_stationary')} hint="Backup generators, boilers — not vehicles" checked={loc.has_diesel_stationary} onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}>
              {loc.has_diesel_stationary && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {liquidUnitOptions(loc.country).map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={unitBtn(loc.diesel_stationary_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel in stationary equipment — ${inventory.reporting_year}`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload diesel purchase records" locIdx={activeLocation} docType="fuel_diesel" docs={loc.source_docs.filter(d => d.document_type === 'fuel_diesel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload diesel purchase records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('fuel_oil')} hint="Heating oil for boilers or furnaces — check delivery records" checked={loc.has_fuel_oil} onToggle={v => updateLocation(activeLocation, 'has_fuel_oil', v)}>
              {loc.has_fuel_oil && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <Field label={`Total fuel oil purchased — ${inventory.reporting_year} (gallons)`}>
                    <input type="number" value={loc.fuel_oil_gallons || ''} onChange={e => updateLocation(activeLocation, 'fuel_oil_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload fuel oil delivery records" locIdx={activeLocation} docType="fuel_oil" docs={loc.source_docs.filter(d => d.document_type === 'fuel_oil')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload fuel oil delivery records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question={streamQuestion('mobile')} hint="Delivery trucks, forklifts, company cars — check fleet fuel cards" checked={loc.has_mobile} onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}>
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <Field label={`Gasoline for company vehicles — ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  <Field label={`Diesel for company vehicles — ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        {liquidUnitOptions(loc.country).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </Field>
                  {isPaid ? <DocUpload label="Upload fleet fuel records" locIdx={activeLocation} docType="fleet_fuel" docs={loc.source_docs.filter(d => d.document_type === 'fleet_fuel')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload fleet fuel records" />}
                </div>
              )}
            </QuestionCard>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>{streamQuestion('refrigerants')}</div>
              <p style={qHint}>Large commercial refrigeration systems are common emission sources.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, }}>Ammonia (NH₃)</button>
                <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? '#7425e3' : '#f8f7f5', color: loc.has_hfc_refrigerants ? '#fff' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? '#7425e3' : '#e8e7e4'}`, }}>HFC refrigerants</button>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#555553' : '#f8f7f5', color: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#fff' : '#555553', border: '0.5px solid #e8e7e4', }}>None</button>
              </div>
              {loc.uses_ammonia && <div style={{ background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0F6E56', fontWeight: 500 }}>✓ Ammonia has zero global warming potential — no further data needed</div>}
              {loc.has_hfc_refrigerants && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ background: '#FEF3E2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#633806' }}>Check refrigeration service records — refrigerant purchased for top-up = refrigerant leaked (GHG Protocol methodology)</div>
                  <Field label="Refrigerant type"><select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}><option value="r410a">R-410A</option><option value="r22">R-22</option><option value="r134a">R-134a</option><option value="r404a">R-404A</option><option value="r507">R-507</option></select></Field>
                  <Field label="Refrigerant purchased for top-up this year (kg)" hint="From service records or supplier invoices">
                    <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload service records" locIdx={activeLocation} docType="service_record" docs={loc.source_docs.filter(d => d.document_type === 'service_record')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload service records" />}
                </div>
              )}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Purchased electricity</div>
              <p style={qHint}>Check your electricity utility bills — kWh is always shown.</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <Field label={`Total electricity — ${inventory.reporting_year} (kWh)`} hint="Sum of all 12 monthly bills for this location">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                {validateElectricity(loc.electricity_kwh) && (
                  <div style={{ background: "#FEF3E2", border: "0.5px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#92400e", marginTop: 6 }}>
                    {validateElectricity(loc.electricity_kwh)}
                  </div>
                )}
                {loc.country === 'AU'
                  ? (loc.grid_region.startsWith('AU_')
                      ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh (DCCEEW NGA 2025)</div>
                      : <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>Select your state above to resolve the grid emission factor.</div>)
                  : loc.state
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region auto-detected: <strong>{detectedRegion?.label}</strong> — {detectedRegion ? getGridFactor(detectedRegion.value, inventory.reporting_year).ef : "—"} kg CO₂e/kWh (eGRID 2023)</div>
                  : (loc.grid_region.startsWith('EU_') || loc.grid_region === 'UK' || loc.grid_region === 'NZ')
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh ({loc.grid_region === 'UK' ? 'DEFRA 2025' : loc.grid_region === 'NZ' ? 'NZ MfE 2026' : 'EEA 2023'})</div>
                  : isResolvedGridRegion(loc.grid_region)
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region: <strong>{loc.grid_region}</strong> — {getGridFactor(loc.grid_region, inventory.reporting_year).ef} kg CO₂e/kWh ({loc.country === 'CA' ? 'ECCC v3.0' : loc.country === 'US' ? 'US EPA eGRID2023' : loc.country === 'AU' ? 'DCCEEW NGA 2025' : 'grid factor'})</div>
                  : (loc.country === 'CA' || loc.country === 'US')
                  ? <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                      <div style={{ fontSize: 12, color: '#92400e' }}>Select your {loc.country === 'CA' ? 'province' : 'state'}/region to resolve the grid emission factor.</div>
                      {loc.country === 'CA'
                        ? <select value="" onChange={e => updateLocation(activeLocation, 'province', e.target.value)} style={inputStyle}><option value="" disabled>Select province…</option>{GRID_REGIONS_CA.map(r => <option key={r.value} value={r.value}>{r.label} — {r.ef} kg CO₂e/kWh</option>)}</select>
                        : <select value="" onChange={e => updateLocation(activeLocation, 'state', e.target.value)} style={inputStyle}><option value="" disabled>Select state…</option>{US_STATES.map(s => <option key={s} value={s}>{s} — {getGridFactor('US_' + s, inventory.reporting_year).ef} kg CO₂e/kWh</option>)}</select>}
                    </div>
                  : <div style={{ background: '#FEF3E2', border: '0.5px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e' }}>Grid factor not available for this jurisdiction — <a href="mailto:hello@themisiq.co" style={{ color: '#7425e3', textDecoration: 'underline' }}>contact us</a>.</div>
                }
                {loc.country === 'NZ' && (
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Combustion use-class</div>
                      <div style={{ fontSize: 11, color: '#888784', marginBottom: 8 }}>MfE publishes stationary-combustion factors by use-class. Most sites are Commercial (default).</div>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#7425e3' }}>{(loc.nz_use_class ?? 'commercial') === 'industrial' ? 'Industrial selected — change use-class' : 'Advanced: change use-class (using Commercial)'}</summary>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          {(['commercial', 'industrial'] as const).map(uc => (
                            <button key={uc} onClick={() => updateLocation(activeLocation, 'nz_use_class', uc)} style={unitBtn((loc.nz_use_class ?? 'commercial') === uc)}>{uc === 'commercial' ? 'Commercial' : 'Industrial'}</button>
                          ))}
                        </div>
                      </details>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#555553', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!loc.nz_td_losses} onChange={e => updateLocation(activeLocation, 'nz_td_losses', e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                      <span>Include electricity <strong>transmission &amp; distribution (T&amp;D) losses</strong> — reported as a separate <strong>Scope 3 Category 3</strong> line, not added to Scope 2. <span style={{ color: '#888784' }}>Off by default.</span></span>
                    </label>
                  </div>
                )}
                {loc.country === 'US' && (
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '12px 14px' }}>
                    <Field label="eGRID subregion (for market-based Scope 2)" hint="Required only for ESRS E1 / GRI 305 market-based reporting. Leave blank if not reporting those — market-based will use the grid-average factor as a conservative fallback.">
                      <select value={loc.residual_region || ''} onChange={e => updateLocation(activeLocation, 'residual_region', e.target.value)} style={inputStyle}>
                        <option value="">Select your eGRID subregion…</option>
                        {US_SUBREGIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                      </select>
                    </Field>
                    <a href="https://www.epa.gov/egrid/power-profiler" target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0C447C', textDecoration: 'none', display: 'inline-block', marginTop: 6 }}>🔎 Find your subregion with EPA Power Profiler (enter your ZIP) →</a>
                  </div>
                )}
                {isPaid ? <DocUpload label="Upload electricity bills" locIdx={activeLocation} docType="utility_electricity" docs={loc.source_docs.filter(d => d.document_type === 'utility_electricity')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload electricity bills" />}
              </div>
            </div>
            <QuestionCard question={streamQuestion('purchased_steam')} hint="Purchased steam or hot water from a district energy system — Scope 2" checked={loc.has_purchased_steam} onToggle={v => updateLocation(activeLocation, 'has_purchased_steam', v)}>
              {loc.has_purchased_steam && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <Field label={`Total purchased steam — ${inventory.reporting_year} (mmbtu)`}>
                    <input type="number" value={loc.purchased_steam_mmbtu || ''} onChange={e => updateLocation(activeLocation, 'purchased_steam_mmbtu', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload steam / district heating bills" locIdx={activeLocation} docType="purchased_steam" docs={loc.source_docs.filter(d => d.document_type === 'purchased_steam')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label="Upload steam / district heating bills" />}
                </div>
              )}
            </QuestionCard>
            {(() => {
              // Completeness attestation — mirror of the grid-region prompt, but for streams the location
              // has neither entered nor attested. Attesting writes a StreamAttestation (stream + timestamp);
              // the stream then declares and drops off the list. Does NOT block step-2 Continue — this is
              // an export-time gate, surfaced here so it can be cleared where the fuel data lives.
              const activeUndeclared = undeclaredStreams.filter(u => u.locId === loc.id)
              if (activeUndeclared.length === 0) return null
              const attest = (streams: DeclarableStream[]) => {
                const at = new Date().toISOString()
                const existing = loc.stream_attestations ?? []
                updateLocation(activeLocation, 'stream_attestations', [...existing, ...streams.map(stream => ({ stream, attested_at: at }))])
              }
              return (
                <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.3)', borderRadius: 12, padding: '1.15rem 1.25rem' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>Confirm what this location does NOT have</div>
                  <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 12 }}>An undeclared stream is not the same as zero — completeness can&apos;t be asserted until each is either entered above or attested absent. Required before export.</div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                    {activeUndeclared.map(u => (
                      <label key={u.stream} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={false} onChange={() => attest([u.stream])} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>This location has no {STREAM_META[u.stream].name}.</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={() => attest(activeUndeclared.map(u => u.stream))} style={{ marginTop: 14, fontSize: 12, fontWeight: 600, padding: '9px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>Attest all remaining as absent</button>
                </div>
              )
            })()}
          </div>
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#111827', borderRadius: 12, padding: '1.5rem', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#d1d5db', marginBottom: 12 }}>{loc.name} — live results</div>
              {[
                { label: 'Heating & fuel', val: calc.s1_stationary, color: '#a78bfa' },
                { label: 'Vehicles', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Refrigerants', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Scope 1 total', val: calc.s1_total, color: '#f9fafb', bold: true },
                { label: 'Scope 2 (electricity)', val: calc.s2_location, color: '#64fe3e', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#f9fafb' : '#d1d5db', fontWeight: bold ? 600 : 300 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} mt</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2025 (UK) · IPCC AR6 GWP · eGRID 2023</div>
              {validateCompleteness(loc).map((w, i) => (
                <div key={i} style={{ marginTop: 8, background: "rgba(254,243,226,0.1)", border: "0.5px solid #fcd34d", borderRadius: 6, padding: "6px 10px", fontSize: 10, color: "#fcd34d", lineHeight: 1.5 }}>{w}</div>
              ))}
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>All locations</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#7425e3' }}>{totals_ar6.s1_total.toFixed(2)} mt Scope 1</div>
              {gridReady
                ? <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginTop: 4 }}>{totals_ar6.s2_location.toFixed(2)} mt Scope 2</div>
                : <div style={{ marginTop: 4 }}><div style={{ fontSize: 14, fontWeight: 600, color: '#888784' }}>— mt Scope 2</div><div style={{ fontSize: 10, color: '#888784', marginTop: 1 }}>Resolve grid regions to preview Scope 2</div></div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderStep3 = () => {
    const needsExtra = needsMarketBased || needsBiogenic
    if (!needsExtra) return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '1.5rem' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0F6E56', marginBottom: 4 }}>✓ No additional data required for your selected frameworks</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300 }}>CARB SB 253, CDP, EcoVadis, and IFRS S2 only require the energy data you've already entered. Click Continue to review your results.</div>
        </div>
      </div>
    )
    return (
      <div>
        <h2 style={sectionHead}>Additional data</h2>
        <p style={sectionSub}>Your selected frameworks require some additional information beyond standard energy data.</p>
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 700 }}>
          {needsMarketBased && (
            <div style={{ background: '#fff', border: '0.5px solid #7425e3', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7425e3', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Market-based Scope 2</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require you to report Scope 2 on both a location-based AND market-based basis. Market-based Scope 2 subtracts electricity from renewable energy contracts (PPAs, RECs, green tariffs).</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Renewable electricity (kWh)`} hint="Enter kWh covered by PPAs, RECs, or green tariffs. Leave 0 if none.">
                    <input type="number" value={loc.renewable_electricity_kwh || ''} onChange={e => updateLocation(i, 'renewable_electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label={`Upload RECs / PPAs — ${loc.name}`} locIdx={i} docType="renewable_cert" docs={loc.source_docs.filter(d => d.document_type === 'renewable_cert')} onUpload={handleFileUpload} onRemove={removeDoc} onUpdateProposal={updateProposal} onAddCoverageResolution={addCoverageResolution} uploading={uploading} reportingYear={inventory.reporting_year} fiscalYearEndMonth={inventory.fiscal_year_end_month} locId={loc.id} coverageResolutions={inventory.coverage_resolutions ?? []} /> : <LockedDocUpload label={`Upload RECs / PPAs — ${loc.name}`} />}
                </div>
              ))}
            </div>
          )}
          {needsBiogenic && (
            <div style={{ background: '#fff', border: '0.5px solid #0F6E56', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>ESRS E1 / GRI 305 — Biogenic CO₂</div>
              <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6, marginBottom: '1rem' }}>ESRS E1 and GRI 305 require biogenic CO₂ emissions to be reported separately from fossil fuel emissions. Biogenic CO₂ comes from burning biomass, wood waste, or agricultural residues.</p>
              {inventory.locations.map((loc, i) => (
                <div key={loc.id} style={{ marginBottom: 14 }}>
                  <Field label={`${loc.name} — Biogenic CO₂ (mtCO₂)`} hint="From burning biomass, wood waste, or agricultural residues — 0 if none">
                    <input type="number" value={loc.biogenic_co2_mt || ''} onChange={e => updateLocation(i, 'biogenic_co2_mt', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

    const renderStep4 = () => {
    const ar5 = totals_ar5
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    return (
      <div>
        <h2 style={sectionHead}>Review, results & calculation workings</h2>
        <p style={sectionSub}>{inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri') ? `Your Scope 1 & 2 inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}. Scope 3 required — complete it after export.` : `Your complete GHG inventory for ${inventory.company_name || 'your company'}, ${inventory.reporting_year}.`}</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' }}>
              {activeFrameworks.map(fw => {
                const totals = totalsByGwp[fw.gwp as GwpVersion]
                return (
                  <div key={fw.id} style={{ background: fw.bg, border: `0.5px solid ${fw.color}33`, borderRadius: 10, padding: '1.25rem' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: fw.color, letterSpacing: '0.06em', textTransform: 'uppercase' as const, marginBottom: 8 }}>{fw.name} — GWP {fw.gwp}</div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#888784' }}>Scope 1</div>
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s1_total.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 11, color: '#888784' }}>Scope 2 (location)</div>
                      <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s2_location.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                    </div>
                    {(fw.id === 'esrs' || fw.id === 'gri') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#888784' }}>Scope 2 (market)</div>
                        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s2_market.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {(fw.id === 'esrs' || fw.id === 'gri') && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 11, color: '#888784' }}>Biogenic CO₂ (reported separately)</div>
                        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.biogenic.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {totals.s3_td > 0 && (
                      <div style={{ marginBottom: 6 }}>
                        {/* Distinct Scope 3 (Cat 3) line — NZ electricity T&D losses. Never folded into S1/S2. */}
                        <div style={{ fontSize: 11, color: '#888784' }}>Scope 3 (Cat 3 — electricity T&amp;D)</div>
                        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{totals.s3_td.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                      </div>
                    )}
                    {fw.id === 'cdp' && (
                      <>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#888784' }}>Prior year Scope 1 ({inventory.reporting_year - 1})</div>
                          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{inventory.prior_year_s1.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                        </div>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ fontSize: 11, color: '#888784' }}>Prior year Scope 2 ({inventory.reporting_year - 1})</div>
                          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: fw.color }}>{inventory.prior_year_s2.toFixed(2)}<span style={{ fontSize: 11, color: '#888784', fontFamily: 'sans-serif', marginLeft: 4 }}>mt</span></div>
                        </div>
                      </>
                    )}
                    {rev > 0 && <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>Intensity: {(totals.s1_total / rev).toFixed(4)} mt/$M</div>}
                    {emp > 0 && fw.id === 'ecovadis' && <div style={{ fontSize: 11, color: '#888784' }}>Per employee: {(totals.s1_total / emp * 1000).toFixed(2)} kgCO₂e</div>}
                  </div>
                )
              })}
            </div>
            {(() => {
            const wGwp: GwpVersion = (FRAMEWORKS.find(f => f.id === activeExport)?.gwp as GwpVersion) || (activeFrameworks[0]?.gwp as GwpVersion) || 'AR6'
            // ONE derivation. The tested engine builds every workings row (including Phase-3b declaration
            // rows and the always-emitted market-based row); the screen just filters by location. The
            // second, hand-rolled table derivation that used to live here is gone (Phase 4).
            const allRows = buildWorkings(inventory.locations, wGwp, inventory.reporting_year, coverageResolutions, inventory.fiscal_year_end_month)
            return inventory.locations.map((loc, i) => {
              const c = calcLocation(loc, wGwp, inventory.reporting_year)
              const key = `loc_${i}`
              const locRows = allRows.filter(r => r.location === (loc.name || 'Location'))
              return (
                <div key={loc.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                  <div onClick={() => setShowWorkings(w => ({...w, [key]: !w[key]}))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{loc.name}{loc.state && ` — ${loc.state}`}</div>
                      <div style={{ fontSize: 12, color: '#888784', marginTop: 2 }}>S1: {c.s1_total.toFixed(2)} mt · S2: {c.s2_location.toFixed(2)} mt · Total: {(c.s1_total + c.s2_location).toFixed(2)} mt</div>
                    </div>
                    <span style={{ fontSize: 12, color: '#888784' }}>{showWorkings[key] ? '▲ Hide' : '▼ Show workings'}</span>
                  </div>
                  {showWorkings[key] && (
                    <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', margin: '1rem 0 0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase' as const }}>Calculation workings — ISO 14064-3 / ISAE 3410 transparency</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead><tr>{['Source', 'Activity data', 'Emission factor', 'Factor source', 'GWP basis', 'Result (mtCO₂e)'].map(h => <th key={h} style={{ background: '#f8f7f5', padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#888784', borderBottom: '0.5px solid #e8e7e4' }}>{h}</th>)}</tr></thead>
                        <tbody>
                          {locRows.map((r, ri) => {
                            // Declaration rows (Phase 3b) are now VISIBLE (the point of Phase 4). result_tco2e
                            // null must never render as 0 — "0" is a claim of zero, "—" is an absence.
                            if (r.declaration === 'attested_absent') {
                              return <tr key={ri} style={{ background: '#f4f4f2' }}>
                                <td style={{ ...wTd, color: '#888784' }}>{r.source}</td>
                                <td style={{ ...wTd, color: '#888784' }}>—</td>
                                <td style={{ ...wTd, color: '#888784' }}>—</td>
                                <td style={{ ...wTd, color: '#888784' }}>{r.note}</td>
                                <td style={{ ...wTd, color: '#888784' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: '#888784', fontWeight: 600 }}>0.0000</td>
                              </tr>
                            }
                            if (r.declaration === 'undeclared') {
                              return <tr key={ri} style={{ background: '#FEF3E2' }}>
                                <td style={{ ...wTd, color: '#ba7517', fontWeight: 600 }}>{r.source}</td>
                                <td style={{ ...wTd, color: '#ba7517' }}>—</td>
                                <td style={{ ...wTd, color: '#ba7517' }}>—</td>
                                <td style={{ ...wTd, color: '#ba7517' }}>{r.note}</td>
                                <td style={{ ...wTd, color: '#ba7517' }}>{r.gwp_basis}</td>
                                <td style={{ ...wTd, color: '#ba7517', fontWeight: 600 }}>—</td>
                              </tr>
                            }
                            const s2 = r.scope === 2
                            return <tr key={ri} style={s2 ? { background: '#f8f7f5' } : r.scope === 3 ? { background: '#faf7ff' } : undefined}>
                              <td style={wTd}>{r.source}</td>
                              <td style={wTd}>{r.activity_data == null ? '—' : `${r.activity_data} ${r.activity_unit}`}</td>
                              <td style={wTd}>{r.emission_factor_display}</td>
                              <td style={wTd}>{r.ef_source}</td>
                              <td style={wTd}>{r.gwp_basis}</td>
                              <td style={{ ...wTd, fontWeight: 600, color: s2 ? '#0F6E56' : '#7425e3' }}>{r.result_tco2e == null ? '—' : r.result_tco2e.toFixed(4)}</td>
                            </tr>
                          })}
                          <tr style={{ background: '#0d0d0d' }}><td colSpan={5} style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>TOTAL — {loc.name} (Scope 1 + Scope 2 location-based)</td><td style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>{(c.s1_total + c.s2_location).toFixed(4)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
            })()}
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Assurance readiness — ISO 14064-3 / ISAE 3410</div>
              {[
                { label: 'Emission factors cited with source and year', done: true, note: 'EPA 2024 (US) · ECCC v3.0 (CA) · DEFRA 2025 (UK) · eGRID 2023 · IPCC AR6 GWP' },
                { label: 'Calculation workings documented per source', done: true, note: 'Full formula shown for every emission source' },
                { label: 'Organizational boundary documented', done: !!inventory.boundary_approach, note: inventory.boundary_approach.replace(/_/g, ' ') },
                { label: 'Source documents uploaded', done: isPaid && inventory.locations.some(l => l.source_docs.length > 0), note: isPaid ? `${inventory.locations.reduce((a, l) => a + l.source_docs.length, 0)} documents` : 'Available on paid plan' },
                { label: 'All locations included in boundary', done: inventory.locations.length > 0, note: `${inventory.locations.length} location(s)` },
              ].map(({ label, done, note }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{done ? '✅' : '⬜'}</span>
                  <div>
                    <div style={{ fontSize: 12, color: done ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: done ? 500 : 300 }}>{label}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }
 const renderStep5 = () => {
    return (
      <div>
        <h2 style={sectionHead}>Export your reports</h2>
        {(() => {
          const fw = inventory.selected_frameworks
          const year = inventory.reporting_year
          const needsScope3Now = fw.includes('esrs') || fw.includes('csrd') || fw.includes('gri')
          const scope3Encouraged = fw.includes('cdp') || fw.includes('ecovadis')
          const sb253Only = fw.includes('sb253') && fw.length === 1
          const sb253FirstYear = sb253Only && year <= 2024

          if (needsScope3Now) return (
            <div style={{ background: '#FCEBEB', border: '0.5px solid rgba(185,28,28,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', marginBottom: 4 }}>⚠ Scope 3 required for your selected frameworks</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CSRD ESRS E1-6 and GRI 305-3 require Scope 3 disclosure. Complete your Scope 3 inventory before finalising your report.</div>
              </div>
              <a href={inventoryId ? `/dashboard/scope3?inventoryId=${inventoryId}` : '/dashboard/scope3?from=ghg'} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#B91C1C', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Complete Scope 3 →</a>
            </div>
          )

          if (sb253FirstYear) return (
            <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0C447C', marginBottom: 4 }}>SB 253 — Scope 3 not required for your first reporting year</div>
                <div style={{ fontSize: 12, color: '#555553' }}>Scope 3 becomes mandatory from FY2025 data (due 2026). Start your inventory now to get ahead of the deadline.</div>
              </div>
              <a href={inventoryId ? `/dashboard/scope3?inventoryId=${inventoryId}` : '/dashboard/scope3?from=ghg'} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#0C447C', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Start Scope 3 inventory →</a>
            </div>
          )

          if (scope3Encouraged) return (
            <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 4 }}>Scope 3 will improve your CDP/EcoVadis score</div>
                <div style={{ fontSize: 12, color: '#555553' }}>CDP and EcoVadis score Scope 3 disclosure. Cat.1 (purchased goods) and Cat.6 (business travel) are the highest-impact categories to start with.</div>
              </div>
              <a href={inventoryId ? `/dashboard/scope3?inventoryId=${inventoryId}` : '/dashboard/scope3?from=ghg'} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#ba7517', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Calculate Scope 3 →</a>
            </div>
          )

          return (
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56', marginBottom: 4 }}>Ready to calculate your Scope 3 emissions?</div>
                <div style={{ fontSize: 12, color: '#555553' }}>This wizard covers Scope 1 & 2. Use the Scope 3 Complete Calculator for all 15 categories — GHG Protocol aligned.</div>
              </div>
              <a href={inventoryId ? `/dashboard/scope3?inventoryId=${inventoryId}` : '/dashboard/scope3?from=ghg'} style={{ fontSize: 12, fontWeight: 600, padding: '8px 16px', borderRadius: 8, background: '#0F6E56', color: '#fff', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Calculate Scope 3 →</a>
            </div>
          )
        })()}
        <p style={sectionSub}>One inventory — {activeFrameworks.length} report{activeFrameworks.length > 1 ? 's' : ''}. Unlock your paid plan to download.</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' as const }}>
              {activeFrameworks.map(fw => (
                <button key={fw.id} onClick={() => setActiveExport(fw.id)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeExport === fw.id ? fw.color : '#f8f7f5', color: activeExport === fw.id ? '#fff' : '#555553', border: `0.5px solid ${activeExport === fw.id ? fw.color : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeExport === fw.id ? 500 : 400 }}>
                  {fw.name}
                </button>
              ))}
            </div>
            {activeFrameworks.map(fw => {
              if (fw.id !== activeExport) return null
              const totals = totalsByGwp[fw.gwp as GwpVersion]
              const rev = inventory.revenue_millions
              const emp = inventory.employee_count
              return (
                <div key={fw.id}>
                  <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '2rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, borderRadius: 6, padding: '3px 10px', marginBottom: 12 }}>{fw.name} — {fw.full}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
                      {[
                        ['Company', inventory.company_name || '—'],
                        ['Reporting year', String(inventory.reporting_year)],
                        ['GWP basis', `IPCC ${fw.gwp}`],
                        ['Scope 1 total', `${totals.s1_total.toFixed(4)} mtCO₂e`],
                        ['Scope 2 (location)', `${totals.s2_location.toFixed(4)} mtCO₂e`],
                        ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 (market)', `${totals.s2_market.toFixed(4)} mtCO₂e`]] : []),
                        ...(rev > 0 ? [['S1 intensity', `${(totals.s1_total/rev).toFixed(6)} mtCO₂e/$M`]] : []),
                        ...(emp > 0 && fw.id === 'ecovadis' ? [['S1 per employee', `${(totals.s1_total/emp*1000).toFixed(2)} kgCO₂e`]] : []),
                        ['Deadline', fw.deadline],
                      ].map(([label, val]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {(!conciergeReady || !gridReady || !declarationsReady) && (
                      <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
                      {conciergePending.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 2 }}>⚠ {conciergePending.length} uploaded figure{conciergePending.length > 1 ? 's' : ''} still need{conciergePending.length > 1 ? '' : 's'} your confirmation</div>
                        )}
                        {unresolvedCoverage.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 2 }}>⚠ {unresolvedCoverage.length} coverage issue{unresolvedCoverage.length > 1 ? 's' : ''} need{unresolvedCoverage.length > 1 ? '' : 's'} resolving ({unresolvedCoverage.map(u => u.status).join(', ')})</div>
                        )}
                        {unresolvedGridLocations.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 2 }}>⚠ {unresolvedGridLocations.length} location{unresolvedGridLocations.length > 1 ? 's' : ''} need{unresolvedGridLocations.length > 1 ? '' : 's'} a grid region: {unresolvedGridLocations.map(l => l.name).join(', ')}</div>
                        )}
                        {undeclaredStreams.length > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#ba7517', marginBottom: 2 }}>⚠ {undeclaredStreams.length} undeclared stream{undeclaredStreams.length > 1 ? 's' : ''} — enter the data or attest absent on the Energy &amp; fuel step: {undeclaredStreams.map(u => `${u.locName}: ${STREAM_META[u.stream].name}`).join('; ')}</div>
                        )}
                        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>Export is locked until every figure read from your bills is confirmed, every coverage gap, overlap, or boundary-straddle is resolved, and every emission stream is either entered or attested absent. Check the Energy &amp; fuel data step.</div>
                      </div>
                    )}
                    <div style={{ background: "#fff", border: "1px solid #e8e7e4", borderRadius: 8, padding: "14px 16px", marginTop: 16, marginBottom: 16 }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
                        <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#555553", lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge and has been sourced from actual utility bills and operational records. I understand that ThemisIQ applies the correct methodology to the data I provide, and that accuracy of the underlying data is my responsibility.</span>
                      </label>
                    </div>
                    <button onClick={() => dataConfirmed && conciergeReady && gridReady && declarationsReady && generateExport(fw.id)} style={{ fontSize: 14, fontWeight: 500, opacity: (dataConfirmed && conciergeReady && gridReady && declarationsReady) ? 1 : 0.4, cursor: (dataConfirmed && conciergeReady && gridReady && declarationsReady) ? "pointer" : "not-allowed", padding: '12px 28px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', }}>
                      ⬇ Download {fw.name} Report (CSV)
                    </button>
                    <button onClick={() => dataConfirmed && conciergeReady && gridReady && declarationsReady && generateAssurance()} style={{ fontSize: 14, fontWeight: 500, opacity: (dataConfirmed && conciergeReady && gridReady && declarationsReady) ? 1 : 0.4, cursor: (dataConfirmed && conciergeReady && gridReady && declarationsReady) ? 'pointer' : 'not-allowed', padding: '12px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', marginLeft: 10 }}>Download Full Assurance Package (PDF)</button>
                  </div>
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong>Disclaimer:</strong>
                    <p style={{ margin: '0 0 8px' }}>This document and all outputs generated through the ThemisIQ platform are provided for informational, screening, planning, and prioritization purposes only. They do not constitute legal, regulatory, accounting, financial, assurance, investment, or other professional advice and do not, by themselves, satisfy any reporting, disclosure, filing, compliance, assurance, or certification obligation under IFRS, ISSB, CSRD, ESRS, SEC, California climate disclosure regulations, or any other framework or jurisdiction.</p>
                    <p style={{ margin: '0 0 8px' }}>Platform outputs are dependent upon information provided by users and other third-party sources. ThemisIQ Compliance Inc. does not independently verify such information and makes no representation or warranty, express or implied, regarding the completeness, accuracy, reliability, suitability, or fitness for a particular purpose of any output.</p>
                    <p style={{ margin: '0 0 8px' }}>Sustainability-related laws, regulations, standards, guidance, and interpretations continue to evolve. Users remain solely responsible for determining the applicability of regulatory requirements and for obtaining independent legal, accounting, assurance, and other professional advice where appropriate.</p>
                    <p style={{ margin: '0 0 8px' }}>Use of the platform does not create a professional-client, advisory, assurance, accounting, consulting, fiduciary, or legal relationship with ThemisIQ Compliance Inc.</p>
                    <p style={{ margin: '0 0 8px' }}>To the maximum extent permitted by law, ThemisIQ Compliance Inc., its directors, officers, employees, contractors, and affiliates shall not be liable for any direct, indirect, incidental, consequential, special, punitive, or economic damages arising from the use of, or reliance upon, any platform output.</p>
                    <p style={{ margin: '0' }}>ThemisIQ is a software platform and is not an accredited assurance provider, certification body, or regulatory authority.</p>
                  </div>
                </div>
              )
            })}
          </div>
          <VerifierInvite inventoryId={inventoryId} />
          {/* SBTi nudge — shown once the inventory is saved AND its figures confirmed (a settled
              baseline). Affirmative next-step, not a warning. Always shows when gated (no sbti_targets
              read); copy reads fine whether or not targets already exist. GHG-gated page ⇒ no entitlement check. */}
          {inventoryId && dataConfirmed && conciergeReady && gridReady && declarationsReady && (
            <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderRadius: 10, padding: '1.25rem', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' as const }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.15rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Your inventory is the baseline for science-based targets.</div>
                <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.6 }}>Set near-term and net-zero targets under the SBTi Corporate Net-Zero Standard V2.0 — built directly on the figures you just confirmed.</div>
              </div>
              <a href="/dashboard/sbti" style={{ fontSize: 13, fontWeight: 600, padding: '11px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', textDecoration: 'none', whiteSpace: 'nowrap' as const }}>Set science-based targets →</a>
            </div>
          )}
        </div>
      </div>
    )
  }

  const generateAssurance = async () => {
    const { data: auditRows } = await supabase.from('audit_log').select('*').eq('table_name', 'ghg_inventories').eq('record_id', inventoryId).order('created_at', { ascending: false })
    // Per-location residual-mix citation for the PDF (only when a market-based framework is in scope).
    const needsMkt = activeFrameworks.some(f => f.id === 'esrs' || f.id === 'gri')
    const residualRows: string[][] = needsMkt
      ? inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
          const resRegion = l.residual_region || (l.grid_region.startsWith('EU_') ? l.grid_region : '')
          const res = getResidualFactor(resRegion, inventory.reporting_year, 'AR6')
          return [
            l.name || 'Location',
            res.applicable ? res.source : 'Location-factor fallback',
            res.applicable ? `${res.vintage}${res.note ? ` — ${res.note}` : ''}` : (res.note || '—'),
          ]
        })
      : []
    generateAssurancePDF(inventory as any, totals_ar4 as any, totals_ar5 as any, totals_ar6 as any, activeFrameworks as any, (auditRows as any) || [], EF_SOURCES, residualRows)
  }

  const generateExport = async (frameworkId: string) => {
    const fw = FRAMEWORKS.find(f => f.id === frameworkId)!
    const totals = totalsByGwp[fw.gwp as GwpVersion]
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    const header = [
      [`${fw.full} — GHG Emissions Report`],
      [`Generated by ThemisIQ · www.themisiq.co · ${new Date().toLocaleDateString()}`],
      ['GWP basis', `IPCC ${fw.gwp}`],
      [''],
      ['ORGANIZATION'],
      ['Company', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Revenue (USD millions)', rev],
      ...(emp > 0 ? [['Employees (FTE)', emp]] : []),
      ['Boundary', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Locations', inventory.locations.length],
      [''],
      ['RESULTS'],
      ['Scope 1 total (mtCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 2 location-based (mtCO₂e)', totals.s2_location.toFixed(4)],
      ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Scope 2 market-based (mtCO₂e)', totals.s2_market.toFixed(4)]] : []),
      ...(fw.id === 'esrs' || fw.id === 'gri' ? [['Biogenic CO₂ (mtCO₂) — reported separately', totals.biogenic.toFixed(4)]] : []),
      // Distinct Scope 3 (Cat 3) line — NZ electricity T&D losses. Only when present; never in S1/S2.
      ...(totals.s3_td > 0 ? [['Scope 3 Cat 3 — electricity T&D (mtCO₂e)', totals.s3_td.toFixed(4)]] : []),
      ...(fw.id === 'cdp' ? [
        [`Prior year Scope 1 (${inventory.reporting_year - 1}) mtCO₂e`, inventory.prior_year_s1],
        [`Prior year Scope 2 (${inventory.reporting_year - 1}) mtCO₂e`, inventory.prior_year_s2],
      ] : []),
      ...(rev > 0 ? [['S1 intensity (mtCO₂e/$M revenue)', (totals.s1_total / rev).toFixed(6)]] : []),
      [''],
      ['METHODS'],
      ...[...new Set(inventory.locations.map(l => combustionSource(l)))].map(src => ['Combustion factors', src]),
      ['Electricity factors', EF_SOURCES.electricity],
      ['GWP values', fw.gwp === 'AR4' ? EF_SOURCES.gwp_ar4 : fw.gwp === 'AR5' ? EF_SOURCES.gwp_ar5 : EF_SOURCES.gwp_ar6],
      ...((fw.id === 'esrs' || fw.id === 'gri')
        ? [
            ['Market-based Scope 2', 'Residual-mix factor applied to uncovered load; covered (contractual) kWh counted at zero'],
            ...inventory.locations.filter(l => l.electricity_kwh > 0).map(l => {
              const resRegion = l.residual_region || (l.grid_region.startsWith('EU_') ? l.grid_region : '')
              const res = getResidualFactor(resRegion, inventory.reporting_year, fw.gwp as GwpVersion)
              return [`Residual factor — ${l.name}`, res.applicable ? `${res.source} · vintage: ${res.vintage}${res.note ? ` · ${res.note}` : ''}` : `Location-factor fallback${res.note ? ` · ${res.note}` : ''}`]
            }),
          ]
        : []),
      [''],
      ['LOCATION BREAKDOWN'],
      // Grid region, not State: loc.state is empty for CA (province), UK, EU, NZ — every non-US location
      // exported a blank jurisdiction. grid_region (US_PA / ON / NZ) is the key the factor was looked up
      // under, which is exactly what a verifier needs to reconcile the number.
      ['Location', 'Grid region', 'S1 Total', 'S2 Location'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc, fw.gwp as 'AR4' | 'AR5', inventory.reporting_year)
        return [loc.name, loc.grid_region, c.s1_total.toFixed(4), c.s2_location.toFixed(4)]
      }),
      [''],
      ['DISCLAIMER'],
      ['This report was generated by the ThemisIQ platform for informational purposes only.'],
      ['All emissions require third-party verification before formal submission.'],
    ]
    const csv = header.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ThemisIQ_${fw.id.toUpperCase()}_${inventory.company_name.replace(/\s+/g,'_')}_${inventory.reporting_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (mode === 'loading') {
    return <div style={{ background: '#fff', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888784', fontSize: 14 }}>Loading…</div>
  }
  if (mode === 'list') {
    return (
      <div style={{ background: '#fff', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
        <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/dashboard" style={{ textDecoration: 'none' }}><img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} /></a>
            <span style={{ fontSize: 12, color: '#888784' }}>/ GHG Inventory</span>
          </div>
        </nav>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '3rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: 12 }}>
            <h1 style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color: '#0d0d0d', margin: 0 }}>Your inventories</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <a href="/dashboard/ghg/trends" style={{ fontSize: 14, fontWeight: 600, color: '#7425e3', textDecoration: 'none', whiteSpace: 'nowrap' }}>View trends →</a>
              <button onClick={startNewInventory} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>+ New inventory</button>
            </div>
          </div>
          {inventoryList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#888784', fontSize: 14 }}>No inventories yet. Click &ldquo;New inventory&rdquo; to begin.</div>
          ) : (
            inventoryList.map(inv => (
              <a key={inv.id} href={`/dashboard/ghg?id=${inv.id}`} style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '16px 20px', marginBottom: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 500, color: '#0d0d0d' }}>{inv.company_name || 'Untitled inventory'}</div>
                    <div style={{ fontSize: 12, color: '#888784', marginTop: 3 }}>Reporting year {inv.reporting_year} · Updated {new Date(inv.updated_at).toLocaleDateString()}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#7425e3' }}>Open →</span>
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
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </a>
          <span style={{ fontSize: 12, color: '#888784' }}>/ GHG Inventory</span>
          {activeFrameworks.length > 0 && <span style={{ fontSize: 11, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 99, padding: '2px 10px', color: '#555553' }}>{activeFrameworks.map(f => f.name).join(' · ')}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <a href="/dashboard/ghg/trends" style={{ fontSize: 13, fontWeight: 600, color: '#7425e3', textDecoration: 'none', marginRight: 16, whiteSpace: 'nowrap' }}>View trends →</a>
          <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 14, padding: '10px 24px', borderRadius: 8, background: saved ? '#E1F5EE' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : '#0d0d0d', fontWeight: saved ? 500 : 700 }}>
            {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
          </button>
        </div>
      </nav>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', overflowX: 'auto' as const }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem 120px' }}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {(step === 4 || step === 5) && dirty && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' as const, background: '#FEF3E2', border: '0.5px solid #ba751733', borderRadius: 10, padding: '12px 16px', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: 13, color: '#0d0d0d', fontWeight: 500 }}>You have unsaved changes — save your draft before {step === 5 ? 'exporting' : 'continuing'}.</span>
            <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 13, fontWeight: 600, padding: '9px 22px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' as const }}>{isSaving ? 'Saving…' : 'Save draft'}</button>
          </div>
        )}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && <><AuditTrail inventoryId={inventoryId} step={step} /><VerifierInvite inventoryId={inventoryId} /></>}

        {step === 2 && !gridReady && (
          <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.3)', borderRadius: 8, padding: '12px 16px', marginTop: '1.5rem', fontSize: 12, fontWeight: 600, color: '#ba7517' }}>⚠ {unresolvedGridLocations.length} location{unresolvedGridLocations.length > 1 ? 's' : ''} need{unresolvedGridLocations.length > 1 ? '' : 's'} a grid region before you can continue: {unresolvedGridLocations.map(l => l.name).join(', ')}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => { if (step === 2 && !gridReady) return; setStep(s => s+1) }} disabled={step === 2 && !gridReady} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', opacity: (step === 2 && !gridReady) ? 0.4 : 1, cursor: (step === 2 && !gridReady) ? 'not-allowed' : 'pointer' }}>Continue →</button>
          )}
        </div>
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#fff', borderTop: '0.5px solid #e8e7e4', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)', padding: '14px 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: saved ? '#0F6E56' : '#0d0d0d' }}>
          {saved ? '✓ All changes saved' : 'You have unsaved changes'}
        </div>
        <button onClick={handleSave} disabled={isSaving} style={{ fontSize: 16, fontWeight: saved ? 500 : 700, padding: '14px 40px', borderRadius: 8, background: saved ? '#E1F5EE' : 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', border: saved ? '1px solid #0F6E56' : 'none', cursor: 'pointer', color: saved ? '#0F6E56' : '#0d0d0d' }}>
          {isSaving ? 'Saving…' : saved ? '✓ Saved' : 'Save draft'}
        </button>
      </div>
      <GHGBot currentStep={step} />
    </div>
  )
}

function DocUpload({ label, locIdx, docType, docs, onUpload, onRemove, onUpdateProposal, onAddCoverageResolution, uploading, reportingYear, fiscalYearEndMonth, locId, coverageResolutions }: { label: string; locIdx: number; docType: string; docs: SourceDoc[]; onUpload: (f: FileList, i: number, t: string) => void; onRemove: (i: number, id: string, path: string) => void; onUpdateProposal: (locIdx: number, docId: string, propIdx: number, patch: Partial<ExtractedProposal>) => void; onAddCoverageResolution: (res: CoverageResolution) => void; uploading: boolean; reportingYear: number; fiscalYearEndMonth: number; locId: string; coverageResolutions: CoverageResolution[] }) {
  const ref = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState<string | null>(null)   // `${docId}:${propIdx}` being edited
  const [editVal, setEditVal] = useState<string>('')
  const [dragActive, setDragActive] = useState(false)
  const hasConcierge = useHasConcierge()   // concierge tier held → auto-extraction; else manual entry
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragActive(true) }}
      onDragLeave={e => { e.preventDefault(); setDragActive(false) }}
      onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) onUpload(e.dataTransfer.files, locIdx, docType) }}
      style={{ background: dragActive ? '#F3EEFF' : '#f8f7f5', border: dragActive ? '1px solid #7425e3' : '0.5px dashed #e8e7e4', borderRadius: 12, padding: '10px 14px', transition: 'background 0.12s ease, border-color 0.12s ease' }}
    >
      {/* Click-to-pick region (drop works anywhere on the card above). Same picker as before. */}
      <div onClick={() => !uploading && ref.current?.click()} style={{ cursor: uploading ? 'default' : 'pointer', marginBottom: docs.length > 0 ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
          <span style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', color: '#555553' }}>{uploading ? 'Uploading…' : '+ Upload'}</span>
        </div>
        <div style={{ fontSize: 13, color: '#0d0d0d', fontWeight: 500 }}>
          {hasConcierge ? 'Drag & drop your bill here, or click to upload' : 'Drag & drop your documents here, or click to upload'}
        </div>
        <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginTop: 4, lineHeight: 1.5 }}>
          {hasConcierge
            ? 'We’ll read the consumption figures automatically — you confirm before anything’s saved. PDF or photo (JPG, PNG) — large phone photos are fine.'
            : 'PDF, image, XLSX or CSV. Enter figures manually after uploading — large files are fine.'}
        </div>
      </div>
      <input ref={ref} type="file" multiple accept=".pdf,.xlsx,.csv,.jpg,.png" style={{ display: 'none' }} onChange={e => e.target.files && onUpload(e.target.files, locIdx, docType)} />
      {(() => {
        // Coverage strip — ONE per (fuelType) at this location. A fleet_fuel upload carries gasoline AND
        // diesel from the same bills; each fuel gets its OWN strip, status and resolution (the C1 fix), so a
        // gap on diesel can't be cleared by acknowledging gasoline. Within a strip, a control is rendered
        // for EACH unresolved issue in cov.issues — a gap+overlap fuel shows BOTH (the D1 fix).
        const win = periodFromYearAndEnd(reportingYear, fiscalYearEndMonth)
        const groups = new Map<string, CoveragePeriod[]>()
        docs.forEach(d => (d.extracted ?? []).forEach((p, pi) => {
          if (p.status !== 'confirmed' || !p.periodStart || !p.periodEnd) return
          const arr = groups.get(p.fuelType) ?? []
          arr.push({ docId: d.id, pi, start: parseLocalDate(p.periodStart as string), end: parseLocalDate(p.periodEnd as string) })
          groups.set(p.fuelType, arr)
        }))
        if (groups.size === 0) return null
        const KIND_FOR = { gap: 'extrapolate', overlap: 'duplicate', straddle: 'straddle' } as const
        return [...groups.entries()].map(([fuelOfStrip, periods]) => {
          const cov = analyzeCoverage(periods, win.start, win.end)
          const resFor = (kind: CoverageResolution['kind']) =>
            coverageResolutions.find(r => r.kind === kind && r.locId === locId && r.fuelType === fuelOfStrip)
          const gapRes = resFor('extrapolate')
          const dupRes = resFor('duplicate')
          const strdRes = resFor('straddle')
          // Resolved only when EVERY issue present has its matching resolution on file.
          const unresolvedIssues = cov.issues.filter(iss => !resFor(KIND_FOR[iss]))
          const resolved = unresolvedIssues.length === 0
          const tone =
            resolved ? { bg: '#E1F5EE', fg: '#0F6E56', icon: '✓' }
            : { bg: '#FEF3E2', fg: '#ba7517', icon: '⚠' }
          const fuelPrefix = groups.size > 1 && fuelOfStrip ? `${fuelOfStrip}: ` : ''
          return (
          <div key={fuelOfStrip} style={{ marginTop: 8, background: tone.bg, borderRadius: 6, padding: '8px 10px', fontSize: 11, color: tone.fg, fontWeight: 600 }}>
            <div>{tone.icon} {fuelPrefix}{resolved && cov.issues.length > 0 ? `${cov.monthsCovered}/12 months from bills; remaining estimated (${cov.pctEstimated}% estimated).` : cov.summary}</div>
            {cov.outOfWindow.length > 0 && (
              <div style={{ marginTop: 4, fontWeight: 400, color: '#555553' }}>
                ℹ️ {cov.outOfWindow.length} bill{cov.outOfWindow.length > 1 ? 's' : ''} outside reporting year {reportingYear}, not counted: {cov.outOfWindow.map(o => o.label).join(', ')}.
              </div>
            )}
            {cov.issues.includes('gap') && !gapRes && (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 400, color: '#7c5a16' }}>Upload the missing bill above, or:</span>
                <button
                  onClick={() => onAddCoverageResolution({
                    locId,
                    fuelType: fuelOfStrip,
                    kind: 'extrapolate',
                    monthsCovered: cov.monthsCovered,
                    pctEstimated: cov.pctEstimated,
                    note: `${cov.monthsCovered} of 12 months evidenced by bills; remaining ${12 - cov.monthsCovered} month(s) estimated by scaling metered data ×12/${cov.monthsCovered} (${cov.pctEstimated}% estimated).`,
                    acknowledgedAt: new Date().toISOString(),
                  })}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#ba7517', color: '#fff', border: 'none', cursor: 'pointer' }}
                >Acknowledge &amp; estimate</button>
              </div>
            )}
            {cov.issues.includes('overlap') && !dupRes && (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 400, color: '#7c5a16' }}>Two bills cover the same period — remove the duplicate above, or:</span>
                <button
                  onClick={() => onAddCoverageResolution({
                    locId,
                    fuelType: fuelOfStrip,
                    kind: 'duplicate',
                    note: `Overlapping bills detected for ${fuelOfStrip || 'this fuel'}; user confirmed the overlap is intentional (e.g. corrected re-issue) and accepted the figures as-is. No double-count adjustment applied.`,
                    acknowledgedAt: new Date().toISOString(),
                  })}
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#ba7517', color: '#fff', border: 'none', cursor: 'pointer' }}
                >Confirm not a duplicate</button>
              </div>
            )}
            {cov.issues.includes('straddle') && !strdRes && (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: 400, color: '#7c5a16', marginBottom: 6 }}>A bill crosses the reporting-year boundary. How should the overlapping portion be counted?</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([
                    { choice: 'prorate' as const, label: 'Prorate by days', note: 'day-level proration: only the in-window portion is counted, split by day count across the boundary' },
                    { choice: 'this_year' as const, label: 'Count in this year', note: 'the full straddling bill is attributed to this reporting year' },
                    { choice: 'next_year' as const, label: 'Count in next year', note: 'the full straddling bill is attributed to the next reporting year (excluded here)' },
                  ]).map(opt => (
                    <button
                      key={opt.choice}
                      onClick={() => onAddCoverageResolution({
                        locId,
                        fuelType: fuelOfStrip,
                        kind: 'straddle',
                        straddleChoice: opt.choice,
                        daysInYear: cov.straddles[0]?.daysInYear,
                        totalDays: cov.straddles[0]?.totalDays,
                        note: `Boundary-straddling bill for ${fuelOfStrip || 'this fuel'} resolved by "${opt.label}" — ${opt.note}.`,
                        acknowledgedAt: new Date().toISOString(),
                      })}
                      style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: opt.choice === 'prorate' ? '#0F6E56' : '#fff', color: opt.choice === 'prorate' ? '#fff' : '#555553', border: opt.choice === 'prorate' ? 'none' : '0.5px solid #e8e7e4', cursor: 'pointer' }}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          )
        })
      })()}
      {docs.map(doc => (
        <div key={doc.id} style={{ padding: '3px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: '#0d0d0d' }}>✓ {doc.file_name}</span>
            <button onClick={() => onRemove(locIdx, doc.id, doc.file_path)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none' }}>Remove</button>
          </div>
          {doc.extracted && doc.extracted.length > 0 && (
            <div style={{ marginTop: 4, marginLeft: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {doc.extracted.map((p, pi) => (
                <div key={pi} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7425e3' }}>ThemisIQ read</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{p.value != null ? `${p.value.toLocaleString()} ${p.unit ?? ''}` : '—'}</span>
                    <span style={{ fontSize: 11, color: '#888784' }}>{p.fuelType.replace('_', ' ')}</span>
                    {(p.periodStart || p.periodEnd) && <span style={{ fontSize: 11, color: '#888784' }}>· {p.periodStart ?? '?'} → {p.periodEnd ?? '?'}</span>}
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: p.status === 'needs_manual_review' ? '#FEF3E2' : '#E1F5EE', color: p.status === 'needs_manual_review' ? '#ba7517' : '#0F6E56' }}>
                      {p.status === 'needs_manual_review' ? 'NEEDS REVIEW' : p.confidence.toUpperCase()}
                    </span>
                  </div>
                  {p.sourceQuote && <div style={{ fontSize: 11, color: '#888784', fontStyle: 'italic', marginTop: 2 }}>“{p.sourceQuote}”</div>}
                  {p.conversionNote && <div style={{ fontSize: 11, color: '#555553', marginTop: 2 }}>{p.conversionNote}</div>}
                  {editing === `${doc.id}:${pi}` ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <input type="number" value={editVal} onChange={e => setEditVal(e.target.value)} placeholder="corrected value" style={{ fontSize: 12, padding: '4px 8px', border: '0.5px solid #e8e7e4', borderRadius: 6, width: 130 }} />
                      <span style={{ fontSize: 11, color: '#888784' }}>{p.unit ?? ''}</span>
                      <button onClick={() => { const v = Number(editVal); if (Number.isFinite(v)) { onUpdateProposal(locIdx, doc.id, pi, { value: v, status: 'confirmed' }); setEditing(null) } }} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(null)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#f8f7f5', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      {p.status === 'confirmed' ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0F6E56' }}>✓ Confirmed</span>
                      ) : (
                        <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'confirmed' })} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#0F6E56', color: '#fff', border: 'none', cursor: 'pointer' }}>Confirm</button>
                      )}
                      <button onClick={() => { setEditing(`${doc.id}:${pi}`); setEditVal(p.value != null ? String(p.value) : '') }} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => onUpdateProposal(locIdx, doc.id, pi, { status: 'needs_manual_review' })} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: '#fff', color: '#ba7517', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>Flag for review</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function QuestionCard({ question, hint, checked, onToggle, children }: { question: string; hint: string; checked: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }} onClick={() => onToggle(!checked)}>
        <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, background: checked ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{question}</div>
          <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>{hint}</div>
        </div>
      </div>
      {checked && children && <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}><div style={{ paddingTop: '1rem' }}>{children}</div></div>}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: hint ? 4 : 6 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

const unitBtn = (active: boolean): React.CSSProperties => ({ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: active ? '#7425e3' : '#f8f7f5', color: active ? '#fff' : '#555553', border: `0.5px solid ${active ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' })
const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }
const wTd: React.CSSProperties = { padding: '6px 10px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 11, verticalAlign: 'top' }
const qHint: React.CSSProperties = { fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '0.75rem' }
export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center', color: '#888784' }}>Loading…</div>}>
      <GHGPage />
    </Suspense>
  )
}

interface AuditRow {
  id: string
  action: string
  old_values: any
  new_values: any
  user_email: string | null
  created_at: string
}

// Fields worth surfacing in the diff (skip noisy/internal ones)
const TRACKED_FIELDS: Record<string, string> = {
  company_name: 'Company name',
  reporting_year: 'Reporting year',
  scope1_total: 'Scope 1 total (mtCO₂e)',
  scope2_location_total: 'Scope 2 location-based (mtCO₂e)',
  scope2_market_total: 'Scope 2 market-based (mtCO₂e)',
  revenue_millions: 'Revenue (USD M)',
  employee_count: 'Employees',
  boundary_approach: 'Boundary approach',
  selected_frameworks: 'Frameworks',
  status: 'Status',
}

function fmt(v: any): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.join(', ') || '—'
  if (typeof v === 'number') return String(v)
  return String(v)
}

function diffRow(oldV: any, newV: any): { label: string; from: string; to: string }[] {
  const changes: { label: string; from: string; to: string }[] = []
  const o = oldV || {}
  const n = newV || {}
  for (const key of Object.keys(TRACKED_FIELDS)) {
    const before = fmt(o[key])
    const after = fmt(n[key])
    if (before !== after) changes.push({ label: TRACKED_FIELDS[key], from: before, to: after })
  }
  return changes
}

function AuditTrail({ inventoryId, step }: { inventoryId: string | null; step: number }) {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!inventoryId) return
    setLoading(true)
    supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', 'ghg_inventories')
      .eq('record_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: AuditRow[] | null }) => {
        setRows(res.data || [])
        setLoading(false)
      })
  }, [inventoryId, step])

  if (!inventoryId) {
    return (
      <div>
        <h2 style={auditSectionHead}>Audit trail</h2>
        <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 6 }}>No history yet</div>
          <div style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.6 }}>Your audit trail will appear here once you save your inventory. Use the &ldquo;Save draft&rdquo; button at the top right to create the first entry.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 style={auditSectionHead}>Audit trail</h2>
      <p style={auditSectionSub}>Every change to this inventory is recorded automatically — who, what, and when — in a tamper-evident log. This is the record your verifier reviews.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Append-only record</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: 300 }}>{rows.length} change{rows.length !== 1 ? 's' : ''} logged · entries cannot be edited or deleted</div>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>ISO 14064-3 / ISAE 3410 traceability</div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '2rem', color: '#888784', fontSize: 13 }}>Loading history…</div>}

      {!loading && rows.length === 0 && (
        <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '2rem', textAlign: 'center', fontSize: 13, color: '#555553' }}>No entries recorded yet.</div>
      )}

      {!loading && rows.map((row, i) => {
        const isCreate = row.action === 'INSERT'
        const isDelete = row.action === 'DELETE'
        const changes = row.action === 'UPDATE' ? diffRow(row.old_values, row.new_values) : []
        const color = isCreate ? '#0F6E56' : isDelete ? '#B91C1C' : '#7425e3'
        const bg = isCreate ? '#E1F5EE' : isDelete ? '#FCEBEB' : '#EDE9FE'
        const actionLabel = isCreate ? 'Created' : isDelete ? 'Deleted' : 'Updated'
        return (
          <div key={row.id} style={{ position: 'relative', paddingLeft: 28, paddingBottom: i < rows.length - 1 ? 18 : 0 }}>
            {i < rows.length - 1 && <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 2, background: '#e8e7e4' }} />}
            <div style={{ position: 'absolute', left: 0, top: 4, width: 16, height: 16, borderRadius: '50%', background: color, border: '3px solid #fff', boxShadow: '0 0 0 1px #e8e7e4' }} />
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: changes.length ? 10 : 0, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color, background: bg, padding: '3px 10px', borderRadius: 99 }}>{actionLabel}</span>
                  <span style={{ fontSize: 12, color: '#555553' }}>{row.user_email || 'System'}</span>
                </div>
                <span style={{ fontSize: 11, color: '#888784' }}>{new Date(row.created_at).toLocaleString()}</span>
              </div>
              {changes.length > 0 && (
                <div style={{ borderTop: '0.5px solid #f0efed', paddingTop: 10 }}>
                  {changes.map((c, j) => (
                    <div key={j} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8, alignItems: 'center', fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: '#555553' }}>{c.label}</span>
                      <span style={{ color: '#888784', textDecoration: 'line-through' }}>{c.from}</span>
                      <span style={{ color: '#888784' }}>→</span>
                      <span style={{ color: '#0d0d0d', fontWeight: 500 }}>{c.to}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const auditSectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const auditSectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }


interface VerifierGrant {
  id: string
  token: string
  verifier_name: string | null
  verifier_email: string | null
  status: string
  expires_at: string
  created_at: string
}

function VerifierInvite({ inventoryId }: { inventoryId: string | null }) {
  const [grants, setGrants] = useState<VerifierGrant[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const load = () => {
    if (!inventoryId) return
    supabase
      .from('verifier_access')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .then((res: { data: VerifierGrant[] | null }) => setGrants(res.data || []))
  }

  useEffect(() => { load() }, [inventoryId])

  const createInvite = async () => {
    if (!inventoryId) return
    setCreating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { alert('Please sign in to invite a verifier.'); setCreating(false); return }
    const { error } = await supabase.from('verifier_access').insert({
      inventory_id: inventoryId,
      customer_user_id: session.user.id,
      verifier_name: name || null,
      verifier_email: email || null,
    })
    setCreating(false)
    if (error) { alert('Could not create invitation: ' + error.message); return }
    setName(''); setEmail(''); load()
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.from('verifier_access')
      .update({ status: 'revoked', revoked_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('Could not revoke: ' + error.message); return }
    load()
  }

  const linkFor = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : 'https://www.themisiq.co'}/verify/${token}`

  const copy = (token: string, id: string) => {
    navigator.clipboard.writeText(linkFor(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!inventoryId) return null

  const active = grants.filter(g => g.status === 'active')

  return (
    <div style={{ marginTop: '2.5rem', borderTop: '0.5px solid #e8e7e4', paddingTop: '2rem' }}>
      <h3 style={{ fontFamily: 'Georgia, serif', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 6 }}>Invite a verifier</h3>
      <p style={{ fontSize: 13, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '1.25rem' }}>
        Generate a secure, read-only link for your independent assurance provider. They&apos;ll see this inventory&apos;s summary, methodology, and full audit trail &mdash; with no ability to edit. Links expire in 90 days, and you can revoke access at any time.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} placeholder="Verifier name (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <input value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} placeholder="Verifier email (optional)" style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '10px 12px', borderRadius: 8, border: '0.5px solid #e8e7e4' }} />
        <button onClick={createInvite} disabled={creating} style={{ fontSize: 13, fontWeight: 500, padding: '10px 20px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: creating ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{creating ? 'Generating…' : 'Generate verifier link'}</button>
      </div>

      {active.length === 0 && (
        <div style={{ fontSize: 12, color: '#888784', fontStyle: 'italic' }}>No active verifier links yet.</div>
      )}

      {active.map(g => (
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
