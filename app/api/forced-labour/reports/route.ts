// app/api/forced-labour/reports/route.ts
// GET: the user's reports, whatever country they started from, each with the countries on it this account may see.
// POST { organization_name, country }: start a report from a country other than Canada (a Canada report starts from
// /api/s211/reports, with its reporting year). The report and its first country row are made in one transaction
// (public.fl_create_report). A report's id is its parent's (fl_reports.id): it does not depend on a Canada report.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '@/lib/s211/server'
import { requireCountry, visibleCountries } from '@/lib/forcedLabour/countryGate'
import { builderFor } from '@/lib/forcedLabour/countryBuilders'
import type { ReportListRow } from '@/lib/forcedLabour/client'

export async function GET(req: Request) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const visible = (await visibleCountries(gate.supabase)).map(c => c.key)
  const [{ data: parents, error: e1 }, { data: rows, error: e2 }, { data: canada, error: e3 }] = await Promise.all([
    gate.supabase.from('fl_reports').select('id, organization_name, updated_at'),
    gate.supabase.from('fl_report_countries').select('report_id, country'),
    gate.supabase.from('s211_reports').select('id, fl_report_id, company_name, reporting_year, updated_at'),
  ])
  if (e1 || e2 || e3) return NextResponse.json({ error: 'The reports could not be loaded.' }, { status: 500 })
  const out: ReportListRow[] = []
  for (const p of parents ?? []) {
    const ca = (canada ?? []).find(c => c.fl_report_id === p.id)
    const on = new Set([...(rows ?? []).filter(r => r.report_id === p.id).map(r => r.country as string), ...(ca ? ['canada'] : [])])
    const countries = visible.filter(k => on.has(k))
    if (countries.length === 0) continue   // only countries this account may not see: no trace of it
    out.push({ id: p.id as string, name: (p.organization_name as string) ?? (ca?.company_name as string),
      countries, canadaReportingYear: ca ? Number(ca.reporting_year) : null, updated_at: (p.updated_at as string) ?? null })
  }
  // A Canada report not yet linked to a parent (saved before the adapter, not backfilled).
  for (const c of (canada ?? []).filter(c => !c.fl_report_id))
    out.push({ id: c.id as string, name: c.company_name as string, countries: ['canada'], canadaReportingYear: Number(c.reporting_year), updated_at: (c.updated_at as string) ?? null })
  out.sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))
  return NextResponse.json({ reports: out })
}

export async function POST(req: Request) {
  const body = await req.clone().json().catch(() => null) as { organization_name?: unknown; country?: unknown } | null
  const country = typeof body?.country === 'string' ? body.country : ''
  const gate = await requireCountry(req, country, 'write')
  if (!gate.ok) return gate.response
  if (!builderFor(gate.country)) return notFound()
  const name = typeof body?.organization_name === 'string' ? body.organization_name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Enter the organization name.' }, { status: 400 })
  const { data, error } = await gate.supabase.rpc('fl_create_report', { p_organization_name: name.slice(0, 300), p_country: gate.country })
  if (error || typeof data !== 'string') return NextResponse.json({ error: 'The report could not be created.' }, { status: 500 })
  return NextResponse.json({ report: { id: data } }, { status: 201 })
}
