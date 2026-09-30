// lib/s211/checkReport.ts
// What the check page lists, and what would block export. Pure.
//
// Section 10 is optional (the Canadian Act does not ask for it): it is listed apart and never blocks
// export. Every other section must be complete. A placeholder left in the attestation is a warning.

import { SECTIONS, type SectionContent, type SectionKey } from './builderContent'
import { missingRequired, invalidAnswers, hasNothingToReport, type SectionStatus } from './sectionStatus'
import { placeholdersIn, PLACEHOLDER_WARNING } from './attestation'

export type SectionState = { status: SectionStatus; content: SectionContent }
export type CheckRow = { key: SectionKey; number: number; title: string; status: SectionStatus; missing: string[]; invalid: string[] }

export const NOTHING_MISSING_LINE = 'Nothing required is missing. Open it, check it, and mark it complete.'

export function checkReport(sections: Partial<Record<SectionKey, SectionState>>) {
  const row = (key: SectionKey): CheckRow => {
    const d = SECTIONS.find(s => s.key === key)!
    const st = sections[key] ?? { status: 'not_started' as SectionStatus, content: {} }
    return { key, number: d.number, title: d.title, status: st.status, missing: missingRequired(key, st.content), invalid: invalidAnswers(key, st.content) }
  }
  const required = SECTIONS.filter(d => !d.optional).map(d => row(d.key))
  const incomplete = required.filter(r => r.status !== 'complete')
  const optional = SECTIONS.filter(d => d.optional)
  const optionalNotUsed = optional.filter(d => {
    const c = sections[d.key]?.content ?? {}
    return c.has_other_information !== 'Yes'
  }).map(d => row(d.key))
  const optionalUsedIncomplete = optional.filter(d => sections[d.key]?.content?.has_other_information === 'Yes' && sections[d.key]?.status !== 'complete').map(d => row(d.key))
  const nothingToReport = SECTIONS.filter(d => hasNothingToReport(sections[d.key]?.content ?? {})).map(d => row(d.key))
  const placeholders = placeholdersIn(sections.approval_attestation?.content?.attestation_text)
  const warnings = placeholders.length ? [PLACEHOLDER_WARNING(placeholders)] : []
  return {
    incomplete, optionalNotUsed, optionalUsedIncomplete, nothingToReport, warnings,
    /** Export is blocked only by a required section that is not complete. Section 10 never blocks. */
    exportBlocked: incomplete.length > 0,
  }
}
