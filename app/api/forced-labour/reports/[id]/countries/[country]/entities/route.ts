// app/api/forced-labour/reports/[id]/countries/[country]/entities/route.ts
// PUT { giving, covered }: which entity gives this country's statement and which it covers (fl_report_entities),
// in ONE transaction through public.fl_set_country_entities. Not Canada, which keeps its entities in section 1.
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/s211/server'
import { requireCountry, resolveReport } from '@/lib/forcedLabour/countryGate'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = await params
  const gate = await requireCountry(req, country, 'write')
  if (!gate.ok) return gate.response
  const body = await req.json().catch(() => null) as { giving?: unknown; covered?: unknown } | null
  const giving = typeof body?.giving === 'string' ? body.giving.trim() : ''
  const covered = Array.isArray(body?.covered) ? body.covered : null
  if (!giving) return NextResponse.json({ error: 'Name the organisation giving the statement.' }, { status: 400 })
  if (!covered || covered.some(n => typeof n !== 'string' || !n.trim() || n.length > 300) || covered.length > 200)
    return NextResponse.json({ error: 'Each organisation needs a name.' }, { status: 400 })
  const names = (covered as string[]).map(n => n.trim())
  if (new Set(names).size !== names.length) return NextResponse.json({ error: 'An organisation is listed twice.' }, { status: 400 })
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report.flReportId) return notFound()
  const { data, error } = await gate.supabase.rpc('fl_set_country_entities', { p_report_id: report.flReportId, p_country: gate.country, p_giving: giving.slice(0, 300), p_covered: names })
  if (error || !data) return NextResponse.json({ error: 'The organisations could not be saved.' }, { status: 500 })
  return NextResponse.json({ entities: data })
}
