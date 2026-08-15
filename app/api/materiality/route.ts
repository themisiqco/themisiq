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
  runAssessment, regionsWithNoHazardData, ReferenceData, AssessmentInput,
  resolveTopicLabels, isStandardVersion, STANDARD_VERSIONS,
  type StandardVersion, type TopicLabelRow,
} from '../../../lib/materiality'

export async function POST(req: NextRequest) {
  try {
    // ── 1 & 2. Authenticate as the user ──────────────────────────────
    const token = bearerFrom(req)
    const { supabase, userId } = await getAuthedClient(token)

    // ── Parse & validate input ───────────────────────────────────────
    const body = await req.json()

    // standardVersion is a LEGALLY REQUIRED DISCLOSURE (Art. 2(2) of the 2026 delegated act:
    // the undertaking shall state which ESRS version it applied), not an engine input with a
    // sensible default. So it deliberately does NOT follow the coercion habit used just below for
    // assetProfile and horizon — that habit is right for an input that has a defensible default
    // and wrong for a statement about which law was applied.
    //
    // ABSENT and WRONG are different things:
    //   absent  -> null -> the report prints "not stated", which is honest and permitted;
    //   wrong   -> 400. An unrecognised value means the client BELIEVES it stated something.
    //              Silently turning that into null would hide a client defect behind a blank that
    //              looks deliberate, on the one field a verifier is entitled to rely on.
    //
    // ⚠️ THE WIZARD DOES NOT SEND THIS FIELD, and app/dashboard/climate-risk/page.tsx is out of
    // scope for this change (its hardcoded ESRS_TOPICS list still carries 2023 wording, and
    // fixing it needs the wizard to ASK which standard applies first — separate task). So until
    // that lands, EVERY assessment created through the UI takes the absent path: standard_version
    // is NULL and the report prints "not stated". This route makes 2026 topic names POSSIBLE; it
    // does not make them happen. The field must therefore stay OPTIONAL — requiring it here would
    // break the live wizard on deploy.
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
      scenarioCode: body.scenarioCode,
      horizon: ['short', 'medium', 'long'].includes(body.horizon) ? body.horizon : 'medium',
      impactOverrides: body.impactOverrides && typeof body.impactOverrides === 'object'
        ? body.impactOverrides : {},
      standardVersion,
    }
    if (!input.industryCode || !input.scenarioCode) {
      return NextResponse.json({ error: 'industryCode and scenarioCode are required' }, { status: 400 })
    }
    if (input.regionCodes.length === 0) {
      return NextResponse.json({ error: 'Select at least one region' }, { status: 400 })
    }

    // ── 3. Fetch reference data (public-readable; anon client would also work) ──
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
      console.error('Materiality reference fetch error:', firstErr.error)
      return NextResponse.json({ error: 'Failed to load model data' }, { status: 500 })
    }

    // ── Per-version topic LABELS — deliberately OUTSIDE the Promise.all above ──
    // Everything in that array is fatal on error (firstErr -> 500). Topic labels must never be.
    // A label problem must not change whether a topic is assessed, and folding this fetch into
    // that array would 500 requests that need no labels at all (standardVersion === null) the
    // moment this one table had an outage. Tolerant by design.
    //
    // null means the fetch FAILED — a different fact from "returned no rows", and reported as
    // such. They must not be collapsed: [] with no error is ALSO what a dropped RLS policy looks
    // like, so naming a cause we cannot observe would hide a grants regression for months.
    let topicLabelRows: TopicLabelRow[] | null = []
    if (standardVersion) {
      const { data: labelData, error: labelErr } = await supabase
        .from('mr_esrs_topic_labels')
        .select('topic_code,standard_version,label')
        .eq('standard_version', standardVersion)
      if (labelErr) {
        console.error(
          `Materiality: mr_esrs_topic_labels fetch failed for ${standardVersion}; falling back to `
          + 'mr_esrs_topics.label (pre-versioning default). Assessment proceeds.', labelErr,
        )
        topicLabelRows = null
      } else {
        topicLabelRows = labelData ?? []
      }
    }

    // Resolve ONCE, here, at write. The labels are then frozen into `results` for the life of the
    // record — a report reprints the name as it stood when the assessment ran, not whatever the
    // table says later. resolveTopicLabels replaces `label` and nothing else.
    const { topics: labelledTopics, resolution: labelResolution } =
      resolveTopicLabels(esrsTopicsRes.data!, topicLabelRows, standardVersion)

    if (labelResolution.source === 'versioned_partial') {
      // The case that is otherwise invisible: one matrix table carrying two standards' wording.
      console.warn(
        `Materiality: PARTIAL topic-label resolve for ${standardVersion} — `
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
      console.warn('Materiality: regions offered with NO hazard data (report will read "not assessed"):', gapRegions.join(', '))
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
        // NULL is a real value here, not a missing one: it means the version was NOT STATED.
        // Never write a default — Art. 2(2) makes this a disclosure, and an assumed version is
        // worse than an absent one.
        standard_version: standardVersion,
        // disclosure = report-only context (NOT engine inputs). Carried through verbatim so the CSRD
        // report shows what the user supplied — never a default that looks like an answer.
        workings: {
          input, modelVersion: result.modelVersion,
          disclosure: {
            reportingPeriod: typeof body.reportingPeriod === 'string' && body.reportingPeriod.trim() ? body.reportingPeriod.trim() : null,
            legalEntity: typeof body.legalEntity === 'string' && body.legalEntity.trim() ? body.legalEntity.trim() : null,
          },
          // How the topic names above were arrived at. Recorded because a fallback that is
          // invisible is indistinguishable from a correct resolve, and the report states a
          // standard version on its face — an unannounced default would read as that standard's
          // own wording. The report renders a disclosure whenever source !== 'versioned'.
          labelResolution,
        },
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