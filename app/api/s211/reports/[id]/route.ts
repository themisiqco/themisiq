// app/api/s211/reports/[id]/route.ts
// GET: one report and its sections. PATCH: the report's own columns (the entity-test inputs).
// Gated by lib/s211/server.ts; RLS returns no row for a report the user does not own, which reads as 404.
// Through the shared model (lib/forcedLabour/canadaAdapter.ts): shared answers and the two shared columns
// are read from the Forced Labour tables, and a PATCH writes the shared columns there first.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '../../../../../lib/s211/server'
import { cleanReportPatch, REPORT_COLUMNS } from '../../../../../lib/s211/reportPatch'
import { overlayReport, overlaySection, withoutLink } from '../../../../../lib/forcedLabour/canadaAdapter'
import { loadShared, ensureParent, saveSharedColumns } from '../../../../../lib/forcedLabour/canadaStore'
import type { SectionContent, SectionKey } from '../../../../../lib/s211/builderContent'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { id } = await params
  const { data: report, error } = await gate.supabase.from('s211_reports').select(`${REPORT_COLUMNS}, fl_report_id`).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()
  const { data: sections, error: sErr } = await gate.supabase.from('s211_report_sections')
    .select('section_key, content, status, updated_at').eq('report_id', id)
  if (sErr) return NextResponse.json({ error: 'The report sections could not be loaded.' }, { status: 500 })
  const row = report as unknown as Record<string, unknown>
  const shared = await loadShared(gate.supabase, row.fl_report_id as string | null)
  if (!shared.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  return NextResponse.json({
    report: withoutLink(overlayReport(row, shared.parent)),
    sections: (sections ?? []).map(s => ({ ...s, content: overlaySection(s.section_key as SectionKey, (s.content ?? {}) as SectionContent, shared.answers) })),
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'write')
  if (!gate.ok) return gate.response
  const { id } = await params
  const cleaned = cleanReportPatch(await req.json().catch(() => null))
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { data: link, error: lErr } = await gate.supabase.from('s211_reports')
    .select('id, fl_report_id, company_name, financial_year_end, status').eq('id', id).maybeSingle()
  if (lErr) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!link) return notFound()
  // The shared store first: a read prefers it (lib/forcedLabour/canadaStore.ts).
  const parent = await ensureParent(gate.supabase, gate.userId, link as unknown as { id: string })
  if (!parent.ok || !(await saveSharedColumns(gate.supabase, parent.flReportId, cleaned.patch)))
    return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  const { data, error } = await gate.supabase.from('s211_reports')
    .update({ ...cleaned.patch, updated_at: new Date().toISOString() }).eq('id', id).select(REPORT_COLUMNS).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!data) return notFound()
  const shared = await loadShared(gate.supabase, parent.flReportId)
  if (!shared.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  return NextResponse.json({ report: withoutLink(overlayReport(data as unknown as Record<string, unknown>, shared.parent)) })
}
