// app/api/s211/reports/[id]/export/route.ts
// GET: the report as a PDF. The same gate as every S-211 route (lib/s211/server.ts), then the export
// gate (lib/s211/exportCheck.ts): every required section complete and no placeholder left in the
// attestation. A refused export is a 409 naming each blocker; nothing is drawn.
//
// The PDF is built here, on the server, from the rows RLS lets this user read, so the gate cannot be
// stepped around in the browser. The substituted-character count goes back in a header so the check
// page can say so; the report itself carries no note of ours.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '../../../../../../lib/s211/server'
import { exportGate, type SectionState } from '../../../../../../lib/s211/exportCheck'
import { buildS211ReportModel, reportFileName } from '../../../../../../lib/s211/reportModel'
import { generateS211ReportPDF } from '../../../../../../lib/s211/reportPdf'
import type { SectionKey } from '../../../../../../lib/s211/builderContent'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { id } = await params
  const { data: report, error } = await gate.supabase.from('s211_reports').select('id, reporting_year').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()
  const { data: rows, error: sErr } = await gate.supabase.from('s211_report_sections').select('section_key, content, status').eq('report_id', id)
  if (sErr) return NextResponse.json({ error: 'The report sections could not be loaded.' }, { status: 500 })

  const sections = Object.fromEntries((rows ?? []).map(r => [r.section_key, { status: r.status, content: r.content ?? {} }])) as Partial<Record<SectionKey, SectionState>>
  const check = exportGate(sections)
  if (!check.ready) return NextResponse.json({ error: 'The report is not ready to export.', blockers: check.blockers }, { status: 409 })

  const reportingYear = Number(report.reporting_year)
  const model = buildS211ReportModel({ reportingYear, sections: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v!.content])) })
  const { doc, substituted } = generateS211ReportPDF(model)
  const bytes = doc.output('arraybuffer')
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${reportFileName(model, reportingYear)}"`,
      'Cache-Control': 'no-store',
      'X-Report-Substituted-Characters': String(substituted.length),
    },
  })
}
