// lib/forcedLabour/canadaStore.ts
// The database side of the Canada adapter (lib/forcedLabour/canadaAdapter.ts). Server-only. Every call
// goes through the Supabase client the S-211 gate returned, which acts AS the user, so RLS (fl_can_read /
// fl_can_write, and the owner checks) decides what it may see and change, as it does for the S-211 tables.
//
// ⚠️ A SECTION SAVE IS ONE TRANSACTION (saveCanadaSection, through public.fl_save_canada_section): the
// shared answers and the section are written together or not at all. It was two requests until 1 Oct 2026,
// and a failure between them left a new shared value laid over an old section, so a save the route reported
// as failed appeared to have worked.
// ⚠️ A REPORT PATCH IS STILL TWO WRITES: the parent's shared columns first, then s211_reports. A read prefers
// the parent, so if the second write fails the user still sees the change they made, and the route reports
// the failure so the page can try again.
//
// ⚠️ A PARENT IS CREATED ONLY ON A WRITE. A report created before this shipped and not yet backfilled has
// no fl_report_id. Reading it needs nothing from the shared tables (nothing is there for it), and a
// read-only user may not write, so reads never create one; the first save does.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SectionContent, SectionKey } from '../s211/builderContent'
import { sharedAnswersFrom, parentPatchFrom, type ParentRow } from './canadaAdapter'

export type CanadaReportLink = { id: string; fl_report_id?: string | null; company_name?: string; financial_year_end?: string | null; status?: string }

/** The parent and every shared answer, for a linked report. Null parent for an unlinked one. */
export async function loadShared(supabase: SupabaseClient, flReportId: string | null | undefined):
  Promise<{ ok: true; parent: ParentRow | null; answers: Map<string, unknown> } | { ok: false }> {
  if (!flReportId) return { ok: true, parent: null, answers: new Map() }
  const { data: parent, error } = await supabase.from('fl_reports').select('id, organization_name, period_end').eq('id', flReportId).maybeSingle()
  if (error) return { ok: false }
  const { data: rows, error: aErr } = await supabase.from('fl_answers').select('field_key, value').eq('report_id', flReportId)
  if (aErr) return { ok: false }
  return { ok: true, parent: (parent as ParentRow | null) ?? null, answers: new Map((rows ?? []).map(r => [r.field_key as string, r.value])) }
}

/** The user's parents, by id, for the reports list. */
export async function loadParents(supabase: SupabaseClient): Promise<{ ok: true; parents: Map<string, ParentRow> } | { ok: false }> {
  const { data, error } = await supabase.from('fl_reports').select('id, organization_name, period_end')
  if (error) return { ok: false }
  return { ok: true, parents: new Map((data ?? []).map(p => [p.id as string, p as ParentRow])) }
}

/**
 * The report's parent id, creating the parent and its 'canada' row first if the report has none (as
 * 20261001_fl_backfill_canada.sql does). Linking does not touch s211_reports.updated_at. If another save
 * linked the report meanwhile, the parent made here is removed and theirs is used.
 */
export async function ensureParent(supabase: SupabaseClient, userId: string, report: CanadaReportLink): Promise<{ ok: true; flReportId: string } | { ok: false }> {
  if (report.fl_report_id) return { ok: true, flReportId: report.fl_report_id }
  const { data: parent, error } = await supabase.from('fl_reports')
    .insert({ user_id: userId, organization_name: report.company_name, period_end: report.financial_year_end ?? null })
    .select('id').single()
  if (error || !parent) return { ok: false }
  const flReportId = parent.id as string
  const { error: cErr } = await supabase.from('fl_report_countries')
    .insert({ report_id: flReportId, country: 'canada', ...(report.status ? { status: report.status } : {}) })
  if (cErr) { await supabase.from('fl_reports').delete().eq('id', flReportId); return { ok: false } }
  const { data: linked, error: lErr } = await supabase.from('s211_reports')
    .update({ fl_report_id: flReportId }).eq('id', report.id).is('fl_report_id', null).select('id')
  if (lErr) { await supabase.from('fl_reports').delete().eq('id', flReportId); return { ok: false } }
  if (!linked || linked.length === 0) {
    await supabase.from('fl_reports').delete().eq('id', flReportId)
    const { data: again } = await supabase.from('s211_reports').select('fl_report_id').eq('id', report.id).maybeSingle()
    return again?.fl_report_id ? { ok: true, flReportId: again.fl_report_id as string } : { ok: false }
  }
  return { ok: true, flReportId }
}

