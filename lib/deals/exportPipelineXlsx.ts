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
  getComplianceCost, getObligations, sectorRisks, FIELD_LABELS,
} from './assessment'
import { filenameDate, filenameSafe } from '../filename'
import { marketsRecorded } from './markets'
import { normalizeSector } from './sectors'
import { marketName } from './claimsRules'

// A worksheet cell primitive. A JS number becomes a NUMERIC cell in SheetJS; a string becomes
// text. That difference is the whole point of the absence strings below — do not stringify numbers.
type Cell = string | number | boolean

// The deal columns this export needs. Wider than the list's select on purpose: the list renders
// six columns, this re-derives applicability, cost and obligations and needs the inputs for all
// three. Fetched at export time so the list page's own load stays narrow.
export const PIPELINE_SELECT =
  'id, target_name, sector, jurisdiction, revenue, currency, employee_count, total_assets, ' +
  'deal_type, deal_value, location_count, has_ghg_data, has_esg_report, frameworks, updated_at, created_at, ' +
  'listed_ca_exchange, sales_markets, sales_markets_not_sure, env_claims'

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
  // NULL = never asked. Passed to the engine, which was given none of them until 29 Sep 2026, so a
  // target listed on a Canadian exchange read FALSE for Canada S-211 here while the wizard said VERIFY.
  listed_ca_exchange: boolean | null
  sales_markets: string[] | null
  sales_markets_not_sure: boolean | null
  env_claims: string | null
}

// The closed vocabulary of rule names the engine can emit, as one column each — this is the part
// that pivots. Any name NOT in this list lands in the "Other rules" column rather than being
// dropped, so adding a framework to the engine degrades to a visible catch-all instead of silently
// vanishing from the sheet.
//
// ⚠️ MARKET EXPECTATIONS HAVE NO TRUE / FALSE COLUMN (29 Sep 2026). IFRS S2, TCFD, PCAF and UK SRS are
// never APPLIES rows now, so a boolean column would read FALSE on every target, which a pivot reads as
// "checked, does not apply". They are listed together in the "Market expectations" column instead.
export const REGIME_COLUMNS = [
  'SB 253', 'SECR', 'CSRD', 'CS3D', 'EU Taxonomy', 'SFDR', 'EU ETS', 'UK ETS',
  'UK SDR', 'FCA climate disclosure (TCFD)', 'Anti-greenwashing rule',
  'Canada S-211', 'EU Empowering Consumers Directive (ECGT)', 'California AB 1305',
] as const

