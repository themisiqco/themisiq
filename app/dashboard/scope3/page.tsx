'use client'

import { useState, useEffect, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlement } from '../../../lib/useEntitlement'
import { EMISSION_FACTORS, DEFAULT_SPEND_EF } from '../../../lib/emissionFactors'
import { resolvePcafResult, assessAsset } from '../../../lib/pcaf/engine'
import type { PcafPortfolioAsset, PcafAssetClass, EmissionInputs } from '../../../lib/pcaf/types'
import { sectionHead } from '@/app/components/headingStyles'
import { btnStep, btnStepDisabled, btnStepPrimary, btnStepPrimaryDisabled } from '@/app/components/buttonStyles'

// ─── Scope 3 Category Definitions ────────────────────────────────────────────

const CATEGORIES = [
  // Upstream
  { id: 'cat1', num: 1, name: 'Purchased goods & services', stream: 'Upstream', desc: 'Emissions from producing goods and services you purchase', method: 'spend', unit: 'spend', materialSectors: ['all'], typicalShare: 0.60 , guidance: 'Emissions from producing everything you buy — raw materials, components, products and services — up to the point they reach you (cradle-to-gate). Usually the single largest Scope 3 category.', dataSource: 'Procurement / AP ledger: annual spend by supplier or category. Best: supplier-specific emissions via the Supplier Portal. Spend-based estimation is permitted for this category.' },
  { id: 'cat2', num: 2, name: 'Capital goods', stream: 'Upstream', desc: 'Emissions from producing capital equipment and assets you buy', method: 'spend', unit: 'spend', materialSectors: ['Industrials & Manufacturing', 'Energy & Utilities', 'Mining & Metals'], typicalShare: 0.05 , guidance: 'Emissions from producing long-life assets you purchase — buildings, machinery, vehicles, IT equipment, infrastructure. Count the full cradle-to-gate footprint in the year acquired (not depreciated over time).', dataSource: 'Fixed-asset register / capital expenditure records for the reporting year. Spend-based estimation is permitted for this category.' },
  { id: 'cat3', num: 3, name: 'Fuel & energy related', stream: 'Upstream', desc: 'Upstream emissions from extraction and production of fuels and energy you use', method: 'activity', unit: 'kwh', materialSectors: ['all'], typicalShare: 0.03 , guidance: 'Upstream emissions of the fuel and electricity you use that AREN\'T already in Scope 1 or 2 — i.e. extracting, producing and transporting those fuels, plus grid transmission & distribution (T&D) losses.', dataSource: 'Your Scope 1 & 2 energy consumption data (kWh, fuel volumes) — apply well-to-tank and T&D-loss factors. Source the consumption from utility bills / the GHG module.' },
  { id: 'cat4', num: 4, name: 'Upstream transportation', stream: 'Upstream', desc: 'Emissions from transporting purchased goods to your facilities', method: 'activity', unit: 'tonne_km', materialSectors: ['Consumer & Retail', 'Agriculture & Food', 'Industrials & Manufacturing'], typicalShare: 0.04 , guidance: 'Emissions from transporting and distributing the goods you BUY, between your suppliers and you — plus third-party logistics you pay for (inbound freight and warehousing).', dataSource: 'Logistics/freight invoices, shipment records (tonne-km or mode/distance). Spend-based estimation is permitted for this category.' },
  { id: 'cat5', num: 5, name: 'Waste generated in operations', stream: 'Upstream', desc: 'Emissions from disposal and treatment of waste generated', method: 'activity', unit: 'tonnes', materialSectors: ['all'], typicalShare: 0.01 , guidance: 'Emissions from third parties treating the waste your operations generate — landfill, incineration, recycling, wastewater.', dataSource: 'Waste contractor invoices / facilities team: tonnes by treatment type. Activity data (tonnes) is needed — spend-based is not appropriate here.' },
  { id: 'cat6', num: 6, name: 'Business travel', stream: 'Upstream', desc: 'Emissions from employee travel for business purposes', method: 'activity', unit: 'mixed', materialSectors: ['Professional Services', 'Financial Services', 'Technology'], typicalShare: 0.05 , guidance: 'Emissions from employees travelling for business — flights, rail, hotels, rental cars — in vehicles not owned by your company.', dataSource: 'Travel & expense system or travel agency reports: flights (distance/class), hotel nights, rail. Spend-based estimation is permitted for this category.' },
  { id: 'cat7', num: 7, name: 'Employee commuting', stream: 'Upstream', desc: 'Emissions from employees travelling to and from work', method: 'activity', unit: 'mixed', materialSectors: ['all'], typicalShare: 0.03 , guidance: 'Emissions from employees commuting between home and work, including remote-work energy use.', dataSource: 'HR headcount + a commuting survey or assumptions (distance, mode, WFH days). Activity-based; spend-based is not appropriate here.' },
  { id: 'cat8', num: 8, name: 'Upstream leased assets', stream: 'Upstream', desc: 'Emissions from assets leased by your organisation', method: 'activity', unit: 'kwh', materialSectors: ['Real Estate', 'Transport & Logistics'], typicalShare: 0.02 , guidance: 'Emissions from assets you LEASE FROM others (as lessee) that aren\'t already in your Scope 1 & 2 — e.g. leased offices or equipment you don\'t operationally control.', dataSource: 'Lease agreements + energy use of leased assets (floor area or metered kWh). Activity-based; spend-based is not appropriate here.' },
  // Downstream
  { id: 'cat9', num: 9, name: 'Downstream transportation', stream: 'Downstream', desc: 'Emissions from transporting and distributing sold products', method: 'activity', unit: 'tonne_km', materialSectors: ['Consumer & Retail', 'Agriculture & Food', 'Industrials & Manufacturing'], typicalShare: 0.03 , guidance: 'Emissions from transporting and distributing the products you SELL, after they leave you — outbound logistics, distribution centres, retail, paid for by others.', dataSource: 'Distribution/logistics records or modelled tonne-km of sold-product movement. Spend-based estimation is permitted for this category.' },
  { id: 'cat10', num: 10, name: 'Processing of sold products', stream: 'Downstream', desc: 'Emissions from processing your intermediate products by third parties', method: 'activity', unit: 'tonnes', materialSectors: ['Industrials & Manufacturing', 'Agriculture & Food'], typicalShare: 0.02 , guidance: 'Emissions from third parties further PROCESSING your sold intermediate products before final use (e.g. you sell a component that\'s then assembled or refined).', dataSource: 'Production volumes of intermediate goods + processing energy assumptions. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat11', num: 11, name: 'Use of sold products', stream: 'Downstream', desc: 'Emissions from end-users using your sold products', method: 'activity', unit: 'units', materialSectors: ['Technology', 'Energy & Utilities', 'Consumer & Retail', 'Industrials & Manufacturing'], typicalShare: 0.15 , guidance: 'Emissions from customers USING the products you sell over their lifetime — often the largest category for energy-using or fuel products.', dataSource: 'Units sold + expected lifetime energy/fuel use per unit. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat12', num: 12, name: 'End-of-life treatment', stream: 'Downstream', desc: 'Emissions from disposal of your sold products at end of life', method: 'activity', unit: 'tonnes', materialSectors: ['Consumer & Retail', 'Industrials & Manufacturing', 'Technology'], typicalShare: 0.02 , guidance: 'Emissions from the end-of-life treatment of your sold products once customers dispose of them — landfill, incineration, recycling.', dataSource: 'Units / mass sold + end-of-life treatment assumptions by material. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat13', num: 13, name: 'Downstream leased assets', stream: 'Downstream', desc: 'Emissions from assets owned and leased to others', method: 'activity', unit: 'kwh', materialSectors: ['Real Estate', 'Financial Services'], typicalShare: 0.01 , guidance: 'Emissions from assets you OWN and LEASE OUT to others (as lessor) that aren\'t in your Scope 1 & 2 — e.g. property you rent to tenants.', dataSource: 'Your leased-out asset portfolio + tenants\' energy use (floor area or metered). Activity-based; spend-based is not appropriate here.' },
  { id: 'cat14', num: 14, name: 'Franchises', stream: 'Downstream', desc: 'Emissions from franchise operations', method: 'activity', unit: 'spend', materialSectors: ['Consumer & Retail'], typicalShare: 0.01 , guidance: 'Emissions from the operations of your FRANCHISEES — relevant if you\'re a franchisor.', dataSource: 'Franchisee energy/activity data, or estimates from number and type of franchise outlets. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat15', num: 15, name: 'Investments', stream: 'Downstream', desc: 'Emissions associated with investments and lending (financed emissions)', method: 'pcaf', unit: 'spend', materialSectors: ['Financial Services'], typicalShare: 0.90 , guidance: 'Emissions associated with your investments and lending (financed emissions) — for investors, banks and asset owners. ThemisIQ estimates this with a PCAF-aligned spend-based portfolio proxy — PCAF data-quality tier 5, the weakest tier — not a full asset-class-decomposed PCAF assessment. ThemisIQ is not PCAF-certified or a PCAF signatory.', dataSource: 'Total portfolio / loan-book value × an openly-sourced sector factor (non-PCAF). A per-asset assessment (asset class + attribution factors) is the higher-fidelity path — if you already hold a computed figure, enter known financed emissions directly.' },
]

