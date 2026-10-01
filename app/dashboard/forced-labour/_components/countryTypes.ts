// app/dashboard/forced-labour/_components/countryTypes.ts
// The shape of /api/forced-labour/reports/[id]/countries/[country] (a country other than Canada).
import type { SectionContent } from '../../../../lib/s211/builderContent'
import type { SectionStatus } from '../../../../lib/s211/sectionStatus'

export type Provenance = Record<string, { from: 'here' } | { from: 'elsewhere'; countries: string[] }>
export type CountrySectionRow = { section_key: string; content: SectionContent; status: SectionStatus; provenance: Provenance }
/** Which entity gives this country's statement and which it covers (fl_report_entities), and names to choose from. */
export type CountryEntities = { giving: string | null; covered: string[]; known: string[]; defaultGiving: string | null }
export type CountryRecord = {
  entities: CountryEntities
  report: { id: string; canadaReportId: string | null; organizationName: string | null }
  country: { key: string; status: string; applicability: Record<string, string> }
  sections: CountrySectionRow[]
  figures: { organization: { amount: number; currency: string } | null; canada: { amount: number; currency: string } | null }
}