// Plain-language deal-type labels. Falls back to the stored code rather than blanking it.
const DEAL_TYPE_LABELS: Record<string, string> = {
  ma: 'M&A: acquisition',
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
    ...REGIME_COLUMNS.map(String), 'Other rules', 'Market expectations',
    // Where it sells, and whether it makes environmental claims: the answers behind the claims rows.
    'Sales markets', 'Environmental claims',
    // Near threshold
    'Near a threshold: rule', 'Near a threshold: side',
    // Not assessed
    'Could not assess: rule', 'Could not assess: figures needed',
    // Cost. The exposure band is a share of DEAL VALUE, so it inherits the target's currency.
    // The ThemisIQ estimate comes from the price list and is genuinely USD.
    'Exposure low (target currency)', 'Exposure high (target currency)',
    'Exposure low (share of deal value)', 'Exposure high (share of deal value)',
    'ThemisIQ estimate (USD)',
    // Risk findings — counts only. The findings themselves are 1-2 sentence paragraphs and do not
    // belong in a row meant for pivoting; they are in the per-deal report.
    'Critical risks', 'High risks', 'Medium risks',
    // Counted and named apart from the three above — see the countBy comment in the row builder.
    'Conditional risks', 'Conditional risks: regimes',
    // Data room
    'GHG data available', 'ESG report available',
  ]

  const rows: Cell[][] = deals.map((d) => {
    const sector = normalizeSector(d.sector) ?? ''
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
          { total_assets: assets, employee_count: employees, listed_ca_exchange: d.listed_ca_exchange,
            sales_markets: d.sales_markets, sales_markets_not_sure: d.sales_markets_not_sure, env_claims: d.env_claims })
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
    const marketCell: Cell = !screened ? 'NOT ASSESSED'
      : applicability.filter((f) => f.status === 'market').map((f) => f.framework).join(', ') || 'None'
    // NOT RECORDED, never blank or "None": a deal saved before the question existed was not asked.
    const salesMarkets: Cell = !marketsRecorded(d) ? 'NOT RECORDED'
      : [...(d.sales_markets ?? []).map(marketName), ...(d.sales_markets_not_sure ? ['Not sure'] : [])].join(', ')
    const envClaims: Cell = d.env_claims === 'yes' ? 'Yes' : d.env_claims === 'no' ? 'No'
      : d.env_claims === 'not_sure' ? 'Not sure' : 'NOT RECORDED'

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
          { total_assets: assets, employee_count: employees, listed_ca_exchange: d.listed_ca_exchange,
            sales_markets: d.sales_markets, sales_markets_not_sure: d.sales_markets_not_sure, env_claims: d.env_claims })
      : []
    const NO_VALUE = 'DEAL VALUE NOT PROVIDED'
    const cost = dealValue != null && dealValue > 0 ? getComplianceCost(dealValue, sector, flatFrameworks) : null
    const costLow: Cell = cost ? Math.round(cost.low) : NO_VALUE
    const costHigh: Cell = cost ? Math.round(cost.high) : NO_VALUE
    // Written as a FRACTION (0.002 = 0.2%), the raw value, so it is a number the analyst can
    // format however they like rather than a pre-scaled one they have to un-scale.
    const pctLow: Cell = cost ? cost.pctLow : NO_VALUE
    const pctHigh: Cell = cost ? cost.pctHigh : NO_VALUE

    // A null total has TWO distinct causes and they are not the same fact: neither a headcount nor a
    // location count entered (we cannot pick a band), or a band with no self-serve price.
    // Zero would assert "this costs nothing", which is never what either means.
    const obligations = getObligations(locations, flatFrameworks, sector || undefined, employees)
    // Nothing included first: with no applying regime that needs a priced module there is no total,
    // and "QUOTE REQUIRED" would claim a price exists on request.
    const themisIq: Cell = obligations.included.length === 0 ? 'NO PRICED OBLIGATION'
      : obligations.locationUnset ? 'HEADCOUNT AND LOCATIONS NOT PROVIDED'
      : obligations.themisIqTotal == null ? 'QUOTE REQUIRED'
      : obligations.themisIqTotal

    // No sector means no risk template was ever applied. Reporting 0 critical risks for a target
    // nobody screened would read as a clean bill of health.
    //
    // Resolved through sectorRisks(), not indexed raw. THIS FILE HAS NO RENDER SITE — it only
    // counts — so a gate written at the other three surfaces would have left these columns counting
    // findings the wizard and the report had marked conditional, and the spreadsheet is the one
    // artefact a reader sorts and filters without seeing the finding text.
    const risks = sector ? sectorRisks(sector, jurisdiction, d) : null
    const established = risks?.filter((r) => r.scope === 'established') ?? null
    const conditional = risks?.filter((r) => r.scope === 'conditional') ?? null
    // Severity counts are ESTABLISHED ONLY: a conditioned finding has not been shown to reach this
    // target, and folding it into "High risks" inflates the number a reader pivots on.
    const countBy = (sev: 'critical' | 'high' | 'medium'): Cell =>
      established == null ? 'SECTOR NOT SET' : established.filter((r) => r.severity === sev).length
    const conditionalCount: Cell = conditional == null ? 'SECTOR NOT SET' : conditional.length
    // Named, not just counted: a bare number cannot answer "which targets have unresolved CBAM
    // exposure", and naming them is the shape this file already uses for 'Other rules'.
    const conditionalRegimes: Cell =
      conditional == null ? 'SECTOR NOT SET'
      : conditional.length === 0 ? 'None'
      : [...new Set(conditional.map((r) => r.framework))].join(', ')

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
      marketCell,
      salesMarkets, envClaims,
      nearRule, nearSide,
      cantAssess, figuresNeeded,
      costLow, costHigh, pctLow, pctHigh, themisIq,
      countBy('critical'), countBy('high'), countBy('medium'),
      conditionalCount, conditionalRegimes,
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
    ...REGIME_COLUMNS.map(() => ({ wch: 14 })), { wch: 22 }, { wch: 28 },
    { wch: 30 }, { wch: 14 },
    { wch: 22 }, { wch: 20 },
    { wch: 26 }, { wch: 32 },
    { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 22 },
    { wch: 13 }, { wch: 11 }, { wch: 13 },
    { wch: 18 }, { wch: 20 },
  ]

  // ── Sheet 2: About this export ──────────────────────────────────────
  const about: Cell[][] = [
    ['ThemisIQ: deal pipeline export'],
    [],
    ['Generated', generatedAt.toISOString()],
    ['Targets in this file', deals.length],
    [],
    ['How the figures were worked out',
      'Fresh at export, from each target’s current record, not copied from the rules saved with it. ' +
      'Opening a target in ThemisIQ will show the same answer. A rules list saved earlier may differ if the ' +
      'target’s figures or the rules themselves have changed since.'],
    [],
    ['Empty cells', 'There are none. Where something is absent the cell says why.'],
    ['NOT PROVIDED', 'This figure was never entered for the target.'],
    ['NOT ASSESSED',
      'The rule was not evaluated, usually because a size figure it depends on is missing. ' +
      'It is NOT a finding that the rule does not apply. The "figures needed" column says what would settle it.'],
    ['QUOTE REQUIRED', 'Above the self-serve range; priced on request rather than from the price list.'],
    ['NO PRICED OBLIGATION', 'No rule found to apply requires a priced module. Modules may still be recommended; see the target’s report.'],
    ['NOT RECORDED', 'The question was not asked when this target was saved (sales markets and environmental claims before 29 September 2026), or was left blank.'],
    ['Market expectations', 'Expected by investors, lenders and customers, not required by law for this target on the information provided. Listed, never TRUE or FALSE.'],
    ['HEADCOUNT AND LOCATIONS NOT PROVIDED', 'Neither the headcount nor the number of sites has been entered, so no price band can be chosen.'],
    ['SECTOR NOT SET', 'No sector, so no risk screen was run. It does not mean no risks were found.'],
    [],
    ['A caution on currency',
      'Revenue, deal value, balance-sheet total and the exposure band are each in the TARGET’S OWN currency, ' +
      'shown in the Currency column, and that differs from row to row. Adding those columns across targets in ' +
      'different currencies gives a number that means nothing. The ThemisIQ estimate is the exception: it is ' +
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
