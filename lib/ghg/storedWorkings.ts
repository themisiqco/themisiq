// lib/ghg/storedWorkings.ts
//
// T17: WHAT THE ASSURANCE PDF PRINTS, READ FROM THE STORED INVENTORY ROW. Pure: no React, no Supabase, and nothing
// from the engine. The PDF prints the inventory as saved (PDF-03, ruled 9 Oct 2026): the stored `workings` rows, the
// stored totals, the stored locations_data and its document logs, the stored location_log. Nothing here prices,
// selects an edition, derives a location or rebuilds a row, so the PDF and the verifier page, which reads the same
// stored row, cannot differ. Every sentence is a T11 or T18 helper's, so neither surface has a second copy.

import {
  workingsDocumentLines, workingsConversionFactorLine, displaySourceLabel, workingsFactorSourceCell, workingsVintageCell, displayStoredText,
  SELECTION_RULE_WORDS, COVERAGE_ROW_BASIS, DOCUMENT_EVENT_ROW_BASIS, LOCATION_EVENT_ROW_BASIS,
} from './workingsCells'
import { isoDateInWords } from './dateWords'

/** A stored workings row, loosely: the fields the PDF reads. */
export type StoredRow = {
  location?: string; stream?: string; source: string; scope?: number; gwp_basis?: string; ef_source?: string
  result_tco2e?: number | null; scope2_method?: string; factor_vintage?: string; factor_variant?: string
  factor_edition?: string; selection_rule?: string; selection_basis?: string; edition_published?: string; edition_corrected?: string
  selected_on?: string; provisional?: boolean; declaration?: string; country_refusal?: unknown; note?: unknown
  conversion_note?: string; conversion_factor?: number | null; factor_key?: string | null; activity_unit?: string | null
  contributions?: Parameters<typeof workingsDocumentLines>[0]['contributions']
  [k: string]: unknown
}
type Who = { email: string }
type StoredDoc = {
  id: string; file_name: string; document_type: string; uploaded_at?: string
  extracted?: { status?: string; value?: number | null }[]
  withdrawn?: { at: string; by: Who; reason: string }
}
type DocEvent = { kind: string; docId: string; file: string; documentType?: string; uploadedAt?: string; sha256?: string | null; at: string; by: Who; reason?: string }
type StoredLocation = { name?: string; source_docs?: StoredDoc[]; document_log?: DocEvent[] }
type StoredLocationEvent = { name?: string; documents?: DocEvent[]; document_log?: DocEvent[] }

const on = (at: string) => isoDateInWords(at.slice(0, 10))
const isEventRow = (r: StoredRow) => r.gwp_basis === DOCUMENT_EVENT_ROW_BASIS || r.gwp_basis === LOCATION_EVENT_ROW_BASIS

/** The rows a saved inventory carries, or none: null, a non-array or an empty array all read as "not kept". */
export const storedRows = (workings: unknown): StoredRow[] =>
  Array.isArray(workings) ? (workings as StoredRow[]).filter(r => r && typeof r === 'object' && typeof r.source === 'string') : []

/** The rows the Workings page prints: every calculation, declaration and coverage row; the document and location
 *  records print in their own table. */
export const workingsPageRows = (rows: readonly StoredRow[]): StoredRow[] => rows.filter(r => !isEventRow(r))

/** What the PDF prints when the inventory was saved before its workings were kept with it. Never a rebuilt figure. */
export const WORKINGS_NOT_KEPT = 'The calculation workings for this inventory were saved before they were kept with it. Saving the inventory again adds them.'
/** A document whose status was not stored, because the inventory was saved before per-bill records were kept. */
export const STATUS_NOT_KEPT = 'Not recorded when this inventory was saved; saving it again adds it.'

/**
 * The cover line naming when the printed inventory was saved, from the stored row's own `updated_at`, in UTC so a
 * verifier anywhere reads one time. Never the time of export. Null when the row carries no usable time.
 */
