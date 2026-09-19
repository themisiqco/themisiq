// ── EVERY CATEGORY 7 SENTENCE, BUILT ONCE ────────────────────────────────────────────────────────
//
// The Cat 7 panel, its workings, the CSV, factor_basis, the methodology hierarchy line and the GHG
// assistant read these. None is typed anywhere else. Every workbook fact (a cell, a year, the factor per
// hour) is read from defraTravel2026.json, so a regenerated artefact cannot leave a sentence behind.
//
// ⚠️ NO EM-DASHES (lib/scope3/scope3Copy.test.ts). And, as for Category 6, built in lib/ rather than the page:
// lib/publisherClaims.test.ts scans app/ for a publisher named in the same clause as "commut", "travel",
// "flight" or "hotel".

import { DEFRA_TRAVEL_META, HOMEWORKING_RECORDS, type CarFuel } from '../emissionFactors/defraTravel'
import type { CommutingEvaluation, EvaluatedCommute, EvaluatedHomeworking, CommutePricing, HomeworkingPricing, CommuteRow, LegacyCommutingData } from './commuting'

const m = DEFRA_TRAVEL_META
const g = m.guidance
const cite = (key: string): string => {
  const q = g[key]
  if (!q) throw new Error(`commutingCopy: the artefact has no guidance quote "${key}"`)
  return `${q.sheet} ${q.cell}`
}
const readFrom = (key: string, re: RegExp): string => {
  const hit = g[key]?.text.match(re)
  if (!hit) throw new Error(`commutingCopy: guidance "${key}" no longer matches ${re}`)
  return hit[1]
}
const COMBINED = HOMEWORKING_RECORDS.find(r => r.component === 'combined')
if (!COMBINED) throw new Error('commutingCopy: the artefact has no combined homeworking factor')
const COMBINED_CELL = `${COMBINED.sheet} ${COMBINED.cells.value}`

const LAND_YEAR = readFrom('index_land_updated_annually', /^Factors updated in (\d{4}) publication/)
const LAND_OLDER_YEAR = readFrom('index_land_last_updated', /^Factors last updated in (\d{4}) publication/)
const WTT_LAND_YEAR = readFrom('index_wtt_land_last_updated', /^Factors last updated in (\d{4}) publication/)
// What each Index cell says its year covers, checked so the sentence below cannot name the wrong modes.
if (!/Cars, Buses, Rail/.test(g.index_land_updated_annually.text) || !/Motorbikes, Taxis/.test(g.index_land_last_updated.text)) {
  throw new Error('commutingCopy: the Index cells no longer say which land factors each year covers')
}

// ── THE SENTENCES ────────────────────────────────────────────────────────────────────────────────

export const CAT7_SOURCE_SENTENCE =
  `Priced from ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, factor edition ${m.edition}): the ` +
  `Business travel- land and WTT- pass vehs & travel- land sheets for the journey, and the Homeworking sheet.`

export const CAT7_FORMULA_SENTENCE =
  'For each group of employees who commute the same way, the distance is the one-way distance times 2 for ' +
  'the return trip, times the days commuted per week, times the weeks per year, times the employees in the ' +
  'group; each mode’s factor is applied to that distance, and walking and cycling are counted at zero.'

export const CAT7_DAYS_SENTENCE =
  'Commuting days are as entered by the customer: the days per week actually commuted, times the weeks per ' +
  'year, excluding homeworking, holiday and business-travel days, as the GHG Protocol’s Technical Guidance ' +
  'describes (p. 92).'

export const CAT7_OCCUPANCY_SENTENCE =
  `Car and motorbike factors are per vehicle-km, the whole vehicle (${cite('land_vehicle_vs_passenger_km')}), so ` +
  'each group’s distance is divided by the occupancy the customer entered for it, which may be an ' +
  'average such as 1.3 from an occupancy survey. Taxi, bus, coach and rail factors are per passenger-km and ' +
  'need none.'

export const CAT7_STAND_IN_SENTENCE =
  'These are UK factors. For a group commuting outside the UK they are used as a stand-in, and the row is flagged.'

export const CAT7_ELECTRIC_SENTENCE =
  `The battery electric and plug-in hybrid car factors include the electricity used, at the UK grid’s ` +
  `intensity (${cite('land_electric_cars_include_electricity')}), and so do the rail factors ` +
  `(${cite('whats_new_uk_electricity_knock_on')}). Outside the UK they do not describe the local grid.`

export const CAT7_WTT_SENTENCE =
  `Well-to-tank emissions, from extracting, refining and transporting the fuel, are added to every priced ` +
  `commuting row and shown separately. The sheet’s factors for cars, buses and rail were updated in its ` +
  `${LAND_YEAR} publication and those for motorbikes and taxis last in its ${LAND_OLDER_YEAR} publication ` +
  `(${cite('index_land_updated_annually')} and ${cite('index_land_last_updated')}); its well-to-tank factors ` +
  `were last updated in its ${WTT_LAND_YEAR} publication (${cite('index_wtt_land_last_updated')}).`

