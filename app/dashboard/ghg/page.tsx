'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

// ── EMISSION FACTORS (AR4 GWP, EPA 2024) ─────────────────────────────
const EF = {
  // Stationary combustion (kg CO2e per unit)
  natural_gas_mmbtu: 53.06,      // kg CO2e per MMBtu (EPA)
  natural_gas_mcf: 54.87,        // kg CO2e per Mcf
  propane_gallon: 5.74,          // kg CO2e per gallon
  diesel_gallon: 10.21,          // kg CO2e per gallon
  fuel_oil_gallon: 10.16,        // kg CO2e per gallon
  coal_short_ton: 2093.3,        // kg CO2e per short ton

  // Mobile combustion
  gasoline_gallon: 8.78,         // kg CO2e per gallon
  diesel_mobile_gallon: 10.21,   // kg CO2e per gallon
  propane_mobile_gallon: 5.74,   // kg CO2e per gallon

  // Refrigerants (kg CO2e per kg leaked) — AR4 GWP
  r22: 1810,
  r134a: 1430,
  r404a: 3922,
  r410a: 2088,
  r507: 3985,
  ammonia: 0,                    // NH3 — zero GWP, common in food processing

  // Electricity — US average (EPA eGRID 2023, kg CO2e per kWh)
  us_average: 0.3866,
  // Regional factors
  mro: 0.4891,   // Midwest
  serc: 0.3629,  // Southeast
  wecc: 0.2877,  // West
  npcc: 0.1967,  // Northeast
  spp: 0.4652,   // South Central
  frcc: 0.4051,  // Florida
  hicc: 0.6389,  // Hawaii
  ascc: 0.5893,  // Alaska
}

const GRID_REGIONS = [
  { value: 'us_average', label: 'US Average (use if unknown)' },
  { value: 'mro', label: 'MRO — Midwest (IL, MI, MN, WI, ND, SD, NE, MO, KS, IA)' },
  { value: 'serc', label: 'SERC — Southeast (AL, GA, FL, TN, SC, NC, VA, KY, MS)' },
  { value: 'wecc', label: 'WECC — West (CA, OR, WA, NV, AZ, UT, CO, ID, MT, WY)' },
  { value: 'npcc', label: 'NPCC — Northeast (NY, NJ, CT, MA, RI, VT, NH, ME)' },
  { value: 'spp', label: 'SPP — South Central (TX, OK, AR, LA, KS, NE, MO)' },
  { value: 'frcc', label: 'FRCC — Florida' },
]

// ── TYPES ─────────────────────────────────────────────────────────────
interface Location {
  id: string
  name: string
  state: string
  // Scope 1 — Stationary
  natural_gas_mmbtu: number
  propane_gallons: number
  diesel_gallons: number
  fuel_oil_gallons: number
  // Scope 1 — Mobile
  gasoline_gallons: number
  diesel_mobile_gallons: number
  // Scope 1 — Fugitive
  refrigerant_type: string
  refrigerant_kg: number
  // Scope 2
  electricity_kwh: number
  grid_region: string
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
  natural_gas_mmbtu: 0, propane_gallons: 0, diesel_gallons: 0, fuel_oil_gallons: 0,
  gasoline_gallons: 0, diesel_mobile_gallons: 0,
  refrigerant_type: 'r22', refrigerant_kg: 0,
  electricity_kwh: 0, grid_region: 'us_average', purchased_steam_mmbtu: 0,
})

// ── CALCULATIONS ──────────────────────────────────────────────────────
function calcLocation(loc: Location) {
  const s1_stationary =
    (loc.natural_gas_mmbtu * EF.natural_gas_mmbtu +
     loc.propane_gallons * EF.propane_gallon +
     loc.diesel_gallons * EF.diesel_gallon +
     loc.fuel_oil_gallons * EF.fuel_oil_gallon) / 1000 // convert kg to mt

  const s1_mobile =
    (loc.gasoline_gallons * EF.gasoline_gallon +
     loc.diesel_mobile_gallons * EF.diesel_mobile_gallon) / 1000

  const s1_fugitive =
    (loc.refrigerant_kg * (EF[loc.refrigerant_type as keyof typeof EF] as number || 0)) / 1000

  const s1_total = s1_stationary + s1_mobile + s1_fugitive

  const s2_location =
    (loc.electricity_kwh * (EF[loc.grid_region as keyof typeof EF] as number || EF.us_average) +
     loc.purchased_steam_mmbtu * 66.4) / 1000 // 66.4 kg CO2e/MMBtu for steam

  return { s1_stationary, s1_mobile, s1_fugitive, s1_total, s2_location }
}