export function savedAtLine(updatedAt: string | null | undefined): string | null {
  const d = updatedAt ? new Date(updatedAt) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const hh = String(d.getUTCHours()).padStart(2, '0'), mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `Prints this inventory as saved on ${isoDateInWords(d.toISOString().slice(0, 10))} at ${hh}:${mm} UTC.`
}

/** The locations the stored rows say are excluded from every figure, with the refusal each row recorded. */
export function excludedFromRows(rows: readonly StoredRow[]): { location: string; refusal: unknown }[] {
  const seen = new Set<string>()
  const out: { location: string; refusal: unknown }[] = []
  for (const r of rows) {
    if (!r.country_refusal || !(r.declaration ?? '').startsWith('country_')) continue
    const loc = r.location || 'Location'
    if (!seen.has(loc)) { seen.add(loc); out.push({ location: loc, refusal: r.country_refusal }) }
  }
  return out
}

const priced = (r: StoredRow) => typeof r.result_tco2e === 'number' && !isEventRow(r) && r.gwp_basis !== COVERAGE_ROW_BASIS
const cited = (s: string | undefined) => !!s && s !== 'Not provided' && s !== 'Not applicable'

/** The citations the stored rows priced with: combustion (Scope 1 fuel rows) and electricity (location-based rows). */
export function citationsFromRows(rows: readonly StoredRow[]): { combustion: string[]; electricity: string[] } {
  const combustion: string[] = [], electricity: string[] = []
  for (const r of rows) {
    if (!priced(r) || !cited(r.ef_source)) continue
    if (r.scope === 1 && r.stream !== 'refrigerants' && !combustion.includes(r.ef_source!)) combustion.push(r.ef_source!)
    if (r.stream === 'electricity' && r.scope2_method === 'location-based' && !electricity.includes(r.ef_source!)) electricity.push(r.ef_source!)
  }
  return { combustion, electricity }
}

/**
 * Factor derivations for the Methodology page (rulings of 9 Oct 2026): EVERY distinct derivation the stored rows carry,
 * grouped by source, worded by the shared helpers, never re-derived (no pickEF, no factorDerivationsFor). A priced
 * row's note is its derivation parts joined by " · " (lib/ghg/engine.ts, pushFuel and the steam row): the exact unit
 * conversion and any unit change (also its conversion_note), the EU density or energy content, the EU fleet NCV and
 * density, the Canadian heat content, the Australian published-gas note, the US per-scf basis, the steam unit basis and
 * the steam estimate from gas. The part that is only the row's edition basis is left out (the Factor Editions page
 * prints it), and so is every row that priced nothing (a declaration, an unpriced line). Then the conversion factor.
 */
export function derivationsFromRows(rows: readonly StoredRow[]): [string, string][] {
  const out: [string, string][] = []
  const seen = new Set<string>()
  const add = (source: string, line: string | null | undefined) => {
    const text = displayStoredText(line).trim()
    if (!text) return
    const k = `${source}|${text}`
    if (!seen.has(k)) { seen.add(k); out.push([source, text]) }
  }
  for (const r of rows) {
    if (isEventRow(r) || r.declaration || r.gwp_basis === COVERAGE_ROW_BASIS) continue
    const source = displaySourceLabel(r)
    const parts = [r.conversion_note, ...(typeof r.note === 'string' ? r.note.split(' · ') : [])]
    for (const part of parts) if (part && part.trim() !== (r.selection_basis ?? '').trim()) add(source, part)
    add(source, workingsConversionFactorLine(r))
  }
  return out
}

/** The Factor Editions table: one row per distinct edition the stored rows record. */
export function editionRowsFromRows(rows: readonly StoredRow[]): string[][] {
  const seen = new Set<string>()
  const body: string[][] = []
  for (const w of rows) {
    if (!w.factor_edition) continue
    const row = [
      w.provisional ? `${w.factor_edition} (provisional)` : w.factor_edition,
      w.selection_rule ? (SELECTION_RULE_WORDS[w.selection_rule] ?? w.selection_rule) : '',
      displayStoredText(w.selection_basis), w.edition_published ?? '', w.edition_corrected ?? '',
      w.selected_on ? on(w.selected_on) : '',
    ]
    const key = row.join('|')
    if (!seen.has(key)) { seen.add(key); body.push(row) }
  }
  return body
}

