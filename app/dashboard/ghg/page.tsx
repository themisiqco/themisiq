'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

const GWP = {
  AR4: { CO2: 1, CH4: 25, N2O: 298 },
  AR5: { CO2: 1, CH4: 28, N2O: 265 },
}

const EF = {
  natural_gas_mcf: { co2: 52.91, ch4: 0.10, n2o: 0.10 },
  natural_gas_therms: { co2: 5.291, ch4: 0.010, n2o: 0.010 },
  natural_gas_mmbtu: { co2: 52.87, ch4: 0.10, n2o: 0.09 },
  propane_gallon: { co2: 5.68, ch4: 0.003, n2o: 0.003 },
  propane_litre: { co2: 1.500, ch4: 0.001, n2o: 0.001 },
  diesel_gallon: { co2: 10.15, ch4: 0.003, n2o: 0.06 },
  diesel_litre: { co2: 2.681, ch4: 0.001, n2o: 0.016 },
  fuel_oil_gallon: { co2: 10.10, ch4: 0.003, n2o: 0.06 },
  gasoline_gallon: { co2: 8.71, ch4: 0.005, n2o: 0.056 },
  gasoline_litre: { co2: 2.301, ch4: 0.001, n2o: 0.015 },
  diesel_mobile_gallon: { co2: 10.15, ch4: 0.003, n2o: 0.06 },
  diesel_mobile_litre: { co2: 2.681, ch4: 0.001, n2o: 0.016 },
  r22: 1810, r134a: 1430, r404a: 3922, r410a: 2088, r507: 3985, ammonia: 0,
  us_average: 0.3866, mro: 0.4891, serc: 0.3629, wecc: 0.2877,
  npcc: 0.1967, spp: 0.4652, frcc: 0.4051, hicc: 0.6389, ascc: 0.5893,
  steam_mmbtu: 66.4,
}

const EF_SOURCES = {
  combustion: 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories',
  electricity: 'US EPA eGRID (2023) subregion location-based factors',
  gwp_ar4: 'IPCC AR4 (2007) — required by CARB SB 253 and CDP default',
  gwp_ar5: 'IPCC AR5 (2014) — required by ESRS E1 and GRI 305',
}

const GRID_REGIONS = [
  { value: 'us_average', label: "US Average (use if unknown)", ef: 0.3866 },
  { value: 'mro', label: 'Midwest (IL, MI, MN, WI, ND, SD, NE, MO, KS, IA)', ef: 0.4891 },
  { value: 'serc', label: 'Southeast (AL, GA, FL, TN, SC, NC, VA, KY, MS)', ef: 0.3629 },
  { value: 'wecc', label: 'West (CA, OR, WA, NV, AZ, UT, CO, ID, MT, WY)', ef: 0.2877 },
  { value: 'npcc', label: 'Northeast (NY, NJ, CT, MA, RI, VT, NH, ME)', ef: 0.1967 },
  { value: 'spp', label: 'South Central (TX, OK, AR, LA, KS, NE, MO)', ef: 0.4652 },
  { value: 'frcc', label: 'Florida', ef: 0.4051 },
]

function detectGridRegion(state: string): string {
  const s = state.toUpperCase().trim()
  const map: Record<string, string> = {
    'IL': 'mro', 'MI': 'mro', 'MN': 'mro', 'WI': 'mro', 'ND': 'mro', 'SD': 'mro', 'NE': 'mro', 'MO': 'mro', 'KS': 'mro', 'IA': 'mro',
    'AL': 'serc', 'GA': 'serc', 'TN': 'serc', 'SC': 'serc', 'NC': 'serc', 'VA': 'serc', 'KY': 'serc', 'MS': 'serc',
    'CA': 'wecc', 'OR': 'wecc', 'WA': 'wecc', 'NV': 'wecc', 'AZ': 'wecc', 'UT': 'wecc', 'CO': 'wecc', 'ID': 'wecc', 'MT': 'wecc', 'WY': 'wecc',
    'NY': 'npcc', 'NJ': 'npcc', 'CT': 'npcc', 'MA': 'npcc', 'RI': 'npcc', 'VT': 'npcc', 'NH': 'npcc', 'ME': 'npcc',
    'TX': 'spp', 'OK': 'spp', 'AR': 'spp', 'LA': 'spp',
    'FL': 'frcc',
  }
  return map[s] || 'us_average'
}

