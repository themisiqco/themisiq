// app/api/forced-labour/reports/[id]/countries/route.ts
// POST { country }: add a country to a report, creating its fl_report_countries row. Only a country this
// account may see (a 'preview' country only for the preview list); Canada is every report's from the start.
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/s211/server'
import { requireCountry, resolveReport } from '@/lib/forcedLabour/countryGate'
import { ensureParent } from '@/lib/forcedLabour/canadaStore'
import { builderFor } from '@/lib/forcedLabour/countryBuilders'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.clone().json().catch(() => null) as { country?: unknown } | null
  const country = typeof body?.country === 'string' ? body.country : ''
  const gate = await requireCountry(req, country, 'write')
  if (!gate.ok) return gate.response
  if (!builderFor(gate.country)) return notFound()
  const { id } = await params
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })

  let flReportId = report.flReportId
  if (!flReportId && report.row) {
    const parent = await ensureParent(gate.supabase, gate.userId, report.row as { id: string })
    if (!parent.ok) return NextResponse.json({ error: 'The country could not be added.' }, { status: 500 })
    flReportId = parent.flReportId
  }
  if (!flReportId) return notFound()

  const { data: existing } = await gate.supabase.from('fl_report_countries').select('country').eq('report_id', flReportId).eq('country', gate.country).maybeSingle()
  if (existing) return NextResponse.json({ country: gate.country, added: false })
  const { error } = await gate.supabase.from('fl_report_countries').insert({ report_id: flReportId, country: gate.country })
  if (error) return NextResponse.json({ error: 'The country could not be added.' }, { status: 500 })
  return NextResponse.json({ country: gate.country, added: true }, { status: 201 })
}
