// app/api/s211/reports/[id]/route.ts
// GET: one report and its sections. PATCH: the report's own columns (the entity-test inputs).
// Gated by lib/s211/server.ts; RLS returns no row for a report the user does not own, which reads as 404.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '../../../../../lib/s211/server'
import { cleanReportPatch, REPORT_COLUMNS } from '../../../../../lib/s211/reportPatch'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const { data: report, error } = await gate.supabase.from('s211_reports').select(REPORT_COLUMNS).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()
  const { data: sections, error: sErr } = await gate.supabase.from('s211_report_sections')
    .select('section_key, content, status, updated_at').eq('report_id', id)
  if (sErr) return NextResponse.json({ error: 'The report sections could not be loaded.' }, { status: 500 })
  return NextResponse.json({ report, sections: sections ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req)
  if (!gate.ok) return gate.response
  const { id } = await params
  const cleaned = cleanReportPatch(await req.json().catch(() => null))
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const { data, error } = await gate.supabase.from('s211_reports')
    .update({ ...cleaned.patch, updated_at: new Date().toISOString() }).eq('id', id).select(REPORT_COLUMNS).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!data) return notFound()
  return NextResponse.json({ report: data })
}
