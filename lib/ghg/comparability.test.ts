import { describe, it, expect } from 'vitest'
import {
  buildComparabilityDisclosure,
  buildComparabilityRecord,
  observationLines,
  type ComparabilityInput,
  type ComparabilityCapture,
  type InventorySummary,
  type PriorYearState,
} from './comparability'

// Year-over-year comparability disclosure — ISO 14064-3:2019 clause 6.3.1.5.
//
// The tier split is the whole subject of this suite, so tier is a PARAMETER here, not a separate
// suite per tier. The property that matters most is negative: suppressing one tier must not
// suppress the other. Two independent gates written as one boolean is the bug this file exists to
// catch, and it is invisible in every test that only ever exercises the happy path.

const STORED: InventorySummary = {
  locationCount: 4,
  fuelTypes: ['natural_gas', 'electricity'],
  jurisdictions: ['US'],
  boundaryApproach: 'operational_control',
}

const THIS_YEAR: InventorySummary = {
  locationCount: 6,
  fuelTypes: ['natural_gas', 'electricity'],
  jurisdictions: ['US'],
  boundaryApproach: 'operational_control',
}

/** The doc's worked example: 1,240 → 2,910 Scope 1, a stored prior inventory of 4 locations. */
const base = (over: Partial<ComparabilityInput> = {}): ComparabilityInput => ({
  priorScope1: 1240,
  priorScope2: null,
  thisScope1: 2910,
  thisScope2: 500,
  priorYearState: 'clean',
  priorSummary: STORED,
  thisSummary: THIS_YEAR,
  ...over,
})

const kinds = (d: ReturnType<typeof buildComparabilityDisclosure>) =>
  (d?.observations ?? []).map(o => o.kind)

const textOf = (d: ReturnType<typeof buildComparabilityDisclosure>, kind: string) =>
  (d?.observations ?? []).find(o => o.kind === kind)?.text

const allText = (d: ReturnType<typeof buildComparabilityDisclosure>) =>
  (d?.observations ?? []).map(o => o.text).join(' ')

// ── Trigger ─────────────────────────────────────────────────────────────────────────────────────

describe('no prior year', () => {
  it('returns null when no prior total was supplied and no prior inventory is stored', () => {
    expect(
      buildComparabilityDisclosure(
        base({ priorScope1: null, priorScope2: null, priorYearState: 'not_stored', priorSummary: null }),
      ),
    ).toBeNull()
  })

  it('does not return null merely because the totals are absent — a stored prior year is a prior year', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: null, priorScope2: null }))
    expect(d).not.toBeNull()
    expect(d!.basis.tierA).toBe(false)
    expect(d!.basis.tierB).toBe(true)
  })
})

// ── Tier as a parameter ─────────────────────────────────────────────────────────────────────────

describe('which tier runs, by prior-year state', () => {
  const cases: Array<{ state: PriorYearState; stored: boolean; tierA: boolean; tierB: boolean }> = [
    { state: 'clean', stored: true, tierA: true, tierB: true },
    { state: 'excluded', stored: true, tierA: true, tierB: true },
    { state: 'unverifiable', stored: true, tierA: false, tierB: true },
    { state: 'not_stored', stored: false, tierA: true, tierB: false },
  ]

  it.each(cases)('$state → Tier A $tierA, Tier B $tierB', ({ state, stored, tierA, tierB }) => {
    const d = buildComparabilityDisclosure(
      base({ priorYearState: state, priorSummary: stored ? STORED : null }),
    )
    expect(d).not.toBeNull()
    expect(d!.basis.tierA).toBe(tierA)
    expect(d!.basis.tierB).toBe(tierB)

    // A withheld tier always carries a stated reason. A tier that ran never invents one.
    expect(d!.basis.tierAWithheldBecause === null).toBe(tierA)
    expect(d!.basis.tierBWithheldBecause === null).toBe(tierB)

    // And the observations agree with the flags — the basis cannot claim a tier the lines don't show.
    const tiers = new Set((d!.observations ?? []).map(o => o.tier))
    expect(tiers.has('A')).toBe(tierA)
    expect(tiers.has('B')).toBe(tierB)
  })

  it('asks the same question in every state', () => {
    for (const { state, stored } of cases) {
      const d = buildComparabilityDisclosure(
        base({ priorYearState: state, priorSummary: stored ? STORED : null }),
      )
      expect(d!.question).toBe('What changed?')
    }
  })
})

// ── The independence property ───────────────────────────────────────────────────────────────────

