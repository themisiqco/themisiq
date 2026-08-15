// app/api/materiality/resilience/route.ts
// ThemisIQ — Multi-scenario resilience analysis API route.
//
// Runs the fixed diverse trio (IFRS S2 / TCFD scenario analysis) and the
// rules-based resilience synthesis, then persists the analysis to
// materiality_assessments (results jsonb, marked analysisType:'resilience').
//
// Mirrors /api/materiality: same auth, same reference-table fetch, same house
// error pattern. Separate route because the result shape (ResilienceResult)
// differs from a single-scenario AssessmentResult.

import { NextRequest, NextResponse } from 'next/server'
import { getAuthedClient, bearerFrom, AuthError } from '../../../../lib/supabaseAuthed'
import {
  runResilience, regionsWithNoHazardData, ReferenceData, AssessmentInput,
  resolveTopicLabels, isStandardVersion, STANDARD_VERSIONS,
  type StandardVersion, type TopicLabelRow,
} from '../../../../lib/materiality'

export async function POST(req: NextRequest) {
  try {
    // ── Authenticate as the user ─────────────────────────────────────
    const token = bearerFrom(req)
    const { supabase, userId } = await getAuthedClient(token)

    // ── Parse & validate input (same shape as a single assessment;
    //    scenarioCode is ignored — the trio is fixed — but kept for parity) ──
    const body = await req.json()

    // Same contract as /api/materiality — see the long note there. In short: standardVersion is a
    // legally required disclosure (Art. 2(2)), so it is NOT coerced like assetProfile/horizon.
    // Absent -> null -> "not stated" (honest). Unrecognised -> 400 (the client believes it stated
    // something, and a silent null would hide that). The wizard does not send it, so today every
    // record takes the absent path.
    const rawStandardVersion = body.standardVersion
    let standardVersion: StandardVersion | null = null
    if (rawStandardVersion != null && rawStandardVersion !== '') {
      if (!isStandardVersion(rawStandardVersion)) {
        return NextResponse.json({
          error: `Unrecognised standardVersion "${String(rawStandardVersion).slice(0, 40)}". `
            + `Expected one of: ${STANDARD_VERSIONS.join(', ')} — or omit the field entirely to record it as not stated.`,
        }, { status: 400 })
      }
      standardVersion = rawStandardVersion
    }

    const input: AssessmentInput = {
      mode: body.mode === 's2' ? 's2' : 'csrd',
      industryCode: body.industryCode,
      regionCodes: Array.isArray(body.regionCodes) ? body.regionCodes : [],
      jurisdictionCodes: Array.isArray(body.jurisdictionCodes) ? body.jurisdictionCodes : [],
      assetProfile: ['coastal', 'inland', 'water', 'distributed'].includes(body.assetProfile)
        ? body.assetProfile : 'inland',
      scenarioCode: 'ssp245',   // the trio is fixed; middle scenario stored for the record
      horizon: ['short', 'medium', 'long'].includes(body.horizon) ? body.horizon : 'medium',
      impactOverrides: body.impactOverrides && typeof body.impactOverrides === 'object'
        ? body.impactOverrides : {},
      standardVersion,
    }
    if (!input.industryCode) {
      return NextResponse.json({ error: 'industryCode is required' }, { status: 400 })
    }
    if (input.regionCodes.length === 0) {
      return NextResponse.json({ error: 'Select at least one region' }, { status: 400 })
    }

    // ── Fetch reference data (public-readable) ───────────────────────
    const [
      configRes, industriesRes, regionsRes, regionHazardsRes, industryHazardsRes,
      jurisdictionsRes, esrsTopicsRes, topicBaselinesRes, scenariosRes,
      opportunitiesRes, transitionDriversRes,
    ] = await Promise.all([
      supabase.from('mr_model_config').select('*').eq('id', 1).single(),
      supabase.from('mr_industries').select('code,label,carbon_exposure,provenance,source_ref'),
      supabase.from('mr_regions').select('code,label,continent,sort_order').eq('active', true).order('sort_order'),
      supabase.from('mr_region_hazards').select('region_code,hazard,intensity,provenance,source_ref'),
      supabase.from('mr_industry_hazards').select('industry_code,hazard,sensitivity,provenance,source_ref'),
      supabase.from('mr_jurisdictions').select('code,label,policy_intensity,provenance,source_ref'),
      supabase.from('mr_esrs_topics').select('code,label,category,sort_order'),
      supabase.from('mr_industry_topic_baselines').select('industry_code,topic_code,financial_base,impact_base,provenance,source_ref'),
      supabase.from('mr_scenarios').select('code,label,framework,descriptor,physical_mult,transition_mult,provenance,source_ref'),
      supabase.from('mr_industry_opportunities').select('industry_code,opportunity_category,relevance,sort_order,provenance,source_ref'),
      supabase.from('mr_industry_transition_drivers').select('industry_code,transition_driver,weight,sort_order,provenance,source_ref'),
    ])

    const firstErr = [
      configRes, industriesRes, regionsRes, regionHazardsRes, industryHazardsRes,
      jurisdictionsRes, esrsTopicsRes, topicBaselinesRes, scenariosRes,
      opportunitiesRes, transitionDriversRes,
    ].find(r => r.error)
    if (firstErr?.error) {
      console.error('Resilience reference fetch error:', firstErr.error)
      return NextResponse.json({ error: 'Failed to load model data' }, { status: 500 })
    }

    // ── Per-version topic LABELS — deliberately OUTSIDE the Promise.all above ──
    // Same reasoning as /api/materiality: everything in that array is fatal on error, and a
    // topic-label problem must never be. It must not decide whether an assessment runs.
    // null = the fetch FAILED, which is a different fact from "no rows" and is reported as such.
    let topicLabelRows: TopicLabelRow[] | null = []
    if (standardVersion) {
      const { data: labelData, error: labelErr } = await supabase
        .from('mr_esrs_topic_labels')
        .select('topic_code,standard_version,label')
        .eq('standard_version', standardVersion)
      if (labelErr) {
        console.error(
          `Resilience: mr_esrs_topic_labels fetch failed for ${standardVersion}; falling back to `
          + 'mr_esrs_topics.label (pre-versioning default). Analysis proceeds.', labelErr,
        )
        topicLabelRows = null
      } else {
        topicLabelRows = labelData ?? []
      }
    }

    // Applied here for parity with /api/materiality even though runResilience does not build a
    // topic matrix today: the record still stores standard_version and labelResolution, so the
    // two routes cannot drift, and any future resilience surface that does name a topic gets the
    // right one without a second plumbing pass.
    const { topics: labelledTopics, resolution: labelResolution } =
      resolveTopicLabels(esrsTopicsRes.data!, topicLabelRows, standardVersion)

    if (labelResolution.source === 'versioned_partial') {
      console.warn(
        `Resilience: PARTIAL topic-label resolve for ${standardVersion} — `
        + `${labelResolution.resolved}/${labelledTopics.length} versioned, `
        + `fell back on: ${labelResolution.fallbackTopics.join(', ')}`,
      )
    }

    const ref: ReferenceData = {
      config: configRes.data!,
      industries: industriesRes.data!,
      regions: regionsRes.data!,
      regionHazards: regionHazardsRes.data!,
      industryHazards: industryHazardsRes.data!,
      jurisdictions: jurisdictionsRes.data!,
      esrsTopics: labelledTopics,
      topicBaselines: topicBaselinesRes.data!,
      scenarios: scenariosRes.data!,
      industryOpportunities: opportunitiesRes.data!,
      industryTransitionDrivers: transitionDriversRes.data!,
    }

    // Visibility guard (non-blocking): flag any offered region with zero hazard data, so a report
    // full of "not assessed" hazards is a known gap rather than a surprise. See regionsWithNoHazardData.
    const gapRegions = regionsWithNoHazardData(ref)
    if (gapRegions.length) {
      console.warn('Resilience: regions offered with NO hazard data (report will read "not assessed"):', gapRegions.join(', '))
    }

    // ── Run the resilience analysis ──────────────────────────────────
    const resilience = runResilience(input, ref)

    // ── Persist (results jsonb carries the full ResilienceResult + marker) ──
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
        results: { analysisType: 'resilience', resilience },
        // NULL means NOT STATED, not missing. Never write a default — Art. 2(2) makes this a
        // disclosure, and an assumed version is worse than an absent one.
        standard_version: standardVersion,
        // disclosure = report-only context (NOT engine inputs, so deliberately outside AssessmentInput).
        // Carried through verbatim so the report shows what the user actually supplied — never a default.
        workings: {
          input, modelVersion: resilience.modelVersion, analysisType: 'resilience',
          disclosure: {
            reportingPeriod: typeof body.reportingPeriod === 'string' && body.reportingPeriod.trim() ? body.reportingPeriod.trim() : null,
            legalEntity: typeof body.legalEntity === 'string' && body.legalEntity.trim() ? body.legalEntity.trim() : null,
          },
          // See /api/materiality for why this is recorded rather than inferred.
          labelResolution,
        },
        model_version: resilience.modelVersion,
        status: 'complete',
      })
      .select('id')
      .single()

    if (saveErr) {
      console.error('Resilience save error:', saveErr)
      return NextResponse.json({ error: 'Failed to save analysis' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: saved.id, resilience })

  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 })
    }
    console.error('Resilience route error:', error)
    return NextResponse.json({ error: 'Resilience analysis failed' }, { status: 500 })
  }
}