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
//        opportunities   = industry relevance x scenario link (TCFD five categories)
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
export type IndustryOpportunity = { industry_code: string; opportunity_category: string; relevance: number; sort_order: number }
export type IndustryTransitionDriver = { industry_code: string; transition_driver: string; weight: number; sort_order: number }
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
  industryOpportunities: IndustryOpportunity[]
  industryTransitionDrivers: IndustryTransitionDriver[]
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
export type Opportunity = { category: string; label: string; band: Band; relevance: number }
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
  opportunities: Opportunity[]
  matrix: MatrixTopic[]            // empty in s2 mode
  climateFinancialScore: number    // 0..10, the E1 financial number from the engine
  summary: { physicalHigh: number; transitionHigh: number; topicsBothAxes: number; opportunitiesStrong: number }
}

const HAZARD_LABELS: Record<string, string> = {
  drought: 'Drought', water: 'Water stress', heat: 'Extreme heat',
  flood: 'Inland flooding', coastal: 'Coastal flooding', wildfire: 'Wildfire',
  cyclone: 'Storms / cyclones', cold: 'Cold / permafrost',
}

const OPPORTUNITY_LABELS: Record<string, string> = {
  resource_efficiency: 'Resource efficiency',
  energy_source: 'Energy source',
  products_services: 'Products & services',
  markets: 'Markets',
  resilience: 'Resilience',
}

const OPP_SCENARIO_LINK: Record<string, 'transition' | 'physical' | 'neutral'> = {
  resource_efficiency: 'neutral',
  energy_source: 'transition',
  products_services: 'transition',
  markets: 'transition',
  resilience: 'physical',
}

const ASSET_MOD: Record<string, Record<string, number>> = {
  coastal:    { coastal: 1.5, cyclone: 1.3, flood: 1.2 },
  inland:     { heat: 1.2, drought: 1.2, wildfire: 1.2, coastal: 0.3 },
  water:      { water: 1.5, drought: 1.4 },
  distributed:{ coastal: 0.6, flood: 0.8, heat: 0.8, drought: 0.8, water: 0.8, wildfire: 0.8, cyclone: 0.8, cold: 0.8 },
}

function horizonMult(cfg: ModelConfig, h: AssessmentInput['horizon']): number {
  return h === 'short' ? cfg.horizon_short : h === 'long' ? cfg.horizon_long : cfg.horizon_medium
}

