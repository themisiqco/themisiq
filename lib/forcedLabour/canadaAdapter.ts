// lib/forcedLabour/canadaAdapter.ts
// How the Canada (S-211) builder reads and writes through the shared Forced Labour model. Pure: no
// database. lib/forcedLabour/canadaStore.ts does the reading and writing; the S-211 API routes call it.
// Stage C step 4 (1 Oct 2026).
//
// ⚠️ DUAL WRITE, ONE READ. Every Canada save still stores the whole section in s211_report_sections,
// exactly as before, and ALSO stores the section's shared fields (lib/forcedLabour/fieldRegistry.ts) in
// fl_answers. Every Canada read starts from the section as stored and lays fl_answers over it, so the
// shared store decides any shared field it holds. Why both:
//   - s211_report_sections stays a complete Canada record. Canada's tests, its export and a code rollback
//     need nothing from the shared tables to keep working.
//   - fl_answers is where a second country's builder will read and write. When it changes a shared
//     answer, Canada sees the change on its next read, because the overlay prefers fl_answers.
// For a Canada-only report the two always hold the same values, so what Canada shows and prints cannot
// change: scratch/adapter-proof.ts and canadaAdapter.test.ts hold the before and after byte for byte.
//
// ⚠️ ABSENT IS NOT NULL. A shared field missing from the saved section is DELETED from fl_answers; a field
// saved as null is stored as JSON null. With no row, the overlay leaves the section's own value (which is
// also absent after a Canada save, and is the pre-adapter value for a report saved before this shipped).
// A second country clearing an answer must write JSON null, not delete, or Canada would fall back to its
// own stale copy.
//
// ⚠️ TWO REPORT COLUMNS ARE SHARED: company_name (fl_reports.organization_name) and financial_year_end
// (fl_reports.period_end). Written to both; read from fl_reports when the report has a parent.

import { FIELD_REGISTRY, storage } from './fieldRegistry'
import type { SectionContent, SectionKey } from '../s211/builderContent'

export type SharedField = { fieldKey: string; field: string }

const SHARED_BY_SECTION: ReadonlyMap<SectionKey, readonly SharedField[]> = (() => {
  const m = new Map<SectionKey, SharedField[]>()
  for (const f of FIELD_REGISTRY) {
    if (storage(f) !== 'shared' || f.canada?.kind !== 'section' || f.canada.hidden) continue
    const list = m.get(f.canada.section) ?? []
    list.push({ fieldKey: f.key, field: f.canada.field })
    m.set(f.canada.section, list)
  }
  return m
})()

/** The shared fields Canada keeps in this section, with their fl_answers keys. */
export const sharedFieldsOf = (section: SectionKey): readonly SharedField[] => SHARED_BY_SECTION.get(section) ?? []

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k) && (o as Record<string, unknown>)[k] !== undefined

/** What a Canada save of this section writes to fl_answers: rows for the fields it holds, keys to delete for the rest. */
export function sharedAnswersFrom(section: SectionKey, content: SectionContent): { upsert: { field_key: string; value: unknown }[]; remove: string[] } {
  const upsert: { field_key: string; value: unknown }[] = []
  const remove: string[] = []
  for (const { fieldKey, field } of sharedFieldsOf(section)) {
    if (has(content, field)) upsert.push({ field_key: fieldKey, value: (content as Record<string, unknown>)[field] ?? null })
    else remove.push(fieldKey)
  }
  return { upsert, remove }
}

/** The section as Canada reads it: the stored content, with every shared field fl_answers holds laid over it. */
export function overlaySection(section: SectionKey, content: SectionContent, answers: ReadonlyMap<string, unknown>): SectionContent {
  const fields = sharedFieldsOf(section).filter(f => answers.has(f.fieldKey))
  if (fields.length === 0) return content
  const out: Record<string, unknown> = { ...(content as Record<string, unknown>) }
  for (const { fieldKey, field } of fields) out[field] = answers.get(fieldKey)
  return out as SectionContent
}

/** s211_reports column → fl_reports column, for the two shared report columns. */
export const SHARED_REPORT_COLUMNS = { company_name: 'organization_name', financial_year_end: 'period_end' } as const
export type ParentRow = { id: string; organization_name: string; period_end: string | null }

/** A report row as Canada reads it: its shared columns from the parent, when it has one. */
export function overlayReport<T extends Record<string, unknown>>(report: T, parent: ParentRow | null | undefined): T {
  if (!parent) return report
  const out: Record<string, unknown> = { ...report }
  if ('company_name' in out) out.company_name = parent.organization_name
  if ('financial_year_end' in out) out.financial_year_end = parent.period_end
  return out as T
}

/** The part of a report PATCH that goes to the parent. */
export function parentPatchFrom(patch: Record<string, unknown>): Partial<Record<'organization_name' | 'period_end', unknown>> {
  const out: Partial<Record<'organization_name' | 'period_end', unknown>> = {}
  for (const [col, parentCol] of Object.entries(SHARED_REPORT_COLUMNS)) if (col in patch) out[parentCol] = patch[col]
  return out
}

/** Strips the link column from a row before it is returned, so the API's response shape is unchanged. */
export function withoutLink<T extends Record<string, unknown>>(row: T): Omit<T, 'fl_report_id'> {
  const { fl_report_id: _link, ...rest } = row
  void _link
  return rest
}
