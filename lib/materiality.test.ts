// lib/materiality.test.ts
// Engine tests for the Materiality & Scenario Analysis scoring engine (lib/materiality.ts).
//
// PHASE 1 — characterisation + bug-exposure suite. Written BEFORE any fix. The GROUP A–D
// tests assert the CORRECT behaviour and are therefore expected to FAIL (RED) against the
// current code — each one pins a real defect. The GROUP E regression guards assert behaviour
// that already works and must stay GREEN. A GREEN bug-test or a RED guard is itself a finding.
//
// All assertions reach the private compute functions through the one public seam,
// runAssessment(input, ref), exactly as the API route does.
import { describe, it, expect } from 'vitest'
import {
  runAssessment,
  type ReferenceData,
  type AssessmentInput,
  type ModelConfig,
} from './materiality'

// ── fixtures ─────────────────────────────────────────────────────────────────
// A full, valid reference set + input, with per-test array overrides. config merges
// deeply (so a test can tweak one threshold); every other field is replaced wholesale.
const DEFAULT_CONFIG: ModelConfig = {
  model_version: 'v1.2',
  phys_high: 6, phys_med: 3,
  topic_high: 6, topic_med: 3,
  horizon_short: 0.8, horizon_medium: 1.0, horizon_long: 1.2,
}

function baseRef(over: Partial<ReferenceData> = {}): ReferenceData {
  return {
    config: { ...DEFAULT_CONFIG, ...(over.config ?? {}) },
    industries: over.industries ?? [
      { code: 'tech-mfg', label: 'Tech manufacturing', carbon_exposure: 3 },
    ],
    regionHazards: over.regionHazards ?? [
      { region_code: 'r', hazard: 'heat', intensity: 3 },
      { region_code: 'r', hazard: 'flood', intensity: 3 },
      { region_code: 'r', hazard: 'wildfire', intensity: 3 },
    ],
    industryHazards: over.industryHazards ?? [
      { industry_code: 'tech-mfg', hazard: 'heat', sensitivity: 2 },
      { industry_code: 'tech-mfg', hazard: 'flood', sensitivity: 2 },
      { industry_code: 'tech-mfg', hazard: 'wildfire', sensitivity: 2 },
    ],
    jurisdictions: over.jurisdictions ?? [
      { code: 'EU', label: 'European Union', policy_intensity: 4 },
      { code: 'US', label: 'United States', policy_intensity: 2 },
    ],
    esrsTopics: over.esrsTopics ?? [
      { code: 'E1', label: 'Climate change', category: 'Environment', sort_order: 1 },
      { code: 'S1', label: 'Own workforce', category: 'Social', sort_order: 2 },
      { code: 'G1', label: 'Business conduct', category: 'Governance', sort_order: 3 },
    ],
    topicBaselines: over.topicBaselines ?? [
      { industry_code: 'tech-mfg', topic_code: 'S1', financial_base: 5, impact_base: 5 },
      { industry_code: 'tech-mfg', topic_code: 'G1', financial_base: 2, impact_base: 2 },
    ],
    scenarios: over.scenarios ?? [
      { code: 'ssp126', label: 'SSP1-2.6', framework: 'IPCC', descriptor: '~1.8°C', physical_mult: 0.7, transition_mult: 1.3 },
      { code: 'ssp245', label: 'SSP2-4.5', framework: 'IPCC', descriptor: '~2.7°C', physical_mult: 1.0, transition_mult: 1.0 },
      { code: 'ssp585', label: 'SSP5-8.5', framework: 'IPCC', descriptor: '~4.4°C', physical_mult: 1.5, transition_mult: 0.8 },
    ],
    industryOpportunities: over.industryOpportunities ?? [
      { industry_code: 'tech-mfg', opportunity_category: 'energy_source', relevance: 3, sort_order: 1 },
      { industry_code: 'tech-mfg', opportunity_category: 'resilience', relevance: 3, sort_order: 2 },
      { industry_code: 'tech-mfg', opportunity_category: 'resource_efficiency', relevance: 3, sort_order: 3 },
    ],
    industryTransitionDrivers: over.industryTransitionDrivers ?? [
      { industry_code: 'tech-mfg', transition_driver: 'policy', weight: 2, sort_order: 1 },
      { industry_code: 'tech-mfg', transition_driver: 'technology', weight: 2, sort_order: 2 },
      { industry_code: 'tech-mfg', transition_driver: 'market', weight: 2, sort_order: 3 },
      { industry_code: 'tech-mfg', transition_driver: 'reputation', weight: 2, sort_order: 4 },
    ],
  }
}