export const CAT7_HOMEWORKING_SENTENCE =
  `Homeworking is optional under the GHG Protocol Scope 3 Standard (p. 46). Where entered, it is priced from ` +
  `the Homeworking sheet’s combined office equipment and heating factor per FTE working hour ` +
  `(${COMBINED_CELL}), for employees in the UK only: the factor is a UK average ` +
  `(${cite('homeworking_uk_average')}), mostly heating, with no cooling component. The workbook does not state ` +
  `whether it counts only the additional energy of working from home, which the GHG Protocol’s Technical ` +
  `Guidance asks for (p. 90).`

/** Why a homeworking row outside the UK is not priced. */
export const CAT7_HOMEWORKING_NOT_UK =
  `DEFRA’s homeworking factor is a UK average (${cite('homeworking_uk_average')}), mostly ` +
  'heating, with no cooling component, so it does not describe a home outside the UK'

/** The hierarchy line and the CSV Method cell: scope3MethodDescription('employee_commuting_factors'). */
export function cat7MethodDescription(): string {
  return (
    `Activity-based, per group of employees who commute the same way: employees times the one-way distance ` +
    `times 2, times the days commuted per week, times the weeks per year, multiplied by the kg CO2e published ` +
    `in ${m.source} (${m.factor_set.toLowerCase()} v${m.file_version}, Business travel- land sheet, ` +
    `${m.gwp_basis} GWPs) with well-to-tank emissions from the matching sheet added. Car and motorbike factors ` +
    `are per vehicle-km and are divided by the occupancy the customer enters; walking and cycling count as ` +
    `zero. ${CAT7_STAND_IN_SENTENCE} ${CAT7_HOMEWORKING_SENTENCE} ${m.attribution_required}`
  )
}

/** The assistant's short phrase for the method. */
export const CAT7_ASSISTANT_PHRASE =
  `priced from the UK DEFRA/DESNZ ${m.year} land travel factors, per group of employees by mode, distance, ` +
  `days commuted and, for cars and motorbikes, occupancy, with well-to-tank emissions added, and homeworking ` +
  `priced only for employees in the UK`

// ── ROWS ─────────────────────────────────────────────────────────────────────────────────────────

const FUEL_LABEL: Readonly<Record<CarFuel, string>> = {
  diesel: 'diesel', petrol: 'petrol', hybrid: 'hybrid', cng: 'CNG', lpg: 'LPG', unknown: 'unknown fuel',
  plug_in_hybrid: 'plug-in hybrid', battery_electric: 'battery electric',
}
export const CAR_FUEL_LABEL = FUEL_LABEL

const BUS_LABEL: Readonly<Record<string, string>> = {
  local_not_london: 'local bus (not London)', local_london: 'London bus', average_local: 'average local bus', coach: 'coach',
}
export const COMMUTE_BUS_LABEL = BUS_LABEL
export const TAXI_LABEL: Readonly<Record<string, string>> = { regular: 'regular taxi', black_cab: 'black cab' }

/** "average car, unknown fuel", "national rail", "walking or cycling". */
export function commuteModeText(row: CommuteRow): string {
  switch (row.mode) {
    case 'car': return `${row.car_size || '(no size)'} car, ${row.car_fuel ? FUEL_LABEL[row.car_fuel] : '(no fuel)'}`
    case 'motorbike': return `${row.motorbike_size || '(no size)'} motorbike`
    case 'taxi': return row.taxi_type ? TAXI_LABEL[row.taxi_type] : 'taxi (no type)'
    case 'bus': return row.bus_type ? BUS_LABEL[row.bus_type] : 'bus (no type)'
    case 'coach': return 'coach'
    case 'rail': return row.rail_type ? row.rail_type.toLowerCase() : 'rail (no type)'
    case 'walk_cycle': return 'walking or cycling'
    default: return '(no mode)'
  }
}

export function commuteNotPricedReason(p: Exclude<CommutePricing, { status: 'priced' }>): string {
  switch (p.status) {
    case 'incomplete': return `not entered yet: ${p.missing.join(', ')}`
    case 'invalid': return `${p.field} must be ${p.limit}`
    case 'distance_mismatch': return 'its stored km figure is missing or does not match the distance as entered; enter the distance again'
    case 'no_factor': return 'the sheet publishes no factor for this choice; choose it again'
  }
}

export function homeworkingNotPricedReason(p: Exclude<HomeworkingPricing, { status: 'priced' }>): string {
  switch (p.status) {
    case 'incomplete': return `not entered yet: ${p.missing.join(', ')}`
    case 'invalid': return `${p.field} must be ${p.limit}`
    case 'not_uk': return CAT7_HOMEWORKING_NOT_UK
  }
}

