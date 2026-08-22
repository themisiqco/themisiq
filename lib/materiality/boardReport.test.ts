/**
 * The board paper — section 3's counting, and the properties a director cannot check.
 *
 * ⚠️ SECTION 3 IS THE PRIORITY BECAUSE ITS FAILURE MODE IS SILENT. Three figures are the page a
 * board remembers, and a wrong one raises nothing, looks like nothing, and is checkable only by
 * someone holding the underlying rows — which is precisely the reader this paper is written for
 * NOT to need. So each figure is tested against a fixture whose right answer is countable by hand,
 * and the three are then tested against each other.
 *
 * ⚠️ THE EXPORTED DEFINITION IS TESTED AGAINST THE IMPLEMENTED RULE. FINDINGS_DEFINITIONS.assessed
 * is printed beside the number. A definition that drifts from what is counted is worse than no
 * definition, because it tells the reader the figure means something it does not.
 *
 * ⚠️ THE THREE FIGURES ARE TESTED AGAINST EACH OTHER, NOT ONLY AGAINST FIXTURES. `material` and
 * `differing` may never exceed `assessed`. That held only incidentally once — `assessed` demanded
 * both directions while the other two were counted under register.ts's asymmetric gate, so a topic
 * material on one direction alone made section 3 print "0 topics assessed, 1 material". Those
 * invariants are now asserted on the fixture that used to break them.
 *
 * Everything is asserted through buildBoardReport's public output.
 */

import { describe, it, expect } from 'vitest'
import {
  buildBoardReport,
  FINDINGS_DEFINITIONS, KIND, LIMITATIONS, NOT_CLAIMED, NO_MEAN_NOTE, TITLE,
  standardVersionLabel,
  type BoardReport, type BoardReportInput, type ThresholdRow,
} from './boardReport'
import {
  buildRegister, SUBMITTED_STATUS,
  type Determination, type Overall, type RegisterSubTopic, type TopBox,
} from './register'

const THRESHOLD = 0.50
const DENOM = 12
const ABOVE = 7           // 7/12 ≈ 0.583 — respondents flagged it
const BELOW = 5           // 5/12 ≈ 0.417 — they did not

const topBox = (numerator: number, denominator: number): TopBox => ({
  share: denominator === 0 ? null : numerator / denominator,
  numerator,
  denominator,
})

const overall = (numerator: number, denominator = DENOM,
                 over: Partial<Overall> = {}): Overall => ({
  n_asked: denominator, n_answered: denominator, n_abstained: 0, n_skipped: 0,
  distribution: { '1': denominator - numerator, '2': 0, '3': numerator },
  top_box: topBox(numerator, denominator),
  median_low: null, median_high: null, modal_share: null, polarised: false,
  ...over,
})

// ⚠️ status defaults to the IMPORTED constant, not the literal 'submitted'. If anyone re-declares
// that filter privately inside boardReport.ts, these fixtures stop matching there while continuing
// to match in register.ts — which is exactly the page-to-page contradiction the sharing prevents.
const negDet = (s: number | null, sc: number | null, ir: number | null,
                over: Partial<Determination> = {}): Determination => ({
  direction: 'negative', nature: 'actual', status: SUBMITTED_STATUS,
  scale: s, scope: sc, irremediability: ir, ...over,
})

const posDet = (s: number | null, sc: number | null,
                over: Partial<Determination> = {}): Determination => ({
  direction: 'positive', nature: 'actual', status: SUBMITTED_STATUS,
  scale: s, scope: sc, irremediability: null, ...over,
})

// Materiality is severity.ts's answer, not this file's.
const MATERIAL_NEG = () => negDet(3, 3, 3)          // mean 3.0
const IMMATERIAL_NEG = () => negDet(1, 1, 1)        // mean 1.0
const IMMATERIAL_POS = () => posDet(1, 1)           // mean 1.0
const ON_THRESHOLD_POS = () => posDet(2, 3)         // mean 2.5 — material