function baseInput(over: Partial<AssessmentInput> = {}): AssessmentInput {
  return {
    mode: 'csrd', industryCode: 'tech-mfg', regionCodes: ['r'], jurisdictionCodes: ['EU'],
    assetProfile: 'inland', scenarioCode: 'ssp245', horizon: 'medium', ...over,
  }
}

const run = (inputOver: Partial<AssessmentInput> = {}, refOver: Partial<ReferenceData> = {}) =>
  runAssessment(baseInput(inputOver), baseRef(refOver))

// ── GROUP A — a hazard with no regional data is SILENTLY DELETED [SEV 1] ──────
// computePhysical drops any hazard whose (region, hazard) row is absent (regionExp === 0 →
// continue). A false negative on a physical climate risk in an IFRS S2 report: "no wildfire
// listed" reads as "no wildfire risk" when the truth is "we never looked".
describe('GROUP A — missing regional hazard data must not vanish', () => {
  it('A1 wildfire, industry-sensitive but region has NO wildfire row → must APPEAR (unknown), not be omitted', () => {
    const r = run(
      { regionCodes: ['r'], mode: 's2', assetProfile: 'inland' },
      {
        industryHazards: [
          { industry_code: 'tech-mfg', hazard: 'wildfire', sensitivity: 2 },
          { industry_code: 'tech-mfg', hazard: 'heat', sensitivity: 2 },
        ],
        regionHazards: [{ region_code: 'r', hazard: 'heat', intensity: 3 }], // heat present, wildfire absent
      },
    )
    const heat = r.physical.find(p => p.hazard === 'Extreme heat')
    const wildfire = r.physical.find(p => p.hazard === 'Wildfire')
    expect(heat).toBeDefined()             // sanity: a hazard WITH data is present
    expect(wildfire).toBeDefined()         // RED: silently dropped for want of a region row
    expect((wildfire as any)?.band).toBe('unknown') // and must be flagged unknown, not scored/omitted
  })

  it('A2 region has NO rows at all → every sensitive hazard is unknown, physical.length > 0 (not an empty clean profile)', () => {
    const r = run(
      { regionCodes: ['r'], mode: 's2' },
      {
        industryHazards: [
          { industry_code: 'tech-mfg', hazard: 'wildfire', sensitivity: 2 },
          { industry_code: 'tech-mfg', hazard: 'heat', sensitivity: 2 },
        ],
        regionHazards: [], // total data void
      },
    )
    expect(r.physical.length).toBeGreaterThan(0) // RED: currently [] — a clean profile from a void
  })

  it('A3 a genuine assessed zero (intensity 0 row EXISTS) must be DISTINGUISHABLE from a missing row', () => {
    const wf = { industry_code: 'tech-mfg', hazard: 'wildfire', sensitivity: 2 }
    const missing = run({ regionCodes: ['r'], mode: 's2' }, { industryHazards: [wf], regionHazards: [] })
    const genuineZero = run({ regionCodes: ['r'], mode: 's2' }, {
      industryHazards: [wf],
      regionHazards: [{ region_code: 'r', hazard: 'wildfire', intensity: 0 }],
    })
    const wfMissing = missing.physical.find(p => p.hazard === 'Wildfire')
    const wfZero = genuineZero.physical.find(p => p.hazard === 'Wildfire')
    // 0 is a CLAIM (assessed: no exposure); missing is an ABSENCE (never looked). Not the same finding.
    expect(wfZero).toBeDefined()          // RED: a genuine zero is dropped exactly like missing
    expect(wfZero).not.toEqual(wfMissing) // RED: both undefined today → indistinguishable
  })
})

