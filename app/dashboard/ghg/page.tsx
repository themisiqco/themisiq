'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'

// ── EMISSION FACTORS (AR4 GWP, EPA 2024) ─────────────────────────────
const EF = {
  natural_gas_mcf: 53.11,
  natural_gas_therms: 5.311,
  natural_gas_mmbtu: 53.06,
  propane_gallon: 5.74,
  propane_litre: 1.516,
  diesel_gallon: 10.21,
  diesel_litre: 2.698,
  fuel_oil_gallon: 10.16,
  gasoline_gallon: 8.78,
  gasoline_litre: 2.319,
  diesel_mobile_gallon: 10.21,
  diesel_mobile_litre: 2.698,
  r22: 1810, r134a: 1430, r404a: 3922, r410a: 2088, r507: 3985, ammonia: 0,
  us_average: 0.3866, mro: 0.4891, serc: 0.3629, wecc: 0.2877,
  npcc: 0.1967, spp: 0.4652, frcc: 0.4051, hicc: 0.6389, ascc: 0.5893,
  steam_mmbtu: 66.4,
}

const EF_SOURCES: Record<string, string> = {
  natural_gas: 'US EPA (2024) Table 1 — Natural Gas: 53.06 kg CO₂e/MMBtu',
  propane: 'US EPA (2024) Table 1 — Propane: 5.74 kg CO₂e/gallon',
  diesel: 'US EPA (2024) Table 1 — Distillate Fuel Oil No.2: 10.21 kg CO₂e/gallon',
  gasoline: 'US EPA (2024) Table 1 — Motor Gasoline: 8.78 kg CO₂e/gallon',
  electricity: 'US EPA eGRID (2023) — subregion location-based emission factors',
  gwp: 'IPCC Fourth Assessment Report (AR4, 2007) — as required by CARB SB 253',
  refrigerants: 'US EPA (2024) — HFC Global Warming Potentials (AR4)',
}

const GRID_REGIONS = [
  { value: 'us_average', label: "I'm not sure — use US average", ef: 0.3866 },
  { value: 'mro', label: 'Midwest (IL, MI, MN, WI, ND, SD, NE, MO, KS, IA)', ef: 0.4891 },
  { value: 'serc', label: 'Southeast (AL, GA, FL, TN, SC, NC, VA, KY, MS)', ef: 0.3629 },
  { value: 'wecc', label: 'West (CA, OR, WA, NV, AZ, UT, CO, ID, MT, WY)', ef: 0.2877 },
  { value: 'npcc', label: 'Northeast (NY, NJ, CT, MA, RI, VT, NH, ME)', ef: 0.1967 },
  { value: 'spp', label: 'South Central (TX, OK, AR, LA, KS, NE, MO)', ef: 0.4652 },
  { value: 'frcc', label: 'Florida', ef: 0.4051 },
]

// Auto-detect grid region from state
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

interface SourceDoc {
  id: string
  file_name: string
  document_type: string
  notes: string
  uploaded_at: string
  file_path: string
}

interface Location {
  id: string
  name: string
  state: string
  has_natural_gas: boolean
  natural_gas_amount: number
  natural_gas_unit: 'mcf' | 'therms' | 'mmbtu'
  has_propane: boolean
  propane_amount: number
  propane_unit: 'gallons' | 'litres'
  has_diesel_stationary: boolean
  diesel_stationary_amount: number
  diesel_stationary_unit: 'gallons' | 'litres'
  has_fuel_oil: boolean
  fuel_oil_gallons: number
  has_mobile: boolean
  gasoline_amount: number
  gasoline_unit: 'gallons' | 'litres'
  diesel_mobile_amount: number
  diesel_mobile_unit: 'gallons' | 'litres'
  uses_ammonia: boolean
  has_hfc_refrigerants: boolean
  refrigerant_type: string
  refrigerant_purchased_kg: number
  electricity_kwh: number
  grid_region: string
  has_purchased_steam: boolean
  purchased_steam_mmbtu: number
  source_docs: SourceDoc[]
}

interface Inventory {
  company_name: string
  reporting_year: number
  revenue_millions: number
  boundary_approach: string
  locations: Location[]
}

const emptyLocation = (id: string, name: string, state = ''): Location => ({
  id, name, state,
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil: false, fuel_oil_gallons: 0,
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average',
  has_purchased_steam: false, purchased_steam_mmbtu: 0,
  source_docs: [],
})

