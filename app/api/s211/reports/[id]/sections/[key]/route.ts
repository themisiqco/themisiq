// app/api/s211/reports/[id]/sections/[key]/route.ts
// PUT: save one section's answers. Body: { content, action?: 'save' | 'complete' | 'reopen' }.
//
// THE STATUS IS DECIDED HERE, NOT BY THE BROWSER. A save moves it by statusAfterEdit(); "complete" is
// accepted only if markComplete() finds no empty required field, and is otherwise refused with a 422
// naming the fields; "reopen" returns a complete section to in progress. So a section cannot be stored
// as complete with a required field empty, whatever the client sends.
//
// Gated by lib/s211/server.ts. The report must exist and belong to the user (RLS): otherwise 404.
import { NextResponse } from 'next/server'
import { requireS211, notFound, MAX_CONTENT_CHARS } from '../../../../../../../lib/s211/server'
import { isSectionKey } from '../../../../../../../lib/s211/builderContent'
import { statusAfterEdit, markComplete, type SectionStatus } from '../../../../../../../lib/s211/sectionStatus'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; key: string }> }) {
  const gate = await requireS211(req)
  if (!gate.ok) return gate.response
  const { id, key } = await params
  if (!isSectionKey(key)) return notFound()

  const body = await req.json().catch(() => null) as { content?: unknown; action?: unknown } | null
  const content = body?.content
  if (!content || typeof content !== 'object' || Array.isArray(content))
    return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })
  if (JSON.stringify(content).length > MAX_CONTENT_CHARS)
    return NextResponse.json({ error: 'This section is too long to save.' }, { status: 413 })
  const action = body?.action === 'complete' || body?.action === 'reopen' ? body.action : 'save'

  // The report must be the user's. RLS answers with no row otherwise.
  const { data: report, error: rErr } = await gate.supabase.from('s211_reports').select('id').eq('id', id).maybeSingle()
  if (rErr) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()

  const { data: existing } = await gate.supabase.from('s211_report_sections')
    .select('status').eq('report_id', id).eq('section_key', key).maybeSingle()
  const before = (existing?.status ?? 'not_started') as SectionStatus
  const c = content as Record<string, unknown>

  let status: SectionStatus
  if (action === 'complete') {
    const r = markComplete(key, c)
    if (!r.ok) return NextResponse.json({ error: r.message, missing: r.missing }, { status: 422 })
    status = 'complete'
  } else if (action === 'reopen') {
    status = 'in_progress'
  } else {
    status = statusAfterEdit(key, before, c)
  }

  const updated_at = new Date().toISOString()
  const { data, error } = await gate.supabase.from('s211_report_sections')
    .upsert({ report_id: id, section_key: key, content: c, status, updated_at }, { onConflict: 'report_id,section_key' })
    .select('section_key, content, status, updated_at').single()
  if (error || !data) return NextResponse.json({ error: 'The section could not be saved.' }, { status: 500 })
  await gate.supabase.from('s211_reports').update({ updated_at }).eq('id', id)
  return NextResponse.json({ section: data })
}
