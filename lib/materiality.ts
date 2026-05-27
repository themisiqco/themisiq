// lib/materiality.ts
// ThemisIQ — Materiality & Scenario Analysis scoring engine.
//
// PURE LOGIC. No Supabase, no auth, no I/O. The API route fetches the reference
// tables and passes them in; this module only computes. Keeping it pure means the
// scoring logic can be tested and audited in isolation — which matters for the
// methodology doc's defensibility story.
//
// Model: physical risk  = industry sensitivity x regional hazard x scenario x horizon
//        transition risk = industry carbon    x jurisdiction policy x scenario x horizon
//        CSRD matrix     = per-ESRS-topic financial score (vertical) x impact score (horizontal)
// E1 (climate) financial score is overridden by the live physical/transition engine.

// ---------- Reference-data shapes (rows from the mr_* tables) ----------
export type ModelConfig = {
  model_version: string
  phys_high: number; phys_med: number
  topic_high: number; topic_med: number
  horizon_short: number; horizon_medium: number; horizon_long: number
}
export type Industry = { code: string; label: string; carbon_exposure: number }
export type RegionHazard = { region_code: string; hazard: string; intensity: number }
export type IndustryHazard = { industry_code: string; hazard: string; sensitivity: number }
export type Jurisdiction = { code: string; label: string; policy_intensity: number }
export type EsrsTopic = { code: string; label: string; category: string; sort_order: number }
export type TopicBaseline = { industry_code: string; topic_code: string; financial_base: number; impact_base: number }
export type Scenario = {
  code: string; label: string; framework: string; descriptor: string | null
  physical_mult: number; transition_mult: number
}

export type ReferenceData = {
  config: ModelConfig
  industries: Industry[]
  regionHazards: RegionHazard[]
  industryHazards: IndustryHazard[]
  jurisdictions: Jurisdiction[]
  esrsTopics: EsrsTopic[]
  topicBaselines: TopicBaseline[]
  scenarios: Scenario[]
}

// ---------- User input ----------
export type AssessmentInput = {
  mode: 's2' | 'csrd'
  industryCode: string
  regionCodes: string[]
  jurisdictionCodes: string[]
  assetProfile: 'coastal' | 'inland' | 'water' | 'distributed'
  scenarioCode: string
  horizon: 'short' | 'medium' | 'long'
  impactOverrides?: Record<string, number>   // topic_code -> 0..10
}

// ---------- Output ----------
export type Band = 'high' | 'med' | 'low'
export type PhysicalRisk = { hazard: string; band: Band; score: number; drivingRegion: string }
export type TransitionRisk = { driver: string; band: Band; score: number }
export type MatrixTopic = {
  code: string; label: string; category: string
  financial: number; impact: number
  financialBand: Band; impactBand: Band
  quadrant: 'both' | 'financial' | 'impact' | 'low'
}
export type AssessmentResult = {
  mode: 's2' | 'csrd'
  modelVersion: string
  physical: PhysicalRisk[]
  transition: TransitionRisk[]
  matrix: MatrixTopic[]            // empty in s2 mode
  climateFinancialScore: number    // 0..10, the E1 financial number from the engine
  summary: { physicalHigh: number; transitionHigh: number; topicsBothAxes: number }
}

const HAZARD_LABELS: Record<string, string> = {
  drought: 'Drought', water: 'Water stress', heat: 'Extreme heat',
  flood: 'Inland flooding', coastal: 'Coastal flooding', wildfire: 'Wildfire',
  cyclone: 'Storms / cyclones', cold: 'Cold / permafrost',
}

// Asset profile modifies hazard exposure within selected regions.
const ASSET_MOD: Record<string, Record<string, number>> = {
  coastal:    { coastal: 1.5, cyclone: 1.3, flood: 1.2 },
  inland:     { heat: 1.2, drought: 1.2, wildfire: 1.2, coastal: 0.3 },
  water:      { water: 1.5, drought: 1.4 },
  distributed:{ coastal: 0.6, flood: 0.8, heat: 0.8, drought: 0.8, water: 0.8, wildfire: 0.8, cyclone: 0.8, cold: 0.8 },
}

function horizonMult(cfg: ModelConfig, h: AssessmentInput['horizon']): number {
  return h === 'short' ? cfg.horizon_short : h === 'long' ? cfg.horizon_long : cfg.horizon_medium
}

// ---------------------------------------------------------------------------
// Physical risk: for each hazard the industry is sensitive to, find the worst
// regional exposure across the selected regions, scale by asset/scenario/horizon.
// ---------------------------------------------------------------------------
function computePhysical(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): PhysicalRisk[] {
  const sens = ref.industryHazards.filter(h => h.industry_code === input.industryCode)
  const hzn = horizonMult(ref.config, input.horizon)
  const assetMod = ASSET_MOD[input.assetProfile] || {}
  const out: PhysicalRisk[] = []

  for (const s of sens) {
    if (s.sensitivity <= 0) continue
    // worst regional intensity for this hazard among selected regions
    let regionExp = 0, driver = ''
    for (const rc of input.regionCodes) {
      const rh = ref.regionHazards.find(r => r.region_code === rc && r.hazard === s.hazard)
      if (rh && rh.intensity > regionExp) { regionExp = rh.intensity; driver = rc }
    }
    if (regionExp === 0) continue   // industry cares, but not exposed in chosen regions

    const score = regionExp * s.sensitivity * (assetMod[s.hazard] ?? 1) * scenario.physical_mult * hzn
    out.push({
      hazard: HAZARD_LABELS[s.hazard] ?? s.hazard,
      band: score >= ref.config.phys_high ? 'high' : score >= ref.config.phys_med ? 'med' : 'low',
      score: Math.round(score * 10) / 10,
      drivingRegion: driver,
    })
  }
  return out.sort((a, b) => b.score - a.score)
}

