// app/api/forced-labour/reports/[id]/countries/[country]/export/route.ts
// GET: the UK slavery and human trafficking statement as a PDF (Stage D2). The same gate as every country route
// (lib/forcedLabour/countryGate.ts), then the UK export gate (lib/forcedLabour/uk/exportCheck.ts): a refused export
// is a 409 naming each blocker, and nothing is drawn. Built here from what is STORED: the country's own record with
// the shared answers laid over it, never a draft only offered on reading.
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/s211/server'
import { requireCountry, resolveReport } from '@/lib/forcedLabour/countryGate'
import { overlayCountrySection } from '@/lib/forcedLabour/countryAdapter'
import { UK_SECTIONS, ukFinancialYear, type UkSectionKey } from '@/lib/forcedLabour/uk/builderContent'
import { ukExportGate, type UkSectionState } from '@/lib/forcedLabour/uk/exportCheck'
import { buildUkStatementModel, ukStatementFileName, UK_PDF_OPTIONS } from '@/lib/forcedLabour/uk/statementModel'
import { generateS211ReportPDF } from '@/lib/s211/reportPdf'
import type { SectionContent } from '@/lib/s211/builderContent'
import type { SectionStatus } from '@/lib/s211/sectionStatus'

export async function GET(req: Request, { params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = await params
  const gate = await requireCountry(req, country, 'read')
  if (!gate.ok) return gate.response
  if (gate.country !== 'uk') return notFound()
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report.flReportId) return notFound()

  const { data: row, error } = await gate.supabase.from('fl_report_countries').select('content, section_status').eq('report_id', report.flReportId).eq('country', 'uk').maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!row) return notFound()
  const [{ data: a, error: aErr }, { data: ents, error: eErr }] = await Promise.all([
    gate.supabase.from('fl_answers').select('field_key, value').eq('report_id', report.flReportId),
    gate.supabase.from('fl_report_entities').select('legal_name, reporting_in, giving_in, position').eq('report_id', report.flReportId),
  ])
  if (aErr || eErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  const answers = new Map((a ?? []).map(x => [x.field_key as string, x.value]))
  const content = (row.content ?? {}) as Record<string, SectionContent>
  const statuses = (row.section_status ?? {}) as Record<string, SectionStatus>
  const sections = Object.fromEntries(UK_SECTIONS.map(d => [d.key, { status: statuses[d.key] ?? 'not_started', content: overlayCountrySection(d, content[d.key] ?? {}, answers) }])) as Record<UkSectionKey, UkSectionState>

  const sorted = [...(ents ?? [])].sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0))
  const giving = (sorted.find(e => ((e.giving_in ?? []) as string[]).includes('uk'))?.legal_name as string | undefined) ?? null
  const covered = sorted.filter(e => ((e.reporting_in ?? []) as string[]).includes('uk')).map(e => e.legal_name as string)

  const check = ukExportGate(sections, { giving, covered })
  if (!check.ready || !giving) return NextResponse.json({ error: 'The statement is not ready to export.', blockers: check.blockers }, { status: 409 })

  const model = buildUkStatementModel({ sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.content])), giving, covered })
  const { doc, substituted } = generateS211ReportPDF(model, UK_PDF_OPTIONS)
  return new NextResponse(doc.output('arraybuffer'), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${ukStatementFileName(model, ukFinancialYear(sections.statement_details.content)?.end ?? null)}"`,
      'Cache-Control': 'no-store',
      'X-Report-Substituted-Characters': String(substituted.length),
    },
  })
}