const sub = (over: Partial<RegisterSubTopic> = {}): RegisterSubTopic => ({
  subtopic_code: 'E1.1', topic_code: 'E1', topic_label: 'Climate change',
  short_name: 'Climate transition', category: 'env',
  status: 'included', exclusion_reason: null,
  overall: overall(BELOW), determinations: [], ...over,
})

const THRESHOLD_ROW: ThresholdRow = {
  key: 'top_box_high_min_share',
  value: THRESHOLD,
  definition: 'The share of substantive responses choosing "3" above which a sub-topic is treated '
            + 'as high on the stakeholder side.',
  source: 'Judgement. A strict majority is the smallest threshold that can be stated in one '
        + 'defensible sentence.',
}

const report = (subtopics: RegisterSubTopic[],
                over: Partial<BoardReportInput> = {}): BoardReport =>
  buildBoardReport({
    company_name: 'Northwind Ltd',
    assessment_name: 'FY2026 impact materiality',
    standard_version: 'esrs_2026',
    reporting_period: '1 January – 31 December 2026',
    round_name: 'Round one',
    round_closed_at: '2026-08-16T00:00:00Z',
    participation: { invited: 40, opened: 30, answered: 24 },
    by_category: [
      { category: 'Employees', invited: 20, opened: 16, answered: 14 },
      { category: 'Suppliers', invited: 20, opened: 14, answered: 10 },
    ],
    subtopics,
    topBoxHighMinShare: THRESHOLD,
    thresholds: [THRESHOLD_ROW],
    ...over,
  })

/** Every key in the output tree, so a shape can be asserted rather than a single field. */
const allKeys = (v: unknown, acc: string[] = []): string[] => {
  if (Array.isArray(v)) { for (const x of v) allKeys(x, acc); return acc }
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { acc.push(k); allKeys(x, acc) }
  }
  return acc
}


