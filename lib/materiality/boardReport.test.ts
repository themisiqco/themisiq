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
  FINDINGS_DEFINITIONS, KIND, LIMITATIONS, NEVER_ASKED_NOTE, NOT_CLAIMED, NO_MEAN_NOTE, TITLE,
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
    // ⚠️ UPDATED 22 Aug 2026, AND THE INTENT IS UNCHANGED. Section 9 now renders every sub-topic in
    // SCOPE rather than only the material ones, so this row APPEARS — as it must, since it is in
    // scope. What must still be absent is any CONCLUSION drawn from a non-submitted determination,
    // and that is what is asserted: both directions undetermined, nothing material, no register
    // entry. Asserting length 0 encoded the old feed, not the rule.
    expect(r.assessmentView.rows).toHaveLength(1)
    expect(r.assessmentView.rows[0].material).toBe(false)
    expect(r.assessmentView.rows[0].directions.every(d => d.determined === false)).toBe(true)
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
    // Same update, same reasoning as the in_review case above: in scope, so it is shown — and shown
    // as undetermined, which is the honest rendering of a draft. A draft is not a low score and it
    // is not a conclusion; it is work not yet submitted, and section 9 now says so rather than
    // omitting the topic entirely.
    expect(r.assessmentView.rows).toHaveLength(1)
    expect(r.assessmentView.rows[0].material).toBe(false)
    expect(r.assessmentView.rows[0].directions.every(d => d.determined === false)).toBe(true)
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
    // topic_code added 22 Aug 2026 for the S1/S2 worksheet framing. It is a STRING identifier, so
    // this test's actual claim — that no field here could be rendered as an average — is untouched;
    // the key list is pinned so a numeric field cannot arrive unnoticed.
    expect(Object.keys(row).sort()).toEqual(
      ['counts', 'distribution', 'name', 'split_note', 'subtopic_code', 'top_box', 'topic_code',
       'topic_label'])
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

// ================================================================================================
// THE THREE DEFECTS FOUND BY READING A GENERATED PDF, 21 Aug 2026
//
// All three were invisible to every test that existed, because every one of them asserted the
// payload was self-consistent and none asserted it was COMPLETE. A count and a list that disagree
// are each individually correct.
// ================================================================================================
describe('section 9 renders everything section 3 counts', () => {
  it('D1 a topic complete in BOTH directions and material in NEITHER still appears', () => {
    // ⚠️ THE REGRESSION. assessmentView rendered materialTopics while findings counted `assessed` —
    // in scope AND (material or fully judged). On the fixture the gap was Air pollution: page 3
    // said three topics assessed, section 9 showed two, and the missing one was the subject of the
    // register's only entry.
    const r = report([
      sub({ subtopic_code: 'E1.1', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'E2.1', short_name: 'Air pollution',
            determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
    ])
    const codes = r.assessmentView.rows.map(x => x.subtopic_code)
    expect(codes).toContain('E2.1')
    expect(r.assessmentView.rows.find(x => x.subtopic_code === 'E2.1')!.material).toBe(false)
  })

  it('D2 the section can never show fewer topics than section 3 counts assessed', () => {
    // The invariant that broke. assessmentView is now all of scope, which is a superset of
    // `assessed` by construction — so this holds whatever the fixture.
    const r = report([
      sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'A.2', determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }),
      sub({ subtopic_code: 'A.3', determinations: [] }),
    ])
    expect(r.assessmentView.rows.length).toBeGreaterThanOrEqual(r.findings.topics_assessed)
  })

  it('D3 every sub-topic IN SCOPE appears, determined or not', () => {
    const r = report([
      sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'A.2', determinations: [] }),
      sub({ subtopic_code: 'A.3', determinations: [] }),
    ])
    expect(r.assessmentView.rows.map(x => x.subtopic_code)).toEqual(['A.1', 'A.2', 'A.3'])
  })

  it('D4 an EXCLUDED sub-topic does not appear — in scope is the bar, not merely present', () => {
    const r = report([
      sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] }),
      sub({ subtopic_code: 'A.2', status: 'excluded', exclusion_reason: 'Out of scope.',
            determinations: [] }),
    ])
    expect(r.assessmentView.rows.map(x => x.subtopic_code)).toEqual(['A.1'])
  })
})

