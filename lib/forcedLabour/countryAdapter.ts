// lib/forcedLabour/countryAdapter.ts
// How a country other than Canada (the UK first) reads and writes its sections through the shared model.
// Pure. Stage D1 (1 Oct 2026). The Canada adapter (canadaAdapter.ts) is unchanged and separate.
//
// The same shape as Canada's: a save stores the whole section in the country's own record
// (fl_report_countries.content[section]) and its shared fields in fl_answers, in one transaction
// (public.fl_save_country_section); a read lays fl_answers over the stored section, so a shared answer
// given in any country appears here, and one given here appears there.
//
// The status rules are Canada's, applied to the country's own fields: empty is not started, anything
// entered is in progress, complete only when every required field is filled and every answer acceptable.

import { FIELD_REGISTRY, storage } from './fieldRegistry'
import { isFilled, isIsoDate, isEmptyContent, labelsEndingSentence, asList, type SectionStatus } from '../s211/sectionStatus'
import type { Field, SectionContent } from '../s211/builderContent'
import type { CountryKey } from './countries'

export type CountryField = Field & { registryKey: string }
export type CountrySectionFields = { key: string; fields: readonly CountryField[] }

const REG = new Map(FIELD_REGISTRY.map(f => [f.key, f]))
const isShared = (f: CountryField) => { const r = REG.get(f.registryKey); return !!r && storage(r) === 'shared' }

/** The section's fields kept in fl_answers. */
export const sharedFieldsIn = (def: CountrySectionFields): CountryField[] => def.fields.filter(isShared)

/** What a save writes to fl_answers: rows for the shared fields the section holds, keys to delete for the rest. */
export function countryAnswersFrom(def: CountrySectionFields, content: SectionContent): { upsert: { field_key: string; value: unknown }[]; remove: string[] } {
  const upsert: { field_key: string; value: unknown }[] = []
  const remove: string[] = []
  for (const f of sharedFieldsIn(def)) {
    const v = (content as Record<string, unknown>)[f.key]
    if (Object.prototype.hasOwnProperty.call(content, f.key) && v !== undefined) upsert.push({ field_key: f.registryKey, value: v ?? null })
    else remove.push(f.registryKey)
  }
  return { upsert, remove }
}

/** The section as read: the stored content with every shared answer fl_answers holds laid over it. */
export function overlayCountrySection(def: CountrySectionFields, content: SectionContent, answers: ReadonlyMap<string, unknown>): SectionContent {
  const out: Record<string, unknown> = { ...(content as Record<string, unknown>) }
  let changed = false
  for (const f of sharedFieldsIn(def)) if (answers.has(f.registryKey)) { out[f.key] = answers.get(f.registryKey); changed = true }
  return changed ? out as SectionContent : content
}

/**
 * Where each shared answer shown in this section came from. 'here' when this country's own record holds the
 * same value; otherwise the other countries that use the field (the answer was given in one of them).
 */
export function sharedProvenance(def: CountrySectionFields, own: SectionContent, answers: ReadonlyMap<string, unknown>, country: CountryKey):
  Record<string, { from: 'here' } | { from: 'elsewhere'; countries: CountryKey[] }> {
  const out: Record<string, { from: 'here' } | { from: 'elsewhere'; countries: CountryKey[] }> = {}
  for (const f of sharedFieldsIn(def)) {
    if (!answers.has(f.registryKey) || !isFilled(answers.get(f.registryKey))) continue
    const mine = (own as Record<string, unknown>)[f.key]
    out[f.key] = JSON.stringify(mine) === JSON.stringify(answers.get(f.registryKey))
      ? { from: 'here' }
      : { from: 'elsewhere', countries: (REG.get(f.registryKey)!.countries as CountryKey[]).filter(c => c !== country) }
  }
  return out
}

// ── Status (Canada's rules, on the country's fields) ─────────────────────────────────────────────────
const fieldFilled = (f: Field, v: unknown): boolean => {
  if (f.type === 'date') return isIsoDate(v)
  if (f.type === 'rows' && f.requiredColumns?.length)
    return Array.isArray(v) && v.some(r => r && typeof r === 'object' && f.requiredColumns!.every(k => isFilled((r as Record<string, unknown>)[k])))
  return isFilled(v)
}
const isRequired = (f: Field, c: SectionContent) => (f.showWhen ? f.showWhen(c) : true) && (typeof f.required === 'function' ? f.required(c) : !!f.required)

export const countryMissingRequired = (def: CountrySectionFields, c: SectionContent): string[] =>
  def.fields.filter(f => isRequired(f, c) && !fieldFilled(f, c[f.key])).map(f => (f.labelWhen ? f.labelWhen(c) : f.label))
export const countryInvalidAnswers = (def: CountrySectionFields, c: SectionContent): string[] =>
  def.fields.flatMap(f => { const msg = (f.showWhen ? f.showWhen(c) : true) && f.validate ? f.validate(c) : null; return msg ? [msg] : [] })

export const countryStatusAfterEdit = (def: CountrySectionFields, before: SectionStatus, c: SectionContent): SectionStatus =>
  isEmptyContent(c) ? 'not_started'
    : before === 'complete' && countryMissingRequired(def, c).length === 0 && countryInvalidAnswers(def, c).length === 0 ? 'complete'
    : 'in_progress'

export function countryMarkComplete(def: CountrySectionFields, c: SectionContent):
  { ok: true } | { ok: false; missing: string[]; invalid: string[]; message: string } {
  const missing = countryMissingRequired(def, c)
  const invalid = countryInvalidAnswers(def, c)
  if (missing.length === 0 && invalid.length === 0) return { ok: true }
  const parts = [...(missing.length ? [asList(missing) ? 'Fill in the fields listed below.' : `Fill in ${labelsEndingSentence(missing)}`] : []), ...invalid]
  return { ok: false, missing, invalid, message: `This section cannot be marked complete yet. ${parts.join(' ')}` }
}
