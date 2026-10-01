// app/api/forced-labour/reports/[id]/countries/[country]/sections/[key]/route.ts
// PUT { content, action? }: save one section of a country other than Canada. The status is decided here, by
// Canada's rules on the country's own fields (lib/forcedLabour/countryAdapter.ts). The section and its shared
// answers are written in ONE transaction, through public.fl_save_country_section.
import { NextResponse } from 'next/server'
import { notFound, MAX_CONTENT_CHARS } from '@/lib/s211/server'
import { requireCountry, resolveReport } from '@/lib/forcedLabour/countryGate'
import { builderFor } from '@/lib/forcedLabour/countryBuilders'
import { countryAnswersFrom, countryStatusAfterEdit, countryMarkComplete } from '@/lib/forcedLabour/countryAdapter'
import type { SectionContent } from '@/lib/s211/builderContent'
import { settleOffered } from '@/lib/forcedLabour/drafts'
import type { SectionStatus } from '@/lib/s211/sectionStatus'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; country: string; key: string }> }) {
  const { id, country, key } = await params
  const gate = await requireCountry(req, country, 'write')
  if (!gate.ok) return gate.response
  const builder = builderFor(gate.country)
  if (!builder || !builder.isSectionKey(key)) return notFound()
  const def = builder.sections.find(s => s.key === key)!

  const body = await req.json().catch(() => null) as { content?: unknown; action?: unknown } | null
  const content = body?.content
  if (!content || typeof content !== 'object' || Array.isArray(content)) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  if (JSON.stringify(content).length > MAX_CONTENT_CHARS) return NextResponse.json({ error: 'This section is too long to save.' }, { status: 413 })
  const action = body?.action === 'complete' || body?.action === 'reopen' ? body.action : 'save'

  const report = await resolveReport(gate.supabase, id)
  if (!report.ok) return report.status === 404 ? notFound() : NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report.flReportId) return notFound()
  const { data: row, error: rErr } = await gate.supabase.from('fl_report_countries')
    .select('section_status').eq('report_id', report.flReportId).eq('country', gate.country).maybeSingle()
  if (rErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!row) return notFound()

  // Offered drafts kept by the user are stored as drafts, still marked (lib/forcedLabour/drafts.ts).
  const c = settleOffered(content as SectionContent)
  const before = (((row.section_status ?? {}) as Record<string, SectionStatus>)[key]) ?? 'not_started'
  let status: SectionStatus
  if (action === 'complete') {
    const r = countryMarkComplete(def, c)
    if (!r.ok) return NextResponse.json({ error: r.message, missing: r.missing, invalid: r.invalid }, { status: 422 })
    status = 'complete'
  } else if (action === 'reopen') status = 'in_progress'
  else status = countryStatusAfterEdit(def, before, c)

  const { upsert, remove } = countryAnswersFrom(def, c)
  const { data, error } = await gate.supabase.rpc('fl_save_country_section', {
    p_report_id: report.flReportId, p_country: gate.country, p_section_key: key, p_content: c, p_status: status,
    p_answers: Object.fromEntries(upsert.map(a => [a.field_key, a.value])), p_remove: remove,
  })
  if (error || !data) return NextResponse.json({ error: 'The section could not be saved.' }, { status: 500 })
  return NextResponse.json({ section: data })
}