describe('judge() emits a row for a direction nobody determined', () => {
  it('D5 no determinations at all yields TWO rows, both determined:false', () => {
    // Until 22 Aug 2026 judge() did `if (!det) continue`, so this sub-topic produced ZERO direction
    // rows — and the renderer drew a bold name with nothing under it, which in a section headed
    // "What our own assessment concluded" reads as a conclusion nobody reached.
    const r = report([sub({ subtopic_code: 'A.1', determinations: [] })])
    const row = r.assessmentView.rows[0]
    expect(row.directions).toHaveLength(2)
    expect(row.directions.every(d => d.determined === false)).toBe(true)
    expect(row.directions.map(d => d.direction).sort()).toEqual(['negative', 'positive'])
  })

  it('D6 one direction submitted yields one determined and one not', () => {
    const r = report([sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] })])
    const ds = r.assessmentView.rows[0].directions
    expect(ds.find(d => d.direction === 'negative')!.determined).toBe(true)
    expect(ds.find(d => d.direction === 'positive')!.determined).toBe(false)
  })

  it('D7 nature is null EXACTLY when determined is false — never within a determination', () => {
    // materiality_impact_determinations_submitted_is_complete guarantees a submitted row states its
    // nature, so a null here is the absence of a determination and never an unanswered question.
    const r = report([sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] })])
    for (const d of r.assessmentView.rows[0].directions) {
      expect(d.nature === null).toBe(d.determined === false)
    }
  })

  it('D8 the new rows change NO arithmetic — material, carried_by and fully_judged are untouched', () => {
    // The guard on the fix. fully_judged requires submittedCount === 2 BEFORE every(complete), so an
    // undetermined row cannot make a topic look finished; carried_by filters material === true, so
    // it cannot pick one up.
    const r = report([
      sub({ subtopic_code: 'A.1', determinations: [MATERIAL_NEG()] }),                    // one only
      sub({ subtopic_code: 'A.2', determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] }), // both
    ])
    expect(r.findings.topics_material).toBe(1)
    expect(r.findings.material_topics[0].carried_by).toEqual(['negative'])
    expect(r.assessmentView.rows[0].carried_by).not.toContain('positive')
  })
})

describe('sub-topic codes reach the surfaces that print them', () => {
  it('D9 StakeholderRow carries topic_code READ FROM THE ROW, never parsed from subtopic_code', () => {
    // The S1/S2 framing needs it, and topic_label cannot disambiguate: S1 and S2 share a merged
    // label by design, which is why "Health and safety" appears twice with nothing telling them
    // apart. Parsing "S1.3" on the dot would give the same answer here and a wrong one the moment a
    // sub-topic code stops mirroring its topic — the reason register.ts stores both.
    const r = report([sub({ subtopic_code: 'S1.3', topic_code: 'ZZ', overall: overall(BELOW) })])
    expect(r.stakeholderView.rows[0].topic_code).toBe('ZZ')
    expect(r.stakeholderView.rows[0].subtopic_code).toBe('S1.3')
  })
})


/**
 * ⚠️ THE PAPER MUST NOT EXPLAIN AN ABSENCE IT DID NOT HAVE, AND MUST EXPLAIN THE ONE IT DID.
 *
 * boardReport.ts:963-974 already settles the hard half — survey coverage is NOT a condition of
 * being assessed, and "a topic with no survey answers still appears in the register's `omitted`,
 * SAID AS WHAT IT IS". These bind the second half of that sentence: what it is said AS.
 *
 * The note is derived from the register rather than from the input, so these also pin that the
 * note and the rows it explains cannot disagree.
 */
describe('the note about topics nobody was asked about', () => {
  const IRO = sub({ subtopic_code: 'E3.1', iro_key: 'valencia-water',
                    short_name: 'Water scarcity at the Valencia plant',
                    overall: null, determinations: [MATERIAL_NEG(), IMMATERIAL_POS()] })

  it('appears when a company-defined IRO could not be compared', () => {
    const r = report([IRO])
    expect(r.differences.register.omitted.map(o => o.reason)).toEqual(['never_in_survey_scope'])
    expect(r.differences.never_asked_note).toBe(NEVER_ASKED_NOTE)
  })

  /**
   * ⚠️ THE ONE THAT MATTERS MOST. An ordinary assessment must not carry a paragraph about IROs
   * nobody was asked about — a note explaining an absence that did not occur is the same class of
   * defect as a message naming a cause that never happened.
   */
  it('is null on an assessment with no custom IROs at all', () => {
    const r = report([sub({ subtopic_code: 'E1.1', overall: overall(ABOVE),
                            determinations: [IMMATERIAL_NEG(), IMMATERIAL_POS()] })])
    expect(r.differences.never_asked_note).toBeNull()
  })

  it('is null when topics were omitted for OTHER reasons — it is not a generic omission note', () => {
    const r = report([
      sub({ subtopic_code: 'E1.1', overall: null }),                       // no_substantive_answers
      sub({ subtopic_code: 'E1.2', determinations: [] }),                  // no_submitted_determination
    ])
    expect(r.differences.register.omitted).toHaveLength(2)
    expect(r.differences.register.omitted.map(o => o.reason))
      .not.toContain('never_in_survey_scope')
    expect(r.differences.never_asked_note).toBeNull()
  })

  it('says the question was never asked, and does not say a comparison came back empty', () => {
    expect(NEVER_ASKED_NOTE).toMatch(/never (put to anyone|asked)/i)
    expect(NEVER_ASKED_NOTE).not.toMatch(/no difference (was )?found\b(?! to be absent)/i)
  })

  /**
   * ⚠️ SURVEY COVERAGE IS NOT A CONDITION OF BEING ASSESSED — boardReport.ts:963-974. A custom IRO
   * determined material still counts as assessed and still counts as material, whether or not
   * anybody was surveyed on it. If this ever fails, the roll-up has been quietly made conditional
   * on stakeholder input, which would let an unasked IRO drop out of the paper entirely.
   */
  it('a material custom IRO is still counted assessed and material', () => {
    const r = report([IRO])
    expect(r.findings.topics_assessed).toBe(1)
    expect(r.findings.topics_material).toBe(1)
  })
})
