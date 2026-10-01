// app/api/s211/reports/[id]/route.ts
// GET: one report and its sections. PATCH: the report's own columns (the entity-test inputs).
// Gated by lib/s211/server.ts; RLS returns no row for a report the user does not own, which reads as 404.
// Through the shared model (lib/forcedLabour/canadaAdapter.ts): shared answers and the two shared columns
// are read from the Forced Labour tables, and a PATCH writes the shared columns there first.
import { NextResponse } from 'next/server'
import { requireS211, notFound } from '../../../../../lib/s211/server'
import { cleanReportPatch, REPORT_COLUMNS } from '../../../../../lib/s211/reportPatch'
import { overlayReport, overlaySection, withoutLink, sectionsOnlyShared } from '../../../../../lib/forcedLabour/canadaAdapter'
import { SECTION_KEYS } from '../../../../../lib/s211/builderContent'
import { statusAfterEdit } from '../../../../../lib/s211/sectionStatus'
import { loadDraftSources } from '../../../../../lib/forcedLabour/draftStore'
import { withDrafts } from '../../../../../lib/forcedLabour/drafts'
import { canadaFieldsOf } from '../../../../../lib/forcedLabour/canadaAdapter'
import { loadShared, ensureParent, saveSharedColumns, canadaReportIdFor } from '../../../../../lib/forcedLabour/canadaStore'
import type { SectionContent, SectionKey } from '../../../../../lib/s211/builderContent'

/** Fields whose draft the Canada builder writes itself (lib/s211/stepsSummary.ts), never started from another country. */
const STEPS_DRAFT_THEMSELVES = new Set(['steps_summary'])

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'read')
  if (!gate.ok) return gate.response
  const { id: urlId } = await params
  // The URL may carry the Canada report's id or (Stage D1b) its parent's.
  const resolved = await canadaReportIdFor(gate.supabase, urlId)
  if (!resolved.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!resolved.id) return notFound()
  const id = resolved.id
  const { data: report, error } = await gate.supabase.from('s211_reports').select(`${REPORT_COLUMNS}, fl_report_id`).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  if (!report) return notFound()
  const { data: sections, error: sErr } = await gate.supabase.from('s211_report_sections')
    .select('section_key, content, status, updated_at').eq('report_id', id)
  if (sErr) return NextResponse.json({ error: 'The report sections could not be loaded.' }, { status: 500 })
  const row = report as unknown as Record<string, unknown>
  const shared = await loadShared(gate.supabase, row.fl_report_id as string | null)
  if (!shared.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  // Per-country questions Canada has not answered start from another country's answer, as marked drafts
  // (lib/forcedLabour/drafts.ts). None for a Canada-only report. Canada's steps summary drafts itself.
  const sources = await loadDraftSources(gate.supabase, row.id as string, row.fl_report_id as string | null)
  const draft = (k: SectionKey, c: SectionContent) => withDrafts('canada', canadaFieldsOf(k), c, sources, STEPS_DRAFT_THEMSELVES)
  const saved = new Set((sections ?? []).map(s => s.section_key as string))
  const sharedOnly = sectionsOnlyShared(saved, shared.answers, SECTION_KEYS)
  const sharedOnlyKeys = new Set(sharedOnly.map(s => s.section_key as string))
  return NextResponse.json({
    report: withoutLink(overlayReport(row, shared.parent)),
    sections: [
      ...(sections ?? []).map(s => ({ ...s, content: draft(s.section_key as SectionKey, overlaySection(s.section_key as SectionKey, (s.content ?? {}) as SectionContent, shared.answers)) })),
      // Sections Canada has not saved, but another country has answered shared fields of (canadaAdapter.ts).
      ...sharedOnly.map(s => ({ section_key: s.section_key, content: draft(s.section_key, s.content), status: statusAfterEdit(s.section_key, 'not_started', s.content), updated_at: null })),
      // Sections Canada has not saved, with only drafts to offer: not started until the user saves.
      ...SECTION_KEYS.filter(k => !saved.has(k) && !sharedOnlyKeys.has(k))
        .map(k => ({ k, content: draft(k, {} as SectionContent) }))
        .filter(x => Object.keys(x.content).length > 0)
        .map(x => ({ section_key: x.k, content: x.content, status: 'not_started', updated_at: null })),
    ],
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireS211(req, 'write')
  if (!gate.ok) return gate.response
  const { id: urlId } = await params
  const cleaned = cleanReportPatch(await req.json().catch(() => null))
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const resolved = await canadaReportIdFor(gate.supabase, urlId)
  if (!resolved.ok) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!resolved.id) return notFound()
  const id = resolved.id
  const { data: link, error: lErr } = await gate.supabase.from('s211_reports')
    .select('id, fl_report_id, company_name, financial_year_end, status').eq('id', id).maybeSingle()
  if (lErr) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!link) return notFound()
  // The shared store first: a read prefers it (lib/forcedLabour/canadaStore.ts).
  const parent = await ensureParent(gate.supabase, gate.userId, link as unknown as { id: string })
  if (!parent.ok || !(await saveSharedColumns(gate.supabase, parent.flReportId, cleaned.patch)))
    return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  const { data, error } = await gate.supabase.from('s211_reports')
    .update({ ...cleaned.patch, updated_at: new Date().toISOString() }).eq('id', id).select(REPORT_COLUMNS).maybeSingle()
  if (error) return NextResponse.json({ error: 'The report could not be saved.' }, { status: 500 })
  if (!data) return notFound()
  const shared = await loadShared(gate.supabase, parent.flReportId)
  if (!shared.ok) return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 500 })
  return NextResponse.json({ report: withoutLink(overlayReport(data as unknown as Record<string, unknown>, shared.parent)) })
}