function computePhysical(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): PhysicalRisk[] {
  const sens = ref.industryHazards.filter(h => h.industry_code === input.industryCode)
  const hzn = horizonMult(ref.config, input.horizon)
  const assetMod = ASSET_MOD[input.assetProfile] || {}
  const out: PhysicalRisk[] = []
  for (const s of sens) {
    if (s.sensitivity <= 0) continue
    let regionExp = 0, driver = ''
    for (const rc of input.regionCodes) {
      const rh = ref.regionHazards.find(r => r.region_code === rc && r.hazard === s.hazard)
      if (rh && rh.intensity > regionExp) { regionExp = rh.intensity; driver = rc }
    }
    if (regionExp === 0) continue
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

// New computeTransition — all four drivers real, sector-weighted, scenario-varying.
// Reads per-sector weights from mr_industry_transition_drivers (0-3 ordinal,
// mapped to multiplier weight/2). Policy keeps jurisdiction scaling; the other
// three are carbon x weight x scenario x horizon. TCFD/IFRS S2 do not prescribe
// weights; these are disclosed sector-level defaults (see assumptions register).
// Band thresholds differ by driver because policy carries an extra jurisdiction
// factor (range ~0-26) while the other three do not (range ~0-9).
function computeTransition(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): TransitionRisk[] {
  const ind = ref.industries.find(i => i.code === input.industryCode)
  const carbon = ind?.carbon_exposure ?? 1
  const hzn = horizonMult(ref.config, input.horizon)

  let jurMax = 0
  for (const jc of input.jurisdictionCodes) {
    const j = ref.jurisdictions.find(x => x.code === jc)
    if (j && j.policy_intensity > jurMax) jurMax = j.policy_intensity
  }

  // per-sector driver weights (0-3 ordinal -> weight/2 multiplier).
  // Fallback to neutral (ordinal 2 -> 1.0) if a sector row is missing.
  const weights = (ref.industryTransitionDrivers ?? []).filter(d => d.industry_code === input.industryCode)
  const wOf = (driver: string): number => {
    const row = weights.find(d => d.transition_driver === driver)
    return (row ? row.weight : 2) / 2
  }

  const round1 = (v: number) => Math.round(v * 10) / 10
  // Policy is jurisdiction-scaled (larger range); the other three are not.
  const policyBand = (v: number): Band => v >= 12 ? 'high' : v >= 6 ? 'med' : 'low'
  const driverBand = (v: number): Band => v >= 4 ? 'high' : v >= 2 ? 'med' : 'low'

  // Policy / legal: carbon x weight x jurisdiction intensity x scenario x horizon
  const policyScore = carbon * wOf('policy') * jurMax * scenario.transition_mult * hzn
  // Other three: carbon x weight x scenario x horizon
  const techScore   = carbon * wOf('technology') * scenario.transition_mult * hzn
  const marketScore = carbon * wOf('market')     * scenario.transition_mult * hzn
  const repScore    = carbon * wOf('reputation') * scenario.transition_mult * hzn

  return [
    { driver: 'Carbon pricing / policy', band: policyBand(policyScore), score: round1(policyScore) },
    { driver: 'Market & demand shift',   band: driverBand(marketScore), score: round1(marketScore) },
    { driver: 'Technology displacement', band: driverBand(techScore),   score: round1(techScore) },
    { driver: 'Reputation',              band: driverBand(repScore),    score: round1(repScore) },
  ]
}

function computeOpportunities(input: AssessmentInput, ref: ReferenceData, scenario: Scenario): Opportunity[] {
  const rows = (ref.industryOpportunities ?? [])
    .filter(o => o.industry_code === input.industryCode)
    .sort((a, b) => a.sort_order - b.sort_order)
  const out: Opportunity[] = []
  for (const o of rows) {
    if (o.relevance <= 0) continue
    const link = OPP_SCENARIO_LINK[o.opportunity_category] ?? 'neutral'
    const mult = link === 'transition' ? scenario.transition_mult
               : link === 'physical'   ? scenario.physical_mult
               : 1
    const score = o.relevance * mult
    out.push({
      category: o.opportunity_category,
      label: OPPORTUNITY_LABELS[o.opportunity_category] ?? o.opportunity_category,
      band: score >= 3.5 ? 'high' : score >= 2 ? 'med' : 'low',
      relevance: Math.round(score * 10) / 10,
    })
  }
  return out
}

function climateFinancial(physical: PhysicalRisk[], transition: TransitionRisk[]): number {
  const physMax = physical.reduce((m, p) => Math.max(m, p.score), 0)
  const transMax = Math.max(...transition.map(t => t.score), 0)
  const raw = Math.max(physMax * 1.1, transMax * 0.8)
  return Math.max(2, Math.min(10, Math.round(raw * 10) / 10))
}

function computeMatrix(input: AssessmentInput, ref: ReferenceData, climateFin: number): MatrixTopic[] {
  const baselines = ref.topicBaselines.filter(b => b.industry_code === input.industryCode)
  const topicBand = (v: number): Band =>
    v >= ref.config.topic_high ? 'high' : v >= ref.config.topic_med ? 'med' : 'low'
  return ref.esrsTopics.slice().sort((a, b) => a.sort_order - b.sort_order).map(topic => {
    const base = baselines.find(b => b.topic_code === topic.code)
    const financial = topic.code === 'E1' ? climateFin : (base?.financial_base ?? 2)
    const impact = input.impactOverrides?.[topic.code] ?? base?.impact_base ?? 2
    const fBand = topicBand(financial)
    const iBand = topicBand(impact)
    const fMat = financial >= ref.config.topic_med
    const iMat = impact >= ref.config.topic_med
    const quadrant: MatrixTopic['quadrant'] = fMat && iMat ? 'both' : fMat ? 'financial' : iMat ? 'impact' : 'low'
    return {
      code: topic.code, label: topic.label, category: topic.category,
      financial: Math.round(financial * 10) / 10, impact: Math.round(impact * 10) / 10,
      financialBand: fBand, impactBand: iBand, quadrant,
    }
  })
}

export function runAssessment(input: AssessmentInput, ref: ReferenceData): AssessmentResult {
  const scenario = ref.scenarios.find(s => s.code === input.scenarioCode)
  if (!scenario) throw new Error(`Unknown scenario: ${input.scenarioCode}`)
  if (!ref.industries.find(i => i.code === input.industryCode)) {
    throw new Error(`Unknown industry: ${input.industryCode}`)
  }
  const physical = computePhysical(input, ref, scenario)
  const transition = computeTransition(input, ref, scenario)
  const opportunities = computeOpportunities(input, ref, scenario)
  const climateFin = climateFinancial(physical, transition)
  const matrix = input.mode === 'csrd' ? computeMatrix(input, ref, climateFin) : []
  return {
    mode: input.mode, modelVersion: ref.config.model_version,
    physical, transition, opportunities, matrix, climateFinancialScore: climateFin,
    summary: {
      physicalHigh: physical.filter(p => p.band === 'high').length,
      transitionHigh: transition.filter(t => t.band === 'high').length,
      topicsBothAxes: matrix.filter(m => m.quadrant === 'both').length,
      opportunitiesStrong: opportunities.filter(o => o.band === 'high').length,
    },
  }
}

// ===========================================================================
// MULTI-SCENARIO RESILIENCE ANALYSIS  (Stage 1 — engine)
// ---------------------------------------------------------------------------
// IFRS S2 / TCFD require scenario analysis across a DIVERSE range of scenarios
// (including a Paris-aligned one) AND a resilience CONCLUSION — not just running
// scenarios. This module runs the fixed diverse trio, compares the per-item
// profile across them, classifies each item, checks horizon sensitivity, and
// produces a transparent rules-based resilience synthesis.
//
// All logic here is rules-based and traces to the underlying scores — nothing
// is free-text generated — so every statement is auditable.
// ===========================================================================

// The fixed diverse trio (all-SSP for a clean monotonic warming range; each SSP
// carries both physical_mult and transition_mult so the engine treats them
// uniformly). Paris-aligned scenario is included by construction (ssp126),
// satisfying IFRS S2's explicit "latest international agreement" requirement.
export const RESILIENCE_TRIO = [
  { code: 'ssp126', role: 'paris',  label: 'Paris-aligned',     warming: '~1.8°C', source: 'IPCC AR6 (SSP1-2.6)' },
  { code: 'ssp245', role: 'middle', label: 'Current trajectory', warming: '~2.7°C', source: 'IPCC AR6 (SSP2-4.5)' },
  { code: 'ssp585', role: 'high',   label: 'High warming',       warming: '~4.4°C', source: 'IPCC AR6 (SSP5-8.5)' },
] as const

export type ResilienceRole = 'paris' | 'middle' | 'high'
export type ItemKind = 'physical' | 'transition' | 'opportunity'
export type Classification = 'persistent' | 'warming-contingent' | 'policy-path-contingent' | 'low-across-futures'

// One cell of the comparison grid: an item's band+score under one scenario.
export type ScenarioCell = { role: ResilienceRole; scenarioCode: string; band: Band; score: number }

// A row across all three scenarios for a single item, plus its classification,
// driver, time-horizon read, and the templated interpretation sentence.
export type ResilienceItem = {
  kind: ItemKind
  key: string                 // hazard / driver / opportunity category — stable identity
  label: string
  driver: string              // what produces it: region (physical) / 'policy intensity' (transition) / scenario link (opp)
  cells: ScenarioCell[]       // one per trio member, in trio order
  classification: Classification
  horizonTrend: 'rises' | 'stable'   // does it worsen toward 2050 (long vs short on middle scenario)
  interpretation: string      // templated, rules-derived
}

export type ResilienceSynthesis = {
  robustExposures: string[]              // material under ALL scenarios — priorities
  warmingContingent: string[]            // worse under high-warming
  policyContingent: string[]             // worse under Paris-aligned (rapid policy)
  twoChannel: 'both' | 'transition-led' | 'physical-led' | 'limited'
  profileSwing: { parisRiskCount: number; highRiskCount: number; swing: number; magnitude: 'limited' | 'moderate' | 'large' }
  horizonNote: 'worsens' | 'stable'
  statement: string                      // assembled qualitative resilience read
}

export type ResilienceResult = {
  modelVersion: string
  trio: { role: ResilienceRole; scenarioCode: string; label: string; warming: string; source: string }[]
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[]
  items: ResilienceItem[]
  synthesis: ResilienceSynthesis
}

// Band → ordinal for comparisons.
function bandRank(b: Band): number { return b === 'high' ? 2 : b === 'med' ? 1 : 0 }

// Collect the per-item cells for a given kind across the three scenario results.
function collectItems(
  kind: ItemKind,
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[],
): Map<string, { label: string; driver: string; cells: ScenarioCell[] }> {
  const map = new Map<string, { label: string; driver: string; cells: ScenarioCell[] }>()
  for (const ps of perScenario) {
    let rows: { key: string; label: string; driver: string; band: Band; score: number }[] = []
    if (kind === 'physical') {
      rows = ps.result.physical.map(p => ({ key: p.hazard, label: p.hazard, driver: p.drivingRegion, band: p.band, score: p.score }))
    } else if (kind === 'transition') {
      rows = ps.result.transition.map(t => ({ key: t.driver, label: t.driver, driver: 'policy intensity', band: t.band, score: t.score }))
    } else {
      rows = ps.result.opportunities.map(o => ({ key: o.category, label: o.label, driver: OPP_SCENARIO_LINK[o.category] ?? 'neutral', band: o.band, score: o.relevance }))
    }
    for (const r of rows) {
      if (!map.has(r.key)) map.set(r.key, { label: r.label, driver: r.driver, cells: [] })
      map.get(r.key)!.cells.push({ role: ps.role, scenarioCode: ps.scenarioCode, band: r.band, score: r.score })
    }
  }
  return map
}

// Classify an item from its cells (paris vs high comparison + persistence).
function classify(kind: ItemKind, cells: ScenarioCell[]): Classification {
  const get = (role: ResilienceRole) => cells.find(c => c.role === role)
  const paris = get('paris'), mid = get('middle'), high = get('high')
  const ranks = [paris, mid, high].map(c => c ? bandRank(c.band) : 0)
  const materialEverywhere = ranks.every(r => r >= 1)   // med+ under all
  const materialAnywhere = ranks.some(r => r >= 1)
  if (!materialAnywhere) return 'low-across-futures'
  if (materialEverywhere) return 'persistent'
  const pr = paris ? bandRank(paris.band) : 0
  const hr = high ? bandRank(high.band) : 0
  // worse under high-warming → warming-contingent (physical pressure)
  // worse under paris-aligned → policy-path-contingent (rapid transition pressure)
  if (hr > pr) return 'warming-contingent'
  if (pr > hr) return 'policy-path-contingent'
  // equal but not everywhere material — treat by kind's dominant channel
  return kind === 'physical' ? 'warming-contingent' : 'policy-path-contingent'
}

// Templated, rules-derived interpretation sentence for one item.
function interpret(kind: ItemKind, label: string, cls: Classification, cells: ScenarioCell[]): string {
  const get = (role: ResilienceRole) => cells.find(c => c.role === role)
  const bandWord = (b?: Band) => b === 'high' ? 'high' : b === 'med' ? 'moderate' : 'low'
  const paris = get('paris'), high = get('high')
  const upside = kind === 'opportunity'
  switch (cls) {
    case 'persistent':
      return upside
        ? `${label}: relevant across all three futures — a robust opportunity that does not depend on the policy path.`
        : `${label}: material across all three futures — a robust exposure that warrants attention regardless of how policy or warming unfolds.`
    case 'warming-contingent':
      return upside
        ? `${label}: strengthens under higher-warming futures (${bandWord(high?.band)} at ~4.4°C vs ${bandWord(paris?.band)} at ~1.8°C).`
        : `${label}: rises with warming — ${bandWord(high?.band)} under the high-warming pathway vs ${bandWord(paris?.band)} under the Paris-aligned one. Exposure is driven by physical climate change.`
    case 'policy-path-contingent':
      return upside
        ? `${label}: strengthens under faster-transition futures (${bandWord(paris?.band)} under the Paris-aligned pathway), i.e. it is unlocked by rapid decarbonisation.`
        : `${label}: ${bandWord(paris?.band)} under the Paris-aligned pathway vs ${bandWord(high?.band)} under high warming. Exposure is to the speed of decarbonisation policy, not to warming itself.`
    default:
      return `${label}: low across all three futures.`
  }
}

// ---------------------------------------------------------------------------
// computeResilience — the four-rule synthesis over the trio's per-item rows.
// ---------------------------------------------------------------------------
function computeResilience(
  perScenario: { role: ResilienceRole; scenarioCode: string; result: AssessmentResult }[],
  horizonTrend: 'rises' | 'stable',
): { items: ResilienceItem[]; synthesis: ResilienceSynthesis } {
  const items: ResilienceItem[] = []

  for (const kind of ['physical', 'transition', 'opportunity'] as ItemKind[]) {
    const collected = collectItems(kind, perScenario)
    for (const [key, v] of collected) {
      const cls = classify(kind, v.cells)
      items.push({
        kind, key, label: v.label, driver: v.driver, cells: v.cells,
        classification: cls,
        horizonTrend,
        interpretation: interpret(kind, v.label, cls, v.cells),
      })
    }
  }

  // Rule 1 — robust (persistent) RISK exposures are the priorities.
  const robustExposures = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'persistent')
    .map(i => i.label)

  // Rule 2 — scenario-contingent risk exposures, grouped by driving future.
  const warmingContingent = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'warming-contingent')
    .map(i => i.label)
  const policyContingent = items
    .filter(i => i.kind !== 'opportunity' && i.classification === 'policy-path-contingent')
    .map(i => i.label)

  // Rule 4 — two-channel check: is the entity stressed under physical-led and/or
  // transition-led futures? Count material risks at each end of the trio.
  const riskAt = (role: ResilienceRole) => perScenario.find(p => p.role === role)?.result
  const matCount = (r?: AssessmentResult) =>
    r ? r.physical.filter(p => bandRank(p.band) >= 1).length + r.transition.filter(t => bandRank(t.band) >= 1).length : 0
  const parisRiskCount = matCount(riskAt('paris'))
  const highRiskCount = matCount(riskAt('high'))
  const transitionLed = parisRiskCount >= 2          // material risk persists even at the low-warming/rapid-policy end
  const physicalLed = highRiskCount > parisRiskCount  // risk grows toward high warming
  const twoChannel: ResilienceSynthesis['twoChannel'] =
    transitionLed && physicalLed ? 'both'
      : physicalLed ? 'physical-led'
      : transitionLed ? 'transition-led'
      : 'limited'

  // Rule 3 — profile swing: how much the risk count moves paris→high.
  const swing = Math.abs(highRiskCount - parisRiskCount)
  const magnitude: ResilienceSynthesis['profileSwing']['magnitude'] =
    swing <= 1 ? 'limited' : swing <= 3 ? 'moderate' : 'large'

  // Assemble the qualitative statement from the rule outputs.
  const parts: string[] = []
  if (robustExposures.length) {
    parts.push(`Across all three futures, ${joinList(robustExposures)} ${robustExposures.length === 1 ? 'remains a' : 'remain'} material risk — ${robustExposures.length === 1 ? 'a robust exposure' : 'robust exposures'} that warrant attention regardless of the policy path.`)
  } else {
    parts.push(`No single risk is material across all three futures, indicating exposures are scenario-dependent rather than structural.`)
  }
  if (warmingContingent.length) parts.push(`${joinList(warmingContingent)} ${warmingContingent.length === 1 ? 'rises' : 'rise'} with warming, biting hardest under the high-warming pathway (physical-risk driven).`)
  if (policyContingent.length) parts.push(`${joinList(policyContingent)} ${policyContingent.length === 1 ? 'is' : 'are'} most material under the Paris-aligned pathway, indicating sensitivity to the speed of decarbonisation policy rather than to warming itself.`)
  parts.push(
    twoChannel === 'both' ? `The business faces meaningful stress under both transition-led and physical-led futures — resilience requires preparing for either.`
    : twoChannel === 'physical-led' ? `Stress is concentrated in higher-warming (physical-risk) futures.`
    : twoChannel === 'transition-led' ? `Stress is concentrated in rapid-policy (transition-risk) futures.`
    : `Risk exposure is limited across the range tested.`
  )
  parts.push(`The overall risk profile shows a ${magnitude} swing across scenarios (${parisRiskCount} material risk${parisRiskCount === 1 ? '' : 's'} under the Paris-aligned pathway, ${highRiskCount} under high warming)${magnitude === 'limited' ? ', suggesting a relatively stable profile at screening level' : magnitude === 'large' ? ', indicating outcomes are highly scenario-dependent and warrant deeper analysis' : ''}.`)
  if (horizonTrend === 'rises') parts.push(`Exposure also tends to increase over the longer time horizon (toward 2050).`)
  parts.push(`This is a screening-level resilience read; the final determination of strategic resilience is a matter for management judgement, informed by entity-specific data.`)

  return {
    items,
    synthesis: {
      robustExposures, warmingContingent, policyContingent, twoChannel,
      profileSwing: { parisRiskCount, highRiskCount, swing, magnitude },
      horizonNote: horizonTrend === 'rises' ? 'worsens' : 'stable',
      statement: parts.join(' '),
    },
  }
}

