// app/api/s211/reports/route.ts
// GET: the user's S-211 reports. POST: create one (company name, reporting year).
// Gated by lib/s211/server.ts; RLS on s211_reports scopes every row to its owner.
// Through the shared model (lib/forcedLabour/canadaAdapter.ts): the company name is read from the report's
// Forced Labour parent, and a new report is created with its parent and 'canada' row.
import { NextResponse } from 'next/server'
import { requireS211 } from '../../../../lib/s211/server'
import { REPORT_LIST_COLUMNS } from '../../../../lib/s211/reportPatch'
import { overlayReport, withoutLink } from '../../../../lib/forcedLabour/canadaAdapter'
import { loadParents, createParent, dropParent } from '../../../../lib/forcedLabour/canadaStore'

export async function GET(req: Request) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { data, error } = await gate.supabase.from('s211_reports').select(`${REPORT_LIST_COLUMNS}, fl_report_id`)
    .order('reporting_year', { ascending: false }).order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'The reports could not be loaded.' }, { status: 500 })
  const parents = await loadParents(gate.supabase)
  if (!parents.ok) return NextResponse.json({ error: 'The reports could not be loaded.' }, { status: 500 })
  const reports = ((data ?? []) as unknown as Record<string, unknown>[])
    .map(r => withoutLink(overlayReport(r, parents.parents.get(r.fl_report_id as string))))
  return NextResponse.json({ reports })
}

export async function POST(req: Request) {
  const gate = await requireS211(req, 'write')
  if (!gate.ok) return gate.response
  const body = await req.json().catch(() => null) as { company_name?: unknown; reporting_year?: unknown } | null
  const company = typeof body?.company_name === 'string' ? body.company_name.trim() : ''
  const year = typeof body?.reporting_year === 'number' ? body.reporting_year : Number(body?.reporting_year)
  if (!company) return NextResponse.json({ error: 'Enter the company name.' }, { status: 400 })
  if (!Number.isInteger(year) || year < 2024 || year > 2100)
    return NextResponse.json({ error: 'Enter a reporting year from 2024 onward. The first reports under the Act were due in 2024.' }, { status: 400 })
  const now = new Date().toISOString()
  const name = company.slice(0, 300)
  const parent = await createParent(gate.supabase, gate.userId, name)
  if (!parent.ok) return NextResponse.json({ error: 'The report could not be created.' }, { status: 500 })
  const { data, error } = await gate.supabase.from('s211_reports')
    .insert({ user_id: gate.userId, company_name: name, reporting_year: year, updated_at: now, fl_report_id: parent.flReportId })
    .select(REPORT_LIST_COLUMNS).single()
  if (error || !data) {
    await dropParent(gate.supabase, parent.flReportId)
    return NextResponse.json({ error: 'The report could not be created.' }, { status: 500 })
  }
  return NextResponse.json({ report: withoutLink(data as unknown as Record<string, unknown>) }, { status: 201 })
}
