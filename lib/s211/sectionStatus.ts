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

const isRequired = (f: Field, c: SectionContent): boolean => {
  const shown = f.showWhen ? f.showWhen(c) : true
  if (!shown) return false
  const req = typeof f.required === 'function' ? f.required(c) : !!f.required
  if (!req) return false
  return !(f.waivedByNothingToReport && hasNothingToReport(c))
}

/** The labels of required fields that are empty, in the order the section shows them. */
export const missingRequired = (key: SectionKey, c: SectionContent): string[] =>
  sectionDef(key).fields.filter(f => isRequired(f, c) && !isFilled(c[f.key])).map(f => f.label)

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
    : before === 'complete' && missingRequired(key, c).length === 0 ? 'complete'
    : 'in_progress'

/** "Mark as complete": allowed, or refused naming every empty required field. */
export const markComplete = (key: SectionKey, c: SectionContent):
  { ok: true; status: 'complete' } | { ok: false; missing: string[]; message: string } => {
  const missing = missingRequired(key, c)
  if (missing.length === 0) return { ok: true, status: 'complete' }
  return {
    ok: false, missing,
    message: missing.length === 1
      ? `This section cannot be marked complete yet. Fill in: ${missing[0]}.`
      : `This section cannot be marked complete yet. Fill in: ${missing.join('; ')}.`,
  }
}

export const completeCount = (statuses: Partial<Record<SectionKey, SectionStatus>>): number =>
  Object.values(statuses).filter(s => s === 'complete').length