/** The market-based residual table, from the stored market-based rows: location, the factor source, the vintage. */
export function residualRowsFromRows(rows: readonly StoredRow[]): string[][] {
  return rows.filter(r => r.stream === 'electricity' && r.scope2_method === 'market-based' && !isEventRow(r))
    .map(r => [r.location || 'Location', workingsFactorSourceCell(r), displayStoredText(workingsVintageCell(r as Parameters<typeof workingsVintageCell>[0]))])
}

/** A bill line's words after its file name: "gas-dec24.pdf: not counted. Billed ..." becomes "Not counted. Billed ...". */
const afterFile = (text: string, file: string) => {
  const t = text.startsWith(`${file}: `) ? text.slice(file.length + 2) : text
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * The Source Document Index with its Status column: [location, document type, file, uploaded, status]. A document on
 * file reads its status from the stored contributions (counted, or not counted and why) or its withdrawal; a deleted
 * one from its tombstone (file, SHA-256 where known, who, when, why); a deleted location's documents from its record.
 */
export function documentIndexRows(
  locations: readonly StoredLocation[], rows: readonly StoredRow[], locationLog: readonly StoredLocationEvent[],
  yearText: string, docTypeLabel: (t: string) => string,
): string[][] {
  const fileOfAll = new Map<string, string>()
  for (const l of locations) for (const d of l.source_docs ?? []) fileOfAll.set(d.id, d.file_name)
  const fileOf = (id: string) => fileOfAll.get(id) ?? 'A document no longer on this inventory'
  const statusOf = new Map<string, string[]>()
  for (const r of rows) {
    for (const line of workingsDocumentLines(r, fileOf, yearText)) {
      const list = statusOf.get(line.docId) ?? []
      const words = afterFile(line.text, fileOf(line.docId))
      if (!list.includes(words)) list.push(words)
      statusOf.set(line.docId, list)
    }
  }
  const deleted = (e: DocEvent) => e.kind === 'deleted_unused'
    ? `Deleted by ${e.by.email} on ${on(e.at)}. Nothing from it had been used.${e.sha256 ? ` SHA-256 ${e.sha256}.` : ''}`
    : `Deleted by ${e.by.email} on ${on(e.at)}. Reason: ${e.reason ?? 'not recorded'}.${e.sha256 ? ` SHA-256 ${e.sha256}.` : ''} Earlier saved versions of this inventory still contain what was read from it.`
  const out: string[][] = []
  for (const l of locations) {
    const name = l.name || 'Location'
    for (const d of l.source_docs ?? []) {
      const readings = d.extracted ?? []
      const status = d.withdrawn ? `Withdrawn by ${d.withdrawn.by.email} on ${on(d.withdrawn.at)}. Reason: ${d.withdrawn.reason}. Kept as evidence and not counted.`
        : statusOf.get(d.id)?.join(' ')
        ?? (readings.length === 0 ? 'No figure was read from it.'
          : readings.every(p => p.value == null) ? 'No figure could be read from it.'
          : readings.every(p => p.status !== 'confirmed') ? 'Not counted. It was not confirmed.'
          : STATUS_NOT_KEPT)
      out.push([name, docTypeLabel(d.document_type), d.file_name, (d.uploaded_at ?? '').slice(0, 10), status])
    }
    for (const e of l.document_log ?? []) {
      if (e.kind === 'deleted' || e.kind === 'deleted_unused') out.push([name, e.documentType ? docTypeLabel(e.documentType) : '', e.file, (e.uploadedAt ?? '').slice(0, 10), deleted(e)])
    }
  }
  for (const loc of locationLog) {
    const name = `${loc.name || 'Location'} (deleted)`
    for (const e of [...(loc.document_log ?? []).filter(x => x.kind === 'deleted' || x.kind === 'deleted_unused'), ...(loc.documents ?? [])]) {
      out.push([name, e.documentType ? docTypeLabel(e.documentType) : '', e.file, (e.uploadedAt ?? '').slice(0, 10), deleted(e)])
    }
  }
  return out
}