// ── GROUP B — climateFinancial compares INCOMMENSURABLE SCALES [SEV 1] ────────
// policy = carbon×weight×jurMax×scenario×horizon ; the other three lack the jurMax factor.
// So policy lives on a ~0-26 scale and market/technology/reputation on ~0-9 — the bands say so.
// A bare Math.max across the four is effectively Math.max(policy): three of four TCFD transition
// drivers are structurally incapable of setting the E1 financial score.
describe('GROUP B — transition drivers are on incommensurable scales', () => {
  it('B1 a HIGH-band technology risk (jurMax=1, weight 3) must drive E1 to high materiality — it currently cannot', () => {
    const r = run(
      { jurisdictionCodes: ['LOWJUR'], mode: 's2' },
      {
        industries: [{ code: 'tech-mfg', label: 'Tech mfg', carbon_exposure: 3 }],
        industryHazards: [],                                             // isolate transition (no physical)
        jurisdictions: [{ code: 'LOWJUR', label: 'Low', policy_intensity: 1 }],
        industryTransitionDrivers: [
          { industry_code: 'tech-mfg', transition_driver: 'technology', weight: 3, sort_order: 1 },
          { industry_code: 'tech-mfg', transition_driver: 'policy', weight: 2, sort_order: 2 },
          { industry_code: 'tech-mfg', transition_driver: 'market', weight: 2, sort_order: 3 },
          { industry_code: 'tech-mfg', transition_driver: 'reputation', weight: 2, sort_order: 4 },
        ],
      },
    )
    const tech = r.transition.find(t => t.driver === 'Technology displacement')!
    expect(tech.band).toBe('high') // sanity: technology IS a high transition risk here
    // A high-band transition risk should read as high financial materiality. It scores ~3.6.
    expect(r.climateFinancialScore).toBeGreaterThanOrEqual(DEFAULT_CONFIG.topic_high) // RED: 3.6 < 6
  })

  it('B2 varying ONLY jurMax (1 → 8) must move E1 proportionately, not saturate the clamp', () => {
    const refOver: Partial<ReferenceData> = {
      industries: [{ code: 'tech-mfg', label: 'Tech mfg', carbon_exposure: 3 }],
      industryHazards: [],
      jurisdictions: [
        { code: 'J1', label: 'One', policy_intensity: 1 },
        { code: 'J8', label: 'Eight', policy_intensity: 8 },
      ],
    }
    const low = run({ jurisdictionCodes: ['J1'], mode: 's2' }, refOver).climateFinancialScore
    const high = run({ jurisdictionCodes: ['J8'], mode: 's2' }, refOver).climateFinancialScore
    expect(high).toBeGreaterThan(low)   // sanity: more policy exposure ⇒ more risk
    expect(high).toBeLessThan(10)       // RED: policy alone saturates the E1 clamp at 10
  })

  it('B3 two profiles EACH with one high-band transition driver must score alike (normalised), not diverge by scale', () => {
    // Company A: policy 'high' (raw 12), everything else zero.
    const a = run(
      { jurisdictionCodes: ['J12'], mode: 's2' },
      {
        industries: [{ code: 'tech-mfg', label: 'A', carbon_exposure: 1 }],
        industryHazards: [],
        jurisdictions: [{ code: 'J12', label: 'Twelve', policy_intensity: 12 }],
        industryTransitionDrivers: [
          { industry_code: 'tech-mfg', transition_driver: 'policy', weight: 2, sort_order: 1 },
          { industry_code: 'tech-mfg', transition_driver: 'technology', weight: 0, sort_order: 2 },
          { industry_code: 'tech-mfg', transition_driver: 'market', weight: 0, sort_order: 3 },
          { industry_code: 'tech-mfg', transition_driver: 'reputation', weight: 0, sort_order: 4 },
        ],
      },
    )
    // Company B: technology 'high' (raw 4.5), everything else zero.
    const b = run(
      { jurisdictionCodes: [], mode: 's2' },
      {
        industries: [{ code: 'tech-mfg', label: 'B', carbon_exposure: 3 }],
        industryHazards: [],
        jurisdictions: [],
        industryTransitionDrivers: [
          { industry_code: 'tech-mfg', transition_driver: 'technology', weight: 3, sort_order: 1 },
          { industry_code: 'tech-mfg', transition_driver: 'policy', weight: 0, sort_order: 2 },
          { industry_code: 'tech-mfg', transition_driver: 'market', weight: 0, sort_order: 3 },
          { industry_code: 'tech-mfg', transition_driver: 'reputation', weight: 0, sort_order: 4 },
        ],
      },
    )
    // Both have exactly one high-band transition driver and three low — same band-profile.
    expect(a.transition.find(t => t.driver === 'Carbon pricing / policy')!.band).toBe('high')
    expect(b.transition.find(t => t.driver === 'Technology displacement')!.band).toBe('high')
    // Normalised, their E1 scores should match. Raw-max makes A (9.6) ≫ B (3.6).
    expect(a.climateFinancialScore).toBeCloseTo(b.climateFinancialScore, 0) // RED
  })
})

