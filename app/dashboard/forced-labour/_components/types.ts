// app/dashboard/forced-labour/_components/types.ts
// Shapes the S-211 builder's pages read from the API.
import type { SectionContent, SectionKey } from '../../../../lib/s211/builderContent'
import type { SectionStatus } from '../../../../lib/s211/sectionStatus'

export type ReportRecord = {
  id: string; company_name: string; reporting_year: number; financial_year_end: string | null
  listed_in_canada: boolean | null; place_of_business_in_canada: boolean | null; does_business_in_canada: boolean | null; has_assets_in_canada: boolean | null
  recent_fy_assets: number | null; recent_fy_revenue: number | null; recent_fy_avg_employees: number | null; recent_fy_currency: string | null
  prior_fy_assets: number | null; prior_fy_revenue: number | null; prior_fy_avg_employees: number | null; prior_fy_currency: string | null
}
export type SectionRow = { section_key: SectionKey; content: SectionContent; status: SectionStatus; updated_at: string }
