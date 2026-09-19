// ── EVERY CATEGORY 6 SENTENCE, BUILT ONCE ────────────────────────────────────────────────────────
//
// The Cat 6 panel, its workings, the CSV, factor_basis, the methodology hierarchy line and the GHG
// assistant read these. None is typed anywhere else. Each fact that comes from the workbook is read from
// defraTravel2026.json (a cell reference, a year, the uplift), not restated, so a regenerated artefact
// cannot leave a sentence behind.
//
// ⚠️ NO EM-DASHES, by instruction, as for Category 12.
//
// ⚠️ WHY THESE LIVE IN lib/ AND NOT IN THE PAGE: lib/publisherClaims.test.ts scans app/ for a publisher
// named in the same clause as "travel", "flight" or "hotel", because those words stood for factors with
// no recorded source. Cat 6's factors now have one, but Cat 7's still do not, and the rule is a guard; it
// is not loosened here. Built in lib/, the sentences are rendered by the page without being typed in it.

import { DEFRA_TRAVEL_META, AIR_RECORDS, WTT_AIR_RECORDS, RAIL_RECORDS, WTT_RAIL_RECORDS, HAUL_RECORDS, type AirCategory, type CabinClass } from '../emissionFactors/defraTravel'
import { NON_UK_SHORT_HAUL_FROM_KM, NON_UK_LONG_HAUL_FROM_KM, type BusinessTravelEvaluation, type EvaluatedFlight, type EvaluatedRail, type FlightPricing, type RailPricing } from './businessTravel'

const m = DEFRA_TRAVEL_META
const g = m.guidance
/** "Business travel- air A56": the sheet and cell a sentence cites. */
const cite = (key: string): string => {
  const q = g[key]
  if (!q) throw new Error(`businessTravelCopy: the artefact has no guidance quote "${key}"`)
  return `${q.sheet} ${q.cell}`
}
/** A value the sentences need, read from a quoted cell. Throws at load if the quote no longer says it. */
const readFrom = (key: string, re: RegExp): string => {
  const hit = g[key]?.text.match(re)
  if (!hit) throw new Error(`businessTravelCopy: guidance "${key}" no longer matches ${re}`)
  return hit[1]
}

const km = (n: number): string => n.toLocaleString('en', { maximumFractionDigits: 4 })

/** The increase DEFRA applies to the CO2 component for radiative forcing, in per cent, from A11: "an increase of 70%". */
const RF_PERCENT = readFrom('rf_two_sets', /causing an increase of (\d+)%/)
/** The same, as a multiplier on the CO2 component. For tests and arithmetic; the sentences state the per cent. */
export const RF_CO2_MULTIPLIER = 1 + Number(RF_PERCENT) / 100
const UPLIFT = readFrom('distance_uplift', /distance uplift of (\d+%)/)
const AIR_YEAR = readFrom('index_air_last_updated', /^Factors last updated in (\d{4}) publication/)
const WTT_AIR_YEAR = readFrom('index_wtt_air_last_updated', /^Factors last updated in (\d{4}) publication/)

const SHEET = {
  air: AIR_RECORDS[0].sheet,
  wttAir: WTT_AIR_RECORDS[0].sheet,
  rail: RAIL_RECORDS[0].sheet,
  wttRail: WTT_RAIL_RECORDS[0].sheet,
  haul: HAUL_RECORDS[0].sheet,
}

// ── THE SENTENCES ────────────────────────────────────────────────────────────────────────────────

export const CAT6_SOURCE_SENTENCE =
  `Priced from ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, factor edition ${m.edition}): ` +
  `the ${SHEET.air}, ${SHEET.wttAir}, ${SHEET.rail} and ${SHEET.wttRail} sheets, per passenger-km, ` +
  `with each flight's category read from the ${SHEET.haul} sheet.`