describe('suppressing Tier A does not suppress Tier B', () => {
  it('an unverifiable prior total still counts locations', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'unverifiable' }))!

    expect(d.basis.tierA).toBe(false)
    expect(kinds(d)).not.toContain('magnitude_scope1')
    expect(kinds(d)).not.toContain('magnitude_scope2')

    expect(d.basis.tierB).toBe(true)
    expect(textOf(d, 'locations')).toBe('Your inventory went from 4 locations to 6.')

    // No percentage anywhere: the movement is withheld, not softened into a hedged number.
    expect(allText(d)).not.toMatch(/%/)
    expect(d.basis.statement).toMatch(/No movement is stated/)
  })

  it('an unstored prior year still states the movement', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'not_stored', priorSummary: null }))!

    expect(d.basis.tierB).toBe(false)
    expect(kinds(d)).not.toContain('locations')
    expect(kinds(d)).not.toContain('structure_unchanged')

    expect(d.basis.tierA).toBe(true)
    expect(textOf(d, 'magnitude_scope1')).toContain('an increase of 135%')
  })

  it('the whole question is not gated on year validity — every state returns a disclosure', () => {
    for (const state of ['clean', 'excluded', 'unverifiable', 'not_stored'] as PriorYearState[]) {
      const d = buildComparabilityDisclosure(
        base({ priorYearState: state, priorSummary: state === 'not_stored' ? null : STORED }),
      )
      expect(d, `${state} returned null — the tiers gate the observation, never the question`).not.toBeNull()
    }
  })
})

// ── Tier A — magnitude ──────────────────────────────────────────────────────────────────────────

describe('Tier A magnitude', () => {
  it("states the doc's worked example verbatim", () => {
    const d = buildComparabilityDisclosure(base())!
    expect(textOf(d, 'magnitude_scope1')).toBe(
      'You reported 1,240 tCO₂e in Scope 1 last year and 2,910 this year — an increase of 135%.',
    )
  })

  it('names a decrease as a decrease', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: 2000, thisScope1: 1500 }))!
    expect(textOf(d, 'magnitude_scope1')).toContain('a decrease of 25%')
  })

  it('reports identical figures as identical figures, and does not answer the question', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: 1000, thisScope1: 1000 }))!
    expect(textOf(d, 'magnitude_scope1')).toBe(
      'You reported 1,000 tCO₂e in Scope 1 last year and 1,000 this year — the same figure both years.',
    )
    // Not an increase, and not a claim that nothing changed — an acquisition offset by a closure
    // lands here too, and the question is still being asked.
    expect(textOf(d, 'magnitude_scope1')).not.toMatch(/increase|decrease|no change|unchanged/)
    expect(d.question).toBe('What changed?')
  })

  it('reports a rise that rounds to zero as a rise, not as identical figures', () => {
    // 0.2% rounds to 0% — but the figures differ, and telling a verifier they didn't is false.
    const d = buildComparabilityDisclosure(base({ priorScope1: 1000, thisScope1: 1002 }))!
    expect(textOf(d, 'magnitude_scope1')).toContain('an increase of less than 1%')
    expect(textOf(d, 'magnitude_scope1')).not.toContain('the same figure')
    expect(textOf(d, 'magnitude_scope1')).not.toContain('of 0%')
  })

  it('parameterises direction for a fall that rounds to zero', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: 1000, thisScope1: 998 }))!
    expect(textOf(d, 'magnitude_scope1')).toBe(
      'You reported 1,000 tCO₂e in Scope 1 last year and 998 this year — a decrease of less than 1%.',
    )
    expect(textOf(d, 'magnitude_scope1')).not.toContain('increase')
  })

  it('states both figures and no percentage when the prior total is zero', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: 0, thisScope1: 2910 }))!
    expect(textOf(d, 'magnitude_scope1')).toBe(
      'You reported 0 tCO₂e in Scope 1 last year and 2,910 this year.',
    )
    expect(textOf(d, 'magnitude_scope1')).not.toMatch(/%|Infinity|NaN/)
  })

  it('keeps a small figure legible rather than rounding it to zero', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: 0.4, thisScope1: 0.8 }))!
    expect(textOf(d, 'magnitude_scope1')).toContain('0.4 tCO₂e')
  })
})