describe('section 3 — topics assessed: what is actually counted', () => {
  // Countable by hand: THREE of these six were carried through to a judgement — A.1, A.3 and A.4.
  const FIXTURE: RegisterSubTopic[] = [
    sub({ subtopic_code: 'A.1',
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),                 // ✓ assessed
    sub({ subtopic_code: 'A.2', determinations: [IMMATERIAL_NEG()] }),             // one direction
    sub({ subtopic_code: 'A.3', overall: null,
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),                 // never asked
    sub({ subtopic_code: 'A.4', overall: overall(0, 0),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),                 // nobody rated it
    sub({ subtopic_code: 'A.5', status: 'excluded', exclusion_reason: 'Out of scope.',
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),                 // out of scope
    sub({ subtopic_code: 'A.6',
          determinations: [negDet(3, 3, null), IMMATERIAL_POS()] }),               // unfinished
  ]

  it('counts topics carried through to a judgement, not sub-topics in scope', () => {
    const r = report(FIXTURE)
    // ⚠️ THE READINGS DIFFER. "Sub-topics in scope" would be 5 (all but A.5); "sub-topics with any
    // determination" would be 6. The module counts neither: it counts the three we concluded on.
    // A.3 and A.4 qualify despite no survey coverage — nobody was asked about A.3 and nobody rated
    // A.4, and our own assessment still reached a conclusion on both, complete in both directions.
    // Whether we asked is section 4's fact, not this one's.
    expect(r.findings.topics_assessed).toBe(3)
  })

  it('the printed definition describes the rule that was applied', () => {
    // ⚠️ THE NUMBER AND THE SENTENCE BESIDE IT MUST MEAN THE SAME THING. This pair is the whole
    // reason the two cannot drift apart in silence: change one and this fails.
    expect(FINDINGS_DEFINITIONS.assessed).toMatch(/in scope/i)
    expect(FINDINGS_DEFINITIONS.assessed).toMatch(/both directions/i)
  })

  it('the definition reports survey coverage as a separate fact, not as a condition', () => {
    expect(FINDINGS_DEFINITIONS.assessed).toMatch(/separate fact/i)
    expect(FINDINGS_DEFINITIONS.assessed).toMatch(/section 4/i)

    // ⚠️ THE ASSERTION THAT STOPS THE OLD RULE CREEPING BACK INTO THE SENTENCE. The negative is
    // scoped to the clause that lists the CONDITIONS — the trailing sentence is allowed to mention
    // the survey, because saying where that fact lives is the point of it. A definition that once
    // again named coverage as a condition while the count did not apply one is exactly the drift
    // this file exists to catch.
    const conditions = FINDINGS_DEFINITIONS.assessed.split(/(?<=\.)\s+/)
      .find(x => /in scope/i.test(x)) ?? ''
    expect(conditions).not.toBe('')
    expect(conditions).not.toMatch(/survey/i)
  })

  it('a topic nobody rated IS assessed when the determinations are complete', () => {
    // Assessed means we reached a judgement. A preparer may know of an exposure nobody was asked
    // about — the reverse-direction case section 7's register exists to surface.
    expect(report([FIXTURE[3]]).findings.topics_assessed).toBe(1)
  })

  it('and so is a topic nobody was surveyed on at all', () => {
    expect(report([FIXTURE[2]]).findings.topics_assessed).toBe(1)
  })

  it('an excluded topic is never assessed', () => {
    expect(report([FIXTURE[4]]).findings.topics_assessed).toBe(0)
  })
})


describe('section 3 — topics material: ONCE per sub-topic, never once per direction', () => {
  it('a sub-topic material on BOTH directions is one material topic, not two', () => {
    const r = report([sub({ determinations: [MATERIAL_NEG(), ON_THRESHOLD_POS()] })])

    // ⚠️ THE ERROR THIS TEST EXISTS FOR. Counting determinations rather than sub-topics doubles
    // every topic that is material both ways, and ¶44 forbids treating them as one finding anyway.
    expect(r.findings.topics_material).toBe(1)
    expect(r.findings.material_topics).toHaveLength(1)
    expect(r.findings.material_topics[0].carried_by).toEqual(['negative', 'positive'])
  })

  it('material on one direction is also one topic', () => {
    const r = report([sub({ determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] })])
    expect(r.findings.topics_material).toBe(1)
    expect(r.findings.material_topics[0].carried_by).toEqual(['negative'])
  })

  it('the named topics are the counted topics', () => {
    const r = report([
      sub({ subtopic_code: 'M.1', determinations: [MATERIAL_NEG(), ON_THRESHOLD_POS()] }),
      sub({ subtopic_code: 'M.2', determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
      sub({ subtopic_code: 'M.3', determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
    ])
    expect(r.findings.topics_material).toBe(r.findings.material_topics.length)
    expect(r.findings.material_topics.map(t => t.subtopic_code)).toEqual(['M.1', 'M.3'])
  })

  it('no sub-topic is named twice', () => {
    const r = report([sub({ determinations: [MATERIAL_NEG(), ON_THRESHOLD_POS()] })])
    const codes = r.findings.material_topics.map(t => t.subtopic_code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})


describe('section 3 — topics differing does not drift from the register', () => {
  const FIXTURE: RegisterSubTopic[] = [
    sub({ subtopic_code: 'D.1', overall: overall(BELOW),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),          // agree
    sub({ subtopic_code: 'D.2', overall: overall(BELOW),
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),            // assessment_high
    sub({ subtopic_code: 'D.3', overall: overall(ABOVE),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),          // stakeholder_high
  ]

  it('equals the register entry count, computed independently', () => {
    const r = report(FIXTURE)
    const direct = buildRegister({ subtopics: FIXTURE, topBoxHighMinShare: THRESHOLD })
    expect(r.findings.topics_differing).toBe(direct.entries.length)
    expect(r.findings.topics_differing).toBe(2)
  })

  it('and section 7 carries the same entries the figure counted', () => {
    const r = report(FIXTURE)
    expect(r.differences.register.entries).toHaveLength(r.findings.topics_differing)
    expect(r.differences.register.entries.map(e => e.subtopic_code)).toEqual(['D.2', 'D.3'])
  })
})


describe('section 3 — the three figures against each other', () => {
  const FULLY_JUDGED: RegisterSubTopic[] = [
    sub({ subtopic_code: 'C.1', overall: overall(BELOW),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
    sub({ subtopic_code: 'C.2', overall: overall(BELOW),
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
    sub({ subtopic_code: 'C.3', overall: overall(ABOVE),
          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
  ]

  it('the hand count is 3 assessed, 1 material, 2 differing', () => {
    const r = report(FULLY_JUDGED)
    expect(r.findings.topics_assessed).toBe(3)
    expect(r.findings.topics_material).toBe(1)
    expect(r.findings.topics_differing).toBe(2)
  })

  it('material never exceeds assessed', () => {
    const r = report(FULLY_JUDGED)
    expect(r.findings.topics_material).toBeLessThanOrEqual(r.findings.topics_assessed)
  })

  it('differing never exceeds assessed', () => {
    const r = report(FULLY_JUDGED)
    expect(r.findings.topics_differing).toBeLessThanOrEqual(r.findings.topics_assessed)
  })

  it('all three are non-negative integers', () => {
    const r = report(FULLY_JUDGED)
    for (const n of [r.findings.topics_assessed, r.findings.topics_material,
                     r.findings.topics_differing]) {
      expect(Number.isInteger(n)).toBe(true)
      expect(n).toBeGreaterThanOrEqual(0)
    }
  })

  /**
   * ⚠️ THE CASE THE INVARIANTS USED TO BREAK ON. One sub-topic, material on its negative alone,
   * with no positive row. `assessed` once demanded both directions while `material` and `differing`
   * were counted under register.ts's asymmetric gate, so this fixture produced "0 topics assessed,
   * 1 material" — three figures on the page a board remembers, contradicting each other, with
   * nothing raised and the only reader positioned to notice being the one holding the rows.
   *
   * Materiality is a floor: one material direction IS a judgement, so all three now count it.
   */
  const ONE_DIRECTION_ONLY: RegisterSubTopic[] = [
    sub({ subtopic_code: 'X.1', overall: overall(BELOW),
          determinations: [MATERIAL_NEG()] }),
  ]

  it('a topic material on one direction alone counts in all three figures', () => {
    const r = report(ONE_DIRECTION_ONLY)
    expect(r.findings.topics_assessed).toBe(1)
    expect(r.findings.topics_material).toBe(1)
    expect(r.findings.topics_differing).toBe(1)
  })

  it('material never exceeds assessed, including there', () => {
    const r = report(ONE_DIRECTION_ONLY)
    expect(r.findings.topics_material).toBeLessThanOrEqual(r.findings.topics_assessed)
  })

  it('differing never exceeds assessed, including there', () => {
    const r = report(ONE_DIRECTION_ONLY)
    expect(r.findings.topics_differing).toBeLessThanOrEqual(r.findings.topics_assessed)
  })
})


describe('sections 6 and 7 agree about the same sub-topic', () => {
  const DIVERGENT = [
    sub({ subtopic_code: 'S.1', short_name: 'Water use', overall: overall(BELOW),
          determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] }),
  ]

  it('one topic, one conclusion, in both sections', () => {
    const r = report(DIVERGENT)

    const six = r.assessmentView.rows.find(x => x.subtopic_code === 'S.1')
    const seven = r.differences.register.entries.find(e => e.subtopic_code === 'S.1')

    expect(six).toBeDefined()
    expect(seven).toBeDefined()
    expect(six?.material).toBe(true)
    expect(seven?.assessment.material).toBe(true)
    // ⚠️ THE SAME DIRECTION CARRIED IT IN BOTH. Two filters would let these disagree.
    expect(six?.carried_by).toEqual(seven?.assessment.carried_by)
    expect(six?.name).toBe('Water use')
  })

  it('a status that is not the shared constant is absent from BOTH sections', () => {
    const other = [sub({ subtopic_code: 'S.2', overall: overall(ABOVE),
                         determinations: [negDet(3, 3, 3, { status: 'in_review' }),
                                          posDet(4, 4, { status: 'in_review' })] })]
    const r = report(other)
    expect(r.assessmentView.rows).toHaveLength(0)
    expect(r.differences.register.entries).toHaveLength(0)
    expect(r.findings.topics_material).toBe(0)
  })

  it('the shared constant is the one both sections filter on', () => {
    expect(SUBMITTED_STATUS).toBe('submitted')
  })
})


describe('a draft is absent from every section, and is not a low score', () => {
  const DRAFTS = [
    sub({ subtopic_code: 'R.1', overall: overall(ABOVE),
          determinations: [negDet(3, 3, 3, { status: 'draft' }),
                           posDet(3, 3, { status: 'draft' })] }),
  ]

  it('a draft material determination makes no material topic', () => {
    const r = report(DRAFTS)
    expect(r.findings.topics_material).toBe(0)
    expect(r.findings.material_topics).toEqual([])
    expect(r.assessmentView.rows).toHaveLength(0)
  })

  it('and is not counted as assessed either', () => {
    expect(report(DRAFTS).findings.topics_assessed).toBe(0)
  })

  it('the register treats it as absent, not as not-material', () => {
    const r = report(DRAFTS)
    // ⚠️ NOT an entry. "Nothing submitted" is not the same claim as "assessed and found immaterial".
    expect(r.differences.register.entries).toHaveLength(0)
    expect(r.differences.register.omitted.map(o => o.reason))
      .toEqual(['no_submitted_determination'])
  })
})


describe('abstentions render as abstentions, never as low scores', () => {
  const ABSTAINED = [
    sub({ subtopic_code: 'B.1', overall: overall(BELOW),
          determinations: [MATERIAL_NEG(), posDet(null, 3)] }),
  ]

  it('an unscored dimension is named, with no severity and no verdict', () => {
    const r = report(ABSTAINED)
    const row = r.assessmentView.rows[0]
    const positive = row.directions.find(d => d.direction === 'positive')

    expect(positive?.abstained).toEqual(['scale'])
    expect(positive?.complete).toBe(false)
    // ⚠️ null, NOT false and NOT zero. §6.1: absence is never a low.
    expect(positive?.material).toBeNull()
    expect(positive?.severity).toBeNull()
    expect(positive?.values).toBeNull()
    expect(positive?.drivers).toEqual([])
  })

  it('the abstained direction never carries materiality', () => {
    const r = report(ABSTAINED)
    expect(r.assessmentView.rows[0].carried_by).toEqual(['negative'])
  })

  it('a complete direction names which dimensions drove it', () => {
    const r = report(ABSTAINED)
    const negative = r.assessmentView.rows[0].directions.find(d => d.direction === 'negative')
    expect(negative?.complete).toBe(true)
    expect(negative?.severity).toBe(3)
    expect(negative?.drivers).toEqual(['scale', 'scope', 'irremediability'])
  })

  it('the section says so in words', () => {
    expect(report(ABSTAINED).assessmentView.abstention_note).toMatch(/never counted as a low score/i)
  })
})


describe('no section exposes a field an average could be rendered from', () => {
  const R = report([sub({ overall: overall(ABOVE),
                          determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])

  it('a stakeholder row carries the distribution and the top box, and nothing else numeric', () => {
    const row = R.stakeholderView.rows[0]
    expect(Object.keys(row).sort()).toEqual(
      ['counts', 'distribution', 'name', 'split_note', 'subtopic_code', 'top_box', 'topic_label'])
  })

  it('the distribution is three counted bands, not a position', () => {
    expect(Object.keys(R.stakeholderView.rows[0].distribution).sort()).toEqual(['1', '2', '3'])
  })

  it('the top box carries its denominator', () => {
    expect(Object.keys(R.stakeholderView.rows[0].top_box).sort())
      .toEqual(['denominator', 'numerator', 'share'])
  })

  it('no key anywhere in the paper suggests an average', () => {
    // ⚠️ KEYS, not prose: NO_MEAN_NOTE legitimately contains the word "average".
    const offenders = allKeys(R).filter(k => /^(mean|average|avg)$|_(mean|average|avg)$/i.test(k))
    expect(offenders).toEqual([])
  })

  it('and the paper explains why there is none', () => {
    expect(R.stakeholderView.no_mean_note).toBe(NO_MEAN_NOTE)
    expect(NO_MEAN_NOTE).toMatch(/no average is shown, and none was calculated/i)
  })
})


describe('section 9 — limitations', () => {
  const R = report([sub({ determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])

  it('is present and is the exported copy', () => {
    expect(R.limitations.items).toBe(LIMITATIONS)
    expect(R.limitations.items.length).toBeGreaterThan(0)
  })

  it('states that the financial axis is not covered', () => {
    const financial = R.limitations.items.filter(x => /financial/i.test(x))
    expect(financial.length).toBeGreaterThan(0)
    expect(financial.join(' ')).toMatch(/double materiality/i)
  })

  it('states that rounds are not combined', () => {
    expect(R.limitations.items.join(' ')).toMatch(/not combined|one survey round/i)
  })

  it('states that an absence is not a low score', () => {
    expect(R.limitations.items.join(' ')).toMatch(/not a low score/i)
  })

  it('names what the paper does not claim', () => {
    expect(R.limitations.not_claimed).toBe(NOT_CLAIMED)
    const all = NOT_CLAIMED.join(' ')
    expect(all).toMatch(/does not quantify financial effect/i)
    expect(all).toMatch(/not a risk register/i)
    expect(all).toMatch(/does not rank topics/i)
  })
})


describe('an information paper asks the board to approve nothing', () => {
  const R = report([sub({ determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] })])

  it('no field in the output invites a decision', () => {
    const offenders = allKeys(R).filter(
      k => /approv|recommend|decision|ratif|endorse|sign_?off|options?$/i.test(k))
    expect(offenders).toEqual([])
  })

  it('the cover says so outright', () => {
    expect(R.cover.kind).toBe(KIND)
    expect(R.cover.kind).toMatch(/approve nothing/i)
    expect(R.cover.title).toBe(TITLE)
  })
})


describe('the cover and the methodology carry what was given, not what was inferred', () => {
  it('the version renders as its label, never as the stored code', () => {
    const R = report([sub()])
    expect(R.cover.standard_version_label).toBe(standardVersionLabel('esrs_2026'))
    expect(R.cover.standard_version_label).not.toMatch(/esrs_2026/)
    expect(R.cover.standard_version_stated).toBe(true)
  })

  it('an unstated version is shown as unstated, never filled in', () => {
    const R = report([sub()], { standard_version: null })
    expect(R.cover.standard_version_label).toBeNull()
    expect(R.cover.standard_version_stated).toBe(false)
  })

  it('an unknown version code yields no label rather than a guess', () => {
    const R = report([sub()], { standard_version: 'esrs_2099' })
    expect(R.cover.standard_version_label).toBeNull()
    expect(R.cover.standard_version_stated).toBe(false)
  })

  it('thresholds are carried through word for word', () => {
    const R = report([sub()])
    expect(R.methodology.thresholds).toEqual([THRESHOLD_ROW])
    expect(R.methodology.thresholds[0].definition).toBe(THRESHOLD_ROW.definition)
    expect(R.methodology.thresholds[0].source).toBe(THRESHOLD_ROW.source)
  })

  it('the named provisions include the ones a reader will look up', () => {
    const refs = report([sub()]).methodology.provisions.map(p => p.reference)
    expect(refs.join(' ')).toMatch(/ESRS 1 ¶40/)
    expect(refs.join(' ')).toMatch(/ESRS 1 ¶41/)
    expect(refs.join(' ')).toMatch(/ESRS 1 ¶44/)
    expect(refs.join(' ')).toMatch(/ESRS 2 IRO-1/)
    expect(refs.join(' ')).toMatch(/Article 2\(2\)/)
  })
})

// ================================================================================================
// THE DISCLOSURE ROADMAP — BUILT, AND NOT RENDERED
//
// ⚠️ THESE TEST A SECTION generateBoardReportPDF DOES NOT CALL, ON PURPOSE. Nothing freezes the
// requirement rows for this report, so the section is complete and unwired until a freeze point
// exists — see the block above section 6b in boardReportPdf.ts. Testing it now is what makes
// turning it on a two-line change rather than a rewrite.
// ================================================================================================
describe('roadmap — grouping and the ¶30 rollup', () => {
  const REQS = [
    { dr_code: 'E1-1', topic_code: 'E1', title: 'Transition plan', datapoints: 'Plan, targets' },
    { dr_code: 'E1-2', topic_code: 'E1', title: 'Policies', datapoints: null },
    { dr_code: 'S1-1', topic_code: 'S1', title: 'Workforce policies', datapoints: null },
  ]

  it('material_topics carries topic_code READ FROM THE ROW, never parsed from subtopic_code', () => {
    // The guard. "E1.2".split(".")[0] would give the same answer here and a wrong one the moment a
    // sub-topic code stops mirroring its topic — which is exactly why register.ts stores both.
    const r = report([sub({ subtopic_code: 'E1.2', topic_code: 'ZZ',
                            determinations: [MATERIAL_NEG()] })])
    expect(r.findings.material_topics[0].topic_code).toBe('ZZ')
    expect(r.findings.material_topics[0].subtopic_code).toBe('E1.2')
  })

  it('two material sub-topics of one topic produce ONE roadmap entry, naming both', () => {
    // ESRS 1 ¶30: which sub-topics carried the topic decides how far the disclosure may be scoped.
    // E1's requirements appear once; the two names appear under them.
    const r = report([
      sub({ subtopic_code: 'E1.2', short_name: 'Adaptation', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'E1.3', short_name: 'Energy', determinations: [MATERIAL_NEG()] }),
    ], { disclosure_requirements: REQS })
    expect(r.roadmap.topics).toHaveLength(1)
    expect(r.roadmap.topics[0].topic_code).toBe('E1')
    expect(r.roadmap.topics[0].driven_by.map(d => d.name)).toEqual(['Adaptation', 'Energy'])
    expect(r.roadmap.topics[0].requirements.map(q => q.dr_code)).toEqual(['E1-1', 'E1-2'])
  })

  it('topics appear in first-appearance order, and requirements keep the caller’s order', () => {
    const r = report([
      sub({ subtopic_code: 'S1.1', topic_code: 'S1', topic_label: 'Own workforce',
            category: 'soc', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'E1.2', determinations: [MATERIAL_NEG()] }),
    ], { disclosure_requirements: REQS })
    expect(r.roadmap.topics.map(t => t.topic_code)).toEqual(['S1', 'E1'])
  })

  it('a material topic with NO stored requirements still appears', () => {
    // Dropping it would silently shorten the roadmap and read as "nothing attaches to this topic".
    const r = report([sub({ subtopic_code: 'E1.2', determinations: [MATERIAL_NEG()] })],
                     { disclosure_requirements: [] })
    expect(r.roadmap.topics).toHaveLength(1)
    expect(r.roadmap.topics[0].requirements).toEqual([])
  })

  it('a null datapoints reaches the payload AS NULL — the builder chooses no words', () => {
    // The renderer decides what an absent summary says. A builder that substituted prose here would
    // put the same sentence in two places, free to drift.
    const r = report([sub({ subtopic_code: 'E1.2', determinations: [MATERIAL_NEG()] })],
                     { disclosure_requirements: REQS })
    expect(r.roadmap.topics[0].requirements[1].datapoints).toBeNull()
  })

  it('no material topics → empty topics, and the none_note survives', () => {
    const r = report([sub({ determinations: [IMMATERIAL_NEG()] })], { disclosure_requirements: REQS })
    expect(r.roadmap.topics).toEqual([])
    expect(r.roadmap.none_note.length).toBeGreaterThan(0)
  })

  it('what_this_is_not names the OTHER roadmap, so the two claims cannot be conflated', () => {
    const r = report([sub({ determinations: [MATERIAL_NEG()] })])
    expect(r.roadmap.what_this_is_not).toContain('Climate Risk')
    expect(r.roadmap.what_this_is_not).toContain('screening')
  })

  it('resolved_note passes through, and defaults to null when the caller says nothing', () => {
    // Kept though no caller sets it: it becomes correct the moment one resolves at read.
    expect(report([sub()]).roadmap.resolved_note).toBeNull()
    expect(report([sub()], { requirements_resolved_note: 'read at generation' })
      .roadmap.resolved_note).toBe('read at generation')
  })
})