export const CAT6_CATEGORY_RULE_SENTENCE =
  `Each flight leg takes one of the sheet's categories: domestic when both ends are in the UK; the haul the ` +
  `${SHEET.haul} sheet gives the other end when one end is; and, when neither end is, domestic under ` +
  `${km(NON_UK_SHORT_HAUL_FROM_KM)} km, short-haul from ${km(NON_UK_SHORT_HAUL_FROM_KM)} km to under ` +
  `${km(NON_UK_LONG_HAUL_FROM_KM)} km and long-haul from ${km(NON_UK_LONG_HAUL_FROM_KM)} km, which departs from ` +
  `the sheet's guidance to use its international average for flights between non-UK countries ` +
  `(${cite('international_is_average')}) and follows the distance bands of the US EPA GHG Emission Factors ` +
  `Hub (2025), cited as the precedent for banding only, with no EPA figure used.`

export const CAT6_CLASS_SENTENCE =
  `Cabin class is applied where the sheet publishes a factor for it in the flight's category. Where the class ` +
  `is unknown, the average passenger factor is used, as the sheet's own example does ` +
  `(${cite('class_unknown_use_average')}); where the sheet publishes no factor for the entered class in that ` +
  `category, the average passenger factor is used as well, and the row says so.`

/**
 * ⚠️ THE ONE STATEMENT OF WHAT RADIATIVE FORCING DOES TO A FIGURE, AND WHOSE IT IS. The increase is DEFRA's,
 * built into its published With RF factors; ThemisIQ applies no multiplier of its own. Every Cat 6 surface
 * that names the adjustment (the CSV header, the setting sentence, the method description) uses this phrase,
 * so none can word it as ThemisIQ's. The per cent is parsed from A11.
 */
export const CAT6_RF_FACTORS_PHRASE =
  `DEFRA's With RF flight factors, which increase the CO2 component by ${RF_PERCENT}% to account for radiative ` +
  `forcing (${cite('rf_two_sets')})`

/** The radiative forcing setting, as the Technical Guidance asks it to be disclosed. */
export function cat6RfSentence(includeRf: boolean): string {
  const consistency = `The setting applies to the whole inventory; DEFRA advises against including it in one year and not another (${cite('rf_comparable_reporting')}).`
  return includeRf
    ? `Radiative forcing is included for this inventory: the figure uses ${CAT6_RF_FACTORS_PHRASE}. ` +
      `The figure without it is shown for every flight as well. ${consistency}`
    : `Radiative forcing is not included for this inventory: the figure uses DEFRA's Without RF flight factors. ` +
      `DEFRA recommends including it (${cite('rf_should_include')}); the figure from ${CAT6_RF_FACTORS_PHRASE} ` +
      `is shown for every flight as well. ${consistency}`
}

export const CAT6_UPLIFT_SENTENCE =
  `The sheet's flight factors include a distance uplift of ${UPLIFT} for indirect routing ` +
  `(${cite('distance_uplift')}), so each leg's distance is the direct distance with no uplift added. They are ` +
  `for direct (non-stop) flights (${cite('international_and_non_stop')}), so a journey with a stop is entered ` +
  `as one leg per flight.`

export const CAT6_WTT_SENTENCE =
  `Well-to-tank emissions, from extracting, refining and transporting the fuel, are added to every priced ` +
  `flight and rail journey and shown separately from combustion. The sheet's well-to-tank flight factors were ` +
  `last updated in its ${WTT_AIR_YEAR} publication and its flight factors in its ${AIR_YEAR} publication ` +
  `(${cite('index_wtt_air_last_updated')} and ${cite('index_air_last_updated')}), and the two imply different ` +
  `fuel use per passenger-km.`

export const CAT6_RAIL_SENTENCE =
  `Rail journeys are priced from the sheet's rail factors and their well-to-tank factors, which are UK figures; ` +
  `for a journey outside the UK they are used as a stand-in, and the journey is flagged.`

export const CAT6_HOTEL_SENTENCE =
  'Hotel stays are not included: they are optional under the GHG Protocol Scope 3 Standard, and the licence for ' +
  'the published hotel factors has not been confirmed.'