describe('Scope 2 is never inferred', () => {
  it('emits no Scope 2 line when no prior Scope 2 figure exists', () => {
    const d = buildComparabilityDisclosure(base({ priorScope2: null }))!
    expect(kinds(d)).toContain('magnitude_scope1')
    expect(kinds(d)).not.toContain('magnitude_scope2')
    expect(allText(d)).not.toContain('Scope 2')
  })

  it('emits a Scope 2 line when a prior Scope 2 figure exists', () => {
    const d = buildComparabilityDisclosure(base({ priorScope2: 400, thisScope2: 500 }))!
    expect(textOf(d, 'magnitude_scope2')).toBe(
      'You reported 400 tCO₂e in Scope 2 last year and 500 this year — an increase of 25%.',
    )
  })

  it('does not treat an absent prior Scope 2 as zero', () => {
    const d = buildComparabilityDisclosure(base({ priorScope2: null, thisScope2: 500 }))!
    expect(allText(d)).not.toContain('0 tCO₂e in Scope 2')
  })

  it('emits Scope 2 alone when that is the only prior figure held', () => {
    const d = buildComparabilityDisclosure(base({ priorScope1: null, priorScope2: 400 }))!
    expect(kinds(d)).toContain('magnitude_scope2')
    expect(kinds(d)).not.toContain('magnitude_scope1')
    expect(d.basis.tierA).toBe(true)
  })
})

// ── Tier A on an excluded prior year ────────────────────────────────────────────────────────────

describe('excluded prior year', () => {
  it('runs both tiers, and states the exclusion beside the movement', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'excluded' }))!

    expect(d.basis.tierA).toBe(true)
    expect(d.basis.tierB).toBe(true)
    expect(textOf(d, 'exclusion')).toBe(
      "Last year's total is recorded as leaving out one or more locations, so that movement is " +
        'measured against a partial figure.',
    )
    // Adjacent to the figure it qualifies, before any structural line.
    expect(kinds(d).indexOf('exclusion')).toBe(kinds(d).indexOf('magnitude_scope1') + 1)
    expect(kinds(d).indexOf('exclusion')).toBeLessThan(kinds(d).indexOf('locations'))

    // And it reaches the workings row too, not only the screen.
    expect(d.basis.statement).toContain('partial figure')
  })

  it('states no exclusion caveat when there is no movement to qualify', () => {
    const d = buildComparabilityDisclosure(
      base({ priorYearState: 'excluded', priorScope1: null, priorScope2: null }),
    )!
    expect(kinds(d)).not.toContain('exclusion')
  })
})

// ── Tier B — structural ─────────────────────────────────────────────────────────────────────────

describe('Tier B structural observations', () => {
  it("states the location movement in the doc's words", () => {
    const d = buildComparabilityDisclosure(base())!
    expect(textOf(d, 'locations')).toBe('Your inventory went from 4 locations to 6.')
  })

  it('says "location" in the singular', () => {
    const d = buildComparabilityDisclosure(
      base({ priorSummary: { ...STORED, locationCount: 1 } }),
    )!
    expect(textOf(d, 'locations')).toBe('Your inventory went from 1 location to 6.')
  })

  it('names an added fuel in words, not in engine tokens', () => {
    const d = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, fuelTypes: ['natural_gas', 'electricity', 'propane'] } }),
    )!
    expect(textOf(d, 'fuels')).toBe(
      "Your inventory now includes propane, which wasn't in last year's.")
  })

  it('names a dropped fuel', () => {
    const d = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, fuelTypes: ['electricity'] } }),
    )!
    expect(textOf(d, 'fuels')).toBe("Last year's inventory included gas; this year's doesn't.")
  })

  it('states an addition and a removal together', () => {
    const d = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, fuelTypes: ['electricity', 'diesel', 'propane'] } }),
    )!
    expect(textOf(d, 'fuels')).toBe(
      'Your inventory now includes diesel and propane, and no longer includes gas.',
    )
  })

  it('names a new jurisdiction in words', () => {
    const d = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, jurisdictions: ['US', 'CA'] } }),
    )!
    expect(textOf(d, 'jurisdictions')).toBe(
      "Your inventory now covers Canada, which wasn't in last year's.")
  })

  it('names a dropped jurisdiction', () => {
    const d = buildComparabilityDisclosure(
      base({
        priorSummary: { ...STORED, jurisdictions: ['US', 'GB'] },
        thisSummary: { ...THIS_YEAR, jurisdictions: ['US'] },
      }),
    )!
    expect(textOf(d, 'jurisdictions')).toBe("Last year's inventory covered the UK; this year's doesn't.")
  })

  it('reports "nothing moved" rather than falling silent', () => {
    const d = buildComparabilityDisclosure(base({ thisSummary: { ...STORED } }))!
    expect(textOf(d, 'structure_unchanged')).toBe(
      "Your locations, fuels and jurisdictions are the same as last year's.",
    )
    expect(d.basis.tierB).toBe(true)
  })

  it('does not add the "nothing moved" line when something did move', () => {
    const d = buildComparabilityDisclosure(base())!
    expect(kinds(d)).toContain('locations')
    expect(kinds(d)).not.toContain('structure_unchanged')
  })
})