// ---------------------------------------------------------------------------
// Transition risk: industry carbon exposure x worst jurisdiction policy intensity,
// scaled by scenario policy-speed and horizon. Four standard TCFD-style drivers.
// ---------------------------------------------------------------------------
function computeTransition(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): TransitionRisk[] {
  const ind = ref.industries.find(i => i.code === input.industryCode)
  const carbon = ind?.carbon_exposure ?? 1
  const hzn = horizonMult(ref.config, input.horizon)

  let jurMax = 0
  for (const jc of input.jurisdictionCodes) {
    const j = ref.jurisdictions.find(x => x.code === jc)
    if (j && j.policy_intensity > jurMax) jurMax = j.policy_intensity
  }

  const policyScore = carbon * jurMax * scenario.transition_mult * hzn
  const band = (v: number): Band => v >= 12 ? 'high' : v >= 6 ? 'med' : 'low'

  return [
    { driver: 'Carbon pricing / policy', band: band(policyScore), score: Math.round(policyScore * 10) / 10 },
    { driver: 'Market & demand shift',   band: carbon >= 2 ? (scenario.transition_mult >= 1.3 ? 'high' : 'med') : 'low', score: 0 },
    { driver: 'Technology displacement',  band: carbon >= 3 ? 'high' : carbon >= 2 ? 'med' : 'low', score: 0 },
    { driver: 'Reputation',               band: carbon >= 2 ? 'med' : 'low', score: 0 },
  ]
}

// climate financial materiality (E1) — single 0..10 number from physical + transition.
function climateFinancial(physical: PhysicalRisk[], transition: TransitionRisk[]): number {
  const physMax = physical.reduce((m, p) => Math.max(m, p.score), 0)
  const transMax = Math.max(...transition.map(t => t.score), 0)
  // normalise the raw ordinal-product scores onto 0..10 and take the stronger signal
  const raw = Math.max(physMax * 1.1, transMax * 0.8)
  return Math.max(2, Math.min(10, Math.round(raw * 10) / 10))
}

// ---------------------------------------------------------------------------
// CSRD matrix: each ESRS topic gets a financial and an impact score.
// E1 financial comes from the engine; all others from industry baselines.
// Impact can be overridden by the user's self-assessment.
// ---------------------------------------------------------------------------
function computeMatrix(
  input: AssessmentInput, ref: ReferenceData, climateFin: number
): MatrixTopic[] {
  const baselines = ref.topicBaselines.filter(b => b.industry_code === input.industryCode)
  const topicBand = (v: number): Band =>
    v >= ref.config.topic_high ? 'high' : v >= ref.config.topic_med ? 'med' : 'low'

  return ref.esrsTopics
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(topic => {
      const base = baselines.find(b => b.topic_code === topic.code)
      const financial = topic.code === 'E1' ? climateFin : (base?.financial_base ?? 2)
      const impact = input.impactOverrides?.[topic.code] ?? base?.impact_base ?? 2
      const fBand = topicBand(financial)
      const iBand = topicBand(impact)
      const fMat = financial >= ref.config.topic_med
      const iMat = impact >= ref.config.topic_med
      const quadrant: MatrixTopic['quadrant'] =
        fMat && iMat ? 'both' : fMat ? 'financial' : iMat ? 'impact' : 'low'
      return {
        code: topic.code, label: topic.label, category: topic.category,
        financial: Math.round(financial * 10) / 10, impact: Math.round(impact * 10) / 10,
        financialBand: fBand, impactBand: iBand, quadrant,
      }
    })
}

// ---------------------------------------------------------------------------
// Public entry point.
// ---------------------------------------------------------------------------
export function runAssessment(input: AssessmentInput, ref: ReferenceData): AssessmentResult {
  const scenario = ref.scenarios.find(s => s.code === input.scenarioCode)
  if (!scenario) throw new Error(`Unknown scenario: ${input.scenarioCode}`)
  if (!ref.industries.find(i => i.code === input.industryCode)) {
    throw new Error(`Unknown industry: ${input.industryCode}`)
  }

  const physical = computePhysical(input, ref, scenario)
  const transition = computeTransition(input, ref, scenario)
  const climateFin = climateFinancial(physical, transition)
  const matrix = input.mode === 'csrd' ? computeMatrix(input, ref, climateFin) : []

  return {
    mode: input.mode,
    modelVersion: ref.config.model_version,
    physical,
    transition,
    matrix,
    climateFinancialScore: climateFin,
    summary: {
      physicalHigh: physical.filter(p => p.band === 'high').length,
      transitionHigh: transition.filter(t => t.band === 'high').length,
      topicsBothAxes: matrix.filter(m => m.quadrant === 'both').length,
    },
  }
}