/** The field guidance under each flight leg's distance. */
export const CAT6_DISTANCE_HELP =
  `One-way direct distance, with no uplift added: the sheet's flight factors already include ${UPLIFT} ` +
  `(${cite('distance_uplift')}). A journey with a stop is one leg per flight.`

/** The CSV header line for the setting. */
export function cat6RfHeader(includeRf: boolean): string {
  return includeRf
    ? `Included: ${CAT6_RF_FACTORS_PHRASE}. Figures without it are in the Cat 6 rows.`
    : `Not included: DEFRA's Without RF flight factors are used. Figures from ${CAT6_RF_FACTORS_PHRASE} are also in the Cat 6 rows.`
}

/** The METHODOLOGY NOTE's basis and detail for a Cat 6 record, as categoryBasis returns them. */
export function cat6Basis(e: BusinessTravelEvaluation, countryName: (iso2: string) => string): { basis: string; detail: string } {
  const skippedList = [
    ...e.flights.filter(f => f.pricing.status !== 'priced').map(f => `flight leg ${f.n}, ${flightNotPricedReason(f.pricing as Exclude<FlightPricing, { status: 'priced' }>, countryName)}`),
    ...e.rail.filter(r => r.pricing.status !== 'priced').map(r => `rail journey ${r.n}, ${railNotPricedReason(r.pricing as Exclude<RailPricing, { status: 'priced' }>)}`),
  ]
  const skipped = skippedList.length > 0 ? ` Not priced: ${skippedList.join('; ')}.` : ''
  if (!e.calculated) {
    return { basis: 'No data', detail: `No complete flight leg or rail journey was entered, so nothing was calculated.${skipped}` }
  }
  const counts = [
    e.pricedFlights.length > 0 && `${e.pricedFlights.length} flight ${e.pricedFlights.length === 1 ? 'leg' : 'legs'}`,
    e.pricedRail.length > 0 && `${e.pricedRail.length} rail ${e.pricedRail.length === 1 ? 'journey' : 'journeys'}`,
  ].filter(Boolean).join(' and ')
  return {
    basis: `${m.source}, business travel factors per passenger-km, radiative forcing ${e.includeRf ? 'included' : 'not included'}, well-to-tank added`,
    detail: `${cat6MethodDescription()} ${counts} priced. ${cat6RfSentence(e.includeRf)}${skipped}`,
  }
}

/** What Category 6 takes, for the GHG assistant's answer about personal vehicles. */
export const CAT6_TAKES =
  'flight legs (origin, destination, cabin class, passengers or trips, and distance) and rail journeys ' +
  '(country, rail type, distance and passengers), and no hotel stays'

/** The hierarchy line and the CSV Method cell: scope3MethodDescription('business_travel_factors'). */
export function cat6MethodDescription(): string {
  return (
    `Activity-based, per flight leg and rail journey: passenger-km (the direct one-way distance times the ` +
    `passengers or trips) multiplied by the kg CO2e per passenger-km published in ${m.source} ` +
    `(${m.factor_set.toLowerCase()} v${m.file_version}, ${SHEET.air} and ${SHEET.rail} sheets, ${m.gwp_basis} GWPs), ` +
    `with well-to-tank emissions from the matching well-to-tank sheets added. ${CAT6_CATEGORY_RULE_SENTENCE} ` +
    `Radiative forcing is included unless the inventory turns it off, using ${CAT6_RF_FACTORS_PHRASE}, and the ` +
    `setting is recorded with each inventory. ` +
    `${CAT6_UPLIFT_SENTENCE} ${CAT6_RAIL_SENTENCE} ${CAT6_HOTEL_SENTENCE} ${m.attribution_required}`
  )
}

/** The assistant's short phrase for the method. */
export const CAT6_ASSISTANT_PHRASE =
  `priced from the UK DEFRA/DESNZ ${m.year} business travel factors, per flight leg (by origin, destination, ` +
  `cabin class and distance) and per rail journey, with well-to-tank emissions added, radiative forcing ` +
  `included unless the inventory turns it off, and hotel stays not included`

// ── ROWS ─────────────────────────────────────────────────────────────────────────────────────────