/** A new report's parent and 'canada' row, made before the report so the report can be inserted linked. */
export async function createParent(supabase: SupabaseClient, userId: string, companyName: string): Promise<{ ok: true; flReportId: string } | { ok: false }> {
  const { data: parent, error } = await supabase.from('fl_reports')
    .insert({ user_id: userId, organization_name: companyName }).select('id').single()
  if (error || !parent) return { ok: false }
  const flReportId = parent.id as string
  const { error: cErr } = await supabase.from('fl_report_countries').insert({ report_id: flReportId, country: 'canada' })
  if (cErr) { await supabase.from('fl_reports').delete().eq('id', flReportId); return { ok: false } }
  return { ok: true, flReportId }
}

/** Removes a parent made for a report that then failed to save. Its 'canada' row goes with it (cascade). */
export async function dropParent(supabase: SupabaseClient, flReportId: string): Promise<void> {
  await supabase.from('fl_reports').delete().eq('id', flReportId)
}

/**
 * Saves a Canada section and its shared answers in ONE transaction, through public.fl_save_canada_section
 * (supabase/migrations/20261001_fl_save_canada_section.sql): the answers it holds are upserted, the shared
 * fields it lacks are deleted, and the whole section is upserted, or none of it is. Security invoker, so
 * RLS decides as for direct writes. Returns the saved section row, or null on any failure.
 */
export async function saveCanadaSection(supabase: SupabaseClient, reportId: string, section: SectionKey, content: SectionContent, status: string):
  Promise<{ section_key: string; content: SectionContent; status: string; updated_at: string } | null> {
  const { upsert, remove } = sharedAnswersFrom(section, content)
  const { data, error } = await supabase.rpc('fl_save_canada_section', {
    p_report_id: reportId, p_section_key: section, p_content: content, p_status: status,
    p_answers: Object.fromEntries(upsert.map(a => [a.field_key, a.value])), p_remove: remove,
  })
  if (error || !data || typeof data !== 'object') return null
  return data as { section_key: string; content: SectionContent; status: string; updated_at: string }
}

/** A report PATCH's shared columns, into the parent. */
export async function saveSharedColumns(supabase: SupabaseClient, flReportId: string, patch: Record<string, unknown>): Promise<boolean> {
  const parentPatch = parentPatchFrom(patch)
  if (Object.keys(parentPatch).length === 0) return true
  const { error } = await supabase.from('fl_reports').update({ ...parentPatch, updated_at: new Date().toISOString() }).eq('id', flReportId)
  return !error
}

/**
 * The Canada report's id for an id in a URL: the Canada report's own id, or (Stage D1b) its parent's, since a report's
 * pages now use the parent's id. Null when neither names a Canada report this user can see.
 */
export async function canadaReportIdFor(supabase: SupabaseClient, id: string): Promise<{ ok: true; id: string | null } | { ok: false }> {
  const { data, error } = await supabase.from('s211_reports').select('id').eq('id', id).maybeSingle()
  if (error) return { ok: false }
  if (data) return { ok: true, id: data.id as string }
  const { data: viaParent, error: e2 } = await supabase.from('s211_reports').select('id').eq('fl_report_id', id).maybeSingle()
  if (e2) return { ok: false }
  return { ok: true, id: (viaParent?.id as string | undefined) ?? null }
}