// ── GROUP C — a missing topic baseline reads as "NOT MATERIAL" [SEV 2] ────────
// computeMatrix defaults a missing (industry, topic) baseline to 2 → below topic_med → 'low'
// → quadrant 'low' → NOT MATERIAL. A gap in the reference data becomes a POSITIVE finding of
// immateriality on the CSRD double-materiality matrix.
describe('GROUP C — missing topic baseline must not read as immaterial', () => {
  const refOver: Partial<ReferenceData> = {
    esrsTopics: [
      { code: 'E1', label: 'Climate change', category: 'Environment', sort_order: 1 },
      { code: 'S1', label: 'Own workforce', category: 'Social', sort_order: 2 },
      { code: 'G1', label: 'Business conduct', category: 'Governance', sort_order: 3 },
    ],
    // S1 has NO baseline row; G1 has a REAL assessed baseline of 2.
    topicBaselines: [{ industry_code: 'tech-mfg', topic_code: 'G1', financial_base: 2, impact_base: 2 }],
  }

  it('C1 a topic with NO baseline row must NOT be silently scored 2/low/NOT-MATERIAL', () => {
    const r = run({ mode: 'csrd' }, refOver)
    const s1 = r.matrix.find(m => m.code === 'S1')!
    expect(s1.quadrant).not.toBe('low') // RED: a data gap renders as a positive finding of immateriality
  })

  it('C2 a missing baseline must be DISTINGUISHABLE from a real assessed 2', () => {
    const r = run({ mode: 'csrd' }, refOver)
    const s1 = r.matrix.find(m => m.code === 'S1')! // no baseline → default 2
    const g1 = r.matrix.find(m => m.code === 'G1')! // real baseline of 2
    const state = (m: typeof s1) => ({ financial: m.financial, financialBand: m.financialBand, quadrant: m.quadrant })
    expect(state(s1)).not.toEqual(state(g1)) // RED: currently identical → 0-vs-absence confusion
  })
})

// ── GROUP D — ASSET_MOD is invisible to model_version [SEV 2] ─────────────────
// Every other coefficient is a DB row covered by config.model_version. ASSET_MOD is a hardcoded
// const. Edit it, redeploy, and every report still stamps the old version while the numbers move.
describe('GROUP D — asset modifiers must be captured by the result', () => {
  it('D1 the result must carry the asset-modifier set it used, so a verifier can reproduce the number', () => {
    const r = run({ assetProfile: 'coastal' }, {})
    // Physical scores are computed WITH the coastal modifiers baked in, but the modifiers
    // themselves never leave the module — modelVersion (from the DB) cannot capture them.
    expect((r as any).assetModifiers).toBeDefined() // RED: no such field on AssessmentResult
  })
})

