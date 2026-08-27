/**
 * The divergence register — the asymmetric gate, made executable.
 *
 * ⚠️ THE ASYMMETRY IS THE POINT OF THIS FILE. buildRegister judges the preparer's side by two
 * different standards on purpose:
 *
 *     MATERIAL      one submitted determination that computeSeverity reports material.
 *                   A direction nobody scored cannot unmake it. Materiality is a floor.
 *     NOT MATERIAL  both directions submitted AND complete, neither material.
 *                   Reached with a direction unscored, it rests on a question nobody asked.
 *
 * It reads like an inconsistency, which is exactly why it is tested from both arms and across the
 * boundary between them: the same sub-topic, the same stakeholder signal, flipping only whether the
 * one submitted determination is material, must move between `entries` and `omitted`. A future
 * reader who "fixes" the gate to be symmetric fails that pair in both directions.
 *
 * Everything is asserted through buildRegister's public output. No private helper is imported, so
 * the suite constrains the register's behaviour rather than its current internals.
 *
 * ⚠️ THE THRESHOLDS ARE IMPORTED, NEVER RETYPED. MEAN_THRESHOLD comes from severity.ts, and the
 * top-box threshold is fed in as the round's snapshot the way a caller feeds it. A change to either
 * should move this suite's expectations, not silently invalidate them.
 */

import { describe, it, expect } from 'vitest'
import {
  buildRegister, RegisterInputError, NEVER_IN_SURVEY_SCOPE_DETAIL,
  HEADING, WHAT_THIS_IS, WHAT_THIS_IS_NOT, TRIGGERS_ACTIVE, TRIGGERS_INACTIVE,
  type Determination, type DivergenceRegister, type OmissionReason,
  type Overall, type RegisterSubTopic, type TopBox,
} from './register'
import { MEAN_THRESHOLD } from './severity'

/**
 * The round's snapshotted top_box_high_min_share (20260843). 0.50 with a denominator of 12 is the
 * only reason this suite can test the boundary AT the threshold: 6/12 is exactly representable, so
 * "equal to" is a real case rather than a floating-point near-miss.
 */
const THRESHOLD = 0.50
const DENOM = 12
const EXACTLY_ON = 6      // 6/12 = 0.50 — NOT high, the comparison is strictly greater
const ABOVE = 7           // 7/12 ≈ 0.583 — high
const BELOW = 5           // 5/12 ≈ 0.417 — not high

const topBox = (numerator: number, denominator: number): TopBox => ({
  share: denominator === 0 ? null : numerator / denominator,
  numerator,
  denominator,
})

/** A survey result where `numerator` of `denominator` substantive responses chose band 3. */
const overall = (numerator: number, denominator = DENOM): Overall => ({
  n_asked: denominator, n_answered: denominator, n_abstained: 0, n_skipped: 0,
  distribution: { '1': denominator - numerator, '2': 0, '3': numerator },
  top_box: topBox(numerator, denominator),
  median_low: null, median_high: null, modal_share: null, polarised: false,
})

const negDet = (s: number | null, sc: number | null, ir: number | null,
                over: Partial<Determination> = {}): Determination => ({
  direction: 'negative', nature: 'actual', status: 'submitted',
  scale: s, scope: sc, irremediability: ir, ...over,
})

const posDet = (s: number | null, sc: number | null,
                over: Partial<Determination> = {}): Determination => ({
  direction: 'positive', nature: 'actual', status: 'submitted',
  scale: s, scope: sc, irremediability: null, ...over,
})

// Determinations whose materiality is fixed by severity.ts's own table, not by anything here.
const MATERIAL_NEG = () => negDet(3, 3, 3)          // mean 3.0
const IMMATERIAL_NEG = () => negDet(1, 1, 1)        // mean 1.0
const IMMATERIAL_POS = () => posDet(1, 1)           // mean 1.0
/** ⚠️ severity.test.ts:253's case — two dimensions summing to 5 land EXACTLY on the threshold. */
const ON_THRESHOLD_POS = () => posDet(2, 3)         // mean 2.5

const sub = (over: Partial<RegisterSubTopic> = {}): RegisterSubTopic => ({
  subtopic_code: 'E1.1', topic_code: 'E1', topic_label: 'Climate change',
  short_name: 'Climate transition', category: 'env',
  status: 'included', exclusion_reason: null,
  overall: overall(ABOVE), determinations: [], ...over,
})