export const AIR_CATEGORY_LABEL: Readonly<Record<AirCategory, string>> = {
  domestic: 'Domestic',
  short_haul: 'Short-haul',
  long_haul: 'Long-haul',
  international_non_uk: 'International, non-UK',
}

export const CABIN_CLASS_LABEL: Readonly<Record<CabinClass, string>> = {
  average_passenger: 'Average passenger',
  economy: 'Economy',
  premium_economy: 'Premium economy',
  business: 'Business',
  first: 'First',
}

const kgStr = (n: number): string => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** How the leg's category was reached, in words. */
export function flightRuleText(p: Extract<FlightPricing, { status: 'priced' }>): string {
  if (p.rule === 'both_uk') return 'both ends in the UK, so domestic'
  if (p.rule === 'uk_end') return `UK end, so the haul the ${SHEET.haul} sheet gives ${p.haul!.territory}: ${AIR_CATEGORY_LABEL[p.category].toLowerCase()}`
  return `neither end in the UK, so by distance: ${AIR_CATEGORY_LABEL[p.category].toLowerCase()}`
}

/** The class the factor was read for, and why, where it is not the one entered. */
export function flightClassText(p: Extract<FlightPricing, { status: 'priced' }>, entered: string): string {
  if (p.class_note === 'as_entered') return CABIN_CLASS_LABEL[p.class_used]
  if (p.class_note === 'unknown') return `Average passenger (class unknown, ${cite('class_unknown_use_average')})`
  // not_published
  return `Average passenger (${entered} is not published for ${AIR_CATEGORY_LABEL[p.category].toLowerCase()})`
}

const DISTANCE_MISMATCH = 'its stored km figure is missing or does not match the distance as entered; enter the distance again'

export function flightNotPricedReason(p: Exclude<FlightPricing, { status: 'priced' }>, countryName: (iso2: string) => string): string {
  if (p.status === 'incomplete') return `not entered yet: ${p.missing.join(', ')}`
  if (p.status === 'distance_mismatch') return DISTANCE_MISMATCH
  return `it has a UK end, and the ${SHEET.haul} sheet gives no haul for ${countryName(p.unlisted_iso2)}, so its category cannot be set`
}

export function railNotPricedReason(p: Exclude<RailPricing, { status: 'priced' }>): string {
  if (p.status === 'incomplete') return `not entered yet: ${p.missing.join(', ')}`
  if (p.status === 'distance_mismatch') return DISTANCE_MISMATCH
  return 'its rail type has no factor in the sheet; choose the rail type again'
}

/** The workings card's one-line summary. */
export function cat6WorkingsSummary(e: BusinessTravelEvaluation): string {
  const parts = [
    e.pricedFlights.length > 0 && `${e.pricedFlights.length} flight ${e.pricedFlights.length === 1 ? 'leg' : 'legs'}`,
    e.pricedRail.length > 0 && `${e.pricedRail.length} rail ${e.pricedRail.length === 1 ? 'journey' : 'journeys'}`,
  ].filter(Boolean).join(' and ')
  return `${parts} priced from the DEFRA/DESNZ ${m.year} business travel factors, radiative forcing ${e.includeRf ? 'included' : 'not included'}, well-to-tank added`
}

/**
 * The workings and the CSV's Cat 6 disclosure rows: the same sentences in both, as for Cats 5 and 12.
 * `gwpSentence` is the shared publisher GWP sentence against the bound inventory (gwpSentence.ts).
 */