const FRAMEWORKS = [
  {
    id: 'sb253', name: 'SB 253', full: 'California SB 253 — CARB', color: '#B91C1C', bg: '#FCEBEB',
    gwp: 'AR4', deadline: 'August 10, 2026',
    desc: 'Scope 1 + 2 disclosure for California-nexus companies with $1B+ global revenue',
    requires: ['revenue_millions', 'california_nexus'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'cdp', name: 'CDP', full: 'CDP Climate — C6/C7/C11', color: '#0C447C', bg: '#E6F1FB',
    gwp: 'AR4', deadline: 'Annual — July',
    desc: 'Full CDP Climate questionnaire Scope 1 + 2 disclosure with prior year comparison',
    requires: ['prior_year_s1', 'prior_year_s2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'esrs', name: 'ESRS E1', full: 'ESRS E1 — EU CSRD', color: '#7425e3', bg: '#EDE9FE',
    gwp: 'AR5', deadline: 'FY2024 (large EU companies)',
    desc: 'Full ESRS E1 disclosure — location AND market-based Scope 2, biogenic, by gas',
    requires: ['market_based_s2', 'renewable_energy_kwh', 'biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'gri', name: 'GRI 305', full: 'GRI 305 — Emissions', color: '#0F6E56', bg: '#E1F5EE',
    gwp: 'AR5', deadline: 'Annual',
    desc: 'GRI 305-1, 305-2, 305-3 disclosure — by gas (CO₂, CH₄, N₂O, HFCs separately)',
    requires: ['biogenic_co2'],
    intensity_denominator: 'revenue',
  },
  {
    id: 'ecovadis', name: 'EcoVadis', full: 'EcoVadis — E1 Module', color: '#ba7517', bg: '#FEF3E2',
    gwp: 'AR4', deadline: 'Annual — assessment cycle',
    desc: 'Simplified Scope 1 + 2 total with revenue and employee intensity ratios',
    requires: ['employee_count'],
    intensity_denominator: 'both',
  },
  {
    id: 'ifrs', name: 'IFRS S2', full: 'IFRS S2 — Climate Disclosures', color: '#555553', bg: '#f8f7f5',
    gwp: 'AR4', deadline: 'Jurisdiction dependent',
    desc: 'GHG inventory component of IFRS S2 — feeds into physical and transition risk disclosure',
    requires: ['revenue_millions'],
    intensity_denominator: 'revenue',
  },
]

interface SourceDoc { id: string; file_name: string; document_type: string; uploaded_at: string; file_path: string }

interface Location {
  id: string; name: string; state: string; country: string
  has_natural_gas: boolean; natural_gas_amount: number; natural_gas_unit: 'mcf' | 'therms' | 'mmbtu'
  has_propane: boolean; propane_amount: number; propane_unit: 'gallons' | 'litres'
  has_diesel_stationary: boolean; diesel_stationary_amount: number; diesel_stationary_unit: 'gallons' | 'litres'
  has_fuel_oil: boolean; fuel_oil_gallons: number
  has_mobile: boolean; gasoline_amount: number; gasoline_unit: 'gallons' | 'litres'; diesel_mobile_amount: number; diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean; has_hfc_refrigerants: boolean; refrigerant_type: string; refrigerant_purchased_kg: number
  electricity_kwh: number; grid_region: string; renewable_electricity_kwh: number
  has_purchased_steam: boolean; purchased_steam_mmbtu: number
  biogenic_co2_mt: number
  source_docs: SourceDoc[]
}

interface Inventory {
  company_name: string; reporting_year: number; revenue_millions: number
  employee_count: number; boundary_approach: string
  california_nexus: boolean
  prior_year_s1: number; prior_year_s2: number
  selected_frameworks: string[]
  locations: Location[]
}

const emptyLocation = (id: string, name: string, state = ''): Location => ({
  id, name, state, country: 'USA',
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil: false, fuel_oil_gallons: 0,
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average', renewable_electricity_kwh: 0,
  has_purchased_steam: false, purchased_steam_mmbtu: 0,
  biogenic_co2_mt: 0,
  source_docs: [],
})

function calcGas(ef: { co2: number; ch4: number; n2o: number }, amount: number, gwpVersion: 'AR4' | 'AR5') {
  const gwp = GWP[gwpVersion]
  return {
    co2: amount * ef.co2 / 1000,
    ch4: amount * ef.ch4 * gwp.CH4 / 1000,
    n2o: amount * ef.n2o * gwp.N2O / 1000,
    total: amount * (ef.co2 + ef.ch4 * gwp.CH4 + ef.n2o * gwp.N2O) / 1000,
  }
}

function calcLocation(loc: Location, gwpVersion: 'AR4' | 'AR5' = 'AR4') {
  let s1_stationary = 0, s1_mobile = 0
  const gases = { co2: 0, ch4: 0, n2o: 0 }
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    const ef = EF[`natural_gas_${loc.natural_gas_unit}` as keyof typeof EF] as { co2: number; ch4: number; n2o: number }
    const g = calcGas(ef, loc.natural_gas_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_propane && loc.propane_amount > 0) {
    const ef = EF[`propane_${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF] as { co2: number; ch4: number; n2o: number }
    const g = calcGas(ef, loc.propane_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_diesel_stationary && loc.diesel_stationary_amount > 0) {
    const ef = EF[`diesel_${loc.diesel_stationary_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF] as { co2: number; ch4: number; n2o: number }
    const g = calcGas(ef, loc.diesel_stationary_amount, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_fuel_oil && loc.fuel_oil_gallons > 0) {
    const g = calcGas(EF.fuel_oil_gallon as any, loc.fuel_oil_gallons, gwpVersion)
    s1_stationary += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
  }
  if (loc.has_mobile) {
    if (loc.gasoline_amount > 0) {
      const ef = EF[`gasoline_${loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF] as { co2: number; ch4: number; n2o: number }
      const g = calcGas(ef, loc.gasoline_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
    if (loc.diesel_mobile_amount > 0) {
      const ef = EF[`diesel_mobile_${loc.diesel_mobile_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF] as { co2: number; ch4: number; n2o: number }
      const g = calcGas(ef, loc.diesel_mobile_amount, gwpVersion)
      s1_mobile += g.total; gases.co2 += g.co2; gases.ch4 += g.ch4; gases.n2o += g.n2o
    }
  }
  const ref_gwp = EF[loc.refrigerant_type as keyof typeof EF] as number || 0
  const s1_fugitive = (!loc.uses_ammonia && loc.has_hfc_refrigerants) ? loc.refrigerant_purchased_kg * ref_gwp / 1000 : 0
  const s1_total = s1_stationary + s1_mobile + s1_fugitive
  const grid_ef = EF[loc.grid_region as keyof typeof EF] as number || EF.us_average
  const s2_location = (loc.electricity_kwh * grid_ef + (loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0)) / 1000
  const s2_market = ((loc.electricity_kwh - loc.renewable_electricity_kwh) * grid_ef + (loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0)) / 1000
  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location, s2_market, gases, biogenic: loc.biogenic_co2_mt }
}

function calcInventory(locations: Location[], gwpVersion: 'AR4' | 'AR5' = 'AR4') {
  return locations.reduce((acc, loc) => {
    const c = calcLocation(loc, gwpVersion)
    return {
      s1_total: acc.s1_total + c.s1_total,
      s2_location: acc.s2_location + c.s2_location,
      s2_market: acc.s2_market + c.s2_market,
      co2: acc.co2 + c.gases.co2,
      ch4: acc.ch4 + c.gases.ch4,
      n2o: acc.n2o + c.gases.n2o,
      biogenic: acc.biogenic + c.biogenic,
    }
  }, { s1_total: 0, s2_location: 0, s2_market: 0, co2: 0, ch4: 0, n2o: 0, biogenic: 0 })
}

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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You are a friendly GHG inventory expert assistant built into the ThemisIQ platform. The user is on step ${currentStep + 1} of 6: ${stepNames[currentStep]}. Help them complete their GHG inventory with confidence. Key facts: Scope 1 = direct emissions (fuel, refrigerants). Scope 2 = purchased electricity/steam. Mcf = thousand cubic feet of natural gas. MMBtu = million British thermal units. eGRID = US electricity grid regions. AR4/AR5 = IPCC GWP versions. Keep answers concise and practical.`,
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
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem', color: '#0d0d0d', marginBottom: 8 }}>Your GHG inventory is complete.</div>
        <div style={{ fontSize: 13, color: '#555553', lineHeight: 1.7, marginBottom: '1.5rem', fontWeight: 300 }}>Your Scope 1 and Scope 2 emissions have been calculated to {frameworks.join(', ')} standards, with full calculation workings ready for third-party assurance. Unlock your submission-ready reports with one click.</div>
        <div style={{ background: '#f8f7f5', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' as const }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>What you unlock</div>
          {[
            ['📄', 'Submission-ready reports for all selected frameworks'],
            ['🔒', 'Assurance-ready evidence uploads per emission source'],
            ['📊', 'Full calculation workings export (ISO 14064-3)'],
            ['🔄', 'Unlimited updates throughout your reporting year'],
            ['✅', 'Priority support through your filing deadline'],
          ].map(([icon, text]) => (
            <div key={text as string} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = '/signup?upgrade=true'} style={{ width: '100%', fontSize: 14, fontWeight: 600, padding: '14px 28px', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 10, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d' }}>
          Unlock My Reports →
        </button>
        <div style={{ fontSize: 11, color: '#888784' }}>Secure payment · Instant access · Cancel anytime</div>
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
export default function GHGPage() {
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '', reporting_year: 2024, revenue_millions: 0, employee_count: 0,
    boundary_approach: 'operational_control', california_nexus: false,
    prior_year_s1: 0, prior_year_s2: 0,
    selected_frameworks: ['sb253'],
    locations: [emptyLocation('1', 'Location 1')],
  })
  const [activeLocation, setActiveLocation] = useState(0)
  const [saved, setSaved] = useState(false)
  const [inventoryId, setInventoryId] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [showWorkings, setShowWorkings] = useState<Record<string, boolean>>({})
  const [activeExport, setActiveExport] = useState('sb253')
  const isPaid = false // TODO: wire to Stripe

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const { data } = await supabase
        .from('ghg_inventories')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('reporting_year', 2024)
        .single()
      if (data) {
        setInventoryId(data.id)
        setInventory(inv => ({
          ...inv,
          company_name: data.company_name || '',
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
      }
    })
  }, [])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      locs[idx] = { ...locs[idx], [field]: value }
      if (field === 'state') locs[idx].grid_region = detectGridRegion(value)
      return { ...inv, locations: locs }
    })
  }

  const addLocation = () => {
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
    if (!session) return
    for (const file of Array.from(files)) {
      const path = `${session.user.id}/${inventory.reporting_year}/${inventory.locations[locIdx].name.replace(/\s+/g, '_')}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('source-documents').upload(path, file)
      if (!error) {
        const doc: SourceDoc = { id: Date.now().toString(), file_name: file.name, document_type: docType, uploaded_at: new Date().toISOString(), file_path: path }
        updateLocation(locIdx, 'source_docs', [...inventory.locations[locIdx].source_docs, doc])
      }
    }
    setUploading(false)
  }

  const removeDoc = async (locIdx: number, docId: string, filePath: string) => {
    await supabase.storage.from('source-documents').remove([filePath])
    updateLocation(locIdx, 'source_docs', inventory.locations[locIdx].source_docs.filter(d => d.id !== docId))
  }

  const needsMarketBased = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')
  const needsPriorYear = inventory.selected_frameworks.includes('cdp')
  const needsEmployees = inventory.selected_frameworks.includes('ecovadis')
  const needsBiogenic = inventory.selected_frameworks.includes('esrs') || inventory.selected_frameworks.includes('gri')

  const totals_ar4 = calcInventory(inventory.locations, 'AR4')
  const totals_ar5 = calcInventory(inventory.locations, 'AR5')

  const STEPS = ['Reporting frameworks', 'Company setup', 'Energy & fuel data', 'Additional data', 'Review & workings', 'Export reports']
  const activeFrameworks = FRAMEWORKS.filter(f => inventory.selected_frameworks.includes(f.id))

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Which reporting frameworks do you need?</h2>
      <p style={sectionSub}>Select all that apply. ThemisIQ collects your data once and generates each report automatically — no duplicate entry required.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginBottom: '2rem' }}>
        {FRAMEWORKS.map(fw => {
          const selected = inventory.selected_frameworks.includes(fw.id)
          return (
            <div key={fw.id} onClick={() => toggleFramework(fw.id)} style={{ background: selected ? fw.bg : '#fff', border: `1.5px solid ${selected ? fw.color : '#e8e7e4'}`, borderRadius: 12, padding: '1.25rem', cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                <div>
                  <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: fw.color, background: fw.bg, border: `0.5px solid ${fw.color}33`, borderRadius: 6, padding: '2px 8px', marginBottom: 6 }}>{fw.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{fw.full}</div>
                </div>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${selected ? fw.color : '#e8e7e4'}`, background: selected ? fw.color : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
          <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value}))} placeholder="e.g. Acme Industries Inc." style={inputStyle} />
        </Field>
        <Field label="Reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            <option value={2024}>2024</option>
            <option value={2023}>2023</option>
            <option value={2025}>2025</option>
          </select>
        </Field>
        <Field label="Global annual revenue (USD millions)" hint="Required by CARB SB 253, CDP, ESRS E1, EcoVadis, and IFRS S2 for emission intensity calculations">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            <input type="number" value={inventory.revenue_millions || ''} onChange={e => setInventory(i => ({...i, revenue_millions: Number(e.target.value)}))} placeholder="1000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 13, color: '#555553', whiteSpace: 'nowrap' }}>million USD</span>
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
              <button onClick={() => setInventory(i => ({...i, california_nexus: true}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: inventory.california_nexus ? '#B91C1C' : '#f8f7f5', color: inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${inventory.california_nexus ? '#B91C1C' : '#e8e7e4'}`, cursor: 'pointer' }}>Yes</button>
              <button onClick={() => setInventory(i => ({...i, california_nexus: false}))} style={{ fontSize: 13, padding: '8px 20px', borderRadius: 8, background: !inventory.california_nexus ? '#0d0d0d' : '#f8f7f5', color: !inventory.california_nexus ? '#fff' : '#555553', border: `0.5px solid ${!inventory.california_nexus ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>No</button>
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
                <input value={loc.state} onChange={e => updateLocation(i, 'state', e.target.value)} placeholder="State" style={{ ...inputStyle, width: 70 }} />
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add location</button>
          </div>
        </Field>
      </div>
    </div>
  )

  const renderStep2 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc, 'AR4')
    const detectedRegion = GRID_REGIONS.find(r => r.value === loc.grid_region)
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
          <button onClick={addLocation} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer' }}>+ Add location</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>
            <QuestionCard question="Does this location use natural gas?" hint="For heating, boilers, furnaces — check your gas utility bills" checked={loc.has_natural_gas} onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}>
              {loc.has_natural_gas && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <p style={qHint}>What unit does your gas supplier show on bills?</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[['mcf', 'Mcf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={unitBtn(loc.natural_gas_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total natural gas — ${inventory.reporting_year} (${loc.natural_gas_unit})`} hint="Sum of all 12 monthly bills for this location">
                    <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload gas bills" locIdx={activeLocation} docType="utility_bill_gas" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_gas')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload gas bills" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location use propane or LPG?" hint="For forklifts and heating — check delivery records" checked={loc.has_propane} onToggle={v => updateLocation(activeLocation, 'has_propane', v)}>
              {loc.has_propane && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={unitBtn(loc.propane_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased — ${inventory.reporting_year} (${loc.propane_unit})`}>
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload propane delivery records" locIdx={activeLocation} docType="fuel_propane" docs={loc.source_docs.filter(d => d.document_type === 'fuel_propane')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload propane delivery records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location use diesel in stationary equipment?" hint="Backup generators, boilers — not vehicles" checked={loc.has_diesel_stationary} onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}>
              {loc.has_diesel_stationary && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={unitBtn(loc.diesel_stationary_unit === val)}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel in stationary equipment — ${inventory.reporting_year}`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload diesel purchase records" locIdx={activeLocation} docType="fuel_diesel" docs={loc.source_docs.filter(d => d.document_type === 'fuel_diesel')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload diesel purchase records" />}
                </div>
              )}
            </QuestionCard>
            <QuestionCard question="Does this location have company-owned vehicles or mobile equipment?" hint="Delivery trucks, forklifts, company cars — check fleet fuel cards" checked={loc.has_mobile} onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}>
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <Field label={`Gasoline for company vehicles — ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        <option value="gallons">US gallons</option>
                        <option value="litres">Litres</option>
                      </select>
                    </div>
                  </Field>
                  <Field label={`Diesel for company vehicles — ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        <option value="gallons">US gallons</option>
                        <option value="litres">Litres</option>
                      </select>
                    </div>
                  </Field>
                  {isPaid ? <DocUpload label="Upload fleet fuel records" locIdx={activeLocation} docType="fleet_fuel" docs={loc.source_docs.filter(d => d.document_type === 'fleet_fuel')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload fleet fuel records" />}
                </div>
              )}
            </QuestionCard>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Does this location have refrigeration or cooling?</div>
              <p style={qHint}>Large commercial refrigeration systems are common emission sources.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, cursor: 'pointer' }}>Ammonia (NH₃)</button>
                <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? '#7425e3' : '#f8f7f5', color: loc.has_hfc_refrigerants ? '#fff' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>HFC refrigerants</button>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#555553' : '#f8f7f5', color: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#fff' : '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>None</button>
              </div>
              {loc.uses_ammonia && <div style={{ background: '#E1F5EE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0F6E56', fontWeight: 500 }}>✓ Ammonia has zero global warming potential — no further data needed</div>}
              {loc.has_hfc_refrigerants && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ background: '#FEF3E2', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#633806' }}>Check refrigeration service records — refrigerant purchased for top-up = refrigerant leaked (GHG Protocol methodology)</div>
                  <Field label="Refrigerant type"><select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}><option value="r410a">R-410A</option><option value="r22">R-22</option><option value="r134a">R-134a</option><option value="r404a">R-404A</option><option value="r507">R-507</option></select></Field>
                  <Field label="Refrigerant purchased for top-up this year (kg)" hint="From service records or supplier invoices">
                    <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  {isPaid ? <DocUpload label="Upload service records" locIdx={activeLocation} docType="service_record" docs={loc.source_docs.filter(d => d.document_type === 'service_record')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload service records" />}
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
                {loc.state
                  ? <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>✓ Grid region auto-detected: <strong>{detectedRegion?.label}</strong> — {detectedRegion?.ef} kg CO₂e/kWh (eGRID 2023)</div>
                  : <Field label="Grid region"><select value={loc.grid_region} onChange={e => updateLocation(activeLocation, 'grid_region', e.target.value)} style={inputStyle}>{GRID_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label} — {r.ef} kg CO₂e/kWh</option>)}</select></Field>
                }
                {isPaid ? <DocUpload label="Upload electricity bills" locIdx={activeLocation} docType="utility_electricity" docs={loc.source_docs.filter(d => d.document_type === 'utility_electricity')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload electricity bills" />}
              </div>
            </div>
          </div>
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>{loc.name} — live results</div>
              {[
                { label: 'Heating & fuel', val: calc.s1_stationary, color: '#7425e3' },
                { label: 'Vehicles', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Refrigerants', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Scope 1 total', val: calc.s1_total, color: '#fff', bold: true },
                { label: 'Scope 2 (electricity)', val: calc.s2_location, color: '#64fe3e', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: bold ? 600 : 300 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} mt</span>
                </div>
              ))}
              <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>EPA 2024 · IPCC AR4 GWP · eGRID 2023</div>
            </div>
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>All locations</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#7425e3' }}>{totals_ar4.s1_total.toFixed(2)} mt Scope 1</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginTop: 4 }}>{totals_ar4.s2_location.toFixed(2)} mt Scope 2</div>
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
                </div>
              ))}
              {isPaid ? <DocUpload label="Upload renewable energy certificates or PPA contracts" locIdx={0} docType="renewable_cert" docs={inventory.locations[0].source_docs.filter(d => d.document_type === 'renewable_cert')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} /> : <LockedDocUpload label="Upload renewable energy certificates or PPA contracts" />}
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
    const ar4 = totals_ar4
    const ar5 = totals_ar5
    const rev = inventory.revenue_millions
    const emp = inventory.employee_count
    return (
      <div>
        <h2 style={sectionHead}>Review, results & calculation workings</h2>
        <p style={sectionSub}>Your complete GHG inventory for {inventory.company_name || 'your company'}, {inventory.reporting_year}.</p>
        <div style={{ position: 'relative' }}>
          {!isPaid && <PaywallOverlay frameworks={activeFrameworks.map(f => f.name)} />}
          <div style={{ filter: isPaid ? 'none' : 'blur(4px)', pointerEvents: isPaid ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: '2rem' }}>
              {activeFrameworks.map(fw => {
                const totals = fw.gwp === 'AR4' ? ar4 : ar5
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
                    {rev > 0 && <div style={{ fontSize: 11, color: '#888784', marginTop: 4 }}>Intensity: {(totals.s1_total / rev).toFixed(4)} mt/$M</div>}
                    {emp > 0 && fw.id === 'ecovadis' && <div style={{ fontSize: 11, color: '#888784' }}>Per employee: {(totals.s1_total / emp * 1000).toFixed(2)} kgCO₂e</div>}
                  </div>
                )
              })}
            </div>
            {inventory.locations.map((loc, i) => {
              const c = calcLocation(loc, 'AR4')
              const key = `loc_${i}`
              return (
                <div key={loc.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
                  <div onClick={() => setShowWorkings(w => ({...w, [key]: !w[key]}))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer' }}>
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
                          {loc.has_natural_gas && loc.natural_gas_amount > 0 && (() => {
                            const efKey = `natural_gas_${loc.natural_gas_unit}` as keyof typeof EF
                            const ef = EF[efKey] as { co2: number; ch4: number; n2o: number }
                            const total = (ef.co2 + ef.ch4 * GWP.AR4.CH4 + ef.n2o * GWP.AR4.N2O) * loc.natural_gas_amount / 1000
                            return <tr><td style={wTd}>Natural gas</td><td style={wTd}>{loc.natural_gas_amount} {loc.natural_gas_unit}</td><td style={wTd}>{(ef.co2 + ef.ch4 * GWP.AR4.CH4 + ef.n2o * GWP.AR4.N2O).toFixed(3)} kg CO₂e/{loc.natural_gas_unit}</td><td style={wTd}>{EF_SOURCES.combustion}</td><td style={wTd}>AR4</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.has_propane && loc.propane_amount > 0 && (() => {
                            const efKey = `propane_${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}` as keyof typeof EF
                            const ef = EF[efKey] as { co2: number; ch4: number; n2o: number }
                            const total = (ef.co2 + ef.ch4 * GWP.AR4.CH4 + ef.n2o * GWP.AR4.N2O) * loc.propane_amount / 1000
                            return <tr><td style={wTd}>Propane</td><td style={wTd}>{loc.propane_amount} {loc.propane_unit}</td><td style={wTd}>{(ef.co2 + ef.ch4 * GWP.AR4.CH4 + ef.n2o * GWP.AR4.N2O).toFixed(3)} kg CO₂e/{loc.propane_unit === 'gallons' ? 'gal' : 'L'}</td><td style={wTd}>{EF_SOURCES.combustion}</td><td style={wTd}>AR4</td><td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{total.toFixed(4)}</td></tr>
                          })()}
                          {loc.electricity_kwh > 0 && (() => {
                            const ef = EF[loc.grid_region as keyof typeof EF] as number || EF.us_average
                            return <tr style={{ background: '#f8f7f5' }}><td style={wTd}>Electricity (S2 location)</td><td style={wTd}>{loc.electricity_kwh.toLocaleString()} kWh</td><td style={wTd}>{ef.toFixed(4)} kg CO₂e/kWh</td><td style={wTd}>{EF_SOURCES.electricity} — {loc.grid_region}</td><td style={wTd}>N/A</td><td style={{ ...wTd, fontWeight: 600, color: '#0F6E56' }}>{(loc.electricity_kwh * ef / 1000).toFixed(4)}</td></tr>
                          })()}
                          <tr style={{ background: '#0d0d0d' }}><td colSpan={5} style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>TOTAL — {loc.name}</td><td style={{ ...wTd, color: '#fff', fontWeight: 700, background: '#0d0d0d' }}>{(c.s1_total + c.s2_location).toFixed(4)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 12 }}>Assurance readiness — ISO 14064-3 / ISAE 3410</div>
              {[
                { label: 'Emission factors cited with source and year', done: true, note: 'EPA 2024 · eGRID 2023 · IPCC AR4 + AR5 GWP' },
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
              const totals = fw.gwp === 'AR4' ? totals_ar4 : totals_ar5
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
                    <button onClick={() => generateExport(fw.id)} style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
                      ⬇ Download {fw.name} Report (CSV)
                    </button>
                  </div>
                  <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem', fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong>Disclaimer:</strong> This report was generated by the ThemisIQ platform and is provided for informational and planning purposes only. It does not constitute legal advice, regulatory assurance, or a professional opinion. All emissions data requires third-party verification before formal submission.
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const generateExport = async (frameworkId: string) => {
    const fw = FRAMEWORKS.find(f => f.id === frameworkId)!
    const totals = fw.gwp === 'AR4' ? totals_ar4 : totals_ar5
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
      ...(rev > 0 ? [['S1 intensity (mtCO₂e/$M revenue)', (totals.s1_total / rev).toFixed(6)]] : []),
      [''],
      ['METHODS'],
      ['Combustion factors', EF_SOURCES.combustion],
      ['Electricity factors', EF_SOURCES.electricity],
      ['GWP values', fw.gwp === 'AR4' ? EF_SOURCES.gwp_ar4 : EF_SOURCES.gwp_ar5],
      [''],
      ['LOCATION BREAKDOWN'],
      ['Location', 'State', 'S1 Total', 'S2 Location'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc, fw.gwp as 'AR4' | 'AR5')
        return [loc.name, loc.state, c.s1_total.toFixed(4), c.s2_location.toFixed(4)]
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
        <button onClick={async () => {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          const payload = {
            user_id: session.user.id,
            reporting_year: inventory.reporting_year,
            company_name: inventory.company_name,
            revenue_millions: inventory.revenue_millions,
            employee_count: inventory.employee_count,
            boundary_approach: inventory.boundary_approach,
            california_nexus: inventory.california_nexus,
            prior_year_s1: inventory.prior_year_s1,
            prior_year_s2: inventory.prior_year_s2,
            selected_frameworks: inventory.selected_frameworks,
            locations_data: inventory.locations,
            scope1_total: totals_ar4.s1_total,
            scope2_location_total: totals_ar4.s2_location,
            scope2_market_total: totals_ar4.s2_market,
            scope1_intensity: inventory.revenue_millions > 0 ? totals_ar4.s1_total / inventory.revenue_millions : 0,
            scope2_intensity: inventory.revenue_millions > 0 ? totals_ar4.s2_location / inventory.revenue_millions : 0,
            status: 'draft',
            updated_at: new Date().toISOString(),
          }
          if (inventoryId) {
            await supabase.from('ghg_inventories').update(payload).eq('id', inventoryId)
          } else {
            const { data } = await supabase.from('ghg_inventories').insert(payload).select().single()
            if (data) setInventoryId(data.id)
          }
          setSaved(true)
        }} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: saved ? '#E1F5EE' : '#f8f7f5', border: `0.5px solid ${saved ? '#0F6E56' : '#e8e7e4'}`, cursor: 'pointer', color: saved ? '#0F6E56' : '#555553', fontWeight: saved ? 500 : 400 }}>
          {saved ? '✓ Saved' : 'Save draft'}
        </button>
      </nav>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', overflowX: 'auto' as const }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 16px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400, whiteSpace: 'nowrap' as const }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => setStep(s => s+1)} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>Continue →</button>
          )}
        </div>
      </div>

      <GHGBot currentStep={step} />
    </div>
  )
}

function DocUpload({ label, locIdx, docType, docs, onUpload, onRemove, uploading }: { label: string; locIdx: number; docType: string; docs: SourceDoc[]; onUpload: (f: FileList, i: number, t: string) => void; onRemove: (i: number, id: string, path: string) => void; uploading: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: docs.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
        <button onClick={() => ref.current?.click()} disabled={uploading} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>{uploading ? 'Uploading...' : '+ Upload'}</button>
        <input ref={ref} type="file" multiple accept=".pdf,.xlsx,.csv,.jpg,.png" style={{ display: 'none' }} onChange={e => e.target.files && onUpload(e.target.files, locIdx, docType)} />
      </div>
      {docs.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
          <span style={{ color: '#0d0d0d' }}>✓ {doc.file_name}</span>
          <button onClick={() => onRemove(locIdx, doc.id, doc.file_path)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
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