const build = (subtopics: RegisterSubTopic[], threshold = THRESHOLD): DivergenceRegister =>
  buildRegister({ subtopics, topBoxHighMinShare: threshold })

const codesIn = (r: DivergenceRegister) => ({
  entries: r.entries.map(e => e.subtopic_code),
  omitted: r.omitted.map(o => o.subtopic_code),
})


describe('the asymmetric gate — MATERIAL needs one direction, NOT MATERIAL needs both', () => {
  it('a submitted material negative with no positive row is judged material', () => {
    const r = build([sub({ overall: overall(BELOW), determinations: [MATERIAL_NEG()] })])

    expect(r.omitted).toHaveLength(0)
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].kind).toBe('assessment_high')
    expect(r.entries[0].assessment.material).toBe(true)
    expect(r.entries[0].assessment.carried_by).toEqual(['negative'])
  })

  it('a submitted NON-material negative with no positive row is omitted, not judged not-material', () => {
    const r = build([sub({ overall: overall(ABOVE), determinations: [IMMATERIAL_NEG()] })])

    expect(r.entries).toHaveLength(0)
    expect(r.omitted).toHaveLength(1)
    expect(r.omitted[0].reason).toBe('direction_never_scored')
    // ⚠️ The stakeholder side WAS high. Without the asymmetry this would have been a
    // stakeholder_high entry resting on a positive impact nobody assessed.
    expect(r.entries.filter(e => e.kind === 'stakeholder_high')).toHaveLength(0)
  })

  it('the boundary: the same sub-topic and signal moves on materiality alone', () => {
    const one = (d: Determination) =>
      build([sub({ overall: overall(ABOVE), determinations: [d] })])

    const material = one(MATERIAL_NEG())
    const immaterial = one(IMMATERIAL_NEG())

    // Material: judged on one direction. The stakeholder side agrees, so no entry and no omission.
    expect(material.omitted).toHaveLength(0)
    expect(material.entries).toHaveLength(0)
    // Not material: cannot be concluded from one direction at all.
    expect(immaterial.omitted.map(o => o.reason)).toEqual(['direction_never_scored'])
  })

  it('both directions submitted and neither material can produce stakeholder_high', () => {
    const r = build([sub({
      overall: overall(ABOVE),
      determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()],
    })])

    expect(r.omitted).toHaveLength(0)
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].kind).toBe('stakeholder_high')
    expect(r.entries[0].assessment.material).toBe(false)
    expect(r.entries[0].assessment.carried_by).toEqual([])
  })

  it('both directions submitted and one material is judged material', () => {
    const r = build([sub({
      overall: overall(BELOW),
      determinations: [MATERIAL_NEG(), IMMATERIAL_POS()],
    })])

    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].kind).toBe('assessment_high')
    expect(r.entries[0].assessment.carried_by).toEqual(['negative'])
  })

  it('both directions material are BOTH named — ¶44 forbids netting them into one', () => {
    const r = build([sub({
      overall: overall(BELOW),
      determinations: [MATERIAL_NEG(), ON_THRESHOLD_POS()],
    })])

    expect(r.entries[0].assessment.carried_by).toEqual(['negative', 'positive'])
  })
})


describe('the top-box threshold is STRICTLY greater — an even split is not high', () => {
  const bothImmaterial = (numerator: number) =>
    build([sub({
      overall: overall(numerator),
      determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()],
    })])

  it('the fixture lands EXACTLY on the threshold, not near it', () => {
    // Without this the boundary case below would be untested: a share of 0.4999 would pass it too.
    expect(overall(EXACTLY_ON).top_box.share).toBe(THRESHOLD)
  })

  it('exactly ON the threshold is NOT high, so the two sides agree and nothing is reported', () => {
    const r = bothImmaterial(EXACTLY_ON)
    expect(r.entries).toHaveLength(0)
    expect(r.omitted).toHaveLength(0)
  })

  it('just above the threshold is high', () => {
    const r = bothImmaterial(ABOVE)
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].kind).toBe('stakeholder_high')
    expect(r.entries[0].stakeholder.share).toBeGreaterThan(THRESHOLD)
  })

  it('just below the threshold is not high', () => {
    expect(bothImmaterial(BELOW).entries).toHaveLength(0)
  })

  it('the boundary is real in the other direction too — ON the threshold against a material assessment', () => {
    const r = build([sub({
      overall: overall(EXACTLY_ON),
      determinations: [MATERIAL_NEG(), IMMATERIAL_POS()],
    })])
    // Not high + material = they differ, so this IS reported, as assessment_high.
    expect(r.entries).toHaveLength(1)
    expect(r.entries[0].kind).toBe('assessment_high')
  })

  it('the register echoes the snapshotted threshold it was given, not a constant of its own', () => {
    expect(build([], 0.6).threshold.top_box_high_min_share).toBe(0.6)
    expect(build([], THRESHOLD).threshold.top_box_high_min_share).toBe(THRESHOLD)
  })
})