// ── GROUP E — REGRESSION GUARDS (must stay GREEN) ─────────────────────────────
describe('GROUP E — regression guards (should pass)', () => {
  it('E1 runAssessment throws on an unknown scenario code', () => {
    expect(() => run({ scenarioCode: 'not-a-scenario' })).toThrow(/Unknown scenario/)
  })

  it('E2 runAssessment throws on an unknown industry code', () => {
    expect(() => run({ industryCode: 'not-an-industry', scenarioCode: 'ssp245' })).toThrow(/Unknown industry/)
  })

  it('E3 physical bands respect config.phys_high / phys_med', () => {
    const r = run(
      { industryCode: 'e3', regionCodes: ['reg'], assetProfile: 'inland', scenarioCode: 'ssp245', mode: 's2' },
      {
        industries: [{ code: 'e3', label: 'E3', carbon_exposure: 1 }],
        industryHazards: [
          { industry_code: 'e3', hazard: 'flood', sensitivity: 1 },
          { industry_code: 'e3', hazard: 'water', sensitivity: 1 },
          { industry_code: 'e3', hazard: 'cyclone', sensitivity: 1 },
        ],
        // inland asset does not modify flood/water/cyclone → scores equal the intensities.
        regionHazards: [
          { region_code: 'reg', hazard: 'flood', intensity: 7 },   // ≥ phys_high(6) → high
          { region_code: 'reg', hazard: 'water', intensity: 4 },   // ≥ phys_med(3)  → med
          { region_code: 'reg', hazard: 'cyclone', intensity: 2 }, // < phys_med     → low
        ],
      },
    )
    expect(r.physical.find(p => p.hazard === 'Inland flooding')!.band).toBe('high')
    expect(r.physical.find(p => p.hazard === 'Water stress')!.band).toBe('med')
    expect(r.physical.find(p => p.hazard === 'Storms / cyclones')!.band).toBe('low')
  })

  it('E4 opportunity links: transition scales with transition_mult, physical with physical_mult, neutral with neither', () => {
    // ssp585: physical_mult 1.5, transition_mult 0.8.
    const r = run(
      { industryCode: 'e4', scenarioCode: 'ssp585', regionCodes: [], mode: 's2' },
      {
        industries: [{ code: 'e4', label: 'E4', carbon_exposure: 1 }],
        industryHazards: [],
        industryOpportunities: [
          { industry_code: 'e4', opportunity_category: 'energy_source', relevance: 3, sort_order: 1 },       // transition
          { industry_code: 'e4', opportunity_category: 'resilience', relevance: 3, sort_order: 2 },           // physical
          { industry_code: 'e4', opportunity_category: 'resource_efficiency', relevance: 3, sort_order: 3 },  // neutral
        ],
      },
    )
    expect(r.opportunities.find(o => o.category === 'energy_source')!.relevance).toBeCloseTo(3 * 0.8, 1) // 2.4
    expect(r.opportunities.find(o => o.category === 'resilience')!.relevance).toBeCloseTo(3 * 1.5, 1)    // 4.5
    expect(r.opportunities.find(o => o.category === 'resource_efficiency')!.relevance).toBeCloseTo(3, 1) // 3.0
  })

  it('E5 climateFinancialScore is clamped to [2, 10]', () => {
    const floor = run(
      { industryCode: 'lo', jurisdictionCodes: [], regionCodes: [], mode: 's2' },
      { industries: [{ code: 'lo', label: 'Lo', carbon_exposure: 0.1 }], industryHazards: [], jurisdictions: [], industryTransitionDrivers: [] },
    ).climateFinancialScore
    const ceil = run(
      { industryCode: 'hi', jurisdictionCodes: ['BIG'], regionCodes: [], mode: 's2' },
      {
        industries: [{ code: 'hi', label: 'Hi', carbon_exposure: 5 }],
        industryHazards: [],
        jurisdictions: [{ code: 'BIG', label: 'Big', policy_intensity: 10 }],
        industryTransitionDrivers: [
          { industry_code: 'hi', transition_driver: 'policy', weight: 3, sort_order: 1 },
          { industry_code: 'hi', transition_driver: 'technology', weight: 3, sort_order: 2 },
        ],
      },
    ).climateFinancialScore
    expect(floor).toBe(2)
    expect(ceil).toBe(10)
  })

  it('E6 s2 mode → empty matrix; csrd mode → populated matrix', () => {
    expect(run({ mode: 's2' }, {}).matrix.length).toBe(0)
    expect(run({ mode: 'csrd' }, {}).matrix.length).toBeGreaterThan(0)
  })
})
