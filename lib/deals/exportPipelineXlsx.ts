// lib/deals/exportPipelineXlsx.ts
//
// The pipeline export: one row per target across a firm's whole deal list, as a spreadsheet an
// analyst can sort and pivot. This is DATA, not a document — the per-deal report
// (app/dashboard/deals/report) is the document, and the two are deliberately different artefacts.
//
// FIGURES ARE WORKED OUT FRESH AT EXPORT, not read from each target's saved `frameworks` list.
// The derivation is pure and cheap (no network, no clock, no database — see
// lib/deals/assessment.ts), so re-running it for thirty targets costs nothing and gives the
// CURRENT answer. A saved list only reflects the rules as they stood when that target was last
// opened. The About sheet says which was done, because a reader cannot tell from the numbers.
//
// NEVER A BLANK CELL, and never a fabricated zero — the convention from
// app/dashboard/cbam/report/exportXlsx.ts. Where something is absent the cell says WHY in words:
// 'NOT ASSESSED', 'NOT PROVIDED', 'QUOTE REQUIRED'. A blank is ambiguous and a zero is a claim.
//
// NUMBERS ARE WRITTEN AS NUMBERS. A number stored as text will not sum, sort or pivot, which
// defeats the point of the file.
//
// SheetJS is imported DYNAMICALLY so it stays out of the bundle for users who never export.

import {
  getFrameworkApplicability, assessmentView, getApplicableFrameworks,
  getComplianceCost, getObligations, SECTOR_RISKS, FIELD_LABELS,
} from './assessment'
import { filenameDate, filenameSafe } from '../filename'

// A worksheet cell primitive. A JS number becomes a NUMERIC cell in SheetJS; a string becomes
// text. That difference is the whole point of the absence strings below — do not stringify numbers.
type Cell = string | number | boolean

// The deal columns this export needs. Wider than the list's select on purpose: the list renders
// six columns, this re-derives applicability, cost and obligations and needs the inputs for all
// three. Fetched at export time so the list page's own load stays narrow.
export const PIPELINE_SELECT =
  'id, target_name, sector, jurisdiction, revenue, currency, employee_count, total_assets, ' +
  'deal_type, deal_value, location_count, has_ghg_data, has_esg_report, frameworks, updated_at, created_at'

export type PipelineDealRow = {
  id: string
  target_name: string | null
  sector: string | null
  jurisdiction: string | null
  revenue: number | string | null
  currency: string | null
  employee_count: number | string | null
  total_assets: number | string | null
  deal_type: string | null
  deal_value: number | string | null
  location_count: number | string | null
  has_ghg_data: boolean | null
  has_esg_report: boolean | null
  frameworks: string[] | null
  updated_at: string
  created_at: string
}

// The closed vocabulary of rule names the engine can emit, as one column each — this is the part
// that pivots. Any name NOT in this list lands in the "Other rules" column rather than being
// dropped, so adding a framework to the engine degrades to a visible catch-all instead of silently
// vanishing from the sheet.
export const REGIME_COLUMNS = [
  'SB 253', 'SECR', 'CSRD', 'CS3D', 'EU Taxonomy', 'SFDR', 'EU ETS', 'UK ETS',
  'UK SRS (S1/S2)', 'UK SDR', 'FCA climate disclosure (TCFD)', 'Anti-greenwashing rule',
  'Canada S-211', 'IFRS S2', 'TCFD', 'PCAF',
] as const

