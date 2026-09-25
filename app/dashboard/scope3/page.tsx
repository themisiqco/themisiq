'use client'

import { useState, useEffect, useRef } from 'react'
import Nav from '../../components/Nav'
import { supabase } from '../../../lib/supabase'
import { useEntitlementState } from '../../../lib/useEntitlement'
import { SPEND_EF_SOURCES } from '../../../lib/emissionFactors/spend'
import { scope3MethodFor, scope3MethodDescription, takesEnteredFigure } from '../../../lib/scope3/categoryMethods'
import { scope3ScopeClaim, scope3MethodFamilies } from '../../../lib/scope3/methodSummary'
import { scope3Status, relevanceFromStored, coverageEntry, type Relevance, type Scope3Status, type Scope3CoverageEntry } from '../../../lib/scope3/categoryStatus'
// ⚠️ NOTHING FROM lib/pcaf/engine. resolvePcafResult, imported here until 17 Sep 2026, chose between the
// decomposed assessment and the lumped spend proxy and answered with the proxy whenever any holding was
// incomplete; it was removed from lib/pcaf on 19 Sep 2026. lib/scope3/cat15.ts makes that choice explicitly,
// there is no proxy to choose, and the per-holding line asks cat15.ts's assessHolding.
import { INDUSTRY_OPTION_GROUPS, industryName } from '../../../lib/emissionFactors/industryOptions'
import { PRODUCT_OPTION_GROUPS, productName } from '../../../lib/emissionFactors/productOptions'
import { inScopeFor, scopeNote, outOfScopeDisclosure, CATEGORY_SCOPE_LABEL, type SpendCategoryId } from '../../../lib/scope3/categoryScope'
import { spendSector } from '../../../lib/scope3/spendSector'
import { SCOPE3_DATA_SOURCE } from '../../../lib/scope3/dataSources'
import { KNOWN_EMISSIONS_PLACEHOLDER, NO_ESTIMATE_PLACEHOLDER, RESULTS_TABLE_EMPTY, resultsTableAllUnpriced } from '../../../lib/scope3/formCopy'
import {
  cat15Figure, assessHolding, cat15HoldingIncomplete, CAT15_ASSESSMENT_FAILED, cat15HasPortfolioFields, type Cat15Figure,
  CAT15_GUIDANCE, CAT15_PANEL_METHOD, CAT15_PANEL_NO_PROXY, CAT15_RECORDED_NOT_USED,
  CAT15_HOLDINGS_SUPERSEDED, CAT15_HOLDING_NOT_USED, cat15OverrideEntered, type StoredHolding,
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
import { notEnteredReason } from '../../../lib/scope3/notEntered'
import { saveErrorText } from '../../../lib/scope3/saveError'
import { catDataForSave } from '../../../lib/scope3/savePayload'
import { cat3Fingerprint, cat3FingerprintChange, cat3FingerprintMoved } from '../../../lib/scope3/cat3Fingerprint'
import type { Cat3Surface } from '../../../lib/scope3/cat3Copy'
import {
  ghgHref, INVENTORY_NOT_OPENED_SCOPE3, type GhgStep,
} from '../../../lib/moduleLinks'
import {
  evaluateCommuting, hasLegacyCommuting, COMMUTE_MODES, COMMUTE_RAIL_TYPES,
  type CommuteRow, type HomeworkingRow, type EvaluatedCommute, type EvaluatedHomeworking,
} from '../../../lib/scope3/commuting'
import {
  CAT7_STAND_IN_SENTENCE, CAT7_ELECTRIC_SENTENCE, CAT7_OCCUPANCY_SENTENCE, CAT7_DAYS_SENTENCE, CAT7_HOMEWORKING_SENTENCE,
  cat7Sentences, cat7WorkingsSummary, cat7Basis, cat7LegacyNotice, commuteCsvRow, homeworkingCsvRow,
  commuteNotPricedReason, homeworkingNotPricedReason, commuteFlags, commuteDistanceText, CAR_FUEL_LABEL, COMMUTE_BUS_LABEL, TAXI_LABEL,
} from '../../../lib/scope3/commutingCopy'
import { CAR_SIZES, CAR_FUELS, MOTORBIKE_SIZES, TAXI_TYPES, BUS_TYPES, carFactor } from '../../../lib/emissionFactors/defraTravel'
import { publisherGwpSentence } from '../../../lib/scope3/gwpSentence'
import { DEFRA_TRAVEL_META, RAIL_TYPES } from '../../../lib/emissionFactors/defraTravel'
import { COUNTRY_OPTIONS } from '../../../lib/emissionFactors/countryOptions'
import {
  evaluateBusinessTravel, withDistance, CABIN_CHOICES,
  type FlightRow, type RailJourney, type DistanceUnit, type EvaluatedFlight, type EvaluatedRail,
} from '../../../lib/scope3/businessTravel'
import {
  CAT6_HOTEL_SENTENCE, CAT6_UPLIFT_SENTENCE, CAT6_DISTANCE_HELP, CAT6_RAIL_SENTENCE,
  cat6Sentences, cat6WorkingsSummary, cat6Basis, cat6RfHeader, cat6RfSentence, flightCsvRow, railCsvRow,
  flightRuleText, flightClassText, flightNotPricedReason, railNotPricedReason, AIR_CATEGORY_LABEL,
} from '../../../lib/scope3/businessTravelCopy'
// ── CATEGORY 3 ────────────────────────────────────────────────────────────────────────────────────
// The adapter reads the bound GHG inventory's saved workings and locations; the pricing module turns
// them into DEFRA-priced lines; the copy module is where every sentence about them lives. None of the
// three imports lib/ghg/engine.ts, so the Scope 3 bundle does not gain the engine's factor tables.
import { cat3InputsFrom } from '../../../lib/scope3/cat3Inputs'
import {
  buildCategorySnapshot, isUnreasonedRestatement, isMissingSnapshotSchema,
  type PendingCategorySnapshot, type SnapshotLine,
} from '../../../lib/scope3/categorySnapshot'
import {
  assuranceLabel, assuranceStatement, assuranceTone, showsAssuranceChip,
  assuranceSummarySentence, assuranceContradictionSentence, ASSURANCE_SCOPE_NOTE,
  type AssuranceTone,
} from '../../../lib/scope3/supplierAssurance'
import { priceCat3 } from '../../../lib/scope3/cat3Energy'
import {
  cat3Sentences, cat3WorkingsSummary, cat3NoFigure, cat3Basis, cat3CsvRows, CAT3_GWP_PUBLISHER,
  CAT3_GHG_LINKS, CAT3_SAVE_FIRST_HINT, CAT3_FIX_IN_GHG_HEADING, cat3GhgFixes, type Cat3GhgLinkKey,
  cat3StaleNotice, CAT3_3D_QUESTION, CAT3_3D_HELP, CAT3_3D_COOLING_NOTE, CAT3_3D_EXPORT_NOTE,
  cat3ThreeDWithheld, CAT3_3D_NOT_IN_TOTAL_TAG, CAT3_3D_LINES_NOT_IN_TOTAL, cat3RetiredSpendText, CAT3_DERIVED_SENTENCE, CAT3_EXCLUDES_COMBUSTION_SENTENCE, CAT3_STAND_IN_SENTENCE, CAT3_ATTRIBUTION,
} from '../../../lib/scope3/cat3Copy'
import { DEFRA_ENERGY_META } from '../../../lib/emissionFactors/defraEnergy'
import type { PcafAssetClass, EmissionInputs } from '../../../lib/pcaf/types'
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
  { id: 'cat1', num: 1, name: 'Purchased goods & services', stream: 'Upstream', desc: 'Emissions from producing goods and services you purchase', guidance: 'Emissions from producing everything you buy (raw materials, components, products and services) up to the point they reach you, cradle-to-gate. Usually the single largest Scope 3 category.', dataSource: SCOPE3_DATA_SOURCE.cat1 },
  { id: 'cat2', num: 2, name: 'Capital goods', stream: 'Upstream', desc: 'Emissions from producing capital equipment and assets you buy', guidance: 'Emissions from producing long-life assets you purchase, such as buildings, machinery, vehicles, IT equipment and infrastructure. Count the full cradle-to-gate footprint in the year acquired (not depreciated over time).', dataSource: SCOPE3_DATA_SOURCE.cat2 },
  { id: 'cat3', num: 3, name: 'Fuel & energy related', stream: 'Upstream', desc: 'Upstream emissions from extraction and production of fuels and energy you use', guidance: 'Upstream emissions of the fuel and electricity you use that aren\'t already in Scope 1 or 2: extracting, producing and transporting those fuels, plus grid transmission and distribution (T&D) losses.', dataSource: SCOPE3_DATA_SOURCE.cat3 },
  { id: 'cat4', num: 4, name: 'Upstream transportation', stream: 'Upstream', desc: 'Emissions from transporting purchased goods to your facilities', guidance: 'Emissions from transporting and distributing the goods you buy, between your suppliers and you, plus third-party logistics you pay for (inbound freight and warehousing).', dataSource: SCOPE3_DATA_SOURCE.cat4 },
  { id: 'cat5', num: 5, name: 'Waste generated in operations', stream: 'Upstream', desc: 'Emissions from disposal and treatment of waste generated', guidance: 'Emissions from third parties treating the waste your operations generate: landfill, combustion, recycling, composting and anaerobic digestion. Wastewater is not covered: the waste factors used here publish none.', dataSource: SCOPE3_DATA_SOURCE.cat5 },
  { id: 'cat6', num: 6, name: 'Business travel', stream: 'Upstream', desc: 'Emissions from employee travel for business purposes', guidance: 'Emissions from employees travelling for business (flights, rail, hotels, rental cars) in vehicles not owned by your company.', dataSource: SCOPE3_DATA_SOURCE.cat6 },
  { id: 'cat7', num: 7, name: 'Employee commuting', stream: 'Upstream', desc: 'Emissions from employees travelling to and from work', guidance: 'Emissions from employees travelling between home and work in vehicles your company does not own or operate. Working from home is optional under the GHG Protocol and is entered separately.', dataSource: SCOPE3_DATA_SOURCE.cat7 },
  { id: 'cat8', num: 8, name: 'Upstream leased assets', stream: 'Upstream', desc: 'Emissions from assets leased by your organisation', guidance: 'Emissions from assets you lease from others (as lessee) that aren\'t already in your Scope 1 and 2, e.g. leased offices or equipment you don\'t operationally control.', dataSource: SCOPE3_DATA_SOURCE.cat8 },
  // Downstream
  { id: 'cat9', num: 9, name: 'Downstream transportation', stream: 'Downstream', desc: 'Emissions from transporting and distributing sold products', guidance: 'Emissions from transporting and distributing the products you sell, after they leave you: outbound logistics, distribution centres, retail, paid for by others.', dataSource: SCOPE3_DATA_SOURCE.cat9 },
  { id: 'cat10', num: 10, name: 'Processing of sold products', stream: 'Downstream', desc: 'Emissions from processing your intermediate products by third parties', guidance: 'Emissions from third parties further processing your sold intermediate products before final use (e.g. you sell a component that\'s then assembled or refined).', dataSource: SCOPE3_DATA_SOURCE.cat10 },
  { id: 'cat11', num: 11, name: 'Use of sold products', stream: 'Downstream', desc: 'Emissions from end-users using your sold products', guidance: 'Emissions from customers using the products you sell over their lifetime. This is often the largest category for energy-using or fuel products.', dataSource: SCOPE3_DATA_SOURCE.cat11 },
  { id: 'cat12', num: 12, name: 'End-of-life treatment', stream: 'Downstream', desc: 'Emissions from disposal of your sold products at end of life', guidance: 'Emissions from the waste treatment of the products you sold in the reporting year, and of their packaging, at the end of their life: landfill, combustion, recycling, composting or anaerobic digestion. The figure covers all of that year\u2019s sales, so most of these emissions have not happened yet.', dataSource: SCOPE3_DATA_SOURCE.cat12 },
  { id: 'cat13', num: 13, name: 'Downstream leased assets', stream: 'Downstream', desc: 'Emissions from assets owned and leased to others', guidance: 'Emissions from assets you own and lease out to others (as lessor) that aren\'t in your Scope 1 and 2, e.g. property you rent to tenants.', dataSource: SCOPE3_DATA_SOURCE.cat13 },
  { id: 'cat14', num: 14, name: 'Franchises', stream: 'Downstream', desc: 'Emissions from franchise operations', guidance: 'Emissions from the operations of your franchisees. Relevant if you\'re a franchisor.', dataSource: SCOPE3_DATA_SOURCE.cat14 },
  { id: 'cat15', num: 15, name: 'Investments', stream: 'Downstream', desc: 'Emissions associated with investments and lending (financed emissions)', guidance: CAT15_GUIDANCE, dataSource: SCOPE3_DATA_SOURCE.cat15 },
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
    <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginTop: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>{title ?? '⚠ No spend factor for this sector yet'}</div>
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
function SpendFactorWorkings({ id, figureMt, summary, sentences, status }: {
  id: string
  figureMt: number
  summary: string
  sentences: string[]
  /**
   * ⚠️ A FIGURE THAT IS NOT IN THE TOTAL SAYS SO ON ITS OWN CARD. Optional, and only Category 3 passes
   * it today: when its activity D question is answered yes, the lines are real and the category is
   * withheld, so the header's bold figure would otherwise read as a Category 3 total in a screenshot
   * or a skim. Rendered in the header, beside the figure, not below the fold.
   */
  status?: string
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
          {/* ⚠️ ONE UNBREAKABLE TOKEN. At narrow widths the header wrapped between "12.73 mt" and
              "CO₂e", with the status chip landing between the two halves of one figure. nowrap keeps
              the number and its unit together; the summary after it still wraps as before, so the
              other categories' headers (this card is shared with Cats 5, 6, 7 and 12) are unchanged
              except that their figure can no longer split either. */}
          <strong style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{figureMt.toFixed(2)} mt CO₂e</strong>
          {status && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#92400E', background: '#FEF3C7', borderRadius: 99, padding: '2px 8px', marginLeft: 8, whiteSpace: 'nowrap' }}>{status}</span>
          )}
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
              const text = [o.name, o.note, scopeNote(catId, o.code)].filter(Boolean).join(' · ')
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
        ? `Showing every EXIOBASE ${noun}: show only the ${noun}s usual for ${usualFor}`
        : `Showing the ${noun}s usual for ${usualFor}: show every EXIOBASE ${noun}`}
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
              <input id={fieldId('tonnes')} style={inputStyle} type="number" min={0} value={m.tonnes || ''} onChange={ev => onUpdate(m.id, { tonnes: Number(ev.target.value) })} placeholder="e.g. 12" />
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
                      <input id={fieldId(`share-${r}`)} style={inputStyle} type="number" min={0} max={100} value={m.shares[r] ?? ''} onChange={ev => onSetShare(m.id, r, ev.target.value === '' ? undefined : Number(ev.target.value))} placeholder="e.g. 40" />
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
            <input id={fieldId('tonnes')} style={inputStyle} type="number" min={0} value={row.tonnes || ''} onChange={e => onUpdate(row.id, { tonnes: Number(e.target.value) })} placeholder="e.g. 3.5" />
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

/** A distance input with its unit beside it. The one conversion to km happens in withDistance. */
function DistanceField({ fieldId, distance, unit, onChange }: {
  fieldId: string
  distance: number | undefined
  unit: DistanceUnit
  onChange: (next: ReturnType<typeof withDistance>) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input id={fieldId} style={{ ...inputStyle, flex: 1 }} type="number" min={0} value={distance ?? ''} onChange={e => onChange(withDistance(e.target.value === '' ? undefined : Number(e.target.value), unit))} placeholder="e.g. 850" />
      <select aria-label="Distance unit" style={{ ...inputStyle, width: 88 }} value={unit} onChange={e => onChange(withDistance(distance, e.target.value as DistanceUnit))}>
        <option value="km">km</option>
        <option value="mi">miles</option>
      </select>
    </div>
  )
}

/** Every country the product offers, by the ISO2 code it stores. */
function CountrySelect({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (iso2: string) => void; placeholder: string }) {
  return (
    <select id={id} style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {COUNTRY_OPTIONS.map(o => <option key={o.iso2} value={o.iso2}>{o.display_name}</option>)}
    </select>
  )
}

const kgText = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 2 })
/** Currency amounts in prose. Same convention as kgText, which the page uses for kg and km; the page
 *  had no currency formatter before 20 Sep 2026 and the basis detail printed the raw number. */
