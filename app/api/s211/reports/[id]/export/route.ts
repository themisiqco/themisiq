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
import type { SectionContent, SectionKey } from '../../../../../../lib/s211/builderContent'
import { overlaySection, sectionsOnlyShared } from '../../../../../../lib/forcedLabour/canadaAdapter'
import { SECTION_KEYS } from '../../../../../../lib/s211/builderContent'
import { statusAfterEdit } from '../../../../../../lib/s211/sectionStatus'
import { loadShared, canadaReportIdFor } from '../../../../../../lib/forcedLabour/canadaStore'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { id: urlId } = await params
  // The URL may carry the Canada report's id or (Stage D1b) its parent's.
  const resolved = await canadaReportIdFor(gate.supabase, urlId)
  if (!resolved.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!resolved.id) return notFound()
  const id = resolved.id
  const { data: report, error } = await gate.supabase.from('s211_reports').select('id, reporting_year, fl_report_id').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()
  const { data: rows, error: sErr } = await gate.supabase.from('s211_report_sections').select('section_key, content, status').eq('report_id', id)
  if (sErr) return NextResponse.json({ error: 'The report sections could not be loaded.' }, { status: 500 })

  // Through the shared model: each section with the shared answers laid over it (lib/forcedLabour/canadaAdapter.ts).
  const shared = await loadShared(gate.supabase, report.fl_report_id as string | null)
  if (!shared.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  const sections = Object.fromEntries((rows ?? []).map(r => [r.section_key,
    { status: r.status, content: overlaySection(r.section_key as SectionKey, (r.content ?? {}) as SectionContent, shared.answers) }])) as Partial<Record<SectionKey, SectionState>>
  for (const s of sectionsOnlyShared(new Set(Object.keys(sections)), shared.answers, SECTION_KEYS))
    sections[s.section_key] = { status: statusAfterEdit(s.section_key, 'not_started', s.content), content: s.content }
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
