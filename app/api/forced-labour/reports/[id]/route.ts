// app/api/forced-labour/reports/[id]/route.ts
// GET: a report's overview. Each country on the report (only those this account may see), and every shared
// answer with the countries on the report that use it. `id` is the Canada report's id or the parent's.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '@/lib/s211/server'
import { resolveReport, visibleCountries } from '@/lib/forcedLabour/countryGate'
import { FIELD_REGISTRY } from '@/lib/forcedLabour/fieldRegistry'
import { sharedFieldLabel } from '@/lib/forcedLabour/sharedLabels'
import type { CountryKey } from '@/lib/forcedLabour/countries'

const REG = new Map(FIELD_REGISTRY.map(f => [f.key, f]))

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { id } = await params
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  const visible = new Set<CountryKey>((await visibleCountries(gate.supabase)).map(c => c.key))

  let rows: { country: string; status: string; section_status: Record<string, string>; applicability: Record<string, unknown> }[] = []
  let answers: { field_key: string; value: unknown }[] = []
  let organizationName = (report.row?.company_name as string | undefined) ?? null
  if (report.flReportId) {
    const { data: parent, error: pErr } = await gate.supabase.from('fl_reports').select('id, organization_name, period_end').eq('id', report.flReportId).maybeSingle()
    const { data: r, error } = await gate.supabase.from('fl_report_countries').select('country, status, section_status, applicability').eq('report_id', report.flReportId)
    const { data: a, error: aErr } = await gate.supabase.from('fl_answers').select('field_key, value').eq('report_id', report.flReportId)
    if (pErr || error || aErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
    if (parent?.organization_name) organizationName = parent.organization_name as string
    rows = (r ?? []) as typeof rows
    answers = (a ?? []) as typeof answers
  }
  // A Canada report not yet linked to a parent is a Canada-only report.
  if (report.s211Id && !rows.some(r => r.country === 'canada')) rows.unshift({ country: 'canada', status: 'draft', section_status: {}, applicability: {} })
  const countries = rows.filter(r => visible.has(r.country as CountryKey))
  // A report whose only countries this account may not see does not exist for it.
  if (countries.length === 0) return notFound()
  const onReport = new Set(countries.map(c => c.country))

  const shared = answers
    .filter(a => REG.has(a.field_key))
    .map(a => ({
      field_key: a.field_key, label: sharedFieldLabel(a.field_key), value: a.value,
      usedBy: (REG.get(a.field_key)!.countries as CountryKey[]).filter(c => onReport.has(c)),
    }))
    .filter(a => a.usedBy.length > 0)

  return NextResponse.json({
    report: { id, canadaReportId: report.s211Id, organizationName },
    countries: countries.map(c => ({ country: c.country, status: c.status, sectionStatus: c.section_status ?? {}, applicability: c.applicability ?? {} })),
    shared,
  })
}