const amountText = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 2 })

/**
 * Cat 6 flight legs: one row per leg, priced from lib/scope3/businessTravel.ts. Every figure shown here is
 * the evaluation's, and every sentence is built in businessTravelCopy.ts.
 */
function FlightsEditor({ evaluated, includeRf, onAdd, onRemove, onUpdate }: {
  evaluated: readonly EvaluatedFlight[]
  includeRf: boolean
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<FlightRow>) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>Flight legs</div>
      {evaluated.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
          No flight legs yet. Add one row per leg flown: a return trip is two legs, and a journey with a stop is one leg per flight.
        </div>
      )}
      {evaluated.map(({ row, n, pricing }) => {
        const fieldId = (f: string) => `cat6-flight-${row.id}-${f}`
        return (
          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Flight leg {n}</span>
              <button type="button" aria-label={`Remove flight leg ${n}`} onClick={() => onRemove(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
            <div>
              <label htmlFor={fieldId('origin')} style={labelStyle}>From</label>
              <CountrySelect id={fieldId('origin')} value={row.origin_iso2} onChange={v => onUpdate(row.id, { origin_iso2: v })} placeholder="Origin country" />
            </div>
            <div>
              <label htmlFor={fieldId('destination')} style={labelStyle}>To</label>
              <CountrySelect id={fieldId('destination')} value={row.destination_iso2} onChange={v => onUpdate(row.id, { destination_iso2: v })} placeholder="Destination country" />
            </div>
            <div>
              <label htmlFor={fieldId('class')} style={labelStyle}>Cabin class</label>
              <select id={fieldId('class')} style={inputStyle} value={row.cabin_class} onChange={e => onUpdate(row.id, { cabin_class: e.target.value as FlightRow['cabin_class'] })}>
                <option value="">Select class</option>
                {CABIN_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('count')} style={labelStyle}>Passengers or trips</label>
              <input id={fieldId('count')} style={inputStyle} type="number" min={0} value={row.count ?? ''} onChange={e => onUpdate(row.id, { count: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="e.g. 2" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor={fieldId('distance')} style={labelStyle}>Distance, one way</label>
              <DistanceField fieldId={fieldId('distance')} distance={row.distance} unit={row.distance_unit} onChange={next => onUpdate(row.id, next)} />
              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>{CAT6_DISTANCE_HELP}</div>
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
              {pricing.status === 'priced' ? (
                <span style={{ color: '#555553' }}>
                  {kgText(pricing.km)} km · {AIR_CATEGORY_LABEL[pricing.category]} ({flightRuleText(pricing)}) · class: {flightClassText(pricing, row.cabin_class.replace('_', ' '))}
                  <br />
                  Combustion {kgText(includeRf ? pricing.kg.with_rf.kg_co2e : pricing.kg.without_rf.kg_co2e)} kg CO₂e ({includeRf ? `without radiative forcing ${kgText(pricing.kg.without_rf.kg_co2e)}` : `with radiative forcing ${kgText(pricing.kg.with_rf.kg_co2e)}`}) + well-to-tank {kgText(pricing.kg.wtt)} = <strong style={{ fontWeight: 600 }}>{kgText(pricing.kg.total)} kg CO₂e</strong>
                </span>
              ) : pricing.status === 'no_haul' || pricing.status === 'distance_mismatch' ? (
                <span style={{ color: '#92400e' }}>⚠ Not counted: {flightNotPricedReason(pricing, countryLabel)}.</span>
              ) : (
                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {pricing.missing.join(', ')}.</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add flight leg</button>
    </div>
  )
}

/** Cat 6 rail journeys: one row per journey type, priced from the sheet's UK rail factors. */
function RailJourneysEditor({ evaluated, onAdd, onRemove, onUpdate }: {
  evaluated: readonly EvaluatedRail[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<RailJourney>) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>Rail journeys</div>
      {evaluated.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
          No rail journeys yet. Add one row per journey type: the country, the kind of rail, the distance and the passengers.
        </div>
      )}
      {evaluated.map(({ row, n, pricing }) => {
        const fieldId = (f: string) => `cat6-rail-${row.id}-${f}`
        return (
          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Rail journey {n}</span>
              <button type="button" aria-label={`Remove rail journey ${n}`} onClick={() => onRemove(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
            <div>
              <label htmlFor={fieldId('country')} style={labelStyle}>Country</label>
              <CountrySelect id={fieldId('country')} value={row.country_iso2} onChange={v => onUpdate(row.id, { country_iso2: v })} placeholder="Country" />
            </div>
            <div>
              <label htmlFor={fieldId('type')} style={labelStyle}>Rail type</label>
              <select id={fieldId('type')} style={inputStyle} value={row.rail_type} onChange={e => onUpdate(row.id, { rail_type: e.target.value })}>
                <option value="">Select rail type</option>
                {RAIL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('distance')} style={labelStyle}>Distance</label>
              <DistanceField fieldId={fieldId('distance')} distance={row.distance} unit={row.distance_unit} onChange={next => onUpdate(row.id, next)} />
            </div>
            <div>
              <label htmlFor={fieldId('passengers')} style={labelStyle}>Passengers</label>
              <input id={fieldId('passengers')} style={inputStyle} type="number" min={0} value={row.passengers ?? ''} onChange={e => onUpdate(row.id, { passengers: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="e.g. 2" />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
              {pricing.status === 'priced' ? (
                <span style={{ color: '#555553' }}>
                  {kgText(pricing.km)} km · combustion {kgText(pricing.kg.combustion)} kg CO₂e + well-to-tank {kgText(pricing.kg.wtt)} = <strong style={{ fontWeight: 600 }}>{kgText(pricing.kg.total)} kg CO₂e</strong>
                  {pricing.uk_stand_in && <><br /><span style={{ color: '#92400e' }}>⚠ UK rail factor used as a stand-in outside the UK.</span></>}
                </span>
              ) : pricing.status === 'no_factor' || pricing.status === 'distance_mismatch' ? (
                <span style={{ color: '#92400e' }}>⚠ Not counted: {railNotPricedReason(pricing)}.</span>
              ) : (
                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {pricing.missing.join(', ')}.</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add rail journey</button>
    </div>
  )
}

/** A number input that writes undefined when cleared: blank is missing, never 0. */
function NumberField({ id, value, onChange, placeholder }: { id: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder: string }) {
  // step="any": a browser's default step of 1 would flag 1.3 (an average-occupancy survey figure) as invalid.
  return <input id={id} style={inputStyle} type="number" min={0} step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} placeholder={placeholder} />
}

/**
 * Cat 7 commuting groups: one row per group of employees who commute the same way, priced by
 * lib/scope3/commuting.ts. No mode is preselected, and nothing is defaulted: a blank field is missing.
 */
function CommuteRowsEditor({ evaluated, onAdd, onRemove, onUpdate }: {
  evaluated: readonly EvaluatedCommute[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<CommuteRow>) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>Commuting groups</div>
      {evaluated.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
          No commuting groups yet. Add one row for each group of employees who commute the same way: the same mode, a similar distance and the same number of days.
        </div>
      )}
      {evaluated.map(({ row, n, pricing }) => {
        const fieldId = (f: string) => `cat7-commute-${row.id}-${f}`
        const fuels = row.car_size ? CAR_FUELS.filter(f => carFactor(row.car_size!, f) !== null) : CAR_FUELS
        const perVehicle = row.mode === 'car' || row.mode === 'motorbike'
        return (
          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Commuting group {n}</span>
              <button type="button" aria-label={`Remove commuting group ${n}`} onClick={() => onRemove(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
            <div>
              <label htmlFor={fieldId('mode')} style={labelStyle}>Mode</label>
              <select id={fieldId('mode')} style={inputStyle} value={row.mode} onChange={e => onUpdate(row.id, { mode: e.target.value as CommuteRow['mode'] })}>
                <option value="">Select mode</option>
                {COMMUTE_MODES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={fieldId('country')} style={labelStyle}>Country</label>
              <CountrySelect id={fieldId('country')} value={row.country_iso2} onChange={v => onUpdate(row.id, { country_iso2: v })} placeholder="Where they commute" />
            </div>
            {row.mode === 'car' && <>
              <div>
                <label htmlFor={fieldId('car-size')} style={labelStyle}>Car size</label>
                <select id={fieldId('car-size')} style={inputStyle} value={row.car_size ?? ''} onChange={e => {
                  const size = e.target.value as CommuteRow['car_size']
                  onUpdate(row.id, { car_size: size, car_fuel: size && row.car_fuel && carFactor(size, row.car_fuel) === null ? '' : row.car_fuel })
                }}>
                  <option value="">Select size</option>
                  {CAR_SIZES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={fieldId('car-fuel')} style={labelStyle}>Fuel</label>
                <select id={fieldId('car-fuel')} style={inputStyle} value={row.car_fuel ?? ''} onChange={e => onUpdate(row.id, { car_fuel: e.target.value as CommuteRow['car_fuel'] })}>
                  <option value="">Select fuel</option>
                  {fuels.map(f => <option key={f} value={f}>{CAR_FUEL_LABEL[f].charAt(0).toUpperCase() + CAR_FUEL_LABEL[f].slice(1)}</option>)}
                </select>
              </div>
            </>}
            {row.mode === 'motorbike' && (
              <div>
                <label htmlFor={fieldId('motorbike-size')} style={labelStyle}>Motorbike size</label>
                <select id={fieldId('motorbike-size')} style={inputStyle} value={row.motorbike_size ?? ''} onChange={e => onUpdate(row.id, { motorbike_size: e.target.value as CommuteRow['motorbike_size'] })}>
                  <option value="">Select size</option>
                  {MOTORBIKE_SIZES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            )}
            {row.mode === 'taxi' && (
              <div>
                <label htmlFor={fieldId('taxi')} style={labelStyle}>Taxi type</label>
                <select id={fieldId('taxi')} style={inputStyle} value={row.taxi_type ?? ''} onChange={e => onUpdate(row.id, { taxi_type: e.target.value as CommuteRow['taxi_type'] })}>
                  <option value="">Select type</option>
                  {TAXI_TYPES.map(t => <option key={t} value={t}>{TAXI_LABEL[t].charAt(0).toUpperCase() + TAXI_LABEL[t].slice(1)}</option>)}
                </select>
              </div>
            )}
            {row.mode === 'bus' && (
              <div>
                <label htmlFor={fieldId('bus')} style={labelStyle}>Bus type</label>
                <select id={fieldId('bus')} style={inputStyle} value={row.bus_type ?? ''} onChange={e => onUpdate(row.id, { bus_type: e.target.value as CommuteRow['bus_type'] })}>
                  <option value="">Select type</option>
                  {BUS_TYPES.filter(t => t !== 'coach').map(t => <option key={t} value={t}>{COMMUTE_BUS_LABEL[t].charAt(0).toUpperCase() + COMMUTE_BUS_LABEL[t].slice(1)}</option>)}
                </select>
              </div>
            )}
            {row.mode === 'rail' && (
              <div>
                <label htmlFor={fieldId('rail')} style={labelStyle}>Rail type</label>
                <select id={fieldId('rail')} style={inputStyle} value={row.rail_type ?? ''} onChange={e => onUpdate(row.id, { rail_type: e.target.value as CommuteRow['rail_type'] })}>
                  <option value="">Select type</option>
                  {COMMUTE_RAIL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {perVehicle && (
              <div>
                <label htmlFor={fieldId('occupancy')} style={labelStyle}>People per {row.mode === 'car' ? 'car' : 'motorbike'}</label>
                <NumberField id={fieldId('occupancy')} value={row.occupancy} onChange={v => onUpdate(row.id, { occupancy: v })} placeholder={row.mode === 'car' ? 'e.g. 1 alone, or 1.3 as a survey average' : 'e.g. 1, up to 2 with a passenger'} />
              </div>
            )}
            <div>
              <label htmlFor={fieldId('employees')} style={labelStyle}>Employees in the group</label>
              <NumberField id={fieldId('employees')} value={row.employees} onChange={v => onUpdate(row.id, { employees: v })} placeholder="e.g. 25" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor={fieldId('distance')} style={labelStyle}>Distance, one way</label>
              <DistanceField fieldId={fieldId('distance')} distance={row.distance} unit={row.distance_unit} onChange={next => onUpdate(row.id, next)} />
            </div>
            <div>
              <label htmlFor={fieldId('days')} style={labelStyle}>Days commuted per week</label>
              <NumberField id={fieldId('days')} value={row.days_per_week} onChange={v => onUpdate(row.id, { days_per_week: v })} placeholder="e.g. 3" />
            </div>
            <div>
              <label htmlFor={fieldId('weeks')} style={labelStyle}>Weeks worked per year</label>
              <NumberField id={fieldId('weeks')} value={row.weeks_per_year} onChange={v => onUpdate(row.id, { weeks_per_year: v })} placeholder="e.g. 46" />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
              {pricing.status === 'priced' ? (
                <span style={{ color: '#555553' }}>
                  {kgText(pricing.annual_km_per_commuter)} km a year per commuter
                  {' · '}{commuteDistanceText(pricing)}
                  {' · '}combustion {kgText(pricing.kg.combustion)} + well-to-tank {kgText(pricing.kg.wtt)} = <strong style={{ fontWeight: 600 }}>{kgText(pricing.kg.total)} kg CO₂e</strong>
                  {commuteFlags(pricing).map(f => <span key={f}><br /><span style={{ color: '#92400e' }}>⚠ {f.charAt(0).toUpperCase() + f.slice(1)}.</span></span>)}
                </span>
              ) : pricing.status === 'incomplete' ? (
                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {pricing.missing.join(', ')}.</span>
              ) : (
                <span style={{ color: '#92400e' }}>⚠ Not counted: {commuteNotPricedReason(pricing)}.</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add commuting group</button>
    </div>
  )
}

/** Cat 7 homeworking groups: optional, priced for employees in the UK only. */
function HomeworkingRowsEditor({ evaluated, onAdd, onRemove, onUpdate }: {
  evaluated: readonly EvaluatedHomeworking[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, patch: Partial<HomeworkingRow>) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0d0d0d' }}>Homeworking (optional)</div>
      {evaluated.map(({ row, n, pricing }) => {
        const fieldId = (f: string) => `cat7-home-${row.id}-${f}`
        return (
          <div key={row.id} style={{ border: '1px solid #e8e7e4', borderRadius: 10, padding: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#555553' }}>Homeworking group {n}</span>
              <button type="button" aria-label={`Remove homeworking group ${n}`} onClick={() => onRemove(row.id)} style={{ fontSize: 11, color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
            </div>
            <div>
              <label htmlFor={fieldId('country')} style={labelStyle}>Country</label>
              <CountrySelect id={fieldId('country')} value={row.country_iso2} onChange={v => onUpdate(row.id, { country_iso2: v })} placeholder="Where they work from home" />
            </div>
            <div>
              <label htmlFor={fieldId('employees')} style={labelStyle}>Employees in the group</label>
              <NumberField id={fieldId('employees')} value={row.employees} onChange={v => onUpdate(row.id, { employees: v })} placeholder="e.g. 25" />
            </div>
            <div>
              <label htmlFor={fieldId('days')} style={labelStyle}>Homeworking days per week</label>
              <NumberField id={fieldId('days')} value={row.days_per_week} onChange={v => onUpdate(row.id, { days_per_week: v })} placeholder="e.g. 2" />
            </div>
            <div>
              <label htmlFor={fieldId('weeks')} style={labelStyle}>Weeks worked per year</label>
              <NumberField id={fieldId('weeks')} value={row.weeks_per_year} onChange={v => onUpdate(row.id, { weeks_per_year: v })} placeholder="e.g. 46" />
            </div>
            <div>
              <label htmlFor={fieldId('hours')} style={labelStyle}>Hours per day</label>
              <NumberField id={fieldId('hours')} value={row.hours_per_day} onChange={v => onUpdate(row.id, { hours_per_day: v })} placeholder="e.g. 7.5" />
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.5 }}>
              {pricing.status === 'priced' ? (
                <span style={{ color: '#555553' }}>
                  {kgText(pricing.hours)} FTE working hours × {pricing.factor} kg CO₂e per hour = <strong style={{ fontWeight: 600 }}>{kgText(pricing.kg)} kg CO₂e</strong>
                </span>
              ) : pricing.status === 'incomplete' ? (
                <span style={{ color: 'var(--color-ink-muted)' }}>Not priced until entered: {pricing.missing.join(', ')}.</span>
              ) : (
                <span style={{ color: '#92400e' }}>⚠ Not counted: {homeworkingNotPricedReason(pricing)}.</span>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" onClick={onAdd} style={{ fontSize: 12, padding: '8px 16px', borderRadius: 8, background: 'none', border: '0.5px solid var(--color-brand)', color: 'var(--color-brand)', cursor: 'pointer', alignSelf: 'flex-start' }}>+ Add homeworking group</button>
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
  /**
   * Cat 3: which activity rows in the bound GHG inventory produced the figure saved with this record.
   *
   * ⚠️ WRITTEN AT SAVE, READ ON LOAD, AND NEVER HELD IN THE PAGE'S OWN catData. It is a property of the
   * SAVED record, not of what is on screen: the page recalculates Category 3 from the bound inventory
   * on every render, so only the stored figure can go stale. lib/scope3/cat3Fingerprint.ts builds and
   * compares it; `unknown` here because a record saved by an older version may carry any shape, and the
   * reader validates rather than assumes.
   */
  source_fingerprint?: unknown
  /**
   * Cat 3, activity D: does the company buy energy and sell it on to end users?
   *
   * ⚠️ THREE STATES, AND undefined IS ONE OF THEM. true withholds the category, false prices it, and
   * undefined is a record that has not been asked — every record saved before 20 Sep 2026, and every
   * new one until the screening step is answered. An unanswered question must NOT withhold: absence of
   * an answer is not a yes, and treating it as one would empty the Category 3 figure out of every
   * record already saved.
   */
  sells_energy_on?: boolean
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
  // Cat 6 — one row per flight leg and per rail journey, priced from lib/emissionFactors/defraTravel2026.json
  // by lib/scope3/businessTravel.ts. include_rf is the inventory's radiative forcing setting; absent means
  // included. The previous fields (flight counts, hotel nights, rail km) are gone: no saved data used them.
  flights?: FlightRow[]
  rail_journeys?: RailJourney[]
  include_rf?: boolean
  // Cat 7 — one row per group of employees who commute the same way, and optional homeworking rows, priced
  // from lib/emissionFactors/defraTravel2026.json by lib/scope3/commuting.ts.
  commute_rows?: CommuteRow[]
  homeworking_rows?: HomeworkingRow[]
  // ⚠️ THE PREVIOUS CAT 7 FORM. NEVER PRICED, NEVER WRITTEN, AND NEVER REMOVED. No input sets these any more
  // and no calculation reads them; they are typed only so a record saved under the old form can say what it
  // holds (cat7LegacyNotice). Saves spread the stored cat7 object, so the values stay in cat_data as they were.
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
  pcafAssets?: StoredHolding[] // outstandingAmount may be absent: blank is missing, not 0
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
  // Why the last save was refused, in words, from lib/scope3/saveError.ts. null when none was.
  const [saveError, setSaveError] = useState<string | null>(null)
  /** Why an id in the URL did not open, or null. Shown in the picker gate. */
  const [bindError, setBindError] = useState<string | null>(null)
  // ⚠️ THE FINGERPRINT SAVED WITH THE RECORD, HELD BESIDE savedTotal AND FOR THE SAME REASON. Category 3
  // is the only category whose inputs live in another module, so the SAVED figure can go stale while the
  // screen stays current. null means no comparison is possible: a record saved before this field
  // existed, or none bound yet. It is never written into catData, because that would re-arm the Save
  // button on every restore.
  const [savedCat3Fingerprint, setSavedCat3Fingerprint] = useState<unknown>(null)
  const [boundInventoryId, setBoundInventoryId] = useState<string | null>(null)
  // The bound GHG inventory's recorded GWP basis (ghg_inventories.gwp_version: AR4, AR5, AR6 or null).
  // Read so the Cat 5 disclosure can state whether its AR5 factors match it, rather than assume either way.
  const [ghgGwpVersion, setGhgGwpVersion] = useState<string | null>(null)
  // ── THE BOUND INVENTORY'S ENERGY, WHICH IS CATEGORY 3'S ONLY INPUT ───────────────────────────
  // bindToInventory already fetches the whole ghg_inventories row and threw these two columns away
  // until 20 Sep 2026. `workings` carries the activity that actually priced, with the inventory's
  // coverage resolutions applied; `locations_data` carries the country and the declaration answers
  // that `workings` does not. lib/scope3/cat3Inputs.ts reads both and validates their shape itself,
  // which is why they are held as `unknown`: an inventory saved before either column existed is a
  // case it answers with a reason, not a crash.
  const [boundWorkings, setBoundWorkings] = useState<unknown>(null)
  const [boundLocations, setBoundLocations] = useState<unknown>(null)
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
  // ⚠️ THE LINE SHAPE IS SnapshotLine, IMPORTED, NOT REDECLARED. A local copy stood here and drifted
  // from the route the moment the route gained a field, which is how a figure and the record of what it
  // was made of come to disagree. `assurance` is required on SnapshotLine, so this page cannot hold a
  // line the snapshot could not have frozen.
  type CatOneLine = SnapshotLine
  interface CatOneResult {
    campaign: { id: string; name: string; reporting_year: number }
    total_mt: number; supplier_specific_mt: number; spend_based_mt: number
    counts: {
      suppliers_total: number; supplier_specific: number; spend_based: number; uncovered: number
      assured: number; assurance_contradictions: number; assurance_answered: number
    }
    assurance_asked: boolean
    supplier_specific_assured_mt: number
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
  // ⚠️ THE SNAPSHOT IS HELD HERE BETWEEN ACCEPTANCE AND THE SAVE THAT WRITES IT. accepted_at is fixed
  // at the click, so the record says when the buyer accepted rather than when they happened to save.
  // Nothing is persisted at acceptance: a snapshot records what was REPORTED, and an acceptance that
  // is never saved was never reported. It would also mean creating a scope3_inventories row as a side
  // effect of a button that is not Save.
  const [pendingSnapshots, setPendingSnapshots] = useState<Record<string, PendingCategorySnapshot>>({})
  // ⚠️ SEPARATE FROM pendingSnapshots BECAUSE THAT ONE IS CLEARED ON SAVE. This holds the lines behind
  // the figure the buyer accepted, so the export step can name a contradiction after the save as well
  // as before it. Session-scoped: it is NOT reloaded from scope3_category_snapshots on page load, so
  // after a refresh the lines are gone and the notice cannot appear. Reading snapshots back belongs
  // with the verifier surface task. Nothing here ever asserts the absence of a contradiction, so a
  // missing notice is never read as a clean bill.
  const [acceptedCatOneLines, setAcceptedCatOneLines] = useState<SnapshotLine[] | null>(null)
  // category -> snapshot id as last saved. Read to set supersedes_id on a re-acceptance.
  const [catSnapshotIds, setCatSnapshotIds] = useState<Record<string, string>>({})

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
    // ⚠️ A FAILED BIND USED TO BE SILENT. RLS returns no row for an id that is not this account's, one
    // that never existed and one that was deleted alike, so a customer following a link landed on the
    // picker with no explanation of why it had not worked. The sentence states what was observed.
    if (!row) { setBindError(INVENTORY_NOT_OPENED_SCOPE3); return }
    setBindError(null)
    setBoundInventoryId(id)
    setGhgGwpVersion(row.gwp_version ?? null)
    setBoundWorkings(row.workings ?? null)
    setBoundLocations(row.locations_data ?? null)
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
      // ⚠️ READ WITH `in` SO A RECORD SAVED BEFORE THE MIGRATION STILL LOADS. select('*') returns
      // whatever columns exist, so cat_snapshot_ids is simply absent until the migration runs, and
      // absent is not {} : it means no acceptance has been recorded, which is the same starting state.
      if ('cat_snapshot_ids' in s3 && s3.cat_snapshot_ids) {
        setCatSnapshotIds(s3.cat_snapshot_ids as Record<string, string>)
      }
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
      // The fingerprint saved with the Category 3 figure, if this record carries one. A record saved
      // before Task 7 has none, and the notice stays silent rather than guessing.
      setSavedCat3Fingerprint((s3.cat_data as Record<string, CategoryData> | null)?.cat3?.source_fingerprint ?? null)
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

  // Presentation only. The STATE decides what is said (lib/scope3/supplierAssurance.ts); this decides
  // what it looks like, so a new state cannot arrive without a colour.
  const ASSURANCE_TONE_STYLE: Record<AssuranceTone, { color: string; bg: string }> = {
    good:   { color: '#0F6E56', bg: '#E1F5EE' },
    warn:   { color: 'var(--color-state-warn)', bg: '#FEF3E2' },
    alert:  { color: '#B91C1C', bg: '#FCEBEB' },
    muted:  { color: 'var(--color-ink-muted)', bg: '#f8f7f5' },
  }

  const useCatOneFigure = (mt: number) => {
    // ⚠️ ROUNDED ONCE, AND THE SNAPSHOT RECORDS THE ROUNDED FIGURE. This is the number that goes into
    // the category total, so recording the route's raw total beside it would put a snapshot against a
    // figure that never went into anything.
    const figure = Number(mt.toFixed(3))
    updateCat('cat1', 'has_supplier_data', true)
    updateCat('cat1', 'supplier_emissions', figure)
    if (!catOneResult) return
    setPendingSnapshots(prev => ({
      ...prev,
      // A second acceptance supersedes the first rather than replacing it. The previous id comes from
      // what was last SAVED, not from another pending snapshot: an unsaved acceptance was never
      // reported, so there is nothing for it to supersede.
      cat1: buildCategorySnapshot({
        category: 'cat1',
        figureAsUsed: figure,
        unit: 'mt CO2e',
        result: catOneResult,
        acceptedAt: new Date().toISOString(),
        previousId: catSnapshotIds.cat1 ?? null,
        reason: restatementReason.cat1 ?? null,
      }),
    }))
    setAcceptedCatOneLines(catOneResult.lines)
  }

  // The buyer's words for why a figure was restated. Empty is allowed: the report gates it, not the
  // insert, which is the same treatment an unjustified exclusion gets.
  const [restatementReason, setRestatementReason] = useState<Record<string, string>>({})

  /**
   * Restatements accepted with nothing said about why.
   *
   * ⚠️ BESIDE unjustifiedExclusions, NOT INSTEAD OF A CONSTRAINT. The table deliberately allows a null
   * reason, because a NOT NULL on customer prose produces a full stop that reads as a justification.
   * This is where the absence becomes visible.
   */
  const unreasonedRestatements = Object.values(pendingSnapshots).filter(isUnreasonedRestatement)


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
        reason: unpriced ? unpricedReason(c.id, 'record') : null,
        // ⚠️ THE METHOD'S OWN SCORE, NOT OURS, and only for a method that defines one. PCAF's 1-to-5 for
        // Cat 15: a submission quotes PCAF's number rather than ThemisIQ's confidence pill. coverageEntry
        // drops it wherever there is no figure to describe.
        dq: c.id === 'cat15' ? cat15Result().dqScore : null,
        // ⚠️ THE CUSTOMER'S JUSTIFICATION FOR AN EXCLUSION, INTO THE RECORD A VERIFIER READS. It lived only
        // in cat_data, which get_verifier_scope3 withholds wholesale, so until 25 Sep 2026 the RPC
        // disclosed the exclusions and the COUNT of unjustified ones and not one justification. GHG
        // Protocol 11.1 requires the categories excluded to be listed WITH justification.
        //   Passed raw. coverageEntry trims it, nulls a blank, and emits the key only for an answered
        // exclusion, so nothing here has to know those rules.
        excludedReason: catData[c.id]?.excluded_reason,
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
  // No outstandingAmount: a new holding's amount is blank, and blank withholds the figure (StoredHolding).
  const newPcafAsset = (): StoredHolding => ({
    id: Math.random().toString(36).slice(2),
    assetClass: 'listed_equity_corp_bonds',
    denominator: 0,
    emissions: {}, // EmissionInputs — empty until the user fills a path
  })
  /** For rendering only. */
  const cat15Assets = () => catData['cat15']?.pcafAssets ?? []
  const editCat15Assets = (edit: RowEdit<StoredHolding>) =>
    setCatData(prev => ({ ...prev, cat15: { ...prev.cat15, pcafAssets: editRows(prev.cat15?.pcafAssets, edit) } }))
  const addPcafAsset = () => editCat15Assets({ kind: 'add', row: newPcafAsset() })
  const removePcafAsset = (id: string) => editCat15Assets({ kind: 'remove', id })
  const updatePcafAsset = (id: string, patch: Partial<StoredHolding> | ((row: StoredHolding) => Partial<StoredHolding>)) =>
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

  // Cat 6 flight legs and rail journeys, in catData['cat6'].flights and .rail_journeys.
  const newFlight = (): FlightRow => ({ id: Math.random().toString(36).slice(2), origin_iso2: '', destination_iso2: '', cabin_class: '', count: undefined, ...withDistance(undefined, 'km') })
  const editFlights = (edit: RowEdit<FlightRow>) =>
    setCatData(prev => ({ ...prev, cat6: { ...prev.cat6, flights: editRows(prev.cat6?.flights, edit) } }))
  const newRailJourney = (): RailJourney => ({ id: Math.random().toString(36).slice(2), country_iso2: '', rail_type: '', passengers: undefined, ...withDistance(undefined, 'km') })
  const editRailJourneys = (edit: RowEdit<RailJourney>) =>
    setCatData(prev => ({ ...prev, cat6: { ...prev.cat6, rail_journeys: editRows(prev.cat6?.rail_journeys, edit) } }))
  const addFlight = () => editFlights({ kind: 'add', row: newFlight() })
  const removeFlight = (id: string) => editFlights({ kind: 'remove', id })
  const updateFlight = (id: string, patch: Partial<FlightRow>) => editFlights({ kind: 'update', id, patch })
  const addRailJourney = () => editRailJourneys({ kind: 'add', row: newRailJourney() })
  const removeRailJourney = (id: string) => editRailJourneys({ kind: 'remove', id })
  const updateRailJourney = (id: string, patch: Partial<RailJourney>) => editRailJourneys({ kind: 'update', id, patch })

  // Cat 7 commuting and homeworking groups, in catData['cat7'].commute_rows and .homeworking_rows.
  const newCommuteRow = (): CommuteRow => ({ id: Math.random().toString(36).slice(2), mode: '', country_iso2: '', employees: undefined, days_per_week: undefined, weeks_per_year: undefined, ...withDistance(undefined, 'km') })
  const editCommuteRows = (edit: RowEdit<CommuteRow>) =>
    setCatData(prev => ({ ...prev, cat7: { ...prev.cat7, commute_rows: editRows(prev.cat7?.commute_rows, edit) } }))
  const addCommuteRow = () => editCommuteRows({ kind: 'add', row: newCommuteRow() })
  const removeCommuteRow = (id: string) => editCommuteRows({ kind: 'remove', id })
  const updateCommuteRow = (id: string, patch: Partial<CommuteRow>) => editCommuteRows({ kind: 'update', id, patch })
  const newHomeworkingRow = (): HomeworkingRow => ({ id: Math.random().toString(36).slice(2), country_iso2: '', employees: undefined, days_per_week: undefined, weeks_per_year: undefined, hours_per_day: undefined })
  const editHomeworkingRows = (edit: RowEdit<HomeworkingRow>) =>
    setCatData(prev => ({ ...prev, cat7: { ...prev.cat7, homeworking_rows: editRows(prev.cat7?.homeworking_rows, edit) } }))
  const addHomeworkingRow = () => editHomeworkingRows({ kind: 'add', row: newHomeworkingRow() })
  const removeHomeworkingRow = (id: string) => editHomeworkingRows({ kind: 'remove', id })
  const updateHomeworkingRow = (id: string, patch: Partial<HomeworkingRow>) => editHomeworkingRows({ kind: 'update', id, patch })

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
  const wasteGwpSentence: string = publisherGwpSentence(DEFRA_WASTE_META, !!boundInventoryId, ghgGwpVersion)

  const cat5Sentences: string[] = (() => {
    const m = DEFRA_WASTE_META
    const out: string[] = []
    out.push(
      `Priced from ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, ${m.sheet} sheet, factor edition ${m.edition}). ` +
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

  // ─── Cat 6: business travel ─────────────────────────────────────────────────────────────────────
  // ONE evaluation read by the panel, the workings, the CSV and factor_basis. The figure and the calculated
  // flag come from rowPricedResult, which evaluates this category's own record the same way.
  const cat6Travel = evaluateBusinessTravel(catData['cat6'])
  /** The Cat 6 workings and CSV disclosures: the same sentences in both, built in businessTravelCopy.ts. */
  const cat6SentenceList: string[] = cat6Sentences(cat6Travel, publisherGwpSentence(DEFRA_TRAVEL_META, !!boundInventoryId, ghgGwpVersion), countryLabel)

  // ─── Cat 7: employee commuting ───────────────────────────────────────────────────────────────────
  // ONE evaluation read by the panel, the workings, the CSV and factor_basis; the figure and the calculated
  // flag come from rowPricedResult, which evaluates this category's own record the same way.
  const cat7Commuting = evaluateCommuting(catData['cat7'])
  const cat7SentenceList: string[] = cat7Sentences(cat7Commuting, publisherGwpSentence(DEFRA_TRAVEL_META, !!boundInventoryId, ghgGwpVersion))
  /** A record saved under the previous form: shown, not priced. null when there is none. */
  const cat7Legacy = hasLegacyCommuting(catData['cat7']) ? cat7LegacyNotice(catData['cat7']) : null

  // ⚠️ calcGenericSpend WAS DELETED ON 25 SEP 2026, with GENERIC_SPEND_FACTOR. It multiplied a saved
  // annual_spend by a flat 0.5 kg CO2e per unit of currency, unsourced, for Categories 8, 9, 10, 11, 13
  // and 14, and the result was summed into total_scope3_tco2e. Those six now carry `no_method`: an entered
  // figure is used and nothing else is computed. A saved annual_spend on one of them is left in cat_data
  // untouched and simply no longer read, so no customer input is destroyed by this change.

  /**
   * Category 3, from the bound GHG inventory: the adapter's reading of it, and the priced result.
   *
   * ⚠️ COMPUTED ONCE PER RENDER AND SHARED BY EVERY SURFACE, exactly as cat15Result() is. The figure,
   * the panel's workings, the confidence pill and (from Task 6) the CSV must all describe one
   * evaluation; two calls with the same inputs would agree today and are two things to keep in step
   * tomorrow.
   *
   * ⚠️ NOTHING HERE READS catData['cat3'].annual_spend. A spend figure saved under the old method is
   * not an input to this calculation and prices nothing; Task 9 of the Category 3 design adds the
   * export row that reports it as recorded and not used.
   */
  // Plain consts, not useMemo, for the same reason cat15Result() is a plain call: the page's derived
  // values are computed per render, and the harness (lib/scope3/scope3Surfaces.test.ts) mocks React
  // down to useState, useEffect and useRef. Both calls are pure and cheap.
  // The same sentence Cats 5, 6, 7 and 12 carry, with Category 3's own publisher record: it names the
  // factors' AR5 basis and what the bound GHG inventory records, without claiming the two agree.
  const cat3GwpSentence: string = publisherGwpSentence(CAT3_GWP_PUBLISHER, !!boundInventoryId, ghgGwpVersion)
  const cat3Read = cat3InputsFrom(boundWorkings, boundLocations)
  const cat3Priced = cat3Read.inputs ? priceCat3(cat3Read.inputs) : null
  /** The sentence shown when Category 3 has no figure: the inventory could not be read, or a stream was
   *  never answered. null when there is a figure, including a calculated zero. */
  const cat3NoFigureAnswer = cat3NoFigure(cat3Priced, cat3Read)
  const cat3NoticeText = cat3NoFigureAnswer?.text ?? null

  /**
   * The bound inventory's activity, fingerprinted, and what it says about the saved record.
   *
   * ⚠️ NOT COMPUTED WHEN THE INVENTORY CANNOT BE READ. cat3Read.reason is set when there are no
   * workings, an older shape or no locations: the current fingerprint would then be an empty list and
   * every row would report as removed, which is a claim about the customer's inventory made out of our
   * own inability to read it. The panel already says what it could not read.
   */
  const cat3Change = cat3Read.reason ? null
    : cat3FingerprintChange(savedCat3Fingerprint, cat3Fingerprint(cat3Read.inputs))
  const cat3Stale = cat3FingerprintMoved(cat3Change)

  /**
   * Activity D: the screening answer, and whether it withholds the category.
   *
   * ⚠️ AN ENTERED FIGURE STILL WINS. A reseller who has calculated their own Category 3 total keeps it:
   * METHOD_TAKES_ENTERED_FIGURE is true for this method, and their figure may well include activity D.
   * The withholding is of OUR estimate, which covers activities A, B and C and cannot cover D.
   */
  const cat3SellsEnergyOn: boolean | undefined = catData['cat3']?.sells_energy_on
  /**
   * A spend figure left on the record by the method Category 3 used before 20 Sep 2026.
   *
   * ⚠️ FORMATTED HERE AND READ NOWHERE ELSE. It is a string from the moment it leaves catData, so no
   * later reader can mistake it for a number to price: lib/scope3/cat3Copy.ts takes it already
   * rendered. Null when there is none, so the row and the panel line simply do not appear.
   */
  const cat3RetiredSpend: string | null = catData['cat3']?.annual_spend
    ? `${amountText(catData['cat3'].annual_spend as number)} ${currency}`
    : null
  const cat3ExcludedFor3d = cat3SellsEnergyOn === true && !catData['cat3']?.emissions_override

  /** The figure in tonnes, or null where there is none. A withheld category has no figure, never a zero. */
  const cat3Mt = (): number | null =>
    cat3Priced && cat3Priced.status !== 'withheld' ? cat3Priced.kg_co2e / 1000 : null

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
      case 'end_of_life_factors':
      case 'business_travel_factors':
      case 'employee_commuting_factors': return rowPricedResult(catData, id)?.mt ?? 0
      case 'pcaf': return calcCat15()
      // ⚠️ AN ENTERED FIGURE OR NOTHING. No factor is applied, and a saved annual_spend is deliberately
      // NOT read: it was the input to a calculation that no longer exists, and for five of these six it
      // was never the company's spend in the first place.
      // ⚠️ ZERO HERE IS NOT A CLAIM OF NO EMISSIONS. unpricedCatIds includes a no_method category with no
      // entered figure, and totalScope3 filters those out rather than summing the 0 in.
      case 'no_method': return catData[id]?.emissions_override || 0
      // ⚠️ NEVER calcGenericSpend. Category 3 is priced from the bound GHG inventory's own energy; a
      // spend figure saved under the old method prices nothing. An entered known figure still wins,
      // as METHOD_TAKES_ENTERED_FIGURE says it does for this method, and is handled first.
      // ⚠️ ZERO HERE IS NOT A CLAIM OF NO EMISSIONS: a category in unpricedCatIds is left OUT of
      // totalScope3 (see its filter), never summed in. cat3ExcludedFor3d is what puts it there.
      case 'fuel_and_energy_upstream':
        return catData[id]?.emissions_override || (cat3ExcludedFor3d ? 0 : cat3Mt() || 0)
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
      case 'end_of_life_factors':
      case 'business_travel_factors':
      case 'employee_commuting_factors': return rowPricedResult(catData, id)?.calculated ?? false
      // ⚠️ mt !== null, NOT > 0. An entered zero — a portfolio that finances no emissions — is a
      // calculated answer, and the note above about a genuine zero reading as not-calculated no longer
      // applies to this path.
      case 'pcaf': return cat15Result().mt !== null
      // ⚠️ AN ENTERED FIGURE IS THE ONLY WAY THIS IS CALCULATED, and it is already returned true above by
      // the takesEnteredFigure branch, so reaching here means there is none. It read `!!d.annual_spend`
      // until 25 Sep 2026: a saved spend made the category "Relevant, calculated", put an unsourced figure
      // in the total and labelled it on the pill.
      case 'no_method': return false
      // ⚠️ A CALCULATED ZERO COUNTS, A WITHHELD CATEGORY DOES NOT, and a saved annual_spend is not
      // consulted at all. 'zero' means every stream at every location was answered and none holds any
      // energy, which is an answer; 'withheld' means a stream was never answered, where a zero would
      // assert something nobody said. An entered figure is handled above.
      case 'fuel_and_energy_upstream': return !cat3ExcludedFor3d && cat3Mt() !== null
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
      // Category 3 is missing from the total whenever it has no figure: the inventory could not be read,
      // or a stream was never answered. A calculated zero is a figure and is NOT unpriced.
      if (c.id === 'cat3') return cat3ExcludedFor3d || (!catData[c.id]?.emissions_override && cat3Mt() === null)
      // ⚠️ NAMED AS MISSING, NOT SILENTLY ABSENT. A category the platform does not calculate, which the
      // customer has claimed as relevant and given no figure for, is missing from the total, and the amber
      // notice on the Results step says so category by category. Before 25 Sep 2026 these six were never
      // in this set: with a saved spend they were summed at an unsourced figure, and without one they
      // simply did not appear, which read as if nothing were outstanding.
      if (scope3MethodFor(c.id) === 'no_method') return !catData[c.id]?.emissions_override
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
   * "is the gap OURS", which is what the stored record calls unpriced, and what a consumer of a baseline
   * needs to tell a platform gap from an unfinished one.
   *
   * ⚠️ "OURS" WIDENED ON 25 SEP 2026 AND THE COLUMN COMMENT SAYS SO. It read "did we fail to price
   * something the customer completed", which had one shape in mind: inputs supplied, calculation attempted,
   * no figure. A category the platform has NO METHOD for never gets as far as an attempt, and yet the gap is
   * unambiguously ours rather than the customer's: there is nothing they could enter in the panel that would
   * produce an estimate. Both are "we did not give you a figure and it is not because you left something
   * blank", which is the only distinction a consumer of this flag can act on.
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
      // ⚠️ THE PLATFORM HAS NO METHOD, SO THE GAP IS OURS. Placed before the per-category cases below
      // because it is a property of the method rather than of this record's inputs: no spend, no entered
      // figure and no amount of customer work changes the answer. An entered figure is handled by the
      // guard above, since a category with one is calculated and coverageEntry drops `unpriced` anyway.
      if (scope3MethodFor(c.id) === 'no_method') return true
      if (c.id === 'cat15') return cat15Result().reason === CAT15_ASSESSMENT_FAILED
      // ⚠️ ONE OF CATEGORY 3'S TWO WITHHOLDINGS IS OURS AND THE OTHER IS NOT. 'nothing_priced' means the
      // inventory holds energy at these locations and we could price none of it, which is a platform
      // gap. An unanswered stream, an unreadable inventory or none bound is the customer's turn, and
      // this column would report their unfinished work as our failure.
      // ⚠️ ACTIVITY D IS A PLATFORM BOUNDARY, AND IT BELONGS IN THIS COLUMN. The column means "the
      // platform produced no figure for a category the customer completed", and that is exactly what
      // this is: they answered the screening question, and ThemisIQ cannot price the activity it
      // names. It is also the only route by which a reason reaches the saved coverage entry, and a
      // baseline consumer reading "relevant, not calculated" with no reason learns nothing.
      if (c.id === 'cat3') return cat3ExcludedFor3d || cat3Priced?.withheld?.code === 'nothing_priced'
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
  /**
   * Why a claimed category is missing from the total, in the words of whatever withheld it.
   *
   * ⚠️ `where` DECIDES A POINTER, NOT A TONE. Category 3's activity D reason ends by saying where the
   * figures it is not counting can be found, and "shown below" is true on the panel, false on the
   * Results step and false at the end of the export. Every other reason ignores the argument.
   */
  const unpricedReason = (id: string, where: Cat3Surface = 'record'): string => {
    const NO_REASON = 'It was not priced, and no reason was recorded.'
    if (SPEND_PRICED_IDS.includes(id)) {
      const missing = spendMissingInputs(id)
      if (missing.length > 0) {
        return notEnteredReason(missing)
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
    // Same rule as Cat 15's line above: the reason is the sentence that withheld the figure, verbatim,
    // so the panel, the amber box and the export cannot describe the gap three ways.
    if (id === 'cat3') return cat3ExcludedFor3d ? cat3ThreeDWithheld(where) : (cat3NoticeText || NO_REASON)
    // ⚠️ THE SHARED SENTENCE, SO THE AMBER NOTICE, THE EXPORT AND THE SAVED COVERAGE ENTRY CANNOT DESCRIBE
    // THE GAP THREE WAYS. Same rule Cats 3 and 15 follow above: the reason is the wording that withheld the
    // figure, verbatim. This is also what `unpriced` now means for these six, and the column comment on
    // scope3_coverage says so: not "we tried and failed" but "there is no method here to try".
    if (scope3MethodFor(id) === 'no_method') return scope3MethodDescription('no_method')
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
    // ⚠️ ANY PRICED FLIGHT OR RAIL ROW, NOT FLIGHTS ALONE. This tested flight counts only, so a Cat 6 with
    // hotel nights or rail km and no flights was calculated but labelled "Flat spend", a method it never used.
    if (scope3MethodFor(id) === 'business_travel_factors' && rowPricedResult(catData, id)?.calculated) return 'medium'
    // ⚠️ A PRICED GROUP, NOT A HEADCOUNT. This returned 'medium' whenever employee_count was set, so a figure
    // built on the 15 km and petrol-car defaults was labelled activity data.
    if (scope3MethodFor(id) === 'employee_commuting_factors' && rowPricedResult(catData, id)?.calculated) return 'medium'
    // ⚠️ 'medium' (Activity data), THE SAME LABEL CATS 5, 6, 7 AND 12 CARRY WHEN THEY PRICE, because
    // Category 3's figure is activity data of the same kind: metered consumption from the bound GHG
    // inventory times a published factor. Without this branch a DEFRA-priced Category 3 would fall
    // through to 'low' and be labelled "Flat factor" on the pill and in the CSV, which is Q8 of the
    // Category 3 design.
    //   ⚠️ IT CANNOT FIRE YET, DELIBERATELY. isCalculated is false for this method until Task 5 wires
    // the calculator, and an entered figure returns 'high' above. The branch is placed now so the
    // figure cannot arrive without its label.
    if (scope3MethodFor(id) === 'fuel_and_energy_upstream' && isCalculated(id)) return 'medium'
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
    // ⚠️ ONE RETURN, NOT TWO. `if (d.annual_spend || d.total_spend) return 'low'` sat here and returned the
    // same value as the line below it. The distinction was real while 'low' meant "priced by the flat
    // factor": a stored spend was the input that produced the figure. Nothing is priced that way now, so a
    // stored spend says nothing about the figure, and two branches returning one value only invite someone
    // to give them different meanings later.
    return 'low'
  }

  // The pill labels. The longest, 'EXIOBASE spend', fits the 96px Method column at 9px — see the
  // column-width note above the results grid, which was measured against it.
  //
  // ⚠️ 'Flat spend' UNTIL 20 SEP 2026, THEN 'Flat factor', AND 'Not calculated' SINCE 25 SEP 2026. Each
  // rename followed the same discovery: the label described a calculation that was not what happened.
  // 'Flat spend' named a purchase the company never made for five of the six categories. 'Flat factor'
  // was true while a flat factor was applied, and the factor was deleted with GENERIC_SPEND_FACTOR.
  //   ⚠️ NOW EVERY PATH TO 'low' IS A CATEGORY THAT WAS NOT CALCULATED, which is why the label can say so
  // plainly. Check that before adding a branch: an entered figure returns 'high', the DEFRA and PCAF
  // methods return 'medium' or better when they price, EXIOBASE returns its own key, and what falls
  // through is a category with no figure. A calculated category reaching 'low' would make this label a
  // lie, and nothing else would notice.
  // 'low' is the KEY and is unchanged: getConfidence returns it, and the CSV's Confidence column carries
  // the LABEL, which nothing parses.
  const confidenceConfig = {
    high: { label: 'Primary data', color: '#0F6E56', bg: '#E1F5EE' },
    medium: { label: 'Activity data', color: '#0C447C', bg: '#E6F1FB' },
    exiobase_spend: { label: 'EXIOBASE spend', color: '#0C447C', bg: '#E6F1FB' },
    low: { label: 'Not calculated', color: 'var(--color-state-warn)', bg: '#FEF3E2' },
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

    if (method === 'no_method') {
      if (d?.emissions_override) {
        return { basis: 'Entered figure', detail: `${d.emissions_override} mt CO2e entered directly; no emission factor was applied.` }
      }
      // ⚠️ A SAVED annual_spend IS REPORTED AS HELD AND NOT AS PRICED. Until 25 Sep 2026 this arm returned
      // 'Flat factor, unsourced' with a figure computed from that spend. The spend is still in cat_data and
      // is not deleted, so a customer who entered it sees that it is held and why it produces nothing:
      // silently ignoring a number somebody typed is how a record comes to disagree with what the person
      // in front of it believes. The method sentence is the shared one, so this cannot describe the absence
      // differently from the CSV's Method cell or the methodology page.
      if (d?.annual_spend) {
        return {
          basis: 'Not calculated',
          detail: `A spend of ${amountText(d.annual_spend)} ${currency} is held against this category and is not used. ${scope3MethodDescription('no_method')}`,
        }
      }
      return { basis: 'Not calculated', detail: scope3MethodDescription('no_method') }
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

    // ⚠️ THE BASIS IS BUILT IN lib/scope3/cat3Copy.ts, LIKE CATS 6, 7 AND 15's. This cell is the CSV's
    // Method column and the saved factor_basis line, and until 20 Sep 2026 Category 3 fell through to
    // "No data. No activity data was entered", which would have been recorded beside a real figure.
    if (method === 'fuel_and_energy_upstream') return cat3Basis(cat3Priced, cat3Read, d?.emissions_override, cat3ExcludedFor3d)
    if (method === 'business_travel_factors') return cat6Basis(evaluateBusinessTravel(d), countryLabel)
    if (method === 'employee_commuting_factors') return cat7Basis(evaluateCommuting(d))

    // No method reaches here today: every one returns above. Kept so a method added to the map without a
    // branch reports "no data" rather than a basis it does not have.
    return { basis: 'No data', detail: 'No activity data was entered, so nothing was calculated.' }
  }

  // Persist the bound Scope 3 record. Upsert on inventory_id so re-saves update
  // the existing row rather than erroring on the unique FK.
  const saveScope3 = async () => {
    // A Cat 1 estimate still being fetched means totalScope3 is about to change. Writing it now would
    // store a total the page is on the point of contradicting. The button is disabled in this state
    // too; this guard is for any other caller.
    if (anySpendPending) return
    // Computed once, so the value written and the value remembered are the same object.
    const cat3FingerprintNow = cat3Fingerprint(cat3Read.inputs)
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id
      if (!uid || !boundInventoryId) return
      const { error } = await supabase.from('scope3_inventories').upsert({
        user_id: uid,
        inventory_id: boundInventoryId,
        // ⚠️ NULL, NOT ''. scope3_inventories_sector_is_industry reads `sector is null or sector like
        // 'i%'`, so the blank option's '' fails it and the WHOLE upsert is refused: the customer saw
        // the constraint's own name in an alert on 20 Sep 2026. The column is nullable by design and
        // this sector prices nothing, so "not chosen" is NULL. Same rule, same reason, as the
        // country_iso2 line four below.
        sector: sector || null,
        currency,
        // NULL, not ''. scope3_inventories_country_iso2_format rejects anything that is not two
        // uppercase letters or NULL, so an empty string would fail the whole upsert.
        country_iso2: countryIso2 || null,
        revenue_millions: (revenue || 0) / 1_000_000, // raw -> millions
        // The same rule inside the jsonb: a blank sector select writes '', and the sector trigger
        // (assert_sector_codes_exist, SQLSTATE PT422) tests `is not null`, so '' reaches its membership
        // check and refuses the save. lib/scope3/savePayload.ts drops the key instead.
        // ⚠️ THE FINGERPRINT IS WRITTEN WITH THE FIGURE, NOT HELD IN STATE. It describes the activity
        // rows this save was computed from, so it belongs to the record; putting it in catData would
        // re-arm the Save button the moment it changed. cat_data.cat3.source_fingerprint, per Q6 of the
        // design: no migration, and it round-trips with the record the page already writes whole.
        cat_data: catDataForSave({
          ...catData,
          cat3: { ...(catData.cat3 ?? {}), source_fingerprint: cat3FingerprintNow },
        }),
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
      // ⚠️ THE RAW MESSAGE GOES TO THE CONSOLE, NEVER TO THE CUSTOMER. It named a constraint and a
      // relation in an alert until 20 Sep 2026. saveErrorText says what was refused and what to do,
      // and says that nothing was saved and nothing on screen was lost.
      if (error) { console.error('Scope 3 save failed:', error); setSaveError(saveErrorText(error)); return }
      setSaveError(null)
      setSaved(true)
      setSavedTotal(totalScope3) // exactly the value written above, from the same render
      setSavedCat3Fingerprint(cat3FingerprintNow) // ditto: the notice must clear on a save that worked

      // ── THE SNAPSHOTS, AFTER THE FIGURE THEY DESCRIBE IS COMMITTED ──────────────────────────
      //
      // ⚠️ AFTER, AND DELIBERATELY NOT INSIDE THE UPSERT ABOVE. The figure is what the report stands
      // on; the snapshot is the evidence for it. Writing them together would make a snapshot failure
      // fail the save, which would withhold a correct figure over its workings. Writing the snapshot
      // first would record evidence for a figure that then failed to save.
      //
      // ⚠️ AND IT TOLERATES THE SCHEMA BEING ABSENT, SO CODE AND MIGRATION CAN SHIP IN EITHER ORDER.
      // isMissingSnapshotSchema matches exactly three PostgREST failures: absent table, absent column,
      // and a schema-cache miss for a column it has never seen. Anything else is a real write failure
      // and is surfaced, because a customer who is told their figures saved must not be left believing
      // the workings behind them were recorded when they were not.
      const pending = Object.entries(pendingSnapshots)
      if (pending.length > 0) {
        const { data: record } = await supabase
          .from('scope3_inventories').select('id').eq('inventory_id', boundInventoryId).single()
        if (record?.id) {
          const rows = pending.map(([category, snap]) => ({
            ...snap, category, scope3_inventory_id: record.id, user_id: uid, accepted_by: uid,
          }))
          const { data: written, error: snapErr } = await supabase
            .from('scope3_category_snapshots').insert(rows).select('id, category')
          if (snapErr) {
            if (isMissingSnapshotSchema(snapErr)) {
              // The migration has not run. The figure is saved and correct; the workings are not
              // recorded yet and the next save will record them. Noted, not shown: nothing the
              // customer did failed, and nothing they can do changes it.
              console.warn('[scope3] snapshot schema absent, workings not recorded yet:', snapErr.code)
            } else {
              console.error('Scope 3 snapshot write failed:', snapErr)
              setSaveError(saveErrorText(snapErr))
            }
          } else if (written) {
            const ids = Object.fromEntries(written.map(r => [r.category as string, r.id as string]))
            const nextIds = { ...catSnapshotIds, ...ids }
            const { error: ptrErr } = await supabase
              .from('scope3_inventories').update({ cat_snapshot_ids: nextIds }).eq('id', record.id)
            if (ptrErr && !isMissingSnapshotSchema(ptrErr)) {
              console.error('Scope 3 snapshot pointer failed:', ptrErr)
              setSaveError(saveErrorText(ptrErr))
            } else if (!ptrErr) {
              // Only now is the acceptance reported. Clearing pending here and not earlier is what
              // makes a failed write retry on the next save instead of being lost.
              setCatSnapshotIds(nextIds)
              setPendingSnapshots({})
              setRestatementReason({})
            }
          }
        }
      }
    } finally { setSaving(false) }
  }

  /**
   * A sentence from lib/scope3/cat3Copy.ts, with the link that fixes what it describes.
   *
   * ⚠️ ONE RENDERER, AND NO COPY IN IT. The sentence and the link label are both constants; this only
   * decides where they sit and builds the href from the bound inventory. `<a href>`, never next/link:
   * the beforeunload prompt above fires for a document navigation and not for a client-side route
   * change, so an in-app link would step around the one safeguard this page has.
   */
  /**
   * ⚠️ A LINK AT THE END OF A PARAGRAPH IN BOLD IS NOT A BUTTON, AND THE PREVIEW READ IT AS EMPHASIS.
   * Bold inside these boxes is a heading ("What this figure is"), so "Change the energy in that
   * inventory →" looked like the sentence insisting on itself. It is now an action on its own line,
   * in btnStep: the platform's secondary button, defined in app/components/buttonStyles.ts and already
   * used by this page's own Back control and by the eight other module wizards.
   *
   * ⚠️ textDecoration: 'none' IS ADDED HERE, NOT TO THE SHARED OBJECT. Every existing btnStep call site
   * is a <button>, which has no underline to suppress; this is an <a>, which does.
   */
  const cat3ActionStyle = { ...btnStep, display: 'inline-block', textDecoration: 'none', marginTop: 8 }

  const Cat3GhgLink = ({ sentence, link }: { sentence: string; link: Cat3GhgLinkKey }) => {
    const l = CAT3_GHG_LINKS[link]
    return (
      <>
        {sentence}
        {boundInventoryId && (
          <div>
            <a href={ghgHref(boundInventoryId, l.step as GhgStep)} style={cat3ActionStyle}>
              {l.label} →
            </a>
            {/* Directly under the link it warns about, not under the paragraph. */}
            {!showSaved && (
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-state-warn)', lineHeight: 1.5 }}>
                {CAT3_SAVE_FIRST_HINT}
              </div>
            )}
          </div>
        )}
      </>
    )
  }

  /**
   * ⚠️ THE BROWSER'S OWN PROMPT, BECAUSE THIS PAGE NOW LINKS OUT OF ITSELF. Category 3's sentences send
   * the customer to the GHG module, and every one of those links is a full navigation: without this,
   * following one mid-edit loses everything typed since the last save, silently. The GHG wizard has
   * had the same handler since before this page existed (app/dashboard/ghg/page.tsx).
   *
   * ⚠️ IT DOES NOT COVER IN-APP NAVIGATION, and that is why every link added for this is a plain <a>
   * rather than next/link: beforeunload fires for a document navigation and not for a client-side
   * route change. A real route guard is a larger change, scoped as its own task in
   * ~/themisiq-sources/findings/.
   *
   * Keyed on showSaved, the same derived state the Save button reads, so "saved and unchanged" is the
   * only quiet state. A bound record that has never been saved warns, which is the case with the most
   * to lose.
   */
  useEffect(() => {
    if (!boundInventoryId || showSaved) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [boundInventoryId, showSaved])

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
          : `The ${cfg.factorType} chosen for this category. It is not defaulted from the company sector: capital goods and freight are different purchases.`
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

    // ⚠️ ONE ROW PER PRICED LINE: the activity as entered, the conversion where one applied, the
    // published factor with the sheet and cell it came from, and the product. Then the rows that were
    // read and not priced, the GWP basis and the disclosures. Category 3's figures come from the bound
    // GHG inventory rather than from this panel, so these rows are the only place the export can show
    // what they were.
    const c3 = catData['cat3']
    if (c3 && isReportable('cat3')) {
      for (const row of cat3CsvRows(cat3Priced, cat3Read, c3.emissions_override, cat3GwpSentence, cat3SellsEnergyOn, cat3RetiredSpend)) out.push(['Cat 3', ...row])
    }

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

    // ⚠️ PER FLIGHT LEG AND RAIL JOURNEY: the input as entered with its unit, the km figure, the category and
    // how it was reached, the class used, both combustion figures, well-to-tank, what entered the figure,
    // and the cells each factor was read from. Then the hotel exclusion and the disclosures.
    const c6 = catData['cat6']
    if (c6 && isReportable('cat6')) {
      out.push(['Cat 6', 'Radiative forcing', cat6Travel.includeRf ? 'Included' : 'Not included', cat6RfSentence(cat6Travel.includeRf)])
      for (const f of cat6Travel.flights) out.push(['Cat 6', ...flightCsvRow(f, countryLabel, cat6Travel.includeRf)])
      if (cat6Travel.flights.length === 0) out.push(['Cat 6', 'Flight legs', '', 'None entered.'])
      for (const r of cat6Travel.rail) out.push(['Cat 6', ...railCsvRow(r, countryLabel)])
      if (cat6Travel.rail.length === 0) out.push(['Cat 6', 'Rail journeys', '', 'None entered.'])
      out.push(['Cat 6', 'Hotel stays', 'Not included', CAT6_HOTEL_SENTENCE])
      for (const d of cat6SentenceList) out.push(['Cat 6', 'Disclosure', d, ''])
    }

    // ⚠️ PER COMMUTING GROUP AND PER HOMEWORKING GROUP: the input as entered, km, the annual distance, the
    // occupancy where used, combustion, well-to-tank, the total and the source cells. Then the disclosures.
    const c7 = catData['cat7']
    if (c7 && isReportable('cat7')) {
      if (cat7Legacy) out.push(['Cat 7', 'Previous form, not priced', cat7Legacy.summary, cat7Legacy.sentences.join(' ')])
      for (const e of cat7Commuting.commutes) out.push(['Cat 7', ...commuteCsvRow(e, countryLabel)])
      if (cat7Commuting.commutes.length === 0) out.push(['Cat 7', 'Commuting groups', '', 'None entered.'])
      for (const e of cat7Commuting.homeworking) out.push(['Cat 7', ...homeworkingCsvRow(e, countryLabel)])
      if (cat7Commuting.homeworking.length === 0) out.push(['Cat 7', 'Homeworking', 'Not included', 'No homeworking was entered. It is optional under the GHG Protocol Scope 3 Standard.'])
      for (const d of cat7SentenceList) out.push(['Cat 7', 'Disclosure', d, ''])
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
            `${h.capped ? ' (CAPPED at 100%: the outstanding amount exceeds the value it is divided by, so check both figures)' : ''}. ` +
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
      if (cat15HasPortfolioFields(c15)) {
        out.push(['Cat 15', 'Portfolio value and sector on this record',
          [c15.portfolio_value ? `${c15.portfolio_value} ${currency}` : '', sectorLabel(c15.portfolio_sector)].filter(Boolean).join(', '),
          CAT15_RECORDED_NOT_USED])
      }
    }
    return out
  }

  const generateExport = () => {
    const rows = [
      ['ThemisIQ Scope 3 GHG Inventory'],
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
        ? [['Excluded from total', `${unpricedCats.map(c => `Cat ${c.num} ${c.name}: ${unpricedReason(c.id, 'export')}`).join(' ')} Left out of the total rather than counted as zero.`]]
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
      // ⚠️ THE CAT 6 RADIATIVE FORCING SETTING, WHERE A READER MEETS THE FILE: it changes every flight figure.
      ...(isReportable('cat6') ? [['Cat 6 radiative forcing', cat6RfHeader(cat6Travel.includeRf)]] : []),
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
          {boundInventoryId && <div style={{ fontSize: 11, color: '#0F6E56', marginTop: 6 }}>🔗 Linked to your {company || 'GHG'} {reportingYear} GHG inventory. Company and year are set there.</div>}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {/* ⚠️ THIS SECTOR PRICES NOTHING AND SUGGESTS NOTHING, AND THE LABEL SAYS ONLY WHAT IS TRUE.
              It was Cat 1's fallback sector until that fallback was removed. I then labelled it as driving
              the materiality suggestions — which was ALSO false: the suggestion table was keyed on the
              retired thirteen-name vocabulary and this select emits EXIOBASE codes, so every lookup missed.
              That feature was removed on 18 Sep 2026. Recorded and printed is all that is left, so recorded
              and printed is what it claims. */}
          <label style={labelStyle}>Primary sector: what your company does</label>
          <select style={inputStyle} value={sector} onChange={e => setSector(e.target.value)}>
            <option value="">Select sector</option>
            <IndustryOptions />
          </select>
          <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>
            Recorded with the inventory and printed in your export. It does not price any category. Categories 1, 2 and 4 each ask for their own sector where you enter their spend.
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
            The country whose production the estimate should represent, usually where your main suppliers are, not where your company is.
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
                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>No countries match “{countryQuery}”. Try a different spelling.</div>
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
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--color-state-warn)' }}>
                  <span>⚠ {countryIso2}: not in the country list; no region resolved</span>
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
                    ? `${picked.display_name}: country-specific factor`
                    : `${picked.display_name}: ${bucket} (regional average)`}
                </span>
                <button type="button" onClick={clearCountry} style={{ border: 'none', background: 'none', padding: 0, font: 'inherit', color: 'var(--color-brand)', textDecoration: 'underline', cursor: 'pointer' }}>Clear</button>
              </div>
            )
          })()}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Annual revenue ({currency})</label>
          <input style={inputStyle} type="number" value={revenue || ''} onChange={e => setRevenue(Number(e.target.value))} placeholder="e.g. 25,000,000" />
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
                        {/* ⚠️ CATEGORY 3 IS FOUR ACTIVITIES, AND ONE OF THEM IS NOT IN A GHG INVENTORY.
                            Activity D is energy bought and sold on, priced from resale quantities this
                            platform does not hold, so it is screened for here rather than assumed
                            absent. Every sentence is from lib/scope3/cat3Copy.ts, quoting the
                            Technical Guidance with its pages. Shown while the category is relevant:
                            an excluded category has nothing to withhold. */}
                        {cat.id === 'cat3' && included && (
                          <div style={{ marginTop: 10, maxWidth: 560, background: '#fff', border: '0.5px solid #e8e7e4', borderRadius: 8, padding: '0.7rem 0.8rem' }}>
                            <div role="group" aria-label={CAT3_3D_QUESTION} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, color: '#0d0d0d', lineHeight: 1.5, flex: 1, minWidth: 260 }}>{CAT3_3D_QUESTION}</span>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {([[true, 'Yes'], [false, 'No']] as [boolean, string][]).map(([value, text]) => {
                                  const on = catData['cat3']?.sells_energy_on === value
                                  return (
                                    <button
                                      key={text}
                                      type="button"
                                      aria-pressed={on}
                                      onClick={() => updateCat('cat3', 'sells_energy_on', on ? undefined : value)}
                                      style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${on ? 'var(--color-brand)' : '#e8e7e4'}`, background: on ? 'var(--color-brand)' : '#fff', color: on ? 'var(--color-on-dark)' : '#555553' }}
                                    >{text}</button>
                                  )
                                })}
                              </div>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 8, lineHeight: 1.6 }}>{CAT3_3D_HELP}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.6 }}>{CAT3_3D_COOLING_NOTE}</div>
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.6 }}>{CAT3_3D_EXPORT_NOTE}</div>
                            {/* ⚠️ 'relevance', NOT 'panel'. This is the Relevance step: the figures it
                                names are two steps away, and the panel's wording said "shown below"
                                with nothing below it. */}
                            {catData['cat3']?.sells_energy_on === true && (
                              <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.55rem 0.65rem', marginTop: 8, lineHeight: 1.6 }}>{cat3ThreeDWithheld('relevance')}</div>
                            )}
                          </div>
                        )}
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
                              <div style={{ fontSize: 10, color: 'var(--color-state-warn)', marginTop: 4, lineHeight: 1.5 }}>
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
          <div style={{ background: '#f8f7f5', borderRadius: 12, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)' }}>No categories selected. Go back to Step 2 to mark the relevant categories.</div>
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-state-warn)' }}>not priced</span>
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
                        {[{ label: 'Yes, I have actual data', val: true }, { label: 'No, use the spend-based estimate', val: false }].map(opt => (
                          <button key={String(opt.val)} onClick={() => updateCat('cat1', 'has_supplier_data', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, ...(catData['cat1']?.has_supplier_data === opt.val ? toggleOn : toggleOff), cursor: 'pointer' }}>{opt.label}</button>
                        ))}
                      </div>
                    </div>
                    {catData['cat1']?.has_supplier_data ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={labelStyle}>Total supplier emissions (mt CO₂e)</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.supplier_emissions || ''} onChange={e => updateCat('cat1', 'supplier_emissions', Number(e.target.value))} placeholder="e.g. 1,200" />
                      </div>
                    ) : <>
                      <div>
                        <label style={labelStyle}>Total annual spend ({currency})</label>
                        <input style={inputStyle} type="number" value={catData['cat1']?.total_spend || ''} onChange={e => updateCat('cat1', 'total_spend', Number(e.target.value))} placeholder="e.g. 2,500,000" />
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
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: l.method === 'supplier-specific' ? '#E1F5EE' : '#FEF3E2', color: l.method === 'supplier-specific' ? '#0F6E56' : 'var(--color-state-warn)', whiteSpace: 'nowrap' }}>{l.method === 'supplier-specific' ? 'primary' : 'spend-based'}</span>
                                {/* ⚠️ NOT ON EVERY ROW, AND showsAssuranceChip IS THE ONE PLACE THAT DECIDES.
                                    A spend-based line is always 'not_applicable' and a 'not_asked' line says
                                    something about the questionnaire rather than the supplier, so either would
                                    put one identical label on every row, in the column a reader scans for
                                    differences. The campaign sentence below carries 'not_asked' instead.
                                    The title is the supplier-attributed statement, never a claim about this
                                    figure. */}
                                {showsAssuranceChip(l) && (
                                  <span title={assuranceStatement(l.assurance)} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 99, whiteSpace: 'nowrap', ...ASSURANCE_TONE_STYLE[assuranceTone(l.assurance)] }}>{assuranceLabel(l.assurance)}</span>
                                )}
                                <span style={{ color: '#555553', minWidth: 70, textAlign: 'right' }}>{l.value_mt.toFixed(2)} mt</span>
                              </div>
                            ))}
                          </div>
                          {/* ⚠️ THE ROUTE'S ROLLUP, FORMATTED, NOT RECOMPUTED HERE. supplier_specific_assured_mt
                              is summed in /api/campaigns/[id]/scope3-cat1 through carriesThirdPartyAssurance,
                              which excludes spend-based lines. A second summation in this component is the
                              defect the GHG engine's one-renderer rule exists to prevent.
                              Null when no supplier reported a figure: nothing to say, so nothing is said. */}
                          {(() => {
                            const summary = assuranceSummarySentence({
                              asked: catOneResult.assurance_asked,
                              supplierSpecificCount: catOneResult.counts.supplier_specific,
                              supplierSpecificMt: catOneResult.supplier_specific_mt,
                              assuredCount: catOneResult.counts.assured,
                              assuredMt: catOneResult.supplier_specific_assured_mt,
                              answeredCount: catOneResult.counts.assurance_answered,
                            })
                            if (!summary) return null
                            return (
                              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                                <strong style={{ color: '#0d0d0d' }}>Supplier assurance:</strong> {summary}
                                {/* Printed once, beside the share, never repeated per row. */}
                                <div style={{ marginTop: 3, fontStyle: 'italic' }}>{ASSURANCE_SCOPE_NOTE}</div>
                              </div>
                            )
                          })()}

                          {/* Named, never gated. The same sentence from the same builder appears beside
                              unjustifiedExclusions on the export step. */}
                          {(() => {
                            const clash = assuranceContradictionSentence(catOneResult.lines)
                            return clash ? (
                              <div style={{ fontSize: 10, color: '#92400e', background: '#FEF3E2', borderRadius: 8, padding: '6px 8px', marginBottom: 8, lineHeight: 1.5 }}>{clash}</div>
                            ) : null
                          })()}

                          {catOneResult.uncovered.length > 0 && (
                            <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                              <strong style={{ color: 'var(--color-state-warn)' }}>Not included:</strong> {catOneResult.uncovered.map(u => `${u.supplier_name} (${u.reason})`).join('; ')}
                            </div>
                          )}
                          {catOneResult.currency_flags.length > 0 && (
                            <div style={{ fontSize: 10, color: '#B91C1C', marginBottom: 8, lineHeight: 1.5 }}>
                              ⚠ Currency: {catOneResult.currency_flags.map(c => `${c.supplier_name}: ${c.spend} ${c.currency}: convert to USD before including`).join('; ')}
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

                  {/* Cat 6 — Business travel: one row per flight leg and per rail journey, priced by
                      lib/scope3/businessTravel.ts from defraTravel2026.json. Every sentence here is built in
                      lib/scope3/businessTravelCopy.ts, which is also why no publisher is named in this file. */}
                  {cat.id === 'cat6' && <>
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>How this is priced</div>
                      <p style={{ margin: '0 0 6px' }}>{CAT6_UPLIFT_SENTENCE}</p>
                      <p style={{ margin: '0 0 6px' }}>{CAT6_RAIL_SENTENCE}</p>
                      <p style={{ margin: '0 0 6px' }}>{CAT6_HOTEL_SENTENCE}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 10 }}>
                        {DEFRA_TRAVEL_META.attribution_required}{' '}
                        <a href={DEFRA_TRAVEL_META.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{DEFRA_TRAVEL_META.licence}</a>
                      </p>
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={labelStyle}>Radiative forcing</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[{ val: true, label: 'Included' }, { val: false, label: 'Not included' }].map(opt => (
                          <button key={String(opt.val)} type="button" aria-pressed={cat6Travel.includeRf === opt.val} onClick={() => updateCat('cat6', 'include_rf', opt.val)} style={{ flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, ...(cat6Travel.includeRf === opt.val ? toggleOn : toggleOff), cursor: 'pointer' }}>{opt.label}</button>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>{cat6RfSentence(cat6Travel.includeRf)}</div>
                    </div>
                    <FlightsEditor
                      evaluated={cat6Travel.flights}
                      includeRf={cat6Travel.includeRf}
                      onAdd={addFlight}
                      onRemove={removeFlight}
                      onUpdate={updateFlight}
                    />
                    <RailJourneysEditor
                      evaluated={cat6Travel.rail}
                      onAdd={addRailJourney}
                      onRemove={removeRailJourney}
                      onUpdate={updateRailJourney}
                    />
                    {cat6Travel.calculated && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <SpendFactorWorkings
                          id="cat6-travel"
                          figureMt={cat6Travel.mt}
                          summary={cat6WorkingsSummary(cat6Travel)}
                          sentences={cat6SentenceList}
                        />
                      </div>
                    )}
                  </>}

                  {/* Cat 7 — Employee commuting: one row per group of commuters and optional homeworking rows, priced
                      by lib/scope3/commuting.ts. Every sentence is built in lib/scope3/commutingCopy.ts. */}
                  {cat.id === 'cat7' && <>
                    {/* Old saved data, first: it is the customer's own entry, and it is not in the figure. */}
                    {cat7Legacy && (
                      <div style={{ gridColumn: '1 / -1', background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>⚠ Saved commuting figures not priced: {cat7Legacy.summary}</div>
                        <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{cat7Legacy.sentences.join(' ')}</div>
                      </div>
                    )}
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>How this is priced</div>
                      <p style={{ margin: '0 0 6px' }}>{CAT7_DAYS_SENTENCE}</p>
                      <p style={{ margin: '0 0 6px' }}>{CAT7_OCCUPANCY_SENTENCE}</p>
                      <p style={{ margin: '0 0 6px' }}>{CAT7_STAND_IN_SENTENCE} {CAT7_ELECTRIC_SENTENCE}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 10 }}>
                        {DEFRA_TRAVEL_META.attribution_required}{' '}
                        <a href={DEFRA_TRAVEL_META.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{DEFRA_TRAVEL_META.licence}</a>
                      </p>
                    </div>
                    <CommuteRowsEditor
                      evaluated={cat7Commuting.commutes}
                      onAdd={addCommuteRow}
                      onRemove={removeCommuteRow}
                      onUpdate={updateCommuteRow}
                    />
                    <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6 }}>{CAT7_HOMEWORKING_SENTENCE}</div>
                    <HomeworkingRowsEditor
                      evaluated={cat7Commuting.homeworking}
                      onAdd={addHomeworkingRow}
                      onRemove={removeHomeworkingRow}
                      onUpdate={updateHomeworkingRow}
                    />
                    {cat7Commuting.calculated && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <SpendFactorWorkings
                          id="cat7-commuting"
                          figureMt={cat7Commuting.mt}
                          summary={cat7WorkingsSummary(cat7Commuting)}
                          sentences={cat7SentenceList}
                        />
                      </div>
                    )}
                  </>}

                  {/* Cat 5 — Waste: one row per material and treatment route, priced from the DEFRA/DESNZ 2026
                      Waste disposal sheet. Selects are built from lib/emissionFactors/defraWaste.ts, so a
                      material is only ever offered the routes the sheet publishes for it. */}
                  {cat.id === 'cat5' && <>
                    {/* Old saved data, first: it is the customer's own entry, and it is not in the figure. */}
                    {cat5LegacyNotice && (
                      <div style={{ gridColumn: '1 / -1', background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>⚠ Saved waste figures not priced: {cat5LegacyNotice.tonnages}</div>
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
                      <textarea id="cat12-split-source" style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={catData['cat12']?.eol_split_source ?? ''} onChange={e => updateCat('cat12', 'eol_split_source', e.target.value)} placeholder="e.g. Eurostat packaging waste statistics, 2024" />
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

                  {/* Cat 3 — fuel and energy related activities: derived from the bound GHG inventory, with
                      no input of its own but the known-emissions override. Every sentence comes from
                      lib/scope3/cat3Copy.ts; none is typed here (categoryMethods.test.ts M12). */}
                  {cat.id === 'cat3' && <>
                    <div style={{ gridColumn: '1 / -1', background: '#E6F1FB', borderRadius: 8, padding: '0.75rem', fontSize: 11, color: '#0C447C', lineHeight: 1.6 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>What this figure is</div>
                      <p style={{ margin: '0 0 6px' }}><Cat3GhgLink sentence={CAT3_DERIVED_SENTENCE} link="derived" /></p>
                      <p style={{ margin: '0 0 6px' }}>{CAT3_EXCLUDES_COMBUSTION_SENTENCE}</p>
                      <p style={{ margin: '0 0 6px' }}>{CAT3_STAND_IN_SENTENCE}</p>
                      <p style={{ margin: '6px 0 0', fontSize: 10 }}>
                        {CAT3_ATTRIBUTION}{' '}
                        <a href={DEFRA_ENERGY_META.licence_url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{DEFRA_ENERGY_META.licence}</a>
                      </p>
                    </div>

                    {/* No figure, and the reason, in the words that withheld it. An amber box rather than a
                        silent empty panel: this is the state a customer has to act on, in the GHG module. */}
                    {cat3NoFigureAnswer && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.6rem 0.7rem', lineHeight: 1.6 }}>
                        {cat3NoFigureAnswer.link
                          ? <Cat3GhgLink sentence={cat3NoFigureAnswer.text} link={cat3NoFigureAnswer.link} />
                          : cat3NoFigureAnswer.text}
                      </div>
                    )}

                    {/* A spend left by the old method: said out loud, in the same words the export
                        carries, so a customer who remembers typing it can see where it went. */}
                    {cat3RetiredSpend && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6 }}>
                        {cat3RetiredSpendText(cat3RetiredSpend)}
                      </div>
                    )}

                    {/* The saved record is older than the inventory it was computed from. Amber, like
                        the other "you need to act on this" states, and above the figure it describes. */}
                    {cat3Stale && cat3Change && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.6rem 0.7rem', lineHeight: 1.6 }}>
                        <Cat3GhgLink sentence={cat3StaleNotice(cat3Change)} link="stale" />
                      </div>
                    )}

                    {/* Activity D answered yes: the same sentence the screening step showed, the export
                        carries and the coverage entry stores. The workings stay below it, because the
                        lines are real and the customer keeps them. */}
                    {cat3ExcludedFor3d && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.6rem 0.7rem', lineHeight: 1.6 }}>
                        {cat3ThreeDWithheld('panel')}
                      </div>
                    )}
                    {cat3ExcludedFor3d && cat3Priced && cat3Priced.status !== 'withheld' && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6 }}>
                        {CAT3_3D_LINES_NOT_IN_TOTAL}
                      </div>
                    )}

                    {cat3Priced && cat3Priced.status !== 'withheld' && (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <SpendFactorWorkings
                          id="cat3-energy"
                          figureMt={cat3Mt() ?? 0}
                          status={cat3ExcludedFor3d ? CAT3_3D_NOT_IN_TOTAL_TAG : undefined}
                          summary={cat3WorkingsSummary(cat3Priced, cat3Read.skipped)}
                          sentences={cat3Sentences(cat3Priced, cat3Read, cat3GwpSentence, cat3ExcludedFor3d)}
                        />
                      </div>
                    )}

                    {/* ⚠️ UNDER THE CARD, NOT ON THE ROW. The workings card renders strings (it is shared
                        with Cats 5, 6, 7 and 12), so a row cannot carry a link without changing that
                        contract for four other categories. The row still says what is wrong; this is
                        the way to fix it, once per kind. */}
                    {cat3Priced && cat3GhgFixes(cat3Priced, cat3Read).length > 0 && boundInventoryId && (
                      <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.7 }}>
                        {CAT3_FIX_IN_GHG_HEADING}
                        {cat3GhgFixes(cat3Priced, cat3Read).map(key => (
                          <div key={key}>
                            <a href={ghgHref(boundInventoryId, CAT3_GHG_LINKS[key].step as GhgStep)} style={cat3ActionStyle}>
                              {CAT3_GHG_LINKS[key].label} →
                            </a>
                          </div>
                        ))}
                        {!showSaved && (
                          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--color-state-warn)', lineHeight: 1.5 }}>
                            {CAT3_SAVE_FIRST_HINT}
                          </div>
                        )}
                      </div>
                    )}

                    <div style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Known emissions (mt CO₂e), optional override</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder={KNOWN_EMISSIONS_PLACEHOLDER} />
                    </div>
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
                      <label style={labelStyle}>Known financed emissions (mt CO₂e), if you already hold the figure</label>
                      <input style={inputStyle} type="number" value={Number.isFinite(catData['cat15']?.emissions_override) ? catData['cat15']?.emissions_override : ''} onChange={e => updateCat('cat15', 'emissions_override', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="Leave blank to itemise the holdings below" />
                      <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>Enter 0 if this portfolio finances no emissions: that is an answer, and it is recorded as one. Leaving it blank is not.</div>
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
                      {/* ⚠️ WHILE A KNOWN TOTAL IS ENTERED THE HOLDINGS ARE NOT IN THE FIGURE, AND THE PANEL SAYS SO.
                          cat15OverrideEntered is the question cat15Figure asks, so the note and the figure agree. */}
                      {cat15OverrideEntered(catData['cat15']) && cat15Assets().length > 0 && (
                        <div role="status" style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.6rem 0.7rem', lineHeight: 1.5 }}>
                          {CAT15_HOLDINGS_SUPERSEDED}
                        </div>
                      )}
                      {cat15Assets().length === 0 && (
                        <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', background: '#f8f7f5', borderRadius: 8, padding: '0.75rem', lineHeight: 1.5 }}>
                          No holdings yet. Add one per investment or loan, or enter a known figure above. Until one or the other is there, Category 15 is reported as not calculated, and is not counted as zero.
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
                              {/* ⚠️ BLANK IS undefined, NOT 0, and an entered 0 shows as 0. This wrote Number('') = 0 and showed 0 as
                                  blank, so an unfinished holding computed to zero and looked untouched. */}
                              <input style={inputStyle} type="number" value={row.outstandingAmount ?? ''} onChange={e => updatePcafAsset(row.id, { outstandingAmount: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="e.g. 5,000,000" />
                            </div>
                            <div>
                              {/* Correctness-critical: denominator label tracks the selected asset class */}
                              <label style={labelStyle}>{meta.denominatorLabel} ({currency})</label>
                              <input style={inputStyle} type="number" value={row.denominator || ''} onChange={e => updatePcafAsset(row.id, { denominator: Number(e.target.value) })} placeholder="e.g. 50,000,000" />
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
                                The investee&apos;s own reported figure, from their annual report, CDP response or a data provider. ThemisIQ does not estimate it from their revenue: that needs revenue-specific factors we do not hold, and the sector factors we do hold are not those.
                              </div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              {(() => {
                                // ⚠️ ASKED OF THE SAME FUNCTION THE TOTAL USES. assessHolding runs the
                                // library's own assessAsset on the STRIPPED row, so a row that shows a
                                // figure here is a row the portfolio total contains, and one that says
                                // "complete this holding" is one that withholds the whole figure.
                                const a = assessHolding(row)
                                if (!a) {
                                  // Names only what THIS holding lacks, from cat15.ts (holdingMissing).
                                  return <div style={{ fontSize: 11, color: 'var(--color-ink-muted)' }}>{cat15HoldingIncomplete(row)}</div>
                                }
                                // While a known total is entered this figure is not in the total: muted, and said.
                                if (cat15OverrideEntered(catData['cat15'])) {
                                  return <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', fontWeight: 600 }}>Financed: {a.financedEmissions.toFixed(1)} tCO₂e · {(a.attributionFactor * 100).toFixed(1)}% of the investee · PCAF DQ {a.dqScore} · {CAT15_HOLDING_NOT_USED}</div>
                                }
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
                              <div style={{ fontSize: 10, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.5 }}>Distribution across holdings. A low weighted score can hide high-tier outliers, so the spread is shown alongside.</div>
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
                              <div style={{ fontSize: 11, color: '#B91C1C', lineHeight: 1.5 }}>{cappedCount} holding(s) have exposure exceeding the asset value, so attribution is capped at 100%. Check outstanding amount vs denominator.</div>
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
                        <input style={inputStyle} type="number" value={catData[cat.id]?.annual_spend || ''} onChange={e => updateCat(cat.id, 'annual_spend', Number(e.target.value))} placeholder="e.g. 400,000" />
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
                        <label style={labelStyle}>Known emissions (mt CO₂e), optional override</label>
                        <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder={KNOWN_EMISSIONS_PLACEHOLDER} />
                      </div>
                    </>
                  })()}

                  {/* Generic spend-based for the six categories that keep the flat factor (8, 9, 10, 11, 13
                      and 14). Cat 12 left on 18 Sep 2026 and Cat 3 on 20 Sep 2026, each for its own panel. */}
                  {/* ⚠️ THE ANNUAL SPEND FIELD WAS REMOVED HERE ON 25 SEP 2026. The nine ids excluded above
                      have panels of their own, so what reaches this block is exactly Categories 8, 9, 10,
                      11, 13 and 14 — the six that now carry `no_method`. Nothing reads a spend for them any
                      more, and a field that accepts a number no calculation consults is worse than no
                      field: the customer does the work and the product quietly discards it. For five of
                      the six it was never their spend to give.
                        The known-emissions field STAYS and is now the only input, because
                      METHOD_TAKES_ENTERED_FIGURE is true for no_method: a company that holds its own
                      Category 11 figure is not blocked by the platform having no estimate of its own. */}
                  {!['cat1', 'cat2', 'cat3', 'cat4', 'cat6', 'cat7', 'cat5', 'cat12', 'cat15'].includes(cat.id) && <>
                    <div>
                      <label style={labelStyle}>Known emissions (mt CO₂e)</label>
                      <input style={inputStyle} type="number" value={catData[cat.id]?.emissions_override || ''} onChange={e => updateCat(cat.id, 'emissions_override', Number(e.target.value))} placeholder={NO_ESTIMATE_PLACEHOLDER} />
                      <div style={{ fontSize: 11, color: 'var(--color-ink-muted)', marginTop: 6, lineHeight: 1.6 }}>
                        {scope3MethodDescription('no_method')}
                      </div>
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
        <p style={sectionSub}>Your Scope 3 total across the categories marked relevant and calculated, aligned with the GHG Protocol.</p>
        <div className="tq-band" style={{ borderRadius: 16, padding: '2rem', textAlign: 'center', color: 'var(--color-ink-2)', fontSize: 13 }}>
          Scope 3 results...
        </div>
      </div>
    )

    return (
      <div>
        <h2 style={sectionHead}>Scope 3 results</h2>
        <p style={sectionSub}>Your Scope 3 total across the categories marked relevant and calculated, aligned with the GHG Protocol.</p>

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
              {lowCount > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 99, background: '#FEF3E2', color: 'var(--color-state-warn)', fontWeight: 600 }}>{lowCount} not calculated</span>}
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
            <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', margin: '0 24px 20px', textAlign: 'left' as const }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>
                ⚠ This total excludes {unpricedCats.length} categor{unpricedCats.length === 1 ? 'y' : 'ies'} that {unpricedCats.length === 1 ? 'was' : 'were'} not priced
              </div>
              {/* One line per category, each with its OWN observed reason. See unpricedReason. */}
              {unpricedCats.map(c => (
                <div key={c.id} style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, marginTop: 2 }}>
                  <strong style={{ fontWeight: 600 }}>Cat {c.num} {c.name}:</strong> {unpricedReason(c.id, 'results')}
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
                    <div style={{ fontSize: 10, color: 'var(--color-state-warn)', lineHeight: 1.4, marginTop: 2 }}>
                      {st.label} (reported, not in the total)
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
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-ink-muted)', fontSize: 13 }}>
              {/* Two states, two messages: nothing entered, or everything entered and left out of the
                  total for reasons the amber box above this table already gives. */}
              {unpricedCats.length > 0 ? resultsTableAllUnpriced(unpricedCats.length) : RESULTS_TABLE_EMPTY}
            </div>
          )}
        </div>

        {/* A figure outside the total needs saying out loud, or it reads as a bug. */}
        {activeCats.some(c => { const st = statusOf(c.id); return !st.inTotal && st.calculated }) && (
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-ink-muted)', lineHeight: 1.6, maxWidth: '72ch' }}>
            A category you judged not relevant keeps the figure you calculated for it. The figure is shown because it
            is what justifies the exclusion (a category is easier to exclude when you can say how small it is), and it
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
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-ink-muted)', marginBottom: 8 }}>EXCLUDED: JUDGED NOT RELEVANT</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CATEGORIES.filter(c => catData[c.id]?.relevant === false).map(c => {
                const reason = (catData[c.id]?.excluded_reason || '').trim()
                return (
                  <div key={c.id} style={{ fontSize: 12, color: '#555553', lineHeight: 1.6 }}>
                    <strong style={{ fontWeight: 600, color: '#0d0d0d' }}>Cat {c.num} {c.name}:</strong>{' '}
                    {reason
                      ? reason
                      : <span style={{ color: 'var(--color-state-warn)' }}>No justification recorded. The GHG Protocol requires one for every excluded category. Add it in the Relevance step.</span>}
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
                <div style={{ fontSize: 13, color: 'var(--color-ink-2)', lineHeight: 1.6, marginBottom: 18 }}>Your complete inventory is ready: the total, the category-by-category breakdown, and the data-quality flags for every line. Unlock the GHG module to view and download it.</div>
                <a href="/pricing" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: 'var(--color-brand)', color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>See pricing &amp; unlock →</a>
                <div style={{ fontSize: 11, color: 'var(--color-ink-2)', marginTop: 12 }}>The calculator stays free. You only pay to unlock results &amp; export.</div>
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
        <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>
            {unjustifiedExclusions.length} excluded {unjustifiedExclusions.length === 1 ? 'category has' : 'categories have'} no justification
          </div>
          <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
            {unjustifiedExclusions.map(c => `Cat ${c.num} ${c.name}`).join(' · ')}. The GHG Protocol requires a
            justification for every category you exclude. You can export without one (the file records the exclusion
            as unjustified), but a reader of the report will be missing the reason.
          </div>
        </div>
      )}

      {/* ⚠️ BESIDE THE EXCLUSIONS NOTICE AND TREATED THE SAME WAY: named here, not blocked here. A
          supplier who reported a figure while stating they measure nothing has contradicted themselves,
          and only they can say which half they meant. The figure is included exactly as reported and
          the export is not gated on it.
          Sourced from the lines behind the figure the buyer ACCEPTED rather than from the last pull, so
          it still holds after the save. ⚠️ SESSION-SCOPED: snapshots are not read back on page load, so
          after a refresh there are no lines and no notice. Its absence therefore asserts nothing, which
          is why nothing here ever says "no contradictions". */}
      {(() => {
        const clash = acceptedCatOneLines ? assuranceContradictionSentence(acceptedCatOneLines) : null
        return clash ? (
          <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.9rem 1rem', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-state-warn)', marginBottom: 4 }}>
              A supplier figure and a supplier answer disagree
            </div>
            <div style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{clash}</div>
          </div>
        ) : null
      })()}

      <div className="tq-summary" data-module="ghg" style={{ marginBottom: 20 }}>
        <div style={{ flex: 1, padding: '20px 24px' }}>
        <div className="tq-summary-label" style={{ marginBottom: 12 }}>Inventory summary: {company || 'Your company'}</div>
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
          {/* ⚠️ INLINE, NOT A BROWSER DIALOG. A dialog cannot be copied into a message to us, is gone
              the moment it is dismissed, and reads as an error the page had no words for. This stays
              on screen until the next save, in the same amber the wizard already uses for "you need
              to act on this". The guard in lib/scope3/saveError.test.ts SE4 bans the dialog call by
              name, so this comment does not spell it. */}
          {saveError && (
            <div role="alert" style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', borderRadius: 8, padding: '0.7rem 0.8rem', marginTop: 12, lineHeight: 1.6, maxWidth: '72ch' }}>
              {saveError}
            </div>
          )}
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
            <p style={sectionSub}>Your Scope 3 links to a saved GHG inventory so company and year stay aligned. Go back and save your inventory, then click Complete Scope 3, or create a new inventory.</p>
            <a href="/dashboard/ghg" style={{ display: 'inline-block', padding: '11px 24px', borderRadius: 8, background: GRAD, color: 'var(--color-on-dark)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>Go to your GHG inventory →</a>
          </>
        ) : (
          <>
            <h2 style={sectionHead}>Which inventory is this Scope 3 for?</h2>
            {/* An id in the URL that did not open. One sentence, from lib/moduleLinks.ts, ending the
                way this page can honour: the picker is right below it. */}
            {bindError && (
              <div role="alert" style={{ background: '#FEF3C7', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 30%, transparent)', borderRadius: 10, padding: '0.75rem', marginBottom: 16, fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
                {bindError}
              </div>
            )}
            {inventoryList.length > 0 ? (
              <>
                {cameFromGhg && (
                  <div style={{ background: '#FEF3E2', border: '0.5px solid color-mix(in srgb, var(--color-state-warn) 20%, transparent)', borderRadius: 10, padding: '0.75rem', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--color-state-warn)', lineHeight: 1.6 }}>Came from a GHG inventory? If you don&apos;t see it below, it isn&apos;t saved yet: <a href="/dashboard/ghg" style={{ color: 'var(--color-state-warn)', fontWeight: 600 }}>go back and save it first</a>.</div>
                  </div>
                )}
                <p style={sectionSub}>Your Scope 3 inventory links to one of your GHG inventories so the company and reporting year stay aligned across both records. Pick which one this is for.</p>
                <label style={labelStyle}>GHG inventory</label>
                <select style={inputStyle} defaultValue="" onChange={e => { if (e.target.value) bindToInventory(e.target.value) }}>
                  <option value="" disabled>Select an inventory…</option>
                  {inventoryList.map(inv => (
                    <option key={inv.id} value={inv.id}>{(inv.company_name || 'Untitled')}, {inv.reporting_year}</option>
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
        {/* ⚠️ "All 15 categories" STAYS HERE ON PURPOSE. DO NOT "FIX" IT FOR CONSISTENCY WITH THE
            MARKETING PAGES. This is an in-product banner above the calculator itself: the customer is
            looking at all fifteen rows, each showing its own status, method and figure. The claim is about
            the SCOPE OF ENQUIRY, which is genuinely fifteen, and the per-category truth is on the screen
            beneath it. It is on a pricing page or a feature list that the same words are read as fifteen
            CALCULATED categories, which is why those sites now derive their claim instead.
            The sibling that also stays is the Scope 3 pointer in app/dashboard/ghg/page.tsx. */}
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fff' }}>GHG Protocol Scope 3 Standard · All 15 categories · CSRD ESRS E1-6 · CDP · SBTi · SB 253</span>
      </div>
      <div style={{ background: '#fff', borderBottom: '0.5px solid #e8e7e4', padding: '1.5rem 2.5rem' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ink-muted)', marginBottom: 4 }}>Climate: GHG Inventory</div>
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
                {/* ⚠️ THE METHOD LIST IS DERIVED. It read "Spend-based + activity-based + primary data", which was not
                    false but omitted the fourth state: six categories with no method at all. A hand-typed list of
                    method families cannot notice when one appears or empties. */}
                <div style={{ fontSize: 11, color: '#0F6E56', lineHeight: 1.6 }}><strong>GHG Protocol Scope 3 Standard</strong><br />{scope3ScopeClaim()}<br />{scope3MethodFamilies().join(' · ')}</div>
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