const n2 = (x: number) => x.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const n0 = (x: number) => x.toLocaleString('en', { maximumFractionDigits: 0 })

/** The flags a priced row carries, as short clauses. */
export function commuteFlags(p: Extract<CommutePricing, { status: 'priced' }>): string[] {
  return [
    p.uk_stand_in && 'UK factor used as a stand-in outside the UK',
    p.uk_electricity && 'the factor includes UK grid electricity',
  ].filter((x): x is string => typeof x === 'string')
}

/**
 * The group's distance, as the panel and the CSV both show it: passenger-km always, then, for the per
 * vehicle-km modes, the division by occupancy and the vehicle-km that are priced. ONE builder, because the
 * panel once skipped straight from km per commuter to vehicle-km and hid the passenger-km in between.
 */
export function commuteDistanceText(p: Extract<CommutePricing, { status: 'priced' }>): string {
  return p.vehicle_km !== null
    ? `${n0(p.passenger_km)} passenger-km, divided by occupancy ${p.occupancy} = ${n0(p.vehicle_km)} vehicle-km`
    : `${n0(p.passenger_km)} passenger-km`
}

/** One CSV row per commuting group: [label, input as entered, note]. */
export function commuteCsvRow(e: EvaluatedCommute, countryName: (iso2: string) => string): [string, string, string] {
  const r = e.row
  const entered = [
    commuteModeText(r),
    r.country_iso2 ? countryName(r.country_iso2) : '(no country)',
    `${r.employees ?? ''} employees`,
    `${r.distance ?? ''} ${r.distance_unit} one way`,
    `${r.days_per_week ?? ''} days a week`,
    `${r.weeks_per_year ?? ''} weeks a year`,
    ...(r.mode === 'car' || r.mode === 'motorbike' ? [`occupancy ${r.occupancy ?? ''}`] : []),
  ].join(', ')
  const p = e.pricing
  if (p.status !== 'priced') return [`Commuting group ${e.n}`, entered, `Not priced: ${commuteNotPricedReason(p)}.`]
  if (p.basis === 'none') {
    return [`Commuting group ${e.n}`, entered, `${n2(p.km)} km one way; ${n0(p.annual_km_per_commuter)} km a year per commuter; counted at zero.`]
  }
  const distance = commuteDistanceText(p)
  const flags = commuteFlags(p)
  return [`Commuting group ${e.n}`, entered,
    `${n2(p.km)} km one way; ${n0(p.annual_km_per_commuter)} km a year per commuter; ${distance}. ` +
    `Combustion ${n2(p.kg.combustion)} kg CO2e; well-to-tank ${n2(p.kg.wtt)} kg CO2e; ${n2(p.kg.total)} kg CO2e in the figure.` +
    `${flags.length ? ` ${flags.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join('. ')}.` : ''}` +
    ` Source cells: ${p.cells!.factor}, ${p.cells!.wtt}.`]
}

/** One CSV row per homeworking group. */
export function homeworkingCsvRow(e: EvaluatedHomeworking, countryName: (iso2: string) => string): [string, string, string] {
  const r = e.row
  const entered = [
    r.country_iso2 ? countryName(r.country_iso2) : '(no country)',
    `${r.employees ?? ''} employees`,
    `${r.days_per_week ?? ''} homeworking days a week`,
    `${r.weeks_per_year ?? ''} weeks a year`,
    `${r.hours_per_day ?? ''} hours a day`,
  ].join(', ')
  const p = e.pricing
  if (p.status !== 'priced') return [`Homeworking group ${e.n}`, entered, `Not priced: ${homeworkingNotPricedReason(p)}.`]
  return [`Homeworking group ${e.n}`, entered,
    `${n0(p.hours)} FTE working hours x ${p.factor} kg CO2e per hour = ${n2(p.kg)} kg CO2e. Source cell: ${p.cell}.`]
}

/** The workings card's one-line summary. */
export function cat7WorkingsSummary(e: CommutingEvaluation): string {
  const parts = [
    e.pricedCommutes.length > 0 && `${e.pricedCommutes.length} commuting ${e.pricedCommutes.length === 1 ? 'group' : 'groups'}`,
    e.pricedHomeworking.length > 0 && `${e.pricedHomeworking.length} homeworking ${e.pricedHomeworking.length === 1 ? 'group' : 'groups'}`,
  ].filter(Boolean).join(' and ')
  return `${parts} priced from the DEFRA/DESNZ ${m.year} land travel and homeworking factors, well-to-tank added`
}

