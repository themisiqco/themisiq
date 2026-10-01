// app/api/forced-labour/reports/[id]/countries/[country]/applicability/route.ts
// PUT { applicability }: the country's applicability answers, checked (lib/forcedLabour/uk/applicability.ts
// for the UK). The result is recomputed wherever it is shown, never stored.
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/s211/server'
import { requireCountry, resolveReport } from '@/lib/forcedLabour/countryGate'
import { builderFor } from '@/lib/forcedLabour/countryBuilders'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = await params
  const gate = await requireCountry(req, country, 'write')
  if (!gate.ok) return gate.response
  const builder = builderFor(gate.country)
  if (!builder) return notFound()
  const body = await req.json().catch(() => null) as { applicability?: unknown } | null
  const applicability = builder.cleanApplicability(body?.applicability)
  if (!applicability) return NextResponse.json({ error: 'These answers could not be read.' }, { status: 400 })
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report.flReportId) return notFound()
  const { data, error } = await gate.supabase.from('fl_report_countries')
    .update({ applicability, updated_at: new Date().toISOString() }).eq('report_id', report.flReportId).eq('country', gate.country).select('applicability')
  if (error) return NextResponse.json({ error: 'The answers could not be saved.' }, { status: 500 })
  if (!data || data.length === 0) return notFound()
  return NextResponse.json({ applicability: data[0].applicability })
}
