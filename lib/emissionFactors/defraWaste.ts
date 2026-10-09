// ── DEFRA/DESNZ WASTE FACTORS, AS THE SCOPE 3 CAT 5 AND CAT 12 PANELS READ THEM ─────────────────────
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

//
// ⚠️ ONE ARTEFACT PER EDITION (T3e, 8 Oct 2026). defraWaste2023.json to defraWaste2026.json, each generated from its own
// workbook by scripts/generate-defra-waste.py --year. A row is priced on the edition selectEdition chose for the
// window (lib/scope3/defraEditions.ts), never on another. The materials and their names are the same in every edition
// held, so the selects are built from the newest; the routes a material publishes can differ (five Refuse routes are
// published in 2026 only), so wasteRoutesFor takes the edition.
//   DEFRA 2025 heads the Combustion column "Incineration with energy recovery" and defines it in the same words as
// 2026's "combustion" (Waste disposal A12). It is read as the Combustion route (Lisa's ruling, 8 Oct 2026); each 2025
// record keeps the name as published, and a priced row says so (renamedRouteNote).

import data2023 from './defraWaste2023.json'
import data2024 from './defraWaste2024.json'
import data2025 from './defraWaste2025.json'
import data2026 from './defraWaste2026.json'
import type { DefraEdition, DefraEditionCell } from '../scope3/defraEditionTypes'

export interface DefraWasteRecord {
  activity: string
  waste_type: string
  route: string
  unit: string
  value: number
  /** The value's own cell on the Waste disposal sheet. */
  cell: string
  /** The route's name as published, where it differs from the app's (2025: "Incineration with energy recovery"). */
  route_as_published?: string
}

/** A route published under another name, with the header cells and the sheet's own definition. */
export interface DefraWasteRouteRename { published: string; as: string; header_cells: string[]; definition_cell: string; definition: string }