// Sector-based materiality
const SECTOR_MATERIAL: Record<string, number[]> = {
  'Energy & Utilities': [1, 2, 3, 4, 6, 7, 11],
  'Financial Services': [1, 3, 6, 7, 13, 15],
  'Real Estate': [1, 2, 3, 7, 8, 13],
  'Technology': [1, 3, 6, 7, 11, 12],
  'Healthcare & Pharma': [1, 3, 4, 5, 6, 7],
  'Industrials & Manufacturing': [1, 2, 3, 4, 5, 7, 9, 10, 12],
  'Consumer & Retail': [1, 3, 4, 6, 7, 9, 11, 12, 14],
  'Agriculture & Food': [1, 3, 4, 5, 7, 9, 10],
  'Transport & Logistics': [1, 3, 4, 6, 7, 8, 9],
  'Mining & Metals': [1, 2, 3, 4, 5, 7],
  'Construction & Materials': [1, 2, 3, 4, 5, 7, 9],
  'Professional Services': [1, 3, 6, 7],
  'Other': [1, 3, 6, 7],
}

// Emission factors (kg CO2e per unit)

const SECTORS = [
  'Energy & Utilities', 'Financial Services', 'Real Estate', 'Technology',
  'Healthcare & Pharma', 'Industrials & Manufacturing', 'Consumer & Retail',
  'Agriculture & Food', 'Transport & Logistics', 'Mining & Metals',
  'Construction & Materials', 'Professional Services', 'Other',
]

// PCAF Phase-1 asset classes for cat 15 detailed mode. denominatorLabel is the
// correctness-critical piece — the denominator MEANS a different thing per class, so the
// input label must track the selected asset class (EVIC vs property value vs vehicle value).
const PCAF_ASSET_CLASSES: { value: PcafAssetClass; label: string; denominatorLabel: string }[] = [
  { value: 'listed_equity_corp_bonds',        label: 'Listed equity & corporate bonds', denominatorLabel: 'Enterprise value incl. cash (EVIC)' },
  { value: 'business_loans_unlisted_equity',  label: 'Business loans & unlisted equity', denominatorLabel: 'Total equity + debt' },
  { value: 'project_finance',                 label: 'Project finance',                  denominatorLabel: 'Total project value (equity + debt)' },
  { value: 'commercial_real_estate',          label: 'Commercial real estate',           denominatorLabel: 'Property value at origination' },
  { value: 'mortgages',                       label: 'Mortgages',                        denominatorLabel: 'Property value at origination' },
  { value: 'motor_vehicle_loans',             label: 'Motor vehicle loans',              denominatorLabel: 'Vehicle value at origination' },
]

const GRAD = 'var(--color-brand)'
const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #e8e7e4', fontSize: 13, color: '#0d0d0d', background: '#fff', outline: 'none', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#555553', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6, display: 'block' }
const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }

const STEP_NAMES = ['Setup', 'Materiality', 'Calculate', 'Results', 'Export']

interface CategoryData {
  included: boolean
  excluded_reason: string
  // Cat 1
  total_spend?: number
  supplier_sector?: string
  has_supplier_data?: boolean
  supplier_emissions?: number
  // Cat 6
  short_haul_flights?: number
  long_haul_flights?: number
  avg_flight_km?: number
  hotel_nights?: number
  rail_km?: number
  // Cat 7
  employee_count?: number
  avg_commute_km?: number
  commute_mode?: string
  wfh_days?: number
  // Cat 5
  waste_landfill_tonnes?: number
  waste_recycled_tonnes?: number
  // Cat 11
  units_sold?: number
  energy_per_unit?: number
  // Cat 15
  portfolio_value?: number
  portfolio_sector?: string
  // Cat 15 — detailed (per-asset PCAF) mode; dormant until the input UI (next step)
  pcafMode?: 'proxy' | 'detailed'
  pcafAssets?: PcafPortfolioAsset[]
  // Generic spend
  annual_spend?: number
  // Generic activity
  activity_value?: number
  emissions_override?: number
}

