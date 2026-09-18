// ── DEFRA/DESNZ 2026 WASTE FACTORS, AS THE SCOPE 3 CAT 5 PANEL READS THEM ────────────────────────
//
// ONE reader over defraWaste2026.json: the materials grouped by the sheet's seven activity blocks, the
// routes each material actually publishes, the factor for a (material, route) pair, and which method a
// material's factor represents. The page builds its selects and its figure from here, so a control
// cannot offer a pair the calculation has no factor for.
//
// CLIENT-SAFE. defraWaste2026.json is 139 small records (about 30 KB), and this module imports nothing
// else.
//
// ⚠️ AN UNPUBLISHED ROUTE IS NOT OFFERED AND HAS NO FACTOR. It is not zero. wasteFactor() returns null
// for it, and wasteRoutesFor() never lists it, so the only way to reach a pair with no factor is saved
// data that predates a change to the artefact - and that is priced as nothing, and reported as such.
//
// ⚠️ RE-USE IS NEVER OFFERED. The sheet has a Re-use column with no values in it, and the workbook's own
// FAQ says re-use is not a waste disposal method (metadata.reuse_faq_question / reuse_faq_answer).

import data from './defraWaste2026.json'

export interface DefraWasteRecord {
  activity: string
  waste_type: string
  route: string
  unit: string
  value: number
}

const RECORDS = data.factors as DefraWasteRecord[]

/** The artefact's own statements, for disclosure. Quoted from the workbook by the generator. */
export const DEFRA_WASTE_META = data.metadata as {
  source: string
  title_as_published: string
  edition: string
  factor_set: string
  file_version: string
  year: string
  sheet: string
  scope: string
  gwp_basis: string
  gwp_basis_note: string
  unit: string
  absent_route_note: string
  scope_guidance: string
  lifecycle_guidance: string
  reuse_faq_question: string
  reuse_faq_answer: string
  licence: string
  licence_url: string
  licence_basis: string
  /** ⚠️ VERBATIM, WHEREVER A CAT 5 FIGURE IS SHOWN. The attribution OGL v3.0 prescribes when the provider
   *  gives none of its own. Read this field; never type the sentence out. */
  attribution_required: string
  licence_note: string
  routes: string[]
  fingerprint_sha256: string
}

/** The route the workbook lists and publishes nothing under. Never offered. */
export const NOT_A_DISPOSAL_ROUTE = 'Re-use'

/** The workbook's guidance lines begin with a "●  " list marker. It is layout, not wording; this
 *  removes the marker and nothing else, so the sentence a surface shows is otherwise verbatim. */
export const withoutListMarker = (line: string): string => line.replace(/^●\s+/, '')

/** A stable, unambiguous select value for a material: the activity block and the waste type together. */
export const wasteMaterialKey = (activity: string, wasteType: string): string => JSON.stringify([activity, wasteType])

/** The inverse of wasteMaterialKey. null for anything that is not a key it made. */
export function parseWasteMaterialKey(key: string): { activity: string; waste_type: string } | null {
  try {
    const v: unknown = JSON.parse(key)
    if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && typeof v[1] === 'string') {
      return { activity: v[0], waste_type: v[1] }
    }
  } catch { /* not a key */ }
  return null
}

export interface WasteMaterialGroup {
  activity: string
  materials: string[]
}

/** The materials under their activity blocks, both in the order the sheet prints them. */
export const WASTE_MATERIAL_GROUPS: readonly WasteMaterialGroup[] = (() => {
  const groups: WasteMaterialGroup[] = []
  for (const r of RECORDS) {
    let g = groups.find(x => x.activity === r.activity)
    if (!g) { g = { activity: r.activity, materials: [] }; groups.push(g) }
    if (!g.materials.includes(r.waste_type)) g.materials.push(r.waste_type)
  }
  return groups
})()

/** The routes this material publishes a factor for, in the sheet's column order. Never Re-use. Empty for
 *  a material the artefact does not hold. */
export function wasteRoutesFor(activity: string, wasteType: string): string[] {
  const published = new Set(
    RECORDS.filter(r => r.activity === activity && r.waste_type === wasteType && r.route !== NOT_A_DISPOSAL_ROUTE).map(r => r.route),
  )
  return DEFRA_WASTE_META.routes.filter(route => published.has(route))
}

