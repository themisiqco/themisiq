// app/api/materiality/list/route.ts
// ThemisIQ — Saved-assessment list endpoint.
//
// Returns the signed-in user's assessment rows (newest first) so the dashboard
// can show a saved-reports list and link each row back to its report. This
// closes the "view-once" gap: previously a report was only reachable in the
// moment after generation (its id lived only in React state), even though the
// row persists in materiality_assessments.
//
// Additive by design: this is a NEW file in a new /list segment, so it does not
// touch the existing POST in app/api/materiality/route.ts. Same auth and house
// error pattern as /api/materiality/resilience.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'

export async function GET(req: NextRequest) {
  try {
    // ── Authenticate as the user ─────────────────────────────────────
    const token = bearerFrom(req)
    const { supabase, userId } = await getAuthedClient(token)

    // ── Fetch this user's assessments, newest first ──────────────────
    // We pull `results` only to read its analysisType marker; it is NOT
    // returned to the client (the full jsonb payload can be large). Every
    // column selected here is confirmed present from the resilience route's
    // insert and the report page's reads.
    const { data, error } = await supabase
      .from('materiality_assessments')
      .select('id, created_at, mode, industry_code, region_codes, jurisdiction_codes, horizon, scenario_code, model_version, status, company_name, results')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Assessment list error:', error)
      return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
    }

    const assessments = (data ?? []).map((row: any) => ({
      id: row.id,
      createdAt: row.created_at,
      mode: row.mode,
      industryCode: row.industry_code,
      regionCount: Array.isArray(row.region_codes) ? row.region_codes.length : 0,
      jurisdictionCount: Array.isArray(row.jurisdiction_codes) ? row.jurisdiction_codes.length : 0,
      horizon: row.horizon,
      scenarioCode: row.scenario_code,
      modelVersion: row.model_version,
      status: row.status,
      companyName: row.company_name,
      // 'resilience' for resilience records; otherwise a single-scenario
      // CSRD / IFRS S2 assessment. Drives which report URL the row links to.
      analysisType: (row.results && row.results.analysisType) || 'assessment',
    }))

    return NextResponse.json({ assessments })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Assessment list route error:', error)
    return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 })
  }
}
