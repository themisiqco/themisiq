// lib/forcedLabour/countryGate.ts
// Server-only. The gate every /api/forced-labour route passes: the S-211 gate first (session, then read or
// write access: lib/s211/server.ts), then whether this account may see the country at all.
//
// ⚠️ A 'preview' COUNTRY IS INVISIBLE OUTSIDE THE PREVIEW LIST. lib/forcedLabour/countries.ts marks it; this
// decides it, on the server, from public.s211_has_access() (a row in s211_access), asked as the user. To any
// other account every route for that country answers exactly as for a country that does not exist: 404, no
// state, no name. A 'hidden' country is the same for everyone. If the preview check itself fails, the
// answer is the same 404: a country is never shown on a guess.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireS211, notFound } from '../s211/server'
import { countryByKey, builderCountries, type Country, type CountryKey } from './countries'

export const PREVIEW_FUNCTION = 's211_has_access'

/** Whether the signed-in user is on the preview list. Null when it could not be asked. */
export async function isPreviewAccount(supabase: Pick<SupabaseClient, 'rpc'>): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.rpc(PREVIEW_FUNCTION)
    if (error) return null
    return data === true
  } catch {
    return null
  }
}

/** The countries this account's builder shows. */
export async function visibleCountries(supabase: Pick<SupabaseClient, 'rpc'>): Promise<Country[]> {
  return builderCountries((await isPreviewAccount(supabase)) === true)
}

export async function requireCountry(req: Request, country: string, need: 'read' | 'write'):
  Promise<{ ok: true; supabase: SupabaseClient; userId: string; country: CountryKey } | { ok: false; response: NextResponse }> {
  const gate = await requireS211(req, need)
  if (!gate.ok) return gate
  const c = countryByKey(country)
  if (!c || c.key === 'canada' || c.status === 'hidden') return { ok: false, response: notFound() }
  if (c.status === 'preview' && (await isPreviewAccount(gate.supabase)) !== true) return { ok: false, response: notFound() }
  return { ok: true, supabase: gate.supabase, userId: gate.userId, country: c.key }
}

/**
 * A report by the id in the URL: a Canada report's id (every report so far) or a parent's. The parent id is
 * null for a Canada report saved before the adapter and not yet linked.
 */
export async function resolveReport(supabase: SupabaseClient, id: string):
  Promise<{ ok: true; s211Id: string | null; flReportId: string | null; row: Record<string, unknown> | null } | { ok: false; status: 404 | 500 }> {
  const { data: rep, error } = await supabase.from('s211_reports').select('id, fl_report_id, company_name, financial_year_end, status').eq('id', id).maybeSingle()
  if (error) return { ok: false, status: 500 }
  if (rep) return { ok: true, s211Id: rep.id as string, flReportId: (rep.fl_report_id as string | null) ?? null, row: rep as Record<string, unknown> }
  const { data: parent, error: pErr } = await supabase.from('fl_reports').select('id').eq('id', id).maybeSingle()
  if (pErr) return { ok: false, status: 500 }
  if (parent) {
    // The parent's Canada report, if it has one (Stage D1b: report URLs use the parent's id).
    const { data: ca } = await supabase.from('s211_reports').select('id, fl_report_id, company_name, financial_year_end, status').eq('fl_report_id', parent.id).maybeSingle()
    return { ok: true, s211Id: (ca?.id as string | undefined) ?? null, flReportId: parent.id as string, row: (ca as Record<string, unknown> | null) ?? null }
  }
  return { ok: false, status: 404 }
}