/** The artefact's own statements, for disclosure. Quoted from the workbook by the generator. */
export interface DefraWasteMeta {
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
  /** null where the edition prints no Re-use FAQ (2023). */
  reuse_faq_question: string | null
  reuse_faq_answer: string | null
  licence: string
  licence_url: string
  licence_basis: string
  /** ⚠️ VERBATIM, WHEREVER A CAT 5 FIGURE IS SHOWN. The attribution OGL v3.0 prescribes when the provider
   *  gives none of its own. Read this field; never type the sentence out. */
  attribution_required: string
  licence_note: string
  routes: string[]
  route_renames: DefraWasteRouteRename[]
  fingerprint_sha256: string
  values_fingerprint_sha256: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ARTEFACTS: Readonly<Record<number, any>> = { 2023: data2023, 2024: data2024, 2025: data2025, 2026: data2026 }
/** The DEFRA waste editions held, oldest first. */
export const DEFRA_WASTE_YEARS: readonly number[] = Object.keys(ARTEFACTS).map(Number).sort((a, b) => a - b)
export const DEFRA_WASTE_NEWEST = DEFRA_WASTE_YEARS[DEFRA_WASTE_YEARS.length - 1]
const RECORDS_BY_YEAR = new Map(DEFRA_WASTE_YEARS.map(y => [y, ARTEFACTS[y].factors as DefraWasteRecord[]]))
const META_BY_YEAR = new Map(DEFRA_WASTE_YEARS.map(y => [y, ARTEFACTS[y].metadata as DefraWasteMeta]))
const RECORDS = RECORDS_BY_YEAR.get(DEFRA_WASTE_NEWEST)!

/** One held edition's statements (its source, sheet, guidance quotes, renames), or null for an edition not held. */
export function defraWasteMetaFor(year: number): DefraWasteMeta | null {
  return META_BY_YEAR.get(year) ?? null
}
/** The newest edition's statements: the licence and attribution (the same for every edition), and the page's
 *  framing where no window is bound. A priced row cites its own edition through defraWasteMetaFor. */
export const DEFRA_WASTE_META = META_BY_YEAR.get(DEFRA_WASTE_NEWEST)!

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

/** The routes this material publishes a factor for in an edition (the newest by default, for a page with no edition
 *  held), in the sheet's column order. Never Re-use. Empty for a material or edition the artefacts do not hold. */
export function wasteRoutesFor(activity: string, wasteType: string, year: number = DEFRA_WASTE_NEWEST): string[] {
  const records = RECORDS_BY_YEAR.get(year) ?? []
  const meta = META_BY_YEAR.get(year)
  const published = new Set(
    records.filter(r => r.activity === activity && r.waste_type === wasteType && r.route !== NOT_A_DISPOSAL_ROUTE).map(r => r.route),
  )
  return (meta?.routes ?? []).filter(route => published.has(route))
}

/** The record for a material and route in one edition, or null where that edition publishes nothing for the pair. */
export function wasteRecord(activity: string, wasteType: string, route: string, year: number): DefraWasteRecord | null {
  if (route === NOT_A_DISPOSAL_ROUTE) return null
  return (RECORDS_BY_YEAR.get(year) ?? []).find(x => x.activity === activity && x.waste_type === wasteType && x.route === route) ?? null
}

/** kg CO2e per tonne as published in one edition, or null where it publishes nothing for the pair. */
export function wasteFactor(activity: string, wasteType: string, route: string, year: number): number | null {
  return wasteRecord(activity, wasteType, route, year)?.value ?? null
}

/** The sentence a row priced on a renamed route carries: the name DEFRA published, and the sheet's own definition. */
export function renamedRouteNote(rec: DefraWasteRecord, year: number): string | null {
  if (!rec.route_as_published) return null
  const rn = META_BY_YEAR.get(year)?.route_renames.find(x => x.published === rec.route_as_published)
  const def = rn ? ` The sheet defines it in the same words as ${rec.route.toLowerCase()} in the other editions (Waste disposal ${rn.definition_cell}: "${withoutListMarker(rn.definition)}").` : ''
  return `DEFRA published this route in ${year} as "${rec.route_as_published}" (Waste disposal ${rec.cell}).${def}`
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
  | { status: 'priced'; factor_kg_per_tonne: number; kg_co2e: number; method: WasteMethod
      /** T3e: the edition the window selected, the value's own cell, and the renamed-route sentence where one applies. */
      edition: DefraEditionCell; cell: string; route_note: string | null }
  /** T3e: every field is entered, but the DEFRA edition the reporting window needs is not held. Not priced, never
   *  priced on another edition; `message` is the engine's sentence. */
  | { status: 'edition_missing'; edition: string; message: string }
  /** Something the customer has not entered yet. `missing` names each field, in form order. */
  | { status: 'incomplete'; missing: ('material' | 'treatment route' | 'tonnes')[] }
  /** Every field is entered, but the sheet publishes no factor for the pair. The controls cannot produce
   *  this; saved data can, if a material or route it names is not in this artefact. Not a zero. */
  | { status: 'no_factor' }

export function priceWasteRow(row: WasteRowInput, ed: DefraEdition): WasteRowPricing {
  const missing: ('material' | 'treatment route' | 'tonnes')[] = []
  if (!row.activity || !row.waste_type) missing.push('material')
  if (!row.route) missing.push('treatment route')
  if (!(Number.isFinite(row.tonnes) && row.tonnes > 0)) missing.push('tonnes')
  if (missing.length > 0) return { status: 'incomplete', missing }
  if ('missing' in ed) return { status: 'edition_missing', edition: ed.missing.edition, message: ed.missing.message }
  const rec = wasteRecord(row.activity, row.waste_type, row.route, ed.held.year)
  if (!rec) return { status: 'no_factor' }
  return { status: 'priced', factor_kg_per_tonne: rec.value, kg_co2e: row.tonnes * rec.value, method: wasteMethodFor(row.waste_type).method,
    edition: ed.held, cell: rec.cell, route_note: renamedRouteNote(rec, ed.held.year) }
}
