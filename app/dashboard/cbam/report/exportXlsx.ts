// app/dashboard/cbam/report/exportXlsx.ts
//
// Exports the §1.2 summary report as an .xlsx workbook so an EU importer can
// read values out of it and into their CBAM declaration.
//
// REGULATORY CONTEXT — why this is NOT the Commission's official template:
// The Commission's "CBAM Communication Template for Installations" is a
// TRANSITIONAL-period artifact. Its latest published version is dated
// 13 Dec 2024 (Commission legislation-and-guidance page, checked 23 Jul 2026)
// and is built against IR (EU) 2023/1773 Annex IV. It has NOT been reissued
// for the definitive period, whose methodology is IR (EU) 2025/2547 — the
// regulation buildSummaryReport implements. The Commission has actively
// updated that page during 2026 (definitive-period default values and
// benchmarks in Excel, 13 Feb 2026) WITHOUT reissuing the template. So this
// export deliberately does not mimic that template: it carries the CURRENT
// Annex IV §1.2 content in Annex IV item order. If the Commission reissues
// the template for the definitive period, map onto it then. See spec §11.
//
// THE THREE STATUSES IN CELLS (ReportField<T> — value | missing | not_applicable):
//   'value'          → the raw value. NUMBERS ARE WRITTEN AS NUMBERS (numeric
//                      cell), never as text — the importer copies these into a
//                      declaration and a text-formatted number is a trap.
//   'not_applicable' → the string 'Not applicable — <reason>'
//   'missing'        → the string 'NOT SUPPLIED'
// Never a blank cell, never 0 for missing/not_applicable: a blank is ambiguous
// and a zero is a fabricated declaration. Mixed numeric and text cells in one
// column is correct and intended.
//
// INPUT is the exact response object the report page already holds in state,
// plus the installation name and reporting period. No new fetch, no second
// data path: the file must never show a figure the screen does not.
//
// SheetJS (xlsx) is imported DYNAMICALLY inside the export function so it is
// not in the main bundle for users who never export.

import type {
  Report12, ReportField, MissingField, Coordinates, ProcessSummary,
} from '../../../../lib/cbam/report/types'
import type { SefaBenchmarkWorkings } from '../../../../lib/cbam/sefaCompute'

export interface CbamReportExportInput {
  report: Report12
  missing: MissingField[]
  processesWithoutRecord: string[]
  processesCompleteDeclaredAt: string | null
  installationName: string
  reportingPeriod: number
}

// A worksheet cell primitive. A JS number becomes a NUMERIC cell in SheetJS; a
// string becomes text. That difference is the whole point of the three-state
// mapping below — do not stringify numbers.
type Cell = string | number | boolean

// The three-state → cell mapping. `fmt` shapes a present value (default:
// identity, so a number stays a number); missing/not_applicable never reach it.
function cellOf<T>(field: ReportField<T>, fmt: (v: T) => Cell = (v) => v as unknown as Cell): Cell {
  if (field.status === 'value') return fmt(field.value)
  if (field.status === 'not_applicable') return `Not applicable — ${field.reason}`
  return 'NOT SUPPLIED'
}

const yesNo = (b: boolean): Cell => (b ? 'Yes' : 'No')
const fmtCoords = (c: Coordinates): Cell => `${c.latitude}, ${c.longitude}`
const fmtBenchmark = (b: SefaBenchmarkWorkings): Cell =>
  `value ${b.value}; column ${b.column}; CBAM factor ${b.cbamFactor}; CSCF ${b.cscf}; period band ${b.periodBand}${b.indicator ? `; ${b.indicator}` : ''}`

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'installation'
}