// small helper: join a string list as "a, b and c"
function joinList(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

// ---------------------------------------------------------------------------
// runResilience — public entry point. Runs the diverse trio at the chosen
// horizon, checks horizon sensitivity on the middle scenario, synthesises.
// ---------------------------------------------------------------------------
export function runResilience(input: AssessmentInput, ref: ReferenceData): ResilienceResult {
  // Run each trio member at the user's chosen horizon.
  const perScenario = RESILIENCE_TRIO.map(t => ({
    role: t.role as ResilienceRole,
    scenarioCode: t.code,
    result: runAssessment({ ...input, scenarioCode: t.code }, ref),
  }))

  // Horizon sensitivity: compare the middle scenario at short vs long horizon.
  const midShort = runAssessment({ ...input, scenarioCode: 'ssp245', horizon: 'short' }, ref)
  const midLong  = runAssessment({ ...input, scenarioCode: 'ssp245', horizon: 'long' }, ref)
  const countMat = (r: AssessmentResult) =>
    r.physical.filter(p => p.band !== 'low').length + r.transition.filter(t => t.band !== 'low').length
  const horizonTrend: 'rises' | 'stable' = countMat(midLong) > countMat(midShort) ? 'rises' : 'stable'

  const { items, synthesis } = computeResilience(perScenario, horizonTrend)

  return {
    modelVersion: ref.config.model_version,
    trio: RESILIENCE_TRIO.map(t => ({ role: t.role as ResilienceRole, scenarioCode: t.code, label: t.label, warming: t.warming, source: t.source })),
    perScenario,
    items,
    synthesis,
  }
}