// ── Tier B — organisational boundary ────────────────────────────────────────────────────────────
//
// The one Tier B field with no "unchanged" counterpart. boundary_approach defaults to operational
// control and is never required, so two matching values may mean the customer chose the same
// approach twice or may mean nobody touched the selector — and the column is an unconstrained
// string, so a value outside the three is reachable and undescribable.

describe('Tier B boundary', () => {
  const withBoundaries = (prior: string | null, current: string | null) =>
    buildComparabilityDisclosure(
      base({
        priorSummary: { ...STORED, boundaryApproach: prior },
        thisSummary: { ...STORED, boundaryApproach: current },
      }),
    )!

  it('states the move when the two stored values differ', () => {
    const d = withBoundaries('operational_control', 'financial_control')
    expect(textOf(d, 'boundary')).toBe(
      'Your organisational boundary went from operational control to financial control.',
    )
  })

  it('names equity share the way a customer would say it', () => {
    const d = withBoundaries('equity_share', 'operational_control')
    expect(textOf(d, 'boundary')).toBe(
      'Your organisational boundary went from equity share to operational control.',
    )
  })

  it('emits nothing when the two stored values are identical', () => {
    for (const b of ['operational_control', 'financial_control', 'equity_share']) {
      const d = withBoundaries(b, b)
      expect(kinds(d), `${b} → ${b} emitted a boundary line`).not.toContain('boundary')
    }
  })

  it('emits no "boundary unchanged" line in any shape', () => {
    const d = withBoundaries('operational_control', 'operational_control')
    expect(allText(d)).not.toMatch(/boundary/i)
    // And the line that IS emitted names only what it compared — it does not cover for boundary.
    expect(textOf(d, 'structure_unchanged')).toBe(
      "Your locations, fuels and jurisdictions are the same as last year's.",
    )
  })

  it.each([
    ['prior side', 'Operational Control', 'financial_control'],
    ['this side', 'operational_control', 'OPERATIONAL_CONTROL'],
    ['both sides', 'joint_venture', 'trust_arrangement'],
    ['a value the select never wrote', 'operational_control', 'joint_venture'],
    ['an empty string', 'operational_control', ''],
    ['a null', 'operational_control', null],
    ['a null on the prior side', null, 'financial_control'],
  ])('emits nothing and does not throw for an unrecognised value on the %s', (_label, prior, current) => {
    let d: ReturnType<typeof buildComparabilityDisclosure>
    expect(() => { d = withBoundaries(prior, current) }).not.toThrow()
    expect(kinds(d!)).not.toContain('boundary')
    // The raw value must never reach a customer or a verifier — not in copy, not anywhere in basis.
    //
    // Fixture values are whole tokens that appear nowhere in legitimate prose. A bare word like
    // 'share' would fail this substring check against the reason's own "…or equity share", which
    // says nothing about a leak — the reason never echoes the stored value.
    const surface = `${allText(d!)} ${JSON.stringify(d!.basis)}`
    if (current) expect(surface).not.toContain(current)
    if (prior) expect(surface).not.toContain(prior)
  })

  it('still reports the rest of the structure when the boundary is undescribable', () => {
    const d = buildComparabilityDisclosure(
      base({
        priorSummary: { ...STORED, boundaryApproach: 'joint_venture' },
        thisSummary: { ...THIS_YEAR, boundaryApproach: 'financial_control' },
      }),
    )!
    expect(kinds(d)).not.toContain('boundary')
    expect(textOf(d, 'locations')).toBe('Your inventory went from 4 locations to 6.')
    expect(d.basis.tierB).toBe(true)
  })

  // ── Recorded on the basis, because no line covers two opposite facts ──────────────────────────
  //
  // "Both boundaries read, and they matched" and "one of them could not be read" both produce zero
  // observations. A verifier reading only the lines cannot tell a checked frame from an unchecked
  // one, so the distinction has to live somewhere, and basis is where every other limit already is.

  it.each([
    ['prior side unreadable', 'joint_venture', 'financial_control'],
    ['this side unreadable', 'operational_control', 'joint_venture'],
    ['both sides unreadable', 'joint_venture', 'trust_arrangement'],
    ['wrong case', 'Operational Control', 'financial_control'],
    ['empty string', 'operational_control', ''],
    ['null', 'operational_control', null],
  ])('records that the boundary could not be compared — %s', (_label, prior, current) => {
    const d = withBoundaries(prior, current)
    expect(d.basis.boundaryWithheldBecause).toBeTruthy()
    expect(d.basis.boundaryWithheldBecause).toContain('could not be compared')
  })

  it('records NOTHING withheld when both values resolved and matched', () => {
    for (const b of ['operational_control', 'financial_control', 'equity_share']) {
      const d = withBoundaries(b, b)
      expect(
        d.basis.boundaryWithheldBecause,
        `${b} → ${b} was compared and matched — that is not a withheld comparison`,
      ).toBeNull()
    }
  })

  it('records nothing withheld when both values resolved and differed', () => {
    const d = withBoundaries('operational_control', 'equity_share')
    expect(d.basis.boundaryWithheldBecause).toBeNull()
    expect(kinds(d)).toContain('boundary')
  })

  it('separates "matched" from "unreadable" — the two shapes that both emit no line', () => {
    const matched = withBoundaries('operational_control', 'operational_control')
    const unreadable = withBoundaries('operational_control', 'joint_venture')

    expect(kinds(matched)).not.toContain('boundary')
    expect(kinds(unreadable)).not.toContain('boundary')
    expect(matched.basis.boundaryWithheldBecause).not.toBe(unreadable.basis.boundaryWithheldBecause)
  })

  it('never puts the unreadable value in the reason it records', () => {
    const d = withBoundaries('operational_control', 'joint_venture')
    expect(d.basis.boundaryWithheldBecause).not.toContain('joint_venture')
    expect(d.basis.boundaryWithheldBecause).not.toMatch(/_/)
  })

  it('records a distinct reason when there is no prior inventory to hold a boundary', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'not_stored', priorSummary: null }))!
    expect(d.basis.boundaryWithheldBecause).toContain('could not be compared')
    expect(d.basis.boundaryWithheldBecause).not.toBe(
      withBoundaries('operational_control', 'joint_venture').basis.boundaryWithheldBecause,
    )
  })

  it('is unavailable with the rest of Tier B when the prior year is not stored', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'not_stored', priorSummary: null }))!
    expect(kinds(d)).not.toContain('boundary')
    expect(d.basis.tierB).toBe(false)
  })

  it('survives Tier A suppression, like the rest of Tier B', () => {
    const d = buildComparabilityDisclosure(
      base({
        priorYearState: 'unverifiable',
        priorSummary: { ...STORED, boundaryApproach: 'operational_control' },
        thisSummary: { ...STORED, boundaryApproach: 'equity_share' },
      }),
    )!
    expect(d.basis.tierA).toBe(false)
    expect(textOf(d, 'boundary')).toBe(
      'Your organisational boundary went from operational control to equity share.',
    )
  })
})