export default function Scope3Dashboard() {
  const isPaid = useEntitlement('ghg')
  const [step, setStep] = useState(0)
  const [company, setCompany] = useState('')
  const [sector, setSector] = useState('')
  const [reportingYear, setReportingYear] = useState(2024)
  const [currency, setCurrency] = useState('USD')
  const [revenue, setRevenue] = useState(0)
  const [materialCats, setMaterialCats] = useState<number[]>([])
  const [catData, setCatData] = useState<Record<string, CategoryData>>({})
  const [openInfo, setOpenInfo] = useState<Record<string, boolean>>({})
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [boundInventoryId, setBoundInventoryId] = useState<string | null>(null)
  const [inventoryList, setInventoryList] = useState<Array<{ id: string; company_name: string; reporting_year: number; updated_at: string }>>([])
  const [bindChecked, setBindChecked] = useState(false) // have we resolved bind status yet?
  const [cameFromGhg, setCameFromGhg] = useState(false) // arrived via ?from=ghg (unsaved GHG wizard)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const justRestored = useRef(false) // suppress the saved-reset effect for one restore pass

  // ─── Supplier Portal bridge (pull allocated Cat 1 from campaigns) ────────────
  interface CatOneLine { supplier_id: string; supplier_name: string; method: 'supplier-specific' | 'spend-based'; data_quality: string; value_mt: number; basis: string; allocation_method?: string }
  interface CatOneResult {
    campaign: { id: string; name: string; reporting_year: number }
    total_mt: number; supplier_specific_mt: number; spend_based_mt: number
    counts: { suppliers_total: number; supplier_specific: number; spend_based: number; uncovered: number }
    lines: CatOneLine[]
    uncovered: { supplier_id: string; supplier_name: string; reason: string }[]
    currency_flags: { supplier_id: string; supplier_name: string; spend: number; currency: string; note: string }[]
    method_note: string
  }
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [catOneResult, setCatOneResult] = useState<CatOneResult | null>(null)

  // Load this buyer's campaigns once, so the Cat 1 step can offer a "pull" source.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid) return
      try {
        const res = await fetch(`/api/campaigns?buyer_id=${uid}`)
        const json = await res.json()
        if (active && Array.isArray(json?.data)) {
          const list = json.data.map((c: any) => ({ id: c.id, name: c.name }))
          setCampaigns(list)
          if (list.length === 1) setSelectedCampaign(list[0].id)
        }
      } catch { /* non-fatal: the manual entry path still works */ }
    })()
    return () => { active = false }
  }, [])

  // Load a GHG inventory and prefill + lock company/year so the two records stay
  // aligned. Single code path used by both the ?inventoryId= URL effect and the
  // manual picker. No navigation — just binds state in place.
  const bindToInventory = async (id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: row } = await supabase
      .from('ghg_inventories')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (!row) return // no row -> stays unbound; the picker gate handles it
    setBoundInventoryId(id)
    setCompany(row.company_name)
    setReportingYear(row.reporting_year)
    setRevenue((row.revenue_millions ?? 0) * 1_000_000) // millions -> raw
    // Restore any previously saved Scope 3 work for this inventory.
    const { data: s3 } = await supabase
      .from('scope3_inventories')
      .select('*')
      .eq('inventory_id', id)
      .maybeSingle()
    if (s3) {
      justRestored.current = true
      if (s3.sector) setSector(s3.sector)
      if (s3.currency) setCurrency(s3.currency)
      if (s3.revenue_millions != null) setRevenue(s3.revenue_millions * 1_000_000) // overrides ghg-derived revenue (user may have edited it)
      if (s3.cat_data) setCatData(s3.cat_data as Record<string, CategoryData>)
      setMaterialCats(
        CATEGORIES.filter(c => (s3.cat_data as any)?.[c.id]?.included).map(c => c.num)
      )
      setSaved(true) // it IS saved
      setStep(3)     // land on Results, not Setup
    }
  }

  // On mount: if opened with ?inventoryId= (from the GHG wizard's export step),
  // bind to it. Otherwise load the user's inventories so they can pick one — the
  // calculator cannot be used unbound (option 2).
  useEffect(() => {
    ;(async () => {
      // Always load the user's inventories so the picker has its list ready even
      // when an id-bind fails (bad/foreign/deleted id) — avoids an empty picker.
      const loadList = (async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const { data } = await supabase
          .from('ghg_inventories')
          .select('id, company_name, reporting_year, updated_at')
          .order('updated_at', { ascending: false })
        if (data) setInventoryList(data)
      })()
      // Attempt the id-bind in parallel; failure (no row) falls through to picker.
      const params = new URLSearchParams(window.location.search)
      setCameFromGhg(params.get('from') === 'ghg')
      const id = params.get('inventoryId')
      const bind = id ? bindToInventory(id) : Promise.resolve()
      // Flip the gate only after BOTH resolve, so the picker never flashes empty.
      await Promise.all([loadList, bind])
      setBindChecked(true)
    })()
  }, [])

  const pullFromPortal = async (campaignId: string) => {
    if (!campaignId) return
    setPulling(true); setPullError(null); setCatOneResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setPullError('Please sign in again to pull supplier data.'); setPulling(false); return }
      const res = await fetch(`/api/campaigns/${campaignId}/scope3-cat1`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { setPullError(json?.error || 'Could not load supplier data.'); setPulling(false); return }
      setCatOneResult(json as CatOneResult)
    } catch {
      setPullError('Could not reach the Supplier Portal. Try again.')
    }
    setPulling(false)
  }

  const useCatOneFigure = (mt: number) => {
    updateCat('cat1', 'has_supplier_data', true)
    updateCat('cat1', 'supplier_emissions', Number(mt.toFixed(3)))
  }

  // Auto-detect material categories
  const autoDetect = () => {
    const suggested = SECTOR_MATERIAL[sector] || SECTOR_MATERIAL['Other']
    setMaterialCats(suggested)
    // Initialise category data
    const init: Record<string, CategoryData> = {}
    CATEGORIES.forEach(c => {
      init[c.id] = { included: suggested.includes(c.num), excluded_reason: '' }
    })
    setCatData(init)
  }

  const toggleCat = (num: number) => {
    setMaterialCats(prev =>
      prev.includes(num) ? prev.filter(n => n !== num) : [...prev, num]
    )
    const cat = CATEGORIES.find(c => c.num === num)
    if (!cat) return
    setCatData(prev => ({
      ...prev,
      [cat.id]: { ...prev[cat.id], included: !prev[cat.id]?.included }
    }))
  }

  const updateCat = (id: string, field: string, value: any) => {
    setCatData(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  // ─── Cat 15 detailed (per-asset PCAF) row helpers ────────────────────────────
  // Mirrors the supply-chain add/update/remove row pattern, one spread deeper into
  // catData['cat15'].pcafAssets. All immutable via setCatData.
  const newPcafAsset = (): PcafPortfolioAsset => ({
    id: Math.random().toString(36).slice(2),
    assetClass: 'listed_equity_corp_bonds',
    outstandingAmount: 0,
    denominator: 0,
    emissions: {}, // EmissionInputs — empty until the user fills a path
  })
  const cat15Assets = () => catData['cat15']?.pcafAssets ?? []
  const setCat15Assets = (next: PcafPortfolioAsset[]) =>
    setCatData(prev => ({ ...prev, cat15: { ...prev.cat15, pcafAssets: next } }))
  const addPcafAsset = () => setCat15Assets([...cat15Assets(), newPcafAsset()])
  const removePcafAsset = (idx: number) => setCat15Assets(cat15Assets().filter((_, i) => i !== idx))
  const updatePcafAsset = (idx: number, patch: Partial<PcafPortfolioAsset>) => {
    const next = [...cat15Assets()]; next[idx] = { ...next[idx], ...patch }; setCat15Assets(next)
  }
  const updatePcafEmissions = (idx: number, patch: Partial<EmissionInputs>) =>
    updatePcafAsset(idx, { emissions: { ...cat15Assets()[idx].emissions, ...patch } })

  // ─── Calculations ────────────────────────────────────────────────────────────

  const calcCat1 = (): number => {
    const d = catData['cat1']
    if (!d?.included) return 0
    if (d.has_supplier_data && d.supplier_emissions) return d.supplier_emissions
    const spend = d.total_spend || 0
    const ef = EMISSION_FACTORS.spend[d.supplier_sector || sector] || DEFAULT_SPEND_EF
    return (spend * ef) / 1000 // convert kg to mt
  }

  const calcCat6 = (): number => {
    const d = catData['cat6']
    if (!d?.included) return 0
    const shortHaul = (d.short_haul_flights || 0) * (d.avg_flight_km || 800) * EMISSION_FACTORS.flight_short
    const longHaul = (d.long_haul_flights || 0) * (d.avg_flight_km || 5000) * EMISSION_FACTORS.flight_long
    const hotels = (d.hotel_nights || 0) * EMISSION_FACTORS.hotel
    const rail = (d.rail_km || 0) * EMISSION_FACTORS.rail
    return (shortHaul + longHaul + hotels + rail) / 1000
  }

  const calcCat7 = (): number => {
    const d = catData['cat7']
    if (!d?.included) return 0
    const employees = d.employee_count || 0
    const commuteKm = d.avg_commute_km || 15
    const wfhDays = d.wfh_days || 0
    const workingDays = 235 - wfhDays
    const ef = d.commute_mode === 'car_electric' ? EMISSION_FACTORS.car_electric
      : d.commute_mode === 'bus' ? EMISSION_FACTORS.bus
      : d.commute_mode === 'rail' ? EMISSION_FACTORS.rail
      : EMISSION_FACTORS.car_petrol
    return (employees * commuteKm * 2 * workingDays * ef) / 1000
  }

  const calcCat5 = (): number => {
    const d = catData['cat5']
    if (!d?.included) return 0
    const landfill = (d.waste_landfill_tonnes || 0) * EMISSION_FACTORS.waste_landfill
    const recycled = (d.waste_recycled_tonnes || 0) * EMISSION_FACTORS.waste_recycled
    return (landfill + recycled) / 1000
  }

  const calcGenericSpend = (id: string): number => {
    const d = catData[id]
    if (!d?.included) return 0
    if (d.emissions_override) return d.emissions_override
    const spend = d.annual_spend || 0
    return (spend * 0.5) / 1000
  }

  // Full PCAF result for cat 15. Delegates to the engine orchestrator, which chooses the
  // decomposed per-asset assessment (detailed mode) or the lumped score-5 proxy. Returns
  // the whole PortfolioResult so render can read mode/dqScore without re-plumbing.
  const cat15PcafResult = (d: CategoryData) =>
    resolvePcafResult({
      mode: d.pcafMode,
      assets: d.pcafAssets,
      portfolioValue: d.portfolio_value,
      sector: d.portfolio_sector,
      emissionsOverride: d.emissions_override,
    })

  const calcCat15 = (): number => {
    const d = catData['cat15']
    if (!d?.included) return 0                // preserve the included gate exactly
    // portfolioFromProxy wraps the same portfolioProxyEstimate that is regression-tested
    // to equal the legacy portfolio×spend/1000 formula (and the emissions_override path).
    // The try/catch only guards invalid inputs (e.g. a negative value) the engine throws
    // on — it must never crash the dashboard render.
    try {
      return cat15PcafResult(d).totalFinancedEmissions
    } catch (err) {
      console.error('PCAF cat15 proxy estimate failed (invalid input); showing 0', err)
      return 0
    }
  }

  const getCatEmissions = (id: string): number => {
    switch (id) {
      case 'cat1': return calcCat1()
      case 'cat5': return calcCat5()
      case 'cat6': return calcCat6()
      case 'cat7': return calcCat7()
      case 'cat15': return calcCat15()
      default: return calcGenericSpend(id)
    }
  }

  const totalScope3 = CATEGORIES.filter(c => catData[c.id]?.included)
    .reduce((sum, c) => sum + getCatEmissions(c.id), 0)

  const getConfidence = (id: string): 'high' | 'medium' | 'low' => {
    const d = catData[id]
    if (!d?.included) return 'low'
    if (d.emissions_override || d.has_supplier_data) return 'high'
    if (id === 'cat6' && (d.short_haul_flights || d.long_haul_flights)) return 'medium'
    if (id === 'cat7' && d.employee_count) return 'medium'
    if (id === 'cat5' && (d.waste_landfill_tonnes || d.waste_recycled_tonnes)) return 'medium'
    if (d.annual_spend || d.total_spend) return 'low'
    return 'low'
  }

  const confidenceConfig = {
    high: { label: 'Primary data', color: '#0F6E56', bg: '#E1F5EE' },
    medium: { label: 'Activity data', color: '#0C447C', bg: '#E6F1FB' },
    low: { label: 'Spend-based', color: 'var(--color-module-climate)', bg: '#FEF3E2' },
  }

  // Persist the bound Scope 3 record. Upsert on inventory_id so re-saves update
  // the existing row rather than erroring on the unique FK.
  const saveScope3 = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid || !boundInventoryId) return
      const { error } = await supabase.from('scope3_inventories').upsert({
        user_id: uid,
        inventory_id: boundInventoryId,
        sector,
        currency,
        revenue_millions: (revenue || 0) / 1_000_000, // raw -> millions
        cat_data: catData,
        total_scope3_tco2e: totalScope3,
        factor_basis: 'DEFRA/Exiobase (spend-based) · GHG Protocol category methodologies (activity-based)',
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'inventory_id' })
      if (error) { console.error('Scope 3 save failed:', error); alert('Save failed: ' + error.message); return }
      setSaved(true)
    } finally { setSaving(false) }
  }

  // Re-arm the Save button whenever saved inputs change after a save. Centralised
  // here rather than scattered across every catData/sector/currency/revenue setter.
  useEffect(() => {
    if (justRestored.current) { justRestored.current = false; return }
    setSaved(false)
  }, [catData, sector, currency, revenue])

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Scope 3 GHG Inventory'],
      ['Company', company],
      ['Sector', sector],
      ['Reporting year', reportingYear],
      ['Total Scope 3', `${totalScope3.toFixed(2)} mt CO2e`],
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['SCOPE 3 BY CATEGORY'],
      ['Category', 'Name', 'mt CO2e', 'Method', 'Confidence', 'Included'],
      ...CATEGORIES.map(c => [
        `Cat ${c.num}`,
        c.name,
        catData[c.id]?.included ? getCatEmissions(c.id).toFixed(2) : '—',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : 'Excluded',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : '—',
        catData[c.id]?.included ? 'Yes' : `No — ${catData[c.id]?.excluded_reason || 'not material'}`,
      ]),
      [],
      ['METHODOLOGY NOTE'],
      ['Spend-based estimates use DEFRA/Exiobase emission factors. Activity-based calculations use GHG Protocol Category-specific methodologies. Primary data supersedes all estimates where available.'],
      [],
      ['Generated by ThemisIQ · www.themisiq.co · GHG Protocol Scope 3 Standard'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company}_Scope3_${reportingYear}.csv`
    a.click()
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  const renderStep0 = () => (
    <div>
      <h2 style={sectionHead}>Company setup</h2>
      <p style={sectionSub}>Tell us about your organisation so we can identify which Scope 3 categories are material to you.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={boundInventoryId ? { ...inputStyle, background: '#f8f7f5', color: 'var(--color-ink-muted)', cursor: 'not-allowed' } : inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corporation" readOnly={!!boundInventoryId} />
          {boundInventoryId && <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 6 }}>🔗 Linked to your {company || 'GHG'} {reportingYear} GHG inventory — company and year are set there.</div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Primary sector</label>
          <select style={inputStyle} value={sector} onChange={e => setSector(e.target.value)}>
            <option value="">Select sector</option>
            {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={boundInventoryId ? { ...inputStyle, background: '#f8f7f5', color: 'var(--color-ink-muted)', cursor: 'not-allowed' } : inputStyle} value={reportingYear} onChange={e => setReportingYear(Number(e.target.value))} disabled={!!boundInventoryId}>
            {[2022, 2023, 2024, 2025].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Annual revenue ({currency})</label>
          <input style={inputStyle} type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div style={{ marginTop: 20, background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '1rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7425e3', marginBottom: 4 }}>GHG Protocol Scope 3 Standard</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>ThemisIQ follows the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard. You must report all material categories and explain exclusions.</div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Materiality screening</h2>
      <p style={sectionSub}>ThemisIQ has identified the Scope 3 categories likely to be material for a {sector || 'company'} based on GHG Protocol guidance. Review and confirm.</p>
      <div style={{ background: '#EDE9FE', border: '0.5px solid rgba(116,37,227,0.2)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 16, fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
        These are suggestions, not limits — <strong>click any category to add or remove it</strong>. Under the GHG Protocol you may include any category you judge material, and you must briefly justify any you exclude. Tap a category in the Calculate step for what it means and where to find the data.
      </div>

      {!sector ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Select your sector in Step 1 first.</div>
      ) : (
        <>
          <button onClick={autoDetect} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
            ⚡ Auto-detect material categories for {sector}
          </button>

          {['Upstream', 'Downstream'].map(stream => (
            <div key={stream} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10 }}>{stream}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.filter(c => c.stream === stream).map(cat => {
                  const included = catData[cat.id]?.included ?? materialCats.includes(cat.num)
                  const isMaterial = (SECTOR_MATERIAL[sector] || []).includes(cat.num)
                  return (
                    <div key={cat.id} onClick={() => toggleCat(cat.num)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1.5px solid ${included ? '#7425e3' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: included ? '#EDE9FE' : '#f8f7f5', transition: 'all 0.15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${included ? '#7425e3' : '#e8e7e4'}`, background: included ? '#7425e3' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {included && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', minWidth: 40 }}>Cat {cat.num}</span>
                          <span style={{ fontSize: 13, fontWeight: included ? 600 : 400, color: included ? '#7425e3' : '#0d0d0d' }}>{cat.name}</span>
                          {isMaterial && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56' }}>LIKELY MATERIAL</span>}
                          {cat.num === 15 && (() => {
                            const c15 = catData['cat15']
                            const dq = c15 ? cat15PcafResult(c15).weightedDataQualityScore : 5
                            const reported = dq === 2
                            return (
                              <span
                                title={reported ? 'PCAF-aligned · data quality 2 of 5' : 'PCAF-aligned · data quality 5 of 5 — weakest tier'}
                                style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: '#FCEBEB', color: '#B91C1C' }}
                              >{reported ? 'Reported · unverified' : 'Spend-based estimate'}</span>
                            )
                          })()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>{cat.desc}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )

  const renderStep2 = () => {
    const activeCats = CATEGORIES.filter(c => catData[c.id]?.included)
    return (
      <div>
        <h2 style={sectionHead}>Data entry</h2>
        <p style={sectionSub}>Enter data for each material category. ThemisIQ will calculate emissions using the best available method.</p>

        {activeCats.length === 0 ? (
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No categories selected — go back to Step 2 to select material categories.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeCats.map(cat => (
              <div key={cat.id} style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ background: '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginRight: 10 }}>Cat {cat.num}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{cat.name}</span>
                  </div>
                  {getCatEmissions(cat.id) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#64fe3e' }}>{getCatEmissions(cat.id).toFixed(2)} mt CO₂e</span>
                  )}
                </div>
                {(cat as any).guidance && (
                  <div style={{ borderBottom: '0.5px solid #e8e7e4' }}>
                    <button onClick={() => setOpenInfo(p => ({ ...p, [cat.id]: !p[cat.id] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 16px', background: '#fafafa', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#7425e3', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid #7425e3', fontSize: 9, fontWeight: 700 }}>i</span> What this is &amp; where to find the data</span>
                      <span style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{openInfo[cat.id] ? '▲' : '▼'}</span>
                    </button>
                    {openInfo[cat.id] && (
                      <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>{(cat as any).guidance}</div>
                        <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6, background: '#E1F5EE', borderRadius: 8, padding: '8px 10px' }}><strong>Where to find it:</strong> {(cat as any).dataSource}</div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                  {/* Cat 1 — Purchased goods */}
                  {cat.id === 'cat1' && <>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Do you have supplier-specific emissions data?</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ label: 'Yes — I have actual data', val: true }, { label: 'No — use spend-based estimate', val: false }].map(opt => (
                          <button key={String(opt.val)} onClick={() => updateCat('cat1', 'has_supplier_data', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: catData['cat1']?.has_supplier_data === opt.val ? '#0d0d0d' : '#f8f7f5', color: catData['cat1']?.has_supplier_data === opt.val ? '#fff' : '#555553', border: `0.5px solid ${catData['cat1']?.has_supplier_data === opt.val ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    {catData['cat1']?.has_supplier_data ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Total supplier emissions (mt CO₂e)</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.supplier_emissions || ''} onChange={e => updateCat('cat1', 'supplier_emissions', Number(e.target.value))} placeholder="0" />
                      </div>
                    ) : <>
                      <div>
                        <label style={labelStyle}>Total annual spend ({currency})</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.total_spend || ''} onChange={e => updateCat('cat1', 'total_spend', Number(e.target.value))} placeholder="0" />
                      </div>
                      <div>
                        <label style={labelStyle}>Primary supplier sector</label>
                        <select style={inputStyle} value={catData['cat1']?.supplier_sector || sector} onChange={e => updateCat('cat1', 'supplier_sector', e.target.value)}>
                          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </>}
                    <div style={{ gridColumn: '1 / -1', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#7425e3', marginBottom: 6 }}>Pull from Supplier Portal</div>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginBottom: 10 }}>Bring in primary Cat 1 data you collected from suppliers. Supplier-allocated emissions are used directly; suppliers without an allocated figure are estimated from the spend you recorded (sector default). You review the full breakdown before it is applied.</div>
                      {campaigns.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>No supplier campaigns found. <a href="/dashboard/supply-chain/portal" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 600 }}>Create one in the Supplier Portal →</a></div>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {campaigns.length > 1 && (
                            <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: 1, minWidth: 180 }}>
                              <option value="">Select a campaign…</option>
                              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          )}
                          <button onClick={() => pullFromPortal(selectedCampaign || campaigns[0]?.id)} disabled={pulling || (campaigns.length > 1 && !selectedCampaign)} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: pulling ? 'wait' : 'pointer', opacity: pulling || (campaigns.length > 1 && !selectedCampaign) ? 0.5 : 1 }}>
                            {pulling ? 'Pulling…' : 'Pull from Portal →'}
                          </button>
                        </div>
                      )}
                      {pullError && <div style={{ fontSize: 11, color: '#B91C1C', marginTop: 8 }}>{pullError}</div>}

                      {catOneResult && (
                        <div style={{ marginTop: 12, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.9rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{catOneResult.total_mt.toFixed(2)} mt CO₂e</div>
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{catOneResult.counts.supplier_specific} primary · {catOneResult.counts.spend_based} spend-based · {catOneResult.counts.uncovered} uncovered</div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                            {catOneResult.lines.map(l => (
                              <div key={l.supplier_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 11, padding: '4px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                                <span style={{ color: '#0d0d0d', flex: 1 }}>{l.supplier_name}</span>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: l.method === 'supplier-specific' ? '#E1F5EE' : '#FEF3E2', color: l.method === 'supplier-specific' ? '#0F6E56' : 'var(--color-module-climate)', whiteSpace: 'nowrap' }}>{l.method === 'supplier-specific' ? 'primary' : 'spend-based'}</span>
                                <span style={{ color: '#555553', minWidth: 70, textAlign: 'right' }}>{l.value_mt.toFixed(2)} mt</span>
                              </div>
                            ))}
                          </div>
                          {catOneResult.uncovered.length > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                              <strong style={{ color: 'var(--color-module-climate)' }}>Not included:</strong> {catOneResult.uncovered.map(u => `${u.supplier_name} (${u.reason})`).join('; ')}
                            </div>
                          )}
                          {catOneResult.currency_flags.length > 0 && (
                            <div style={{ fontSize: 10, color: '#B91C1C', marginBottom: 8, lineHeight: 1.5 }}>
                              ⚠ Currency: {catOneResult.currency_flags.map(c => `${c.supplier_name}: ${c.spend} ${c.currency} — convert to USD before including`).join('; ')}
                            </div>
                          )}
                          <div style={{ fontSize: 9, color: 'var(--color-ink-muted)', marginBottom: 10, lineHeight: 1.5, fontStyle: 'italic' }}>{catOneResult.method_note}</div>
                          <button onClick={() => useCatOneFigure(catOneResult.total_mt)} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: '#0d0d0d', color: '#fff', border: 'none', cursor: 'pointer' }}>
                            Use {catOneResult.total_mt.toFixed(2)} mt as Cat 1 →
                          </button>
                          <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6 }}>You can still edit the figure after applying it.</div>
                        </div>
                      )}
                    </div>
                  </>}

                  {/* Cat 6 — Business travel */}
                  {cat.id === 'cat6' && <>
                    <div>
                      <label style={labelStyle}>Short-haul flights (under 3hrs)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.short_haul_flights || ''} onChange={e => updateCat('cat6', 'short_haul_flights', Number(e.target.value))} placeholder="Number of flights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Long-haul flights (over 3hrs)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.long_haul_flights || ''} onChange={e => updateCat('cat6', 'long_haul_flights', Number(e.target.value))} placeholder="Number of flights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Hotel nights</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.hotel_nights || ''} onChange={e => updateCat('cat6', 'hotel_nights', Number(e.target.value))} placeholder="Total nights" />
                    </div>
                    <div>
                      <label style={labelStyle}>Rail travel (km)</label>
                      <input style={inputStyle} type="number" value={catData['cat6']?.rail_km || ''} onChange={e => updateCat('cat6', 'rail_km', Number(e.target.value))} placeholder="Total km" />
                    </div>
                  </>}

                  {/* Cat 7 — Employee commuting */}
                  {cat.id === 'cat7' && <>
                    <div>
                      <label style={labelStyle}>Number of employees</label>
                      <input style={inputStyle} type="number" value={catData['cat7']?.employee_count || ''} onChange={e => updateCat('cat7', 'employee_count', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Average commute distance (km one way)</label>
                      <input style={inputStyle} type="number" value={catData['cat7']?.avg_commute_km || ''} onChange={e => updateCat('cat7', 'avg_commute_km', Number(e.target.value))} placeholder="15" />
                    </div>
                    <div>
                      <label style={labelStyle}>Primary commute mode</label>
                      <select style={inputStyle} value={catData['cat7']?.commute_mode || 'car_petrol'} onChange={e => updateCat('cat7', 'commute_mode', e.target.value)}>
                        <option value="car_petrol">Car (petrol/diesel)</option>
                        <option value="car_electric">Car (electric)</option>
                        <option value="bus">Bus</option>
                        <option value="rail">Rail / metro</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Average WFH days per week</label>
                      <select style={inputStyle} value={catData['cat7']?.wfh_days || 0} onChange={e => updateCat('cat7', 'wfh_days', Number(e.target.value))}>
                        {[0, 1, 2, 3, 4, 5].map(d => <option key={d} value={d * 47}>{d} days/week</option>)}
                      </select>
                    </div>
                  </>}

                  {/* Cat 5 — Waste */}
                  {cat.id === 'cat5' && <>
                    <div>
                      <label style={labelStyle}>Waste to landfill (tonnes)</label>
                      <input style={inputStyle} type="number" value={catData['cat5']?.waste_landfill_tonnes || ''} onChange={e => updateCat('cat5', 'waste_landfill_tonnes', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Waste recycled (tonnes)</label>
                      <input style={inputStyle} type="number" value={catData['cat5']?.waste_recycled_tonnes || ''} onChange={e => updateCat('cat5', 'waste_recycled_tonnes', Number(e.target.value))} placeholder="0" />
                    </div>
                  </>}

                  {/* Cat 15 — Investments */}
                  {cat.id === 'cat15' && <>
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', marginBottom: 8 }}>
                      Cat 15 is estimated with a PCAF-aligned spend-based portfolio proxy (PCAF data-quality tier 5 — the weakest tier), not a full asset-class-decomposed PCAF assessment. Enter your total investment/loan portfolio value and primary sector exposure — or, for a stronger figure, enter known financed emissions directly below.
                    </div>
                    <div>
                      <label style={labelStyle}>Total portfolio value ({currency})</label>
                      <input style={inputStyle} type="number" value={catData['cat15']?.portfolio_value || ''} onChange={e => updateCat('cat15', 'portfolio_value', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Primary portfolio sector</label>
                      <select style={inputStyle} value={catData['cat15']?.portfolio_sector || 'Financial Services'} onChange={e => updateCat('cat15', 'portfolio_sector', e.target.value)}>
                        {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Or enter known financed emissions directly (mt CO₂e)</label>
                      <input style={inputStyle} type="number" value={catData['cat15']?.emissions_override || ''} onChange={e => updateCat('cat15', 'emissions_override', Number(e.target.value))} placeholder="Override with primary data" />
                    </div>
                    {(() => {
                      const c15 = catData['cat15']
                      const dq = c15 ? cat15PcafResult(c15).weightedDataQualityScore : 5
                      return (
                        <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--color-ink-muted)', lineHeight: 1.5, marginTop: 2 }}>
                          This estimate: PCAF data quality {dq} of 5 ({dq === 2 ? 'reported, unverified' : 'spend-based proxy'}).<br />
                          PCAF-aligned methodology · not PCAF-certified · estimates use non-PCAF sector factors.<br />
                          PCAF data quality: 1 = verified (best) … 5 = spend estimate (weakest).
                        </div>
                      )
                    })()}

                    {/* Estimation-method toggle: proxy (default) vs detailed per-asset PCAF */}
                    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                      <label style={labelStyle}>Estimation method</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ mode: 'proxy' as const, label: 'Portfolio proxy (quick)' }, { mode: 'detailed' as const, label: 'Itemise by asset (PCAF)' }].map(opt => {
                          const active = (catData['cat15']?.pcafMode ?? 'proxy') === opt.mode
                          return (
                            <button key={opt.mode} onClick={() => updateCat('cat15', 'pcafMode', opt.mode)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: active ? '#0d0d0d' : '#f8f7f5', color: active ? '#fff' : '#555553', border: `0.5px solid ${active ? '#0d0d0d' : '#e8e7e4'}`, cursor: 'pointer' }}>{opt.label}</button>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>Itemise holdings to raise data quality above the tier-5 spend proxy.</div>
                    </div>

                    {/* Detailed mode — per-asset PCAF rows (Option-2 emissions paths: reported + economic) */}
                    {catData['cat15']?.pcafMode === 'detailed' && <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {cat15Assets().length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>No holdings yet — add your first to itemise the portfolio by asset class.</div>
                      )}
                      {cat15Assets().map((row, idx) => {
                        const meta = PCAF_ASSET_CLASSES.find(c => c.value === row.assetClass) ?? PCAF_ASSET_CLASSES[0]
                        return (
                          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Holding {idx + 1}</span>
                              <button onClick={() => removePcafAsset(idx)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={labelStyle}>Asset class</label>
                              <select style={inputStyle} value={row.assetClass} onChange={e => updatePcafAsset(idx, { assetClass: e.target.value as PcafAssetClass })}>
                                {PCAF_ASSET_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Outstanding amount ({currency})</label>
                              <input style={inputStyle} type="number" value={row.outstandingAmount || ''} onChange={e => updatePcafAsset(idx, { outstandingAmount: Number(e.target.value) })} placeholder="0" />
                            </div>
                            <div>
                              {/* Correctness-critical: denominator label tracks the selected asset class */}
                              <label style={labelStyle}>{meta.denominatorLabel} ({currency})</label>
                              <input style={inputStyle} type="number" value={row.denominator || ''} onChange={e => updatePcafAsset(idx, { denominator: Number(e.target.value) })} placeholder="0" />
                            </div>
                            <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>Enter the investee&apos;s reported emissions where available (best data quality). Otherwise provide revenue + sector for an estimate.</div>
                            <div>
                              <label style={labelStyle}>Investee emissions (tCO₂e)</label>
                              <input style={inputStyle} type="number" value={row.emissions.reportedEmissions ?? ''} onChange={e => updatePcafEmissions(idx, { reportedEmissions: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Reported" />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555553', marginTop: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={row.emissions.verified ?? false} onChange={e => updatePcafEmissions(idx, { verified: e.target.checked })} />
                                Third-party verified
                              </label>
                            </div>
                            <div>
                              <label style={labelStyle}>or Investee revenue ({currency})</label>
                              <input style={inputStyle} type="number" value={row.emissions.revenue ?? ''} onChange={e => updatePcafEmissions(idx, { revenue: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="For estimate" />
                              <select style={{ ...inputStyle, marginTop: 6 }} value={row.emissions.sector ?? ''} onChange={e => updatePcafEmissions(idx, { sector: e.target.value === '' ? undefined : e.target.value })}>
                                <option value="">Sector for estimate…</option>
                                {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {(() => {
                                try {
                                  const a = assessAsset(row)
                                  return <div style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>Financed: {a.financedEmissions.toFixed(1)} tCO₂e · PCAF DQ {a.dqScore}</div>
                                } catch {
                                  return <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Complete this row to compute</div>
                                }
                              })()}
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={addPcafAsset} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid #7425e3', color: '#7425e3', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add holding</button>
                      {(() => {
                        const c15 = catData['cat15']
                        if (!c15) return null
                        const r = cat15PcafResult(c15) // single call — reused for the fallback line AND the decomposed summary
                        // Proxy / fallback mode: keep the existing incomplete-rows note, nothing decomposed.
                        if (r.mode === 'portfolio_proxy') {
                          return cat15Assets().length >= 1
                            ? <div style={{ fontSize: 10, color: '#92660A', lineHeight: 1.5 }}>Some holdings are incomplete — showing the spend proxy until every row computes.</div>
                            : null
                        }
                        // Decomposed mode: weighted DQ + coverage spread, by-asset-class breakdown, capped flag.
                        const cappedCount = r.perAsset.filter(a => a.capped).length
                        const classRows = Object.entries(r.byAssetClass).sort((a, b) => (b[1] as number) - (a[1] as number))
                        const coverageTiers = ([1, 2, 3, 4, 5] as const).filter(t => r.coverageByScore[t] > 0)
                        return (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
                            {/* 1. Weighted DQ shown WITH its coverage spread (never the number alone) */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#0d0d0d' }}>Portfolio PCAF data quality: {r.weightedDataQualityScore.toFixed(1)} of 5 (emissions-weighted)</div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                                {coverageTiers.map(t => (
                                  <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#f8f7f5', border: '0.5px solid #e8e7e4', color: '#555553', fontWeight: 600 }}>DQ{t} · {r.coverageByScore[t]}</span>
                                ))}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>Distribution across holdings — a low weighted score can hide high-tier outliers, so the spread is shown alongside.</div>
                            </div>
                            {/* 2. Financed emissions by asset class (descending) */}
                            <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 10, overflow: 'hidden' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', background: '#f8f7f5', padding: '8px 12px', borderBottom: '0.5px solid #e8e7e4' }}>
                                {['Asset class', 'Financed'].map(h => <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>)}
                              </div>
                              {classRows.map(([key, val], i) => (
                                <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 120px', padding: '8px 12px', borderBottom: i < classRows.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center' }}>
                                  <div style={{ fontSize: 12, color: '#0d0d0d' }}>{PCAF_ASSET_CLASSES.find(c => c.value === key)?.label ?? key}</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0F6E56' }}>{(val as number).toFixed(1)} tCO₂e</div>
                                </div>
                              ))}
                            </div>
                            {/* 3. Capped-holdings data-error flag (derived — no lib field) */}
                            {cappedCount > 0 && (
                              <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>{cappedCount} holding(s) have exposure exceeding the asset value — attribution capped at 100%. Check outstanding amount vs denominator.</div>
                            )}
                          </div>
                        )
                      })()}
                    </div>}
                  </>}

                  {/* Generic spend-based for other categories */}
                  {!['cat1', 'cat6', 'cat7', 'cat5', 'cat15'].includes(cat.id) && <>
                    <div>
                      <label style={labelStyle}>Annual spend / value ({currency})</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.annual_spend || ''} onChange={e => updateCat(cat.id, 'annual_spend', Number(e.target.value))} placeholder="0" />
                    </div>
                    <div>
                      <label style={labelStyle}>Known emissions (mt CO₂e) — optional override</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder="Leave blank to use spend-based" />
                    </div>
                  </>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderStep3 = () => {
    const activeCats = CATEGORIES.filter(c => catData[c.id]?.included && getCatEmissions(c.id) > 0)
      .sort((a, b) => getCatEmissions(b.id) - getCatEmissions(a.id))
    const highCount = activeCats.filter(c => getConfidence(c.id) === 'high').length
    const medCount = activeCats.filter(c => getConfidence(c.id) === 'medium').length
    const lowCount = activeCats.filter(c => getConfidence(c.id) === 'low').length

    return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your total Scope 3 inventory across all material categories — GHG Protocol aligned.</p>

        <div style={{ position: 'relative' }}>
          <div style={!isPaid ? { filter: 'blur(7px)', pointerEvents: 'none', userSelect: 'none' } : undefined}>

        {/* Total */}
        <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20, display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', fontWeight: 400, color: '#64fe3e', lineHeight: 1 }}>{totalScope3.toFixed(1)}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>mt CO₂e total Scope 3</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Data quality</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {highCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56', fontWeight: 600 }}>{highCount} primary data</span>}
              {medCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E6F1FB', color: '#0C447C', fontWeight: 600 }}>{medCount} activity data</span>}
              {lowCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#FEF3E2', color: 'var(--color-module-climate)', fontWeight: 600 }}>{lowCount} spend-based</span>}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>{company} · {reportingYear} · GHG Protocol Scope 3 Standard</div>
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 80px', background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
            {['#', 'Category', 'mt CO₂e', '% of total', 'Method'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          {activeCats.map((cat, i) => {
            const emissions = getCatEmissions(cat.id)
            const pct = totalScope3 > 0 ? ((emissions / totalScope3) * 100).toFixed(1) : '0'
            const conf = getConfidence(cat.id)
            const ccfg = confidenceConfig[conf]
            return (
              <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 100px 100px 80px', padding: '12px 16px', borderBottom: i < activeCats.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center', background: i === 0 ? '#fafafa' : '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-muted)' }}>{cat.num}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{cat.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{cat.stream}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0d0d0d' }}>{emissions.toFixed(2)}</div>
                <div>
                  <div style={{ fontSize: 12, color: '#555553' }}>{pct}%</div>
                  <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99 }} />
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: ccfg.bg, color: ccfg.color }}>{ccfg.label}</span>
                </div>
              </div>
            )
          })}
          {activeCats.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>No data entered yet — go back to Step 3 to enter your data.</div>
          )}
        </div>

        {/* Excluded categories */}
        {CATEGORIES.filter(c => !catData[c.id]?.included).length > 0 && (
          <div style={{ marginTop: 16, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 6 }}>EXCLUDED CATEGORIES (not material)</div>
            <div style={{ fontSize: 12, color: 'var(--color-ink-muted)' }}>
              {CATEGORIES.filter(c => !catData[c.id]?.included).map(c => `Cat ${c.num} (${c.name})`).join(' · ')}
            </div>
          </div>
        )}

          </div>
          {!isPaid && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
              <div className="tq-band" style={{ borderRadius: 16, padding: '2rem', maxWidth: 420, textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 10 }}>🔒</div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, marginBottom: 8 }}>Unlock your full Scope 3 results</div>
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, marginBottom: 18 }}>Your complete inventory is ready — the total, the category-by-category breakdown, and the data-quality flags for every line. Unlock the GHG module to view and download it.</div>
                <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing &amp; unlock →</a>
                <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginTop: 12 }}>The calculator stays free — you only pay to unlock results &amp; export.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderStep4 = () => (
    <div>
      <h2 style={sectionHead}>Export Scope 3 inventory</h2>
      <p style={sectionSub}>Download your GHG Protocol-aligned Scope 3 inventory for CSRD, CDP, SBTi and SB 253 reporting.</p>

      <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.5rem', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Inventory summary — {company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total Scope 3', val: `${totalScope3.toFixed(1)} mt` },
            { label: 'Categories', val: CATEGORIES.filter(c => catData[c.id]?.included).length },
            { label: 'Reporting year', val: reportingYear },
            { label: 'Standard', val: 'GHG Protocol' },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.4rem' : '0.9rem', fontFamily: typeof val === 'number' ? 'var(--font-display)' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: '#fff', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge. I understand that spend-based estimates carry inherent uncertainty and should be disclosed as such in external reports.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && saveScope3()} disabled={!dataConfirmed || !boundInventoryId || saving} style={{ ...((dataConfirmed && boundInventoryId && !saving) ? btnStepPrimary : btnStepPrimaryDisabled), marginRight: 12 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved to your inventory' : 'Save Scope 3 to inventory'}
          </button>
          <button onClick={() => dataConfirmed && generateExport()} style={{ ...(dataConfirmed ? btnStepPrimary : btnStepPrimaryDisabled) }}>
            ⬇ Download Scope 3 Inventory (CSV)
          </button>
        </div>
      ) : (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Unlock your full Scope 3 programme</div>
          <div style={{ fontSize: 13, color: 'var(--color-ink-2)', marginBottom: 8, lineHeight: 1.6 }}>Download your GHG Protocol Scope 3 inventory, generate CSRD ESRS E1-6 disclosure tables, and access year-on-year tracking.</div>
          <div style={{ fontSize: 12, color: 'var(--color-ink-2)', marginBottom: 20 }}>Included in the Climate-GHG module</div>
          <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing & unlock reports →</a>
        </div>
      )}
    </div>
  )

  // Gate shown when no inventory is bound (no ?inventoryId= and nothing picked yet).
  // The Scope 3 calculator must link to a GHG inventory before it can be used.
  const renderPicker = () => (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '3rem 2.5rem' }}>
      <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 16, padding: '2rem' }}>
        {cameFromGhg && inventoryList.length === 0 ? (
          // Arrived from an UNSAVED GHG wizard — there's nothing to bind to yet.
          <>
            <h2 style={sectionHead}>Save your GHG inventory first</h2>
            <p style={sectionSub}>Your Scope 3 links to a saved GHG inventory so company and year stay aligned. Go back and save your inventory, then click Complete Scope 3 — or create a new inventory.</p>
            <a href="/dashboard/ghg" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to your GHG inventory →</a>
          </>
        ) : (
          <>
            <h2 style={sectionHead}>Which inventory is this Scope 3 for?</h2>
            {inventoryList.length > 0 ? (
              <>
                {cameFromGhg && (
                  <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 20%, transparent)', borderRadius: 10, padding: '0.75rem', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-module-climate)', lineHeight: 1.6 }}>Came from a GHG inventory? If you don&apos;t see it below, it isn&apos;t saved yet — <a href="/dashboard/ghg" style={{ color: 'var(--color-module-climate)', fontWeight: 600 }}>go back and save it first</a>.</div>
                  </div>
                )}
                <p style={sectionSub}>Your Scope 3 inventory links to one of your GHG inventories so the company and reporting year stay aligned across both records. Pick which one this is for.</p>
                <label style={labelStyle}>GHG inventory</label>
                <select style={inputStyle} defaultValue="" onChange={e => { if (e.target.value) bindToInventory(e.target.value) }}>
                  <option value="" disabled>Select an inventory…</option>
                  {inventoryList.map(inv => (
                    <option key={inv.id} value={inv.id}>{(inv.company_name || 'Untitled')} — {inv.reporting_year}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <p style={sectionSub}>You need a saved GHG inventory first. The Scope 3 calculator links to a GHG inventory so your company and reporting year stay consistent across both records.</p>
                <a href="/dashboard/ghg" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Create a GHG inventory →</a>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )

  const steps = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4]
  const activeCatCount = CATEGORIES.filter(c => catData[c.id]?.included).length

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#f8f7f5', minHeight: '100vh' }}>
      <Nav />
      <div style={{ background: 'var(--color-module-ghg)', padding: '8px 2.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>GHG Protocol Scope 3 Standard · All 15 categories · CSRD ESRS E1-6 · CDP · SBTi · SB 253</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Climate — GHG Inventory</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 400, color: '#0d0d0d' }}>Scope 3 Complete Calculator</div>
          </div>
          {totalScope3 > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 2 }}>Total Scope 3</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0F6E56' }}>{totalScope3.toFixed(1)} mt CO₂e</div>
            </div>
          )}
        </div>
      </div>
      {!bindChecked ? (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 2.5rem', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>Loading your inventory…</div>
      ) : !boundInventoryId ? (
        renderPicker()
      ) : (<>
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
              <div style={{ background: '#0d0d0d', borderRadius: 14, padding: '1.25rem', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Company', val: company || '—' },
                    { label: 'Sector', val: sector || '—' },
                    { label: 'Categories', val: activeCatCount },
                    { label: 'Total Scope 3', val: totalScope3 > 0 ? `${totalScope3.toFixed(1)} mt` : '—' },
                  ].map(({ label, val }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                      <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}><strong>GHG Protocol Scope 3 Standard</strong><br />All 15 categories · Spend-based + activity-based + primary data</div>
              </div>
              <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>Need supplier emissions data? <a href="/dashboard/supply-chain/portal" style={{ color: '#7425e3', textDecoration: 'none', fontWeight: 600 }}>Use the Supplier Portal →</a></div>
              </div>
            </div>
          )}
        </div>
      </div>
      </>)}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}
