// app/api/s211/reports/[id]/sections/[key]/route.ts
// PUT: save one section's answers. Body: { content, action?: 'save' | 'complete' | 'reopen' }.
//
// THE STATUS IS DECIDED HERE, NOT BY THE BROWSER. A save moves it by statusAfterEdit(); "complete" is
// accepted only if markComplete() finds no empty required field, and is otherwise refused with a 422
// naming the fields; "reopen" returns a complete section to in progress. So a section cannot be stored
// as complete with a required field empty, whatever the client sends.
//
// Gated by lib/s211/server.ts. The report must exist and belong to the user (RLS): otherwise 404.
//
// Through the shared model (lib/forcedLabour/canadaAdapter.ts): the section's shared fields go to
// fl_answers and the whole section to s211_report_sections in ONE transaction (saveCanadaSection, through
// public.fl_save_canada_section). Either both are saved or neither is.
import { NextResponse } from 'next/server'
import { ensureParent, saveCanadaSection, canadaReportIdFor } from '../../../../../../../lib/forcedLabour/canadaStore'
import { settleOffered } from '../../../../../../../lib/forcedLabour/drafts'
import { requireS211, notFound, MAX_CONTENT_CHARS } from '../../../../../../../lib/s211/server'
import { isSectionKey } from '../../../../../../../lib/s211/builderContent'
import { statusAfterEdit, markComplete, type SectionStatus } from '../../../../../../../lib/s211/sectionStatus'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const gate = await requireS211(req, 'write')
  if (!gate.ok) return gate.response
  const { id: urlId, key } = await params
  if (!isSectionKey(key)) return notFound()

  const body = await req.json().catch(() => null) as { content?: unknown; action?: unknown } | null
  const content = body?.content
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  if (JSON.stringify(content).length > MAX_CONTENT_CHARS)
    return NextResponse.json({ error: 'This section is too long to save.' }, { status: 413 })
  const action = body?.action === 'complete' || body?.action === 'reopen' ? body.action : 'save'

  // The report must be the user's. RLS answers with no row otherwise. The URL may carry the parent's id (Stage D1b).
  const resolved = await canadaReportIdFor(gate.supabase, urlId)
  if (!resolved.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!resolved.id) return notFound()
  const id = resolved.id
  const { data: report, error: rErr } = await gate.supabase.from('s211_reports')
    .select('id, fl_report_id, company_name, financial_year_end, status').eq('id', id).maybeSingle()
  if (rErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()

  const { data: existing } = await gate.supabase.from('s211_report_sections')
    .select('status').eq('report_id', id).eq('section_key', key).maybeSingle()
  const before = (existing?.status ?? 'not_started') as SectionStatus
  // Offered drafts kept by the user are stored as drafts, still marked (lib/forcedLabour/drafts.ts).
  const c = settleOffered(content as Record<string, unknown>) as Record<string, unknown>

  let status: SectionStatus
  if (action === 'complete') {
    const r = markComplete(key, c)
    if (!r.ok) return NextResponse.json({ error: r.message, missing: r.missing, invalid: r.invalid }, { status: 422 })
    status = 'complete'
  } else if (action === 'reopen') {
    status = 'in_progress'
  } else {
    status = statusAfterEdit(key, before, c)
  }

  // Linking a report saved before the adapter to its parent is a step of its own: harmless if the save
  // below then fails, and done once.
  const parent = await ensureParent(gate.supabase, gate.userId, report as unknown as { id: string })
  if (!parent.ok) return NextResponse.json({ error: 'The section could not be saved.' }, { status: 500 })
  const data = await saveCanadaSection(gate.supabase, id, key, c, status)
  if (!data) return NextResponse.json({ error: 'The section could not be saved.' }, { status: 500 })
  return NextResponse.json({ section: data })
}