// ── The basis a verifier reads ──────────────────────────────────────────────────────────────────

describe('basis statement', () => {
  it('says the prior period is not held on the platform when that is true', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'not_stored', priorSummary: null }))!
    expect(d.basis.statement).toContain("isn't held on the platform")
    expect(d.basis.statement).toContain('the totals you supplied')
  })

  it('does NOT claim that limitation on a stored prior year', () => {
    for (const state of ['clean', 'excluded', 'unverifiable'] as PriorYearState[]) {
      const d = buildComparabilityDisclosure(base({ priorYearState: state }))!
      expect(
        d.basis.statement,
        `${state} has a stored prior inventory — asserting it isn't held on the platform is a false limitation`,
      ).not.toContain("isn't held on the platform")
    }
  })

  it('records the reason a tier was withheld, and carries it into the statement', () => {
    const unver = buildComparabilityDisclosure(base({ priorYearState: 'unverifiable' }))!
    expect(unver.basis.tierAWithheldBecause).toContain('could not be shown to be complete')
    expect(unver.basis.statement).toContain(unver.basis.tierAWithheldBecause!)

    const typed = buildComparabilityDisclosure(base({ priorYearState: 'not_stored', priorSummary: null }))!
    expect(typed.basis.tierBWithheldBecause).toContain("isn't held on the platform")
  })

  it('carries the prior-year state for the workings row', () => {
    const d = buildComparabilityDisclosure(base({ priorYearState: 'excluded' }))!
    expect(d.basis.priorYearState).toBe('excluded')
  })

  it('reports an empty observation as an empty observation, not as no prior year', () => {
    // Degenerate but reachable: Tier A suppressed AND no stored inventory to fall back on.
    const d = buildComparabilityDisclosure(
      base({ priorYearState: 'unverifiable', priorSummary: null }),
    )!
    expect(d).not.toBeNull()
    expect(d.observations).toHaveLength(0)
    expect(d.basis.tierA).toBe(false)
    expect(d.basis.tierB).toBe(false)
    expect(d.basis.statement).toContain('No observation could be put in front of this question')
    expect(d.question).toBe('What changed?')
  })
})

// ── Copy hygiene ────────────────────────────────────────────────────────────────────────────────