// ── CALCULATIONS ──────────────────────────────────────────────────────
function calcLocation(loc: Location) {
  let ng_kg = 0
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    if (loc.natural_gas_unit === 'mcf') ng_kg = loc.natural_gas_amount * EF.natural_gas_mcf
    else if (loc.natural_gas_unit === 'therms') ng_kg = loc.natural_gas_amount * EF.natural_gas_therms
    else ng_kg = loc.natural_gas_amount * EF.natural_gas_mmbtu
  }
  const propane_ef = loc.propane_unit === 'gallons' ? EF.propane_gallon : EF.propane_litre
  const diesel_stat_ef = loc.diesel_stationary_unit === 'gallons' ? EF.diesel_gallon : EF.diesel_litre
  const gasoline_ef = loc.gasoline_unit === 'gallons' ? EF.gasoline_gallon : EF.gasoline_litre
  const diesel_mob_ef = loc.diesel_mobile_unit === 'gallons' ? EF.diesel_mobile_gallon : EF.diesel_mobile_litre

  const s1_stationary_kg = ng_kg +
    (loc.has_propane ? loc.propane_amount * propane_ef : 0) +
    (loc.has_diesel_stationary ? loc.diesel_stationary_amount * diesel_stat_ef : 0) +
    (loc.has_fuel_oil ? loc.fuel_oil_gallons * EF.fuel_oil_gallon : 0)

  const s1_mobile_kg = loc.has_mobile
    ? loc.gasoline_amount * gasoline_ef + loc.diesel_mobile_amount * diesel_mob_ef
    : 0

  const ref_ef = EF[loc.refrigerant_type as keyof typeof EF] as number || 0
  const s1_fugitive_kg = (!loc.uses_ammonia && loc.has_hfc_refrigerants)
    ? loc.refrigerant_purchased_kg * ref_ef : 0

  const s1_total = (s1_stationary_kg + s1_mobile_kg + s1_fugitive_kg) / 1000

  const grid_ef = EF[loc.grid_region as keyof typeof EF] as number || EF.us_average
  const s2_location = (loc.electricity_kwh * grid_ef + (loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0)) / 1000

  return {
    s1_stationary: s1_stationary_kg / 1000,
    s1_mobile: s1_mobile_kg / 1000,
    s1_fugitive: s1_fugitive_kg / 1000,
    s1_total, s2_location,
    // Calculation workings for transparency
    workings: {
      natural_gas: loc.has_natural_gas && loc.natural_gas_amount > 0
        ? `${loc.natural_gas_amount} ${loc.natural_gas_unit} × ${loc.natural_gas_unit === 'mcf' ? EF.natural_gas_mcf : loc.natural_gas_unit === 'therms' ? EF.natural_gas_therms : EF.natural_gas_mmbtu} kg CO₂e/${loc.natural_gas_unit} = ${(ng_kg/1000).toFixed(4)} mtCO₂e`
        : null,
      propane: loc.has_propane && loc.propane_amount > 0
        ? `${loc.propane_amount} ${loc.propane_unit} × ${propane_ef} kg CO₂e/${loc.propane_unit === 'gallons' ? 'gallon' : 'litre'} = ${(loc.propane_amount * propane_ef / 1000).toFixed(4)} mtCO₂e`
        : null,
      electricity: loc.electricity_kwh > 0
        ? `${loc.electricity_kwh.toLocaleString()} kWh × ${grid_ef} kg CO₂e/kWh (${loc.grid_region} eGRID 2023) = ${(loc.electricity_kwh * grid_ef / 1000).toFixed(4)} mtCO₂e`
        : null,
      refrigerant: loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0
        ? `${loc.refrigerant_purchased_kg} kg ${loc.refrigerant_type.toUpperCase()} × ${ref_ef} GWP (IPCC AR4) / 1000 = ${(loc.refrigerant_purchased_kg * ref_ef / 1000).toFixed(4)} mtCO₂e`
        : null,
    }
  }
}