export async function exportReportXlsx(input: CbamReportExportInput): Promise<void> {
  const XLSX = await import('xlsx')
  const { report, missing, processesWithoutRecord, processesCompleteDeclaredAt, installationName, reportingPeriod } = input

  // ── Sheet 1: Cover ──────────────────────────────────────────────────
  const attestationStatus = processesCompleteDeclaredAt
    ? 'Attested — installation-level totals (items 5 and 6) are reported'
    : 'NOT ATTESTED — installation-level totals (items 5 and 6) are NOT reported'
  const cover: Cell[][] = [
    ['CBAM §1.2 summary emissions report'],
    [],
    ['Installation', installationName],
    ['Reporting period', reportingPeriod],
    ['Generated at', new Date().toISOString()],
    ['Regulation basis', 'IR (EU) 2025/2547 Annex IV §1.2'],
    [],
    ['Process-completeness attestation', attestationStatus],
    ['Attestation timestamp', processesCompleteDeclaredAt ?? 'No attestation has been made — items 5 and 6 are omitted until it is'],
  ]
  if (processesWithoutRecord.length > 0) {
    cover.push([])
    cover.push(['NOT FULLY BACKED BY COMPUTED FIGURES', `${processesWithoutRecord.length} process(es) have no computed see_record`])
    cover.push(['Processes without a record', processesWithoutRecord.join(', ')])
  }
  cover.push([])
  cover.push(['Note on format', 'This is NOT the Commission\'s transitional-period "CBAM Communication Template for Installations".'])
  cover.push(['', 'That template (latest 13 Dec 2024) is built against IR 2023/1773 Annex IV and has not been reissued for the definitive period.'])
  cover.push(['', 'The definitive-period methodology is IR 2025/2547, which this report implements. This export carries the current Annex IV §1.2 content in Annex IV item order.'])
  cover.push(['', 'If the Commission reissues the template for the definitive period, values here can be mapped onto it.'])
  const wsCover = XLSX.utils.aoa_to_sheet(cover)
  wsCover['!cols'] = [{ wch: 34 }, { wch: 90 }]

  // ── Sheet 2: Items 1-3 ──────────────────────────────────────────────
  const s13: Cell[][] = [['Item', 'Field', 'Value']]
  s13.push(['(1)(a)', 'Operator name', cellOf(report.item1_operator.name)])
  s13.push(['(1)(b)', 'Operator registration number', cellOf(report.item1_operator.registrationNo)])
  s13.push(['(1)(c)', 'Operator full address (English)', cellOf(report.item1_operator.address)])
  s13.push(['(2)(a)', 'Installation name', cellOf(report.item2_installation.name)])
  s13.push(['(2)(b)', 'CBAM Registry installation ID', cellOf(report.item2_installation.cbamRegistryId)])
  s13.push(['(2)(c)', 'UN/LOCODE', cellOf(report.item2_installation.unLocode)])
  s13.push(['(2)(d)', 'Installation full address (English)', cellOf(report.item2_installation.address)])
  s13.push(['(2)(e)', 'Main emission source coordinates (lat, lon)', cellOf(report.item2_installation.coordinates, fmtCoords)])
  if (report.item3_processes.status === 'value') {
    (report.item3_processes.value as ProcessSummary[]).forEach((p) => {
      s13.push(['(3)', `Process ${p.processId}`, `route ${p.route ?? '(none)'}; goods ${p.goods.length ? p.goods.join(', ') : '(none)'}`])
    })
  } else {
    s13.push(['(3)', 'Production processes and routes', cellOf(report.item3_processes)])
  }
  const ws13 = XLSX.utils.aoa_to_sheet(s13)
  ws13['!cols'] = [{ wch: 10 }, { wch: 44 }, { wch: 60 }]

  // ── Sheet 3: Items 4-6 (one row per process for item 4) ─────────────
  const s46: Cell[][] = []
  s46.push([
    'Item', 'Process', 'CN code',
    '(4)(a) Specific direct', '(4)(b) Default share (direct)',
    '(4)(c) Indirect actual share', '(4)(c) Indirect default share',
    '(4)(c) Actual criteria confirmed', '(4)(c) Specific indirect',
    '(4)(d) Imported electricity', '(4)(e) SEFA', '(4)(f) Benchmark used + method',
  ])
  if (report.item4_perGood) {
    report.item4_perGood.forEach((g) => {
      s46.push([
        '(4)', g.processId, g.cnCode ?? '(none)',
        cellOf(g.specificDirect),
        cellOf(g.defaultShareDirect),
        cellOf(g.indirect.actualShare),
        cellOf(g.indirect.defaultShare),
        cellOf(g.indirect.criteriaConfirmation, yesNo),
        cellOf(g.indirect.specificIndirect),
        cellOf(g.importedElectricity),
        cellOf(g.sefa),
        cellOf(g.benchmarkConfirmation, fmtBenchmark),
      ])
    })
  } else {
    s46.push(['(4)', 'Per-good emissions', 'Not present in this report slice (no per-good computations)'])
  }
  s46.push([])
  s46.push(['Item', 'Field', 'Value'])
  if (report.item5_totalDirect) {
    report.item5_totalDirect.perProcess.forEach((p) => {
      s46.push(['(5)', `Process ${p.processId} — total direct`, cellOf(p.totalDirect)])
    })
    s46.push(['(5)', 'Installation-level total direct', cellOf(report.item5_totalDirect.installationTotal)])
  } else {
    s46.push(['(5)', 'Total direct emissions', 'Not present in this report slice'])
  }
  if (report.item6_indirect) {
    s46.push(['(6)', 'Installation-level indirect emissions', cellOf(report.item6_indirect)])
  } else {
    s46.push(['(6)', 'Installation-level indirect emissions', 'Not present in this report slice'])
  }
  const ws46 = XLSX.utils.aoa_to_sheet(s46)
  ws46['!cols'] = [
    { wch: 10 }, { wch: 24 }, { wch: 12 },
    { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 26 }, { wch: 20 },
    { wch: 40 }, { wch: 16 }, { wch: 60 },
  ]

  // ── Sheet 4: Items 7-11 (disclosures) ───────────────────────────────
  const s711: Cell[][] = [['Item', 'Field', 'Value']]
  s711.push(['(7)', 'Measurable heat imported from other installations', cellOf(report.item7_heat.imported, yesNo)])
  s711.push(['(7)', 'Measurable heat exported to other installations', cellOf(report.item7_heat.exported, yesNo)])
  s711.push(['(8)', 'Zero-rated fuels used', cellOf(report.item8_zeroRatedFuels.used, yesNo)])
  s711.push(['(8)', 'Demonstration of zero-rating applicability', cellOf(report.item8_zeroRatedFuels.demonstration)])
  s711.push(['(9)', 'Waste gases produced and used in the installation', cellOf(report.item9_wasteGases.producedUsed, yesNo)])
  s711.push(['(9)', 'Waste gases imported from other installations', cellOf(report.item9_wasteGases.imported, yesNo)])
  s711.push(['(9)', 'Waste gases exported to other installations', cellOf(report.item9_wasteGases.exported, yesNo)])
  s711.push(['(10)', 'CO2 capture used', cellOf(report.item10_co2Capture.used, yesNo)])
  s711.push(['(10)', 'CO2 capture transferred to', cellOf(report.item10_co2Capture.transferredTo)])
  s711.push(['(11)', 'Electricity produced inside the installation', cellOf(report.item11_onsiteElectricity.producedOnsite, yesNo)])
  s711.push(['(11)(a)', 'Produced by co-generation', cellOf(report.item11_onsiteElectricity.cogeneration, yesNo)])
  s711.push(['(11)(b)', 'Produced by separate generation', cellOf(report.item11_onsiteElectricity.separateGeneration, yesNo)])
  s711.push(['(11)(c)', 'Produced from fossil sources', cellOf(report.item11_onsiteElectricity.sourceFossil, yesNo)])
  s711.push(['(11)(c)', 'Produced from renewable sources', cellOf(report.item11_onsiteElectricity.sourceRenewable, yesNo)])
  s711.push(['(11)(d)', 'Exported from a production process boundary', cellOf(report.item11_onsiteElectricity.exportedFromProcess, yesNo)])
  const ws711 = XLSX.utils.aoa_to_sheet(s711)
  ws711['!cols'] = [{ wch: 10 }, { wch: 52 }, { wch: 60 }]

  // ── Sheet 5: Items 12-16 (precursors) ───────────────────────────────
  const s1216: Cell[][] = []
  s1216.push(['(12) Precursors — default values used'])
  s1216.push(['Item', 'CN code', 'Name of the good', 'Country of origin', 'Applicable default value'])
  if (report.item12_defaultPrecursors) {
    if (report.item12_defaultPrecursors.length === 0) {
      s1216.push(['(12)', '(none)', '', '', ''])
    } else {
      report.item12_defaultPrecursors.forEach((p) => {
        s1216.push(['(12)', p.cnCode, cellOf(p.name), cellOf(p.originCountry), cellOf(p.defaultValue)])
      })
    }
  } else {
    s1216.push(['(12)', 'Not present in this report slice', '', '', ''])
  }
  s1216.push([])
  s1216.push(['(13) Precursors — actual values used'])
  s1216.push(['Item', 'CN code', 'Name of the good', 'Country of origin', 'Reporting period', 'Specific direct', 'Specific indirect'])
  if (report.item13_actualPrecursors) {
    if (report.item13_actualPrecursors.length === 0) {
      s1216.push(['(13)', '(none)', '', '', '', '', ''])
    } else {
      report.item13_actualPrecursors.forEach((p) => {
        s1216.push(['(13)', p.cnCode, cellOf(p.name), cellOf(p.originCountry), cellOf(p.reportingPeriod), cellOf(p.specificDirect), cellOf(p.specificIndirect)])
      })
    }
  } else {
    s1216.push(['(13)', 'Not present in this report slice', '', '', '', '', ''])
  }
  s1216.push([])
  s1216.push(['Item', 'Field', 'Value'])
  s1216.push(['(14)', 'Multi-period precursor averaging (Article 14(1))', report.item14_multiPeriodPrecursor ? cellOf(report.item14_multiPeriodPrecursor) : 'Not present in this report slice'])
  s1216.push(['(15)', 'Multi-installation precursor averaging (Article 14)', report.item15_multiInstallationPrecursor ? cellOf(report.item15_multiInstallationPrecursor) : 'Not present in this report slice'])
  s1216.push([])
  s1216.push(['(16) Precursor origin (traceability)'])
  s1216.push(['Item', 'CN code', 'Operator of origin', 'Installation of origin', 'CBAM Registry ID of origin', 'Reporting period of origin'])
  if (report.item16_precursorOrigin) {
    if (report.item16_precursorOrigin.length === 0) {
      s1216.push(['(16)', '(none)', '', '', '', ''])
    } else {
      report.item16_precursorOrigin.forEach((p) => {
        s1216.push(['(16)', p.cnCode, cellOf(p.operatorName), cellOf(p.installationName), cellOf(p.cbamRegistryId), cellOf(p.reportingPeriod)])
      })
    }
  } else {
    s1216.push(['(16)', 'Not present in this report slice', '', '', '', ''])
  }
  const ws1216 = XLSX.utils.aoa_to_sheet(s1216)
  ws1216['!cols'] = [{ wch: 10 }, { wch: 20 }, { wch: 34 }, { wch: 26 }, { wch: 28 }, { wch: 20 }, { wch: 20 }]

  // ── Sheet 6: Outstanding (the `missing` array — never filtered/truncated) ──
  const sMissing: Cell[][] = [['Item', 'Field', 'Where to supply']]
  if (missing.length === 0) {
    sMissing.push(['—', 'Nothing outstanding', 'Every required field is supplied or accounted for.'])
  } else {
    missing.forEach((m) => {
      sMissing.push([m.item, m.field, m.hint ?? ''])
    })
  }
  const wsMissing = XLSX.utils.aoa_to_sheet(sMissing)
  wsMissing['!cols'] = [{ wch: 12 }, { wch: 56 }, { wch: 72 }]

  // ── Assemble the workbook (sheet order per spec) ────────────────────
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsCover, 'Cover')
  XLSX.utils.book_append_sheet(wb, ws13, 'Items 1-3')
  XLSX.utils.book_append_sheet(wb, ws46, 'Items 4-6')
  XLSX.utils.book_append_sheet(wb, ws711, 'Items 7-11')
  XLSX.utils.book_append_sheet(wb, ws1216, 'Items 12-16')
  XLSX.utils.book_append_sheet(wb, wsMissing, 'Outstanding')

  const filename = `cbam-1-2-summary_${slugify(installationName)}_${reportingPeriod}.xlsx`
  XLSX.writeFile(wb, filename)
}
