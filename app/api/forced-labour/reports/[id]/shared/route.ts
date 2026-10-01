// app/api/forced-labour/reports/[id]/shared/route.ts
// PUT { revenue_amount, revenue_currency }: the organization's own revenue figure, shared by the report as a
// whole (lib/forcedLabour/fieldRegistry.ts ORGANIZATION_FIELDS). It is no law's measure: each country's check
// asks for its own, and this only starts an estimate. Both values in one statement, or both removed.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '@/lib/s211/server'
import { resolveReport } from '@/lib/forcedLabour/countryGate'
import { ensureParent } from '@/lib/forcedLabour/canadaStore'
import { isFxCurrency } from '@/lib/fx'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'write')
  if (!gate.ok) return gate.response
  const { id } = await params
  const body = await req.json().catch(() => null) as { revenue_amount?: unknown; revenue_currency?: unknown } | null
  const raw = body?.revenue_amount
  const clear = raw === null || raw === ''
  const amount = clear ? null : Number(raw)
  const currency = typeof body?.revenue_currency === 'string' ? body.revenue_currency.trim().toUpperCase() : ''
  if (!clear && (amount === null || !Number.isFinite(amount) || amount < 0)) return NextResponse.json({ error: 'Revenue must be zero or more.' }, { status: 400 })
  if (!clear && !isFxCurrency(currency)) return NextResponse.json({ error: 'Choose a currency from the list.' }, { status: 400 })

  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  let flReportId = report.flReportId
  if (!flReportId && report.row) {
    const parent = await ensureParent(gate.supabase, gate.userId, report.row as { id: string })
    if (!parent.ok) return NextResponse.json({ error: 'The figure could not be saved.' }, { status: 500 })
    flReportId = parent.flReportId
  }
  if (!flReportId) return notFound()

  const keys = ['organization.revenue_amount', 'organization.revenue_currency']
  const { error } = clear
    ? await gate.supabase.from('fl_answers').delete().eq('report_id', flReportId).in('field_key', keys)
    : await gate.supabase.from('fl_answers').upsert([
        { report_id: flReportId, field_key: keys[0], value: amount, updated_at: new Date().toISOString() },
        { report_id: flReportId, field_key: keys[1], value: currency, updated_at: new Date().toISOString() },
      ], { onConflict: 'report_id,field_key' })
  if (error) return NextResponse.json({ error: 'The figure could not be saved.' }, { status: 500 })
  return NextResponse.json({ revenue_amount: amount, revenue_currency: clear ? null : currency })
}