/** The workings and the CSV's Cat 7 disclosure rows. `gwpSentence` is publisherGwpSentence for this record. */
export function cat7Sentences(e: CommutingEvaluation, gwpSentence: string): string[] {
  const out = [
    CAT7_SOURCE_SENTENCE,
    m.attribution_required,
    `Licence: ${m.licence}, ${m.licence_url}`,
    CAT7_FORMULA_SENTENCE,
    CAT7_DAYS_SENTENCE,
    CAT7_OCCUPANCY_SENTENCE,
    CAT7_STAND_IN_SENTENCE,
    CAT7_ELECTRIC_SENTENCE,
    CAT7_WTT_SENTENCE,
    CAT7_HOMEWORKING_SENTENCE,
    gwpSentence,
    `Combustion ${n2(e.kg.combustion)} kg CO2e, well-to-tank ${n2(e.kg.wtt)} kg CO2e and homeworking ` +
      `${n2(e.kg.homeworking)} kg CO2e: ${n2(e.kg.total)} kg CO2e in all.`,
  ]
  for (const c of e.commutes) if (c.pricing.status !== 'priced') out.push(`Commuting group ${c.n} is not in this figure: ${commuteNotPricedReason(c.pricing)}.`)
  for (const h of e.homeworking) if (h.pricing.status !== 'priced') out.push(`Homeworking group ${h.n} is not in this figure: ${homeworkingNotPricedReason(h.pricing)}.`)
  return out
}

/** The METHODOLOGY NOTE's basis and detail for a Cat 7 record. */
export function cat7Basis(e: CommutingEvaluation): { basis: string; detail: string } {
  const skipped = [
    ...e.commutes.filter(c => c.pricing.status !== 'priced').map(c => `commuting group ${c.n}, ${commuteNotPricedReason(c.pricing as Exclude<CommutePricing, { status: 'priced' }>)}`),
    ...e.homeworking.filter(h => h.pricing.status !== 'priced').map(h => `homeworking group ${h.n}, ${homeworkingNotPricedReason(h.pricing as Exclude<HomeworkingPricing, { status: 'priced' }>)}`),
  ]
  const tail = skipped.length ? ` Not priced: ${skipped.join('; ')}.` : ''
  if (!e.calculated) return { basis: 'No data', detail: `No complete commuting or homeworking group was entered, so nothing was calculated.${tail}` }
  const counts = [
    e.pricedCommutes.length > 0 && `${e.pricedCommutes.length} commuting ${e.pricedCommutes.length === 1 ? 'group' : 'groups'}`,
    e.pricedHomeworking.length > 0 && `${e.pricedHomeworking.length} homeworking ${e.pricedHomeworking.length === 1 ? 'group' : 'groups'}`,
  ].filter(Boolean).join(' and ')
  return {
    basis: `${m.source}, land travel factors per km with well-to-tank added${e.pricedHomeworking.length ? ', and homeworking per FTE working hour' : ''}`,
    detail: `${cat7MethodDescription()} ${counts} priced.${tail}`,
  }
}

// ── THE PREVIOUS FORM ────────────────────────────────────────────────────────────────────────────

const OLD_MODE: Readonly<Record<string, string>> = { car_petrol: 'car (petrol or diesel)', car_electric: 'car (electric)', bus: 'bus', rail: 'rail or metro' }

/** What a record saved under the previous Cat 7 form holds, and why it is not priced. null when it holds none. */
export function cat7LegacyNotice(d: LegacyCommutingData | undefined): { summary: string; sentences: string[] } | null {
  if (!d) return null
  const parts = [
    d.employee_count !== undefined && d.employee_count !== null && `${d.employee_count} employees`,
    d.avg_commute_km !== undefined && d.avg_commute_km !== null && `${d.avg_commute_km} km average one-way commute`,
    d.commute_mode !== undefined && d.commute_mode !== null && d.commute_mode !== '' && `mode ${OLD_MODE[d.commute_mode] ?? d.commute_mode}`,
    // The old select stored days per week x 47; divided back, it is the number the customer chose.
    d.wfh_days !== undefined && d.wfh_days !== null && `${Math.round(d.wfh_days / 47)} working-from-home ${Math.round(d.wfh_days / 47) === 1 ? 'day' : 'days'} a week`,
  ].filter((x): x is string => typeof x === 'string')
  if (parts.length === 0) return null
  const summary = parts.join(', ')
  return {
    summary,
    sentences: [
      `This inventory was saved with the previous Cat 7 form, which recorded ${summary}.`,
      'These figures are not priced and are not in the Cat 7 figure.',
      'The previous form priced a blank distance at 15 km and a missing mode as a petrol car, assumed 235 working ' +
        'days a year, and used fixed factors with no recorded source; its figure cannot be reproduced without ' +
        'repeating those assumptions.',
      'To price this commuting, add it as commuting groups below. The saved figures are kept as they were.',
    ],
  }
}
