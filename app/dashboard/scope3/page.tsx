'use client'

import { useState, useEffect, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlementState } from '../../../lib/useEntitlement'
import { EMISSION_FACTORS, GENERIC_SPEND_FACTOR } from '../../../lib/emissionFactors'
import { SPEND_EF_SOURCES } from '../../../lib/emissionFactors/spend'
import { scope3MethodFor, scope3MethodDescription, provenanceGap, takesEnteredFigure } from '../../../lib/scope3/categoryMethods'
import { scope3Status, relevanceFromStored, coverageEntry, type Relevance, type Scope3Status, type Scope3CoverageEntry } from '../../../lib/scope3/categoryStatus'
// ⚠️ assessAsset ONLY. resolvePcafResult is no longer imported: it existed to choose between the
// decomposed assessment and the lumped spend proxy, and it answered with the proxy whenever any holding
// was incomplete. lib/scope3/cat15.ts makes that choice explicitly, and there is no proxy to choose.
import { assessAsset } from '../../../lib/pcaf/engine'
import { INDUSTRY_OPTION_GROUPS, industryName } from '../../../lib/emissionFactors/industryOptions'
import { PRODUCT_OPTION_GROUPS, productName } from '../../../lib/emissionFactors/productOptions'
import { inScopeFor, scopeNote, outOfScopeDisclosure, CATEGORY_SCOPE_LABEL, type SpendCategoryId } from '../../../lib/scope3/categoryScope'
import { spendSector } from '../../../lib/scope3/spendSector'
import {
  cat15Figure, holdingComputes, assessableEmissions, CAT15_ASSESSMENT_FAILED, type Cat15Figure,
  CAT15_GUIDANCE, CAT15_PANEL_METHOD, CAT15_PANEL_NO_PROXY, CAT15_RECORDED_NOT_USED,
  cat15DecomposedBasisDetail, cat15GwpSentence,
} from '../../../lib/scope3/cat15'
import { matchCountries, countryByIso2 } from '../../../lib/emissionFactors/countryOptions'
import { regionName, regionLabel, countryLabel } from '../../../lib/emissionFactors/regionNames'
import {
  DEFRA_WASTE_META, WASTE_MATERIAL_GROUPS, WASTE_METHOD_LABEL, wasteRoutesFor, wasteMaterialKey, parseWasteMaterialKey,
  wasteMethodFor, withoutListMarker,
} from '../../../lib/emissionFactors/defraWaste'
import { evaluateWasteRows, wasteRowNotPricedReason, type WasteRow, type EvaluatedWasteRow } from '../../../lib/scope3/wasteRows'
import { evaluateEolMaterials, eolMaterialNotPricedReason, formatShare, type EolMaterial, type EvaluatedEolMaterial } from '../../../lib/scope3/endOfLife'
import { rowPricedResult } from '../../../lib/scope3/rowPriced'
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
  { id: 'cat1', num: 1, name: 'Purchased goods & services', stream: 'Upstream', desc: 'Emissions from producing goods and services you purchase', method: 'spend', unit: 'spend', typicalShare: 0.60 , guidance: 'Emissions from producing everything you buy — raw materials, components, products and services — up to the point they reach you (cradle-to-gate). Usually the single largest Scope 3 category.', dataSource: 'Procurement / AP ledger: annual spend by supplier or category. Best: supplier-specific emissions via the Supplier Portal. Spend-based estimation is permitted for this category.' },
  { id: 'cat2', num: 2, name: 'Capital goods', stream: 'Upstream', desc: 'Emissions from producing capital equipment and assets you buy', method: 'spend', unit: 'spend', typicalShare: 0.05 , guidance: 'Emissions from producing long-life assets you purchase — buildings, machinery, vehicles, IT equipment, infrastructure. Count the full cradle-to-gate footprint in the year acquired (not depreciated over time).', dataSource: 'Fixed-asset register / capital expenditure records for the reporting year. Spend-based estimation is permitted for this category.' },
  { id: 'cat3', num: 3, name: 'Fuel & energy related', stream: 'Upstream', desc: 'Upstream emissions from extraction and production of fuels and energy you use', method: 'activity', unit: 'kwh', typicalShare: 0.03 , guidance: 'Upstream emissions of the fuel and electricity you use that AREN\'T already in Scope 1 or 2 — i.e. extracting, producing and transporting those fuels, plus grid transmission & distribution (T&D) losses.', dataSource: 'Your Scope 1 & 2 energy consumption data (kWh, fuel volumes) — apply well-to-tank and T&D-loss factors. Source the consumption from utility bills / the GHG module.' },
  { id: 'cat4', num: 4, name: 'Upstream transportation', stream: 'Upstream', desc: 'Emissions from transporting purchased goods to your facilities', method: 'activity', unit: 'tonne_km', typicalShare: 0.04 , guidance: 'Emissions from transporting and distributing the goods you BUY, between your suppliers and you — plus third-party logistics you pay for (inbound freight and warehousing).', dataSource: 'Logistics/freight invoices, shipment records (tonne-km or mode/distance). Spend-based estimation is permitted for this category.' },
  { id: 'cat5', num: 5, name: 'Waste generated in operations', stream: 'Upstream', desc: 'Emissions from disposal and treatment of waste generated', method: 'activity', unit: 'tonnes', typicalShare: 0.01 , guidance: 'Emissions from third parties treating the waste your operations generate — landfill, combustion, recycling, composting and anaerobic digestion. Wastewater is not covered: the waste factors used here publish none.', dataSource: 'Waste contractor invoices / facilities team: tonnes by material and treatment route. Activity data (tonnes) is needed — spend-based is not appropriate here.' },
  { id: 'cat6', num: 6, name: 'Business travel', stream: 'Upstream', desc: 'Emissions from employee travel for business purposes', method: 'activity', unit: 'mixed', typicalShare: 0.05 , guidance: 'Emissions from employees travelling for business — flights, rail, hotels, rental cars — in vehicles not owned by your company.', dataSource: 'Travel & expense system or travel agency reports: flights (distance/class), hotel nights, rail. Spend-based estimation is permitted for this category.' },
  { id: 'cat7', num: 7, name: 'Employee commuting', stream: 'Upstream', desc: 'Emissions from employees travelling to and from work', method: 'activity', unit: 'mixed', typicalShare: 0.03 , guidance: 'Emissions from employees commuting between home and work, including remote-work energy use.', dataSource: 'HR headcount + a commuting survey or assumptions (distance, mode, WFH days). Activity-based; spend-based is not appropriate here.' },
  { id: 'cat8', num: 8, name: 'Upstream leased assets', stream: 'Upstream', desc: 'Emissions from assets leased by your organisation', method: 'activity', unit: 'kwh', typicalShare: 0.02 , guidance: 'Emissions from assets you LEASE FROM others (as lessee) that aren\'t already in your Scope 1 & 2 — e.g. leased offices or equipment you don\'t operationally control.', dataSource: 'Lease agreements + energy use of leased assets (floor area or metered kWh). Activity-based; spend-based is not appropriate here.' },
  // Downstream
  { id: 'cat9', num: 9, name: 'Downstream transportation', stream: 'Downstream', desc: 'Emissions from transporting and distributing sold products', method: 'activity', unit: 'tonne_km', typicalShare: 0.03 , guidance: 'Emissions from transporting and distributing the products you SELL, after they leave you — outbound logistics, distribution centres, retail, paid for by others.', dataSource: 'Distribution/logistics records or modelled tonne-km of sold-product movement. Spend-based estimation is permitted for this category.' },
  { id: 'cat10', num: 10, name: 'Processing of sold products', stream: 'Downstream', desc: 'Emissions from processing your intermediate products by third parties', method: 'activity', unit: 'tonnes', typicalShare: 0.02 , guidance: 'Emissions from third parties further PROCESSING your sold intermediate products before final use (e.g. you sell a component that\'s then assembled or refined).', dataSource: 'Production volumes of intermediate goods + processing energy assumptions. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat11', num: 11, name: 'Use of sold products', stream: 'Downstream', desc: 'Emissions from end-users using your sold products', method: 'activity', unit: 'units', typicalShare: 0.15 , guidance: 'Emissions from customers USING the products you sell over their lifetime — often the largest category for energy-using or fuel products.', dataSource: 'Units sold + expected lifetime energy/fuel use per unit. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat12', num: 12, name: 'End-of-life treatment', stream: 'Downstream', desc: 'Emissions from disposal of your sold products at end of life', method: 'activity', unit: 'tonnes', typicalShare: 0.02 , guidance: 'Emissions from the waste treatment of the products you sold in the reporting year, and of their packaging, at the end of their life: landfill, combustion, recycling, composting or anaerobic digestion. The figure covers all of that year\u2019s sales, so most of these emissions have not happened yet.', dataSource: 'Per material: the tonnes of sold products and packaging that reach end of life, and how that mass splits across treatment routes. Enter the mass that reaches end of life, which can be less than the mass sold for products that are consumed, such as food and drink. For an intermediate product, enter the intermediate product you sold, not the final product it becomes part of. Include packaging, through to the point of retail.' },
  { id: 'cat13', num: 13, name: 'Downstream leased assets', stream: 'Downstream', desc: 'Emissions from assets owned and leased to others', method: 'activity', unit: 'kwh', typicalShare: 0.01 , guidance: 'Emissions from assets you OWN and LEASE OUT to others (as lessor) that aren\'t in your Scope 1 & 2 — e.g. property you rent to tenants.', dataSource: 'Your leased-out asset portfolio + tenants\' energy use (floor area or metered). Activity-based; spend-based is not appropriate here.' },
  { id: 'cat14', num: 14, name: 'Franchises', stream: 'Downstream', desc: 'Emissions from franchise operations', method: 'activity', unit: 'spend', typicalShare: 0.01 , guidance: 'Emissions from the operations of your FRANCHISEES — relevant if you\'re a franchisor.', dataSource: 'Franchisee energy/activity data, or estimates from number and type of franchise outlets. Activity-based; spend-based is not appropriate here.' },
  { id: 'cat15', num: 15, name: 'Investments', stream: 'Downstream', desc: 'Emissions associated with investments and lending (financed emissions)', method: 'pcaf', unit: 'spend', typicalShare: 0.90 , guidance: CAT15_GUIDANCE, dataSource: 'Per holding: the asset class, the outstanding amount, the value that asset class attributes on (EVIC, equity plus debt, property value or vehicle value) and the investee\u2019s reported emissions. If you already hold a computed figure for the portfolio, enter known financed emissions directly instead.' },
]

// ⚠️ NO SECTOR MATERIALITY TABLE, AND NO SUGGESTION FEATURE. SECTOR_MATERIAL mapped thirteen retired
// sector names to "likely material" categories, and it drove an auto-detect button and a per-category
// badge on the relevance step. The company sector select emits EXIOBASE industry codes, and none of the
// 163 matched any of the thirteen keys, so the feature suggested nothing for any sector a customer could
// choose — while the methodology page said ThemisIQ "automatically identifies" the likely material
// categories. Removed 18 Sep 2026 rather than re-keyed: relevance is the customer's judgement against
// the GHG Protocol's criteria (size, influence, risk, stakeholders, outsourcing, sector guidance), and a
// thirteen-row table with no source was never the GHG Protocol's sector guidance in the first place.

// Emission factors (kg CO2e per unit)

// ⚠️ `sectorPriced` IS GONE, AND SO IS EVERY READER OF EMISSION_FACTORS.spend ON THIS PAGE. It asked
// whether a sector was a key in that thirteen-entry table, which was the right question while Cat 1 and
// Cat 15 priced from it. Neither does now: Cat 1, 2 and 4 are priced by /api/scope3/spend-factor against
// EXIOBASE codes, and Cat 15 is assessed per holding or entered. The table's keys and the codes this page
// offers never overlapped, so the helper had come to answer "no" everywhere — which is exactly how a
// complete PCAF assessment ended up excluded from the total.
//   SECTOR_MATERIAL, keyed on the same retired vocabulary, was removed on 18 Sep 2026 along with the
// suggestion feature it drove; the note where it stood, just above, says why.

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

/** What one category's spend request produced, keyed by the inputs it was made for. */
type SpendLineResult =
  | { key: string; kind: 'done'; response: SpendFactorResponse; line: SpendFactorLine }
  | { key: string; kind: 'error'; message: string }

/**
 * THE CATEGORIES PRICED FROM EXIOBASE THROUGH /api/scope3/spend-factor.
 *
 * ⚠️ THREE OF THE ELEVEN SPEND CATEGORIES, AND THE OTHER SEVEN ARE A DECISION, NOT AN OVERSIGHT. Cats 1,
 * 2 and 4 are the ones a customer actually BUYS: purchased goods and services, capital goods, and inbound
 * freight. Cats 9, 11, 13 and 14 price something the company SOLD or LEASED OUT, where there is no
 * purchase to multiply; Cat 3 is derived from the energy already reported in Scopes 1 and 2; Cat 12 is
 * tonnes by material, the shape Cat 5 now uses DEFRA for; Cat 8's own data-source note says spend is not
 * appropriate. Those EIGHT — Cats 3, 8, 9, 10, 11, 12, 13 and 14 — keep the flat 0.5 factor deliberately: a
 * better-sourced factor behind a figure the method does not support would be the same error with a citation
 * attached. So flat_spend keeps EIGHT members (the generic ten were 2, 3, 4, 8, 9, 10, 11, 12, 13, 14, and
 * two left), and whether that method survives is a later question, not one this change answers.
 *
 * ⚠️ factor_type IS PER CATEGORY, BECAUSE EXIOBASE PUBLISHES TWO TABLES. Cat 4 buys a transport SERVICE,
 * so the industry (ixi) table fits. Cat 2 buys identifiable capital GOODS — a machine, a vehicle — so the
 * product (pxp) table fits, and the sector select offers products there. Both tables are in
 * exiobaseSectors.json; both factor files exist; the route takes the type per line.
 */
const SPEND_PRICED_CATEGORIES: readonly {
  /** ⚠️ Typed against lib/scope3/categoryScope, so a category priced from EXIOBASE must also have its
   *  picker scoped there: adding one here without a rule fails tsc rather than shipping an unscoped list. */
  id: SpendCategoryId
  factorType: 'industry' | 'product'
  /** Where this category's EXIOBASE code is stored in cat_data: SPEND_SECTOR_FIELD in
   *  lib/scope3/spendSector.ts, which is what spendSector() reads. It was duplicated here as a
   *  `sectorField` nothing consulted, which is how a documented mapping and the code that ignores it
   *  come to disagree. */
  /** Where this category's spend figure is stored in cat_data. */
  spendField: 'total_spend' | 'annual_spend'
}[] = [
  { id: 'cat1', factorType: 'industry', spendField: 'total_spend' },
  { id: 'cat2', factorType: 'product', spendField: 'annual_spend' },
  { id: 'cat4', factorType: 'industry', spendField: 'annual_spend' },
]
const SPEND_PRICED_IDS: readonly string[] = SPEND_PRICED_CATEGORIES.map(c => c.id)

