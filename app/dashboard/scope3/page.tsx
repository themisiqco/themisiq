'use client'

import { useState, useEffect, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlementState } from '../../../lib/useEntitlement'
import { EMISSION_FACTORS, GENERIC_SPEND_FACTOR } from '../../../lib/emissionFactors'
import { SPEND_EF_SOURCES } from '../../../lib/emissionFactors/spend'
import { scope3MethodFor, scope3MethodDescription, provenanceGap } from '../../../lib/scope3/categoryMethods'
import { resolvePcafResult, assessAsset } from '../../../lib/pcaf/engine'
import { INDUSTRY_OPTION_GROUPS, industryName } from '../../../lib/emissionFactors/industryOptions'
import { matchCountries, countryByIso2 } from '../../../lib/emissionFactors/countryOptions'
import { regionName, regionLabel, countryLabel } from '../../../lib/emissionFactors/regionNames'
import {
  DEFRA_WASTE_META, WASTE_MATERIAL_GROUPS, WASTE_METHOD_LABEL, wasteRoutesFor, wasteMaterialKey, parseWasteMaterialKey,
  priceWasteRow, wasteMethodFor, withoutListMarker, type WasteRowPricing,
} from '../../../lib/emissionFactors/defraWaste'
import type { PcafPortfolioAsset, PcafAssetClass, EmissionInputs } from '../../../lib/pcaf/types'
import { editRows, type RowEdit } from '../../../lib/rowList'
import { sectionHead } from '@/app/components/headingStyles'
import { btnPrimary, btnStep, btnStepDisabled, btnStepPrimary, btnStepPrimaryDisabled, toggleOff, toggleOn } from '@/app/components/buttonStyles'
import { reportingYearOptions, defaultReportingYear } from '../../../lib/reportingYears'

// Floor 2023, the same as GHG's. This wizard's year selector is disabled and inherited whenever
// the inventory is bound to a GHG inventory (`disabled={!!boundInventoryId}`), so a year no GHG
// inventory can hold is a year this selector can never legitimately show. Its own spend factors
// carry no year dimension; the parent module is the constraint.
const YEAR_FLOOR = 2023

// ─── Scope 3 Category Definitions ────────────────────────────────────────────

const CATEGORIES = [
  // Upstream
  { id: 'cat1', num: 1, name: 'Purchased goods & services', stream: 'Upstream', desc: 'Emissions from producing goods and services you purchase', method: 'spend', unit: 'spend', materialSectors: ['all'], typicalShare: 0.60 , guidance: 'Emissions from producing everything you buy — raw materials, components, products and services — up to the point they reach you (cradle-to-gate). Usually the single largest Scope 3 category.', dataSource: 'Procurement / AP ledger: annual spend by supplier or category. Best: supplier-specific emissions via the Supplier Portal. Spend-based estimation is permitted for this category.' },
  { id: 'cat2', num: 2, name: 'Capital goods', stream: 'Upstream', desc: 'Emissions from producing capital equipment and assets you buy', method: 'spend', unit: 'spend', materialSectors: ['Industrials & Manufacturing', 'Energy & Utilities', 'Mining & Metals'], typicalShare: 0.05 , guidance: 'Emissions from producing long-life assets you purchase — buildings, machinery, vehicles, IT equipment, infrastructure. Count the full cradle-to-gate footprint in the year acquired (not depreciated over time).', dataSource: 'Fixed-asset register / capital expenditure records for the reporting year. Spend-based estimation is permitted for this category.' },
  { id: 'cat3', num: 3, name: 'Fuel & energy related', stream: 'Upstream', desc: 'Upstream emissions from extraction and production of fuels and energy you use', method: 'activity', unit: 'kwh', materialSectors: ['all'], typicalShare: 0.03 , guidance: 'Upstream emissions of the fuel and electricity you use that AREN\'T already in Scope 1 or 2 — i.e. extracting, producing and transporting those fuels, plus grid transmission & distribution (T&D) losses.', dataSource: 'Your Scope 1 & 2 energy consumption data (kWh, fuel volumes) — apply well-to-tank and T&D-loss factors. Source the consumption from utility bills / the GHG module.' },
  { id: 'cat4', num: 4, name: 'Upstream transportation', stream: 'Upstream', desc: 'Emissions from transporting purchased goods to your facilities', method: 'activity', unit: 'tonne_km', materialSectors: ['Consumer & Retail', 'Agriculture & Food', 'Industrials & Manufacturing'], typicalShare: 0.04 , guidance: 'Emissions from transporting and distributing the goods you BUY, between your suppliers and you — plus third-party logistics you pay for (inbound freight and warehousing).', dataSource: 'Logistics/freight invoices, shipment records (tonne-km or mode/distance). Spend-based estimation is permitted for this category.' },
  { id: 'cat5', num: 5, name: 'Waste generated in operations', stream: 'Upstream', desc: 'Emissions from disposal and treatment of waste generated', method: 'activity', unit: 'tonnes', materialSectors: ['all'], typicalShare: 0.01 , guidance: 'Emissions from third parties treating the waste your operations generate — landfill, combustion, recycling, composting and anaerobic digestion. Wastewater is not covered: the waste factors used here publish none.', dataSource: 'Waste contractor invoices / facilities team: tonnes by material and treatment route. Activity data (tonnes) is needed — spend-based is not appropriate here.' },
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

// ⚠️ EMISSION_FACTORS.spend AND SECTOR_MATERIAL ARE KEYED ON THE RETIRED INTERNAL VOCABULARY, AND
// THE DROPDOWNS NOW EMIT EXIOBASE CODES, SO EVERY LOOKUP MISSES. Deliberate. The tables stay —
// SECTOR_MATERIAL's materiality suggestions are separate work and come out separately — but a miss
// must not fall through to DEFAULT_SPEND_EF (0.5) or to SECTOR_MATERIAL['Other'], because both
// produce output that renders identically to output someone established. `sectorPriced` is the one
// place that question is asked, so every surface answers it the same way.
//   Cat 1 no longer asks it: its spend path is priced by /api/scope3/spend-factor against EXIOBASE
// codes (see "Cat 1 spend pricing" in the component). Cat 15 still does.
const sectorPriced = (sector: string | undefined): boolean =>
  !!sector && Object.hasOwn(EMISSION_FACTORS.spend, sector)

/** The GHG wizard's treatment of an unpriceable location, reused: withhold the figure, say why, and
 *  say it is not a zero. See app/dashboard/ghg/page.tsx, "We can't work out this location's
 *  emissions yet".
 *
 *  `detail`, when given, REPLACES the sector sentence and is rendered VERBATIM. It exists for text a
 *  server already wrote — the resolver's explanation, the pricing route's notice or error — which
 *  names what was actually observed. Rewording it here would put a cause in the customer's mind that
 *  nobody checked. Without `detail` the notice keeps its original sector wording, which is still the
 *  accurate one for Cat 15. */
function NoFactorNotice({ what, detail, title }: { what: string; detail?: string; title?: string }) {
  return (
    <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-module-climate)', marginBottom: 4 }}>{title ?? '⚠ No spend factor for this sector yet'}</div>
      <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
        {detail ?? `${what} cannot be estimated from spend until a factor is available for the sector you selected.`}
      </div>
      <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 4 }}>
        It is not counted as zero. Enter a known figure above if you hold one, and everything else you have entered is unaffected.
      </div>
    </div>
  )
}

// ─── /api/scope3/spend-factor response, as this page reads it ──────────────────────────────────
//
// Only the fields this page uses. The route owns the full contract (app/api/scope3/spend-factor/
// route.ts); typing a subset here means a field the page does not read cannot drift out of sync.
type SpendFactorLine =
  | {
      id: string; outcome: 'priced'; emissions_mt: number; used_region: string; disclosures: string[]
      source: { dataset: string | null; version: string | null }
    }
  | { id: string; outcome: 'absent'; explanation: string }
  | { id: string; outcome: 'no_factor'; notice: string }

interface SpendFactorResponse {
  edition_id: string
  /** True of the estimate whatever the line count: source and licence, edition, price-vintage lag. */
  disclosures: string[]
  /** Counts across lines. Each restates what the lines already say, so render only for 2+ lines. */
  batch_summary: string[]
  lines: SpendFactorLine[]
}

/** What the Cat 1 spend request produced, keyed by the inputs it was made for. */
type Cat1SpendResult =
  | { key: string; kind: 'done'; response: SpendFactorResponse; line: SpendFactorLine }
  | { key: string; kind: 'error'; message: string }

/** The caller's own key for the single Cat 1 line; the route echoes it back. */
const CAT1_LINE_ID = 'cat1-spend'

/** Identity of one Cat 1 pricing question. Every input that changes the answer, and nothing else. */
const cat1SpendKey = (sectorKey: string, countryIso2: string, currency: string, reportingYear: number, spend: number) =>
  JSON.stringify([sectorKey, countryIso2, currency, reportingYear, spend])

/**
 * ⚠️ 400 ms. Long enough that typing a figure fires ONE request rather than one per keystroke —
 * ordinary typing puts 100-300 ms between keys, so a pause of 400 ms means the customer has stopped —
 * and short enough that the figure appears to follow the field rather than lag it. The discrete
 * inputs (sector, country, currency, year) are NOT debounced: a selection is one deliberate change,
 * and delaying it would only lengthen the time a stale figure is withheld.
 */
const SPEND_DEBOUNCE_MS = 400

/**
 * A priced spend figure with its workings, collapsed by default.
 *
 * ⚠️ THE SAME SHAPE AS THE GHG WORKINGS CARD, and deliberately not a second pattern:
 * app/dashboard/ghg/page.tsx renders buildWorkings() as one full-width card per location whose header
 * carries the figures and a "▼ Show workings" / "▲ Hide" toggle, collapsed until opened, with an
 * uppercase label over the body. A customer reads the figure in the header; a verifier opens the
 * workings in one click. What is NOT copied is its toggle: that header is a <div onClick> with no
 * role, no tabIndex and no key handler, so a keyboard user cannot open the workings at all. This one
 * is a real <button> carrying aria-expanded and aria-controls.
 *
 * The body is a list of sentences rather than the GHG table, because this is what the route returns:
 * finished sentences, not rows of fields. Each renders verbatim, one per item, at a readable measure.
 * `summary` is the one place this card composes text from fields, and it names only the figure and
 * the method; every qualification of the figure stays in the sentences below it.
 */
