// app/api/materiality/route.ts
// ThemisIQ — Materiality assessment API route.
//
// Flow:
//   1. Read the user's access token from the Authorization header.
//   2. Build an auth-aware Supabase client (RLS applies as this user).
//   3. Fetch the mr_* reference tables (public-readable).
//   4. Run the pure scoring engine.
//   5. Save the assessment to materiality_assessments (RLS enforces user_id ownership).
//   6. Return the computed result.
//
// Matches the house pattern: POST handler, try/catch, NextResponse.json({error},{status}).

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../lib/supabaseAuthed'
import {
  runAssessment, ReferenceData, AssessmentInput,
} from '../../../lib/materiality'

export async function POST(req: NextRequest) {
  try {
    // ── 1 & 2. Authenticate as the user ──────────────────────────────
    const token = bearerFrom(req)
    const { supabase, userId } = await getAuthedClient(token)

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json()
    const input: AssessmentInput = {
      mode: body.mode === 's2' ? 's2' : 'csrd',
      industryCode: body.industryCode,
      regionCodes: Array.isArray(body.regionCodes) ? body.regionCodes : [],
      jurisdictionCodes: Array.isArray(body.jurisdictionCodes) ? body.jurisdictionCodes : [],
      assetProfile: ['coastal', 'inland', 'water', 'distributed'].includes(body.assetProfile)
        ? body.assetProfile : 'inland',
      scenarioCode: body.scenarioCode,
      horizon: ['short', 'medium', 'long'].includes(body.horizon) ? body.horizon : 'medium',
      impactOverrides: body.impactOverrides && typeof body.impactOverrides === 'object'
        ? body.impactOverrides : {},
    }
    if (!input.industryCode || !input.scenarioCode) {
      return NextResponse.json({ error: 'industryCode and scenarioCode are required' }, { status: 400 })
    }
    if (input.regionCodes.length === 0) {
      return NextResponse.json({ error: 'Select at least one region' }, { status: 400 })
    }

    // ── 3. Fetch reference data (public-readable; anon client would also work) ──
    const [
      configRes, industriesRes, regionHazardsRes, industryHazardsRes,
      jurisdictionsRes, esrsTopicsRes, topicBaselinesRes, scenariosRes,
      opportunitiesRes,
    ] = await Promise.all([
      supabase.from('mr_model_config').select('*').eq('id', 1).single(),
      supabase.from('mr_industries').select('code,label,carbon_exposure'),
      supabase.from('mr_region_hazards').select('region_code,hazard,intensity'),
      supabase.from('mr_industry_hazards').select('industry_code,hazard,sensitivity'),
      supabase.from('mr_jurisdictions').select('code,label,policy_intensity'),
      supabase.from('mr_esrs_topics').select('code,label,category,sort_order'),
      supabase.from('mr_industry_topic_baselines').select('industry_code,topic_code,financial_base,impact_base'),
      supabase.from('mr_scenarios').select('code,label,framework,descriptor,physical_mult,transition_mult'),
      supabase.from('mr_industry_opportunities').select('industry_code,opportunity_category,relevance,sort_order'),
    ])

    const firstErr = [
      configRes, industriesRes, regionHazardsRes, industryHazardsRes,
      jurisdictionsRes, esrsTopicsRes, topicBaselinesRes, scenariosRes,
      opportunitiesRes,
    ].find(r => r.error)
    if (firstErr?.error) {
      console.error('Materiality reference fetch error:', firstErr.error)
      return NextResponse.json({ error: 'Failed to load model data' }, { status: 500 })
    }

    const ref: ReferenceData = {
      config: configRes.data!,
      industries: industriesRes.data!,
      regionHazards: regionHazardsRes.data!,
      industryHazards: industryHazardsRes.data!,
      jurisdictions: jurisdictionsRes.data!,
      esrsTopics: esrsTopicsRes.data!,
      topicBaselines: topicBaselinesRes.data!,
      scenarios: scenariosRes.data!,
      industryOpportunities: opportunitiesRes.data!,
    }

    // ── 4. Run the engine ────────────────────────────────────────────
    const result = runAssessment(input, ref)

    // ── 5. Persist (RLS enforces user_id = auth.uid()) ───────────────
    // user_id defaults to auth.uid() in the table, but we set it explicitly to be safe.
    const { data: saved, error: saveErr } = await supabase
      .from('materiality_assessments')
      .insert({
        user_id: userId,
        company_name: typeof body.companyName === 'string' ? body.companyName : null,
        mode: input.mode,
        industry_code: input.industryCode,
        region_codes: input.regionCodes,
        jurisdiction_codes: input.jurisdictionCodes,
        asset_profile: input.assetProfile,
        scenario_code: input.scenarioCode,
        horizon: input.horizon,
        impact_overrides: input.impactOverrides,
        results: result,
        workings: { input, modelVersion: result.modelVersion },
        model_version: result.modelVersion,
        status: 'complete',
      })
      .select('id')
      .single()

    if (saveErr) {
      console.error('Materiality save error:', saveErr)
      return NextResponse.json({ error: 'Failed to save assessment' }, { status: 500 })
    }

    // ── 6. Return ────────────────────────────────────────────────────
    return NextResponse.json({ success: true, id: saved.id, result })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Materiality route error:', error)
    return NextResponse.json({ error: 'Assessment failed' }, { status: 500 })
  }
}