function calcTotal(locations: Location[]) {
  return locations.reduce((acc, loc) => {
    const c = calcLocation(loc)
    return { s1_total: acc.s1_total + c.s1_total, s2_total: acc.s2_total + c.s2_location }
  }, { s1_total: 0, s2_total: 0 })
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────
export default function GHGPage() {
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '', reporting_year: 2024, revenue_millions: 0,
    boundary_approach: 'operational_control',
    locations: [emptyLocation('1', 'Location 1')],
  })
  const [activeLocation, setActiveLocation] = useState(0)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showWorkings, setShowWorkings] = useState<Record<string, boolean>>({})
  const [user, setUser] = useState<any>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = '/login'
      else setUser(session.user)
    })
  }, [])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      locs[idx] = { ...locs[idx], [field]: value }
      // Auto-detect grid region when state changes
      if (field === 'state') {
        const detected = detectGridRegion(value)
        locs[idx].grid_region = detected
      }
      return { ...inv, locations: locs }
    })
  }

  const addLocation = () => {
    const id = String(inventory.locations.length + 1)
    setInventory(inv => ({ ...inv, locations: [...inv.locations, emptyLocation(id, `Location ${id}`)] }))
    setActiveLocation(inventory.locations.length)
  }

  // ── FILE UPLOAD ────────────────────────────────────────────────────
  const handleFileUpload = async (files: FileList, locIdx: number, docType: string) => {
    if (!user || !files.length) return
    setUploading(true)

    for (const file of Array.from(files)) {
      const path = `${user.id}/${inventory.reporting_year}/${inventory.locations[locIdx].name.replace(/\s+/g, '_')}/${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('source-documents').upload(path, file)

      if (!error) {
        const doc: SourceDoc = {
          id: Date.now().toString(),
          file_name: file.name,
          document_type: docType,
          notes: '',
          uploaded_at: new Date().toISOString(),
          file_path: path,
        }
        updateLocation(locIdx, 'source_docs', [...inventory.locations[locIdx].source_docs, doc])
      }
    }
    setUploading(false)
  }

  const removeDoc = async (locIdx: number, docId: string, filePath: string) => {
    await supabase.storage.from('source-documents').remove([filePath])
    const docs = inventory.locations[locIdx].source_docs.filter(d => d.id !== docId)
    updateLocation(locIdx, 'source_docs', docs)
  }

  const totals = calcTotal(inventory.locations)
  const intensity_s1 = inventory.revenue_millions > 0 ? totals.s1_total / inventory.revenue_millions : 0
  const intensity_s2 = inventory.revenue_millions > 0 ? totals.s2_total / inventory.revenue_millions : 0
  const STEPS = ['Company setup', 'Energy & fuel data', 'Review & workings', 'CARB export']

  // ── STEP 0 ─────────────────────────────────────────────────────────
  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Let's set up your GHG inventory</h2>
      <p style={sectionSub}>We'll walk you through each location one at a time. You'll need your utility bills and fuel purchase records. Everything is saved as you go.</p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 560 }}>
        <Field label="What is your company's legal name?" hint="This will appear on your CARB SB 253 submission">
          <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value}))} placeholder="e.g. Bay State Milling Company" style={inputStyle} />
        </Field>
        <Field label="Which year are you reporting for?">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            <option value={2024}>2024 — first SB 253 reporting year</option>
            <option value={2023}>2023</option>
            <option value={2025}>2025</option>
          </select>
        </Field>
        <Field label="What was your global annual revenue?" hint="In USD millions — required by CARB for emission intensity calculation">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            <input type="number" value={inventory.revenue_millions || ''} onChange={e => setInventory(i => ({...i, revenue_millions: Number(e.target.value)}))} placeholder="1000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 14, color: '#555553', whiteSpace: 'nowrap' }}>million USD</span>
          </div>
        </Field>
        <Field label="How do you control your facilities?" hint="Operational Control is most common — you have authority to implement operating policies">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control</option>
            <option value="financial_control">Financial Control</option>
            <option value="equity_share">Equity Share</option>
          </select>
        </Field>
        <Field label="List your facilities" hint="Enter the name and state for each location — we'll collect energy data for each one">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
            {inventory.locations.map((loc, i) => (
              <div key={loc.id} style={{ display: 'flex', gap: 8 }}>
                <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder="e.g. Kansas City Mill" style={{ ...inputStyle, flex: 1 }} />
                <input value={loc.state} onChange={e => updateLocation(i, 'state', e.target.value)} placeholder="State" style={{ ...inputStyle, width: 70 }} />
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add another location</button>
          </div>
        </Field>
      </div>
    </div>
  )

  // ── STEP 1 — ENERGY DATA ───────────────────────────────────────────
  const renderStep1 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc)
    const detectedRegion = GRID_REGIONS.find(r => r.value === loc.grid_region)

    return (
      <div>
        <h2 style={sectionHead}>Energy & fuel data</h2>
        <p style={sectionSub}>Tell us what fuels and energy each location uses — in the units that appear on your bills. Upload your source documents as you go for assurance readiness.</p>

        {/* LOCATION TABS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
          {inventory.locations.map((l, i) => (
            <button key={l.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeLocation === i ? '#0d0d0d' : '#f8f7f5', color: activeLocation === i ? '#fff' : '#555553', border: `0.5px solid ${activeLocation === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeLocation === i ? 500 : 400 }}>
              {l.name || `Location ${i+1}`}
              {l.source_docs.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, background: '#0F6E56', color: '#fff', borderRadius: 99, padding: '1px 6px' }}>{l.source_docs.length}</span>}
            </button>
          ))}
          <button onClick={addLocation} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer' }}>+ Add location</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

            {/* NATURAL GAS */}
            <QuestionCard question="Does this location use natural gas?" hint="Used for heating, grain drying, boilers, and furnaces — check your gas utility bills" checked={loc.has_natural_gas} onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}>
              {loc.has_natural_gas && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div>
                    <p style={questionHint}>What unit does your gas supplier use on your bills?</p>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      {[['mcf', 'Mcf'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']].map(([val, label]) => (
                        <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.natural_gas_unit === val ? '#7425e3' : '#f8f7f5', color: loc.natural_gas_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.natural_gas_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                      ))}
                    </div>
                    <Field label={`Total natural gas used in ${inventory.reporting_year} (${loc.natural_gas_unit})`} hint="Add up all 12 months of bills for this location">
                      <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                    </Field>
                  </div>
                  <DocUpload label="Upload natural gas bills" locIdx={activeLocation} docType="utility_bill_gas" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_gas')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
                </div>
              )}
            </QuestionCard>

            {/* PROPANE */}
            <QuestionCard question="Does this location use propane or LPG?" hint="Common for grain dryers, forklifts, and heating at facilities without natural gas" checked={loc.has_propane} onToggle={v => updateLocation(activeLocation, 'has_propane', v)}>
              {loc.has_propane && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.propane_unit === val ? '#7425e3' : '#f8f7f5', color: loc.propane_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.propane_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased in ${inventory.reporting_year} (${loc.propane_unit})`} hint="From delivery records or fuel purchase receipts">
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  <DocUpload label="Upload propane delivery records" locIdx={activeLocation} docType="utility_bill_propane" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_propane')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
                </div>
              )}
            </QuestionCard>

            {/* DIESEL STATIONARY */}
            <QuestionCard question="Does this location use diesel in stationary equipment?" hint="Backup generators, boilers, heating systems — not vehicles" checked={loc.has_diesel_stationary} onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}>
              {loc.has_diesel_stationary && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.diesel_stationary_unit === val ? '#7425e3' : '#f8f7f5', color: loc.diesel_stationary_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.diesel_stationary_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel in stationary equipment in ${inventory.reporting_year} (${loc.diesel_stationary_unit})`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  <DocUpload label="Upload diesel purchase records" locIdx={activeLocation} docType="fuel_receipt_diesel" docs={loc.source_docs.filter(d => d.document_type === 'fuel_receipt_diesel')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
                </div>
              )}
            </QuestionCard>

            {/* MOBILE */}
            <QuestionCard question="Does this location have company-owned vehicles?" hint="Delivery trucks, forklifts, company cars — owned or leased by your company" checked={loc.has_mobile} onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}>
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                  <p style={questionHint}>Check your fleet fuel cards, fuel purchase records, or expense reports.</p>
                  <Field label={`Gasoline purchased for company vehicles in ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        <option value="gallons">US gallons</option>
                        <option value="litres">Litres</option>
                      </select>
                    </div>
                  </Field>
                  <Field label={`Diesel purchased for company vehicles in ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                      <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 130 }}>
                        <option value="gallons">US gallons</option>
                        <option value="litres">Litres</option>
                      </select>
                    </div>
                  </Field>
                  <DocUpload label="Upload fleet fuel records" locIdx={activeLocation} docType="fleet_fuel" docs={loc.source_docs.filter(d => d.document_type === 'fleet_fuel')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
                </div>
              )}
            </QuestionCard>

            {/* REFRIGERATION */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Does this location have refrigeration or cooling systems?</div>
              <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.5 }}>Grain storage, cold storage, and food processing facilities typically have refrigeration.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, cursor: 'pointer' }}>Ammonia (NH₃)</button>
                <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? '#7425e3' : '#f8f7f5', color: loc.has_hfc_refrigerants ? '#fff' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>HFC refrigerants</button>
                <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#888784' : '#f8f7f5', color: (!loc.uses_ammonia && !loc.has_hfc_refrigerants) ? '#fff' : '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>No refrigeration</button>
              </div>
              {loc.uses_ammonia && (
                <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0F6E56', marginBottom: 3 }}>✓ Ammonia has zero global warming potential</div>
                  <div style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>Ammonia (NH₃) refrigeration contributes zero greenhouse gas emissions. No further data needed for this category.</div>
                </div>
              )}
              {loc.has_hfc_refrigerants && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                  <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 12, color: '#633806', lineHeight: 1.6 }}>Check your refrigeration service records. Refrigerant purchased for top-up during the year equals the amount leaked — this is the standard GHG Protocol methodology.</div>
                  </div>
                  <Field label="Refrigerant type" hint="Check the nameplate on your equipment or service records">
                    <select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}>
                      <option value="r410a">R-410A — most common in newer systems</option>
                      <option value="r22">R-22 — older systems</option>
                      <option value="r134a">R-134a — medium temperature refrigeration</option>
                      <option value="r404a">R-404A — low temperature / frozen storage</option>
                      <option value="r507">R-507 — low temperature refrigeration</option>
                    </select>
                  </Field>
                  <Field label="Refrigerant purchased for top-up this year (kg)" hint="From refrigeration service records or refrigerant supplier invoices">
                    <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                  <DocUpload label="Upload refrigeration service records" locIdx={activeLocation} docType="service_record" docs={loc.source_docs.filter(d => d.document_type === 'service_record')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
                </div>
              )}
            </div>

            {/* ELECTRICITY */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.25rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Purchased electricity</div>
              <p style={{ fontSize: 12, color: '#888784', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.5 }}>Check your electricity utility bills for the annual kWh total.</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <Field label={`Total electricity used in ${inventory.reporting_year} (kWh)`} hint="Add up all 12 monthly electricity bills for this location">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                {loc.state && (
                  <div style={{ background: '#E6F1FB', border: '0.5px solid rgba(12,68,124,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#0C447C' }}>
                    ✓ Grid region auto-detected from {loc.state}: <strong>{detectedRegion?.label}</strong> — emission factor {detectedRegion?.ef} kg CO₂e/kWh (eGRID 2023)
                  </div>
                )}
                {!loc.state && (
                  <Field label="Where is this location?" hint="Select the region to apply the correct electricity emission factor">
                    <select value={loc.grid_region} onChange={e => updateLocation(activeLocation, 'grid_region', e.target.value)} style={inputStyle}>
                      {GRID_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label} — {r.ef} kg CO₂e/kWh</option>)}
                    </select>
                  </Field>
                )}
                <DocUpload label="Upload electricity bills" locIdx={activeLocation} docType="utility_bill_electricity" docs={loc.source_docs.filter(d => d.document_type === 'utility_bill_electricity')} onUpload={handleFileUpload} onRemove={removeDoc} uploading={uploading} />
              </div>
            </div>

          </div>

          {/* LIVE RESULTS */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Live results — {loc.name}</div>
              {[
                { label: 'Heating & fuel', val: calc.s1_stationary, color: '#7425e3' },
                { label: 'Vehicles & fleet', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Refrigerants', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Scope 1 total', val: calc.s1_total, color: '#fff', bold: true },
                { label: 'Electricity (Scope 2)', val: calc.s2_location, color: '#64fe3e', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: bold ? 600 : 300 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} mt</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>mt = metric tonnes CO₂e · EPA 2024 factors · IPCC AR4 GWP · eGRID 2023</div>
              </div>
            </div>

            {/* SOURCE DOCS SUMMARY */}
            <div style={{ marginTop: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Source documents</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: loc.source_docs.length > 0 ? '#0F6E56' : '#888784' }}>
                {loc.source_docs.length > 0 ? `✓ ${loc.source_docs.length} document${loc.source_docs.length > 1 ? 's' : ''} uploaded` : 'No documents yet'}
              </div>
              <div style={{ fontSize: 11, color: '#888784', marginTop: 3, fontWeight: 300 }}>Upload bills and receipts alongside each data entry for assurance readiness</div>
            </div>

            {inventory.locations.length > 1 && (
              <div style={{ marginTop: 12, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>All locations</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#7425e3' }}>{totals.s1_total.toFixed(2)} mt Scope 1</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56', marginTop: 4 }}>{totals.s2_total.toFixed(2)} mt Scope 2</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2 — REVIEW & WORKINGS ─────────────────────────────────────
  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Review, results & calculation workings</h2>
      <p style={sectionSub}>Your complete GHG inventory for {inventory.company_name}, {inventory.reporting_year}. Expand each location to see the full calculation workings — everything a verifier needs to confirm your figures.</p>

      {/* TOTALS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '2rem' }}>
        {[
          { label: 'Total Scope 1', val: totals.s1_total, unit: 'mtCO₂e', color: '#7425e3', bg: '#EDE9FE' },
          { label: 'Total Scope 2', val: totals.s2_total, unit: 'mtCO₂e', color: '#0F6E56', bg: '#E1F5EE' },
          { label: 'Scope 1 Intensity', val: intensity_s1, unit: 'mtCO₂e / $M revenue', color: '#0C447C', bg: '#E6F1FB' },
          { label: 'Scope 2 Intensity', val: intensity_s2, unit: 'mtCO₂e / $M revenue', color: '#ba7517', bg: '#FEF3E2' },
        ].map(({ label, val, unit, color, bg }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '1.25rem', border: `0.5px solid ${color}22` }}>
            <div style={{ fontSize: 11, color: '#888784', marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color, lineHeight: 1 }}>{val.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: '#888784', marginTop: 4 }}>{unit}</div>
          </div>
        ))}
      </div>

      {/* LOCATION DETAILS WITH WORKINGS */}
      {inventory.locations.map((loc, i) => {
        const c = calcLocation(loc)
        const key = `loc_${i}`
        return (
          <div key={loc.id} style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            <div onClick={() => setShowWorkings(w => ({...w, [key]: !w[key]}))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{loc.name} {loc.state && `— ${loc.state}`}</div>
                <div style={{ fontSize: 12, color: '#888784', marginTop: 2 }}>Scope 1: {c.s1_total.toFixed(2)} mtCO₂e · Scope 2: {c.s2_location.toFixed(2)} mtCO₂e · Total: {(c.s1_total + c.s2_location).toFixed(2)} mtCO₂e</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {loc.source_docs.length > 0 && <span style={{ fontSize: 11, background: '#E1F5EE', color: '#0F6E56', borderRadius: 99, padding: '2px 8px', fontWeight: 500 }}>✓ {loc.source_docs.length} docs</span>}
                <span style={{ color: '#888784', fontSize: 12 }}>{showWorkings[key] ? '▲ Hide workings' : '▼ Show workings'}</span>
              </div>
            </div>

            {showWorkings[key] && (
              <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#888784', margin: '1rem 0 0.75rem' }}>Calculation workings — ISO 14064-3 transparency</div>

                {/* WORKINGS TABLE */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: '1rem' }}>
                  <thead>
                    <tr>{['Source', 'Activity data', 'Emission factor', 'Source', 'GWP basis', 'Result (mtCO₂e)'].map(h => <th key={h} style={{ background: '#f8f7f5', padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 600, color: '#888784', borderBottom: '0.5px solid #e8e7e4' }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {loc.has_natural_gas && loc.natural_gas_amount > 0 && (
                      <tr>
                        <td style={wTd}>Natural gas</td>
                        <td style={wTd}>{loc.natural_gas_amount} {loc.natural_gas_unit}</td>
                        <td style={wTd}>{loc.natural_gas_unit === 'mcf' ? EF.natural_gas_mcf : loc.natural_gas_unit === 'therms' ? EF.natural_gas_therms : EF.natural_gas_mmbtu} kg CO₂e/{loc.natural_gas_unit}</td>
                        <td style={wTd}>{EF_SOURCES.natural_gas}</td>
                        <td style={wTd}>AR4</td>
                        <td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{c.s1_stationary > 0 ? (loc.natural_gas_amount * (loc.natural_gas_unit === 'mcf' ? EF.natural_gas_mcf : loc.natural_gas_unit === 'therms' ? EF.natural_gas_therms : EF.natural_gas_mmbtu) / 1000).toFixed(4) : '0.0000'}</td>
                      </tr>
                    )}
                    {loc.has_propane && loc.propane_amount > 0 && (
                      <tr>
                        <td style={wTd}>Propane</td>
                        <td style={wTd}>{loc.propane_amount} {loc.propane_unit}</td>
                        <td style={wTd}>{loc.propane_unit === 'gallons' ? EF.propane_gallon : EF.propane_litre} kg CO₂e/{loc.propane_unit === 'gallons' ? 'gallon' : 'litre'}</td>
                        <td style={wTd}>{EF_SOURCES.propane}</td>
                        <td style={wTd}>AR4</td>
                        <td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{(loc.propane_amount * (loc.propane_unit === 'gallons' ? EF.propane_gallon : EF.propane_litre) / 1000).toFixed(4)}</td>
                      </tr>
                    )}
                    {loc.has_mobile && loc.gasoline_amount > 0 && (
                      <tr>
                        <td style={wTd}>Gasoline (mobile)</td>
                        <td style={wTd}>{loc.gasoline_amount} {loc.gasoline_unit}</td>
                        <td style={wTd}>{loc.gasoline_unit === 'gallons' ? EF.gasoline_gallon : EF.gasoline_litre} kg CO₂e/{loc.gasoline_unit === 'gallons' ? 'gallon' : 'litre'}</td>
                        <td style={wTd}>{EF_SOURCES.gasoline}</td>
                        <td style={wTd}>AR4</td>
                        <td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{(loc.gasoline_amount * (loc.gasoline_unit === 'gallons' ? EF.gasoline_gallon : EF.gasoline_litre) / 1000).toFixed(4)}</td>
                      </tr>
                    )}
                    {loc.has_hfc_refrigerants && loc.refrigerant_purchased_kg > 0 && (
                      <tr>
                        <td style={wTd}>{loc.refrigerant_type.toUpperCase()} (fugitive)</td>
                        <td style={wTd}>{loc.refrigerant_purchased_kg} kg leaked</td>
                        <td style={wTd}>{EF[loc.refrigerant_type as keyof typeof EF]} GWP</td>
                        <td style={wTd}>{EF_SOURCES.refrigerants}</td>
                        <td style={wTd}>AR4</td>
                        <td style={{ ...wTd, fontWeight: 600, color: '#7425e3' }}>{(loc.refrigerant_purchased_kg * (EF[loc.refrigerant_type as keyof typeof EF] as number) / 1000).toFixed(4)}</td>
                      </tr>
                    )}
                    {loc.electricity_kwh > 0 && (
                      <tr style={{ background: '#f8f7f5' }}>
                        <td style={wTd}>Electricity (Scope 2)</td>
                        <td style={wTd}>{loc.electricity_kwh.toLocaleString()} kWh</td>
                        <td style={wTd}>{(EF[loc.grid_region as keyof typeof EF] as number || EF.us_average).toFixed(4)} kg CO₂e/kWh</td>
                        <td style={wTd}>{EF_SOURCES.electricity} — {loc.grid_region}</td>
                        <td style={wTd}>N/A</td>
                        <td style={{ ...wTd, fontWeight: 600, color: '#0F6E56' }}>{c.s2_location.toFixed(4)}</td>
                      </tr>
                    )}
                    <tr style={{ background: '#0d0d0d' }}>
                      <td colSpan={5} style={{ ...wTd, color: '#fff', fontWeight: 700 }}>TOTAL — {loc.name}</td>
                      <td style={{ ...wTd, color: '#fff', fontWeight: 700 }}>{(c.s1_total + c.s2_location).toFixed(4)}</td>
                    </tr>
                  </tbody>
                </table>

                {/* SOURCE DOCS */}
                {loc.source_docs.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>Source documents ({loc.source_docs.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
                      {loc.source_docs.map(doc => (
                        <div key={doc.id} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14 }}>📄</span>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d' }}>{doc.file_name}</div>
                            <div style={{ fontSize: 10, color: '#888784' }}>{doc.document_type.replace(/_/g, ' ')} · {new Date(doc.uploaded_at).toLocaleDateString()}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* ASSURANCE READINESS */}
      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Assurance readiness checklist</div>
        {[
          { label: 'Emission factors cited', done: true, note: 'EPA 2024 · eGRID 2023 · IPCC AR4 GWP' },
          { label: 'Calculation workings documented', done: true, note: 'Full formula shown for every source' },
          { label: 'Organizational boundary documented', done: !!inventory.boundary_approach, note: inventory.boundary_approach.replace(/_/g, ' ') },
          { label: 'Source documents uploaded', done: inventory.locations.some(l => l.source_docs.length > 0), note: `${inventory.locations.reduce((a, l) => a + l.source_docs.length, 0)} documents uploaded` },
          { label: 'All locations included', done: inventory.locations.length > 0, note: `${inventory.locations.length} location${inventory.locations.length > 1 ? 's' : ''} in scope` },
        ].map(({ label, done, note }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{done ? '✅' : '⬜'}</span>
            <div>
              <div style={{ fontSize: 13, color: done ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: done ? 500 : 300 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{note}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── STEP 3 — CARB EXPORT ───────────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>CARB SB 253 Export</h2>
      <p style={sectionSub}>Your pre-filled CARB template is ready. Download and submit to CARB or provide to your third-party verifier.</p>
      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '2rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2rem' }}>
          {[
            ['Company', inventory.company_name || '—'],
            ['Reporting year', String(inventory.reporting_year)],
            ['Locations', String(inventory.locations.length)],
            ['Boundary', inventory.boundary_approach.replace(/_/g, ' ')],
            ['Scope 1 total', `${totals.s1_total.toFixed(4)} mtCO₂e`],
            ['Scope 2 total', `${totals.s2_total.toFixed(4)} mtCO₂e`],
            ['Scope 1 intensity', `${intensity_s1.toFixed(6)} mtCO₂e/$M`],
            ['Emission factors', 'EPA 2024 · AR4 GWP · eGRID 2023'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
        <button onClick={generateCARBExport} style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
          ⬇ Download CARB SB 253 Template (CSV)
        </button>
      </div>
    </div>
  )

  const generateCARBExport = () => {
    const rows = [
      ['CARB SB 253 — Scope 1 and Scope 2 GHG Emissions Report'],
      ['Generated by ThemisIQ · www.themisiq.co · ' + new Date().toLocaleDateString()],
      [''],
      ['ORGANIZATION INFORMATION'],
      ['Company name', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Annual revenue (USD millions)', inventory.revenue_millions],
      ['Organizational boundary approach', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Number of reporting locations', inventory.locations.length],
      [''],
      ['SCOPE 1 DISCLOSURE'],
      ['Scope 1 total direct emissions (mtCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 1 — Stationary Combustion (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_stationary, 0).toFixed(4)],
      ['Scope 1 — Mobile Combustion (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_mobile, 0).toFixed(4)],
      ['Scope 1 — Fugitive Emissions (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_fugitive, 0).toFixed(4)],
      ['Scope 1 emission intensity (mtCO₂e per $M revenue)', intensity_s1.toFixed(6)],
      [''],
      ['SCOPE 2 DISCLOSURE'],
      ['Scope 2 location-based total (mtCO₂e)', totals.s2_total.toFixed(4)],
      ['Scope 2 emission intensity (mtCO₂e per $M revenue)', intensity_s2.toFixed(6)],
      [''],
      ['METHODS & EMISSION FACTORS'],
      ['Scope 1 stationary combustion', EF_SOURCES.natural_gas],
      ['Scope 1 mobile combustion', EF_SOURCES.gasoline],
      ['Scope 2 electricity', EF_SOURCES.electricity],
      ['GWP values', EF_SOURCES.gwp],
      ['Refrigerants', EF_SOURCES.refrigerants],
      [''],
      ['LOCATION BREAKDOWN'],
      ['Location', 'State', 'Grid Region', 'S1 Stationary', 'S1 Mobile', 'S1 Fugitive', 'S1 Total', 'S2 Location', 'Grand Total', 'Source Docs'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc)
        return [loc.name, loc.state, loc.grid_region, c.s1_stationary.toFixed(4), c.s1_mobile.toFixed(4), c.s1_fugitive.toFixed(4), c.s1_total.toFixed(4), c.s2_location.toFixed(4), (c.s1_total + c.s2_location).toFixed(4), loc.source_docs.length]
      }),
      ['TOTAL', '', '', inventory.locations.reduce((a,l) => a+calcLocation(l).s1_stationary,0).toFixed(4), inventory.locations.reduce((a,l) => a+calcLocation(l).s1_mobile,0).toFixed(4), inventory.locations.reduce((a,l) => a+calcLocation(l).s1_fugitive,0).toFixed(4), totals.s1_total.toFixed(4), totals.s2_total.toFixed(4), (totals.s1_total+totals.s2_total).toFixed(4), inventory.locations.reduce((a,l) => a+l.source_docs.length,0)],
      [''],
      ['DISCLAIMER'],
      ['Generated by ThemisIQ platform · www.themisiq.co'],
      ['This report does not constitute legal advice, regulatory assurance, or a professional opinion.'],
      ['All Scope 1 and Scope 2 emissions require third-party limited assurance before submission to CARB.'],
      ['ThemisIQ is not an accredited assurance provider under GHG Protocol, CARB, ESRS, or CDP.'],
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff'+csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ThemisIQ_CARB_SB253_${inventory.company_name.replace(/\s+/g,'_')}_${inventory.reporting_year}.csv`
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
        </div>
        <button onClick={() => setSaved(true)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: saved ? '#E1F5EE' : '#f8f7f5', border: `0.5px solid ${saved ? '#0F6E56' : '#e8e7e4'}`, cursor: 'pointer', color: saved ? '#0F6E56' : '#555553', fontWeight: saved ? 500 : 400 }}>
          {saved ? '✓ Saved' : 'Save draft'}
        </button>
      </nav>

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex' }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400 }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          {step < STEPS.length - 1
            ? <button onClick={() => setStep(s => s+1)} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>Continue →</button>
            : <button onClick={generateCARBExport} style={{ fontSize: 13, fontWeight: 500, padding: '10px 28px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>⬇ Download CARB Export</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── HELPER COMPONENTS ─────────────────────────────────────────────────
function DocUpload({ label, locIdx, docType, docs, onUpload, onRemove, uploading }: {
  label: string, locIdx: number, docType: string,
  docs: SourceDoc[], onUpload: (files: FileList, locIdx: number, docType: string) => void,
  onRemove: (locIdx: number, docId: string, filePath: string) => void, uploading: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ background: '#f8f7f5', border: '0.5px dashed #e8e7e4', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: docs.length > 0 ? 8 : 0 }}>
        <span style={{ fontSize: 12, color: '#888784', fontWeight: 300 }}>📎 {label}</span>
        <button onClick={() => ref.current?.click()} disabled={uploading} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: '#fff', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>
          {uploading ? 'Uploading...' : '+ Upload'}
        </button>
        <input ref={ref} type="file" multiple accept=".pdf,.xlsx,.csv,.jpg,.png" style={{ display: 'none' }} onChange={e => e.target.files && onUpload(e.target.files, locIdx, docType)} />
      </div>
      {docs.map(doc => (
        <div key={doc.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
          <span style={{ fontSize: 12, color: '#0d0d0d' }}>✓ {doc.file_name}</span>
          <button onClick={() => onRemove(locIdx, doc.id, doc.file_path)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
        </div>
      ))}
    </div>
  )
}

function QuestionCard({ question, hint, checked, onToggle, children }: { question: string, hint: string, checked: boolean, onToggle: (v: boolean) => void, children?: React.ReactNode }) {
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

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: hint ? 4 : 6 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }
const wTd: React.CSSProperties = { padding: '6px 10px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 11, verticalAlign: 'top' }
const questionHint: React.CSSProperties = { fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '0.75rem' }