/**
 * Identity of ONE category's pricing question: every input that changes the answer, and nothing else.
 *
 * ⚠️ PER LINE, NOT PER BATCH. A batch key would invalidate every category's result whenever any one spend
 * box changed, so editing Cat 2 would blank a priced Cat 4 and re-request it. The category id is part of
 * the key because two categories can hold the same sector and spend and still be different questions.
 */
const spendLineKey = (catId: string, sectorKey: string, countryIso2: string, currency: string, reportingYear: number, spend: number) =>
  JSON.stringify([catId, sectorKey, countryIso2, currency, reportingYear, spend])

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

/**
 * The option list ONE spend-priced category's picker offers, scoped by lib/scope3/categoryScope.
 *
 * ⚠️ A STEER, NOT A FILTER. Out-of-scope rows are withheld from the default list and returned in full by
 * `showAll`, each carrying the reason it is unusual here; choosing one is allowed and disclosed. Two rows
 * are never withheld whatever the rules say: the one already selected — a stored value must render as its
 * name, not as a blank select — and none at all when `showAll` is on.
 *
 * The note rides on the option text as well as under the select because a customer reads the list before
 * they read the panel, and the row they need to think about is the one they are about to click.
 */
function ScopedOptions({ catId, factorType, selected, showAll }: {
  catId: SpendCategoryId
  factorType: 'industry' | 'product'
  selected: string
  showAll: boolean
}) {
  const groups: { heading: string; options: readonly { code: string; name: string; note?: string }[] }[] =
    factorType === 'product'
      ? PRODUCT_OPTION_GROUPS.map(g => ({ heading: g.heading, options: g.products }))
      : INDUSTRY_OPTION_GROUPS.map(g => ({ heading: g.heading, options: g.industries }))
  return (
    <>
      {groups.map(g => {
        const options = g.options.filter(o => showAll || o.code === selected || inScopeFor(catId, o.code))
        if (!options.length) return null
        return (
          <optgroup key={g.heading} label={g.heading}>
            {options.map(o => {
              const inScope = inScopeFor(catId, o.code)
              const text = [o.name, o.note, scopeNote(catId, o.code)].filter(Boolean).join(' — ')
              return <option key={o.code} value={o.code}>{inScope ? text : `⚠ ${text}`}</option>
            })}
          </optgroup>
        )
      })}
    </>
  )
}

/**
 * The control that opens a scoped picker out to the full EXIOBASE table.
 *
 * ⚠️ BOTH HALVES OF THE LABEL, IN BOTH STATES: what is on screen now, then what pressing it will do. An
 * action-only label ("Show every EXIOBASE product") is unreadable here, because the scoped list and the
 * full list look the same until you count 200 rows — and once pressed, a lone "show only the ones usual
 * for this category" reads as though the scoped default had never been applied. That is precisely how the
 * Cat 2 picker was reported as opening unscoped on 17 Sep 2026 when it was not.
 *
 * `aria-pressed` is deliberately absent. It would be announced ON TOP OF a label that already states the
 * state, so a screen reader would read "showing every product, pressed" — two state claims to reconcile,
 * and one of them a double negative. The label is the state.
 */
function ShowAllToggle({ catId, on, onToggle, noun, usualFor }: {
  catId: string
  on: boolean
  onToggle: (catId: string) => void
  noun: string
  usualFor: string
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(catId)}
      style={{
        marginTop: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
        font: 'inherit', fontSize: 11, color: 'var(--color-brand)', textDecoration: 'underline',
        textAlign: 'left', lineHeight: 1.5,
      }}
    >
      {on
        ? `Showing every EXIOBASE ${noun} — show only the ${noun}s usual for ${usualFor}`
        : `Showing the ${noun}s usual for ${usualFor} — show every EXIOBASE ${noun}`}
    </button>
  )
}

/** The sentence under a spend-priced picker: why the chosen row is unusual here, or what the row covers
 *  that this category does not. Nothing at all for an ordinary in-scope row, which is most of them. */