export function cat6Sentences(e: BusinessTravelEvaluation, gwpSentence: string, countryName: (iso2: string) => string): string[] {
  const out = [
    CAT6_SOURCE_SENTENCE,
    m.attribution_required,
    `Licence: ${m.licence}, ${m.licence_url}`,
    CAT6_CATEGORY_RULE_SENTENCE,
    CAT6_CLASS_SENTENCE,
    cat6RfSentence(e.includeRf),
    CAT6_UPLIFT_SENTENCE,
    CAT6_WTT_SENTENCE,
    CAT6_RAIL_SENTENCE,
    CAT6_HOTEL_SENTENCE,
    gwpSentence,
    `Combustion ${kgStr(e.kg.combustion)} kg CO2e and well-to-tank ${kgStr(e.kg.wtt)} kg CO2e, ${kgStr(e.kg.total)} kg CO2e in all. ` +
      `Flights with radiative forcing ${kgStr(e.kg.air_with_rf)} kg CO2e, without ${kgStr(e.kg.air_without_rf)} kg CO2e (combustion only).`,
  ]
  for (const f of e.flights) if (f.pricing.status !== 'priced') out.push(`Flight leg ${f.n} is not in this figure: ${flightNotPricedReason(f.pricing, countryName)}.`)
  for (const r of e.rail) if (r.pricing.status !== 'priced') out.push(`Rail journey ${r.n} is not in this figure: ${railNotPricedReason(r.pricing)}.`)
  return out
}

/** One CSV row per flight leg: [label, value, note]. */
export function flightCsvRow(f: EvaluatedFlight, countryName: (iso2: string) => string, includeRf: boolean): [string, string, string] {
  const r = f.row
  const entered = [
    `${r.origin_iso2 ? countryName(r.origin_iso2) : '(no origin)'} to ${r.destination_iso2 ? countryName(r.destination_iso2) : '(no destination)'}`,
    `${r.distance ?? ''} ${r.distance_unit}`,
    `${r.count ?? ''} ${r.count === 1 ? 'passenger or trip' : 'passengers or trips'}`,
    `class ${r.cabin_class ? r.cabin_class.replace('_', ' ') : '(none)'}`,
  ].join(', ')
  const p = f.pricing
  if (p.status !== 'priced') return [`Flight leg ${f.n}`, entered, `Not priced: ${flightNotPricedReason(p, countryName)}.`]
  const note =
    `${kgStr(p.km)} km; ${flightRuleText(p)}; class used: ${flightClassText(p, r.cabin_class.replace('_', ' '))}. ` +
    `Combustion with RF ${kgStr(p.kg.with_rf.kg_co2e)} kg CO2e (CO2 ${kgStr(p.kg.with_rf.co2)}), without RF ${kgStr(p.kg.without_rf.kg_co2e)} kg CO2e (CO2 ${kgStr(p.kg.without_rf.co2)}); ` +
    `well-to-tank ${kgStr(p.kg.wtt)} kg CO2e; in the figure (RF ${includeRf ? 'included' : 'not included'}): ${kgStr(p.kg.total)} kg CO2e. ` +
    `Source cells: ${p.cells.air_with_rf}, ${p.cells.air_without_rf}, ${p.cells.wtt}${p.cells.haul ? `, ${p.cells.haul}` : ''}.`
  return [`Flight leg ${f.n}`, entered, note]
}

/** One CSV row per rail journey. */
export function railCsvRow(r: EvaluatedRail, countryName: (iso2: string) => string): [string, string, string] {
  const row = r.row
  const entered = [
    row.country_iso2 ? countryName(row.country_iso2) : '(no country)',
    row.rail_type || '(no rail type)',
    `${row.distance ?? ''} ${row.distance_unit}`,
    `${row.passengers ?? ''} ${row.passengers === 1 ? 'passenger' : 'passengers'}`,
  ].join(', ')
  const p = r.pricing
  if (p.status !== 'priced') return [`Rail journey ${r.n}`, entered, `Not priced: ${railNotPricedReason(p)}.`]
  const note =
    `${kgStr(p.km)} km; combustion ${kgStr(p.kg.combustion)} kg CO2e; well-to-tank ${kgStr(p.kg.wtt)} kg CO2e; ` +
    `${kgStr(p.kg.total)} kg CO2e in the figure.${p.uk_stand_in ? ' UK rail factor used as a stand-in outside the UK.' : ''} ` +
    `Source cells: ${p.cells.rail}, ${p.cells.wtt}.`
  return [`Rail journey ${r.n}`, entered, note]
}
