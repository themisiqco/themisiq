// app/dashboard/forced-labour/_components/canadaForm.ts
// The Canada applicability form as the saved report holds it, for the Canada tab and the report overview.
// Moved here unchanged from the report's home page in Stage D1 (1 Oct 2026).
import { toTri, PRESENCE_QUESTIONS, ACTIVITY_QUESTIONS, YEARS, type ApplicabilityForm } from '../../../../lib/s211/applicability'
import type { ReportRecord, SectionRow } from './types'

/** The saved report and section 1's goods answers, as the applicability form holds them. */
export const formOf = (rep: ReportRecord, acts: Record<string, string>): ApplicabilityForm => ({
  ...Object.fromEntries(PRESENCE_QUESTIONS.map(([k]) => [k, toTri(rep[k as keyof ReportRecord] as boolean | null)])),
  ...Object.fromEntries(YEARS.flatMap(p => [
    [`${p}_fy_assets`, rep[`${p}_fy_assets`]?.toString() ?? ''], [`${p}_fy_revenue`, rep[`${p}_fy_revenue`]?.toString() ?? ''],
    [`${p}_fy_avg_employees`, rep[`${p}_fy_avg_employees`]?.toString() ?? ''], [`${p}_fy_currency`, rep[`${p}_fy_currency`] ?? 'CAD'],
  ])),
  ...Object.fromEntries(ACTIVITY_QUESTIONS.map(([k]) => [k, acts[k] ?? ''])),
})
export const actsOf = (sections: SectionRow[]) =>
  (sections.find(s => s.section_key === 'report_details')?.content?._applicability ?? {}) as Record<string, string>