function SpendFactorWorkings({ id, figureMt, summary, sentences }: {
  id: string
  figureMt: number
  summary: string
  sentences: string[]
}) {
  const [open, setOpen] = useState(false)
  const bodyId = `${id}-workings`
  return (
    <div style={{ background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls={bodyId}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '0.9rem 1.25rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
      >
        <span style={{ fontSize: 13, color: '#0d0d0d', lineHeight: 1.5 }}>
          <strong style={{ fontWeight: 600 }}>{figureMt.toFixed(2)} mt CO₂e</strong>
          <span style={{ color: 'var(--color-ink-muted)' }}> · {summary}</span>
        </span>
        <span style={{ fontSize: 12, color: 'var(--color-ink-muted)', whiteSpace: 'nowrap' }}>{open ? '▲ Hide' : '▼ Show workings'}</span>
      </button>
      {open && (
        <div id={bodyId} style={{ padding: '0 1.25rem 1.25rem', borderTop: '0.5px solid #e8e7e4' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', margin: '1rem 0 0.75rem', letterSpacing: '0.07em', textTransform: 'uppercase' }}>How this estimate was made</div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', maxWidth: '72ch' }}>
            {sentences.map(s => (
              <li key={s} style={{ fontSize: 12, color: '#555553', lineHeight: 1.6, marginBottom: 6 }}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** 163 EXIOBASE industries under our 20 display headings. One list, four selects. */
function IndustryOptions() {
  return (
    <>
      {INDUSTRY_OPTION_GROUPS.map(g => (
        <optgroup key={g.heading} label={g.heading}>
          {g.industries.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
        </optgroup>
      ))}
    </>
  )
}

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
// The five RoW bucket names moved to lib/emissionFactors/regionNames.ts on 17 Sep 2026, so the
// spend-factor route and this page name a region in the same words. The DESCRIBING words ("regional
// average", "country-specific factor") stay here; see the resolved-region line in renderStep0.

/** A sector for a RECORD: EXIOBASE's name with its code, so a verifier can read it and find the row.
 *  The bare code when there is no name (not "i99 (EXIOBASE i99)"); '' when nothing is set. */
const sectorLabel = (code: string | undefined): string =>
  !code ? '' : industryName(code) === code ? code : `${industryName(code)} (EXIOBASE ${code})`

// Visually hidden but announced. Used for the results count, which sighted users read off the list
// itself and a screen reader otherwise never hears.
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }

const sectionSub: React.CSSProperties = { fontSize: 13, color: 'var(--color-ink-muted)', fontWeight: 400, lineHeight: 1.6, marginBottom: '1.5rem' }

const STEP_NAMES = ['Setup', 'Materiality', 'Calculate', 'Results', 'Export']

/**
 * One Cat 5 waste stream. `activity` is stored beside `waste_type` because the activity block is part of
 * the factor's identity in the sheet, and a record that names the material without its block would need
 * the artefact to say which one it meant. '' means not chosen; tonnes 0 means not entered.
 */
interface WasteRow {
  id: string
  activity: string
  waste_type: string
  route: string
  tonnes: number
}

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
  // Cat 5 — one row per material and treatment route, priced from lib/emissionFactors/defraWaste2026.json.
  wasteRows?: WasteRow[]
  // ⚠️ THE PREVIOUS CAT 5 FORM. NEVER PRICED, NEVER WRITTEN, AND NEVER REMOVED. No input sets these any
  // more and no calculation reads them. They are typed only so that an inventory saved under the old form
  // can say what it holds (cat5LegacyNotice). Saves spread the stored cat5 object, so the values stay in
  // cat_data exactly as they were.
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
  const { isPaid, loading: entLoading } = useEntitlementState('ghg')
  const [step, setStep] = useState(0)
  const [company, setCompany] = useState('')
  const [sector, setSector] = useState('')
  const [reportingYear, setReportingYear] = useState(defaultReportingYear(new Date(), YEAR_FLOOR))
  const [currency, setCurrency] = useState('USD')
  const [revenue, setRevenue] = useState(0)
  // Primary country of supply. countryIso2 is the persisted value; the other four are presentation
  // state for the typeahead and are deliberately NOT saved.
  const [countryIso2, setCountryIso2] = useState('')
  const [countryQuery, setCountryQuery] = useState('')
  const [countryOpen, setCountryOpen] = useState(false)
  const [countryFocusIdx, setCountryFocusIdx] = useState(-1)
  const [countryHoverIdx, setCountryHoverIdx] = useState(-1)
  const [materialCats, setMaterialCats] = useState<number[]>([])
  const [catData, setCatData] = useState<Record<string, CategoryData>>({})
  const [openInfo, setOpenInfo] = useState<Record<string, boolean>>({})
  const [dataConfirmed, setDataConfirmed] = useState(false)
  const [boundInventoryId, setBoundInventoryId] = useState<string | null>(null)
  // The bound GHG inventory's recorded GWP basis (ghg_inventories.gwp_version: AR4, AR5, AR6 or null).
  // Read so the Cat 5 disclosure can state whether its AR5 factors match it, rather than assume either way.
  const [ghgGwpVersion, setGhgGwpVersion] = useState<string | null>(null)
  const [inventoryList, setInventoryList] = useState<Array<{ id: string; company_name: string; reporting_year: number; updated_at: string }>>([])
  const [bindChecked, setBindChecked] = useState(false) // have we resolved bind status yet?
  const [cameFromGhg, setCameFromGhg] = useState(false) // arrived via ?from=ghg (unsaved GHG wizard)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // The total_scope3_tco2e that is actually in the database for this inventory, as last read or
  // written. `saved` says the INPUTS were saved; this is what lets the page check that the TOTAL on
  // screen is the one that was saved, which it may not be once a Cat 1 figure is fetched afresh.
  const [savedTotal, setSavedTotal] = useState<number | null>(null)
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
  // null = still loading, '' = loaded, otherwise the failure to show. Three states rather than a
  // boolean because "No supplier campaigns found" is a claim, and it must not be made before the list
  // has loaded or when the list could not be loaded at all.
  const [campaignsError, setCampaignsError] = useState<string | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState<string | null>(null)
  const [catOneResult, setCatOneResult] = useState<CatOneResult | null>(null)

  // Load this buyer's campaigns once, so the Cat 1 step can offer a "pull" source.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) {
        if (active) setCampaignsError('Sign in again to load your supplier campaigns.')
        return
      }
      try {
        // ⚠️ THE BEARER TOKEN IS REQUIRED. This call used to send none, so /api/campaigns answered 401
        // every time, the body failed the Array.isArray check below, and the page quietly rendered
        // "No supplier campaigns found" to buyers who had campaigns. Same header as the portal pull.
        // The route scopes to the token's user, so buyer_id in the query string is not what it reads.
        const res = await fetch('/api/campaigns', { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => null)
        if (!active) return
        if (!res.ok) {
          setCampaignsError(json?.error ? `Could not load your supplier campaigns: ${json.error}` : `Could not load your supplier campaigns (HTTP ${res.status}).`)
          return
        }
        if (!Array.isArray(json?.data)) {
          setCampaignsError('Could not load your supplier campaigns: the response held no campaign list.')
          return
        }
        const list = (json.data as { id: string; name: string }[]).map(c => ({ id: c.id, name: c.name }))
        setCampaigns(list)
        if (list.length === 1) setSelectedCampaign(list[0].id)
        setCampaignsError('')
      } catch {
        if (active) setCampaignsError('Could not reach the server to load your supplier campaigns.')
      }
    })()
    return () => { active = false }
  }, [])

  // ─── Cat 1 spend pricing (/api/scope3/spend-factor) ─────────────────────────
  //
  // The factor lives server-side (spendResolver.server.ts imports 2.17 MB of JSON), so the figure is
  // fetched and held in state, and calcCat1 stays SYNCHRONOUS and reads that state.
  //
  // ⚠️ SEQUENCING: AbortController, plus a key on every stored result. Either alone is not enough.
  //   · The effect's cleanup aborts the in-flight request whenever an input changes, and every await
  //     is followed by an aborted check before any state is set. React runs the old effect's cleanup
  //     before the new effect starts, so a superseded response can never write. Abort was chosen over
  //     a bare request counter because it also cancels the network request, rather than letting a
  //     response nobody will read finish downloading.
  //   · Every stored result carries the key of the inputs it was computed for, and it is only USED
  //     when that key equals the inputs on screen now. This is what stops a figure being read as
  //     current during the gap before the new request settles — including the debounce window, when
  //     no request has even been sent yet. The same comparison drives the loading state.
  const cat1Data = catData['cat1']
  const cat1NeedsSpendPrice = !!cat1Data?.included && !(cat1Data.has_supplier_data && cat1Data.supplier_emissions)
  const cat1Sector = cat1Data?.supplier_sector || sector
  const cat1SpendRaw = cat1Data?.total_spend || 0
  const [cat1SpendDebounced, setCat1SpendDebounced] = useState(0)
  const [cat1Spend, setCat1Spend] = useState<Cat1SpendResult | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setCat1SpendDebounced(cat1SpendRaw), SPEND_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [cat1SpendRaw])

  useEffect(() => {
    if (!cat1NeedsSpendPrice || !cat1Sector || !countryIso2 || cat1SpendDebounced === 0) return
    const key = cat1SpendKey(cat1Sector, countryIso2, currency, reportingYear, cat1SpendDebounced)
    const controller = new AbortController()
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (controller.signal.aborted) return
        const token = session?.access_token
        if (!token) { setCat1Spend({ key, kind: 'error', message: 'Please sign in again to price this spend.' }); return }
        const res = await fetch('/api/scope3/spend-factor', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            reporting_year: reportingYear,
            reporting_currency: currency,
            lines: [{
              id: CAT1_LINE_ID,
              country_iso2: countryIso2,
              sector_key: cat1Sector,
              factor_type: 'industry',
              spend: cat1SpendDebounced,
              // PURCHASER prices, because this field holds what the customer PAID: a figure read off
              // invoices or an AP ledger, which includes trade and transport margins and product
              // taxes. EXIOBASE factors are in basic prices, so the route will flag the mismatch and
              // say it was not converted. Claiming 'basic' here would silence that disclosure while
              // the figure stayed exactly as unconverted as before.
              spend_price_basis: 'purchaser',
            }],
          }),
        })
        const json = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!res.ok) {
          // The route's customer `message`, verbatim. NOT operator_detail: that names tables, columns and
          // fingerprints, and is for whoever reads the server log or the network panel.
          setCat1Spend({ key, kind: 'error', message: json?.message ?? `The pricing service answered HTTP ${res.status} with no message.` })
          return
        }
        const line = (json as SpendFactorResponse | null)?.lines?.[0]
        if (!line || line.id !== CAT1_LINE_ID) {
          setCat1Spend({ key, kind: 'error', message: 'The pricing service returned a response that did not include this spend line.' })
          return
        }
        setCat1Spend({ key, kind: 'done', response: json as SpendFactorResponse, line })
      } catch {
        // An abort rejects the fetch too. That is supersession, not failure, so it writes nothing.
        if (controller.signal.aborted) return
        setCat1Spend({ key, kind: 'error', message: 'Could not reach the pricing service.' })
      }
    })()
    return () => controller.abort()
  }, [cat1NeedsSpendPrice, cat1Sector, countryIso2, currency, reportingYear, cat1SpendDebounced])

  // The inputs on screen NOW, including the undebounced spend. A stored result counts only if it was
  // made for exactly these; otherwise the figure is pending, never the previous one.
  const cat1SpendInputsComplete = cat1NeedsSpendPrice && !!cat1Sector && !!countryIso2 && cat1SpendRaw !== 0
  const cat1CurrentKey = cat1SpendInputsComplete ? cat1SpendKey(cat1Sector, countryIso2, currency, reportingYear, cat1SpendRaw) : null
  const cat1SpendCurrent = cat1CurrentKey !== null && cat1Spend?.key === cat1CurrentKey ? cat1Spend : null
  const cat1SpendPending = cat1CurrentKey !== null && cat1SpendCurrent === null
  const cat1SpendPriced = cat1SpendCurrent?.kind === 'done' && cat1SpendCurrent.line.outcome === 'priced'
    ? cat1SpendCurrent.line
    : null
  /** The sentences behind a priced Cat 1 figure. ONE derivation, read by the workings card and the CSV,
   *  so the export cannot disclose something different from the screen. The line's own sentences, then
   *  what is true of the whole estimate, then batch counts only for more than one line. */
  const cat1SpendSentences: string[] = cat1SpendPriced && cat1SpendCurrent?.kind === 'done'
    ? [...new Set([
        ...cat1SpendPriced.disclosures,
        ...cat1SpendCurrent.response.disclosures,
        ...(cat1SpendCurrent.response.lines.length > 1 ? cat1SpendCurrent.response.batch_summary : []),
      ])]
    : []
  /** The Cat 1 spend inputs not yet entered. One list, read by the panel hint and the unpriced reason. */
  const cat1MissingInputs = [
    !cat1SpendRaw && 'total annual spend',
    !cat1Sector && 'primary supplier sector',
    !countryIso2 && 'primary country of supply (Step 1)',
  ].filter((x): x is string => typeof x === 'string')

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
    setGhgGwpVersion(row.gwp_version ?? null)
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
      if (s3.country_iso2) {
        setCountryIso2(s3.country_iso2)
        // Show the stored CODE if we no longer recognise it, never a blank box. Same principle as
        // industryName(): a value the customer saved must stay visible even once it stops resolving.
        setCountryQuery(countryByIso2(s3.country_iso2)?.display_name ?? s3.country_iso2)
      }
      if (s3.revenue_millions != null) setRevenue(s3.revenue_millions * 1_000_000) // overrides ghg-derived revenue (user may have edited it)
      if (s3.cat_data) setCatData(s3.cat_data as Record<string, CategoryData>)
      setMaterialCats(
        CATEGORIES.filter(c => (s3.cat_data as any)?.[c.id]?.included).map(c => c.num)
      )
      setSaved(true) // it IS saved
      // null when the row predates total_scope3_tco2e being written; then there is nothing to match.
      setSavedTotal(s3.total_scope3_tco2e == null ? null : Number(s3.total_scope3_tco2e))
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
    // SECTOR_MATERIAL is keyed on the retired vocabulary too. Falling through to 'Other' would
    // suggest one generic set of material categories to every company while looking tailored, so
    // an unmatched sector suggests nothing and says so.
    const suggested = SECTOR_MATERIAL[sector]
    if (!suggested) {
      setMaterialCats([])
      return
    }
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

  // ─── Row editors: Cat 15 holdings and Cat 5 waste rows ───────────────────────
  //
  // ⚠️ EVERY WRITE READS THE LIST INSIDE THE setCatData UPDATER, THROUGH lib/rowList.ts. These helpers
  // used to read catData from the render, build the next list from it and pass that list in, so two
  // edits in one tick both started from the same rendered list and the second erased the first.
  // cat15Assets() and wasteRows() below are for RENDERING only; a write must never start from them.
  // Rows are addressed by id rather than position, for the reason given in lib/rowList.ts.
  //
  // What stays here is what is specific to a row: Cat 15's nested emissions merge and Cat 5's route
  // clearing. Both are function patches, so they too read the row as it is when the edit applies.

  // Cat 15 detailed (per-asset PCAF) holdings, in catData['cat15'].pcafAssets.
  const newPcafAsset = (): PcafPortfolioAsset => ({
    id: Math.random().toString(36).slice(2),
    assetClass: 'listed_equity_corp_bonds',
    outstandingAmount: 0,
    denominator: 0,
    emissions: {}, // EmissionInputs — empty until the user fills a path
  })
  /** For rendering only. */
  const cat15Assets = () => catData['cat15']?.pcafAssets ?? []
  const editCat15Assets = (edit: RowEdit<PcafPortfolioAsset>) =>
    setCatData(prev => ({ ...prev, cat15: { ...prev.cat15, pcafAssets: editRows(prev.cat15?.pcafAssets, edit) } }))
  const addPcafAsset = () => editCat15Assets({ kind: 'add', row: newPcafAsset() })
  const removePcafAsset = (id: string) => editCat15Assets({ kind: 'remove', id })
  const updatePcafAsset = (id: string, patch: Partial<PcafPortfolioAsset> | ((row: PcafPortfolioAsset) => Partial<PcafPortfolioAsset>)) =>
    editCat15Assets({ kind: 'update', id, patch })
  // Row-specific: merges into the nested emissions object as it is when the edit applies.
  const updatePcafEmissions = (id: string, patch: Partial<EmissionInputs>) =>
    updatePcafAsset(id, row => ({ emissions: { ...row.emissions, ...patch } }))

  // Cat 5 waste rows, in catData['cat5'].wasteRows.
  const newWasteRow = (): WasteRow => ({
    id: Math.random().toString(36).slice(2),
    activity: '',
    waste_type: '',
    route: '',
    tonnes: 0,
  })
  /** For rendering only. */
  const wasteRows = () => catData['cat5']?.wasteRows ?? []
  const editWasteRows = (edit: RowEdit<WasteRow>) =>
    setCatData(prev => ({ ...prev, cat5: { ...prev.cat5, wasteRows: editRows(prev.cat5?.wasteRows, edit) } }))
  const addWasteRow = () => editWasteRows({ kind: 'add', row: newWasteRow() })
  const removeWasteRow = (id: string) => editWasteRows({ kind: 'remove', id })
  const updateWasteRow = (id: string, patch: Partial<WasteRow> | ((row: WasteRow) => Partial<WasteRow>)) =>
    editWasteRows({ kind: 'update', id, patch })
  /**
   * ⚠️ A MATERIAL CHANGE CLEARS A ROUTE THE NEW MATERIAL DOES NOT PUBLISH. Keeping it would leave a pair
   * the sheet has no factor for, which the route select could not even display. A route the new material
   * does publish is kept, because the customer chose it and it is still valid.
   */
  const setWasteMaterial = (id: string, key: string) => {
    const m = parseWasteMaterialKey(key)
    if (!m) { updateWasteRow(id, { activity: '', waste_type: '', route: '' }); return }
    // The route is checked against the row as it is when the edit applies, not as it was rendered.
    updateWasteRow(id, row => ({
      activity: m.activity,
      waste_type: m.waste_type,
      route: wasteRoutesFor(m.activity, m.waste_type).includes(row.route) ? row.route : '',
    }))
  }

  // ─── Calculations ────────────────────────────────────────────────────────────

  const calcCat1 = (): number => {
    const d = catData['cat1']
    if (!d?.included) return 0
    if (d.has_supplier_data && d.supplier_emissions) return d.supplier_emissions
    // The spend path reads the route's answer for the inputs on screen now, and nothing else. Absent,
    // no_factor, an error, a request still in flight or an input not yet entered all return 0, and
    // unpricedCatIds excludes the category rather than summing that 0 in.
    //   ⚠️ NO DEFAULT FACTOR. This used to fall back to DEFAULT_SPEND_EF (0.5 kg per currency unit)
    // on a sector miss — the last way a flat 0.5 could reach a Cat 1 figure, rendering exactly like a
    // figure priced from a real factor. It is gone; a miss is a miss.
    return cat1SpendPriced ? cat1SpendPriced.emissions_mt : 0
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

  // Every Cat 5 row with its pricing, in entry order. ONE evaluation read by the figure, the panel, the
  // workings, the CSV and factor_basis, so none of them can price a row differently.
  const cat5Evaluated: { row: WasteRow; n: number; pricing: WasteRowPricing }[] =
    wasteRows().map((row, i) => ({ row, n: i + 1, pricing: priceWasteRow(row) }))
  const cat5Priced = cat5Evaluated.flatMap(e => e.pricing.status === 'priced' ? [{ ...e, pricing: e.pricing }] : [])
  const cat5NotPriced = cat5Evaluated.filter(e => e.pricing.status !== 'priced')

  // The sum over PRICED rows of tonnes x factor, in kg, over 1000 for mt. An incomplete row, or one whose
  // saved pair the sheet does not publish, adds nothing and is named wherever this figure is described.
  const calcCat5 = (): number => {
    const d = catData['cat5']
    if (!d?.included) return 0
    return cat5Priced.reduce((kg, e) => kg + e.pricing.kg_co2e, 0) / 1000
  }

  /**
   * What an inventory saved under the previous Cat 5 form holds, and why it is not priced. null when
   * cat_data.cat5 carries neither field. Read by the Cat 5 panel and the CSV.
   *
   * ⚠️ SHOWN WHENEVER A FIELD IS PRESENT, INCLUDING AT 0. The old inputs wrote 0 when cleared, so a stored
   * 0 is still something the customer entered, and saying nothing would be deciding it did not matter.
   */
  const cat5LegacyNotice: { tonnages: string; sentences: string[] } | null = (() => {
    const d = catData['cat5']
    const landfill = d?.waste_landfill_tonnes
    const recycled = d?.waste_recycled_tonnes
    const hasLandfill = landfill !== undefined && landfill !== null
    const hasRecycled = recycled !== undefined && recycled !== null
    if (!hasLandfill && !hasRecycled) return null
    const tonnages = [hasLandfill && `${landfill} t to landfill`, hasRecycled && `${recycled} t recycled`]
      .filter((x): x is string => typeof x === 'string').join(' and ')
    const both = hasLandfill && hasRecycled
    const sheet = `the ${DEFRA_WASTE_META.sheet} sheet of ${DEFRA_WASTE_META.source}`
    const sentences = [
      `This inventory was saved with the previous Cat 5 form, which recorded ${tonnages}.`,
      `${both ? 'These tonnages are' : 'This tonnage is'} not priced and not in the Cat 5 figure.`,
      `${both ? 'Neither names a' : 'It names no'} waste type, and ${sheet} publishes each factor for a waste type and a treatment route together.`,
      ...(hasRecycled
        ? ['"Recycled" is also not one route on that sheet. Its recycling routes are Open-loop and Closed-loop, two separate routes, and not every waste type publishes both.']
        : []),
      'To price this waste, add it as waste streams in the Cat 5 panel. The saved figures are kept as they were.',
    ]
    return { tonnages, sentences }
  })()

  /** "row 1", "rows 1 and 3", "rows 1, 2 and 4". */
  const rowList = (ns: number[]): string =>
    ns.length === 1 ? `row ${ns[0]}` : `rows ${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}`

  /** Why a row adds nothing to the figure, from what was observed about it. null for a priced row. */
  const wasteRowNotPricedReason = (row: WasteRow, pricing: WasteRowPricing): string | null =>
    pricing.status === 'incomplete' ? `${pricing.missing.join(', ')} not entered`
      : pricing.status === 'no_factor' ? `the sheet publishes no ${row.route} factor for ${row.waste_type} (${row.activity}), so it is not counted, and not counted as zero`
      : null

  /**
   * The Cat 5 workings, and the CSV's Cat 5 disclosure rows: the same sentences in both, as for Cat 1.
   *
   * ⚠️ THE GWP SENTENCE READS THE BOUND INVENTORY, IT DOES NOT ASSERT A MIX. These factors are AR5. The
   * GHG inventory records its own basis in gwp_version, and the sentence says whether the two match,
   * differ, or cannot be compared because nothing is recorded.
   */
  const cat5Sentences: string[] = (() => {
    const m = DEFRA_WASTE_META
    const out: string[] = []
    out.push(
      `Priced from ${m.source} — ${m.factor_set.toLowerCase()} v${m.file_version}, ${m.sheet} sheet, factor edition ${m.edition}. ` +
      `Each row is its tonnes multiplied by the kg CO2e per tonne the sheet publishes for that material and treatment route, and the rows are summed.`,
    )
    // ⚠️ VERBATIM FROM THE ARTEFACT: the attribution OGL v3.0 requires, then the licence and its link, which
    // the licence asks for where possible. Never reworded here.
    out.push(DEFRA_WASTE_META.attribution_required)
    out.push(`Licence: ${DEFRA_WASTE_META.licence}, ${DEFRA_WASTE_META.licence_url}`)
    const specific = cat5Priced.filter(e => e.pricing.method === 'waste_type_specific')
    const average = cat5Priced.filter(e => e.pricing.method === 'average_data')
    const methodParts = [
      specific.length > 0 && `${WASTE_METHOD_LABEL.waste_type_specific} for ${rowList(specific.map(e => e.n))}, where a specific material was chosen`,
      average.length > 0 && `${WASTE_METHOD_LABEL.average_data} for ${average.map(e => `row ${e.n}, because ${wasteMethodFor(e.row.waste_type).reason}`).join('; ')}`,
    ].filter((x): x is string => typeof x === 'string')
    if (methodParts.length > 0) {
      out.push(`Method, in the GHG Protocol Scope 3 Standard's terms for Category 5: ${methodParts.join('; ')}.`)
    }
    const mix = !boundInventoryId ? ''
      : ghgGwpVersion === m.gwp_basis ? ` The linked GHG inventory records ${ghgGwpVersion} as well, so the two share a GWP basis.`
      : ghgGwpVersion ? ` The linked GHG inventory records ${ghgGwpVersion}. These factors are not re-based to it, so the inventory combines ${ghgGwpVersion} and ${m.gwp_basis} figures.`
      : ` The linked GHG inventory records no GWP basis, so whether it shares ${m.gwp_basis} with these factors is not known.`
    out.push(`GWP basis: ${m.gwp_basis}. ${m.gwp_basis_note}${mix}`)
    out.push(withoutListMarker(m.scope_guidance))
    out.push(withoutListMarker(m.lifecycle_guidance))
    out.push('Each material is offered only the treatment routes the sheet publishes a factor for. A route it does not publish is not offered, and is not treated as zero.')
    out.push(`Re-use is not offered. The workbook's FAQ, "${m.reuse_faq_question}": ${m.reuse_faq_answer}`)
    out.push('The sheet publishes no wastewater factors, so wastewater treatment is not in this figure.')
    for (const e of cat5NotPriced) {
      out.push(`Row ${e.n} is not in this figure: ${wasteRowNotPricedReason(e.row, e.pricing)}.`)
    }
    return out
  })()

  const calcGenericSpend = (id: string): number => {
    const d = catData[id]
    if (!d?.included) return 0
    if (d.emissions_override) return d.emissions_override
    const spend = d.annual_spend || 0
    // GENERIC_SPEND_FACTOR is 0.5, the literal that stood here. Named so that every description of
    // these figures reads the factor and its (empty) provenance instead of restating them.
    return (spend * GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit) / 1000
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

  // Dispatches on scope3MethodFor, the same map every basis description reads, so a category cannot be
  // described as one method and calculated with another. The mapping is identical to the switch on id
  // it replaced: cat1, cat5, cat6, cat7 and cat15 to their own functions, everything else generic.
  const getCatEmissions = (id: string): number => {
    switch (scope3MethodFor(id)) {
      case 'exiobase_spend': return calcCat1()
      case 'waste_factors': return calcCat5()
      case 'travel_factors': return calcCat6()
      case 'commuting_factors': return calcCat7()
      case 'pcaf': return calcCat15()
      case 'flat_spend': return calcGenericSpend(id)
    }
  }

  // ── CATEGORIES THAT CANNOT BE PRICED ARE EXCLUDED AND NAMED, NEVER COUNTED AS ZERO ───────────
  //
  // Same rule the GHG engine applies to an unpriceable location: it is left out of the totals and
  // the exclusion is stated, because a category summed in at zero is a claim that it emits nothing.
  // Only the two sector-keyed categories are affected. Cat 1's spend path is priced by the
  // spend-factor route, so it is unpriced unless the route priced the inputs on screen; Cat 15 passes
  // a sector into lib/pcaf, which falls back to 0.12 on a miss. The other thirteen
  // never used the sector — calcGenericSpend has always been a flat 0.5 and calcCat5/6/7 are
  // activity-based — so they are unaffected by the vocabulary change.
  const unpricedCatIds = new Set(
    CATEGORIES.filter(c => {
      const d = catData[c.id]
      if (!d?.included) return false
      if (c.id === 'cat1') return !(d.has_supplier_data && d.supplier_emissions) && !cat1SpendPriced
      if (c.id === 'cat15') return !d.emissions_override && !sectorPriced(d.portfolio_sector || sector)
      return false
    }).map(c => c.id),
  )
  const totalScope3 = CATEGORIES.filter(c => catData[c.id]?.included && !unpricedCatIds.has(c.id))
    .reduce((sum, c) => sum + getCatEmissions(c.id), 0)
  const unpricedCats = CATEGORIES.filter(c => unpricedCatIds.has(c.id))
  // The categories that actually contribute to totalScope3: included, priceable, and non-zero.
  // ONE definition, read by both the Results rows and the Export tile's count, because those two
  // disagreed (Results showed 1 row, Export said "Categories: 3") and a count that differs from the
  // rows beside the same total reads as a claim about what the total is made of. This is a display
  // set, not a calculation: totalScope3 above is unchanged and still sums its own filter.
  const categoriesInTotal = CATEGORIES.filter(c => catData[c.id]?.included && !unpricedCatIds.has(c.id) && getCatEmissions(c.id) > 0)
  // The categories marked material: everything the inventory claims to cover, whether or not it
  // could be priced or has data yet. Shown beside categoriesInTotal wherever a category count
  // appears, so "in scope" versus "in total" is always visible rather than one standing in for the
  // other under a bare "Categories".
  const categoriesInScope = CATEGORIES.filter(c => catData[c.id]?.included)
  // The total as displayed. ONE expression for every surface that shows it, so a total missing
  // unpriced categories never reads as complete on one step and partial on the next.
  const totalScope3Label = unpricedCats.length > 0 ? `${totalScope3.toFixed(1)} mt (partial)` : `${totalScope3.toFixed(1)} mt`

  /**
   * Why an included category was left out of the total, from what was actually OBSERVED for it.
   *
   * ⚠️ THIS REPLACES A FIXED "no spend factor held for the selected sector", which was the only cause
   * when Cat 1 priced from a local table and is now one of several. A missing input is checked; a
   * request in flight is checked; a route answer is quoted verbatim. Where none of those applies the
   * sentence says no reason was recorded — it does not reach for the likeliest one.
   */
  const unpricedReason = (id: string): string => {
    const NO_REASON = 'It was not priced, and no reason was recorded.'
    if (id === 'cat1') {
      if (cat1MissingInputs.length > 0) {
        return `Not estimated, because ${cat1MissingInputs.length === 1 ? 'this has' : 'these have'} not been entered: ${cat1MissingInputs.join(', ')}.`
      }
      if (cat1SpendPending) return 'Its estimate had not finished calculating.'
      if (cat1SpendCurrent?.kind === 'error') return cat1SpendCurrent.message
      if (cat1SpendCurrent?.line.outcome === 'absent') return cat1SpendCurrent.line.explanation
      if (cat1SpendCurrent?.line.outcome === 'no_factor') return cat1SpendCurrent.line.notice
      return NO_REASON
    }
    if (id === 'cat15') {
      // Checked against the same lookup unpricedCatIds used: a sector that is set and not in the table.
      return (catData['cat15']?.portfolio_sector || sector)
        ? 'No spend factor is held for the sector selected.'
        : 'No sector has been selected.'
    }
    return NO_REASON
  }

  // ─── Save state ────────────────────────────────────────────────────────────
  //
  // ⚠️ "✓ Saved" IS A CLAIM ABOUT THE TOTAL ON SCREEN, so it is DERIVED rather than stored. It shows
  // only when (a) the inputs were saved, (b) no Cat 1 estimate is pending, and (c) the total on screen
  // equals the total in the database. (c) is what re-arms the button on a restored inventory whose
  // Cat 1 figure comes back different from the one saved — including one saved under the old 0.5
  // fallback, or saved while no factor edition was active. The comparison is a relative tolerance
  // because the total round-trips through a Postgres numeric and back to a double.
  const savedTotalMatches = savedTotal !== null
    && Math.abs(totalScope3 - savedTotal) <= 1e-9 * Math.max(1, Math.abs(totalScope3), Math.abs(savedTotal))
  const showSaved = saved && !cat1SpendPending && savedTotalMatches

  const getConfidence = (id: string): 'high' | 'medium' | 'low' => {
    const d = catData[id]
    if (!d?.included) return 'low'
    if (d.emissions_override || d.has_supplier_data) return 'high'
    if (id === 'cat6' && (d.short_haul_flights || d.long_haul_flights)) return 'medium'
    if (id === 'cat7' && d.employee_count) return 'medium'
    if (id === 'cat5' && cat5Priced.length > 0) return 'medium'
    if (d.annual_spend || d.total_spend) return 'low'
    return 'low'
  }

  const confidenceConfig = {
    high: { label: 'Primary data', color: '#0F6E56', bg: '#E1F5EE' },
    medium: { label: 'Activity data', color: '#0C447C', bg: '#E6F1FB' },
    low: { label: 'Spend-based', color: 'var(--color-module-climate)', bg: '#FEF3E2' },
  }

  /**
   * What an INCLUDED category's figure in THIS inventory actually rests on: a short basis and a detail
   * sentence. Read by the CSV's METHODOLOGY NOTE and by factor_basis.
   *
   * ⚠️ PER CATEGORY AND FROM WHAT WAS ENTERED, NEVER ONE SENTENCE FOR ALL. It replaced "DEFRA/Exiobase",
   * which was false for every category. A customer must be able to tell which of THEIR figures rest on
   * EXIOBASE through a named edition, which on fixed activity factors with no recorded source, which on
   * one flat unsourced spend factor, which on PCAF, and which on a figure they typed in themselves.
   */
  const categoryBasis = (id: string): { basis: string; detail: string } => {
    const d = catData[id]
    const method = scope3MethodFor(id)
    const notPriced = { basis: 'Not priced', detail: unpricedReason(id) }

    if (method === 'exiobase_spend') {
      if (d?.has_supplier_data && d.supplier_emissions) {
        return { basis: 'Supplier-specific', detail: `${d.supplier_emissions} mt CO2e entered from supplier data; no emission factor was applied.` }
      }
      if (cat1SpendPriced && cat1SpendCurrent?.kind === 'done') {
        const src = SPEND_EF_SOURCES.exiobase_38
        return {
          basis: `${src.dataset} ${src.version}, spend-based`,
          detail: `Priced from ${src.dataset} version ${src.version} through factor edition ${cat1SpendCurrent.response.edition_id}, ` +
            `using the factor for ${sectorLabel(cat1Sector)} in ${regionLabel(cat1SpendPriced.used_region)}.`,
        }
      }
      return notPriced
    }

    if (method === 'pcaf') {
      if (unpricedCatIds.has(id)) return notPriced
      if (d?.emissions_override) {
        return { basis: 'Entered figure', detail: `${d.emissions_override} mt CO2e of financed emissions entered directly; no emission factor was applied.` }
      }
      let result: ReturnType<typeof cat15PcafResult> | null = null
      try { result = d ? cat15PcafResult(d) : null } catch { result = null }
      if (result?.mode === 'decomposed') {
        return {
          basis: 'PCAF-aligned, per asset',
          detail: `Assessed asset by asset across ${result.assetCount} ${result.assetCount === 1 ? 'asset' : 'assets'}, ` +
            `with a weighted PCAF data quality score of ${result.weightedDataQualityScore.toFixed(1)}.`,
        }
      }
      return { basis: 'PCAF-aligned portfolio proxy', detail: scope3MethodDescription('pcaf') }
    }

    if (method === 'flat_spend') {
      if (d?.emissions_override) {
        return { basis: 'Entered figure', detail: `${d.emissions_override} mt CO2e entered directly; no emission factor was applied.` }
      }
      if (d?.annual_spend) {
        const gap = provenanceGap(GENERIC_SPEND_FACTOR)
        return {
          basis: 'Flat spend factor, unsourced',
          detail: `${d.annual_spend} ${currency} of spend at a flat ${GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit} kg CO2e ` +
            `per ${currency}, the same whatever was bought.${gap ? ` The factor is recorded with ${gap}.` : ''}`,
        }
      }
      return { basis: 'No data', detail: 'No spend or figure was entered, so nothing was calculated.' }
    }

    if (method === 'waste_factors') {
      const skipped = cat5NotPriced.length > 0
        ? ` ${cat5NotPriced.length} ${cat5NotPriced.length === 1 ? 'row was' : 'rows were'} not priced: ${cat5NotPriced.map(e => `row ${e.n}, ${wasteRowNotPricedReason(e.row, e.pricing)}`).join('; ')}.`
        : ''
      if (cat5Priced.length === 0) {
        return { basis: 'No data', detail: `No complete waste row was entered, so nothing was calculated.${skipped}` }
      }
      const methods = Array.from(new Set(cat5Priced.map(e => WASTE_METHOD_LABEL[e.pricing.method]))).join(' and ')
      return {
        basis: `${DEFRA_WASTE_META.source}, ${DEFRA_WASTE_META.sheet} sheet, ${methods}`,
        detail: `${scope3MethodDescription('waste_factors')} ${cat5Priced.length} ${cat5Priced.length === 1 ? 'row' : 'rows'} priced.${skipped}`,
      }
    }

    // travel, commuting: fixed activity factors
    if (getCatEmissions(id) === 0) {
      return { basis: 'No data', detail: 'No activity data was entered, so nothing was calculated.' }
    }
    return { basis: 'Fixed activity factors, unsourced', detail: scope3MethodDescription(method) }
  }

  // Persist the bound Scope 3 record. Upsert on inventory_id so re-saves update
  // the existing row rather than erroring on the unique FK.
  const saveScope3 = async () => {
    // A Cat 1 estimate still being fetched means totalScope3 is about to change. Writing it now would
    // store a total the page is on the point of contradicting. The button is disabled in this state
    // too; this guard is for any other caller.
    if (cat1SpendPending) return
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
        // NULL, not ''. scope3_inventories_country_iso2_format rejects anything that is not two
        // uppercase letters or NULL, so an empty string would fail the whole upsert.
        country_iso2: countryIso2 || null,
        revenue_millions: (revenue || 0) / 1_000_000, // raw -> millions
        cat_data: catData,
        total_scope3_tco2e: totalScope3,
        // Derived per included category from categoryBasis — the same statements the CSV carries. It was
        // the literal 'DEFRA/Exiobase (spend-based) · GHG Protocol category methodologies (activity-based)',
        // which was false. Still plain text in a column nothing reads; see the report on moving it to a
        // structured record on the factor_editions pattern.
        factor_basis: CATEGORIES.filter(c => catData[c.id]?.included)
          .map(c => { const b = categoryBasis(c.id); return `Cat ${c.num} ${c.name}: ${b.basis}. ${b.detail}` })
          .join('\n'),
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'inventory_id' })
      if (error) { console.error('Scope 3 save failed:', error); alert('Save failed: ' + error.message); return }
      setSaved(true)
      setSavedTotal(totalScope3) // exactly the value written above, from the same render
    } finally { setSaving(false) }
  }

  // Re-arm the Save button whenever saved inputs change after a save. Centralised
  // here rather than scattered across every catData/sector/currency/revenue setter.
  useEffect(() => {
    if (justRestored.current) { justRestored.current = false; return }
    setSaved(false)
  }, [catData, sector, currency, revenue, countryIso2])

  /**
   * The CSV's ESTIMATE BASIS rows: what a verifier needs to reconstruct a sector- or region-dependent
   * figure, in the file's own four-column shape. Placed straight after SCOPE 3 BY CATEGORY, which it
   * annotates, and before the METHODOLOGY NOTE — the same prose-row precedent as "Excluded from total".
   *
   * ⚠️ EACH ROW REPORTS WHAT THE CALCULATION USED, NOT WHAT A SELECT DISPLAYS. Cat 1 prices from the
   * supplier sector where one is set and the company sector otherwise, so the row names which, and
   * names the company sector alongside when the two differ. Cat 15's select shows "Financial Services"
   * when nothing is stored, but the calculation receives only portfolio_sector, so an unset value is
   * reported as unset.
   */
  const estimateBasisRows = (): string[][] => {
    const out: string[][] = []

    const c1 = catData['cat1']
    if (c1?.included) {
      if (c1.has_supplier_data && c1.supplier_emissions) {
        out.push(['Cat 1', 'Basis', 'Supplier-specific emissions',
          'Entered as a figure; no spend-based estimate was made, so no sector, region or factor edition applies.'])
      } else {
        const supplier = c1.supplier_sector
        out.push(['Cat 1', 'Sector used', sectorLabel(cat1Sector),
          !cat1Sector ? 'No sector selected.'
            : !supplier ? 'The company sector: no primary supplier sector was set for Cat 1.'
            : supplier === sector ? 'The primary supplier sector set for Cat 1, which is the same as the company sector.'
            : `The primary supplier sector set for Cat 1. It differs from the company sector, ${sectorLabel(sector) || 'which is not set'}, which was not used for this category.`])
        out.push(['Cat 1', 'Country of supply', countryIso2 ? countryLabel(countryIso2) : '', countryIso2 ? '' : 'Not entered.'])
        // The region that PRICED the figure where there is one; otherwise the region the country resolves
        // to in the same concordance the route uses, labelled as not having priced anything.
        const region = cat1SpendPriced?.used_region ?? (countryIso2 ? countryByIso2(countryIso2)?.region_code : undefined)
        out.push(['Cat 1', 'EXIOBASE region', region ? regionLabel(region) : '',
          cat1SpendPriced ? 'The region whose factor priced this estimate.'
            : region ? 'The region this country resolves to. No estimate was priced.'
            : 'No country of supply, so no region.'])
        out.push(['Cat 1', 'Factor edition', cat1SpendCurrent?.kind === 'done' ? cat1SpendCurrent.response.edition_id : '',
          cat1SpendPriced ? '' : `Not priced. ${unpricedReason('cat1')}`])
        for (const d of cat1SpendSentences) out.push(['Cat 1', 'Disclosure', d, ''])
      }
    }

    const c5 = catData['cat5']
    if (c5?.included) {
      if (cat5LegacyNotice) {
        out.push(['Cat 5', 'Previous form, not priced', cat5LegacyNotice.tonnages, cat5LegacyNotice.sentences.join(' ')])
      }
      // One row per waste row, with the pair, the published factor and the arithmetic, so a verifier can
      // find each factor on the sheet and redo the sum. Then the same disclosures the workings show.
      for (const e of cat5Evaluated) {
        const r = e.row
        const what = [r.waste_type && `${r.waste_type} (${r.activity})`, r.route].filter(Boolean).join(', ')
        out.push(['Cat 5', `Waste row ${e.n}`, what,
          e.pricing.status === 'priced'
            ? `${r.tonnes} t × ${e.pricing.factor_kg_per_tonne} kg CO2e per t = ${e.pricing.kg_co2e.toFixed(2)} kg CO2e; ${WASTE_METHOD_LABEL[e.pricing.method]}.`
            : `Not priced: ${wasteRowNotPricedReason(r, e.pricing)}.`])
      }
      if (cat5Evaluated.length === 0) out.push(['Cat 5', 'Waste rows', '', 'None entered.'])
      for (const d of cat5Sentences) out.push(['Cat 5', 'Disclosure', d, ''])
    }

    const c15 = catData['cat15']
    if (c15?.included) {
      // Which path actually ran, from the engine's own result rather than inferred from the inputs.
      let mode: string | null = null
      try { mode = cat15PcafResult(c15).mode } catch { mode = null }
      out.push(['Cat 15', 'Portfolio sector', sectorLabel(c15.portfolio_sector),
        mode === 'decomposed' ? 'Not used: the per-asset (detailed) assessment ran, and each asset carries its own inputs.'
          : c15.emissions_override ? 'Not used: known financed emissions were entered directly.'
          : c15.portfolio_sector ? 'The primary portfolio sector set for Cat 15.'
          : 'No portfolio sector set for Cat 15; the calculation received none.'])
    }
    return out
  }

  const generateExport = () => {
    const rows = [
      ['ThemisIQ — Scope 3 GHG Inventory'],
      ['Company', company],
      // ⚠️ NAME AND CODE, NOT EITHER ALONE. A verifier needs the name to read it and the code to find
      // the published row; the code alone means consulting the EXIOBASE classification. On a miss
      // industryName returns the code itself, and that is written once rather than as "i99 (i99)".
      ['Sector', sectorLabel(sector)],
      ['Reporting year', reportingYear],
      ['Total Scope 3', `${totalScope3.toFixed(2)} mt CO2e`],
      ...(unpricedCats.length > 0
        ? [['Excluded from total', `${unpricedCats.map(c => `Cat ${c.num} ${c.name}: ${unpricedReason(c.id)}`).join(' ')} Left out of the total rather than counted as zero.`]]
        : []),
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['SCOPE 3 BY CATEGORY'],
      ['Category', 'Name', 'mt CO2e', 'Method', 'Confidence', 'Included'],
      ...CATEGORIES.map(c => [
        `Cat ${c.num}`,
        c.name,
        catData[c.id]?.included ? (unpricedCatIds.has(c.id) ? 'not priced' : getCatEmissions(c.id).toFixed(2)) : '—',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : 'Excluded',
        catData[c.id]?.included ? confidenceConfig[getConfidence(c.id)].label : '—',
        catData[c.id]?.included ? 'Yes' : `No — ${catData[c.id]?.excluded_reason || 'not material'}`,
      ]),
      ...(() => {
        const basis = estimateBasisRows()
        return basis.length > 0 ? [[], ['ESTIMATE BASIS'], ['Category', 'Item', 'Value', 'Note'], ...basis] : []
      })(),
      [],
      ['METHODOLOGY NOTE'],
      // One row per INCLUDED category, from categoryBasis. It was a single sentence claiming
      // "DEFRA/Exiobase" for everything, which was false for every category and could not tell a reader
      // which of their figures rested on what.
      ['Category', 'Name', 'Basis', 'Detail'],
      ...CATEGORIES.filter(c => catData[c.id]?.included).map(c => {
        const b = categoryBasis(c.id)
        return [`Cat ${c.num}`, c.name, b.basis, b.detail]
      }),
      [],
      ['Generated by ThemisIQ · www.themisiq.co · GHG Protocol Scope 3 Standard'],
    ]
    // ⚠️ CELLS ARE NOW QUOTED. The reasons above are the route's own sentences and contain commas, and
    // this used to join raw values with ',' — so one reason would have spilled across several columns.
    // RFC 4180: wrap any cell holding a comma, quote or newline in quotes, and double embedded quotes.
    const csvCell = (v: unknown): string => {
      const t = String(v ?? '')
      return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const csv = rows.map(r => r.map(csvCell).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company}_Scope3_${reportingYear}.csv`
    a.click()
  }

  // ─── Country typeahead: matching, selection and keyboard ────────────────────
  //
  // Results are derived from the QUERY ALONE, not from countryOpen. Deriving them from the open
  // flag as well would make ArrowDown a two-step action, because the option it wants to focus
  // would not exist until after the render that opens the list.
  const countryResults = countryQuery.trim() === '' ? [] : matchCountries(countryQuery, 8)
  const countryListVisible = countryOpen && countryQuery.trim() !== ''

  const countryInputRef = useRef<HTMLInputElement | null>(null)
  const countryOptionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const closeCountryList = () => { setCountryOpen(false); setCountryFocusIdx(-1); setCountryHoverIdx(-1) }

  const selectCountry = (iso2: string, displayName: string) => {
    setCountryIso2(iso2)
    setCountryQuery(displayName)
    closeCountryList()
    countryInputRef.current?.focus()   // focus must come back, or the keyboard user is stranded
  }

  const clearCountry = () => {
    setCountryIso2('')
    setCountryQuery('')
    closeCountryList()
    countryInputRef.current?.focus()
  }

  const onCountryInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); closeCountryList(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      // Already open: step into the list. Closed: reopen it, and a second ArrowDown enters.
      if (countryListVisible) countryOptionRefs.current[0]?.focus()
      else setCountryOpen(true)
      return
    }
    if (e.key === 'Enter' && countryListVisible && countryResults.length > 0) {
      // Enter from the input takes the top result, the ordinary typeahead shortcut. preventDefault
      // because Enter in a text input is otherwise a submit gesture.
      e.preventDefault()
      selectCountry(countryResults[0].iso2, countryResults[0].display_name)
    }
  }

  const onCountryOptionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      countryOptionRefs.current[Math.min(i + 1, countryResults.length - 1)]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      // Off the top of the list goes back to the input, not nowhere.
      if (i === 0) countryInputRef.current?.focus()
      else countryOptionRefs.current[i - 1]?.focus()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeCountryList()
      countryInputRef.current?.focus()
    }
    // Enter and Space need no handler: these are real <button>s and fire click natively.
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
            <IndustryOptions />
          </select>
        </div>
        <div>
          <label style={labelStyle}>Reporting year</label>
          <select style={boundInventoryId ? { ...inputStyle, background: '#f8f7f5', color: 'var(--color-ink-muted)', cursor: 'not-allowed' } : inputStyle} value={reportingYear} onChange={e => setReportingYear(Number(e.target.value))} disabled={!!boundInventoryId}>
            {reportingYearOptions(new Date(), YEAR_FLOOR).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Currency</label>
          <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div
          style={{ gridColumn: '1 / -1', position: 'relative' }}
          // ONE focusout handler for the whole control, rather than onBlur on the input.
          // relatedTarget is the element about to receive focus: if it is still inside this box the
          // user is moving between the input and a result, so the list must stay open. Closing on
          // the input's own blur would destroy the option before the user could reach it.
          onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeCountryList() }}
        >
          <label style={labelStyle} htmlFor="s3-country-input">Primary country of supply</label>
          <input
            id="s3-country-input"
            ref={countryInputRef}
            style={inputStyle}
            value={countryQuery}
            onChange={e => { setCountryQuery(e.target.value); setCountryOpen(true); if (countryIso2) setCountryIso2('') }}
            onFocus={() => { if (countryQuery.trim() !== '' && !countryIso2) setCountryOpen(true) }}
            onKeyDown={onCountryInputKeyDown}
            placeholder="Start typing a country"
            autoComplete="off"
            aria-describedby="s3-country-hint"
            aria-expanded={countryListVisible}
            aria-controls="s3-country-results"
          />
          <div id="s3-country-hint" style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginTop: 6 }}>
            The country whose production the estimate should represent — usually where your main suppliers are, not where your company is.
          </div>

          {/* Announced on every change. Sighted users read the count off the list; a screen reader
              otherwise hears nothing when results appear or disappear. */}
          <div aria-live="polite" style={srOnly}>
            {countryListVisible ? (countryResults.length === 0 ? 'No countries match' : `${countryResults.length} ${countryResults.length === 1 ? 'country' : 'countries'} found`) : ''}
          </div>

          {countryListVisible && (
            <div
              id="s3-country-results"
              aria-label="Country results"
              style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, marginTop: 4, background: '#fff', border: '1px solid #e8e7e4', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', overflow: 'hidden' }}
            >
              {countryResults.length === 0 ? (
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>No countries match “{countryQuery}” — try a different spelling</div>
              ) : countryResults.map((c, i) => {
                const lit = countryFocusIdx === i || countryHoverIdx === i
                return (
                  <button
                    key={c.iso2}
                    type="button"
                    ref={el => { countryOptionRefs.current[i] = el }}
                    // Keeps focus in the input while the mouse is used, so the focusout handler
                    // above never fires mid-click. Safari does not focus a button on mousedown, so
                    // without this the list would unmount before click and the selection would be
                    // lost on that browser alone.
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => selectCountry(c.iso2, c.display_name)}
                    onKeyDown={e => onCountryOptionKeyDown(e, i)}
                    onFocus={() => setCountryFocusIdx(i)}
                    onBlur={() => setCountryFocusIdx(idx => (idx === i ? -1 : idx))}
                    onMouseEnter={() => setCountryHoverIdx(i)}
                    onMouseLeave={() => setCountryHoverIdx(idx => (idx === i ? -1 : idx))}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                      padding: '9px 12px', fontSize: 13, color: '#0d0d0d', fontFamily: 'inherit',
                      background: lit ? 'var(--color-brand-wash)' : '#fff',
                      // Inline styles cannot express :focus-visible, so the ring is driven by the
                      // focus handler above. It is an outline rather than a border so the row does
                      // not shift by a pixel when it gains focus.
                      outline: countryFocusIdx === i ? '2px solid var(--color-brand)' : 'none',
                      outlineOffset: -2,
                    }}
                  >
                    {c.display_name}
                    <span style={{ color: 'var(--color-ink-muted)', marginLeft: 6 }}>{c.iso2}</span>
                  </button>
                )
              })}
            </div>
          )}

          {(() => {
            if (!countryIso2) return null
            const picked = countryByIso2(countryIso2)
            if (!picked) {
              // A stored code the concordance no longer carries. Say so; do not guess a region.
              return (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-module-climate)' }}>
                  <span>⚠ {countryIso2} — not in the country list; no region resolved</span>
                  <button type="button" onClick={clearCountry} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer' }}>Clear</button>
                </div>
              )
            }
            // ⚠️ THE TEST IS region_code === iso2, NOT basis. See the note in the report: `basis`
            // records how the country NAME was resolved from the source, not how good the region
            // is. Russia and Turkey are both 'manual-resolution' (the source spelled them with
            // their pre-rename names) and both ARE among the 44 countries EXIOBASE resolves
            // individually, so keying on basis would tell a customer their Russian supply was a
            // regional average when it is a country-specific factor.
            const named = picked.region_code === picked.iso2
            const bucket = regionName(picked.region_code)
            return (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#555553' }}>
                <span>
                  ✓ {named
                    ? `${picked.display_name} — country-specific factor`
                    : `${picked.display_name} — ${bucket} (regional average)`}
                </span>
                <button type="button" onClick={clearCountry} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer' }}>Clear</button>
              </div>
            )
          })()}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Annual revenue ({currency})</label>
          <input style={inputStyle} type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))} placeholder="0" />
        </div>
      </div>
      <div style={{ marginTop: 20, background: 'var(--color-brand-wash)', border: '0.5px solid color-mix(in srgb, var(--color-brand) 20%, transparent)', borderRadius: 10, padding: '1rem' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-brand)', marginBottom: 4 }}>GHG Protocol Scope 3 Standard</div>
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>ThemisIQ follows the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard. You must report all material categories and explain exclusions.</div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Materiality screening</h2>
      {/* Reworded along with the name: "material for a {sector}" read as an article before the retired
          vocabulary ("for a Technology"), and reads as nonsense before an EXIOBASE name. */}
      <p style={sectionSub}>ThemisIQ has identified the Scope 3 categories likely to be material for {sector ? <>your sector, <strong style={{ fontWeight: 600 }}>{industryName(sector)}</strong>,</> : 'your company'} based on GHG Protocol guidance. Review and confirm.</p>
      <div style={{ background: 'var(--color-brand-wash)', border: '0.5px solid color-mix(in srgb, var(--color-brand) 20%, transparent)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: 16, fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
        These are suggestions, not limits — <strong>click any category to add or remove it</strong>. Under the GHG Protocol you may include any category you judge material, and you must briefly justify any you exclude. Tap a category in the Calculate step for what it means and where to find the data.
      </div>

      {!sector ? (
        <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>Select your sector in Step 1 first.</div>
      ) : (
        <>
          <button onClick={autoDetect} style={{ fontSize: 12, fontWeight: 500, padding: '8px 16px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', border: 'none', cursor: 'pointer', marginBottom: 20 }}>
            ⚡ Auto-detect material categories for {industryName(sector)}
          </button>

          {['Upstream', 'Downstream'].map(stream => (
            <div key={stream} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10 }}>{stream}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.filter(c => c.stream === stream).map(cat => {
                  const included = catData[cat.id]?.included ?? materialCats.includes(cat.num)
                  const isMaterial = (SECTOR_MATERIAL[sector] || []).includes(cat.num)
                  return (
                    <div key={cat.id} onClick={() => toggleCat(cat.num)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1.5px solid ${included ? 'var(--color-brand)' : '#e8e7e4'}`, borderRadius: 10, cursor: 'pointer', background: included ? 'var(--color-brand-wash)' : '#f8f7f5', transition: 'all 0.15s' }}>
                      <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${included ? 'var(--color-brand)' : '#e8e7e4'}`, background: included ? 'var(--color-brand)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {included && <span style={{ color: '#fff', fontSize: 9, fontWeight: 700 }}>✓</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', minWidth: 40 }}>Cat {cat.num}</span>
                          <span style={{ fontSize: 13, fontWeight: included ? 600 : 400, color: included ? 'var(--color-brand)' : '#0d0d0d' }}>{cat.name}</span>
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
                <div style={{ background: 'var(--color-sunken)', color: 'var(--color-ink)', borderBottom: '2px solid var(--color-ink)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', marginRight: 10 }}>Cat {cat.num}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
                  </div>
                  {cat.id === 'cat1' && cat1SpendPending ? (
                    // In flight or debouncing: no figure at all, rather than the last one.
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)' }}>pricing…</span>
                  ) : unpricedCatIds.has(cat.id) ? (
                    // Cat 1 can now be unpriced for reasons other than the sector (no country, no active
                    // edition, a failed request), so its badge does not name one. The panel below does.
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-module-climate)' }}>{cat.id === 'cat1' ? 'not priced' : 'no factor yet'}</span>
                  ) : getCatEmissions(cat.id) > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-module-ghg)' }}>{getCatEmissions(cat.id).toFixed(2)} mt CO₂e</span>
                  )}
                </div>
                {(cat as any).guidance && (
                  <div style={{ borderBottom: '0.5px solid #e8e7e4' }}>
                    <button onClick={() => setOpenInfo(p => ({ ...p, [cat.id]: !p[cat.id] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 16px', background: '#fafafa', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand)', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 15, height: 15, borderRadius: '50%', border: '1px solid var(--color-brand)', fontSize: 9, fontWeight: 700 }}>i</span> What this is &amp; where to find the data</span>
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
                          <button key={String(opt.val)} onClick={() => updateCat('cat1', 'has_supplier_data', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, ...(catData['cat1']?.has_supplier_data === opt.val ? toggleOn : toggleOff), cursor: 'pointer' }}>{opt.label}</button>
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
                          <option value="">Select sector</option>
                          <IndustryOptions />
                        </select>
                      </div>
                      {/* FULL PANEL WIDTH, below both controls. This used to sit inside the sector
                          column, about 130px wide, where every sentence wrapped to three or four words. */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        {!cat1SpendInputsComplete ? (
                          // Say which input is missing; that much is checkable. No notice about factors,
                          // because nothing has been asked yet.
                          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginTop: 8 }}>
                            To estimate from spend, enter: {cat1MissingInputs.join(', ')}.
                          </div>
                        ) : cat1SpendPending ? (
                          <div role="status" style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 8 }}>Pricing this spend…</div>
                        ) : cat1SpendCurrent?.kind === 'error' ? (
                          <NoFactorNotice what="Purchased goods & services" title="⚠ This spend could not be priced" detail={cat1SpendCurrent.message} />
                        ) : cat1SpendCurrent?.line.outcome === 'absent' ? (
                          <NoFactorNotice what="Purchased goods & services" title="⚠ This spend cannot be estimated" detail={cat1SpendCurrent.line.explanation} />
                        ) : cat1SpendCurrent?.line.outcome === 'no_factor' ? (
                          <NoFactorNotice what="Purchased goods & services" title="⚠ This spend cannot be estimated" detail={cat1SpendCurrent.line.notice} />
                        ) : cat1SpendPriced && cat1SpendCurrent?.kind === 'done' ? (
                          <SpendFactorWorkings
                            id="cat1-spend"
                            figureMt={cat1SpendPriced.emissions_mt}
                            // Figure and method only. Region by name, from regionNames.ts — the same words
                            // the route's sentences below use.
                            // A missing dataset or version is omitted, not replaced with a placeholder.
                            summary={`spend-based estimate from the ${[cat1SpendPriced.source.dataset, cat1SpendPriced.source.version && `v${cat1SpendPriced.source.version}`].filter(Boolean).join(' ')} factor for ${regionName(cat1SpendPriced.used_region)}`.replace('from the  factor', 'from the factor')}
                            // See cat1SpendSentences: shared with the CSV, verbatim, de-duplicated.
                            sentences={cat1SpendSentences}
                          />
                        ) : null}
                      </div>
                    </>}
                    <div style={{ gridColumn: '1 / -1', background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--color-brand)', marginBottom: 6 }}>Pull from Supplier Portal</div>
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginBottom: 10 }}>Bring in primary Cat 1 data you collected from suppliers. Supplier-allocated emissions are used directly; suppliers without an allocated figure are estimated from the spend you recorded (sector default). You review the full breakdown before it is applied.</div>
                      {campaignsError === null ? (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Loading your supplier campaigns…</div>
                      ) : campaignsError ? (
                        <div role="alert" style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>{campaignsError}</div>
                      ) : campaigns.length === 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>No supplier campaigns found. <a href="/dashboard/supply-chain/portal" style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>Create one in the Supplier Portal →</a></div>
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
                          <button onClick={() => useCatOneFigure(catOneResult.total_mt)} style={{ ...btnPrimary, fontSize: 12, padding: '8px 16px' }}>
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

                  {/* Cat 5 — Waste: one row per material and treatment route, priced from the DEFRA/DESNZ 2026
                      Waste disposal sheet. Selects are built from lib/emissionFactors/defraWaste.ts, so a
                      material is only ever offered the routes the sheet publishes for it. */}
                  {cat.id === 'cat5' && <>
                    {/* Old saved data, first: it is the customer's own entry, and it is not in the figure. */}
                    {cat5LegacyNotice && (
                      <div style={{ gridColumn: '1 / -1', background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-module-climate)', marginBottom: 4 }}>⚠ Saved waste figures not priced: {cat5LegacyNotice.tonnages}</div>
                        <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{cat5LegacyNotice.sentences.join(' ')}</div>
                      </div>
                    )}
                    {/* ⚠️ ABOVE THE ROWS, NOT ONLY IN THE WORKINGS. A row priced at 520.58 kg per tonne to
                        landfill beside one at 4.65 to combustion reads as a comparison of the two routes,
                        and the workbook says these factors cannot make it. Both sentences are the
                        artefact's own, verbatim but for the list marker. */}
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Before comparing treatment routes</div>
                      <p style={{ margin: '0 0 6px' }}>{withoutListMarker(DEFRA_WASTE_META.lifecycle_guidance)}</p>
                      <p style={{ margin: 0 }}>{withoutListMarker(DEFRA_WASTE_META.scope_guidance)}</p>
                      {/* This box quotes the workbook whether or not any row is priced, so it carries the
                          required attribution itself rather than relying on the workings card below. */}
                      <p style={{ margin: '6px 0 0', fontSize: 10 }}>
                        {DEFRA_WASTE_META.attribution_required}{' '}
                        <a href={DEFRA_WASTE_META.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{DEFRA_WASTE_META.licence}</a>
                      </p>
                    </div>

                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {wasteRows().length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
                          No waste streams yet. Add one for each material and treatment route on your waste contractor&apos;s report.
                        </div>
                      )}
                      {cat5Evaluated.map(({ row, n, pricing }) => {
                        const hasMaterial = !!row.activity && !!row.waste_type
                        const routes = hasMaterial ? wasteRoutesFor(row.activity, row.waste_type) : []
                        const materialKey = hasMaterial && WASTE_MATERIAL_GROUPS.some(g => g.activity === row.activity && g.materials.includes(row.waste_type))
                          ? wasteMaterialKey(row.activity, row.waste_type) : ''
                        const fieldId = (f: string) => `cat5-${row.id}-${f}`
                        return (
                          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Waste stream {n}</span>
                              <button type="button" aria-label={`Remove waste stream ${n}`} onClick={() => removeWasteRow(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label htmlFor={fieldId('material')} style={labelStyle}>Waste type</label>
                              <select id={fieldId('material')} style={inputStyle} value={materialKey} onChange={e => setWasteMaterial(row.id, e.target.value)}>
                                <option value="">Select waste type</option>
                                {WASTE_MATERIAL_GROUPS.map(g => (
                                  <optgroup key={g.activity} label={g.activity}>
                                    {g.materials.map(mat => <option key={mat} value={wasteMaterialKey(g.activity, mat)}>{mat}</option>)}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={fieldId('route')} style={labelStyle}>Treatment route</label>
                              {/* Only the routes this material publishes. Disabled until a material is chosen,
                                  because until then there is no list that would be true. */}
                              <select id={fieldId('route')} style={inputStyle} disabled={!hasMaterial} value={routes.includes(row.route) ? row.route : ''} onChange={e => updateWasteRow(row.id, { route: e.target.value })}>
                                <option value="">{hasMaterial ? 'Select route' : 'Choose a waste type first'}</option>
                                {routes.map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={fieldId('tonnes')} style={labelStyle}>Tonnes</label>
                              <input id={fieldId('tonnes')} style={inputStyle} type="number" min={0} value={row.tonnes || ''} onChange={e => updateWasteRow(row.id, { tonnes: Number(e.target.value) })} placeholder="0" />
                            </div>
                            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
                              {pricing.status === 'priced' ? (
                                <span style={{ color: '#555553' }}>
                                  {row.tonnes} t × {pricing.factor_kg_per_tonne} kg CO₂e per t = <strong style={{ fontWeight: 600 }}>{pricing.kg_co2e.toLocaleString('en', { maximumFractionDigits: 2 })} kg CO₂e</strong> · {WASTE_METHOD_LABEL[pricing.method]}
                                </span>
                              ) : pricing.status === 'no_factor' ? (
                                <span style={{ color: '#92400e' }}>⚠ Not counted: {wasteRowNotPricedReason(row, pricing)}. Choose the waste type and route again.</span>
                              ) : (
                                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {pricing.missing.join(', ')}.</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      <button type="button" onClick={addWasteRow} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add waste stream</button>
                    </div>

                    {cat5Priced.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <SpendFactorWorkings
                          id="cat5-waste"
                          figureMt={calcCat5()}
                          summary={`${cat5Priced.length} waste ${cat5Priced.length === 1 ? 'stream' : 'streams'} priced from the DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste disposal factors`}
                          sentences={cat5Sentences}
                        />
                      </div>
                    )}
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
                        <option value="">Select sector</option>
                        <IndustryOptions />
                      </select>
                      {unpricedCatIds.has('cat15') && <NoFactorNotice what="Financed emissions" />}
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
                            <button key={opt.mode} onClick={() => updateCat('cat15', 'pcafMode', opt.mode)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, ...(active ? toggleOn : toggleOff), cursor: 'pointer' }}>{opt.label}</button>
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
                              <button onClick={() => removePcafAsset(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={labelStyle}>Asset class</label>
                              <select style={inputStyle} value={row.assetClass} onChange={e => updatePcafAsset(row.id, { assetClass: e.target.value as PcafAssetClass })}>
                                {PCAF_ASSET_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={labelStyle}>Outstanding amount ({currency})</label>
                              <input style={inputStyle} type="number" value={row.outstandingAmount || ''} onChange={e => updatePcafAsset(row.id, { outstandingAmount: Number(e.target.value) })} placeholder="0" />
                            </div>
                            <div>
                              {/* Correctness-critical: denominator label tracks the selected asset class */}
                              <label style={labelStyle}>{meta.denominatorLabel} ({currency})</label>
                              <input style={inputStyle} type="number" value={row.denominator || ''} onChange={e => updatePcafAsset(row.id, { denominator: Number(e.target.value) })} placeholder="0" />
                            </div>
                            <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--color-ink-muted)', lineHeight: 1.5 }}>Enter the investee&apos;s reported emissions where available (best data quality). Otherwise provide revenue + sector for an estimate.</div>
                            <div>
                              <label style={labelStyle}>Investee emissions (tCO₂e)</label>
                              <input style={inputStyle} type="number" value={row.emissions.reportedEmissions ?? ''} onChange={e => updatePcafEmissions(row.id, { reportedEmissions: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Reported" />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555553', marginTop: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={row.emissions.verified ?? false} onChange={e => updatePcafEmissions(row.id, { verified: e.target.checked })} />
                                Third-party verified
                              </label>
                            </div>
                            <div>
                              <label style={labelStyle}>or Investee revenue ({currency})</label>
                              <input style={inputStyle} type="number" value={row.emissions.revenue ?? ''} onChange={e => updatePcafEmissions(row.id, { revenue: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="For estimate" />
                              <select style={{ ...inputStyle, marginTop: 6 }} value={row.emissions.sector ?? ''} onChange={e => updatePcafEmissions(row.id, { sector: e.target.value === '' ? undefined : e.target.value })}>
                                <option value="">Sector for estimate…</option>
                                <IndustryOptions />
                              </select>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {(() => {
                                // ⚠️ GATED HERE RATHER THAN IN lib/pcaf. estimateEmissions falls back
                                // to LEGACY_SPEND_FALLBACK (0.12) on an unknown sector key, so an
                                // EXIOBASE code would produce a confident financed-emissions figure
                                // from a constant nobody chose for this asset. The library is left
                                // alone — it is tested and has other callers — and the page refuses
                                // to ask it a question it cannot answer honestly.
                                if (row.emissions.revenue != null && !sectorPriced(row.emissions.sector)) {
                                  return <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>No spend factor for this sector yet, so a revenue-based estimate is not shown. Enter known emissions for this holding instead. It is not counted as zero.</div>
                                }
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
                      <button onClick={addPcafAsset} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add holding</button>
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
    // Copied before sorting: categoriesInTotal is shared with the Export count, and sort() mutates.
    const activeCats = [...categoriesInTotal]
      .sort((a, b) => getCatEmissions(b.id) - getCatEmissions(a.id))
    const highCount = activeCats.filter(c => getConfidence(c.id) === 'high').length
    const medCount = activeCats.filter(c => getConfidence(c.id) === 'medium').length
    const lowCount = activeCats.filter(c => getConfidence(c.id) === 'low').length

    if (entLoading) return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your total Scope 3 inventory across all material categories — GHG Protocol aligned.</p>
        <div className="tq-band" style={{ borderRadius: 16, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: 13 }}>
          Scope 3 results...
        </div>
      </div>
    )

    return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your total Scope 3 inventory across all material categories — GHG Protocol aligned.</p>

        <div style={{ position: 'relative' }}>
          <div style={!isPaid ? { filter: 'blur(7px)', pointerEvents: 'none', userSelect: 'none' } : undefined}>

        {/* Total */}
        <div className="tq-summary" data-module="ghg" style={{ marginBottom: 20 }}>
          {/* .tq-summary is itself a flex ROW, so the amber box cannot simply become its second child
              — it would sit beside .tq-summary-body instead of inside it. This column wrapper stacks
              the body and the box vertically while .tq-summary keeps its border and left rule round
              both. minWidth 0 lets it shrink with the panel rather than holding its content width. */}
          <div style={{ flex: 1, minWidth: 0 }}>
          <div className="tq-summary-body">
          <div style={{ flex: 1 }}>
            <div className="tq-summary-label">Data quality</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {highCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E1F5EE', color: '#0F6E56', fontWeight: 600 }}>{highCount} primary data</span>}
              {medCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#E6F1FB', color: '#0C447C', fontWeight: 600 }}>{medCount} activity data</span>}
              {lowCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#FEF3E2', color: 'var(--color-module-climate)', fontWeight: 600 }}>{lowCount} spend-based</span>}
            </div>
            <div className="tq-summary-sub">{company} · {reportingYear} · GHG Protocol Scope 3 Standard</div>
          </div>
          {/* The figure moves to the right, which is where .tq-summary-figure puts it. Its colour
              is var(--tq-mod) from the class — it was '#64fe3e', a retired-gradient lime that
              measured 14.61:1 on the black panel and 1.33:1 on a white one. */}
          <div className="tq-summary-figure">{totalScope3.toFixed(1)}<small>mt CO₂e total Scope 3</small></div>
          </div>
          {/* Below the body, not inside it. It was a third flex column beside the figure, which
              squeezed the Data quality column down to its longest word. The side margins match
              .tq-summary-body's 24px padding so the box lines up with the content above it; the
              body's own 20px bottom padding now provides the gap marginTop used to. */}
          {unpricedCats.length > 0 && (
            <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', margin: '0 24px 20px', textAlign: 'left' as const }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-module-climate)', marginBottom: 4 }}>
                ⚠ This total excludes {unpricedCats.length} categor{unpricedCats.length === 1 ? 'y' : 'ies'} that {unpricedCats.length === 1 ? 'was' : 'were'} not priced
              </div>
              {/* One line per category, each with its OWN observed reason. See unpricedReason. */}
              {unpricedCats.map(c => (
                <div key={c.id} style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 2 }}>
                  <strong style={{ fontWeight: 600 }}>Cat {c.num} {c.name}:</strong> {unpricedReason(c.id)}
                </div>
              ))}
              <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 4 }}>
                They are left out rather than counted as zero. Enter a known figure for a category to include it.
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Category breakdown */}
        <div style={{ border: '0.5px solid #e8e7e4', borderRadius: 12, overflow: 'hidden' }}>
          {/* Column widths, measured against SF Pro (the -apple-system face this page sets) at opsz 17:
                #          32px  "15" at 11px/700 is ~14px
                Category   1fr   ~98px at the 900px layout; longest unbreakable word "transportation" is 89.5px
                mt CO₂e    88px  "1250000.00" at 13px/600 is 79.3px
                % of total 84px  header "% OF TOTAL" at 10px/700 +0.06em is 69.7px
                Method     96px  widest pill "Spend-based" is 60.7px + 12px padding at 9px, and 93px even if
                                 a minimum-font-size setting renders it at 12px
              plus an 8px column gap. A 12px gap would push Category below 89.5px and break
              "transportation" mid-word, so the gap is 8. Header and rows must stay identical. */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 88px 84px 96px', columnGap: 8, background: '#f8f7f5', padding: '10px 16px', borderBottom: '0.5px solid #e8e7e4' }}>
            {['#', 'Category', 'mt CO₂e', '% of total', 'Method'].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</div>
            ))}
          </div>
          {activeCats.map((cat, i) => {
            const unpriced = unpricedCatIds.has(cat.id)
            const emissions = unpriced ? 0 : getCatEmissions(cat.id)
            const pct = !unpriced && totalScope3 > 0 ? ((emissions / totalScope3) * 100).toFixed(1) : '0'
            const conf = getConfidence(cat.id)
            const ccfg = confidenceConfig[conf]
            return (
              <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 88px 84px 96px', columnGap: 8, padding: '12px 16px', borderBottom: i < activeCats.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center', background: i === 0 ? '#fafafa' : '#fff' }}>
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
                  {/* nowrap is what guarantees one line; the 96px column is what stops one line overflowing.
                      inline-block so the vertical padding takes up space instead of overlapping. */}
                  <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: ccfg.bg, color: ccfg.color }}>{ccfg.label}</span>
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

      <div className="tq-summary" data-module="ghg" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1, padding: '20px 24px' }}>
        <div className="tq-summary-label" style={{ marginBottom: 12 }}>Inventory summary — {company || 'Your company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {/* Read left to right as an explanation: how many categories the inventory covers, how many
              of those made it into the figure, then the figure — so "3 / 1 / 13.9 mt (partial)" says
              why the total is partial before the reader has to ask.
              'Standard: GHG Protocol' was dropped to keep four columns. It is the one figure here that
              says nothing about THIS inventory, and the same screen already states it twice: the
              subtitle directly above this tile and the banner at the top of every step. */}
          {[
            { label: 'Categories in scope', val: categoriesInScope.length },
            { label: 'Categories in total', val: categoriesInTotal.length },
            { label: 'Total Scope 3', val: totalScope3Label },
            { label: 'Reporting year', val: reportingYear },
          ].map(({ label, val }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: typeof val === 'number' ? '1.4rem' : '0.9rem', fontFamily: typeof val === 'number' ? 'var(--font-display)' : 'inherit', fontWeight: typeof val === 'number' ? 400 : 600, color: 'var(--color-ink)', lineHeight: 1.2 }}>{val}</div>
            </div>
          ))}
        </div>
        </div>
      </div>

      {entLoading ? (
        <div className="tq-band" style={{ borderRadius: 14, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: 13 }}>
          Scope 3 inventory...
        </div>
      ) : isPaid ? (
        <div>
          <div style={{ background: '#fff', border: '1px solid #e8e7e4', borderRadius: 10, padding: '1rem', marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={dataConfirmed} onChange={e => setDataConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>I confirm that the data entered is accurate to the best of my knowledge. I understand that spend-based estimates carry inherent uncertainty and should be disclosed as such in external reports.</span>
            </label>
          </div>
          <button onClick={() => dataConfirmed && !cat1SpendPending && saveScope3()} disabled={!dataConfirmed || !boundInventoryId || saving || cat1SpendPending} style={{ ...((dataConfirmed && boundInventoryId && !saving && !cat1SpendPending) ? btnStepPrimary : btnStepPrimaryDisabled), marginRight: 12 }}>
            {saving ? 'Saving…' : cat1SpendPending ? 'Waiting for the Cat 1 estimate…' : showSaved ? '✓ Saved to your inventory' : 'Save Scope 3 to inventory'}
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
              <div className="tq-summary" data-module="ghg" style={{ marginBottom: 12 }}>
                <div style={{ flex: 1, padding: '20px 24px' }}>
                <div className="tq-summary-label" style={{ marginBottom: 12 }}>Live summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Company', val: company || '—' },
                    // EXIOBASE's published name, never the stored code: 'i17' is our vocabulary, not the
                    // customer's. industryName falls through to the code on a miss rather than blanking.
                    { label: 'Sector', val: sector ? industryName(sector) : '—' },
                    // Same two labels, same two sets and same order as the Export tile, so a reader moving
                    // between steps is never comparing different counts under one word. Two rows rather
                    // than one because this sidebar also shows on Materiality and Calculate, where "in
                    // scope" is the live number and "in total" is still 0 until data is entered.
                    { label: 'Categories in scope', val: categoriesInScope.length },
                    { label: 'Categories in total', val: categoriesInTotal.length },
                    { label: 'Total Scope 3', val: totalScope3 > 0 ? totalScope3Label : '—' },
                  ].map(({ label, val }) => (
                    // Baseline-aligned and right-aligned, with the label unable to shrink: a sector name
                    // runs to 132 characters and wraps in this 260px column, and a centred label beside
                    // a four-line value reads as belonging to its middle line.
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-ink-muted)', flexShrink: 0 }}>{label}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-ink)', fontWeight: 500, textAlign: 'right', lineHeight: 1.4 }}>{val}</span>
                    </div>
                  ))}
                </div>
                </div>
              </div>
              <div style={{ background: '#E1F5EE', border: '0.5px solid rgba(15,110,86,0.2)', borderRadius: 10, padding: '0.75rem', marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}><strong>GHG Protocol Scope 3 Standard</strong><br />All 15 categories · Spend-based + activity-based + primary data</div>
              </div>
              <div style={{ background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#555553', lineHeight: 1.6 }}>Need supplier emissions data? <a href="/dashboard/supply-chain/portal" style={{ color: 'var(--color-brand)', textDecoration: 'none', fontWeight: 600 }}>Use the Supplier Portal →</a></div>
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