// Plain-language deal-type labels. Falls back to the stored code rather than blanking it.
const DEAL_TYPE_LABELS: Record<string, string> = {
  ma: 'M&A — acquisition',
  pe: 'PE / growth equity',
  vc: 'Venture capital',
  lending: 'Lending / credit',
  lp: 'LP / fund investment',
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
// Local-timezone yyyy-mm-dd, so a date in the sheet agrees with the date in the filename.
const dateCell = (iso: string): Cell => { try { return filenameDate(new Date(iso)) } catch { return iso } }

export interface PipelineExportInput {
  deals: PipelineDealRow[]
  // ONE instant, shared by the filename and every date written into the file. Two `new Date()`
  // calls are two instants, and around midnight they are two different days.
  generatedAt: Date
  // Free text; used only for the filename.
  firmLabel?: string
}

export async function exportPipelineXlsx(input: PipelineExportInput): Promise<void> {
  const XLSX = await import('xlsx')
  const { deals, generatedAt, firmLabel } = input

  const header: Cell[] = [
    // Identity
    'Target', 'Sector', 'Jurisdiction', 'Deal type', 'Currency', 'Last updated', 'First screened',
    // Figures. Each is in the TARGET's own currency, which differs row to row — say so in the
    // header, because a column summed across a mixed-currency pipeline is a meaningless number.
    'Revenue (target currency)', 'Deal value (target currency)', 'Employees',
    'Balance-sheet total (target currency)', 'Locations',
    // Regimes — the pivotable block
    ...REGIME_COLUMNS.map(String), 'Other rules',
    // Near threshold
    'Near a threshold — rule', 'Near a threshold — side',
    // Not assessed
    'Could not assess — rule', 'Could not assess — figures needed',
    // Cost. The exposure band is a share of DEAL VALUE, so it inherits the target's currency.
    // The ThemisIQ estimate comes from the price list and is genuinely USD.
    'Exposure low (target currency)', 'Exposure high (target currency)',
    'Exposure low (share of deal value)', 'Exposure high (share of deal value)',
    'ThemisIQ estimate (USD)',
    // Risk findings — counts only. The findings themselves are 1-2 sentence paragraphs and do not
    // belong in a row meant for pivoting; they are in the per-deal report.
    'Critical risks', 'High risks', 'Medium risks',
    // Data room
    'GHG data available', 'ESG report available',
  ]

  const rows: Cell[][] = deals.map((d) => {
    const sector = (d.sector ?? '').trim()
    const jurisdiction = (d.jurisdiction ?? '').trim()
    const currency = (d.currency ?? 'USD').trim()
    const revenue = num(d.revenue) ?? 0
    const dealValue = num(d.deal_value)
    const locations = num(d.location_count) ?? 0
    const employees = num(d.employee_count)
    const assets = num(d.total_assets)
    const screened = !!(sector && jurisdiction)

    // Re-derived here, not read from d.frameworks. Pure and synchronous.
    const applicability = screened
      ? getFrameworkApplicability(jurisdiction, revenue, sector, d.deal_type ?? 'ma', currency,
          { total_assets: assets, employee_count: employees })
      : []
    const view = assessmentView(screened, applicability)
    const applied = new Set(applicability.filter((f) => f.applies).map((f) => f.framework))
    const unassessed = new Set(view.notAssessed)

    // TRUE / FALSE / 'NOT ASSESSED' — three states, not two. FALSE means "checked, does not
    // apply"; 'NOT ASSESSED' means the size test could not be completed. Collapsing the second
    // into FALSE would state a negative finding about a figure nobody supplied.
    const regimeCells: Cell[] = REGIME_COLUMNS.map((name) =>
      !screened ? 'NOT ASSESSED'
      : unassessed.has(name) ? 'NOT ASSESSED'
      : applied.has(name))
    const knownNames = new Set<string>(REGIME_COLUMNS as readonly string[])
    const others = [...applied].filter((f) => !knownNames.has(f))

    // At most ONE near-threshold rule per target, so this fits in two cells rather than a list.
    // ⚠️ THAT HOLDS ONLY BECAUSE the three active size tests are mutually exclusive by
    // jurisdiction: SB 253 needs USA, SECR needs UK, Canada S-211 needs Canada. It BREAKS the
    // moment the Omnibus constants land and CSRD/CS3D go active — both fire on the same EU and
    // Global targets, so a single deal could then be near two thresholds at once and these two
    // cells would silently report only the first. Revisit this shape in that same change.
    const near = applicability.filter((f) => f.status === 'near-threshold')
    const nearRule: Cell = !screened ? 'NOT ASSESSED' : near.length === 0 ? 'None' : near[0].framework
    const nearSide: Cell = !screened ? 'NOT ASSESSED'
      : near.length === 0 ? 'None'
      : near[0].side === 'above' ? 'Just above' : 'Just below'

    const cantAssess: Cell = !screened ? 'Sector or jurisdiction not set'
      : view.notAssessed.length === 0 ? 'None'
      : view.notAssessed.join(', ')
    const figuresNeeded: Cell = !screened ? 'Sector and jurisdiction'
      : view.fieldsToResolve.length === 0 ? 'None'
      : view.fieldsToResolve.map((f) => FIELD_LABELS[f]).join(', ')

    // Exposure is a percentage OF DEAL VALUE. With no deal value there is nothing to take a
    // percentage of, so the band is undefined — not zero.
    const flatFrameworks = screened
      ? getApplicableFrameworks(jurisdiction, revenue, sector, d.deal_type ?? 'ma', currency,
          { total_assets: assets, employee_count: employees })
      : []
    const NO_VALUE = 'DEAL VALUE NOT PROVIDED'
    const cost = dealValue != null && dealValue > 0 ? getComplianceCost(dealValue, sector, flatFrameworks) : null
    const costLow: Cell = cost ? Math.round(cost.low) : NO_VALUE
    const costHigh: Cell = cost ? Math.round(cost.high) : NO_VALUE
    // Written as a FRACTION (0.002 = 0.2%), the raw value, so it is a number the analyst can
    // format however they like rather than a pre-scaled one they have to un-scale.
    const pctLow: Cell = cost ? cost.pctLow : NO_VALUE
    const pctHigh: Cell = cost ? cost.pctHigh : NO_VALUE

    // A null total has TWO distinct causes and they are not the same fact: no location count
    // entered (we cannot pick a tier), or the Advisory tier (there is no self-serve price).
    // Zero would assert "this costs nothing", which is never what either means.
    const obligations = getObligations(locations, flatFrameworks, sector || undefined)
    const themisIq: Cell = obligations.locationUnset ? 'LOCATIONS NOT PROVIDED'
      : obligations.themisIqTotal == null ? 'QUOTE REQUIRED'
      : obligations.themisIqTotal

    // No sector means no risk template was ever applied. Reporting 0 critical risks for a target
    // nobody screened would read as a clean bill of health.
    const risks = sector ? (SECTOR_RISKS[sector] ?? []) : null
    const countBy = (sev: 'critical' | 'high' | 'medium'): Cell =>
      risks == null ? 'SECTOR NOT SET' : risks.filter((r) => r.severity === sev).length

    return [
      (d.target_name ?? '').trim() || 'Untitled deal',
      sector || 'NOT PROVIDED',
      jurisdiction || 'NOT PROVIDED',
      DEAL_TYPE_LABELS[d.deal_type ?? ''] ?? (d.deal_type || 'NOT PROVIDED'),
      currency,
      dateCell(d.updated_at),
      dateCell(d.created_at),
      revenue > 0 ? revenue : 'NOT PROVIDED',
      dealValue != null && dealValue > 0 ? dealValue : 'NOT PROVIDED',
      employees == null ? 'NOT PROVIDED' : employees,
      assets == null ? 'NOT PROVIDED' : assets,
      locations > 0 ? locations : 'NOT PROVIDED',
      ...regimeCells,
      others.length > 0 ? others.join(', ') : 'None',
      nearRule, nearSide,
      cantAssess, figuresNeeded,
      costLow, costHigh, pctLow, pctHigh, themisIq,
      countBy('critical'), countBy('high'), countBy('medium'),
      d.has_ghg_data ? 'Yes' : 'No',
      d.has_esg_report ? 'Yes' : 'No',
    ]
  })

  // ── Sheet 1: Pipeline. Header on row 1, data on rows 2..N+1, and NOTHING else — no title row,
  // no trailing note. A note above the header stops Excel finding the pivot range; a note below it
  // sorts along with the data the first time someone clicks a column heading. The explanation
  // lives on its own sheet instead.
  const wsData = XLSX.utils.aoa_to_sheet([header, ...rows])
  wsData['!cols'] = [
    { wch: 28 }, { wch: 26 }, { wch: 16 }, { wch: 20 }, { wch: 9 }, { wch: 13 }, { wch: 14 },
    { wch: 22 }, { wch: 24 }, { wch: 11 }, { wch: 28 }, { wch: 10 },
    ...REGIME_COLUMNS.map(() => ({ wch: 14 })), { wch: 22 },
    { wch: 22 }, { wch: 20 },
    { wch: 26 }, { wch: 32 },
    { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 22 },
    { wch: 13 }, { wch: 11 }, { wch: 13 },
    { wch: 18 }, { wch: 20 },
  ]

  // ── Sheet 2: About this export ──────────────────────────────────────
  const about: Cell[][] = [
    ['ThemisIQ — deal pipeline export'],
    [],
    ['Generated', generatedAt.toISOString()],
    ['Targets in this file', deals.length],
    [],
    ['How the figures were worked out',
      'Fresh at export, from each target’s current record — not copied from the rules saved with it. ' +
      'Opening a target in ThemisIQ will show the same answer. A rules list saved earlier may differ if the ' +
      'target’s figures or the rules themselves have changed since.'],
    [],
    ['Empty cells', 'There are none. Where something is absent the cell says why.'],
    ['NOT PROVIDED', 'This figure was never entered for the target.'],
    ['NOT ASSESSED',
      'The rule was not evaluated — usually because a size figure it depends on is missing. ' +
      'It is NOT a finding that the rule does not apply. The "figures needed" column says what would settle it.'],
    ['QUOTE REQUIRED', 'Above the self-serve range; priced on request rather than from the price list.'],
    ['LOCATIONS NOT PROVIDED', 'The number of sites has not been entered, so no price band can be chosen.'],
    ['SECTOR NOT SET', 'No sector, so no risk screen was run. It does not mean no risks were found.'],
    [],
    ['A caution on currency',
      'Revenue, deal value, balance-sheet total and the exposure band are each in the TARGET’S OWN currency, ' +
      'shown in the Currency column, and that differs from row to row. Adding those columns across targets in ' +
      'different currencies gives a number that means nothing. The ThemisIQ estimate is the exception — it is ' +
      'always USD.'],
    [],
    ['Share of deal value',
      'Written as a fraction, so 0.002 means 0.2% of deal value. Format the column as a percentage if you prefer.'],
    [],
    ['Risk findings',
      'Counts only. The findings themselves are written out in each target’s own report, which is the document ' +
      'to send; this file is the data behind it.'],
  ]
  const wsAbout = XLSX.utils.aoa_to_sheet(about)
  wsAbout['!cols'] = [{ wch: 26 }, { wch: 110 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsData, 'Pipeline')
  XLSX.utils.book_append_sheet(wb, wsAbout, 'About this export')

  const label = filenameSafe(firmLabel ?? '').replace(/\s+/g, '-')
  const filename = `themisiq-deal-pipeline${label ? `_${label}` : ''}_${filenameDate(generatedAt)}.xlsx`
  XLSX.writeFile(wb, filename)
}