/** kg CO2e per tonne as published, or null where the sheet publishes nothing for the pair. */
export function wasteFactor(activity: string, wasteType: string, route: string): number | null {
  if (route === NOT_A_DISPOSAL_ROUTE) return null
  const r = RECORDS.find(x => x.activity === activity && x.waste_type === wasteType && x.route === route)
  return r ? r.value : null
}

// ── WHICH GHG PROTOCOL METHOD A MATERIAL'S FACTOR REPRESENTS ───────────────────────────────────────
//
// The Scope 3 Standard's Cat 5 methods: WASTE-TYPE-SPECIFIC, a factor for a specific material and
// treatment; AVERAGE-DATA, a factor for waste whose composition is averaged or unknown.
//
// ⚠️ THE RULE, NOT A LIST OF 42. The sheet names its averaged rows itself: every one whose name says
// "average" or "mixed" (Average construction; Organic: mixed food and garden waste; WEEE - mixed; Metal:
// mixed cans; Plastics: average plastics, average plastic film, average plastic rigid; Paper and board:
// mixed). A new edition that adds "Textiles: mixed" is classified correctly without an edit here.
//
// ⚠️ TWO ROWS THE WORDING CANNOT CATCH, NAMED WITH THEIR REASON. "Commercial and industrial waste" and
// "Household residual waste" are unsorted streams of unknown composition - the purest average-data rows
// in the sheet - and neither name contains either word. They are the only named exceptions, and the test
// fails if either disappears from the artefact, so a renamed stream cannot quietly fall back to
// waste-type-specific.
const AVERAGE_DATA_WORDING = /\b(average|mixed)\b/i

const UNSORTED_STREAMS: Readonly<Record<string, string>> = {
  'Commercial and industrial waste': 'an unsorted commercial and industrial stream of unknown composition',
  'Household residual waste': 'an unsorted residual stream of unknown composition',
}

export type WasteMethod = 'waste_type_specific' | 'average_data'

export function wasteMethodFor(wasteType: string): { method: WasteMethod; reason: string } {
  if (Object.hasOwn(UNSORTED_STREAMS, wasteType)) {
    return { method: 'average_data', reason: `${wasteType} is ${UNSORTED_STREAMS[wasteType]}` }
  }
  if (AVERAGE_DATA_WORDING.test(wasteType)) {
    return { method: 'average_data', reason: `${wasteType} is an averaged or mixed material as the workbook names it` }
  }
  return { method: 'waste_type_specific', reason: `${wasteType} is a specific material` }
}

/** For the test: the named exceptions, so their presence in the artefact can be checked. */
export const UNSORTED_STREAM_NAMES: readonly string[] = Object.keys(UNSORTED_STREAMS)

export const WASTE_METHOD_LABEL: Readonly<Record<WasteMethod, string>> = {
  waste_type_specific: 'waste-type-specific',
  average_data: 'average-data',
}

// ── PRICING ONE ROW ────────────────────────────────────────────────────────────────────────────────

/** The fields of a Cat 5 waste row that pricing reads. The page's WasteRow carries an id as well. */
export interface WasteRowInput {
  activity: string
  waste_type: string
  route: string
  tonnes: number
}

export type WasteRowPricing =
  | { status: 'priced'; factor_kg_per_tonne: number; kg_co2e: number; method: WasteMethod }
  /** Something the customer has not entered yet. `missing` names each field, in form order. */
  | { status: 'incomplete'; missing: ('material' | 'treatment route' | 'tonnes')[] }
  /** Every field is entered, but the sheet publishes no factor for the pair. The controls cannot produce
   *  this; saved data can, if a material or route it names is not in this artefact. Not a zero. */
  | { status: 'no_factor' }

export function priceWasteRow(row: WasteRowInput): WasteRowPricing {
  const missing: ('material' | 'treatment route' | 'tonnes')[] = []
  if (!row.activity || !row.waste_type) missing.push('material')
  if (!row.route) missing.push('treatment route')
  if (!(Number.isFinite(row.tonnes) && row.tonnes > 0)) missing.push('tonnes')
  if (missing.length > 0) return { status: 'incomplete', missing }
  const factor = wasteFactor(row.activity, row.waste_type, row.route)
  if (factor === null) return { status: 'no_factor' }
  return { status: 'priced', factor_kg_per_tonne: factor, kg_co2e: row.tonnes * factor, method: wasteMethodFor(row.waste_type).method }
}