function ScopeNoteUnderPicker({ catId, code }: { catId: SpendCategoryId; code: string }) {
  if (!code) return null
  const disclosure = outOfScopeDisclosure(catId, code)
  const note = disclosure ?? scopeNote(catId, code)
  if (!note) return null
  return (
    <div style={{
      fontSize: 11, lineHeight: 1.5, marginTop: 6, padding: '0.5rem 0.6rem', borderRadius: 6,
      background: disclosure ? '#FEF3C7' : '#f8f7f5',
      color: disclosure ? '#92400E' : 'var(--color-ink-muted)',
    }}>
      {disclosure ? '⚠ ' : ''}{note}
    </div>
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

/** The categories whose figure is a sum of priced waste rows, and the words each one's editor uses. */
type WasteRowsCategoryId = 'cat5'
const WASTE_EDITOR_COPY: Readonly<Record<WasteRowsCategoryId, { empty: string; stream: string; add: string }>> = {
  cat5: {
    empty: 'No waste streams yet. Add one for each material and treatment route on your waste contractor\'s report.',
    stream: 'Waste stream',
    add: '+ Add waste stream',
  },
}

/**
 * One category's waste rows: material, route and tonnes per row, each row's own priced line, and the add
 * button. Extracted from the Category 5 panel on 18 Sep 2026 so Category 12 can render the same editor over
 * its own rows. The markup is Category 5's, moved verbatim; what differs by category is the words
 * (WASTE_EDITOR_COPY) and the id prefix, and the rows and handlers come in as props.
 */
/**
 * Category 12's materials: per material, the tonnes of sold products and packaging reaching end of life and
 * a percentage share per treatment route the sheet publishes for it. The route tonnes are derived and priced
 * by lib/scope3/endOfLife.ts; this only collects the inputs and shows each material's own result.
 *
 * ⚠️ NOT WasteRowsEditor, deliberately. That editor collects tonnes PER ROUTE, which is right for Category 5
 * (a waste contractor invoices by route) and wrong here: the GHG Protocol asks for the mass and the
 * PROPORTION treated by each method (Technical Guidance p. 126), and the proportion is an assumption the
 * customer must be able to see and state. The material select and the route list are the same reader.
 */
function EolMaterialsEditor({ evaluated, onAdd, onRemove, onSetMaterial, onUpdate, onSetShare }: {
  evaluated: readonly EvaluatedEolMaterial[]
  onAdd: () => void
  onRemove: (id: string) => void
  onSetMaterial: (id: string, key: string) => void
  onUpdate: (id: string, patch: Partial<EolMaterial>) => void
  onSetShare: (id: string, route: string, value: number | undefined) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {evaluated.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
          No materials yet. Add one for each material your sold products and their packaging are made of.
        </div>
      )}
      {evaluated.map(e => {
        const m = e.material
        const hasMaterial = !!m.activity && !!m.waste_type
        const routes = hasMaterial ? wasteRoutesFor(m.activity, m.waste_type) : []
        const materialKey = hasMaterial && WASTE_MATERIAL_GROUPS.some(g => g.activity === m.activity && g.materials.includes(m.waste_type))
          ? wasteMaterialKey(m.activity, m.waste_type) : ''
        const fieldId = (f: string) => `cat12-${m.id}-${f}`
        const reason = eolMaterialNotPricedReason(e)
        return (
          <div key={m.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Material {e.n}</span>
              <button type="button" aria-label={`Remove material ${e.n}`} onClick={() => onRemove(m.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
            <div>
              <label htmlFor={fieldId('material')} style={labelStyle}>Material</label>
              <select id={fieldId('material')} style={inputStyle} value={materialKey} onChange={ev => onSetMaterial(m.id, ev.target.value)}>
                <option value="">Select material</option>
                {WASTE_MATERIAL_GROUPS.map(g => (
                  <optgroup key={g.activity} label={g.activity}>
                    {g.materials.map(mat => <option key={mat} value={wasteMaterialKey(g.activity, mat)}>{mat}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('tonnes')} style={labelStyle}>Tonnes reaching end of life</label>
              <input id={fieldId('tonnes')} style={inputStyle} type="number" min={0} value={m.tonnes || ''} onChange={ev => onUpdate(m.id, { tonnes: Number(ev.target.value) })} placeholder="0" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={labelStyle}>Share of this mass by treatment route (%)</div>
              {!hasMaterial ? (
                <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Choose a material first: only the routes the sheet publishes for it are offered.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {routes.map(r => (
                    <div key={r}>
                      <label htmlFor={fieldId(`share-${r}`)} style={{ fontSize: 11, color: '#555553', display: 'block', marginBottom: 4 }}>{r}</label>
                      <input id={fieldId(`share-${r}`)} style={inputStyle} type="number" min={0} max={100} value={m.shares[r] ?? ''} onChange={ev => onSetShare(m.id, r, ev.target.value === '' ? undefined : Number(ev.target.value))} placeholder="0" />
                    </div>
                  ))}
                </div>
              )}
              {hasMaterial && <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6 }}>Shares entered: {formatShare(e.shareSum || 0)}% of 100%.</div>}
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
              {e.outcome.status === 'priced' ? (
                <span style={{ color: '#555553' }}>
                  {e.routes.map(x => x.pricing.status === 'priced'
                    ? `${formatShare(x.row.tonnes)} t to ${x.row.route} × ${x.pricing.factor_kg_per_tonne} kg CO₂e per t`
                    : '').filter(Boolean).join('; ')} = <strong style={{ fontWeight: 600 }}>{e.kg.toLocaleString('en', { maximumFractionDigits: 2 })} kg CO₂e</strong>
                </span>
              ) : e.outcome.status === 'incomplete' ? (
                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {reason?.replace(/ not entered$/, '')}.</span>
              ) : (
                <span style={{ color: '#92400e' }}>⚠ Not counted: {reason}.</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add material</button>
    </div>
  )
}

function WasteRowsEditor({ catId, evaluated, onAdd, onRemove, onUpdate, onSetMaterial }: {
  catId: WasteRowsCategoryId
  evaluated: readonly EvaluatedWasteRow[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<WasteRow>) => void
  onSetMaterial: (id: string, key: string) => void
}) {
  const copy = WASTE_EDITOR_COPY[catId]
  return (
  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {evaluated.length === 0 && (
      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
        {copy.empty}
      </div>
    )}
    {evaluated.map(({ row, n, pricing }) => {
      const hasMaterial = !!row.activity && !!row.waste_type
      const routes = hasMaterial ? wasteRoutesFor(row.activity, row.waste_type) : []
      const materialKey = hasMaterial && WASTE_MATERIAL_GROUPS.some(g => g.activity === row.activity && g.materials.includes(row.waste_type))
        ? wasteMaterialKey(row.activity, row.waste_type) : ''
      const fieldId = (f: string) => `${catId}-${row.id}-${f}`
      return (
        <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>{copy.stream} {n}</span>
            <button type="button" aria-label={`Remove ${copy.stream.toLowerCase()} ${n}`} onClick={() => onRemove(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label htmlFor={fieldId('material')} style={labelStyle}>Waste type</label>
            <select id={fieldId('material')} style={inputStyle} value={materialKey} onChange={e => onSetMaterial(row.id, e.target.value)}>
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
            <select id={fieldId('route')} style={inputStyle} disabled={!hasMaterial} value={routes.includes(row.route) ? row.route : ''} onChange={e => onUpdate(row.id, { route: e.target.value })}>
              <option value="">{hasMaterial ? 'Select route' : 'Choose a waste type first'}</option>
              {routes.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={fieldId('tonnes')} style={labelStyle}>Tonnes</label>
            <input id={fieldId('tonnes')} style={inputStyle} type="number" min={0} value={row.tonnes || ''} onChange={e => onUpdate(row.id, { tonnes: Number(e.target.value) })} placeholder="0" />
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
    <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>{copy.add}</button>
  </div>
  )
}

const STEP_NAMES = ['Setup', 'Relevance', 'Calculate', 'Results', 'Export']

interface CategoryData {
  /**
   * Is this category relevant to the company? true / false / null = not yet answered.
   *
   * ⚠️ REPLACED `included: boolean` ON 17 SEP 2026. That one flag had to mean four things — relevant and
   * calculated, relevant and not yet calculated, excluded, and never looked at — so the export said "not
   * material" about a category nobody had reached. Whether a category is CALCULATED is derived from its
   * data (isCalculated below), never stored.
   */
  relevant?: Relevance
  /** Required when relevant === false: the exclusion's justification. */
  excluded_reason: string
  /** ⚠️ RETIRED. Read once on restore to derive `relevant` (relevanceFromStored), then never again. A
   *  saved record keeps it, because saves spread the stored object; nothing else reads it. */
  included?: boolean
  // Cat 1
  total_spend?: number
  supplier_sector?: string
  /**
   * The EXIOBASE code a SPEND-PRICED category other than Cat 1 is priced with (Cats 2 and 4 today).
   *
   * ⚠️ ITS OWN FIELD, AND NO FALLBACK TO THE COMPANY SECTOR — which is now true of Cat 1 too, whose
   * `supplier_sector` fallback was removed on 17 Sep 2026. Capital goods and inbound freight are different
   * purchases: a law firm's capital goods are not legal services, and its freight is not legal services
   * either. Defaulting them to the company sector would produce three figures that all priced the same row
   * while appearing to price three, which is the misallocation these categories exist to separate. Unset
   * means unpriced, and the panel says so.
   *
   * Holds an ixi code for an industry-priced category and a pxp code for a product-priced one; which is
   * which comes from SPEND_PRICED_CATEGORIES, not from the value.
   */
  spend_sector?: string
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
  // Cat 12 — one entry per material: tonnes reaching end of life and a percentage split across the routes
  // the sheet publishes for it. Priced by lib/scope3/endOfLife.ts through the same waste evaluator as Cat 5.
  eolMaterials?: EolMaterial[]
  /** Where the Cat 12 split comes from, in the customer's words. Optional: a missing source is priced and
   *  disclosed, as an exclusion without a justification is. */
  eol_split_source?: string
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

  // ── SPEND PRICING, FOR HOWEVER MANY CATEGORIES USE IT ──────────────────────────────────────────
  //
  // ⚠️ THIS WAS SCALAR UNTIL 17 SEP 2026: one key, one result slot, one debounce, one AbortController,
  // one pending boolean, and a handler that checked lines[0].id. It served Cat 1 and could not serve two
  // categories at once — the last response would win. It is now keyed PER LINE throughout, so a response
  // replaces only the lines it answers and editing Cat 2 cannot blank a priced Cat 4. Nothing here is
  // written for three categories in particular; SPEND_PRICED_CATEGORIES is the only list, and eleven
  // lines would need no further change (the route caps at 500).

  /**
   * This category's EXIOBASE code. '' means not chosen, and nothing is priced.
   *
   * ⚠️ THE RULE IS IN lib/scope3/spendSector.ts, NOT HERE, AND THAT IS THE FIX. Until 17 Sep 2026 this was
   * a closure reading `supplier_sector || sector` — the company sector — so an untouched Cat 1 priced a
   * real figure from a row the customer never chose. The extracted function is not given the company
   * sector, so no edit here can reintroduce it, and spendSector.test.ts says so out loud.
   */
  const spendSectorOf = (catId: string): string => spendSector(catData, catId)
  const spendAmountOf = (catId: string): number => {
    const cfg = SPEND_PRICED_CATEGORIES.find(c => c.id === catId)
    const d = catData[catId]
    return Number((cfg?.spendField === 'total_spend' ? d?.total_spend : d?.annual_spend) || 0)
  }
  /** False when the customer has given a figure directly — a supplier-specific Cat 1 total, or an
   *  override — because then nothing needs pricing. Relevance is NOT tested: an excluded category still
   *  needs its figure, which is what justifies excluding it. */
  const spendNeedsPricing = (catId: string): boolean => {
    const d = catData[catId]
    if (catId === 'cat1' && d?.has_supplier_data && d.supplier_emissions) return false
    return !d?.emissions_override
  }
  const spendInputsComplete = (catId: string): boolean =>
    spendNeedsPricing(catId) && !!spendSectorOf(catId) && !!countryIso2 && spendAmountOf(catId) !== 0

  /** The inputs a category still needs before anything can be priced. Read by its panel and by the
   *  unpriced reason, so the hint and the explanation cannot differ. */
  const spendMissingInputs = (catId: string): string[] => [
    !spendAmountOf(catId) && (catId === 'cat1' ? 'total annual spend' : 'annual spend'),
    // ⚠️ NAMES THE CONTROL THE CUSTOMER IS LOOKING AT. "the EXIOBASE sector for this category" would send a
    // Cat 2 customer hunting for a sector select that is labelled "What was bought": Cat 2 chooses a
    // PRODUCT and Cat 4 an INDUSTRY, so the sentence says which.
    // ⚠️ CAT 1 NAMES ITS SECTOR THE SAME WAY THE OTHER TWO DO, now that it has no fallback either. "primary
    // supplier sector" alone read as a field someone else might have filled in — which, until the company
    // sector fallback was removed, it effectively was.
    !spendSectorOf(catId) && (catId === 'cat1'
      ? 'the primary supplier sector (the EXIOBASE industry for this category)'
      : SPEND_PRICED_CATEGORIES.find(c => c.id === catId)?.factorType === 'product'
        ? 'what was bought (the EXIOBASE product for this category)'
        : 'the service provider sector (the EXIOBASE industry for this category)'),
    !countryIso2 && 'primary country of supply (Step 1)',
  ].filter((x): x is string => typeof x === 'string')

  // ⚠️ ONE DEBOUNCE TIMER PER CATEGORY, NOT ONE OVER ALL OF THEM. A single timer across every spend box
  // would mean typing in Cat 2 delayed a request Cat 4 was already waiting on. 400 ms each, for the reason
  // SPEND_DEBOUNCE_MS gives. Only the spend FIGURE is debounced; a sector or country change is one
  // deliberate act and fires immediately.
  const spendRaw: Record<string, number> = Object.fromEntries(SPEND_PRICED_IDS.map(id => [id, spendAmountOf(id)]))
  // The signature IS the input: the effect parses it rather than reading a ref written during render, so
  // its dependency is honest and nothing is read mid-render.
  const spendRawSig = JSON.stringify(spendRaw)
  const [spendDebounced, setSpendDebounced] = useState<Record<string, number>>(spendRaw)
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const debounceSeen = useRef<Record<string, number>>({})
  useEffect(() => {
    const values = JSON.parse(spendRawSig) as Record<string, number>
    for (const [id, value] of Object.entries(values)) {
      if (debounceSeen.current[id] === value) continue
      debounceSeen.current[id] = value
      clearTimeout(debounceTimers.current[id])
      debounceTimers.current[id] = setTimeout(() => setSpendDebounced(prev => ({ ...prev, [id]: value })), SPEND_DEBOUNCE_MS)
    }
  }, [spendRawSig])

  /** The key of the question ON SCREEN NOW, from the UNDEBOUNCED spend. A stored result counts only if it
   *  was made for exactly this; otherwise the figure is pending, never the previous one. */
  const spendLiveKey = (catId: string): string | null =>
    spendInputsComplete(catId)
      ? spendLineKey(catId, spendSectorOf(catId), countryIso2, currency, reportingYear, spendAmountOf(catId))
      : null
  /** The key of the question that may be SENT — the same, with the debounced spend. */
  const spendRequestKey = (catId: string): string | null => {
    const settled = spendDebounced[catId] ?? 0
    if (!spendNeedsPricing(catId) || !spendSectorOf(catId) || !countryIso2 || settled === 0) return null
    return spendLineKey(catId, spendSectorOf(catId), countryIso2, currency, reportingYear, settled)
  }

  /**
   * Which spend-priced pickers have been opened out to the full EXIOBASE table.
   *
   * ⚠️ PER CATEGORY, AND NOT PERSISTED. It is a view of a list, not an answer: nothing about the figure
   * changes when it is switched on, and the row chosen while it was on keeps its disclosure either way.
   * Cat 4's default list is eight rows, so this control is a normal path for that category rather than an
   * escape hatch — which is the reason it is a labelled button and not a link in small print.
   */
  const [showAllSectors, setShowAllSectors] = useState<Record<string, boolean>>({})
  const toggleShowAll = (catId: string) => setShowAllSectors(prev => ({ ...prev, [catId]: !prev[catId] }))

  const [spendResults, setSpendResults] = useState<Record<string, SpendLineResult>>({})
  /** The stored result for this category, ONLY when it answers the inputs on screen now. */
  const spendCurrent = (catId: string): SpendLineResult | null => {
    const key = spendLiveKey(catId)
    const held = spendResults[catId]
    return key !== null && held?.key === key ? held : null
  }
  const spendPending = (catId: string): boolean => spendLiveKey(catId) !== null && spendCurrent(catId) === null
  const spendPricedLine = (catId: string) => {
    const cur = spendCurrent(catId)
    return cur?.kind === 'done' && cur.line.outcome === 'priced' ? cur.line : null
  }

  // The lines that need asking: complete, settled, and not already answered for exactly these inputs.
  type SpendRequestLine = { id: SpendCategoryId; key: string; sector_key: string; factor_type: 'industry' | 'product'; spend: number }
  const spendToRequest: SpendRequestLine[] = SPEND_PRICED_CATEGORIES
    .map(c => ({ id: c.id, key: spendRequestKey(c.id), sector_key: spendSectorOf(c.id), factor_type: c.factorType, spend: spendDebounced[c.id] ?? 0 }))
    .filter((x): x is SpendRequestLine => x.key !== null && spendResults[x.id]?.key !== x.key)
  // Everything the request needs is IN the signature, so the effect reconstructs the batch from its own
  // dependency instead of reading a ref written during render.
  const spendRequestSig = JSON.stringify(spendToRequest)

  useEffect(() => {
    const batch = JSON.parse(spendRequestSig) as SpendRequestLine[]
    if (batch.length === 0) return
    const controller = new AbortController()
    ;(async () => {
      // Every line's key is captured HERE, with the request. The merge below writes each result under the
      // key it was asked for, so a response answering inputs that have since changed lands under a key
      // that no longer matches — spendCurrent ignores it, and that line re-requests — while the lines in
      // the same response whose inputs did not change are kept.
      const sent = batch.map(x => ({ id: x.id, key: x.key }))
      const fail = (message: string) =>
        setSpendResults(prev => ({ ...prev, ...Object.fromEntries(sent.map(l => [l.id, { key: l.key, kind: 'error' as const, message }])) }))
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (controller.signal.aborted) return
        const token = session?.access_token
        if (!token) { fail('Please sign in again to price this spend.'); return }
        const res = await fetch('/api/scope3/spend-factor', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            reporting_year: reportingYear,
            reporting_currency: currency,
            // The line id IS the category id: the route echoes ids back and requires them unique, and a
            // category can hold only one spend line.
            lines: batch.map(line => ({
              id: line.id,
              country_iso2: countryIso2,
              sector_key: line.sector_key,
              factor_type: line.factor_type,
              spend: line.spend,
              // PURCHASER prices, because these fields hold what the customer PAID: figures read off
              // invoices or an AP ledger, which include trade and transport margins and product taxes.
              // EXIOBASE factors are in basic prices, so the route will flag the mismatch and say it was
              // not converted. Claiming 'basic' here would silence that disclosure while the figure
              // stayed exactly as unconverted as before.
              spend_price_basis: 'purchaser',
            })),
          }),
        })
        const json = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!res.ok) {
          // The route's customer `message`, verbatim. NOT operator_detail: that names tables, columns and
          // fingerprints, and is for whoever reads the server log or the network panel.
          fail(json?.message ?? `The pricing service answered HTTP ${res.status} with no message.`)
          return
        }
        const response = json as SpendFactorResponse | null
        const byId = new Map((response?.lines ?? []).map(l => [l.id, l]))
        setSpendResults(prev => {
          const next = { ...prev }
          for (const l of sent) {
            const line = byId.get(l.id)
            next[l.id] = line && response
              ? { key: l.key, kind: 'done', response, line }
              : { key: l.key, kind: 'error', message: 'The pricing service returned a response that did not include this spend line.' }
          }
          return next
        })
      } catch {
        // An abort rejects the fetch too. That is supersession, not failure, so it writes nothing.
        if (controller.signal.aborted) return
        fail('Could not reach the pricing service.')
      }
    })()
    return () => controller.abort()
  }, [spendRequestSig, countryIso2, currency, reportingYear])

  /** Every category whose figure is still being priced. Read by the save gate, which must not write a
   *  total that is about to change. */
  const spendPendingIds = SPEND_PRICED_IDS.filter(id => spendPending(id))
  const anySpendPending = spendPendingIds.length > 0

  /**
   * The sentences behind one priced figure. ONE derivation, read by that category's workings card and by
   * the CSV, so the export cannot disclose something different from the screen.
   *
   * ⚠️ batch_summary IS NOT HERE ANY MORE. It counts lines across the WHOLE request — "2 of 3 priced" —
   * which, now that a request carries several categories, is a statement about the inventory rather than
   * about this category. It would read as a claim about Cat 2 on Cat 2's card. It is carried once, at
   * inventory level, in the CSV's ESTIMATE BASIS block.
   */
  const spendSentences = (catId: string): string[] => {
    const cur = spendCurrent(catId)
    const line = spendPricedLine(catId)
    return line && cur?.kind === 'done'
      ? [...new Set([...line.disclosures, ...cur.response.disclosures])]
      : []
  }

  /** The batch-level counts, once, from whichever response is current. Only meaningful for 2+ lines. */
  const spendBatchSummary = (): string[] => {
    for (const id of SPEND_PRICED_IDS) {
      const cur = spendCurrent(id)
      if (cur?.kind === 'done' && cur.response.lines.length > 1) return cur.response.batch_summary
    }
    return []
  }

  /** A spend-priced category's sector for a RECORD: the name with its code, from the table that category
   *  is priced against. sectorLabel reads the industry list; a pxp code is not in it, so a product-priced
   *  category would otherwise print its bare code in the CSV and the workings. */
  const spendSectorLabel = (catId: string): string => {
    const code = spendSectorOf(catId)
    if (!code) return ''
    const cfg = SPEND_PRICED_CATEGORIES.find(c => c.id === catId)
    if (cfg?.factorType !== 'product') return sectorLabel(code)
    const name = productName(code)
    return name === code ? code : `${name} (EXIOBASE ${code})`
  }

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
      if (s3.cat_data) {
        // ⚠️ MAPPED ON READ, NOT MIGRATED IN PLACE. A record saved before 17 Sep 2026 carries `included`
        // and no `relevant`; relevanceFromStored maps true -> true, false -> false (the exclusion the
        // page always displayed it as) and a record with neither to null, not evaluated. The stored
        // `included` is left exactly as it was, so nothing is rewritten by opening an inventory.
        const stored = s3.cat_data as Record<string, CategoryData>
        setCatData(Object.fromEntries(Object.entries(stored).map(([id, d]) => [id, { ...d, relevant: relevanceFromStored(d) }])))
      }
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


  /**
   * Answer — or un-answer — the relevance question for one category.
   *
   * ⚠️ THREE STATES, AND THE THIRD IS NOT A SHRUG. A checkbox had two, so "not yet answered" and "judged
   * not relevant" were the same box left alone, and the export reported both as "not material". Pressing
   * the option a category already holds clears it back to unanswered — the only way to take an answer
   * back without asserting its opposite.
   *
   * The exclusion's reason is NOT cleared when relevance changes: a customer who flips to relevant and
   * back has not withdrawn what they wrote, and losing it silently would cost them the justification the
   * report needs.
   */
  const setRelevance = (id: string, next: Relevance) => {
    setCatData(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        excluded_reason: prev[id]?.excluded_reason ?? '',
        relevant: (prev[id]?.relevant ?? null) === next ? null : next,
      },
    }))
  }

  /**
   * What the saved total is a total OF, written with it.
   *
   * ⚠️ ONE ENTRY PER CATEGORY, INCLUDING THE ONES NOBODY ANSWERED. A map of only the answered categories
   * would make "not evaluated" indistinguishable from "this record predates the column", which is the
   * distinction the whole record exists to preserve (see 20260917_scope3_coverage.sql). Fifteen entries
   * say the question was asked of all fifteen.
   *
   * `mt` is null wherever nothing was calculated — not 0, which would claim the category emits nothing.
   * `in_total` is the status's own inTotal, further narrowed by the unpriced set, so it matches the figure
   * that was actually summed rather than the one that would have been.
   */
  const scope3Coverage = (): Record<string, Scope3CoverageEntry> =>
    Object.fromEntries(CATEGORIES.map(c => {
      const unpriced = couldNotPriceCatIds.has(c.id)
      return [c.id, coverageEntry(statusOf(c.id), {
        mt: unpricedCatIds.has(c.id) ? null : Number(getCatEmissions(c.id).toFixed(4)),
        unpriced,
        // The wizard's own sentence for this category, verbatim — the same one the amber notice shows.
        reason: unpriced ? unpricedReason(c.id) : null,
        // ⚠️ THE METHOD'S OWN SCORE, NOT OURS, and only for a method that defines one. PCAF's 1-to-5 for
        // Cat 15: a submission quotes PCAF's number rather than ThemisIQ's confidence pill. coverageEntry
        // drops it wherever there is no figure to describe.
        dq: c.id === 'cat15' ? cat15Result().dqScore : null,
      })]
    }))

  /** Answered exclusions with no justification written. The report needs one for each. */
  const unjustifiedExclusions = CATEGORIES.filter(c => catData[c.id]?.relevant === false && !(catData[c.id]?.excluded_reason || '').trim())

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

  // Cat 12 end-of-life materials, in catData['cat12'].eolMaterials.
  const newEolMaterial = (): EolMaterial => ({ id: Math.random().toString(36).slice(2), activity: '', waste_type: '', tonnes: 0, shares: {} })
  const editEolMaterials = (edit: RowEdit<EolMaterial>) =>
    setCatData(prev => ({ ...prev, cat12: { ...prev.cat12, eolMaterials: editRows(prev.cat12?.eolMaterials, edit) } }))
  const addEolMaterial = () => editEolMaterials({ kind: 'add', row: newEolMaterial() })
  const removeEolMaterial = (id: string) => editEolMaterials({ kind: 'remove', id })
  const updateEolMaterial = (id: string, patch: Partial<EolMaterial> | ((row: EolMaterial) => Partial<EolMaterial>)) =>
    editEolMaterials({ kind: 'update', id, patch })
  /** A material change keeps only the shares on routes the new material publishes, for the reason
   *  setWasteMaterial keeps only a published route: a share with no factor could not be shown or priced. */
  const setEolMaterialType = (id: string, key: string) => {
    const m = parseWasteMaterialKey(key)
    if (!m) { updateEolMaterial(id, { activity: '', waste_type: '', shares: {} }); return }
    updateEolMaterial(id, row => {
      const routes = wasteRoutesFor(m.activity, m.waste_type)
      return { activity: m.activity, waste_type: m.waste_type, shares: Object.fromEntries(Object.entries(row.shares).filter(([r]) => routes.includes(r))) }
    })
  }
  const setEolShare = (id: string, route: string, value: number | undefined) =>
    updateEolMaterial(id, row => {
      const shares = { ...row.shares }
      if (value === undefined) delete shares[route]
      else shares[route] = value
      return { shares }
    })

  // Waste rows, in catData[catId].wasteRows, for every row-priced category (Cat 5 today).
  const newWasteRow = (): WasteRow => ({
    id: Math.random().toString(36).slice(2),
    activity: '',
    waste_type: '',
    route: '',
    tonnes: 0,
  })
  /** For rendering only. */
  const wasteRows = (catId: WasteRowsCategoryId) => catData[catId]?.wasteRows ?? []
  const editWasteRows = (catId: WasteRowsCategoryId, edit: RowEdit<WasteRow>) =>
    setCatData(prev => ({ ...prev, [catId]: { ...prev[catId], wasteRows: editRows(prev[catId]?.wasteRows, edit) } }))
  const addWasteRow = (catId: WasteRowsCategoryId) => editWasteRows(catId, { kind: 'add', row: newWasteRow() })
  const removeWasteRow = (catId: WasteRowsCategoryId, id: string) => editWasteRows(catId, { kind: 'remove', id })
  const updateWasteRow = (catId: WasteRowsCategoryId, id: string, patch: Partial<WasteRow> | ((row: WasteRow) => Partial<WasteRow>)) =>
    editWasteRows(catId, { kind: 'update', id, patch })
  /**
   * ⚠️ A MATERIAL CHANGE CLEARS A ROUTE THE NEW MATERIAL DOES NOT PUBLISH. Keeping it would leave a pair
   * the sheet has no factor for, which the route select could not even display. A route the new material
   * does publish is kept, because the customer chose it and it is still valid.
   */
  const setWasteMaterial = (catId: WasteRowsCategoryId, id: string, key: string) => {
    const m = parseWasteMaterialKey(key)
    if (!m) { updateWasteRow(catId, id, { activity: '', waste_type: '', route: '' }); return }
    // The route is checked against the row as it is when the edit applies, not as it was rendered.
    updateWasteRow(catId, id, row => ({
      activity: m.activity,
      waste_type: m.waste_type,
      route: wasteRoutesFor(m.activity, m.waste_type).includes(row.route) ? row.route : '',
    }))
  }

  // ─── Calculations ────────────────────────────────────────────────────────────
  //
  // ⚠️ THE CALCULATORS NO LONGER ASK WHETHER A CATEGORY IS RELEVANT. Each used to open with
  // `if (!d?.included) return 0`, so an excluded category could not have a figure at all. Under the status
  // model "not relevant, calculated" is a real state — a customer who calculated a category, found it
  // small, and excludes it on that basis — and the figure is the evidence for the exclusion. So a figure
  // is computed wherever the data supports one, and RELEVANCE IS APPLIED AT THE TOTAL (see scope3Status's
  // inTotal), not at the arithmetic. Nothing that sums reads a calculator without going through that.

  /** Every EXIOBASE-priced category's figure: an entered figure if there is one, else the route's answer
   *  for the inputs on screen now. Was calcCat1; the body never depended on the category. */
  const calcSpendPriced = (id: string): number => {
    const d = catData[id] ?? ({} as CategoryData)
    if (d.emissions_override) return d.emissions_override
    if (id === 'cat1' && d.has_supplier_data && d.supplier_emissions) return d.supplier_emissions
    // The spend path reads the route's answer for the inputs on screen now, and nothing else. Absent,
    // no_factor, an error, a request still in flight or an input not yet entered all return 0, and
    // unpricedCatIds excludes the category rather than summing that 0 in.
    //   ⚠️ NO DEFAULT FACTOR. This used to fall back to DEFAULT_SPEND_EF (0.5 kg per currency unit)
    // on a sector miss — the last way a flat 0.5 could reach a Cat 1 figure, rendering exactly like a
    // figure priced from a real factor. It is gone; a miss is a miss.
    const line = spendPricedLine(id)
    return line ? line.emissions_mt : 0
  }

  const calcCat6 = (): number => {
    // `?? {}`: the relevance gate that guaranteed a record is gone, and a category with no entry has no
    // inputs, so every field below falls back to its own default and the figure is 0.
    const d = catData['cat6'] ?? ({} as CategoryData)
    const shortHaul = (d.short_haul_flights || 0) * (d.avg_flight_km || 800) * EMISSION_FACTORS.flight_short
    const longHaul = (d.long_haul_flights || 0) * (d.avg_flight_km || 5000) * EMISSION_FACTORS.flight_long
    const hotels = (d.hotel_nights || 0) * EMISSION_FACTORS.hotel
    const rail = (d.rail_km || 0) * EMISSION_FACTORS.rail
    return (shortHaul + longHaul + hotels + rail) / 1000
  }

  const calcCat7 = (): number => {
    const d = catData['cat7'] ?? ({} as CategoryData)
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
  // workings, the CSV and factor_basis, so none of them can price a row differently. It is
  // lib/scope3/wasteRows.ts over Cat 5's OWN rows: the page no longer prices rows itself, which is what
  // lets a second row-priced category run the same evaluation without reading Category 5's.
  const cat5Waste = evaluateWasteRows(wasteRows('cat5'))
  const cat5Evaluated = cat5Waste.evaluated
  const cat5Priced = cat5Waste.priced
  const cat5NotPriced = cat5Waste.notPriced

  // The sum over PRICED rows of tonnes x factor, in kg, over 1000 for mt. An incomplete row, or one whose
  // saved pair the sheet does not publish, adds nothing and is named wherever this figure is described.
  const calcCat5 = (): number => cat5Waste.mt

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

  /**
   * The Cat 5 workings, and the CSV's Cat 5 disclosure rows: the same sentences in both, as for Cat 1.
   *
   * ⚠️ THE GWP SENTENCE READS THE BOUND INVENTORY, IT DOES NOT ASSERT A MIX. These factors are AR5. The
   * GHG inventory records its own basis in gwp_version, and the sentence says whether the two match,
   * differ, or cannot be compared because nothing is recorded.
   */
  /** The GWP sentence both waste categories carry: the sheet's AR5 basis, and whether the bound GHG inventory
   *  shares it. Cat 5's wording, unchanged, now built once so Cat 12 cannot word it differently. */
  const wasteGwpSentence: string = (() => {
    const m = DEFRA_WASTE_META
    const mix = !boundInventoryId ? ''
      : ghgGwpVersion === m.gwp_basis ? ` The linked GHG inventory records ${ghgGwpVersion} as well, so the two share a GWP basis.`
      : ghgGwpVersion ? ` The linked GHG inventory records ${ghgGwpVersion}. These factors are not re-based to it, so the inventory combines ${ghgGwpVersion} and ${m.gwp_basis} figures.`
      : ` The linked GHG inventory records no GWP basis, so whether it shares ${m.gwp_basis} with these factors is not known.`
    return `GWP basis: ${m.gwp_basis}. ${m.gwp_basis_note}${mix}`
  })()

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
    out.push(wasteGwpSentence)
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

  // ─── Cat 12: end-of-life treatment of sold products ─────────────────────────────────────────
  // ONE evaluation read by the panel, the workings, the CSV and factor_basis, as for Cat 5. The figure and
  // the calculated flag come from rowPricedResult, which reads this category's own data only.
  const cat12Eol = evaluateEolMaterials(catData['cat12']?.eolMaterials)
  const cat12SplitSource = (catData['cat12']?.eol_split_source ?? '').trim()
  /**
   * The Cat 12 workings and CSV disclosures: the same sentences in both. ⚠️ NO EM-DASHES, and the method is
   * described as finer than the Technical Guidance's formula [12.1], never as that formula.
   */
  const cat12Sentences: string[] = (() => {
    const m = DEFRA_WASTE_META
    const out: string[] = []
    out.push(
      `Priced from ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, ${m.sheet} sheet, factor edition ${m.edition}). ` +
      `For each material, the tonnes of sold products and packaging reaching end of life are split across treatment routes by the customer's shares, ` +
      `and each route's tonnes are multiplied by the kg CO2e per tonne the sheet publishes for that material and route; the results are summed.`,
    )
    out.push(m.attribution_required)
    out.push(`Licence: ${m.licence}, ${m.licence_url}`)
    out.push(
      "This applies the sheet's factor for each material and each route, which is finer than formula [12.1] of the GHG Protocol's " +
      'Technical Guidance for Calculating Scope 3 Emissions; that formula applies one average factor per treatment method.',
    )
    out.push(cat12SplitSource
      ? `The split across treatment routes is the customer's assumption. Its stated source: ${cat12SplitSource}`
      : "The split across treatment routes is the customer's assumption. No source for it was recorded.")
    out.push('The figure is the expected end-of-life emissions of all products sold in the reporting year. Most of these emissions have not yet occurred.')
    out.push(`These are UK factors, applied wherever the products were sold. End-of-life treatment where the products are used may differ.`)
    out.push(wasteGwpSentence)
    out.push(withoutListMarker(m.scope_guidance))
    out.push(withoutListMarker(m.lifecycle_guidance))
    out.push(`Re-use is not offered as a route: a re-used product still reaches end of life later. The workbook's FAQ, "${m.reuse_faq_question}": ${m.reuse_faq_answer}`)
    for (const e of cat12Eol.notPriced) out.push(`Material ${e.n} is not in this figure: ${eolMaterialNotPricedReason(e)}.`)
    return out
  })()

  const calcGenericSpend = (id: string): number => {
    const d = catData[id] ?? ({} as CategoryData)
    if (d.emissions_override) return d.emissions_override
    const spend = d.annual_spend || 0
    // GENERIC_SPEND_FACTOR is 0.5, the literal that stood here. Named so that every description of
    // these figures reads the factor and its (empty) provenance instead of restating them.
    return (spend * GENERIC_SPEND_FACTOR.kg_co2e_per_currency_unit) / 1000
  }

  // Full PCAF result for cat 15. Delegates to the engine orchestrator, which chooses the
  // decomposed per-asset assessment (detailed mode) or the lumped score-5 proxy. Returns
  // the whole PortfolioResult so render can read mode/dqScore without re-plumbing.
  /**
   * Cat 15's figure, or the reason there is none. ONE call site for the rule, in lib/scope3/cat15.ts.
   *
   * ⚠️ THE LUMPED SPEND PROXY IS GONE. It multiplied a portfolio balance by an intensity per year of
   * activity, which is not a quantity; no factor repairs the equation, so pricing it through the EXIOBASE
   * route was designed and then dropped — a better-sourced factor on a wrong equation stops looking wrong.
   * ⚠️ AND NO SAVED TOTAL CHANGES: `sectorPriced` already excluded every proxy figure from every total,
   * because the spend table's thirteen keys and the EXIOBASE codes this page offers do not overlap at all.
   * This makes the code say what the product already does.
   *
   * It is a plain function, not memoised: cat15Figure is pure and the portfolio is a handful of rows.
   */
  const cat15Result = (): Cat15Figure => cat15Figure(catData['cat15'])

  const calcCat15 = (): number => cat15Result().mt ?? 0

  // Dispatches on scope3MethodFor, the same map every basis description reads, so a category cannot be
  // described as one method and calculated with another. The mapping is identical to the switch on id
  // it replaced: cat1, cat5, cat6, cat7 and cat15 to their own functions, everything else generic.
  const getCatEmissions = (id: string): number => {
    switch (scope3MethodFor(id)) {
      case 'exiobase_spend': return calcSpendPriced(id)
      // ⚠️ BY THE CATEGORY'S OWN ID. This read `calcCat5()`, which took no id: any second category on a
      // row-priced method would have reported Category 5's figure. See lib/scope3/rowPriced.ts.
      case 'waste_factors':
      case 'end_of_life_factors': return rowPricedResult(catData, id)?.mt ?? 0
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
  /**
   * Has this category been CALCULATED — does its data actually produce a figure?
   *
   * ⚠️ DERIVED, NEVER STORED, and derived per method because the methods fail differently: Cat 1 can hold a
   * complete spend and still have no figure (no active factor edition, a sector with no factor), Cat 5
   * depends on whether any waste row is complete, and the flat-spend ten need only a spend. Each test is
   * the same one the category's own basis description and confidence already use, so "calculated" and the
   * figure beside it cannot disagree.
   *
   * ⚠️ THE PCAF PATH TESTS WHETHER A FIGURE EXISTS AT ALL, INCLUDING ZERO. cat15Figure returns null for
   * no figure and never 0 in its place, so a customer who enters 0 financed emissions is calculated with a
   * figure of zero. Everywhere else the test is on the inputs, where a deliberate zero also counts.
   */
  const isCalculated = (id: string): boolean => {
    const d = catData[id]
    if (!d) return false
    // ⚠️ ONLY WHERE THE CALCULATOR USES ONE. Honouring a stored override for every category reported Cat 5,
    // 6 and 7 as "calculated" on the override alone, while their calculators ignored it. See
    // METHOD_TAKES_ENTERED_FIGURE, which the methodology page's published sentence also reads.
    if (d.emissions_override && takesEnteredFigure(id)) return true
    switch (scope3MethodFor(id)) {
      case 'exiobase_spend': return !!(d.has_supplier_data && d.supplier_emissions) || !!spendPricedLine(id)
      case 'waste_factors':
      case 'end_of_life_factors': return rowPricedResult(catData, id)?.calculated ?? false
      case 'travel_factors': return !!(d.short_haul_flights || d.long_haul_flights || d.hotel_nights || d.rail_km)
      case 'commuting_factors': return !!d.employee_count
      // ⚠️ mt !== null, NOT > 0. An entered zero — a portfolio that finances no emissions — is a
      // calculated answer, and the note above about a genuine zero reading as not-calculated no longer
      // applies to this path.
      case 'pcaf': return cat15Result().mt !== null
      case 'flat_spend': return !!d.annual_spend
    }
  }

  /** The category's status: the stored relevance answer, and whether its data produced a figure. */
  const statusOf = (id: string): Scope3Status => scope3Status(catData[id]?.relevant ?? null, isCalculated(id))

  const unpricedCatIds = new Set(
    CATEGORIES.filter(c => {
      const d = catData[c.id]
      // Only a category the customer CLAIMS can be missing from the total. An excluded or unanswered one
      // is not part of the claim, so its inability to be priced is not an omission from it.
      if (d?.relevant !== true) return false
      if (SPEND_PRICED_IDS.includes(c.id)) return spendNeedsPricing(c.id) && !spendPricedLine(c.id)
      // ⚠️ portfolio_sector ALONE, BECAUSE THAT IS ALL cat15PcafResult IS GIVEN. This read
      // `portfolio_sector || sector`, so with no portfolio sector chosen the check consulted the COMPANY
      // sector and could report Cat 15 as priceable while the calculation was pricing it from its own
      // internal 'Financial Services' default — 0.12 where the company sector said Mining & Metals would
      // be 4.20. A check that tests an input the calculation never sees is not a check.
      // ⚠️ THE ASSESSMENT, NOT A SECTOR. This tested sectorPriced(portfolio_sector), which is false for
      // every sector this page can offer, so Cat 15 was ALWAYS excluded — a complete per-asset PCAF
      // assessment was computed, displayed with its data-quality score, and then dropped from the total.
      if (c.id === 'cat15') return cat15Result().mt === null
      return false
    }).map(c => c.id),
  )
  // ⚠️ ONLY 'Relevant, calculated' SUMS. A calculated category the customer judged not relevant has a
  // figure, and that figure is reported as the evidence for the exclusion — but the total is the claim.
  /**
   * The claimed categories the PLATFORM could not price: the inputs their method needs are all there, and
   * still no figure came back.
   *
   * ⚠️ NARROWER THAN unpricedCatIds, AND THE DIFFERENCE IS WHOSE TURN IT IS. That set answers "is this
   * category missing from the total", which is true of a category nobody has filled in yet — and the amber
   * notice it drives says so, category by category, which is the right thing on screen. This one answers
   * "did we fail to price something the customer completed", which is what the stored record calls
   * unpriced, and what a consumer of a baseline needs to tell a platform gap from an unfinished one.
   */
  const couldNotPriceCatIds = new Set(
    CATEGORIES.filter(c => {
      const d = catData[c.id]
      if (d?.relevant !== true) return false
      // Cat 1: a complete spend question (sector, country, a non-zero figure) that the route did not price.
      if (SPEND_PRICED_IDS.includes(c.id)) return spendInputsComplete(c.id) && !spendPricedLine(c.id)
      // ⚠️ CAT 15 IS ALMOST NEVER "UNPRICED" IN THIS COLUMN'S SENSE. The column means the platform failed
      // on inputs the customer completed. A withdrawn proxy is a method boundary and an incomplete holding
      // is the customer's turn — neither is our failure. The one case that is: every holding computes on
      // its own and the portfolio assessment still throws.
      if (c.id === 'cat15') return cat15Result().reason === CAT15_ASSESSMENT_FAILED
      return false
    }).map(c => c.id),
  )

  const totalScope3 = CATEGORIES.filter(c => statusOf(c.id).inTotal && !unpricedCatIds.has(c.id))
    .reduce((sum, c) => sum + getCatEmissions(c.id), 0)
  const unpricedCats = CATEGORIES.filter(c => unpricedCatIds.has(c.id))
  // The categories that actually contribute to totalScope3: included, priceable, and non-zero.
  // ONE definition, read by both the Results rows and the Export tile's count, because those two
  // disagreed (Results showed 1 row, Export said "Categories: 3") and a count that differs from the
  // rows beside the same total reads as a claim about what the total is made of. This is a display
  // set, not a calculation: totalScope3 above is unchanged and still sums its own filter.
  const categoriesInTotal = CATEGORIES.filter(c => statusOf(c.id).inTotal && !unpricedCatIds.has(c.id) && getCatEmissions(c.id) > 0)
  // The categories marked material: everything the inventory claims to cover, whether or not it
  // could be priced or has data yet. Shown beside categoriesInTotal wherever a category count
  // appears, so "in scope" versus "in total" is always visible rather than one standing in for the
  // other under a bare "Categories".
  const categoriesInScope = CATEGORIES.filter(c => catData[c.id]?.relevant === true)
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
    if (SPEND_PRICED_IDS.includes(id)) {
      const missing = spendMissingInputs(id)
      if (missing.length > 0) {
        return `Not estimated, because ${missing.length === 1 ? 'this has' : 'these have'} not been entered: ${missing.join(', ')}.`
      }
      if (spendPending(id)) return 'Its estimate had not finished calculating.'
      const cur = spendCurrent(id)
      if (cur?.kind === 'error') return cur.message
      if (cur?.line.outcome === 'absent') return cur.line.explanation
      if (cur?.line.outcome === 'no_factor') return cur.line.notice
      return NO_REASON
    }
    // ⚠️ THE REASON COMES FROM THE SAME FUNCTION THAT WITHHELD THE FIGURE, verbatim, so the panel, the
    // amber box and the export cannot describe the gap differently. It never says "no factor for this
    // sector": no factor was ever the problem here.
    if (id === 'cat15') return cat15Result().reason || NO_REASON
    return NO_REASON
  }

  /**
   * The state of one category's spend estimate: what is still missing, that it is being priced, why it
   * could not be, or the workings behind the figure.
   *
   * ⚠️ ONE RENDERER FOR EVERY SPEND-PRICED CATEGORY. This was written inline in the Cat 1 panel. Copying
   * it into Cat 2 and Cat 4 would have produced three places where a pricing failure is explained, and the
   * explanations would drift — which is the defect this file has spent the week removing elsewhere.
   */
  const renderSpendEstimate = (catId: string, catName: string) => {
    if (!spendInputsComplete(catId)) {
      // Say which input is missing; that much is checkable. No notice about factors, because nothing has
      // been asked yet.
      return (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginTop: 8 }}>
          To estimate from spend, enter: {spendMissingInputs(catId).join(', ')}.
        </div>
      )
    }
    if (spendPending(catId)) {
      return <div role="status" style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 8 }}>Pricing this spend…</div>
    }
    const cur = spendCurrent(catId)
    if (cur?.kind === 'error') return <NoFactorNotice what={catName} title="⚠ This spend could not be priced" detail={cur.message} />
    if (cur?.line.outcome === 'absent') return <NoFactorNotice what={catName} title="⚠ This spend cannot be estimated" detail={cur.line.explanation} />
    if (cur?.line.outcome === 'no_factor') return <NoFactorNotice what={catName} title="⚠ This spend cannot be estimated" detail={cur.line.notice} />
    const priced = spendPricedLine(catId)
    if (!priced || cur?.kind !== 'done') return null
    return (
      <SpendFactorWorkings
        id={`${catId}-spend`}
        figureMt={priced.emissions_mt}
        // Figure and method only. Region by name, from regionNames.ts — the same words the route's
        // sentences below use. A missing dataset or version is omitted, not replaced with a placeholder.
        summary={`spend-based estimate from the ${[priced.source.dataset, priced.source.version && `v${priced.source.version}`].filter(Boolean).join(' ')} factor for ${regionName(priced.used_region)}`.replace('from the  factor', 'from the factor')}
        // Shared with the CSV, verbatim, de-duplicated.
        sentences={spendSentences(catId)}
      />
    )
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
  const showSaved = saved && !anySpendPending && savedTotalMatches

  /**
   * ⚠️ TWO SPEND METHODS, AND THEY WERE LABELLED THE SAME. Everything with a spend figure read
   * "Spend-based", whether it was priced from an EXIOBASE factor through a named edition or multiplied by
   * the flat 0.5 that carries no source, year or region. A verifier reading the results table or the CSV
   * could not tell one from the other, and they are two different claims about a number. 'exiobase_spend'
   * is the priced one; 'low' is now labelled for what it actually is.
   */
  const getConfidence = (id: string): 'high' | 'medium' | 'exiobase_spend' | 'low' => {
    const d = catData[id]
    // No relevance gate: confidence describes the DATA, and an excluded category that was calculated
    // still reports its figure with the quality that figure has.
    // An entered figure is primary data — but only on a category whose calculator uses one.
    if ((d.emissions_override && takesEnteredFigure(id)) || d.has_supplier_data) return 'high'
    if (id === 'cat6' && (d.short_haul_flights || d.long_haul_flights)) return 'medium'
    if (id === 'cat7' && d.employee_count) return 'medium'
    if (id === 'cat5' && cat5Priced.length > 0) return 'medium'
    if (scope3MethodFor(id) === 'end_of_life_factors' && rowPricedResult(catData, id)?.calculated) return 'medium'
    // ⚠️ A PER-ASSET PCAF ASSESSMENT IS NOT A SPEND ESTIMATE, and it used to fall through to 'Flat spend'
    // — the weakest label in the product — for want of a branch. It rests on each investee's own reported
    // emissions, attributed by a balance-sheet ratio. 'Primary data' only while the score says so: the
    // reachable scores are 1 and 2 today, and a weaker tier must not inherit the strongest label.
    if (id === 'cat15') {
      const f = cat15Result()
      if (f.basis === 'decomposed') return f.dqScore !== null && f.dqScore <= 2 ? 'high' : 'medium'
    }
    if (spendPricedLine(id)) return 'exiobase_spend'
    if (d.annual_spend || d.total_spend) return 'low'
    return 'low'
  }

  // The pill labels. 'EXIOBASE spend' and 'Flat spend' both fit the 96px Method column at 9px — see the
  // column-width note above the results grid, which was measured against the longest pill.
  const confidenceConfig = {
    high: { label: 'Primary data', color: '#0F6E56', bg: '#E1F5EE' },
    medium: { label: 'Activity data', color: '#0C447C', bg: '#E6F1FB' },
    exiobase_spend: { label: 'EXIOBASE spend', color: '#0C447C', bg: '#E6F1FB' },
    low: { label: 'Flat spend', color: 'var(--color-module-climate)', bg: '#FEF3E2' },
  }

  /**
   * Whether a category appears in the record at all: the customer claims it, or it has a figure that has
   * to be reported (an exclusion justified by its own magnitude). Anything else is a category with no
   * answer and no data, and a row for it would say nothing.
   */
  const isReportable = (id: string): boolean => {
    const st = statusOf(id)
    return st.relevant === true || st.calculated
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
      const priced = spendPricedLine(id)
      const cur = spendCurrent(id)
      if (priced && cur?.kind === 'done') {
        const src = SPEND_EF_SOURCES.exiobase_38
        const cfg = SPEND_PRICED_CATEGORIES.find(c => c.id === id)
        return {
          basis: `${src.dataset} ${src.version}, spend-based`,
          detail: `Priced from ${src.dataset} version ${src.version} through factor edition ${cur.response.edition_id}, ` +
            `using the ${cfg?.factorType === 'product' ? 'product' : 'industry'} factor for ` +
            `${spendSectorLabel(id)} in ${regionLabel(priced.used_region)}, the EXIOBASE region for the inventory's ` +
            `country of supply, ${countryIso2 ? countryLabel(countryIso2) : 'which is not set'}.`,
        }
      }
      return notPriced
    }

    if (method === 'pcaf') {
      const f = cat15Result()
      // ⚠️ TWO BASES ONLY, AND "PCAF-aligned portfolio proxy" IS NO LONGER ONE OF THEM. There is nothing
      // left that could produce a figure from a portfolio value, so nothing here can claim one did.
      if (f.basis === 'override') {
        return { basis: 'Entered figure', detail: `${f.mt} mt CO2e of financed emissions entered directly; no emission factor was applied. PCAF scores a figure reported to you but not independently assured at data quality 2.` }
      }
      if (f.basis === 'decomposed' && f.assessment) {
        const a = f.assessment
        // The holding formula is the shared Category 15 sentence (lib/scope3/cat15.ts), not a local copy:
        // this detail reaches the CSV methodology note and the saved factor_basis column.
        return { basis: 'PCAF-aligned, per asset', detail: cat15DecomposedBasisDetail(a.assetCount, a.weightedDataQualityScore) }
      }
      return notPriced
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

    if (method === 'end_of_life_factors') {
      const e = evaluateEolMaterials(d?.eolMaterials)
      const skipped = e.notPriced.length > 0
        ? ` ${e.notPriced.length} ${e.notPriced.length === 1 ? 'material was' : 'materials were'} not priced: ${e.notPriced.map(x => `material ${x.n}, ${eolMaterialNotPricedReason(x)}`).join('; ')}.`
        : ''
      if (e.priced.length === 0) {
        return { basis: 'No data', detail: `No material with a complete treatment split was entered, so nothing was calculated.${skipped}` }
      }
      const source = (d?.eol_split_source ?? '').trim()
      return {
        basis: `${DEFRA_WASTE_META.source}, ${DEFRA_WASTE_META.sheet} sheet, per material and route, on the customer's split`,
        detail: `${scope3MethodDescription('end_of_life_factors')} ${e.priced.length} ${e.priced.length === 1 ? 'material' : 'materials'} priced.` +
          ` Source of the split: ${source || 'not recorded'}.${skipped}`,
      }
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
    if (anySpendPending) return
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
        // ⚠️ WHAT THAT TOTAL COVERS, SAVED WITH IT. The number alone cannot say whether it is two
        // categories or fifteen, and it is read as a Scope 3 BASELINE by the SBTi dashboard, where a
        // baseline is fixed for the life of a target. These five columns are nullable and unbackfilled:
        // an older row is UNRECORDED, not complete. Counts and map are written together on purpose —
        // see the migration for why the counts are not left to be derived by each consumer.
        scope3_categories_relevant: categoriesInScope.length,
        scope3_categories_in_total: categoriesInTotal.length,
        // ⚠️ THE NARROW SET. The column means "the platform could not price these", and unpricedCats is the
        // wider UI set that also holds categories nobody has filled in yet. Writing that one would have
        // reported an unfinished inventory as a platform failure.
        scope3_categories_unpriced: couldNotPriceCatIds.size,
        scope3_exclusions_unjustified: unjustifiedExclusions.length,
        scope3_coverage: scope3Coverage(),
        // Derived per included category from categoryBasis — the same statements the CSV carries. It was
        // the literal 'DEFRA/Exiobase (spend-based) · GHG Protocol category methodologies (activity-based)',
        // which was false. Still plain text in a column nothing reads; see the report on moving it to a
        // structured record on the factor_editions pattern.
        factor_basis: CATEGORIES.filter(c => isReportable(c.id))
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
   * ⚠️ EACH ROW REPORTS WHAT THE CALCULATION USED, NOT WHAT A SELECT DISPLAYS. Cat 15 used to show
   * unset value is reported as unset. Cat 1 no longer differs from Cat 2 and Cat 4 here: since the
   * company-sector fallback was removed, an unset supplier sector prices nothing and the row says so. And
   * Cat 15's portfolio value and sector are reported as RECORDED AND NOT USED, because since the lumped
   * proxy was withdrawn they are inputs to nothing — see lib/scope3/cat15.ts.
   */
  const estimateBasisRows = (): string[][] => {
    const out: string[][] = []

    // ⚠️ ONE BLOCK PER SPEND-PRICED CATEGORY, FROM THE SAME LIST THE PRICING USES. This was Cat 1 only,
    // written out by hand. A verifier needs the sector, the country, the region and the edition for EVERY
    // category priced that way, and a category added to SPEND_PRICED_CATEGORIES now appears here without
    // a second edit.
    for (const cfg of SPEND_PRICED_CATEGORIES) {
      const d = catData[cfg.id]
      const cat = CATEGORIES.find(c => c.id === cfg.id)
      if (!d || !cat || !isReportable(cfg.id)) continue
      const label = `Cat ${cat.num}`
      if (cfg.id === 'cat1' && d.has_supplier_data && d.supplier_emissions) {
        out.push([label, 'Basis', 'Supplier-specific emissions',
          'Entered as a figure; no spend-based estimate was made, so no sector, region or factor edition applies.'])
        continue
      }
      if (d.emissions_override) {
        out.push([label, 'Basis', 'Entered figure',
          'A known figure was entered for this category, so no spend-based estimate was made.'])
        continue
      }
      const priced = spendPricedLine(cfg.id)
      const cur = spendCurrent(cfg.id)
      // ⚠️ "CHOSEN", NOT "SET", AND IT MEANS IT. No spend-priced category defaults from the company
      // sector any more, so every code named in this file was selected by the customer for this category.
      // The Cat 1 branch survives only to say whether the choice matches the company sector, which is a
      // question a verifier asks of Cat 1 and of nothing else.
      const sectorNote = !spendSectorOf(cfg.id)
        ? 'No sector was selected for this category, so nothing was estimated. It is not defaulted from the company sector.'
        : cfg.id === 'cat1'
          ? (d.supplier_sector === sector
            ? 'The primary supplier sector chosen for Cat 1, which is the same as the company sector.'
            : `The primary supplier sector chosen for Cat 1. The company sector is ${sectorLabel(sector) || 'not set'}, and is not used to price any category.`)
          : `The ${cfg.factorType} chosen for this category. It is not defaulted from the company sector — capital goods and freight are different purchases.`
      out.push([label, cfg.factorType === 'product' ? 'Product used' : 'Sector used', spendSectorLabel(cfg.id), sectorNote])
      // ⚠️ THE CHOICE IS ALLOWED, SO THE EXPORT CARRIES IT. A row outside this category's boundary — waste
      // treatment priced as a capital good, freight priced as Category 1 — is a judgement the customer is
      // permitted to make and a verifier must be able to see; and a row EXIOBASE gives to two categories at
      // once (freight and passenger transport, hotels and restaurants) qualifies the figure even when it is
      // the ordinary choice. Neither is visible from the sector name alone. See lib/scope3/categoryScope.ts.
      const chosenCode = spendSectorOf(cfg.id)
      const scopeDisclosure = outOfScopeDisclosure(cfg.id, chosenCode)
      if (scopeDisclosure) out.push([label, 'Row outside this category', scopeDisclosure, 'The figure is included as entered; this records what was used.'])
      else {
        const joint = scopeNote(cfg.id, chosenCode)
        if (joint) out.push([label, 'Row scope', joint, 'EXIOBASE reports these together, so the row cannot be split.'])
      }
      out.push([label, 'Country of supply', countryIso2 ? countryLabel(countryIso2) : '',
        countryIso2 ? "The inventory's country of supply, used for every spend-priced category." : 'Not entered.'])
      const region = priced?.used_region ?? (countryIso2 ? countryByIso2(countryIso2)?.region_code : undefined)
      out.push([label, 'EXIOBASE region', region ? regionLabel(region) : '',
        priced ? 'The region whose factor priced this estimate.'
          : region ? 'The region this country resolves to. No estimate was priced.'
          : 'No country of supply, so no region.'])
      out.push([label, 'Factor edition', cur?.kind === 'done' ? cur.response.edition_id : '',
        priced ? '' : `Not priced. ${unpricedReason(cfg.id)}`])
      for (const sentence of spendSentences(cfg.id)) out.push([label, 'Disclosure', sentence, ''])
    }
    // ⚠️ THE BATCH COUNTS BELONG TO THE INVENTORY, NOT TO A CATEGORY. They count lines across one request,
    // which now carries several categories, so they are written once here rather than on any card.
    for (const sentence of spendBatchSummary()) out.push(['Spend estimates', 'Batch', sentence, ''])

    const c5 = catData['cat5']
    if (c5 && isReportable('cat5')) {
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

    // ⚠️ PER MATERIAL, THEN PER DERIVED ROUTE, so a verifier can redo every step: the tonnes entered, each
    // share, the tonnes each share gives, the factor the sheet publishes for that material and route, and
    // the result. Then the split's source, stated or recorded as missing, and the disclosures.
    const c12 = catData['cat12']
    if (c12 && isReportable('cat12')) {
      for (const e of cat12Eol.evaluated) {
        const mt = e.material
        const what = mt.waste_type ? `${mt.waste_type} (${mt.activity})` : ''
        const shares = Object.entries(mt.shares).filter(([, v]) => v).map(([r, v]) => `${r} ${formatShare(v)}%`).join(', ')
        if (e.outcome.status !== 'priced') {
          out.push(['Cat 12', `Material ${e.n}`, what, `Not priced: ${eolMaterialNotPricedReason(e)}.`])
          continue
        }
        out.push(['Cat 12', `Material ${e.n}`, what,
          `${mt.tonnes} t reaching end of life; shares ${shares} (sum ${formatShare(e.shareSum)}%); ${e.kg.toFixed(2)} kg CO2e in total.`])
        for (const x of e.routes) {
          if (x.pricing.status !== 'priced') continue
          out.push(['Cat 12', `Material ${e.n}, ${x.row.route}`, `${formatShare(mt.shares[x.row.route])}% of ${mt.tonnes} t = ${formatShare(x.row.tonnes)} t`,
            `${formatShare(x.row.tonnes)} t × ${x.pricing.factor_kg_per_tonne} kg CO2e per t = ${x.pricing.kg_co2e.toFixed(2)} kg CO2e; ${WASTE_METHOD_LABEL[x.pricing.method]}.`])
        }
      }
      if (cat12Eol.evaluated.length === 0) out.push(['Cat 12', 'Materials', '', 'None entered.'])
      out.push(['Cat 12', 'Split source', cat12SplitSource || 'Not recorded',
        cat12SplitSource ? "The customer's stated source for the treatment split."
          : 'No source was recorded for the treatment split. The GHG Protocol asks for the assumptions behind end-of-life treatment to be reported.'])
      for (const d of cat12Sentences) out.push(['Cat 12', 'Disclosure', d, ''])
    }

    const c15 = catData['cat15']
    if (c15 && isReportable('cat15')) {
      // ⚠️ THE ATTRIBUTION INPUTS, PER HOLDING. This block used to write ONE row naming a portfolio
      // sector, which is not something a verifier can check a financed-emissions figure against — and by
      // then was not even an input to it. Financed emissions are the investee's own emissions multiplied
      // by a ratio of two amounts, so the file carries both amounts, the ratio they produce, the PCAF data
      // quality of the investee figure, and whether the ratio was capped. Every number in the total is
      // re-derivable from these rows.
      const f = cat15Figure(c15)
      if (f.basis === 'override') {
        out.push(['Cat 15', 'Basis', 'Entered figure',
          `${f.mt} mt CO2e of financed emissions entered directly. No emission factor and no attribution were applied. PCAF scores a figure reported to you but not independently assured at data quality 2.`])
      } else if (f.basis === 'decomposed' && f.assessment) {
        const a = f.assessment
        out.push(['Cat 15', 'Basis', 'PCAF-aligned, per holding',
          `${a.assetCount} ${a.assetCount === 1 ? 'holding' : 'holdings'} assessed, emissions-weighted PCAF data quality ${a.weightedDataQualityScore.toFixed(1)} of 5.`])
        const stored = c15.pcafAssets ?? []
        a.perAsset.forEach((h, i) => {
          const row = stored.find(r => r.id === h.assetId)
          const cls = PCAF_ASSET_CLASSES.find(c => c.value === h.assetClass)
          out.push(['Cat 15', `Holding ${i + 1}`, cls?.label ?? h.assetClass,
            `Outstanding ${row?.outstandingAmount ?? ''} ${currency} over ${cls?.denominatorLabel.toLowerCase() ?? 'denominator'} ` +
            `${row?.denominator ?? ''} ${currency} = attribution factor ${(h.attributionFactor * 100).toFixed(2)}%` +
            `${h.capped ? ' (CAPPED at 100%: the outstanding amount exceeds the value it is divided by — check both figures)' : ''}. ` +
            `Investee emissions ${row?.emissions.reportedEmissions ?? ''} tCO2e (${h.basis}), PCAF data quality ${h.dqScore}. ` +
            `Financed emissions ${h.financedEmissions.toFixed(2)} tCO2e.`])
        })
      } else {
        out.push(['Cat 15', 'Basis', 'Not calculated', f.reason])
      }
      // ⚠️ THE GWP BASIS IS NOT RECORDED, AND THE FILE SAYS SO, for an entered total and for holdings alike.
      // The decomposed row used to end "on the AR6 basis the investee figures are reported on", read from a
      // value lib/pcaf stamped without asking anyone. The sentence is checked against the bound GHG
      // inventory's basis the way the waste categories' is, with no branch that claims the two agree.
      if (f.basis !== null) {
        out.push(['Cat 15', 'GWP basis', 'Not recorded', cat15GwpSentence(!!boundInventoryId, ghgGwpVersion)])
      }
      // ⚠️ RECORDED AND NOT USED, SAID OUT LOUD. A record saved before 17 Sep 2026 can carry both, and a
      // verifier reading the old figure needs to know they no longer price anything.
      if (c15.portfolio_value || c15.portfolio_sector) {
        out.push(['Cat 15', 'Portfolio value and sector on this record',
          [c15.portfolio_value ? `${c15.portfolio_value} ${currency}` : '', sectorLabel(c15.portfolio_sector)].filter(Boolean).join(', '),
          CAT15_RECORDED_NOT_USED])
      }
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
      // ⚠️ "COMPANY SECTOR", NOT "SECTOR". The estimate-basis block below writes a "Sector used" row per
      // priced category, and this one prices nothing — an unqualified "Sector" beside those reads as the
      // sector the figures came from, which it has not been since the Cat 1 fallback was removed.
      ['Company sector', sectorLabel(sector)],
      ['Reporting year', reportingYear],
      ['Total Scope 3', `${totalScope3.toFixed(2)} mt CO2e`],
      ...(unpricedCats.length > 0
        ? [['Excluded from total', `${unpricedCats.map(c => `Cat ${c.num} ${c.name}: ${unpricedReason(c.id)}`).join(' ')} Left out of the total rather than counted as zero.`]]
        : []),
      // ⚠️ IN THE HEADER, BECAUSE THE PER-CATEGORY COLUMN ONLY READS AS A GAP IF SOMEONE GETS THERE. The
      // Exclusion justification column says "No justification recorded" against the row it belongs to; this
      // line carries the same fact where a reader meets it first, and survives the file being quoted in
      // part. OMITTED ENTIRELY when every exclusion is justified: "0 of 3" would make a reader look for a
      // problem that is not there.
      ...(unjustifiedExclusions.length > 0
        ? [['Exclusions without justification', `${unjustifiedExclusions.length} of ${CATEGORIES.filter(c => catData[c.id]?.relevant === false).length} excluded categories carry no justification: ${unjustifiedExclusions.map(c => `Cat ${c.num} ${c.name}`).join(', ')}. The GHG Protocol requires one for each.`]]
        : []),
      // ⚠️ PRICED AND DISCLOSED, NOT BLOCKED, as an exclusion without a justification is: the figure stands,
      // and the file says where a reader meets it first that the assumption behind it has no stated source.
      ...(statusOf('cat12').calculated && !cat12SplitSource
        ? [['End-of-life split without a source', 'Category 12 is priced from a treatment split with no source recorded. The GHG Protocol asks for the assumptions behind end-of-life treatment to be reported.']]
        : []),
      ['Generated', new Date().toLocaleDateString()],
      [],
      ['SCOPE 3 BY CATEGORY'],
      // ⚠️ STATUS, NOT A YES/NO. The last column was 'Included' — 'Yes', or 'No — not material' for
      // everything else, which reported a category nobody had reached as a judgement the customer never
      // made. It now carries the CDP-shaped status, and the figure column shows a figure wherever one was
      // calculated, including for an excluded category, where the figure is what justifies the exclusion.
      // 'In total' says separately whether that figure is part of the claim.
      ['Category', 'Name', 'mt CO2e', 'Method', 'Confidence', 'Status', 'In total', 'Exclusion justification'],
      ...CATEGORIES.map(c => {
        const st = statusOf(c.id)
        const priced = st.calculated && !unpricedCatIds.has(c.id)
        return [
          `Cat ${c.num}`,
          c.name,
          priced ? getCatEmissions(c.id).toFixed(2) : (unpricedCatIds.has(c.id) ? 'not priced' : '—'),
          st.calculated ? scope3MethodDescription(scope3MethodFor(c.id)) : '—',
          st.calculated ? confidenceConfig[getConfidence(c.id)].label : '—',
          st.label,
          st.inTotal && priced ? 'Yes' : 'No',
          st.requiresExplanation ? (catData[c.id]?.excluded_reason || 'No justification recorded') : '',
        ]
      }),
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
      ...CATEGORIES.filter(c => isReportable(c.id)).map(c => {
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
      <p style={sectionSub}>Tell us about your organisation.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Company name</label>
          <input style={boundInventoryId ? { ...inputStyle, background: '#f8f7f5', color: 'var(--color-ink-muted)', cursor: 'not-allowed' } : inputStyle} value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corporation" readOnly={!!boundInventoryId} />
          {boundInventoryId && <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 6 }}>🔗 Linked to your {company || 'GHG'} {reportingYear} GHG inventory — company and year are set there.</div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {/* ⚠️ THIS SECTOR PRICES NOTHING AND SUGGESTS NOTHING, AND THE LABEL SAYS ONLY WHAT IS TRUE.
              It was Cat 1's fallback sector until that fallback was removed. I then labelled it as driving
              the materiality suggestions — which was ALSO false: the suggestion table was keyed on the
              retired thirteen-name vocabulary and this select emits EXIOBASE codes, so every lookup missed.
              That feature was removed on 18 Sep 2026. Recorded and printed is all that is left, so recorded
              and printed is what it claims. */}
          <label style={labelStyle}>Primary sector — what your company does</label>
          <select style={inputStyle} value={sector} onChange={e => setSector(e.target.value)}>
            <option value="">Select sector</option>
            <IndustryOptions />
          </select>
          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Recorded with the inventory and printed in your export. It does not price any category — Categories 1, 2 and 4 each ask for their own sector where you enter their spend.
          </div>
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
        <div style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>ThemisIQ follows the GHG Protocol Corporate Value Chain (Scope 3) Accounting and Reporting Standard. You must report every relevant category and explain each exclusion.</div>
      </div>
    </div>
  )

  const renderStep1 = () => (
    <div>
      <h2 style={sectionHead}>Relevance screening</h2>
      {/* ⚠️ THE CUSTOMER DECIDES, AND THE COPY SAYS SO. This claimed ThemisIQ had already identified the
          categories likely to matter for the customer's sector, above a suggestion feature that identified
          nothing for any selectable sector. The name is the COMPANY's: a category is relevant to a
          company, and the sector select holds an EXIOBASE industry, which reads as nonsense here. */}
      <p style={sectionSub}>Mark each category relevant or not relevant to {company ? <strong style={{ fontWeight: 600 }}>{company}</strong> : 'your company'}. The GHG Protocol judges relevance on size, influence, risk, stakeholder interest, outsourcing and sector guidance. Give a reason for any category you mark not relevant: CDP asks for one, and your export shows any exclusion made without one.</p>
      {/* ⚠️ NO SECTOR GATE. The list sat behind a "select your sector in Step 1 first" panel because the
          badges and the suggestion button read the sector. Nothing here does now, so the gate only stopped
          a customer answering relevance at all until they filled a field that affects no figure. The
          box calling the answers "suggestions, not limits" and the suggestion button went with it. */}
      {/* The two working instructions that box carried, kept: an answer is optional, and pressing the
          answer a category already holds clears it (setRelevance toggles back to null). */}
      <div style={{ fontSize: 12, color: 'var(--color-ink-muted)', lineHeight: 1.6, marginBottom: 16 }}>
        If you haven&apos;t decided, leave a category unanswered. To clear an answer, press it again.
      </div>
      <>
          {['Upstream', 'Downstream'].map(stream => (
            <div key={stream} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 10 }}>{stream}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {CATEGORIES.filter(c => c.stream === stream).map(cat => {
                  const relevant = catData[cat.id]?.relevant ?? null
                  const included = relevant === true
                  const excluded = relevant === false
                  const reason = catData[cat.id]?.excluded_reason || ''
                  return (
                    <div key={cat.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px', border: `1.5px solid ${included ? 'var(--color-brand)' : '#e8e7e4'}`, borderRadius: 10, background: included ? 'var(--color-brand-wash)' : '#fff' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', minWidth: 40 }}>Cat {cat.num}</span>
                          <span style={{ fontSize: 13, fontWeight: included ? 600 : 400, color: included ? 'var(--color-brand)' : '#0d0d0d' }}>{cat.name}</span>
                          {cat.num === 15 && (() => {
                            // ⚠️ "Spend-based estimate" WAS THE OTHER ARM OF THIS, and there is no longer a
                            // spend-based path to describe. The badge now names what the figure rests on, or
                            // says there is none yet — never a method that cannot run.
                            const f = cat15Result()
                            const label = f.basis === 'override' ? 'Reported · unverified'
                              : f.basis === 'decomposed' ? `Per asset · PCAF DQ ${f.dqScore?.toFixed(1)}`
                              : 'No figure yet'
                            return (
                              <span
                                title={f.basis ? `PCAF-aligned · data quality ${f.dqScore?.toFixed(1)} of 5` : 'PCAF-aligned · itemise the holdings or enter a figure'}
                                style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: f.basis ? '#E1F5EE' : '#FCEBEB', color: f.basis ? '#0F6E56' : '#B91C1C' }}
                              >{label}</span>
                            )
                          })()}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 2 }}>{cat.desc}</div>
                        {/* ⚠️ THE FIELD THE BOX ABOVE HAS ALWAYS PROMISED. "you must briefly justify any you
                            exclude" was true of the GHG Protocol and false of this form, which had nowhere to
                            write it. It does NOT gate this step: the justification belongs in the report, so
                            the export is where its absence is named. */}
                        {excluded && (
                          <div style={{ marginTop: 8, maxWidth: 520 }}>
                            <label htmlFor={`excl-${cat.id}`} style={{ ...labelStyle, marginBottom: 4 }}>Why is this category not relevant?</label>
                            <input
                              id={`excl-${cat.id}`}
                              style={{ ...inputStyle, fontSize: 12 }}
                              value={reason}
                              onChange={e => updateCat(cat.id, 'excluded_reason', e.target.value)}
                              placeholder="e.g. no leased assets in the reporting year"
                            />
                            {!reason.trim() && (
                              <div style={{ fontSize: 10, color: 'var(--color-module-climate)', marginTop: 4, lineHeight: 1.5 }}>
                                The GHG Protocol requires a justification for every excluded category. Until you write one, your export names this exclusion as unjustified.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* ⚠️ TWO BUTTONS, NOT A CHECKBOX. A checkbox has two states and the model has three, so
                          "not yet answered" and "judged not relevant" were the same empty box. aria-pressed
                          carries the answer to a screen reader, and pressing the active one clears it. The row
                          is no longer clickable as a whole: one click used to mean both answers, depending on
                          what the category already held. */}
                      <div role="group" aria-label={`Is Cat ${cat.num} ${cat.name} relevant?`} style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {([[true, 'Relevant'], [false, 'Not relevant']] as [boolean, string][]).map(([value, text]) => {
                          const on = relevant === value
                          return (
                            <button
                              key={text}
                              type="button"
                              aria-pressed={on}
                              title={on ? 'Clear this answer' : undefined}
                              onClick={() => setRelevance(cat.id, value)}
                              style={{ fontSize: 11, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${on ? (value ? 'var(--color-brand)' : 'var(--color-ink-muted)') : '#e8e7e4'}`, background: on ? (value ? 'var(--color-brand)' : '#f8f7f5') : '#fff', color: on ? (value ? 'var(--color-on-dark)' : '#0d0d0d') : '#555553' }}
                            >{text}</button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
      </>
    </div>
  )

  const renderStep2 = () => {
    // Claimed, or calculated and therefore reported: a category excluded on the strength of its own
    // figure keeps its panel and its row, because that figure is part of the record.
    const activeCats = CATEGORIES.filter(c => isReportable(c.id))
    return (
      <div>
        <h2 style={sectionHead}>Data entry</h2>
        <p style={sectionSub}>Enter data for each category you marked relevant. ThemisIQ will calculate emissions using the best available method.</p>

        {activeCats.length === 0 ? (
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No categories selected — go back to Step 2 to mark the relevant categories.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {activeCats.map(cat => (
              <div key={cat.id} style={{ border: '1px solid #e8e7e4', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ background: 'var(--color-sunken)', color: 'var(--color-ink)', borderBottom: '2px solid var(--color-ink)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-ink-muted)', marginRight: 10 }}>Cat {cat.num}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{cat.name}</span>
                  </div>
                  {SPEND_PRICED_IDS.includes(cat.id) && spendPending(cat.id) ? (
                    // In flight or debouncing: no figure at all, rather than the last one.
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)' }}>pricing…</span>
                  ) : unpricedCatIds.has(cat.id) ? (
                    // ⚠️ ONE BADGE, AND IT NAMES NO CAUSE. Cat 1 was moved off "no factor yet" when its
                    // spend path gained other ways to fail — no country, no active factor edition, a failed
                    // request — and the ternary left every other category on the old wording. That wording
                    // is a diagnosis the page has not made: a Cat 2 with no product chosen has nothing
                    // wrong with its factor, and a Cat 15 with no sector selected has not been looked up at
                    // all. What IS observed is that no figure was produced. unpricedReason, which the panel
                    // and the amber box below both render, is where the cause belongs — it quotes what was
                    // actually seen, per category.
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-module-climate)' }}>not priced</span>
                  ) : getCatEmissions(cat.id) > 0 && (
                    // The figure, and — where the customer has judged the category not relevant — why it is
                    // still here. Without the second half a number on a panel the total does not contain
                    // reads as a bug in the total.
                    <span style={{ fontSize: 11, fontWeight: 600, color: statusOf(cat.id).inTotal ? 'var(--color-module-ghg)' : 'var(--color-ink-muted)' }}>
                      {getCatEmissions(cat.id).toFixed(2)} mt CO₂e
                      {!statusOf(cat.id).inTotal && <span style={{ fontWeight: 500 }}> · {statusOf(cat.id).label.toLowerCase()}, not in the total</span>}
                    </span>
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
                        {/* ⚠️ NO DEFAULT, like Cat 2 and Cat 4. This read `supplier_sector || sector`, so
                            an untouched Cat 1 priced from the company's own sector — a row the customer
                            never chose, and one that describes what they SELL. See spendSectorOf. */}
                        <select style={inputStyle} value={catData['cat1']?.supplier_sector || ''} onChange={e => updateCat('cat1', 'supplier_sector', e.target.value)}>
                          <option value="">Select supplier sector</option>
                          <ScopedOptions catId="cat1" factorType="industry" selected={catData['cat1']?.supplier_sector || ''} showAll={!!showAllSectors['cat1']} />
                        </select>
                        <ShowAllToggle catId="cat1" on={!!showAllSectors['cat1']} onToggle={toggleShowAll} noun="sector" usualFor={CATEGORY_SCOPE_LABEL.cat1} />
                        <ScopeNoteUnderPicker catId="cat1" code={catData['cat1']?.supplier_sector || ''} />
                      </div>
                      {/* FULL PANEL WIDTH, below both controls. This used to sit inside the sector
                          column, about 130px wide, where every sentence wrapped to three or four words. */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        {renderSpendEstimate(cat.id, cat.name)}
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

                    <WasteRowsEditor
                      catId="cat5"
                      evaluated={cat5Evaluated}
                      onAdd={() => addWasteRow('cat5')}
                      onRemove={id => removeWasteRow('cat5', id)}
                      onUpdate={(id, patch) => updateWasteRow('cat5', id, patch)}
                      onSetMaterial={(id, key) => setWasteMaterial('cat5', id, key)}
                    />

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
                  {/* Cat 12 — end-of-life treatment of sold products: per material, tonnes reaching end of life
                      and a split across the routes the DEFRA/DESNZ sheet publishes, priced as Cat 5's rows. */}
                  {cat.id === 'cat12' && <>
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>What this figure is</div>
                      <p style={{ margin: '0 0 6px' }}>The expected end-of-life emissions of everything you sold in the reporting year. Most of them have not happened yet.</p>
                      <p style={{ margin: '0 0 6px' }}>The split across treatment routes is your assumption, and the export says so. The factors are UK factors, applied wherever your products were sold.</p>
                      <p style={{ margin: '6px 0 0', fontSize: 10 }}>
                        {DEFRA_WASTE_META.attribution_required}{' '}
                        <a href={DEFRA_WASTE_META.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{DEFRA_WASTE_META.licence}</a>
                      </p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label htmlFor="cat12-split-source" style={labelStyle}>Source of the treatment split</label>
                      <textarea id="cat12-split-source" style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={catData['cat12']?.eol_split_source ?? ''} onChange={e => updateCat('cat12', 'eol_split_source', e.target.value)} placeholder="For example: national waste statistics for the markets we sell into, 2024" />
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                        Where the shares come from: national waste statistics for the markets you sell into, an industry study of how your products are disposed of, or your own take-back data. Note your product lifetime assumptions here too.
                      </div>
                      {!cat12SplitSource && cat12Eol.priced.length > 0 && (
                        <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.5rem 0.6rem', marginTop: 6, lineHeight: 1.5 }}>
                          No source recorded. The figure is still calculated, and your export says the split has no stated source.
                        </div>
                      )}
                    </div>
                    <EolMaterialsEditor
                      evaluated={cat12Eol.evaluated}
                      onAdd={addEolMaterial}
                      onRemove={removeEolMaterial}
                      onSetMaterial={setEolMaterialType}
                      onUpdate={updateEolMaterial}
                      onSetShare={setEolShare}
                    />
                    {cat12Eol.priced.length > 0 && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <SpendFactorWorkings
                          id="cat12-eol"
                          figureMt={cat12Eol.mt}
                          summary={`${cat12Eol.priced.length} ${cat12Eol.priced.length === 1 ? 'material' : 'materials'} priced from the DEFRA/DESNZ ${DEFRA_WASTE_META.year} waste disposal factors, on your split across routes`}
                          sentences={cat12Sentences}
                        />
                      </div>
                    )}
                  </>}

                  {cat.id === 'cat15' && <>
                    {/* ⚠️ THE PORTFOLIO VALUE AND SECTOR INPUTS ARE GONE, along with the proxy that read
                        them. A balance at a date times an intensity per year of activity is not a quantity,
                        and no factor repairs it. The two fields remain in CategoryData so a saved record
                        still loads, and the export reports them as recorded and not used. */}
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', marginBottom: 8, lineHeight: 1.6 }}>
                      {/* The Category 15 sentences, from lib/scope3/cat15.ts — the same ones the methodology page,
                          the hierarchy line and the CSV use. Not typed here. */}
                      {CAT15_PANEL_METHOD}<br />
                      <strong>{CAT15_PANEL_NO_PROXY}</strong><br />
                      ThemisIQ is PCAF-aligned, not PCAF-certified and not a PCAF signatory.
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      {/* Number.isFinite, not truthiness: 0 is an answer. A customer whose portfolio
                          finances no emissions can now say so and be calculated at zero. */}
                      <label style={labelStyle}>Known financed emissions (mt CO₂e) — enter this if you already hold the figure</label>
                      <input style={inputStyle} type="number" value={Number.isFinite(catData['cat15']?.emissions_override) ? catData['cat15']?.emissions_override : ''} onChange={e => updateCat('cat15', 'emissions_override', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="Leave blank to itemise the holdings below" />
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>Enter 0 if this portfolio finances no emissions — that is an answer, and it is recorded as one. Leaving it blank is not.</div>
                    </div>
                    {(() => {
                      // ⚠️ IT DESCRIBES THE FIGURE THAT EXISTS, and says so plainly when none does. It used
                      // to read "PCAF data quality 5 of 5 (spend-based proxy)" whenever nothing had been
                      // entered — a quality score for a figure that was never in the total.
                      const f = cat15Result()
                      return (
                        <div style={{ gridColumn: '1 / -1', fontSize: 10, color: 'var(--color-ink-muted)', lineHeight: 1.5, marginTop: 2 }}>
                          {f.basis === null
                            ? 'No figure yet, so no data-quality score. '
                            : `This figure: PCAF data quality ${f.dqScore?.toFixed(1)} of 5 (${f.basis === 'override' ? 'reported to you, not independently assured' : 'per holding, emissions-weighted across the portfolio'}). `}
                          PCAF data quality: 1 = verified (best) … 5 = spend estimate (weakest). ThemisIQ produces no tier-4 or tier-5 estimate for this category.
                          {f.basis !== null && <><br />{cat15GwpSentence(!!boundInventoryId, ghgGwpVersion)}</>}
                        </div>
                      )
                    })()}

                    {/* ⚠️ NO MODE TOGGLE. It offered "Portfolio proxy (quick)" against "Itemise by asset
                        (PCAF)", and the quick one no longer computes anything, so the choice was between a
                        method and nothing. Holdings are now simply the path: add them and they are assessed.
                        `pcafMode` stays in CategoryData for records that stored it. */}
                    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <label style={labelStyle}>Holdings</label>
                      {cat15Assets().length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
                          No holdings yet. Add one per investment or loan — or enter a known figure above. Until one or the other is there, Category 15 is reported as not calculated, and is not counted as zero.
                        </div>
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
                            {/* ⚠️ THE REVENUE AND SECTOR INPUTS ARE GONE, AND THAT CLOSED A REAL HOLE.
                                PCAF's tier 4 estimates an investee from revenue × a sector factor, and
                                lib/pcaf will do it for any sector string. Every sector this page can offer
                                is an EXIOBASE code, none of which is in that factor table, so the estimate
                                always came from the 0.12 fallback. The page HID the row's figure in that
                                case and assessPortfolio estimated it anyway — a holding of 100m revenue
                                contributed 1,200 tCO2e to the portfolio total that the row itself refused to
                                show. The close is in the calculation now: lib/scope3/cat15.ts strips revenue
                                and sector before anything is assessed, which also covers rows already
                                saved with them. */}
                            <div style={{ gridColumn: '1 / -1' }}>
                              <label style={labelStyle}>Investee emissions (tCO₂e)</label>
                              <input style={inputStyle} type="number" value={row.emissions.reportedEmissions ?? ''} onChange={e => updatePcafEmissions(row.id, { reportedEmissions: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="The investee's own total emissions" />
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555553', marginTop: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={row.emissions.verified ?? false} onChange={e => updatePcafEmissions(row.id, { verified: e.target.checked })} />
                                Third-party verified
                              </label>
                              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
                                The investee&apos;s own reported figure — from their annual report, CDP response or a data provider. ThemisIQ does not estimate it from their revenue: that needs revenue-specific factors we do not hold, and the sector factors we do hold are not those.
                              </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {(() => {
                                // ⚠️ ASKED OF THE SAME FUNCTION THE TOTAL USES. holdingComputes runs the
                                // library's own assessAsset on the STRIPPED row, so a row that shows a
                                // figure here is a row the portfolio total contains, and one that says
                                // "complete this row" is one that withholds the whole figure.
                                if (!holdingComputes(row)) {
                                  // ⚠️ ONLY WHAT WITHHOLDS THE FIGURE. This said the holding "needs an outstanding
                                  // amount", which it does not: a blank outstanding amount is read as zero and the
                                  // holding computes (see the cat15-blank-outstanding-is-zero note). When that is
                                  // fixed, the outstanding amount goes back into this sentence.
                                  return <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>Complete this holding to compute: it needs the investee&apos;s emissions and the attribution value.</div>
                                }
                                const a = assessAsset({ ...row, emissions: assessableEmissions(row.emissions) })
                                return <div style={{ fontSize: 11, color: '#0F6E56', fontWeight: 600 }}>Financed: {a.financedEmissions.toFixed(1)} tCO₂e · {(a.attributionFactor * 100).toFixed(1)}% of the investee · PCAF DQ {a.dqScore}</div>
                              })()}
                            </div>
                          </div>
                        )
                      })}
                      <button onClick={addPcafAsset} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add holding</button>
                      {(() => {
                        const f = cat15Result()
                        // ⚠️ NO PARTIAL TOTAL, AND THE ROWS ARE NAMED. This said "showing the spend proxy
                        // until every row computes" — and it was doing exactly that: one unusable holding
                        // silently replaced the whole decomposed assessment with a 0.12 lump. There is no
                        // proxy to fall back to now, so an incomplete portfolio has NO figure and says
                        // which holdings are holding it up.
                        if (f.incomplete.length > 0) {
                          return (
                            <div role="status" style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.6rem 0.7rem', lineHeight: 1.5 }}>
                              {f.reason}
                            </div>
                          )
                        }
                        const r = f.assessment
                        if (!r) return null
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
                    </div>
                  </>}

                  {/* Cat 2 and Cat 4 — priced from EXIOBASE, each with its OWN sector */}
                  {SPEND_PRICED_IDS.includes(cat.id) && cat.id !== 'cat1' && (() => {
                    const cfg = SPEND_PRICED_CATEGORIES.find(c => c.id === cat.id)!
                    const isProduct = cfg.factorType === 'product'
                    return <>
                      <div>
                        <label style={labelStyle}>Annual spend ({currency})</label>
                        <input style={inputStyle} type="number" value={catData[cat.id]?.annual_spend || ''} onChange={e => updateCat(cat.id, 'annual_spend', Number(e.target.value))} placeholder="0" />
                      </div>
                      <div>
                        {/* ⚠️ NO DEFAULT, AND THAT IS THE POINT. Cat 1's select falls back to the company
                            sector; this one starts empty. A law firm's capital goods are not legal
                            services, and its inbound freight is not legal services either — defaulting
                            here would price three categories off one row while appearing to price three.
                            ⚠️ TWO DIFFERENT LISTS: Cat 2 offers EXIOBASE PRODUCTS (what was bought — a
                            machine, a vehicle), Cat 4 offers INDUSTRIES (who provided the service). The
                            route takes the table per line; see SPEND_PRICED_CATEGORIES. */}
                        <label style={labelStyle}>{isProduct ? 'What was bought (EXIOBASE product)' : 'Service provider sector (EXIOBASE industry)'}</label>
                        {/* ⚠️ SCOPED TO THIS CATEGORY, NOT FILTERED. The default list is the rows this
                            category normally buys; "show all" returns the whole table, and a row outside
                            the boundary can still be chosen — it is labelled in the list, disclosed under
                            the select and carried into the export. See lib/scope3/categoryScope.ts, and
                            the 17 Sep 2026 finding that put "Inert/metal waste for treatment" in Cat 2. */}
                        <select style={inputStyle} value={catData[cat.id]?.spend_sector || ''} onChange={e => updateCat(cat.id, 'spend_sector', e.target.value)}>
                          <option value="">{isProduct ? 'Select product' : 'Select sector'}</option>
                          <ScopedOptions catId={cfg.id} factorType={cfg.factorType} selected={catData[cat.id]?.spend_sector || ''} showAll={!!showAllSectors[cat.id]} />
                        </select>
                        <ShowAllToggle catId={cat.id} on={!!showAllSectors[cat.id]} onToggle={toggleShowAll} noun={isProduct ? 'product' : 'sector'} usualFor={CATEGORY_SCOPE_LABEL[cfg.id]} />
                        <ScopeNoteUnderPicker catId={cfg.id} code={catData[cat.id]?.spend_sector || ''} />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        {renderSpendEstimate(cat.id, cat.name)}
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Known emissions (mt CO₂e) — optional override</label>
                        <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder="Leave blank to use the spend-based estimate" />
                      </div>
                    </>
                  })()}

                  {/* Generic spend-based for the seven categories that keep the flat factor (3, 8, 9, 10, 11, 13
                      and 14). Cat 12 left on 18 Sep 2026 for its own panel above. */}
                  {!['cat1', 'cat2', 'cat4', 'cat6', 'cat7', 'cat5', 'cat12', 'cat15'].includes(cat.id) && <>
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
        <p style={sectionSub}>Your Scope 3 total across the categories marked relevant and calculated — GHG Protocol aligned.</p>
        <div className="tq-band" style={{ borderRadius: 16, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: 13 }}>
          Scope 3 results...
        </div>
      </div>
    )

    return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your Scope 3 total across the categories marked relevant and calculated — GHG Protocol aligned.</p>

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
            // ⚠️ A ROW CAN CARRY A FIGURE AND NO SHARE. A category the customer judged not relevant after
            // calculating it keeps its figure — that figure is the evidence for the exclusion — but it is not
            // part of the total, so it has no percentage OF that total. '—' rather than a 0% that would read
            // as "this category emits nothing".
            const st = statusOf(cat.id)
            const pct = st.inTotal && !unpriced && totalScope3 > 0 ? ((emissions / totalScope3) * 100).toFixed(1) : '0'
            const conf = getConfidence(cat.id)
            const ccfg = confidenceConfig[conf]
            return (
              <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 88px 84px 96px', columnGap: 8, padding: '12px 16px', borderBottom: i < activeCats.length - 1 ? '0.5px solid #f3f4f6' : 'none', alignItems: 'center', background: i === 0 ? '#fafafa' : '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-ink-muted)' }}>{cat.num}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0d0d0d' }}>{cat.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-ink-muted)' }}>{cat.stream}</div>
                  {!st.inTotal && st.calculated && (
                    <div style={{ fontSize: 10, color: 'var(--color-module-climate)', lineHeight: 1.4, marginTop: 2 }}>
                      {st.label} — reported, not in the total
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: st.inTotal ? '#0d0d0d' : 'var(--color-ink-muted)' }}>{emissions.toFixed(2)}</div>
                <div>
                  <div style={{ fontSize: 12, color: '#555553' }}>{st.inTotal ? `${pct}%` : '—'}</div>
                  {st.inTotal && (
                    <div style={{ height: 4, background: '#f3f4f6', borderRadius: 99, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: GRAD, borderRadius: 99 }} />
                    </div>
                  )}
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

        {/* A figure outside the total needs saying out loud, or it reads as a bug. */}
        {activeCats.some(c => { const st = statusOf(c.id); return !st.inTotal && st.calculated }) && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, maxWidth: '72ch' }}>
            A category you judged not relevant keeps the figure you calculated for it. The figure is shown because it
            is what justifies the exclusion — a category is easier to exclude when you can say how small it is — and it
            is left out of the total, because the total is what you are claiming as your inventory. Both appear in the
            export, under the category&apos;s status.
          </div>
        )}

        {/* ⚠️ "NOT MATERIAL" WAS WRONG TWICE OVER. Until 17 Sep 2026 this box listed every category that was
            not selected, including ones nobody had looked at, and called all of them "not material". It now
            lists ANSWERED exclusions only, and says "not relevant" — CDP's term, and the question the
            materiality step actually asks. Each exclusion carries the reason the customer gave, or says
            plainly that none is recorded yet. */}
        {CATEGORIES.filter(c => catData[c.id]?.relevant === false).length > 0 && (
          <div style={{ marginTop: 16, background: '#f8f7f5', border: '0.5px solid #e8e7e4', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 8 }}>EXCLUDED — JUDGED NOT RELEVANT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.filter(c => catData[c.id]?.relevant === false).map(c => {
                const reason = (catData[c.id]?.excluded_reason || '').trim()
                return (
                  <div key={c.id} style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>Cat {c.num} {c.name}:</strong>{' '}
                    {reason
                      ? reason
                      : <span style={{ color: 'var(--color-module-climate)' }}>No justification recorded. The GHG Protocol requires one for every excluded category — add it in the Relevance step.</span>}
                    {statusOf(c.id).calculated && <span style={{ color: 'var(--color-ink-muted)' }}> · calculated at {getCatEmissions(c.id).toFixed(2)} mt CO₂e, reported but not in the total.</span>}
                  </div>
                )
              })}
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

      {/* ⚠️ NAMED HERE, NOT BLOCKED HERE. The GHG Protocol wants the justification in the REPORT, so the
          moment it matters is the download, not the click that excluded the category. The export is not
          gated on it: a customer who has not written one yet still gets their inventory, and the file says
          "No justification recorded" against that category rather than leaving the cell blank. */}
      {unjustifiedExclusions.length > 0 && (
        <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-module-climate) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-module-climate)', marginBottom: 4 }}>
            {unjustifiedExclusions.length} excluded {unjustifiedExclusions.length === 1 ? 'category has' : 'categories have'} no justification
          </div>
          <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
            {unjustifiedExclusions.map(c => `Cat ${c.num} ${c.name}`).join(' · ')}. The GHG Protocol requires a
            justification for every category you exclude. You can export without one — the file records the exclusion
            as unjustified — but a reader of the report will be missing the reason.
          </div>
        </div>
      )}

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
          <button onClick={() => dataConfirmed && !anySpendPending && saveScope3()} disabled={!dataConfirmed || !boundInventoryId || saving || anySpendPending} style={{ ...((dataConfirmed && boundInventoryId && !saving && !anySpendPending) ? btnStepPrimary : btnStepPrimaryDisabled), marginRight: 12 }}>
            {/* ⚠️ NAMES THE CATEGORIES, RATHER THAN COUNTING THEM. "Waiting for the Cat 1 estimate…" was
                right while one category was priced; "Waiting for 2 estimates…" would tell a customer
                staring at Cat 4 nothing about whether it is the one holding them up. */}
            {saving ? 'Saving…'
              : anySpendPending ? `Waiting for the ${spendPendingIds.map(id => `Cat ${CATEGORIES.find(c => c.id === id)?.num ?? id}`).join(' and ')} estimate${spendPendingIds.length > 1 ? 's' : ''}…`
              : showSaved ? '✓ Saved to your inventory' : 'Save Scope 3 to inventory'}
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
                    { label: 'Company sector', val: sector ? industryName(sector) : '—' },
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
