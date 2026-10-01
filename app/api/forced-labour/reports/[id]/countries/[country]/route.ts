// app/api/forced-labour/reports/[id]/countries/[country]/route.ts
// GET: one country's part of a report: its applicability answers, and each section as it reads (its own
// record with the shared answers laid over it), with its status and where each shared answer came from.
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/s211/server'
import { requireCountry, resolveReport, visibleCountries } from '@/lib/forcedLabour/countryGate'
import { builderFor } from '@/lib/forcedLabour/countryBuilders'
import { overlayCountrySection, sharedProvenance, countryStatusAfterEdit } from '@/lib/forcedLabour/countryAdapter'
import type { SectionContent } from '@/lib/s211/builderContent'
import { loadDraftSources } from '@/lib/forcedLabour/draftStore'
import { withDrafts } from '@/lib/forcedLabour/drafts'
import type { SectionStatus } from '@/lib/s211/sectionStatus'

export async function GET(req: Request, { params }: { params: Promise<{ id: string; country: string }> }) {
  const { id, country } = await params
  const gate = await requireCountry(req, country, 'read')
  if (!gate.ok) return gate.response
  const builder = builderFor(gate.country)
  if (!builder) return notFound()
  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report.flReportId) return notFound()

  const { data: row, error } = await gate.supabase.from('fl_report_countries')
    .select('country, status, applicability, content, section_status').eq('report_id', report.flReportId).eq('country', gate.country).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!row) return notFound()
  const { data: parent } = await gate.supabase.from('fl_reports').select('organization_name').eq('id', report.flReportId).maybeSingle()
  const { data: a, error: aErr } = await gate.supabase.from('fl_answers').select('field_key, value').eq('report_id', report.flReportId)
  if (aErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  const answers = new Map((a ?? []).map(x => [x.field_key as string, x.value]))
  // "Answered for" names only countries on this report that this account may see.
  const { data: onReportRows } = await gate.supabase.from('fl_report_countries').select('country').eq('report_id', report.flReportId)
  const visible = new Set((await visibleCountries(gate.supabase)).map(c => c.key as string))
  const onReport = new Set(['canada', ...((onReportRows ?? []).map(r => r.country as string))].filter(c => visible.has(c)))

  const content = (row.content ?? {}) as Record<string, SectionContent>
  const statuses = (row.section_status ?? {}) as Record<string, SectionStatus>
  // Per-country questions with no answer yet start from another country's answer, as marked drafts.
  const sources = await loadDraftSources(gate.supabase, report.s211Id, report.flReportId)
  const sections = builder.sections.map(def => {
    const own = content[def.key] ?? {}
    const read = withDrafts(gate.country, def.fields, overlayCountrySection(def, own, answers), sources)
    return {
      section_key: def.key, content: read,
      status: statuses[def.key] ?? countryStatusAfterEdit(def, 'not_started', overlayCountrySection(def, own, answers)),
      provenance: Object.fromEntries(Object.entries(sharedProvenance(def, own, answers, gate.country))
        .map(([k, p]) => [k, p.from === 'here' ? p : { from: 'elsewhere' as const, countries: p.countries.filter(c => onReport.has(c)) }])),
    }
  })

  // The figures a turnover estimate can start from: the organisation's shared revenue, else Canada's own.
  let canadaFigure: { amount: number; currency: string } | null = null
  if (report.s211Id) {
    const { data: c } = await gate.supabase.from('s211_reports').select('recent_fy_revenue, recent_fy_currency').eq('id', report.s211Id).maybeSingle()
    if (c && typeof c.recent_fy_revenue === 'number' && typeof c.recent_fy_currency === 'string') canadaFigure = { amount: c.recent_fy_revenue, currency: c.recent_fy_currency }
  }
  const amount = Number(answers.get('organization.revenue_amount'))
  const currency = answers.get('organization.revenue_currency')
  const organizationFigure = Number.isFinite(amount) && answers.has('organization.revenue_amount') && typeof currency === 'string' ? { amount, currency } : null

  // Entities (Stage D1b): which give and which are covered by this country's statement (fl_report_entities),
  // and the names to choose from: the report's entities, the organisation, and Canada's own names if Canada is visible.
  const { data: ents } = await gate.supabase.from('fl_report_entities').select('legal_name, reporting_in, giving_in, position').eq('report_id', report.flReportId)
  const sorted = [...(ents ?? [])].sort((x, y) => Number(x.position ?? 0) - Number(y.position ?? 0))
  const organizationName = (parent?.organization_name as string | undefined) ?? (report.row?.company_name as string | undefined) ?? null
  const suggestions: string[] = organizationName ? [organizationName] : []
  if (report.s211Id && visible.has('canada')) {
    const { data: d } = await gate.supabase.from('s211_report_sections').select('content').eq('report_id', report.s211Id).eq('section_key', 'report_details').maybeSingle()
    const c = (d?.content ?? {}) as Record<string, unknown>
    if (typeof c.legal_name === 'string' && c.legal_name.trim()) suggestions.push(c.legal_name.trim())
    if (Array.isArray(c.joint_entities)) for (const n of c.joint_entities) if (typeof n === 'string' && n.trim()) suggestions.push(n.trim())
  }
  const entities = {
    giving: (sorted.find(e => ((e.giving_in ?? []) as string[]).includes(gate.country))?.legal_name as string | undefined) ?? null,
    covered: sorted.filter(e => ((e.reporting_in ?? []) as string[]).includes(gate.country)).map(e => e.legal_name as string),
    known: [...new Set([...sorted.map(e => e.legal_name as string), ...suggestions])],
    defaultGiving: organizationName,
  }

  return NextResponse.json({
    entities,
    report: { id, canadaReportId: report.s211Id, organizationName: (parent?.organization_name as string | undefined) ?? (report.row?.company_name as string | undefined) ?? null },
    country: { key: gate.country, status: row.status, applicability: row.applicability ?? {} },
    sections,
    figures: { organization: organizationFigure, canada: canadaFigure },
  })
}
