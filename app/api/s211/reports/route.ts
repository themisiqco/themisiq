// app/api/s211/reports/route.ts
// GET: the user's S-211 reports. POST: create one (company name, reporting year).
// Gated by lib/s211/server.ts; RLS on s211_reports scopes every row to its owner.
import { NextResponse } from 'next/server'
import { requireS211 } from '../../../../lib/s211/server'
import { REPORT_LIST_COLUMNS } from '../../../../lib/s211/reportPatch'

export async function GET(req: Request) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { data, error } = await gate.supabase.from('s211_reports').select(REPORT_LIST_COLUMNS)
    .order('reporting_year', { ascending: false }).order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'The reports could not be loaded.' }, { status: 500 })
  return NextResponse.json({ reports: data ?? [] })
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
  const { data, error } = await gate.supabase.from('s211_reports')
    .insert({ user_id: gate.userId, company_name: company.slice(0, 300), reporting_year: year, updated_at: now })
    .select(REPORT_LIST_COLUMNS).single()
  if (error || !data) return NextResponse.json({ error: 'The report could not be created.' }, { status: 500 })
  return NextResponse.json({ report: data }, { status: 201 })
}