describe('a severity of exactly 2.5 is material, so it cannot produce stakeholder_high', () => {
  it('the two-dimension positive case lands on MEAN_THRESHOLD and is carried', () => {
    const r = build([sub({
      overall: overall(BELOW),
      determinations: [IMMATERIAL_NEG(), ON_THRESHOLD_POS()],
    })])

    expect(r.entries).toHaveLength(1)
    const positive = r.entries[0].assessment.directions.find(d => d.direction === 'positive')
    expect(positive?.severity).toBe(MEAN_THRESHOLD)
    expect(positive?.material).toBe(true)
    expect(r.entries[0].assessment.carried_by).toEqual(['positive'])
  })

  it('with a high stakeholder signal the two sides AGREE, and no stakeholder_high is produced', () => {
    const r = build([sub({
      overall: overall(ABOVE),
      determinations: [IMMATERIAL_NEG(), ON_THRESHOLD_POS()],
    })])

    // ⚠️ If severity 2.5 were treated as below the line, this would wrongly report the customer
    // as having dismissed a topic their stakeholders flagged.
    expect(r.entries).toHaveLength(0)
    expect(r.omitted).toHaveLength(0)
  })
})


describe('every omission reason is reachable, and the partition holds', () => {
  const FIXTURE: RegisterSubTopic[] = [
    sub({ subtopic_code: 'X.1', status: 'excluded',
          exclusion_reason: 'No operations in scope for this sub-topic.' }),
    sub({ subtopic_code: 'X.2', overall: null,
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
    sub({ subtopic_code: 'X.3', overall: overall(0, 0),
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
    sub({ subtopic_code: 'X.4', determinations: [] }),
    sub({ subtopic_code: 'X.5', determinations: [IMMATERIAL_NEG()] }),
    sub({ subtopic_code: 'X.6',
          determinations: [negDet(3, 3, null), IMMATERIAL_POS()] }),
    // judged, and they differ — an entry
    sub({ subtopic_code: 'X.7', overall: overall(ABOVE),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
    // a company-defined IRO: no survey question can name one, so there is no stakeholder side
    sub({ subtopic_code: 'X.8', iro_key: 'valencia-water', overall: null,
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
  ]

  const r = build(FIXTURE)

  it('all six reasons occur', () => {
    const expected: OmissionReason[] = [
      'excluded_at_scope', 'no_substantive_answers', 'never_in_survey_scope',
      'no_submitted_determination', 'direction_never_scored', 'determination_incomplete',
    ]
    expect(new Set(r.omitted.map(o => o.reason))).toEqual(new Set(expected))
  })

  it('each reason lands on the sub-topic built for it', () => {
    const byCode = Object.fromEntries(r.omitted.map(o => [o.subtopic_code, o.reason]))
    expect(byCode['X.1']).toBe('excluded_at_scope')
    expect(byCode['X.2']).toBe('no_substantive_answers')
    expect(byCode['X.3']).toBe('no_substantive_answers')
    expect(byCode['X.4']).toBe('no_submitted_determination')
    expect(byCode['X.5']).toBe('direction_never_scored')
    expect(byCode['X.6']).toBe('determination_incomplete')
    expect(byCode['X.8']).toBe('never_in_survey_scope')
  })

  it('the exclusion reason is carried through verbatim, not restated', () => {
    const excluded = r.omitted.find(o => o.subtopic_code === 'X.1')
    expect(excluded?.detail).toBe('No operations in scope for this sub-topic.')
  })

  it('an incomplete determination names the dimension nobody scored', () => {
    expect(r.omitted.find(o => o.subtopic_code === 'X.6')?.detail).toMatch(/irremediability/)
  })

  it('NEVER BOTH: no sub-topic appears in entries and omitted', () => {
    const { entries, omitted } = codesIn(r)
    expect(entries.filter(c => omitted.includes(c))).toEqual([])
  })

  it('NEVER NEITHER: every sub-topic in this fixture is accounted for exactly once', () => {
    const { entries, omitted } = codesIn(r)
    const all = [...entries, ...omitted]
    expect(all).toHaveLength(FIXTURE.length)
    expect(new Set(all)).toEqual(new Set(FIXTURE.map(s => s.subtopic_code)))
  })

  it('the one judged sub-topic is the entry, and it is the only one', () => {
    expect(codesIn(r).entries).toEqual(['X.7'])
  })

  it('a judged sub-topic whose sides AGREE is deliberately in neither list', () => {
    const agreeing = build([sub({ subtopic_code: 'A.1', overall: overall(BELOW),
                                  determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])
    expect(agreeing.entries).toHaveLength(0)
    expect(agreeing.omitted).toHaveLength(0)
  })
})


describe('a draft is absent, not a low', () => {
  it('a sub-topic whose only determination is a DRAFT material one is not judged material', () => {
    const r = build([sub({
      overall: overall(ABOVE),
      determinations: [negDet(3, 3, 3, { status: 'draft' })],
    })])

    expect(r.entries).toHaveLength(0)
    expect(r.omitted).toHaveLength(1)
    expect(r.omitted[0].reason).toBe('no_submitted_determination')
  })

  it('a draft alongside a submitted determination does not count as the other direction', () => {
    const r = build([sub({
      overall: overall(ABOVE),
      determinations: [IMMATERIAL_NEG(), posDet(4, 4, { status: 'draft' })],
    })])

    // The draft positive would have been material. It is not read at all.
    expect(r.omitted.map(o => o.reason)).toEqual(['direction_never_scored'])
    expect(r.entries).toHaveLength(0)
  })

  it('any status other than submitted is absent — a draft is not the only such value', () => {
    for (const status of ['draft', 'in_review', 'withdrawn', '']) {
      const r = build([sub({ determinations: [negDet(3, 3, 3, { status }), IMMATERIAL_POS()] })])
      expect(r.omitted.map(o => o.reason)).toEqual(['direction_never_scored'])
    }
  })
})


describe('an unscored direction has no conclusion, and never reaches carried_by', () => {
  it('material on one direction while the other is incomplete: null, not false', () => {
    const r = build([sub({
      overall: overall(BELOW),
      determinations: [MATERIAL_NEG(), posDet(null, 3)],
    })])

    expect(r.entries).toHaveLength(1)
    const positive = r.entries[0].assessment.directions.find(d => d.direction === 'positive')
    expect(positive?.complete).toBe(false)
    expect(positive?.material).toBeNull()
    expect(positive?.severity).toBeNull()
    expect(positive?.unscored).toEqual(['scale'])

    // ⚠️ THE ASSERTION THIS DESCRIBE EXISTS FOR. A null must never be counted as a carrier, and
    // must never be counted as a "not material" either.
    expect(r.entries[0].assessment.carried_by).toEqual(['negative'])
    expect(r.entries[0].assessment.carried_by).not.toContain('positive')
  })

  it('the unscored direction is still visible to the reader, not dropped', () => {
    const r = build([sub({
      overall: overall(BELOW),
      determinations: [MATERIAL_NEG(), posDet(null, 3)],
    })])
    expect(r.entries[0].assessment.directions.map(d => d.direction))
      .toEqual(['negative', 'positive'])
  })
})


describe('two submitted determinations for one direction is an error, not a choice', () => {
  it('throws RegisterInputError rather than picking one', () => {
    expect(() => build([sub({ determinations: [MATERIAL_NEG(), IMMATERIAL_NEG()] })]))
      .toThrow(RegisterInputError)
  })

  it('the message names the sub-topic and the direction', () => {
    expect(() => build([sub({ subtopic_code: 'E2.4',
                              determinations: [MATERIAL_NEG(), IMMATERIAL_NEG()] })]))
      .toThrow(/E2\.4/)
  })

  it('one submitted beside one draft is not a duplicate', () => {
    expect(() => build([sub({
      determinations: [MATERIAL_NEG(), negDet(1, 1, 1, { status: 'draft' }), IMMATERIAL_POS()],
    })])).not.toThrow()
  })

  it('a duplicate positive throws just as a duplicate negative does', () => {
    expect(() => build([sub({ determinations: [IMMATERIAL_POS(), ON_THRESHOLD_POS()] })]))
      .toThrow(RegisterInputError)
  })
})


describe('S1.x and S2.x are never merged — different questions, different populations', () => {
  const s1 = sub({
    subtopic_code: 'S1.3', topic_code: 'S1', topic_label: 'Own workforce',
    short_name: 'Working conditions', category: 'soc',
    overall: overall(ABOVE),
    determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()],
  })
  const s2 = sub({
    subtopic_code: 'S2.3', topic_code: 'S2', topic_label: 'Value chain workers',
    short_name: 'Working conditions', category: 'soc',
    overall: overall(BELOW),
    determinations: [negDet(3, 1, 1), IMMATERIAL_POS()],   // soc takes max -> 3, material
  })

  it('each is judged on its own signal and its own determinations', () => {
    const r = build([s1, s2])
    expect(r.entries).toHaveLength(2)

    const one = r.entries.find(e => e.subtopic_code === 'S1.3')
    const two = r.entries.find(e => e.subtopic_code === 'S2.3')
    expect(one?.kind).toBe('stakeholder_high')
    expect(two?.kind).toBe('assessment_high')
  })

  it('judging them together gives the same result as judging each alone', () => {
    const together = build([s1, s2])
    const apart = [build([s1]).entries[0], build([s2]).entries[0]]
    expect(together.entries).toEqual(apart)
  })

  it('no entry pairs them — there is no shape that can hold both', () => {
    const r = build([s1, s2])
    for (const e of r.entries) {
      expect(Object.keys(e)).not.toContain('s1')
      expect(Object.keys(e)).not.toContain('s2')
      expect(Object.keys(e)).not.toContain('contrast')
      expect(JSON.stringify(e)).not.toContain(e.subtopic_code === 'S1.3' ? 'S2.3' : 'S1.3')
    }
  })

  it('the payload says so in words, because a consumer will otherwise merge them', () => {
    expect(WHAT_THIS_IS_NOT).toMatch(/S1/)
    expect(WHAT_THIS_IS_NOT).toMatch(/S2/)
    expect(WHAT_THIS_IS_NOT).toMatch(/different populations/i)
  })
})


describe('the payload mirrors survey_aggregate, and states two facts without a verdict', () => {
  const r = build([sub({ overall: overall(ABOVE),
                         determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])

  it('the customer-facing prose is the exported copy, not a second one', () => {
    expect(r.heading).toBe(HEADING)
    expect(r.what_this_is).toBe(WHAT_THIS_IS)
    expect(r.what_this_is_not).toBe(WHAT_THIS_IS_NOT)
    expect(r.triggers_active).toEqual(TRIGGERS_ACTIVE)
    expect(r.triggers_inactive).toEqual(TRIGGERS_INACTIVE)
  })

  it('respondent_group_breakdown is inactive from day one, with its reason in the payload', () => {
    const inactive = r.triggers_inactive.find(t => t.name === 'respondent_group_breakdown')
    expect(inactive).toBeDefined()
    expect(inactive?.reason).toMatch(/suppression/i)
    expect(inactive?.reason).toMatch(/S1\/S2|contrast/i)
  })

  it('the stakeholder fact prints the denominator beside the figure', () => {
    const s = r.entries[0].stakeholder
    expect(s.numerator).toBe(ABOVE)
    expect(s.denominator).toBe(DENOM)
    expect(s.statement).toContain(String(ABOVE))
    expect(s.statement).toContain(String(DENOM))
  })

  it("the assessment fact uses the standard's own words and no adjective", () => {
    expect(r.entries[0].assessment.statement).toMatch(/not material/)
    for (const word of ['concerning', 'significant gap', 'problem', 'risk', 'failure']) {
      expect(r.entries[0].assessment.statement.toLowerCase()).not.toContain(word)
    }
  })

  it('a material assessment names the direction that carried it', () => {
    const m = build([sub({ overall: overall(BELOW), determinations: [MATERIAL_NEG()] })])
    expect(m.entries[0].assessment.statement).toMatch(/material/)
    expect(m.entries[0].assessment.statement).toMatch(/negative/)
  })
})


describe('the snapshotted threshold must be a share', () => {
  it.each([-0.01, 1.01, NaN, Infinity])('%s throws RegisterInputError', v => {
    expect(() => build([], v)).toThrow(RegisterInputError)
  })

  it('0 and 1 are both admissible, matching the CHECK constraint', () => {
    expect(() => build([], 0)).not.toThrow()
    expect(() => build([], 1)).not.toThrow()
  })
})


/**
 * ⚠️ WHAT THESE PROTECT IS A SENTENCE, NOT A CODE PATH.
 *
 * Before 20260855 every row in this register was an ESRS sub-topic, and every sub-topic with no
 * usable stakeholder side got 'no_substantive_answers' — whose detail says NOBODY WHO WAS ASKED
 * GAVE A RATING. That is a claim about the customer's respondents. Said about a company-defined IRO
 * it is simply false: no survey question can name one, because materiality_survey_questions
 * references mr_esrs_subtopics and has no iro_key column. There is no timing, no round and no
 * configuration under which the old sentence becomes true of a custom IRO.
 *
 * X.8 in the fixture above covers the happy path. These cover the two ways this could go wrong
 * in the other direction — a real one, and the forward-compatible one.
 */
describe('an IRO nobody was asked about is reported as not asked, never as no divergence', () => {
  const IRO = (over: Partial<RegisterSubTopic> = {}) =>
    sub({ subtopic_code: 'E3.1', iro_key: 'valencia-water',
          short_name: 'Water scarcity at the Valencia plant',
          overall: null, determinations: [MATERIAL_NEG(), IMMATERIAL_POS()], ...over })

  it('a custom IRO with no stakeholder side is never_in_survey_scope', () => {
    const r = build([IRO()])
    expect(r.omitted.map(o => o.reason)).toEqual(['never_in_survey_scope'])
  })

  it('its detail claims nobody was asked, and does NOT claim anyone declined to answer', () => {
    const detail = build([IRO()]).omitted[0].detail ?? ''
    expect(detail).toBe(NEVER_IN_SURVEY_SCOPE_DETAIL)
    // The exact failure this member exists to prevent: the old sentence, on the new row.
    expect(detail).not.toMatch(/who was asked/i)
    expect(detail).not.toMatch(/abstention|skip/i)
  })

  /**
   * ⚠️ THE REGRESSION GUARD, AND THE MORE IMPORTANT OF THE TWO DIRECTIONS. An ordinary sub-topic
   * with no answers must keep its old reason. Saying "never put to anyone" about a topic real
   * people really answered would discount stakeholder input that exists — a worse error than the
   * one being fixed, and the reason iro_key defaults to '' rather than to unknown.
   */
  it('a sub-topic with no answers keeps no_substantive_answers — the default fails safe', () => {
    expect(build([sub({ subtopic_code: 'E3.1', overall: null })]).omitted[0].reason)
      .toBe('no_substantive_answers')
    // and the same when the field is present but empty, which is what the database stores
    expect(build([sub({ subtopic_code: 'E3.1', iro_key: '', overall: null })]).omitted[0].reason)
      .toBe('no_substantive_answers')
  })

  /**
   * ⚠️ FORWARD-COMPATIBLE BY CONSTRUCTION, NOT BY PROMISE. The custom-IRO test sits INSIDE the
   * no-stakeholder-side block, so an IRO that ever does acquire survey answers is compared like
   * anything else with no edit here. This test is what stops someone "simplifying" that by hoisting
   * the check in front of the block, which would start discarding real answers.
   */
  it('a custom IRO WITH answers is compared, not omitted', () => {
    const r = build([IRO({ overall: overall(ABOVE), determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])
    expect(r.omitted).toHaveLength(0)
    expect(r.entries.map(e => e.subtopic_code)).toEqual(['E3.1'])
  })

  it('omitted rows carry iro_key, so a sub-topic and its IROs are distinguishable', () => {
    const r = build([
      sub({ subtopic_code: 'E3.1', overall: null }),
      IRO(),
      IRO({ iro_key: 'seville-water', short_name: 'Water scarcity at Seville' }),
    ])
    // Three omissions, ONE subtopic_code. Keyed on the code alone they collapse to one row.
    expect(r.omitted).toHaveLength(3)
    expect(new Set(r.omitted.map(o => o.subtopic_code))).toEqual(new Set(['E3.1']))
    expect(r.omitted.map(o => o.iro_key).sort())
      .toEqual(['', 'seville-water', 'valencia-water'])
  })
})