describe('copy is plain language', () => {
  const everyShape = (): ComparabilityInput[] => [
    base(),
    base({ priorYearState: 'excluded' }),
    base({ priorYearState: 'unverifiable' }),
    base({ priorYearState: 'not_stored', priorSummary: null }),
    base({ priorScope2: 400 }),
    base({ thisSummary: { ...THIS_YEAR, fuelTypes: ['electricity', 'diesel'], jurisdictions: ['US', 'CA'] } }),
    base({ thisSummary: { ...STORED } }),
    base({ thisSummary: { ...THIS_YEAR, boundaryApproach: 'financial_control' } }),
    base({ thisSummary: { ...THIS_YEAR, boundaryApproach: 'equity_share' } }),
  ]

  it('never puts a table name, a column name or an enum value on screen', () => {
    for (const input of everyShape()) {
      const d = buildComparabilityDisclosure(input)!
      // Every prose field, including the boundary reason — but NOT basis.priorYearState, which
      // legitimately holds the enum for a consumer to branch on and is never rendered.
      const copy = `${allText(d)} ${d.basis.statement} ${d.basis.boundaryWithheldBecause ?? ''} ${d.question}`
      expect(copy, `token leaked into copy: ${copy}`).not.toMatch(
        /natural_gas|fuel_oil|diesel_mobile|prior_year_s[12]|scope[12]_total|ghg_inventories|not_stored|unverifiable|_/,
      )
    }
  })

  it('does not ask whether the base year needs recalculating', () => {
    for (const input of everyShape()) {
      const d = buildComparabilityDisclosure(input)!
      const copy = `${allText(d)} ${d.basis.statement} ${d.question}`.toLowerCase()
      expect(copy).not.toContain('base year')
      expect(copy).not.toContain('recalculat')
    }
  })

  it('every observation is a complete sentence that can stand alone', () => {
    for (const input of everyShape()) {
      const d = buildComparabilityDisclosure(input)!
      for (const o of d.observations) {
        expect(o.text, `not a sentence: ${o.text}`).toMatch(/^[A-Z]/)
        expect(o.text, `unterminated: ${o.text}`).toMatch(/\.$/)
        // Tier B renders with no Tier A in front of it on an unverifiable prior year, so no line
        // may open as a continuation of another.
        expect(o.text.toLowerCase(), `continuation: ${o.text}`).not.toMatch(/^(and|but|or)\b/)
      }
    }
  })
})

// ── Persistence: what gets stored ───────────────────────────────────────────────────────────────
//
// The record separates two moments: what the customer was shown when they answered, and what the
// module would say at save. The first is evidence and is never rewritten; the second is a check.

const captureFrom = (
  d: ReturnType<typeof buildComparabilityDisclosure>,
  answer: 'nothing_changed' | 'something_changed',
  answeredAt = '2026-08-06T10:00:00.000Z',
): ComparabilityCapture => ({
  observations: observationLines(d!),
  question: d!.question,
  answer,
  basis: d!.basis,
  answeredAt,
})

const SAVED_AT = '2026-08-06T11:30:00.000Z'

const record = (over: Partial<Parameters<typeof buildComparabilityRecord>[0]> = {}) =>
  buildComparabilityRecord({
    capture: captureFrom(buildComparabilityDisclosure(base()), 'nothing_changed'),
    note: '',
    priorYearLookupFailed: false,
    current: buildComparabilityDisclosure(base()),
    checkedAt: SAVED_AT,
    ...over,
  })

describe('refusals — the column is left alone', () => {
  it('writes nothing when the prior-year lookup failed', () => {
    // The disclosure carries 'not_stored' either way, so a basis built on a failed lookup is
    // byte-identical to one built on a genuine absence. It must never reach the record.
    expect(record({ priorYearLookupFailed: true })).toBeNull()
  })

  it('refuses on a failed lookup even when the customer answered in full', () => {
    const r = record({
      priorYearLookupFailed: true,
      capture: captureFrom(buildComparabilityDisclosure(base()), 'something_changed'),
      note: 'We acquired a plant in March.',
    })
    expect(r).toBeNull()
  })

  it('writes nothing when the question was never answered', () => {
    expect(record({ capture: null })).toBeNull()
  })

  it('does not write an empty shell — no timestamp-only record', () => {
    const r = record({ capture: null })
    expect(r).toBeNull()
    expect(r).not.toEqual(expect.objectContaining({ checkedAt: SAVED_AT }))
  })
})

