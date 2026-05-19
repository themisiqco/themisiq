'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

// ── EMISSION FACTORS (hidden from customer — AR4 GWP, EPA 2024) ───────
const EF = {
  // Stationary combustion
  natural_gas_mcf: 53.11,        // kg CO2e per Mcf (EPA 2024)
  natural_gas_therms: 5.311,     // kg CO2e per therm
  natural_gas_mmbtu: 53.06,      // kg CO2e per MMBtu
  propane_gallon: 5.74,          // kg CO2e per gallon
  propane_litre: 1.516,          // kg CO2e per litre
  diesel_gallon: 10.21,          // kg CO2e per gallon
  diesel_litre: 2.698,           // kg CO2e per litre
  fuel_oil_gallon: 10.16,        // kg CO2e per gallon
  coal_short_ton: 2093.3,        // kg CO2e per short ton

  // Mobile combustion
  gasoline_gallon: 8.78,         // kg CO2e per gallon
  gasoline_litre: 2.319,         // kg CO2e per litre
  diesel_mobile_gallon: 10.21,   // kg CO2e per gallon
  diesel_mobile_litre: 2.698,    // kg CO2e per litre

  // Refrigerants (kg CO2e per kg leaked) — AR4 GWP
  r22: 1810,
  r134a: 1430,
  r404a: 3922,
  r410a: 2088,
  r507: 3985,
  ammonia: 0,

  // Electricity (kg CO2e per kWh) — eGRID 2023
  us_average: 0.3866,
  mro: 0.4891,
  serc: 0.3629,
  wecc: 0.2877,
  npcc: 0.1967,
  spp: 0.4652,
  frcc: 0.4051,
  hicc: 0.6389,
  ascc: 0.5893,

  // Steam
  steam_mmbtu: 66.4,
}

const GRID_REGIONS = [
  { value: 'us_average', label: "I'm not sure — use US average" },
  { value: 'mro', label: 'Midwest (IL, MI, MN, WI, ND, SD, NE, MO, KS, IA)' },
  { value: 'serc', label: 'Southeast (AL, GA, FL, TN, SC, NC, VA, KY, MS)' },
  { value: 'wecc', label: 'West (CA, OR, WA, NV, AZ, UT, CO, ID, MT, WY)' },
  { value: 'npcc', label: 'Northeast (NY, NJ, CT, MA, RI, VT, NH, ME)' },
  { value: 'spp', label: 'South Central (TX, OK, AR, LA, KS, NE, MO)' },
  { value: 'frcc', label: 'Florida' },
]

// ── TYPES ─────────────────────────────────────────────────────────────
interface Location {
  id: string
  name: string
  state: string
  // Stationary — natural gas
  has_natural_gas: boolean
  natural_gas_amount: number
  natural_gas_unit: 'mcf' | 'therms' | 'mmbtu'
  // Stationary — propane
  has_propane: boolean
  propane_amount: number
  propane_unit: 'gallons' | 'litres'
  // Stationary — diesel
  has_diesel_stationary: boolean
  diesel_stationary_amount: number
  diesel_stationary_unit: 'gallons' | 'litres'
  // Stationary — fuel oil
  has_fuel_oil: boolean
  fuel_oil_gallons: number
  // Mobile
  has_mobile: boolean
  gasoline_amount: number
  gasoline_unit: 'gallons' | 'litres'
  diesel_mobile_amount: number
  diesel_mobile_unit: 'gallons' | 'litres'
  // Fugitive
  uses_ammonia: boolean
  has_hfc_refrigerants: boolean
  refrigerant_type: string
  refrigerant_purchased_kg: number
  // Electricity
  electricity_kwh: number
  grid_region: string
  // Steam
  has_purchased_steam: boolean
  purchased_steam_mmbtu: number
}

interface Inventory {
  company_name: string
  reporting_year: number
  revenue_millions: number
  boundary_approach: string
  locations: Location[]
}