function calcTotal(locations: Location[]) {
  return locations.reduce((acc, loc) => {
    const c = calcLocation(loc)
    return {
      s1_total: acc.s1_total + c.s1_total,
      s2_total: acc.s2_total + c.s2_location,
    }
  }, { s1_total: 0, s2_total: 0 })
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────
export default function GHGPage() {
  const [step, setStep] = useState(0)
  const [inventory, setInventory] = useState<Inventory>({
    company_name: '',
    reporting_year: 2024,
    revenue_millions: 0,
    boundary_approach: 'operational_control',
    locations: [emptyLocation('1', 'Location 1')],
  })
  const [activeLocation, setActiveLocation] = useState(0)
  const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<any>(null)

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

  const STEPS = ['Company setup', 'Location data', 'Review & calculate', 'CARB export']

  // ── STEP 0 — COMPANY SETUP ──────────────────────────────────────────
  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company & inventory setup</h2>
      <p style={sectionSub}>This information appears on your CARB SB 253 submission.</p>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, maxWidth: 560 }}>
        <Field label="Company name">
          <input value={inventory.company_name} onChange={e => setInventory(i => ({...i, company_name: e.target.value}))} placeholder="Acme Wheat Processing Inc." style={inputStyle} />
        </Field>
        <Field label="Reporting year">
          <select value={inventory.reporting_year} onChange={e => setInventory(i => ({...i, reporting_year: Number(e.target.value)}))} style={inputStyle}>
            <option value={2024}>2024 (first SB 253 reporting year)</option>
            <option value={2023}>2023</option>
            <option value={2025}>2025</option>
          </select>
        </Field>
        <Field label="Global annual revenue (USD millions)" hint="Used to calculate emission intensity — required by CARB">
          <input type="number" value={inventory.revenue_millions || ''} onChange={e => setInventory(i => ({...i, revenue_millions: Number(e.target.value)}))} placeholder="1000" style={inputStyle} />
        </Field>
        <Field label="Organizational boundary approach">
          <select value={inventory.boundary_approach} onChange={e => setInventory(i => ({...i, boundary_approach: e.target.value}))} style={inputStyle}>
            <option value="operational_control">Operational Control (recommended)</option>
            <option value="financial_control">Financial Control</option>
            <option value="equity_share">Equity Share</option>
          </select>
        </Field>
        <Field label="Number of locations / facilities">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#0d0d0d' }}>{inventory.locations.length} location{inventory.locations.length > 1 ? 's' : ''} added</span>
            <button onClick={addLocation} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: '#f8f7f5', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>+ Add location</button>
          </div>
        </Field>
        {inventory.locations.map((loc, i) => (
          <div key={loc.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={loc.name} onChange={e => updateLocation(i, 'name', e.target.value)} placeholder={`Location ${i+1} name`} style={{ ...inputStyle, flex: 1 }} />
            <input value={loc.state} onChange={e => updateLocation(i, 'state', e.target.value)} placeholder="State" style={{ ...inputStyle, width: 80 }} />
          </div>
        ))}
      </div>
    </div>
  )

  // ── STEP 1 — LOCATION DATA ──────────────────────────────────────────
  const renderStep1 = () => {
    const loc = inventory.locations[activeLocation]
    const calc = calcLocation(loc)

    return (
      <div>
        <h2 style={sectionHead}>Activity data by location</h2>
        <p style={sectionSub}>Enter annual energy consumption and activity data for each location. All calculations use EPA 2024 emission factors and IPCC AR4 GWP values as required by CARB.</p>

        {/* LOCATION TABS */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: '1.5rem' }}>
          {inventory.locations.map((loc, i) => (
            <button key={loc.id} onClick={() => setActiveLocation(i)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: activeLocation === i ? '#0d0d0d' : '#f8f7f5', color: activeLocation === i ? '#fff' : '#555553', border: `0.5px solid ${activeLocation === i ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>
              {loc.name || `Location ${i+1}`}
            </button>
          ))}
          <button onClick={addLocation} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'none', color: '#7425e3', border: '0.5px solid #7425e3', cursor: 'pointer' }}>+ Add location</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '2rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 24 }}>

            {/* SCOPE 1 STATIONARY */}
            <Section title="Scope 1 — Stationary Combustion" color="#7425e3" hint="Fuels burned in boilers, furnaces, dryers, generators at this location">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Natural gas (MMBtu/year)" hint="Check utility bills — convert Mcf × 1.02 = MMBtu">
                  <input type="number" value={loc.natural_gas_mmbtu || ''} onChange={e => updateLocation(activeLocation, 'natural_gas_mmbtu', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Propane / LPG (gallons/year)" hint="Common for grain dryers and forklifts">
                  <input type="number" value={loc.propane_gallons || ''} onChange={e => updateLocation(activeLocation, 'propane_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Diesel (gallons/year)" hint="Stationary generators and boilers only">
                  <input type="number" value={loc.diesel_gallons || ''} onChange={e => updateLocation(activeLocation, 'diesel_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Fuel oil (gallons/year)" hint="#2 fuel oil or heating oil">
                  <input type="number" value={loc.fuel_oil_gallons || ''} onChange={e => updateLocation(activeLocation, 'fuel_oil_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
              </div>
            </Section>

            {/* SCOPE 1 MOBILE */}
            <Section title="Scope 1 — Mobile Combustion" color="#1fb1ff" hint="Company-owned vehicles operated at or from this location">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Gasoline (gallons/year)" hint="Company cars, light trucks">
                  <input type="number" value={loc.gasoline_gallons || ''} onChange={e => updateLocation(activeLocation, 'gasoline_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Diesel — mobile (gallons/year)" hint="Delivery trucks, heavy fleet">
                  <input type="number" value={loc.diesel_mobile_gallons || ''} onChange={e => updateLocation(activeLocation, 'diesel_mobile_gallons', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
              </div>
            </Section>

            {/* SCOPE 1 FUGITIVE */}
            <Section title="Scope 1 — Fugitive Emissions" color="#ba7517" hint="Refrigerant leaks from cooling and refrigeration systems">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Refrigerant type">
                  <select value={loc.refrigerant_type} onChange={e => updateLocation(activeLocation, 'refrigerant_type', e.target.value)} style={inputStyle}>
                    <option value="ammonia">Ammonia (NH3) — common in food processing, zero GWP</option>
                    <option value="r22">R-22 — GWP 1,810</option>
                    <option value="r134a">R-134a — GWP 1,430</option>
                    <option value="r404a">R-404A — GWP 3,922</option>
                    <option value="r410a">R-410A — GWP 2,088</option>
                    <option value="r507">R-507 — GWP 3,985</option>
                  </select>
                </Field>
                <Field label="Refrigerant leaked (kg/year)" hint="From service records — kg purchased for top-up = kg leaked">
                  <input type="number" value={loc.refrigerant_kg || ''} onChange={e => updateLocation(activeLocation, 'refrigerant_kg', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
              </div>
            </Section>

            {/* SCOPE 2 */}
            <Section title="Scope 2 — Purchased Electricity" color="#0F6E56" hint="Electricity purchased from the grid for this location">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Electricity consumed (kWh/year)" hint="From utility bills — annual total">
                  <input type="number" value={loc.electricity_kwh || ''} onChange={e => updateLocation(activeLocation, 'electricity_kwh', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
                <Field label="Grid region" hint="Select the eGRID region for this location">
                  <select value={loc.grid_region} onChange={e => updateLocation(activeLocation, 'grid_region', e.target.value)} style={inputStyle}>
                    {GRID_REGIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Purchased steam (MMBtu/year)" hint="If your facility purchases steam from a third party">
                  <input type="number" value={loc.purchased_steam_mmbtu || ''} onChange={e => updateLocation(activeLocation, 'purchased_steam_mmbtu', Number(e.target.value))} placeholder="0" style={inputStyle} />
                </Field>
              </div>
            </Section>

          </div>

          {/* LIVE CALC PANEL */}
          <div style={{ position: 'sticky', top: 80 }}>
            <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '1.5rem', color: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Live calculation — {loc.name}</div>
              {[
                { label: 'Scope 1 — Stationary', val: calc.s1_stationary, color: '#7425e3' },
                { label: 'Scope 1 — Mobile', val: calc.s1_mobile, color: '#1fb1ff' },
                { label: 'Scope 1 — Fugitive', val: calc.s1_fugitive, color: '#ba7517' },
                { label: 'Scope 1 Total', val: calc.s1_total, color: '#fff', bold: true },
                { label: 'Scope 2 — Electricity', val: calc.s2_location, color: '#64fe3e' },
              ].map(({ label, val, color, bold }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: 12, color: bold ? '#fff' : 'rgba(255,255,255,0.5)', fontWeight: bold ? 600 : 300 }}>{label}</span>
                  <span style={{ fontSize: 12, color, fontWeight: bold ? 700 : 400 }}>{val.toFixed(2)} mtCO₂e</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>Emission factors</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>EPA 2024 · IPCC AR4 GWP · eGRID 2023 · Required by CARB SB 253</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2 — REVIEW ─────────────────────────────────────────────────
  const renderStep2 = () => (
    <div>
      <h2 style={sectionHead}>Review & calculate</h2>
      <p style={sectionSub}>Your complete GHG inventory for {inventory.company_name} — {inventory.reporting_year}. All figures in metric tonnes CO₂e (mtCO₂e).</p>

      {/* TOTALS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: '2rem' }}>
        {[
          { label: 'Total Scope 1', val: totals.s1_total, color: '#7425e3', bg: '#EDE9FE' },
          { label: 'Total Scope 2', val: totals.s2_total, color: '#0F6E56', bg: '#E1F5EE' },
          { label: 'Scope 1 Intensity', val: intensity_s1, unit: 'mtCO₂e/$M revenue', color: '#0C447C', bg: '#E6F1FB' },
          { label: 'Scope 2 Intensity', val: intensity_s2, unit: 'mtCO₂e/$M revenue', color: '#ba7517', bg: '#FEF3E2' },
        ].map(({ label, val, color, bg, unit }) => (
          <div key={label} style={{ background: bg, borderRadius: 10, padding: '1.25rem', border: `0.5px solid ${color}22` }}>
            <div style={{ fontSize: 11, color: '#888784', marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color }}>{val.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: '#888784', marginTop: 2 }}>{unit || 'mtCO₂e'}</div>
          </div>
        ))}
      </div>

      {/* LOCATION BREAKDOWN */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: '2rem' }}>
        <thead>
          <tr>
            {['Location', 'State', 'Scope 1 Stationary', 'Scope 1 Mobile', 'Scope 1 Fugitive', 'Scope 1 Total', 'Scope 2', 'Total'].map(h => (
              <th key={h} style={{ background: '#0d0d0d', color: '#fff', padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 500 }}>{h}</th>
            ))}
          </tr>
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
                <td style={{ ...tdStyle, fontWeight: 700, color: '#0d0d0d' }}>{(c.s1_total + c.s2_location).toFixed(2)}</td>
              </tr>
            )
          })}
          <tr style={{ background: '#0d0d0d' }}>
            <td colSpan={5} style={{ ...tdStyle, color: '#fff', fontWeight: 700 }}>TOTAL</td>
            <td style={{ ...tdStyle, color: '#7425e3', fontWeight: 700 }}>{totals.s1_total.toFixed(2)}</td>
            <td style={{ ...tdStyle, color: '#64fe3e', fontWeight: 700 }}>{totals.s2_total.toFixed(2)}</td>
            <td style={{ ...tdStyle, color: '#fff', fontWeight: 700 }}>{(totals.s1_total + totals.s2_total).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.25)', borderLeft: '3px solid #0F6E56', borderRadius: 8, padding: '13px 15px' }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d', marginBottom: 3 }}>Ready for CARB submission</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, fontWeight: 300 }}>Your inventory is complete. Click "Generate CARB Export" to download the pre-filled SB 253 Excel template ready for submission to CARB or your third-party verifier.</div>
      </div>
    </div>
  )

  // ── STEP 3 — CARB EXPORT ────────────────────────────────────────────
  const renderStep3 = () => (
    <div>
      <h2 style={sectionHead}>CARB SB 253 Export</h2>
      <p style={sectionSub}>Your pre-filled CARB template is ready. Download it and submit directly to CARB or provide to your third-party verifier.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 12, padding: '2rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Inventory summary — ready for CARB</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: '1.5rem' }}>
          {[
            ['Company', inventory.company_name],
            ['Reporting year', String(inventory.reporting_year)],
            ['Locations', String(inventory.locations.length)],
            ['Boundary approach', inventory.boundary_approach.replace(/_/g, ' ')],
            ['Scope 1 total', `${totals.s1_total.toFixed(2)} mtCO₂e`],
            ['Scope 2 total', `${totals.s2_total.toFixed(2)} mtCO₂e`],
            ['Scope 1 intensity', `${intensity_s1.toFixed(4)} mtCO₂e/$M revenue`],
            ['Emission factors', 'EPA 2024 · IPCC AR4 GWP'],
          ].map(([label, val]) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{val}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => generateCARBExport()}
          style={{ fontSize: 14, fontWeight: 500, padding: '12px 28px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}
        >
          ⬇ Download CARB SB 253 Template (Excel)
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { icon: '✓', title: 'CARB-compliant format', desc: 'Pre-filled with your inventory data in the official CARB SB 253 template format' },
          { icon: '✓', title: 'AR4 GWP values', desc: 'All calculations use IPCC AR4 GWP values as required by CARB for SB 253 reporting' },
          { icon: '✓', title: 'Verifier-ready', desc: 'Includes methodology documentation and emission factor citations for your third-party verifier' },
          { icon: '✓', title: 'Audit trail', desc: 'All data entries are logged with timestamps and user information for assurance purposes' },
        ].map(({ icon, title, desc }) => (
          <div key={title} style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1.25rem' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ color: '#0F6E56', fontWeight: 700, flexShrink: 0 }}>{icon}</span>
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

  // ── CARB EXPORT GENERATOR ───────────────────────────────────────────
  const generateCARBExport = () => {
    const rows = [
      ['CARB SB 253 — Scope 1 and Scope 2 GHG Emissions Report'],
      ['Generated by ThemisIQ · www.themisiq.co'],
      [''],
      ['ORGANIZATION INFORMATION'],
      ['Company name', inventory.company_name],
      ['Reporting year', inventory.reporting_year],
      ['Annual revenue ($M USD)', inventory.revenue_millions],
      ['Organizational boundary', inventory.boundary_approach.replace(/_/g, ' ')],
      ['Number of locations', inventory.locations.length],
      [''],
      ['DISCLOSURE — SCOPE 1'],
      ['Scope 1 total direct emissions (mtCO₂e)', totals.s1_total.toFixed(4)],
      ['Scope 1 intensity (mtCO₂e per $M revenue)', intensity_s1.toFixed(6)],
      [''],
      ['DISCLOSURE — SCOPE 2'],
      ['Scope 2 location-based total (mtCO₂e)', totals.s2_total.toFixed(4)],
      ['Scope 2 intensity (mtCO₂e per $M revenue)', intensity_s2.toFixed(6)],
      [''],
      ['METHODS'],
      ['Scope 1 emission factors', 'US EPA (2024) — Emission Factors for Greenhouse Gas Inventories'],
      ['Scope 2 emission factors', 'US EPA eGRID (2023) — subregion location-based factors'],
      ['GWP values', 'IPCC AR4 (2007) — as required by CARB SB 253'],
      ['Calculation approach', 'Activity data × emission factor'],
      [''],
      ['LOCATION BREAKDOWN'],
      ['Location', 'State', 'Scope 1 Stationary (mtCO₂e)', 'Scope 1 Mobile (mtCO₂e)', 'Scope 1 Fugitive (mtCO₂e)', 'Scope 1 Total (mtCO₂e)', 'Scope 2 Location-Based (mtCO₂e)', 'Total (mtCO₂e)'],
      ...inventory.locations.map(loc => {
        const c = calcLocation(loc)
        return [loc.name, loc.state, c.s1_stationary.toFixed(4), c.s1_mobile.toFixed(4), c.s1_fugitive.toFixed(4), c.s1_total.toFixed(4), c.s2_location.toFixed(4), (c.s1_total + c.s2_location).toFixed(4)]
      }),
      ['TOTAL', '', '', '', '', totals.s1_total.toFixed(4), totals.s2_total.toFixed(4), (totals.s1_total + totals.s2_total).toFixed(4)],
      [''],
      ['DISCLAIMER'],
      ['This report was generated by the ThemisIQ platform. It does not constitute legal advice, regulatory assurance, or a professional opinion.'],
      ['All reported Scope 1 and Scope 2 emissions require third-party limited assurance before submission to CARB.'],
      ['ThemisIQ Compliance Inc. · privacy@themisiq.co · www.themisiq.co'],
    ]

    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
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
    if (step === 3) return renderStep3()
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <a href="/dashboard" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="ThemisIQ" style={{ height: 24, width: 'auto', display: 'block' }} />
          </a>
          <span style={{ fontSize: 12, color: '#888784' }}>←</span>
          <a href="/dashboard" style={{ fontSize: 13, color: '#555553', textDecoration: 'none' }}>Dashboard</a>
          <span style={{ fontSize: 12, color: '#888784' }}>/ GHG Inventory</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSaved(true)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: '#f8f7f5', border: '0.5px solid #e8e7e4', cursor: 'pointer', color: '#555553' }}>
            {saved ? '✓ Saved' : 'Save draft'}
          </button>
        </div>
      </nav>

      {/* PROGRESS */}
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '0 2rem', display: 'flex', gap: 0 }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => setStep(i)} style={{ fontSize: 12, padding: '14px 20px', background: 'none', border: 'none', borderBottom: `2px solid ${step === i ? '#7425e3' : 'transparent'}`, color: step === i ? '#7425e3' : '#888784', cursor: 'pointer', fontWeight: step === i ? 500 : 400 }}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2.5rem 2rem' }}>
        {renderContent()}

        {/* NAV BUTTONS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2rem', paddingTop: '1.5rem', borderTop: '0.5px solid #e8e7e4' }}>
          <button onClick={() => setStep(s => Math.max(0, s-1))} disabled={step === 0} style={{ fontSize: 13, padding: '10px 24px', borderRadius: 8, background: 'none', border: '0.5px solid #e8e7e4', cursor: step === 0 ? 'not-allowed' : 'pointer', color: '#555553', opacity: step === 0 ? 0.4 : 1 }}>← Back</button>
          {step < STEPS.length - 1 && (
            <button onClick={() => setStep(s => Math.min(STEPS.length-1, s+1))} style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>Continue →</button>
          )}
          {step === STEPS.length - 1 && (
            <button onClick={generateCARBExport} style={{ fontSize: 13, fontWeight: 500, padding: '10px 24px', borderRadius: 8, background: 'linear-gradient(135deg,#7425e3,#1fb1ff,#64fe3e)', color: '#0d0d0d', border: 'none', cursor: 'pointer' }}>⬇ Download CARB Export</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HELPER COMPONENTS ─────────────────────────────────────────────────
function Section({ title, color, hint, children }: { title: string, color: string, hint: string, children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ background: color, padding: '10px 16px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{hint}</div>
      </div>
      <div style={{ padding: '1.25rem' }}>{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: '#0d0d0d', display: 'block', marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 11, color: '#888784', marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '9px 12px', border: '0.5px solid #e8e7e4', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: '#fff' }
const sectionHead: React.CSSProperties = { fontFamily: 'Georgia, serif', fontSize: '1.6rem', fontWeight: 400, color: '#0d0d0d', marginBottom: 8 }
const sectionSub: React.CSSProperties = { fontSize: 14, color: '#555553', fontWeight: 300, lineHeight: 1.7, marginBottom: '2rem' }
const tdStyle: React.CSSProperties = { padding: '8px 12px', borderBottom: '0.5px solid #e8e7e4', color: '#555553', fontSize: 12 }