describe('an answer with no detail is still an answer', () => {
  it("stores 'something_changed' with an empty note", () => {
    const r = record({
      capture: captureFrom(buildComparabilityDisclosure(base()), 'something_changed'),
      note: '',
    })!
    expect(r).not.toBeNull()
    expect(r.answer).toBe('something_changed')
    expect(r.note).toBe('')          // shown and left blank — NOT null
    expect(r.detailProvided).toBe(false)
  })

  it('distinguishes blank-but-shown from never-shown', () => {
    const blank = record({
      capture: captureFrom(buildComparabilityDisclosure(base()), 'something_changed'),
      note: '',
    })!
    const neverShown = record({
      capture: captureFrom(buildComparabilityDisclosure(base()), 'nothing_changed'),
      note: '',
    })!
    expect(blank.note).toBe('')
    expect(neverShown.note).toBeNull()
    expect(blank.note).not.toBe(neverShown.note)
  })

  it('flags detail only when the note carries non-whitespace', () => {
    const cap = captureFrom(buildComparabilityDisclosure(base()), 'something_changed')
    expect(record({ capture: cap, note: 'Acquired a plant.' })!.detailProvided).toBe(true)
    expect(record({ capture: cap, note: '   \n ' })!.detailProvided).toBe(false)
    // ...and the whitespace is still stored verbatim. What they typed is what is on the record.
    expect(record({ capture: cap, note: '   \n ' })!.note).toBe('   \n ')
  })

  it("ignores the note entirely on 'nothing_changed'", () => {
    const r = record({
      capture: captureFrom(buildComparabilityDisclosure(base()), 'nothing_changed'),
      note: 'stale text from before they switched option',
    })!
    expect(r.note).toBeNull()
    expect(r.detailProvided).toBe(false)
  })
})

describe('drift between answering and saving', () => {
  const answeredOn = buildComparabilityDisclosure(base())

  it('records no change when the observation still stands', () => {
    const r = record({ capture: captureFrom(answeredOn, 'nothing_changed'), current: answeredOn })!
    expect(r.observationsChanged).toBe(false)
    expect(r).not.toHaveProperty('observationsAtSave')
    expect(r.checkedAt).toBe(SAVED_AT)
  })

  it('records the difference and keeps BOTH sets when the observation moved', () => {
    // Answered against 4 → 6 locations; by save time this year holds 9.
    const atSave = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, locationCount: 9 } }),
    )
    const r = record({ capture: captureFrom(answeredOn, 'nothing_changed'), current: atSave })!

    expect(r.observationsChanged).toBe(true)
    expect(r.observationsAtSave).toEqual(observationLines(atSave!))
    // The originals are UNTOUCHED — what the customer saw is the record.
    expect(r.observations).toEqual(observationLines(answeredOn!))
    expect(r.observations).toContain('Your inventory went from 4 locations to 6.')
    expect(r.observationsAtSave).toContain('Your inventory went from 4 locations to 9.')
  })

  it('treats a disclosure that has since become null as a real difference', () => {
    const r = record({ capture: captureFrom(answeredOn, 'nothing_changed'), current: null })!
    expect(r.observationsChanged).toBe(true)
    expect(r.observationsAtSave).toEqual([])
    expect(r.observations.length).toBeGreaterThan(0)
  })

  it('never rewrites the answer, the question, or the basis at save', () => {
    const atSave = buildComparabilityDisclosure(
      base({ priorYearState: 'unverifiable', thisSummary: { ...THIS_YEAR, locationCount: 9 } }),
    )
    const cap = captureFrom(answeredOn, 'something_changed')
    const r = record({ capture: cap, note: 'Bought a competitor.', current: atSave })!

    expect(r.question).toBe(cap.question)
    expect(r.answeredAt).toBe(cap.answeredAt)
    expect(r.basis).toEqual(cap.basis)
    expect(r.basis.tierA).toBe(true)               // as answered, not the 'unverifiable' recompute
    expect(r.answer).toBe('something_changed')
  })

  it('keeps the answer timestamp and the check timestamp apart', () => {
    const r = record({ capture: captureFrom(answeredOn, 'nothing_changed', '2026-08-06T09:00:00.000Z') })!
    expect(r.answeredAt).toBe('2026-08-06T09:00:00.000Z')
    expect(r.checkedAt).toBe(SAVED_AT)
    expect(r.answeredAt).not.toBe(r.checkedAt)
  })

  it('carries the observation lines as the customer read them, in order', () => {
    const r = record({ capture: captureFrom(answeredOn, 'nothing_changed') })!
    expect(r.observations).toEqual(answeredOn!.observations.map(o => o.text))
  })
})

// ── Re-hydration: an answer reopened, not re-given ──────────────────────────────────────────────
//
// Reopening an inventory restores the capture from the stored record — the observations as they
// were shown, the basis of that moment, and the ORIGINAL answeredAt. A page load is not an answer.
// The consequence that matters: the restored capture must still be able to drift.

