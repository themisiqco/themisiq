// lib/s211/sectionStatus.ts
// How a section's status moves. Pure.
//
//   not_started   nothing entered
//   in_progress   something entered, not marked complete (or marked, then a required field emptied)
//   complete      the user marked it complete and no required field is empty
//
// "Mark as complete" is refused ONLY when a required field is empty, and the refusal names the field.
// The builder never judges the quality of an answer.

import { sectionDef, type SectionContent, type SectionKey, type Field } from './builderContent'

export type SectionStatus = 'not_started' | 'in_progress' | 'complete'
export const NOTHING_TO_REPORT_KEY = 'nothing_to_report'

export const isFilled = (v: unknown): boolean => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'boolean') return v
  if (Array.isArray(v)) return v.some(x => (x && typeof x === 'object') ? Object.values(x).some(isFilled) : isFilled(x))
  if (typeof v === 'object') return Object.values(v as object).some(isFilled)
  return false
}

export const hasNothingToReport = (c: SectionContent): boolean => isFilled(c[NOTHING_TO_REPORT_KEY])

/** A real calendar date written YYYY-MM-DD. */
export const isIsoDate = (v: unknown): boolean => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

/** Whether a field's answer counts as given: a real date for a date, a whole row for a rows field. */
export const fieldFilled = (f: Field, v: unknown): boolean => {
  if (f.type === 'date') return isIsoDate(v)
  if (f.type === 'rows' && f.requiredColumns?.length)
    return Array.isArray(v) && v.some(r => r && typeof r === 'object' && f.requiredColumns!.every(k => isFilled((r as Record<string, unknown>)[k])))
  return isFilled(v)
}

const isRequired = (f: Field, c: SectionContent): boolean => {
  const shown = f.showWhen ? f.showWhen(c) : true
  if (!shown) return false
  const req = typeof f.required === 'function' ? f.required(c) : !!f.required
  if (!req) return false
  return !(f.waivedByNothingToReport && hasNothingToReport(c))
}

/** The labels of required fields that are empty, in the order the section shows them. */
export const missingRequired = (key: SectionKey, c: SectionContent): string[] =>
  sectionDef(key).fields.filter(f => isRequired(f, c) && !fieldFilled(f, c[f.key])).map(f => (f.labelWhen ? f.labelWhen(c) : f.label))

/** Answers that are present but not acceptable, such as a day the chosen month does not have. */
export const invalidAnswers = (key: SectionKey, c: SectionContent): string[] =>
  sectionDef(key).fields.flatMap(f => {
    const shown = f.showWhen ? f.showWhen(c) : true
    const msg = shown && f.validate ? f.validate(c) : null
    return msg ? [msg] : []
  })

/**
 * Keys starting with "_" are the builder's own bookkeeping (section 9's draft fingerprint, the
 * applicability answers kept with section 1), not answers. They never make a section "started".
 */
export const isBookkeepingKey = (k: string): boolean => k.startsWith('_')
export const isEmptyContent = (c: SectionContent): boolean =>
  !Object.entries(c).some(([k, v]) => !isBookkeepingKey(k) && isFilled(v))

/** The status after an edit, given the status before it. An edit never marks a section complete. */
export const statusAfterEdit = (key: SectionKey, before: SectionStatus, c: SectionContent): SectionStatus =>
  isEmptyContent(c) ? 'not_started'
    : before === 'complete' && missingRequired(key, c).length === 0 && invalidAnswers(key, c).length === 0 ? 'complete'
    : 'in_progress'

/**
 * Field labels in a sentence. Each label is quoted, so a label that is a question keeps its own "?"
 * and gains no second mark after it: "Were instances identified?" and "Legal name". Three or more are
 * better read as a list; `asList` says so, and the page shows bullets.
 */
export const labelsInline = (labels: readonly string[]): string => {
  const q = labels.map(l => `\u201C${l}\u201D`)
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}
/** The labels as the end of a sentence: no full stop after a label that already ends in "?" (review item A4). */
export const labelsEndingSentence = (labels: readonly string[]): string =>
  `${labelsInline(labels)}${/[?!.]$/.test(labels[labels.length - 1] ?? '') ? '' : '.'}`
export const LIST_FROM = 3
export const asList = (labels: readonly string[]): boolean => labels.length >= LIST_FROM

/** "Mark as complete": allowed, or refused naming every empty required field and every unacceptable answer. */
export const markComplete = (key: SectionKey, c: SectionContent):
  { ok: true; status: 'complete' } | { ok: false; missing: string[]; invalid: string[]; message: string } => {
  const missing = missingRequired(key, c)
  const invalid = invalidAnswers(key, c)
  if (missing.length === 0 && invalid.length === 0) return { ok: true, status: 'complete' }
  const parts = [
    ...(missing.length ? [asList(missing) ? 'Fill in the fields listed below.' : `Fill in ${labelsEndingSentence(missing)}`] : []),
    ...invalid,
  ]
  return { ok: false, missing, invalid, message: `This section cannot be marked complete yet. ${parts.join(' ')}` }
}

export const completeCount = (statuses: Partial<Record<SectionKey, SectionStatus>>): number =>
  Object.values(statuses).filter(s => s === 'complete').length