const emptyLocation = (id: string, name: string): Location => ({
  id, name, state: '',
  has_natural_gas: false, natural_gas_amount: 0, natural_gas_unit: 'mcf',
  has_propane: false, propane_amount: 0, propane_unit: 'gallons',
  has_diesel_stationary: false, diesel_stationary_amount: 0, diesel_stationary_unit: 'gallons',
  has_fuel_oil: false, fuel_oil_gallons: 0,
  has_mobile: false, gasoline_amount: 0, gasoline_unit: 'gallons', diesel_mobile_amount: 0, diesel_mobile_unit: 'gallons',
  uses_ammonia: false, has_hfc_refrigerants: false, refrigerant_type: 'r410a', refrigerant_purchased_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average',
  has_purchased_steam: false, purchased_steam_mmbtu: 0,
})

// ── CALCULATIONS (all hidden from customer) ───────────────────────────
function calcLocation(loc: Location) {
  // Natural gas conversion to MMBtu
  let ng_mmbtu = 0
  if (loc.has_natural_gas && loc.natural_gas_amount > 0) {
    if (loc.natural_gas_unit === 'mcf') ng_mmbtu = loc.natural_gas_amount * EF.natural_gas_mcf
    else if (loc.natural_gas_unit === 'therms') ng_mmbtu = loc.natural_gas_amount * EF.natural_gas_therms
    else ng_mmbtu = loc.natural_gas_amount * EF.natural_gas_mmbtu
  }

  const propane_ef = loc.propane_unit === 'gallons' ? EF.propane_gallon : EF.propane_litre
  const diesel_stat_ef = loc.diesel_stationary_unit === 'gallons' ? EF.diesel_gallon : EF.diesel_litre
  const gasoline_ef = loc.gasoline_unit === 'gallons' ? EF.gasoline_gallon : EF.gasoline_litre
  const diesel_mob_ef = loc.diesel_mobile_unit === 'gallons' ? EF.diesel_mobile_gallon : EF.diesel_mobile_litre

  const s1_stationary = (
    ng_mmbtu +
    (loc.has_propane ? loc.propane_amount * propane_ef : 0) +
    (loc.has_diesel_stationary ? loc.diesel_stationary_amount * diesel_stat_ef : 0) +
    (loc.has_fuel_oil ? loc.fuel_oil_gallons * EF.fuel_oil_gallon : 0)
  ) / 1000

  const s1_mobile = loc.has_mobile ? (
    loc.gasoline_amount * gasoline_ef +
    loc.diesel_mobile_amount * diesel_mob_ef
  ) / 1000 : 0

  const s1_fugitive = (!loc.uses_ammonia && loc.has_hfc_refrigerants)
    ? (loc.refrigerant_purchased_kg * (EF[loc.refrigerant_type as keyof typeof EF] as number || 0)) / 1000
    : 0

  const s1_total = s1_stationary + s1_mobile + s1_fugitive

  const grid_ef = EF[loc.grid_region as keyof typeof EF] as number || EF.us_average
  const s2_location = (
    loc.electricity_kwh * grid_ef +
    (loc.has_purchased_steam ? loc.purchased_steam_mmbtu * EF.steam_mmbtu : 0)
  ) / 1000

  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location }
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) window.location.href = '/login'
    })
  }, [])

  const updateLocation = (idx: number, field: keyof Location, value: any) => {
    setInventory(inv => {
      const locs = [...inv.locations]
      locs[idx] = { ...locs[idx], [field]: value }
      return { ...inv, locations: locs }
    })
  }

  const addLocation = () => {
    const id = String(inventory.locations.length + 1)
    setInventory(inv => ({ ...inv, locations: [...inv.locations, emptyLocation(id, `Location ${id}`)] }))
    setActiveLocation(inventory.locations.length)
  }

  const totals = calcTotal(inventory.locations)
  const intensity_s1 = inventory.revenue_millions > 0 ? totals.s1_total / inventory.revenue_millions : 0
  const intensity_s2 = inventory.revenue_millions > 0 ? totals.s2_total / inventory.revenue_millions : 0

  const STEPS = ['Company setup', 'Energy & fuel data', 'Review results', 'CARB export']

  // ── STEP 0 — COMPANY SETUP ──────────────────────────────────────────
  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Let's set up your GHG inventory</h2>
      <p style={sectionSub}>We'll ask you a few questions about your company, then walk you through each location one at a time. You'll need your utility bills and fuel purchase records.</p>

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20, maxWidth: 560 }}>
        <Field label="What is your company's legal name?" hint="This will appear on your CARB SB 253 submission">
          <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value}))} placeholder="e.g. Bay State Milling Company" style={inputStyle} />
        </Field>

        <Field label="Which year are you reporting for?" hint="First SB 253 deadline is August 10, 2026 — for the 2024 reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            <option value={2024}>2024 — first SB 253 reporting year</option>
            <option value={2023}>2023</option>
            <option value={2025}>2025</option>
          </select>
        </Field>

        <Field label="What was your global annual revenue for this year?" hint="In USD millions — used to calculate your emission intensity ratio, required by CARB">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: '#555553' }}>$</span>
            <input type="number" value={inventory.revenue_millions || ''} onChange={e => setInventory(i => ({...i, revenue_millions: Number(e.target.value)}))} placeholder="1000" style={{ ...inputStyle, flex: 1 }} />
            <span style={{ fontSize: 14, color: '#555553', whiteSpace: 'nowrap' }}>million USD</span>
          </div>
        </Field>

        <Field label="How do you control your facilities?" hint="Most companies use Operational Control — you have authority to implement operating policies">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control — I control how facilities are run</option>
            <option value="financial_control">Financial Control — I control financial policies</option>
            <option value="equity_share">Equity Share — I report based on ownership percentage</option>
          </select>
        </Field>

        <Field label="How many facilities or locations do you have?" hint="You'll enter energy data for each location separately">
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
            {inventory.locations.map((loc, i) => (
              <div key={loc.id} style={{ display: 'flex', gap: 8 }}>
                <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder={`Facility name (e.g. Kansas City Mill)`} style={{ ...inputStyle, flex: 1 }} />
                <input value={loc.state} onChange={e => updateLocation(i, 'state', e.target.value)} placeholder="State" style={{ ...inputStyle, width: 70 }} />
              </div>
            ))}
            <button onClick={addLocation} style={{ fontSize: 13, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add another location</button>
          </div>
        </Field>
      </div>
    </div>
  )

  // ── STEP 1 — ENERGY & FUEL DATA ─────────────────────────────────────
  const renderStep1 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc)

    return (
      <div>
        <h2 style={sectionHead}>Energy & fuel data</h2>
        <p style={sectionSub}>We'll ask you what fuels and energy each location uses — in the units that appear on your bills. You don't need to do any calculations. We handle all of that.</p>

        {/* LOCATION TABS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '2rem' }}>
          {inventory.locations.map((loc, i) => (
            <button key={loc.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: activeLocation === i ? '#0d0d0d' : '#f8f7f5', color: activeLocation === i ? '#fff' : '#555553', border: `0.5px solid ${activeLocation === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer', fontWeight: activeLocation === i ? 500 : 400 }}>
              {loc.name || `Location ${i+1}`}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 20 }}>

            {/* NATURAL GAS */}
            <QuestionCard
              question="Does this location use natural gas?"
              hint="Check your gas utility bills — natural gas is used for heating, grain drying, boilers, and furnaces"
              checked={loc.has_natural_gas}
              onToggle={v => updateLocation(activeLocation, 'has_natural_gas', v)}
            >
              {loc.has_natural_gas && (
                <div>
                  <p style={questionHint}>Look at your annual natural gas bills. What unit does your supplier use?</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[['mcf', 'Mcf (thousand cubic feet)'], ['therms', 'Therms'], ['mmbtu', 'MMBtu']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'natural_gas_unit', val)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.natural_gas_unit === val ? '#7425e3' : '#f8f7f5', color: loc.natural_gas_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.natural_gas_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total natural gas used in ${inventory.reporting_year} (${loc.natural_gas_unit === 'mcf' ? 'Mcf' : loc.natural_gas_unit === 'therms' ? 'therms' : 'MMBtu'})`} hint="Add up all 12 months of bills for this location">
                    <input type="number" value={loc.natural_gas_amount || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              )}
            </QuestionCard>

            {/* PROPANE */}
            <QuestionCard
              question="Does this location use propane or LPG?"
              hint="Common for grain dryers, forklifts, and heating at facilities without natural gas"
              checked={loc.has_propane}
              onToggle={v => updateLocation(activeLocation, 'has_propane', v)}
            >
              {loc.has_propane && (
                <div>
                  <p style={questionHint}>Check your propane delivery records or fuel purchase receipts.</p>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'propane_unit', val as any)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.propane_unit === val ? '#7425e3' : '#f8f7f5', color: loc.propane_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.propane_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total propane purchased in ${inventory.reporting_year} (${loc.propane_unit})`} hint="Total delivered to this location during the year">
                    <input type="number" value={loc.propane_amount || ''} onChange={e => updateLocation(activeLocation, 'propane_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              )}
            </QuestionCard>

            {/* DIESEL STATIONARY */}
            <QuestionCard
              question="Does this location use diesel fuel in stationary equipment?"
              hint="Stationary diesel includes backup generators, boilers, and heating systems — not vehicles"
              checked={loc.has_diesel_stationary}
              onToggle={v => updateLocation(activeLocation, 'has_diesel_stationary', v)}
            >
              {loc.has_diesel_stationary && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {[['gallons', 'US gallons'], ['litres', 'Litres']].map(([val, label]) => (
                      <button key={val} onClick={() => updateLocation(activeLocation, 'diesel_stationary_unit', val as any)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: loc.diesel_stationary_unit === val ? '#7425e3' : '#f8f7f5', color: loc.diesel_stationary_unit === val ? '#fff' : '#555553', border: `0.5px solid ${loc.diesel_stationary_unit === val ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>{label}</button>
                    ))}
                  </div>
                  <Field label={`Total diesel used in stationary equipment in ${inventory.reporting_year} (${loc.diesel_stationary_unit})`}>
                    <input type="number" value={loc.diesel_stationary_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_stationary_amount', Number(e.target.value))} placeholder="0" style={inputStyle} />
                  </Field>
                </div>
              )}
            </QuestionCard>

            {/* MOBILE / FLEET */}
            <QuestionCard
              question="Does this location have company-owned vehicles or mobile equipment?"
              hint="Includes delivery trucks, forklifts, company cars, and other vehicles owned or controlled by your company"
              checked={loc.has_mobile}
              onToggle={v => updateLocation(activeLocation, 'has_mobile', v)}
            >
              {loc.has_mobile && (
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
                  <p style={questionHint}>Check your fuel purchase cards, fleet fuel reports, or fuel receipts for this location.</p>
                  <div>
                    <Field label={`Total gasoline purchased for company vehicles in ${inventory.reporting_year}`} hint="Cars, light trucks, vans">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="number" value={loc.gasoline_amount || ''} onChange={e => updateLocation(activeLocation, 'gasoline_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                        <select value={loc.gasoline_unit} onChange={e => updateLocation(activeLocation, 'gasoline_unit', e.target.value as any)} style={{ ...inputStyle, width: 120 }}>
                          <option value="gallons">US gallons</option>
                          <option value="litres">Litres</option>
                        </select>
                      </div>
                    </Field>
                  </div>
                  <div>
                    <Field label={`Total diesel purchased for company vehicles in ${inventory.reporting_year}`} hint="Trucks, heavy equipment, forklifts">
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input type="number" value={loc.diesel_mobile_amount || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_amount', Number(e.target.value))} placeholder="0" style={{ ...inputStyle, flex: 1 }} />
                        <select value={loc.diesel_mobile_unit} onChange={e => updateLocation(activeLocation, 'diesel_mobile_unit', e.target.value as any)} style={{ ...inputStyle, width: 120 }}>
                          <option value="gallons">US gallons</option>
                          <option value="litres">Litres</option>
                        </select>
                      </div>
                    </Field>
                  </div>
                </div>
              )}
            </QuestionCard>

            {/* REFRIGERATION */}
            <QuestionCard
              question="Does this location have refrigeration or cooling systems?"
              hint="Grain storage, cold storage, and food processing facilities typically have refrigeration"
              checked={loc.uses_ammonia || loc.has_hfc_refrigerants}
              onToggle={v => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }}
              noAutoToggle
            >
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                <p style={questionHint}>What type of refrigerant does this facility use?</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', true); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.uses_ammonia ? '#0F6E56' : '#f8f7f5', color: loc.uses_ammonia ? '#fff' : '#555553', border: `0.5px solid ${loc.uses_ammonia ? '#0F6E56' : '#e8e7e4'}`, cursor: 'pointer' }}>Ammonia (NH₃)</button>
                  <button onClick={() => { updateLocation(activeLocation, 'has_hfc_refrigerants', true); updateLocation(activeLocation, 'uses_ammonia', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: loc.has_hfc_refrigerants ? '#7425e3' : '#f8f7f5', color: loc.has_hfc_refrigerants ? '#fff' : '#555553', border: `0.5px solid ${loc.has_hfc_refrigerants ? '#7425e3' : '#e8e7e4'}`, cursor: 'pointer' }}>HFC refrigerants (R-22, R-410A etc.)</button>
                  <button onClick={() => { updateLocation(activeLocation, 'uses_ammonia', false); updateLocation(activeLocation, 'has_hfc_refrigerants', false) }} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: '#f8f7f5', color: '#555553', border: '0.5px solid #e8e7e4', cursor: 'pointer' }}>No refrigeration</button>
                </div>

                {loc.uses_ammonia && (
                  <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0F6E56', marginBottom: 3 }}>✓ Great news — ammonia has zero global warming potential</div>
                    <div style={{ fontSize: 12, color: '#555553', fontWeight: 300 }}>Ammonia (NH₃) refrigeration is very common in food processing. It contributes zero greenhouse gas emissions so no further data is needed for this category.</div>
                  </div>
                )}

                {loc.has_hfc_refrigerants && (
                  <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
                    <div style={{ background: '#FEF3E2', border: '0.5px solid rgba(186,117,23,0.2)', borderRadius: 8, padding: '12px 14px' }}>
                      <div style={{ fontSize: 12, color: '#633806', lineHeight: 1.6 }}>Check your refrigeration service records. The amount of refrigerant purchased for "top-up" during the year equals the amount that leaked — this is the standard GHG Protocol methodology.</div>
                    </div>
                    <Field label="What type of refrigerant?" hint="Check the nameplate on your refrigeration equipment or service records">
                      <select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}>
                        <option value="r410a">R-410A — most common in newer systems</option>
                        <option value="r22">R-22 — older systems (being phased out)</option>
                        <option value="r134a">R-134a — medium temperature refrigeration</option>
                        <option value="r404a">R-404A — low temperature / frozen storage</option>
                        <option value="r507">R-507 — low temperature refrigeration</option>
                      </select>
                    </Field>
                    <Field label="How many kg of refrigerant were purchased for top-up this year?" hint="From your refrigeration service records or refrigerant supplier invoices">
                      <input type="number" value={loc.refrigerant_purchased_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_purchased_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                    </Field>
                  </div>
                )}
              </div>
            </QuestionCard>

            {/* ELECTRICITY */}
            <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>Purchased electricity</div>
              <p style={{ fontSize: 13, color: '#888784', fontWeight: 300, marginBottom: '1rem', lineHeight: 1.6 }}>All facilities use electricity. Check your electricity utility bills for the annual kWh total.</p>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
                <Field label={`Total electricity used in ${inventory.reporting_year} (kWh)`} hint="Add up all 12 months of electricity bills for this location. kWh is always shown on your bill.">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Where is this location?" hint="We use this to apply the correct regional electricity emission factor">
                  <select value={loc.grid_region} onChange={e => updateLocation(activeLocation, 'grid_region', e.target.value)} style={inputStyle}>
                    {GRID_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
              </div>
            </div>

            {/* PURCHASED STEAM */}
            <QuestionCard
              question="Does this location purchase steam from an external supplier?"
              hint="Some food processing facilities purchase steam from a district energy provider — this is uncommon but required if applicable"
              checked={loc.has_purchased_steam}
              onToggle={v => updateLocation(activeLocation, 'has_purchased_steam', v)}
            >
              {loc.has_purchased_steam && (
                <Field label="Total purchased steam in year (MMBtu)" hint="From your steam supplier invoice — in MMBtu or million BTU">
                  <input type="number" value={loc.purchased_steam_mmbtu || ''} onChange={e => updateLocation(activeLocation, 'purchased_steam_mmbtu', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
              )}
            </QuestionCard>

          </div>

          {/* LIVE RESULTS PANEL */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Your results — {loc.name}</div>
              {[
                { label: 'Heating & fuel emissions', val: calc.s1_stationary, color: '#7425e3' },
                { label: 'Vehicle & fleet emissions', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Refrigerant emissions', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Total direct emissions (Scope 1)', val: calc.s1_total, color: '#fff', bold: true },
                { label: 'Electricity emissions (Scope 2)', val: calc.s2_location, color: '#64fe3e', bold: true },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: bold ? 600 : 300, paddingRight: 8 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400, flexShrink: 0 }}>{val.toFixed(2)} mt</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>mt = metric tonnes CO₂ equivalent · Calculated using EPA 2024 emission factors and IPCC AR4 GWP values as required by CARB SB 253</div>
              </div>
            </div>

            {inventory.locations.length > 1 && (
              <div style={{ marginTop: 12, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 12, padding: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#888784', marginBottom: 8, letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>All locations total</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#7425e3' }}>{totals.s1_total.toFixed(2)} mt Scope 1</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0F6E56' }}>{totals.s2_total.toFixed(2)} mt Scope 2</div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2 — REVIEW ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Your GHG inventory results</h2>
      <p style={sectionSub}>Here is your complete Scope 1 and Scope 2 GHG inventory for {inventory.company_name}, {inventory.reporting_year}. All figures are in metric tonnes CO₂ equivalent (mtCO₂e).</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '2rem' }}>
        {[
          { label: 'Total Scope 1 Emissions', val: totals.s1_total, unit: 'mtCO₂e', color: '#7425e3', bg: '#EDE9FE', desc: 'Direct emissions from fuels, vehicles, and refrigerants' },
          { label: 'Total Scope 2 Emissions', val: totals.s2_total, unit: 'mtCO₂e', color: '#0F6E56', bg: '#E1F5EE', desc: 'Indirect emissions from purchased electricity' },
          { label: 'Scope 1 Intensity', val: intensity_s1, unit: 'mtCO₂e per $M revenue', color: '#0C447C', bg: '#E6F1FB', desc: 'Required by CARB' },
          { label: 'Scope 2 Intensity', val: intensity_s2, unit: 'mtCO₂e per $M revenue', color: '#ba7517', bg: '#FEF3E2', desc: 'Required by CARB' },
        ].map(({ label, val, unit, color, bg, desc }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '1.25rem', border: `0.5px solid ${color}22` }}>
            <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.4 }}>{label}</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.8rem', fontWeight: 400, color, lineHeight: 1 }}>{val.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: '#888784', marginTop: 4 }}>{unit}</div>
            <div style={{ fontSize: 10, color: '#888784', marginTop: 4, fontStyle: 'italic' }}>{desc}</div>
          </div>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: '2rem' }}>
        <thead>
          <tr>{['Location', 'State', 'Heating & Fuel', 'Vehicles', 'Refrigerants', 'Scope 1 Total', 'Electricity', 'Grand Total'].map(h => (
            <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {inventory.locations.map((loc, i) => {
            const c = calcLocation(loc)
            return (
              <tr key={loc.id} style={{ background: i % 2 === 0 ? '#fff' : '#f8f7f5' }}>
                <td style={tdStyle}>{loc.name}</td>
                <td style={tdStyle}>{loc.state || '—'}</td>
                <td style={tdStyle}>{c.s1_stationary.toFixed(2)}</td>
                <td style={tdStyle}>{c.s1_mobile.toFixed(2)}</td>
                <td style={tdStyle}>{c.s1_fugitive.toFixed(2)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#7425e3' }}>{c.s1_total.toFixed(2)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#0F6E56' }}>{c.s2_location.toFixed(2)}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{(c.s1_total + c.s2_location).toFixed(2)}</td>
              </tr>
            )
          })}
          <tr style={{ background: '#0d0d0d' }}>
            <td colSpan={5} style={{ ...tdStyle, color: '#fff', fontWeight: 700 }}>TOTAL — ALL LOCATIONS</td>
            <td style={{ ...tdStyle, color: '#b39ddb', fontWeight: 700 }}>{totals.s1_total.toFixed(2)}</td>
            <td style={{ ...tdStyle, color: '#64fe3e', fontWeight: 700 }}>{totals.s2_total.toFixed(2)}</td>
            <td style={{ ...tdStyle, color: '#fff', fontWeight: 700 }}>{(totals.s1_total + totals.s2_total).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderLeft: '3px solid #0F6E56', borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 4 }}>✓ Your inventory is complete — ready for CARB export</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>Click "Continue" to download your pre-filled CARB SB 253 template. All calculations use EPA 2024 emission factors and IPCC AR4 GWP values as required by CARB for SB 253 reporting.</div>
      </div>
    </div>
  )

  // ── STEP 3 — CARB EXPORT ────────────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>CARB SB 253 Export</h2>
      <p style={sectionSub}>Your pre-filled CARB template is ready to download. You can submit this directly to CARB or provide it to your third-party verifier.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '2rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>Ready to submit</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '2rem' }}>
          {[
            ['Company', inventory.company_name || '—'],
            ['Reporting year', String(inventory.reporting_year)],
            ['Number of locations', String(inventory.locations.length)],
            ['Boundary approach', inventory.boundary_approach.replace(/_/g, ' ')],
            ['Scope 1 total', `${totals.s1_total.toFixed(2)} mtCO₂e`],
            ['Scope 2 total (location-based)', `${totals.s2_total.toFixed(2)} mtCO₂e`],
            ['Scope 1 intensity', `${intensity_s1.toFixed(4)} mtCO₂e / $M revenue`],
            ['Emission factors used', 'EPA 2024 · IPCC AR4 GWP · eGRID 2023'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
        <button onClick={generateCARBExport} style={{ fontSize: 14, fontWeight: 500, padding: '13px 32px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>
          ⬇ Download CARB SB 253 Template
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          ['✓', 'CARB-compliant format', 'Pre-filled with your inventory data in the official CARB SB 253 template fields'],
          ['✓', 'AR4 GWP values', 'All calculations use IPCC AR4 GWP values as required by CARB — not AR5 or AR6'],
          ['✓', 'EPA 2024 emission factors', 'Stationary combustion, mobile, and eGRID 2023 electricity factors throughout'],
          ['✓', 'Verifier-ready', 'Includes methodology documentation and emission factor citations for your third-party verifier'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: '#0F6E56', fontWeight: 700 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.5, fontWeight: 300 }}>{desc}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const generateCARBExport = () => {
    const rows = [
      ['CARB SB 253 — Scope 1 and Scope 2 GHG Emissions Report'],
      ['Generated by ThemisIQ · www.themisiq.co'],
      [''],
      ['ORGANIZATION INFORMATION'],
      ['Company name', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Annual revenue (USD millions)', inventory.revenue_millions],
      ['Organizational boundary approach', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Number of reporting locations', inventory.locations.length],
      [''],
      ['DISCLOSURE — SCOPE 1 (Direct Emissions)'],
      ['Scope 1 total direct emissions (mtCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 1 — Stationary Combustion (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_stationary, 0).toFixed(4)],
      ['Scope 1 — Mobile Combustion (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_mobile, 0).toFixed(4)],
      ['Scope 1 — Fugitive Emissions (mtCO₂e)', inventory.locations.reduce((a, l) => a + calcLocation(l).s1_fugitive, 0).toFixed(4)],
      ['Scope 1 emission intensity (mtCO₂e per $M revenue)', intensity_s1.toFixed(6)],
      [''],
      ['DISCLOSURE — SCOPE 2 (Indirect Emissions)'],
      ['Scope 2 location-based total (mtCO₂e)', totals.s2_total.toFixed(4)],
      ['Scope 2 emission intensity (mtCO₂e per $M revenue)', intensity_s2.toFixed(6)],
      [''],
      ['METHODS'],
      ['Scope 1 emission factors', 'US EPA (2024) Emission Factors for Greenhouse Gas Inventories'],
      ['Scope 2 emission factors', 'US EPA eGRID (2023) subregion location-based emission factors'],
      ['GWP values', 'IPCC Fourth Assessment Report (AR4) — as required by CARB SB 253'],
      ['Calculation methodology', 'Activity data × emission factor = GHG emissions'],
      [''],
      ['LOCATION BREAKDOWN'],
      ['Location Name', 'State', 'Scope 1 Stationary (mtCO₂e)', 'Scope 1 Mobile (mtCO₂e)', 'Scope 1 Fugitive (mtCO₂e)', 'Scope 1 Total (mtCO₂e)', 'Scope 2 Location-Based (mtCO₂e)', 'Grand Total (mtCO₂e)'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc)
        return [loc.name, loc.state, c.s1_stationary.toFixed(4), c.s1_mobile.toFixed(4), c.s1_fugitive.toFixed(4), c.s1_total.toFixed(4), c.s2_location.toFixed(4), (c.s1_total + c.s2_location).toFixed(4)]
      }),
      ['TOTAL — ALL LOCATIONS', '', '', '', '', totals.s1_total.toFixed(4), totals.s2_total.toFixed(4), (totals.s1_total + totals.s2_total).toFixed(4)],
      [''],
      ['DISCLAIMER'],
      ['This report was generated by the ThemisIQ platform and is provided for informational and planning purposes only.'],
      ['It does not constitute legal advice, regulatory assurance, or a professional opinion.'],
      ['All Scope 1 and Scope 2 emissions require third-party limited assurance before submission to CARB.'],
      ['ThemisIQ is not an accredited assurance provider under any GHG Protocol, CARB, ESRS, or CDP framework.'],
      ['ThemisIQ Compliance Inc. · www.themisiq.co · privacy@themisiq.co'],
    ]

    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ThemisIQ_CARB_SB253_${inventory.company_name.replace(/\s+/g, '_')}_${inventory.reporting_year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderContent = () => {
    if (step === 0) return renderStep0()
    if (step === 1) return renderStep1()
    if (step === 2) return renderStep2()
    return renderStep3()
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

      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', gap: 0 }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400 }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {renderContent()}
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

function QuestionCard({ question, hint, checked, onToggle, noAutoToggle, children }: { question: string, hint: string, checked: boolean, onToggle: (v: boolean) => void, noAutoToggle?: boolean, children?: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `0.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: noAutoToggle ? 'default' : 'pointer' }} onClick={noAutoToggle ? undefined : () => onToggle(!checked)}>
        <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.5px solid ${checked ? '#7425e3' : '#e8e7e4'}`, background: checked ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {checked && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>✓</span>}
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>{question}</div>
          <div style={{ fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.5 }}>{hint}</div>
        </div>
      </div>
      {checked && children && (
        <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
          <div style={{ paddingTop: '1rem' }}>{children}</div>
        </div>
      )}
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
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 12 }
const questionHint: React.CSSProperties = { fontSize: 12, color: '#888784', fontWeight: 300, lineHeight: 1.6, marginBottom: '0.75rem' }