describe('an answer restored from a stored record', () => {
  const answeredOn = buildComparabilityDisclosure(base())
  const ANSWERED_AT = '2026-08-01T09:15:00.000Z'

  /** What the wizard rebuilds on load: the record's own fields, none of them recomputed. */
  const hydrated = (stored: NonNullable<ReturnType<typeof buildComparabilityRecord>>): ComparabilityCapture => ({
    observations: stored.observations,
    question: stored.question,
    answer: stored.answer,
    basis: stored.basis,
    answeredAt: stored.answeredAt,
  })

  const firstSave = buildComparabilityRecord({
    capture: captureFrom(answeredOn, 'something_changed', ANSWERED_AT),
    note: 'Acquired a plant in March.',
    priorYearLookupFailed: false,
    current: answeredOn,
    checkedAt: '2026-08-01T09:20:00.000Z',
  })!

  it('keeps the original answer timestamp across a reopen and re-save', () => {
    const r = buildComparabilityRecord({
      capture: hydrated(firstSave),
      note: firstSave.note ?? '',
      priorYearLookupFailed: false,
      current: answeredOn,
      checkedAt: '2026-08-06T14:00:00.000Z',
    })!
    expect(r.answeredAt).toBe(ANSWERED_AT)
    expect(r.checkedAt).toBe('2026-08-06T14:00:00.000Z')
  })

  it('STILL records drift when the observation moved since the answer', () => {
    // The whole point of not re-hydrating observations as current: this must not come back false.
    const atSave = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, locationCount: 11 } }),
    )
    const r = buildComparabilityRecord({
      capture: hydrated(firstSave),
      note: firstSave.note ?? '',
      priorYearLookupFailed: false,
      current: atSave,
      checkedAt: '2026-08-06T14:00:00.000Z',
    })!

    expect(r.observationsChanged).toBe(true)
    expect(r.observations).toEqual(firstSave.observations)          // what was shown then
    expect(r.observationsAtSave).toContain('Your inventory went from 4 locations to 11.')
    expect(r.answeredAt).toBe(ANSWERED_AT)
  })

  it('carries the answer and its detail back through unchanged', () => {
    const r = buildComparabilityRecord({
      capture: hydrated(firstSave),
      note: firstSave.note ?? '',
      priorYearLookupFailed: false,
      current: answeredOn,
      checkedAt: '2026-08-06T14:00:00.000Z',
    })!
    expect(r.answer).toBe('something_changed')
    expect(r.note).toBe('Acquired a plant in March.')
    expect(r.detailProvided).toBe(true)
    expect(r.basis).toEqual(firstSave.basis)
  })

  it('an edit to the note alone does NOT erase drift', () => {
    // The customer reopens an inventory whose observation has moved, fixes a typo in their note,
    // and saves. Typing is elaboration, not a new answer — so the capture is untouched and the
    // drift the save exists to record must survive.
    //
    // Without this, the same customer with the same figures produces two different records
    // depending on whether they touched the box.
    const atSave = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, locationCount: 11 } }),
    )
    const r = buildComparabilityRecord({
      capture: hydrated(firstSave),                      // unchanged by the edit
      note: 'Acquired a plant in March 2026.',           // the only thing that moved
      priorYearLookupFailed: false,
      current: atSave,
      checkedAt: '2026-08-06T14:00:00.000Z',
    })!

    expect(r.observationsChanged).toBe(true)
    expect(r.observations).toEqual(firstSave.observations)
    expect(r.observations).toContain('Your inventory went from 4 locations to 6.')
    expect(r.observationsAtSave).toContain('Your inventory went from 4 locations to 11.')
    expect(r.answeredAt).toBe(ANSWERED_AT)
    // ...and the edit did land.
    expect(r.note).toBe('Acquired a plant in March 2026.')
  })

  it('a re-answer is a NEW capture — fresh timestamp, current observations, no drift', () => {
    // What the wizard builds when the customer clicks a radio or edits the note after reopening.
    const atSave = buildComparabilityDisclosure(
      base({ thisSummary: { ...THIS_YEAR, locationCount: 11 } }),
    )
    const r = buildComparabilityRecord({
      capture: captureFrom(atSave, 'something_changed', '2026-08-06T14:05:00.000Z'),
      note: 'Two more sites came online.',
      priorYearLookupFailed: false,
      current: atSave,
      checkedAt: '2026-08-06T14:06:00.000Z',
    })!
    expect(r.answeredAt).toBe('2026-08-06T14:05:00.000Z')
    expect(r.answeredAt).not.toBe(ANSWERED_AT)
    expect(r.observationsChanged).toBe(false)
    expect(r.observations).toContain('Your inventory went from 4 locations to 11.')
  })
})
